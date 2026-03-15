import { Hono } from 'hono'
import { getDb } from '../db/connection'

export const syncRouter = new Hono()

// Register or update user
syncRouter.post('/user', async (c) => {
  const body = await c.req.json()
  const db = getDb()
  const { id, displayName } = body

  if (!id || !displayName) {
    return c.json({ error: 'id and displayName required' }, 400)
  }

  const existing = db.prepare('SELECT id FROM app_user WHERE id = ?').get(id)
  if (existing) {
    db.prepare('UPDATE app_user SET display_name = ?, updated_at = ? WHERE id = ?')
      .run(displayName, new Date().toISOString(), id)
    return c.json({ status: 'updated' })
  }

  db.prepare('INSERT INTO app_user (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(id, displayName, new Date().toISOString(), new Date().toISOString())
  return c.json({ status: 'created' })
})

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

    const userId = payload.userId || 'anonymous'
    const routeId = payload.routeId

    // Validate references exist
    const userExists = db.prepare('SELECT id FROM app_user WHERE id = ?').get(userId)
    const routeExists = db.prepare('SELECT id FROM route WHERE id = ?').get(routeId)

    if (!userExists) {
      // Auto-register unknown user
      db.prepare('INSERT OR IGNORE INTO app_user (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run(userId, 'Unknown', new Date().toISOString(), new Date().toISOString())
    }

    if (!routeExists) {
      console.log(`Unknown route_id: ${routeId}`)
      return c.json({ error: `Unknown route: ${routeId}` }, 400)
    }

    const id = crypto.randomUUID()
    db.prepare(`
      INSERT INTO ascent (id, local_id, user_id, route_id, date, style, rating, personal_grade, notes, is_public, points, created_at, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, localId,
      userId,
      routeId, payload.date, payload.style,
      payload.rating != null ? Number(payload.rating) : null,
      payload.personalGrade || null,
      payload.notes || null,
      (payload.isPublic ?? true) ? 1 : 0,
      payload.points || 0,
      new Date().toISOString(), new Date().toISOString(),
    )

    return c.json({ status: 'created', serverId: id })
  }

  if (action === 'update') {
    const existing = db.prepare('SELECT id FROM ascent WHERE local_id = ?').get(localId) as { id: string } | undefined
    if (!existing) {
      // Upsert: record was lost (server rebuild), re-create it
      const userId = payload.userId || 'anonymous'
      const userExists = db.prepare('SELECT id FROM app_user WHERE id = ?').get(userId)
      if (!userExists) {
        db.prepare('INSERT OR IGNORE INTO app_user (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)')
          .run(userId, 'Unknown', new Date().toISOString(), new Date().toISOString())
      }
      const id = crypto.randomUUID()
      db.prepare(`
        INSERT INTO ascent (id, local_id, user_id, route_id, date, style, rating, personal_grade, notes, is_public, points, created_at, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, localId, userId,
        payload.routeId, payload.date, payload.style,
        payload.rating != null ? Number(payload.rating) : null,
        payload.personalGrade || null,
        payload.notes || null,
        (payload.isPublic ?? true) ? 1 : 0,
        payload.points || 0,
        new Date().toISOString(), new Date().toISOString(),
      )
      return c.json({ status: 'created', serverId: id })
    }

    db.prepare(`
      UPDATE ascent SET route_id = ?, date = ?, style = ?, rating = ?, notes = ?, points = ?, synced_at = ?
      WHERE local_id = ?
    `).run(
      payload.routeId, payload.date, payload.style,
      payload.rating != null ? Number(payload.rating) : null,
      payload.notes || null,
      payload.points || 0,
      new Date().toISOString(),
      localId,
    )

    return c.json({ status: 'updated', serverId: existing.id })
  }

  if (action === 'delete') {
    db.prepare('DELETE FROM ascent WHERE local_id = ?').run(localId)
    return c.json({ status: 'deleted' })
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

    const userId = payload.userId || 'anonymous'
    const userExists = db.prepare('SELECT id FROM app_user WHERE id = ?').get(userId)
    if (!userExists) {
      db.prepare('INSERT OR IGNORE INTO app_user (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run(userId, 'Unknown', new Date().toISOString(), new Date().toISOString())
    }

    const id = crypto.randomUUID()
    db.prepare(`
      INSERT INTO review (id, local_id, user_id, route_id, rating, comment, grade_opinion, conditions_note, created_at, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, localId,
      userId,
      payload.routeId,
      payload.rating != null ? Number(payload.rating) : null,
      payload.comment || null, payload.gradeOpinion || null,
      payload.conditionsNote || null,
      new Date().toISOString(), new Date().toISOString(),
    )

    return c.json({ status: 'created', serverId: id })
  }

  if (action === 'update') {
    const existing = db.prepare('SELECT id FROM review WHERE local_id = ?').get(localId) as { id: string } | undefined
    if (!existing) {
      // Upsert: record was lost (server rebuild), re-create it
      const userId = payload.userId || 'anonymous'
      const userExists = db.prepare('SELECT id FROM app_user WHERE id = ?').get(userId)
      if (!userExists) {
        db.prepare('INSERT OR IGNORE INTO app_user (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)')
          .run(userId, 'Unknown', new Date().toISOString(), new Date().toISOString())
      }
      const id = crypto.randomUUID()
      db.prepare(`
        INSERT INTO review (id, local_id, user_id, route_id, rating, comment, grade_opinion, conditions_note, created_at, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, localId, userId,
        payload.routeId,
        payload.rating != null ? Number(payload.rating) : null,
        payload.comment || null, payload.gradeOpinion || null,
        payload.conditionsNote || null,
        new Date().toISOString(), new Date().toISOString(),
      )
      return c.json({ status: 'created', serverId: id })
    }

    db.prepare(`
      UPDATE review SET rating = ?, comment = ?, grade_opinion = ?, conditions_note = ?, synced_at = ?
      WHERE local_id = ?
    `).run(
      payload.rating != null ? Number(payload.rating) : null,
      payload.comment || null, payload.gradeOpinion || null,
      payload.conditionsNote || null,
      new Date().toISOString(),
      localId,
    )

    return c.json({ status: 'updated', serverId: existing.id })
  }

  if (action === 'delete') {
    db.prepare('DELETE FROM review WHERE local_id = ?').run(localId)
    return c.json({ status: 'deleted' })
  }

  return c.json({ error: 'Unknown action' }, 400)
})

