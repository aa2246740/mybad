/**
 * myBad v2 — Hermes 读取适配器
 *
 * Hermes 的规则通过两种方式进入上下文：
 * 1. Skill 文件 — 相关上下文时 Agent 主动加载
 * 2. MEMORY.md — session 启动时自动注入
 *
 * ReadAdapter 只在 Agent 主动调用 MCP 工具时使用。
 */

import type { ReadAdapter, RuleScope } from '../types'
import type { CoachRecommendation } from '../../models/coach'

export class HermesRead implements ReadAdapter {
  name = 'hermes-read'

  formatRulesForContext(
    rules: string[],
    scope?: RuleScope | 'all',
  ): string {
    if (rules.length === 0) return ''

    return rules.map(r => `- ${r}`).join('\n')
  }

  formatPendingForContext(pending: CoachRecommendation[]): string {
    if (pending.length === 0) return ''

    return pending.map(p =>
      `你之前对 "${p.category}" 纠正了 ${p.correction_count} 次。Coach 建议写入规则：\n"${p.suggested_rule}"\n对吗？`
    ).join('\n\n')
  }
}
