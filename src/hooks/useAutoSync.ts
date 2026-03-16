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
  const [lastError, setLastError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined)

  const pendingCount = useLiveQuery(() => db.syncQueue.count(), []) ?? 0

  const syncingRef = useRef(false)

  const doSync = useCallback(async () => {
    if (!user) { console.warn('Sync: no user'); return }
    if (syncingRef.current) { console.warn('Sync: already syncing'); return }

    syncingRef.current = true
    setSyncing(true)
    setLastError(null)
    try {
      console.log('Sync: starting...', { userId: user.id, displayName: user.displayName })
      const result = await fullSync(user)
      setLastResult(result)
      if (result.failed > 0) {
        const failedItem = await db.syncQueue.orderBy('retryCount').reverse().first()
        setLastError(failedItem?.lastError || `${result.failed} failed`)
      }
      console.log(`Sync done: pushed ${result.pushed}, pulled ${result.pulled}, failed ${result.failed}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync error'
      console.error('Sync failed:', err)
      setLastError(msg)
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [user])

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

  return { syncing, pendingCount, lastResult, lastError, doSync }
}
