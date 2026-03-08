import { useState, useMemo, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { TopoViewer } from '../components/topo/TopoViewer'
import { RouteList } from '../components/topo/RouteList'
import { routeTypeLabel, gradeColor } from '../lib/utils'
import { useGps } from '../hooks/useGps'
import { distanceMeters, formatDistance, bearing } from '../lib/map/geo'

const GRADE_FILTERS = ['Все', '4-5a', '5b-5c', '6a-6b', '6b+-6c+', '7a+'] as const

function matchesGradeFilter(gradeSort: number, filter: string): boolean {
  if (filter === 'Все') return true
  switch (filter) {
    case '4-5a': return gradeSort >= 30 && gradeSort <= 75
    case '5b-5c': return gradeSort >= 85 && gradeSort <= 105
    case '6a-6b': return gradeSort >= 120 && gradeSort <= 150
    case '6b+-6c+': return gradeSort >= 170 && gradeSort <= 210
    case '7a+': return gradeSort >= 240
    default: return true
  }
}

export function SectorPage() {
  const { sectorId } = useParams<{ sectorId: string }>()
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [gradeFilter, setGradeFilter] = useState('Все')
  const { position } = useGps()

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
      const routeMap = new Map((routes || []).map((r) => [r.id, r]))
      return allTr.map((tr) => ({ ...tr, route: routeMap.get(tr.routeId) }))
    },
    [topos, routes],
  )

  const [activeTopoIdx, setActiveTopoIdx] = useState(0)
  const [zoom, setZoom] = useState(1)
  const imgRef = useRef<HTMLDivElement>(null)

  // GPS approach info
  const approachInfo = useMemo(() => {
    if (!position || !sector) return null
    const dist = distanceMeters(position.latitude, position.longitude, sector.latitude, sector.longitude)
    const brng = bearing(position.latitude, position.longitude, sector.latitude, sector.longitude)
    const directions = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ']
    const dir = directions[Math.round(brng / 45) % 8]
    return { distance: formatDistance(dist), direction: dir, raw: dist }
  }, [position, sector])

  const zoomIn = useCallback(() => setZoom(z => Math.min(4, z + 0.5)), [])
  const zoomOut = useCallback(() => setZoom(z => Math.max(1, z - 0.5)), [])
  const resetZoom = useCallback(() => setZoom(1), [])

  if (!sector) {
    return <div className="p-4 text-gray-400">Сектор не найден</div>
  }

  const filteredRoutes = routes?.filter(r => matchesGradeFilter(r.gradeSort, gradeFilter)) ?? []
  const activeTopo = topos?.[activeTopoIdx]

  return (
    <div>
      {/* Compact header */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between mb-1">
          <Link to="/" className="text-blue-600 text-xs">&larr; Назад</Link>
          {approachInfo && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              approachInfo.raw < 100 ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600'
            }`}>
              {approachInfo.distance} {approachInfo.direction}
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold">{sector.name}</h1>
        <div className="flex flex-wrap gap-x-2 text-xs text-gray-400">
          {sector.orientation && <span>{sector.orientation}</span>}
          {sector.sunExposure && <span>{sector.sunExposure}</span>}
          {sector.approachTimeMin && <span>{sector.approachTimeMin} мин</span>}
          {sector.description && <span>· {sector.description}</span>}
        </div>
      </div>

      {/* Topo viewer with route overlays (OpenSeadragon) */}
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

      {/* Photo gallery with smooth zoom (no route overlays yet) */}
      {topos && topos.length > 0 && (!topoRoutes || topoRoutes.length === 0) && (
        <div className="mb-1">
          <div
            ref={imgRef}
            className="relative overflow-auto bg-gray-100"
            style={{ maxHeight: zoom > 1 ? '60vh' : undefined }}
          >
            <img
              src={activeTopo!.imageUrl}
              alt={activeTopo!.caption || sector.name}
              className="block transition-transform duration-200 ease-out"
              style={{
                width: zoom > 1 ? `${zoom * 100}%` : '100%',
                maxWidth: zoom > 1 ? 'none' : '100%',
                cursor: zoom > 1 ? 'grab' : 'zoom-in',
              }}
              onClick={() => { if (zoom === 1) zoomIn() }}
              draggable={false}
            />
            {/* Zoom controls */}
            <div className="absolute top-2 right-2 flex flex-col gap-1" style={{ zIndex: 10 }}>
              <button onClick={zoomIn} className="w-8 h-8 bg-black/60 text-white rounded-full text-lg leading-none">+</button>
              {zoom > 1 && (
                <>
                  <button onClick={resetZoom} className="w-8 h-8 bg-black/60 text-white rounded-full text-[10px] leading-none">{Math.round(zoom * 100)}%</button>
                  <button onClick={zoomOut} className="w-8 h-8 bg-black/60 text-white rounded-full text-lg leading-none">-</button>
                </>
              )}
            </div>
          </div>
          {/* Thumbnails strip */}
          {topos.length > 1 && (
            <div className="flex gap-1 px-2 py-1 overflow-x-auto">
              {topos.map((t, i) => (
                <img
                  key={t.id}
                  src={t.imageUrl}
                  alt={t.caption || ''}
                  onClick={() => { setActiveTopoIdx(i); setZoom(1) }}
                  className={`h-10 w-14 object-cover rounded flex-shrink-0 cursor-pointer border-2 ${
                    i === activeTopoIdx ? 'border-blue-500' : 'border-transparent'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Routes list */}
      <div className="px-4 pt-1 pb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">
            Маршруты {routes ? `(${routes.length})` : ''}
          </h2>
          <Link to={`/admin/topo`} className="text-xs text-blue-600">Разметить</Link>
        </div>

        {/* Grade filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
          {GRADE_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setGradeFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                gradeFilter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {filteredRoutes.length === 0 ? (
          <p className="text-gray-400 text-sm">
            {routes?.length ? 'Нет маршрутов в этом диапазоне' : 'Маршруты не загружены'}
          </p>
        ) : (
          <div className="space-y-1">
            {filteredRoutes.map((route) => {
              const tr = topoRoutes?.find((t) => t.routeId === route.id)
              const isSelected = route.id === selectedRouteId
              return (
                <Link
                  key={route.id}
                  to={`/route/${route.id}`}
                  className={`flex items-center gap-2 border rounded-lg p-2.5 transition-colors ${
                    isSelected
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-white border-gray-200 hover:border-blue-300'
                  }`}
                  onMouseEnter={() => route.id && setSelectedRouteId(route.id)}
                  onMouseLeave={() => setSelectedRouteId(null)}
                >
                  {tr && (
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                      style={{ backgroundColor: tr.color }}
                    >
                      {tr.routeNumber}
                    </span>
                  )}
                  <span className={`w-11 text-center text-xs font-mono font-bold rounded px-1.5 py-0.5 ${gradeColor(route.grade)}`}>
                    {route.grade}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{route.name}</div>
                    <div className="text-[10px] text-gray-400">
                      {routeTypeLabel(route.routeType)}
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
