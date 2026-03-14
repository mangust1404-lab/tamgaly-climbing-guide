/**
 * Seed the server database from topo-data.json (the source of truth).
 * This ensures route IDs match between client and server.
 *
 * Usage: npx tsx server/src/db/seed-from-topo.ts
 */
import { getDb } from './connection'
import { readFileSync } from 'fs'
import { join } from 'path'

const db = getDb()

const topoPath = join(process.cwd(), 'data', 'topo-data.json')
const data = JSON.parse(readFileSync(topoPath, 'utf-8'))

// Temporarily disable FK to allow re-seeding
db.pragma('foreign_keys = OFF')

// Clear existing data (preserve users but clear ascents since route IDs will change)
db.exec('DELETE FROM review')
db.exec('DELETE FROM ascent')
db.exec('DELETE FROM topo_route')
db.exec('DELETE FROM topo')
db.exec('DELETE FROM route')
db.exec('DELETE FROM sector')
db.exec('DELETE FROM area')

db.exec('BEGIN')

try {
  // Areas
  for (const area of data.areas || []) {
    db.prepare(`INSERT INTO area (id, name, slug, description, latitude, longitude, bbox_north, bbox_south, bbox_east, bbox_west, elevation_m, rock_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      area.id, area.name, area.slug, area.description || null,
      area.latitude, area.longitude,
      area.bboxNorth || null, area.bboxSouth || null, area.bboxEast || null, area.bboxWest || null,
      area.elevationM || null, area.rockType || null,
    )
  }

  // Sectors
  for (const sector of data.sectors || []) {
    db.prepare(`INSERT INTO sector (id, area_id, name, slug, description, latitude, longitude, orientation, sun_exposure, sort_order, approach_description, approach_time_min)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      sector.id, sector.areaId, sector.name, sector.slug, sector.description || null,
      sector.latitude, sector.longitude,
      sector.orientation || null, sector.sunExposure || null,
      sector.sortOrder || 0, sector.approachDescription || null, sector.approachTimeMin || null,
    )
  }

  // Routes
  for (const route of data.routes || []) {
    db.prepare(`INSERT INTO route (id, sector_id, name, slug, grade, grade_system, grade_sort, length_m, pitches, route_type, number_in_sector, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`).run(
      route.id, route.sectorId, route.name, route.slug,
      route.grade, route.gradeSystem || 'french', route.gradeSort || 0,
      route.lengthM || null, route.pitches || 1, route.routeType || 'sport',
      route.numberInSector || null,
    )
  }

  db.exec('COMMIT')
  db.pragma('foreign_keys = ON')
  console.log(`Seeded from topo-data.json: ${(data.areas || []).length} areas, ${(data.sectors || []).length} sectors, ${(data.routes || []).length} routes`)
} catch (err) {
  db.exec('ROLLBACK')
  console.error('Seed failed:', err)
  process.exit(1)
}
