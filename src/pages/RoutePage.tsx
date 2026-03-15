import { useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { TopoViewer } from '../components/topo/TopoViewer'
import { GradeVoting } from '../components/route/GradeVoting'
import { gradeColor, gradeToTopoColor } from '../lib/utils'
import { useI18n } from '../lib/i18n'
import { useUser } from '../lib/userContext'

export function RoutePage() {
  const { t, td } = useI18n()
  const { user } = useUser()
  const { routeId } = useParams<{ routeId: string }>()
  const navigate = useNavigate()
  const [activePhotoIdx, setActivePhotoIdx] = useState(0)
  const [noteText, setNoteText] = useState<string | null>(null)
  const [showSuggest, setShowSuggest] = useState(false)
  const [suggestSent, setSuggestSent] = useState(false)
  const [sugQd, setSugQd] = useState('')
  const [sugRope, setSugRope] = useState('')
  const [sugTerrain, setSugTerrain] = useState<Set<string>>(new Set())
  const [sugHolds, setSugHolds] = useState<Set<string>>(new Set())

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

  // Public stats: successful ascents (exclude attempts and toprope)
  const routeAscents = useLiveQuery(
    () => routeId ? db.ascents.where('routeId').equals(routeId).toArray() : [],
    [routeId],
  )
  const successCount = (routeAscents ?? []).filter(a => ['onsight', 'flash', 'redpoint'].includes(a.style)).length
  const avgRating = (() => {
    const rated = (routeAscents ?? []).filter(a => a.rating && a.rating > 0)
    if (rated.length === 0) return 0
    return Math.round(rated.reduce((s, a) => s + (a.rating || 0), 0) / rated.length * 10) / 10
  })()

  // Private notes (local only)
  const myNote = useLiveQuery(
    () => routeId && user?.id ? db.routeNotes.get([routeId, user.id]) : undefined,
    [routeId, user?.id],
  )

  // Initialize noteText from DB when loaded
  if (noteText === null && myNote !== undefined) {
    setNoteText(myNote?.text ?? '')
  }

  const saveNote = useCallback(async (text: string) => {
    if (!routeId || !user?.id) return
    if (text.trim()) {
      await db.routeNotes.put({ routeId, userId: user.id, text: text.trim(), updatedAt: new Date().toISOString() })
    } else {
      await db.routeNotes.delete([routeId, user.id])
    }
  }, [routeId, user?.id])

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

      {/* Extra route info: quickdraws, rope, terrain, holds */}
      {(route.quickdraws || route.ropeLength || route.terrainTags?.length || route.holdTypes?.length) && (
        <div className="flex flex-wrap gap-1.5 mb-3 text-xs">
          {route.quickdraws && (
            <span className="bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">
              {t('route.quickdraws')}: {route.quickdraws}
            </span>
          )}
          {route.ropeLength && (
            <span className="bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">
              {t('route.ropeLength')}: {route.ropeLength}{t('route.meters')}
            </span>
          )}
          {route.terrainTags?.map(tag => (
            <span key={tag} className="bg-blue-50 text-blue-700 rounded-full px-2 py-0.5">
              {t(`terrain.${tag}` as any)}
            </span>
          ))}
          {route.holdTypes?.map(hold => (
            <span key={hold} className="bg-orange-50 text-orange-700 rounded-full px-2 py-0.5">
              {t(`hold.${hold}` as any)}
            </span>
          ))}
        </div>
      )}

      {/* Suggest route info — visible early */}
      {user && (
        <div className="mb-3">
          <button
            onClick={() => setShowSuggest(v => !v)}
            className={`w-full flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${
              showSuggest ? 'bg-blue-100 text-blue-700' : 'bg-blue-50 text-blue-600 border border-blue-200'
            }`}
          >
            <span>{showSuggest ? '▲' : '💡'}</span> {t('route.suggestInfo')}
          </button>
          {showSuggest && !suggestSent && (
            <div className="space-y-2 bg-gray-50 rounded-lg p-3 mt-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-gray-500">{t('route.quickdraws')}</label>
                  <input type="number" value={sugQd} onChange={e => setSugQd(e.target.value)} className="w-full border border-gray-200 rounded px-2 py-1 text-sm" placeholder="e.g. 8" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-gray-500">{t('route.ropeLength')}</label>
                  <input type="number" value={sugRope} onChange={e => setSugRope(e.target.value)} className="w-full border border-gray-200 rounded px-2 py-1 text-sm" placeholder="e.g. 50" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">{t('terrain.vertical').split(' ')[0]}</label>
                <div className="flex flex-wrap gap-1">
                  {['slab', 'vertical', 'overhang', 'roof', 'chimney'].map(tag => (
                    <button key={tag} type="button" onClick={() => setSugTerrain(prev => { const n = new Set(prev); n.has(tag) ? n.delete(tag) : n.add(tag); return n })}
                      className={`px-2 py-0.5 rounded-full text-xs ${sugTerrain.has(tag) ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
                    >{t(`terrain.${tag}` as any)}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">{t('hold.crimps').split(' ')[0]}</label>
                <div className="flex flex-wrap gap-1">
                  {['crimps', 'slopers', 'pinches', 'sidepulls', 'pockets', 'jugs'].map(h => (
                    <button key={h} type="button" onClick={() => setSugHolds(prev => { const n = new Set(prev); n.has(h) ? n.delete(h) : n.add(h); return n })}
                      className={`px-2 py-0.5 rounded-full text-xs ${sugHolds.has(h) ? 'bg-orange-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
                    >{t(`hold.${h}` as any)}</button>
                  ))}
                </div>
              </div>
              <button
                onClick={async () => {
                  if (!routeId || !user?.id) return
                  const data = { routeId, quickdraws: sugQd ? Number(sugQd) : undefined, ropeLength: sugRope ? Number(sugRope) : undefined, terrainTags: [...sugTerrain], holdTypes: [...sugHolds] }
                  const suggestion = { id: crypto.randomUUID(), userId: user.id, userName: user.displayName ?? '', sectorId: route.sectorId, type: 'route' as const, status: 'pending' as const, data: JSON.stringify(data), createdAt: new Date().toISOString() }
                  await db.suggestions.add(suggestion)
                  await db.syncQueue.add({ entity: 'suggestion', action: 'create', localId: suggestion.id, payload: suggestion as unknown as Record<string, unknown>, createdAt: Date.now(), retryCount: 0 })
                  setSuggestSent(true)
                }}
                disabled={!sugQd && !sugRope && sugTerrain.size === 0 && sugHolds.size === 0}
                className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
              >
                {t('route.suggestInfo')}
              </button>
            </div>
          )}
          {suggestSent && <p className="text-xs text-green-600 mt-1">{t('route.suggestSent')}</p>}
        </div>
      )}

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

      {/* Public stats */}
      {successCount > 0 && (
        <div className="flex gap-3 mb-4">
          <div className="bg-green-50 rounded-lg px-3 py-2 text-center flex-1">
            <div className="text-lg font-bold text-green-700">{successCount}</div>
            <div className="text-[10px] text-green-600">{t('route.successfulAscents')}</div>
          </div>
          {avgRating > 0 && (
            <div className="bg-yellow-50 rounded-lg px-3 py-2 text-center flex-1">
              <div className="text-lg font-bold text-yellow-700">{'★'.repeat(Math.round(avgRating))} <span className="text-xs font-normal">{avgRating}</span></div>
              <div className="text-[10px] text-yellow-600">{t('ascent.rating')}</div>
            </div>
          )}
        </div>
      )}

      {/* Private notes */}
      {user && (
        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-500 mb-1 block">{t('route.myNotes')}</label>
          <textarea
            value={noteText ?? ''}
            onChange={(e) => setNoteText(e.target.value)}
            onBlur={(e) => saveNote(e.target.value)}
            rows={2}
            placeholder={t('route.notesPlaceholder')}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
          />
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
