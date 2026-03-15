import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { areasRouter } from './routes/areas'
import { sectorsRouter } from './routes/sectors'
import { routesRouter } from './routes/routes'
import { syncRouter } from './routes/sync'
import { downloadRouter } from './routes/download'

const app = new Hono()

app.use('/*', cors())

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok' }))

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
