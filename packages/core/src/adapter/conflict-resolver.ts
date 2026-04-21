/**
 * myBad v2 — 规则冲突解决器
 *
 * 当三层作用域（project > agent > universal）的同 category 规则矛盾时，
 * 只保留最高优先级的规则，被覆盖的规则标记为 superseded。
 *
 * 冲突记录写入 rule_conflicts 表，供审计和回溯。
 */

import type { ScopedRules } from './scope'
import type {
  RuleScope,
  RuleConflictRecord,
  ResolvedRuleSet,
  ScopedRule,
} from './types'
import { SCOPE_PRIORITY } from './types'
import type { CoachRecommendation } from '../models/coach'
import type { StorageAdapter } from '../storage/adapter'

/** 冲突解决器 — 在 session-inject.md 生成之前运行 */
export class ConflictResolver {
  constructor(private storage?: StorageAdapter) {}

  /**
   * 检测三层规则中的冲突并解决
   *
   * 解决策略：同 category 只保留一个 active rule，高优先级覆盖低优先级
   * 优先级：project > agent > universal
   *
   * @param scopedRules 按作用域分组的规则
   * @returns 解决结果：生效的规则 + 冲突记录
   */
  resolve(scopedRules: ScopedRules): ResolvedRuleSet {
    const activeRules = new Map<string, ScopedRule>()
    const conflicts: RuleConflictRecord[] = []

    // 按 category 收集所有规则
    const categoryMap = new Map<string, Array<{ rule: CoachRecommendation; scope: RuleScope }>>()

    const layers: Array<{ rules: CoachRecommendation[]; scope: RuleScope }> = [
      { rules: scopedRules.universal, scope: 'universal' },
      { rules: scopedRules.agent, scope: 'agent' },
      { rules: scopedRules.project, scope: 'project' },
    ]

    for (const { rules, scope } of layers) {
      for (const rule of rules) {
        const list = categoryMap.get(rule.category) ?? []
        list.push({ rule, scope })
        categoryMap.set(rule.category, list)
      }
    }

    // 对每个 category 执行冲突解决
    for (const [category, entries] of categoryMap) {
      // 按 scope 优先级排序（最高在前）
      const sorted = [...entries].sort(
        (a, b) => SCOPE_PRIORITY[b.scope] - SCOPE_PRIORITY[a.scope]
      )

      const winner = sorted[0]

      activeRules.set(category, {
        recommendation: winner.rule,
        scope: winner.scope,
        overridden: false,
      })

      // 被覆盖的规则记录冲突
      for (let i = 1; i < sorted.length; i++) {
        const loser = sorted[i]
        conflicts.push({
          category,
          winnerScope: winner.scope,
          winnerRule: winner.rule,
          loserScope: loser.scope,
          loserRule: loser.rule,
        })
      }
    }

    return { activeRules, conflicts }
  }

  /**
   * 将冲突记录持久化到 rule_conflicts 表
   * 在 resolve() 之后调用
   */
  async persistConflicts(conflicts: RuleConflictRecord[]): Promise<void> {
    if (!this.storage) return

    for (const conflict of conflicts) {
      await this.storage.setConfig(
        `conflict:${conflict.category}:${Date.now()}`,
        JSON.stringify({
          category: conflict.category,
          winner: {
            scope: conflict.winnerScope,
            ruleId: conflict.winnerRule.id,
            ruleText: conflict.winnerRule.suggested_rule,
          },
          loser: {
            scope: conflict.loserScope,
            ruleId: conflict.loserRule.id,
            ruleText: conflict.loserRule.suggested_rule,
          },
          resolvedAt: new Date().toISOString(),
        })
      )
    }
  }

  /**
   * 生成注入文本（只包含生效的规则，被覆盖的不注入）
   */
  formatResolvedRules(resolved: ResolvedRuleSet): string {
    const sections: string[] = []
    const byScope = new Map<RuleScope, CoachRecommendation[]>()

    for (const [, scoped] of resolved.activeRules) {
      if (scoped.overridden) continue
      const list = byScope.get(scoped.scope) ?? []
      list.push(scoped.recommendation)
      byScope.set(scoped.scope, list)
    }

    // 按作用域分组输出
    const scopeOrder: RuleScope[] = ['universal', 'agent', 'project']
    const scopeLabels: Record<RuleScope, string> = {
      universal: '## myBad 通用规则（所有项目适用）',
      agent: '## myBad 平台规则',
      project: '## myBad 项目规则',
    }

    for (const scope of scopeOrder) {
      const rules = byScope.get(scope)
      if (rules && rules.length > 0) {
        sections.push(scopeLabels[scope])
        sections.push(...rules.map(r => `- [${r.category}] ${r.suggested_rule}`))
        sections.push('')
      }
    }

    return sections.join('\n')
  }
}
