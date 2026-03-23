import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { refreshTopoData, type DownloadProgress } from '../lib/offline/downloadManager'
import { gradeColor, sunHours } from '../lib/utils'
import { useI18n } from '../lib/i18n'
import { useUser } from '../lib/userContext'
import { SuggestNewSector } from '../components/suggest/SuggestNewSector'

const GRADE_SORT: Record<string, number> = {
  '4': 30, '4a': 40, '4b': 50, '4c': 60,
  '5a': 70, '5a+': 75, '5b': 85, '5b+': 90, '5c': 100, '5c+': 105,
  '6a': 120, '6a+': 135, '6b': 150, '6b+': 170, '6c': 190, '6c+': 210,
  '7a': 240, '7a+': 270, '7b': 300, '7b+': 340, '7c': 380, '7c+': 420,
  '8a': 470, '8a+': 520,
}

const GRADE_CHIPS = ['4', '5a', '5b', '5c', '6a', '6a+', '6b', '6b+', '6c', '6c+', '7a', '7a+', '7b', '7b+', '7c+', '8a']

type SunFilter = 'morning' | 'afternoon' | 'allday'

function sunCategory(_sunExposure?: string, sunFrom?: number, sunTo?: number): SunFilter | null {
  // Only use numeric sunFrom/sunTo — ignore text
  if (sunFrom == null && sunTo == null) return null
  const from = sunFrom ?? 0
  const to = sunTo ?? 24
  const morningH = Math.max(0, Math.min(12, to) - from)
  const afternoonH = Math.max(0, to - Math.max(12, from))
  if (afternoonH === 0) return 'morning'
  if (morningH === 0) return 'afternoon'
  if (afternoonH > morningH * 2) return 'afternoon'
  if (morningH > afternoonH * 2) return 'morning'
  return 'allday'
}

