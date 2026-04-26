import { Hono } from 'hono'
import { createHash } from 'crypto'
import { getDb } from '../db/connection'
import { notifyModeration } from '../telegram'

function hashPin(pin: string): string {
  return createHash('sha256').update(`tamgaly:${pin}`).digest('hex')
}

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
      // Auto-create stub sector + route so FK constraints don't fail
      console.log(`Auto-creating stub route: ${routeId}`)
      const now = new Date().toISOString()
      db.prepare('INSERT OR IGNORE INTO sector (id, area_id, name, slug, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run('unknown', 'tamgaly-tas', 'Unknown', 'unknown', 999, now, now)
      db.prepare('INSERT OR IGNORE INTO route (id, sector_id, name, grade, grade_sort, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(routeId, 'unknown', 'Unknown Route', '?', 0, 'published', now, now)
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

    // Auto-create stub route if missing (admin may have created it but not synced yet)
    const routeExists = db.prepare('SELECT id FROM route WHERE id = ?').get(payload.routeId)
    if (!routeExists) {
      console.log(`Auto-creating stub route for review: ${payload.routeId}`)
      const now = new Date().toISOString()
      db.prepare('INSERT OR IGNORE INTO sector (id, area_id, name, slug, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run('unknown', 'tamgaly-tas', 'Unknown', 'unknown', 999, now, now)
      db.prepare('INSERT OR IGNORE INTO route (id, sector_id, name, grade, grade_sort, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(payload.routeId, 'unknown', 'Unknown Route', '?', 0, 'published', now, now)
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

    // Notify admin via Telegram
    notifyModeration(
      payload.userName || 'Anonymous',
      payload.type || 'route',
      payload.sectorId || null,
      payload.comment || null,
    ).catch(() => {})

    return c.json({ status: 'created', serverId: payload.id || localId })
  }

  return c.json({ error: 'Unknown action' }, 400)
})

// Pull suggestions (for admin moderation — requires auth)
syncRouter.get('/suggestions', async (c) => {
  const token = c.req.header('X-Admin-Token')
  const adminPw = process.env.ADMIN_PASSWORD || 'tamgaly2024'
  if (token !== adminPw) return c.json({ error: 'Unauthorized' }, 401)

  const sdb = getDb()
  const status = c.req.query('status') || 'pending'
  const suggestions = sdb.prepare('SELECT * FROM suggestion WHERE status = ? ORDER BY created_at DESC').all(status)
  return c.json(suggestions)
})

// Update suggestion status (approve/reject — requires auth)
syncRouter.patch('/suggestion/:id', async (c) => {
  const token = c.req.header('X-Admin-Token')
  const adminPw = process.env.ADMIN_PASSWORD || 'tamgaly2024'
  if (token !== adminPw) return c.json({ error: 'Unauthorized' }, 401)

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

// Set or update PIN for a user
syncRouter.post('/user/set-pin', async (c) => {
  const body = await c.req.json()
  const db = getDb()
  const { userId, pin } = body
  if (!userId || !pin) return c.json({ error: 'userId and pin required' }, 400)

  const user = db.prepare('SELECT id FROM app_user WHERE id = ?').get(userId)
  if (!user) return c.json({ error: 'user not found' }, 404)

  db.prepare('UPDATE app_user SET pin_hash = ?, updated_at = ? WHERE id = ?')
    .run(hashPin(pin), new Date().toISOString(), userId)
  return c.json({ status: 'ok' })
})

// Verify PIN for account recovery
syncRouter.post('/user/verify-pin', async (c) => {
  const body = await c.req.json()
  const db = getDb()
  const { userId, pin } = body
  if (!userId || !pin) return c.json({ error: 'userId and pin required' }, 400)

  const user = db.prepare('SELECT pin_hash FROM app_user WHERE id = ?').get(userId) as { pin_hash: string | null } | undefined
  if (!user) return c.json({ error: 'user not found' }, 404)
  if (!user.pin_hash) return c.json({ valid: true }) // no PIN set = allow recovery

  return c.json({ valid: user.pin_hash === hashPin(pin) })
})

// Lookup user by display name (for account recovery)
syncRouter.get('/user/lookup', async (c) => {
  const db = getDb()
  const name = c.req.query('name')
  if (!name) return c.json({ error: 'name required' }, 400)

  const users = db.prepare(
    'SELECT id, display_name, created_at, CASE WHEN pin_hash IS NOT NULL THEN 1 ELSE 0 END as has_pin FROM app_user WHERE display_name = ? COLLATE NOCASE'
  ).all(name.trim())

  return c.json(users)
})

// Upload avatar
syncRouter.post('/user/avatar', async (c) => {
  const body = await c.req.json()
  const db = getDb()
  const { userId, avatarData } = body // avatarData = base64 data URL
  if (!userId || !avatarData) return c.json({ error: 'userId and avatarData required' }, 400)

  // Save base64 to disk as file
  const fs = await import('fs')
  const path = await import('path')
  const ext = avatarData.startsWith('data:image/png') ? 'png' : 'jpg'
  const filename = `avatar-${userId}.${ext}`
  const avatarDir = '/var/www/tamgaly/avatars'
  fs.mkdirSync(avatarDir, { recursive: true })
  const base64 = avatarData.replace(/^data:image\/\w+;base64,/, '')
  fs.writeFileSync(path.join(avatarDir, filename), Buffer.from(base64, 'base64'))

  const avatarUrl = `/avatars/${filename}`
  db.prepare('UPDATE app_user SET avatar_url = ?, updated_at = ? WHERE id = ?')
    .run(avatarUrl, new Date().toISOString(), userId)
  return c.json({ status: 'ok', avatarUrl })
})

// Update user contacts (Telegram, WhatsApp)
syncRouter.post('/user/contacts', async (c) => {
  const body = await c.req.json()
  const db = getDb()
  const { userId, telegramHandle, whatsappPhone } = body
  if (!userId) return c.json({ error: 'userId required' }, 400)
  // Normalize Telegram handle: strip @, https://t.me/, whitespace
  const tg = telegramHandle ? String(telegramHandle).trim().replace(/^https?:\/\/t\.me\//, '').replace(/^@/, '') : null
  // Normalize WhatsApp: strip non-digits except leading +
  const wa = whatsappPhone ? String(whatsappPhone).trim().replace(/[^\d+]/g, '') : null
  db.prepare('UPDATE app_user SET telegram_handle = ?, whatsapp_phone = ?, updated_at = ? WHERE id = ?')
    .run(tg, wa, new Date().toISOString(), userId)
  return c.json({ status: 'ok', telegramHandle: tg, whatsappPhone: wa })
})

// Update privacy settings
syncRouter.post('/user/privacy', async (c) => {
  const body = await c.req.json()
  const db = getDb()
  const { userId, settings } = body
  if (!userId || !settings) return c.json({ error: 'userId and settings required' }, 400)
  db.prepare('UPDATE app_user SET privacy_settings = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(settings), new Date().toISOString(), userId)
  return c.json({ status: 'ok' })
})

// Get public profile (applies privacy settings)
syncRouter.get('/user/:id/public-profile', async (c) => {
  const db = getDb()
  const userId = c.req.param('id')
  const viewerId = c.req.query('viewer') || null
  const u = db.prepare('SELECT id, display_name, avatar_url, telegram_handle, whatsapp_phone, privacy_settings, created_at FROM app_user WHERE id = ?').get(userId) as any
  if (!u) return c.json({ error: 'not found' }, 404)
  // Defaults: routes/achievements/maxGrade visible to all; stats/dates/contacts hidden
  const defaults = { routes: 'all', achievements: 'all', maxGrade: 'all', stats: 'nobody', pyramid: 'nobody', dates: 'nobody', contacts: 'nobody' }
  let privacy = defaults
  try { privacy = { ...defaults, ...JSON.parse(u.privacy_settings || '{}') } } catch {}
  const isSelf = viewerId === userId
  // Helper: check if a field is visible to current viewer
  const visible = (field: keyof typeof defaults) => {
    if (isSelf) return true
    const level = (privacy as any)[field]
    return level === 'all'  // friends-level treated as nobody until friend system implemented
  }
  const result: any = {
    id: u.id,
    displayName: u.display_name,
    avatarUrl: u.avatar_url,
    createdAt: u.created_at,
    privacy,
    fields: {
      routes: visible('routes'),
      achievements: visible('achievements'),
      maxGrade: visible('maxGrade'),
      stats: visible('stats'),
      pyramid: visible('pyramid'),
      dates: visible('dates'),
      contacts: visible('contacts'),
    },
  }
  if (visible('contacts')) {
    result.telegramHandle = u.telegram_handle || null
    result.whatsappPhone = u.whatsapp_phone || null
  }
  return c.json(result)
})

// Push achievement
syncRouter.post('/achievement', async (c) => {
  const body = await c.req.json()
  const db = getDb()
  const { id, userId, type, targetId, name, earnedAt } = body
  if (!userId || !type || !name) return c.json({ error: 'userId, type, name required' }, 400)

  db.prepare(`
    INSERT OR IGNORE INTO achievement (id, user_id, type, target_id, name, earned_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id || crypto.randomUUID(), userId, type, targetId || null, name, earnedAt || new Date().toISOString())
  return c.json({ status: 'ok' })
})

// Pull achievements (recalculates sector_master for all users first)
syncRouter.get('/achievements', async (c) => {
  const db = getDb()

  // Recalculate sector_master achievements for all users
  const users = db.prepare('SELECT id FROM app_user').all() as { id: string }[]
  const sectors = db.prepare("SELECT id, name FROM sector WHERE id != 'unknown'").all() as { id: string; name: string }[]
  const now = new Date().toISOString()

  for (const user of users) {
    // Sector master
    for (const sector of sectors) {
      const totalRoutes = (db.prepare("SELECT COUNT(*) as cnt FROM route WHERE sector_id=? AND status='published'").get(sector.id) as any).cnt
      if (totalRoutes === 0) continue
      const climbedRoutes = (db.prepare("SELECT COUNT(DISTINCT route_id) as cnt FROM ascent WHERE user_id=? AND style IN ('onsight','flash','redpoint') AND route_id IN (SELECT id FROM route WHERE sector_id=? AND status='published')").get(user.id, sector.id) as any).cnt
      if (climbedRoutes >= totalRoutes) {
        db.prepare("INSERT OR IGNORE INTO achievement (id, user_id, type, target_id, name, earned_at) VALUES (?, ?, ?, ?, ?, ?)")
          .run(`sector_master:${sector.id}:${user.id}`, user.id, 'sector_master', sector.id, sector.name, now)
      }
    }

    // Grade king (5, 6, 7, 8)
    for (const prefix of ['5', '6', '7', '8']) {
      const names: Record<string, string> = { '5': 'Король пятёрок', '6': 'Король шестёрок', '7': 'Король семёрок', '8': 'Король восьмёрок' }
      const totalGrade = (db.prepare("SELECT COUNT(*) as cnt FROM route WHERE grade LIKE ? AND status='published'").get(`${prefix}%`) as any).cnt
      if (totalGrade === 0) continue
      const climbedGrade = (db.prepare("SELECT COUNT(DISTINCT route_id) as cnt FROM ascent WHERE user_id=? AND style IN ('onsight','flash','redpoint') AND route_id IN (SELECT id FROM route WHERE grade LIKE ? AND status='published')").get(user.id, `${prefix}%`) as any).cnt
      if (climbedGrade >= totalGrade) {
        db.prepare("INSERT OR IGNORE INTO achievement (id, user_id, type, target_id, name, earned_at) VALUES (?, ?, ?, ?, ?, ?)")
          .run(`grade_king:${prefix}:${user.id}`, user.id, 'grade_king', prefix, names[prefix], now)
      }
    }

    // Route type masters (multi-pitch, trad)
    for (const [routeType, name] of [['multi-pitch', 'Мастер мультипитчей'], ['trad', 'Трэд-воин']]) {
      const totalType = (db.prepare("SELECT COUNT(*) as cnt FROM route WHERE route_type=? AND status='published'").get(routeType) as any).cnt
      if (totalType === 0) continue
      const climbedType = (db.prepare("SELECT COUNT(DISTINCT route_id) as cnt FROM ascent WHERE user_id=? AND style IN ('onsight','flash','redpoint') AND route_id IN (SELECT id FROM route WHERE route_type=? AND status='published')").get(user.id, routeType) as any).cnt
      if (climbedType >= totalType) {
        db.prepare("INSERT OR IGNORE INTO achievement (id, user_id, type, target_id, name, earned_at) VALUES (?, ?, ?, ?, ?, ?)")
          .run(`type_master:${routeType}:${user.id}`, user.id, 'type_master', routeType, name, now)
      }
    }

    // Legend
    const totalAll = (db.prepare("SELECT COUNT(*) as cnt FROM route WHERE status='published'").get() as any).cnt
    const climbedAll = (db.prepare("SELECT COUNT(DISTINCT route_id) as cnt FROM ascent WHERE user_id=? AND style IN ('onsight','flash','redpoint') AND route_id IN (SELECT id FROM route WHERE status='published')").get(user.id) as any).cnt
    if (totalAll > 0 && climbedAll >= totalAll) {
      db.prepare("INSERT OR IGNORE INTO achievement (id, user_id, type, target_id, name, earned_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(`legend:all:${user.id}`, user.id, 'legend', 'all', 'Легенда Тамгалы', now)
    }
  }

  const achievements = db.prepare(`
    SELECT a.*, COALESCE(u.display_name, 'Anonymous') as user_name
    FROM achievement a
    LEFT JOIN app_user u ON a.user_id = u.id
    ORDER BY a.earned_at DESC
    LIMIT 500
  `).all()
  return c.json(achievements)
})

// Pull users (for leaderboard display names)
syncRouter.get('/users', async (c) => {
  const db = getDb()
  const users = db.prepare('SELECT id, display_name, avatar_url, created_at FROM app_user').all()
  return c.json(users)
})

// News for app users
syncRouter.get('/news', async (c) => {
  const db = getDb()
  const since = c.req.query('since') // ISO date
  let query = 'SELECT * FROM news'
  const params: string[] = []
  if (since) {
    query += ' WHERE created_at > ?'
    params.push(since)
  }
  query += ' ORDER BY created_at DESC LIMIT 20'
  try {
    const news = db.prepare(query).all(...params)
    return c.json(news)
  } catch {
    return c.json([]) // table may not exist yet
  }
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
