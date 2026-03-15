import { useState, useEffect, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Suggestion } from '../../lib/db/schema'
import { useI18n } from '../../lib/i18n'

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
  const { t } = useI18n()
  const [serverSuggestions, setServerSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Also show local suggestions (not yet synced)
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

  // Merge: server suggestions + local-only (not yet synced)
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
        // Route info suggestion — apply to existing route
        const updates: Record<string, unknown> = {}
        if (info.quickdraws) updates.quickdraws = info.quickdraws
        if (info.ropeLength) updates.ropeLength = info.ropeLength
        if (info.terrainTags?.length) updates.terrainTags = info.terrainTags
        if (info.holdTypes?.length) updates.holdTypes = info.holdTypes
        if (Object.keys(updates).length > 0) {
          await db.routes.update(info.routeId, updates)
        }
      } else if (info.name && info.grade) {
        // New route suggestion
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

    // Update on server
    try {
      await fetch(`${API_BASE}/sync/suggestion/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      })
    } catch { /* offline */ }

    // Update local
    await db.suggestions.update(s.id, { status: 'approved', reviewedAt: new Date().toISOString() })
    if (s.type === 'photo') saveTopoData()

    // Refresh list
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
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">{t('admin.moderation')}</h1>
        <button onClick={fetchFromServer} className="text-xs text-blue-600 px-2 py-1 rounded bg-blue-50">
          {loading ? '...' : '↻ Refresh'}
        </button>
      </div>

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      {pending.length === 0 ? (
        <p className="text-gray-400 text-sm">{t('admin.noPending')}</p>
      ) : (
        <div className="space-y-3">
          {pending.map(s => {
            const sectorName = <SectorLabel sectorId={s.sectorId} />
            return (
              <div key={s.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    s.type === 'photo' ? 'bg-purple-100 text-purple-700' :
                    s.type === 'route' ? 'bg-green-100 text-green-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {s.type}
                  </span>
                  <span className="text-sm font-medium">{s.userName}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="text-xs text-gray-500 mb-1">{sectorName}</div>

                {s.type === 'photo' && (
                  <img src={s.data} alt="Suggestion" className="w-full rounded-lg mb-2 max-h-48 object-cover" />
                )}

                {s.type === 'route' && (() => {
                  try {
                    const info = JSON.parse(s.data)
                    return (
                      <div className="text-sm mb-2 space-y-1">
                        {info.name && <div><span className="font-mono font-bold text-blue-700">{info.grade}</span> {info.name}</div>}
                        {info.routeId && <div className="text-xs text-gray-500">Route: {info.routeId}</div>}
                        {info.quickdraws && <div className="text-xs">Quickdraws: {info.quickdraws}</div>}
                        {info.ropeLength && <div className="text-xs">Rope: {info.ropeLength}m</div>}
                        {info.terrainTags?.length > 0 && <div className="text-xs">Terrain: {info.terrainTags.join(', ')}</div>}
                        {info.holdTypes?.length > 0 && <div className="text-xs">Holds: {info.holdTypes.join(', ')}</div>}
                      </div>
                    )
                  } catch { return null }
                })()}

                {s.comment && (
                  <p className="text-xs text-gray-500 italic mb-2">{s.comment}</p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(s)}
                    className="flex-1 bg-green-600 text-white rounded-lg py-1.5 text-sm font-medium"
                  >
                    {t('admin.approve')}
                  </button>
                  <button
                    onClick={() => handleReject(s)}
                    className="flex-1 bg-red-100 text-red-700 rounded-lg py-1.5 text-sm font-medium"
                  >
                    {t('admin.reject')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SectorLabel({ sectorId }: { sectorId: string }) {
  const sector = useLiveQuery(() => db.sectors.get(sectorId), [sectorId])
  return <>{sector?.name || sectorId}</>
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
