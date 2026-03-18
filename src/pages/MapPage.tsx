import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { OfflineMap } from '../components/map/OfflineMap'

// Only sectors with field-verified GPS coordinates
const VERIFIED_SECTORS = new Set([
  'sector-prigorod',
  'sector-gorod',
  'sector-serpy',
  'sector-zamanka',
])

export function MapPage() {
  const allSectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())
  const area = useLiveQuery(() => db.areas.get('tamgaly-tas'))
  const routes = useLiveQuery(() => db.routes.toArray())

  const sectors = useMemo(
    () => (allSectors ?? []).filter(s => VERIFIED_SECTORS.has(s.id)),
    [allSectors],
  )

  // Only routes that have GPS coordinates
  const geoRoutes = (routes ?? []).filter(r => r.latitude && r.longitude)

  return (
    <div className="absolute inset-0" style={{ bottom: '3.5rem' }}>
      <OfflineMap sectors={sectors} area={area} routes={geoRoutes} allRoutes={routes ?? []} />
    </div>
  )
}
