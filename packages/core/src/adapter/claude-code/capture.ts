/**
 * myBad v2 — Claude Code 捕获适配器
 *
 * 核心策略：静态指令焊进 CLAUDE.md，不依赖 Skill 按需加载。
 *
 * CLAUDE.md 是 Claude Code 唯一"每次 session 强制加载"的文件。
 * 把纠正检测触发词焊进 CLAUDE.md，保证：
 * - 用户发消息纠正时 Agent 知道调用 correction_capture
 * - 即使 Skill 没被加载，纠正检测仍然生效
 * - MCP server 挂了，Agent 会提示用户
 *
 * 这段文本大约 150 token，不会造成 CLAUDE.md 膨胀。
 */

import type { CaptureAdapter, AgentPlatform } from '../types'

export class ClaudeCodeCapture implements CaptureAdapter {
  name = 'claude-code-capture'
  platform: AgentPlatform = 'claude-code'

  /**
   * 生成纠正检测指令（注入 CLAUDE.md 的静态部分）
   *
   * 这段文本告诉 Agent：
   * 1. 什么时候该调用 correction_capture
   * 2. 参数怎么填
   * 3. MCP 挂了怎么办
   */
  getCaptureInstructions(): string {
    return `## myBad 纠正检测
当用户说"不对"、"错了"、"应该是X"、"用Y不用Z"、"改成"、"记下来"时：
1. 调用 MCP 工具 correction_capture
2. 参数：category(自判英文蛇形命名)、trigger_type(L1否定/L2修正/L3追问/L4拒绝/manual手动)、ai_misunderstanding(你理解成了什么)、user_correction(用户纠正原话)
3. 如果 recurrence_count > 1，告知用户"这个错误重复出现了N次"
4. 如果 MCP 调用失败，提示用户："myBad MCP server 未运行，请运行 mybad start"`
  }

  /**
   * 生成启动检查指令（注入 CLAUDE.md 的兜底部分）
   *
   * 正常情况下 SessionStart Hook 会注入规则。
   * 这段是兜底：万一 Hook 配置出问题，Agent 仍知道要检查 pending。
   */
  getStartupInstructions(): string {
    return `## myBad 启动兜底
如果看到 myBad 规则已注入，遵守它们。如果未看到注入，手动调用 correction_coach_applied 获取已应用规则并遵守。`
  }

  /**
   * 生成完整的 CLAUDE.md 注入文本块
   * 由 `mybad init` 时写入 CLAUDE.md
   */
  getCLAUDEMDInjection(): string {
    return [
      '<!-- mybad:instructions START -->',
      this.getCaptureInstructions(),
      '',
      this.getStartupInstructions(),
      '<!-- mybad:instructions END -->',
    ].join('\n')
  }
}
