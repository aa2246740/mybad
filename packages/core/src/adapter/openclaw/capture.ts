/**
 * myBad v2 — OpenClaw 捕获适配器
 *
 * OpenClaw 没有 CLAUDE.md，纠正检测指令通过 agent:bootstrap hook 注入。
 * Hook 在每次 session 启动时触发，将纠正检测指令推入 bootstrapFiles。
 */

import type { CaptureAdapter, AgentPlatform } from '../types'

export class OpenClawCapture implements CaptureAdapter {
  name = 'openclaw-capture'
  platform: AgentPlatform = 'openclaw'

  getCaptureInstructions(): string {
    return `## myBad 纠正检测
当检测到用户纠正信号时，调用 MCP 工具 correction_capture：
- 显式否定："不对"、"错了"、"不是这个" → trigger_type=L1
- 显式修正："改成X"、"应该是Y"、"用url不用title" → trigger_type=L2
- 手动指令："记下来"、"mybad记一下" → trigger_type=manual

参数说明：
- category: 自行判断的错误分类（英文蛇形命名）
- ai_misunderstanding: 你理解成了什么
- user_correction: 用户纠正原话
- user_intent: 用户实际要什么`
  }

  getStartupInstructions(): string {
    return `## myBad 启动检查
1. 调用 correction_coach_applied → 获取已应用规则，遵守
2. 调用 correction_coach_pending → 如有待确认，提醒用户`
  }

  /** 生成要写入 .mybad/capture-instructions.md 的内容 */
  getCaptureInstructionsFile(): string {
    return this.getCaptureInstructions() + '\n\n' + this.getStartupInstructions()
  }
}
