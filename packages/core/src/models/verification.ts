/** 验证结果 */
export type VerificationResult = 'pass' | 'fail'

/** 验证记录 */
export interface Verification {
  /** 自增 ID (SQLite AUTOINCREMENT) */
  id?: number
  rule_id: string
  result: VerificationResult
  context?: string
  agent_id?: string
  verified_at: string
}

/** 验证计数 */
export interface VerificationCount {
  pass: number
  fail: number
}
