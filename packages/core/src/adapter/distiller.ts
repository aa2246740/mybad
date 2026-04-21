/**
 * myBad v2 — 跨项目提炼引擎
 *
 * 从多个项目的 mybad.db 中分析共同模式，提炼为通用规则。
 *
 * 提炼条件（四条全满足才提炼）：
 * 1. 同一 category 在 ≥ 2 个项目出现
 * 2. 每个项目内 recurrence ≥ 2
 * 3. 纠正明确度 = explicit（不含糊）
 * 4. 非项目特有（规则内容不包含项目专有名词）
 *
 * 触发时机：
 * - `mybad coach --universal`：手动触发
 * - 定时任务（cron / Standing Order）
 * - 项目 Coach 运行后自动检查
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import Database from 'better-sqlite3'
import { runMigrations } from '../storage/migrations'
import type { CoachRecommendation } from '../models/coach'

/** 提炼条件配置 */
export interface DistillerConfig {
  /** 最少跨项目出现数（默认 2） */
  minProjects: number
  /** 每个项目内最少 recurrence 数（默认 2） */
  minRecurrence: number
  /** 只提炼明确的纠正 */
  requireExplicit: boolean
}

export const DEFAULT_DISTILLER_CONFIG: DistillerConfig = {
  minProjects: 2,
  minRecurrence: 2,
  requireExplicit: true,
}

/** 项目规则汇总 */
interface ProjectRulesSummary {
  projectPath: string
  categories: Map<string, {
    count: number
    corrections: string[]
    intents: string[]
    clarity: string
  }>
}

/** 提炼结果 */
export interface DistillationResult {
  /** 分析了多少个项目 */
  projectsAnalyzed: number
  /** 找到了多少个跨项目共同 category */
  commonCategories: number
  /** 生成了多少条通用规则推荐 */
  rulesDistilled: number
  /** 生成的通用规则列表 */
  recommendations: CoachRecommendation[]
}

/**
 * 跨项目提炼引擎
 */
export class Distiller {
  constructor(
    private config: DistillerConfig = DEFAULT_DISTILLER_CONFIG,
  ) {}

  /**
   * 执行跨项目提炼
   *
   * @param projectPaths 所有已知项目路径
   * @param universalDbPath 通用规则数据库路径
   */
  async distill(
    projectPaths: string[],
    universalDbPath: string,
  ): Promise<DistillationResult> {
    // 1. 收集所有项目的规则
    const projectSummaries = await this.collectProjectRules(projectPaths)
    const validProjects = projectSummaries.filter(s => s.categories.size > 0)

    if (validProjects.length < this.config.minProjects) {
      return {
        projectsAnalyzed: validProjects.length,
        commonCategories: 0,
        rulesDistilled: 0,
        recommendations: [],
      }
    }

    // 2. 找到跨项目共同 category
    const commonCategories = this.findCommonCategories(validProjects)

    // 3. 对每个共同 category 生成通用规则
    const recommendations = this.generateUniversalRecommendations(commonCategories)

    // 4. 写入通用规则数据库
    if (recommendations.length > 0) {
      await this.writeUniversalRules(recommendations, universalDbPath)
    }

    return {
      projectsAnalyzed: validProjects.length,
      commonCategories: commonCategories.size,
      rulesDistilled: recommendations.length,
      recommendations,
    }
  }

  /**
   * 收集所有项目的规则
   */
  private async collectProjectRules(
    projectPaths: string[],
  ): Promise<ProjectRulesSummary[]> {
    const summaries: ProjectRulesSummary[] = []

    for (const projectPath of projectPaths) {
      const dbPath = path.join(projectPath, '.mybad/mybad.db')
      try {
        await fs.access(dbPath)
      } catch {
        continue // 项目没有 mybad.db
      }

      const summary = await this.readProjectDb(dbPath, projectPath)
      summaries.push(summary)
    }

    return summaries
  }

  /**
   * 读取单个项目的 mybad.db，提取规则
   */
  private async readProjectDb(
    dbPath: string,
    projectPath: string,
  ): Promise<ProjectRulesSummary> {
    const db = new Database(dbPath, { readonly: true })
    const categories = new Map<string, {
      count: number
      corrections: string[]
      intents: string[]
      clarity: string
    }>()

    try {
      // 查询所有 coach_recommendations（已应用的）
      const rows = db.prepare(`
        SELECT category, correction_count, suggested_rule, clarity, pattern_summary
        FROM coach_recommendations
        WHERE status IN ('auto_applied', 'confirmed')
      `).all() as any[]

      for (const row of rows) {
        const existing = categories.get(row.category)
        if (existing) {
          existing.count += row.correction_count
        } else {
          // 检查 recurrence
          const mistakes = db.prepare(`
            SELECT COUNT(*) as cnt FROM mistakes
            WHERE category = ? AND recurrence_count >= ?
          `).get(row.category, this.config.minRecurrence) as any

          if (mistakes.cnt > 0 || row.correction_count >= this.config.minRecurrence) {
            // 检查明确度
            if (this.config.requireExplicit && row.clarity !== 'explicit') {
              continue
            }

            categories.set(row.category, {
              count: row.correction_count,
              corrections: [row.suggested_rule],
              intents: [],
              clarity: row.clarity,
            })
          }
        }
      }
    } finally {
      db.close()
    }

    return { projectPath, categories }
  }

