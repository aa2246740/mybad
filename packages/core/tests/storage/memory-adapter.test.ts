import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryAdapter } from '../../src/storage/memory'
import type { Mistake } from '../../src/models/mistake'
import type { Rule } from '../../src/models/rule'
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

describe('MemoryAdapter', () => {
  let adapter: MemoryAdapter

  beforeEach(() => {
    adapter = new MemoryAdapter()
  })

  it('addMistake + getMistake round-trip', async () => {
    const m = makeMistake()
    await adapter.addMistake(m)
    const got = await adapter.getMistake(m.id)
    expect(got).toBeTruthy()
    expect(got!.id).toBe(m.id)
  })

  it('queryMistakes filters by category/status/agent_id', async () => {
    await adapter.addMistake(makeMistake({ category: 'cat_a', agent_id: 'bot1' }))
    await adapter.addMistake(makeMistake({ category: 'cat_b', agent_id: 'bot2' }))

    expect((await adapter.queryMistakes({ category: 'cat_a' }))).toHaveLength(1)
    expect((await adapter.queryMistakes({ agent_id: 'bot2' }))).toHaveLength(1)
  })

  it('updateMistake updates fields', async () => {
    const m = makeMistake()
    await adapter.addMistake(m)
    await adapter.updateMistake(m.id, { status: 'corrected' })
    const got = await adapter.getMistake(m.id)
    expect(got!.status).toBe('corrected')
  })

  it('incrementRecurrence returns correct count', async () => {
    await adapter.addMistake(makeMistake({ category: 'cat_x' }))
    const count = await adapter.incrementRecurrence('cat_x')
    expect(count).toBe(2)
  })

  it('addLink + getLinks outbound/inbound', async () => {
    const m1 = makeMistake()
    const m2 = makeMistake()
    await adapter.addMistake(m1)
    await adapter.addMistake(m2)
    await adapter.addLink(m1.id, m2.id, 'causal')

    expect((await adapter.getLinks(m1.id, 'outbound'))).toHaveLength(1)
    expect((await adapter.getLinks(m2.id, 'inbound'))).toHaveLength(1)
  })

  it('getRelated BFS multi-degree', async () => {
    const m1 = makeMistake()
    const m2 = makeMistake()
    const m3 = makeMistake()
    await adapter.addMistake(m1)
    await adapter.addMistake(m2)
    await adapter.addMistake(m3)
    await adapter.addLink(m1.id, m2.id, 'causal')
    await adapter.addLink(m2.id, m3.id, 'causal')

    const related = await adapter.getRelated(m1.id, 2)
    expect(related).toHaveLength(2)
  })

  it('addRule + getRules + updateRule', async () => {
    const r: Rule = {
      id: 'r_001', category: 'test', rule_text: 'test rule',
      priority: 'normal', source_count: 1, source_ids: [],
      verified_count: 0, fail_count: 0, status: 'active',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    await adapter.addRule(r)
    expect((await adapter.getRules())).toHaveLength(1)
    await adapter.updateRule('r_001', { verified_count: 5 })
    const rules = await adapter.getRules()
    expect(rules[0].verified_count).toBe(5)
  })

  it('addVerification + getVerificationCount', async () => {
    await adapter.addVerification({ rule_id: 'r_001', result: 'pass', verified_at: new Date().toISOString() })
    await adapter.addVerification({ rule_id: 'r_001', result: 'fail', verified_at: new Date().toISOString() })
    const counts = await adapter.getVerificationCount('r_001')
    expect(counts.pass).toBe(1)
    expect(counts.fail).toBe(1)
  })

  it('addReflection + getReflections', async () => {
    const ref: Reflection = {
      id: 'ref_001', date: '2026-04-16', summary: 'test',
      new_rule_ids: [], hot_categories: [], stats: {},
      created_at: new Date().toISOString(),
    }
    await adapter.addReflection(ref)
    expect((await adapter.getReflections())).toHaveLength(1)
  })

  it('searchMistakes simple text match', async () => {
    await adapter.addMistake(makeMistake({ category: 'weather_query' }))
    await adapter.addMistake(makeMistake({ category: 'music_play' }))
    const results = await adapter.searchMistakes('weather')
    expect(results).toHaveLength(1)
  })

  it('archiveMistakes + compactGraduated', async () => {
    const m1 = makeMistake()
    const m2 = makeMistake({ status: 'graduated' })
    await adapter.addMistake(m1)
    await adapter.addMistake(m2)

    await adapter.archiveMistakes([m1.id])
    const got = await adapter.getMistake(m1.id)
    expect(got!.archived_at).toBeTruthy()

    const count = await adapter.compactGraduated()
    expect(count).toBe(1)
  })

  it('getConfig + setConfig', async () => {
    await adapter.setConfig('key', 'value')
    expect(await adapter.getConfig('key')).toBe('value')
  })

  it('getCategoryStats returns aggregated data', async () => {
    await adapter.addMistake(makeMistake({ category: 'cat_a', status: 'pending' }))
    await adapter.addMistake(makeMistake({ category: 'cat_a', status: 'corrected' }))
    const stats = await adapter.getCategoryStats()
    expect(stats).toHaveLength(1)
    expect(stats[0].count).toBe(2)
  })

  it('getOverallStats returns global overview', async () => {
    await adapter.addMistake(makeMistake())
    await adapter.addMistake(makeMistake({ status: 'corrected' }))
    const stats = await adapter.getOverallStats()
    expect(stats.total).toBe(2)
  })
})
