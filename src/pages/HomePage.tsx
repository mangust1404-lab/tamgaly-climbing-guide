import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'

export function HomePage() {
  const sectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-1">Тамгалы-Тас</h1>
      <p className="text-gray-500 text-sm mb-4">
        Скалолазный район, 120 км от Алматы
      </p>

      <div className="flex gap-2 mb-6">
        <Link
          to="/map"
          className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-3 text-center text-sm font-medium"
        >
          Открыть карту
        </Link>
        <button className="flex-1 bg-gray-100 text-gray-700 rounded-lg px-4 py-3 text-sm font-medium">
          Скачать офлайн
        </button>
      </div>

      <h2 className="text-lg font-semibold mb-3">Секторы</h2>

      {!sectors || sectors.length === 0 ? (
        <p className="text-gray-400 text-sm">
          Данные ещё не загружены. Нажми «Скачать офлайн» для загрузки.
        </p>
      ) : (
        <div className="space-y-2">
          {sectors.map((sector) => (
            <Link
              key={sector.id}
              to={`/sector/${sector.id}`}
              className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
            >
              <div className="font-medium">{sector.name}</div>
              {sector.orientation && (
                <div className="text-xs text-gray-400 mt-1">
                  {sector.orientation}
                  {sector.approachTimeMin && ` · ${sector.approachTimeMin} мин подход`}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
