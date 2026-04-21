import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryAdapter } from '../../src/storage/memory'
import { CoachEngine } from '../../src/engine/coach'
import { CrudEngine } from '../../src/engine/crud'
import type { Mistake } from '../../src/models/mistake'
import type { CoachTarget } from '../../src/models/coach'

describe('CoachEngine', () => {
  let storage: MemoryAdapter
  let coach: CoachEngine
  let crud: CrudEngine

  beforeEach(() => {
    storage = new MemoryAdapter()
    coach = new CoachEngine(storage)
    crud = new CrudEngine(storage)
  })

  /** 辅助：添加一条错题 */
  async function addMistake(overrides: Partial<Mistake> = {}): Promise<Mistake> {
    return crud.addMistake({
      category: 'test_category',
      status: 'pending',
      trigger_type: 'L1',
      context_before: '[]',
      ai_misunderstanding: 'wrong',
      user_correction: '用 url 不用 title',
      tags: [],
      confidence: 1.0,
      ...overrides,
    })
  }

  describe('analyze', () => {
    it('不满足阈值时不生成推荐', async () => {
      await addMistake({ user_correction: '一次纠正' })
      const result = await coach.analyze({ minRecurrence: 2 })
      expect(result.recommendations_generated).toBe(0)
    })

    it('达到阈值时生成推荐', async () => {
      await addMistake({ user_correction: '用 url 不用 title' })
      await addMistake({ user_correction: '要用 url' })

      const result = await coach.analyze({ minRecurrence: 2 })
      expect(result.recommendations_generated).toBe(1)
      expect(result.recommendations[0].category).toBe('test_category')
      expect(result.recommendations[0].correction_count).toBe(2)
    })

    it('明确纠正标记为 auto_applied', async () => {
      await addMistake({ user_correction: '改成 async/await' })
      await addMistake({ user_correction: '应该用 url 参数' })
      // 纠正中有"改成"和"应该"等操作词 → explicit

      const result = await coach.analyze({ minRecurrence: 2 })
      expect(result.auto_applied).toBe(1)
      expect(result.recommendations[0].clarity).toBe('explicit')
      expect(result.recommendations[0].status).toBe('auto_applied')
    })

    it('模糊纠正标记为 pending', async () => {
      await addMistake({ user_correction: '不对' })
      await addMistake({ user_correction: '错了' })

      const result = await coach.analyze({ minRecurrence: 2 })
      expect(result.pending_confirmation).toBe(1)
      expect(result.recommendations[0].clarity).toBe('ambiguous')
      expect(result.recommendations[0].status).toBe('pending')
    })

    it('有 user_intent 时标记为 explicit', async () => {
      await addMistake({ user_intent: '查询天气', user_correction: '不对' })
      await addMistake({ user_intent: '查天气', user_correction: '错了' })

      const result = await coach.analyze({ minRecurrence: 2 })
      expect(result.recommendations[0].clarity).toBe('explicit')
    })

    it('不重复生成已有 pending 的推荐', async () => {
      await addMistake({ user_correction: '用 url' })
      await addMistake({ user_correction: '要用 url' })
      await coach.analyze({ minRecurrence: 2 })

      // 再加一条，再分析
      await addMistake({ user_correction: '还是 url' })
      const result = await coach.analyze({ minRecurrence: 2 })
      expect(result.recommendations_generated).toBe(0) // 已有 pending，不重复
    })

    it('按 category 独立分析', async () => {
      await addMistake({ category: 'cat_a', user_correction: '改A' })
      await addMistake({ category: 'cat_a', user_correction: '还要A' })
      await addMistake({ category: 'cat_b', user_correction: '改B' })
      await addMistake({ category: 'cat_b', user_correction: '还要B' })

      const result = await coach.analyze({ minRecurrence: 2 })
      expect(result.recommendations_generated).toBe(2)
      expect(result.categories_analyzed).toContain('cat_a')
      expect(result.categories_analyzed).toContain('cat_b')
    })

    it('跳过 false_positive 和 abandoned 的错题', async () => {
      await addMistake({ status: 'false_positive', user_correction: '误报' })
      await addMistake({ status: 'abandoned', user_correction: '放弃' })

      const result = await coach.analyze({ minRecurrence: 2 })
      expect(result.recommendations_generated).toBe(0)
    })

    it('支持自定义 minRecurrence', async () => {
      await addMistake({ user_correction: '改A' })
      await addMistake({ user_correction: '改A' })
      await addMistake({ user_correction: '改A' })

      const result = await coach.analyze({ minRecurrence: 3 })
      expect(result.recommendations_generated).toBe(1)
    })

    it('匹配目标文件', async () => {
      await addMistake({ category: 'data_fetch', user_correction: '用 url' })
      await addMistake({ category: 'data_fetch', user_correction: '要用 url' })

      const targets: CoachTarget[] = [
        { type: 'skill', path: '.claude/skills/data-fetch/SKILL.md', description: '数据采集 skill' },
        { type: 'CLAUDE.md', path: 'CLAUDE.md', description: '项目指令' },
      ]

      const result = await coach.analyze({ minRecurrence: 2, targets })
      expect(result.recommendations[0].target_file_type).toBe('skill')
      expect(result.recommendations[0].target_file_path).toBe('.claude/skills/data-fetch/SKILL.md')
    })

    it('无匹配目标文件时默认 CLAUDE.md', async () => {
      await addMistake({ user_correction: '改A' })
      await addMistake({ user_correction: '改A' })

      const result = await coach.analyze({ minRecurrence: 2 })
      expect(result.recommendations[0].target_file_type).toBe('CLAUDE.md')
      expect(result.recommendations[0].target_file_path).toBe('CLAUDE.md')
    })
  })

  describe('推荐管理', () => {
    it('getPendingConfirmations 返回 pending 状态的推荐', async () => {
      await addMistake({ user_correction: '不对' })
      await addMistake({ user_correction: '错了' })
      await coach.analyze({ minRecurrence: 2 })

      const pending = await coach.getPendingConfirmations()
      expect(pending.length).toBe(1)
      expect(pending[0].status).toBe('pending')
    })

    it('confirm 将 pending 变为 confirmed', async () => {
      await addMistake({ user_correction: '不对' })
      await addMistake({ user_correction: '错了' })
      await coach.analyze({ minRecurrence: 2 })

      const pending = await coach.getPendingConfirmations()
      const id = pending[0].id

      const confirmed = await coach.confirm(id, 'user')
      expect(confirmed?.status).toBe('confirmed')
      expect(confirmed?.confirmed_by).toBe('user')
    })

    it('reject 将 pending 变为 rejected', async () => {
      await addMistake({ user_correction: '不对' })
      await addMistake({ user_correction: '错了' })
      await coach.analyze({ minRecurrence: 2 })

      const pending = await coach.getPendingConfirmations()
      const id = pending[0].id

      const rejected = await coach.reject(id, '不需要')
      expect(rejected?.status).toBe('rejected')
      expect(rejected?.failure_reason).toBe('不需要')
    })

    it('markApplied 标记已应用', async () => {
      await addMistake({ user_correction: '改成 url' })
      await addMistake({ user_correction: '要用 url' })
      await coach.analyze({ minRecurrence: 2 })

      const recs = await coach.getRecommendations({ status: 'auto_applied' })
      const applied = await coach.markApplied(recs[0].id)
      expect(applied?.status).toBe('auto_applied')
      expect(applied?.applied_at).toBeTruthy()
    })

    it('getAppliedRules 返回所有已应用和已确认的规则', async () => {
      // explicit → auto_applied
      await addMistake({ category: 'cat_explicit', user_correction: '用 url 参数' })
      await addMistake({ category: 'cat_explicit', user_correction: '要用 url' })
      await coach.analyze({ minRecurrence: 2 })

      // ambiguous → pending → confirm
      await addMistake({ category: 'cat_amb', user_correction: '不对' })
      await addMistake({ category: 'cat_amb', user_correction: '错了' })
      await coach.analyze({ minRecurrence: 2 })

      const pending = await coach.getPendingConfirmations()
      await coach.confirm(pending[0].id, 'user')

      const rules = await coach.getAppliedRules()
      expect(rules.length).toBe(2)
    })
  })

  describe('judgeClarity', () => {
    it('有具体操作词 → explicit', async () => {
      await addMistake({ category: 'c1', user_correction: '用 async/await 替换 callback' })
      await addMistake({ category: 'c1', user_correction: '应该改成 async' })

      const result = await coach.analyze({ minRecurrence: 2 })
      expect(result.recommendations[0].clarity).toBe('explicit')
    })

    it('只有否定无方向 → ambiguous', async () => {
      await addMistake({ category: 'c2', user_correction: '不对' })
      await addMistake({ category: 'c2', user_correction: '又错了' })

      const result = await coach.analyze({ minRecurrence: 2 })
      expect(result.recommendations[0].clarity).toBe('ambiguous')
    })

    it('纠正文本太短 → ambiguous', async () => {
      await addMistake({ category: 'c3', user_correction: '错' })
      await addMistake({ category: 'c3', user_correction: '嗯' })

      const result = await coach.analyze({ minRecurrence: 2 })
      expect(result.recommendations[0].clarity).toBe('ambiguous')
    })
  })

  describe('suggestedRule 格式', () => {
    it('包含 mybad 标记和 category', async () => {
      await addMistake({ category: 'api_params', user_intent: '使用 url 参数', user_correction: '用 url 不用 title' })
      await addMistake({ category: 'api_params', user_intent: 'url', user_correction: '改成 url' })

      const result = await coach.analyze({ minRecurrence: 2 })
      expect(result.recommendations[0].suggested_rule).toContain('mybad:api_params')
    })
  })
})
