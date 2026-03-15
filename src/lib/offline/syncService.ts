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
          retryCount: item.retryCount + 1,
          lastError: errMsg,
        })
      }
    } catch (err) {
      failed++
      await db.syncQueue.update(item.id!, {
        retryCount: item.retryCount + 1,
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

    // Save new ascents to local DB
    let added = 0
    for (const a of ascents) {
      const existing = await db.ascents.get(a.id)
      if (existing) continue
      const byLocal = await db.ascents.where('localId').equals(a.local_id).first()
      if (byLocal) {
        if (byLocal.id !== a.id) {
          await db.ascents.update(byLocal.id, { syncStatus: 'synced' })
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
        if (byLocal.id !== r.id) {
          await db.reviews.update(byLocal.id, { syncStatus: 'synced' })
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

/**
 * Full sync cycle:
 * 1. Register/update user on server
 * 2. Reconcile: re-queue locally synced items missing on server
 * 3. Push pending items from queue (ascents + reviews)
 * 4. Pull new ascents and reviews from server
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

  return { pushed, pulled: pulledAscents + pulledReviews, failed }
}
