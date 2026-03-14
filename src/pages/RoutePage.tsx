import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { TopoViewer } from '../components/topo/TopoViewer'
import { GradeVoting } from '../components/route/GradeVoting'
import { gradeColor, gradeToTopoColor } from '../lib/utils'
import { useI18n } from '../lib/i18n'

export function RoutePage() {
  const { t, td } = useI18n()
  const { routeId } = useParams<{ routeId: string }>()
  const navigate = useNavigate()
  const [activePhotoIdx, setActivePhotoIdx] = useState(0)

  const route = useLiveQuery(
    () => (routeId ? db.routes.get(routeId) : undefined),
    [routeId],
  )

  const sector = useLiveQuery(
    () => (route?.sectorId ? db.sectors.get(route.sectorId) : undefined),
    [route?.sectorId],
  )

  // All routes in the same sector for navigation
  const sectorRoutes = useLiveQuery(
    () => route?.sectorId
      ? db.routes.where('sectorId').equals(route.sectorId).sortBy('gradeSort')
      : [],
    [route?.sectorId],
  )

  // Find ALL topo photos that have this route marked on them
  const toposWithRoute = useLiveQuery(
    async () => {
      if (!routeId) return []
      const trs = await db.topoRoutes.where('routeId').equals(routeId).toArray()
      if (trs.length === 0) return []

      const results = []
      for (const tr of trs) {
        const topo = await db.topos.get(tr.topoId)
        if (!topo) continue
        // Load all route lines on this topo for context
        const allTrs = await db.topoRoutes.where('topoId').equals(topo.id).toArray()
        const rIds = allTrs.map(t => t.routeId)
        const routesList = await db.routes.where('id').anyOf(rIds).toArray()
        const routeMap = new Map(routesList.map(r => [r.id, r]))
        results.push({
          topo,
          topoRoutes: allTrs.map(t => ({ ...t, route: routeMap.get(t.routeId) })),
        })
      }
      return results
    },
    [routeId],
  )

  if (!route) {
    return <div className="p-4 text-gray-400">{t('route.notFound')}</div>
  }

  const activePhoto = toposWithRoute?.[activePhotoIdx] ?? toposWithRoute?.[0]

  return (
    <div className="p-4">
      {sector && (
        <Link
          to={`/sector/${sector.id}`}
          className="text-blue-600 text-sm mb-2 inline-block"
        >
          &larr; {td(sector.name)}
        </Link>
      )}

      <div className="flex items-start gap-3 mb-4">
        <span className={`text-xl font-mono font-bold rounded px-3 py-1 ${gradeColor(route.grade)}`}>
          {route.grade}
        </span>
        <div>
          <h1 className="text-2xl font-bold">{td(route.name)}</h1>
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <span>{t(`routeType.${route.routeType}` as any)}</span>
            {route.lengthM && <span>· {route.lengthM}{t('route.meters')}</span>}
            {route.pitches > 1 && <span>· {route.pitches} {t('route.pitchesCount')}</span>}
          </div>
        </div>
      </div>

      {/* Community grade voting */}
      <div className="mb-3">
        <GradeVoting route={route} />
      </div>

      {route.description && (
        <p className="text-sm text-gray-700 mb-4">{route.description}</p>
      )}

      {route.firstAscent && (
        <p className="text-xs text-gray-400 mb-4">
          {t('route.firstAscent')}: {route.firstAscent}
        </p>
      )}

      {route.tags && route.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {route.tags.map((tag) => (
            <span key={tag} className="bg-gray-100 text-gray-600 text-xs rounded-full px-2 py-0.5">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Topo with this route highlighted */}
      {activePhoto && (
        <div className="mb-4 -mx-4">
          <TopoViewer
            imageUrl={activePhoto.topo.imageUrl}
            imageWidth={activePhoto.topo.imageWidth}
            imageHeight={activePhoto.topo.imageHeight}
            topoRoutes={activePhoto.topoRoutes}
            selectedRouteId={routeId}
          />
          {/* Thumbnails when multiple photos */}
          {toposWithRoute && toposWithRoute.length > 1 && (
            <div className="flex gap-1 overflow-x-auto px-2 py-1">
              {toposWithRoute.map((tw, i) => (
                <img
                  key={tw.topo.id}
                  src={tw.topo.imageUrl}
                  alt={tw.topo.caption || ''}
                  onClick={() => setActivePhotoIdx(i)}
                  className={`h-10 w-14 object-cover rounded flex-shrink-0 cursor-pointer border-2 ${
                    i === activePhotoIdx ? 'border-blue-500' : 'border-transparent'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Other routes in this sector */}
      {sectorRoutes && sectorRoutes.length > 1 && (
        <div className="mt-2">
          <h2 className="text-sm font-semibold text-gray-500 mb-2">{t('sector.routes')}</h2>
          <div className="space-y-1">
            {sectorRoutes.map((r) => {
              const isCurrent = r.id === routeId
              return (
                <button
                  key={r.id}
                  onClick={() => !isCurrent && navigate(`/route/${r.id}`)}
                  className={`w-full flex items-center gap-2 rounded-lg p-2 text-left transition-colors ${
                    isCurrent
                      ? 'bg-blue-50 border border-blue-300'
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: gradeToTopoColor(r.grade) }}
                  />
                  <span className={`text-xs font-mono font-bold rounded px-1.5 py-0.5 ${gradeColor(r.grade)}`}>
                    {r.grade}
                  </span>
                  <span className={`text-sm truncate ${isCurrent ? 'font-semibold' : ''}`}>
                    {td(r.name)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
