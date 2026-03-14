import { useEffect, useRef, useState, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { useUser } from '../lib/userContext'
import { fullSync } from '../lib/offline/syncService'

const SYNC_INTERVAL = 5 * 60 * 1000 // 5 minutes

export function useAutoSync() {
  const { user } = useUser()
  const [syncing, setSyncing] = useState(false)
  const [lastResult, setLastResult] = useState<{ pushed: number; pulled: number; failed: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined)

  const pendingCount = useLiveQuery(() => db.syncQueue.count(), []) ?? 0

  const doSync = useCallback(async () => {
    if (!user) { console.warn('Sync: no user'); return }
    if (syncing) { console.warn('Sync: already syncing'); return }

    setSyncing(true)
    try {
      console.log('Sync: starting...', { userId: user.id, displayName: user.displayName })
      const result = await fullSync(user)
      setLastResult(result)
      console.log(`Sync done: pushed ${result.pushed}, pulled ${result.pulled}, failed ${result.failed}`)
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }, [user, syncing])

  // Auto-sync on mount and periodically
  useEffect(() => {
    if (!user) return

    // Sync after short delay on mount
    const initialTimer = setTimeout(doSync, 3000)

    // Periodic sync
    timerRef.current = setInterval(doSync, SYNC_INTERVAL)

    // Sync when coming online
    const onOnline = () => { setTimeout(doSync, 1000) }
    window.addEventListener('online', onOnline)

    return () => {
      clearTimeout(initialTimer)
      clearInterval(timerRef.current)
      window.removeEventListener('online', onOnline)
    }
  }, [user, doSync])

  return { syncing, pendingCount, lastResult, doSync }
}
