import { Hono } from 'hono'
import { getDb } from '../db/connection'

export const routesRouter = new Hono()

routesRouter.get('/', async (c) => {
  const db = getDb()
  const sectorId = c.req.query('sectorId')
  const updatedAfter = c.req.query('updatedAfter')

  let query = 'SELECT * FROM route WHERE status = ?'
  const params: unknown[] = ['published']

  if (sectorId) {
    query += ' AND sector_id = ?'
    params.push(sectorId)
  }

  if (updatedAfter) {
    query += ' AND updated_at > ?'
    params.push(updatedAfter)
  }

  query += ' ORDER BY grade_sort'

  const routes = db.prepare(query).all(...params)
  return c.json({ routes })
})

routesRouter.get('/:id', async (c) => {
  const db = getDb()
  const route = db.prepare('SELECT * FROM route WHERE id = ?').get(c.req.param('id'))
  if (!route) return c.json({ error: 'Not found' }, 404)
  return c.json(route)
})

// Update route details (quickdraws, rope_length, terrain_tags, hold_types)
routesRouter.patch('/:id', async (c) => {
  const db = getDb()
  const id = c.req.param('id')
  const body = await c.req.json()

  const existing = db.prepare('SELECT id FROM route WHERE id = ?').get(id)
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const sets: string[] = []
  const params: unknown[] = []

  if (body.quickdraws !== undefined) { sets.push('quickdraws = ?'); params.push(body.quickdraws) }
  if (body.ropeLength !== undefined) { sets.push('rope_length = ?'); params.push(body.ropeLength) }
  if (body.terrainTags !== undefined) { sets.push('terrain_tags = ?'); params.push(JSON.stringify(body.terrainTags)) }
  if (body.holdTypes !== undefined) { sets.push('hold_types = ?'); params.push(JSON.stringify(body.holdTypes)) }

  if (sets.length === 0) return c.json({ status: 'no changes' })

  sets.push('updated_at = ?')
  params.push(new Date().toISOString())
  params.push(id)

  db.prepare(`UPDATE route SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  return c.json({ status: 'updated' })
})
