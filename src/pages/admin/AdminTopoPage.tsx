import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Topo } from '../../lib/db/schema'
import { TopoEditor } from '../../components/topo/TopoEditor'

export function AdminTopoPage() {
  const sectors = useLiveQuery(() => db.sectors.orderBy('sortOrder').toArray())
  const [selectedSectorId, setSelectedSectorId] = useState<string>('')
  const [editingTopo, setEditingTopo] = useState<Topo | null>(null)

  const topos = useLiveQuery(
    () => selectedSectorId
      ? db.topos.where('sectorId').equals(selectedSectorId).sortBy('sortOrder')
      : Promise.resolve([]),
    [selectedSectorId],
  )

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedSectorId) return

    // Read image to get dimensions and create object URL
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.src = url

    await new Promise<void>((resolve) => {
      img.onload = () => resolve()
    })

    // Convert to base64 data URL for offline storage
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
          {/* Upload */}
          <label className="block mb-4">
            <span className="block text-sm font-medium mb-1">Загрузить фото сектора</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700"
            />
          </label>

          {/* Topo list */}
          {topos && topos.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Фото сектора ({topos.length})</h2>
              {topos.map((topo) => (
                <div key={topo.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <img
                    src={topo.imageUrl}
                    alt={topo.caption || 'Topo'}
                    className="w-full h-40 object-cover"
                  />
                  <div className="p-2 flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {topo.imageWidth}x{topo.imageHeight}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingTopo(topo)}
                        className="text-xs bg-blue-600 text-white px-3 py-1 rounded"
                      >
                        Разметить маршруты
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
              ))}
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
