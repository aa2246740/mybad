/**
 * myBad v2 — OpenClaw 写入适配器
 *
 * 核心策略：Coach 写文件，hook 读文件。
 *
 * 为什么不直接读 SQLite？
 * - hook 在 Agent 启动前运行，此时 MCP server 可能没启动
 * - 文件读取零依赖、轻量、hook 不需要 better-sqlite3
 * - 即使 MCP server 挂了，hook 照常工作
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { WriteAdapter, WriteResult, RuleScope } from '../types'
import type { CoachRecommendation, CoachTarget } from '../../models/coach'

export class OpenClawWrite implements WriteAdapter {
  name = 'openclaw-write'
  supportedTargetTypes = ['file', 'bootstrap']

  async writeRule(recommendation: CoachRecommendation, scope?: RuleScope): Promise<WriteResult> {
    // 写入规则文件（hook 读取）
    const rulesDir = '.mybad/rules'
    const rulePath = path.join(rulesDir, `${recommendation.category}.md`)

    try {
      await fs.mkdir(rulesDir, { recursive: true })
      await fs.writeFile(rulePath, recommendation.suggested_rule, 'utf-8')
      return { success: true, targetPath: rulePath }
    } catch (error: any) {
      return { success: false, targetPath: rulePath, error: error.message }
    }
  }

  async removeRule(category: string): Promise<boolean> {
    const rulePath = path.join('.mybad/rules', `${category}.md`)
    try {
      await fs.unlink(rulePath)
      return true
    } catch {
      return false
    }
  }

  async scanTargets(projectRoot: string): Promise<CoachTarget[]> {
    return []
  }

  /**
   * 同步所有已应用规则和 pending 到文件
   * 在 Coach 分析完成后调用
   *
   * @param appliedRules 已应用的规则文本列表
   * @param pending pending 推荐列表
   */
  async syncRulesToFiles(
    appliedRules: string[],
    pending: CoachRecommendation[],
  ): Promise<void> {
    // 写已应用规则
    await fs.mkdir('.mybad', { recursive: true })
    await fs.writeFile('.mybad/rules.md', appliedRules.join('\n') || '# 无已应用规则', 'utf-8')

    // 写 pending 推荐
    const pendingContent = pending.map(p =>
      `- [${p.category}] ${p.suggested_rule} (${p.correction_count}次)`
    ).join('\n')
    await fs.writeFile('.mybad/pending.md', pendingContent || '# 无待确认推荐', 'utf-8')
  }
}
