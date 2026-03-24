/**
 * Seed the server database from topo-data.json (bootstrap data for first start).
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

  // Sectors — upsert with ALL fields
  const knownAreas = new Set(db.prepare('SELECT id FROM area').all().map((r: any) => r.id))
  const upsertSector = db.prepare(`INSERT INTO sector
    (id, area_id, name, slug, description, latitude, longitude, approach_description, approach_time_min,
     approach_gps_track, orientation, sun_exposure, sort_order, sun_from, sun_to, cover_image_url,
     description_en, description_kk, approach_description_en, approach_description_kk, sun_exposure_en, sun_exposure_kk)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, slug=excluded.slug, description=excluded.description,
    latitude=excluded.latitude, longitude=excluded.longitude,
    approach_description=excluded.approach_description, approach_time_min=excluded.approach_time_min,
    approach_gps_track=excluded.approach_gps_track,
    orientation=excluded.orientation, sun_exposure=excluded.sun_exposure, sort_order=excluded.sort_order,
    sun_from=COALESCE(excluded.sun_from, sector.sun_from),
    sun_to=COALESCE(excluded.sun_to, sector.sun_to),
    cover_image_url=COALESCE(excluded.cover_image_url, sector.cover_image_url),
    description_en=COALESCE(excluded.description_en, sector.description_en),
    description_kk=COALESCE(excluded.description_kk, sector.description_kk),
    approach_description_en=COALESCE(excluded.approach_description_en, sector.approach_description_en),
    approach_description_kk=COALESCE(excluded.approach_description_kk, sector.approach_description_kk),
    sun_exposure_en=COALESCE(excluded.sun_exposure_en, sector.sun_exposure_en),
    sun_exposure_kk=COALESCE(excluded.sun_exposure_kk, sector.sun_exposure_kk)`)
  let sectorCount = 0
  for (const sector of data.sectors || []) {
    if (!knownAreas.has(sector.areaId)) {
      console.warn(`Skipping sector ${sector.id}: unknown areaId "${sector.areaId}"`)
      continue
    }
    upsertSector.run(
      sector.id, sector.areaId, sector.name, sector.slug, sector.description || null,
      sector.latitude ?? 0, sector.longitude ?? 0,
      sector.approachDescription || null, sector.approachTimeMin || null,
      sector.approachGpsTrack ? JSON.stringify(sector.approachGpsTrack) : null,
      sector.orientation || null, sector.sunExposure || null,
      sector.sortOrder || 0, sector.sunFrom || null, sector.sunTo || null,
      sector.coverImageUrl || null,
      sector.descriptionEn || null, sector.descriptionKk || null,
      sector.approachDescriptionEn || null, sector.approachDescriptionKk || null,
      sector.sunExposureEn || null, sector.sunExposureKk || null,
    )
    sectorCount++
  }

  // Routes — upsert with ALL fields, preserving server-managed fields via COALESCE
  const knownSectors = new Set(db.prepare('SELECT id FROM sector').all().map((r: any) => r.id))

  // Clear slugs to avoid UNIQUE conflicts during batch upsert
  const routeIdsInBatch = new Set((data.routes || []).map((r: any) => r.id))
  const existingRoutes = db.prepare('SELECT id, sector_id, slug FROM route').all() as any[]
  const clearSlug = db.prepare('UPDATE route SET slug = ? WHERE id = ?')
  for (const er of existingRoutes) {
    if (routeIdsInBatch.has(er.id)) {
      clearSlug.run(`__tmp__${er.id}`, er.id)
    }
  }

  const seenSlugs = new Map<string, number>()
  for (const er of existingRoutes) {
    if (!routeIdsInBatch.has(er.id)) {
      const key = `${er.sector_id}:${er.slug}`
      seenSlugs.set(key, (seenSlugs.get(key) || 0) + 1)
    }
  }

  const upsertRoute = db.prepare(`INSERT INTO route
    (id, sector_id, name, slug, grade, grade_system, grade_sort, grade_alt,
     length_m, pitches, pitch_grades, route_type, description, protection,
     first_ascent, first_ascent_date, quality_rating, number_in_sector,
     latitude, longitude, tags, status,
     quickdraws, rope_length, terrain_tags, hold_types)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, slug=excluded.slug, grade=excluded.grade,
      grade_system=excluded.grade_system, grade_sort=excluded.grade_sort, grade_alt=excluded.grade_alt,
      length_m=excluded.length_m, pitches=excluded.pitches, pitch_grades=excluded.pitch_grades,
      route_type=excluded.route_type, number_in_sector=excluded.number_in_sector,
      description=COALESCE(excluded.description, route.description),
      protection=COALESCE(excluded.protection, route.protection),
      first_ascent=COALESCE(excluded.first_ascent, route.first_ascent),
      first_ascent_date=COALESCE(excluded.first_ascent_date, route.first_ascent_date),
      quality_rating=COALESCE(excluded.quality_rating, route.quality_rating),
      latitude=COALESCE(excluded.latitude, route.latitude),
      longitude=COALESCE(excluded.longitude, route.longitude),
      tags=COALESCE(excluded.tags, route.tags),
      quickdraws=COALESCE(excluded.quickdraws, route.quickdraws),
      rope_length=COALESCE(excluded.rope_length, route.rope_length),
      terrain_tags=COALESCE(excluded.terrain_tags, route.terrain_tags),
      hold_types=COALESCE(excluded.hold_types, route.hold_types)`)
  let routeCount = 0
  let skipCount = 0
  for (const route of data.routes || []) {
    if (!knownSectors.has(route.sectorId)) {
      console.warn(`Skipping route ${route.id} "${route.name}": unknown sectorId "${route.sectorId}"`)
      skipCount++
      continue
    }
    const terrainTags = Array.isArray(route.terrainTags) ? JSON.stringify(route.terrainTags) : route.terrainTags || null
    const holdTypes = Array.isArray(route.holdTypes) ? JSON.stringify(route.holdTypes) : route.holdTypes || null
    const tags = Array.isArray(route.tags) ? JSON.stringify(route.tags) : route.tags || null
    const pitchGrades = Array.isArray(route.pitchGrades) ? JSON.stringify(route.pitchGrades) : route.pitchGrades || null
    let slug = route.slug || route.name.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-')
    const slugKey = `${route.sectorId}:${slug}`
    const count = seenSlugs.get(slugKey) || 0
    if (count > 0) slug = `${slug}-${count}`
    seenSlugs.set(slugKey, count + 1)
    try {
      upsertRoute.run(
        route.id, route.sectorId, route.name, slug,
        route.grade, route.gradeSystem || 'french', route.gradeSort || 0, route.gradeAlt || null,
        route.lengthM || null, route.pitches || 1, pitchGrades, route.routeType || 'sport',
        route.description || null, route.protection || null,
        route.firstAscent || null, route.firstAscentDate || null,
        route.qualityRating || null, route.numberInSector || null,
        route.latitude || null, route.longitude || null, tags,
        route.quickdraws || null, route.ropeLength || null, terrainTags, holdTypes,
      )
      routeCount++
    } catch (routeErr: any) {
      console.warn(`Skipping route ${route.id} "${route.name}": ${routeErr.message}`)
      skipCount++
    }
  }

  // Topos — clear and re-insert (safe: only topo_routes reference them, and we replace those too)
  db.prepare('DELETE FROM topo_route').run()
  db.prepare('DELETE FROM topo').run()

  const insertTopo = db.prepare(`INSERT INTO topo
    (id, sector_id, image_url, image_width, image_height, caption, photographer, sort_order, type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  let topoCount = 0
  for (const t of data.topos || []) {
    if (!knownSectors.has(t.sectorId)) continue
    insertTopo.run(
      t.id, t.sectorId, t.imageUrl, t.imageWidth || 0, t.imageHeight || 0,
      t.caption || null, t.photographer || null, t.sortOrder || 0, t.type || 'topo',
    )
    topoCount++
  }

  // TopoRoutes
  const insertTopoRoute = db.prepare(`INSERT INTO topo_route
    (id, topo_id, route_id, svg_path, color, start_x, start_y, anchor_x, anchor_y, label_x, label_y, route_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  let trCount = 0
  for (const tr of data.topoRoutes || []) {
    try {
      insertTopoRoute.run(
        tr.id, tr.topoId, tr.routeId, tr.svgPath, tr.color || '#FF0000',
        tr.startX, tr.startY, tr.anchorX || null, tr.anchorY || null,
        tr.labelX || null, tr.labelY || null, tr.routeNumber || null,
      )
      trCount++
    } catch { /* skip FK violations for orphan topo_routes */ }
  }

  db.exec('COMMIT')
  console.log(`Seeded: ${(data.areas || []).length} areas, ${sectorCount} sectors, ${routeCount} routes, ${topoCount} topos, ${trCount} topoRoutes` +
    (skipCount > 0 ? ` (${skipCount} skipped)` : ''))
} catch (err) {
  db.exec('ROLLBACK')
  console.error('Seed failed:', err)
  // Don't exit(1) — let the server start with existing data
}
