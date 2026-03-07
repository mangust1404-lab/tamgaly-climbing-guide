import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { downloadArea, type DownloadProgress } from '../lib/offline/downloadManager'

const AREA_ID = 'tamgaly-tas'

export function HomePage() {
  const sectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())
  const [dl, setDl] = useState<DownloadProgress | null>(null)

  const handleDownload = useCallback(async () => {
    try {
      await downloadArea(AREA_ID, setDl)
    } catch {
      // error already in dl state
    }
  }, [])

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
        <button
          onClick={handleDownload}
          disabled={dl?.stage === 'fetching' || dl?.stage === 'saving'}
          className="flex-1 bg-gray-100 text-gray-700 rounded-lg px-4 py-3 text-sm font-medium disabled:opacity-50"
        >
          {dl?.stage === 'fetching' || dl?.stage === 'saving'
            ? 'Загрузка...'
            : dl?.stage === 'done'
              ? 'Обновить данные'
              : 'Скачать офлайн'}
        </button>
      </div>

      {dl && (
        <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${
          dl.stage === 'error' ? 'bg-red-50 text-red-700' :
          dl.stage === 'done' ? 'bg-green-50 text-green-700' :
          'bg-blue-50 text-blue-700'
        }`}>
          <p>{dl.message}</p>
          {dl.stage !== 'error' && dl.stage !== 'done' && (
            <div className="mt-1 h-1.5 bg-blue-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${dl.percent}%` }}
              />
            </div>
          )}
        </div>
      )}

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
