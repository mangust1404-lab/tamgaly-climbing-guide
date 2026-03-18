import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { refreshTopoData, type DownloadProgress } from '../lib/offline/downloadManager'
import { gradeColor, sunHours } from '../lib/utils'
import { useI18n } from '../lib/i18n'

const GRADE_SORT: Record<string, number> = {
  '4': 30, '4a': 40, '4b': 50, '4c': 60,
  '5a': 70, '5a+': 75, '5b': 85, '5b+': 90, '5c': 100, '5c+': 105,
  '6a': 120, '6a+': 135, '6b': 150, '6b+': 170, '6c': 190, '6c+': 210,
  '7a': 240, '7a+': 270, '7b': 300, '7b+': 340, '7c': 380, '7c+': 420,
  '8a': 470, '8a+': 520,
}

const GRADE_CHIPS = ['4', '5a', '5b', '5c', '6a', '6a+', '6b', '6b+', '6c', '6c+', '7a', '7a+', '7b', '7b+', '7c+', '8a']

type SunFilter = 'morning' | 'afternoon' | 'allday'

function sunCategory(sunExposure?: string): SunFilter | null {
  if (!sunExposure) return null
  if (sunExposure.includes('Утром') || sunExposure.includes('Первое солнце')) return 'morning'
  if (sunExposure.includes('После обеда')) return 'afternoon'
  if (sunExposure.includes('Весь день') || sunExposure.includes('Днём')) return 'allday'
  return null // mixed sectors match any filter
}

