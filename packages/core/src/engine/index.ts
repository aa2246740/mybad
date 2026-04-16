import type { StorageAdapter } from '../storage/adapter'
import type { Mistake, MistakeFilter } from '../models/mistake'
import type { Rule, RuleFilter } from '../models/rule'
import type { Verification } from '../models/verification'
import type { MistakeLink, LinkType, LinkDirection } from '../models/link'
import type { DateRange, CategoryStats, OverallStats } from '../storage/adapter'
import { CrudEngine } from './crud'
import { LinkerEngine } from './linker'
import { LifecycleEngine, InvalidTransitionError } from './lifecycle'
import { StatsEngine, ReflectionInput } from './stats'

export { CrudEngine } from './crud'
export { LinkerEngine } from './linker'
export { LifecycleEngine, InvalidTransitionError } from './lifecycle'
export { StatsEngine } from './stats'
export type { ReflectionInput } from './stats'

/** MyBad 引擎 — 组合所有子引擎的 facade */
export class MyBadEngine {
  readonly crud: CrudEngine
  readonly linker: LinkerEngine
  readonly lifecycle: LifecycleEngine
  readonly stats: StatsEngine

  constructor(storage: StorageAdapter) {
    this.crud = new CrudEngine(storage)
    this.linker = new LinkerEngine(storage)
    this.lifecycle = new LifecycleEngine(storage)
    this.stats = new StatsEngine(storage)
  }

  // ── CRUD 代理方法 ─────────────────────────────────────
  addMistake(input: Parameters<CrudEngine['addMistake']>[0]) { return this.crud.addMistake(input) }
  getMistake(id: string) { return this.crud.getMistake(id) }
  updateMistake(id: string, updates: Partial<Mistake>) { return this.crud.updateMistake(id, updates) }
  queryMistakes(filter: MistakeFilter) { return this.crud.queryMistakes(filter) }
  addRule(input: Parameters<CrudEngine['addRule']>[0]) { return this.crud.addRule(input) }
  getRules(filter?: RuleFilter) { return this.crud.getRules(filter) }
  updateRule(id: string, updates: Partial<Rule>) { return this.crud.updateRule(id, updates) }
  addVerification(input: Omit<Verification, 'id'>) { return this.crud.addVerification(input) }
  searchMistakes(query: string, limit?: number) { return this.crud.searchMistakes(query, limit) }

  // ── Linker 代理方法 ───────────────────────────────────
  addLink(fromId: string, toId: string, type: LinkType, confidence?: number) { return this.linker.addLink(fromId, toId, type, confidence) }
  getLinks(id: string, direction?: LinkDirection) { return this.linker.getLinks(id, direction) }
  getRelated(id: string, depth?: number) { return this.linker.getRelated(id, depth) }

  // ── Lifecycle 代理方法 ────────────────────────────────
  transition(mistakeId: string, toStatus: Mistake['status']) { return this.lifecycle.transition(mistakeId, toStatus) }
  transitionRule(ruleId: string, toStatus: Rule['status']) { return this.lifecycle.transitionRule(ruleId, toStatus) }
  checkGraduation(mistakeId: string) { return this.lifecycle.checkGraduation(mistakeId) }
  compact(category?: string) { return this.lifecycle.compact(category) }

  // ── Stats 代理方法 ────────────────────────────────────
  getCategoryStats(agentId?: string) { return this.stats.getCategoryStats(agentId) }
  getOverallStats(agentId?: string, dateRange?: DateRange) { return this.stats.getOverallStats(agentId, dateRange) }
  getReflectionData(options?: Parameters<StatsEngine['getReflectionData']>[0]) { return this.stats.getReflectionData(options) }
}
