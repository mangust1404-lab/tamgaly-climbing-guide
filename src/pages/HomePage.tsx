import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { cacheTopoPhotos, type DownloadProgress } from '../lib/offline/downloadManager'
import { gradeColor } from '../lib/utils'
import { useI18n } from '../lib/i18n'

const GRADE_SORT: Record<string, number> = {
  '4': 30, '4a': 40, '4b': 50, '4c': 60,
  '5a': 70, '5a+': 75, '5b': 85, '5b+': 90, '5c': 100, '5c+': 105,
  '6a': 120, '6a+': 135, '6b': 150, '6b+': 170, '6c': 190, '6c+': 210,
  '7a': 240, '7a+': 270, '7b': 300, '7b+': 340, '7c': 380, '7c+': 420,
  '8a': 470, '8a+': 520,
}

const GRADE_CHIPS = ['4', '5a', '5b', '5c', '6a', '6a+', '6b', '6b+', '6c', '6c+', '7a', '7a+', '7b', '7b+', '7c+', '8a']

export function HomePage() {
  const { t } = useI18n()
  const sectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())
  const routes = useLiveQuery(() => db.routes.toArray())
  const [dl, setDl] = useState<DownloadProgress | null>(null)
  const [search, setSearch] = useState('')
  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(new Set())

  const toggleGrade = (g: string) => {
    setSelectedGrades(prev => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })
  }

  // Search results (text search)
  const searchResults = useMemo(() => {
    if (!search.trim() || !routes || !sectors) return []
    const q = search.toLowerCase()
    const sectorMap = new Map(sectors.map(s => [s.id, s.name]))
    return routes
      .filter(r => r.name.toLowerCase().includes(q) || r.grade.toLowerCase().includes(q))
      .slice(0, 15)
      .map(r => ({ ...r, sectorName: sectorMap.get(r.sectorId) ?? '' }))
  }, [search, routes, sectors])

  // Grade filter results (when grade chips are selected)
  const gradeResults = useMemo(() => {
    if (selectedGrades.size === 0 || !routes || !sectors) return []
    const sectorMap = new Map(sectors.map(s => [s.id, s.name]))
    // Build a set of matching gradeSort values from selected grades
    const matchSorts = new Set<number>()
    for (const g of selectedGrades) {
      const sort = GRADE_SORT[g]
      if (sort) matchSorts.add(sort)
    }
    return routes
      .filter(r => matchSorts.has(r.gradeSort))
      .sort((a, b) => a.gradeSort - b.gradeSort)
      .map(r => ({ ...r, sectorName: sectorMap.get(r.sectorId) ?? '' }))
  }, [selectedGrades, routes, sectors])

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

  const handleCachePhotos = useCallback(async () => {
    try {
      await cacheTopoPhotos(setDl)
    } catch {
      // error already in dl state
    }
  }, [])

  // Auto-cache photos on first launch when online
  const topos = useLiveQuery(() => db.topos.count())
  useEffect(() => {
    if (topos && topos > 0 && !localStorage.getItem('photos-cached') && navigator.onLine) {
      cacheTopoPhotos(setDl).catch(() => {})
    }
  }, [topos])

  const showGradeResults = selectedGrades.size > 0 && !search.trim()
  const resultsToShow = search.trim() ? searchResults : gradeResults

  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="text-2xl font-bold">{t('home.title')}</h1>
        <Link to="/about" className="text-blue-600 text-xs">{t('home.aboutArea')}</Link>
      </div>
      <p className="text-gray-500 text-sm mb-4">{t('home.subtitle')}</p>

      <div className="flex gap-2 mb-4">
        <Link
          to="/map"
          className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-3 text-center text-sm font-medium"
        >
          {t('home.openMap')}
        </Link>
        <button
          onClick={handleCachePhotos}
          disabled={dl?.stage === 'fetching' || dl?.stage === 'saving'}
          className="flex-1 bg-gray-100 text-gray-700 rounded-lg px-4 py-3 text-sm font-medium disabled:opacity-50"
        >
          {dl?.stage === 'fetching' || dl?.stage === 'saving'
            ? t('home.downloading')
            : dl?.stage === 'done'
              ? t('home.updateData')
              : t('home.downloadOffline')}
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
      <div className="mb-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('home.searchPlaceholder')}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:border-blue-300 focus:outline-none transition-colors"
        />
      </div>

      {/* Grade filter chips */}
      <div className="flex gap-1 overflow-x-auto pb-3 -mx-1 px-1">
        {GRADE_CHIPS.map((g) => (
          <button
            key={g}
            onClick={() => toggleGrade(g)}
            className={`px-2.5 py-1 rounded-full text-xs font-mono font-medium whitespace-nowrap transition-colors ${
              selectedGrades.has(g)
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Search / grade filter results */}
      {resultsToShow.length > 0 && (search.trim() || showGradeResults) && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-500 mb-2">
            {search.trim() ? t('home.searchResults') : `${t('home.gradeFilterResults')} (${resultsToShow.length})`}
          </h2>
          <div className="space-y-1">
            {resultsToShow.map((r) => (
              <Link
                key={r.id}
                to={`/route/${r.id}`}
                className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-2.5 hover:border-blue-300 transition-colors"
              >
                <span className={`w-11 text-center text-xs font-mono font-bold rounded px-1.5 py-0.5 ${gradeColor(r.grade)}`}>
                  {r.grade}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="text-xs text-gray-400">{r.sectorName}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {showGradeResults && resultsToShow.length === 0 && (
        <p className="text-gray-400 text-sm mb-4">{t('home.noRoutesInRange')}</p>
      )}

      <h2 className="text-lg font-semibold mb-3">{t('home.sectors')}</h2>

      {!sectors || sectors.length === 0 ? (
        <p className="text-gray-400 text-sm">{t('home.noData')}</p>
      ) : (
        <div className="space-y-2">
          {sectors.map((sector) => (
            <Link
              key={sector.id}
              to={`/sector/${sector.id}`}
              className="flex gap-3 bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors"
            >
              {sector.coverImageUrl && (
                <img
                  src={sector.coverImageUrl}
                  alt={sector.name}
                  className="w-16 h-16 rounded object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">{sector.name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {gradeRanges.get(sector.id) && (
                      <span className="text-xs font-mono text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">
                        {gradeRanges.get(sector.id)}
                      </span>
                    )}
                    {routeCounts.get(sector.id) && (
                      <span className="text-xs text-gray-400">
                        {routeCounts.get(sector.id)} {t('home.routesShort')}
                      </span>
                    )}
                  </div>
                </div>
                {sector.orientation && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    {sector.orientation}
                    {sector.approachTimeMin && ` · ${sector.approachTimeMin} ${t('home.approachMin')}`}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
