import { useState, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Topo } from '../../lib/db/schema'
import { TopoEditor } from '../../components/topo/TopoEditor'
import { CropModal } from '../../components/topo/CropModal'
import { AdminNav } from '../../components/admin/AdminNav'

type UploadType = 'topo' | 'approach'

let saveTimer: ReturnType<typeof setTimeout> | null = null

async function saveTopoData() {
  // Debounce: wait 1s after last change before saving
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
      } else {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'topo-data.json'; a.click()
        URL.revokeObjectURL(url)
      }
    } catch {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'topo-data.json'; a.click()
      URL.revokeObjectURL(url)
    }
  }, 1000)
}

export function AdminTopoPage() {
  const sectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())
  const [selectedSectorId, setSelectedSectorId] = useState<string>('')
  const [editingTopo, setEditingTopo] = useState<Topo | null>(null)
  const [uploadType, setUploadType] = useState<UploadType>('topo')
  const [editingCaption, setEditingCaption] = useState<{ id: string; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [croppingTopo, setCroppingTopo] = useState<Topo | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const topos = useLiveQuery(
    () => selectedSectorId
      ? db.topos.where('sectorId').equals(selectedSectorId).sortBy('sortOrder')
      : Promise.resolve([] as Topo[]),
    [selectedSectorId],
  )

  const selectedSector = sectors?.find(s => s.id === selectedSectorId)

  const sectorTopos = topos?.filter(t => !t.type || t.type === 'topo') ?? []
  const approachPhotos = topos?.filter(t => t.type === 'approach') ?? []

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !selectedSectorId) return

    setUploading(true)
    const currentCount = topos?.length || 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.src = url

      await new Promise<void>((resolve) => { img.onload = () => resolve() })

      // Resize to max 2000px on longest side
      const MAX = 2000
      let w = img.width
      let h = img.height
      if (w > MAX || h > MAX) {
        const ratio = Math.min(MAX / w, MAX / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75)

      const topo: Topo = {
        id: `topo-${Date.now()}-${i}`,
        sectorId: selectedSectorId,
        imageUrl: dataUrl,
        imageWidth: w,
        imageHeight: h,
        type: uploadType,
        sortOrder: currentCount + i + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await db.topos.put(topo)
      URL.revokeObjectURL(url)
    }

    e.target.value = ''
    setUploading(false)
    saveTopoData()
  }

  const handleDeleteTopo = async (topoId: string) => {
    await db.topoRoutes.where('topoId').equals(topoId).delete()
    await db.topos.delete(topoId)
    saveTopoData()
  }

  const handleToggleCover = async (imageUrl: string) => {
    if (!selectedSectorId) return
    const isCurrent = selectedSector?.coverImageUrl === imageUrl
    if (isCurrent) {
      await db.sectors.where('id').equals(selectedSectorId).modify(s => {
        delete s.coverImageUrl
      })
    } else {
      await db.sectors.update(selectedSectorId, { coverImageUrl: imageUrl })
    }
    saveTopoData()
  }

  const handleCrop = async (croppedDataUrl: string, width: number, height: number) => {
    if (!croppingTopo) return
    await db.topos.update(croppingTopo.id, {
      imageUrl: croppedDataUrl,
      imageWidth: width,
      imageHeight: height,
      updatedAt: new Date().toISOString(),
    })
    setCroppingTopo(null)
    saveTopoData()
  }

  const handleSaveCaption = async () => {
    if (!editingCaption) return
    await db.topos.update(editingCaption.id, { caption: editingCaption.text || undefined })
    setEditingCaption(null)
  }

  const renderPhotoCard = (topo: Topo, borderColor: string) => {
    const isCover = selectedSector?.coverImageUrl === topo.imageUrl
    const isApproach = topo.type === 'approach'
    const isEditingThis = editingCaption?.id === topo.id

    return (
      <div key={topo.id} className={`border ${borderColor} rounded-lg overflow-hidden`}>
        {/* Photo — proper aspect ratio, no cropping */}
        <div className="relative">
          <img
            src={topo.imageUrl}
            alt={topo.caption || 'Topo'}
            className="w-full max-h-[500px] object-contain bg-gray-100"
          />
          {isCover && (
            <div className="absolute top-2 left-2 bg-yellow-400 text-black text-xs font-bold px-2 py-1 rounded">
              Обложка
            </div>
          )}
          {isApproach && (
            <div className="absolute top-2 left-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded">
              Подход
            </div>
          )}
        </div>

        {/* Caption for approach */}
        {isApproach && (
          <div className="px-3 pt-2">
            {isEditingThis ? (
              <div className="flex gap-1">
                <input
                  value={editingCaption!.text}
                  onChange={(e) => setEditingCaption({ id: editingCaption!.id, text: e.target.value })}
                  placeholder="Описание подхода..."
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                  autoFocus
                />
                <button onClick={handleSaveCaption} className="text-sm bg-green-600 text-white px-3 py-1 rounded">OK</button>
                <button onClick={() => setEditingCaption(null)} className="text-sm text-gray-400 px-2">x</button>
              </div>
            ) : (
              <div
                onClick={() => setEditingCaption({ id: topo.id, text: topo.caption || '' })}
                className="text-sm text-gray-600 cursor-pointer hover:text-blue-600 min-h-[24px]"
              >
                {topo.caption || <span className="text-gray-400 italic">Добавить описание...</span>}
              </div>
            )}
          </div>
        )}

        {/* Actions bar */}
        <div className="px-3 py-2">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-400 mr-auto">
              {topo.imageWidth}x{topo.imageHeight}
            </span>
            <button
              onClick={() => handleToggleCover(topo.imageUrl)}
              className={`text-lg px-1 ${isCover ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-400'}`}
              title="Обложка"
            >
              ★
            </button>
            <button
              onClick={() => setCroppingTopo(topo)}
              className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-200"
            >
              ✂ Обрезать
            </button>
            <button
              onClick={() => setEditingTopo(topo)}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded"
            >
              ✏ Разметить
            </button>
            <button
              onClick={() => handleDeleteTopo(topo.id)}
              className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded hover:bg-red-100"
            >
              🗑 Удалить
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <AdminNav />
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Топо-редактор</h1>
          </div>
          <button
            onClick={saveTopoData}
            className="ml-auto text-sm bg-gray-800 text-white px-5 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            💾 Сохранить
          </button>
        </div>

        {/* Sector selector — card-style buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {sectors?.map((s) => {
            const isActive = s.id === selectedSectorId
            const count = topos && isActive ? topos.length : 0
            return (
              <button
                key={s.id}
                onClick={() => { setSelectedSectorId(isActive ? '' : s.id); setEditingTopo(null) }}
                className={`text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {s.name}
                {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
              </button>
            )
          })}
        </div>
      </div>

      {selectedSectorId && !editingTopo && (
        <>
          {/* Upload — multi-file */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setUploadType('topo')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  uploadType === 'topo' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'
                }`}
              >
                Фото стены
              </button>
              <button
                onClick={() => setUploadType('approach')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  uploadType === 'approach' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 border'
                }`}
              >
                Фото подхода
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
            >
              {uploading ? 'Загрузка...' : 'Выбрать фото (можно несколько)'}
            </button>
          </div>

          {/* Cover preview */}
          {selectedSector?.coverImageUrl && (
            <div className="mb-4 flex items-center gap-3 p-2 bg-yellow-50 rounded-lg">
              <img src={selectedSector.coverImageUrl} alt="Cover" className="h-16 rounded object-cover" />
              <span className="text-sm text-yellow-700">Обложка сектора</span>
            </div>
          )}

          {/* Topo photos */}
          {sectorTopos.length > 0 && (
            <div className="space-y-4 mb-6">
              <h2 className="text-sm font-semibold text-gray-700">Фото стен ({sectorTopos.length})</h2>
              {sectorTopos.map((topo) => renderPhotoCard(topo, 'border-gray-200'))}
            </div>
          )}

          {/* Approach photos */}
          {approachPhotos.length > 0 && (
            <div className="space-y-4 mb-6">
              <h2 className="text-sm font-semibold text-green-700">Фото подходов ({approachPhotos.length})</h2>
              {approachPhotos.map((topo) => renderPhotoCard(topo, 'border-green-200'))}
            </div>
          )}
        </>
      )}

      {croppingTopo && (
        <CropModal
          imageUrl={croppingTopo.imageUrl}
          onCrop={handleCrop}
          onCancel={() => setCroppingTopo(null)}
        />
      )}

      {editingTopo && (
        <div>
          <button
            onClick={() => { setEditingTopo(null); saveTopoData() }}
            className="text-sm text-blue-600 mb-3 hover:underline"
          >
            &larr; Назад к {selectedSector?.name || 'списку'}
          </button>
          <TopoEditor topo={editingTopo} onSave={saveTopoData} />
        </div>
      )}
    </div>
  )
}
