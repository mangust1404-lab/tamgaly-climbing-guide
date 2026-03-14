import { db } from '../db/schema'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

/** Sync the current user profile to the server */
export async function syncUser(user: { id: string; displayName: string }): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/sync/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, displayName: user.displayName }),
    })
    return res.ok
  } catch {
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
      const endpoint = item.entity === 'ascent' ? '/sync/ascent' : '/sync/review'
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
        failed++
        await db.syncQueue.update(item.id!, {
          retryCount: item.retryCount + 1,
          lastError: `HTTP ${res.status}`,
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
export async function pullAscents(): Promise<number> {
  try {
    // Get the last sync timestamp
    const meta = await db.syncMeta.get('lastPullAscents')
    const since = meta?.value || ''

    const url = since
      ? `${API_BASE}/sync/ascents?since=${encodeURIComponent(since)}`
      : `${API_BASE}/sync/ascents?limit=200`

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

    if (ascents.length === 0) return 0

    // Save ascents to local DB (skip own ascents that already exist)
    for (const a of ascents) {
      const existing = await db.ascents.get(a.id)
      if (existing) continue
      // Also skip if we have it by localId
      const byLocal = await db.ascents.where('localId').equals(a.local_id).first()
      if (byLocal) {
        // Update with server ID if needed
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
    }

    // Save users we learned about
    await pullUsers()

    // Update last sync timestamp
    const newest = ascents.reduce((max, a) =>
      a.created_at > max ? a.created_at : max, since || ''
    )
    if (newest) {
      await db.syncMeta.put({ key: 'lastPullAscents', value: newest })
    }

    return ascents.length
  } catch (err) {
    console.warn('Failed to pull ascents:', err)
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
 * Full sync cycle:
 * 1. Register/update user on server
 * 2. Push pending items from queue
 * 3. Pull new ascents from server
 */
export async function fullSync(user: { id: string; displayName: string }): Promise<{
  pushed: number
  pulled: number
  failed: number
}> {
  // 1. Sync user profile
  await syncUser(user)

  // 2. Push pending queue items
  const { synced: pushed, failed } = await processSyncQueue(user.id)

  // 3. Pull new ascents
  const pulled = await pullAscents()

  return { pushed, pulled, failed }
}
