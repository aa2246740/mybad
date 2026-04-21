/**
 * mybad coach — Coach 分析 + 跨项目提炼
 *
 * 子命令：
 * - mybad coach              项目内 Coach 分析
 * - mybad coach --universal  跨项目提炼（生成通用规则）
 */

import { Command } from 'commander'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs/promises'
import { MyBadEngine, Distiller } from '@mybad/core'
import { getEngine } from './engine'

async function getRegisteredProjects(): Promise<string[]> {
  const projectsPath = path.join(os.homedir(), '.mybad/projects.json')
  try {
    const content = await fs.readFile(projectsPath, 'utf-8')
    const config = JSON.parse(content)
    return config.projects?.map((p: any) => p.path) ?? []
  } catch {
    return []
  }
}

export function makeCoachCommand(): Command {
  return new Command('coach')
    .description('运行 Coach 分析（提炼错题模式，生成改进建议）')
    .option('--universal', '跨项目提炼（生成通用规则）')
    .option('--min-recurrence <n>', '最小复发次数', '2')
    .option('--apply', '自动应用所有 explicit 推荐')
    .action(async (opts) => {
      if (opts.universal) {
        await runUniversalDistillation()
      } else {
        await runProjectCoach(parseInt(opts.minRecurrence, 10), opts.apply)
      }
    })
}

/** 项目内 Coach 分析 */
async function runProjectCoach(minRecurrence: number, autoApply: boolean): Promise<void> {
  const { engine, adapter } = getEngine()
  try {
    console.log('🔍 正在分析错题模式...')

    const result = await engine.coachAnalyze({
      minRecurrence,
    })

    console.log('')
    console.log(`📊 分析结果：`)
    console.log(`   分析了 ${result.categories_analyzed.length} 个分类`)
    console.log(`   生成了 ${result.recommendations_generated} 条推荐`)
    console.log(`   自动应用 ${result.auto_applied} 条（explicit）`)
    console.log(`   待确认 ${result.pending_confirmation} 条（ambiguous）`)

    if (result.recommendations.length > 0) {
      console.log('')
      console.log('📋 推荐：')
      for (const rec of result.recommendations) {
        const status = rec.status === 'auto_applied' ? '✅ 已应用' : '⏳ 待确认'
        console.log(`   ${status} [${rec.category}] ${rec.suggested_rule}`)
      }
    }
  } finally {
    adapter.close()
  }
}

/** 跨项目提炼 */
async function runUniversalDistillation(): Promise<void> {
  const projects = await getRegisteredProjects()

  if (projects.length < 2) {
    console.log(`⚠️  跨项目提炼需要至少 2 个已注册项目（当前 ${projects.length} 个）`)
    console.log('   使用 mybad register 注册更多项目')
    return
  }

  console.log(`🔍 正在跨项目提炼（${projects.length} 个项目）...`)

  const universalDbPath = path.join(os.homedir(), '.mybad/universal.db')
  const distiller = new Distiller()

  const result = await distiller.distill(projects, universalDbPath)

  console.log('')
  console.log(`📊 提炼结果：`)
  console.log(`   分析了 ${result.projectsAnalyzed} 个项目`)
  console.log(`   发现 ${result.commonCategories} 个跨项目共同分类`)
  console.log(`   生成 ${result.rulesDistilled} 条通用规则`)

  if (result.recommendations.length > 0) {
    console.log('')
    console.log('🌐 通用规则：')
    for (const rec of result.recommendations) {
      console.log(`   ✅ [${rec.category}] ${rec.suggested_rule}`)
    }
    console.log('')
    console.log('这些规则已写入 ~/.mybad/universal.db，将在下次 session 注入到所有项目。')
  } else {
    console.log('')
    console.log('暂未发现符合条件的跨项目共同模式。')
    console.log('提炼条件：同一分类在 ≥2 个项目出现、每个项目内 recurrence≥2、明确纠正。')
  }
}
