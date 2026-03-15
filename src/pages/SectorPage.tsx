import { useState, useMemo, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Route as RouteType } from '../lib/db/schema'
import { TopoViewer } from '../components/topo/TopoViewer'
import { RouteList } from '../components/topo/RouteList'
import { AscentForm } from '../components/route/AscentForm'
import { SwipeableRouteRow } from '../components/route/SwipeableRouteRow'
import { gradeColor } from '../lib/utils'
import { useGps } from '../hooks/useGps'
import { distanceMeters, formatDistance, bearing } from '../lib/map/geo'
import { useI18n } from '../lib/i18n'
import { useUser } from '../lib/userContext'
import { SuggestPanel } from '../components/suggest/SuggestPanel'

const GRADE_FILTERS = ['all', '4-5a', '5b-5c', '6a-6b', '6b+-6c+', '7a+'] as const

function matchesGradeFilter(gradeSort: number, filter: string): boolean {
  if (filter === 'all') return true
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
  const { t, td } = useI18n()
  const { user } = useUser()
  const { sectorId } = useParams<{ sectorId: string }>()
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [gradeFilter, setGradeFilter] = useState('all')
  const [ascentRoute, setAscentRoute] = useState<RouteType | null>(null)
  const [swipeToast, setSwipeToast] = useState('')

  const addToProjects = useCallback(async (route: RouteType) => {
    if (!user?.id) return
    const existing = await db.wishlist.where('[userId+routeId]').equals([user.id, route.id]).first()
    if (existing) return
    await db.wishlist.add({
      id: crypto.randomUUID(),
      userId: user.id,
      routeId: route.id,
      type: 'project',
      addedAt: new Date().toISOString(),
    })
    setSwipeToast(t('swipe.addedToProjects'))
    setTimeout(() => setSwipeToast(''), 2000)
  }, [user?.id, t])

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

  // Average ratings per route
  const routeRatings = useLiveQuery(
    async () => {
      if (!routes || routes.length === 0) return new Map<string, number>()
      const rIds = routes.map(r => r.id)
      const ascents = await db.ascents.where('routeId').anyOf(rIds).toArray()
      const map = new Map<string, number>()
      const sums: Record<string, { total: number; count: number }> = {}
      for (const a of ascents) {
        if (a.rating && a.rating > 0) {
          if (!sums[a.routeId]) sums[a.routeId] = { total: 0, count: 0 }
          sums[a.routeId].total += a.rating
          sums[a.routeId].count++
        }
      }
      for (const [id, s] of Object.entries(sums)) {
        map.set(id, Math.round(s.total / s.count * 10) / 10)
      }
      return map
    },
    [routes],
  )

  const allTopos = useLiveQuery(
    () =>
      sectorId
        ? db.topos.where('sectorId').equals(sectorId).sortBy('sortOrder')
        : [],
    [sectorId],
  )

  // Split topos by type
  const wallTopos = useMemo(
    () => allTopos?.filter(t => !t.type || t.type === 'topo') ?? [],
    [allTopos],
  )
  const approachPhotos = useMemo(
    () => allTopos?.filter(t => t.type === 'approach') ?? [],
    [allTopos],
  )

  const topoRoutes = useLiveQuery(
    async () => {
      if (!wallTopos || wallTopos.length === 0) return []
      const allTr = []
      for (const topo of wallTopos) {
        const trs = await db.topoRoutes.where('topoId').equals(topo.id).toArray()
        allTr.push(...trs)
      }
      const routeMap = new Map((routes || []).map((r) => [r.id, r]))
      return allTr.map((tr) => ({ ...tr, route: routeMap.get(tr.routeId) }))
    },
    [wallTopos, routes],
  )

  const [activeTopoIdx, setActiveTopoIdx] = useState(0)
  const [zoom, setZoom] = useState(1)
  const imgRef = useRef<HTMLDivElement>(null)

  // GPS approach info
  const approachInfo = useMemo(() => {
    if (!position || !sector) return null
    const dist = distanceMeters(position.latitude, position.longitude, sector.latitude, sector.longitude)
    const brng = bearing(position.latitude, position.longitude, sector.latitude, sector.longitude)
    const directions = t('compass.directions').split(',')
    const dir = directions[Math.round(brng / 45) % 8]
    return { distance: formatDistance(dist), direction: dir, raw: dist }
  }, [position, sector, t])

  const zoomIn = useCallback(() => setZoom(z => Math.min(4, z + 0.5)), [])
  const zoomOut = useCallback(() => setZoom(z => Math.max(1, z - 0.5)), [])
  const resetZoom = useCallback(() => setZoom(1), [])

  const activeTopo = wallTopos[activeTopoIdx] ?? null

  // Filter topoRoutes to only show routes belonging to the active topo photo
  const activeTopoRoutes = useMemo(
    () => activeTopo ? (topoRoutes?.filter(tr => tr.topoId === activeTopo.id) ?? []) : [],
    [topoRoutes, activeTopo],
  )

  // Handle route selection: auto-switch topo photo if route is on a different one
  const handleRouteSelect = useCallback((routeId: string | null) => {
    if (routeId && topoRoutes) {
      const tr = topoRoutes.find(t => t.routeId === routeId)
      if (tr) {
        const topoIdx = wallTopos.findIndex(t => t.id === tr.topoId)
        if (topoIdx !== -1 && topoIdx !== activeTopoIdx) {
          setActiveTopoIdx(topoIdx)
        }
      }
    }
    setSelectedRouteId(prev => prev === routeId ? null : routeId)
  }, [topoRoutes, wallTopos, activeTopoIdx])

  if (!sector) {
    return <div className="p-4 text-gray-400">{t('sector.notFound')}</div>
  }

  const filteredRoutes = routes?.filter(r => matchesGradeFilter(r.gradeSort, gradeFilter)) ?? []

  const gradeFilterLabel = (f: string) => f === 'all' ? t('sector.all') : f

  return (
    <div>
      {/* Compact header */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between mb-1">
          <Link to="/" className="text-blue-600 text-xs">&larr; {t('back')}</Link>
          {approachInfo && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              approachInfo.raw < 100 ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600'
            }`}>
              {approachInfo.distance} {approachInfo.direction}
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold">{td(sector.name)}</h1>
        <div className="flex flex-wrap gap-x-2 text-xs text-gray-400">
          {sector.orientation && <span>{td(sector.orientation)}</span>}
          {sector.sunExposure && <span>{td(sector.sunExposure)}</span>}
          {sector.approachTimeMin && <span>{sector.approachTimeMin} {t('sector.min')}</span>}
          {sector.description && <span>· {td(sector.description)}</span>}
        </div>
      </div>

      {/* Approach photos */}
      {approachPhotos.length > 0 && (
        <div className="px-4 pt-2 pb-1">
          <h2 className="text-sm font-semibold mb-1">{t('sector.approach')}</h2>
          <div className="space-y-2">
            {approachPhotos.map((photo) => (
              <div key={photo.id}>
                <img
                  src={photo.imageUrl}
                  alt={photo.caption || t('sector.approach')}
                  className="w-full rounded-lg"
                />
                {photo.caption && (
                  <p className="text-xs text-gray-500 mt-1">{photo.caption}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Topo viewer with route overlays (OpenSeadragon) */}
      {activeTopo && activeTopoRoutes.length > 0 && (
        <div className="mb-2">
          <TopoViewer
            imageUrl={activeTopo.imageUrl}
            imageWidth={activeTopo.imageWidth}
            imageHeight={activeTopo.imageHeight}
            topoRoutes={activeTopoRoutes}
            selectedRouteId={selectedRouteId}
            onRouteSelect={handleRouteSelect}
          />
          <RouteList
            topoRoutes={activeTopoRoutes}
            selectedRouteId={selectedRouteId}
            onSelect={handleRouteSelect}
          />
          {/* Topo thumbnails when multiple photos */}
          {wallTopos.length > 1 && (
            <div className="flex gap-1 overflow-x-auto px-2 py-1">
              {wallTopos.map((tp, i) => (
                <img
                  key={tp.id}
                  src={tp.imageUrl}
                  alt={tp.caption || ''}
                  onClick={() => { setActiveTopoIdx(i) }}
                  className={`h-10 w-14 object-cover rounded flex-shrink-0 cursor-pointer border-2 ${
                    i === activeTopoIdx ? 'border-blue-500' : 'border-transparent'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Photo gallery with smooth zoom (no route overlays yet) */}
      {activeTopo && activeTopoRoutes.length === 0 && (
        <div className="mb-1">
          <div
            ref={imgRef}
            className="relative overflow-auto bg-gray-100"
            style={{ maxHeight: zoom > 1 ? '60vh' : undefined }}
          >
            <img
              src={activeTopo.imageUrl}
              alt={activeTopo.caption || sector.name}
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
          {/* Thumbnails + mark button */}
          <div className="flex items-center justify-between px-2 py-1">
            {wallTopos.length > 1 ? (
              <div className="flex gap-1 overflow-x-auto">
                {wallTopos.map((tp, i) => (
                  <img
                    key={tp.id}
                    src={tp.imageUrl}
                    alt={tp.caption || ''}
                    onClick={() => { setActiveTopoIdx(i); setZoom(1) }}
                    className={`h-10 w-14 object-cover rounded flex-shrink-0 cursor-pointer border-2 ${
                      i === activeTopoIdx ? 'border-blue-500' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
            ) : <div />}
          </div>
        </div>
      )}

      {/* No photos placeholder */}
      {wallTopos.length === 0 && (
        <div className="mx-4 my-2 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <p className="text-sm text-gray-400">{t('sector.noPhoto')}</p>
        </div>
      )}

      {/* Routes list */}
      <div className="px-4 pt-1 pb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">
            {t('sector.routes')} {routes ? `(${routes.length})` : ''}
          </h2>
          {selectedRouteId && (
            <button
              onClick={() => setSelectedRouteId(null)}
              className="text-xs text-blue-600 hover:underline"
            >
              {t('sector.all')} ({routes?.length})
            </button>
          )}
        </div>

        {/* Grade filter chips — hide when a route is selected */}
        {!selectedRouteId && (
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
                {gradeFilterLabel(f)}
              </button>
            ))}
          </div>
        )}

        {filteredRoutes.length === 0 ? (
          <p className="text-gray-400 text-sm">
            {routes?.length ? t('sector.noRoutesInRange') : t('sector.routesNotLoaded')}
          </p>
        ) : (
          <div className="space-y-1">
            {(selectedRouteId ? filteredRoutes.filter(r => r.id === selectedRouteId) : filteredRoutes).map((route) => {
              const tr = topoRoutes?.find((tp) => tp.routeId === route.id)
              const isSelected = route.id === selectedRouteId
              const avgRating = routeRatings?.get(route.id)
              return (
                <SwipeableRouteRow
                  key={route.id}
                  onSwipeRight={() => addToProjects(route)}
                  onSwipeLeft={() => setAscentRoute(route)}
                >
                  <Link
                    to={`/route/${route.id}`}
                    className={`flex items-center gap-2 border rounded-lg p-2.5 transition-colors ${
                      isSelected
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-white border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {tr && (
                      <span
                        onClick={(e) => { e.preventDefault(); handleRouteSelect(route.id) }}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 cursor-pointer"
                        style={{ backgroundColor: tr.color }}
                        title={t('sector.showOnTopo')}
                      >
                        {tr.routeNumber}
                      </span>
                    )}
                    <span className={`w-11 text-center text-xs font-mono font-bold rounded px-1.5 py-0.5 ${gradeColor(route.grade)}`}>
                      {route.grade}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium truncate">{td(route.name)}</span>
                        {avgRating != null && avgRating >= 4 && (
                          <span className="flex-shrink-0 text-[10px] text-yellow-500">
                            ★{avgRating % 1 === 0 ? avgRating : avgRating.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {t(`routeType.${route.routeType}` as any)}
                        {route.lengthM && ` · ${route.lengthM}${t('route.meters')}`}
                        {route.pitches > 1 && ` · ${route.pitches} ${t('route.pitchesCount')}`}
                        {route.quickdraws && ` · ${route.quickdraws} ${t('route.quickdraws').toLowerCase()}`}
                      </div>
                      {(route.terrainTags?.length || route.holdTypes?.length) ? (
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {route.terrainTags?.map(tag => (
                            <span key={tag} className="bg-blue-50 text-blue-600 rounded px-1 py-0 text-[9px]">{t(`terrain.${tag}` as any)}</span>
                          ))}
                          {route.holdTypes?.map(h => (
                            <span key={h} className="bg-orange-50 text-orange-600 rounded px-1 py-0 text-[9px]">{t(`hold.${h}` as any)}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAscentRoute(route) }}
                      className="w-7 h-7 rounded-full bg-green-100 text-green-700 text-sm font-bold flex items-center justify-center flex-shrink-0"
                      title={t('route.logAscent')}
                    >+</button>
                  </Link>
                </SwipeableRouteRow>
              )
            })}
          </div>
        )}
      </div>

      {/* User suggestions */}
      <div className="px-4 pb-4">
        <SuggestPanel sectorId={sector.id} />
      </div>

      {/* Ascent form modal */}
      {ascentRoute && (
        <AscentForm route={ascentRoute} onClose={() => setAscentRoute(null)} />
      )}

      {/* Swipe toast */}
      {swipeToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg">
          {swipeToast}
        </div>
      )}
    </div>
  )
}