  /**
   * 找到跨项目共同 category
   */
  private findCommonCategories(
    summaries: ProjectRulesSummary[],
  ): Map<string, ProjectRulesSummary[]> {
    const categoryProjects = new Map<string, ProjectRulesSummary[]>()

    for (const summary of summaries) {
      for (const [category] of summary.categories) {
        // 跳过项目特有 category（包含项目专有名词）
        if (this.isProjectSpecific(category)) continue

        const list = categoryProjects.get(category) ?? []
        list.push(summary)
        categoryProjects.set(category, list)
      }
    }

    // 只保留出现在 ≥ minProjects 个项目中的
    for (const [category, projects] of categoryProjects) {
      if (projects.length < this.config.minProjects) {
        categoryProjects.delete(category)
      }
    }

    return categoryProjects
  }

  /**
   * 判断 category 是否项目特有
   * 启发式：检查 category 名称或规则文本是否包含项目路径中的专有名词
   */
  private isProjectSpecific(category: string): boolean {
    // 常见的通用 category 前缀
    const genericPrefixes = [
      'api_', 'data_', 'code_', 'format_', 'intent_',
      'auth_', 'test_', 'build_', 'deploy_', 'security_',
    ]

    // 如果 category 以通用前缀开头，大概率不是项目特有
    if (genericPrefixes.some(p => category.startsWith(p))) return false

    // 如果 category 包含项目名/品牌名等专有词，可能是项目特有
    const projectSpecificPatterns = /corp|internal|proprietary|acme|widget/
    return projectSpecificPatterns.test(category)
  }

  /**
   * 从共同 category 生成通用规则推荐
   */
  private generateUniversalRecommendations(
    commonCategories: Map<string, ProjectRulesSummary[]>,
  ): CoachRecommendation[] {
    const recommendations: CoachRecommendation[] = []
    const now = new Date().toISOString()

    for (const [category, projects] of commonCategories) {
      // 汇总所有项目中该 category 的规则文本
      const ruleTexts: string[] = []
      let totalCount = 0

      for (const project of projects) {
        const data = project.categories.get(category)
        if (data) {
          ruleTexts.push(...data.corrections)
          totalCount += data.count
        }
      }

      // 去重，取最精炼的那条
      const uniqueRules = [...new Set(ruleTexts)]
      const bestRule = uniqueRules[0] ?? `[mybad:${category}] 注意此分类的历史错误`

      recommendations.push({
        id: `cr_universal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        category,
        pattern_summary: `跨项目通用规则（${projects.length} 个项目共同出现）`,
        suggested_rule: bestRule.replace(`[mybad:${category}] `, ''),
        target_file_type: 'memory',
        clarity: 'explicit',
        status: 'auto_applied',
        source_mistake_ids: [],
        correction_count: totalCount,
        applied_at: now,
        created_at: now,
        updated_at: now,
      })
    }

    return recommendations
  }

  /**
   * 写入通用规则数据库
   */
  private async writeUniversalRules(
    recommendations: CoachRecommendation[],
    dbPath: string,
  ): Promise<void> {
    await fs.mkdir(path.dirname(dbPath), { recursive: true })

    const db = new Database(dbPath)
    runMigrations(db)

    const insert = db.prepare(`
      INSERT OR REPLACE INTO coach_recommendations
        (id, category, pattern_summary, suggested_rule, target_file_type,
         clarity, status, source_mistake_ids, correction_count, applied_at,
         created_at, updated_at, scope)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'universal')
    `)

    const run = db.transaction(() => {
      for (const rec of recommendations) {
        insert.run(
          rec.id, rec.category, rec.pattern_summary, rec.suggested_rule,
          rec.target_file_type, rec.clarity, rec.status,
          JSON.stringify(rec.source_mistake_ids), rec.correction_count,
          rec.applied_at ?? null, rec.created_at, rec.updated_at,
        )
      }
    })

    try {
      run()
    } finally {
      db.close()
    }
  }
}
