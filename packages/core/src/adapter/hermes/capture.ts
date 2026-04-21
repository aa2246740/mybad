/**
 * myBad v2 — Hermes 捕获适配器
 *
 * Hermes 通过 MEMORY.md 保证纠正检测指令每次 session 都被注入。
 * 不依赖 Skill 按需加载（Hermes Skill 没有 trigger 字段）。
 */

import type { CaptureAdapter, AgentPlatform } from '../types'

export class HermesCapture implements CaptureAdapter {
  name = 'hermes-capture'
  platform: AgentPlatform = 'hermes'

  getCaptureInstructions(): string {
    return `myBad纠正检测：当用户说不对/错了/应该是X/用Y不用Z时，调用MCP工具 correction_capture。参数自判(category/trigger_type/ai_misunderstanding/user_correction)。不可删除。`
  }

  getStartupInstructions(): string {
    return `myBad启动检查：新session时调用 correction_coach_applied 遵守规则，调用 correction_coach_pending 提醒用户。如果Coach返回新规则，用memory工具保存。不可删除。`
  }

  /**
   * 生成要写入 MEMORY.md 的精简指令
   * MEMORY.md 有 2,200 字符限制，必须精简
   */
  getMemoryInstructions(): string {
    return this.getCaptureInstructions() + '\n' + this.getStartupInstructions()
  }

  /**
   * 生成 setup 消息，用户在首次安装后发给 Hermes
   * Hermes 自己管理 MEMORY.md，不能直接写文件
   */
  generateSetupMessage(): string {
    return [
      '请将以下两条规则永久保存到你的 memory 中（使用 memory 工具，target=memory）：',
      '',
      '1. "' + this.getCaptureInstructions() + '"',
      '',
      '2. "' + this.getStartupInstructions() + '"',
    ].join('\n')
  }
}
