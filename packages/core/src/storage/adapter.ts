import type { Mistake, MistakeFilter } from '../models/mistake'
import type { Rule, RuleFilter } from '../models/rule'
import type { MistakeLink, LinkDirection } from '../models/link'
import type { Verification, VerificationCount } from '../models/verification'
import type { Reflection, ReflectionFilter } from '../models/reflection'
import type { CoachRecommendation, CoachRecommendationFilter } from '../models/coach'

/** 日期范围 */
export interface DateRange {
  from: string
  to: string
}

/** 分类统计 */
export interface CategoryStats {
  category: string
  count: number
  recurrence_total: number
  by_status: Record<string, number>
}

/** 全局统计 */
export interface OverallStats {
  total: number
  by_status: Record<string, number>
  by_category: Record<string, number>
  total_rules: number
  total_verifications: number
}

/** 存储适配器接口 — SQLite 和 Memory 共用 */
export interface StorageAdapter {
  // Mistake CRUD
  addMistake(mistake: Mistake): Promise<string>
  getMistake(id: string): Promise<Mistake | null>
  updateMistake(id: string, updates: Partial<Mistake>): Promise<void>
  queryMistakes(filter: MistakeFilter): Promise<Mistake[]>

  // Recurrence
  incrementRecurrence(category: string, agentId?: string): Promise<number>

  // Links
  addLink(from: string, to: string, type: string, confidence?: number): Promise<void>
  getLinks(id: string, direction?: LinkDirection): Promise<MistakeLink[]>
  getRelated(id: string, depth?: number): Promise<MistakeLink[]>

  // Rules
  addRule(rule: Rule): Promise<string>
  getRules(filter?: RuleFilter): Promise<Rule[]>
  updateRule(id: string, updates: Partial<Rule>): Promise<void>

  // Verification
  addVerification(verification: Verification): Promise<void>
  getVerificationCount(ruleId: string): Promise<VerificationCount>

  // Reflection
  addReflection(reflection: Reflection): Promise<string>
  getReflections(filter?: ReflectionFilter): Promise<Reflection[]>

  // Stats
  getCategoryStats(agentId?: string): Promise<CategoryStats[]>
  getOverallStats(agentId?: string, dateRange?: DateRange): Promise<OverallStats>

  // Search
  searchMistakes(query: string, limit?: number): Promise<Mistake[]>

  // Lifecycle
  archiveMistakes(ids: string[]): Promise<number>
  compactGraduated(category?: string): Promise<number>

  // Config
  getConfig(key: string): Promise<unknown>
  setConfig(key: string, value: unknown): Promise<void>

  // Coach Recommendations
  addCoachRecommendation(rec: CoachRecommendation): Promise<string>
  getCoachRecommendations(filter?: CoachRecommendationFilter): Promise<CoachRecommendation[]>
  updateCoachRecommendation(id: string, updates: Partial<CoachRecommendation>): Promise<void>
}
