import { useState, useRef, useCallback, useEffect } from 'react'

interface Props {
  imageUrl: string
  onCrop: (croppedDataUrl: string, width: number, height: number) => void
  onCancel: () => void
}

type Rect = { x: number; y: number; w: number; h: number }

export function CropModal({ imageUrl, onCrop, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [dragging, setDragging] = useState<'create' | 'move' | null>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [cropStart, setCropStart] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 })
  const [displayScale, setDisplayScale] = useState(1)

  // Load image
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setImgLoaded(true)
    }
    img.src = imageUrl
  }, [imageUrl])

  // Draw canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return

    const maxW = Math.min(window.innerWidth - 32, 900)
    const maxH = window.innerHeight - 200
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1)
    setDisplayScale(scale)

    canvas.width = img.naturalWidth * scale
    canvas.height = img.naturalHeight * scale

    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    // Dim outside crop
    if (crop) {
      const cx = crop.x * scale
      const cy = crop.y * scale
      const cw = crop.w * scale
      const ch = crop.h * scale

      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      // Top
      ctx.fillRect(0, 0, canvas.width, cy)
      // Bottom
      ctx.fillRect(0, cy + ch, canvas.width, canvas.height - cy - ch)
      // Left
      ctx.fillRect(0, cy, cx, ch)
      // Right
      ctx.fillRect(cx + cw, cy, canvas.width - cx - cw, ch)

      // Border
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(cx, cy, cw, ch)
      ctx.setLineDash([])

      // Size label
      const labelText = `${Math.round(crop.w)} x ${Math.round(crop.h)}`
      ctx.font = '13px sans-serif'
      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      const tw = ctx.measureText(labelText).width
      ctx.fillRect(cx + cw / 2 - tw / 2 - 6, cy + ch + 4, tw + 12, 22)
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'center'
      ctx.fillText(labelText, cx + cw / 2, cy + ch + 20)
    }
  }, [crop])

  useEffect(() => {
    if (imgLoaded) draw()
  }, [imgLoaded, crop, draw])

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / displayScale,
      y: (e.clientY - rect.top) / displayScale,
    }
  }

  const isInsideCrop = (px: number, py: number) => {
    if (!crop) return false
    return px >= crop.x && px <= crop.x + crop.w && py >= crop.y && py <= crop.y + crop.h
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getPos(e)
    if (crop && isInsideCrop(pos.x, pos.y)) {
      setDragging('move')
      setDragStart(pos)
      setCropStart(crop)
    } else {
      setDragging('create')
      setDragStart(pos)
      setCrop({ x: pos.x, y: pos.y, w: 0, h: 0 })
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging) return
    const pos = getPos(e)
    const img = imgRef.current
    if (!img) return
    const maxX = img.naturalWidth
    const maxY = img.naturalHeight

    if (dragging === 'create') {
      const x = Math.max(0, Math.min(dragStart.x, pos.x))
      const y = Math.max(0, Math.min(dragStart.y, pos.y))
      const w = Math.min(Math.abs(pos.x - dragStart.x), maxX - x)
      const h = Math.min(Math.abs(pos.y - dragStart.y), maxY - y)
      setCrop({ x, y, w, h })
    } else if (dragging === 'move') {
      const dx = pos.x - dragStart.x
      const dy = pos.y - dragStart.y
      const nx = Math.max(0, Math.min(cropStart.x + dx, maxX - cropStart.w))
      const ny = Math.max(0, Math.min(cropStart.y + dy, maxY - cropStart.h))
      setCrop({ x: nx, y: ny, w: cropStart.w, h: cropStart.h })
    }
  }

  const handleMouseUp = () => {
    setDragging(null)
  }

  const handleApply = () => {
    if (!crop || crop.w < 10 || crop.h < 10 || !imgRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(crop.w)
    canvas.height = Math.round(crop.h)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(
      imgRef.current,
      crop.x, crop.y, crop.w, crop.h,
      0, 0, canvas.width, canvas.height,
    )
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    onCrop(dataUrl, canvas.width, canvas.height)
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-gray-900">✂ Обрезка фото</h3>
          <div className="flex gap-2">
            {crop && (
              <button
                onClick={() => setCrop(null)}
                className="px-3 py-1.5 text-sm text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Сбросить
              </button>
            )}
            <button
              onClick={handleApply}
              disabled={!crop || crop.w < 10 || crop.h < 10}
              className="px-5 py-1.5 text-sm bg-blue-600 text-white rounded-lg font-medium disabled:opacity-30 hover:bg-blue-700"
            >
              Применить
            </button>
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-sm text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Отмена
            </button>
          </div>
        </div>
        <div className="p-4 overflow-auto flex-1 flex items-center justify-center">
          {!imgLoaded ? (
            <div className="text-gray-400 text-sm">Загрузка...</div>
          ) : (
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="cursor-crosshair select-none"
              style={{ maxWidth: '100%' }}
            />
          )}
        </div>
        <div className="px-4 py-2 border-t text-xs text-gray-400 text-center">
          Выдели область мышкой. Можно перетащить выделение.
        </div>
      </div>
    </div>
  )
}
