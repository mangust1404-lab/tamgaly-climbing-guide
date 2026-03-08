import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Topo } from '../../lib/db/schema'

// Photos in public/topos/ — loaded dynamically
const PHOTO_DIR = '/topos/'

interface PhotoInfo {
  filename: string
  time: string // HH:MM from filename
}

function parsePhotos(filenames: string[]): PhotoInfo[] {
  return filenames
    .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png') || f.endsWith('.webp'))
    .sort()
    .map(f => {
      // Extract time from IMG_YYYYMMDD_HHMMSS.jpg
      const m = f.match(/_(\d{2})(\d{2})(\d{2})\.\w+$/)
      const time = m ? `${m[1]}:${m[2]}` : ''
      return { filename: f, time }
    })
}

type Tag = 'skip' | string // sectorId or 'skip'

export function AdminPhotoTagger() {
  const sectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())
  const [photos, setPhotos] = useState<PhotoInfo[]>([])
  const [tags, setTags] = useState<Record<string, Tag>>({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [mode, setMode] = useState<'grid' | 'single'>('grid')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load photo list
  useEffect(() => {
    fetch('/topos/')
      .then(r => r.text())
      .then(html => {
        // Parse directory listing or use hardcoded list
        const matches = html.match(/href="([^"]+\.(jpg|jpeg|png|webp))"/gi)
        if (matches) {
          const files = matches.map(m => m.replace(/href="/i, '').replace(/"$/, ''))
          setPhotos(parsePhotos(files))
        }
      })
      .catch(() => {
        // Fallback: try known photo pattern
        console.log('Could not fetch directory listing')
      })
  }, [])

  // Also try loading from a manifest if dir listing fails
  useEffect(() => {
    if (photos.length > 0) return
    fetch('/topos/manifest.json')
      .then(r => r.json())
      .then((files: string[]) => setPhotos(parsePhotos(files)))
      .catch(() => {})
  }, [photos.length])

  const tagPhoto = (filename: string, tag: Tag) => {
    setTags(prev => ({ ...prev, [filename]: tag }))
  }

  const currentPhoto = photos[currentIdx]
  const taggedCount = Object.keys(tags).length
  const sectorPhotos = new Map<string, string[]>()
  for (const [file, tag] of Object.entries(tags)) {
    if (tag !== 'skip') {
      const list = sectorPhotos.get(tag) || []
      list.push(file)
      sectorPhotos.set(tag, list)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      for (const [sectorId, files] of sectorPhotos) {
        // Use first photo as main topo for sector
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
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (photos.length === 0) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Разметка фото</h1>
        <p className="text-gray-500 text-sm mb-4">
          Загрузка списка фото... Если ничего не появляется, создайте файл <code>public/topos/manifest.json</code> со списком файлов.
        </p>
        <button
          onClick={() => {
            // Generate manifest from known pattern
            fetch('/topos/IMG_20260308_104907.jpg', { method: 'HEAD' })
              .then(r => {
                if (r.ok) alert('Photos exist but directory listing is disabled. Generate manifest.json.')
              })
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
        >
          Проверить
        </button>
      </div>
    )
  }

  if (mode === 'single') {
    return (
      <div className="p-4">
        <div className="flex justify-between items-center mb-3">
          <h1 className="text-lg font-bold">
            Фото {currentIdx + 1}/{photos.length}
          </h1>
          <button onClick={() => setMode('grid')} className="text-sm text-blue-600">
            Сетка
          </button>
        </div>

        {currentPhoto && (
          <>
            <div className="text-xs text-gray-400 mb-2">{currentPhoto.filename} ({currentPhoto.time})</div>
            <img
              src={PHOTO_DIR + currentPhoto.filename}
              alt={currentPhoto.filename}
              className="w-full rounded-lg mb-3"
            />

            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {sectors?.map(s => (
                <button
                  key={s.id}
                  onClick={() => {
                    tagPhoto(currentPhoto.filename, s.id)
                    if (currentIdx < photos.length - 1) setCurrentIdx(currentIdx + 1)
                  }}
                  className={`px-2 py-2 rounded text-xs font-medium transition-colors ${
                    tags[currentPhoto.filename] === s.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {s.name}
                </button>
              ))}
              <button
                onClick={() => {
                  tagPhoto(currentPhoto.filename, 'skip')
                  if (currentIdx < photos.length - 1) setCurrentIdx(currentIdx + 1)
                }}
                className={`px-2 py-2 rounded text-xs font-medium ${
                  tags[currentPhoto.filename] === 'skip'
                    ? 'bg-gray-600 text-white'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                Пропустить
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
                disabled={currentIdx === 0}
                className="flex-1 bg-gray-100 py-2 rounded-lg text-sm disabled:opacity-30"
              >
                Назад
              </button>
              <button
                onClick={() => setCurrentIdx(Math.min(photos.length - 1, currentIdx + 1))}
                disabled={currentIdx >= photos.length - 1}
                className="flex-1 bg-gray-100 py-2 rounded-lg text-sm disabled:opacity-30"
              >
                Далее
              </button>
            </div>
          </>
        )}

        <div className="mt-4 text-xs text-gray-400">
          Размечено: {taggedCount}/{photos.length}
        </div>
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
          Сохранено! Топо-фото привязаны к секторам.
        </div>
      )}

      {/* Summary */}
      {sectorPhotos.size > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold mb-2">Привязано:</h2>
          <div className="flex flex-wrap gap-1">
            {Array.from(sectorPhotos).map(([sid, files]) => {
              const name = sectors?.find(s => s.id === sid)?.name ?? sid
              return (
                <span key={sid} className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
                  {name}: {files.length} фото
                </span>
              )
            })}
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-3 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Сохранение...' : 'Сохранить привязки в БД'}
          </button>
        </div>
      )}

      {/* Photo grid */}
      <div className="grid grid-cols-3 gap-1">
        {photos.map((photo, idx) => {
          const tag = tags[photo.filename]
          const sectorName = tag && tag !== 'skip'
            ? sectors?.find(s => s.id === tag)?.name ?? ''
            : ''
          return (
            <div
              key={photo.filename}
              className={`relative cursor-pointer rounded overflow-hidden border-2 ${
                tag === 'skip' ? 'opacity-30 border-gray-300'
                  : tag ? 'border-blue-500'
                  : 'border-transparent'
              }`}
              onClick={() => { setCurrentIdx(idx); setMode('single') }}
            >
              <img
                src={PHOTO_DIR + photo.filename}
                alt={photo.filename}
                className="w-full h-24 object-cover"
                loading="lazy"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5">
                {photo.time} {sectorName && `· ${sectorName}`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
