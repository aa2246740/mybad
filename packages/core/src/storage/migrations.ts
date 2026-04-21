import type { Database } from 'better-sqlite3'

/** Migration 记录 */
interface MigrationRecord {
  id: number
  name: string
  applied_at: string
}

/** Migration 定义 */
interface Migration {
  id: number
  name: string
  up: (db: Database) => void
}

const migrations: Migration[] = [
  {
    id: 1,
    name: '001_init',
    up(db: Database) {
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
      `)
    },
  },
  {
    id: 2,
    name: '002_coach_recommendations',
    up(db: Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS coach_recommendations (
          id                TEXT PRIMARY KEY,
          category          TEXT NOT NULL,
          pattern_summary   TEXT NOT NULL,
          suggested_rule    TEXT NOT NULL,
          target_file_type  TEXT NOT NULL DEFAULT 'CLAUDE.md',
          target_file_path  TEXT,
          insertion_text    TEXT,
          clarity           TEXT NOT NULL DEFAULT 'ambiguous',
          status            TEXT NOT NULL DEFAULT 'pending',
          source_mistake_ids TEXT NOT NULL DEFAULT '[]',
          correction_count  INTEGER NOT NULL DEFAULT 1,
          applied_at        TEXT,
          confirmed_by      TEXT,
          failure_reason    TEXT,
          created_at        TEXT NOT NULL,
          updated_at        TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_coach_category ON coach_recommendations(category);
        CREATE INDEX IF NOT EXISTS idx_coach_status ON coach_recommendations(status);
        CREATE INDEX IF NOT EXISTS idx_coach_clarity ON coach_recommendations(clarity);
      `)
    },
  },
  {
    id: 3,
    name: '003_adapter_extensions',
    up(db: Database) {
      db.exec(`
        -- 规则追踪表：记录规则的触发/遵守/违反次数
        CREATE TABLE IF NOT EXISTS rule_tracking (
          id                TEXT PRIMARY KEY,
          recommendation_id TEXT NOT NULL REFERENCES coach_recommendations(id) ON DELETE CASCADE,
          category          TEXT NOT NULL,
          scope             TEXT NOT NULL DEFAULT 'project',
          triggered_count   INTEGER NOT NULL DEFAULT 0,
          obeyed_count      INTEGER NOT NULL DEFAULT 0,
          violated_count    INTEGER NOT NULL DEFAULT 0,
          confidence        REAL NOT NULL DEFAULT 0.0,
          lifecycle         TEXT NOT NULL DEFAULT 'active',
          created_at        TEXT NOT NULL,
          last_triggered_at TEXT,
          last_violated_at  TEXT,
          last_checked_at   TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_tracking_category ON rule_tracking(category);
        CREATE INDEX IF NOT EXISTS idx_tracking_lifecycle ON rule_tracking(lifecycle);
        CREATE INDEX IF NOT EXISTS idx_tracking_recommendation ON rule_tracking(recommendation_id);

        -- 规则冲突记录表
        CREATE TABLE IF NOT EXISTS rule_conflicts (
          id                TEXT PRIMARY KEY,
          category          TEXT NOT NULL,
          winner_scope      TEXT NOT NULL,
          winner_rule_id    TEXT NOT NULL,
          winner_rule_text  TEXT NOT NULL,
          loser_scope       TEXT NOT NULL,
          loser_rule_id     TEXT NOT NULL,
          loser_rule_text   TEXT NOT NULL,
          resolved_at       TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_conflicts_category ON rule_conflicts(category);

        -- 执行规则表：存储可执行的确定性规则模式
        CREATE TABLE IF NOT EXISTS enforcement_rules (
          id                  TEXT PRIMARY KEY,
          category            TEXT NOT NULL,
          recommendation_id   TEXT NOT NULL REFERENCES coach_recommendations(id) ON DELETE CASCADE,
          trigger_tool        TEXT NOT NULL,
          trigger_pattern     TEXT NOT NULL,
          trigger_mcp_tool    TEXT,
          action              TEXT NOT NULL DEFAULT 'warn',
          message             TEXT NOT NULL,
          confidence          REAL NOT NULL DEFAULT 0.0,
          created_from        TEXT NOT NULL DEFAULT 'coach_auto',
          created_at          TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_enforcement_category ON enforcement_rules(category);
        CREATE INDEX IF NOT EXISTS idx_enforcement_action ON enforcement_rules(action);

        -- Coach 推荐表扩展：新增 scope 字段
        ALTER TABLE coach_recommendations ADD COLUMN scope TEXT NOT NULL DEFAULT 'project';
      `)
    },
  },
  {
    id: 4,
    name: '004_platform_awareness',
    up(db: Database) {
      db.exec(`
        -- mistakes 表：记录是被哪个 Agent 平台纠正的
        ALTER TABLE mistakes ADD COLUMN platform TEXT;

        -- rules 表：规则属于哪个平台（NULL = 所有平台通用）
        ALTER TABLE rules ADD COLUMN platform TEXT;

        -- 索引
        CREATE INDEX IF NOT EXISTS idx_mistakes_platform ON mistakes(platform);
        CREATE INDEX IF NOT EXISTS idx_rules_platform ON rules(platform);
      `)
    },
  },
]

/** 执行全部 pending migrations */
export function runMigrations(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = new Set(
    db.prepare('SELECT name FROM migrations').all().map((r: any) => r.name)
  )

  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      const run = db.transaction(() => {
        migration.up(db)
        db.prepare('INSERT INTO migrations (id, name) VALUES (?, ?)').run(
          migration.id,
          migration.name
        )
      })
      run()
    }
  }
}
