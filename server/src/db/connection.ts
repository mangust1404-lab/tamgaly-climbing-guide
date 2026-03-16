import Database from 'better-sqlite3'
import { join } from 'path'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'server', 'data', 'climbing.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Auto-migrate: add route detail columns if missing
  const routeCols = db.prepare("PRAGMA table_info(route)").all() as { name: string }[]
  const colNames = new Set(routeCols.map(c => c.name))
  if (!colNames.has('quickdraws')) db.exec('ALTER TABLE route ADD COLUMN quickdraws INTEGER')
  if (!colNames.has('rope_length')) db.exec('ALTER TABLE route ADD COLUMN rope_length REAL')
  if (!colNames.has('terrain_tags')) db.exec('ALTER TABLE route ADD COLUMN terrain_tags TEXT')
  if (!colNames.has('hold_types')) db.exec('ALTER TABLE route ADD COLUMN hold_types TEXT')

  return db
}
