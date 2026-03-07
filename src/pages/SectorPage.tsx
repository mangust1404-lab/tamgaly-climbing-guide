import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'

export function SectorPage() {
  const { sectorId } = useParams<{ sectorId: string }>()

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

  if (!sector) {
    return <div className="p-4 text-gray-400">Сектор не найден</div>
  }

  return (
    <div className="p-4">
      <Link to="/" className="text-blue-600 text-sm mb-2 inline-block">
        &larr; Назад
      </Link>
      <h1 className="text-2xl font-bold mb-1">{sector.name}</h1>
      {sector.orientation && (
        <p className="text-gray-500 text-sm mb-4">
          {sector.orientation}
          {sector.approachTimeMin && ` · ${sector.approachTimeMin} мин подход`}
        </p>
      )}
      {sector.approachDescription && (
        <p className="text-sm text-gray-600 mb-4">{sector.approachDescription}</p>
      )}

      {/* TODO: TopoViewer component here */}

      <h2 className="text-lg font-semibold mb-3">
        Маршруты {routes ? `(${routes.length})` : ''}
      </h2>

      {!routes || routes.length === 0 ? (
        <p className="text-gray-400 text-sm">Маршруты не загружены</p>
      ) : (
        <div className="space-y-1">
          {routes.map((route) => (
            <Link
              key={route.id}
              to={`/route/${route.id}`}
              className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors"
            >
              <span className="w-12 text-center text-sm font-mono font-bold text-blue-700 bg-blue-50 rounded px-2 py-1">
                {route.grade}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{route.name}</div>
                <div className="text-xs text-gray-400">
                  {route.routeType}
                  {route.lengthM && ` · ${route.lengthM}м`}
                  {route.pitches > 1 && ` · ${route.pitches} верёвок`}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
