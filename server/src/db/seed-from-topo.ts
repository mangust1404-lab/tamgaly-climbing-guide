/**
 * Seed the server database from topo-data.json (the source of truth for routes/sectors/areas).
 * Uses UPSERT to preserve existing data (ascents, reviews, user-added fields).
 *
 * Path priority:
 *   1. /var/www/tamgaly/data/topo-data.json  (nginx-served, updated by admin saves)
 *   2. data/topo-data.json                   (built-in copy from Docker image)
 *   3. server/data/topo-data.json            (persistent volume, may be stale)
 *
 * Usage: npx tsx server/src/db/seed-from-topo.ts
 */
import { getDb } from './connection'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const db = getDb()

// Find topo-data.json — prefer nginx-served copy (most up-to-date from admin saves)
const candidates = [
  '/var/www/tamgaly/data/topo-data.json',
  join(process.cwd(), 'data', 'topo-data.json'),
  join(process.cwd(), 'server', 'data', 'topo-data.json'),
]
const topoPath = candidates.find(p => existsSync(p))
if (!topoPath) {
  console.error('topo-data.json not found at any of:', candidates)
  process.exit(0) // Don't block server start
}
console.log(`Seeding from: ${topoPath}`)

const data = JSON.parse(readFileSync(topoPath, 'utf-8'))

db.exec('BEGIN')

try {
  // Always ensure both areas exist (admin saves may not include areas array)
  db.prepare(`INSERT OR IGNORE INTO area (id, name, slug, latitude, longitude)
    VALUES ('tamgaly-tas', 'Тамгалы-Тас', 'tamgaly-tas', 44.063, 76.996)`).run()
  db.prepare(`INSERT OR IGNORE INTO area (id, name, slug, latitude, longitude)
    VALUES ('tamgaly', 'Тамгалы-Тас', 'tamgaly', 44.063, 76.996)`).run()

  // Areas from topo-data.json — upsert
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

  // Sectors — upsert (skip sectors whose areaId doesn't match any known area)
  const knownAreas = new Set(db.prepare('SELECT id FROM area').all().map((r: any) => r.id))
  const upsertSector = db.prepare(`INSERT INTO sector (id, area_id, name, slug, description, latitude, longitude, orientation, sun_exposure, sort_order, approach_description, approach_time_min)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, slug=excluded.slug, description=excluded.description,
    latitude=excluded.latitude, longitude=excluded.longitude, orientation=excluded.orientation,
    sun_exposure=excluded.sun_exposure, sort_order=excluded.sort_order,
    approach_description=excluded.approach_description, approach_time_min=excluded.approach_time_min`)
  let sectorCount = 0
  for (const sector of data.sectors || []) {
    if (!knownAreas.has(sector.areaId)) {
      console.warn(`Skipping sector ${sector.id}: unknown areaId "${sector.areaId}"`)
      continue
    }
    upsertSector.run(
      sector.id, sector.areaId, sector.name, sector.slug, sector.description || null,
      sector.latitude ?? 0, sector.longitude ?? 0,
      sector.orientation || null, sector.sunExposure || null,
      sector.sortOrder || 0, sector.approachDescription || null, sector.approachTimeMin || null,
    )
    sectorCount++
  }

  // Routes — upsert, preserving quickdraws/rope_length/terrain_tags/hold_types
  const knownSectors = new Set(db.prepare('SELECT id FROM sector').all().map((r: any) => r.id))

  // Clear all existing route slugs first to avoid UNIQUE conflicts during batch upsert.
  // The slug will be set correctly during the upsert. For routes NOT in this batch,
  // their slugs stay cleared — but these are orphan routes not in topo-data.json.
  // We use a temp suffix with the route id to keep them unique while clearing.
  const routeIdsInBatch = new Set((data.routes || []).map((r: any) => r.id))
  const existingRoutes = db.prepare('SELECT id, sector_id, slug FROM route').all() as any[]
  const clearSlug = db.prepare('UPDATE route SET slug = ? WHERE id = ?')
  for (const er of existingRoutes) {
    if (routeIdsInBatch.has(er.id)) {
      // Temporarily set slug to a unique value to avoid conflicts
      clearSlug.run(`__tmp__${er.id}`, er.id)
    }
  }

  const seenSlugs = new Map<string, number>()
  // Count slugs of routes NOT in this batch
  for (const er of existingRoutes) {
    if (!routeIdsInBatch.has(er.id)) {
      const key = `${er.sector_id}:${er.slug}`
      seenSlugs.set(key, (seenSlugs.get(key) || 0) + 1)
    }
  }

  const upsertRoute = db.prepare(`INSERT INTO route (id, sector_id, name, slug, grade, grade_system, grade_sort, length_m, pitches, route_type, number_in_sector, status, quickdraws, rope_length, terrain_tags, hold_types)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, slug=excluded.slug, grade=excluded.grade,
    grade_system=excluded.grade_system, grade_sort=excluded.grade_sort, length_m=excluded.length_m,
    pitches=excluded.pitches, route_type=excluded.route_type, number_in_sector=excluded.number_in_sector,
    quickdraws=COALESCE(excluded.quickdraws, quickdraws),
    rope_length=COALESCE(excluded.rope_length, rope_length),
    terrain_tags=COALESCE(excluded.terrain_tags, terrain_tags),
    hold_types=COALESCE(excluded.hold_types, hold_types)`)
  let routeCount = 0
  let skipCount = 0
  for (const route of data.routes || []) {
    if (!knownSectors.has(route.sectorId)) {
      console.warn(`Skipping route ${route.id} "${route.name}": unknown sectorId "${route.sectorId}"`)
      skipCount++
      continue
    }
    const terrainTags = route.terrainTags ? JSON.stringify(route.terrainTags) : null
    const holdTypes = route.holdTypes ? JSON.stringify(route.holdTypes) : null
    // Ensure unique slug per sector
    let slug = route.slug || route.name.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-')
    const slugKey = `${route.sectorId}:${slug}`
    const count = seenSlugs.get(slugKey) || 0
    if (count > 0) slug = `${slug}-${count}`
    seenSlugs.set(slugKey, count + 1)
    try {
      upsertRoute.run(
        route.id, route.sectorId, route.name, slug,
        route.grade, route.gradeSystem || 'french', route.gradeSort || 0,
        route.lengthM || null, route.pitches || 1, route.routeType || 'sport',
        route.numberInSector || null,
        route.quickdraws || null, route.ropeLength || null, terrainTags, holdTypes,
      )
      routeCount++
    } catch (routeErr: any) {
      console.warn(`Skipping route ${route.id} "${route.name}": ${routeErr.message}`)
      skipCount++
    }
  }

  db.exec('COMMIT')
  console.log(`Seeded: ${(data.areas || []).length} areas, ${sectorCount} sectors, ${routeCount} routes` +
    (skipCount > 0 ? ` (${skipCount} skipped)` : ''))
} catch (err) {
  db.exec('ROLLBACK')
  console.error('Seed failed:', err)
  // Don't exit(1) — let the server start with existing data
}
