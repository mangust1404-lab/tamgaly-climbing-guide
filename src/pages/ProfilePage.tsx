import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { calculatePoints, calculateTotalScore } from '../lib/scoring/points'
import { calculateAchievements } from '../lib/scoring/achievements'
import { getMotivationMessages, getAchievementProgress } from '../lib/scoring/motivation'
import { MotivationToast } from '../components/ui/MotivationToast'
import { useI18n } from '../lib/i18n'
import { useUser } from '../lib/userContext'
import { gradeColor } from '../lib/utils'
import { TranslatedName } from '../components/ui/TranslatedName'

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
  const { user, register, restore, lookupByName, verifyPin, setPin, updateName } = useUser()
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
  const [pinInput, setPinInput] = useState('')
  const [pinForUser, setPinForUser] = useState<string | null>(null) // userId awaiting PIN verification
  const [pinError, setPinError] = useState(false)
  const [settingPin, setSettingPin] = useState(false)
  const [newPinInput, setNewPinInput] = useState('')
  const [pinSaved, setPinSaved] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [tgHandle, setTgHandle] = useState('')
  const [waPhone, setWaPhone] = useState('')
  const [privacy, setPrivacy] = useState<Record<string, 'all' | 'friends' | 'nobody'>>({
    routes: 'all', achievements: 'all', maxGrade: 'all', projects: 'all', gradeVotes: 'all',
    stats: 'nobody', pyramid: 'nobody', dates: 'nobody', contacts: 'nobody',
  })
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [friends, setFriends] = useState<Array<{ id: string; name: string; avatarUrl: string | null; since: string }>>([])
  const [incoming, setIncoming] = useState<Array<{ fromId: string; name: string; avatarUrl: string | null }>>([])
  const [outgoing, setOutgoing] = useState<Array<{ toId: string; name: string; avatarUrl: string | null }>>([])

  const loadFriends = async () => {
    if (!user?.id) return
    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    try {
      const r = await fetch(`${API_BASE}/sync/friend/list?userId=${user.id}`)
      const data = await r.json()
      setFriends(data.friends || [])
      setIncoming(data.incoming || [])
      setOutgoing(data.outgoing || [])
    } catch {}
  }

  useEffect(() => { loadFriends() }, [user?.id])
  const [motivationMessages, setMotivationMessages] = useState<any[]>([])
  const [expandedProgress, setExpandedProgress] = useState<string | null>(null)
  const [expandedPyramid, setExpandedPyramid] = useState<string | null>(null)
  const [period, setPeriod] = useState<'all' | 'year' | 'season' | 'month' | 'week' | 'custom'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [profileTab, setProfileTab] = useState<'ascents' | 'projects'>('ascents')
  const [styleFilter, setStyleFilter] = useState<string | null>(null)

  // Load avatar from server
  useEffect(() => {
    if (!user?.id) return
    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    fetch(`${API_BASE}/sync/users`).then(r => r.json()).then((users: any[]) => {
      const me = users.find((u: any) => u.id === user.id)
      if (me?.avatar_url) setAvatarUrl(me.avatar_url + '?t=' + Date.now())
    }).catch(() => {})
    // Load contacts + privacy from public-profile (self sees everything)
    fetch(`${API_BASE}/sync/user/${user.id}/public-profile?viewer=${user.id}`).then(r => r.json()).then((p: any) => {
      if (p.telegramHandle) setTgHandle(p.telegramHandle)
      if (p.whatsappPhone) setWaPhone(p.whatsappPhone)
      if (p.privacy) setPrivacy(prev => ({ ...prev, ...p.privacy }))
    }).catch(() => {})
  }, [user?.id])

  const saveContacts = async () => {
    if (!user?.id) return
    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    await fetch(`${API_BASE}/sync/user/contacts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, telegramHandle: tgHandle, whatsappPhone: waPhone }),
    }).catch(() => {})
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2500)
  }

  const [findFriendOpen, setFindFriendOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findResults, setFindResults] = useState<Array<{ id: string; display_name: string; avatar_url: string | null }>>([])
  const [findStatus, setFindStatus] = useState<Record<string, 'sent' | 'friends' | 'incoming' | 'outgoing' | 'none'>>({})

  const searchUsers = async (q?: string) => {
    if (!user?.id) return
    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    try {
      const r = await fetch(`${API_BASE}/sync/users`)
      const all: any[] = await r.json()
      const query = (q ?? findQuery).trim().toLowerCase()
      let matches = all.filter(u => u.id !== user.id)
      if (query) matches = matches.filter(u => u.display_name.toLowerCase().includes(query))
      // Sort: with avatars first, then alphabetic
      matches.sort((a, b) => {
        if (!!a.avatar_url !== !!b.avatar_url) return a.avatar_url ? -1 : 1
        return a.display_name.localeCompare(b.display_name)
      })
      matches = matches.slice(0, 50)
      setFindResults(matches)
      // Get friend status for each
      const statuses: Record<string, any> = {}
      await Promise.all(matches.map(async u => {
        const sr = await fetch(`${API_BASE}/sync/friend/status?a=${user.id}&b=${u.id}`).then(r => r.json()).catch(() => ({ status: 'none' }))
        statuses[u.id] = sr.status === 'friends' ? 'friends' : sr.status === 'pending_outgoing' ? 'outgoing' : sr.status === 'pending_incoming' ? 'incoming' : 'none'
      }))
      setFindStatus(statuses)
    } catch {}
  }

  const sendFriendRequest = async (toId: string) => {
    if (!user?.id) return
    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    await fetch(`${API_BASE}/sync/friend/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromId: user.id, toId }),
    }).catch(() => {})
    setFindStatus(prev => ({ ...prev, [toId]: 'outgoing' }))
    loadFriends()
  }

  const acceptFriend = async (fromId: string) => {
    if (!user?.id) return
    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    await fetch(`${API_BASE}/sync/friend/accept`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, fromId }),
    }).catch(() => {})
    loadFriends()
  }

  const rejectFriend = async (otherId: string) => {
    if (!user?.id) return
    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    await fetch(`${API_BASE}/sync/friend/remove`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, otherId }),
    }).catch(() => {})
    loadFriends()
  }

  const savePrivacy = async (next: typeof privacy) => {
    if (!user?.id) return
    setPrivacy(next)
    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    await fetch(`${API_BASE}/sync/user/privacy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, settings: next }),
    }).catch(() => {})
  }

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
      if (period === 'custom') {
        if (dateFrom && a.date < dateFrom) return false
        if (dateTo && a.date > dateTo) return false
        return true
      }
      const date = new Date(a.date).getTime()
      if (period === 'week') return now - date < 7 * 86400000
      if (period === 'month') return now - date < 30 * 86400000
      if (period === 'season') return now - date < 90 * 86400000
      if (period === 'year') return now - date < 365 * 86400000
      return true
    })
    const routeMap = new Map(routes.map((r) => [r.id, r]))
    const completed = myAscents.filter((a) => a.style !== 'attempt')
    // Points: only FIRST scored ascent per route counts (repeats give 0 points)
    const firstScoredPerRoute = new Map<string, typeof completed[number]>()
    for (const a of completed) {
      if (!SCORED_STYLES.includes(a.style)) continue
      const route = routeMap.get(a.routeId)
      const key = route?.name || a.routeId
      const existing = firstScoredPerRoute.get(key)
      if (!existing || a.date < existing.date) firstScoredPerRoute.set(key, a)
    }
    const scoredPoints = [...firstScoredPerRoute.values()].map(a => {
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

    // Grade pyramid with route details
    const gradeRoutes: Record<string, Array<{ id: string; name: string; grade: string; style: string }>> = {}
    for (const a of completed) {
      const route = routeMap.get(a.routeId)
      if (route) {
        if (!gradeRoutes[route.grade]) gradeRoutes[route.grade] = []
        // Deduplicate by routeId (keep best style)
        if (!gradeRoutes[route.grade].some(r => r.id === route.id)) {
          gradeRoutes[route.grade].push({ id: route.id, name: route.name, grade: route.grade, style: a.style })
        }
      }
    }
    const pyramid = Object.entries(gradeRoutes)
      .map(([grade, routes]) => ({
        grade,
        count: routes.length,
        routes,
        sort: routeMap.get(completed.find((a) => {
          const r = routeMap.get(a.routeId)
          return r?.grade === grade
        })?.routeId || '')?.gradeSort || 0,
      }))
      .sort((a, b) => a.sort - b.sort)

    return {
      totalAscents: myAscents.length,
      completedAscents: completed.length,
      totalScore,
      bestGrade,
      byStyle,
      pyramid,
      pending: myAscents.filter((a) => a.syncStatus === 'pending').length,
    }
  }, [ascents, routes, user?.id, period, dateFrom, dateTo])

  // Achievements
  const existingAchievements = useLiveQuery(
    () => user?.id ? db.achievements.where('userId').equals(user.id).toArray() : [],
    [user?.id],
  )

  const earnedAchievements = useMemo(() => {
    if (!ascents || !routes || !sectors || !user?.id || !existingAchievements) return []
    const existingKeys = new Set(existingAchievements.map(a => `${a.type}:${a.description}`))
    // Use type:targetId pattern to match
    const existingTypeTargets = new Set(existingAchievements.map(a => {
      const parts = a.id.split(':')
      return `${a.type}:${parts[1] || ''}`
    }))
    return calculateAchievements(
      ascents.filter(a => a.userId === user.id),
      routes,
      sectors,
      existingTypeTargets,
    )
  }, [ascents, routes, sectors, user?.id, existingAchievements])

  // Save newly earned achievements to DB and sync
  useEffect(() => {
    if (!earnedAchievements.length || !user?.id) return
    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    for (const ach of earnedAchievements) {
      const id = `${ach.type}:${ach.targetId || 'all'}`
      const now = new Date().toISOString()
      db.achievements.put({
        id,
        userId: user.id,
        type: ach.type,
        name: ach.name,
        description: ach.description,
        earnedAt: now,
        syncStatus: 'synced',
      }).catch(() => {})
      // Sync to server
      fetch(`${API_BASE}/sync/achievement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, userId: user.id, type: ach.type, targetId: ach.targetId, name: ach.name, earnedAt: now }),
      }).catch(() => {})
    }
  }, [earnedAchievements, user?.id])

  const allAchievements = useMemo(() => {
    const existing = (existingAchievements || []).map(a => ({
      type: a.type, name: a.name, description: a.description,
      icon: a.type === 'sector_master' ? '🥇' : a.type === 'grade_king' ? '👑' : a.type === 'type_master' ? (a.name.includes('мульти') ? '🧗' : '🪨') : a.type === 'admin' ? '🛡' : '🏆',
      earnedAt: a.earnedAt,
    }))
    const fresh = earnedAchievements.map(a => ({ ...a, earnedAt: new Date().toISOString() }))
    return [...existing, ...fresh]
  }, [existingAchievements, earnedAchievements])

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

    setSaving(true)
    const now = new Date().toISOString()
    // Only award points for FIRST scored ascent of a route; repeats count for stats but give 0 points
    const isRepeat = SCORED_STYLES.includes(style) && hasScoredAscent
    const points = (SCORED_STYLES.includes(style) && !isRepeat) ? calculatePoints(selectedRoute.grade, style as any) : 0

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

      // Motivation messages
      try {
        const myAscents = await db.ascents.where('userId').equals(user?.id ?? '').toArray()
        const msgs = getMotivationMessages(myAscents, { routeId: selectedRoute.id, style }, routes || [], sectors || [])
        console.log('Motivation msgs:', msgs.length, JSON.stringify(msgs))
        if (msgs.length > 0) {
          setTimeout(() => setMotivationMessages(msgs), 500)
        }
      } catch (e) { console.error('Motivation error:', e) }
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
          {foundUsers.length > 0 && !pinForUser && (
            <div className="mb-3 space-y-2">
              <p className="text-xs text-gray-500">{t('profile.existingFound')}:</p>
              {foundUsers.map(u => (
                <button
                  key={u.id}
                  onClick={() => {
                    if (u.has_pin) {
                      setPinForUser(u.id)
                      setPinInput('')
                      setPinError(false)
                    } else {
                      restore({ id: u.id, displayName: u.display_name, createdAt: u.created_at })
                    }
                  }}
                  className="w-full text-left bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm"
                >
                  <span className="font-medium">{u.display_name}</span>
                  <span className="text-xs text-gray-400 ml-2">
                    {new Date(u.created_at).toLocaleDateString()}
                  </span>
                  <div className="float-right flex items-center gap-1">
                    {u.has_pin ? <span className="text-xs text-gray-400">🔒</span> : null}
                    <span className="text-green-600 text-xs font-medium">{t('profile.restore')}</span>
                  </div>
                </button>
              ))}
              <button
                onClick={() => { register(nameInput) }}
                className="w-full text-center text-xs text-gray-400 py-1 underline"
              >
                {t('profile.createAnyway')}
              </button>
            </div>
          )}

          {/* PIN verification for protected account */}
          {pinForUser && (
            <div className="mb-3 space-y-2">
              <p className="text-xs text-gray-500">{t('profile.enterPin')}</p>
              <input
                autoFocus
                type="password"
                value={pinInput}
                onChange={(e) => { setPinInput(e.target.value); setPinError(false) }}
                placeholder={t('profile.pinPlaceholder')}
                className={`w-full border rounded-lg px-4 py-3 text-sm ${pinError ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
              />
              {pinError && <p className="text-xs text-red-500">{t('profile.wrongPin')}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setPinForUser(null); setPinInput('') }}
                  className="flex-1 bg-gray-100 text-gray-600 rounded-lg py-2 text-sm"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={async () => {
                    const valid = await verifyPin(pinForUser, pinInput)
                    if (valid) {
                      const u = foundUsers.find(x => x.id === pinForUser)!
                      restore({ id: u.id, displayName: u.display_name, createdAt: u.created_at })
                    } else {
                      setPinError(true)
                    }
                  }}
                  disabled={!pinInput}
                  className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40"
                >
                  {t('profile.verifyPin')}
                </button>
              </div>
            </div>
          )}

          {!pinForUser && (
            <>
              <input
                type="password"
                value={newPinInput}
                onChange={(e) => setNewPinInput(e.target.value)}
                placeholder={t('profile.setPinOptional')}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm mb-3"
              />
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
                  onClick={async () => {
                    if (!nameInput.trim()) return
                    const existing = await lookupByName(nameInput)
                    if (existing.length > 0) {
                      setFoundUsers(existing)
                      return
                    }
                    register(nameInput, newPinInput || undefined)
                  }}
                  disabled={!nameInput.trim()}
                  className="flex-1 bg-blue-600 text-white rounded-lg py-3 font-medium disabled:opacity-40"
                >
                  {t('profile.start')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 pb-8">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="flex flex-col items-center flex-shrink-0">
            <label htmlFor="avatar-file" className="relative cursor-pointer">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-gray-200" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xl">👤</div>
              )}
              {uploadingAvatar && <div className="absolute inset-0 bg-white/60 rounded-full flex items-center justify-center text-xs">...</div>}
            </label>
            <label htmlFor="avatar-file" className="text-[9px] text-blue-500 mt-0.5 cursor-pointer">📷 {t('profile.changePhoto')}</label>
          </div>
          <input
            id="avatar-file"
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            style={{ width: '1px', height: '1px', opacity: 0.01, position: 'absolute', left: '-100px' }}
            onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file || !user) return
                setUploadingAvatar(true)
                const reader = new FileReader()
                reader.onload = async () => {
                  const img = new Image()
                  img.onload = async () => {
                    const canvas = document.createElement('canvas')
                    const size = 200
                    canvas.width = size; canvas.height = size
                    const ctx = canvas.getContext('2d')!
                    const min = Math.min(img.width, img.height)
                    ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size)
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
                    const API_BASE = import.meta.env.VITE_API_URL || '/api'
                    try {
                      const resp = await fetch(`${API_BASE}/sync/user/avatar`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: user.id, avatarData: dataUrl }),
                      })
                      if (resp.ok) {
                        const { avatarUrl: url } = await resp.json()
                        setAvatarUrl(url + '?t=' + Date.now())
                      }
                    } catch {}
                    setUploadingAvatar(false)
                  }
                  img.src = reader.result as string
                }
                reader.readAsDataURL(file)
              }}
            />
          <div>
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
            {/* Achievement badges inline */}
            {allAchievements.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {allAchievements.map((a, i) => (
                  <span key={i} title={a.description} className="inline-flex items-center gap-0.5 bg-yellow-50 border border-yellow-200 rounded-full px-1.5 py-0.5 text-[10px]">
                    <span>{a.icon}</span>
                    <span className="font-medium text-yellow-800">{a.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
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

      {/* PIN setup for existing users */}
      {settingPin ? (
        <div className="flex items-center gap-2 mb-3">
          <input
            autoFocus
            type="password"
            value={newPinInput}
            onChange={(e) => setNewPinInput(e.target.value)}
            placeholder={t('profile.pinPlaceholder')}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm w-40"
          />
          <button
            onClick={async () => {
              if (!newPinInput) return
              const ok = await setPin(newPinInput)
              if (ok) { setPinSaved(true); setSettingPin(false); setNewPinInput(''); setTimeout(() => setPinSaved(false), 3000) }
            }}
            disabled={!newPinInput}
            className="text-xs text-blue-600 font-medium disabled:opacity-40"
          >
            {t('profile.savePin')}
          </button>
          <button onClick={() => setSettingPin(false)} className="text-xs text-gray-400">{t('cancel')}</button>
        </div>
      ) : (
        <div className="flex gap-3 mb-2">
          <button
            onClick={() => setSettingPin(true)}
            className="text-xs text-gray-400 flex items-center gap-1"
          >
            🔒 {pinSaved ? t('profile.pinSaved') : t('profile.setPin')}
          </button>
          <button
            onClick={() => setShowSettings(s => !s)}
            className="text-xs text-gray-400 flex items-center gap-1"
          >
            ⚙ {t('profile.settings')}
          </button>
        </div>
      )}

      {/* Incoming friend requests */}
      {incoming.length > 0 && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-2">
          <h3 className="text-xs font-semibold text-yellow-800">{t('friend.incomingTitle')} ({incoming.length})</h3>
          {incoming.map(req => (
            <div key={req.fromId} className="flex items-center gap-2">
              {req.avatarUrl
                ? <img src={req.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                : <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm">👤</div>}
              <Link to={`/user/${req.fromId}`} className="flex-1 text-sm font-medium text-blue-700 truncate">{req.name}</Link>
              <button onClick={() => acceptFriend(req.fromId)} className="text-xs bg-green-600 text-white rounded px-2 py-1">{t('friend.accept')}</button>
              <button onClick={() => rejectFriend(req.fromId)} className="text-xs bg-gray-200 text-gray-600 rounded px-2 py-1">{t('friend.reject')}</button>
            </div>
          ))}
        </div>
      )}

      {/* Friends section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-500">
            {t('friend.title')}{friends.length > 0 ? ` (${friends.length})` : ''}
          </h3>
          <button
            onClick={() => { setFindFriendOpen(true); setFindQuery(''); setFindResults([]); setTimeout(() => searchUsers(''), 50) }}
            className="text-xs text-blue-600 font-medium"
          >+ {t('friend.find')}</button>
        </div>
        {(friends.length > 0 || outgoing.length > 0) ? (
          <div className="flex flex-wrap gap-2">
            {friends.map(f => (
              <Link key={f.id} to={`/user/${f.id}`} className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-full pl-1 pr-2.5 py-0.5">
                {f.avatarUrl
                  ? <img src={f.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                  : <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[10px]">👤</span>}
                <span className="text-xs font-medium text-blue-700">{f.name}</span>
              </Link>
            ))}
            {outgoing.map(o => (
              <div key={o.toId} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full pl-1 pr-2.5 py-0.5">
                <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[10px]">👤</span>
                <span className="text-xs text-gray-500">{o.name}</span>
                <span className="text-[9px] text-gray-400">⏳</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400">{t('friend.empty')}</p>
        )}
      </div>

      {/* Find friend modal */}
      {findFriendOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex flex-col" onClick={() => setFindFriendOpen(false)}>
          <div className="flex-1" onClick={() => setFindFriendOpen(false)} />
          <div className="bg-white w-full rounded-t-2xl p-4 animate-slide-up overflow-y-auto" style={{ maxHeight: 'calc(100vh - 8rem)', marginBottom: '4rem' }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold">{t('friend.findTitle')}</h3>
              <button onClick={() => setFindFriendOpen(false)} className="text-gray-400 text-2xl leading-none">&times;</button>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                autoFocus
                value={findQuery}
                onChange={e => { setFindQuery(e.target.value); searchUsers(e.target.value) }}
                placeholder={t('friend.findPlaceholder')}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            {findResults.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">{t('friend.noResults')}</p>
            )}
            <div className="space-y-2">
              {findResults.map(u => {
                const status = findStatus[u.id] || 'none'
                return (
                  <div key={u.id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                    <Link to={`/user/${u.id}`} onClick={() => setFindFriendOpen(false)}>
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                        : <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center">👤</div>}
                    </Link>
                    <Link to={`/user/${u.id}`} onClick={() => setFindFriendOpen(false)} className="flex-1 text-sm font-medium text-blue-700 truncate">
                      {u.display_name}
                    </Link>
                    {status === 'none' && (
                      <button onClick={() => sendFriendRequest(u.id)} className="text-xs bg-blue-600 text-white rounded px-2 py-1 font-medium">
                        + {t('friend.add')}
                      </button>
                    )}
                    {status === 'outgoing' && <span className="text-xs text-gray-500">⏳ {t('friend.requestSent')}</span>}
                    {status === 'incoming' && <button onClick={() => acceptFriend(u.id)} className="text-xs bg-green-600 text-white rounded px-2 py-1">✓ {t('friend.accept')}</button>}
                    {status === 'friends' && <span className="text-xs text-green-700">✓ {t('friend.statusFriends')}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Contacts + privacy settings panel */}
      {showSettings && (
        <div className="bg-gray-50 rounded-lg p-3 mb-4 border border-gray-200 space-y-3">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 mb-2">{t('profile.contacts')}</h3>
            <div className="flex gap-2 mb-2">
              <span className="text-sm self-center w-6">📱</span>
              <input
                type="text"
                value={tgHandle}
                onChange={e => setTgHandle(e.target.value)}
                placeholder="@username"
                className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
              />
            </div>
            <a
              href="https://t.me/TamgalyClimbing"
              target="_blank"
              rel="noreferrer"
              className="block bg-sky-50 text-sky-700 rounded px-3 py-1.5 text-xs text-center mb-2"
            >
              📢 {t('profile.subscribeChannel')} → @TamgalyClimbing
            </a>
            <div className="flex gap-2 mb-2">
              <span className="text-sm self-center w-6">💬</span>
              <input
                type="tel"
                value={waPhone}
                onChange={e => setWaPhone(e.target.value)}
                placeholder="+7..."
                className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
              />
            </div>
            <button
              onClick={saveContacts}
              className="w-full bg-blue-600 text-white rounded px-3 py-1.5 text-xs font-medium"
            >
              {settingsSaved ? '✓ ' + t('saved') : t('save')}
            </button>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 mb-2">{t('profile.privacy')}</h3>
            <div className="space-y-1.5">
              {([
                ['routes', t('profile.privacyRoutes')],
                ['achievements', t('profile.privacyAchievements')],
                ['maxGrade', t('profile.privacyMaxGrade')],
                ['projects', t('profile.privacyProjects')],
                ['gradeVotes', t('profile.privacyGradeVotes')],
                ['stats', t('profile.privacyStats')],
                ['pyramid', t('profile.privacyPyramid')],
                ['dates', t('profile.privacyDates')],
                ['contacts', t('profile.privacyContacts')],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">{label}</span>
                  <select
                    value={privacy[key]}
                    onChange={e => savePrivacy({ ...privacy, [key]: e.target.value as any })}
                    className="border border-gray-200 rounded px-1.5 py-0.5 text-xs bg-white"
                  >
                    <option value="all">🌍 {t('profile.privacyAll')}</option>
                    <option value="friends">👥 {t('profile.privacyFriends')}</option>
                    <option value="nobody">🔒 {t('profile.privacyNobody')}</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Progress towards achievements */}
      {(() => {
        if (!ascents || !routes || !sectors || !user?.id) return null
        const progress = getAchievementProgress(
          ascents.filter(a => a.userId === user.id),
          routes, sectors,
        )
        if (progress.length === 0) return null
        return (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-gray-500 mb-2">{t('profile.progressTitle')}</h3>
            <div className="space-y-1.5">
              {progress.map((p, i) => {
                const key = `${p.type}:${p.label}`
                const isExpanded = expandedProgress === key
                return (
                  <div key={i}>
                    <div
                      className="flex items-center justify-between text-xs mb-0.5 cursor-pointer"
                      onClick={() => setExpandedProgress(isExpanded ? null : key)}
                    >
                      <span>{p.icon} {p.label} <span className="text-gray-300">{isExpanded ? '▲' : '▼'}</span></span>
                      <span className="text-gray-400 font-mono">{p.current}/{p.total}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
                      <div
                        className={`h-full rounded-full transition-all ${p.type === 'sector' ? 'bg-yellow-400' : 'bg-purple-400'}`}
                        style={{ width: `${(p.current / p.total) * 100}%` }}
                      />
                    </div>
                    {isExpanded && p.routes && (
                      <div className="ml-2 mb-2 space-y-0.5">
                        {p.routes.map(r => (
                          <Link
                            key={r.id}
                            to={`/route/${r.id}`}
                            className={`flex items-center gap-2 text-xs py-0.5 px-1.5 rounded ${r.climbed ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}
                          >
                            <span className={`font-mono font-bold ${r.climbed ? '' : 'opacity-50'}`}>{r.grade}</span>
                            <span className="truncate">{r.climbed ? '✓' : '○'} {td(r.name)}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Motivation toasts */}
      {motivationMessages.length > 0 && (
        <MotivationToast messages={motivationMessages} onDone={() => setMotivationMessages([])} />
      )}

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
                <TranslatedName name={td(selectedRoute.name)} className="text-sm font-medium" />
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

              {/* Repeat info (not blocking) */}
              {SCORED_STYLES.includes(style) && hasScoredAscent && (
                <div className="bg-gray-50 text-gray-600 text-xs rounded-lg px-3 py-2 mb-3">
                  {t('profile.repeatAscent')}
                </div>
              )}

              {/* Save */}
              <button
                onClick={handleSaveAscent}
                disabled={saving}
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
                  <span className="text-sm font-medium truncate flex-1">{route ? <TranslatedName name={td(route.name)} /> : item.routeId}</span>
                  <button
                    onClick={async (e) => { e.preventDefault(); e.stopPropagation(); await db.wishlist.delete(item.id) }}
                    className="text-gray-400 hover:text-red-500 p-1 text-xs flex-shrink-0"
                  >✕</button>
                </Link>
              )
            })}
          </div>
        )
      ) : !stats || (stats.totalAscents === 0 && period === 'all' && !styleFilter) ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">👤</p>
          <p className="text-sm">{t('profile.noAscents')}</p>
          <p className="text-xs mt-1">{t('profile.noAscentsHint')}</p>
        </div>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-2 mb-6">
            <Link to="/leaderboard" className="bg-blue-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.totalScore}</div>
              <div className="text-xs text-blue-500">{t('profile.points')} →</div>
            </Link>
            <div className="bg-green-50 rounded-lg p-3 text-center cursor-pointer" onClick={() => { setExpandedPyramid(stats.bestGrade); document.getElementById('grade-pyramid')?.scrollIntoView({ behavior: 'smooth' }) }}>
              <div className="text-2xl font-bold text-green-600">{stats.bestGrade || '—'}</div>
              <div className="text-xs text-green-500">{t('profile.bestGrade')} →</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 text-center cursor-pointer" onClick={() => document.getElementById('ascent-history')?.scrollIntoView({ behavior: 'smooth' })}>
              <div className="text-2xl font-bold text-purple-600">{stats.completedAscents}</div>
              <div className="text-xs text-purple-500">{t('profile.ascents')} →</div>
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
              <h2 id="grade-pyramid" className="text-sm font-semibold mb-2">{t('profile.gradePyramid')}</h2>
              <div className="space-y-1 mb-6">
                {stats.pyramid.map(({ grade, count, routes: pyramidRoutes }) => {
                  const maxCount = Math.max(...stats.pyramid.map((p) => p.count))
                  const width = Math.max(20, (count / maxCount) * 100)
                  const isExp = expandedPyramid === grade
                  return (
                    <div key={grade}>
                      <div
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => setExpandedPyramid(isExp ? null : grade)}
                      >
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
                        <span className="text-gray-300 text-[10px]">{isExp ? '▲' : '▼'}</span>
                      </div>
                      {isExp && pyramidRoutes && (
                        <div className="ml-12 mt-1 mb-2 space-y-0.5">
                          {pyramidRoutes.map(r => (
                            <Link
                              key={r.id}
                              to={`/route/${r.id}`}
                              className="flex items-center gap-2 text-xs py-0.5 px-1.5 rounded bg-blue-50 text-blue-700"
                            >
                              <span className="font-mono font-bold">{r.grade}</span>
                              <span className="truncate">{td(r.name)}</span>
                              <span className="text-blue-400 ml-auto text-[10px]">{r.style}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Period filter + reset */}
          <div className="flex flex-wrap gap-1 mb-1.5">
            {(period !== 'all' || styleFilter) && (
              <button
                onClick={() => { setPeriod('all'); setDateFrom(''); setDateTo(''); setStyleFilter(null) }}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-500"
              >
                ✕ {t('home.clearFilters')}
              </button>
            )}
            {(['all', 'year', 'season', 'month', 'week'] as const).map(p => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setDateFrom(''); setDateTo('') }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  period === p ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {t(p === 'all' ? 'leaderboard.allTime' : p === 'year' ? 'profile.year' : p === 'season' ? 'leaderboard.season' : p === 'month' ? 'leaderboard.month' : 'leaderboard.week' as any)}
              </button>
            ))}
            <button
              onClick={() => setPeriod('custom')}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                period === 'custom' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              📅 {t('profile.customDates')}
            </button>
          </div>
          {period === 'custom' && (() => {
            const months = [
              { value: '01', label: 'Янв' }, { value: '02', label: 'Фев' },
              { value: '03', label: 'Мар' }, { value: '04', label: 'Апр' },
              { value: '05', label: 'Май' }, { value: '06', label: 'Июн' },
              { value: '07', label: 'Июл' }, { value: '08', label: 'Авг' },
              { value: '09', label: 'Сен' }, { value: '10', label: 'Окт' },
              { value: '11', label: 'Ноя' }, { value: '12', label: 'Дек' },
            ]
            const curYear = new Date().getFullYear()
            const years = Array.from({ length: 5 }, (_, i) => curYear - i)
            const fromMonth = dateFrom.slice(5, 7) || ''
            const fromYear = dateFrom.slice(0, 4) || ''
            const toMonth = dateTo.slice(5, 7) || ''
            const toYear = dateTo.slice(0, 4) || ''
            const setFrom = (y: string, m: string) => setDateFrom(y && m ? `${y}-${m}-01` : '')
            const setTo = (y: string, m: string) => {
              if (!y || !m) { setDateTo(''); return }
              const last = new Date(parseInt(y), parseInt(m), 0).getDate()
              setDateTo(`${y}-${m}-${last}`)
            }
            return (
              <div className="flex gap-1 mb-2 items-center">
                <select value={fromMonth} onChange={e => setFrom(fromYear || String(curYear), e.target.value)}
                  className="border border-gray-200 rounded-lg px-1.5 py-1.5 text-xs">
                  <option value="">от мес.</option>
                  {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select value={fromYear} onChange={e => setFrom(e.target.value, fromMonth || '01')}
                  className="border border-gray-200 rounded-lg px-1.5 py-1.5 text-xs">
                  <option value="">год</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <span className="text-gray-400 text-xs">—</span>
                <select value={toMonth} onChange={e => setTo(toYear || String(curYear), e.target.value)}
                  className="border border-gray-200 rounded-lg px-1.5 py-1.5 text-xs">
                  <option value="">до мес.</option>
                  {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select value={toYear} onChange={e => setTo(e.target.value, toMonth || '12')}
                  className="border border-gray-200 rounded-lg px-1.5 py-1.5 text-xs">
                  <option value="">год</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )
          })()}
          {/* Style filter */}
          <div className="flex gap-1 mb-3">
            {ASCENT_STYLES.map(s => (
              <button
                key={s.value}
                onClick={() => setStyleFilter(prev => prev === s.value ? null : s.value)}
                className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                  styleFilter === s.value ? STYLE_COLORS[s.value] + ' ring-1 ring-current' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {s.emoji} {t(`style.${s.value}` as any)}
              </button>
            ))}
          </div>

          {/* Ascent history */}
          <h2 id="ascent-history" className="text-sm font-semibold mb-2">{t('profile.ascentHistory')}</h2>
          <div className="space-y-2">
            {ascents?.filter(a => {
              if (a.userId !== user?.id) return false
              if (styleFilter && a.style !== styleFilter) return false
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
                      <span className="text-sm font-medium truncate">{route ? <TranslatedName name={td(route.name)} /> : ascent.routeId}</span>
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
