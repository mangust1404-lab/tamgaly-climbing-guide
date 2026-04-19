import { useState, useMemo, useEffect } from 'react'
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
  const [showAchDetail, setShowAchDetail] = useState<string | null>(null)
  const [zoomedAvatar, setZoomedAvatar] = useState<string | null>(null)

  // Load avatars and achievements from server
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({})
  const [achievementMap, setAchievementMap] = useState<Record<string, Array<{ type: string; name: string }>>>({})

  useEffect(() => {
    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    fetch(`${API_BASE}/sync/users`).then(r => r.json()).then((users: any[]) => {
      const map: Record<string, string> = {}
      const t = Date.now()
      for (const u of users) { if (u.avatar_url) map[u.id] = u.avatar_url + '?t=' + t }
      setAvatarMap(map)
    }).catch(() => {})
    fetch(`${API_BASE}/sync/achievements`).then(r => r.json()).then(async (achs: any[]) => {
      const map: Record<string, Array<{ type: string; name: string }>> = {}
      for (const a of achs) {
        if (!map[a.user_id]) map[a.user_id] = []
        map[a.user_id].push({ type: a.type, name: a.name })
        // Save to local IndexedDB so profile page can display them
        try {
          await db.achievements.put({
            id: a.id,
            userId: a.user_id,
            type: a.type,
            name: a.name,
            description: a.name,
            earnedAt: a.earned_at,
            syncStatus: 'synced',
          })
        } catch {}
      }
      setAchievementMap(map)
    }).catch(() => {})
  }, [])

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

    const SCORED_STYLES = ['onsight', 'flash', 'redpoint']
    const entries = Array.from(byUser.entries()).map(([userId, userAscents]) => {
      // Deduplicate: keep only FIRST scored ascent per route (earliest date)
      // Use route name as key because same route may have different IDs across syncs
      const firstPerRoute = new Map<string, typeof userAscents[number]>()
      for (const a of userAscents) {
        if (!SCORED_STYLES.includes(a.style)) continue
        const route = routeMap.get(a.routeId)
        const routeKey = route?.name || a.routeId
        const existing = firstPerRoute.get(routeKey)
        if (!existing || a.date < existing.date) {
          firstPerRoute.set(routeKey, a)
        }
      }
      const uniqueAscents = [...firstPerRoute.values()]

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
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    idx === 0 ? 'bg-yellow-400 text-white' :
                    idx === 1 ? 'bg-gray-400 text-white' :
                    idx === 2 ? 'bg-orange-400 text-white' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {idx + 1}
                  </div>

                  {/* Avatar */}
                  {avatarMap[entry.userId] && (
                    <img
                      src={avatarMap[entry.userId]}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                      onClick={(e) => { e.stopPropagation(); setZoomedAvatar(avatarMap[entry.userId]) }}
                    />
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{entry.displayName}</div>
                    {/* Achievement badges */}
                    {achievementMap[entry.userId]?.length > 0 && (
                      <div
                        className="flex flex-wrap gap-0.5 mt-0.5 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); setShowAchDetail(showAchDetail === entry.userId ? null : entry.userId) }}
                      >
                        {(showAchDetail === entry.userId ? achievementMap[entry.userId] : achievementMap[entry.userId].slice(0, 3)).map((a, i) => (
                          <span key={i} className="inline-flex items-center gap-0.5 bg-yellow-50 border border-yellow-200 rounded-full px-1.5 py-0 text-[9px] leading-4">
                            <span>{a.type === 'sector_master' ? '🥇' : a.type === 'grade_king' ? '👑' : a.type === 'type_master' ? (a.name.includes('мульти') ? '🧗' : '🪨') : a.type === 'admin' ? '🛡' : '🏆'}</span>
                            <span className="font-medium text-yellow-800">{showAchDetail === entry.userId && a.type === 'sector_master' ? `Хозяин: ${a.name}` : a.name}</span>
                          </span>
                        ))}
                        {showAchDetail !== entry.userId && achievementMap[entry.userId].length > 3 && (
                          <span className="text-[9px] text-gray-400">+{achievementMap[entry.userId].length - 3}</span>
                        )}
                      </div>
                    )}
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

      {/* Zoomed avatar modal */}
      {zoomedAvatar && (
        <div
          className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center"
          onClick={() => setZoomedAvatar(null)}
        >
          <img src={zoomedAvatar} alt="" className="w-64 h-64 rounded-2xl object-cover shadow-2xl" />
        </div>
      )}
    </div>
  )
}
