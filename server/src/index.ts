import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { bodyLimit } from 'hono/body-limit'
import { serve } from '@hono/node-server'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { areasRouter } from './routes/areas'
import { sectorsRouter } from './routes/sectors'
import { routesRouter } from './routes/routes'
import { syncRouter } from './routes/sync'
import { downloadRouter } from './routes/download'
import { exportTopoDataFromDb } from './db/export-topo-data'

const app = new Hono()

app.use('/*', cors())
app.use('/*', bodyLimit({ maxSize: 200 * 1024 * 1024 })) // 200MB limit (topo-data has base64 photos, grows to ~100MB+)

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok' }))

// Serve topo-data.json — prefer nginx-served copy (most up-to-date from admin saves)
app.get('/api/topo-data', (c) => {
  const candidates = [
    '/var/www/tamgaly/data/topo-data.json',
    join(process.cwd(), 'data', 'topo-data.json'),
    join(process.cwd(), 'server', 'data', 'topo-data.json'),
  ]
  const dataPath = candidates.find(p => existsSync(p))
  if (!dataPath) {
    return c.json({ error: 'Not found' }, 404)
  }
  const data = readFileSync(dataPath, 'utf-8')
  c.header('Content-Type', 'application/json')
  c.header('Cache-Control', 'no-cache')
  return c.body(data)
})

/**
 * Auto-translate text from Russian to target language using Google Translate.
 * Returns original text if translation fails.
 */
async function autoTranslate(text: string, targetLang: string): Promise<string> {
  if (!text || text.length < 3) return text
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ru&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
    const resp = await fetch(url)
    if (!resp.ok) return text
    const data = await resp.json() as any[][]
    // Response format: [[["translated text","source text",...],...],...
    return data[0].map((seg: any[]) => seg[0]).join('')
  } catch {
    return text
  }
}

/**
 * Auto-translate sector and route descriptions/names to en/kk.
 * Only translates fields that are missing or whose source text changed.
 */
async function autoTranslateSectors(sectors: any[]): Promise<number> {
  let count = 0
  const fields = ['description', 'approachDescription', 'sunExposure']
  for (const sector of sectors) {
    for (const field of fields) {
      const ruText = sector[field]
      if (!ruText) continue
      const enKey = `${field}En`
      const kkKey = `${field}Kk`
      const srcKey = `${field}_src` // track source text to detect changes
      const needsTranslation = !sector[enKey] || sector[srcKey] !== ruText
      if (needsTranslation) {
        const [en, kk] = await Promise.all([
          autoTranslate(ruText, 'en'),
          autoTranslate(ruText, 'kk'),
        ])
        sector[enKey] = en
        sector[kkKey] = kk
        sector[srcKey] = ruText
        count++
      }
    }
  }
  return count
}

/**
 * Extract base64 data URIs into separate image files on disk.
 * Returns the URL path to use in JSON instead of the base64 string.
 */
function extractBase64Image(dataUri: string, prefix: string, imgDir: string, webPath: string): string {
  if (!dataUri.startsWith('data:image/')) return dataUri // already a URL path
  const match = dataUri.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/)
  if (!match) return dataUri
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
  const buf = Buffer.from(match[2], 'base64')
  const hash = createHash('md5').update(buf).digest('hex').slice(0, 10)
  const filename = `${prefix}-${hash}.${ext}`
  const filePath = join(imgDir, filename)
  if (!existsSync(filePath)) {
    writeFileSync(filePath, buf)
  }
  return `${webPath}${filename}`
}

/**
 * Save admin data to SQLite (source of truth), then regenerate topo-data.json from DB.
 *
 * Flow: Admin IndexedDB → POST here → upsert ALL fields to SQLite → export SQLite → write topo-data.json
 * This prevents the old bug where client data overwrote topo-data.json directly, losing server-only fields.
 */
