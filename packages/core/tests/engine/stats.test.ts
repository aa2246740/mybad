import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryAdapter } from '../../src/storage/memory'
import { StatsEngine } from '../../src/engine/stats'
import { CrudEngine } from '../../src/engine/crud'

describe('StatsEngine', () => {
  let stats: StatsEngine
  let crud: CrudEngine
  let storage: MemoryAdapter

  beforeEach(() => {
    storage = new MemoryAdapter()
    stats = new StatsEngine(storage)
    crud = new CrudEngine(storage)
  })

  it('getCategoryStats returns aggregated stats', async () => {
    await crud.addMistake({ category: 'cat_a', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
    await crud.addMistake({ category: 'cat_a', status: 'corrected', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
    await crud.addMistake({ category: 'cat_b', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })

    const catStats = await stats.getCategoryStats()
    expect(catStats).toHaveLength(2)
    const catA = catStats.find(s => s.category === 'cat_a')
    expect(catA!.count).toBe(2)
  })

  it('getOverallStats returns global overview', async () => {
    await crud.addMistake({ category: 'a', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
    await crud.addMistake({ category: 'b', status: 'corrected', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })

    const overall = await stats.getOverallStats()
    expect(overall.total).toBe(2)
    expect(overall.by_status.pending).toBe(1)
    expect(overall.by_status.corrected).toBe(1)
  })

  it('getCategoryStats filters by agent_id', async () => {
    await crud.addMistake({ category: 'a', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0, agent_id: 'bot1' })
    await crud.addMistake({ category: 'a', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0, agent_id: 'bot2' })

    const stats1 = await stats.getCategoryStats('bot1')
    expect(stats1).toHaveLength(1)
    expect(stats1[0].count).toBe(1)
  })

  it('getOverallStats filters by date range', async () => {
    await storage.addMistake({ id: 'm_old', category: 'a', status: 'pending', trigger_type: 'L1', recurrence_count: 1, context_before: '[]', tags: [], confidence: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' })
    await crud.addMistake({ category: 'a', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })

    const recent = await stats.getOverallStats(undefined, { from: '2026-04-01', to: '2026-12-31' })
    expect(recent.total).toBe(1)
  })

  it('getReflectionData returns structured reflection input', async () => {
    await crud.addMistake({ category: 'hot_cat', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
    await crud.addMistake({ category: 'hot_cat', status: 'recurring', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })

    const data = await stats.getReflectionData()
    expect(data.pending_mistakes).toBe(1)
    expect(data.recurring_mistakes).toBe(1)
    expect(data.hot_categories.length).toBeGreaterThanOrEqual(1)
    expect(data.date_range).toBeTruthy()
  })
})
