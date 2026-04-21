import type { StorageAdapter } from '../storage/adapter'
import type { Mistake } from '../models/mistake'
import type {
  CoachRecommendation,
  CoachRecommendationFilter,
  CoachRecommendationStatus,
  CorrectionClarity,
  CoachAnalysis,
  CoachTarget,
} from '../models/coach'

/** 生成唯一 ID */
function generateId(prefix: string = 'cr'): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${ts}_${rand}`
}

/**
 * Coach 引擎 — 从错题记录中分析模式，生成改进建议
 *
 * 核心原则：
 * - Coach 不制造答案，它搬运和安置答案。答案来自用户纠正。
 * - Coach 改的是源头文件（SOP、CLAUDE.md、workflow.yaml），不是运行时注入。
 * - 明确的纠正 → 自动应用
 * - 模糊的纠正 → pending，等下次 session 用户确认
 */
export class CoachEngine {
  constructor(private storage: StorageAdapter) {}

  /**
   * 分析所有错题模式，生成 Coach 建议
   *
   * 触发条件：
   * - 同 category 纠正 ≥ minRecurrence 次（默认 2）
   * - 或用户手动触发
   *
   * @param options.minRecurrence 最小复发次数，默认 2
   * @param options.targets 当前环境中的目标文件列表，帮助 Coach 匹配建议
   */
  async analyze(options: {
    minRecurrence?: number
    targets?: CoachTarget[]
    agentId?: string
  } = {}): Promise<CoachAnalysis> {
    const minRecurrence = options.minRecurrence ?? 2
    const targets = options.targets ?? []

    // 1. 获取所有有 recurrence 的 category 分组
    const allMistakes = await this.storage.queryMistakes({
      recurrence_min: 1,
    })

    // 按 category 分组
    const categoryMap = new Map<string, Mistake[]>()
    for (const m of allMistakes) {
      if (m.status === 'false_positive' || m.status === 'abandoned') continue
      const list = categoryMap.get(m.category) ?? []
      list.push(m)
      categoryMap.set(m.category, list)
    }

    // 2. 找出达到阈值的 category
    const qualifying = new Map<string, Mistake[]>()
    for (const [cat, mistakes] of categoryMap) {
      if (mistakes.length >= minRecurrence) {
        qualifying.set(cat, mistakes)
      }
    }

    // 3. 对每个符合条件的 category 生成推荐
    const recommendations: CoachRecommendation[] = []
    for (const [category, mistakes] of qualifying) {
      // 检查是否已有 pending/auto_applied 的推荐（避免重复）
      const existing = await this.storage.getCoachRecommendations({
        category,
        status: 'pending',
      })
      const existingAuto = await this.storage.getCoachRecommendations({
        category,
        status: 'auto_applied',
      })
      if (existing.length > 0 || existingAuto.length > 0) continue

      const rec = this.generateRecommendation(category, mistakes, targets)
      if (rec) {
        await this.storage.addCoachRecommendation(rec)
        recommendations.push(rec)
      }
    }

    // 4. 汇总
    const autoApplied = recommendations.filter(r => r.status === 'auto_applied').length
    const pending = recommendations.filter(r => r.status === 'pending').length

    return {
      categories_analyzed: Array.from(qualifying.keys()),
      recommendations_generated: recommendations.length,
      auto_applied: autoApplied,
      pending_confirmation: pending,
      recommendations,
    }
  }

  /**
   * 生成单条推荐
   *
   * 判断逻辑：
   * - 如果所有纠正都有明确的 user_correction 且长度 > 10 → explicit → auto_applied
   * - 如果纠正模糊或缺失 → ambiguous → pending
   */
  private generateRecommendation(
    category: string,
    mistakes: Mistake[],
    targets: CoachTarget[],
  ): CoachRecommendation | null {
    const now = new Date().toISOString()
    const ids = mistakes.map(m => m.id)

    // 分析纠正内容
    const corrections = mistakes
      .map(m => m.user_correction)
      .filter((c): c is string => !!c && c.trim().length > 0)

    const misunderstandings = mistakes
      .map(m => m.ai_misunderstanding)
      .filter((u): u is string => !!u && u.trim().length > 0)

    const intents = mistakes
      .map(m => m.user_intent)
      .filter((i): i is string => !!i && i.trim().length > 0)

    // 没有任何纠正文本，无法生成建议
    if (corrections.length === 0 && intents.length === 0) return null

    // 判断明确度：至少有一条明确的 user_correction
    const clarity = this.judgeClarity(corrections, intents)

    // 生成模式摘要
    const patternSummary = this.buildPatternSummary(category, misunderstandings, intents, corrections)

    // 生成建议规则文本
    const suggestedRule = this.buildSuggestedRule(category, corrections, intents)

    // 匹配目标文件
    const { fileType, filePath, insertionText } = this.matchTarget(category, targets)

    // 构建推荐记录
    const rec: CoachRecommendation = {
      id: generateId('cr'),
      category,
      pattern_summary: patternSummary,
      suggested_rule: suggestedRule,
      target_file_type: fileType,
      target_file_path: filePath,
      insertion_text: insertionText ?? suggestedRule,
      clarity,
      status: clarity === 'explicit' ? 'auto_applied' : 'pending',
      source_mistake_ids: ids,
      correction_count: mistakes.length,
      applied_at: clarity === 'explicit' ? now : undefined,
      created_at: now,
      updated_at: now,
    }

    return rec
  }

  /**
   * 判断纠正的明确度
   *
   * explicit: 有具体的 before→after 描述
   *   例如："用 url 不用 title"、"改成 async/await"
   * ambiguous: 只有否定，没有具体方向
   *   例如："不对"、"又错了"、"搞错了"
   */
  private judgeClarity(
    corrections: string[],
    intents: string[],
  ): CorrectionClarity {
    // 如果有明确的意图描述，算 explicit
    if (intents.length > 0) return 'explicit'

    // 如果纠正文本太短（< 5 字），算 ambiguous
    const meaningfulCorrections = corrections.filter(c => c.trim().length >= 5)
    if (meaningfulCorrections.length === 0) return 'ambiguous'

    // 如果纠正文本包含具体操作词，算 explicit
    const actionPatterns = /用|改为|改成|应该|换成|不用|不要|必须|需要|使用|改为|修改|替换/
    const hasAction = meaningfulCorrections.some(c => actionPatterns.test(c))

    return hasAction ? 'explicit' : 'ambiguous'
  }

  /** 生成模式摘要 */
  private buildPatternSummary(
    category: string,
    misunderstandings: string[],
    intents: string[],
    corrections: string[],
  ): string {
    const parts: string[] = [`分类: ${category}`]

    if (misunderstandings.length > 0) {
      parts.push(`常见误解: ${[...new Set(misunderstandings)].slice(0, 3).join(', ')}`)
    }
    if (intents.length > 0) {
      parts.push(`正确意图: ${[...new Set(intents)].slice(0, 3).join(', ')}`)
    }
    if (corrections.length > 0) {
      parts.push(`纠正: ${[...new Set(corrections)].slice(0, 3).join('; ')}`)
    }

    return parts.join(' | ')
  }

  /** 生成建议规则文本 */
  private buildSuggestedRule(
    category: string,
    corrections: string[],
    intents: string[],
  ): string {
    // 去重
    const uniqueCorrections = [...new Set(corrections)]
    const uniqueIntents = [...new Set(intents)]

    if (uniqueIntents.length > 0 && uniqueCorrections.length > 0) {
      return `[mybad:${category}] 当 ${uniqueIntents[0]} 时，${uniqueCorrections[0]}`
    }
    if (uniqueCorrections.length > 0) {
      return `[mybad:${category}] ${uniqueCorrections[0]}`
    }
    if (uniqueIntents.length > 0) {
      return `[mybad:${category}] 用户意图是 ${uniqueIntents[0]}，注意不要误解`
    }
    return `[mybad:${category}] 注意此分类的历史错误`
  }

  /** 匹配目标文件 */
  private matchTarget(
    category: string,
    targets: CoachTarget[],
  ): { fileType: CoachRecommendation['target_file_type']; filePath?: string; insertionText?: string } {
    // 标准化 category：去掉下划线和连字符，统一小写，方便匹配
    const normalizedCat = category.replace(/[-_]/g, '').toLowerCase()

    // 尝试从 targets 中找到匹配的
    if (targets.length > 0) {
      // 优先匹配 skill 类型（最具体的指导文件）
      const skill = targets.find(t => {
        if (t.type !== 'skill') return false
        const normalizedPath = t.path.replace(/[-_]/g, '').toLowerCase()
        const normalizedDesc = t.description.replace(/[-_]/g, '').toLowerCase()
        return normalizedPath.includes(normalizedCat) || normalizedDesc.includes(normalizedCat)
      })
      if (skill) {
        return { fileType: 'skill', filePath: skill.path }
      }

      // 其次匹配 SOP
      const sop = targets.find(t => {
        if (t.type !== 'SOP') return false
        const normalizedPath = t.path.replace(/[-_]/g, '').toLowerCase()
        const normalizedDesc = t.description.replace(/[-_]/g, '').toLowerCase()
        return normalizedPath.includes(normalizedCat) || normalizedDesc.includes(normalizedCat)
      })
      if (sop) {
        return { fileType: 'SOP', filePath: sop.path }
      }
    }

    // 默认建议写入 CLAUDE.md
    return { fileType: 'CLAUDE.md', filePath: 'CLAUDE.md' }
  }

  /** 获取推荐列表 */
  async getRecommendations(filter?: CoachRecommendationFilter): Promise<CoachRecommendation[]> {
    return this.storage.getCoachRecommendations(filter)
  }

  /** 更新推荐状态 */
  async updateRecommendation(
    id: string,
    updates: Partial<CoachRecommendation>,
  ): Promise<CoachRecommendation | null> {
    const now = new Date().toISOString()
    await this.storage.updateCoachRecommendation(id, {
      ...updates,
      updated_at: now,
    })
    const recs = await this.storage.getCoachRecommendations({ status: updates.status })
    return recs.find(r => r.id === id) ?? null
  }

  /** 确认一条 pending 推荐 */
  async confirm(id: string, confirmedBy: string): Promise<CoachRecommendation | null> {
    return this.updateRecommendation(id, {
      status: 'confirmed',
      confirmed_by: confirmedBy,
    })
  }

  /** 拒绝一条 pending 推荐 */
  async reject(id: string, reason?: string): Promise<CoachRecommendation | null> {
    return this.updateRecommendation(id, {
      status: 'rejected',
      failure_reason: reason,
    })
  }

  /** 标记推荐已成功应用到源文件 */
  async markApplied(id: string): Promise<CoachRecommendation | null> {
    return this.updateRecommendation(id, {
      status: 'auto_applied',
      applied_at: new Date().toISOString(),
    })
  }

  /** 获取所有 pending 确认的推荐 */
  async getPendingConfirmations(): Promise<CoachRecommendation[]> {
    return this.storage.getCoachRecommendations({
      status: 'pending',
    })
  }

  /** 获取所有已应用的推荐（用于注入到 Agent context） */
  async getAppliedRules(): Promise<string[]> {
    const applied = await this.storage.getCoachRecommendations({
      status: 'auto_applied',
    })
    const confirmed = await this.storage.getCoachRecommendations({
      status: 'confirmed',
    })
    return [...applied, ...confirmed].map(r => r.suggested_rule)
  }
}
