import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { downloadArea, type DownloadProgress } from '../lib/offline/downloadManager'
import { gradeColor } from '../lib/utils'

const AREA_ID = 'tamgaly-tas'

export function HomePage() {
  const area = useLiveQuery(() => db.areas.get(AREA_ID))
  const sectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())
  const routes = useLiveQuery(() => db.routes.toArray())
  const ascents = useLiveQuery(() => db.ascents.toArray())
  const [dl, setDl] = useState<DownloadProgress | null>(null)
  const [search, setSearch] = useState('')

  // Search results
  const searchResults = useMemo(() => {
    if (!search.trim() || !routes || !sectors) return []
    const q = search.toLowerCase()
    const sectorMap = new Map(sectors.map(s => [s.id, s.name]))
    return routes
      .filter(r => r.name.toLowerCase().includes(q) || r.grade.toLowerCase().includes(q))
      .slice(0, 15)
      .map(r => ({ ...r, sectorName: sectorMap.get(r.sectorId) ?? '' }))
  }, [search, routes, sectors])

  // Count routes per sector
  const routeCounts = new Map<string, number>()
  routes?.forEach((r) => {
    routeCounts.set(r.sectorId, (routeCounts.get(r.sectorId) || 0) + 1)
  })

  // Grade range per sector
  const gradeRanges = new Map<string, string>()
  if (routes) {
    const bySector = new Map<string, { min: number; max: number; minG: string; maxG: string }>()
    for (const r of routes) {
      const cur = bySector.get(r.sectorId)
      if (!cur) {
        bySector.set(r.sectorId, { min: r.gradeSort, max: r.gradeSort, minG: r.grade, maxG: r.grade })
      } else {
        if (r.gradeSort < cur.min) { cur.min = r.gradeSort; cur.minG = r.grade }
        if (r.gradeSort > cur.max) { cur.max = r.gradeSort; cur.maxG = r.grade }
      }
    }
    for (const [sid, { minG, maxG }] of bySector) {
      gradeRanges.set(sid, minG === maxG ? minG : `${minG}—${maxG}`)
    }
  }

  const handleDownload = useCallback(async () => {
    try {
      await downloadArea(AREA_ID, setDl)
    } catch {
      // error already in dl state
    }
  }, [])

  const totalRoutes = routes?.length ?? 0
  const totalSectors = sectors?.length ?? 0
  const myAscents = ascents?.length ?? 0

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-1">Тамгалы-Тас</h1>
      <p className="text-gray-500 text-sm mb-4">
        {area?.description || 'Скалолазный район, 120 км от Алматы'}
      </p>

      {/* Stats row */}
      {totalRoutes > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-blue-700">{totalRoutes}</div>
            <div className="text-xs text-blue-600">маршрутов</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-green-700">{totalSectors}</div>
            <div className="text-xs text-green-600">секторов</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-purple-700">{myAscents}</div>
            <div className="text-xs text-purple-600">пролазов</div>
          </div>
        </div>
      )}

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

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск маршрута..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:border-blue-300 focus:outline-none transition-colors"
        />
      </div>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-500 mb-2">Результаты поиска</h2>
          <div className="space-y-1">
            {searchResults.map((r) => (
              <Link
                key={r.id}
                to={`/route/${r.id}`}
                className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors"
              >
                <span className={`w-12 text-center text-sm font-mono font-bold rounded px-2 py-1 ${gradeColor(r.grade)}`}>
                  {r.grade}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-xs text-gray-400">{r.sectorName}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <h2 className="text-lg font-semibold mb-3">Секторы</h2>

      {!sectors || sectors.length === 0 ? (
        <p className="text-gray-400 text-sm">
          Данные ещё не загружены. Подождите пару секунд или нажмите «Скачать офлайн».
        </p>
      ) : (
        <div className="space-y-2">
          {sectors.map((sector) => (
            <Link
              key={sector.id}
              to={`/sector/${sector.id}`}
              className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{sector.name}</span>
                <div className="flex items-center gap-2">
                  {gradeRanges.get(sector.id) && (
                    <span className="text-xs font-mono text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">
                      {gradeRanges.get(sector.id)}
                    </span>
                  )}
                  {routeCounts.get(sector.id) && (
                    <span className="text-xs text-gray-400">
                      {routeCounts.get(sector.id)} маршр.
                    </span>
                  )}
                </div>
              </div>
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
