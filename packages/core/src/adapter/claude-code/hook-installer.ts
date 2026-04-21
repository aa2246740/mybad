/**
 * myBad v2 — Claude Code Hook 安装器
 *
 * 负责在 `mybad init --platform claude-code` 时：
 * 1. 写入 .claude/settings.json（项目级）：SessionStart + PostCompact hooks
 * 2. 创建 .mybad/session-inject.md（空文件）
 * 3. 注入 CLAUDE.md 静态指令（纠正检测 + 兜底）
 * 4. 更新 .gitignore（安全防护）
 *
 * Hook 配置格式：
 * - SessionStart: session 启动时触发，stdout 内容直接注入 Agent 上下文
 * - PostCompact: 上下文压缩后触发，重新注入被压缩掉的规则
 * - PreToolUse: 工具执行前拦截，确定性强制执行（Phase 5.5）
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { ClaudeCodeCapture } from './capture'

/** Hook 配置接口 */
interface HookConfig {
  type: 'command'
  command: string
}

interface HookMatcher {
  matcher?: string
  hooks: HookConfig[]
}

/** 安装结果 */
export interface HookInstallResult {
  settingsPath: string
  hooksRegistered: string[]
  claudeMdUpdated: boolean
  gitignoreUpdated: boolean
  sessionInjectCreated: boolean
}

export class ClaudeCodeHookInstaller {
  private capture = new ClaudeCodeCapture()

  /**
   * 安装所有 Hook 和配置
   *
   * @param projectRoot 项目根目录
   * @param options.skipClaudeMd 跳过 CLAUDE.md 注入（已有时）
   * @param options.skipGitignore 跳过 .gitignore 更新
   */
  async install(
    projectRoot: string,
    options: { skipClaudeMd?: boolean; skipGitignore?: boolean } = {},
  ): Promise<HookInstallResult> {
    const result: HookInstallResult = {
      settingsPath: '',
      hooksRegistered: [],
      claudeMdUpdated: false,
      gitignoreUpdated: false,
      sessionInjectCreated: false,
    }

    // 1. 写入 .claude/settings.json — Hook 注册
    const settingsResult = await this.installHooks(projectRoot)
    result.settingsPath = settingsResult.path
    result.hooksRegistered = settingsResult.hooks

    // 2. 创建 .mybad/session-inject.md（空文件）
    result.sessionInjectCreated = await this.createSessionInject(projectRoot)

    // 3. 注入 CLAUDE.md 静态指令
    if (!options.skipClaudeMd) {
      result.claudeMdUpdated = await this.injectClaudeMd(projectRoot)
    }

    // 4. 更新 .gitignore
    if (!options.skipGitignore) {
      result.gitignoreUpdated = await this.updateGitignore(projectRoot)
    }

    return result
  }

  /**
   * 注册 SessionStart + PostCompact hooks 到 .claude/settings.json
   */
  private async installHooks(
    projectRoot: string,
  ): Promise<{ path: string; hooks: string[] }> {
    const settingsDir = path.join(projectRoot, '.claude')
    const settingsPath = path.join(settingsDir, 'settings.json')
    const hooks: string[] = []

    // 读取现有配置
    let settings: Record<string, any> = {}
    try {
      const content = await fs.readFile(settingsPath, 'utf-8')
      settings = JSON.parse(content)
    } catch {
      // 文件不存在，创建新配置
    }

    if (!settings.hooks) settings.hooks = {}

    // SessionStart hook — session 启动时注入动态规则
    // 使用验证脚本读取 session-inject.md（验证 hash 签名）
    settings.hooks.SessionStart = [
      {
        matcher: 'startup',
        hooks: [
          {
            type: 'command',
            command: 'node -e "const f=require(\'fs\'),p=\'.mybad/session-inject.md\';try{let c=f.readFileSync(p,\'utf8\');const m=c.match(/<!-- mybad:hash:([a-f0-9]+) -->/);if(m){const b=c.replace(/<!-- mybad:hash:[a-f0-9]+ -->\\n?/,\'\');const h=require(\'crypto\').createHash(\'sha256\').update(b).digest(\'hex\');if(m[1]===h)process.stdout.write(b);else process.stdout.write(\'myBad: session-inject.md hash mismatch, skipping\')}else if(c.trim())process.stdout.write(c)}catch{}"',
          },
        ],
      },
    ]
    hooks.push('SessionStart')

    // PostCompact hook — 上下文压缩后重新注入（防丢失）
    settings.hooks.PostCompact = [
      {
        hooks: [
          {
            type: 'command',
            command: 'node -e "const f=require(\'fs\'),p=\'.mybad/session-inject.md\';try{let c=f.readFileSync(p,\'utf8\');const m=c.match(/<!-- mybad:hash:([a-f0-9]+) -->/);if(m){const b=c.replace(/<!-- mybad:hash:[a-f0-9]+ -->\\n?/,\'\');const h=require(\'crypto\').createHash(\'sha256\').update(b).digest(\'hex\');if(m[1]===h)process.stdout.write(b);else process.stdout.write(\'myBad: session-inject.md hash mismatch, skipping\')}else if(c.trim())process.stdout.write(c)}catch{}"',
          },
        ],
      },
    ]
    hooks.push('PostCompact')

    // 写入配置
    await fs.mkdir(settingsDir, { recursive: true })
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')

    return { path: settingsPath, hooks }
  }

