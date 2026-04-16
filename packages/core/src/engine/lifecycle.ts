import type { StorageAdapter } from '../storage/adapter'
import type { Mistake, MistakeStatus } from '../models/mistake'
import type { Rule, RuleStatus } from '../models/rule'
import { isValidTransition, isValidRuleTransition } from '../models/state-machine'

/** 非法状态流转错误 */
export class InvalidTransitionError extends Error {
  constructor(public readonly from: string, public readonly to: string) {
    super(`Invalid transition: ${from} → ${to}`)
    this.name = 'InvalidTransitionError'
  }
}

/** 生命周期引擎 — 状态流转 + 毕业检查 + 压缩归档 */
export class LifecycleEngine {
  constructor(private storage: StorageAdapter) {}

  /** 状态流转，校验合法性 */
  async transition(mistakeId: string, toStatus: MistakeStatus): Promise<Mistake> {
    const mistake = await this.storage.getMistake(mistakeId)
    if (!mistake) throw new Error(`Mistake not found: ${mistakeId}`)

    if (!isValidTransition(mistake.status, toStatus)) {
      throw new InvalidTransitionError(mistake.status, toStatus)
    }

    const updates: Partial<Mistake> = {
      status: toStatus,
      updated_at: new Date().toISOString(),
    }

    if (toStatus === 'graduated') {
      // 检查是否有关联规则
      const rules = await this.storage.getRules({ category: mistake.category, status: 'active' })
      if (rules.length > 0) {
        updates.graduated_to_rule = rules[0].id
      }
    }

    if (toStatus === 'abandoned') {
      updates.archived_at = new Date().toISOString()
    }

    await this.storage.updateMistake(mistakeId, updates)
    const updated = await this.storage.getMistake(mistakeId)
    return updated!
  }

  /** 规则状态流转 */
  async transitionRule(ruleId: string, toStatus: RuleStatus): Promise<Rule> {
    const rule = await this.storage.getRules({ status: 'active' })
    const found = (await this.storage.getRules()).find(r => r.id === ruleId)
    if (!found) throw new Error(`Rule not found: ${ruleId}`)

    if (!isValidRuleTransition(found.status, toStatus)) {
      throw new InvalidTransitionError(found.status, toStatus)
    }

    await this.storage.updateRule(ruleId, {
      status: toStatus,
      updated_at: new Date().toISOString(),
    })
    const rules = await this.storage.getRules()
    return rules.find(r => r.id === ruleId)!
  }

  /** 检查是否满足毕业条件: recurrence >= 2 且有同 category 的规则 */
  async checkGraduation(mistakeId: string): Promise<{ eligible: boolean; rule?: Rule }> {
    const mistake = await this.storage.getMistake(mistakeId)
    if (!mistake) return { eligible: false }

    if (mistake.recurrence_count < 2) return { eligible: false }

    const rules = await this.storage.getRules({ category: mistake.category })
    const activeRule = rules.find(r => r.status === 'active' || r.status === 'verified')
    if (!activeRule) return { eligible: false }

    return { eligible: true, rule: activeRule }
  }

  /** 压缩已毕业的错题 */
  async compact(category?: string): Promise<number> {
    return this.storage.compactGraduated(category)
  }
}
