import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { homedir } from 'node:os'
import type { Mistake, MistakeFilter } from '../models/mistake'
import type { Rule, RuleFilter } from '../models/rule'
import type { MistakeLink, LinkDirection } from '../models/link'
import type { Verification, VerificationCount } from '../models/verification'
import type { Reflection, ReflectionFilter } from '../models/reflection'
import type {
  StorageAdapter,
  CategoryStats,
  OverallStats,
  DateRange,
} from './adapter'
import { runMigrations } from './migrations'

/** 安全解析 JSON，失败返回 fallback */
function safeParseJson<T>(text: string | undefined | null, fallback: T): T {
  if (!text) return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

/** 把 Row 转成 Mistake（处理 JSON 字段） */
function rowToMistake(row: any): Mistake {
  return {
    ...row,
    tags: safeParseJson<string[]>(row.tags, []),
    recurrence_count: row.recurrence_count ?? 1,
    confidence: row.confidence ?? 1.0,
  }
}

/** 把 Row 转成 Rule（处理 JSON 字段） */
function rowToRule(row: any): Rule {
  return {
    ...row,
    source_ids: safeParseJson<string[]>(row.source_ids, []),
  }
}

/** 把 Row 转成 Reflection（处理 JSON 字段） */
function rowToReflection(row: any): Reflection {
  return {
    ...row,
    new_rule_ids: safeParseJson<string[]>(row.new_rule_ids, []),
    hot_categories: safeParseJson<string[]>(row.hot_categories, []),
    stats: safeParseJson<Record<string, unknown>>(row.stats, {}),
  }
}

/** SQLite 存储适配器 */
export class SQLiteAdapter implements StorageAdapter {
  private db: Database.Database

  constructor(dbPath: string) {
    // 展开 ~ 为 home 目录，并自动创建父目录
    const resolved = dbPath.startsWith('~')
      ? dbPath.replace(/^~/, homedir())
      : dbPath
    const dir = dirname(resolved)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.db = new Database(resolved)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('busy_timeout = 5000')
    this.db.pragma('foreign_keys = ON')
    runMigrations(this.db)
  }

  close(): void {
    this.db.close()
  }

  // ── Mistake CRUD ──────────────────────────────────────

  async addMistake(mistake: Mistake): Promise<string> {
    this.db.prepare(`
      INSERT INTO mistakes (id, category, status, trigger_type, recurrence_count,
        context_before, context_after, ai_misunderstanding, user_intent, user_correction,
        agent_id, session_id, tags, confidence, graduated_to_rule,
        created_at, updated_at, archived_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      mistake.id, mistake.category, mistake.status, mistake.trigger_type,
      mistake.recurrence_count,
      mistake.context_before, mistake.context_after ?? null,
      mistake.ai_misunderstanding ?? null, mistake.user_intent ?? null,
      mistake.user_correction ?? null,
      mistake.agent_id ?? null, mistake.session_id ?? null,
      JSON.stringify(mistake.tags), mistake.confidence,
      mistake.graduated_to_rule ?? null,
      mistake.created_at, mistake.updated_at, mistake.archived_at ?? null
    )
    // FTS5 同步
    this.db.prepare(`
      INSERT INTO mistakes_fts (id, category, ai_misunderstanding, user_intent, user_correction, tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      mistake.id, mistake.category,
      mistake.ai_misunderstanding ?? '',
      mistake.user_intent ?? '',
      mistake.user_correction ?? '',
      mistake.tags.join(' ')
    )
    return mistake.id
  }

  async getMistake(id: string): Promise<Mistake | null> {
    const row = this.db.prepare('SELECT * FROM mistakes WHERE id = ?').get(id) as any
    return row ? rowToMistake(row) : null
  }

  async updateMistake(id: string, updates: Partial<Mistake>): Promise<void> {
    const fields: string[] = []
    const values: any[] = []
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'tags') {
        fields.push(`${key} = ?`)
        values.push(JSON.stringify(value))
      } else {
        fields.push(`${key} = ?`)
        values.push(value)
      }
    }
    if (fields.length === 0) return
    values.push(id)
    this.db.prepare(`UPDATE mistakes SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    // 更新 FTS5
    if (updates.category || updates.ai_misunderstanding || updates.user_intent ||
        updates.user_correction || updates.tags) {
      const m = await this.getMistake(id)
      if (m) {
        this.db.prepare(`
          INSERT OR REPLACE INTO mistakes_fts (id, category, ai_misunderstanding, user_intent, user_correction, tags)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          m.id, m.category,
          m.ai_misunderstanding ?? '', m.user_intent ?? '',
          m.user_correction ?? '', m.tags.join(' ')
        )
      }
    }
  }

  async queryMistakes(filter: MistakeFilter): Promise<Mistake[]> {
    const conditions: string[] = []
    const values: any[] = []
    if (filter.category) { conditions.push('category = ?'); values.push(filter.category) }
    if (filter.status) { conditions.push('status = ?'); values.push(filter.status) }
    if (filter.agent_id) { conditions.push('agent_id = ?'); values.push(filter.agent_id) }
    if (filter.date_from) { conditions.push('created_at >= ?'); values.push(filter.date_from) }
    if (filter.date_to) { conditions.push('created_at <= ?'); values.push(filter.date_to) }
    if (filter.recurrence_min) { conditions.push('recurrence_count >= ?'); values.push(filter.recurrence_min) }

    let sql = 'SELECT * FROM mistakes'
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ')
    sql += ' ORDER BY created_at DESC'
    if (filter.limit) { sql += ' LIMIT ?'; values.push(filter.limit) }
    if (filter.offset) { sql += ' OFFSET ?'; values.push(filter.offset) }

    const rows = this.db.prepare(sql).all(...values) as any[]
    return rows.map(rowToMistake)
  }

  // ── Recurrence ────────────────────────────────────────

  async incrementRecurrence(category: string, agentId?: string): Promise<number> {
    let sql = 'SELECT COUNT(*) as cnt FROM mistakes WHERE category = ?'
    const params: any[] = [category]
    if (agentId) { sql += ' AND agent_id = ?'; params.push(agentId) }
    const row = this.db.prepare(sql).get(...params) as any
    return (row?.cnt ?? 0) + 1
  }

  // ── Links ─────────────────────────────────────────────

  async addLink(from: string, to: string, type: string, confidence: number = 1.0): Promise<void> {
    this.db.prepare(`
      INSERT OR IGNORE INTO mistake_links (from_id, to_id, link_type, confidence)
      VALUES (?, ?, ?, ?)
    `).run(from, to, type, confidence)
  }

  async getLinks(id: string, direction: LinkDirection = 'outbound'): Promise<MistakeLink[]> {
    if (direction === 'outbound') {
      return this.db.prepare('SELECT * FROM mistake_links WHERE from_id = ?').all(id) as any[]
    }
    if (direction === 'inbound') {
      return this.db.prepare('SELECT * FROM mistake_links WHERE to_id = ?').all(id) as any[]
    }
    return this.db.prepare(
      'SELECT * FROM mistake_links WHERE from_id = ? OR to_id = ?'
    ).all(id, id) as any[]
  }

  async getRelated(id: string, depth: number = 2): Promise<MistakeLink[]> {
    const rows = this.db.prepare(`
      WITH RECURSIVE related AS (
        SELECT to_id AS id, from_id AS source_id, link_type, confidence, 1 AS depth
        FROM mistake_links WHERE from_id = ?
        UNION ALL
        SELECT ml.to_id, ml.from_id, ml.link_type, ml.confidence, r.depth + 1
        FROM mistake_links ml
        JOIN related r ON ml.from_id = r.id
        WHERE r.depth < ?
      )
      SELECT id, source_id, link_type, confidence, depth FROM related
    `).all(id, depth) as any[]
    return rows.map(r => ({
      from_id: r.source_id,
      to_id: r.id,
      link_type: r.link_type,
      confidence: r.confidence,
      created_at: '',
    }))
  }

  // ── Rules ─────────────────────────────────────────────

  async addRule(rule: Rule): Promise<string> {
    this.db.prepare(`
      INSERT INTO rules (id, category, rule_text, priority, source_count, source_ids,
        verified_count, fail_count, status, superseded_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rule.id, rule.category, rule.rule_text, rule.priority,
      rule.source_count, JSON.stringify(rule.source_ids),
      rule.verified_count, rule.fail_count,
      rule.status, rule.superseded_by ?? null,
      rule.created_at, rule.updated_at
    )
    return rule.id
  }

  async getRules(filter?: RuleFilter): Promise<Rule[]> {
    const conditions: string[] = []
    const values: any[] = []
    if (filter?.category) { conditions.push('category = ?'); values.push(filter.category) }
    if (filter?.priority) { conditions.push('priority = ?'); values.push(filter.priority) }
    if (filter?.status) { conditions.push('status = ?'); values.push(filter.status) }

    let sql = 'SELECT * FROM rules'
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ')
    sql += ' ORDER BY created_at DESC'
    if (filter?.limit) { sql += ' LIMIT ?'; values.push(filter.limit) }
    if (filter?.offset) { sql += ' OFFSET ?'; values.push(filter.offset) }

    const rows = this.db.prepare(sql).all(...values) as any[]
    return rows.map(rowToRule)
  }

  async updateRule(id: string, updates: Partial<Rule>): Promise<void> {
    const fields: string[] = []
    const values: any[] = []
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'source_ids') {
        fields.push(`${key} = ?`)
        values.push(JSON.stringify(value))
      } else {
        fields.push(`${key} = ?`)
        values.push(value)
      }
    }
    if (fields.length === 0) return
    values.push(id)
    this.db.prepare(`UPDATE rules SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  // ── Verification ──────────────────────────────────────

  async addVerification(verification: Verification): Promise<void> {
    this.db.prepare(`
      INSERT INTO verifications (rule_id, result, context, agent_id, verified_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      verification.rule_id, verification.result,
      verification.context ?? null,
      verification.agent_id ?? null,
      verification.verified_at
    )
  }

  async getVerificationCount(ruleId: string): Promise<VerificationCount> {
    const rows = this.db.prepare(
      'SELECT result, COUNT(*) as cnt FROM verifications WHERE rule_id = ? GROUP BY result'
    ).all(ruleId) as any[]
    let pass = 0, fail = 0
    for (const row of rows) {
      if (row.result === 'pass') pass = row.cnt
      else fail = row.cnt
    }
    return { pass, fail }
  }

  // ── Reflection ────────────────────────────────────────

  async addReflection(reflection: Reflection): Promise<string> {
    this.db.prepare(`
      INSERT INTO reflections (id, date, summary, new_rule_ids, hot_categories, stats, agent_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reflection.id, reflection.date, reflection.summary,
      JSON.stringify(reflection.new_rule_ids),
      JSON.stringify(reflection.hot_categories),
      JSON.stringify(reflection.stats),
      reflection.agent_id ?? null,
      reflection.created_at
    )
    return reflection.id
  }

  async getReflections(filter?: ReflectionFilter): Promise<Reflection[]> {
    const conditions: string[] = []
    const values: any[] = []
    if (filter?.date_from) { conditions.push('date >= ?'); values.push(filter.date_from) }
    if (filter?.date_to) { conditions.push('date <= ?'); values.push(filter.date_to) }
    if (filter?.agent_id) { conditions.push('agent_id = ?'); values.push(filter.agent_id) }

    let sql = 'SELECT * FROM reflections'
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ')
    sql += ' ORDER BY date DESC'
    if (filter?.limit) { sql += ' LIMIT ?'; values.push(filter.limit) }
    if (filter?.offset) { sql += ' OFFSET ?'; values.push(filter.offset) }

    const rows = this.db.prepare(sql).all(...values) as any[]
    return rows.map(rowToReflection)
  }

  // ── Stats ─────────────────────────────────────────────

  async getCategoryStats(agentId?: string): Promise<CategoryStats[]> {
    let sql = `SELECT category, COUNT(*) as count,
      SUM(recurrence_count) as recurrence_total, status
      FROM mistakes`
    const params: any[] = []
    if (agentId) { sql += ' WHERE agent_id = ?'; params.push(agentId) }
    sql += ' GROUP BY category, status'

    const rows = this.db.prepare(sql).all(...params) as any[]
    const map = new Map<string, CategoryStats>()
    for (const row of rows) {
      let entry = map.get(row.category)
      if (!entry) {
        entry = { category: row.category, count: 0, recurrence_total: 0, by_status: {} }
        map.set(row.category, entry)
      }
      entry.count += row.count
      entry.recurrence_total += (row.recurrence_total ?? 0)
      entry.by_status[row.status] = row.count
    }
    return Array.from(map.values())
  }

  async getOverallStats(agentId?: string, dateRange?: DateRange): Promise<OverallStats> {
    const conditions: string[] = []
    const params: any[] = []
    if (agentId) { conditions.push('agent_id = ?'); params.push(agentId) }
    if (dateRange?.from) { conditions.push('created_at >= ?'); params.push(dateRange.from) }
    if (dateRange?.to) { conditions.push('created_at <= ?'); params.push(dateRange.to) }
    const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : ''

    const rows = this.db.prepare(
      `SELECT status, category, COUNT(*) as cnt FROM mistakes${where} GROUP BY status, category`
    ).all(...params) as any[]

    const by_status: Record<string, number> = {}
    const by_category: Record<string, number> = {}
    let total = 0
    for (const row of rows) {
      by_status[row.status] = (by_status[row.status] ?? 0) + row.cnt
      by_category[row.category] = (by_category[row.category] ?? 0) + row.cnt
      total += row.cnt
    }

    const totalRules = (this.db.prepare('SELECT COUNT(*) as cnt FROM rules').get() as any)?.cnt ?? 0
    const totalVerifications = (this.db.prepare('SELECT COUNT(*) as cnt FROM verifications').get() as any)?.cnt ?? 0

    return { total, by_status, by_category, total_rules: totalRules, total_verifications: totalVerifications }
  }

  // ── Search ────────────────────────────────────────────

  async searchMistakes(query: string, limit: number = 20): Promise<Mistake[]> {
    const ftsRows = this.db.prepare(
      `SELECT id FROM mistakes_fts WHERE mistakes_fts MATCH ? ORDER BY rank LIMIT ?`
    ).all(query, limit) as any[]
    if (ftsRows.length === 0) return []

    const ids = ftsRows.map(r => r.id)
    const placeholders = ids.map(() => '?').join(',')
    const rows = this.db.prepare(
      `SELECT * FROM mistakes WHERE id IN (${placeholders})`
    ).all(...ids) as any[]
    return rows.map(rowToMistake)
  }

  // ── Lifecycle ─────────────────────────────────────────

  async archiveMistakes(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    const placeholders = ids.map(() => '?').join(',')
    const now = new Date().toISOString()
    const result = this.db.prepare(
      `UPDATE mistakes SET archived_at = ?, status = 'abandoned' WHERE id IN (${placeholders}) AND archived_at IS NULL`
    ).run(now, ...ids)
    return result.changes
  }

  async compactGraduated(category?: string): Promise<number> {
    const conditions = ["status = 'graduated'"]
    const params: any[] = []
    if (category) { conditions.push('category = ?'); params.push(category) }
    const sql = `DELETE FROM mistakes WHERE ${conditions.join(' AND ')}`
    const result = this.db.prepare(sql).run(...params)
    return result.changes
  }

  // ── Config ────────────────────────────────────────────

  async getConfig(key: string): Promise<unknown> {
    const row = this.db.prepare('SELECT value FROM config WHERE key = ?').get(key) as any
    if (!row) return null
    // 尝试 JSON 解析，但如果结果是基本类型变更（如 "1.0" → 1），保留原始字符串
    try {
      const parsed = JSON.parse(row.value)
      // 如果原始值是字符串且解析后类型变了，保留原始字符串
      if (typeof parsed !== 'string' && typeof row.value === 'string') {
        return row.value
      }
      return parsed
    } catch {
      return row.value
    }
  }

  async setConfig(key: string, value: unknown): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    this.db.prepare(
      'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)'
    ).run(key, serialized)
  }
}
