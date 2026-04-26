import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { useI18n } from '../lib/i18n'
import { useUser } from '../lib/userContext'
import { TranslatedName } from '../components/ui/TranslatedName'
import { isAdminLoggedIn, adminFetch } from '../lib/adminAuth'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

type PostType = 'gear' | 'partner' | 'ride'

interface Post {
  id: string
  type: PostType
  authorId: string
  authorName: string
  authorAvatar?: string | null
  authorTelegram?: string | null
  authorWhatsapp?: string | null
  title: string
  description?: string
  photos: string[]
  price?: number | null
  currency?: string | null
  eventDate?: string | null
  sectorId?: string | null
  routeId?: string | null
  fromLocation?: string | null
  toLocation?: string | null
  seats?: number | null
  gradeMin?: string | null
  gradeMax?: string | null
  rideRole?: 'driver' | 'passenger' | null
  status: 'active' | 'closed'
  createdAt: string
}

const TYPES: { value: PostType; emoji: string; key: string }[] = [
  { value: 'gear', emoji: '🛒', key: 'board.gear' },
  { value: 'partner', emoji: '🤝', key: 'board.partner' },
  { value: 'ride', emoji: '🚗', key: 'board.ride' },
]

export function BoardPage() {
  const { t, td } = useI18n()
  const { user } = useUser()
  const [activeType, setActiveType] = useState<PostType>('gear')
  const [rideFilter, setRideFilter] = useState<'all' | 'driver' | 'passenger'>('all')
  const [counts, setCounts] = useState<Record<PostType, { fresh: number; active: number }>>({
    gear: { fresh: 0, active: 0 }, partner: { fresh: 0, active: 0 }, ride: { fresh: 0, active: 0 },
  })

  // Compute fresh/active counts from a single fetch of active posts
  const computeCounts = (allActive: Post[]) => {
    const lastSeen: Record<PostType, number> = {
      gear: parseInt(localStorage.getItem('board:seen:gear') || '0'),
      partner: parseInt(localStorage.getItem('board:seen:partner') || '0'),
      ride: parseInt(localStorage.getItem('board:seen:ride') || '0'),
    }
    const next = { gear: { fresh: 0, active: 0 }, partner: { fresh: 0, active: 0 }, ride: { fresh: 0, active: 0 } }
    for (const p of allActive) {
      const t = p.type as PostType
      if (!next[t]) continue
      next[t].active++
      if (new Date(p.createdAt).getTime() > lastSeen[t]) next[t].fresh++
    }
    setCounts(next)
  }
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [zoomed, setZoomed] = useState<string | null>(null)

  const sectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())
  const sectorMap = useMemo(() => new Map((sectors || []).map(s => [s.id, s])), [sectors])

  const [allActivePosts, setAllActivePosts] = useState<Post[]>([])

  const loadPosts = async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/posts?status=active`)
      const data = await r.json()
      const all = Array.isArray(data) ? data : []
      setAllActivePosts(all)
      computeCounts(all)
    } catch { setAllActivePosts([]) }
    setLoading(false)
  }
  useEffect(() => { loadPosts() }, [])

  // Filter posts by activeType from already-fetched list
  const posts = allActivePosts.filter(p => p.type === activeType)

  // Mark current type as "seen" when user switches to it
  useEffect(() => {
    localStorage.setItem(`board:seen:${activeType}`, String(Date.now()))
    // Recompute fresh counts for other types
    computeCounts(allActivePosts)
  }, [activeType])

  const visiblePosts = activeType === 'ride' && rideFilter !== 'all'
    ? posts.filter(p => p.rideRole === rideFilter)
    : posts
  const myPosts = visiblePosts.filter(p => p.authorId === user?.id)
  const otherPosts = visiblePosts.filter(p => p.authorId !== user?.id)

  return (
    <div className="p-4 pt-12">
      <div className="flex items-baseline justify-between mb-3">
        <h1 className="text-2xl font-bold">{t('board.title')}</h1>
        {user && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-blue-600 text-white rounded-full px-3 py-1 text-xs font-medium"
          >
            + {t('board.create')}
          </button>
        )}
      </div>

      {/* Type tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto scrollbar-hide">
        {TYPES.map(tt => {
          const c = counts[tt.value]
          return (
            <button
              key={tt.value}
              onClick={() => setActiveType(tt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1 relative ${
                activeType === tt.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              <span>{tt.emoji} {t(tt.key as any)}</span>
              {c.active > 0 && (
                <span className={`text-[10px] font-mono px-1.5 py-0 rounded-full ${
                  activeType === tt.value ? 'bg-white/20' : 'bg-white text-gray-500'
                }`}>{c.active}</span>
              )}
              {c.fresh > 0 && activeType !== tt.value && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                  +{c.fresh}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Ride role sub-tabs */}
      {activeType === 'ride' && (
        <div className="flex gap-1 mb-3 overflow-x-auto scrollbar-hide">
          {([
            ['all', '🚗 ' + t('board.rideAll')],
            ['driver', '🚙 ' + t('board.rideDriver')],
            ['passenger', '🧳 ' + t('board.ridePassenger')],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setRideFilter(k)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                rideFilter === k ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-700'
              }`}
            >{label}</button>
          ))}
        </div>
      )}

      {!user && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3 text-sm text-yellow-800">
          {t('board.loginRequired')} <Link to="/profile" className="underline">{t('board.goToProfile')}</Link>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm text-center py-8">{t('loading')}</p>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">{TYPES.find(x => x.value === activeType)?.emoji}</p>
          <p className="text-sm">{t('board.empty')}</p>
        </div>
      ) : (
        <>
          {myPosts.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-gray-500 mb-2">{t('board.yours')}</h3>
              <div className="space-y-2">
                {myPosts.map(p => <PostCard key={p.id} post={p} isOwner sectorMap={sectorMap} td={td} t={t} onZoom={setZoomed} onChange={loadPosts} userId={user?.id} />)}
              </div>
            </div>
          )}
          <div className="space-y-2">
            {otherPosts.map(p => <PostCard key={p.id} post={p} sectorMap={sectorMap} td={td} t={t} onZoom={setZoomed} onChange={loadPosts} userId={user?.id} />)}
          </div>
        </>
      )}

      {showCreate && user && (
        <CreatePostModal
          type={activeType}
          userId={user.id}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadPosts() }}
        />
      )}

      {zoomed && (
        <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={() => setZoomed(null)}>
          <img src={zoomed} alt="" className="max-w-full max-h-full rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  )
}

function PostCard({ post, isOwner, sectorMap, td, t, onZoom, onChange, userId }: {
  post: Post; isOwner?: boolean; sectorMap: Map<string, any>;
  td: (s: string) => string; t: (k: any) => string;
  onZoom: (url: string) => void; onChange: () => void; userId?: string
}) {
  const sector = post.sectorId ? sectorMap.get(post.sectorId) : null
  const isAdmin = isAdminLoggedIn()
  const [editing, setEditing] = useState(false)
  const [eTitle, setETitle] = useState(post.title)
  const [eDesc, setEDesc] = useState(post.description || '')
  const [ePrice, setEPrice] = useState(post.price?.toString() || '')
  const [eEventDate, setEEventDate] = useState(post.eventDate || '')

  const close = async () => {
    await fetch(`${API_BASE}/posts/${post.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorId: userId, status: 'closed' }),
    }).catch(() => {})
    onChange()
  }
  const reopen = async () => {
    await fetch(`${API_BASE}/posts/${post.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorId: userId, status: 'active' }),
    }).catch(() => {})
    onChange()
  }
  const remove = async () => {
    if (!confirm(t('board.confirmDelete'))) return
    await fetch(`${API_BASE}/posts/${post.id}?authorId=${userId}`, { method: 'DELETE' }).catch(() => {})
    onChange()
  }
  const adminRemove = async () => {
    if (!confirm(t('board.confirmAdminDelete'))) return
    await adminFetch(`${API_BASE}/posts/${post.id}`, { method: 'DELETE' }).catch(() => {})
    onChange()
  }
  const saveEdit = async () => {
    await fetch(`${API_BASE}/posts/${post.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authorId: userId, title: eTitle.trim(),
        description: eDesc.trim() || null,
        price: ePrice ? parseInt(ePrice) : null,
        eventDate: eEventDate || null,
      }),
    }).catch(() => {})
    setEditing(false); onChange()
  }

  if (editing && isOwner) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
        <input value={eTitle} onChange={e => setETitle(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder={t('board.fieldTitle')} />
        <textarea value={eDesc} onChange={e => setEDesc(e.target.value)} rows={3} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm resize-none" placeholder={t('board.fieldDescription')} />
        {post.type === 'gear' && <input type="number" value={ePrice} onChange={e => setEPrice(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder={t('board.fieldPrice')} />}
        {(post.type === 'partner' || post.type === 'ride') && <input type="date" value={eEventDate} onChange={e => setEEventDate(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />}
        <div className="flex gap-2">
          <button onClick={saveEdit} disabled={!eTitle.trim()} className="flex-1 bg-blue-600 text-white rounded py-1.5 text-xs font-medium disabled:opacity-50">{t('save')}</button>
          <button onClick={() => setEditing(false)} className="bg-gray-200 text-gray-600 rounded px-3 text-xs">{t('cancel')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-3 ${post.status === 'closed' ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2 mb-2">
        <Link to={`/user/${post.authorId}`} className="flex items-center gap-2 flex-shrink-0">
          {post.authorAvatar
            ? <img src={post.authorAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
            : <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm">👤</div>}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <Link to={`/user/${post.authorId}`} className="text-xs font-medium text-blue-700 hover:underline truncate">
              {post.authorName}
            </Link>
            <span className="text-[10px] text-gray-400">{new Date(post.createdAt).toLocaleDateString()}</span>
          </div>
          <h3 className="text-sm font-semibold mt-0.5">{post.title}</h3>
        </div>
        {post.status === 'closed' && <span className="text-[10px] text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{t('board.closed')}</span>}
      </div>

      {post.photos.length > 0 && (
        <div className="flex gap-1 overflow-x-auto scrollbar-hide mb-2 -mx-1 px-1">
          {post.photos.map((url, i) => (
            <img
              key={i}
              src={url}
              alt=""
              onClick={() => onZoom(url)}
              className="w-24 h-24 rounded object-cover cursor-pointer flex-shrink-0"
            />
          ))}
        </div>
      )}

      {post.description && <p className="text-sm text-gray-700 mb-2 whitespace-pre-wrap">{post.description}</p>}

      {/* Type-specific info */}
      <div className="flex flex-wrap gap-2 text-xs text-gray-600 mb-2">
        {post.type === 'gear' && post.price && (
          <span className="bg-green-50 text-green-700 rounded px-1.5 py-0.5 font-medium">
            {post.price} {post.currency || '₸'}
          </span>
        )}
        {post.type === 'partner' && post.eventDate && (
          <span className="bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">📅 {post.eventDate}</span>
        )}
        {post.type === 'partner' && (post.gradeMin || post.gradeMax) && (
          <span className="bg-purple-50 text-purple-700 rounded px-1.5 py-0.5">
            {post.gradeMin || '?'}–{post.gradeMax || '?'}
          </span>
        )}
        {sector && <span className="bg-gray-50 rounded px-1.5 py-0.5">📍 <TranslatedName name={td(sector.name)} /></span>}
        {post.type === 'ride' && post.rideRole && (
          <span className={`rounded px-1.5 py-0.5 font-medium ${post.rideRole === 'driver' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {post.rideRole === 'driver' ? '🚙 ' + t('board.rideDriver') : '🧳 ' + t('board.ridePassenger')}
          </span>
        )}
        {post.type === 'ride' && post.eventDate && (
          <span className="bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">📅 {post.eventDate}</span>
        )}
        {post.type === 'ride' && (post.fromLocation || post.toLocation) && (
          <span className="bg-orange-50 text-orange-700 rounded px-1.5 py-0.5">
            {post.fromLocation || '?'} → {post.toLocation || '?'}
          </span>
        )}
        {post.type === 'ride' && post.seats != null && (
          <span className="bg-gray-50 rounded px-1.5 py-0.5">
            💺 {post.rideRole === 'passenger' ? `${t('board.passengersCount')} ${post.seats}` : post.seats}
          </span>
        )}
      </div>

      {/* Contact buttons */}
      {post.status === 'active' && !isOwner && (
        <div className="flex gap-2">
          {post.authorTelegram && (
            <a href={`https://t.me/${post.authorTelegram}`} target="_blank" rel="noreferrer"
              className="flex-1 bg-sky-100 text-sky-700 rounded-lg py-1.5 text-center text-xs font-medium">
              📱 Telegram
            </a>
          )}
          {post.authorWhatsapp && (
            <a href={`https://wa.me/${post.authorWhatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
              className="flex-1 bg-green-100 text-green-700 rounded-lg py-1.5 text-center text-xs font-medium">
              💬 WhatsApp
            </a>
          )}
          {!post.authorTelegram && !post.authorWhatsapp && (
            <Link to={`/user/${post.authorId}`} className="flex-1 bg-gray-100 text-gray-600 rounded-lg py-1.5 text-center text-xs">
              {t('board.openProfile')}
            </Link>
          )}
        </div>
      )}

      {/* Owner actions */}
      {isOwner && (
        <div className="flex gap-3 text-xs mt-2">
          <button onClick={() => setEditing(true)} className="text-blue-600">{t('board.edit')}</button>
          {post.status === 'active'
            ? <button onClick={close} className="text-gray-500">{t('board.close')}</button>
            : <button onClick={reopen} className="text-blue-600">{t('board.reopen')}</button>}
          <button onClick={remove} className="text-red-500 ml-auto">{t('board.delete')}</button>
        </div>
      )}

      {/* Admin actions (visible to admin on any post) */}
      {!isOwner && isAdmin && (
        <div className="flex gap-3 text-xs mt-2 pt-2 border-t border-gray-100">
          <span className="text-gray-400">🛡 {t('board.adminTools')}</span>
          <button onClick={adminRemove} className="text-red-500 ml-auto">{t('board.delete')}</button>
        </div>
      )}
    </div>
  )
}

function CreatePostModal({ type, userId, onClose, onCreated }: {
  type: PostType; userId: string; onClose: () => void; onCreated: () => void
}) {
  const { t } = useI18n()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [sectorId, setSectorId] = useState('')
  const [fromLoc, setFromLoc] = useState('')
  const [toLoc, setToLoc] = useState('Тамгалы')
  const [seats, setSeats] = useState('')
  const [gradeMin, setGradeMin] = useState('')
  const [gradeMax, setGradeMax] = useState('')
  const [rideRole, setRideRole] = useState<'driver' | 'passenger'>('driver')
  const [photos, setPhotos] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const sectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.src = url
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject })
    const canvas = document.createElement('canvas')
    const maxW = 1200
    const scale = img.width > maxW ? maxW / img.width : 1
    canvas.width = img.width * scale; canvas.height = img.height * scale
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
    URL.revokeObjectURL(url)
    canvas.width = 0; canvas.height = 0
    setPhotos(p => [...p, dataUrl])
  }

  const generateTitle = () => {
    if (type === 'gear') {
      const desc = description.trim()
      if (desc) return desc.split('\n')[0].slice(0, 60)
      if (price) return `${t('board.gear')} · ${price} ₸`
      return t('board.gear')
    }
    if (type === 'partner') {
      const parts: string[] = ['🤝']
      if (eventDate) parts.push(eventDate)
      if (gradeMin || gradeMax) parts.push(`${gradeMin || '?'}–${gradeMax || '?'}`)
      return parts.length > 1 ? parts.join(' · ') : t('board.create_partner')
    }
    if (type === 'ride') {
      const icon = rideRole === 'driver' ? '🚙' : '🧳'
      const parts: string[] = [icon]
      if (fromLoc || toLoc) parts.push(`${fromLoc || '?'} → ${toLoc || '?'}`)
      if (eventDate) parts.push(eventDate)
      return parts.length > 1 ? parts.join(' · ') : t('board.create_ride')
    }
    return ''
  }

  const submit = async () => {
    if (saving) return
    const finalTitle = title.trim() || generateTitle()
    const finalDesc = description.trim()
    if (!finalTitle && !finalDesc) {
      alert(t('board.needContent'))
      return
    }
    setSaving(true)
    const payload: any = {
      type, authorId: userId,
      title: finalTitle || finalDesc.slice(0, 60),
      description: finalDesc || null,
      photos,
    }
    if (type === 'gear') {
      payload.price = price ? parseInt(price) : null
      payload.currency = '₸'
    }
    if (type === 'partner') {
      payload.eventDate = eventDate || null
      payload.sectorId = sectorId || null
      payload.gradeMin = gradeMin || null
      payload.gradeMax = gradeMax || null
    }
    if (type === 'ride') {
      payload.rideRole = rideRole
      payload.eventDate = eventDate || null
      payload.fromLocation = fromLoc.trim() || null
      payload.toLocation = toLoc.trim() || null
      payload.seats = seats ? parseInt(seats) : null
    }
    try {
      await fetch(`${API_BASE}/posts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      onCreated()
    } catch {} finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end" style={{ paddingBottom: '4rem' }}>
      <div className="bg-white w-full rounded-t-2xl p-4 pb-6 animate-slide-up max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-bold">
            {TYPES.find(x => x.value === type)?.emoji} {t(`board.create_${type}` as any)}
          </h3>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">&times;</button>
        </div>

        <textarea
          value={description} onChange={e => setDescription(e.target.value)}
          rows={3}
          placeholder={t('board.fieldDescription')}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 resize-none"
        />

        <input
          value={title} onChange={e => setTitle(e.target.value)}
          placeholder={t('board.fieldTitleOptional')}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs mb-2 text-gray-600"
        />

        {type === 'gear' && (
          <div className="flex gap-2 mb-2">
            <input
              type="number" value={price} onChange={e => setPrice(e.target.value)}
              placeholder={t('board.fieldPrice')}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <span className="self-center text-sm text-gray-500">₸</span>
          </div>
        )}

        {type === 'partner' && (
          <>
            <input
              type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
            />
            <select
              value={sectorId} onChange={e => setSectorId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 bg-white"
            >
              <option value="">{t('board.fieldAnySector')}</option>
              {sectors?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="flex gap-2 mb-2">
              <input
                value={gradeMin} onChange={e => setGradeMin(e.target.value)}
                placeholder={t('board.fieldGradeFrom')}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <span className="self-center text-sm text-gray-400">—</span>
              <input
                value={gradeMax} onChange={e => setGradeMax(e.target.value)}
                placeholder={t('board.fieldGradeTo')}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </>
        )}

        {type === 'ride' && (
          <>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                type="button"
                onClick={() => setRideRole('driver')}
                className={`py-2 rounded-lg text-xs font-medium ${rideRole === 'driver' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600'}`}
              >🚙 {t('board.rideDriver')}</button>
              <button
                type="button"
                onClick={() => setRideRole('passenger')}
                className={`py-2 rounded-lg text-xs font-medium ${rideRole === 'passenger' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'}`}
              >🧳 {t('board.ridePassenger')}</button>
            </div>
            <input
              type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
            />
            <div className="flex gap-2 mb-2">
              <input
                value={fromLoc} onChange={e => setFromLoc(e.target.value)}
                placeholder={t('board.fieldFrom')}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <span className="self-center text-sm">→</span>
              <input
                value={toLoc} onChange={e => setToLoc(e.target.value)}
                placeholder={t('board.fieldTo')}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <input
              type="number" value={seats} onChange={e => setSeats(e.target.value)}
              placeholder={rideRole === 'driver' ? t('board.fieldSeats') : t('board.fieldPassengersCount')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
            />
          </>
        )}

        {/* Photos */}
        <div className="mb-3">
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative">
                <img src={p} className="w-16 h-16 object-cover rounded" alt="" />
                <button
                  onClick={() => setPhotos(arr => arr.filter((_, j) => j !== i))}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                >×</button>
              </div>
            ))}
            {photos.length < 5 && (
              <label className="w-16 h-16 border-2 border-dashed border-gray-300 rounded flex items-center justify-center cursor-pointer text-gray-400 text-2xl">
                +
                <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
              </label>
            )}
          </div>
        </div>

        <button
          onClick={submit}
          disabled={saving}
          className="w-full bg-blue-600 text-white rounded-lg py-3 font-medium disabled:opacity-50"
        >
          {saving ? t('saving') : t('board.publish')}
        </button>
      </div>
    </div>
  )
}
