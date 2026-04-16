import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryAdapter } from '../../src/storage/memory'
import { LinkerEngine } from '../../src/engine/linker'

describe('LinkerEngine', () => {
  let linker: LinkerEngine
  let storage: MemoryAdapter

  beforeEach(() => {
    storage = new MemoryAdapter()
    linker = new LinkerEngine(storage)
  })

  it('addLink creates link with default confidence 1.0', async () => {
    await linker.addLink('m1', 'm2', 'causal')
    const links = await storage.getLinks('m1', 'outbound')
    expect(links).toHaveLength(1)
    expect(links[0].confidence).toBe(1.0)
  })

  it('getLinks outbound returns forward links', async () => {
    await linker.addLink('m1', 'm2', 'causal')
    const links = await linker.getLinks('m1', 'outbound')
    expect(links).toHaveLength(1)
    expect(links[0].to_id).toBe('m2')
  })

  it('getLinks inbound returns reverse links', async () => {
    await linker.addLink('m1', 'm2', 'causal')
    const links = await linker.getLinks('m2', 'inbound')
    expect(links).toHaveLength(1)
    expect(links[0].from_id).toBe('m1')
  })

  it('getLinks both returns bidirectional', async () => {
    await linker.addLink('m1', 'm2', 'causal')
    await linker.addLink('m3', 'm1', 'same_root')
    const links = await linker.getLinks('m1', 'both')
    expect(links).toHaveLength(2)
  })

  it('getRelated depth=1 returns one degree', async () => {
    // 添加 mistakes 到 storage
    await storage.addMistake({ id: 'm1', category: 'a', status: 'pending', trigger_type: 'L1', recurrence_count: 1, context_before: '[]', tags: [], confidence: 1, created_at: '', updated_at: '' })
    await storage.addMistake({ id: 'm2', category: 'a', status: 'pending', trigger_type: 'L1', recurrence_count: 1, context_before: '[]', tags: [], confidence: 1, created_at: '', updated_at: '' })
    await linker.addLink('m1', 'm2', 'causal')
    const related = await linker.getRelated('m1', 1)
    expect(related).toHaveLength(1)
  })

  it('getRelated depth=2 returns multi-degree', async () => {
    await storage.addMistake({ id: 'm1', category: 'a', status: 'pending', trigger_type: 'L1', recurrence_count: 1, context_before: '[]', tags: [], confidence: 1, created_at: '', updated_at: '' })
    await storage.addMistake({ id: 'm2', category: 'a', status: 'pending', trigger_type: 'L1', recurrence_count: 1, context_before: '[]', tags: [], confidence: 1, created_at: '', updated_at: '' })
    await storage.addMistake({ id: 'm3', category: 'a', status: 'pending', trigger_type: 'L1', recurrence_count: 1, context_before: '[]', tags: [], confidence: 1, created_at: '', updated_at: '' })
    await linker.addLink('m1', 'm2', 'causal')
    await linker.addLink('m2', 'm3', 'causal')
    const related = await linker.getRelated('m1', 2)
    expect(related).toHaveLength(2)
  })

  it('addLink is idempotent', async () => {
    await linker.addLink('m1', 'm2', 'causal')
    await linker.addLink('m1', 'm2', 'causal')
    const links = await storage.getLinks('m1', 'outbound')
    expect(links).toHaveLength(1) // 不重复
  })
})
