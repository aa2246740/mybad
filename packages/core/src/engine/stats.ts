import type { StorageAdapter, DateRange } from '../storage/adapter'
import type { CategoryStats, OverallStats } from '../storage/adapter'

/** 反思输入数据 — 供 Agent LLM 分析用 */
export interface ReflectionInput {
  pending_mistakes: number
  recurring_mistakes: number
  hot_categories: CategoryStats[]
  linked_groups: { id: string; related_count: number }[]
  date_range: { from: string; to: string }
}

/** 统计引擎 — 聚合统计 + 反思数据 */
export class StatsEngine {
  constructor(private storage: StorageAdapter) {}

  /** 获取分类统计 */
  async getCategoryStats(agentId?: string): Promise<CategoryStats[]> {
    return this.storage.getCategoryStats(agentId)
  }

  /** 获取全局统计 */
  async getOverallStats(agentId?: string, dateRange?: DateRange): Promise<OverallStats> {
    return this.storage.getOverallStats(agentId, dateRange)
  }

  /** 获取结构化反思输入数据 */
  async getReflectionData(options: {
    dateFrom?: string
    dateTo?: string
    includeCategories?: string[]
    minRecurrence?: number
  } = {}): Promise<ReflectionInput> {
    const now = new Date().toISOString()
    const allMistakes = await this.storage.queryMistakes({
      date_from: options.dateFrom,
      date_to: options.dateTo,
    })

    const pending = allMistakes.filter(m => m.status === 'pending')
    const recurring = allMistakes.filter(m =>
      m.status === 'recurring' ||
      (options.minRecurrence && m.recurrence_count >= options.minRecurrence)
    )

    let hotCategories = await this.storage.getCategoryStats()
    if (options.includeCategories) {
      hotCategories = hotCategories.filter(c => options.includeCategories!.includes(c.category))
    }
    // 按数量排序，取 top
    hotCategories.sort((a, b) => b.count - a.count)

    // 关联分析
    const linkedGroups: { id: string; related_count: number }[] = []
    for (const m of allMistakes.slice(0, 20)) {
      const related = await this.storage.getRelated(m.id, 1)
      if (related.length > 0) {
        linkedGroups.push({ id: m.id, related_count: related.length })
      }
    }

    return {
      pending_mistakes: pending.length,
      recurring_mistakes: recurring.length,
      hot_categories: hotCategories.slice(0, 10),
      linked_groups: linkedGroups,
      date_range: {
        from: options.dateFrom ?? allMistakes[allMistakes.length - 1]?.created_at ?? now,
        to: options.dateTo ?? now,
      },
    }
  }
}
