import { useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { AscentForm } from '../components/route/AscentForm'
import { ReviewForm } from '../components/route/ReviewForm'
import { routeTypeLabel, gradeColor } from '../lib/utils'
import type { Topo } from '../lib/db/schema'

const STYLE_LABELS: Record<string, string> = {
  onsight: 'Онсайт',
  flash: 'Флэш',
  redpoint: 'Редпоинт',
  toprope: 'Топроуп',
  attempt: 'Попытка',
}

export function RoutePage() {
  const { routeId } = useParams<{ routeId: string }>()
  const [showAscentForm, setShowAscentForm] = useState(false)
  const [showReviewForm, setShowReviewForm] = useState(false)

  const route = useLiveQuery(
    () => (routeId ? db.routes.get(routeId) : undefined),
    [routeId],
  )

  const sector = useLiveQuery(
    () => (route?.sectorId ? db.sectors.get(route.sectorId) : undefined),
    [route?.sectorId],
  )

  const ascents = useLiveQuery(
    () =>
      routeId
        ? db.ascents.where('routeId').equals(routeId).reverse().sortBy('date')
        : [],
    [routeId],
  )

  const reviews = useLiveQuery(
    () =>
      routeId
        ? db.reviews.where('routeId').equals(routeId).reverse().sortBy('createdAt')
        : [],
    [routeId],
  )

  // Route photos: topos with id matching `topo-route-{routeId}-*`
  const routeTopos = useLiveQuery(
    async (): Promise<Topo[]> => {
      if (!routeId) return []
      // Get all topos for this sector, then filter by caption/id containing route info
      const all = route?.sectorId
        ? await db.topos.where('sectorId').equals(route.sectorId).toArray()
        : []
      return all.filter(t => t.id.startsWith(`topo-route-${routeId}`))
    },
    [routeId, route?.sectorId],
  )

  const [routePhotoIdx, setRoutePhotoIdx] = useState(0)
  const [routeZoom, setRouteZoom] = useState(1)
  const zoomIn = useCallback(() => setRouteZoom(z => Math.min(4, z + 0.5)), [])
  const zoomOut = useCallback(() => setRouteZoom(z => Math.max(1, z - 0.5)), [])
  const resetZoom = useCallback(() => setRouteZoom(1), [])

  if (!route) {
    return <div className="p-4 text-gray-400">Маршрут не найден</div>
  }

  // Average rating from reviews
  const avgRating = reviews && reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : null

  // Grade consensus from ascents
  const gradeVotes = ascents?.filter(a => a.personalGrade) ?? []
  const gradeSummary = (() => {
    if (gradeVotes.length === 0) return null
    let soft = 0, fair = 0, hard = 0
    const exactGrades: Record<string, number> = {}
    for (const a of gradeVotes) {
      const pg = a.personalGrade!
      if (pg.startsWith('soft:')) soft++
      else if (pg.startsWith('hard:')) hard++
      else {
        // It's an exact grade like "6b+"
        exactGrades[pg] = (exactGrades[pg] || 0) + 1
      }
    }
    // Also count ascents that logged "fair" as no personalGrade
    const totalWithOpinion = soft + hard + Object.values(exactGrades).reduce((s, c) => s + c, 0)
    const topExact = Object.entries(exactGrades).sort((a, b) => b[1] - a[1])[0]
    return { soft, hard, fair, total: totalWithOpinion, topExact: topExact ? topExact[0] : null, topExactCount: topExact ? topExact[1] : 0, exactGrades }
  })()

  return (
    <div className="p-4">
      {sector && (
        <Link
          to={`/sector/${sector.id}`}
          className="text-blue-600 text-sm mb-2 inline-block"
        >
          &larr; {sector.name}
        </Link>
      )}

      <div className="flex items-start gap-3 mb-4">
        <span className={`text-xl font-mono font-bold rounded px-3 py-1 ${gradeColor(route.grade)}`}>
          {route.grade}
        </span>
        <div>
          <h1 className="text-2xl font-bold">{route.name}</h1>
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <span>{routeTypeLabel(route.routeType)}</span>
            {route.lengthM && <span>· {route.lengthM}м</span>}
            {route.pitches > 1 && <span>· {route.pitches} верёвок</span>}
            {avgRating && (
              <span className="text-yellow-500">★ {avgRating}</span>
            )}
          </div>
        </div>
      </div>

      {route.description && (
        <p className="text-sm text-gray-700 mb-4">{route.description}</p>
      )}

      {route.firstAscent && (
        <p className="text-xs text-gray-400 mb-4">
          Первопроход: {route.firstAscent}
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

      {/* Route photos */}
      {routeTopos && routeTopos.length > 0 && (
        <div className="mb-4 -mx-4">
          <div
            className="relative overflow-auto bg-gray-100"
            style={{ maxHeight: routeZoom > 1 ? '60vh' : undefined }}
          >
            <img
              src={routeTopos[routePhotoIdx].imageUrl}
              alt={routeTopos[routePhotoIdx].caption || route.name}
              className="block transition-transform duration-200 ease-out"
              style={{
                width: routeZoom > 1 ? `${routeZoom * 100}%` : '100%',
                maxWidth: routeZoom > 1 ? 'none' : '100%',
                cursor: routeZoom > 1 ? 'grab' : 'zoom-in',
              }}
              onClick={() => { if (routeZoom === 1) zoomIn() }}
              draggable={false}
            />
            <div className="absolute top-2 right-2 flex flex-col gap-1" style={{ zIndex: 10 }}>
              <button onClick={zoomIn} className="w-8 h-8 bg-black/60 text-white rounded-full text-lg leading-none">+</button>
              {routeZoom > 1 && (
                <>
                  <button onClick={resetZoom} className="w-8 h-8 bg-black/60 text-white rounded-full text-[10px] leading-none">{Math.round(routeZoom * 100)}%</button>
                  <button onClick={zoomOut} className="w-8 h-8 bg-black/60 text-white rounded-full text-lg leading-none">-</button>
                </>
              )}
            </div>
          </div>
          {routeTopos.length > 1 && (
            <div className="flex gap-1 px-2 py-1 overflow-x-auto">
              {routeTopos.map((t, i) => (
                <img
                  key={t.id}
                  src={t.imageUrl}
                  alt={t.caption || ''}
                  onClick={() => { setRoutePhotoIdx(i); resetZoom() }}
                  className={`h-12 w-16 object-cover rounded flex-shrink-0 cursor-pointer border-2 ${
                    i === routePhotoIdx ? 'border-blue-500' : 'border-transparent'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grade consensus */}
      {gradeSummary && gradeSummary.total > 0 && (
        <div className="bg-gray-50 rounded-lg p-3 mb-4">
          <div className="text-sm font-medium text-gray-700 mb-2">
            Мнение сообщества ({gradeSummary.total})
          </div>
          {/* Bar: soft / exact / hard */}
          <div className="flex h-6 rounded-full overflow-hidden mb-2">
            {gradeSummary.soft > 0 && (
              <div
                className="bg-green-400 flex items-center justify-center text-[10px] text-white font-bold"
                style={{ width: `${(gradeSummary.soft / gradeSummary.total) * 100}%` }}
              >
                {gradeSummary.soft > 0 && 'Мягче'}
              </div>
            )}
            {Object.entries(gradeSummary.exactGrades).map(([g, count]) => (
              <div
                key={g}
                className="bg-blue-500 flex items-center justify-center text-[10px] text-white font-bold border-l border-white/30"
                style={{ width: `${(count / gradeSummary.total) * 100}%` }}
              >
                {g}
              </div>
            ))}
            {gradeSummary.hard > 0 && (
              <div
                className="bg-red-400 flex items-center justify-center text-[10px] text-white font-bold"
                style={{ width: `${(gradeSummary.hard / gradeSummary.total) * 100}%` }}
              >
                {gradeSummary.hard > 0 && 'Жёстче'}
              </div>
            )}
          </div>
          {gradeSummary.topExact && (
            <div className="text-xs text-gray-500">
              Чаще всего ставят <span className="font-mono font-bold text-blue-700">{gradeSummary.topExact}</span> ({gradeSummary.topExactCount} чел.)
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setShowAscentForm(true)}
          className="flex-1 bg-green-600 text-white rounded-lg px-4 py-3 font-medium"
        >
          Залогировать пролаз
        </button>
        <button
          onClick={() => setShowReviewForm(true)}
          className="bg-blue-100 text-blue-700 rounded-lg px-4 py-3 font-medium"
        >
          Отзыв
        </button>
      </div>

      {/* Ascents */}
      <h2 className="text-lg font-semibold mb-3">
        Пролазы {ascents ? `(${ascents.length})` : ''}
      </h2>

      {!ascents || ascents.length === 0 ? (
        <p className="text-gray-400 text-sm mb-6">Пока никто не пролез</p>
      ) : (
        <div className="space-y-2 mb-6">
          {ascents.map((ascent) => (
            <div
              key={ascent.id}
              className="bg-white border border-gray-200 rounded-lg p-3"
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">{STYLE_LABELS[ascent.style] ?? ascent.style}</span>
                <span className="text-xs text-gray-400">{ascent.date}</span>
              </div>
              {ascent.rating && (
                <div className="text-yellow-400 text-xs mt-0.5">
                  {'★'.repeat(ascent.rating)}{'☆'.repeat(5 - ascent.rating)}
                </div>
              )}
              {ascent.notes && (
                <p className="text-xs text-gray-500 mt-1">{ascent.notes}</p>
              )}
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-blue-600 font-medium">+{ascent.points} очков</span>
                {ascent.syncStatus === 'pending' && (
                  <span className="text-xs text-orange-500">ожидает синхронизации</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reviews */}
      {reviews && reviews.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mb-3">
            Отзывы ({reviews.length})
          </h2>
          <div className="space-y-2">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="bg-white border border-gray-200 rounded-lg p-3"
              >
                <div className="flex justify-between items-center">
                  <div className="text-yellow-400 text-sm">
                    {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                  </div>
                  {review.gradeOpinion && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      review.gradeOpinion === 'Soft' ? 'bg-green-100 text-green-700'
                        : review.gradeOpinion === 'Hard' ? 'bg-red-100 text-red-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {review.gradeOpinion === 'Soft' ? 'Мягче' : review.gradeOpinion === 'Hard' ? 'Жёстче' : 'Норм'}
                    </span>
                  )}
                </div>
                {review.comment && (
                  <p className="text-xs text-gray-600 mt-1">{review.comment}</p>
                )}
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[10px] text-gray-400">
                    {new Date(review.createdAt).toLocaleDateString('ru')}
                  </span>
                  {review.syncStatus === 'pending' && (
                    <span className="text-xs text-orange-500">ожидает синхр.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showAscentForm && (
        <AscentForm
          route={route}
          onClose={() => setShowAscentForm(false)}
        />
      )}

      {showReviewForm && (
        <ReviewForm
          route={route}
          onClose={() => setShowReviewForm(false)}
        />
      )}
    </div>
  )
}
