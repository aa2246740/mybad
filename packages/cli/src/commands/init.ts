/**
 * mybad init — 一键安装命令
 *
 * 根据指定的 Agent 平台自动配置：
 * - Claude Code: Hook + CLAUDE.md 双保险
 * - OpenClaw: agent:bootstrap hook
 * - Hermes: Skill 文件 + setup 消息生成
 * - auto: 自动检测当前环境
 */

import { Command } from 'commander'
import * as path from 'path'
import * as fs from 'fs/promises'
import {
  ClaudeCodeCapture,
  ClaudeCodeWrite,
  ClaudeCodeRead,
  ClaudeCodeHookInstaller,
  OpenClawCapture,
  OpenClawWrite,
  OpenClawRead,
  HermesCapture,
  HermesWrite,
  HermesRead,
  AdapterRegistry,
} from '@mybad/core'
import type { AgentPlatform } from '@mybad/core'

/** 自动检测当前 Agent 平台 */
async function detectPlatform(): Promise<AgentPlatform> {
  // 检测 Claude Code：存在 .claude/settings.json 或 CLAUDE.md
  try {
    await fs.access('.claude/settings.json')
    return 'claude-code'
  } catch { /* not found */ }

  try {
    await fs.access('CLAUDE.md')
    return 'claude-code'
  } catch { /* not found */ }

  // 检测 OpenClaw：存在 openclaw.json
  try {
    await fs.access('openclaw.json')
    return 'openclaw'
  } catch { /* not found */ }

  // 检测 Hermes：存在 .hermes/ 目录
  const hermesDir = path.join(process.env.HOME ?? '~', '.hermes')
  try {
    await fs.access(hermesDir)
    return 'hermes'
  } catch { /* not found */ }

  return 'generic'
}

/** Claude Code 安装 */
async function initClaudeCode(projectRoot: string): Promise<void> {
  console.log('🔧 正在初始化 myBad for Claude Code...')

  const installer = new ClaudeCodeHookInstaller()
  const result = await installer.install(projectRoot)

  if (result.hooksRegistered.length > 0) {
    console.log(`  ✅ Hook 注册成功: ${result.hooksRegistered.join(', ')}`)
    console.log(`     配置文件: ${result.settingsPath}`)
  }

  if (result.sessionInjectCreated) {
    console.log('  ✅ 创建 .mybad/session-inject.md')
  }

  if (result.claudeMdUpdated) {
    console.log('  ✅ 注入 CLAUDE.md 静态指令（纠正检测 + 兜底）')
  }

  if (result.gitignoreUpdated) {
    console.log('  ✅ 更新 .gitignore（安全防护）')
  }

  console.log('')
  console.log('MCP Server 配置：请确保 ~/.claude/settings.json 中包含：')
  console.log(JSON.stringify({
    mcpServers: {
      mybad: {
        command: 'npx',
        args: ['@mybad/mcp-server'],
        env: { MYBAD_DB_PATH: path.join(projectRoot, '.mybad/mybad.db'), MYBAD_PLATFORM: 'claude-code' },
      },
    },
  }, null, 2))
  console.log('')
  console.log('🎉 Claude Code myBad 安装完成！')
  console.log('   四层防线已就位：CLAUDE.md（静态）→ SessionStart Hook → PostCompact Hook → PreToolUse Hook')
}

/** OpenClaw 安装 */
async function initOpenClaw(projectRoot: string): Promise<void> {
  console.log('🔧 正在初始化 myBad for OpenClaw...')

  const capture = new OpenClawCapture()
  const write = new OpenClawWrite()

  // 创建 .mybad 目录结构
  await fs.mkdir(path.join(projectRoot, '.mybad/rules'), { recursive: true })

  // 写入纠正检测指令文件（hook 读取）
  await fs.writeFile(
    path.join(projectRoot, '.mybad/capture-instructions.md'),
    capture.getCaptureInstructionsFile(),
    'utf-8',
  )
  console.log('  ✅ 创建 .mybad/capture-instructions.md（纠正检测指令）')

  // 创建空的 rules.md 和 pending.md
  await fs.writeFile(path.join(projectRoot, '.mybad/rules.md'), '# 无已应用规则', 'utf-8')
  await fs.writeFile(path.join(projectRoot, '.mybad/pending.md'), '# 无待确认推荐', 'utf-8')
  console.log('  ✅ 创建 .mybad/rules.md + pending.md')

  // 更新 .gitignore
  const gitignorePath = path.join(projectRoot, '.gitignore')
  let gitignoreContent = ''
  try {
    gitignoreContent = await fs.readFile(gitignorePath, 'utf-8')
  } catch { /* 不存在 */ }
  if (!gitignoreContent.includes('.mybad/')) {
    await fs.writeFile(gitignorePath, gitignoreContent.trimEnd() + '\n.mybad/\n', 'utf-8')
    console.log('  ✅ 更新 .gitignore')
  }

  // 提示 hook 部署
  console.log('')
  console.log('📂 请将以下 hook handler 复制到 ~/.openclaw/hooks/mybad/：')
  console.log('   - handler.ts')
  console.log('   - HOOK.md')
  console.log('   - package.json')
  console.log('   源文件位置: node_modules/@mybad/core/dist/adapter/openclaw/hook/')
  console.log('')
  console.log('🎉 OpenClaw myBad 安装完成！')
}

/** Hermes 安装 */
async function initHermes(projectRoot: string): Promise<void> {
  console.log('🔧 正在初始化 myBad for Hermes...')

  const capture = new HermesCapture()

  // 生成 setup 消息
  const setupMessage = capture.generateSetupMessage()

  console.log('  ✅ 已生成 setup 消息')
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('请将以下消息发送给 Hermes Agent：')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(setupMessage)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('💡 Hermes 会自动将纠正检测指令保存到 MEMORY.md（每次 session 注入）')
  console.log('')
  console.log('MCP Server 配置：请在 Hermes 配置中添加 myBad MCP server。')
  console.log('')
  console.log('🎉 Hermes myBad 安装完成！')
}

export function makeInitCommand(): Command {
  return new Command('init')
    .description('初始化 myBad（一键安装适配当前 Agent 平台）')
    .option('-p, --platform <platform>', '指定平台 (claude-code|openclaw|hermes|auto)', 'auto')
    .option('--skip-claude-md', '跳过 CLAUDE.md 注入')
    .option('--skip-gitignore', '跳过 .gitignore 更新')
    .action(async (opts) => {
      const projectRoot = process.cwd()
      let platform: string = opts.platform

      if (platform === 'auto') {
        platform = await detectPlatform()
        console.log(`🔍 检测到平台: ${platform}`)
        if (platform === 'generic' || platform === 'auto') {
          console.log('⚠️  无法自动检测平台，请用 --platform 指定')
          process.exit(1)
        }
      }

      switch (platform) {
        case 'claude-code':
          await initClaudeCode(projectRoot)
          break
        case 'openclaw':
          await initOpenClaw(projectRoot)
          break
        case 'hermes':
          await initHermes(projectRoot)
          break
        default:
          console.log(`⚠️  不支持的平台: ${platform}`)
          process.exit(1)
      }
    })
}
