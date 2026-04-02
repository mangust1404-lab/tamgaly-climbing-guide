import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { OfflineMap } from '../components/map/OfflineMap'

export function MapPage() {
  const allSectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())
  const area = useLiveQuery(() => db.areas.get('tamgaly-tas'))
  const routes = useLiveQuery(() => db.routes.toArray())

  // Show all sectors that have GPS coordinates
  const sectors = useMemo(
    () => (allSectors ?? []).filter(s => s.latitude && s.longitude),
    [allSectors],
  )

  // Only routes that have GPS coordinates
  const geoRoutes = (routes ?? []).filter(r => r.latitude && r.longitude)

  return (
    <div className="absolute inset-0 bottom-nav-safe">
      <OfflineMap sectors={sectors} area={area} routes={geoRoutes} allRoutes={routes ?? []} />
    </div>
  )
}
