import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { OfflineMap } from '../components/map/OfflineMap'

export function MapPage() {
  const sectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())

  return (
    <div className="w-full" style={{ height: 'calc(100dvh - 56px)' }}>
      <OfflineMap sectors={sectors ?? []} />
    </div>
  )
}
