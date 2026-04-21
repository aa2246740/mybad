/**
 * myBad v2 — 规则生命周期管理器
 *
 * 管理规则从"active"到"graduated/downgraded/archived/evolved"的生命周期转换。
 * 基于置信度（obeyed / (obeyed + violated)）驱动自动转换。
 *
 * 四种生命周期操作：
 * - graduate（毕业）：高置信度 + 多次触发 → 升级为永久规则
 * - downgrade（降级）：低置信度 + 多次违反 → 标记待重审
 * - archive（归档）：长期未触发 → 移出注入列表，减少噪音
 * - evolve（进化）：规则被违反 + 新纠正出现 → Coach 重新分析生成更精确规则
 */

import type {
  RuleTracking,
  RuleLifecycleStatus,
  LifecycleAction,
} from './types'

/** 生命周期评估阈值配置 */
export interface LifecycleThresholds {
  /** 毕业阈值：置信度 ≥ 此值 + triggered ≥ minTriggerForGraduate */
  graduateConfidence: number
  /** 毕业最小触发次数 */
  minTriggerForGraduate: number
  /** 降级阈值：置信度 < 此值 + violated ≥ minViolatedForDowngrade */
  downgradeConfidence: number
  /** 降级最小违反次数 */
  minViolatedForDowngrade: number
  /** 归档阈值：N 天未触发 + triggered ≤ maxTriggerForArchive */
  archiveDaysSinceTrigger: number
  /** 归档最大触发次数（只归档触发极少的规则） */
  maxTriggerForArchive: number
}

/** 默认阈值 */
export const DEFAULT_THRESHOLDS: LifecycleThresholds = {
  graduateConfidence: 0.8,
  minTriggerForGraduate: 5,
  downgradeConfidence: 0.3,
  minViolatedForDowngrade: 3,
  archiveDaysSinceTrigger: 30,
  maxTriggerForArchive: 1,
}

/**
 * 规则生命周期管理器
 *
 * 定期运行（每次 Coach 或每日定时），检查所有 active 规则的置信度，
 * 执行生命周期转换。
 */
export class RuleLifecycleManager {
  constructor(private thresholds: LifecycleThresholds = DEFAULT_THRESHOLDS) {}

  /**
   * 评估所有 active 规则，返回需要执行的生命周期操作列表
   *
   * @param activeTracking 当前所有 active 状态的规则追踪记录
   * @returns 需要执行的操作列表
   */
  evaluate(activeTracking: RuleTracking[]): LifecycleAction[] {
    const actions: LifecycleAction[] = []

    for (const tracking of activeTracking) {
      if (tracking.lifecycle !== 'active') continue

      // 计算置信度
      const total = tracking.obeyedCount + tracking.violatedCount
      const confidence = total > 0 ? tracking.obeyedCount / total : 0

      // 检查毕业条件：高置信度 + 多次触发
      if (
        confidence >= this.thresholds.graduateConfidence &&
        tracking.triggeredCount >= this.thresholds.minTriggerForGraduate
      ) {
        actions.push({
          ruleId: tracking.recommendationId,
          trackingId: tracking.id,
          action: 'graduate',
          reason: `置信度 ${(confidence * 100).toFixed(0)}%，触发 ${tracking.triggeredCount} 次`,
        })
        continue
      }

      // 检查降级条件：低置信度 + 多次违反
      if (
        confidence < this.thresholds.downgradeConfidence &&
        tracking.violatedCount >= this.thresholds.minViolatedForDowngrade
      ) {
        actions.push({
          ruleId: tracking.recommendationId,
          trackingId: tracking.id,
          action: 'downgrade',
          reason: `置信度仅 ${(confidence * 100).toFixed(0)}%，被违反 ${tracking.violatedCount} 次`,
        })
        continue
      }

      // 检查归档条件：长期未触发 + 触发次数极少
      const daysSinceTrigger = tracking.lastTriggeredAt
        ? this.daysSince(tracking.lastTriggeredAt)
        : this.daysSince(tracking.createdAt)

      if (
        tracking.triggeredCount <= this.thresholds.maxTriggerForArchive &&
        daysSinceTrigger > this.thresholds.archiveDaysSinceTrigger
      ) {
        actions.push({
          ruleId: tracking.recommendationId,
          trackingId: tracking.id,
          action: 'archive',
          reason: `${daysSinceTrigger} 天未触发`,
        })
        continue
      }
    }

    return actions
  }

  /**
   * 记录规则被触发（每次注入规则时调用）
   * @returns 更新后的追踪记录
   */
  recordTrigger(tracking: RuleTracking): RuleTracking {
    return {
      ...tracking,
      triggeredCount: tracking.triggeredCount + 1,
      lastTriggeredAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
    }
  }

  /**
   * 记录规则被遵守（定期检查时，规则存在期间无新纠正）
   * @returns 更新后的追踪记录
   */
  recordObeyed(tracking: RuleTracking): RuleTracking {
    const newObeyed = tracking.obeyedCount + 1
    const total = newObeyed + tracking.violatedCount
    return {
      ...tracking,
      obeyedCount: newObeyed,
      confidence: total > 0 ? newObeyed / total : 0,
      lastCheckedAt: new Date().toISOString(),
    }
  }

  /**
   * 记录规则被违反（correction_capture 时，该 category 有 active rule）
   * @returns 更新后的追踪记录
   */
  recordViolated(tracking: RuleTracking): RuleTracking {
    const newViolated = tracking.violatedCount + 1
    const total = tracking.obeyedCount + newViolated
    return {
      ...tracking,
      violatedCount: newViolated,
      confidence: total > 0 ? tracking.obeyedCount / total : 0,
      lastViolatedAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
    }
  }

  /**
   * 应用生命周期操作，返回新的状态
   */
  applyAction(tracking: RuleTracking, action: LifecycleAction): RuleTracking {
    const statusMap: Record<string, RuleLifecycleStatus> = {
      graduate: 'graduated',
      downgrade: 'downgraded',
      archive: 'archived',
      evolve: 'evolved',
    }

    return {
      ...tracking,
      lifecycle: statusMap[action.action] ?? tracking.lifecycle,
      lastCheckedAt: new Date().toISOString(),
    }
  }

  /** 计算距离某日期的天数 */
  private daysSince(dateStr: string): number {
    const date = new Date(dateStr)
    const now = new Date()
    return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  }
}
