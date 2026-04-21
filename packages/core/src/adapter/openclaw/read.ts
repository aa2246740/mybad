/**
 * myBad v2 — OpenClaw 读取适配器
 *
 * OpenClay 的规则读取通过 agent:bootstrap hook 完成。
 * ReadAdapter 负责：
 * 1. 格式化规则文本（hook handler 调用）
 * 2. 格式化 pending 提示
 */

import type { ReadAdapter, RuleScope } from '../types'
import type { CoachRecommendation } from '../../models/coach'

export class OpenClawRead implements ReadAdapter {
  name = 'openclaw-read'

  formatRulesForContext(
    rules: string[],
    scope?: RuleScope | 'all',
  ): string {
    if (rules.length === 0) return ''

    return [
      '## myBad 已应用规则（自动注入）',
      '以下规则来自你的历史纠正记录，请严格遵守：',
      '',
      ...rules.map(r => `- ${r}`),
    ].join('\n')
  }

  formatPendingForContext(pending: CoachRecommendation[]): string {
    if (pending.length === 0) return ''

    return [
      '## myBad 待确认建议',
      ...pending.map(p =>
        `- 你对 "${p.category}" 纠正了 ${p.correction_count} 次，建议写入规则：${p.suggested_rule}。对吗？`
      ),
    ].join('\n')
  }
}
