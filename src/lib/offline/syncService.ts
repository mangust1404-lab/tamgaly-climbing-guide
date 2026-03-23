import { db } from '../db/schema'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

/** Sync the current user profile to the server */
export async function syncUser(user: { id: string; displayName: string }): Promise<boolean> {
  try {
    console.log('syncUser:', API_BASE, user.id)
    const res = await fetch(`${API_BASE}/sync/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, displayName: user.displayName }),
    })
    console.log('syncUser response:', res.status)
    return res.ok
  } catch (err) {
    console.error('syncUser error:', err)
    return false
  }
}

/** Process the sync queue: push pending ascents and reviews to the server */
export async function processSyncQueue(userId: string): Promise<{ synced: number; failed: number }> {
  const items = await db.syncQueue.orderBy('createdAt').toArray()
  let synced = 0
  let failed = 0

  for (const item of items) {
    // Skip and remove items that have failed too many times
    if ((item.retryCount || 0) >= 5) {
      console.warn(`Sync: removing stuck item ${item.entity} ${item.localId} after ${item.retryCount} retries: ${item.lastError}`)
      await db.syncQueue.delete(item.id!)
      continue
    }
    try {
      const endpoint = item.entity === 'ascent' ? '/sync/ascent'
        : item.entity === 'suggestion' ? '/sync/suggestion'
        : '/sync/review'
      const payload = { ...item.payload, userId }

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: item.action,
          localId: item.localId,
          payload,
        }),
      })

      console.log(`Sync ${item.entity} ${item.localId}: ${res.status} ${res.statusText}`)
      if (res.ok) {
        const data = await res.json()
        // Remove from sync queue
        await db.syncQueue.delete(item.id!)
        // Update ascent/review sync status
        if (item.entity === 'ascent') {
          await db.ascents.where('localId').equals(item.localId).modify({
            syncStatus: 'synced',
            syncedAt: new Date().toISOString(),
          })
        } else if (item.entity === 'review') {
          await db.reviews.where('localId').equals(item.localId).modify({
            syncStatus: 'synced',
            syncedAt: new Date().toISOString(),
          })
        }
        synced++
        console.log(`Synced ${item.entity} ${item.localId}: ${data.status}`)
      } else {
        const errBody = await res.text().catch(() => '')
        const errMsg = `HTTP ${res.status}: ${errBody.slice(0, 100)}`
        console.error(`Sync failed for ${item.entity} ${item.localId}:`, errMsg)
        failed++
        await db.syncQueue.update(item.id!, {
          retryCount: (item.retryCount || 0) + 1,
          lastError: errMsg,
        })
      }
    } catch (err) {
      failed++
      await db.syncQueue.update(item.id!, {
        retryCount: (item.retryCount || 0) + 1,
        lastError: err instanceof Error ? err.message : 'Network error',
      })
    }
  }

  return { synced, failed }
}

/** Pull recent ascents from the server and save to local DB for the activity feed */
export async function pullAscents(currentUserId?: string): Promise<number> {
  try {
    // Always do a full pull to detect deletions
    const url = `${API_BASE}/sync/ascents?limit=10000`

    const res = await fetch(url)
    if (!res.ok) return 0

    const ascents = await res.json() as Array<{
      id: string
      local_id: string
      user_id: string
      route_id: string
      date: string
      style: string
      rating: number | null
      notes: string | null
      points: number
      created_at: string
      user_name: string
    }>

    // Build set of server local_ids for cleanup
    const serverLocalIds = new Set(ascents.map(a => a.local_id))

    // Save new ascents to local DB and update points from server
    let added = 0
    for (const a of ascents) {
      const existing = await db.ascents.get(a.id)
      if (existing) {
        // Update points if server has different value (e.g. scoring recalculation)
        if (existing.points !== a.points) {
          await db.ascents.update(a.id, { points: a.points })
        }
        continue
      }
      const byLocal = await db.ascents.where('localId').equals(a.local_id).first()
      if (byLocal) {
        // Always mark as synced when server confirms it exists, update points
        const updates: Record<string, unknown> = {}
        if (byLocal.syncStatus !== 'synced') {
          updates.syncStatus = 'synced'
          updates.syncedAt = a.created_at
        }
        if (byLocal.points !== a.points) updates.points = a.points
        if (Object.keys(updates).length > 0) {
          await db.ascents.update(byLocal.id, updates)
        }
        continue
      }

      // Fallback: match by userId + routeId + style + date (handles ID mismatches)
      const byMatch = await db.ascents
        .where('routeId').equals(a.route_id)
        .and(x => x.userId === a.user_id && x.style === a.style && x.date === a.date)
        .first()
      if (byMatch) {
        const updates: Record<string, unknown> = {}
        if (byMatch.syncStatus !== 'synced') {
          updates.syncStatus = 'synced'
          updates.syncedAt = a.created_at
        }
        if (byMatch.points !== a.points) updates.points = a.points
        if (byMatch.localId !== a.local_id) updates.localId = a.local_id
        if (Object.keys(updates).length > 0) {
          await db.ascents.update(byMatch.id, updates)
          console.log(`Sync: matched ascent by content ${a.route_id} ${a.style} ${a.date}, updated points ${byMatch.points}->${a.points}`)
        }
        continue
      }

      await db.ascents.put({
        id: a.id,
        localId: a.local_id,
        userId: a.user_id,
        routeId: a.route_id,
        date: a.date,
        style: a.style as any,
        rating: a.rating ?? undefined,
        notes: a.notes ?? undefined,
        isPublic: true,
        points: a.points,
        syncStatus: 'synced',
        createdAt: a.created_at,
        syncedAt: a.created_at,
      })
      added++
    }

    // Fix stuck pending ascents: aggressive matching
    if (currentUserId) {
      const pendingLocal = await db.ascents
        .where('syncStatus').equals('pending')
        .and(a => a.userId === currentUserId)
        .toArray()

      if (pendingLocal.length > 0) {
        console.log(`Fix pending: found ${pendingLocal.length} stuck ascents`)
        // Build multiple lookup maps for this user's server ascents
        const serverByLocalId = new Map<string, typeof ascents[0]>()
        const serverByKey = new Map<string, typeof ascents[0]>()
        const serverByStyleDate = new Map<string, typeof ascents[0]>()
        for (const a of ascents) {
          if (a.user_id === currentUserId) {
            serverByLocalId.set(a.local_id, a)
            serverByKey.set(`${a.route_id}|${a.style}|${a.date}`, a)
            serverByStyleDate.set(`${a.style}|${a.date}`, a)
          }
        }

        for (const local of pendingLocal) {
          // Try matching: by localId, by routeId+style+date, by style+date
          const match =
            serverByLocalId.get(local.localId) ||
            serverByLocalId.get(local.id) ||
            serverByKey.get(`${local.routeId}|${local.style}|${local.date}`) ||
            serverByStyleDate.get(`${local.style}|${local.date}`)

          if (match) {
            console.log(`Fix pending: ${local.id} matched server ${match.local_id} via aggressive match`)
            await db.ascents.update(local.id, {
              syncStatus: 'synced',
              syncedAt: match.created_at,
              points: match.points,
            })
            // Clean orphaned syncQueue entries
            const queueItem = await db.syncQueue.where('localId').equals(local.localId).first()
            if (queueItem) await db.syncQueue.delete(queueItem.id!)
          } else {
            // No server match: re-queue for push (reset retries)
            console.log(`Fix pending: ${local.id} no server match, re-queuing for push`)
            const inQueue = await db.syncQueue.where('localId').equals(local.localId).first()
            if (inQueue) {
              await db.syncQueue.update(inQueue.id!, { retryCount: 0 })
            } else {
              await db.syncQueue.add({
                entity: 'ascent',
                localId: local.localId,
                action: 'create',
                payload: {
                  userId: local.userId, routeId: local.routeId, date: local.date,
                  style: local.style, rating: local.rating, notes: local.notes, points: local.points,
                },
                createdAt: Date.now(),
                retryCount: 0,
              })
            }
          }
        }
      }
    }

    // Cleanup: remove locally pulled ascents from OTHER users that no longer exist on server
    if (currentUserId) {
      const localOtherAscents = await db.ascents
        .where('syncStatus').equals('synced')
        .and(a => a.userId !== currentUserId)
        .toArray()

      for (const local of localOtherAscents) {
        if (!serverLocalIds.has(local.localId)) {
          console.log(`Cleanup: removing stale ascent ${local.localId} from ${local.userId}`)
          await db.ascents.delete(local.id)
        }
      }
    }

    // Save users we learned about
    await pullUsers()

    return added
  } catch (err) {
    console.warn('Failed to pull ascents:', err)
    return 0
  }
}

/** Pull reviews from server (grade votes, ratings, comments) */
export async function pullReviews(currentUserId?: string): Promise<number> {
  try {
    const url = `${API_BASE}/sync/reviews?limit=10000`

    const res = await fetch(url)
    if (!res.ok) return 0

    const reviews = await res.json() as Array<{
      id: string
      local_id: string
      user_id: string
      route_id: string
      rating: number | null
      comment: string | null
      grade_opinion: string | null
      conditions_note: string | null
      created_at: string
    }>

    const serverLocalIds = new Set(reviews.map(r => r.local_id))

    let added = 0
    for (const r of reviews) {
      const existing = await db.reviews.get(r.id)
      if (existing) continue
      const byLocal = await db.reviews.where('localId').equals(r.local_id).first()
      if (byLocal) {
        if (byLocal.syncStatus !== 'synced') {
          await db.reviews.update(byLocal.id, { syncStatus: 'synced', syncedAt: r.created_at })
        }
        continue
      }

      await db.reviews.put({
        id: r.id,
        localId: r.local_id,
        userId: r.user_id,
        routeId: r.route_id,
        rating: r.rating ?? undefined,
        comment: r.comment ?? undefined,
        gradeOpinion: (r.grade_opinion as any) ?? undefined,
        conditionsNote: r.conditions_note ?? undefined,
        syncStatus: 'synced',
        createdAt: r.created_at,
        syncedAt: r.created_at,
      })
      added++
    }

    // Cleanup: remove locally pulled reviews from OTHER users that no longer exist on server
    if (currentUserId) {
      const localOtherReviews = await db.reviews
        .where('syncStatus').equals('synced')
        .and(r => r.userId !== currentUserId)
        .toArray()

      for (const local of localOtherReviews) {
        if (!serverLocalIds.has(local.localId)) {
          console.log(`Cleanup: removing stale review ${local.localId} from ${local.userId}`)
          await db.reviews.delete(local.id)
        }
      }
    }

    return added
  } catch (err) {
    console.warn('Failed to pull reviews:', err)
    return 0
  }
}

/** Pull user profiles from server so leaderboard and feed show names */
async function pullUsers(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/sync/users`)
    if (!res.ok) return

    const users = await res.json() as Array<{
      id: string
      display_name: string
      created_at: string
    }>

    for (const u of users) {
      await db.users.put({
        id: u.id,
        displayName: u.display_name,
        createdAt: u.created_at,
        updatedAt: u.created_at,
      } as any)
    }
  } catch {
    // Silently fail — not critical
  }
}

