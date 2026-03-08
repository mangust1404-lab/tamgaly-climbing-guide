import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { OfflineMap } from '../components/map/OfflineMap'

export function MapPage() {
  const sectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())
  const area = useLiveQuery(() => db.areas.get('tamgaly-tas'))
  const routes = useLiveQuery(() => db.routes.toArray())

  // Only routes that have GPS coordinates
  const geoRoutes = (routes ?? []).filter(r => r.latitude && r.longitude)

  return (
    <div className="w-full" style={{ height: 'calc(100dvh - 56px)' }}>
      <OfflineMap sectors={sectors ?? []} area={area} routes={geoRoutes} />
    </div>
  )
}
