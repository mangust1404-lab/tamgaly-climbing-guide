import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { calculatePoints, calculateTotalScore } from '../lib/scoring/points'
import { useI18n } from '../lib/i18n'
import { useUser } from '../lib/userContext'
import { gradeColor } from '../lib/utils'
import { TranslatedName } from '../components/ui/TranslatedName'

interface PublicProfile {
  id: string
  displayName: string
  avatarUrl?: string | null
  createdAt: string
  fields: {
    routes: boolean
    achievements: boolean
    maxGrade: boolean
    stats: boolean
    pyramid: boolean
    dates: boolean
    contacts: boolean
  }
  telegramHandle?: string | null
  whatsappPhone?: string | null
}

const SCORED_STYLES = ['onsight', 'flash', 'redpoint']

export function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const { t, td } = useI18n()
  const { user } = useUser()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [zoomedAvatar, setZoomedAvatar] = useState<string | null>(null)

  const ascents = useLiveQuery(
    () => userId ? db.ascents.where('userId').equals(userId).toArray() : [],
    [userId],
  )
  const routes = useLiveQuery(() => db.routes.toArray())
  const achievements = useLiveQuery(
    () => userId ? db.achievements.where('userId').equals(userId).toArray() : [],
    [userId],
  )

  useEffect(() => {
    if (!userId) return
    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    const viewer = user?.id ? `?viewer=${user.id}` : ''
    fetch(`${API_BASE}/sync/user/${userId}/public-profile${viewer}`)
      .then(r => r.json())
      .then((p: any) => {
        if (p.error) { setProfile(null); return }
        setProfile(p)
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false))
  }, [userId, user?.id])

  const stats = useMemo(() => {
    if (!ascents || !routes) return null
    const routeMap = new Map(routes.map(r => [r.id, r]))
    const completed = ascents.filter(a => a.style !== 'attempt')
    // First scored ascent per route for points
    const firstPer = new Map<string, typeof completed[number]>()
    for (const a of completed) {
      if (!SCORED_STYLES.includes(a.style)) continue
      const route = routeMap.get(a.routeId)
      const key = route?.name || a.routeId
      const existing = firstPer.get(key)
      if (!existing || a.date < existing.date) firstPer.set(key, a)
    }
    const points = [...firstPer.values()].map(a => {
      const r = routeMap.get(a.routeId)
      return r ? calculatePoints(r.grade, a.style as any) : 0
    })
    const totalScore = calculateTotalScore(points)

    let bestGrade = '', bestSort = 0
    for (const a of completed) {
      const r = routeMap.get(a.routeId)
      if (r && r.gradeSort > bestSort) { bestSort = r.gradeSort; bestGrade = r.grade }
    }

    // Grade pyramid
    const gradeRoutes: Record<string, Array<{ id: string; name: string; grade: string }>> = {}
    for (const a of completed) {
      const r = routeMap.get(a.routeId)
      if (!r) continue
      if (!gradeRoutes[r.grade]) gradeRoutes[r.grade] = []
      if (!gradeRoutes[r.grade].some(x => x.id === r.id)) {
        gradeRoutes[r.grade].push({ id: r.id, name: r.name, grade: r.grade })
      }
    }
    const pyramid = Object.entries(gradeRoutes).map(([grade, list]) => ({
      grade, count: list.length, routes: list,
      sort: routeMap.get(list[0].id)?.gradeSort || 0,
    })).sort((a, b) => a.sort - b.sort)

    return {
      totalScore,
      ascentCount: completed.length,
      bestGrade,
      pyramid,
      ascents: completed,
    }
  }, [ascents, routes])

  if (loading) return <div className="p-4 text-center text-gray-400">{t('loading')}</div>
  if (!profile) return (
    <div className="p-4 text-center">
      <p className="text-4xl mb-3">👤</p>
      <p className="text-sm text-gray-500">{t('publicProfile.notFound')}</p>
      <Link to="/leaderboard" className="text-xs text-blue-600 mt-3 inline-block">← {t('publicProfile.backToLeaderboard')}</Link>
    </div>
  )

  const f = profile.fields
  const isSelf = user?.id === profile.id
  const routeMap = new Map((routes || []).map(r => [r.id, r]))
  const climbedRouteIds = new Set((ascents || []).filter(a => SCORED_STYLES.includes(a.style)).map(a => a.routeId))
  const climbedRoutes = [...climbedRouteIds].map(id => routeMap.get(id)).filter(Boolean) as any[]

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-4">
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl + '?t=' + Date.now()}
            alt=""
            onClick={() => setZoomedAvatar(profile.avatarUrl + '?t=' + Date.now())}
            className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 cursor-pointer"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-2xl">👤</div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{profile.displayName}</h1>
          <p className="text-xs text-gray-400">
            {t('publicProfile.joined')} {new Date(profile.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Contacts */}
      {f.contacts && (profile.telegramHandle || profile.whatsappPhone) && (
        <div className="mb-4 flex gap-2">
          {profile.telegramHandle && (
            <a
              href={`https://t.me/${profile.telegramHandle}`}
              target="_blank" rel="noreferrer"
              className="flex-1 bg-sky-100 text-sky-700 rounded-lg py-2 text-center text-sm font-medium"
            >
              📱 Telegram
            </a>
          )}
          {profile.whatsappPhone && (
            <a
              href={`https://wa.me/${profile.whatsappPhone.replace(/\D/g, '')}`}
              target="_blank" rel="noreferrer"
              className="flex-1 bg-green-100 text-green-700 rounded-lg py-2 text-center text-sm font-medium"
            >
              💬 WhatsApp
            </a>
          )}
        </div>
      )}

      {/* Achievements */}
      {f.achievements && achievements && achievements.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-1">
            {achievements.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-0.5 bg-yellow-50 border border-yellow-200 rounded-full px-1.5 py-0.5 text-[10px]">
                <span>{a.type === 'sector_master' ? '🥇' : a.type === 'grade_king' ? '👑' : a.type === 'type_master' ? '🧗' : a.type === 'admin' ? '🛡' : '🏆'}</span>
                <span className="font-medium text-yellow-800">{a.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats grid */}
      {(f.stats || f.maxGrade) && stats && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {f.stats && (
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-blue-600">{stats.totalScore}</div>
              <div className="text-xs text-blue-500">{t('profile.points')}</div>
            </div>
          )}
          {f.maxGrade && (
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-green-600">{stats.bestGrade || '—'}</div>
              <div className="text-xs text-green-500">{t('profile.bestGrade')}</div>
            </div>
          )}
          {f.stats && (
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-purple-600">{stats.ascentCount}</div>
              <div className="text-xs text-purple-500">{t('profile.ascents')}</div>
            </div>
          )}
        </div>
      )}

      {/* Pyramid */}
      {f.pyramid && stats && stats.pyramid.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold mb-2">{t('profile.gradePyramid')}</h2>
          <div className="space-y-1">
            {stats.pyramid.map(p => {
              const max = Math.max(...stats.pyramid.map(x => x.count))
              const w = Math.max(20, (p.count / max) * 100)
              return (
                <div key={p.grade} className="flex items-center gap-2">
                  <span className="w-10 text-xs font-mono text-right text-gray-600">{p.grade}</span>
                  <div className="flex-1 h-5 bg-gray-50 rounded overflow-hidden">
                    <div className="h-full bg-blue-400 rounded flex items-center px-1.5" style={{ width: `${w}%` }}>
                      <span className="text-[10px] text-white font-medium">{p.count}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Climbed routes */}
      {f.routes && climbedRoutes.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold mb-2">{t('publicProfile.climbedRoutes')} ({climbedRoutes.length})</h2>
          <div className="space-y-1">
            {climbedRoutes
              .sort((a: any, b: any) => b.gradeSort - a.gradeSort)
              .slice(0, 30)
              .map((r: any) => {
                const ascent = (ascents || []).find(a => a.routeId === r.id && SCORED_STYLES.includes(a.style))
                return (
                  <Link key={r.id} to={`/route/${r.id}`} className="flex items-center gap-2 text-xs py-1 px-2 bg-gray-50 rounded">
                    <span className={`font-mono font-bold rounded px-1 py-0.5 ${gradeColor(r.grade)}`}>{r.grade}</span>
                    <TranslatedName name={td(r.name)} className="flex-1 truncate" />
                    {f.dates && ascent && <span className="text-gray-400 text-[10px]">{ascent.date}</span>}
                  </Link>
                )
              })}
            {climbedRoutes.length > 30 && (
              <p className="text-xs text-gray-400 text-center">{climbedRoutes.length - 30} {t('publicProfile.moreRoutes')}</p>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!f.routes && !f.achievements && !f.stats && !f.maxGrade && !f.pyramid && !f.contacts && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🔒</p>
          <p className="text-sm">{t('publicProfile.private')}</p>
        </div>
      )}

      {isSelf && (
        <Link to="/profile" className="block text-center text-xs text-blue-600 mt-4">
          {t('publicProfile.editProfile')} →
        </Link>
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
