/** 错题状态 */
export type MistakeStatus =
  | 'pending'
  | 'corrected'
  | 'recurring'
  | 'verified'
  | 'graduated'
  | 'abandoned'
  | 'false_positive'

/** 触发信号级别 */
export type TriggerType = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'manual'

/** 上下文消息 */
export interface ContextMessage {
  role: string
  content: string
}

/** 错题 */
export interface Mistake {
  /** 主键, 格式 'm_{timestamp}_{suffix}' */
  id: string
  /** Agent 判定的错误分类 */
  category: string
  /** 当前状态 */
  status: MistakeStatus
  /** 触发级别 */
  trigger_type: TriggerType
  /** 同 category 递增计数 */
  recurrence_count: number
  /** 纠正前的上下文 (JSON 序列化的 ContextMessage[]) */
  context_before: string
  /** 纠正后的上下文 (JSON 序列化的 ContextMessage[]) */
  context_after?: string
  /** AI 理解成了什么 */
  ai_misunderstanding?: string
  /** 用户本意 */
  user_intent?: string
  /** 用户纠正原话 */
  user_correction?: string
  /** 哪个 Agent */
  agent_id?: string
  /** 哪个会话 */
  session_id?: string
  /** 标签列表 */
  tags: string[]
  /** 置信度 0-1 */
  confidence: number
  /** 毕业后关联到的规则 ID */
  graduated_to_rule?: string
  /** ISO 8601 */
  created_at: string
  /** ISO 8601 */
  updated_at: string
  /** ISO 8601 */
  archived_at?: string
}

/** 错题查询过滤器 */
export interface MistakeFilter {
  category?: string
  status?: MistakeStatus
  agent_id?: string
  date_from?: string
  date_to?: string
  recurrence_min?: number
  limit?: number
  offset?: number
}
