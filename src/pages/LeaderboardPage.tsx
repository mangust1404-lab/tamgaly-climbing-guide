import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { calculateTotalScore, calculatePoints } from '../lib/scoring/points'
import { useI18n } from '../lib/i18n'
import { gradeColor } from '../lib/utils'

type Period = 'all' | 'month' | 'week'

export function LeaderboardPage() {
  const { t, td } = useI18n()
  const [period, setPeriod] = useState<Period>('all')
  const [expandedName, setExpandedName] = useState<string | null>(null)

  const ascents = useLiveQuery(() =>
    db.ascents.toArray().then(all => all.filter(a => a.style !== 'attempt' && a.style !== 'toprope')),
  )

  const routes = useLiveQuery(() => db.routes.toArray())
  const users = useLiveQuery(() => db.users.toArray())

  const leaderboard = useMemo(() => {
    if (!ascents) return []

    const now = Date.now()
    const filtered = ascents.filter((a) => {
      if (period === 'all') return true
      const date = new Date(a.date).getTime()
      if (period === 'week') return now - date < 7 * 86400000
      if (period === 'month') return now - date < 30 * 86400000
      return true
    })

    // Group by userId
    const byUser = new Map<string, typeof filtered>()
    for (const a of filtered) {
      const arr = byUser.get(a.userId) || []
      arr.push(a)
      byUser.set(a.userId, arr)
    }

    const routeMap = new Map(routes?.map(r => [r.id, r]) ?? [])

    const entries = Array.from(byUser.entries()).map(([userId, userAscents]) => {
      // Deduplicate: keep only best ascent per route name (highest points)
      // Use route name as key because same route may have different IDs across syncs
      const bestPerRoute = new Map<string, typeof userAscents[number]>()
      for (const a of userAscents) {
        const route = routeMap.get(a.routeId)
        const routeKey = route?.name || a.routeId
        const pts = route ? calculatePoints(route.grade, a.style as any) : a.points
        const existing = bestPerRoute.get(routeKey)
        if (!existing) {
          bestPerRoute.set(routeKey, a)
        } else {
          const existingRoute = routeMap.get(existing.routeId)
          const existingPts = existingRoute ? calculatePoints(existingRoute.grade, existing.style as any) : existing.points
          if (pts > existingPts) bestPerRoute.set(routeKey, a)
        }
      }
      const uniqueAscents = [...bestPerRoute.values()]

      // Recalculate points locally from route grades (authoritative)
      const points = uniqueAscents.map((a) => {
        const route = routeMap.get(a.routeId)
        return route ? calculatePoints(route.grade, a.style as any) : a.points
      })
      const totalScore = calculateTotalScore(points)
      const user = users?.find((u) => u.id === userId)

      // Best grade (highest gradeSort among ascents)
      const bestGradeAscent = uniqueAscents.reduce((b, a) => {
        const bRoute = routeMap.get(b.routeId)
        const aRoute = routeMap.get(a.routeId)
        const bSort = bRoute?.gradeSort ?? 0
        const aSort = aRoute?.gradeSort ?? 0
        return aSort > bSort ? a : b
      }, uniqueAscents[0])
      const bestRoute = routeMap.get(bestGradeAscent.routeId)

      // Ascent details for expanded view
      const details = uniqueAscents
        .map(a => {
          const route = routeMap.get(a.routeId)
          const pts = route ? calculatePoints(route.grade, a.style as any) : a.points
          return { routeId: a.routeId, routeName: route ? td(route.name) : a.routeId, grade: route?.grade || '?', gradeSort: route?.gradeSort ?? 0, style: a.style, points: pts }
        })
        .sort((a, b) => b.points - a.points)

      return {
        userId,
        displayName: user?.displayName || t('leaderboard.climber'),
        totalScore,
        ascentCount: uniqueAscents.length,
        bestGrade: bestRoute?.grade || '?',
        bestStyle: bestGradeAscent.style,
        details,
      }
    })

    // Merge entries with the same displayName (same person, different devices)
    // Also deduplicate across devices: same route from different userIds counts once
    const merged = new Map<string, typeof entries[number]>()
    for (const e of entries) {
      const existing = merged.get(e.displayName)
      if (existing) {
        // Merge details, deduplicating by route (keep best points)
        for (const d of e.details) {
          const dup = existing.details.find(x => x.routeName === d.routeName)
          if (dup) {
            if (d.points > dup.points) Object.assign(dup, d)
          } else {
            existing.details.push(d)
          }
        }
        existing.details.sort((a, b) => b.points - a.points)
        existing.totalScore = calculateTotalScore(existing.details.map(d => d.points))
        existing.ascentCount = existing.details.length
        // Recalculate bestGrade from merged details (highest gradeSort)
        const hardest = existing.details.reduce((best, d) => d.gradeSort > best.gradeSort ? d : best, existing.details[0])
        existing.bestGrade = hardest?.grade || '?'
      } else {
        merged.set(e.displayName, { ...e })
      }
    }

    return [...merged.values()].sort((a, b) => b.totalScore - a.totalScore)
  }, [ascents, users, routes, period, t])

  const PERIOD_OPTIONS: [Period, string][] = [
    ['all', t('leaderboard.allTime')],
    ['month', t('leaderboard.month')],
    ['week', t('leaderboard.week')],
  ]

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">{t('leaderboard.title')}</h1>

      {/* Period filter */}
      <div className="flex gap-1 mb-4">
        {PERIOD_OPTIONS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              period === key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {leaderboard.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🏆</p>
          <p className="text-sm">{t('leaderboard.noAscents')}</p>
          <p className="text-xs mt-1">{t('leaderboard.noAscentsHint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((entry, idx) => {
            const isExpanded = expandedName === entry.displayName
            return (
              <div key={entry.userId}>
                <div
                  onClick={() => setExpandedName(isExpanded ? null : entry.displayName)}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer ${
                    idx === 0
                      ? 'bg-yellow-50 border border-yellow-200'
                      : idx === 1
                        ? 'bg-gray-50 border border-gray-200'
                        : idx === 2
                          ? 'bg-orange-50 border border-orange-200'
                          : 'bg-white border border-gray-100'
                  }`}
                >
                  {/* Rank */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    idx === 0 ? 'bg-yellow-400 text-white' :
                    idx === 1 ? 'bg-gray-400 text-white' :
                    idx === 2 ? 'bg-orange-400 text-white' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {idx + 1}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {entry.displayName}
                    </div>
                    <div className="text-xs text-gray-400">
                      {entry.ascentCount} {t('leaderboard.ascents')}
                      {' · '}{t('leaderboard.best')} {entry.bestGrade}
                    </div>
                  </div>

                  {/* Score */}
                  <div className="text-right">
                    <div className="font-bold text-blue-600">{entry.totalScore}</div>
                    <div className="text-[10px] text-gray-400">{t('leaderboard.points')}</div>
                  </div>

                  <span className={`text-gray-400 text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                </div>

                {isExpanded && (
                  <div className="ml-11 mt-1 space-y-1">
                    {entry.details.map((d, i) => (
                      <Link key={i} to={`/route/${d.routeId}`} className="flex items-center gap-2 text-xs py-1 px-2 bg-gray-50 rounded hover:bg-blue-50 active:bg-blue-100">
                        <span className={`font-mono font-bold rounded px-1 py-0.5 ${gradeColor(d.grade)}`}>{d.grade}</span>
                        <span className="flex-1 truncate text-gray-700">{d.routeName}</span>
                        <span className="text-gray-400">{d.style}</span>
                        <span className="font-medium text-blue-600">+{d.points}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
