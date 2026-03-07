import { Hono } from 'hono'
import { getDb } from '../db/connection'

export const areasRouter = new Hono()

areasRouter.get('/', async (c) => {
  const db = getDb()
  const areas = db.prepare('SELECT * FROM area').all()
  return c.json(areas)
})

areasRouter.get('/:id', async (c) => {
  const db = getDb()
  const area = db.prepare('SELECT * FROM area WHERE id = ?').get(c.req.param('id'))
  if (!area) return c.json({ error: 'Not found' }, 404)
  return c.json(area)
})
