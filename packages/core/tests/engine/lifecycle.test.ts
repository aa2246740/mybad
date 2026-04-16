import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryAdapter } from '../../src/storage/memory'
import { LifecycleEngine, InvalidTransitionError } from '../../src/engine/lifecycle'
import { CrudEngine } from '../../src/engine/crud'
import type { Mistake } from '../../src/models/mistake'

describe('LifecycleEngine', () => {
  let lifecycle: LifecycleEngine
  let crud: CrudEngine
  let storage: MemoryAdapter

  beforeEach(() => {
    storage = new MemoryAdapter()
    lifecycle = new LifecycleEngine(storage)
    crud = new CrudEngine(storage)
  })

  async function addMistake(status: Mistake['status'] = 'pending'): Promise<Mistake> {
    const m = await crud.addMistake({
      category: 'test', status, trigger_type: 'L1',
      context_before: '[]', tags: [], confidence: 1.0,
    })
    return m
  }

  // 合法流转
  it('transition pending → corrected succeeds', async () => {
    const m = await addMistake('pending')
    const updated = await lifecycle.transition(m.id, 'corrected')
    expect(updated.status).toBe('corrected')
  })

  it('transition pending → abandoned succeeds', async () => {
    const m = await addMistake('pending')
    const updated = await lifecycle.transition(m.id, 'abandoned')
    expect(updated.status).toBe('abandoned')
    expect(updated.archived_at).toBeTruthy()
  })

  it('transition corrected → verified succeeds', async () => {
    const m = await addMistake('corrected')
    const updated = await lifecycle.transition(m.id, 'verified')
    expect(updated.status).toBe('verified')
  })

  it('transition corrected → recurring succeeds', async () => {
    const m = await addMistake('corrected')
    const updated = await lifecycle.transition(m.id, 'recurring')
    expect(updated.status).toBe('recurring')
  })

  it('transition recurring → verified succeeds', async () => {
    const m = await addMistake('recurring')
    const updated = await lifecycle.transition(m.id, 'verified')
    expect(updated.status).toBe('verified')
  })

  it('transition verified → graduated succeeds', async () => {
    const m = await addMistake('verified')
    const updated = await lifecycle.transition(m.id, 'graduated')
    expect(updated.status).toBe('graduated')
  })

  // 非法流转
  it('transition pending → graduated throws', async () => {
    const m = await addMistake('pending')
    await expect(lifecycle.transition(m.id, 'graduated')).rejects.toThrow(InvalidTransitionError)
  })

  it('transition corrected → pending throws', async () => {
    const m = await addMistake('corrected')
    await expect(lifecycle.transition(m.id, 'pending')).rejects.toThrow(InvalidTransitionError)
  })

  it('transition graduated → corrected throws (terminal)', async () => {
    const m = await addMistake('graduated')
    await expect(lifecycle.transition(m.id, 'corrected')).rejects.toThrow(InvalidTransitionError)
  })

  it('transition false_positive → pending throws (terminal)', async () => {
    const m = await addMistake('false_positive')
    await expect(lifecycle.transition(m.id, 'pending')).rejects.toThrow(InvalidTransitionError)
  })

  // 毕业检查
  it('checkGraduation returns true for recurrence>=2 with rule', async () => {
    const m1 = await crud.addMistake({ category: 'grad_cat', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
    // 第二条同 category → recurrence=2
    const m2 = await crud.addMistake({ category: 'grad_cat', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
    // 添加规则
    await crud.addRule({ category: 'grad_cat', rule_text: 'test', priority: 'normal', status: 'active', source_ids: [] })

    const result = await lifecycle.checkGraduation(m2.id)
    expect(result.eligible).toBe(true)
    expect(result.rule).toBeTruthy()
  })

  it('checkGraduation returns false for recurrence=1', async () => {
    const m = await addMistake('verified')
    const result = await lifecycle.checkGraduation(m.id)
    expect(result.eligible).toBe(false)
  })

  // 压缩
  it('compact removes graduated mistakes', async () => {
    await storage.addMistake({ id: 'g1', category: 't', status: 'graduated', trigger_type: 'L1', recurrence_count: 2, context_before: '[]', tags: [], confidence: 1, created_at: '', updated_at: '' })
    const count = await lifecycle.compact()
    expect(count).toBe(1)
  })

  // updated_at 更新
  it('transition updates updated_at', async () => {
    const m = await addMistake('pending')
    const updated = await lifecycle.transition(m.id, 'corrected')
    expect(updated.updated_at).toBeTruthy()
  })
})
