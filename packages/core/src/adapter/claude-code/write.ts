/**
 * myBad v2 — Claude Code 写入适配器（Hook 版）
 *
 * 核心策略：Coach 不直接写 CLAUDE.md，改为写 .mybad/session-inject.md。
 *
 * 为什么？
 * 1. CLAUDE.md 是静态的 — 不能按项目筛选规则
 * 2. CLAUDE.md 会膨胀 — 混入动态规则后越来越长
 * 3. 上下文压缩后丢失 — CLAUDE.md 内容被压缩后没有恢复机制
 *
 * 改进：
 * - 动态规则 → .mybad/session-inject.md（Hook 读取注入）
 * - 静态指令 → CLAUDE.md（~150 token，不膨胀）
 * - Hook 注入 → SessionStart + PostCompact 保证加载和压缩恢复
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { WriteAdapter, WriteResult, RuleScope } from '../types'
import type { CoachRecommendation, CoachTarget } from '../../models/coach'

/** session-inject.md 中的规则条目 */
interface RuleEntry {
  rule: string
  count: number
  status: string
  scope?: RuleScope
  updatedAt: string
}

export class ClaudeCodeWrite implements WriteAdapter {
  name = 'claude-code-write'
  supportedTargetTypes = ['session-inject', 'CLAUDE.md', 'skill', 'SOP', 'workflow']

  /**
   * 将 Coach 推荐写入 .mybad/session-inject.md
   *
   * 写入流程：
   * 1. 读取现有 session-inject.md
   * 2. 解析已有规则
   * 3. 添加/更新规则
   * 4. 重新生成文件（带 hash 签名）
   */
  async writeRule(recommendation: CoachRecommendation, scope?: RuleScope): Promise<WriteResult> {
    const injectPath = '.mybad/session-inject.md'

    try {
      // 读取现有内容
      let existing = ''
      try {
        existing = await fs.readFile(injectPath, 'utf-8')
      } catch {
        // 文件不存在，首次写入
      }

      // 解析现有规则
      const rules = this.parseRulesFromInject(existing)

      // 添加/更新规则
      rules[recommendation.category] = {
        rule: recommendation.suggested_rule,
        count: recommendation.correction_count,
        status: recommendation.status,
        scope: scope ?? 'project',
        updatedAt: new Date().toISOString(),
      }

      // 重新生成 session-inject.md（带 hash 签名）
      const content = this.generateSessionInject(rules)
      const signed = this.signContent(content)

      // 确保 .mybad 目录存在
      await fs.mkdir(path.dirname(injectPath), { recursive: true })
      await fs.writeFile(injectPath, signed, 'utf-8')

      return { success: true, targetPath: injectPath }
    } catch (error: any) {
      return { success: false, targetPath: injectPath, error: error.message }
    }
  }

  /**
   * 从目标中移除规则（归档/降级时使用）
   */
  async removeRule(category: string): Promise<boolean> {
    const injectPath = '.mybad/session-inject.md'

    try {
      let existing = ''
      try {
        existing = await fs.readFile(injectPath, 'utf-8')
      } catch {
        return false
      }

      const rules = this.parseRulesFromInject(existing)
      if (!(category in rules)) return false

      delete rules[category]

      const content = this.generateSessionInject(rules)
      const signed = this.signContent(content)
      await fs.writeFile(injectPath, signed, 'utf-8')

      return true
    } catch {
      return false
    }
  }

  /**
   * 扫描当前环境，返回可用的目标文件列表
   */
  async scanTargets(projectRoot: string): Promise<CoachTarget[]> {
    const targets: CoachTarget[] = []

    // 扫描 CLAUDE.md
    try {
      await fs.access(path.join(projectRoot, 'CLAUDE.md'))
      targets.push({
        type: 'CLAUDE.md',
        path: 'CLAUDE.md',
        description: 'Claude Code 系统指令文件（每次 session 加载）',
      })
    } catch { /* 不存在 */ }

    // 扫描 .mybad/session-inject.md
    try {
      await fs.access(path.join(projectRoot, '.mybad/session-inject.md'))
      targets.push({
        type: 'skill',
        path: '.mybad/session-inject.md',
        description: 'myBad 动态规则注入文件（Hook 读取）',
      })
    } catch { /* 不存在 */ }

    return targets
  }

  /**
   * 生成 Hook 读取的 session-inject.md 内容
   */
  private generateSessionInject(rules: Record<string, RuleEntry>): string {
    // 按作用域分组
    const appliedRules = Object.entries(rules)
      .filter(([_, r]) => r.status === 'auto_applied' || r.status === 'confirmed')
      .sort(([_, a], [__, b]) => {
        // project > agent > universal
        const order = { project: 0, agent: 1, universal: 2 }
        return (order[a.scope ?? 'project'] ?? 0) - (order[b.scope ?? 'project'] ?? 0)
      })
      .map(([cat, r]) => `- [${cat}] ${r.rule}  (${r.count}次纠正)`)

    const pendingRules = Object.entries(rules)
      .filter(([_, r]) => r.status === 'pending')
      .map(([cat, r]) => `- [${cat}] 你纠正了${r.count}次，Coach建议："${r.rule}"。对吗？`)

    const sections: string[] = []

    if (appliedRules.length > 0) {
      sections.push(
        '## myBad 已应用规则（请严格遵守）',
        ...appliedRules,
        '',
      )
    }

    if (pendingRules.length > 0) {
      sections.push(
        '## myBad 待确认建议',
        ...pendingRules,
        '',
      )
    }

    return sections.join('\n')
  }

  /**
   * 解析 session-inject.md 中的现有规则
   */
  private parseRulesFromInject(content: string): Record<string, RuleEntry> {
    const rules: Record<string, RuleEntry> = {}

    // 跳过 hash 签名行
    const cleanContent = content.replace(/<!-- mybad:hash:[a-f0-9]+ -->\n?/, '')

    // 匹配规则行：- [category] rule text (N次纠正)
    const ruleRegex = /^- \[([^\]]+)\] (.+?)\s+\((\d+)次纠正\)$/gm
    let match: RegExpExecArray | null
    while ((match = ruleRegex.exec(cleanContent)) !== null) {
      rules[match[1]] = {
        rule: match[2].trim(),
        count: parseInt(match[3], 10),
        status: 'auto_applied',
        updatedAt: new Date().toISOString(),
      }
    }

    // 匹配 pending 行
    const pendingRegex = /^- \[([^\]]+)\] 你纠正了(\d+)次，Coach建议："(.+?)"。对吗？$/gm
    while ((match = pendingRegex.exec(cleanContent)) !== null) {
      rules[match[1]] = {
        rule: match[3],
        count: parseInt(match[2], 10),
        status: 'pending',
        updatedAt: new Date().toISOString(),
      }
    }

    return rules
  }

  /**
   * 用 SHA256 签名内容，防止篡改
   * 写入时签名，Hook 读取时验证
   */
  private signContent(content: string): string {
    const crypto = require('crypto')
    const hash = crypto.createHash('sha256').update(content).digest('hex')
    return `<!-- mybad:hash:${hash} -->\n${content}`
  }
}
