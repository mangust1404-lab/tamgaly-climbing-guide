import { Hono } from 'hono'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getDb } from '../db/connection'
import { notifyAdmin, notifyChannelText, notifyChannelPhotos, editChannelMessage, deleteChannelMessages } from '../telegram'
import { autoTranslate } from '../translate'

export const postsRouter = new Hono()

const POSTS_DIR = '/var/www/tamgaly/posts'

/** Build channel post text from post fields */
function buildChannelText(post: any, authorName: string): string {
  const typeNames: Record<string, string> = { gear: '🛒 Барахолка', partner: '🤝 Напарник', ride: '🚗 Попутчик' }
  const subtypeNames: Record<string, string> = {
    'gear:rent': '— аренда',
    'partner:instructor': '— тренер/инструктор',
  }
  const tags: Record<string, string> = { gear: '#барахолка', partner: '#напарник', ride: '#попутчик' }
  const subtypeTags: Record<string, string> = {
    'gear:rent': '#аренда',
    'partner:instructor': '#тренер',
  }
  const subKey = post.subtype ? `${post.type}:${post.subtype}` : ''
  const lines: string[] = []
  const header = `<b>${typeNames[post.type] || post.type}${subKey && subtypeNames[subKey] ? ' ' + subtypeNames[subKey] : ''}</b>`
  const tagLine = `${tags[post.type] || ''}${subKey && subtypeTags[subKey] ? ' ' + subtypeTags[subKey] : ''}`
  lines.push(header + ' ' + tagLine)
  if (post.description && post.description.trim()) lines.push(post.description.trim())
  const meta: string[] = []
  if (post.type === 'gear' && post.price) meta.push(`💰 ${post.price} ${post.currency || '₸'}`)
  if (post.type === 'partner' && post.event_date) meta.push(`📅 ${post.event_date}`)
  if (post.type === 'partner' && (post.grade_min || post.grade_max)) meta.push(`📊 ${post.grade_min || '?'}–${post.grade_max || '?'}`)
  if (post.type === 'ride' && post.ride_role) meta.push(post.ride_role === 'driver' ? '🚙 за рулём' : '🧳 ищу машину')
  if (post.type === 'ride' && post.event_date) meta.push(`📅 ${post.event_date}`)
  if (post.type === 'ride' && (post.from_location || post.to_location)) meta.push(`🗺 ${post.from_location || '?'} → ${post.to_location || '?'}`)
  if (post.type === 'ride' && post.seats) meta.push(`💺 ${post.seats}`)
  if (meta.length > 0) lines.push(meta.join(' · '))
  lines.push(`\n<i>От: ${authorName || 'Anonymous'}</i>`)
  lines.push(`<a href="https://tamgalyclimb.alexanderlobanov.de/install">📱 Открыть в приложении</a>`)
  return lines.join('\n')
}

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
    subtype: r.subtype,
    titleEn: r.title_en,
    titleKk: r.title_kk,
    descriptionEn: r.description_en,
    descriptionKk: r.description_kk,
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
    subtype: r.subtype,
    titleEn: r.title_en,
    titleKk: r.title_kk,
    descriptionEn: r.description_en,
    descriptionKk: r.description_kk,
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
    fromLocation, toLocation, seats, gradeMin, gradeMax, rideRole, subtype,
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
                      grade_min, grade_max, ride_role, subtype, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(
    id, type, authorId, title, description || null,
    photoUrls.length > 0 ? JSON.stringify(photoUrls) : null,
    price || null, currency || null, eventDate || null,
    sectorId || null, routeId || null,
    fromLocation || null, toLocation || null, seats || null,
    gradeMin || null, gradeMax || null,
    type === 'ride' ? (rideRole || null) : null,
    subtype || null,
    now, now,
  )

  // Auto-translate title and description (fire and forget — don't block response)
  ;(async () => {
    try {
      const titleEn = title ? await autoTranslate(title, 'en') : null
      const titleKk = title ? await autoTranslate(title, 'kk') : null
      const descEn = description ? await autoTranslate(description, 'en') : null
      const descKk = description ? await autoTranslate(description, 'kk') : null
      getDb().prepare('UPDATE post SET title_en=?, title_kk=?, description_en=?, description_kk=? WHERE id=?')
        .run(titleEn, titleKk, descEn, descKk, id)
    } catch {}
  })().catch(() => {})

  // Get author + post for channel
  const author = db.prepare('SELECT display_name FROM app_user WHERE id = ?').get(authorId) as any
  const fullPost = db.prepare('SELECT * FROM post WHERE id = ?').get(id) as any
  const channelText = buildChannelText(fullPost, author?.display_name)

  // If post has photos, send as media group with caption; otherwise text only
  ;(async () => {
    let messageIds: number[] = []
    if (photoUrls.length > 0) {
      const fullPhotoUrls = photoUrls.map(p => p.startsWith('http') ? p : `https://tamgalyclimb.alexanderlobanov.de${p}`)
      messageIds = await notifyChannelPhotos(fullPhotoUrls, channelText)
    } else {
      messageIds = await notifyChannelText(channelText, { disablePreview: true })
    }
    if (messageIds.length > 0) {
      try {
        getDb().prepare('UPDATE post SET tg_message_ids = ? WHERE id = ?').run(JSON.stringify(messageIds), id)
      } catch {}
    }
  })().catch(() => {})

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
                   'grade_min', 'grade_max', 'ride_role', 'subtype']
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

  // Re-translate if title or description changed
  const titleChanged = patch.title !== undefined
  const descChanged = patch.description !== undefined
  if (titleChanged || descChanged) {
    ;(async () => {
      try {
        const fresh = getDb().prepare('SELECT title, description FROM post WHERE id = ?').get(c.req.param('id')) as any
        const updates: string[] = []
        const vals: any[] = []
        if (titleChanged && fresh?.title) {
          updates.push('title_en=?', 'title_kk=?')
          vals.push(await autoTranslate(fresh.title, 'en'), await autoTranslate(fresh.title, 'kk'))
        }
        if (descChanged && fresh?.description) {
          updates.push('description_en=?', 'description_kk=?')
          vals.push(await autoTranslate(fresh.description, 'en'), await autoTranslate(fresh.description, 'kk'))
        }
        if (updates.length > 0) {
          vals.push(c.req.param('id'))
          getDb().prepare(`UPDATE post SET ${updates.join(', ')} WHERE id=?`).run(...vals)
        }
      } catch {}
    })().catch(() => {})
  }

  // Sync to channel: edit caption/text of channel message(s)
  ;(async () => {
    const fresh = db.prepare('SELECT p.*, u.display_name as author_name FROM post p LEFT JOIN app_user u ON p.author_id = u.id WHERE p.id = ?').get(c.req.param('id')) as any
    if (!fresh || !fresh.tg_message_ids) return
    let ids: number[] = []
    try { ids = JSON.parse(fresh.tg_message_ids) } catch { return }
    if (ids.length === 0) return
    const newText = buildChannelText(fresh, fresh.author_name)
    const hasPhotos = fresh.photos && JSON.parse(fresh.photos).length > 0
    await editChannelMessage(ids[0], newText, hasPhotos)
  })().catch(() => {})

  return c.json({ status: 'ok' })
})

// Delete post — author or admin (X-Admin-Token)
postsRouter.delete('/:id', async (c) => {
  const db = getDb()
  const adminToken = c.req.header('X-Admin-Token')
  const isAdmin = adminToken && adminToken === (process.env.ADMIN_PASSWORD || 'tamgaly2024')
  const authorId = c.req.query('authorId')
  const post = db.prepare('SELECT author_id, photos, tg_message_ids FROM post WHERE id = ?').get(c.req.param('id')) as any
  if (!post) return c.json({ error: 'not found' }, 404)
  if (!isAdmin) {
    if (!authorId) return c.json({ error: 'authorId required' }, 400)
    if (post.author_id !== authorId) return c.json({ error: 'forbidden' }, 403)
  }
  db.prepare('DELETE FROM post WHERE id = ?').run(c.req.param('id'))

  // Delete from channel too
  if (post.tg_message_ids) {
    try {
      const ids = JSON.parse(post.tg_message_ids)
      deleteChannelMessages(ids).catch(() => {})
    } catch {}
  }

  return c.json({ status: 'deleted', byAdmin: !!isAdmin })
})
