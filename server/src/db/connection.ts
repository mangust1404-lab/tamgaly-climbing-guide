import Database from 'better-sqlite3'
import { join } from 'path'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'server', 'data', 'climbing.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  return db
}
