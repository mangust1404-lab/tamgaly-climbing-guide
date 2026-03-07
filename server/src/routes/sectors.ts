import { Hono } from 'hono'
import { getDb } from '../db/connection'

export const sectorsRouter = new Hono()

sectorsRouter.get('/', async (c) => {
  const db = getDb()
  const areaId = c.req.query('areaId')
  if (areaId) {
    const sectors = db.prepare('SELECT * FROM sector WHERE area_id = ? ORDER BY sort_order').all(areaId)
    return c.json(sectors)
  }
  const sectors = db.prepare('SELECT * FROM sector ORDER BY sort_order').all()
  return c.json(sectors)
})

sectorsRouter.get('/:id', async (c) => {
  const db = getDb()
  const sector = db.prepare('SELECT * FROM sector WHERE id = ?').get(c.req.param('id'))
  if (!sector) return c.json({ error: 'Not found' }, 404)
  return c.json(sector)
})