export function HomePage() {
  const { t, td } = useI18n()
  const { user } = useUser()
  const sectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())
  const routes = useLiveQuery(() => db.routes.toArray())

  // Set of route IDs the current user has climbed (scored styles)
  const climbedRouteIds = useLiveQuery(
    async () => {
      if (!user?.id) return new Set<string>()
      const ascents = await db.ascents.where('userId').equals(user.id).toArray()
      const scored = ascents.filter(a => ['onsight', 'flash', 'redpoint'].includes(a.style))
      return new Set(scored.map(a => a.routeId))
    },
    [user?.id],
  )
  const [dl, setDl] = useState<DownloadProgress | null>(null)
  const [search, setSearch] = useState('')
  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(new Set())
  const [topoLoadProgress, setTopoLoadProgress] = useState<{ percent: number; message: string } | null>(null)
  const [sunFilter, setSunFilter] = useState<SunFilter | null>(null)
  const [sunMode, setSunMode] = useState<'sun' | 'shade'>('sun') // sun = where sun IS, shade = where sun ISN'T
  const [maxRopeLength, setMaxRopeLength] = useState<number | null>(null)
  const [routeTypeFilter, setRouteTypeFilter] = useState<string | null>(null) // 'multi-pitch' | 'trad' | null

  const toggleGrade = (g: string) => {
    setSelectedGrades(prev => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })
  }

  // Build sector map and sun category map for reuse
  const sectorMap = useMemo(() => {
    if (!sectors) return new Map<string, typeof sectors[0]>()
    return new Map(sectors.map(s => [s.id, s]))
  }, [sectors])

  const sectorSunMap = useMemo(() => {
    const m = new Map<string, SunFilter | null>()
    sectors?.forEach(s => m.set(s.id, sunCategory(s.sunExposure, s.sunFrom, s.sunTo)))
    return m
  }, [sectors])

  // Combined filter: search + grade + rope + route type — all applied with AND logic
  // Sun filter works at sector level (filters sectors, not routes directly)
  const hasRouteFilters = selectedGrades.size > 0 || maxRopeLength !== null || routeTypeFilter !== null
  const hasActiveFilters = hasRouteFilters || search.trim().length > 0

  const filteredRoutes = useMemo(() => {
    if (!hasActiveFilters || !routes || !sectors) return []

    const q = search.trim().toLowerCase()

    // Build grade filter set
    const matchSorts = new Set<number>()
    for (const g of selectedGrades) {
      const sort = GRADE_SORT[g]
      if (sort) matchSorts.add(sort)
    }

    // Sun filter: determine which sector IDs pass
    let sunPassSectors: Set<string> | null = null
    if (sunFilter) {
      sunPassSectors = new Set<string>()
      for (const s of sectors) {
        const cat = sectorSunMap.get(s.id)
        if (sunMode === 'sun') {
          if (cat === null) continue
          if (cat === sunFilter) sunPassSectors.add(s.id)
        } else {
          if (cat === null) { if (sunFilter === 'allday') sunPassSectors.add(s.id); continue }
          if (cat === 'allday') continue
          if (sunFilter === 'allday') continue
          if (cat !== sunFilter) sunPassSectors.add(s.id)
        }
      }
    }

    return routes
      .filter(r => {
        // Text search
        if (q && !r.name.toLowerCase().includes(q) && !r.grade.toLowerCase().includes(q)) return false
        // Grade filter
        if (matchSorts.size > 0 && !matchSorts.has(r.gradeSort)) return false
        // Route type filter
        if (routeTypeFilter && r.routeType !== routeTypeFilter) return false
        // Rope length filter
        if (maxRopeLength) {
          const height = r.ropeLength ?? r.lengthM ?? null
          if (height == null) return false
          if (height * 2 + 2 > maxRopeLength) return false
        }
        // Sun filter (sector-level)
        if (sunPassSectors && !sunPassSectors.has(r.sectorId)) return false
        return true
      })
      .sort((a, b) => a.gradeSort - b.gradeSort)
      .slice(0, q ? 30 : 999)
      .map(r => ({ ...r, sectorName: sectorMap.get(r.sectorId)?.name ?? '' }))
  }, [hasActiveFilters, search, selectedGrades, routeTypeFilter, maxRopeLength, sunFilter, sunMode, routes, sectors, sectorMap, sectorSunMap])

  // Count ascents per sector for sorting
  const ascents = useLiveQuery(() => db.ascents.toArray())
  const sectorAscentCounts = useMemo(() => {
    const counts = new Map<string, number>()
    if (!ascents || !routes) return counts
    const routeSector = new Map(routes.map(r => [r.id, r.sectorId]))
    for (const a of ascents) {
      const sid = routeSector.get(a.routeId)
      if (sid) counts.set(sid, (counts.get(sid) || 0) + 1)
    }
    return counts
  }, [ascents, routes])

  // Filtered sectors (sun/shade filter applies at sector level)
  const filteredSectors = useMemo(() => {
    let list = sectors ?? []
    if (sunFilter) {
      list = list.filter(s => {
        const cat = sectorSunMap.get(s.id)
        if (sunMode === 'sun') {
          if (cat === null) return false // unknown sun = exclude
          return cat === sunFilter
        }
        // shade mode
        if (cat === null) return sunFilter === 'allday' // unknown = show only for "shade allday"
        if (cat === 'allday') return false // sun all day = no shade
        if (sunFilter === 'allday') return false // shade all day = only unknown sectors qualify
        return cat !== sunFilter // morning sun = afternoon shade, etc.
      })
    }
    // Sort by ascent count (most popular first), then by sortOrder
    return [...list].sort((a, b) => {
      const aCount = sectorAscentCounts.get(a.id) || 0
      const bCount = sectorAscentCounts.get(b.id) || 0
      if (bCount !== aCount) return bCount - aCount
      return (a.sortOrder || 0) - (b.sortOrder || 0)
    })
  }, [sunFilter, sectors, sectorSunMap, sunMode, sectorAscentCounts])

  // Count routes per sector (for sector list display)
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

  const handleRefresh = useCallback(async () => {
    try {
      await refreshTopoData(setDl)
    } catch {
      // error already in dl state
    }
  }, [])

  // Listen for topo data loading progress
  useEffect(() => {
    const handler = (e: Event) => {
      const { percent, message } = (e as CustomEvent).detail
      if (percent >= 100) setTopoLoadProgress(null)
      else setTopoLoadProgress({ percent, message })
    }
    window.addEventListener('topo-load-progress', handler)
    return () => window.removeEventListener('topo-load-progress', handler)
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

  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="text-2xl font-bold">{t('home.title')}</h1>
        <Link to="/about" className="text-blue-600 text-xs">{t('home.aboutArea')}</Link>
      </div>

      {topoLoadProgress && (
        <div className="mb-4 bg-blue-50 rounded-lg p-3">
          <div className="text-xs text-blue-700 mb-1">{topoLoadProgress.message}</div>
          <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${topoLoadProgress.percent}%` }} />
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <Link
          to="/map"
          className="flex-1 border border-gray-200 text-gray-700 rounded-lg px-4 py-3 text-center text-sm font-medium"
        >
          {t('home.openMap')}
        </Link>
        <button
          onClick={handleRefresh}
          disabled={dl?.stage === 'fetching' || dl?.stage === 'saving'}
          className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium disabled:opacity-50 relative ${
            dl?.stage === 'done'
              ? 'bg-green-500/30 text-green-800'
              : dl?.stage === 'error'
                ? 'bg-red-500/20 text-red-700'
                : 'bg-green-500/20 text-gray-700'
          }`}
        >
          {dl?.stage === 'fetching' || dl?.stage === 'saving'
            ? dl.message
            : dl?.stage === 'done'
              ? dl.message
              : dl?.stage === 'error'
                ? dl.message
                : t('home.downloadOffline')}
          {dl && (dl.stage === 'fetching' || dl.stage === 'saving') && (
            <span className="absolute bottom-0 left-0 right-0 h-1 bg-blue-100 rounded-b-lg overflow-hidden">
              <span
                className="block h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${dl.percent}%` }}
              />
            </span>
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

      {/* Search + clear */}
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('home.searchPlaceholder')}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:border-blue-300 focus:outline-none transition-colors"
        />
        {(hasActiveFilters || sunFilter) && (
          <button
            onClick={() => { setSelectedGrades(new Set()); setSunFilter(null); setMaxRopeLength(null); setRouteTypeFilter(null); setSearch('') }}
            className="px-3 py-2 rounded-lg text-xs text-red-500 bg-red-50 hover:bg-red-100 whitespace-nowrap font-medium"
          >
            {'\u2715'} {t('home.clearFilters')}
          </button>
        )}
      </div>

      {/* Grade filter chips */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1">
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

      {/* Sun/shade + rope filters */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
          <div className="flex-shrink-0 flex rounded-full border border-gray-200 overflow-hidden">
            <button
              onClick={() => setSunMode('sun')}
              className={`px-2 py-1 text-xs font-medium flex items-center gap-1 transition-colors ${
                sunMode === 'sun' ? 'bg-yellow-400 text-yellow-900' : 'bg-white text-gray-400'
              }`}
            >
              <img src="/icons/sun.svg" alt="" className="h-3 w-3" />
              {t('home.filterSun')}
            </button>
            <button
              onClick={() => setSunMode('shade')}
              className={`px-2 py-1 text-xs font-medium flex items-center gap-1 transition-colors ${
                sunMode === 'shade' ? 'bg-gray-700 text-white' : 'bg-white text-gray-400'
              }`}
            >
              {t('home.filterShade')}
            </button>
          </div>
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
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
          <img src="/icons/rope.png" alt="" className="h-4 w-auto flex-shrink-0" />
          {[40, 50, 60, 80].map(len => (
            <button
              key={len}
              onClick={() => setMaxRopeLength(prev => prev === len ? null : len)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                maxRopeLength === len ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {'\u2264'}{len}{t('route.meters')}
            </button>
          ))}
          {(['multi-pitch', 'trad'] as const).map(type => (
            <button
              key={type}
              onClick={() => setRouteTypeFilter(prev => prev === type ? null : type)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                routeTypeFilter === type ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t(type === 'multi-pitch' ? 'home.filterMultipitch' : 'home.filterTrad')}
            </button>
          ))}
        </div>
      </div>

      {/* Filtered routes (when any filter or search is active) */}
      {hasActiveFilters && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-500 mb-2">
            {t('home.gradeFilterResults')} ({filteredRoutes.length})
          </h2>
          {filteredRoutes.length > 0 ? (
            <RouteList routes={filteredRoutes} climbedIds={climbedRouteIds} td={td} />
          ) : (
            <p className="text-gray-400 text-sm">{t('home.noRoutesInRange')}</p>
          )}
        </div>
      )}

      {/* Sector list (when no filters active) */}
      {!hasActiveFilters && (
        <>
          <h2 className="text-lg font-semibold mb-3">
            {t('home.sectors')}
            {sunFilter && ` (${filteredSectors.length})`}
          </h2>
          {filteredSectors.length === 0 ? (
            <p className="text-gray-400 text-sm">{t('home.noData')}</p>
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
                    {(sector.orientation || sector.sunExposure || sector.sunFrom || sector.approachTimeMin) && (
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                        {(sector.sunFrom || sector.sunExposure) && (
                          <span className="inline-flex items-center gap-0.5" title={sector.sunExposure ? td(sector.sunExposure, sector, 'sunExposure') : ''}>
                            <img src="/icons/sun.svg" alt="" className="h-3.5 w-3.5 inline opacity-60" />
                            <span>{sector.sunFrom && sector.sunTo ? `${sector.sunFrom}:00–${sector.sunTo}:00` : sunHours(sector.sunExposure)}</span>
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

          {/* Suggest new sector */}
          <div className="mt-4">
            <SuggestNewSector />
          </div>
        </>
      )}
    </div>
  )
}

function RouteList({ routes, climbedIds, td }: {
  routes: Array<{ id: string; grade: string; name: string; sectorName: string }>
  climbedIds?: Set<string>
  td: (s: string, obj?: Record<string, any>, field?: string) => string
}) {
  return (
    <div className="space-y-1">
      {routes.map((r) => (
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
          {climbedIds?.has(r.id) && (
            <span className="w-5 h-5 rounded-full bg-green-100 text-green-700 text-[10px] flex items-center justify-center flex-shrink-0">✓</span>
          )}
        </Link>
      ))}
    </div>
  )
}
