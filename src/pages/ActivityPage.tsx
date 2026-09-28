import { useState, useMemo, useCallback, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db, type Route as RouteType } from '../lib/db/schema'
import { gradeColor } from '../lib/utils'
import { useI18n } from '../lib/i18n'
import { useUser } from '../lib/userContext'
import { TranslatedName } from '../components/ui/TranslatedName'

const STYLE_EMOJI: Record<string, string> = {
  onsight: '👁️',
  flash: '⚡',
  redpoint: '🔴',
  toprope: '🔵',
  attempt: '⬜',
}

const COMMENT_EMOJI = '💬'

const FOLLOWED_KEY = 'activity_followed_users'
const FEED_CACHE_KEY = 'activity_feed_cache'

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

// --- Server /sync/feed response shapes ---
interface ServerAscent {
  id: string
  local_id: string
  user_id: string
  route_id: string
  date: string
  style: string
  rating: number | null
  notes: string | null
  points: number
  created_at: string
  user_name: string
  route_name: string | null
  route_grade: string | null
}

interface ServerComment {
  id: string
  local_id: string
  user_id: string
  route_id: string
  comment: string
  grade_opinion: string | null
  rating: number | null
  created_at: string
  user_name: string
  route_name: string | null
  route_grade: string | null
}

interface FeedResponse {
  ascents: ServerAscent[]
  comments: ServerComment[]
}

// --- Unified feed item used for rendering ---
interface AscentFeedItem {
  kind: 'ascent'
  key: string
  userId: string
  userName: string
  routeId: string
  routeName: string | null
  routeGrade: string | null
  style: string
  rating: number | null
  date: string
  createdAt: string
}

interface CommentFeedItem {
  kind: 'comment'
  key: string
  userId: string
  userName: string
  routeId: string
  routeName: string | null
  routeGrade: string | null
  comment: string
  rating: number | null
  createdAt: string
}

type FeedItem = AscentFeedItem | CommentFeedItem

