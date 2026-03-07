import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { TopoViewer } from '../components/topo/TopoViewer'
import { RouteList } from '../components/topo/RouteList'

export function SectorPage() {
  const { sectorId } = useParams<{ sectorId: string }>()
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)

  const sector = useLiveQuery(
    () => (sectorId ? db.sectors.get(sectorId) : undefined),
    [sectorId],
  )

  const routes = useLiveQuery(
    () =>
      sectorId
        ? db.routes.where('sectorId').equals(sectorId).sortBy('gradeSort')
        : [],
    [sectorId],
  )

  const topos = useLiveQuery(
    () =>
      sectorId
        ? db.topos.where('sectorId').equals(sectorId).sortBy('sortOrder')
        : [],
    [sectorId],
  )

  const topoRoutes = useLiveQuery(
    async () => {
      if (!topos || topos.length === 0) return []
      const allTr = []
      for (const topo of topos) {
        const trs = await db.topoRoutes.where('topoId').equals(topo.id).toArray()
        allTr.push(...trs)
      }
      // Attach route data
      const routeMap = new Map((routes || []).map((r) => [r.id, r]))
      return allTr.map((tr) => ({ ...tr, route: routeMap.get(tr.routeId) }))
    },
    [topos, routes],
  )

  if (!sector) {
    return <div className="p-4 text-gray-400">Сектор не найден</div>
  }

  const activeTopo = topos?.[0]

  return (
    <div>
      {/* Header */}
      <div className="p-4 pb-2">
        <Link to="/" className="text-blue-600 text-sm mb-2 inline-block">
          &larr; Назад
        </Link>
        <h1 className="text-2xl font-bold mb-1">{sector.name}</h1>
        <div className="flex flex-wrap gap-x-3 text-xs text-gray-500 mb-2">
          {sector.orientation && <span>{sector.orientation}</span>}
          {sector.sunExposure && <span>{sector.sunExposure}</span>}
          {sector.approachTimeMin && <span>{sector.approachTimeMin} мин подход</span>}
        </div>
        {sector.description && (
          <p className="text-sm text-gray-600 mb-2">{sector.description}</p>
        )}
        {sector.approachDescription && (
          <p className="text-xs text-gray-400 mb-2">Подход: {sector.approachDescription}</p>
        )}
      </div>

      {/* Topo viewer */}
      {activeTopo && topoRoutes && topoRoutes.length > 0 && (
        <div className="mb-2">
          <TopoViewer
            imageUrl={activeTopo.imageUrl}
            imageWidth={activeTopo.imageWidth}
            imageHeight={activeTopo.imageHeight}
            topoRoutes={topoRoutes}
            selectedRouteId={selectedRouteId}
            onRouteSelect={setSelectedRouteId}
          />
          <div className="px-2">
            <RouteList
              topoRoutes={topoRoutes}
              selectedRouteId={selectedRouteId}
              onSelect={setSelectedRouteId}
            />
          </div>
        </div>
      )}

      {/* Topo image without route overlays */}
      {activeTopo && (!topoRoutes || topoRoutes.length === 0) && (
        <div className="mb-2">
          <img
            src={activeTopo.imageUrl}
            alt={sector.name}
            className="w-full"
          />
          <p className="text-xs text-gray-400 text-center py-1">
            Маршруты ещё не размечены на фото
          </p>
        </div>
      )}

      {/* Routes list */}
      <div className="p-4 pt-2">
        <h2 className="text-lg font-semibold mb-3">
          Маршруты {routes ? `(${routes.length})` : ''}
        </h2>

        {!routes || routes.length === 0 ? (
          <p className="text-gray-400 text-sm">Маршруты не загружены</p>
        ) : (
          <div className="space-y-1">
            {routes.map((route) => {
              const tr = topoRoutes?.find((t) => t.routeId === route.id)
              const isSelected = route.id === selectedRouteId
              return (
                <Link
                  key={route.id}
                  to={`/route/${route.id}`}
                  className={`flex items-center gap-3 border rounded-lg p-3 transition-colors ${
                    isSelected
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-white border-gray-200 hover:border-blue-300'
                  }`}
                  onMouseEnter={() => route.id && setSelectedRouteId(route.id)}
                  onMouseLeave={() => setSelectedRouteId(null)}
                >
                  {tr && (
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: tr.color }}
                    >
                      {tr.routeNumber}
                    </span>
                  )}
                  <span className="w-12 text-center text-sm font-mono font-bold text-blue-700 bg-blue-50 rounded px-2 py-1">
                    {route.grade}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{route.name}</div>
                    <div className="text-xs text-gray-400">
                      {route.routeType}
                      {route.lengthM && ` · ${route.lengthM}м`}
                      {route.pitches > 1 && ` · ${route.pitches} верёвок`}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
