import { useState, useMemo, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Topo } from '../lib/db/schema'
import { TopoViewer } from '../components/topo/TopoViewer'
import { TopoEditor } from '../components/topo/TopoEditor'
import { RouteList } from '../components/topo/RouteList'
import { gradeColor } from '../lib/utils'
import { useGps } from '../hooks/useGps'
import { distanceMeters, formatDistance, bearing } from '../lib/map/geo'
import { useI18n } from '../lib/i18n'

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
  const { t } = useI18n()
  const { sectorId } = useParams<{ sectorId: string }>()
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [gradeFilter, setGradeFilter] = useState('all')
  const [editingTopoId, setEditingTopoId] = useState<string | null>(null)
  const [editingNumberId, setEditingNumberId] = useState<string | null>(null)
  const { position } = useGps()
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleDeletePhoto = useCallback(async (topoId: string) => {
    if (!confirm(t('sector.deletePhotoConfirm'))) return
    // Delete associated route lines first
    await db.topoRoutes.where('topoId').equals(topoId).delete()
    // If this was the cover photo, clear it
    if (sector?.coverImageUrl) {
      const topo = allTopos?.find(tp => tp.id === topoId)
      if (topo && sector.coverImageUrl === topo.imageUrl) {
        await db.sectors.where('id').equals(sector.id).modify(s => { delete s.coverImageUrl })
      }
    }
    await db.topos.delete(topoId)
    setActiveTopoIdx(i => Math.max(0, i - 1))
    if (editingTopoId === topoId) setEditingTopoId(null)
  }, [sector, allTopos, editingTopoId, t])

  const handleUploadPhoto = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !sectorId) return

    const url = URL.createObjectURL(file)
    const img = new Image()
    img.src = url
    await new Promise<void>((resolve) => { img.onload = () => resolve() })

    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

    const topo: Topo = {
      id: `topo-${Date.now()}`,
      sectorId,
      imageUrl: dataUrl,
      imageWidth: img.width,
      imageHeight: img.height,
      type: 'topo',
      sortOrder: (allTopos?.length || 0) + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await db.topos.put(topo)
    URL.revokeObjectURL(url)
    e.target.value = ''
  }, [sectorId, allTopos])

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

  if (!sector) {
    return <div className="p-4 text-gray-400">{t('sector.notFound')}</div>
  }

  const filteredRoutes = routes?.filter(r => matchesGradeFilter(r.gradeSort, gradeFilter)) ?? []
  const editingTopo = editingTopoId ? allTopos?.find(tp => tp.id === editingTopoId) : null

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
        <h1 className="text-xl font-bold">{sector.name}</h1>
        <div className="flex flex-wrap gap-x-2 text-xs text-gray-400">
          {sector.orientation && <span>{sector.orientation}</span>}
          {sector.sunExposure && <span>{sector.sunExposure}</span>}
          {sector.approachTimeMin && <span>{sector.approachTimeMin} {t('sector.min')}</span>}
          {sector.description && <span>· {sector.description}</span>}
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

      {/* Hidden file input for photo upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUploadPhoto}
        className="hidden"
      />

      {/* Inline TopoEditor */}
      {editingTopo && (
        <div className="px-4 py-2 bg-yellow-50 border-y border-yellow-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">{t('sector.markRoutes')}</span>
            <button
              onClick={() => setEditingTopoId(null)}
              className="text-xs text-gray-500"
            >
              {t('sector.done')}
            </button>
          </div>
          <TopoEditor topo={editingTopo} onDone={() => setEditingTopoId(null)} />
        </div>
      )}

      {/* Topo viewer with route overlays (OpenSeadragon) */}
      {!editingTopo && activeTopo && activeTopoRoutes.length > 0 && (
        <div className="mb-2">
          <TopoViewer
            imageUrl={activeTopo.imageUrl}
            imageWidth={activeTopo.imageWidth}
            imageHeight={activeTopo.imageHeight}
            topoRoutes={activeTopoRoutes}
            selectedRouteId={selectedRouteId}
            onRouteSelect={(id) => setSelectedRouteId(prev => prev === id ? null : id)}
          />
          <RouteList
            topoRoutes={activeTopoRoutes}
            selectedRouteId={selectedRouteId}
            onSelect={setSelectedRouteId}
          />
          <div className="px-2 flex gap-2 justify-end">
            <button
              onClick={() => handleDeletePhoto(activeTopo.id)}
              className="text-xs text-red-400"
            >
              &times;
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-gray-500"
            >
              + Фото
            </button>
            <button
              onClick={() => setEditingTopoId(activeTopo.id)}
              className="text-xs text-blue-600"
            >
              {t('sector.markRoutes')}
            </button>
          </div>
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
      {!editingTopo && activeTopo && activeTopoRoutes.length === 0 && (
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
            <div className="flex gap-2 flex-shrink-0 ml-2">
              <button
                onClick={() => activeTopo && handleDeletePhoto(activeTopo.id)}
                className="text-xs text-red-400"
              >
                &times;
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-gray-500"
              >
                + Фото
              </button>
              <button
                onClick={() => activeTopo && setEditingTopoId(activeTopo.id)}
                className="text-xs text-blue-600"
              >
                {t('sector.markRoutes')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No photos yet — show upload button */}
      {!editingTopo && wallTopos.length === 0 && (
        <div className="mx-4 my-2 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <p className="text-sm text-gray-400 mb-2">{t('sector.noPhoto')}</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg"
          >
            + {t('sector.uploadPhoto')}
          </button>
        </div>
      )}

      {/* Routes list */}
      <div className="px-4 pt-1 pb-4">
        <h2 className="text-lg font-semibold mb-2">
          {t('sector.routes')} {routes ? `(${routes.length})` : ''}
        </h2>

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
              {gradeFilterLabel(f)}
            </button>
          ))}
        </div>

        {filteredRoutes.length === 0 ? (
          <p className="text-gray-400 text-sm">
            {routes?.length ? t('sector.noRoutesInRange') : t('sector.routesNotLoaded')}
          </p>
        ) : (
          <div className="space-y-1">
            {filteredRoutes.map((route) => {
              const tr = topoRoutes?.find((tp) => tp.routeId === route.id)
              const isSelected = route.id === selectedRouteId
              const avgRating = routeRatings?.get(route.id)
              return (
                <Link
                  key={route.id}
                  to={`/route/${route.id}`}
                  className={`flex items-center gap-2 border rounded-lg p-2.5 transition-colors ${
                    isSelected
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-white border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {tr && (
                    editingNumberId === tr.id ? (
                      <input
                        autoFocus
                        type="number"
                        defaultValue={tr.routeNumber ?? ''}
                        className="w-7 h-6 text-center text-xs font-bold rounded-full border border-blue-400 outline-none"
                        onClick={(e) => e.preventDefault()}
                        onBlur={async (e) => {
                          const val = parseInt(e.target.value)
                          if (!isNaN(val)) await db.topoRoutes.update(tr.id, { routeNumber: val })
                          setEditingNumberId(null)
                        }}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                      />
                    ) : (
                      <span
                        onClick={(e) => { e.preventDefault(); setEditingNumberId(tr.id) }}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 cursor-pointer"
                        style={{ backgroundColor: tr.color }}
                        title={t('sector.editNumber')}
                      >
                        {tr.routeNumber}
                      </span>
                    )
                  )}
                  <span className={`w-11 text-center text-xs font-mono font-bold rounded px-1.5 py-0.5 ${gradeColor(route.grade)}`}>
                    {route.grade}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium truncate">{route.name}</span>
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