export function ActivityPage() {
  const { t, td } = useI18n()
  const { user } = useUser()

  const routes = useLiveQuery(() => db.routes.toArray())

  // Own local ascents/reviews (incl. unsynced pending ones) so a just-logged
  // ascent/comment appears immediately, same as before this feature.
  const ownAscents = useLiveQuery(
    () => user ? db.ascents.where('userId').equals(user.id).toArray() : [],
    [user?.id],
  )
  const ownReviews = useLiveQuery(
    () => user ? db.reviews.where('userId').equals(user.id).toArray() : [],
    [user?.id],
  )

  const [remoteAscents, setRemoteAscents] = useState<ServerAscent[]>([])
  const [remoteComments, setRemoteComments] = useState<ServerComment[]>([])
  // Which viewer the current remote feed belongs to (null until the first response)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const feedLoaded = loadedFor === (user?.id ?? 'anon')

  // Fetch the privacy-aware merged feed from the server. Falls back to the
  // last cached response (or nothing) when offline / the request fails.
  useEffect(() => {
    let cancelled = false
    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    const viewerParam = user?.id ? `?viewer=${encodeURIComponent(user.id)}` : ''
    // Per viewer: a friends-only ascent cached for one user must not be shown to another
    const cacheKey = `${FEED_CACHE_KEY}:${user?.id ?? 'anon'}`

    fetch(`${API_BASE}/sync/feed${viewerParam}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<FeedResponse>
      })
      .then(data => {
        if (cancelled) return
        setRemoteAscents(data.ascents || [])
        setRemoteComments(data.comments || [])
        setLoadedFor(user?.id ?? 'anon')
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data))
        } catch { /* storage full/unavailable: ignore */ }
      })
      .catch(() => {
        if (cancelled) return
        setLoadedFor(user?.id ?? 'anon')
        try {
          const raw = localStorage.getItem(cacheKey)
          if (raw) {
            const cached = JSON.parse(raw) as FeedResponse
            setRemoteAscents(cached.ascents || [])
            setRemoteComments(cached.comments || [])
            return
          }
        } catch { /* corrupt cache: ignore */ }
        setRemoteAscents([])
        setRemoteComments([])
      })

    return () => { cancelled = true }
  }, [user?.id])

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

  // Build route lookup (for own local items, which only carry a routeId)
  const routeMap = useMemo(() => {
    if (!routes) return new Map<string, RouteType>()
    return new Map(routes.map(r => [r.id, r]))
  }, [routes])

  // Merge server feed + own local (pending/unsynced) items into one list,
  // deduped by local id so a just-synced item doesn't show up twice.
  const feedItems = useMemo(() => {
    const items: FeedItem[] = []

    for (const a of remoteAscents) {
      items.push({
        kind: 'ascent',
        key: a.local_id || a.id,
        userId: a.user_id,
        userName: a.user_name,
        routeId: a.route_id,
        routeName: a.route_name,
        routeGrade: a.route_grade,
        style: a.style,
        rating: a.rating,
        date: a.date,
        createdAt: a.created_at,
      })
    }

    for (const c of remoteComments) {
      items.push({
        kind: 'comment',
        key: c.local_id || c.id,
        userId: c.user_id,
        userName: c.user_name,
        routeId: c.route_id,
        routeName: c.route_name,
        routeGrade: c.route_grade,
        comment: c.comment,
        rating: c.rating,
        createdAt: c.created_at,
      })
    }

    if (user) {
      const serverAscentLocalIds = new Set(remoteAscents.map(a => a.local_id))
      const serverCommentLocalIds = new Set(remoteComments.map(c => c.local_id))

      for (const a of ownAscents || []) {
        if (serverAscentLocalIds.has(a.localId)) continue
        const route = routeMap.get(a.routeId)
        items.push({
          kind: 'ascent',
          key: a.localId,
          userId: a.userId,
          userName: user.displayName,
          routeId: a.routeId,
          routeName: route?.name ?? null,
          routeGrade: route?.grade ?? null,
          style: a.style,
          rating: a.rating ?? null,
          date: a.date,
          createdAt: a.createdAt,
        })
      }

      for (const r of ownReviews || []) {
        if (!r.comment || !r.comment.trim()) continue
        if (serverCommentLocalIds.has(r.localId)) continue
        const route = routeMap.get(r.routeId)
        items.push({
          kind: 'comment',
          key: r.localId,
          userId: r.userId,
          userName: user.displayName,
          routeId: r.routeId,
          routeName: route?.name ?? null,
          routeGrade: route?.grade ?? null,
          comment: r.comment,
          rating: r.rating ?? null,
          createdAt: r.createdAt,
        })
      }
    }

    // Newest first. Ascents go by the climb date the user entered (they are
    // often logged or synced days later); comments by when they were written.
    const day = (i: FeedItem) => i.kind === 'ascent' ? i.date : i.createdAt.slice(0, 10)
    items.sort((x, y) => day(y).localeCompare(day(x)) || y.createdAt.localeCompare(x.createdAt))
    return items
  }, [remoteAscents, remoteComments, ownAscents, ownReviews, user, routeMap])

  // Filter merged feed (applies to both ascents and comments)
  const filteredItems = useMemo(() => {
    let result = feedItems

    if (showFollowedOnly) {
      result = result.filter(i => followed.has(i.userId))
    }

    if (userSearch.trim()) {
      const q = userSearch.toLowerCase()
      result = result.filter(i => i.userName?.toLowerCase().includes(q) ?? false)
    }

    if (selectedGrades.size > 0) {
      result = result.filter(i => !!i.routeGrade && selectedGrades.has(i.routeGrade))
    }

    return result
  }, [feedItems, showFollowedOnly, followed, userSearch, selectedGrades])

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
      {filteredItems.length === 0 && !feedLoaded ? (
        <p className="text-center py-12 text-sm text-gray-400">{t('loading')}</p>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">{'📡'}</p>
          <p className="text-sm">{t('activity.noActivity')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map(item => {
            const isFollowed = followed.has(item.userId)
            const routeLabel = item.routeName
              ? <TranslatedName name={td(item.routeName)} />
              : t('activity.unknownRoute')

            return (
              <Link
                key={item.key}
                to={`/route/${item.routeId}`}
                className="block bg-white border border-gray-100 rounded-lg p-3"
              >
                <div className="flex items-start gap-3">
                  {/* User info + follow */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        to={`/user/${item.userId}`}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = `/user/${item.userId}` }}
                        className="font-medium text-sm truncate text-blue-700 hover:underline"
                      >
                        {item.userName || t('activity.unknownUser')}
                      </Link>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFollow(item.userId) }}
                        className={`text-xs px-1.5 py-0.5 rounded transition-colors flex-shrink-0 ${
                          isFollowed
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                        }`}
                        title={isFollowed ? t('activity.unfollow') : t('activity.follow')}
                      >
                        {isFollowed ? '★' : '☆'}
                      </button>
                    </div>

                    {/* Route info */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium truncate">
                        {routeLabel}
                      </span>
                      {item.routeGrade && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${gradeColor(item.routeGrade)}`}>
                          {item.routeGrade}
                        </span>
                      )}
                    </div>

                    {item.kind === 'ascent' ? (
                      <>
                        {/* Style and date */}
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{STYLE_EMOJI[item.style] || ''} {t(`style.${item.style}` as 'style.onsight' | 'style.flash' | 'style.redpoint' | 'style.toprope' | 'style.attempt')}</span>
                          <span>{'·'}</span>
                          <span>{formatDate(item.date)}</span>
                        </div>

                        {/* Rating stars */}
                        {item.rating != null && item.rating > 0 && (
                          <div className="mt-1 text-xs text-yellow-500">
                            {Array.from({ length: item.rating }, (_, i) => (
                              <span key={i}>{'⭐'}</span>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Comment text */}
                        <div className="text-xs text-gray-700 mb-1">
                          {COMMENT_EMOJI} {item.comment}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{formatDate(item.createdAt)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
