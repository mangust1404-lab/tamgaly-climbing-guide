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

/** French grade → numeric sort value (must match client GRADE_SORT_MAP) */
const GRADE_SORT_MAP: Record<string, number> = {
  '4': 30, '4a': 40, '4b': 50, '4c': 60,
  '5a': 70, '5a+': 75, '5b': 85, '5b+': 90, '5c': 100, '5c+': 105,
  '6a': 120, '6a+': 135, '6b': 150, '6b+': 170, '6c': 190, '6c+': 210,
  '7a': 240, '7a+': 270, '7b': 300, '7b+': 340, '7c': 380, '7c+': 420,
  '8a': 470, '8a+': 520,
}
function gradeToSort(grade: string): number {
  return GRADE_SORT_MAP[grade.toLowerCase().trim()] ?? 0
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
    // Recalculate gradeSort from grade to fix stale values
    if (c.grade) {
      const correctSort = gradeToSort(c.grade as string)
      if (correctSort > 0) c.gradeSort = correctSort
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
