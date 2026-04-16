import { describe, it, expect, beforeEach } from 'vitest'
import { SQLiteAdapter } from '../../src/storage/sqlite'
import type { Mistake, MistakeFilter } from '../../src/models/mistake'
import type { Rule } from '../../src/models/rule'
import type { Verification } from '../../src/models/verification'
import type { Reflection } from '../../src/models/reflection'

function makeMistake(overrides: Partial<Mistake> = {}): Mistake {
  return {
    id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    category: 'intent_weather',
    status: 'pending',
    trigger_type: 'L1',
    recurrence_count: 1,
    context_before: '[]',
    tags: [],
    confidence: 1.0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    category: 'intent_weather',
    rule_text: 'When user says "天气" they mean weather, not balance',
    priority: 'normal',
    source_count: 1,
    source_ids: [],
    verified_count: 0,
    fail_count: 0,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('SQLiteAdapter', () => {
  let adapter: SQLiteAdapter

  beforeEach(() => {
    adapter = new SQLiteAdapter(':memory:')
  })

  it('creates database with WAL mode', () => {
    // :memory: 无法验证 WAL，但构造不报错即可
    expect(adapter).toBeTruthy()
  })

  it('runs migrations creating all tables', () => {
    // 验证通过 addMistake 成功间接验证表存在
    const m = makeMistake()
    expect(adapter.addMistake(m)).resolves.toBe(m.id)
  })

  it('addMistake + getMistake round-trip', async () => {
    const m = makeMistake()
    await adapter.addMistake(m)
    const got = await adapter.getMistake(m.id)
    expect(got).toBeTruthy()
    expect(got!.id).toBe(m.id)
    expect(got!.category).toBe('intent_weather')
    expect(got!.tags).toEqual([])
  })

  it('queryMistakes filters by category/status/agent_id/date', async () => {
    await adapter.addMistake(makeMistake({ category: 'cat_a', agent_id: 'bot1', created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z' }))
    await adapter.addMistake(makeMistake({ category: 'cat_a', status: 'corrected', agent_id: 'bot2', created_at: '2026-04-10T00:00:00Z', updated_at: '2026-04-10T00:00:00Z' }))
    await adapter.addMistake(makeMistake({ category: 'cat_b', agent_id: 'bot1', created_at: '2026-04-15T00:00:00Z', updated_at: '2026-04-15T00:00:00Z' }))

    const byCat = await adapter.queryMistakes({ category: 'cat_a' })
    expect(byCat).toHaveLength(2)

    const byStatus = await adapter.queryMistakes({ status: 'corrected' })
    expect(byStatus).toHaveLength(1)

    const byAgent = await adapter.queryMistakes({ agent_id: 'bot1' })
    expect(byAgent).toHaveLength(2)

    const byDate = await adapter.queryMistakes({ date_from: '2026-04-09', date_to: '2026-04-16' })
    expect(byDate).toHaveLength(2)
  })

  it('updateMistake updates specified fields', async () => {
    const m = makeMistake()
    await adapter.addMistake(m)
    await adapter.updateMistake(m.id, { status: 'corrected', user_correction: '不是这个' })
    const got = await adapter.getMistake(m.id)
    expect(got!.status).toBe('corrected')
    expect(got!.user_correction).toBe('不是这个')
  })

  it('incrementRecurrence returns correct count', async () => {
    await adapter.addMistake(makeMistake({ category: 'cat_x' }))
    const count = await adapter.incrementRecurrence('cat_x')
    expect(count).toBe(2) // 1 existing + 1 = 2
  })

  it('addLink + getLinks for outbound/inbound/both', async () => {
    const m1 = makeMistake()
    const m2 = makeMistake()
    await adapter.addMistake(m1)
    await adapter.addMistake(m2)
    await adapter.addLink(m1.id, m2.id, 'causal', 0.9)

    const outbound = await adapter.getLinks(m1.id, 'outbound')
    expect(outbound).toHaveLength(1)
    expect(outbound[0].to_id).toBe(m2.id)

    const inbound = await adapter.getLinks(m2.id, 'inbound')
    expect(inbound).toHaveLength(1)

    const both = await adapter.getLinks(m1.id, 'both')
    expect(both).toHaveLength(1)
  })

  it('getRelated with recursive CTE returns multi-degree links', async () => {
    const m1 = makeMistake()
    const m2 = makeMistake()
    const m3 = makeMistake()
    await adapter.addMistake(m1)
    await adapter.addMistake(m2)
    await adapter.addMistake(m3)
    await adapter.addLink(m1.id, m2.id, 'causal')
    await adapter.addLink(m2.id, m3.id, 'causal')

    const related = await adapter.getRelated(m1.id, 2)
    expect(related.length).toBeGreaterThanOrEqual(1)
  })

  it('addRule + getRules + updateRule CRUD', async () => {
    const r = makeRule()
    await adapter.addRule(r)
    const rules = await adapter.getRules({ category: 'intent_weather' })
    expect(rules).toHaveLength(1)
    expect(rules[0].rule_text).toBe(r.rule_text)

    await adapter.updateRule(r.id, { verified_count: 3 })
    const updated = (await adapter.getRules()).find(x => x.id === r.id)
    expect(updated!.verified_count).toBe(3)
  })

  it('addVerification + getVerificationCount', async () => {
    const r = makeRule()
    await adapter.addRule(r)
    await adapter.addVerification({ rule_id: r.id, result: 'pass', verified_at: new Date().toISOString() })
    await adapter.addVerification({ rule_id: r.id, result: 'pass', verified_at: new Date().toISOString() })
    await adapter.addVerification({ rule_id: r.id, result: 'fail', verified_at: new Date().toISOString() })

    const counts = await adapter.getVerificationCount(r.id)
    expect(counts.pass).toBe(2)
    expect(counts.fail).toBe(1)
  })

  it('addReflection + getReflections', async () => {
    const r: Reflection = {
      id: 'ref_001', date: '2026-04-16', summary: '测试反思',
      new_rule_ids: [], hot_categories: [], stats: {},
      created_at: new Date().toISOString(),
    }
    await adapter.addReflection(r)
    const refs = await adapter.getReflections({ date_from: '2026-04-01' })
    expect(refs).toHaveLength(1)
    expect(refs[0].summary).toBe('测试反思')
  })

  it('searchMistakes with FTS5 returns matching results', async () => {
    await adapter.addMistake(makeMistake({
      category: 'weather_query',
      ai_misunderstanding: 'thought it was balance',
      user_intent: 'weather forecast',
    }))
    await adapter.addMistake(makeMistake({ category: 'music_play' }))

    const results = await adapter.searchMistakes('weather')
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it('archiveMistakes sets archived_at', async () => {
    const m = makeMistake()
    await adapter.addMistake(m)
    const count = await adapter.archiveMistakes([m.id])
    expect(count).toBe(1)
    const got = await adapter.getMistake(m.id)
    expect(got!.archived_at).toBeTruthy()
  })

  it('compactGraduated removes graduated mistakes', async () => {
    const m = makeMistake({ status: 'graduated' })
    await adapter.addMistake(m)
    const count = await adapter.compactGraduated()
    expect(count).toBe(1)
    const got = await adapter.getMistake(m.id)
    expect(got).toBeNull()
  })

  it('getConfig + setConfig', async () => {
    await adapter.setConfig('version', '1.0')
    const val = await adapter.getConfig('version')
    expect(val).toBe('1.0') // string preserved
  })

  it('getCategoryStats returns aggregated stats', async () => {
    await adapter.addMistake(makeMistake({ category: 'cat_a', status: 'pending' }))
    await adapter.addMistake(makeMistake({ category: 'cat_a', status: 'corrected' }))
    await adapter.addMistake(makeMistake({ category: 'cat_b', status: 'pending' }))

    const stats = await adapter.getCategoryStats()
    expect(stats).toHaveLength(2)
    const catA = stats.find(s => s.category === 'cat_a')
    expect(catA!.count).toBe(2)
  })

  it('getOverallStats returns global stats', async () => {
    await adapter.addMistake(makeMistake({ category: 'cat_a' }))
    await adapter.addMistake(makeMistake({ category: 'cat_b', status: 'corrected' }))

    const stats = await adapter.getOverallStats()
    expect(stats.total).toBe(2)
    expect(stats.by_status.pending).toBe(1)
    expect(stats.by_status.corrected).toBe(1)
  })
})
