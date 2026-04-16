import type { MistakeStatus } from './mistake'
import type { RuleStatus } from './rule'

/** 错题合法状态流转矩阵 */
export const VALID_TRANSITIONS: Record<MistakeStatus, MistakeStatus[]> = {
  pending: ['corrected', 'abandoned', 'false_positive'],
  corrected: ['recurring', 'verified', 'abandoned'],
  recurring: ['corrected', 'verified', 'abandoned'],
  verified: ['graduated', 'abandoned'],
  graduated: [],       // 终态
  abandoned: [],       // 终态
  false_positive: [],  // 终态
}

/** 规则合法状态流转矩阵 */
export const RULE_VALID_TRANSITIONS: Record<RuleStatus, RuleStatus[]> = {
  active: ['verified', 'superseded', 'archived'],
  verified: ['superseded', 'archived'],
  superseded: [],  // 终态
  archived: [],    // 终态
}

/** 判断错题状态流转是否合法 */
export function isValidTransition(from: MistakeStatus, to: MistakeStatus): boolean {
  const allowed = VALID_TRANSITIONS[from]
  return allowed ? allowed.includes(to) : false
}

/** 判断规则状态流转是否合法 */
export function isValidRuleTransition(from: RuleStatus, to: RuleStatus): boolean {
  const allowed = RULE_VALID_TRANSITIONS[from]
  return allowed ? allowed.includes(to) : false
}
