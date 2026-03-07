import { Hono } from 'hono'
import { getDb } from '../db/connection'

export const syncRouter = new Hono()

// Push ascent from client
syncRouter.post('/ascent', async (c) => {
  const body = await c.req.json()
  const db = getDb()

  const { action, localId, payload } = body

  if (action === 'create') {
    // Check for duplicate by localId
    const existing = db.prepare('SELECT id FROM ascent WHERE local_id = ?').get(localId)
    if (existing) {
      return c.json({ status: 'duplicate', serverId: (existing as { id: string }).id })
    }

    const id = crypto.randomUUID()
    db.prepare(`
      INSERT INTO ascent (id, local_id, user_id, route_id, date, style, rating, personal_grade, notes, is_public, points, created_at, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, localId,
      payload.userId || 'anonymous',
      payload.routeId, payload.date, payload.style,
      payload.rating || null, payload.personalGrade || null,
      payload.notes || null, payload.isPublic ?? true,
      payload.points || 0,
      new Date().toISOString(), new Date().toISOString(),
    )

    return c.json({ status: 'created', serverId: id })
  }

  return c.json({ error: 'Unknown action' }, 400)
})

// Push review from client
syncRouter.post('/review', async (c) => {
  const body = await c.req.json()
  const db = getDb()

  const { action, localId, payload } = body

  if (action === 'create') {
    const existing = db.prepare('SELECT id FROM review WHERE local_id = ?').get(localId)
    if (existing) {
      return c.json({ status: 'duplicate', serverId: (existing as { id: string }).id })
    }

    const id = crypto.randomUUID()
    db.prepare(`
      INSERT INTO review (id, local_id, user_id, route_id, rating, comment, grade_opinion, conditions_note, created_at, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, localId,
      payload.userId || 'anonymous',
      payload.routeId, payload.rating,
      payload.comment || null, payload.gradeOpinion || null,
      payload.conditionsNote || null,
      new Date().toISOString(), new Date().toISOString(),
    )

    return c.json({ status: 'created', serverId: id })
  }

  return c.json({ error: 'Unknown action' }, 400)
})

// Leaderboard
syncRouter.get('/leaderboard', async (c) => {
  const db = getDb()
  const period = c.req.query('period') || 'all' // all, season, month

  let dateFilter = ''
  if (period === 'month') {
    const monthAgo = new Date()
    monthAgo.setMonth(monthAgo.getMonth() - 1)
    dateFilter = `AND a.date >= '${monthAgo.toISOString().split('T')[0]}'`
  } else if (period === 'season') {
    const year = new Date().getFullYear()
    dateFilter = `AND a.date >= '${year}-01-01'`
  }

  const leaderboard = db.prepare(`
    SELECT
      a.user_id,
      COALESCE(u.display_name, 'Anonymous') as display_name,
      SUM(a.points) as total_points,
      COUNT(*) as ascent_count,
      MAX(a.points) as best_ascent
    FROM ascent a
    LEFT JOIN app_user u ON a.user_id = u.id
    WHERE a.style != 'attempt' ${dateFilter}
    GROUP BY a.user_id
    ORDER BY total_points DESC
    LIMIT 50
  `).all()

  return c.json(leaderboard)
})
