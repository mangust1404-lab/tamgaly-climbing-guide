/**
 * Seed the server database from topo-data.json (the source of truth for routes/sectors/areas).
 * Uses UPSERT to preserve existing data (ascents, reviews, user-added fields).
 *
 * Usage: npx tsx server/src/db/seed-from-topo.ts
 */
import { getDb } from './connection'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const db = getDb()

// Try persistent volume first, then built-in copy
const volumePath = join(process.cwd(), 'server', 'data', 'topo-data.json')
const builtinPath = join(process.cwd(), 'data', 'topo-data.json')
const topoPath = existsSync(volumePath) ? volumePath : builtinPath

const data = JSON.parse(readFileSync(topoPath, 'utf-8'))

db.exec('BEGIN')

try {
  // Areas — upsert
  const upsertArea = db.prepare(`INSERT INTO area (id, name, slug, description, latitude, longitude, bbox_north, bbox_south, bbox_east, bbox_west, elevation_m, rock_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, slug=excluded.slug, description=excluded.description,
    latitude=excluded.latitude, longitude=excluded.longitude`)
  for (const area of data.areas || []) {
    upsertArea.run(
      area.id, area.name, area.slug, area.description || null,
      area.latitude, area.longitude,
      area.bboxNorth || null, area.bboxSouth || null, area.bboxEast || null, area.bboxWest || null,
      area.elevationM || null, area.rockType || null,
    )
  }

  // Sectors — upsert
  const upsertSector = db.prepare(`INSERT INTO sector (id, area_id, name, slug, description, latitude, longitude, orientation, sun_exposure, sort_order, approach_description, approach_time_min)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, slug=excluded.slug, description=excluded.description,
    latitude=excluded.latitude, longitude=excluded.longitude, orientation=excluded.orientation,
    sun_exposure=excluded.sun_exposure, sort_order=excluded.sort_order,
    approach_description=excluded.approach_description, approach_time_min=excluded.approach_time_min`)
  for (const sector of data.sectors || []) {
    upsertSector.run(
      sector.id, sector.areaId, sector.name, sector.slug, sector.description || null,
      sector.latitude, sector.longitude,
      sector.orientation || null, sector.sunExposure || null,
      sector.sortOrder || 0, sector.approachDescription || null, sector.approachTimeMin || null,
    )
  }

  // Routes — upsert, preserving quickdraws/rope_length/terrain_tags/hold_types
  const upsertRoute = db.prepare(`INSERT INTO route (id, sector_id, name, slug, grade, grade_system, grade_sort, length_m, pitches, route_type, number_in_sector, status, quickdraws, rope_length, terrain_tags, hold_types)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, slug=excluded.slug, grade=excluded.grade,
    grade_system=excluded.grade_system, grade_sort=excluded.grade_sort, length_m=excluded.length_m,
    pitches=excluded.pitches, route_type=excluded.route_type, number_in_sector=excluded.number_in_sector,
    quickdraws=COALESCE(excluded.quickdraws, quickdraws),
    rope_length=COALESCE(excluded.rope_length, rope_length),
    terrain_tags=COALESCE(excluded.terrain_tags, terrain_tags),
    hold_types=COALESCE(excluded.hold_types, hold_types)`)
  for (const route of data.routes || []) {
    const terrainTags = route.terrainTags ? JSON.stringify(route.terrainTags) : null
    const holdTypes = route.holdTypes ? JSON.stringify(route.holdTypes) : null
    upsertRoute.run(
      route.id, route.sectorId, route.name, route.slug,
      route.grade, route.gradeSystem || 'french', route.gradeSort || 0,
      route.lengthM || null, route.pitches || 1, route.routeType || 'sport',
      route.numberInSector || null,
      route.quickdraws || null, route.ropeLength || null, terrainTags, holdTypes,
    )
  }

  db.exec('COMMIT')
  console.log(`Seeded from topo-data.json: ${(data.areas || []).length} areas, ${(data.sectors || []).length} sectors, ${(data.routes || []).length} routes`)
} catch (err) {
  db.exec('ROLLBACK')
  console.error('Seed failed:', err)
  process.exit(1)
}
