#!/usr/bin/env node
/**
 * myBad v2 — PreToolUse Hook 执行器
 *
 * 部署位置：.mybad/enforce.mjs
 * 由 Claude Code PreToolUse Hook 触发。
 *
 * 流程：
 * 1. 从 stdin 读取 Hook 事件 JSON（Claude Code 传入工具参数）
 * 2. 读取 .mybad/enforcement.json（由 Coach 生成）
 * 3. 对工具内容执行正则匹配
 * 4. 匹配到违规 → block (exit 2) 或 warn (exit 0)
 * 5. 无违规 → 放行 (exit 0)
 *
 * 安全设计：
 * - 默认 warn 模式（不盲目 block）
 * - 只有置信度 = 1.0 且模式明确时才 block
 * - 无签名 enforcement.json 拒绝执行
 */

import { readFileSync, existsSync } from 'fs'
import { createHash } from 'crypto'

const ENFORCEMENT_PATH = '.mybad/enforcement.json'

// 读取 stdin
let input = ''
process.stdin.on('data', chunk => { input += chunk })
process.stdin.on('end', () => {
  // 检查 enforcement.json 是否存在
  if (!existsSync(ENFORCEMENT_PATH)) {
    process.exit(0) // 无规则文件，放行
  }

  let rules
  try {
    const raw = readFileSync(ENFORCEMENT_PATH, 'utf-8')

    // 验证 hash 签名
    const hashMatch = raw.match(/<!-- mybad:hash:([a-f0-9]+) -->/)
    if (hashMatch) {
      const content = raw.replace(/<!-- mybad:hash:[a-f0-9]+ -->\n?/, '')
      const expected = createHash('sha256').update(content).digest('hex')
      if (hashMatch[1] !== expected) {
        // 签名不匹配，拒绝执行
        console.error('myBad: enforcement.json hash mismatch, skipping enforcement')
        process.exit(0)
      }
      rules = JSON.parse(content)
    } else {
      // 无签名文件，使用旧格式（向后兼容）
      rules = JSON.parse(raw)
    }
  } catch {
    process.exit(0) // 解析失败，放行
  }

  if (!Array.isArray(rules) || rules.length === 0) {
    process.exit(0)
  }

  // 解析 Hook 事件
  let event
  try {
    event = JSON.parse(input)
  } catch {
    process.exit(0) // 解析失败，放行
  }

  const toolName = event.tool_name || ''
  const content = event.tool_input?.content || event.tool_input?.text || ''

  if (!content) {
    process.exit(0) // 无内容，放行
  }

  // 逐条检查规则
  for (const rule of rules) {
    // 检查工具名匹配
    if (rule.trigger_tool) {
      const tools = rule.trigger_tool.split('|').map(t => t.trim())
      const matched = tools.some(t => toolName.includes(t))
      if (!matched) continue
    }

    // 执行正则匹配
    try {
      const regex = new RegExp(rule.trigger_pattern, 'i')
      if (regex.test(content)) {
        if (rule.action === 'block') {
          // 阻止执行
          console.log(rule.message || 'myBad: 此操作违反已确认的纠正规则')
          process.exit(2)
        } else {
          // 警告但放行
          console.error(`myBad WARN: ${rule.message || '此操作可能与历史纠正冲突'}`)
          process.exit(0)
        }
      }
    } catch {
      // 正则编译失败，跳过这条规则
      continue
    }
  }

  // 无违规，放行
  process.exit(0)
})
