import type { Mistake, MistakeFilter } from '../models/mistake'
import type { Rule, RuleFilter } from '../models/rule'
import type { MistakeLink, LinkDirection } from '../models/link'
import type { Verification, VerificationCount } from '../models/verification'
import type { Reflection, ReflectionFilter } from '../models/reflection'
import type { CoachRecommendation, CoachRecommendationFilter } from '../models/coach'
import type {
  StorageAdapter,
  CategoryStats,
  OverallStats,
  DateRange,
} from './adapter'

/** 内存存储适配器 — 用于测试 */
export class MemoryAdapter implements StorageAdapter {
  private mistakes = new Map<string, Mistake>()
  private rules = new Map<string, Rule>()
  private links: MistakeLink[] = []
  private verifications: Verification[] = []
  private reflections = new Map<string, Reflection>()
  private config = new Map<string, unknown>()

  // ── Mistake CRUD ──────────────────────────────────────

  async addMistake(mistake: Mistake): Promise<string> {
    this.mistakes.set(mistake.id, mistake)
    return mistake.id
  }

  async getMistake(id: string): Promise<Mistake | null> {
    return this.mistakes.get(id) ?? null
  }

  async updateMistake(id: string, updates: Partial<Mistake>): Promise<void> {
    const existing = this.mistakes.get(id)
    if (!existing) return
    this.mistakes.set(id, { ...existing, ...updates })
  }

  async queryMistakes(filter: MistakeFilter): Promise<Mistake[]> {
    let results = Array.from(this.mistakes.values())
    if (filter.category) results = results.filter(m => m.category === filter.category)
    if (filter.status) results = results.filter(m => m.status === filter.status)
    if (filter.agent_id) results = results.filter(m => m.agent_id === filter.agent_id)
    if (filter.date_from) results = results.filter(m => m.created_at >= filter.date_from!)
    if (filter.date_to) results = results.filter(m => m.created_at <= filter.date_to!)
    if (filter.recurrence_min) results = results.filter(m => m.recurrence_count >= filter.recurrence_min!)
    results.sort((a, b) => b.created_at.localeCompare(a.created_at))
    if (filter.offset) results = results.slice(filter.offset)
    if (filter.limit) results = results.slice(0, filter.limit)
    return results
  }

  // ── Recurrence ────────────────────────────────────────

  async incrementRecurrence(category: string, agentId?: string): Promise<number> {
    let count = 0
    for (const m of this.mistakes.values()) {
      if (m.category === category && (!agentId || m.agent_id === agentId)) count++
    }
    return count + 1
  }

  // ── Links ─────────────────────────────────────────────

  async addLink(from: string, to: string, type: string, confidence: number = 1.0): Promise<void> {
    // 幂等：不添加重复关联
    const exists = this.links.some(l =>
      l.from_id === from && l.to_id === to && l.link_type === type
    )
    if (!exists) {
      this.links.push({
        from_id: from, to_id: to,
        link_type: type as any, confidence,
        created_at: new Date().toISOString(),
      })
    }
  }

  async getLinks(id: string, direction: LinkDirection = 'outbound'): Promise<MistakeLink[]> {
    if (direction === 'outbound') return this.links.filter(l => l.from_id === id)
    if (direction === 'inbound') return this.links.filter(l => l.to_id === id)
    return this.links.filter(l => l.from_id === id || l.to_id === id)
  }

  async getRelated(id: string, depth: number = 2): Promise<MistakeLink[]> {
    // BFS 广度优先搜索
    const visited = new Set<string>([id])
    const result: MistakeLink[] = []
    let frontier = [id]

    for (let d = 0; d < depth; d++) {
      const nextFrontier: string[] = []
      for (const nodeId of frontier) {
        const outLinks = this.links.filter(l => l.from_id === nodeId)
        for (const link of outLinks) {
          if (!visited.has(link.to_id)) {
            visited.add(link.to_id)
            result.push(link)
            nextFrontier.push(link.to_id)
          }
        }
      }
      frontier = nextFrontier
    }
    return result
  }

  // ── Rules ─────────────────────────────────────────────

  async addRule(rule: Rule): Promise<string> {
    this.rules.set(rule.id, rule)
    return rule.id
  }

  async getRules(filter?: RuleFilter): Promise<Rule[]> {
    let results = Array.from(this.rules.values())
    if (filter?.category) results = results.filter(r => r.category === filter.category)
    if (filter?.priority) results = results.filter(r => r.priority === filter.priority)
    if (filter?.status) results = results.filter(r => r.status === filter.status)
    results.sort((a, b) => b.created_at.localeCompare(a.created_at))
    if (filter?.offset) results = results.slice(filter.offset)
    if (filter?.limit) results = results.slice(0, filter.limit)
    return results
  }

  async updateRule(id: string, updates: Partial<Rule>): Promise<void> {
    const existing = this.rules.get(id)
    if (!existing) return
    this.rules.set(id, { ...existing, ...updates })
  }

  // ── Verification ──────────────────────────────────────

  async addVerification(verification: Verification): Promise<void> {
    this.verifications.push(verification)
  }

