/**
 * myBad v2 — OpenClaw agent:bootstrap hook handler
 *
 * 在每次 OpenClaw session 启动时自动触发，将 myBad 规则和纠正检测指令
 * 注入到 Agent 的 bootstrapFiles 中。
 *
 * 部署位置：~/.openclaw/hooks/mybad/handler.ts
 *
 * 重要：只读文件，不读 SQLite（hook 运行时 MCP server 可能没启动）
 */

import * as fs from 'fs/promises'

/** OpenClaw hook 事件结构 */
interface OpenClawEvent {
  type: string
  context: {
    bootstrapFiles: Array<{
      path: string
      content: string
    }>
  }
}

/**
 * agent:bootstrap hook handler
 *
 * 读取三个文件并注入到 bootstrapFiles：
 * 1. .mybad/capture-instructions.md — 纠正检测指令
 * 2. .mybad/rules.md — 已应用规则
 * 3. .mybad/pending.md — 待确认推荐
 */
export async function handler(event: OpenClawEvent): Promise<void> {
  if (event.type !== 'agent:bootstrap') return

  let injectContent = ''

  // 1. 读取纠正检测指令（安装时写入的固定文件）
  try {
    const captureInstructions = await fs.readFile('.mybad/capture-instructions.md', 'utf-8')
    if (captureInstructions.trim()) {
      injectContent += captureInstructions + '\n\n'
    }
  } catch { /* 文件不存在，跳过 */ }

  // 2. 读取已应用规则文件
  try {
    const rules = await fs.readFile('.mybad/rules.md', 'utf-8')
    if (rules.trim() && !rules.startsWith('# 无')) {
      injectContent += '## myBad 已应用规则（自动注入）\n' + rules + '\n\n'
    }
  } catch { /* 文件不存在，跳过 */ }

  // 3. 读取 pending 推荐文件
  try {
    const pending = await fs.readFile('.mybad/pending.md', 'utf-8')
    if (pending.trim() && !pending.startsWith('# 无')) {
      injectContent += '## myBad 待确认建议\n' + pending
    }
  } catch { /* 文件不存在，跳过 */ }

  // 4. 注入到 bootstrapFiles
  if (injectContent.trim()) {
    event.context.bootstrapFiles.push({
      path: '.mybad/session-inject.md',
      content: injectContent,
    })
  }
}
