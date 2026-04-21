/**
 * myBad v2 — 三层作用域合并逻辑
 *
 * 规则按三层作用域组织：项目规则 > Agent 规则 > 通用规则
 * 注入时需要合并三层，冲突时高优先级覆盖低优先级。
 *
 * 三层存储位置：
 * - 项目规则：{project}/.mybad/mybad.db
 * - Agent 规则：~/.mybad/agents/{platform}.db
 * - 通用规则：~/.mybad/universal.db
 */

import type { RuleScope, ScopedRule, ResolvedRuleSet, RuleConflictRecord } from './types'
import { SCOPE_PRIORITY } from './types'
import type { CoachRecommendation } from '../models/coach'

/** 按作用域分组的规则集合 */
export interface ScopedRules {
  project: CoachRecommendation[]
  agent: CoachRecommendation[]
  universal: CoachRecommendation[]
}

/** 合并后的规则条目（用于注入） */
export interface MergedRule {
  category: string
  ruleText: string
  scope: RuleScope
  source: CoachRecommendation
}

/**
 * 三层作用域合并器
 *
 * 职责：将三层规则合并为一个列表，同 category 只保留最高优先级的那条
 */
export class ScopeMerger {
  /**
   * 合并三层规则
   *
   * 合并逻辑：
   * 1. 按 category 分组
   * 2. 同 category 内按优先级选择（project > agent > universal）
   * 3. 记录冲突（被覆盖的规则）
   * 4. 返回合并结果 + 冲突列表
   */
  merge(scopedRules: ScopedRules): { merged: MergedRule[]; conflicts: RuleConflictRecord[] } {
    const conflicts: RuleConflictRecord[] = []

    // 按 category 收集所有规则及其作用域
    const categoryMap = new Map<string, Array<{ rule: CoachRecommendation; scope: RuleScope }>>()

    // 按优先级从低到高放入，后面放的同 category 会覆盖前面的
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

    // 对每个 category 选择最高优先级的规则
    const merged: MergedRule[] = []

    for (const [category, entries] of categoryMap) {
      // 按 scope 优先级排序，最高的排前面
      entries.sort((a, b) => SCOPE_PRIORITY[b.scope] - SCOPE_PRIORITY[a.scope])

      const winner = entries[0]

      merged.push({
        category,
        ruleText: winner.rule.suggested_rule,
        scope: winner.scope,
        source: winner.rule,
      })

      // 记录冲突（被覆盖的规则）
      for (let i = 1; i < entries.length; i++) {
        const loser = entries[i]
        conflicts.push({
          category,
          winnerScope: winner.scope,
          winnerRule: winner.rule,
          loserScope: loser.scope,
          loserRule: loser.rule,
        })
      }
    }

    return { merged, conflicts }
  }

  /**
   * 将合并后的规则格式化为注入文本
   * 按作用域分组展示
   */
  formatMergedRules(merged: MergedRule[]): string {
    if (merged.length === 0) return ''

    // 按作用域分组
    const byScope = new Map<RuleScope, MergedRule[]>()
    for (const rule of merged) {
      const list = byScope.get(rule.scope) ?? []
      list.push(rule)
      byScope.set(rule.scope, list)
    }

    const sections: string[] = []

    // 通用规则
    const universalRules = byScope.get('universal')
    if (universalRules && universalRules.length > 0) {
      sections.push('## myBad 通用规则（所有项目适用）')
      sections.push(...universalRules.map(r => `- ${r.ruleText}`))
      sections.push('')
    }

    // Agent 规则
    const agentRules = byScope.get('agent')
    if (agentRules && agentRules.length > 0) {
      sections.push('## myBad 平台规则')
      sections.push(...agentRules.map(r => `- ${r.ruleText}`))
      sections.push('')
    }

    // 项目规则
    const projectRules = byScope.get('project')
    if (projectRules && projectRules.length > 0) {
      sections.push('## myBad 项目规则')
      sections.push(...projectRules.map(r => `- ${r.ruleText}`))
      sections.push('')
    }

    return sections.join('\n')
  }
}
