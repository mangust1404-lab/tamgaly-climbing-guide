import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/schema'
import { AdminNav } from '../../components/admin/AdminNav'

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
  const [needsSave, setNeedsSave] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')

  const routeCounts = new Map<string, number>()
  routes?.forEach(r => {
    routeCounts.set(r.sectorId, (routeCounts.get(r.sectorId) || 0) + 1)
  })

  const handleUpdate = async (sectorId: string, field: string, value: string | number | undefined) => {
    await db.sectors.update(sectorId, { [field]: value, updatedAt: new Date().toISOString() } as any)
    setNeedsSave(true)
  }

  const handleSaveToServer = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      const topos = await db.topos.toArray()
      const topoRoutes = await db.topoRoutes.toArray()
      const allSectors = await db.sectors.toArray()
      const allRoutes = await db.routes.toArray()
      const sectorCovers: Record<string, string> = {}
      for (const s of allSectors) {
        if (s.coverImageUrl) sectorCovers[s.id] = s.coverImageUrl
      }
      const meta = await db.syncMeta.get('topoDataVersion')
      const version = (parseInt(meta?.value || '0') || 0) + 1
      const data = { version, exportedAt: new Date().toISOString(), topos, topoRoutes, routes: allRoutes, sectors: allSectors, sectorCovers }
      const resp = await fetch('/api/save-topo-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (resp.ok) {
        await db.syncMeta.put({ key: 'topoDataVersion', value: String(version) })
        setSaveMsg(`✓ v${version}`)
        setNeedsSave(false)
      } else {
        setSaveMsg('Ошибка сервера')
      }
    } catch (err) {
      setSaveMsg('Ошибка сети')
    }
    setSaving(false)
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const handleCreateSector = async () => {
    if (!newName.trim()) return
    const slug = newName.trim().toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-')
    const id = `sector-${slug}-${Date.now()}`
    await db.sectors.add({
      id,
      areaId: 'tamgaly-tas',
      name: newName.trim(),
      slug,
      latitude: 44.0639,
      longitude: 76.9959,
      sortOrder: (sectors?.length ?? 0) + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any)
    setNewName('')
    setShowNewForm(false)
    setEditingId(id)
    setNeedsSave(true)
  }

  const handleDeleteSector = async (sectorId: string, sectorName: string) => {
    const routeCount = routeCounts.get(sectorId) || 0
    const msg = routeCount > 0
      ? `Удалить сектор "${sectorName}" и все ${routeCount} маршрутов?`
      : `Удалить сектор "${sectorName}"?`
    if (!confirm(msg)) return
    await db.routes.where('sectorId').equals(sectorId).delete()
    await db.topoRoutes.where('topoId').startsWithAnyOf(
      (await db.topos.where('sectorId').equals(sectorId).toArray()).map(t => t.id)
    ).delete()
    await db.topos.where('sectorId').equals(sectorId).delete()
    await db.sectors.delete(sectorId)
    if (editingId === sectorId) setEditingId(null)
    setNeedsSave(true)
  }

  if (!sectors) return <div className="p-4 text-gray-400">Загрузка...</div>

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <AdminNav />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Редактор секторов</h1>
        <div className="flex items-center gap-2">
          {saveMsg && <span className="text-sm text-green-600">{saveMsg}</span>}
          <button
            onClick={handleSaveToServer}
            disabled={saving}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              needsSave
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600'
            } disabled:opacity-50`}
          >
            {saving ? '...' : '💾 На сервер'}
          </button>
        </div>
      </div>

      {/* Create new sector */}
      {showNewForm ? (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateSector()}
            placeholder="Название нового сектора"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-300 focus:outline-none"
          />
          <button onClick={handleCreateSector} className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium">Создать</button>
          <button onClick={() => { setShowNewForm(false); setNewName('') }} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm">Отмена</button>
        </div>
      ) : (
        <button
          onClick={() => setShowNewForm(true)}
          className="mb-4 w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          + Добавить сектор
        </button>
      )}

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
              <>
                <SectorEditForm sector={sector} onUpdate={handleUpdate} />
                <SectorRoutesList sectorId={sector.id} onChanged={() => setNeedsSave(true)} />
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => handleDeleteSector(sector.id, sector.name)}
                    className="px-3 py-1.5 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50"
                  >
                    Удалить сектор
                  </button>
                </div>
              </>
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
  sector: { id: string; name: string; description?: string; orientation?: string; approachDescription?: string; approachTimeMin?: number; sunExposure?: string; sunFrom?: number; sunTo?: number; sortOrder: number }
  onUpdate: (id: string, field: string, value: string | number | undefined) => void
}) {
  const [name, setName] = useState(sector.name)
  const [description, setDescription] = useState(sector.description || '')
  const [orientation, setOrientation] = useState(sector.orientation || '')
  const [approachDesc, setApproachDesc] = useState(sector.approachDescription || '')
  const [approachTime, setApproachTime] = useState(sector.approachTimeMin?.toString() || '')
  const [sunExposure, setSunExposure] = useState(sector.sunExposure || '')
  const [sunFrom, setSunFrom] = useState(sector.sunFrom?.toString() || '')
  const [sunTo, setSunTo] = useState(sector.sunTo?.toString() || '')
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

      <div className="grid grid-cols-2 gap-3">
        <div className="mb-3">
          <label className="text-xs font-medium text-gray-500 mb-1 block">Солнце с (час)</label>
          <input
            type="number"
            min="0"
            max="24"
            value={sunFrom}
            onChange={e => setSunFrom(e.target.value)}
            onBlur={() => onUpdate(sector.id, 'sunFrom', sunFrom ? parseInt(sunFrom) : undefined)}
            placeholder="8"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-300 focus:outline-none"
          />
        </div>
        <div className="mb-3">
          <label className="text-xs font-medium text-gray-500 mb-1 block">Солнце до (час)</label>
          <input
            type="number"
            min="0"
            max="24"
            value={sunTo}
            onChange={e => setSunTo(e.target.value)}
            onBlur={() => onUpdate(sector.id, 'sunTo', sunTo ? parseInt(sunTo) : undefined)}
            placeholder="17"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-300 focus:outline-none"
          />
        </div>
      </div>
      {field('Освещение (заметка)', sunExposure, setSunExposure, 'sunExposure')}
    </div>
  )
}

function SectorRoutesList({ sectorId, onChanged }: { sectorId: string; onChanged: () => void }) {
  const routes = useLiveQuery(
    () => db.routes.where('sectorId').equals(sectorId).toArray().then(arr =>
      arr.sort((a, b) => (a.numberInSector ?? 999) - (b.numberInSector ?? 999))
    ),
    [sectorId],
  )
  const [editId, setEditId] = useState<string | null>(null)

  if (!routes) return null

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <h3 className="text-xs font-semibold text-gray-500 mb-2">Маршруты ({routes.length})</h3>
      <div className="space-y-1">
        {routes.map(r => (
          <div key={r.id}>
            <div
              className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5"
              onClick={() => setEditId(editId === r.id ? null : r.id)}
            >
              <span className="text-gray-400 w-5 text-right text-xs">#{r.numberInSector ?? '?'}</span>
              <span className="font-medium flex-1 truncate">{r.name}</span>
              <span className="text-xs text-gray-400">{r.grade}</span>
            </div>
            {editId === r.id && (
              <RouteEditRow route={r} onChanged={onChanged} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function RouteEditRow({ route, onChanged }: { route: { id: string; name: string; grade: string; numberInSector?: number }; onChanged: () => void }) {
  const [name, setName] = useState(route.name)
  const [grade, setGrade] = useState(route.grade)
  const [num, setNum] = useState(route.numberInSector?.toString() || '')

  const save = async (field: string, value: string | number | undefined) => {
    await db.routes.update(route.id, { [field]: value, updatedAt: new Date().toISOString() } as any)
    onChanged()
  }

  return (
    <div className="ml-7 mb-2 p-2 bg-gray-50 rounded-lg grid grid-cols-[1fr_80px_50px] gap-2">
      <div>
        <label className="text-[10px] text-gray-400">Название</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => save('name', name)}
          className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:border-blue-300 focus:outline-none"
        />
      </div>
      <div>
        <label className="text-[10px] text-gray-400">Категория</label>
        <input
          value={grade}
          onChange={e => setGrade(e.target.value)}
          onBlur={() => save('grade', grade)}
          className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:border-blue-300 focus:outline-none"
        />
      </div>
      <div>
        <label className="text-[10px] text-gray-400">#</label>
        <input
          type="number"
          value={num}
          onChange={e => setNum(e.target.value)}
          onBlur={() => save('numberInSector', num ? parseInt(num) : undefined)}
          className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-center focus:border-blue-300 focus:outline-none"
        />
      </div>
    </div>
  )
}
