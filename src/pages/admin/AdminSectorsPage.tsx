import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Route } from '../../lib/db/schema'
import { AdminNav } from '../../components/admin/AdminNav'
import { refreshTopoData } from '../../lib/offline/downloadManager'
import { adminFetch } from '../../lib/adminAuth'
import { gradeToSort } from '../../lib/utils'

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
      const resp = await adminFetch('/api/save-topo-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (resp.ok) {
        await db.syncMeta.put({ key: 'topoDataVersion', value: String(version) })
        console.log(`Saved topo-data v${version}`)
        // Auto-refresh IndexedDB from server's merged topo-data.json
        await refreshTopoData(() => {}).catch(() => {})
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
    // Force blur to save any pending input values to IndexedDB
    ;(document.activeElement as HTMLElement)?.blur()
    await new Promise(r => setTimeout(r, 150))
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
      const resp = await adminFetch('/api/save-topo-data', {
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
  sector: { id: string; name: string; description?: string; orientation?: string; approachDescription?: string; approachTimeMin?: number; sunExposure?: string; sunFrom?: number; sunTo?: number; sortOrder: number; latitude: number; longitude: number; coverImageUrl?: string }
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
  const [latitude, setLatitude] = useState(sector.latitude?.toString() || '')
  const [longitude, setLongitude] = useState(sector.longitude?.toString() || '')
  const [coverImageUrl, setCoverImageUrl] = useState(sector.coverImageUrl || '')

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

      <div className="grid grid-cols-2 gap-3">
        <div className="mb-3">
          <label className="text-xs font-medium text-gray-500 mb-1 block">Широта</label>
          <input
            type="number"
            step="0.0001"
            value={latitude}
            onChange={e => setLatitude(e.target.value)}
            onBlur={() => onUpdate(sector.id, 'latitude', latitude ? parseFloat(latitude) : undefined)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-300 focus:outline-none"
          />
        </div>
        <div className="mb-3">
          <label className="text-xs font-medium text-gray-500 mb-1 block">Долгота</label>
          <input
            type="number"
            step="0.0001"
            value={longitude}
            onChange={e => setLongitude(e.target.value)}
            onBlur={() => onUpdate(sector.id, 'longitude', longitude ? parseFloat(longitude) : undefined)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-300 focus:outline-none"
          />
        </div>
      </div>
      {field('Обложка (URL)', coverImageUrl, setCoverImageUrl, 'coverImageUrl')}
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

const TERRAIN_OPTIONS = ['slab', 'vertical', 'overhang', 'roof', 'chimney', 'crack', 'arete', 'corner']
const HOLD_OPTIONS = ['crimps', 'slopers', 'pinches', 'sidepulls', 'pockets', 'jugs', 'underclings', 'tufas']
const ROUTE_TYPES = ['sport', 'trad', 'boulder', 'multi-pitch'] as const

function RouteEditRow({ route, onChanged }: { route: Route; onChanged: () => void }) {
  const [f, setF] = useState({
    name: route.name,
    grade: route.grade,
    gradeAlt: route.gradeAlt || '',
    numberInSector: route.numberInSector?.toString() || '',
    routeType: route.routeType,
    lengthM: route.lengthM?.toString() || '',
    pitches: route.pitches?.toString() || '1',
    quickdraws: route.quickdraws?.toString() || '',
    ropeLength: route.ropeLength?.toString() || '',
    description: route.description || '',
    protection: route.protection || '',
    firstAscent: route.firstAscent || '',
    firstAscentDate: route.firstAscentDate || '',
    qualityRating: route.qualityRating?.toString() || '',
    latitude: route.latitude?.toString() || '',
    longitude: route.longitude?.toString() || '',
    status: route.status,
  })
  const [terrainTags, setTerrainTags] = useState<string[]>(route.terrainTags || [])
  const [holdTypes, setHoldTypes] = useState<string[]>(route.holdTypes || [])

  const save = async (field: string, value: unknown) => {
    await db.routes.update(route.id, { [field]: value, updatedAt: new Date().toISOString() } as any)
    onChanged()
  }

  const saveText = (field: string, val: string) => save(field, val || undefined)
  const saveNum = (field: string, val: string) => save(field, val ? parseFloat(val) : undefined)
  const saveInt = (field: string, val: string) => save(field, val ? parseInt(val) : undefined)
  const saveGrade = async (val: string) => {
    await db.routes.update(route.id, { grade: val || undefined, gradeSort: gradeToSort(val), updatedAt: new Date().toISOString() } as any)
    onChanged()
  }

  const toggleTag = (arr: string[], setArr: (v: string[]) => void, field: string, tag: string) => {
    const next = arr.includes(tag) ? arr.filter(t => t !== tag) : [...arr, tag]
    setArr(next)
    save(field, next.length > 0 ? next : undefined)
  }

  const inp = "w-full border border-gray-200 rounded px-2 py-1 text-sm focus:border-blue-300 focus:outline-none"
  const lbl = "text-[10px] text-gray-400 mb-0.5 block"

  return (
    <div className="ml-7 mb-2 p-3 bg-gray-50 rounded-lg space-y-2">
      {/* Row 1: name, grade, gradeAlt, # */}
      <div className="grid grid-cols-[1fr_70px_70px_45px] gap-2">
        <div><label className={lbl}>Название</label>
          <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} onBlur={() => saveText('name', f.name)} className={inp} /></div>
        <div><label className={lbl}>Категория</label>
          <input value={f.grade} onChange={e => setF({ ...f, grade: e.target.value })} onBlur={() => saveGrade(f.grade)} className={inp} /></div>
        <div><label className={lbl}>Кат. альт.</label>
          <input value={f.gradeAlt} onChange={e => setF({ ...f, gradeAlt: e.target.value })} onBlur={() => saveText('gradeAlt', f.gradeAlt)} placeholder="6a+" className={inp} /></div>
        <div><label className={lbl}>#</label>
          <input type="number" value={f.numberInSector} onChange={e => setF({ ...f, numberInSector: e.target.value })} onBlur={() => saveInt('numberInSector', f.numberInSector)} className={inp + " text-center"} /></div>
      </div>

      {/* Row 2: type, length, pitches, quickdraws, rope, quality */}
      <div className="grid grid-cols-3 gap-2">
        <div><label className={lbl}>Тип</label>
          <select value={f.routeType} onChange={e => { setF({ ...f, routeType: e.target.value as any }); save('routeType', e.target.value) }} className={inp}>
            {ROUTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select></div>
        <div><label className={lbl}>Длина (м)</label>
          <input type="number" value={f.lengthM} onChange={e => setF({ ...f, lengthM: e.target.value })} onBlur={() => saveNum('lengthM', f.lengthM)} className={inp} /></div>
        <div><label className={lbl}>Верёвки</label>
          <input type="number" value={f.pitches} onChange={e => setF({ ...f, pitches: e.target.value })} onBlur={() => saveInt('pitches', f.pitches)} className={inp} /></div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div><label className={lbl}>Оттяжки</label>
          <input type="number" value={f.quickdraws} onChange={e => setF({ ...f, quickdraws: e.target.value })} onBlur={() => saveInt('quickdraws', f.quickdraws)} className={inp} /></div>
        <div><label className={lbl}>Верёвка (м)</label>
          <input type="number" value={f.ropeLength} onChange={e => setF({ ...f, ropeLength: e.target.value })} onBlur={() => saveNum('ropeLength', f.ropeLength)} className={inp} /></div>
        <div><label className={lbl}>Качество (1-5)</label>
          <input type="number" min="1" max="5" step="0.5" value={f.qualityRating} onChange={e => setF({ ...f, qualityRating: e.target.value })} onBlur={() => saveNum('qualityRating', f.qualityRating)} className={inp} /></div>
      </div>

      {/* Description & protection */}
      <div><label className={lbl}>Описание</label>
        <textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} onBlur={() => saveText('description', f.description)} rows={2} className={inp + " resize-none"} /></div>
      <div><label className={lbl}>Страховка</label>
        <input value={f.protection} onChange={e => setF({ ...f, protection: e.target.value })} onBlur={() => saveText('protection', f.protection)} className={inp} /></div>

      {/* First ascent */}
      <div className="grid grid-cols-2 gap-2">
        <div><label className={lbl}>Первопроход</label>
          <input value={f.firstAscent} onChange={e => setF({ ...f, firstAscent: e.target.value })} onBlur={() => saveText('firstAscent', f.firstAscent)} className={inp} /></div>
        <div><label className={lbl}>Дата первопрохода</label>
          <input value={f.firstAscentDate} onChange={e => setF({ ...f, firstAscentDate: e.target.value })} onBlur={() => saveText('firstAscentDate', f.firstAscentDate)} placeholder="2024" className={inp} /></div>
      </div>

      {/* GPS */}
      <div className="grid grid-cols-2 gap-2">
        <div><label className={lbl}>Широта</label>
          <input type="number" step="0.0001" value={f.latitude} onChange={e => setF({ ...f, latitude: e.target.value })} onBlur={() => saveNum('latitude', f.latitude)} className={inp} /></div>
        <div><label className={lbl}>Долгота</label>
          <input type="number" step="0.0001" value={f.longitude} onChange={e => setF({ ...f, longitude: e.target.value })} onBlur={() => saveNum('longitude', f.longitude)} className={inp} /></div>
      </div>

      {/* Status */}
      <div className="grid grid-cols-2 gap-2">
        <div><label className={lbl}>Статус</label>
          <select value={f.status} onChange={e => { setF({ ...f, status: e.target.value as any }); save('status', e.target.value) }} className={inp}>
            <option value="published">published</option>
            <option value="draft">draft</option>
            <option value="archived">archived</option>
          </select></div>
      </div>

      {/* Terrain tags */}
      <div>
        <label className={lbl}>Рельеф</label>
        <div className="flex flex-wrap gap-1">
          {TERRAIN_OPTIONS.map(t => (
            <button key={t} onClick={() => toggleTag(terrainTags, setTerrainTags, 'terrainTags', t)}
              className={`px-2 py-0.5 rounded text-xs border ${terrainTags.includes(t) ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-500'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Hold types */}
      <div>
        <label className={lbl}>Зацепы</label>
        <div className="flex flex-wrap gap-1">
          {HOLD_OPTIONS.map(t => (
            <button key={t} onClick={() => toggleTag(holdTypes, setHoldTypes, 'holdTypes', t)}
              className={`px-2 py-0.5 rounded text-xs border ${holdTypes.includes(t) ? 'bg-green-100 border-green-300 text-green-700' : 'bg-white border-gray-200 text-gray-500'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Delete route */}
      <div className="pt-1 border-t border-gray-200">
        <button
          onClick={async () => {
            if (!confirm(`Удалить маршрут "${route.name}"?`)) return
            await db.routes.delete(route.id)
            onChanged()
          }}
          className="text-xs text-red-400 hover:text-red-600"
        >
          Удалить маршрут
        </button>
      </div>
    </div>
  )
}
