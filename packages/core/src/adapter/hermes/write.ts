/**
 * myBad v2 — Hermes 写入适配器（Skill + MEMORY.md 双写策略）
 *
 * 核心决策：myBad 永远不直接写 MEMORY.md 文件。
 * 所有 MEMORY.md 的写入都由 Hermes Agent 自己完成。
 *
 * 原因：
 * - Hermes 自己管理 MEMORY.md（通过 memory 工具 add/replace/remove）
 * - 如果 myBad 直接写文件，Hermes 可能在 periodic nudge 时清理掉
 * - 如果 Hermes Agent 自己调用 memory 工具保存，它认为重要，不会删
 *
 * 双写策略：
 * 1. MEMORY.md（主要）：每次 session 自动注入，保证规则一定被看到。但有 2,200 字符限制。
 * 2. Skill 文件（辅助）：存放详细规则和上下文，Agent 在相关任务时可以查看。
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import type { WriteAdapter, WriteResult, RuleScope } from '../types'
import type { CoachRecommendation, CoachTarget } from '../../models/coach'

/** MEMORY.md 中 myBad 区段的最大字符数 */
const MYBAD_MEMORY_BUDGET = 500

export class HermesWrite implements WriteAdapter {
  name = 'hermes-write'
  supportedTargetTypes = ['MEMORY.md', 'hermes-skill', 'skill']

  /**
   * 双写：生成 Skill 文件 + 返回 MEMORY.md 写入指令
   *
   * 注意：MEMORY.md 的写入不由这个方法直接执行，
   * 而是返回指令让 Hermes Agent 自己通过 memory 工具保存。
   */
  async writeRule(recommendation: CoachRecommendation, scope?: RuleScope): Promise<WriteResult> {
    // 策略 1：生成 Hermes Skill 文件（详细版）
    const skillContent = this.generateHermesSkill(recommendation)
    const skillDir = path.join(
      os.homedir(),
      `.hermes/skills/mybad/mybad-${recommendation.category}`
    )
    const skillPath = path.join(skillDir, 'SKILL.md')

    try {
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(skillPath, skillContent, 'utf-8')

      return {
        success: true,
        targetPath: skillPath,
      }
    } catch (error: any) {
      return { success: false, targetPath: skillPath, error: error.message }
    }
  }

  async removeRule(category: string): Promise<boolean> {
    const skillDir = path.join(os.homedir(), `.hermes/skills/mybad/mybad-${category}`)
    try {
      await fs.rm(skillDir, { recursive: true, force: true })
      return true
    } catch {
      return false
    }
  }

  async scanTargets(projectRoot: string): Promise<CoachTarget[]> {
    const targets: CoachTarget[] = []

    // 检查 MEMORY.md
    const memoryPath = path.join(os.homedir(), '.hermes/memories/MEMORY.md')
    try {
      await fs.access(memoryPath)
      targets.push({
        type: 'memory',
        path: memoryPath,
        description: 'Hermes MEMORY.md（每次 session 自动注入）',
      })
    } catch { /* 不存在 */ }

    return targets
  }

  /**
   * 生成 Hermes 原生 Skill 文件
   *
   * ⚠️ 没有 trigger 字段！用 description 让 Agent 在 skills_list 中判断相关性
   */
  private generateHermesSkill(rec: CoachRecommendation): string {
    const triggerDesc = this.deriveTriggerDescription(rec.category)

    const frontmatter = [
      '---',
      `name: mybad-${rec.category}`,
      `description: "myBad 纠错规则：${triggerDesc}。当遇到 ${rec.category} 相关任务时加载此规则。"`,
      `version: 1.0.0`,
      `metadata:`,
      `  hermes:`,
      `    tags: [mybad, ${rec.category}]`,
      `    category: mybad`,
      '---',
    ].join('\n')

    const body = [
      `# myBad 规则：${rec.category}`,
      '',
      `## 教训来源`,
      `- 同类错误 ${rec.correction_count} 次`,
      `- 明确度：${rec.clarity}`,
      '',
      `## 规则`,
      rec.suggested_rule.replace(`[mybad:${rec.category}] `, ''),
      '',
      `## 背景`,
      rec.pattern_summary,
      '',
      `<!-- mybad:meta category=${rec.category} count=${rec.correction_count} -->`,
    ].join('\n')

    return frontmatter + '\n' + body
  }

  /**
   * 从 category 推导触发描述
   * 写入 Skill description，让 Agent 在 skills_list 中能识别相关性
   */
  private deriveTriggerDescription(category: string): string {
    const keywordMap: Record<string, string> = {
      'api_params': 'API 调用 / API 参数 / API request',
      'api_auth': '认证 / auth / token / 登录',
      'data_dedup': '去重 / dedup / unique / Set',
      'data_fetch': 'fetch / 请求数据 / HTTP / response',
      'format_json': 'JSON / 格式化 / 输出格式',
      'format_markdown': 'Markdown / md / 文档格式',
      'code_naming': '变量命名 / 命名规范 / naming',
    }
    return keywordMap[category] ?? `${category} / 相关任务`
  }

  /**
   * 生成 MEMORY.md 写入指令
   * 返回的文本交给 Hermes Agent，让它自己通过 memory 工具保存
   */
  generateMemorySaveInstruction(rule: string): string {
    return `myBad Coach 生成了一条新规则，请用 memory 工具保存到 memory 中：\n"${rule}"`
  }

  /**
   * 检查 MEMORY.md 空间是否足够
   * myBad 区段占用不超过 MYBAD_MEMORY_BUDGET 字符
   */
  async checkMemoryBudget(): Promise<{ available: number; used: number }> {
    const memoryPath = path.join(os.homedir(), '.hermes/memories/MEMORY.md')

    try {
      const content = await fs.readFile(memoryPath, 'utf-8')
      const totalSize = content.length

      // 估算 myBad 区段大小
      const marker = 'myBad纠正检测'
      const mybadStart = content.indexOf(marker)
      let used = 0
      if (mybadStart >= 0) {
        // 粗略估算：从 myBad 标记到下一段
        const nextSection = content.indexOf('\n\n', mybadStart + 100)
        used = nextSection > 0 ? nextSection - mybadStart : content.length - mybadStart
      }

      return {
        available: Math.max(0, 2200 - totalSize),
        used,
      }
    } catch {
      return { available: 2200, used: 0 }
    }
  }
}
