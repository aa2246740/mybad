/** 规则状态 */
export type RuleStatus = 'active' | 'verified' | 'superseded' | 'archived'

/** 规则优先级 */
export type RulePriority = 'normal' | 'high' | 'critical'

/** 规则（错题压缩产物） */
export interface Rule {
  id: string
  category: string
  /** 人类可读规则文本 */
  rule_text: string
  priority: RulePriority
  /** 从多少条错题提炼 */
  source_count: number
  /** 来源错题 ID 列表 */
  source_ids: string[]
  /** 正向验证次数 */
  verified_count: number
  /** 验证失败次数 */
  fail_count: number
  status: RuleStatus
  /** 被哪条规则替代 */
  superseded_by?: string
  created_at: string
  updated_at: string
}

/** 规则查询过滤器 */
export interface RuleFilter {
  category?: string
  priority?: RulePriority
  status?: RuleStatus
  limit?: number
  offset?: number
}
