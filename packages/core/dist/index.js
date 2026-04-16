"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  MemoryAdapter: () => MemoryAdapter,
  RULE_VALID_TRANSITIONS: () => RULE_VALID_TRANSITIONS,
  SQLiteAdapter: () => SQLiteAdapter,
  VALID_TRANSITIONS: () => VALID_TRANSITIONS,
  isValidRuleTransition: () => isValidRuleTransition,
  isValidTransition: () => isValidTransition,
  runMigrations: () => runMigrations
});
module.exports = __toCommonJS(index_exports);

// src/models/state-machine.ts
var VALID_TRANSITIONS = {
  pending: ["corrected", "abandoned", "false_positive"],
  corrected: ["recurring", "verified", "abandoned"],
  recurring: ["corrected", "verified", "abandoned"],
  verified: ["graduated", "abandoned"],
  graduated: [],
  // 终态
  abandoned: [],
  // 终态
  false_positive: []
  // 终态
};
var RULE_VALID_TRANSITIONS = {
  active: ["verified", "superseded", "archived"],
  verified: ["superseded", "archived"],
  superseded: [],
  // 终态
  archived: []
  // 终态
};
function isValidTransition(from, to) {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}
function isValidRuleTransition(from, to) {
  const allowed = RULE_VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

// src/storage/sqlite.ts
var import_better_sqlite3 = __toESM(require("better-sqlite3"));

// src/storage/migrations.ts
var migrations = [
  {
    id: 1,
    name: "001_init",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS mistakes (
          id                TEXT PRIMARY KEY,
          category          TEXT NOT NULL,
          status            TEXT NOT NULL DEFAULT 'pending',
          trigger_type      TEXT NOT NULL,
          recurrence_count  INTEGER NOT NULL DEFAULT 1,
          context_before    TEXT NOT NULL,
          context_after     TEXT,
          ai_misunderstanding TEXT,
          user_intent       TEXT,
          user_correction   TEXT,
          agent_id          TEXT,
          session_id        TEXT,
          tags              TEXT NOT NULL DEFAULT '[]',
          confidence        REAL DEFAULT 1.0,
          graduated_to_rule TEXT REFERENCES rules(id),
          created_at        TEXT NOT NULL,
          updated_at        TEXT NOT NULL,
          archived_at       TEXT
        );

        CREATE TABLE IF NOT EXISTS mistake_links (
          from_id    TEXT NOT NULL REFERENCES mistakes(id) ON DELETE CASCADE,
          to_id      TEXT NOT NULL REFERENCES mistakes(id) ON DELETE CASCADE,
          link_type  TEXT NOT NULL,
          confidence REAL DEFAULT 1.0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (from_id, to_id, link_type)
        );

        CREATE TABLE IF NOT EXISTS rules (
          id              TEXT PRIMARY KEY,
          category        TEXT NOT NULL,
          rule_text       TEXT NOT NULL,
          priority        TEXT NOT NULL DEFAULT 'normal',
          source_count    INTEGER NOT NULL DEFAULT 1,
          source_ids      TEXT NOT NULL DEFAULT '[]',
          verified_count  INTEGER NOT NULL DEFAULT 0,
          fail_count      INTEGER NOT NULL DEFAULT 0,
          status          TEXT NOT NULL DEFAULT 'active',
          superseded_by   TEXT REFERENCES rules(id),
          created_at      TEXT NOT NULL,
          updated_at      TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS verifications (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          rule_id     TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
          result      TEXT NOT NULL,
          context     TEXT,
          agent_id    TEXT,
          verified_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS reflections (
          id              TEXT PRIMARY KEY,
          date            TEXT NOT NULL UNIQUE,
          summary         TEXT NOT NULL,
          new_rule_ids    TEXT DEFAULT '[]',
          hot_categories  TEXT DEFAULT '[]',
          stats           TEXT NOT NULL,
          agent_id        TEXT,
          created_at      TEXT NOT NULL
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS mistakes_fts USING fts5(
          id, category, ai_misunderstanding, user_intent, user_correction, tags
        );

        CREATE INDEX IF NOT EXISTS idx_mistakes_category ON mistakes(category);
        CREATE INDEX IF NOT EXISTS idx_mistakes_status ON mistakes(status);
        CREATE INDEX IF NOT EXISTS idx_mistakes_agent ON mistakes(agent_id);
        CREATE INDEX IF NOT EXISTS idx_mistakes_created ON mistakes(created_at);
        CREATE INDEX IF NOT EXISTS idx_rules_category ON rules(category);
        CREATE INDEX IF NOT EXISTS idx_rules_status ON rules(status);
        CREATE INDEX IF NOT EXISTS idx_verifications_rule ON verifications(rule_id);
        CREATE INDEX IF NOT EXISTS idx_reflections_date ON reflections(date);

        CREATE TABLE IF NOT EXISTS config (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    }
  }
];
function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  const applied = new Set(
    db.prepare("SELECT name FROM migrations").all().map((r) => r.name)
  );
  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      const run = db.transaction(() => {
        migration.up(db);
        db.prepare("INSERT INTO migrations (id, name) VALUES (?, ?)").run(
          migration.id,
          migration.name
        );
      });
      run();
    }
  }
}

// src/storage/sqlite.ts
function safeParseJson(text, fallback) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
function rowToMistake(row) {
  return {
    ...row,
    tags: safeParseJson(row.tags, []),
    recurrence_count: row.recurrence_count ?? 1,
    confidence: row.confidence ?? 1
  };
}
function rowToRule(row) {
  return {
    ...row,
    source_ids: safeParseJson(row.source_ids, [])
  };
}
function rowToReflection(row) {
  return {
    ...row,
    new_rule_ids: safeParseJson(row.new_rule_ids, []),
    hot_categories: safeParseJson(row.hot_categories, []),
    stats: safeParseJson(row.stats, {})
  };
}
var SQLiteAdapter = class {
  db;
  constructor(dbPath) {
    this.db = new import_better_sqlite3.default(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("foreign_keys = ON");
    runMigrations(this.db);
  }
  close() {
    this.db.close();
  }
  // ── Mistake CRUD ──────────────────────────────────────
  async addMistake(mistake) {
    this.db.prepare(`
      INSERT INTO mistakes (id, category, status, trigger_type, recurrence_count,
        context_before, context_after, ai_misunderstanding, user_intent, user_correction,
        agent_id, session_id, tags, confidence, graduated_to_rule,
        created_at, updated_at, archived_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      mistake.id,
      mistake.category,
      mistake.status,
      mistake.trigger_type,
      mistake.recurrence_count,
      mistake.context_before,
      mistake.context_after ?? null,
      mistake.ai_misunderstanding ?? null,
      mistake.user_intent ?? null,
      mistake.user_correction ?? null,
      mistake.agent_id ?? null,
      mistake.session_id ?? null,
      JSON.stringify(mistake.tags),
      mistake.confidence,
      mistake.graduated_to_rule ?? null,
      mistake.created_at,
      mistake.updated_at,
      mistake.archived_at ?? null
    );
    this.db.prepare(`
      INSERT INTO mistakes_fts (id, category, ai_misunderstanding, user_intent, user_correction, tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      mistake.id,
      mistake.category,
      mistake.ai_misunderstanding ?? "",
      mistake.user_intent ?? "",
      mistake.user_correction ?? "",
      mistake.tags.join(" ")
    );
    return mistake.id;
  }
  async getMistake(id) {
    const row = this.db.prepare("SELECT * FROM mistakes WHERE id = ?").get(id);
    return row ? rowToMistake(row) : null;
  }
  async updateMistake(id, updates) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
      if (key === "tags") {
        fields.push(`${key} = ?`);
        values.push(JSON.stringify(value));
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (fields.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE mistakes SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    if (updates.category || updates.ai_misunderstanding || updates.user_intent || updates.user_correction || updates.tags) {
      const m = await this.getMistake(id);
      if (m) {
        this.db.prepare(`
          INSERT OR REPLACE INTO mistakes_fts (id, category, ai_misunderstanding, user_intent, user_correction, tags)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          m.id,
          m.category,
          m.ai_misunderstanding ?? "",
          m.user_intent ?? "",
          m.user_correction ?? "",
          m.tags.join(" ")
        );
      }
    }
  }
  async queryMistakes(filter) {
    const conditions = [];
    const values = [];
    if (filter.category) {
      conditions.push("category = ?");
      values.push(filter.category);
    }
    if (filter.status) {
      conditions.push("status = ?");
      values.push(filter.status);
    }
    if (filter.agent_id) {
      conditions.push("agent_id = ?");
      values.push(filter.agent_id);
    }
    if (filter.date_from) {
      conditions.push("created_at >= ?");
      values.push(filter.date_from);
    }
    if (filter.date_to) {
      conditions.push("created_at <= ?");
      values.push(filter.date_to);
    }
    if (filter.recurrence_min) {
      conditions.push("recurrence_count >= ?");
      values.push(filter.recurrence_min);
    }
    let sql = "SELECT * FROM mistakes";
    if (conditions.length > 0) sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY created_at DESC";
    if (filter.limit) {
      sql += " LIMIT ?";
      values.push(filter.limit);
    }
    if (filter.offset) {
      sql += " OFFSET ?";
      values.push(filter.offset);
    }
    const rows = this.db.prepare(sql).all(...values);
    return rows.map(rowToMistake);
  }
  // ── Recurrence ────────────────────────────────────────
  async incrementRecurrence(category, agentId) {
    let sql = "SELECT COUNT(*) as cnt FROM mistakes WHERE category = ?";
    const params = [category];
    if (agentId) {
      sql += " AND agent_id = ?";
      params.push(agentId);
    }
    const row = this.db.prepare(sql).get(...params);
    return (row?.cnt ?? 0) + 1;
  }
  // ── Links ─────────────────────────────────────────────
  async addLink(from, to, type, confidence = 1) {
    this.db.prepare(`
      INSERT OR IGNORE INTO mistake_links (from_id, to_id, link_type, confidence)
      VALUES (?, ?, ?, ?)
    `).run(from, to, type, confidence);
  }
  async getLinks(id, direction = "outbound") {
    if (direction === "outbound") {
      return this.db.prepare("SELECT * FROM mistake_links WHERE from_id = ?").all(id);
    }
    if (direction === "inbound") {
      return this.db.prepare("SELECT * FROM mistake_links WHERE to_id = ?").all(id);
    }
    return this.db.prepare(
      "SELECT * FROM mistake_links WHERE from_id = ? OR to_id = ?"
    ).all(id, id);
  }
  async getRelated(id, depth = 2) {
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
    `).all(id, depth);
    return rows.map((r) => ({
      from_id: r.source_id,
      to_id: r.id,
      link_type: r.link_type,
      confidence: r.confidence,
      created_at: ""
    }));
  }
  // ── Rules ─────────────────────────────────────────────
  async addRule(rule) {
    this.db.prepare(`
      INSERT INTO rules (id, category, rule_text, priority, source_count, source_ids,
        verified_count, fail_count, status, superseded_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rule.id,
      rule.category,
      rule.rule_text,
      rule.priority,
      rule.source_count,
      JSON.stringify(rule.source_ids),
      rule.verified_count,
      rule.fail_count,
      rule.status,
      rule.superseded_by ?? null,
      rule.created_at,
      rule.updated_at
    );
    return rule.id;
  }
  async getRules(filter) {
    const conditions = [];
    const values = [];
    if (filter?.category) {
      conditions.push("category = ?");
      values.push(filter.category);
    }
    if (filter?.priority) {
      conditions.push("priority = ?");
      values.push(filter.priority);
    }
    if (filter?.status) {
      conditions.push("status = ?");
      values.push(filter.status);
    }
    let sql = "SELECT * FROM rules";
    if (conditions.length > 0) sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY created_at DESC";
    if (filter?.limit) {
      sql += " LIMIT ?";
      values.push(filter.limit);
    }
    if (filter?.offset) {
      sql += " OFFSET ?";
      values.push(filter.offset);
    }
    const rows = this.db.prepare(sql).all(...values);
    return rows.map(rowToRule);
  }
  async updateRule(id, updates) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
      if (key === "source_ids") {
        fields.push(`${key} = ?`);
        values.push(JSON.stringify(value));
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (fields.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE rules SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  }
  // ── Verification ──────────────────────────────────────
  async addVerification(verification) {
    this.db.prepare(`
      INSERT INTO verifications (rule_id, result, context, agent_id, verified_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      verification.rule_id,
      verification.result,
      verification.context ?? null,
      verification.agent_id ?? null,
      verification.verified_at
    );
  }
  async getVerificationCount(ruleId) {
    const rows = this.db.prepare(
      "SELECT result, COUNT(*) as cnt FROM verifications WHERE rule_id = ? GROUP BY result"
    ).all(ruleId);
    let pass = 0, fail = 0;
    for (const row of rows) {
      if (row.result === "pass") pass = row.cnt;
      else fail = row.cnt;
    }
    return { pass, fail };
  }
  // ── Reflection ────────────────────────────────────────
  async addReflection(reflection) {
    this.db.prepare(`
      INSERT INTO reflections (id, date, summary, new_rule_ids, hot_categories, stats, agent_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reflection.id,
      reflection.date,
      reflection.summary,
      JSON.stringify(reflection.new_rule_ids),
      JSON.stringify(reflection.hot_categories),
      JSON.stringify(reflection.stats),
      reflection.agent_id ?? null,
      reflection.created_at
    );
    return reflection.id;
  }
  async getReflections(filter) {
    const conditions = [];
    const values = [];
    if (filter?.date_from) {
      conditions.push("date >= ?");
      values.push(filter.date_from);
    }
    if (filter?.date_to) {
      conditions.push("date <= ?");
      values.push(filter.date_to);
    }
    if (filter?.agent_id) {
      conditions.push("agent_id = ?");
      values.push(filter.agent_id);
    }
    let sql = "SELECT * FROM reflections";
    if (conditions.length > 0) sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY date DESC";
    if (filter?.limit) {
      sql += " LIMIT ?";
      values.push(filter.limit);
    }
    if (filter?.offset) {
      sql += " OFFSET ?";
      values.push(filter.offset);
    }
    const rows = this.db.prepare(sql).all(...values);
    return rows.map(rowToReflection);
  }
  // ── Stats ─────────────────────────────────────────────
  async getCategoryStats(agentId) {
    let sql = `SELECT category, COUNT(*) as count,
      SUM(recurrence_count) as recurrence_total, status
      FROM mistakes`;
    const params = [];
    if (agentId) {
      sql += " WHERE agent_id = ?";
      params.push(agentId);
    }
    sql += " GROUP BY category, status";
    const rows = this.db.prepare(sql).all(...params);
    const map = /* @__PURE__ */ new Map();
    for (const row of rows) {
      let entry = map.get(row.category);
      if (!entry) {
        entry = { category: row.category, count: 0, recurrence_total: 0, by_status: {} };
        map.set(row.category, entry);
      }
      entry.count += row.count;
      entry.recurrence_total += row.recurrence_total ?? 0;
      entry.by_status[row.status] = row.count;
    }
    return Array.from(map.values());
  }
  async getOverallStats(agentId, dateRange) {
    const conditions = [];
    const params = [];
    if (agentId) {
      conditions.push("agent_id = ?");
      params.push(agentId);
    }
    if (dateRange?.from) {
      conditions.push("created_at >= ?");
      params.push(dateRange.from);
    }
    if (dateRange?.to) {
      conditions.push("created_at <= ?");
      params.push(dateRange.to);
    }
    const where = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
    const rows = this.db.prepare(
      `SELECT status, category, COUNT(*) as cnt FROM mistakes${where} GROUP BY status, category`
    ).all(...params);
    const by_status = {};
    const by_category = {};
    let total = 0;
    for (const row of rows) {
      by_status[row.status] = (by_status[row.status] ?? 0) + row.cnt;
      by_category[row.category] = (by_category[row.category] ?? 0) + row.cnt;
      total += row.cnt;
    }
    const totalRules = this.db.prepare("SELECT COUNT(*) as cnt FROM rules").get()?.cnt ?? 0;
    const totalVerifications = this.db.prepare("SELECT COUNT(*) as cnt FROM verifications").get()?.cnt ?? 0;
    return { total, by_status, by_category, total_rules: totalRules, total_verifications: totalVerifications };
  }
  // ── Search ────────────────────────────────────────────
  async searchMistakes(query, limit = 20) {
    const ftsRows = this.db.prepare(
      `SELECT id FROM mistakes_fts WHERE mistakes_fts MATCH ? ORDER BY rank LIMIT ?`
    ).all(query, limit);
    if (ftsRows.length === 0) return [];
    const ids = ftsRows.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(",");
    const rows = this.db.prepare(
      `SELECT * FROM mistakes WHERE id IN (${placeholders})`
    ).all(...ids);
    return rows.map(rowToMistake);
  }
  // ── Lifecycle ─────────────────────────────────────────
  async archiveMistakes(ids) {
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => "?").join(",");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const result = this.db.prepare(
      `UPDATE mistakes SET archived_at = ?, status = 'abandoned' WHERE id IN (${placeholders}) AND archived_at IS NULL`
    ).run(now, ...ids);
    return result.changes;
  }
  async compactGraduated(category) {
    const conditions = ["status = 'graduated'"];
    const params = [];
    if (category) {
      conditions.push("category = ?");
      params.push(category);
    }
    const sql = `DELETE FROM mistakes WHERE ${conditions.join(" AND ")}`;
    const result = this.db.prepare(sql).run(...params);
    return result.changes;
  }
  // ── Config ────────────────────────────────────────────
  async getConfig(key) {
    const row = this.db.prepare("SELECT value FROM config WHERE key = ?").get(key);
    if (!row) return null;
    return safeParseJson(row.value, row.value);
  }
  async setConfig(key, value) {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    this.db.prepare(
      "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)"
    ).run(key, serialized);
  }
};

// src/storage/memory.ts
var MemoryAdapter = class {
  mistakes = /* @__PURE__ */ new Map();
  rules = /* @__PURE__ */ new Map();
  links = [];
  verifications = [];
  reflections = /* @__PURE__ */ new Map();
  config = /* @__PURE__ */ new Map();
  // ── Mistake CRUD ──────────────────────────────────────
  async addMistake(mistake) {
    this.mistakes.set(mistake.id, mistake);
    return mistake.id;
  }
  async getMistake(id) {
    return this.mistakes.get(id) ?? null;
  }
  async updateMistake(id, updates) {
    const existing = this.mistakes.get(id);
    if (!existing) return;
    this.mistakes.set(id, { ...existing, ...updates });
  }
  async queryMistakes(filter) {
    let results = Array.from(this.mistakes.values());
    if (filter.category) results = results.filter((m) => m.category === filter.category);
    if (filter.status) results = results.filter((m) => m.status === filter.status);
    if (filter.agent_id) results = results.filter((m) => m.agent_id === filter.agent_id);
    if (filter.date_from) results = results.filter((m) => m.created_at >= filter.date_from);
    if (filter.date_to) results = results.filter((m) => m.created_at <= filter.date_to);
    if (filter.recurrence_min) results = results.filter((m) => m.recurrence_count >= filter.recurrence_min);
    results.sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (filter.offset) results = results.slice(filter.offset);
    if (filter.limit) results = results.slice(0, filter.limit);
    return results;
  }
  // ── Recurrence ────────────────────────────────────────
  async incrementRecurrence(category, agentId) {
    let count = 0;
    for (const m of this.mistakes.values()) {
      if (m.category === category && (!agentId || m.agent_id === agentId)) count++;
    }
    return count + 1;
  }
  // ── Links ─────────────────────────────────────────────
  async addLink(from, to, type, confidence = 1) {
    const exists = this.links.some(
      (l) => l.from_id === from && l.to_id === to && l.link_type === type
    );
    if (!exists) {
      this.links.push({
        from_id: from,
        to_id: to,
        link_type: type,
        confidence,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  }
  async getLinks(id, direction = "outbound") {
    if (direction === "outbound") return this.links.filter((l) => l.from_id === id);
    if (direction === "inbound") return this.links.filter((l) => l.to_id === id);
    return this.links.filter((l) => l.from_id === id || l.to_id === id);
  }
  async getRelated(id, depth = 2) {
    const visited = /* @__PURE__ */ new Set([id]);
    const result = [];
    let frontier = [id];
    for (let d = 0; d < depth; d++) {
      const nextFrontier = [];
      for (const nodeId of frontier) {
        const outLinks = this.links.filter((l) => l.from_id === nodeId);
        for (const link of outLinks) {
          if (!visited.has(link.to_id)) {
            visited.add(link.to_id);
            result.push(link);
            nextFrontier.push(link.to_id);
          }
        }
      }
      frontier = nextFrontier;
    }
    return result;
  }
  // ── Rules ─────────────────────────────────────────────
  async addRule(rule) {
    this.rules.set(rule.id, rule);
    return rule.id;
  }
  async getRules(filter) {
    let results = Array.from(this.rules.values());
    if (filter?.category) results = results.filter((r) => r.category === filter.category);
    if (filter?.priority) results = results.filter((r) => r.priority === filter.priority);
    if (filter?.status) results = results.filter((r) => r.status === filter.status);
    results.sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (filter?.offset) results = results.slice(filter.offset);
    if (filter?.limit) results = results.slice(0, filter.limit);
    return results;
  }
  async updateRule(id, updates) {
    const existing = this.rules.get(id);
    if (!existing) return;
    this.rules.set(id, { ...existing, ...updates });
  }
  // ── Verification ──────────────────────────────────────
  async addVerification(verification) {
    this.verifications.push(verification);
  }
  async getVerificationCount(ruleId) {
    let pass = 0, fail = 0;
    for (const v of this.verifications) {
      if (v.rule_id === ruleId) {
        if (v.result === "pass") pass++;
        else fail++;
      }
    }
    return { pass, fail };
  }
  // ── Reflection ────────────────────────────────────────
  async addReflection(reflection) {
    this.reflections.set(reflection.id, reflection);
    return reflection.id;
  }
  async getReflections(filter) {
    let results = Array.from(this.reflections.values());
    if (filter?.date_from) results = results.filter((r) => r.date >= filter.date_from);
    if (filter?.date_to) results = results.filter((r) => r.date <= filter.date_to);
    if (filter?.agent_id) results = results.filter((r) => r.agent_id === filter.agent_id);
    results.sort((a, b) => b.date.localeCompare(a.date));
    if (filter?.offset) results = results.slice(filter.offset);
    if (filter?.limit) results = results.slice(0, filter.limit);
    return results;
  }
  // ── Stats ─────────────────────────────────────────────
  async getCategoryStats(agentId) {
    const map = /* @__PURE__ */ new Map();
    for (const m of this.mistakes.values()) {
      if (agentId && m.agent_id !== agentId) continue;
      let entry = map.get(m.category);
      if (!entry) {
        entry = { category: m.category, count: 0, recurrence_total: 0, by_status: {} };
        map.set(m.category, entry);
      }
      entry.count++;
      entry.recurrence_total += m.recurrence_count;
      entry.by_status[m.status] = (entry.by_status[m.status] ?? 0) + 1;
    }
    return Array.from(map.values());
  }
  async getOverallStats(agentId, dateRange) {
    const by_status = {};
    const by_category = {};
    let total = 0;
    for (const m of this.mistakes.values()) {
      if (agentId && m.agent_id !== agentId) continue;
      if (dateRange?.from && m.created_at < dateRange.from) continue;
      if (dateRange?.to && m.created_at > dateRange.to) continue;
      by_status[m.status] = (by_status[m.status] ?? 0) + 1;
      by_category[m.category] = (by_category[m.category] ?? 0) + 1;
      total++;
    }
    return {
      total,
      by_status,
      by_category,
      total_rules: this.rules.size,
      total_verifications: this.verifications.length
    };
  }
  // ── Search ────────────────────────────────────────────
  async searchMistakes(query, limit = 20) {
    const q = query.toLowerCase();
    const results = [];
    for (const m of this.mistakes.values()) {
      const searchable = [
        m.category,
        m.ai_misunderstanding ?? "",
        m.user_intent ?? "",
        m.user_correction ?? "",
        ...m.tags
      ].join(" ").toLowerCase();
      if (searchable.includes(q)) {
        results.push(m);
        if (results.length >= limit) break;
      }
    }
    return results;
  }
  // ── Lifecycle ─────────────────────────────────────────
  async archiveMistakes(ids) {
    let count = 0;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    for (const id of ids) {
      const m = this.mistakes.get(id);
      if (m && !m.archived_at) {
        this.mistakes.set(id, { ...m, archived_at: now, status: "abandoned" });
        count++;
      }
    }
    return count;
  }
  async compactGraduated(category) {
    let count = 0;
    for (const [id, m] of this.mistakes) {
      if (m.status === "graduated" && (!category || m.category === category)) {
        this.mistakes.delete(id);
        count++;
      }
    }
    return count;
  }
  // ── Config ────────────────────────────────────────────
  async getConfig(key) {
    return this.config.get(key) ?? null;
  }
  async setConfig(key, value) {
    this.config.set(key, value);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MemoryAdapter,
  RULE_VALID_TRANSITIONS,
  SQLiteAdapter,
  VALID_TRANSITIONS,
  isValidRuleTransition,
  isValidTransition,
  runMigrations
});
//# sourceMappingURL=index.js.map