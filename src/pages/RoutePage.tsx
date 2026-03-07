import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'

export function RoutePage() {
  const { routeId } = useParams<{ routeId: string }>()

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

  if (!route) {
    return <div className="p-4 text-gray-400">Маршрут не найден</div>
  }

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
        <span className="text-xl font-mono font-bold text-blue-700 bg-blue-50 rounded px-3 py-1">
          {route.grade}
        </span>
        <div>
          <h1 className="text-2xl font-bold">{route.name}</h1>
          <p className="text-gray-500 text-sm">
            {route.routeType}
            {route.lengthM && ` · ${route.lengthM}м`}
            {route.pitches > 1 && ` · ${route.pitches} верёвок`}
          </p>
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

      {/* TODO: Кнопка "Залогировать пролаз" */}
      <button className="w-full bg-green-600 text-white rounded-lg px-4 py-3 font-medium mb-6">
        Залогировать пролаз
      </button>

      <h2 className="text-lg font-semibold mb-3">
        Пролазы {ascents ? `(${ascents.length})` : ''}
      </h2>

      {!ascents || ascents.length === 0 ? (
        <p className="text-gray-400 text-sm">Пока никто не пролез</p>
      ) : (
        <div className="space-y-2">
          {ascents.map((ascent) => (
            <div
              key={ascent.id}
              className="bg-white border border-gray-200 rounded-lg p-3"
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">{ascent.style}</span>
                <span className="text-xs text-gray-400">{ascent.date}</span>
              </div>
              {ascent.notes && (
                <p className="text-xs text-gray-500 mt-1">{ascent.notes}</p>
              )}
              <div className="text-xs text-blue-600 mt-1">
                +{ascent.points} очков
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
