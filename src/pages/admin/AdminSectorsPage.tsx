import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/schema'

let saveTimer: ReturnType<typeof setTimeout> | null = null

async function saveTopoData() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    const topos = await db.topos.toArray()
    const topoRoutes = await db.topoRoutes.toArray()
    const sectors = await db.sectors.toArray()
    const routes = await db.routes.toArray()

    const sectorCovers: Record<string, string> = {}
    for (const s of sectors) {
      if (s.coverImageUrl) sectorCovers[s.id] = s.coverImageUrl
    }

    const meta = await db.syncMeta.get('topoDataVersion')
    const version = (parseInt(meta?.value || '0') || 0) + 1

    const data = {
      version,
      exportedAt: new Date().toISOString(),
      topos,
      topoRoutes,
      routes,
      sectors,
      sectorCovers,
    }

    try {
      const resp = await fetch('/api/save-topo-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (resp.ok) {
        await db.syncMeta.put({ key: 'topoDataVersion', value: String(version) })
        console.log(`Saved topo-data v${version}`)
      }
    } catch (err) {
      console.error('Failed to save:', err)
    }
  }, 1000)
}

export function AdminSectorsPage() {
  const sectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())
  const routes = useLiveQuery(() => db.routes.toArray())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const routeCounts = new Map<string, number>()
  routes?.forEach(r => {
    routeCounts.set(r.sectorId, (routeCounts.get(r.sectorId) || 0) + 1)
  })

  const handleUpdate = async (sectorId: string, field: string, value: string | number | undefined) => {
    await db.sectors.update(sectorId, { [field]: value, updatedAt: new Date().toISOString() } as any)
    saveTopoData()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!sectors) return <div className="p-4 text-gray-400">Загрузка...</div>

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Редактор секторов</h1>
        {saved && <span className="text-green-600 text-sm font-medium">Сохранено</span>}
      </div>

      <div className="space-y-3">
        {sectors.map(sector => (
          <div key={sector.id} className="bg-white border border-gray-200 rounded-lg p-3">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setEditingId(editingId === sector.id ? null : sector.id)}
            >
              <div>
                <span className="font-medium">{sector.name}</span>
                <span className="text-xs text-gray-400 ml-2">
                  {routeCounts.get(sector.id) || 0} маршр.
                </span>
              </div>
              <span className="text-gray-400 text-sm">
                {editingId === sector.id ? '▲' : '▼'}
              </span>
            </div>

            {editingId === sector.id && (
              <SectorEditForm sector={sector} onUpdate={handleUpdate} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function SectorEditForm({
  sector,
  onUpdate,
}: {
  sector: { id: string; name: string; description?: string; orientation?: string; approachDescription?: string; approachTimeMin?: number; sunExposure?: string; sortOrder: number }
  onUpdate: (id: string, field: string, value: string | number | undefined) => void
}) {
  const [name, setName] = useState(sector.name)
  const [description, setDescription] = useState(sector.description || '')
  const [orientation, setOrientation] = useState(sector.orientation || '')
  const [approachDesc, setApproachDesc] = useState(sector.approachDescription || '')
  const [approachTime, setApproachTime] = useState(sector.approachTimeMin?.toString() || '')
  const [sunExposure, setSunExposure] = useState(sector.sunExposure || '')
  const [sortOrder, setSortOrder] = useState(sector.sortOrder.toString())

  const field = (label: string, value: string, setValue: (v: string) => void, fieldName: string, multiline = false) => (
    <div className="mb-3">
      <label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={() => onUpdate(sector.id, fieldName, value || undefined)}
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:border-blue-300 focus:outline-none"
        />
      ) : (
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={() => onUpdate(sector.id, fieldName, value || undefined)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-300 focus:outline-none"
        />
      )}
    </div>
  )

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      {field('Название', name, setName, 'name')}
      {field('Описание', description, setDescription, 'description', true)}
      {field('Ориентация (С, Ю, В, З...)', orientation, setOrientation, 'orientation')}
      {field('Описание подхода', approachDesc, setApproachDesc, 'approachDescription', true)}

      <div className="grid grid-cols-2 gap-3">
        <div className="mb-3">
          <label className="text-xs font-medium text-gray-500 mb-1 block">Время подхода (мин)</label>
          <input
            type="number"
            value={approachTime}
            onChange={e => setApproachTime(e.target.value)}
            onBlur={() => onUpdate(sector.id, 'approachTimeMin', approachTime ? parseInt(approachTime) : undefined)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-300 focus:outline-none"
          />
        </div>
        <div className="mb-3">
          <label className="text-xs font-medium text-gray-500 mb-1 block">Порядок сортировки</label>
          <input
            type="number"
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value)}
            onBlur={() => onUpdate(sector.id, 'sortOrder', parseInt(sortOrder) || 0)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-300 focus:outline-none"
          />
        </div>
      </div>

      {field('Освещение (утро, вечер...)', sunExposure, setSunExposure, 'sunExposure')}
    </div>
  )
}
