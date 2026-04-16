import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SQLiteAdapter } from '../../src/storage/sqlite'
import { MyBadEngine } from '../../src/engine'
import path from 'path'
import os from 'os'
import fs from 'fs'

describe('Concurrent Recurrence', () => {
  let engine: MyBadEngine
  let adapter: SQLiteAdapter
  let dbPath: string

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `mybad-test-${Date.now()}.db`)
    adapter = new SQLiteAdapter(dbPath)
    engine = new MyBadEngine(adapter)
  })

  afterEach(() => {
    try { adapter.close() } catch {}
    try { fs.unlinkSync(dbPath) } catch {}
    try { fs.unlinkSync(dbPath + '-wal') } catch {}
    try { fs.unlinkSync(dbPath + '-shm') } catch {}
  })

  it('serial write of 10 same-category mistakes: recurrence 1→10', async () => {
    const mistakes = []
    for (let i = 0; i < 10; i++) {
      const m = await engine.addMistake({
        category: 'concurrent_cat',
        status: 'pending',
        trigger_type: 'L1',
        context_before: `[]`,
        tags: [],
        confidence: 1.0,
      })
      mistakes.push(m)
    }
    // 验证每条 mistake 的 recurrence_count 递增
    const counts = mistakes.map(m => m.recurrence_count)
    for (let i = 0; i < 10; i++) {
      expect(counts[i]).toBe(i + 1)
    }
  })

  it('rapid consecutive write: all recurrence_count unique and in 1-10', async () => {
    const mistakes = []
    for (let i = 0; i < 10; i++) {
      mistakes.push(await engine.addMistake({
        category: 'rapid_cat',
        status: 'pending',
        trigger_type: 'L1',
        context_before: '[]',
        tags: [],
        confidence: 1.0,
      }))
    }
    const counts = mistakes.map(m => m.recurrence_count).sort((a, b) => a - b)
    // 所有值唯一
    expect(new Set(counts).size).toBe(10)
    // 最小值 1，最大值 10
    expect(counts[0]).toBe(1)
    expect(counts[9]).toBe(10)
  })

  it('interleaved addMistake + updateMistake does not lose data', async () => {
    const m1 = await engine.addMistake({ category: 'interleave', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
    await engine.updateMistake(m1.id, { status: 'corrected' })
    const m2 = await engine.addMistake({ category: 'interleave', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
    await engine.updateMistake(m2.id, { user_correction: 'fix' })

    const got1 = await engine.getMistake(m1.id)
    const got2 = await engine.getMistake(m2.id)
    expect(got1!.status).toBe('corrected')
    expect(got2!.user_correction).toBe('fix')
    expect(got2!.recurrence_count).toBe(2)
  })

  it('different categories do not interfere', async () => {
    const ma = await engine.addMistake({ category: 'cat_a', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
    const mb = await engine.addMistake({ category: 'cat_b', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
    const ma2 = await engine.addMistake({ category: 'cat_a', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })
    const mb2 = await engine.addMistake({ category: 'cat_b', status: 'pending', trigger_type: 'L1', context_before: '[]', tags: [], confidence: 1.0 })

    expect(ma.recurrence_count).toBe(1)
    expect(mb.recurrence_count).toBe(1)
    expect(ma2.recurrence_count).toBe(2)
    expect(mb2.recurrence_count).toBe(2)
  })
})
