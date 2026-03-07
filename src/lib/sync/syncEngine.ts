import { db } from '../db/schema'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

/**
 * Check if device has network connectivity.
 * Uses both navigator.onLine and a fetch probe.
 */
export async function isOnline(): Promise<boolean> {
  if (!navigator.onLine) return false
  try {
    const resp = await fetch(`${API_BASE}/health`, {
      method: 'HEAD',
      cache: 'no-store',
    })
    return resp.ok
  } catch {
    return false
  }
}

/**
 * Push all pending items from sync queue to the server.
 */
export async function pushPendingChanges(): Promise<{ pushed: number; errors: number }> {
  const items = await db.syncQueue.orderBy('createdAt').toArray()
  let pushed = 0
  let errors = 0

  for (const item of items) {
    try {
      const response = await fetch(`${API_BASE}/sync/${item.entity}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: item.action,
          localId: item.localId,
          payload: item.payload,
        }),
      })

      if (response.ok) {
        const result = await response.json()

        // Update local record with server ID and mark as synced
        if (item.entity === 'ascent') {
          await db.ascents.where('localId').equals(item.localId).modify({
            syncStatus: 'synced',
            syncedAt: new Date().toISOString(),
            ...(result.serverId ? { id: result.serverId } : {}),
          })
        } else if (item.entity === 'review') {
          await db.reviews.where('localId').equals(item.localId).modify({
            syncStatus: 'synced',
            syncedAt: new Date().toISOString(),
            ...(result.serverId ? { id: result.serverId } : {}),
          })
        }

        // Remove from queue
        await db.syncQueue.delete(item.id!)
        pushed++
      } else if (response.status === 409) {
        // Conflict — server version wins, remove from queue
        await db.syncQueue.delete(item.id!)
        pushed++
      } else {
        throw new Error(`Server returned ${response.status}`)
      }
    } catch (err) {
      errors++
      // Increment retry count
      await db.syncQueue.update(item.id!, {
        retryCount: item.retryCount + 1,
        lastError: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return { pushed, errors }
}

/**
 * Pull updated route data from the server.
 */
export async function pullRouteUpdates(): Promise<number> {
  const lastSync = await db.syncMeta.get('lastRouteSync')
  const since = lastSync?.value || '1970-01-01T00:00:00Z'

  try {
    const response = await fetch(
      `${API_BASE}/routes?updatedAfter=${encodeURIComponent(since)}`,
    )
    if (!response.ok) return 0

    const data = await response.json()
    let count = 0

    await db.transaction('rw', [db.routes, db.sectors, db.topos, db.topoRoutes, db.syncMeta], async () => {
      if (data.sectors) {
        for (const sector of data.sectors) {
          await db.sectors.put(sector)
          count++
        }
      }
      if (data.routes) {
        for (const route of data.routes) {
          await db.routes.put(route)
          count++
        }
      }
      if (data.topos) {
        for (const topo of data.topos) {
          await db.topos.put(topo)
        }
      }
      if (data.topoRoutes) {
        for (const tr of data.topoRoutes) {
          await db.topoRoutes.put(tr)
        }
      }

      await db.syncMeta.put({ key: 'lastRouteSync', value: new Date().toISOString() })
    })

    return count
  } catch {
    return 0
  }
}

/**
 * Run full sync cycle: push local changes, then pull updates.
 */
export async function runSync(): Promise<{ pushed: number; pulled: number; errors: number }> {
  const online = await isOnline()
  if (!online) return { pushed: 0, pulled: 0, errors: 0 }

  const { pushed, errors } = await pushPendingChanges()
  const pulled = await pullRouteUpdates()

  return { pushed, pulled, errors }
}
