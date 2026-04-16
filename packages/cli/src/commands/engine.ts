import { SQLiteAdapter, MyBadEngine } from '@mybad/core'

const DEFAULT_DB = '~/.mybad/mybad.db'

export function getEngine(dbPath?: string): { engine: MyBadEngine; adapter: SQLiteAdapter } {
  const path = dbPath ?? process.env.MYBAD_DB_PATH ?? DEFAULT_DB
  const expanded = path.startsWith('~') ? path.replace('~', process.env.HOME ?? '~') : path
  const adapter = new SQLiteAdapter(expanded)
  const engine = new MyBadEngine(adapter)
  return { engine, adapter }
}
