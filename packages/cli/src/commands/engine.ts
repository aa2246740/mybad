import { SQLiteAdapter, MyBadEngine } from '@mybad/core'

const DEFAULT_DB = '~/.mybad/mybad.db'

export function getEngine(dbPath?: string): { engine: MyBadEngine; adapter: SQLiteAdapter } {
  const path = dbPath ?? process.env.MYBAD_DB_PATH ?? DEFAULT_DB
  const adapter = new SQLiteAdapter(path)
  const engine = new MyBadEngine(adapter)
  return { engine, adapter }
}
