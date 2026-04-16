import type { StorageAdapter } from '../storage/adapter'
import type { Mistake, MistakeFilter, TriggerType } from '../models/mistake'
import type { Rule, RuleFilter, RulePriority } from '../models/rule'
import type { Verification, VerificationResult } from '../models/verification'

/** 生成唯一 ID */
function generateId(prefix: string = 'm'): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${ts}_${rand}`
}

/** CRUD 引擎 — 错题和规则的增删改查 + recurrence 原子计数 */
export class CrudEngine {
  constructor(private storage: StorageAdapter) {}

  /** 捕捉错题，自动处理 recurrence 计数和同 category 自动关联 */
  async addMistake(input: Omit<Mistake, 'id' | 'created_at' | 'updated_at' | 'recurrence_count'>): Promise<Mistake> {
    const now = new Date().toISOString()
    const recurrence = await this.storage.incrementRecurrence(input.category, input.agent_id)

    const mistake: Mistake = {
      ...input,
      id: generateId('m'),
      recurrence_count: recurrence,
      created_at: now,
      updated_at: now,
    }

    await this.storage.addMistake(mistake)

    // 同 category 自动关联：找最近的同 category mistake 建 link
    if (recurrence > 1) {
      const existing = await this.storage.queryMistakes({
        category: input.category,
        limit: 1,
      })
      if (existing.length > 0 && existing[0].id !== mistake.id) {
        await this.storage.addLink(mistake.id, existing[0].id, 'same_category')
      }
    }

    return mistake
  }

  /** 获取单个错题 */
  async getMistake(id: string): Promise<Mistake | null> {
    return this.storage.getMistake(id)
  }

  /** 更新错题 */
  async updateMistake(id: string, updates: Partial<Mistake>): Promise<void> {
    await this.storage.updateMistake(id, { ...updates, updated_at: new Date().toISOString() })
  }

  /** 查询错题 */
  async queryMistakes(filter: MistakeFilter): Promise<Mistake[]> {
    return this.storage.queryMistakes(filter)
  }

  /** 创建规则 */
  async addRule(input: Omit<Rule, 'id' | 'created_at' | 'updated_at' | 'verified_count' | 'fail_count' | 'source_count'>): Promise<Rule> {
    const now = new Date().toISOString()
    const rule: Rule = {
      ...input,
      id: generateId('r'),
      source_count: input.source_ids?.length ?? 1,
      verified_count: 0,
      fail_count: 0,
      created_at: now,
      updated_at: now,
    }
    await this.storage.addRule(rule)
    return rule
  }

  /** 查询规则 */
  async getRules(filter?: RuleFilter): Promise<Rule[]> {
    return this.storage.getRules(filter)
  }

  /** 更新规则 */
  async updateRule(id: string, updates: Partial<Rule>): Promise<void> {
    await this.storage.updateRule(id, { ...updates, updated_at: new Date().toISOString() })
  }

  /** 添加验证记录，同时更新规则的 verified_count/fail_count */
  async addVerification(input: Omit<Verification, 'id'>): Promise<void> {
    await this.storage.addVerification(input)
    // 同步更新规则计数
    const counts = await this.storage.getVerificationCount(input.rule_id)
    if (input.result === 'pass') {
      await this.storage.updateRule(input.rule_id, { verified_count: counts.pass })
    } else {
      await this.storage.updateRule(input.rule_id, { fail_count: counts.fail })
    }
  }

  /** 全文搜索错题 */
  async searchMistakes(query: string, limit?: number): Promise<Mistake[]> {
    return this.storage.searchMistakes(query, limit)
  }
}
