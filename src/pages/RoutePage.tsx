import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { AscentForm } from '../components/route/AscentForm'
import { ReviewForm } from '../components/route/ReviewForm'
import { routeTypeLabel, gradeColor } from '../lib/utils'

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

  if (!route) {
    return <div className="p-4 text-gray-400">Маршрут не найден</div>
  }

  // Average rating from reviews
  const avgRating = reviews && reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : null

  // Grade consensus
  const gradeVotes = reviews?.filter(r => r.gradeOpinion) ?? []
  const gradeConsensus = gradeVotes.length >= 2
    ? (() => {
        const counts: Record<string, number> = {}
        gradeVotes.forEach(r => { counts[r.gradeOpinion!] = (counts[r.gradeOpinion!] || 0) + 1 })
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
        return top[0] === 'Fair' ? null : top[0] // Only show if not "Fair"
      })()
    : null

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
            {gradeConsensus && (
              <span className={gradeConsensus === 'Soft' ? 'text-green-600' : 'text-red-600'}>
                {gradeConsensus === 'Soft' ? 'Мягче' : 'Жёстче'}
              </span>
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
