/**
 * Export all topo data from SQLite as a camelCase JSON object.
 * This is the SINGLE source of truth — topo-data.json is always
 * regenerated from SQLite after admin saves.
 *
 * The output format matches what refreshTopoData() on the client expects.
 */
import { getDb } from './connection'

/** Convert a snake_case DB row to camelCase for the client */
function toCamel(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    const camel = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
    out[camel] = v
  }
  return out
}

/** Parse a JSON string field, returning null if invalid */
function parseJson(val: unknown): unknown {
  if (typeof val !== 'string' || !val) return null
  try { return JSON.parse(val) } catch { return null }
}

export function exportTopoDataFromDb(): Record<string, unknown> {
  const db = getDb()

  const areas = db.prepare('SELECT * FROM area').all()
    .map(r => toCamel(r as Record<string, unknown>))

  const rawSectors = db.prepare('SELECT * FROM sector ORDER BY sort_order').all()
  const sectors = rawSectors.map(r => toCamel(r as Record<string, unknown>))

  const rawRoutes = db.prepare("SELECT * FROM route WHERE status = 'published' ORDER BY grade_sort").all()
  const routes = rawRoutes.map(r => {
    const c = toCamel(r as Record<string, unknown>) as any
    // Parse JSON array fields
    const jsonFields = ['terrainTags', 'holdTypes', 'tags', 'pitchGrades']
    for (const f of jsonFields) {
      const parsed = parseJson(c[f])
      if (parsed) c[f] = parsed
      else if (c[f] !== undefined && c[f] !== null) delete c[f]
    }
    return c
  })

  const topos = db.prepare('SELECT * FROM topo ORDER BY sort_order').all()
    .map(r => toCamel(r as Record<string, unknown>))

  const topoRoutes = db.prepare('SELECT * FROM topo_route').all()
    .map(r => toCamel(r as Record<string, unknown>))

  // Build sectorCovers map from sector cover_image_url
  const sectorCovers: Record<string, string> = {}
  for (const s of sectors as any[]) {
    if (s.coverImageUrl) sectorCovers[s.id as string] = s.coverImageUrl as string
  }

  return {
    version: Date.now(),
    exportedAt: new Date().toISOString(),
    areas,
    sectors,
    routes,
    topos,
    topoRoutes,
    sectorCovers,
  }
}