app.post('/api/save-topo-data', async (c) => {
  console.log('POST /api/save-topo-data received, content-length:', c.req.header('content-length'))
  try {
    const body = await c.req.json()
    const sdb = getDb()

    // --- Step 1: Extract base64 images to disk ---
    const nginxImgDir = '/var/www/tamgaly/topo-images'
    const dockerImgDir = join(process.cwd(), 'server', 'data', 'topo-images')
    let imgDir = dockerImgDir
    try { mkdirSync(nginxImgDir, { recursive: true }); imgDir = nginxImgDir } catch {}
    if (imgDir === dockerImgDir) mkdirSync(dockerImgDir, { recursive: true })
    const webPath = '/topo-images/'

    let extractedCount = 0
    if (body.topos) {
      for (const topo of body.topos) {
        if (topo.imageUrl && topo.imageUrl.startsWith('data:image/')) {
          topo.imageUrl = extractBase64Image(topo.imageUrl, topo.id || 'topo', imgDir, webPath)
          extractedCount++
        }
      }
    }
    if (body.sectorCovers) {
      for (const [sectorId, coverUrl] of Object.entries(body.sectorCovers)) {
        if (typeof coverUrl === 'string' && coverUrl.startsWith('data:image/')) {
          body.sectorCovers[sectorId] = extractBase64Image(coverUrl, `cover-${sectorId}`, imgDir, webPath)
          extractedCount++
        }
      }
    }
    // Apply extracted cover URLs back to sector objects
    if (body.sectorCovers && body.sectors) {
      for (const s of body.sectors) {
        if (body.sectorCovers[s.id]) s.coverImageUrl = body.sectorCovers[s.id]
      }
    }
    if (extractedCount > 0) console.log(`Extracted ${extractedCount} base64 images to ${imgDir}`)

    // --- Step 2: Auto-translate sector descriptions ---
    if (body.sectors?.length) {
      try {
        const translated = await autoTranslateSectors(body.sectors)
        if (translated > 0) console.log(`Auto-translated ${translated} sector fields`)
      } catch (e) { console.error('Auto-translation failed:', e) }
    }

    // --- Step 3: Upsert ALL data to SQLite (the source of truth) ---
    sdb.exec('BEGIN')
    try {
      // Ensure area exists
      sdb.prepare(`INSERT OR IGNORE INTO area (id, name, slug, latitude, longitude) VALUES (?, ?, ?, ?, ?)`)
        .run('tamgaly-tas', 'Тамгалы-Тас', 'tamgaly-tas', 44.063, 76.997)

      // --- Upsert sectors with ALL fields ---
      const upsertSector = sdb.prepare(`INSERT INTO sector
        (id, area_id, name, slug, description, latitude, longitude, approach_description, approach_time_min,
         approach_gps_track, orientation, sun_exposure, sort_order, sun_from, sun_to, cover_image_url,
         description_en, description_kk, approach_description_en, approach_description_kk, sun_exposure_en, sun_exposure_kk)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, slug=excluded.slug, description=excluded.description,
          latitude=excluded.latitude, longitude=excluded.longitude,
          approach_description=excluded.approach_description, approach_time_min=excluded.approach_time_min,
          approach_gps_track=excluded.approach_gps_track,
          orientation=excluded.orientation, sun_exposure=excluded.sun_exposure, sort_order=excluded.sort_order,
          sun_from=excluded.sun_from, sun_to=excluded.sun_to,
          cover_image_url=excluded.cover_image_url,
          description_en=COALESCE(excluded.description_en, sector.description_en),
          description_kk=COALESCE(excluded.description_kk, sector.description_kk),
          approach_description_en=COALESCE(excluded.approach_description_en, sector.approach_description_en),
          approach_description_kk=COALESCE(excluded.approach_description_kk, sector.approach_description_kk),
          sun_exposure_en=COALESCE(excluded.sun_exposure_en, sector.sun_exposure_en),
          sun_exposure_kk=COALESCE(excluded.sun_exposure_kk, sector.sun_exposure_kk),
          updated_at=datetime('now')`)

      for (const s of body.sectors || []) {
        upsertSector.run(
          s.id, s.areaId || 'tamgaly-tas', s.name, s.slug || s.id,
          s.description || null,
          s.latitude || 0, s.longitude || 0,
          s.approachDescription || null, s.approachTimeMin || null,
          s.approachGpsTrack ? JSON.stringify(s.approachGpsTrack) : null,
          s.orientation || null, s.sunExposure || null, s.sortOrder || 0,
          s.sunFrom || null, s.sunTo || null,
          s.coverImageUrl || null,
          s.descriptionEn || null, s.descriptionKk || null,
          s.approachDescriptionEn || null, s.approachDescriptionKk || null,
          s.sunExposureEn || null, s.sunExposureKk || null,
        )
      }

      // --- Upsert routes with ALL fields ---
      // Use COALESCE for server-managed fields so client can't erase them
      const upsertRoute = sdb.prepare(`INSERT INTO route
        (id, sector_id, name, slug, grade, grade_system, grade_sort, grade_alt,
         length_m, pitches, pitch_grades, route_type, description, protection,
         first_ascent, first_ascent_date, quality_rating, number_in_sector,
         latitude, longitude, tags, status,
         quickdraws, rope_length, terrain_tags, hold_types)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, sector_id=excluded.sector_id, slug=excluded.slug,
          grade=excluded.grade, grade_system=excluded.grade_system, grade_sort=excluded.grade_sort,
          grade_alt=excluded.grade_alt,
          length_m=excluded.length_m, pitches=excluded.pitches, pitch_grades=excluded.pitch_grades,
          route_type=excluded.route_type,
          description=COALESCE(excluded.description, route.description),
          protection=COALESCE(excluded.protection, route.protection),
          first_ascent=COALESCE(excluded.first_ascent, route.first_ascent),
          first_ascent_date=COALESCE(excluded.first_ascent_date, route.first_ascent_date),
          quality_rating=COALESCE(excluded.quality_rating, route.quality_rating),
          number_in_sector=excluded.number_in_sector,
          latitude=COALESCE(excluded.latitude, route.latitude),
          longitude=COALESCE(excluded.longitude, route.longitude),
          tags=COALESCE(excluded.tags, route.tags),
          quickdraws=COALESCE(excluded.quickdraws, route.quickdraws),
          rope_length=COALESCE(excluded.rope_length, route.rope_length),
          terrain_tags=COALESCE(excluded.terrain_tags, route.terrain_tags),
          hold_types=COALESCE(excluded.hold_types, route.hold_types),
          updated_at=datetime('now')`)

      const seenSlugs = new Map<string, number>()
      for (const r of body.routes || []) {
        let slug = r.slug || r.name.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-')
        const slugKey = `${r.sectorId}:${slug}`
        const count = seenSlugs.get(slugKey) || 0
        if (count > 0) slug = `${slug}-${count}`
        seenSlugs.set(slugKey, count + 1)

        const terrainTags = Array.isArray(r.terrainTags) ? JSON.stringify(r.terrainTags) : r.terrainTags || null
        const holdTypes = Array.isArray(r.holdTypes) ? JSON.stringify(r.holdTypes) : r.holdTypes || null
        const tags = Array.isArray(r.tags) ? JSON.stringify(r.tags) : r.tags || null
        const pitchGrades = Array.isArray(r.pitchGrades) ? JSON.stringify(r.pitchGrades) : r.pitchGrades || null

        upsertRoute.run(
          r.id, r.sectorId, r.name, slug,
          r.grade, r.gradeSystem || 'french', r.gradeSort || 0, r.gradeAlt || null,
          r.lengthM || null, r.pitches || 1, pitchGrades, r.routeType || 'sport',
          r.description || null, r.protection || null,
          r.firstAscent || null, r.firstAscentDate || null,
          r.qualityRating || null, r.numberInSector || null,
          r.latitude || null, r.longitude || null, tags,
          r.quickdraws || null, r.ropeLength || null, terrainTags, holdTypes,
        )
      }

      // --- Upsert topos ---
      // Clear and re-insert (safe: nothing else references topos except topo_routes which we also replace)
      sdb.prepare('DELETE FROM topo_route').run()
      sdb.prepare('DELETE FROM topo').run()

      const insertTopo = sdb.prepare(`INSERT INTO topo
        (id, sector_id, image_url, image_width, image_height, caption, photographer, sort_order, type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)

      for (const t of body.topos || []) {
        insertTopo.run(
          t.id, t.sectorId, t.imageUrl, t.imageWidth || 0, t.imageHeight || 0,
          t.caption || null, t.photographer || null, t.sortOrder || 0, t.type || 'topo',
        )
      }

      // --- Insert topo_routes ---
      const insertTopoRoute = sdb.prepare(`INSERT INTO topo_route
        (id, topo_id, route_id, svg_path, color, start_x, start_y, anchor_x, anchor_y, label_x, label_y, route_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)

      for (const tr of body.topoRoutes || []) {
        insertTopoRoute.run(
          tr.id, tr.topoId, tr.routeId, tr.svgPath, tr.color || '#FF0000',
          tr.startX, tr.startY, tr.anchorX || null, tr.anchorY || null,
          tr.labelX || null, tr.labelY || null, tr.routeNumber || null,
        )
      }

      sdb.exec('COMMIT')
      console.log(`Upserted to SQLite: ${(body.sectors || []).length} sectors, ${(body.routes || []).length} routes, ${(body.topos || []).length} topos, ${(body.topoRoutes || []).length} topoRoutes`)
    } catch (e) {
      sdb.exec('ROLLBACK')
      console.error('SQLite upsert failed:', e)
      return c.json({ error: 'Database update failed' }, 500)
    }

    // --- Step 4: Regenerate topo-data.json FROM SQLite (not from client data!) ---
    const exported = exportTopoDataFromDb()
    const json = JSON.stringify(exported, null, 0)

    const dataPath = join(process.cwd(), 'server', 'data', 'topo-data.json')
    writeFileSync(dataPath, json, 'utf-8')
    const frontendPath = '/var/www/tamgaly/data/topo-data.json'
    try {
      writeFileSync(frontendPath, json, 'utf-8')
      console.log(`Regenerated topo-data.json from SQLite (${(json.length / 1024).toFixed(0)}KB) → both paths`)
    } catch {
      console.log(`Regenerated topo-data.json from SQLite (${(json.length / 1024).toFixed(0)}KB) → server only`)
    }

    return c.json({ status: 'saved', version: (exported as any).version })
  } catch (err) {
    console.error('Failed to save topo-data:', err)
    return c.json({ error: 'Failed to save' }, 500)
  }
})

// API routes
app.route('/api/areas', areasRouter)
app.route('/api/sectors', sectorsRouter)
app.route('/api/routes', routesRouter)
app.route('/api/sync', syncRouter)
app.route('/api/download', downloadRouter)

const port = parseInt(process.env.PORT || '3001')
console.log(`Server running on http://localhost:${port}`)

serve({ fetch: app.fetch, port })

// Graceful shutdown: checkpoint WAL to prevent data loss on docker restart
import { getDb } from './db/connection'

function shutdown(signal: string) {
  console.log(`${signal} received, checkpointing WAL...`)
  try {
    const db = getDb()
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.close()
    console.log('DB closed cleanly.')
  } catch (e) {
    console.error('Shutdown error:', e)
  }
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
