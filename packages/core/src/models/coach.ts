/** Coach 推荐状态 */
export type CoachRecommendationStatus =
  | 'pending'       // 等待处理
  | 'auto_applied'  // 已自动应用到源文件
  | 'confirmed'     // 用户已确认，等待应用
  | 'rejected'      // 用户拒绝
  | 'failed'        // 应用失败

/** 纠正明确度 */
export type CorrectionClarity = 'explicit' | 'ambiguous'

/** 目标文件类型 */
export type TargetFileType = 'CLAUDE.md' | 'skill' | 'workflow' | 'SOP' | 'memory'

/** Coach 推荐记录 */
export interface CoachRecommendation {
  /** 主键 */
  id: string
  /** 关联的错误分类 */
  category: string
  /** 错误模式摘要（从多条纠正中归纳） */
  pattern_summary: string
  /** 建议写入的规则文本 */
  suggested_rule: string
  /** 建议修改的目标文件类型 */
  target_file_type: TargetFileType
  /** 具体目标文件路径（如果已知） */
  target_file_path?: string
  /** 建议插入的内容块 */
  insertion_text?: string
  /** 纠正明确度 */
  clarity: CorrectionClarity
  /** 当前状态 */
  status: CoachRecommendationStatus
  /** 来源错题 ID 列表 */
  source_mistake_ids: string[]
  /** 涉及的纠正次数 */
  correction_count: number
  /** 应用时间 */
  applied_at?: string
  /** 确认者（用户/agent） */
  confirmed_by?: string
  /** 失败原因 */
  failure_reason?: string
  /** ISO 8601 */
  created_at: string
  /** ISO 8601 */
  updated_at: string
}

/** Coach 推荐过滤器 */
export interface CoachRecommendationFilter {
  category?: string
  status?: CoachRecommendationStatus
  clarity?: CorrectionClarity
  limit?: number
  offset?: number
}

/** Coach 分析结果 */
export interface CoachAnalysis {
  /** 分析了哪些分类 */
  categories_analyzed: string[]
  /** 生成了多少条推荐 */
  recommendations_generated: number
  /** 自动应用了多少 */
  auto_applied: number
  /** 需要用户确认的 */
  pending_confirmation: number
  /** 推荐列表 */
  recommendations: CoachRecommendation[]
}

/** Coach session 上下文 — 描述当前 Agent 环境中的目标文件 */
export interface CoachTarget {
  /** 文件类型 */
  type: TargetFileType
  /** 文件路径（相对于项目根目录） */
  path: string
  /** 文件描述（帮助 Coach 判断是否匹配） */
  description: string
}
