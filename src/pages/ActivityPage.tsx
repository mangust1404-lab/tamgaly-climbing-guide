import { useState, useMemo, useCallback, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db, type Route as RouteType, type User as UserType } from '../lib/db/schema'
import { gradeColor } from '../lib/utils'
import { useI18n } from '../lib/i18n'

const STYLE_EMOJI: Record<string, string> = {
  onsight: '\uD83D\uDC41\uFE0F',
  flash: '\u26A1',
  redpoint: '\uD83D\uDD34',
  toprope: '\uD83D\uDD35',
  attempt: '\u2B1C',
}

// Will be derived from actual routes dynamically

const FOLLOWED_KEY = 'activity_followed_users'

function loadFollowed(): Set<string> {
  try {
    const raw = localStorage.getItem(FOLLOWED_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* ignore */ }
  return new Set()
}

function saveFollowed(ids: Set<string>) {
  localStorage.setItem(FOLLOWED_KEY, JSON.stringify([...ids]))
}

export function ActivityPage() {
  const { t, td } = useI18n()

  const ascents = useLiveQuery(() => db.ascents.toArray())
  const routes = useLiveQuery(() => db.routes.toArray())
  const users = useLiveQuery(() => db.users.toArray())

  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(new Set())

  // Derive grade chips from actual routes
  const gradeChips = useMemo(() => {
    if (!routes) return []
    const grades = new Map<string, number>()
    for (const r of routes) {
      grades.set(r.grade, r.gradeSort)
    }
    return [...grades.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([grade]) => grade)
  }, [routes])

  const [userSearch, setUserSearch] = useState('')
  const [followed, setFollowed] = useState<Set<string>>(loadFollowed)
  const [showFollowedOnly, setShowFollowedOnly] = useState(false)

  // Persist followed users
  useEffect(() => {
    saveFollowed(followed)
  }, [followed])

  const toggleGrade = (g: string) => {
    setSelectedGrades(prev => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })
  }

  const toggleFollow = useCallback((userId: string) => {
    setFollowed(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }, [])

  // Build lookup maps
  const routeMap = useMemo(() => {
    if (!routes) return new Map<string, RouteType>()
    return new Map(routes.map(r => [r.id, r]))
  }, [routes])

  const userMap = useMemo(() => {
    if (!users) return new Map<string, UserType>()
    return new Map(users.map(u => [u.id, u]))
  }, [users])

  // Filter and sort ascents
  const filteredAscents = useMemo(() => {
    if (!ascents) return []

    let result = [...ascents]

    // Sort newest first
    result.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date)
      if (dateCompare !== 0) return dateCompare
      return b.createdAt.localeCompare(a.createdAt)
    })

    // Filter by followed users
    if (showFollowedOnly) {
      result = result.filter(a => followed.has(a.userId))
    }

    // Filter by user name search
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase()
      result = result.filter(a => {
        const user = userMap.get(a.userId)
        return user?.displayName?.toLowerCase().includes(q) ?? false
      })
    }

    // Filter by grade
    if (selectedGrades.size > 0) {
      result = result.filter(a => {
        const route = routeMap.get(a.routeId)
        if (!route) return false
        return selectedGrades.has(route.grade)
      })
    }

    return result
  }, [ascents, showFollowedOnly, followed, userSearch, userMap, selectedGrades, routeMap])

  const formatDate = useCallback((dateStr: string) => {
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return dateStr
    }
  }, [])

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">{t('activity.title')}</h1>

      {/* User search */}
      <input
        type="text"
        value={userSearch}
        onChange={e => setUserSearch(e.target.value)}
        placeholder={t('activity.searchUser')}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Follow filter toggle */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setShowFollowedOnly(v => !v)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            showFollowedOnly
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {t('activity.followedOnly')} ({followed.size})
        </button>
      </div>

      {/* Grade filter chips */}
      <div className="flex flex-wrap gap-1 mb-4">
        {gradeChips.map(g => (
          <button
            key={g}
            onClick={() => toggleGrade(g)}
            className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
              selectedGrades.has(g)
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Activity feed */}
      {filteredAscents.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">{'\uD83D\uDCE1'}</p>
          <p className="text-sm">{t('activity.noActivity')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAscents.map(ascent => {
            const route = routeMap.get(ascent.routeId)
            const user = userMap.get(ascent.userId)
            const styleName = t(`style.${ascent.style}` as 'style.onsight' | 'style.flash' | 'style.redpoint' | 'style.toprope' | 'style.attempt')
            const styleEmoji = STYLE_EMOJI[ascent.style] || ''
            const isFollowed = followed.has(ascent.userId)

            return (
              <div
                key={ascent.localId || ascent.id}
                className="bg-white border border-gray-100 rounded-lg p-3"
              >
                <div className="flex items-start gap-3">
                  {/* User info + follow */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm truncate">
                        {user?.displayName || t('activity.unknownUser')}
                      </span>
                      <button
                        onClick={() => toggleFollow(ascent.userId)}
                        className={`text-xs px-1.5 py-0.5 rounded transition-colors flex-shrink-0 ${
                          isFollowed
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                        }`}
                        title={isFollowed ? t('activity.unfollow') : t('activity.follow')}
                      >
                        {isFollowed ? '\u2605' : '\u2606'}
                      </button>
                    </div>

                    {/* Route info */}
                    <div className="flex items-center gap-2 mb-1">
                      {route ? (
                        <Link
                          to={`/route/${route.id}`}
                          className="text-sm text-blue-600 hover:underline truncate"
                        >
                          {td(route.name)}
                        </Link>
                      ) : (
                        <span className="text-sm text-gray-400">{t('activity.unknownRoute')}</span>
                      )}
                      {route && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${gradeColor(route.grade)}`}>
                          {route.grade}
                        </span>
                      )}
                    </div>

                    {/* Style and date */}
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{styleEmoji} {styleName}</span>
                      <span>{'\u00B7'}</span>
                      <span>{formatDate(ascent.date)}</span>
                    </div>

                    {/* Rating stars */}
                    {ascent.rating != null && ascent.rating > 0 && (
                      <div className="mt-1 text-xs text-yellow-500">
                        {Array.from({ length: ascent.rating }, (_, i) => (
                          <span key={i}>{'\u2B50'}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
