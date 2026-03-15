import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { calculatePoints, calculateTotalScore } from '../lib/scoring/points'
import { useI18n } from '../lib/i18n'
import { useUser } from '../lib/userContext'
import { gradeColor } from '../lib/utils'

const STYLE_COLORS: Record<string, string> = {
  onsight: 'bg-green-100 text-green-700',
  flash: 'bg-yellow-100 text-yellow-700',
  redpoint: 'bg-red-100 text-red-700',
  toprope: 'bg-blue-100 text-blue-700',
  attempt: 'bg-gray-100 text-gray-500',
}

const ASCENT_STYLES = [
  { value: 'onsight', emoji: '👁️' },
  { value: 'flash', emoji: '⚡' },
  { value: 'redpoint', emoji: '🔴' },
  { value: 'toprope', emoji: '🔵' },
  { value: 'attempt', emoji: '⬜' },
] as const

const SCORED_STYLES = ['onsight', 'flash', 'redpoint']

export function ProfilePage() {
  const { t, td } = useI18n()
  const { user, register, restore, lookupByName, updateName } = useUser()
  const [nameInput, setNameInput] = useState('')
  const [foundUsers, setFoundUsers] = useState<Array<{ id: string; display_name: string; created_at: string }>>([])
  const [lookingUp, setLookingUp] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [selectedSectorId, setSelectedSectorId] = useState('')
  const [selectedRouteId, setSelectedRouteId] = useState('')
  const [style, setStyle] = useState<string>('redpoint')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [rating, setRating] = useState(0)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [editingAscent, setEditingAscent] = useState<string | null>(null)
  const [period, setPeriod] = useState<'all' | 'year' | 'season' | 'month' | 'week'>('all')
  const [profileTab, setProfileTab] = useState<'ascents' | 'projects'>('ascents')

  const ascents = useLiveQuery(() =>
    db.ascents.orderBy('date').reverse().toArray(),
  )
  const routes = useLiveQuery(() => db.routes.toArray())
  const sectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())
  const wishlistItems = useLiveQuery(
    () => user?.id ? db.wishlist.where('userId').equals(user.id).toArray() : [],
    [user?.id],
  )

  const stats = useMemo(() => {
    if (!ascents || !routes) return null

    const now = Date.now()
    const myAscents = ascents.filter(a => {
      if (a.userId !== user?.id) return false
      if (period === 'all') return true
      const date = new Date(a.date).getTime()
      if (period === 'week') return now - date < 7 * 86400000
      if (period === 'month') return now - date < 30 * 86400000
      if (period === 'season') return now - date < 90 * 86400000
      if (period === 'year') return now - date < 365 * 86400000
      return true
    })
    const routeMap = new Map(routes.map((r) => [r.id, r]))
    const completed = myAscents.filter((a) => a.style !== 'attempt')
    // Recalculate points: only scored styles (onsight/flash/redpoint) get points
    const scoredPoints = completed
      .filter(a => SCORED_STYLES.includes(a.style))
      .map(a => {
        const route = routeMap.get(a.routeId)
        return route ? calculatePoints(route.grade, a.style as any) : 0
      })
    const totalScore = calculateTotalScore(scoredPoints)

    // Best grade
    let bestGrade = ''
    let bestGradeSort = 0
    for (const a of completed) {
      const route = routeMap.get(a.routeId)
      if (route && route.gradeSort > bestGradeSort) {
        bestGradeSort = route.gradeSort
        bestGrade = route.grade
      }
    }

    // Style breakdown
    const byStyle: Record<string, number> = {}
    for (const a of myAscents) {
      byStyle[a.style] = (byStyle[a.style] || 0) + 1
    }

    // Grade pyramid
    const gradeCount: Record<string, number> = {}
    for (const a of completed) {
      const route = routeMap.get(a.routeId)
      if (route) {
        gradeCount[route.grade] = (gradeCount[route.grade] || 0) + 1
      }
    }
    const pyramid = Object.entries(gradeCount)
      .map(([grade, count]) => ({
        grade,
        count,
        sort: routeMap.get(completed.find((a) => {
          const r = routeMap.get(a.routeId)
          return r?.grade === grade
        })?.routeId || '')?.gradeSort || 0,
      }))
      .sort((a, b) => b.sort - a.sort)

    return {
      totalAscents: myAscents.length,
      completedAscents: completed.length,
      totalScore,
      bestGrade,
      byStyle,
      pyramid,
      pending: myAscents.filter((a) => a.syncStatus === 'pending').length,
    }
  }, [ascents, routes, user?.id, period])

  const sectorRoutes = useMemo(() => {
    if (!routes || !selectedSectorId) return []
    return routes.filter(r => r.sectorId === selectedSectorId).sort((a, b) => a.gradeSort - b.gradeSort)
  }, [routes, selectedSectorId])

  const selectedRoute = routes?.find(r => r.id === selectedRouteId)

  // Check if route already has a scored ascent (onsight/flash/redpoint)
  const hasScoredAscent = useMemo(() => {
    if (!ascents || !selectedRouteId) return false
    return ascents.some(a =>
      a.routeId === selectedRouteId &&
      a.userId === user?.id &&
      SCORED_STYLES.includes(a.style) &&
      a.id !== editingAscent
    )
  }, [ascents, selectedRouteId, user?.id, editingAscent])

  const handleSaveAscent = async () => {
    if (!selectedRoute || saving) return

    // Prevent duplicate scored ascents on same route
    if (SCORED_STYLES.includes(style) && hasScoredAscent) {
      alert(t('profile.duplicateScored'))
      return
    }

    setSaving(true)
    const now = new Date().toISOString()
    const points = SCORED_STYLES.includes(style) ? calculatePoints(selectedRoute.grade, style as any) : 0

    try {
      if (editingAscent) {
        // Update existing ascent
        await db.ascents.update(editingAscent, {
          routeId: selectedRoute.id,
          date,
          style: style as any,
          rating: rating || undefined,
          notes: notes || undefined,
          points,
          syncStatus: 'pending' as const,
        })
        await db.syncQueue.add({
          entity: 'ascent',
          localId: editingAscent,
          action: 'update',
          payload: { userId: user?.id ?? 'anon', routeId: selectedRoute.id, date, style, rating, notes, points },
          createdAt: Date.now(),
          retryCount: 0,
        })
        setEditingAscent(null)
      } else {
        // Create new ascent
        const localId = crypto.randomUUID()
        await db.ascents.add({
          id: localId,
          localId,
          userId: user?.id ?? 'anon',
          routeId: selectedRoute.id,
          date,
          style: style as any,
          rating: rating || undefined,
          notes: notes || undefined,
          isPublic: true,
          points,
          syncStatus: 'pending',
          createdAt: now,
        })
        await db.syncQueue.add({
          entity: 'ascent',
          localId,
          action: 'create',
          payload: { userId: user?.id ?? 'anon', routeId: selectedRoute.id, date, style, rating, notes, points },
          createdAt: Date.now(),
          retryCount: 0,
        })
      }
      // Reset form
      setSelectedRouteId('')
      setNotes('')
      setRating(0)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
    } catch (err) {
      console.error('Failed to save ascent:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleEditAscent = (ascent: NonNullable<typeof ascents>[number]) => {
    const route = routes?.find(r => r.id === ascent.routeId)
    if (route) {
      setSelectedSectorId(route.sectorId)
      setSelectedRouteId(route.id)
    }
    setStyle(ascent.style)
    setDate(ascent.date)
    setNotes(ascent.notes || '')
    setRating(ascent.rating || 0)
    setEditingAscent(ascent.id)
    setShowForm(true)
  }

  const handleDeleteAscent = async (ascentId: string) => {
    if (!confirm(t('profile.confirmDelete'))) return
    // Find the ascent to get localId before deleting
    const ascent = await db.ascents.get(ascentId)
    const localId = ascent?.localId || ascentId
    await db.ascents.delete(ascentId)
    // Remove any pending create/update from sync queue
    await db.syncQueue.where('localId').equals(localId).delete()
    // Queue a delete action so server removes it too
    if (ascent?.syncStatus === 'synced') {
      await db.syncQueue.add({
        entity: 'ascent',
        localId,
        action: 'delete',
        payload: {},
        createdAt: Date.now(),
        retryCount: 0,
      })
    }
  }

  // Onboarding: ask for name
  if (!user) {
    const handleLookup = async () => {
      if (!nameInput.trim()) return
      setLookingUp(true)
      const results = await lookupByName(nameInput)
      setFoundUsers(results)
      setLookingUp(false)
    }

    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh]">
        <span className="text-5xl mb-4">🧗</span>
        <h1 className="text-xl font-bold mb-2">{t('profile.welcome')}</h1>
        <p className="text-sm text-gray-500 mb-6 text-center">{t('profile.enterName')}</p>
        <div className="w-full max-w-xs">
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => { setNameInput(e.target.value); setFoundUsers([]) }}
            placeholder={t('profile.namePlaceholder')}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm mb-3"
          />

          {/* Found existing users */}
          {foundUsers.length > 0 && (
            <div className="mb-3 space-y-2">
              <p className="text-xs text-gray-500">{t('profile.existingFound')}:</p>
              {foundUsers.map(u => (
                <button
                  key={u.id}
                  onClick={() => restore({ id: u.id, displayName: u.display_name, createdAt: u.created_at })}
                  className="w-full text-left bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm"
                >
                  <span className="font-medium">{u.display_name}</span>
                  <span className="text-xs text-gray-400 ml-2">
                    {new Date(u.created_at).toLocaleDateString()}
                  </span>
                  <span className="float-right text-green-600 text-xs font-medium">{t('profile.restore')}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleLookup}
              disabled={!nameInput.trim() || lookingUp}
              className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-3 text-sm font-medium disabled:opacity-40"
            >
              {lookingUp ? '...' : t('profile.findAccount')}
            </button>
            <button
              type="button"
              onClick={() => { if (nameInput.trim()) register(nameInput) }}
              disabled={!nameInput.trim()}
              className="flex-1 bg-blue-600 text-white rounded-lg py-3 font-medium disabled:opacity-40"
            >
              {t('profile.start')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 pb-8">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{user.displayName}</h1>
          {editingName ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (nameInput.trim()) { updateName(nameInput); setEditingName(false) }
              }}
              className="flex gap-1"
            >
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="border border-gray-300 rounded px-2 py-0.5 text-sm w-32"
              />
              <button type="submit" className="text-xs text-blue-600">OK</button>
            </form>
          ) : (
            <button
              onClick={() => { setNameInput(user.displayName); setEditingName(true) }}
              className="text-gray-400 text-xs"
            >
              ✎
            </button>
          )}
        </div>
        {showForm && (
          <button
            onClick={() => { setShowForm(false); setEditingAscent(null); setSelectedRouteId('') }}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-200 text-gray-600"
          >
            {t('cancel')}
          </button>
        )}
      </div>
      {/* removed subtitle */}

      {/* Ascent logging form */}
      {showForm && (
        <div className="bg-gray-50 rounded-xl p-3 mb-4 border border-gray-200">
          {justSaved && (
            <div className="bg-green-100 text-green-700 text-sm rounded-lg px-3 py-2 mb-3 text-center font-medium">
              {t('profile.saved')}
            </div>
          )}

          {/* Sector picker */}
          <div className="mb-3">
            <label className="text-sm font-medium text-gray-700 mb-1 block">{t('profile.selectSector')}</label>
            <select
              value={selectedSectorId}
              onChange={(e) => { setSelectedSectorId(e.target.value); setSelectedRouteId('') }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">{t('profile.selectSector')}...</option>
              {sectors?.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Route picker */}
          {selectedSectorId && (
            <div className="mb-3">
              <label className="text-sm font-medium text-gray-700 mb-1 block">{t('profile.selectRoute')}</label>
              <select
                value={selectedRouteId}
                onChange={(e) => setSelectedRouteId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">{t('profile.selectRoute')}...</option>
                {sectorRoutes.map(r => (
                  <option key={r.id} value={r.id}>{r.grade} — {td(r.name)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Show rest of form only when route is selected */}
          {selectedRoute && (
            <>
              {/* Selected route info */}
              <div className="flex items-center gap-2 mb-3 bg-white rounded-lg px-3 py-2 border border-gray-200">
                <span className={`text-sm font-mono font-bold rounded px-1.5 py-0.5 ${gradeColor(selectedRoute.grade)}`}>
                  {selectedRoute.grade}
                </span>
                <span className="text-sm font-medium">{td(selectedRoute.name)}</span>
                <span className="text-xs text-gray-400 ml-auto">+{calculatePoints(selectedRoute.grade, style as any)} {t('route.points')}</span>
              </div>

              {/* Style */}
              <div className="mb-3">
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">{t('ascent.style')}</label>
                <div className="grid grid-cols-5 gap-1">
                  {ASCENT_STYLES.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setStyle(s.value)}
                      className={`flex flex-col items-center py-2 rounded-lg text-xs transition-colors ${
                        style === s.value
                          ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500'
                          : 'bg-white text-gray-600 border border-gray-200'
                      }`}
                    >
                      <span className="text-lg">{s.emoji}</span>
                      <span className="mt-0.5">{t(`style.${s.value}` as any)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Rating */}
              <div className="mb-3">
                <label className="text-sm font-medium text-gray-700 mb-1 block">{t('ascent.rating')}</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star === rating ? 0 : star)}
                      className={`text-2xl ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div className="mb-3">
                <label className="text-sm font-medium text-gray-700 mb-1 block">{t('ascent.date')}</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                />
              </div>

              {/* Comment */}
              <div className="mb-3">
                <label className="text-sm font-medium text-gray-700 mb-1 block">{t('profile.comment')}</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder={t('profile.commentPlaceholder')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none bg-white"
                />
              </div>

              {/* Duplicate warning */}
              {SCORED_STYLES.includes(style) && hasScoredAscent && (
                <div className="bg-red-50 text-red-600 text-xs rounded-lg px-3 py-2 mb-3">
                  {t('profile.duplicateScored')}
                </div>
              )}

              {/* Save */}
              <button
                onClick={handleSaveAscent}
                disabled={saving || (SCORED_STYLES.includes(style) && hasScoredAscent)}
                className="w-full bg-green-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
              >
                {saving ? t('saving') : editingAscent ? t('profile.updateAscent') : t('save')}
              </button>
            </>
          )}
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setProfileTab('ascents')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${profileTab === 'ascents' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
        >{t('route.ascents')}</button>
        <button
          onClick={() => setProfileTab('projects')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${profileTab === 'projects' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
        >{t('profile.projects')} {(wishlistItems?.length ?? 0) > 0 ? `(${wishlistItems?.length})` : ''}</button>
      </div>

      {profileTab === 'projects' ? (
        /* Projects tab */
        (wishlistItems?.length ?? 0) === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-sm">{t('profile.noProjects')}</p>
            <p className="text-xs mt-1">{t('profile.noProjectsHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {wishlistItems?.map(item => {
              const route = routes?.find(r => r.id === item.routeId)
              return (
                <Link key={item.id} to={`/route/${item.routeId}`} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                  {route && (
                    <span className={`text-xs font-mono font-bold rounded px-1.5 py-0.5 ${gradeColor(route.grade)}`}>
                      {route.grade}
                    </span>
                  )}
                  <span className="text-sm font-medium truncate flex-1">{route ? td(route.name) : item.routeId}</span>
                  <button
                    onClick={async (e) => { e.preventDefault(); e.stopPropagation(); await db.wishlist.delete(item.id) }}
                    className="text-gray-400 hover:text-red-500 p-1 text-xs flex-shrink-0"
                  >✕</button>
                </Link>
              )
            })}
          </div>
        )
      ) : !stats || stats.totalAscents === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">👤</p>
          <p className="text-sm">{t('profile.noAscents')}</p>
          <p className="text-xs mt-1">{t('profile.noAscentsHint')}</p>
        </div>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-2 mb-6">
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.totalScore}</div>
              <div className="text-xs text-blue-500">{t('profile.points')}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.bestGrade || '—'}</div>
              <div className="text-xs text-green-500">{t('profile.bestGrade')}</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.completedAscents}</div>
              <div className="text-xs text-purple-500">{t('profile.ascents')}</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.pending}</div>
              <div className="text-xs text-orange-500">{t('profile.pendingSync')}</div>
            </div>
          </div>

          {/* Style breakdown */}
          <h2 className="text-sm font-semibold mb-2">{t('profile.byStyle')}</h2>
          <div className="flex flex-wrap gap-2 mb-6">
            {Object.entries(stats.byStyle).map(([style, count]) => (
              <span
                key={style}
                className={`px-2.5 py-1 rounded-full text-xs font-medium ${STYLE_COLORS[style] || 'bg-gray-100'}`}
              >
                {t(`style.${style}` as any)}: {count}
              </span>
            ))}
          </div>

          {/* Grade pyramid */}
          {stats.pyramid.length > 0 && (
            <>
              <h2 className="text-sm font-semibold mb-2">{t('profile.gradePyramid')}</h2>
              <div className="space-y-1 mb-6">
                {stats.pyramid.map(({ grade, count }) => {
                  const maxCount = Math.max(...stats.pyramid.map((p) => p.count))
                  const width = Math.max(20, (count / maxCount) * 100)
                  return (
                    <div key={grade} className="flex items-center gap-2">
                      <span className="w-10 text-xs font-mono text-right text-gray-600">
                        {grade}
                      </span>
                      <div className="flex-1 h-5 bg-gray-50 rounded overflow-hidden">
                        <div
                          className="h-full bg-blue-400 rounded flex items-center px-1.5"
                          style={{ width: `${width}%` }}
                        >
                          <span className="text-[10px] text-white font-medium">{count}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Period filter */}
          <div className="flex gap-1 mb-3">
            {(['all', 'year', 'season', 'month', 'week'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  period === p ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {t(p === 'all' ? 'leaderboard.allTime' : p === 'year' ? 'profile.year' : p === 'season' ? 'leaderboard.season' : p === 'month' ? 'leaderboard.month' : 'leaderboard.week' as any)}
              </button>
            ))}
          </div>

          {/* Ascent history */}
          <h2 className="text-sm font-semibold mb-2">{t('profile.ascentHistory')}</h2>
          <div className="space-y-2">
            {ascents?.filter(a => {
              if (a.userId !== user?.id) return false
              if (period === 'all') return true
              const now = Date.now()
              const date = new Date(a.date).getTime()
              if (period === 'week') return now - date < 7 * 86400000
              if (period === 'month') return now - date < 30 * 86400000
              if (period === 'season') return now - date < 90 * 86400000
              if (period === 'year') return now - date < 365 * 86400000
              return true
            }).map(ascent => {
              const route = routes?.find(r => r.id === ascent.routeId)
              const styleEmoji = ASCENT_STYLES.find(s => s.value === ascent.style)?.emoji || ''
              return (
                <Link key={ascent.id} to={`/route/${ascent.routeId}`} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <span className="text-lg">{styleEmoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {route && (
                        <span className={`text-xs font-mono font-bold rounded px-1 py-0.5 ${gradeColor(route.grade)}`}>
                          {route.grade}
                        </span>
                      )}
                      <span className="text-sm font-medium truncate">{route ? td(route.name) : ascent.routeId}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                      <span>{ascent.date}</span>
                      {SCORED_STYLES.includes(ascent.style) && route && (
                        <span>+{calculatePoints(route.grade, ascent.style as any)}</span>
                      )}
                      {ascent.rating ? <span>{'★'.repeat(ascent.rating)}</span> : null}
                      {ascent.syncStatus === 'pending' && <span className="text-yellow-500">●</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEditAscent(ascent) }}
                      className="text-gray-400 hover:text-blue-500 p-1 text-xs"
                    >✎</button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteAscent(ascent.id) }}
                      className="text-gray-400 hover:text-red-500 p-1 text-xs"
                    >✕</button>
                  </div>
                </Link>
              )
            })}
          </div>
        </>
      )}

    </div>
  )
}
