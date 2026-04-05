import { useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { TopoViewer } from '../components/topo/TopoViewer'
import { GradeVoting } from '../components/route/GradeVoting'
import { AscentForm } from '../components/route/AscentForm'
import { gradeColor, safeTags } from '../lib/utils'
import { useI18n } from '../lib/i18n'
import { useUser } from '../lib/userContext'
import { TranslatedName } from '../components/ui/TranslatedName'

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
  const [sugComment, setSugComment] = useState('')
  const [showCommentForm, setShowCommentForm] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentSent, setCommentSent] = useState(false)
  const [showAscentForm, setShowAscentForm] = useState(false)

  const route = useLiveQuery(
    () => (routeId ? db.routes.get(routeId) : undefined),
    [routeId],
  )

  const sector = useLiveQuery(
    () => (route?.sectorId ? db.sectors.get(route.sectorId) : undefined),
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
          topoRoutes: allTrs.sort((a, b) => (a.routeNumber || 0) - (b.routeNumber || 0)).map(t => ({ ...t, route: routeMap.get(t.routeId) })),
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

  // Public reviews/comments
  const routeReviews = useLiveQuery(
    () => routeId ? db.reviews.where('routeId').equals(routeId).toArray() : [],
    [routeId],
  )
  // Fetch user names for reviews
  const reviewUserIds = [...new Set((routeReviews ?? []).map(r => r.userId))]
  const reviewUsers = useLiveQuery(
    () => reviewUserIds.length > 0 ? db.users.where('id').anyOf(reviewUserIds).toArray() : [],
    [reviewUserIds.join(',')],
  )
  const userNameMap = new Map((reviewUsers ?? []).map(u => [u.id, u.displayName]))

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
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => navigate(-1)}
          className="text-blue-600 text-sm"
        >
          &larr; {t('back')}
        </button>
        {sector && (
          <Link to={`/sector/${sector.id}`} className="text-gray-400 text-xs">
            {td(sector.name)}
          </Link>
        )}
      </div>

      <div className="flex items-start gap-3 mb-2">
        <span className={`text-xl font-mono font-bold rounded px-3 py-1 ${gradeColor(route.grade)}`}>
          {route.grade}
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate"><TranslatedName name={td(route.name)} /></h1>
          {(avgRating > 0 || successCount > 0) && (
            <div className="flex items-center gap-2 mt-0.5">
              {avgRating > 0 && (
                <span className="text-sm text-yellow-500">
                  {'★'.repeat(Math.round(avgRating))}
                </span>
              )}
              {successCount > 0 && (
                <span className="text-xs text-green-600">
                  {successCount} {t('route.successfulAscents')}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 text-gray-500 text-sm mt-0.5">
            <span>{t(`routeType.${route.routeType}` as any)}</span>
            {route.pitches > 1 && <span>· {route.pitches} {t('route.pitchesCount')}</span>}
            {user && (
              <button
                onClick={() => setShowAscentForm(true)}
                className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-600/20 text-green-700 active:bg-green-600/40"
              >
                + {t('route.logAscent')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Extra route info: quickdraws, rope, terrain, holds */}
      {(route.quickdraws || route.lengthM || route.ropeLength || safeTags(route.terrainTags).length > 0 || safeTags(route.holdTypes).length > 0) && (
        <div className="space-y-1.5 mb-3 text-xs">
          {/* Equipment line */}
          {(route.quickdraws || route.lengthM || route.ropeLength) && (
            <div className="flex items-center gap-3">
              {route.quickdraws && (
                <span className="inline-flex items-center gap-1 text-gray-700">
                  <img src="/icons/quickdraw.png" alt="" className="h-5 w-auto" />
                  {t('route.quickdraws')}: {route.quickdraws}
                </span>
              )}
              {(route.lengthM || route.ropeLength) && (
                <span className="inline-flex items-center gap-1 text-gray-700">
                  <img src="/icons/height-arrow.svg" alt="" className="h-5 w-auto opacity-70" />
                  {t('route.ropeLength')}: {route.lengthM || route.ropeLength}{t('route.meters')}
                </span>
              )}
            </div>
          )}
          {/* Terrain line */}
          {safeTags(route.terrainTags).length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {safeTags(route.terrainTags).map(tag => (
                <span key={tag} className="bg-blue-50 text-blue-700 rounded-full px-2 py-0.5">
                  {t(`terrain.${tag}` as any)}
                </span>
              ))}
            </div>
          )}
          {/* Holds line */}
          {safeTags(route.holdTypes).length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {safeTags(route.holdTypes).map(hold => (
                <span key={hold} className="bg-orange-50 text-orange-700 rounded-full px-2 py-0.5">
                  {t(`hold.${hold}` as any)}
                </span>
              ))}
            </div>
          )}
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
                  <input type="number" value={sugQd} onChange={e => setSugQd(e.target.value)} className="w-full border border-gray-200 rounded px-2 py-1 text-sm" placeholder="8" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-gray-500">{t('route.ropeLength')}</label>
                  <input type="number" value={sugRope} onChange={e => setSugRope(e.target.value)} className="w-full border border-gray-200 rounded px-2 py-1 text-sm" placeholder="50" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">{t('route.terrain' as any)}</label>
                <div className="flex flex-wrap gap-1">
                  {['slab', 'vertical', 'overhang', 'roof', 'chimney'].map(tag => (
                    <button key={tag} type="button" onClick={() => setSugTerrain(prev => { const n = new Set(prev); n.has(tag) ? n.delete(tag) : n.add(tag); return n })}
                      className={`px-2 py-0.5 rounded-full text-xs ${sugTerrain.has(tag) ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
                    >{t(`terrain.${tag}` as any)}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">{t('route.holds' as any)}</label>
                <div className="flex flex-wrap gap-1">
                  {['crimps', 'slopers', 'pinches', 'sidepulls', 'pockets', 'jugs'].map(h => (
                    <button key={h} type="button" onClick={() => setSugHolds(prev => { const n = new Set(prev); n.has(h) ? n.delete(h) : n.add(h); return n })}
                      className={`px-2 py-0.5 rounded-full text-xs ${sugHolds.has(h) ? 'bg-orange-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
                    >{t(`hold.${h}` as any)}</button>
                  ))}
                </div>
              </div>
              <textarea
                value={sugComment}
                onChange={e => setSugComment(e.target.value)}
                placeholder={t('suggest.comment')}
                rows={2}
                className="w-full border border-gray-200 rounded px-2 py-1 text-sm resize-none"
              />
              <button
                onClick={async () => {
                  if (!routeId || !user?.id) return
                  const data = { routeId, quickdraws: sugQd ? Number(sugQd) : undefined, ropeLength: sugRope ? Number(sugRope) : undefined, terrainTags: [...sugTerrain], holdTypes: [...sugHolds] }
                  const suggestion = { id: crypto.randomUUID(), userId: user.id, userName: user.displayName ?? '', sectorId: route.sectorId, type: 'route' as const, status: 'pending' as const, data: JSON.stringify(data), comment: sugComment || undefined, createdAt: new Date().toISOString() }
                  await db.suggestions.add(suggestion)
                  await db.syncQueue.add({ entity: 'suggestion', action: 'create', localId: suggestion.id, payload: suggestion as unknown as Record<string, unknown>, createdAt: Date.now(), retryCount: 0 })
                  setSuggestSent(true)
                  setSugQd(''); setSugRope(''); setSugTerrain(new Set()); setSugHolds(new Set()); setSugComment('')
                  setTimeout(() => { setSuggestSent(false); setShowSuggest(false) }, 3000)
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


      {/* Public comments */}
      {(() => {
        const commentsWithText = (routeReviews ?? []).filter(r => r.comment && r.comment.trim())
        return commentsWithText.length > 0 ? (
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-500 mb-2">{t('route.comments')} ({commentsWithText.length})</h2>
            <div className="space-y-2">
              {commentsWithText
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map(r => (
                <div key={r.id} className="bg-gray-50 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">
                      {userNameMap.get(r.userId) || t('activity.unknownUser')}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {r.rating > 0 && (
                    <div className="text-xs text-yellow-600 mb-0.5">{'★'.repeat(r.rating)}</div>
                  )}
                  {r.gradeOpinion && (
                    <span className="text-[10px] bg-blue-50 text-blue-600 rounded px-1.5 py-0.5 mr-1">
                      {t(`review.gradeOpinion.${r.gradeOpinion}` as any)}
                    </span>
                  )}
                  <p className="text-sm text-gray-700 mt-1">{r.comment}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null
      })()}

      {/* Leave a comment form */}
      {user && (
        <div className="mb-4">
          {commentSent ? (
            <p className="text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2 text-center">{t('route.commentSent')}</p>
          ) : !showCommentForm ? (
            <button
              onClick={() => setShowCommentForm(true)}
              className="w-full text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-lg py-2 font-medium"
            >
              {t('route.leaveComment')}
            </button>
          ) : (
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder={t('route.commentPlaceholder')}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowCommentForm(false); setCommentText('') }}
                  className="flex-1 text-sm text-gray-500 border border-gray-200 rounded-lg py-2"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={async () => {
                    if (!commentText.trim() || !routeId || !user?.id) return
                    const review = {
                      id: crypto.randomUUID(),
                      localId: crypto.randomUUID(),
                      userId: user.id,
                      routeId,
                      rating: 0,
                      comment: commentText.trim(),
                      syncStatus: 'pending' as const,
                      createdAt: new Date().toISOString(),
                    }
                    await db.reviews.add(review)
                    await db.syncQueue.add({
                      entity: 'review',
                      action: 'create',
                      localId: review.localId,
                      payload: {
                        userId: user.id,
                        routeId,
                        rating: 0,
                        comment: commentText.trim(),
                      },
                      createdAt: Date.now(),
                      retryCount: 0,
                    })
                    setCommentText('')
                    setShowCommentForm(false)
                    setCommentSent(true)
                    setTimeout(() => setCommentSent(false), 3000)
                  }}
                  disabled={!commentText.trim()}
                  className="flex-1 text-sm text-white bg-blue-600 rounded-lg py-2 font-medium disabled:opacity-40"
                >
                  {t('route.sendComment')}
                </button>
              </div>
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


      {/* Ascent form modal */}
      {showAscentForm && (
        <AscentForm route={route} onClose={() => setShowAscentForm(false)} />
      )}
    </div>
  )
}
