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
  time: string // HH:MM from filename
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

// Tag: sectorIds (can be multiple), routeIds (can be multiple), 'skip', or 'approach'
interface PhotoTag {
  type: 'sector' | 'route' | 'skip' | 'approach'
  sectorIds?: string[]
  sectorId?: string
  routeIds?: string[]   // multiple routes on one photo
  routeId?: string      // kept for backward compat
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
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([])
  const [showAddRoute, setShowAddRoute] = useState(false)
  const [newRouteName, setNewRouteName] = useState('')
  const [newRouteGrade, setNewRouteGrade] = useState('6a')
  const [showAddSector, setShowAddSector] = useState(false)
  const [newSectorName, setNewSectorName] = useState('')
  const [zoom, setZoom] = useState(1)

  // Persist current index
  useEffect(() => {
    localStorage.setItem('photo-tagger-idx', String(currentIdx))
  }, [currentIdx])

  // Load photos from manifest.json directly (Vite doesn't serve directory listings)
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

  // Routes grouped by sector
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

  // Summary: group tagged photos
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
        // Also count for sector
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
      // No routes selected = sector overview
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
      // Single sector — go to route selection
      setConfirmedSector(selectedSectors[0])
    } else {
      // Multiple sectors — save as multi-sector panorama and advance
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
      gradeSystem: 'french',
      gradeSort: GRADE_SORT[newRouteGrade] || 0,
      pitches: 1,
      routeType: 'sport',
      isPublic: true,
      sortOrder: (sectorRoutes?.length ?? 0) + 1,
      tags: [],
      createdAt: now,
      updatedAt: now,
    })
    setSelectedRoutes(prev => [...prev, id])
    setNewRouteName('')
    setShowAddRoute(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Save sector-level topos (first photo per sector)
      for (const [sectorId, files] of summary.sectorPhotos) {
        const mainFile = files[0]
        const img = new Image()
        img.src = PHOTO_DIR + mainFile
        await new Promise<void>(resolve => { img.onload = () => resolve() })

        const topo: Topo = {
          id: `topo-${sectorId}`,
          sectorId,
          imageUrl: PHOTO_DIR + mainFile,
          imageWidth: img.naturalWidth,
          imageHeight: img.naturalHeight,
          caption: files.length > 1 ? `${files.length} фото` : undefined,
          sortOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        await db.topos.put(topo)
      }

      // Save route-level photos as additional topos
      for (const [routeId, files] of summary.routePhotos) {
        const route = routes?.find(r => r.id === routeId)
        if (!route) continue
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const img = new Image()
          img.src = PHOTO_DIR + file
          await new Promise<void>(resolve => { img.onload = () => resolve() })

          const topo: Topo = {
            id: `topo-route-${routeId}-${i}`,
            sectorId: route.sectorId,
            imageUrl: PHOTO_DIR + file,
            imageWidth: img.naturalWidth,
            imageHeight: img.naturalHeight,
            caption: `${route.name} (${route.grade})`,
            sortOrder: 10 + i,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          await db.topos.put(topo)
        }
      }

      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  // Tag label for display
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

  if (mode === 'single') {
    return (
      <div className="p-4 pb-20">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-lg font-bold">
            {currentIdx + 1}/{photos.length}
          </h1>
          <button onClick={() => setMode('grid')} className="text-sm text-blue-600">
            Сетка
          </button>
        </div>

        {currentPhoto && (
          <>
            <div className="text-xs text-gray-400 mb-1">{currentPhoto.filename} ({currentPhoto.time})</div>
            {currentTag && (
              <div className="text-xs text-blue-600 font-medium mb-1">{getTagLabel(currentTag)}</div>
            )}
            <div className="relative mb-2">
              <div className="overflow-auto rounded-lg border border-gray-200" style={{ maxHeight: '65vh' }}>
                <img
                  src={PHOTO_DIR + currentPhoto.filename}
                  alt={currentPhoto.filename}
                  style={{ width: `${zoom * 100}%`, maxWidth: 'none' }}
                  draggable={false}
                />
              </div>
              <div className="absolute top-2 right-2 flex gap-1">
                <button
                  onClick={() => setZoom(z => Math.max(0.3, z - 0.2))}
                  className="w-8 h-8 bg-black/50 text-white rounded-full text-lg leading-none"
                >-</button>
                <button
                  onClick={() => setZoom(1)}
                  className="h-8 px-2 bg-black/50 text-white rounded-full text-xs"
                >{Math.round(zoom * 100)}%</button>
                <button
                  onClick={() => setZoom(z => Math.min(3, z + 0.2))}
                  className="w-8 h-8 bg-black/50 text-white rounded-full text-lg leading-none"
                >+</button>
              </div>
            </div>

            {/* Step 1: Pick sector(s) */}
            {!confirmedSector ? (
              <>
                <div className="text-xs text-gray-500 mb-2 font-medium">
                  Какой сектор? {selectedSectors.length > 1 && <span className="text-blue-600">(выбрано {selectedSectors.length})</span>}
                </div>
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  {sectors?.map(s => (
                    <button
                      key={s.id}
                      onClick={() => toggleSector(s.id)}
                      className={`px-2 py-2 rounded text-xs font-medium transition-colors ${
                        selectedSectors.includes(s.id)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>

                {selectedSectors.length > 0 && (
                  <button
                    onClick={confirmSectors}
                    className="w-full mb-2 px-2 py-2 rounded text-xs font-medium bg-blue-600 text-white"
                  >
                    {selectedSectors.length > 1
                      ? `Панорама ${selectedSectors.length} секторов — сохранить`
                      : 'Выбрать маршрут →'}
                  </button>
                )}

                {/* Add new sector */}
                {!showAddSector ? (
                  <button
                    onClick={() => setShowAddSector(true)}
                    className="w-full mb-2 px-2 py-2 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-dashed border-blue-300"
                  >
                    + Добавить сектор
                  </button>
                ) : (
                  <div className="mb-2 p-2 bg-blue-50 rounded-lg border border-blue-200 flex gap-2">
                    <input
                      type="text"
                      value={newSectorName}
                      onChange={e => setNewSectorName(e.target.value)}
                      placeholder="Название сектора"
                      className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') addSector() }}
                    />
                    <button
                      onClick={addSector}
                      disabled={!newSectorName.trim()}
                      className="bg-blue-600 text-white rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                    >
                      OK
                    </button>
                    <button
                      onClick={() => setShowAddSector(false)}
                      className="px-2 py-1.5 rounded text-xs bg-gray-100 text-gray-600"
                    >
                      X
                    </button>
                  </div>
                )}

                <div className="flex gap-1.5">
                  <button
                    onClick={() => { tagPhoto(currentPhoto.filename, { type: 'approach' }); goNext() }}
                    className={`flex-1 px-2 py-2 rounded text-xs font-medium ${
                      currentTag?.type === 'approach' ? 'bg-yellow-500 text-white' : 'bg-yellow-50 text-yellow-700'
                    }`}
                  >
                    Подход / дорога
                  </button>
                  <button
                    onClick={() => { tagPhoto(currentPhoto.filename, { type: 'skip' }); goNext() }}
                    className={`flex-1 px-2 py-2 rounded text-xs font-medium ${
                      currentTag?.type === 'skip' ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    Пропустить
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Step 2: Pick route or mark as sector overview */}
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => { setConfirmedSector(null); setSelectedSectors([]) }} className="text-blue-600 text-sm">
                    &larr;
                  </button>
                  <span className="text-xs text-gray-500 font-medium">
                    {sectors?.find(s => s.id === confirmedSector)?.name}: какой маршрут?
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 mb-2 max-h-60 overflow-y-auto">
                  {sectorRoutes.map(r => (
                    <button
                      key={r.id}
                      onClick={() => toggleRoute(r.id)}
                      className={`px-2 py-2 rounded text-xs font-medium text-left transition-colors ${
                        selectedRoutes.includes(r.id)
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span className="font-mono font-bold text-[10px]">{r.grade}</span> {r.name}
                    </button>
                  ))}
                </div>

                <button
                  onClick={confirmRoutes}
                  className="w-full mb-2 px-2 py-2 rounded text-xs font-medium bg-green-600 text-white"
                >
                  {selectedRoutes.length === 0
                    ? 'Обзор сектора (без маршрутов)'
                    : selectedRoutes.length === 1
                    ? 'Сохранить (1 маршрут) →'
                    : `Сохранить (${selectedRoutes.length} маршрутов) →`}
                </button>

                {/* Add new route */}
                {!showAddRoute ? (
                  <button
                    onClick={() => setShowAddRoute(true)}
                    className="w-full mb-3 px-2 py-2 rounded text-xs font-medium bg-green-50 text-green-700 border border-dashed border-green-300"
                  >
                    + Добавить маршрут
                  </button>
                ) : (
                  <div className="mb-3 p-2 bg-green-50 rounded-lg border border-green-200">
                    <input
                      type="text"
                      value={newRouteName}
                      onChange={e => setNewRouteName(e.target.value)}
                      placeholder="Название маршрута"
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mb-2"
                      autoFocus
                    />
                    <div className="flex flex-wrap gap-1 mb-2">
                      {GRADES.map(g => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setNewRouteGrade(g)}
                          className={`px-2 py-1 rounded text-[10px] font-mono font-bold ${
                            newRouteGrade === g ? 'bg-green-600 text-white' : 'bg-white text-gray-700'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={addRoute}
                        disabled={!newRouteName.trim()}
                        className="flex-1 bg-green-600 text-white rounded px-2 py-1.5 text-xs font-medium disabled:opacity-40"
                      >
                        Добавить {newRouteGrade} {newRouteName || '...'}
                      </button>
                      <button
                        onClick={() => setShowAddRoute(false)}
                        className="px-3 py-1.5 rounded text-xs bg-gray-100 text-gray-600"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Navigation */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setCurrentIdx(Math.max(0, currentIdx - 1)); setSelectedSectors([]); setConfirmedSector(null) }}
                disabled={currentIdx === 0}
                className="flex-1 bg-gray-100 py-2 rounded-lg text-sm disabled:opacity-30"
              >
                Назад
              </button>
              <button
                onClick={goNext}
                disabled={currentIdx >= photos.length - 1}
                className="flex-1 bg-gray-100 py-2 rounded-lg text-sm disabled:opacity-30"
              >
                Далее
              </button>
            </div>

            <div className="mt-3 text-xs text-gray-400">
              Размечено: {taggedCount}/{photos.length}
            </div>
          </>
        )}
      </div>
    )
  }

  // Grid mode
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-lg font-bold">Разметка фото ({taggedCount}/{photos.length})</h1>
        <button onClick={() => setMode('single')} className="text-sm text-blue-600">
          По одному
        </button>
      </div>

      {saved && (
        <div className="bg-green-50 text-green-700 rounded-lg p-3 mb-3 text-sm">
          Сохранено!
        </div>
      )}

      {/* Summary */}
      {taggedCount > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold mb-2">Статистика:</h2>
          <div className="flex flex-wrap gap-1 mb-2">
            {Array.from(summary.sectorPhotos).map(([sid, files]) => {
              const name = sectors?.find(s => s.id === sid)?.name ?? sid
              return (
                <span key={sid} className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
                  {name}: {files.length}
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
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Сохранение...' : 'Сохранить в БД'}
          </button>
        </div>
      )}

      {/* Photo grid */}
      <div className="grid grid-cols-3 gap-1">
        {photos.map((photo, idx) => {
          const tag = tags[photo.filename]
          const label = getTagLabel(tag)
          const borderClass = !tag ? 'border-transparent'
            : tag.type === 'skip' ? 'opacity-30 border-gray-300'
            : tag.type === 'approach' ? 'border-yellow-400'
            : tag.type === 'route' ? 'border-green-500'
            : 'border-blue-500'
          return (
            <div
              key={photo.filename}
              className={`relative cursor-pointer rounded overflow-hidden border-2 ${borderClass}`}
              onClick={() => { setCurrentIdx(idx); setSelectedSectors([]); setConfirmedSector(null); setMode('single') }}
            >
              <img
                src={PHOTO_DIR + photo.filename}
                alt={photo.filename}
                className="w-full h-24 object-cover"
                loading="lazy"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate">
                {photo.time} {label && `· ${label}`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
