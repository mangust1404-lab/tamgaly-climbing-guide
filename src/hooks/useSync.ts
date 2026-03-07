import { useState, useCallback, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { runSync } from '../lib/sync/syncEngine'

export function useSync() {
  const [syncing, setSyncing] = useState(false)
  const [lastResult, setLastResult] = useState<{
    pushed: number
    pulled: number
    errors: number
  } | null>(null)

  const pendingCount = useLiveQuery(() => db.syncQueue.count()) ?? 0

  const sync = useCallback(async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const result = await runSync()
      setLastResult(result)
    } finally {
      setSyncing(false)
    }
  }, [syncing])

  // Auto-sync when app comes online
  useEffect(() => {
    const handleOnline = () => {
      if (pendingCount > 0) sync()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [pendingCount, sync])

  return { sync, syncing, pendingCount, lastResult }
}
