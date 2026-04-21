/**
 * mybad register — 注册当前项目到全局列表
 *
 * 将当前项目路径注册到 ~/.mybad/projects.json，
 * 使其参与跨项目提炼（Coach --universal）。
 */

import { Command } from 'commander'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as os from 'os'

interface ProjectsConfig {
  projects: Array<{
    path: string
    registeredAt: string
    platform?: string
  }>
}

async function getProjectsPath(): Promise<string> {
  const mybadDir = path.join(os.homedir(), '.mybad')
  await fs.mkdir(mybadDir, { recursive: true })
  return path.join(mybadDir, 'projects.json')
}

async function loadProjects(): Promise<ProjectsConfig> {
  const projectsPath = await getProjectsPath()
  try {
    const content = await fs.readFile(projectsPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return { projects: [] }
  }
}

async function saveProjects(config: ProjectsConfig): Promise<void> {
  const projectsPath = await getProjectsPath()
  await fs.writeFile(projectsPath, JSON.stringify(config, null, 2), 'utf-8')
}

export function makeRegisterCommand(): Command {
  const cmd = new Command('register')
  cmd.description('注册当前项目到全局列表（支持跨项目提炼）')

  cmd.action(async () => {
    const projectRoot = process.cwd()
    const config = await loadProjects()

    // 检查是否已注册
    if (config.projects.some(p => p.path === projectRoot)) {
      console.log(`该项目已注册: ${projectRoot}`)
      return
    }

    // 注册
    config.projects.push({
      path: projectRoot,
      registeredAt: new Date().toISOString(),
    })

    await saveProjects(config)
    console.log(`✅ 已注册项目: ${projectRoot}`)
    console.log(`   当前共 ${config.projects.length} 个已注册项目`)

    // 提示下一步
    console.log('')
    console.log('现在可以运行 mybad coach --universal 进行跨项目提炼')
  })

  // 子命令：list
  cmd.command('list')
    .description('列出所有已注册项目')
    .action(async () => {
      const config = await loadProjects()
      if (config.projects.length === 0) {
        console.log('暂无已注册项目')
        return
      }
      console.log(`已注册项目（${config.projects.length} 个）：`)
      for (const p of config.projects) {
        console.log(`  - ${p.path} (注册于 ${p.registeredAt.split('T')[0]})`)
      }
    })

  // 子命令：remove
  cmd.command('remove')
    .description('移除当前项目的注册')
    .action(async () => {
      const projectRoot = process.cwd()
      const config = await loadProjects()
      const before = config.projects.length
      config.projects = config.projects.filter(p => p.path !== projectRoot)
      const removed = before - config.projects.length

      if (removed > 0) {
        await saveProjects(config)
        console.log(`✅ 已移除: ${projectRoot}`)
      } else {
        console.log(`该项目未注册: ${projectRoot}`)
      }
    })

  return cmd
}
