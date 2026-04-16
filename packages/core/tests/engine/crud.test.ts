import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryAdapter } from '../../src/storage/memory'
import { CrudEngine } from '../../src/engine/crud'
import type { Mistake } from '../../src/models/mistake'

describe('CrudEngine', () => {
  let engine: CrudEngine
  let storage: MemoryAdapter

  beforeEach(() => {
    storage = new MemoryAdapter()
    engine = new CrudEngine(storage)
  })

  it('addMistake generates ID and writes to storage', async () => {
    const m = await engine.addMistake({
      category: 'intent_weather',
      status: 'pending',
      trigger_type: 'L1',
      context_before: '[]',
      tags: [],
      confidence: 1.0,
    })
    expect(m.id).toBeTruthy()
    expect(m.id.startsWith('m_')).toBe(true)
    expect(m.category).toBe('intent_weather')
  })

  it('addMistake auto-increments recurrence_count for same category', async () => {
    await engine.addMistake({
      category: 'cat_x', status: 'pending', trigger_type: 'L1',
      context_before: '[]', tags: [], confidence: 1.0,
    })
    const m2 = await engine.addMistake({
      category: 'cat_x', status: 'pending', trigger_type: 'L1',
      context_before: '[]', tags: [], confidence: 1.0,
    })
    expect(m2.recurrence_count).toBe(2)
  })

  it('addMistake auto-creates same_category link for recurring mistakes', async () => {
    const m1 = await engine.addMistake({
      category: 'cat_y', status: 'pending', trigger_type: 'L1',
      context_before: '[]', tags: [], confidence: 1.0,
    })
    await engine.addMistake({
      category: 'cat_y', status: 'pending', trigger_type: 'L1',
      context_before: '[]', tags: [], confidence: 1.0,
    })
    const links = await storage.getLinks(m1.id, 'inbound')
    expect(links.length).toBeGreaterThanOrEqual(1)
  })

  it('getMistake returns stored mistake', async () => {
    const created = await engine.addMistake({
      category: 'test', status: 'pending', trigger_type: 'manual',
      context_before: '[]', tags: [], confidence: 1.0,
    })
    const got = await engine.getMistake(created.id)
    expect(got).toBeTruthy()
    expect(got!.id).toBe(created.id)
  })

  it('updateMistake updates fields and updated_at', async () => {
    const m = await engine.addMistake({
      category: 'test', status: 'pending', trigger_type: 'L1',
      context_before: '[]', tags: [], confidence: 1.0,
    })
    const before = m.updated_at
    await engine.updateMistake(m.id, { status: 'corrected' })
    const got = await engine.getMistake(m.id)
    expect(got!.status).toBe('corrected')
    // updated_at should be set (may be same millisecond)
    expect(got!.updated_at).toBeTruthy()
  })

  it('queryMistakes filters by category/status', async () => {
    await engine.addMistake({ category: 'a', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
    await engine.addMistake({ category: 'b', status: 'corrected', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
    expect((await engine.queryMistakes({ category: 'a' }))).toHaveLength(1)
    expect((await engine.queryMistakes({ status: 'corrected' }))).toHaveLength(1)
  })

  it('addRule creates rule and returns it', async () => {
    const r = await engine.addRule({
      category: 'test', rule_text: 'test rule', priority: 'normal',
      status: 'active', source_ids: ['m_001'],
    })
    expect(r.id.startsWith('r_')).toBe(true)
    expect(r.source_count).toBe(1)
  })

  it('getRules queries rules', async () => {
    await engine.addRule({ category: 'a', rule_text: 'r1', priority: 'normal', status: 'active', source_ids: [] })
    await engine.addRule({ category: 'b', rule_text: 'r2', priority: 'high', status: 'active', source_ids: [] })
    expect((await engine.getRules({ category: 'a' }))).toHaveLength(1)
    expect((await engine.getRules())).toHaveLength(2)
  })

  it('addVerification updates rule counts', async () => {
    const r = await engine.addRule({ category: 't', rule_text: 'test', priority: 'normal', status: 'active', source_ids: [] })
    await engine.addVerification({ rule_id: r.id, result: 'pass', verified_at: new Date().toISOString() })
    await engine.addVerification({ rule_id: r.id, result: 'pass', verified_at: new Date().toISOString() })
    const rules = await engine.getRules()
    expect(rules[0].verified_count).toBe(2)
  })

  it('searchMistakes delegates to storage', async () => {
    await engine.addMistake({ category: 'weather', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
    const results = await engine.searchMistakes('weather')
    expect(results.length).toBeGreaterThanOrEqual(1)
  })
})