  async getVerificationCount(ruleId: string): Promise<VerificationCount> {
    let pass = 0, fail = 0
    for (const v of this.verifications) {
      if (v.rule_id === ruleId) {
        if (v.result === 'pass') pass++
        else fail++
      }
    }
    return { pass, fail }
  }

  // ── Reflection ────────────────────────────────────────

  async addReflection(reflection: Reflection): Promise<string> {
    this.reflections.set(reflection.id, reflection)
    return reflection.id
  }

  async getReflections(filter?: ReflectionFilter): Promise<Reflection[]> {
    let results = Array.from(this.reflections.values())
    if (filter?.date_from) results = results.filter(r => r.date >= filter.date_from!)
    if (filter?.date_to) results = results.filter(r => r.date <= filter.date_to!)
    if (filter?.agent_id) results = results.filter(r => r.agent_id === filter.agent_id)
    results.sort((a, b) => b.date.localeCompare(a.date))
    if (filter?.offset) results = results.slice(filter.offset)
    if (filter?.limit) results = results.slice(0, filter.limit)
    return results
  }

  // ── Stats ─────────────────────────────────────────────

  async getCategoryStats(agentId?: string): Promise<CategoryStats[]> {
    const map = new Map<string, CategoryStats>()
    for (const m of this.mistakes.values()) {
      if (agentId && m.agent_id !== agentId) continue
      let entry = map.get(m.category)
      if (!entry) {
        entry = { category: m.category, count: 0, recurrence_total: 0, by_status: {} }
        map.set(m.category, entry)
      }
      entry.count++
      entry.recurrence_total += m.recurrence_count
      entry.by_status[m.status] = (entry.by_status[m.status] ?? 0) + 1
    }
    return Array.from(map.values())
  }

  async getOverallStats(agentId?: string, dateRange?: DateRange): Promise<OverallStats> {
    const by_status: Record<string, number> = {}
    const by_category: Record<string, number> = {}
    let total = 0
    for (const m of this.mistakes.values()) {
      if (agentId && m.agent_id !== agentId) continue
      if (dateRange?.from && m.created_at < dateRange.from) continue
      if (dateRange?.to && m.created_at > dateRange.to) continue
      by_status[m.status] = (by_status[m.status] ?? 0) + 1
      by_category[m.category] = (by_category[m.category] ?? 0) + 1
      total++
    }
    return {
      total,
      by_status,
      by_category,
      total_rules: this.rules.size,
      total_verifications: this.verifications.length,
    }
  }

  // ── Search ────────────────────────────────────────────

  async searchMistakes(query: string, limit: number = 20): Promise<Mistake[]> {
    const q = query.toLowerCase()
    const results: Mistake[] = []
    for (const m of this.mistakes.values()) {
      const searchable = [
        m.category, m.ai_misunderstanding ?? '',
        m.user_intent ?? '', m.user_correction ?? '',
        ...m.tags,
      ].join(' ').toLowerCase()
      if (searchable.includes(q)) {
        results.push(m)
        if (results.length >= limit) break
      }
    }
    return results
  }

  // ── Lifecycle ─────────────────────────────────────────

  async archiveMistakes(ids: string[]): Promise<number> {
    let count = 0
    const now = new Date().toISOString()
    for (const id of ids) {
      const m = this.mistakes.get(id)
      if (m && !m.archived_at) {
        this.mistakes.set(id, { ...m, archived_at: now, status: 'abandoned' })
        count++
      }
    }
    return count
  }

  async compactGraduated(category?: string): Promise<number> {
    let count = 0
    for (const [id, m] of this.mistakes) {
      if (m.status === 'graduated' && (!category || m.category === category)) {
        this.mistakes.delete(id)
        count++
      }
    }
    return count
  }

  // ── Config ────────────────────────────────────────────

  async getConfig(key: string): Promise<unknown> {
    return this.config.get(key) ?? null
  }

  async setConfig(key: string, value: unknown): Promise<void> {
    this.config.set(key, value)
  }

  // ── Coach Recommendations ─────────────────────────────

  private coachRecommendations = new Map<string, CoachRecommendation>()

  async addCoachRecommendation(rec: CoachRecommendation): Promise<string> {
    this.coachRecommendations.set(rec.id, rec)
    return rec.id
  }

  async getCoachRecommendations(filter?: CoachRecommendationFilter): Promise<CoachRecommendation[]> {
    let results = Array.from(this.coachRecommendations.values())
    if (filter?.category) results = results.filter(r => r.category === filter.category)
    if (filter?.status) results = results.filter(r => r.status === filter.status)
    if (filter?.clarity) results = results.filter(r => r.clarity === filter.clarity)
    results.sort((a, b) => b.created_at.localeCompare(a.created_at))
    if (filter?.offset) results = results.slice(filter.offset)
    if (filter?.limit) results = results.slice(0, filter.limit)
    return results
  }

  async updateCoachRecommendation(id: string, updates: Partial<CoachRecommendation>): Promise<void> {
    const existing = this.coachRecommendations.get(id)
    if (!existing) return
    this.coachRecommendations.set(id, { ...existing, ...updates })
  }
}
