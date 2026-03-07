import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { TopoViewer } from '../components/topo/TopoViewer'
import { RouteList } from '../components/topo/RouteList'
import { routeTypeLabel, gradeColor } from '../lib/utils'
import { useGps } from '../hooks/useGps'
import { distanceMeters, formatDistance, bearing } from '../lib/map/geo'
import { ConditionReport } from '../components/route/ConditionReport'

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
  const [showCondition, setShowCondition] = useState(false)
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

  if (!sector) {
    return <div className="p-4 text-gray-400">Сектор не найден</div>
  }

  const filteredRoutes = routes?.filter(r => matchesGradeFilter(r.gradeSort, gradeFilter)) ?? []
  const activeTopo = topos?.[0]

  // GPS approach info
  const approachInfo = useMemo(() => {
    if (!position || !sector) return null
    const dist = distanceMeters(position.latitude, position.longitude, sector.latitude, sector.longitude)
    const brng = bearing(position.latitude, position.longitude, sector.latitude, sector.longitude)
    const directions = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ']
    const dir = directions[Math.round(brng / 45) % 8]
    return { distance: formatDistance(dist), direction: dir, raw: dist }
  }, [position, sector])

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

        {/* GPS distance to sector */}
        {approachInfo && (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm mb-2 ${
            approachInfo.raw < 100
              ? 'bg-green-50 text-green-700'
              : 'bg-blue-50 text-blue-700'
          }`}>
            <span className="text-lg">📍</span>
            <span>
              <span className="font-medium">{approachInfo.distance}</span>
              {' '}на {approachInfo.direction}
              {approachInfo.raw < 100 && ' — вы рядом!'}
            </span>
          </div>
        )}

        {/* Condition report button */}
        <button
          onClick={() => setShowCondition(true)}
          className="text-xs text-blue-600 underline"
        >
          Сообщить об условиях
        </button>
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
        <h2 className="text-lg font-semibold mb-2">
          Маршруты {routes ? `(${routes.length})` : ''}
        </h2>

        {/* Grade filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-1 px-1">
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
                  <span className={`w-12 text-center text-sm font-mono font-bold rounded px-2 py-1 ${gradeColor(route.grade)}`}>
                    {route.grade}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{route.name}</div>
                    <div className="text-xs text-gray-400">
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

      {showCondition && sectorId && (
        <ConditionReport
          sectorId={sectorId}
          onClose={() => setShowCondition(false)}
        />
      )}
    </div>
  )
}
