import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { OfflineMap } from '../components/map/OfflineMap'

export function MapPage() {
  const sectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())

  return <OfflineMap sectors={sectors ?? []} />
}
