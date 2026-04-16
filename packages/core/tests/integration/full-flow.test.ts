import { describe, it, expect, beforeEach } from 'vitest'
import { SQLiteAdapter } from '../../src/storage/sqlite'
import { MyBadEngine } from '../../src/engine'
import { InvalidTransitionError } from '../../src/engine/lifecycle'
import { VALID_TRANSITIONS, RULE_VALID_TRANSITIONS } from '../../src/models/state-machine'
import type { MistakeStatus, RuleStatus } from '../../src/models'

describe('MyBad Integration', () => {
  let engine: MyBadEngine
  let adapter: SQLiteAdapter

  beforeEach(() => {
    adapter = new SQLiteAdapter(':memory:')
    engine = new MyBadEngine(adapter)
  })

  describe('Full Flow', () => {
    it('Test 1: capture returns Mistake with id, status=pending, recurrence_count=1', async () => {
      const m = await engine.addMistake({
        category: 'intent_weather',
        status: 'pending',
        trigger_type: 'L1',
        context_before: JSON.stringify([{ role: 'user', content: '今天天气' }]),
        ai_misunderstanding: 'intent_query_balance',
        user_intent: 'intent_weather',
        user_correction: '不对，我说的是天气',
        tags: ['weather', 'intent'],
        confidence: 0.9,
      })
      expect(m.id).toBeTruthy()
      expect(m.status).toBe('pending')
      expect(m.recurrence_count).toBe(1)
      expect(m.created_at).toBeTruthy()
    })

    it('Test 2: capture same category → recurrence_count=2, auto same_category link', async () => {
      const m1 = await engine.addMistake({
        category: 'intent_weather', status: 'pending', trigger_type: 'L1',
        context_before: '[]', tags: [], confidence: 1.0,
      })
      const m2 = await engine.addMistake({
        category: 'intent_weather', status: 'pending', trigger_type: 'L1',
        context_before: '[]', tags: [], confidence: 1.0,
      })
      expect(m2.recurrence_count).toBe(2)
      // 验证自动关联
      const links = await engine.getLinks(m2.id, 'outbound')
      expect(links.some(l => l.link_type === 'same_category')).toBe(true)
    })

    it('Test 3: query by category returns 2 records', async () => {
      await engine.addMistake({ category: 'cat_a', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
      await engine.addMistake({ category: 'cat_a', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
      const results = await engine.queryMistakes({ category: 'cat_a' })
      expect(results).toHaveLength(2)
    })

    it('Test 4: update status to corrected', async () => {
      const m = await engine.addMistake({ category: 'test', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
      await engine.updateMistake(m.id, { status: 'corrected' })
      const got = await engine.getMistake(m.id)
      expect(got!.status).toBe('corrected')
    })

    it('Test 5: link two mistakes (causal)', async () => {
      const m1 = await engine.addMistake({ category: 'a', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
      const m2 = await engine.addMistake({ category: 'b', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
      await engine.addLink(m1.id, m2.id, 'causal', 0.85)
      const links = await engine.getLinks(m1.id, 'outbound')
      expect(links).toHaveLength(1)
      expect(links[0].link_type).toBe('causal')
    })

    it('Test 6: getRelated depth=2 returns multi-degree', async () => {
      const m1 = await engine.addMistake({ category: 'a', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
      const m2 = await engine.addMistake({ category: 'a', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
      const m3 = await engine.addMistake({ category: 'a', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
      await engine.addLink(m1.id, m2.id, 'causal')
      await engine.addLink(m2.id, m3.id, 'causal')
      const related = await engine.getRelated(m1.id, 2)
      expect(related.length).toBeGreaterThanOrEqual(2)
    })

    it('Test 7: addRule + source_ids', async () => {
      const r = await engine.addRule({
        category: 'intent_weather',
        rule_text: 'When user mentions 天气, they mean weather not balance',
        priority: 'high',
        status: 'active',
        source_ids: ['m_001', 'm_002'],
      })
      expect(r.source_count).toBe(2)
      const rules = await engine.getRules({ category: 'intent_weather' })
      expect(rules).toHaveLength(1)
    })

    it('Test 8: rule verify pass × 3 → verified_count=3', async () => {
      const r = await engine.addRule({ category: 't', rule_text: 'test', priority: 'normal', status: 'active', source_ids: [] })
      await engine.addVerification({ rule_id: r.id, result: 'pass', verified_at: '2026-04-16T01:00:00Z' })
      await engine.addVerification({ rule_id: r.id, result: 'pass', verified_at: '2026-04-16T02:00:00Z' })
      await engine.addVerification({ rule_id: r.id, result: 'pass', verified_at: '2026-04-16T03:00:00Z' })
      const rules = await engine.getRules()
      expect(rules[0].verified_count).toBe(3)
    })

    it('Test 9: checkGraduation → eligible=true', async () => {
      // 两条同 category mistake → recurrence >= 2
      const m1 = await engine.addMistake({ category: 'grad_test', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
      const m2 = await engine.addMistake({ category: 'grad_test', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
      // 添加规则
      await engine.addRule({ category: 'grad_test', rule_text: 'test rule', priority: 'normal', status: 'active', source_ids: [m1.id, m2.id] })
      const result = await engine.checkGraduation(m2.id)
      expect(result.eligible).toBe(true)
    })

    it('Test 10: transition to graduated', async () => {
      const m = await engine.addMistake({ category: 'g', status: 'verified', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
      const updated = await engine.transition(m.id, 'graduated')
      expect(updated.status).toBe('graduated')
    })

    it('Test 11: compact graduated records', async () => {
      const m = await engine.addMistake({ category: 'c', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
      await engine.transition(m.id, 'corrected')
      await engine.transition(m.id, 'verified')
      await engine.transition(m.id, 'graduated')
      const count = await engine.compact()
      expect(count).toBe(1)
    })

    it('Test 12: search → FTS5 returns matches', async () => {
      await engine.addMistake({
        category: 'weather_query', status: 'pending', trigger_type: 'L1',
        context_before: '[]', ai_misunderstanding: 'balance query',
        user_intent: 'weather forecast', user_correction: 'not balance',
        tags: ['weather'], confidence: 1.0,
      })
      const results = await engine.searchMistakes('weather')
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('Test 13: getCategoryStats returns correct stats', async () => {
      await engine.addMistake({ category: 'stat_a', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
      await engine.addMistake({ category: 'stat_a', status: 'corrected', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
      const stats = await engine.getCategoryStats()
      const statA = stats.find(s => s.category === 'stat_a')
      expect(statA!.count).toBe(2)
    })

    it('Test 14: getOverallStats returns global overview', async () => {
      await engine.addMistake({ category: 'a', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
      const stats = await engine.getOverallStats()
      expect(stats.total).toBeGreaterThanOrEqual(1)
    })

    it('Test 15: getReflectionData returns structured data', async () => {
      await engine.addMistake({ category: 'hot', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
      const data = await engine.getReflectionData()
      expect(data.pending_mistakes).toBeGreaterThanOrEqual(1)
      expect(data.date_range).toBeTruthy()
    })
  })

  describe('State Machine Complete Coverage', () => {
    // 派生全部合法流转
    const validCases: [MistakeStatus, MistakeStatus][] = []
    for (const [from, targets] of Object.entries(VALID_TRANSITIONS)) {
      for (const to of targets) {
        validCases.push([from as MistakeStatus, to])
      }
    }

    // 派生非法流转: 所有不在 VALID_TRANSITIONS[from] 中的组合
    const allStatuses: MistakeStatus[] = ['pending', 'corrected', 'recurring', 'verified', 'graduated', 'abandoned', 'false_positive']
    const invalidCases: [MistakeStatus, MistakeStatus][] = []
    for (const from of allStatuses) {
      for (const to of allStatuses) {
        if (from === to) continue // 不测试自转
        if (!VALID_TRANSITIONS[from].includes(to)) {
          invalidCases.push([from, to])
        }
      }
    }

    it.each(validCases)('transition %s → %s succeeds', async (from, to) => {
      const m = await engine.addMistake({ category: 'sm', status: from, trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
      const updated = await engine.transition(m.id, to)
      expect(updated.status).toBe(to)
    })

    it.each(invalidCases)('transition %s → %s throws InvalidTransitionError', async (from, to) => {
      const m = await engine.addMistake({ category: 'sm', status: from, trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
      await expect(engine.transition(m.id, to)).rejects.toThrow(InvalidTransitionError)
    })
  })

  describe('Rule Lifecycle', () => {
    it('active → verified → superseded flow', async () => {
      const r = await engine.addRule({ category: 'rl', rule_text: 'rule1', priority: 'normal', status: 'active', source_ids: [] })
      await engine.transitionRule(r.id, 'verified')
      const v = (await engine.getRules()).find(x => x.id === r.id)
      expect(v!.status).toBe('verified')

      await engine.transitionRule(r.id, 'superseded')
      const s = (await engine.getRules()).find(x => x.id === r.id)
      expect(s!.status).toBe('superseded')
    })

    it('active → archived direct', async () => {
      const r = await engine.addRule({ category: 'rl', rule_text: 'rule2', priority: 'normal', status: 'active', source_ids: [] })
      await engine.transitionRule(r.id, 'archived')
      const rules = await engine.getRules()
      expect(rules.find(x => x.id === r.id)!.status).toBe('archived')
    })

    it('verified → superseded replacement', async () => {
      const r = await engine.addRule({ category: 'rl', rule_text: 'rule3', priority: 'normal', status: 'active', source_ids: [] })
      await engine.transitionRule(r.id, 'verified')
      await engine.transitionRule(r.id, 'superseded')
      const final = (await engine.getRules()).find(x => x.id === r.id)
      expect(final!.status).toBe('superseded')
    })
  })
})
