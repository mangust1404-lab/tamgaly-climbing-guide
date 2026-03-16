import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { areasRouter } from './routes/areas'
import { sectorsRouter } from './routes/sectors'
import { routesRouter } from './routes/routes'
import { syncRouter } from './routes/sync'
import { downloadRouter } from './routes/download'

const app = new Hono()

app.use('/*', cors())

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

// Save topo-data.json from admin editor
app.post('/api/save-topo-data', async (c) => {
  try {
    const body = await c.req.json()
    const json = JSON.stringify(body, null, 0)
    // Write to persistent volume
    const dataPath = join(process.cwd(), 'server', 'data', 'topo-data.json')
    writeFileSync(dataPath, json, 'utf-8')
    console.log(`Saved topo-data.json v${body.version} (${(json.length / 1024).toFixed(0)}KB)`)
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
