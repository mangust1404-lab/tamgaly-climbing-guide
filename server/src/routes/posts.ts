import { Hono } from 'hono'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getDb } from '../db/connection'
import { notifyAdmin } from '../telegram'

export const postsRouter = new Hono()

const POSTS_DIR = '/var/www/tamgaly/posts'

function savePhoto(dataUrl: string, postId: string, idx: number): string {
  mkdirSync(POSTS_DIR, { recursive: true })
  const ext = dataUrl.startsWith('data:image/png') ? 'png' : 'jpg'
  const filename = `post-${postId}-${idx}.${ext}`
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  writeFileSync(join(POSTS_DIR, filename), Buffer.from(base64, 'base64'))
  return `/posts/${filename}`
}

// List posts by type
postsRouter.get('/', async (c) => {
  const db = getDb()
  const type = c.req.query('type') // 'gear' | 'partner' | 'ride' | undefined for all
  const status = c.req.query('status') || 'active'

  let query = `
    SELECT p.*, COALESCE(u.display_name, 'Anonymous') as author_name, u.avatar_url as author_avatar,
           u.telegram_handle as author_tg, u.whatsapp_phone as author_wa
    FROM post p
    LEFT JOIN app_user u ON p.author_id = u.id
    WHERE p.status = ?
  `
  const params: unknown[] = [status]
  if (type) { query += ' AND p.type = ?'; params.push(type) }
  query += ' ORDER BY p.created_at DESC LIMIT 100'

  const rows = db.prepare(query).all(...params) as any[]
  const posts = rows.map(r => ({
    id: r.id,
    type: r.type,
    authorId: r.author_id,
    authorName: r.author_name,
    authorAvatar: r.author_avatar,
    authorTelegram: r.author_tg,
    authorWhatsapp: r.author_wa,
    title: r.title,
    description: r.description,
    photos: r.photos ? JSON.parse(r.photos) : [],
    price: r.price,
    currency: r.currency,
    eventDate: r.event_date,
    sectorId: r.sector_id,
    routeId: r.route_id,
    fromLocation: r.from_location,
    toLocation: r.to_location,
    seats: r.seats,
    gradeMin: r.grade_min,
    gradeMax: r.grade_max,
    rideRole: r.ride_role,
    status: r.status,
    createdAt: r.created_at,
  }))
  return c.json(posts)
})

// Get single post
postsRouter.get('/:id', async (c) => {
  const db = getDb()
  const r = db.prepare(`
    SELECT p.*, COALESCE(u.display_name, 'Anonymous') as author_name, u.avatar_url as author_avatar,
           u.telegram_handle as author_tg, u.whatsapp_phone as author_wa
    FROM post p LEFT JOIN app_user u ON p.author_id = u.id WHERE p.id = ?
  `).get(c.req.param('id')) as any
  if (!r) return c.json({ error: 'not found' }, 404)
  return c.json({
    id: r.id, type: r.type, authorId: r.author_id, authorName: r.author_name,
    authorAvatar: r.author_avatar, authorTelegram: r.author_tg, authorWhatsapp: r.author_wa,
    title: r.title, description: r.description,
    photos: r.photos ? JSON.parse(r.photos) : [],
    price: r.price, currency: r.currency, eventDate: r.event_date,
    sectorId: r.sector_id, routeId: r.route_id,
    fromLocation: r.from_location, toLocation: r.to_location,
    seats: r.seats, gradeMin: r.grade_min, gradeMax: r.grade_max,
    rideRole: r.ride_role,
    status: r.status, createdAt: r.created_at,
  })
})

