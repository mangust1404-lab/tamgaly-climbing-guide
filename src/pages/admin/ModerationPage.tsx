import { useState, useEffect, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Suggestion } from '../../lib/db/schema'
import { useI18n } from '../../lib/i18n'
import { AdminNav } from '../../components/admin/AdminNav'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

async function saveTopoData() {
  try {
    const topos = await db.topos.toArray()
    const topoRoutes = await db.topoRoutes.toArray()
    const sectors = await db.sectors.toArray()
    const sectorCovers: Record<string, string> = {}
    for (const s of sectors) { if (s.coverImageUrl) sectorCovers[s.id] = s.coverImageUrl }
    const meta = await db.syncMeta.get('topoDataVersion')
    const version = (parseInt(meta?.value || '0') || 0) + 1
    const data = { version, exportedAt: new Date().toISOString(), topos, topoRoutes, sectorCovers }
    const resp = await fetch('/api/save-topo-data', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    if (resp.ok) await db.syncMeta.put({ key: 'topoDataVersion', value: String(version) })
  } catch { /* production — no save endpoint */ }
}

interface ServerSuggestion {
  id: string
  user_id: string
  user_name: string
  sector_id: string
  type: string
  status: string
  data: string
  comment: string | null
  created_at: string
}

function toLocal(s: ServerSuggestion): Suggestion {
  return {
    id: s.id,
    userId: s.user_id,
    userName: s.user_name,
    sectorId: s.sector_id,
    type: s.type as Suggestion['type'],
    status: s.status as Suggestion['status'],
    data: s.data,
    comment: s.comment ?? undefined,
    createdAt: s.created_at,
  }
}

export function ModerationPage() {
  const { t, td } = useI18n()
  const [serverSuggestions, setServerSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const localPending = useLiveQuery(
    () => db.suggestions.where('status').equals('pending').reverse().sortBy('createdAt'),
  )

  const fetchFromServer = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const resp = await fetch(`${API_BASE}/sync/suggestions?status=pending`)
      if (resp.ok) {
        const data = await resp.json() as ServerSuggestion[]
        setServerSuggestions(data.map(toLocal))
      } else {
        setError(`Server: ${resp.status}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchFromServer() }, [fetchFromServer])

  const serverIds = new Set(serverSuggestions.map(s => s.id))
  const localOnly = (localPending ?? []).filter(s => !serverIds.has(s.id))
  const pending = [...serverSuggestions, ...localOnly]

  const handleApprove = async (s: Suggestion) => {
    if (s.type === 'photo') {
      const topoCount = await db.topos.where('sectorId').equals(s.sectorId).count()
      await db.topos.add({
        id: `topo-${Date.now()}`,
        sectorId: s.sectorId,
        imageUrl: s.data,
        imageWidth: 0,
        imageHeight: 0,
        type: 'topo',
        sortOrder: topoCount + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    } else if (s.type === 'route') {
      const info = JSON.parse(s.data) as { name?: string; grade?: string; type?: string; routeId?: string; quickdraws?: number; ropeLength?: number; terrainTags?: string[]; holdTypes?: string[] }
      if (info.routeId) {
        const updates: Record<string, unknown> = {}
        if (info.quickdraws) updates.quickdraws = info.quickdraws
        if (info.ropeLength) updates.ropeLength = info.ropeLength
        if (info.terrainTags?.length) updates.terrainTags = info.terrainTags
        if (info.holdTypes?.length) updates.holdTypes = info.holdTypes
        if (Object.keys(updates).length > 0) {
          await db.routes.update(info.routeId, updates)
          try {
            await fetch(`${API_BASE}/routes/${info.routeId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updates),
            })
          } catch { /* offline */ }
        }
      } else if (info.name && info.grade) {
        const gradeSort = gradeToSort(info.grade)
        await db.routes.add({
          id: `route-${Date.now()}`,
          sectorId: s.sectorId,
          name: info.name,
          slug: info.name.toLowerCase().replace(/\s+/g, '-'),
          grade: info.grade,
          gradeSystem: 'french',
          gradeSort,
          pitches: 1,
          routeType: (info.type || 'sport') as 'sport' | 'trad' | 'boulder',
          status: 'published',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }
    }

    try {
      await fetch(`${API_BASE}/sync/suggestion/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      })
    } catch { /* offline */ }

    await db.suggestions.update(s.id, { status: 'approved', reviewedAt: new Date().toISOString() })
    if (s.type === 'photo') saveTopoData()
    fetchFromServer()
  }

  const handleReject = async (s: Suggestion) => {
    try {
      await fetch(`${API_BASE}/sync/suggestion/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      })
    } catch { /* offline */ }
    await db.suggestions.update(s.id, { status: 'rejected', reviewedAt: new Date().toISOString() })
    fetchFromServer()
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <AdminNav />
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold">{t('admin.moderation')}</h1>
        <button onClick={fetchFromServer} className="text-sm text-blue-600 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors">
          {loading ? '...' : '↻ Refresh'}
        </button>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-4">{error}</div>}

      {pending.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">✅</div>
          <p className="text-sm">{t('admin.noPending')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map(s => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              onApprove={() => handleApprove(s)}
              onReject={() => handleReject(s)}
              t={t}
              td={td}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SuggestionCard({ suggestion: s, onApprove, onReject, t, td }: {
  suggestion: Suggestion
  onApprove: () => void
  onReject: () => void
  t: (key: any, params?: any) => string
  td: (text: string) => string
}) {
  const typeConfig = {
    photo: { label: 'Фото', color: 'bg-purple-100 text-purple-700', icon: '📷' },
    route: { label: 'Маршрут', color: 'bg-blue-100 text-blue-700', icon: '🧗' },
  }
  const cfg = typeConfig[s.type as keyof typeof typeConfig] || { label: s.type, color: 'bg-gray-100 text-gray-700', icon: '📝' }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-2.5 flex items-center gap-2 border-b border-gray-100">
        <span className="text-lg">{cfg.icon}</span>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
        <span className="text-sm font-medium text-gray-700">{s.userName}</span>
        <span className="text-[11px] text-gray-400 ml-auto">
          {new Date(s.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>

      <div className="p-4">
        {/* Sector */}
        <div className="text-xs text-gray-400 mb-2">
          <SectorLabel sectorId={s.sectorId} />
        </div>

        {/* Photo suggestion */}
        {s.type === 'photo' && (
          <img src={s.data} alt="Фото" className="w-full rounded-lg mb-3 max-h-64 object-cover border border-gray-100" />
        )}

        {/* Route suggestion */}
        {s.type === 'route' && <RouteInfoBlock data={s.data} t={t} td={td} />}

        {/* User comment */}
        {s.comment && (
          <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2 mb-3">
            <span className="text-[10px] text-yellow-600 font-medium block mb-0.5">Комментарий автора</span>
            <p className="text-sm text-gray-700">{s.comment}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onApprove}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 text-sm font-medium transition-colors"
          >
            ✓ {t('admin.approve')}
          </button>
          <button
            onClick={onReject}
            className="flex-1 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg py-2 text-sm font-medium transition-colors"
          >
            ✕ {t('admin.reject')}
          </button>
        </div>
      </div>
    </div>
  )
}

function RouteInfoBlock({ data, t, td }: { data: string; t: (key: any) => string; td: (text: string) => string }) {
  try {
    const info = JSON.parse(data)
    const isNewRoute = info.name && info.grade
    const isRouteUpdate = info.routeId

    return (
      <div className="mb-3">
        {isNewRoute && (
          <div className="bg-green-50 border border-green-100 rounded-lg p-3 mb-2">
            <span className="text-[10px] text-green-600 font-bold block mb-1">НОВЫЙ МАРШРУТ</span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-blue-700 bg-white px-2 py-0.5 rounded text-sm">{info.grade}</span>
              <span className="font-medium text-gray-800">{info.name}</span>
            </div>
            {info.type && <span className="text-xs text-gray-500 mt-1 block">{info.type}</span>}
          </div>
        )}

        {isRouteUpdate && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-2">
            <span className="text-[10px] text-blue-600 font-bold block mb-1">ОБНОВЛЕНИЕ МАРШРУТА</span>
            <RouteName routeId={info.routeId} td={td} />
          </div>
        )}

        {/* Details grid */}
        {(info.quickdraws || info.ropeLength || info.terrainTags?.length || info.holdTypes?.length) && (
          <div className="grid grid-cols-2 gap-2">
            {info.quickdraws && (
              <div className="bg-gray-50 rounded-lg p-2">
                <span className="text-[10px] text-gray-400 block">{t('route.quickdraws')}</span>
                <span className="text-sm font-bold text-gray-800 inline-flex items-center gap-1"><img src="/icons/quickdraw.png" alt="" className="h-5 w-auto" />{info.quickdraws}</span>
              </div>
            )}
            {info.ropeLength && (
              <div className="bg-gray-50 rounded-lg p-2">
                <span className="text-[10px] text-gray-400 block">{t('route.ropeLength')}</span>
                <span className="text-sm font-bold text-gray-800 inline-flex items-center gap-1"><img src="/icons/rope.png" alt="" className="h-4 w-auto opacity-70" />{info.ropeLength}м</span>
              </div>
            )}
            {info.terrainTags?.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-2 col-span-2">
                <span className="text-[10px] text-gray-400 block mb-1">{t('route.terrain')}</span>
                <div className="flex flex-wrap gap-1">
                  {info.terrainTags.map((tag: string) => (
                    <span key={tag} className="bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 text-xs">{t(`terrain.${tag}`)}</span>
                  ))}
                </div>
              </div>
            )}
            {info.holdTypes?.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-2 col-span-2">
                <span className="text-[10px] text-gray-400 block mb-1">{t('route.holds')}</span>
                <div className="flex flex-wrap gap-1">
                  {info.holdTypes.map((h: string) => (
                    <span key={h} className="bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 text-xs">{t(`hold.${h}`)}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  } catch { return null }
}

function RouteName({ routeId, td }: { routeId: string; td: (text: string) => string }) {
  const route = useLiveQuery(() => db.routes.get(routeId), [routeId])
  if (!route) return <span className="text-xs text-gray-400">{routeId}</span>
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono font-bold text-blue-700 bg-white px-2 py-0.5 rounded text-sm">{route.grade}</span>
      <span className="font-medium text-gray-800">{td(route.name)}</span>
    </div>
  )
}

function SectorLabel({ sectorId }: { sectorId: string }) {
  const sector = useLiveQuery(() => db.sectors.get(sectorId), [sectorId])
  return <span>📍 {sector?.name || sectorId}</span>
}

function gradeToSort(grade: string): number {
  const grades = [
    '4', '4a', '4b', '4c',
    '5a', '5a+', '5b', '5b+', '5c', '5c+',
    '6a', '6a+', '6b', '6b+', '6c', '6c+',
    '7a', '7a+', '7b', '7b+', '7c', '7c+',
    '8a', '8a+',
  ]
  const idx = grades.indexOf(grade)
  return idx >= 0 ? (idx + 1) * 15 : 100
}