/**
 * Reconcile: find local ascents/reviews marked "synced" that are missing on the server,
 * and re-queue them for push. This handles server data loss (rebuild, etc).
 */
async function reconcileMissing(userId: string): Promise<number> {
  let requeued = 0
  try {
    // Get all server ascent local_ids for this user
    const res = await fetch(`${API_BASE}/sync/ascents?limit=10000`)
    if (!res.ok) return 0
    const serverAscents = await res.json() as Array<{ local_id: string; user_id: string }>
    const serverLocalIds = new Set(serverAscents.map(a => a.local_id))

    // Find local synced ascents that are missing on server
    const localAscents = await db.ascents
      .where('userId').equals(userId)
      .and(a => a.syncStatus === 'synced')
      .toArray()

    for (const a of localAscents) {
      if (!serverLocalIds.has(a.localId)) {
        // Check not already in sync queue
        const inQueue = await db.syncQueue.where('localId').equals(a.localId).first()
        if (inQueue) continue

        console.log(`Reconcile: re-queuing ascent ${a.localId} (missing on server)`)
        await db.ascents.where('localId').equals(a.localId).modify({ syncStatus: 'pending' })
        await db.syncQueue.add({
          entity: 'ascent',
          localId: a.localId,
          action: 'create',
          payload: {
            userId: a.userId, routeId: a.routeId, date: a.date, style: a.style,
            rating: a.rating, notes: a.notes, points: a.points,
          },
          createdAt: Date.now(),
          retryCount: 0,
        })
        requeued++
      }
    }

    // Same for reviews
    const resR = await fetch(`${API_BASE}/sync/reviews?limit=10000`)
    if (resR.ok) {
      const serverReviews = await resR.json() as Array<{ local_id: string; user_id: string }>
      const serverReviewIds = new Set(serverReviews.map(r => r.local_id))

      const localReviews = await db.reviews
        .where('userId').equals(userId)
        .and(r => r.syncStatus === 'synced')
        .toArray()

      for (const r of localReviews) {
        if (!serverReviewIds.has(r.localId)) {
          const inQueue = await db.syncQueue.where('localId').equals(r.localId).first()
          if (inQueue) continue

          console.log(`Reconcile: re-queuing review ${r.localId} (missing on server)`)
          await db.reviews.where('localId').equals(r.localId).modify({ syncStatus: 'pending' })
          await db.syncQueue.add({
            entity: 'review',
            localId: r.localId,
            action: 'create',
            payload: {
              userId: r.userId, routeId: r.routeId, rating: r.rating,
              comment: r.comment, gradeOpinion: r.gradeOpinion,
              conditionsNote: r.conditionsNote,
            },
            createdAt: Date.now(),
            retryCount: 0,
          })
          requeued++
        }
      }
    }
  } catch (err) {
    console.warn('Reconcile failed:', err)
  }
  return requeued
}

