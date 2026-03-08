import { useState, useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Topo } from '../../lib/db/schema'

const PHOTO_DIR = '/topos/'

const GRADES = [
  '4', '4a', '4b', '4c',
  '5a', '5a+', '5b', '5b+', '5c', '5c+',
  '6a', '6a+', '6b', '6b+', '6c', '6c+',
  '7a', '7a+', '7b', '7b+', '7c', '7c+',
  '8a', '8a+',
]

const GRADE_SORT: Record<string, number> = {
  '4': 30, '4a': 40, '4b': 50, '4c': 60,
  '5a': 70, '5a+': 75, '5b': 85, '5b+': 90, '5c': 100, '5c+': 105,
  '6a': 120, '6a+': 135, '6b': 150, '6b+': 170, '6c': 190, '6c+': 210,
  '7a': 240, '7a+': 270, '7b': 300, '7b+': 340, '7c': 380, '7c+': 420,
  '8a': 470, '8a+': 520,
}

function slugify(text: string): string {
  return text.toLowerCase()
    .replace(/[а-яё]/g, (ch) => {
      const m: Record<string, string> = {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo',
        'ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m',
        'н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u',
        'ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch',
        'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
      }
      return m[ch] || ch
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

interface PhotoInfo {
  filename: string
  time: string
}

function parsePhotos(filenames: string[]): PhotoInfo[] {
  return filenames
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort()
    .map(f => {
      const m = f.match(/_(\d{2})(\d{2})(\d{2})\.\w+$/)
      const time = m ? `${m[1]}:${m[2]}` : ''
      return { filename: f, time }
    })
}

interface PhotoTag {
  type: 'sector' | 'route' | 'skip' | 'approach'
  sectorIds?: string[]
  sectorId?: string
  routeIds?: string[]
  routeId?: string
}

export function AdminPhotoTagger() {
  const sectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())
  const routes = useLiveQuery(() => db.routes.toArray())
  const [photos, setPhotos] = useState<PhotoInfo[]>([])
  const [tags, setTags] = useState<Record<string, PhotoTag>>(() => {
    try {
      const saved = localStorage.getItem('photo-tags')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })
  const [currentIdx, setCurrentIdx] = useState(() => {
    return parseInt(localStorage.getItem('photo-tagger-idx') || '0', 10)
  })
  const [mode, setMode] = useState<'grid' | 'single'>('grid')
  const [selectedSectors, setSelectedSectors] = useState<string[]>([])
  const [confirmedSector, setConfirmedSector] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sectorCovers, setSectorCovers] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('sector-covers')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([])
  const [showAddRoute, setShowAddRoute] = useState(false)
  const [newRouteName, setNewRouteName] = useState('')
  const [newRouteGrade, setNewRouteGrade] = useState('6a')
  const [newRouteGradeAlt, setNewRouteGradeAlt] = useState('')
  const [newRoutePitches, setNewRoutePitches] = useState(1)
  const [newRoutePitchGrades, setNewRoutePitchGrades] = useState<string[]>([])
  const [showAddSector, setShowAddSector] = useState(false)
  const [newSectorName, setNewSectorName] = useState('')
  const [zoom, setZoom] = useState(1)
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null)
  const [editGrade, setEditGrade] = useState('')
  const [editGradeAlt, setEditGradeAlt] = useState('')
  const [editPitches, setEditPitches] = useState(1)
  const [editPitchGrades, setEditPitchGrades] = useState<string[]>([])

  useEffect(() => {
    localStorage.setItem('photo-tagger-idx', String(currentIdx))
  }, [currentIdx])

  useEffect(() => {
    fetch('/topos/manifest.json')
      .then(r => {
        if (!r.ok) throw new Error('No manifest')
        return r.json()
      })
      .then((files: string[]) => setPhotos(parsePhotos(files)))
      .catch(() => {
        console.log('manifest.json not found — generate it')
      })
  }, [])

  // Migrate orphaned sector IDs in tags (admin-created sectors deleted by re-seed)
  useEffect(() => {
    if (!sectors || sectors.length === 0) return
    const sectorIds = new Set(sectors.map(s => s.id))
    let changed = false
    const newTags = { ...tags }

    const remapSectorId = (orphanId: string): string => {
      // Strip timestamp suffix: "sector-prigorod-levyy-1772986489775" → "sector-prigorod-levyy"
      const base = orphanId.replace(/-\d{10,}$/, '')
      // Find a seed sector whose ID is a prefix of the base
      const match = sectors.find(s => base.startsWith(s.id))
      return match ? match.id : orphanId
    }

    for (const [file, tag] of Object.entries(newTags)) {
      if (tag.sectorId && !sectorIds.has(tag.sectorId)) {
        const mapped = remapSectorId(tag.sectorId)
        if (mapped !== tag.sectorId) {
          tag.sectorId = mapped
          changed = true
        }
      }
      if (tag.sectorIds) {
        tag.sectorIds = tag.sectorIds.map(id => {
          if (!sectorIds.has(id)) {
            const mapped = remapSectorId(id)
            if (mapped !== id) { changed = true; return mapped }
          }
          return id
        })
      }
    }

    if (changed) {
      setTags(newTags)
      localStorage.setItem('photo-tags', JSON.stringify(newTags))
      console.log('Migrated orphaned sector IDs in photo tags')
    }
  }, [sectors]) // eslint-disable-line react-hooks/exhaustive-deps

  const routesBySector = useMemo(() => {
    const map = new Map<string, typeof routes>()
    if (!routes) return map
    for (const r of routes) {
      const list = map.get(r.sectorId) || []
      list.push(r)
      map.set(r.sectorId, list)
    }
    return map
  }, [routes])

  const tagPhoto = (filename: string, tag: PhotoTag) => {
    setTags(prev => {
      const next = { ...prev, [filename]: tag }
      localStorage.setItem('photo-tags', JSON.stringify(next))
      return next
    })
  }

  const currentPhoto = photos[currentIdx]
  const currentTag = currentPhoto ? tags[currentPhoto.filename] : undefined
  const taggedCount = Object.keys(tags).length

  const summary = useMemo(() => {
    const sectorPhotos = new Map<string, string[]>()
    const routePhotos = new Map<string, string[]>()
    let skipped = 0
    let approach = 0
    for (const [file, tag] of Object.entries(tags)) {
      if (tag.type === 'skip') { skipped++; continue }
      if (tag.type === 'approach') { approach++; continue }
      if (tag.type === 'sector' && tag.sectorId) {
        const list = sectorPhotos.get(tag.sectorId) || []
        list.push(file)
        sectorPhotos.set(tag.sectorId, list)
      }
      if (tag.type === 'route' && tag.sectorId) {
        const ids = tag.routeIds || (tag.routeId ? [tag.routeId] : [])
        for (const rid of ids) {
          const list = routePhotos.get(rid) || []
          list.push(file)
          routePhotos.set(rid, list)
        }
        const sList = sectorPhotos.get(tag.sectorId) || []
        sList.push(file)
        sectorPhotos.set(tag.sectorId, sList)
      }
    }
    return { sectorPhotos, routePhotos, skipped, approach }
  }, [tags])

  const sectorRoutes = confirmedSector ? routesBySector.get(confirmedSector) ?? [] : []

  const goNext = () => {
    if (currentIdx < photos.length - 1) setCurrentIdx(currentIdx + 1)
    setSelectedSectors([])
    setConfirmedSector(null)
    setSelectedRoutes([])
    setShowAddRoute(false)
    setShowAddSector(false)
    setEditingRouteId(null)
    setZoom(1)
  }

  const toggleRoute = (id: string) => {
    setSelectedRoutes(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    )
  }

  const confirmRoutes = () => {
    if (!confirmedSector || !currentPhoto) return
    if (selectedRoutes.length === 0) {
      tagPhoto(currentPhoto.filename, { type: 'sector', sectorId: confirmedSector, sectorIds: [confirmedSector] })
    } else {
      tagPhoto(currentPhoto.filename, {
        type: 'route',
        sectorId: confirmedSector,
        routeIds: selectedRoutes,
        routeId: selectedRoutes[0],
      })
    }
    goNext()
  }

  const toggleSector = (id: string) => {
    setSelectedSectors(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  const confirmSectors = () => {
    if (selectedSectors.length === 0) return
    if (selectedSectors.length === 1) {
      setConfirmedSector(selectedSectors[0])
    } else {
      if (currentPhoto) {
        tagPhoto(currentPhoto.filename, {
          type: 'sector',
          sectorIds: selectedSectors,
          sectorId: selectedSectors[0],
        })
      }
      goNext()
    }
  }

  const addSector = async () => {
    if (!newSectorName.trim()) return
    const id = `sector-${slugify(newSectorName)}-${Date.now()}`
    const now = new Date().toISOString()
    await db.sectors.add({
      id,
      areaId: 'tamgaly-tas',
      name: newSectorName.trim(),
      slug: slugify(newSectorName),
      latitude: 44.0639,
      longitude: 76.9959,
      sortOrder: (sectors?.length ?? 0) + 1,
      createdAt: now,
      updatedAt: now,
    })
    setNewSectorName('')
    setShowAddSector(false)
    setSelectedSectors(prev => [...prev, id])
  }

  const addRoute = async () => {
    if (!newRouteName.trim() || !confirmedSector) return
    const id = `route-${slugify(newRouteName)}-${Date.now()}`
    const now = new Date().toISOString()
    await db.routes.add({
      id,
      sectorId: confirmedSector,
      name: newRouteName.trim(),
      slug: slugify(newRouteName),
      grade: newRouteGrade,
      gradeAlt: newRouteGradeAlt || undefined,
      gradeSystem: 'french',
      gradeSort: GRADE_SORT[newRouteGrade] || 0,
      pitches: newRoutePitches,
      pitchGrades: newRoutePitches > 1 ? newRoutePitchGrades.slice(0, newRoutePitches) : undefined,
      routeType: newRoutePitches > 1 ? 'multi-pitch' : 'sport',
      status: 'draft',
      sortOrder: (sectorRoutes?.length ?? 0) + 1,
      tags: [],
      createdAt: now,
      updatedAt: now,
    })
    setSelectedRoutes(prev => [...prev, id])
    setNewRouteName('')
    setNewRouteGrade('6a')
    setNewRouteGradeAlt('')
    setNewRoutePitches(1)
    setNewRoutePitchGrades([])
    setShowAddRoute(false)
  }

  const startEditRoute = (r: { id: string; grade: string; gradeAlt?: string; pitches: number; pitchGrades?: string[] }) => {
    setEditingRouteId(r.id)
    setEditGrade(r.grade)
    setEditGradeAlt(r.gradeAlt || '')
    setEditPitches(r.pitches)
    setEditPitchGrades(r.pitchGrades || [])
  }

  const saveEditRoute = async () => {
    if (!editingRouteId) return
    await db.routes.update(editingRouteId, {
      grade: editGrade,
      gradeAlt: editGradeAlt || undefined,
      gradeSort: GRADE_SORT[editGrade] || 0,
      pitches: editPitches,
      pitchGrades: editPitches > 1 ? editPitchGrades.slice(0, editPitches) : undefined,
      routeType: editPitches > 1 ? 'multi-pitch' : undefined,
      updatedAt: new Date().toISOString(),
    })
    setEditingRouteId(null)
  }

  const setCover = (sectorId: string, filename: string) => {
    setSectorCovers(prev => {
      const next = { ...prev, [sectorId]: filename }
      localStorage.setItem('sector-covers', JSON.stringify(next))
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Save ALL sector photos (not just the first one)
      for (const [sectorId, files] of summary.sectorPhotos) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const img = new Image()
          img.src = PHOTO_DIR + file
          await new Promise<void>(resolve => { img.onload = () => resolve(); img.onerror = () => resolve() })
          const topo: Topo = {
            id: `topo-${sectorId}-${i}`,
            sectorId,
            imageUrl: PHOTO_DIR + file,
            imageWidth: img.naturalWidth || 1920,
            imageHeight: img.naturalHeight || 1080,
            caption: undefined,
            sortOrder: i + 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          await db.topos.put(topo)
        }
      }
      // Save route photos
      for (const [routeId, files] of summary.routePhotos) {
        const route = routes?.find(r => r.id === routeId)
        if (!route) continue
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const img = new Image()
          img.src = PHOTO_DIR + file
          await new Promise<void>(resolve => { img.onload = () => resolve(); img.onerror = () => resolve() })
          const topo: Topo = {
            id: `topo-route-${routeId}-${i}`,
            sectorId: route.sectorId,
            imageUrl: PHOTO_DIR + file,
            imageWidth: img.naturalWidth || 1920,
            imageHeight: img.naturalHeight || 1080,
            caption: `${route.name} (${route.grade})`,
            sortOrder: 10 + i,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          await db.topos.put(topo)
        }
      }
      // Set cover photos on sectors
      for (const [sectorId, files] of summary.sectorPhotos) {
        const coverFile = sectorCovers[sectorId] || files[0]
        if (coverFile) {
          await db.sectors.update(sectorId, { coverImageUrl: PHOTO_DIR + coverFile })
        }
      }
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const getTagLabel = (tag: PhotoTag | undefined): string => {
    if (!tag) return ''
    if (tag.type === 'skip') return 'Пропущено'
    if (tag.type === 'approach') return 'Подход'
    if (tag.type === 'route') {
      const ids = tag.routeIds || (tag.routeId ? [tag.routeId] : [])
      const names = ids.map(id => {
        const r = routes?.find(x => x.id === id)
        return r ? `${r.grade} ${r.name}` : id
      })
      return names.join(', ')
    }
    if (tag.type === 'sector') {
      const ids = tag.sectorIds || (tag.sectorId ? [tag.sectorId] : [])
      const names = ids.map(id => sectors?.find(x => x.id === id)?.name ?? id)
      return names.length > 1 ? names.join(' + ') : `${names[0] || ''} (обзор)`
    }
    return ''
  }

  const gradeDisplay = (r: { grade: string; gradeAlt?: string; pitches: number; pitchGrades?: string[] }) => {
    let g = r.gradeAlt ? `${r.grade}/${r.gradeAlt}` : r.grade
    if (r.pitches > 1) g += ` ${r.pitches}p`
    return g
  }

  if (photos.length === 0) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Разметка фото</h1>
        <p className="text-gray-500 text-sm">
          Загрузка... Убедитесь, что файл <code>public/topos/manifest.json</code> существует.
        </p>
      </div>
    )
  }

  // ─── SINGLE PHOTO MODE: side-by-side layout ───
  if (mode === 'single') {
    return (
      <div className="flex h-[calc(100dvh-52px)]">
        {/* LEFT: Photo */}
        <div className="flex-1 relative bg-gray-950 flex items-center justify-center overflow-auto min-w-0">
          {currentPhoto && (
            <>
              <img
                src={PHOTO_DIR + currentPhoto.filename}
                alt={currentPhoto.filename}
                style={{
                  width: zoom === 1 ? 'auto' : `${zoom * 100}%`,
                  height: zoom === 1 ? '100%' : 'auto',
                  maxWidth: zoom === 1 ? '100%' : 'none',
                  maxHeight: zoom === 1 ? '100%' : 'none',
                  objectFit: 'contain',
                }}
                draggable={false}
              />
              {/* Zoom controls */}
              <div className="absolute top-2 right-2 flex gap-1">
                <button
                  onClick={() => setZoom(z => Math.max(0.3, z - 0.2))}
                  className="w-7 h-7 bg-black/60 text-white rounded-full text-sm leading-none"
                >-</button>
                <button
                  onClick={() => setZoom(1)}
                  className="h-7 px-2 bg-black/60 text-white rounded-full text-[10px]"
                >{Math.round(zoom * 100)}%</button>
                <button
                  onClick={() => setZoom(z => Math.min(4, z + 0.2))}
                  className="w-7 h-7 bg-black/60 text-white rounded-full text-sm leading-none"
                >+</button>
              </div>
              {/* Photo counter */}
              <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                {currentIdx + 1}/{photos.length}
              </div>
              {/* Tag label overlay */}
              {currentTag && (
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded max-w-[60%] truncate">
                  {getTagLabel(currentTag)}
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT: Controls panel */}
        <div className="w-64 flex-shrink-0 border-l border-gray-200 flex flex-col bg-white overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <span className="text-xs text-gray-400">{currentPhoto?.time}</span>
            <button onClick={() => setMode('grid')} className="text-xs text-blue-600">Сетка</button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {/* Step 1: Pick sector(s) */}
            {!confirmedSector ? (
              <>
                <div className="text-[11px] text-gray-500 mb-1.5 font-medium">
                  Сектор {selectedSectors.length > 1 && <span className="text-blue-600">({selectedSectors.length})</span>}
                </div>
                <div className="flex flex-col gap-1 mb-2">
                  {sectors?.map(s => (
                    <button
                      key={s.id}
                      onClick={() => toggleSector(s.id)}
                      className={`px-2 py-1.5 rounded text-xs font-medium text-left transition-colors ${
                        selectedSectors.includes(s.id)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>

                {selectedSectors.length > 0 && (
                  <button
                    onClick={confirmSectors}
                    className="w-full mb-2 px-2 py-1.5 rounded text-xs font-medium bg-blue-600 text-white"
                  >
                    {selectedSectors.length > 1
                      ? `Панорама (${selectedSectors.length}) — сохранить`
                      : 'Маршрут →'}
                  </button>
                )}

                {!showAddSector ? (
                  <button
                    onClick={() => setShowAddSector(true)}
                    className="w-full mb-2 px-2 py-1.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-dashed border-blue-300"
                  >
                    + Сектор
                  </button>
                ) : (
                  <div className="mb-2 p-2 bg-blue-50 rounded border border-blue-200">
                    <input
                      type="text"
                      value={newSectorName}
                      onChange={e => setNewSectorName(e.target.value)}
                      placeholder="Название"
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs mb-1"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') addSector() }}
                    />
                    <div className="flex gap-1">
                      <button onClick={addSector} disabled={!newSectorName.trim()}
                        className="flex-1 bg-blue-600 text-white rounded px-2 py-1 text-[10px] font-medium disabled:opacity-40">OK</button>
                      <button onClick={() => setShowAddSector(false)}
                        className="px-2 py-1 rounded text-[10px] bg-gray-100 text-gray-600">X</button>
                    </div>
                  </div>
                )}

                <div className="flex gap-1">
                  <button
                    onClick={() => { if (currentPhoto) { tagPhoto(currentPhoto.filename, { type: 'approach' }); goNext() } }}
                    className={`flex-1 px-2 py-1.5 rounded text-[11px] font-medium ${
                      currentTag?.type === 'approach' ? 'bg-yellow-500 text-white' : 'bg-yellow-50 text-yellow-700'
                    }`}
                  >
                    Подход
                  </button>
                  <button
                    onClick={() => { if (currentPhoto) { tagPhoto(currentPhoto.filename, { type: 'skip' }); goNext() } }}
                    className={`flex-1 px-2 py-1.5 rounded text-[11px] font-medium ${
                      currentTag?.type === 'skip' ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    Пропустить
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Step 2: Pick routes */}
                <div className="flex items-center gap-1 mb-1.5">
                  <button onClick={() => { setConfirmedSector(null); setSelectedSectors([]); setEditingRouteId(null) }}
                    className="text-blue-600 text-sm">&larr;</button>
                  <span className="text-[11px] text-gray-500 font-medium truncate">
                    {sectors?.find(s => s.id === confirmedSector)?.name}
                  </span>
                </div>

                <div className="flex flex-col gap-1 mb-2">
                  {sectorRoutes.map(r => (
                    editingRouteId === r.id ? (
                      /* Inline grade editor */
                      <div key={r.id} className="p-2 bg-amber-50 rounded border border-amber-200">
                        <div className="text-[10px] text-gray-500 mb-1">{r.name}</div>
                        <div className="text-[10px] text-gray-500 mb-0.5">Категория:</div>
                        <div className="flex flex-wrap gap-0.5 mb-1">
                          {GRADES.map(g => (
                            <button key={g} onClick={() => setEditGrade(g)}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                                editGrade === g ? 'bg-amber-600 text-white' : 'bg-white text-gray-600'
                              }`}>{g}</button>
                          ))}
                        </div>
                        <div className="text-[10px] text-gray-500 mb-0.5">Альт. категория:</div>
                        <div className="flex flex-wrap gap-0.5 mb-1">
                          <button onClick={() => setEditGradeAlt('')}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              !editGradeAlt ? 'bg-gray-600 text-white' : 'bg-white text-gray-400'
                            }`}>—</button>
                          {GRADES.map(g => (
                            <button key={g} onClick={() => setEditGradeAlt(g)}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                                editGradeAlt === g ? 'bg-amber-600 text-white' : 'bg-white text-gray-600'
                              }`}>{g}</button>
                          ))}
                        </div>
                        {/* Pitches */}
                        <div className="text-[10px] text-gray-500 mb-0.5">Питчи:</div>
                        <div className="flex gap-0.5 mb-1">
                          {[1,2,3,4,5,6].map(n => (
                            <button key={n} onClick={() => { setEditPitches(n); if (n > 1 && editPitchGrades.length < n) setEditPitchGrades(prev => [...prev, ...Array(n - prev.length).fill(editGrade)]) }}
                              className={`w-6 h-6 rounded text-[10px] font-bold ${
                                editPitches === n ? 'bg-amber-600 text-white' : 'bg-white text-gray-600'
                              }`}>{n}</button>
                          ))}
                        </div>
                        {editPitches > 1 && (
                          <div className="mb-1">
                            {Array.from({ length: editPitches }).map((_, i) => (
                              <div key={i} className="flex items-center gap-1 mb-0.5">
                                <span className="text-[9px] text-gray-400 w-4">P{i+1}</span>
                                <div className="flex flex-wrap gap-0.5">
                                  {GRADES.map(g => (
                                    <button key={g} onClick={() => setEditPitchGrades(prev => { const n = [...prev]; n[i] = g; return n })}
                                      className={`px-1 py-0 rounded text-[8px] font-mono font-bold ${
                                        (editPitchGrades[i] || editGrade) === g ? 'bg-amber-500 text-white' : 'bg-white text-gray-500'
                                      }`}>{g}</button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-1">
                          <button onClick={saveEditRoute}
                            className="flex-1 bg-amber-600 text-white rounded px-2 py-1 text-[10px] font-medium">
                            OK ({editGrade}{editGradeAlt ? `/${editGradeAlt}` : ''}{editPitches > 1 ? ` ${editPitches}p` : ''})
                          </button>
                          <button onClick={() => setEditingRouteId(null)}
                            className="px-2 py-1 rounded text-[10px] bg-gray-100">X</button>
                        </div>
                      </div>
                    ) : (
                      <div key={r.id} className="flex gap-1">
                        <button
                          onClick={() => toggleRoute(r.id)}
                          className={`flex-1 px-2 py-1.5 rounded text-xs font-medium text-left transition-colors ${
                            selectedRoutes.includes(r.id)
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          <span className="font-mono font-bold text-[10px]">{gradeDisplay(r)}</span> {r.name}
                        </button>
                        <button
                          onClick={() => startEditRoute(r)}
                          className="px-1.5 text-gray-400 hover:text-amber-600 text-[10px]"
                          title="Изменить категорию"
                        >&#9998;</button>
                      </div>
                    )
                  ))}
                </div>

                <button
                  onClick={confirmRoutes}
                  className="w-full mb-2 px-2 py-1.5 rounded text-xs font-medium bg-green-600 text-white"
                >
                  {selectedRoutes.length === 0
                    ? 'Обзор сектора'
                    : `Сохранить (${selectedRoutes.length}) →`}
                </button>

                {!showAddRoute ? (
                  <button
                    onClick={() => setShowAddRoute(true)}
                    className="w-full mb-2 px-2 py-1.5 rounded text-[11px] font-medium bg-green-50 text-green-700 border border-dashed border-green-300"
                  >
                    + Маршрут
                  </button>
                ) : (
                  <div className="mb-2 p-2 bg-green-50 rounded border border-green-200">
                    <input
                      type="text"
                      value={newRouteName}
                      onChange={e => setNewRouteName(e.target.value)}
                      placeholder="Название"
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs mb-1"
                      autoFocus
                    />
                    <div className="text-[10px] text-gray-500 mb-0.5">Категория:</div>
                    <div className="flex flex-wrap gap-0.5 mb-1">
                      {GRADES.map(g => (
                        <button key={g} onClick={() => setNewRouteGrade(g)}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                            newRouteGrade === g ? 'bg-green-600 text-white' : 'bg-white text-gray-600'
                          }`}>{g}</button>
                      ))}
                    </div>
                    <div className="text-[10px] text-gray-500 mb-0.5">Альт. категория:</div>
                    <div className="flex flex-wrap gap-0.5 mb-1">
                      <button onClick={() => setNewRouteGradeAlt('')}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          !newRouteGradeAlt ? 'bg-gray-600 text-white' : 'bg-white text-gray-400'
                        }`}>—</button>
                      {GRADES.map(g => (
                        <button key={g} onClick={() => setNewRouteGradeAlt(g)}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                            newRouteGradeAlt === g ? 'bg-green-600 text-white' : 'bg-white text-gray-600'
                          }`}>{g}</button>
                      ))}
                    </div>
                    {/* Pitches */}
                    <div className="text-[10px] text-gray-500 mb-0.5">Питчи:</div>
                    <div className="flex gap-0.5 mb-1">
                      {[1,2,3,4,5,6].map(n => (
                        <button key={n} onClick={() => { setNewRoutePitches(n); if (n > 1 && newRoutePitchGrades.length < n) setNewRoutePitchGrades(prev => [...prev, ...Array(n - prev.length).fill(newRouteGrade)]) }}
                          className={`w-6 h-6 rounded text-[10px] font-bold ${
                            newRoutePitches === n ? 'bg-green-600 text-white' : 'bg-white text-gray-600'
                          }`}>{n}</button>
                      ))}
                    </div>
                    {newRoutePitches > 1 && (
                      <div className="mb-1">
                        {Array.from({ length: newRoutePitches }).map((_, i) => (
                          <div key={i} className="flex items-center gap-1 mb-0.5">
                            <span className="text-[9px] text-gray-400 w-4">P{i+1}</span>
                            <div className="flex flex-wrap gap-0.5">
                              {GRADES.map(g => (
                                <button key={g} onClick={() => setNewRoutePitchGrades(prev => { const n = [...prev]; n[i] = g; return n })}
                                  className={`px-1 py-0 rounded text-[8px] font-mono font-bold ${
                                    (newRoutePitchGrades[i] || newRouteGrade) === g ? 'bg-green-500 text-white' : 'bg-white text-gray-500'
                                  }`}>{g}</button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-1">
                      <button onClick={addRoute} disabled={!newRouteName.trim()}
                        className="flex-1 bg-green-600 text-white rounded px-2 py-1 text-[10px] font-medium disabled:opacity-40">
                        + {newRouteGrade}{newRoutePitches > 1 ? ` ${newRoutePitches}p` : ''} {newRouteName || '...'}
                      </button>
                      <button onClick={() => setShowAddRoute(false)}
                        className="px-2 py-1 rounded text-[10px] bg-gray-100">X</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Bottom nav */}
          <div className="flex gap-1 px-3 py-2 border-t border-gray-100">
            <button
              onClick={() => { setCurrentIdx(Math.max(0, currentIdx - 1)); setSelectedSectors([]); setConfirmedSector(null); setEditingRouteId(null); setZoom(1) }}
              disabled={currentIdx === 0}
              className="flex-1 bg-gray-100 py-1.5 rounded text-xs disabled:opacity-30"
            >
              ←
            </button>
            <span className="text-[10px] text-gray-400 self-center px-1">{taggedCount}/{photos.length}</span>
            <button
              onClick={goNext}
              disabled={currentIdx >= photos.length - 1}
              className="flex-1 bg-gray-100 py-1.5 rounded text-xs disabled:opacity-30"
            >
              →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── GRID MODE ───
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-lg font-bold">Разметка фото ({taggedCount}/{photos.length})</h1>
        <button onClick={() => setMode('single')} className="text-sm text-blue-600">По одному</button>
      </div>

      {saved && (
        <div className="bg-green-50 text-green-700 rounded-lg p-3 mb-3 text-sm">Сохранено!</div>
      )}

      {taggedCount > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-1 mb-2">
            {Array.from(summary.sectorPhotos).map(([sid, files]) => {
              const name = sectors?.find(s => s.id === sid)?.name ?? sid
              const cover = sectorCovers[sid] || files[0]
              return (
                <span key={sid} className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
                  {name}: {files.length} {cover ? '(обложка задана)' : ''}
                </span>
              )
            })}
            {summary.approach > 0 && (
              <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded-full">
                Подход: {summary.approach}
              </span>
            )}
            {summary.skipped > 0 && (
              <span className="bg-gray-100 text-gray-500 text-xs px-2 py-1 rounded-full">
                Пропущено: {summary.skipped}
              </span>
            )}
          </div>
          {summary.routePhotos.size > 0 && (
            <div className="text-xs text-gray-500 mb-2">
              Маршрутов с фото: {summary.routePhotos.size}
            </div>
          )}
          <button onClick={handleSave} disabled={saving}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? 'Сохранение...' : 'Сохранить в БД'}
          </button>
        </div>
      )}

      {/* Photo grid — square thumbnails */}
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-1">
        {photos.map((photo, idx) => {
          const tag = tags[photo.filename]
          const label = getTagLabel(tag)
          const borderClass = !tag ? 'border-transparent'
            : tag.type === 'skip' ? 'opacity-30 border-gray-300'
            : tag.type === 'approach' ? 'border-yellow-400'
            : tag.type === 'route' ? 'border-green-500'
            : 'border-blue-500'
          const isCover = tag?.sectorId && sectorCovers[tag.sectorId] === photo.filename
          return (
            <div
              key={photo.filename}
              className={`group relative cursor-pointer rounded overflow-hidden border-2 ${borderClass}`}
              onClick={() => { setCurrentIdx(idx); setSelectedSectors([]); setConfirmedSector(null); setMode('single') }}
            >
              <img
                src={PHOTO_DIR + photo.filename}
                alt={photo.filename}
                className="w-full aspect-square object-cover"
                loading="lazy"
              />
              {isCover && (
                <div className="absolute top-0 left-0 bg-yellow-400 text-black text-[8px] font-bold px-1 py-0.5 rounded-br">
                  Cover
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] px-1 py-0.5 truncate">
                {photo.time}{label ? ` · ${label}` : ''}
              </div>
              {/* Action buttons */}
              {tag && tag.type !== 'skip' && (
                <div className="absolute top-0 right-0 flex gap-0.5">
                  {(tag.type === 'sector' || tag.type === 'route') && tag.sectorId && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setCover(tag.sectorId!, photo.filename) }}
                      className={`text-[9px] px-1 py-0.5 rounded-bl font-bold ${
                        isCover ? 'bg-yellow-400 text-black' : 'bg-black/50 text-yellow-300'
                      }`}
                      title="Обложка"
                    >
                      ★
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setTags(prev => {
                        const next = { ...prev }
                        delete next[photo.filename]
                        localStorage.setItem('photo-tags', JSON.stringify(next))
                        return next
                      })
                    }}
                    className="bg-red-600/80 text-white text-[9px] px-1 py-0.5 rounded-bl"
                    title="Удалить разметку"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
