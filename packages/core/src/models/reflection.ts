/** 反思记录 */
export interface Reflection {
  id: string
  /** 反思日期 'YYYY-MM-DD', UNIQUE */
  date: string
  /** 反思内容 */
  summary: string
  /** 新提炼的规则 IDs */
  new_rule_ids: string[]
  /** 高频错误分类 */
  hot_categories: string[]
  /** 当日统计 */
  stats: Record<string, unknown>
  agent_id?: string
  created_at: string
}

/** 反思查询过滤器 */
export interface ReflectionFilter {
  date_from?: string
  date_to?: string
  agent_id?: string
  limit?: number
  offset?: number
}