  /**
   * 创建 .mybad/session-inject.md 空文件
   * Coach 后续会写入规则到此文件
   */
  private async createSessionInject(projectRoot: string): Promise<boolean> {
    const mybadDir = path.join(projectRoot, '.mybad')
    const injectPath = path.join(mybadDir, 'session-inject.md')

    try {
      await fs.mkdir(mybadDir, { recursive: true })

      // 如果文件已存在，不覆盖
      try {
        await fs.access(injectPath)
        return false // 已存在
      } catch {
        // 不存在，创建空文件
        await fs.writeFile(injectPath, '', 'utf-8')
        return true
      }
    } catch {
      return false
    }
  }

  /**
   * 注入静态指令到 CLAUDE.md
   *
   * 使用 <!-- mybad:instructions START/END --> 标记区块
   * 如果已存在标记，替换内容；否则追加到末尾
   */
  private async injectClaudeMd(projectRoot: string): Promise<boolean> {
    const claudeMdPath = path.join(projectRoot, 'CLAUDE.md')
    const injection = this.capture.getCLAUDEMDInjection()

    try {
      let content = ''
      try {
        content = await fs.readFile(claudeMdPath, 'utf-8')
      } catch {
        // 文件不存在
      }

      // 检查是否已有 myBad 注入
      const startMarker = '<!-- mybad:instructions START -->'
      const endMarker = '<!-- mybad:instructions END -->'

      if (content.includes(startMarker)) {
        // 替换现有区块
        const regex = new RegExp(
          startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
          '[\\s\\S]*?' +
          endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'g'
        )
        content = content.replace(regex, injection)
      } else {
        // 追加到末尾
        content = content.trimEnd() + '\n\n' + injection + '\n'
      }

      await fs.writeFile(claudeMdPath, content, 'utf-8')
      return true
    } catch {
      return false
    }
  }

  /**
   * 更新 .gitignore — 安全防护
   *
   * 防止 .mybad/ 目录（含用户纠正原话）被提交到公共仓库
   */
  private async updateGitignore(projectRoot: string): Promise<boolean> {
    const gitignorePath = path.join(projectRoot, '.gitignore')
    const entries = ['.mybad/', '.mybad/*.db', '.mybad/*.md']

    try {
      let content = ''
      try {
        content = await fs.readFile(gitignorePath, 'utf-8')
      } catch {
        // 文件不存在
      }

      let updated = false
      for (const entry of entries) {
        if (!content.includes(entry)) {
          content = content.trimEnd() + '\n' + entry + '\n'
          updated = true
        }
      }

      if (updated) {
        await fs.writeFile(gitignorePath, content, 'utf-8')
        return true
      }

      return false
    } catch {
      return false
    }
  }

  /**
   * 注册 PreToolUse Hook（Phase 5.5 执行层）
   * 在 enforcement.json 生成后调用
   */
  async installEnforcementHook(projectRoot: string): Promise<boolean> {
    const settingsDir = path.join(projectRoot, '.claude')
    const settingsPath = path.join(settingsDir, 'settings.json')

    try {
      const content = await fs.readFile(settingsPath, 'utf-8')
      const settings = JSON.parse(content)

      if (!settings.hooks) settings.hooks = {}

      // PreToolUse hook — 工具执行前拦截
      settings.hooks.PreToolUse = [
        {
          matcher: 'Write|Edit',
          hooks: [
            {
              type: 'command',
              command: 'node .mybad/enforce.mjs',
            },
          ],
        },
      ]

      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
      return true
    } catch {
      return false
    }
  }
}
