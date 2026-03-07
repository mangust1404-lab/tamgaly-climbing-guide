import { useState, useRef, useEffect, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Topo, type TopoRoute } from '../../lib/db/schema'

interface Props {
  topo: Topo
}

type Point = { x: number; y: number }

const COLORS = ['#FF0000', '#00CC00', '#0066FF', '#FF9900', '#CC00FF', '#00CCCC', '#FF3399']

/**
 * Convert array of points to a smooth SVG path using Catmull-Rom splines.
 */
function pointsToSvgPath(points: Point[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0].x},${points[0].y}`
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`
  }

  // Catmull-Rom to cubic bezier conversion
  let d = `M${points[0].x},${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    d += `C${cp1x},${cp1y},${cp2x},${cp2y},${p2.x},${p2.y}`
  }
  return d
}

export function TopoEditor({ topo }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [points, setPoints] = useState<Point[]>([])
  const [selectedRouteId, setSelectedRouteId] = useState<string>('')
  const [scale, setScale] = useState(1)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })

  const routes = useLiveQuery(
    () => db.routes.where('sectorId').equals(topo.sectorId).sortBy('gradeSort'),
    [topo.sectorId],
  )

  const existingTopoRoutes = useLiveQuery(
    () => db.topoRoutes.where('topoId').equals(topo.id).toArray(),
    [topo.id],
  )

  // Calculate scale when container resizes
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      const containerWidth = container.clientWidth
      const s = containerWidth / topo.imageWidth
      setScale(s)
      setImgSize({ w: containerWidth, h: topo.imageHeight * s })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [topo.imageWidth, topo.imageHeight])

  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedRouteId) return
    const rect = e.currentTarget.getBoundingClientRect()
    // Store coordinates in image space (not display space)
    const x = Math.round((e.clientX - rect.left) / scale)
    const y = Math.round((e.clientY - rect.top) / scale)
    setPoints((prev) => [...prev, { x, y }])
  }, [selectedRouteId, scale])

  const handleUndo = () => setPoints((prev) => prev.slice(0, -1))

  const handleSave = async () => {
    if (!selectedRouteId || points.length < 2) return

    const svgPath = pointsToSvgPath(points)
    const routeIndex = existingTopoRoutes?.length || 0
    const color = COLORS[routeIndex % COLORS.length]

    const topoRoute: TopoRoute = {
      id: `tr-${topo.id}-${selectedRouteId}`,
      topoId: topo.id,
      routeId: selectedRouteId,
      svgPath,
      color,
      startX: points[0].x,
      startY: points[0].y,
      anchorX: points[points.length - 1].x,
      anchorY: points[points.length - 1].y,
      routeNumber: routeIndex + 1,
    }

    await db.topoRoutes.put(topoRoute)
    setPoints([])
    setSelectedRouteId('')
  }

  const handleDeleteTopoRoute = async (trId: string) => {
    await db.topoRoutes.delete(trId)
  }

  // Routes already drawn on this topo
  const drawnRouteIds = new Set(existingTopoRoutes?.map((tr) => tr.routeId) || [])

  return (
    <div>
      {/* Route selector */}
      <div className="mb-3">
        <label className="block text-sm font-medium mb-1">Маршрут для разметки</label>
        <select
          value={selectedRouteId}
          onChange={(e) => { setSelectedRouteId(e.target.value); setPoints([]) }}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Выбери маршрут...</option>
          {routes?.map((r) => (
            <option key={r.id} value={r.id} disabled={drawnRouteIds.has(r.id)}>
              {r.numberInSector ? `#${r.numberInSector} ` : ''}{r.name} ({r.grade})
              {drawnRouteIds.has(r.id) ? ' ✓' : ''}
            </option>
          ))}
        </select>
      </div>

      {selectedRouteId && (
        <p className="text-xs text-gray-500 mb-2">
          Кликай по фото снизу вверх, отмечая линию маршрута. Точки соединятся плавной кривой.
        </p>
      )}

      {/* Image + SVG overlay */}
      <div
        ref={containerRef}
        className="relative border border-gray-300 rounded-lg overflow-hidden cursor-crosshair"
        onClick={handleImageClick}
      >
        <img
          src={topo.imageUrl}
          alt="Topo"
          className="w-full block"
          draggable={false}
        />

        {imgSize.w > 0 && (
          <svg
            className="absolute inset-0 pointer-events-none"
            viewBox={`0 0 ${topo.imageWidth} ${topo.imageHeight}`}
            width={imgSize.w}
            height={imgSize.h}
          >
            {/* Existing routes */}
            {existingTopoRoutes?.map((tr) => (
              <g key={tr.id}>
                <path
                  d={tr.svgPath}
                  fill="none"
                  stroke="white"
                  strokeWidth={5}
                  strokeLinecap="round"
                />
                <path
                  d={tr.svgPath}
                  fill="none"
                  stroke={tr.color}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
                <circle cx={tr.startX} cy={tr.startY} r={12} fill={tr.color} />
                <text
                  x={tr.startX}
                  y={tr.startY + 5}
                  textAnchor="middle"
                  fill="white"
                  fontSize={14}
                  fontWeight="bold"
                >
                  {tr.routeNumber}
                </text>
              </g>
            ))}

            {/* Current drawing */}
            {points.length >= 2 && (
              <>
                <path
                  d={pointsToSvgPath(points)}
                  fill="none"
                  stroke="white"
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeDasharray="10,5"
                />
                <path
                  d={pointsToSvgPath(points)}
                  fill="none"
                  stroke="#FF0000"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray="10,5"
                />
              </>
            )}

            {/* Current points */}
            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={6}
                fill={i === 0 ? '#FF0000' : '#FFFFFF'}
                stroke="#FF0000"
                strokeWidth={2}
              />
            ))}
          </svg>
        )}
      </div>

      {/* Actions */}
      {selectedRouteId && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleUndo}
            disabled={points.length === 0}
            className="px-3 py-1.5 text-xs bg-gray-100 rounded disabled:opacity-30"
          >
            Отменить точку
          </button>
          <button
            onClick={() => setPoints([])}
            disabled={points.length === 0}
            className="px-3 py-1.5 text-xs bg-gray-100 rounded disabled:opacity-30"
          >
            Сбросить
          </button>
          <button
            onClick={handleSave}
            disabled={points.length < 2}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded disabled:opacity-30"
          >
            Сохранить маршрут
          </button>
        </div>
      )}

      {/* Existing topo routes list */}
      {existingTopoRoutes && existingTopoRoutes.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2">Размеченные маршруты</h3>
          <div className="space-y-1">
            {existingTopoRoutes.map((tr) => {
              const route = routes?.find((r) => r.id === tr.routeId)
              return (
                <div key={tr.id} className="flex items-center justify-between text-sm py-1">
                  <span className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full inline-block"
                      style={{ backgroundColor: tr.color }}
                    />
                    #{tr.routeNumber} {route?.name || tr.routeId} ({route?.grade})
                  </span>
                  <button
                    onClick={() => handleDeleteTopoRoute(tr.id)}
                    className="text-xs text-red-500"
                  >
                    Удалить
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