/** Pull updated route details (quickdraws, rope_length, etc.) from server */
async function pullRouteDetails(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/routes`)
    if (!res.ok) return 0
    const { routes } = await res.json() as { routes: Array<Record<string, unknown>> }
    let updated = 0
    for (const r of routes) {
      if (!r.quickdraws && !r.rope_length && !r.terrain_tags && !r.hold_types) continue
      const updates: Record<string, unknown> = {}
      if (r.quickdraws) updates.quickdraws = r.quickdraws
      if (r.rope_length) updates.ropeLength = r.rope_length
      if (r.terrain_tags) {
        try {
          const parsed = typeof r.terrain_tags === 'string' ? JSON.parse(r.terrain_tags) : r.terrain_tags
          updates.terrainTags = Array.isArray(parsed) ? parsed : []
        } catch { updates.terrainTags = [] }
      }
      if (r.hold_types) {
        try {
          const parsed = typeof r.hold_types === 'string' ? JSON.parse(r.hold_types) : r.hold_types
          updates.holdTypes = Array.isArray(parsed) ? parsed : []
        } catch { updates.holdTypes = [] }
      }
      if (Object.keys(updates).length > 0) {
        await db.routes.update(r.id as string, updates)
        updated++
      }
    }
    return updated
  } catch (err) {
    console.warn('Failed to pull route details:', err)
    return 0
  }
}

/**
 * Full sync cycle:
 * 1. Register/update user on server
 * 2. Reconcile: re-queue locally synced items missing on server
 * 3. Push pending items from queue (ascents + reviews)
 * 4. Pull new ascents and reviews from server
 * 5. Pull updated route details
 */
export async function fullSync(user: { id: string; displayName: string }): Promise<{
  pushed: number
  pulled: number
  failed: number
}> {
  // 1. Sync user profile
  await syncUser(user)

  // 2. Reconcile missing items (handles server data loss)
  const requeued = await reconcileMissing(user.id)
  if (requeued > 0) {
    console.log(`Reconciled ${requeued} items missing on server`)
  }

  // 3. Push pending queue items
  const { synced: pushed, failed } = await processSyncQueue(user.id)

  // 4. Pull new ascents and reviews from server (with cleanup of stale data)
  const pulledAscents = await pullAscents(user.id)
  const pulledReviews = await pullReviews(user.id)

  // 5. Pull updated route details (quickdraws, rope length, etc.)
  await pullRouteDetails()

  // 6. Cleanup: remove sync queue items for ascents/reviews that are now synced
  try {
    const queueItems = await db.syncQueue.toArray()
    for (const item of queueItems) {
      if (item.entity === 'ascent') {
        const ascent = await db.ascents.where('localId').equals(item.localId).first()
        if (ascent?.syncStatus === 'synced') {
          console.log(`Cleanup: removing stale queue item for synced ascent ${item.localId}`)
          await db.syncQueue.delete(item.id!)
        }
      } else if (item.entity === 'review') {
        const review = await db.reviews.where('localId').equals(item.localId).first()
        if (review?.syncStatus === 'synced') {
          console.log(`Cleanup: removing stale queue item for synced review ${item.localId}`)
          await db.syncQueue.delete(item.id!)
        }
      }
    }
  } catch (err) {
    console.warn('Queue cleanup failed:', err)
  }

  return { pushed, pulled: pulledAscents + pulledReviews, failed }
}