// Create post
postsRouter.post('/', async (c) => {
  const db = getDb()
  const body = await c.req.json()
  const {
    type, authorId, title, description, photos, // photos is array of base64 data URLs
    price, currency, eventDate, sectorId, routeId,
    fromLocation, toLocation, seats, gradeMin, gradeMax, rideRole,
  } = body

  if (!type || !authorId || !title) return c.json({ error: 'type, authorId, title required' }, 400)
  if (!['gear', 'partner', 'ride'].includes(type)) return c.json({ error: 'invalid type' }, 400)

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  // Save photos to disk
  const photoUrls: string[] = []
  if (Array.isArray(photos)) {
    for (let i = 0; i < photos.length && i < 5; i++) {
      const p = photos[i]
      if (typeof p === 'string' && p.startsWith('data:image')) {
        try { photoUrls.push(savePhoto(p, id, i)) } catch {}
      } else if (typeof p === 'string') {
        photoUrls.push(p)
      }
    }
  }

  db.prepare(`
    INSERT INTO post (id, type, author_id, title, description, photos, price, currency,
                      event_date, sector_id, route_id, from_location, to_location, seats,
                      grade_min, grade_max, ride_role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(
    id, type, authorId, title, description || null,
    photoUrls.length > 0 ? JSON.stringify(photoUrls) : null,
    price || null, currency || null, eventDate || null,
    sectorId || null, routeId || null,
    fromLocation || null, toLocation || null, seats || null,
    gradeMin || null, gradeMax || null,
    type === 'ride' ? (rideRole || null) : null,
    now, now,
  )

  // Get author name for notification
  const author = db.prepare('SELECT display_name FROM app_user WHERE id = ?').get(authorId) as any
  const typeNames: Record<string, string> = { gear: '🛒 Барахолка', partner: '🤝 Напарник', ride: '🚗 Попутчик' }
  notifyAdmin(`📋 <b>Новое объявление</b>\n${typeNames[type] || type}\nОт: ${author?.display_name || 'Anonymous'}\nЗаголовок: ${title}`).catch(() => {})

  return c.json({ status: 'created', id })
})

// Update post (status, title, description, type-specific fields) — author or admin
postsRouter.patch('/:id', async (c) => {
  const db = getDb()
  const body = await c.req.json()
  const { authorId, ...patch } = body
  const adminToken = c.req.header('X-Admin-Token')
  const isAdmin = adminToken && adminToken === (process.env.ADMIN_PASSWORD || 'tamgaly2024')
  if (!authorId && !isAdmin) return c.json({ error: 'authorId required' }, 400)

  const post = db.prepare('SELECT author_id FROM post WHERE id = ?').get(c.req.param('id')) as any
  if (!post) return c.json({ error: 'not found' }, 404)
  if (!isAdmin && post.author_id !== authorId) return c.json({ error: 'forbidden' }, 403)

  const allowed = ['status', 'title', 'description', 'price', 'currency', 'event_date',
                   'sector_id', 'route_id', 'from_location', 'to_location', 'seats',
                   'grade_min', 'grade_max', 'ride_role']
  const camelToSnake: Record<string, string> = {
    eventDate: 'event_date', sectorId: 'sector_id', routeId: 'route_id',
    fromLocation: 'from_location', toLocation: 'to_location',
    gradeMin: 'grade_min', gradeMax: 'grade_max',
    rideRole: 'ride_role',
  }
  const fields: string[] = []
  const params: unknown[] = []
  for (const [k, v] of Object.entries(patch)) {
    const col = camelToSnake[k] || k
    if (!allowed.includes(col)) continue
    if (col === 'status' && !['active', 'closed'].includes(v as string)) continue
    fields.push(`${col} = ?`); params.push(v ?? null)
  }
  if (fields.length === 0) return c.json({ status: 'no changes' })
  fields.push('updated_at = ?'); params.push(new Date().toISOString())
  params.push(c.req.param('id'))
  db.prepare(`UPDATE post SET ${fields.join(', ')} WHERE id = ?`).run(...params)
  return c.json({ status: 'ok' })
})

// Delete post — author or admin (X-Admin-Token)
postsRouter.delete('/:id', async (c) => {
  const db = getDb()
  const adminToken = c.req.header('X-Admin-Token')
  const isAdmin = adminToken && adminToken === (process.env.ADMIN_PASSWORD || 'tamgaly2024')
  const authorId = c.req.query('authorId')
  const post = db.prepare('SELECT author_id, photos FROM post WHERE id = ?').get(c.req.param('id')) as any
  if (!post) return c.json({ error: 'not found' }, 404)
  if (!isAdmin) {
    if (!authorId) return c.json({ error: 'authorId required' }, 400)
    if (post.author_id !== authorId) return c.json({ error: 'forbidden' }, 403)
  }
  db.prepare('DELETE FROM post WHERE id = ?').run(c.req.param('id'))
  return c.json({ status: 'deleted', byAdmin: !!isAdmin })
})