// Push suggestion from client
syncRouter.post('/suggestion', async (c) => {
  const body = await c.req.json()
  const sdb = getDb()

  const { action, localId, payload } = body

  if (action === 'create') {
    const existing = sdb.prepare('SELECT id FROM suggestion WHERE id = ?').get(payload.id || localId)
    if (existing) {
      return c.json({ status: 'duplicate', serverId: (existing as { id: string }).id })
    }

    sdb.prepare(`
      INSERT INTO suggestion (id, user_id, user_name, sector_id, type, status, data, comment, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.id || localId,
      payload.userId || 'anonymous',
      payload.userName || '',
      payload.sectorId || null,
      payload.type || 'route',
      'pending',
      payload.data || null,
      payload.comment || null,
      payload.createdAt || new Date().toISOString(),
    )

    return c.json({ status: 'created', serverId: payload.id || localId })
  }

  return c.json({ error: 'Unknown action' }, 400)
})

// Pull suggestions (for admin moderation)
syncRouter.get('/suggestions', async (c) => {
  const sdb = getDb()
  const status = c.req.query('status') || 'pending'
  const suggestions = sdb.prepare('SELECT * FROM suggestion WHERE status = ? ORDER BY created_at DESC').all(status)
  return c.json(suggestions)
})

// Update suggestion status (approve/reject)
syncRouter.patch('/suggestion/:id', async (c) => {
  const sdb = getDb()
  const id = c.req.param('id')
  const body = await c.req.json()
  const { status, reviewedBy } = body

  sdb.prepare('UPDATE suggestion SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?')
    .run(status, reviewedBy || null, new Date().toISOString(), id)

  return c.json({ status: 'updated' })
})

// Pull reviews from server (grade votes, ratings, comments)
syncRouter.get('/reviews', async (c) => {
  const db = getDb()
  const since = c.req.query('since')
  const limit = parseInt(c.req.query('limit') || '500')

  let query = `
    SELECT r.id, r.local_id, r.user_id, r.route_id, r.rating, r.comment,
           r.grade_opinion, r.conditions_note, r.created_at,
           COALESCE(u.display_name, 'Anonymous') as user_name
    FROM review r
    LEFT JOIN app_user u ON r.user_id = u.id
    WHERE 1=1
  `
  const params: unknown[] = []

  if (since) {
    query += ' AND r.created_at > ?'
    params.push(since)
  }

  query += ' ORDER BY r.created_at DESC LIMIT ?'
  params.push(limit)

  const reviews = db.prepare(query).all(...params)
  return c.json(reviews)
})

// Pull ascents from server (for activity feed & leaderboard)
syncRouter.get('/ascents', async (c) => {
  const db = getDb()
  const since = c.req.query('since') // ISO date string
  const limit = parseInt(c.req.query('limit') || '200')

  let query = `
    SELECT a.id, a.local_id, a.user_id, a.route_id, a.date, a.style,
           a.rating, a.notes, a.points, a.created_at,
           COALESCE(u.display_name, 'Anonymous') as user_name,
           r.name as route_name, r.grade as route_grade
    FROM ascent a
    LEFT JOIN app_user u ON a.user_id = u.id
    LEFT JOIN route r ON a.route_id = r.id
    WHERE a.is_public = 1
  `
  const params: unknown[] = []

  if (since) {
    query += ' AND a.created_at > ?'
    params.push(since)
  }

  query += ' ORDER BY a.date DESC, a.created_at DESC LIMIT ?'
  params.push(limit)

  const ascents = db.prepare(query).all(...params)
  return c.json(ascents)
})

// Pull users (for leaderboard display names)
syncRouter.get('/users', async (c) => {
  const db = getDb()
  const users = db.prepare('SELECT id, display_name, created_at FROM app_user').all()
  return c.json(users)
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
      MIN(a.user_id) as user_id,
      COALESCE(u.display_name, 'Anonymous') as display_name,
      SUM(a.points) as total_points,
      COUNT(*) as ascent_count,
      MAX(a.points) as best_ascent
    FROM ascent a
    LEFT JOIN app_user u ON a.user_id = u.id
    WHERE a.style != 'attempt' ${dateFilter}
    GROUP BY COALESCE(u.display_name, 'Anonymous')
    ORDER BY total_points DESC
    LIMIT 50
  `).all()

  return c.json(leaderboard)
})
