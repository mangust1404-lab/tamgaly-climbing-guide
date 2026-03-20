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

const app = new Hono()

app.use('/*', cors())
app.use('/*', bodyLimit({ maxSize: 200 * 1024 * 1024 })) // 200MB limit (topo-data has base64 photos, grows to ~100MB+)

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok' }))

// Serve topo-data.json (proxied by nginx from /data/topo-data.json)
app.get('/api/topo-data', (c) => {
  const dataPath = join(process.cwd(), 'server', 'data', 'topo-data.json')
  if (!existsSync(dataPath)) {
    // Fallback to built-in copy
    const fallback = join(process.cwd(), 'data', 'topo-data.json')
    if (existsSync(fallback)) {
      const data = readFileSync(fallback, 'utf-8')
      c.header('Content-Type', 'application/json')
      c.header('Cache-Control', 'no-cache')
      return c.body(data)
    }
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

// Save topo-data.json from admin editor
app.post('/api/save-topo-data', async (c) => {
  console.log('POST /api/save-topo-data received, content-length:', c.req.header('content-length'))
  try {
    const body = await c.req.json()

    // Merge approved suggestion data (quickdraws, ropeLength, etc.) from server DB into routes
    try {
      const sdb = getDb()
      const serverRoutes = sdb.prepare('SELECT id, quickdraws, rope_length, terrain_tags, hold_types FROM route').all() as any[]
      const serverMap = new Map(serverRoutes.map((r: any) => [r.id, r]))
      if (body.routes) {
        for (const route of body.routes) {
          const sr = serverMap.get(route.id) as any
          if (sr) {
            if (sr.quickdraws && !route.quickdraws) route.quickdraws = sr.quickdraws
            if (sr.rope_length && !route.ropeLength) route.ropeLength = sr.rope_length
            if (sr.terrain_tags && !route.terrainTags?.length) {
              try { route.terrainTags = JSON.parse(sr.terrain_tags) } catch {}
            }
            if (sr.hold_types && !route.holdTypes?.length) {
              try { route.holdTypes = JSON.parse(sr.hold_types) } catch {}
            }
          }
        }
        console.log(`Merged server route data into ${body.routes.length} routes`)
      }
    } catch (e) { console.error('Route merge failed:', e) }

    // Extract base64 images into separate files
    const nginxImgDir = '/var/www/tamgaly/topo-images'
    const dockerImgDir = join(process.cwd(), 'server', 'data', 'topo-images')
    // Use nginx dir if writable, else docker volume
    let imgDir = dockerImgDir
    try { mkdirSync(nginxImgDir, { recursive: true }); imgDir = nginxImgDir } catch {}
    if (imgDir === dockerImgDir) mkdirSync(dockerImgDir, { recursive: true })
    const webPath = '/topo-images/'

    let extractedCount = 0
    if (body.topos) {
      for (const topo of body.topos) {
        if (topo.imageUrl && topo.imageUrl.startsWith('data:image/')) {
          const topoId = topo.id || 'topo'
          topo.imageUrl = extractBase64Image(topo.imageUrl, topoId, imgDir, webPath)
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
    if (extractedCount > 0) {
      console.log(`Extracted ${extractedCount} base64 images to ${imgDir}`)
    }

    // Auto-translate sector descriptions to en/kk
    if (body.sectors?.length) {
      try {
        const translated = await autoTranslateSectors(body.sectors)
        if (translated > 0) console.log(`Auto-translated ${translated} sector fields`)
      } catch (e) { console.error('Auto-translation failed:', e) }
    }

    const json = JSON.stringify(body, null, 0)
    // Save to Docker persistent volume
    const dataPath = join(process.cwd(), 'server', 'data', 'topo-data.json')
    writeFileSync(dataPath, json, 'utf-8')
    // Also save to nginx-served frontend path (if writable)
    const frontendPath = '/var/www/tamgaly/data/topo-data.json'
    try {
      writeFileSync(frontendPath, json, 'utf-8')
      console.log(`Saved topo-data.json v${body.version} (${(json.length / 1024).toFixed(0)}KB) → both paths`)
    } catch {
      console.log(`Saved topo-data.json v${body.version} (${(json.length / 1024).toFixed(0)}KB) → server only (frontend path not writable)`)
    }
    return c.json({ status: 'saved', version: body.version })
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
