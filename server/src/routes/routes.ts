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
