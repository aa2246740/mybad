/**
 * myBad v2 — Claude Code 读取适配器（Hook 版）
 *
 * Claude Code 的规则读取主要由 Hook 完成：
 * - SessionStart Hook：cat .mybad/session-inject.md → stdout → 注入 Agent 上下文
 * - PostCompact Hook：上下文压缩后重新注入
 *
 * ReadAdapter 只在 Agent 主动调用 MCP 工具时使用（如 correction_coach_applied）。
 */

import type { ReadAdapter, RuleScope } from '../types'
import type { CoachRecommendation } from '../../models/coach'

export class ClaudeCodeRead implements ReadAdapter {
  name = 'claude-code-read'

  /**
   * 格式化规则文本（MCP 工具返回时使用）
   *
   * @param rules 规则文本列表
   * @param scope 作用域（用于分组展示）
   */
  formatRulesForContext(
    rules: string[],
    scope?: RuleScope | 'all',
  ): string {
    if (rules.length === 0) return '暂无已应用的 myBad 规则。'

    const scopeLabel: Record<string, string> = {
      universal: '通用规则',
      agent: '平台规则',
      project: '项目规则',
      all: '全部规则',
    }

    const label = scopeLabel[scope ?? 'all'] ?? '规则'

    return [
      `## myBad ${label}（请严格遵守）`,
      ...rules.map(r => `- ${r}`),
    ].join('\n')
  }

  /**
   * 格式化 pending 推荐提示
   * 当有 pending 推荐时，这段文本被注入让 Agent 提醒用户确认
   */
  formatPendingForContext(pending: CoachRecommendation[]): string {
    if (pending.length === 0) return ''

    return pending.map(p =>
      `之前你对 [${p.category}] 纠正了 ${p.correction_count} 次，Coach 建议：\n"${p.suggested_rule}"\n准备写入规则。你觉得对吗？`
    ).join('\n\n')
  }
}