export function HomePage() {
  const { t, td } = useI18n()
  const sectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())
  const routes = useLiveQuery(() => db.routes.toArray())
  const [dl, setDl] = useState<DownloadProgress | null>(null)
  const [search, setSearch] = useState('')
  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(new Set())
  const [sunFilter, setSunFilter] = useState<SunFilter | null>(null)
  const [sunMode, setSunMode] = useState<'sun' | 'shade'>('sun') // sun = where sun IS, shade = where sun ISN'T
  const [maxRopeLength, setMaxRopeLength] = useState<number | null>(null)

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

  // Filter sectors by sun exposure and max rope length
  const filteredSectors = useMemo(() => {
    if (!sectors) return []
    let result = sectors
    if (sunFilter) {
      result = result.filter(s => {
        const cat = sunCategory(s.sunExposure)
        if (cat === null) return true // mixed sectors (Zamanka) always shown
        if (sunMode === 'sun') return cat === sunFilter
        // shade mode: show sectors where sun is NOT at that time
        return cat !== sunFilter && cat !== 'allday'
      })
    }
    if (maxRopeLength && routes) {
      // Only show sectors that have at least one route fitting in the rope length
      const sectorIdsWithFittingRoutes = new Set<string>()
      for (const r of routes) {
        if (r.lengthM && r.lengthM <= maxRopeLength) {
          sectorIdsWithFittingRoutes.add(r.sectorId)
        }
      }
      result = result.filter(s => sectorIdsWithFittingRoutes.has(s.id))
    }
    return result
  }, [sectors, routes, sunFilter, sunMode, maxRopeLength])

  const hasActiveFilters = sunFilter !== null || maxRopeLength !== null

  const handleRefresh = useCallback(async () => {
    try {
      await refreshTopoData(setDl)
    } catch {
      // error already in dl state
    }
  }, [])

  // PWA install prompt
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setIsInstalled(true))
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const result = await installPrompt.userChoice
    if (result.outcome === 'accepted') setIsInstalled(true)
    setInstallPrompt(null)
  }

  const showGradeResults = selectedGrades.size > 0 && !search.trim()
  const resultsToShow = search.trim() ? searchResults : gradeResults

  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="text-2xl font-bold">{t('home.title')}</h1>
        <Link to="/about" className="text-blue-600 text-xs">{t('home.aboutArea')}</Link>
      </div>
      {/* subtitle removed — info is on About page */}

      <div className="flex gap-2 mb-4">
        <Link
          to="/map"
          className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-3 text-center text-sm font-medium"
        >
          {t('home.openMap')}
        </Link>
        <button
          onClick={handleRefresh}
          disabled={dl?.stage === 'fetching' || dl?.stage === 'saving'}
          className="flex-1 bg-gray-100 text-gray-700 rounded-lg px-4 py-3 text-sm font-medium disabled:opacity-50 relative"
        >
          {dl?.stage === 'fetching' || dl?.stage === 'saving'
            ? t('home.downloading')
            : dl?.stage === 'done'
              ? t('home.updateData')
              : t('home.downloadOffline')}
          {dl && dl.stage !== 'error' && dl.stage !== 'done' && (
            <span className="absolute bottom-0 left-0 right-0 h-1 bg-blue-100 rounded-b-lg overflow-hidden">
              <span
                className="block h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${dl.percent}%` }}
              />
            </span>
          )}
          {dl?.stage === 'done' && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
          )}
        </button>
      </div>

      {/* Install PWA button */}
      {installPrompt && !isInstalled && (
        <button
          onClick={handleInstall}
          className="w-full mb-4 bg-green-600 text-white rounded-lg px-4 py-3 text-sm font-medium flex items-center justify-center gap-2"
        >
          {t('home.installApp')}
        </button>
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
                  <div className="text-sm font-medium truncate">{td(r.name)}</div>
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

      {/* Sector filters: 3 rows — sun, rope, clear */}
      <div className="space-y-1.5 mb-2">
        {/* Row 1: Sun/shade toggle + time filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1">
          <button
            onClick={() => setSunMode(m => m === 'sun' ? 'shade' : 'sun')}
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm border border-gray-200"
            title={sunMode === 'sun' ? t('home.filterSun') : t('home.filterShade')}
          >
            {sunMode === 'sun' ? '☀️' : '🌑'}
          </button>
          {([['morning', t('home.sunMorning')], ['afternoon', t('home.sunAfternoon')], ['allday', t('home.sunAllDay')]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSunFilter(prev => prev === key ? null : key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                sunFilter === key
                  ? (sunMode === 'sun' ? 'bg-yellow-500 text-white' : 'bg-gray-700 text-white')
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Row 2: Rope length filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1">
          <img src="/icons/rope.png" alt="" className="h-4 w-auto flex-shrink-0" />
          {[40, 50, 60, 80].map(len => (
            <button
              key={len}
              onClick={() => setMaxRopeLength(prev => prev === len ? null : len)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                maxRopeLength === len ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              ≤{len}{t('route.meters')}
            </button>
          ))}
          {hasActiveFilters && (
            <button
              onClick={() => { setSunFilter(null); setMaxRopeLength(null) }}
              className="px-2 py-1 rounded-full text-xs text-red-500 hover:bg-red-50 whitespace-nowrap"
            >
              ✕ {t('home.clearFilters')}
            </button>
          )}
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-3">{t('home.sectors')}</h2>

      {!sectors || sectors.length === 0 ? (
        <p className="text-gray-400 text-sm">{t('home.noData')}</p>
      ) : filteredSectors.length === 0 ? (
        <p className="text-gray-400 text-sm">{t('home.noSectorsMatch')}</p>
      ) : (
        <div className="space-y-2">
          {filteredSectors.map((sector) => (
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
                  <span className="font-medium truncate">{td(sector.name)}</span>
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
                {(sector.orientation || sector.sunExposure || sector.approachTimeMin) && (
                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                    {sector.sunExposure && (
                      <span className="inline-flex items-center gap-0.5" title={td(sector.sunExposure)}>
                        <img src="/icons/sun.png" alt="" className="h-3.5 w-3.5 inline opacity-60" />
                        <span>{sunHours(sector.sunExposure)}</span>
                      </span>
                    )}
                    {sector.approachTimeMin && (
                      <span className="inline-flex items-center gap-0.5">
                        <img src="/icons/walking.png" alt="" className="h-3.5 w-3.5 inline opacity-60" />
                        <span>{sector.approachTimeMin} {t('sector.min')}</span>
                      </span>
                    )}
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
