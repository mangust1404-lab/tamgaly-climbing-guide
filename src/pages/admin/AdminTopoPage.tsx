import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Topo } from '../../lib/db/schema'
import { TopoEditor } from '../../components/topo/TopoEditor'

type UploadType = 'topo' | 'approach'

export function AdminTopoPage() {
  const sectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())
  const [selectedSectorId, setSelectedSectorId] = useState<string>('')
  const [editingTopo, setEditingTopo] = useState<Topo | null>(null)
  const [uploadType, setUploadType] = useState<UploadType>('topo')
  const [editingCaption, setEditingCaption] = useState<{ id: string; text: string } | null>(null)

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
    const file = e.target.files?.[0]
    if (!file || !selectedSectorId) return

    const url = URL.createObjectURL(file)
    const img = new Image()
    img.src = url

    await new Promise<void>((resolve) => {
      img.onload = () => resolve()
    })

    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

    const topoId = `topo-${Date.now()}`
    const topo: Topo = {
      id: topoId,
      sectorId: selectedSectorId,
      imageUrl: dataUrl,
      imageWidth: img.width,
      imageHeight: img.height,
      type: uploadType,
      sortOrder: (topos?.length || 0) + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await db.topos.put(topo)
    URL.revokeObjectURL(url)
    e.target.value = ''
  }

  const handleDeleteTopo = async (topoId: string) => {
    await db.topoRoutes.where('topoId').equals(topoId).delete()
    await db.topos.delete(topoId)
  }

  const handleToggleCover = async (imageUrl: string) => {
    if (!selectedSectorId) return
    const isCurrent = selectedSector?.coverImageUrl === imageUrl
    if (isCurrent) {
      // Dexie ignores undefined in update — use modify to actually delete the field
      await db.sectors.where('id').equals(selectedSectorId).modify(s => {
        delete s.coverImageUrl
      })
    } else {
      await db.sectors.update(selectedSectorId, { coverImageUrl: imageUrl })
    }
  }

  const handleSaveCaption = async () => {
    if (!editingCaption) return
    await db.topos.update(editingCaption.id, { caption: editingCaption.text || undefined })
    setEditingCaption(null)
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Админ: Топо-редактор</h1>

      {/* Sector selector */}
      <select
        value={selectedSectorId}
        onChange={(e) => { setSelectedSectorId(e.target.value); setEditingTopo(null) }}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
      >
        <option value="">Выбери сектор...</option>
        {sectors?.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {selectedSectorId && !editingTopo && (
        <>
          {/* Cover image */}
          {selectedSector && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="text-sm font-medium mb-1">Обложка сектора</div>
              {selectedSector.coverImageUrl ? (
                <img src={selectedSector.coverImageUrl} alt="Cover" className="h-20 rounded object-cover" />
              ) : (
                <span className="text-xs text-gray-400">Не задана — нажми ★ на любом фото ниже</span>
              )}
            </div>
          )}

          {/* Upload type + file */}
          <div className="mb-4">
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setUploadType('topo')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                  uploadType === 'topo' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Фото стены (топо)
              </button>
              <button
                onClick={() => setUploadType('approach')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                  uploadType === 'approach' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Фото подхода
              </button>
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700"
            />
          </div>

          {/* Topo photos */}
          {sectorTopos.length > 0 && (
            <div className="space-y-3 mb-6">
              <h2 className="text-sm font-semibold">Фото стен ({sectorTopos.length})</h2>
              {sectorTopos.map((topo) => {
                const isCover = selectedSector?.coverImageUrl === topo.imageUrl
                return (
                  <div key={topo.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="relative">
                      <img
                        src={topo.imageUrl}
                        alt={topo.caption || 'Topo'}
                        className="w-full h-40 object-cover"
                      />
                      {isCover && (
                        <div className="absolute top-1 left-1 bg-yellow-400 text-black text-[10px] font-bold px-1.5 py-0.5 rounded">
                          Обложка
                        </div>
                      )}
                    </div>
                    <div className="p-2 flex items-center justify-between">
                      <span className="text-xs text-gray-400">
                        {topo.imageWidth}x{topo.imageHeight}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleToggleCover(topo.imageUrl)}
                          className={`text-sm px-2 py-1 rounded ${isCover ? 'text-yellow-500' : 'text-gray-400'}`}
                          title="Обложка"
                        >
                          ★
                        </button>
                        <button
                          onClick={() => setEditingTopo(topo)}
                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded"
                        >
                          Разметить
                        </button>
                        <button
                          onClick={() => handleDeleteTopo(topo.id)}
                          className="text-xs bg-red-50 text-red-600 px-3 py-1 rounded"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Approach photos */}
          {approachPhotos.length > 0 && (
            <div className="space-y-3 mb-6">
              <h2 className="text-sm font-semibold">Фото подходов ({approachPhotos.length})</h2>
              {approachPhotos.map((topo) => {
                const isCover = selectedSector?.coverImageUrl === topo.imageUrl
                const isEditingThis = editingCaption?.id === topo.id
                return (
                  <div key={topo.id} className="border border-green-200 rounded-lg overflow-hidden">
                    <div className="relative">
                      <img
                        src={topo.imageUrl}
                        alt={topo.caption || 'Approach'}
                        className="w-full h-40 object-cover"
                      />
                      <div className="absolute top-1 left-1 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                        Подход
                      </div>
                      {isCover && (
                        <div className="absolute top-1 right-1 bg-yellow-400 text-black text-[10px] font-bold px-1.5 py-0.5 rounded">
                          Обложка
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      {/* Caption */}
                      {isEditingThis ? (
                        <div className="flex gap-1 mb-2">
                          <input
                            value={editingCaption!.text}
                            onChange={(e) => setEditingCaption({ id: editingCaption!.id, text: e.target.value })}
                            placeholder="Описание подхода..."
                            className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs"
                            autoFocus
                          />
                          <button onClick={handleSaveCaption} className="text-xs bg-green-600 text-white px-2 py-1 rounded">OK</button>
                          <button onClick={() => setEditingCaption(null)} className="text-xs text-gray-400 px-1">✕</button>
                        </div>
                      ) : (
                        <div
                          onClick={() => setEditingCaption({ id: topo.id, text: topo.caption || '' })}
                          className="text-xs text-gray-600 mb-2 cursor-pointer hover:text-blue-600 min-h-[20px]"
                        >
                          {topo.caption || <span className="text-gray-400 italic">Нажми чтобы добавить описание...</span>}
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">
                          {topo.imageWidth}x{topo.imageHeight}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleToggleCover(topo.imageUrl)}
                            className={`text-sm px-2 py-1 rounded ${isCover ? 'text-yellow-500' : 'text-gray-400'}`}
                            title="Обложка"
                          >
                            ★
                          </button>
                          <button
                            onClick={() => setEditingTopo(topo)}
                            className="text-xs bg-green-600 text-white px-3 py-1 rounded"
                          >
                            Разметить
                          </button>
                          <button
                            onClick={() => handleDeleteTopo(topo.id)}
                            className="text-xs bg-red-50 text-red-600 px-3 py-1 rounded"
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {editingTopo && (
        <div>
          <button
            onClick={() => setEditingTopo(null)}
            className="text-sm text-blue-600 mb-3"
          >
            &larr; Назад к списку
          </button>
          <TopoEditor topo={editingTopo} />
        </div>
      )}
    </div>
  )
}
