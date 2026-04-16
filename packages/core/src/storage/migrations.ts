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
