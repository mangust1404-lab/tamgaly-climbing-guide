import { useState, useRef, useEffect, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Topo, type TopoRoute, type Route } from '../../lib/db/schema'
import { gradeToTopoColor } from '../../lib/utils'

interface Props {
  topo: Topo
  onDone?: () => void
  onSave?: () => void
}

type Point = { x: number; y: number }

const GRADE_SORT: Record<string, number> = {
  '4': 30, '4a': 40, '4b': 50, '4c': 60,
  '5a': 70, '5a+': 75, '5b': 85, '5b+': 90, '5c': 100, '5c+': 105,
  '6a': 120, '6a+': 135, '6b': 150, '6b+': 170, '6c': 190, '6c+': 210,
  '7a': 240, '7a+': 270, '7b': 300, '7b+': 340, '7c': 380, '7c+': 420,
  '8a': 470, '8a+': 520,
}

const GRADES = Object.keys(GRADE_SORT)
const ROUTE_TYPES: Route['routeType'][] = ['sport', 'trad', 'boulder', 'multi-pitch']

function pointsToSvgPath(points: Point[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0].x},${points[0].y}`
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`
  }

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

export function TopoEditor({ topo, onSave }: Props) {
  const triggerSave = () => { if (onSave) onSave() }

  const containerRef = useRef<HTMLDivElement>(null)
  const [points, setPoints] = useState<Point[]>([])
  const [selectedRouteId, setSelectedRouteId] = useState<string>('')
  const [scale, setScale] = useState(1)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const [actualDims, setActualDims] = useState<{ w: number; h: number } | null>(null)
  const [routeNumber, setRouteNumber] = useState<number>(1)
  const [showAddRoute, setShowAddRoute] = useState(false)
  const [newRouteName, setNewRouteName] = useState('')
  const [newRouteGrade, setNewRouteGrade] = useState('6a')
  const [newRouteType, setNewRouteType] = useState<Route['routeType']>('sport')
  const [newPitches, setNewPitches] = useState(1)
  const [newPitchGrades, setNewPitchGrades] = useState<string[]>(['6a'])
  const [editingRoute, setEditingRoute] = useState<{ id: string; name: string; grade: string; routeType: Route['routeType']; numberInSector?: number } | null>(null)

  const imgW = actualDims?.w || topo.imageWidth || 1
  const imgH = actualDims?.h || topo.imageHeight || 1

  const ui = Math.max(1, imgW / 500)

  const routes = useLiveQuery(
    () => db.routes.where('sectorId').equals(topo.sectorId).sortBy('gradeSort'),
    [topo.sectorId],
  )

  const existingTopoRoutes = useLiveQuery(
    () => db.topoRoutes.where('topoId').equals(topo.id).toArray(),
    [topo.id],
  )

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    if (nw > 0 && nh > 0) {
      setActualDims({ w: nw, h: nh })
      const dw = img.clientWidth
      const dh = img.clientHeight
      if (dw > 0) {
        setScale(dw / nw)
        setImgSize({ w: dw, h: dh })
      }
      if (nw !== topo.imageWidth || nh !== topo.imageHeight) {
        db.topos.update(topo.id, { imageWidth: nw, imageHeight: nh })
      }
    }
  }, [topo.id, topo.imageWidth, topo.imageHeight])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      const cw = container.clientWidth
      if (cw > 0 && imgW > 0) {
        const s = cw / imgW
        setScale(s)
        setImgSize({ w: cw, h: imgH * s })
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [imgW, imgH])

  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedRouteId) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.round((e.clientX - rect.left) / scale)
    const y = Math.round((e.clientY - rect.top) / scale)
    setPoints((prev) => [...prev, { x, y }])
  }, [selectedRouteId, scale])

  const handleUndo = () => setPoints((prev) => prev.slice(0, -1))

  const handleSave = async () => {
    if (!selectedRouteId || points.length < 2) return

    const svgPath = pointsToSvgPath(points)
    const selectedRoute = routes?.find(r => r.id === selectedRouteId)
    const color = selectedRoute ? gradeToTopoColor(selectedRoute.grade) : '#6B7280'

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
      routeNumber,
    }

    await db.topoRoutes.put(topoRoute)
    setPoints([])
    setRouteNumber(prev => prev + 1)

    // Auto-select next undrawn route
    const newDrawn = new Set([...drawnRouteIds, selectedRouteId])
    const next = routes?.find(r => !newDrawn.has(r.id))
    setSelectedRouteId(next?.id || '')

    // Auto-save to disk
    triggerSave()
  }

  const handleDeleteTopoRoute = async (trId: string) => {
    await db.topoRoutes.delete(trId)
    triggerSave()
  }

  const handleAddRoute = async () => {
    if (!newRouteName.trim()) return
    const now = new Date().toISOString()
    const slug = newRouteName.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-')
    const id = `route-${Date.now()}`
    const numberInSector = (routes?.length || 0) + 1

    const isMulti = newRouteType === 'multi-pitch'
    const pitchGrades = isMulti && newPitches > 1 ? newPitchGrades.slice(0, newPitches) : undefined
    // For multi-pitch, overall grade = hardest pitch
    const overallGrade = isMulti && pitchGrades
      ? pitchGrades.reduce((max, g) => (GRADE_SORT[g] || 0) > (GRADE_SORT[max] || 0) ? g : max, pitchGrades[0])
      : newRouteGrade

    await db.routes.add({
      id,
      sectorId: topo.sectorId,
      name: newRouteName.trim(),
      slug,
      grade: overallGrade,
      gradeSystem: 'french',
      gradeSort: GRADE_SORT[overallGrade] || 120,
      pitches: isMulti ? newPitches : 1,
      pitchGrades,
      routeType: newRouteType,
      numberInSector,
      status: 'published',
      createdAt: now,
      updatedAt: now,
    })

    setNewRouteName('')
    setNewPitches(1)
    setNewPitchGrades(['6a'])
    setShowAddRoute(false)
    setSelectedRouteId(id)
  }

  const handleSaveRouteEdit = async () => {
    if (!editingRoute) return
    const slug = editingRoute.name.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-')
    await db.routes.update(editingRoute.id, {
      name: editingRoute.name.trim(),
      slug,
      grade: editingRoute.grade,
      gradeSort: GRADE_SORT[editingRoute.grade] || 120,
      routeType: editingRoute.routeType,
      numberInSector: editingRoute.numberInSector || undefined,
      updatedAt: new Date().toISOString(),
    })
    setEditingRoute(null)
    triggerSave()
  }

  const drawnRouteIds = new Set(existingTopoRoutes?.map((tr) => tr.routeId) || [])

  const handleSelectRoute = (routeId: string) => {
    setSelectedRouteId(routeId)
    setPoints([])
    // Auto-set next route number
    const maxNum = existingTopoRoutes?.reduce((max, tr) => Math.max(max, tr.routeNumber || 0), 0) || 0
    setRouteNumber(maxNum + 1)
  }

  return (
    <div>
      {/* Route selector + add */}
      <div className="mb-3">
        <label className="block text-sm font-medium mb-1">Маршрут для разметки</label>
        <div className="flex gap-2">
          <select
            value={selectedRouteId}
            onChange={(e) => handleSelectRoute(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Выбери маршрут...</option>
            {routes?.map((r) => (
              <option key={r.id} value={r.id} disabled={drawnRouteIds.has(r.id)}>
                {r.numberInSector ? `#${r.numberInSector} ` : ''}{r.name} ({r.grade})
                {drawnRouteIds.has(r.id) ? ' ✓' : ''}
              </option>
            ))}
          </select>
          {selectedRouteId && (
            <button
              onClick={() => {
                const r = routes?.find(rt => rt.id === selectedRouteId)
                if (r) setEditingRoute({ id: r.id, name: r.name, grade: r.grade, routeType: r.routeType, numberInSector: r.numberInSector })
              }}
              className="px-3 py-2 text-xs bg-amber-500 text-white rounded-lg font-medium whitespace-nowrap hover:bg-amber-600 transition-colors"
              title="Редактировать маршрут"
            >
              Ред.
            </button>
          )}
          <button
            onClick={() => setShowAddRoute(!showAddRoute)}
            className="px-3 py-2 text-xs bg-green-600 text-white rounded-lg font-medium whitespace-nowrap"
          >
            + Новый
          </button>
        </div>
      </div>

      {/* Inline edit route form */}
      {editingRoute && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="text-xs font-semibold text-amber-700 mb-2">Редактирование маршрута</div>
          <div className="flex gap-2 mb-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-500">#</span>
              <input
                type="number"
                min={1}
                value={editingRoute.numberInSector || ''}
                onChange={(e) => setEditingRoute({ ...editingRoute, numberInSector: parseInt(e.target.value) || undefined })}
                placeholder="#"
                className="w-12 border border-gray-300 rounded px-2 py-1.5 text-sm text-center"
              />
            </div>
            <input
              value={editingRoute.name}
              onChange={(e) => setEditingRoute({ ...editingRoute, name: e.target.value })}
              placeholder="Название"
              className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
              autoFocus
            />
            <select
              value={editingRoute.grade}
              onChange={(e) => setEditingRoute({ ...editingRoute, grade: e.target.value })}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm font-mono w-20"
            >
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="mb-3">
            <span className="text-[10px] text-gray-500 mb-1 block">Тип:</span>
            <div className="flex gap-1.5">
              {ROUTE_TYPES.map(rt => (
                <button
                  key={rt}
                  onClick={() => setEditingRoute({ ...editingRoute, routeType: rt })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    editingRoute.routeType === rt
                      ? 'bg-amber-500 text-white'
                      : 'bg-white text-gray-500 border border-gray-200 hover:border-amber-300'
                  }`}
                >
                  {rt}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 items-center pt-2 border-t border-amber-200">
            <button
              onClick={handleSaveRouteEdit}
              disabled={!editingRoute.name.trim()}
              className="px-5 py-2 text-sm bg-amber-500 text-white rounded-lg font-medium disabled:opacity-30 hover:bg-amber-600 transition-colors"
            >
              Сохранить
            </button>
            <button
              onClick={() => setEditingRoute(null)}
              className="px-4 py-2 text-sm text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Inline add route form */}
      {showAddRoute && (
        <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex gap-2 mb-2">
            <input
              value={newRouteName}
              onChange={(e) => setNewRouteName(e.target.value)}
              placeholder="Название маршрута"
              className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
              autoFocus
            />
            <select
              value={newRouteGrade}
              onChange={(e) => setNewRouteGrade(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm font-mono w-20"
            >
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          {/* Route type selector */}
          <div className="mb-3">
            <span className="text-[10px] text-gray-500 mb-1 block">Тип:</span>
            <div className="flex gap-1.5">
              {ROUTE_TYPES.map(rt => (
                <button
                  key={rt}
                  onClick={() => setNewRouteType(rt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    newRouteType === rt
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-500 border border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {rt}
                </button>
              ))}
            </div>
          </div>

          {/* Multi-pitch: pitches count + per-pitch grades */}
          {newRouteType === 'multi-pitch' && (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-600">Верёвок:</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={newPitches}
                  onChange={(e) => {
                    const n = Math.max(1, Math.min(20, parseInt(e.target.value) || 1))
                    setNewPitches(n)
                    setNewPitchGrades(prev => {
                      const arr = [...prev]
                      while (arr.length < n) arr.push(arr[arr.length - 1] || '6a')
                      return arr.slice(0, n)
                    })
                  }}
                  className="w-14 border border-gray-300 rounded px-2 py-0.5 text-xs text-center"
                />
              </div>
              {newPitches > 1 && (
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: newPitches }, (_, i) => (
                    <div key={i} className="flex items-center gap-0.5">
                      <span className="text-[10px] text-gray-400">R{i + 1}</span>
                      <select
                        value={newPitchGrades[i] || '6a'}
                        onChange={(e) => {
                          const arr = [...newPitchGrades]
                          arr[i] = e.target.value
                          setNewPitchGrades(arr)
                        }}
                        className="border border-gray-200 rounded px-1 py-0.5 text-[10px] font-mono w-14"
                      >
                        {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Action buttons — visually separated */}
          <div className="flex gap-3 items-center pt-2 border-t border-green-200">
            <button
              onClick={handleAddRoute}
              disabled={!newRouteName.trim()}
              className="px-5 py-2 text-sm bg-green-600 text-white rounded-lg font-medium disabled:opacity-30 hover:bg-green-700 transition-colors"
            >
              Добавить
            </button>
            <button
              onClick={() => setShowAddRoute(false)}
              className="px-4 py-2 text-sm text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {selectedRouteId && (() => {
        const selRoute = routes?.find(r => r.id === selectedRouteId)
        const previewColor = selRoute ? gradeToTopoColor(selRoute.grade) : '#6B7280'
        return (
          <div className="mb-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-500">№ на фото:</span>
              <input
                type="number"
                min={1}
                value={routeNumber}
                onChange={(e) => setRouteNumber(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 border border-gray-300 rounded px-2 py-0.5 text-xs text-center"
              />
              <span
                className="w-4 h-4 rounded-full inline-block border border-white"
                style={{ backgroundColor: previewColor, boxShadow: '0 0 0 1px #ccc' }}
                title={`Цвет: ${selRoute?.grade}`}
              />
              <span className="text-[10px] text-gray-400">{selRoute?.grade}</span>
            </div>
            <p className="text-xs text-gray-500">
              Кликай по фото снизу вверх, отмечая линию маршрута.
            </p>
          </div>
        )
      })()}

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
          onLoad={handleImageLoad}
        />

        {imgSize.w > 0 && (() => {
          const drawColor = (() => {
            const selRoute = routes?.find(r => r.id === selectedRouteId)
            return selRoute ? gradeToTopoColor(selRoute.grade) : '#FF0000'
          })()
          return <svg
            className="absolute inset-0 pointer-events-none"
            viewBox={`0 0 ${imgW} ${imgH}`}
            width={imgSize.w}
            height={imgSize.h}
          >
            {/* Existing routes */}
            {existingTopoRoutes?.map((tr) => {
              const r = routes?.find(rt => rt.id === tr.routeId)
              const c = r ? gradeToTopoColor(r.grade) : (tr.color || '#6B7280')
              return (
                <g key={tr.id}>
                  <path d={tr.svgPath} fill="none" stroke="white" strokeWidth={5 * ui} strokeLinecap="round" />
                  <path d={tr.svgPath} fill="none" stroke={c} strokeWidth={3 * ui} strokeLinecap="round" />
                  <circle cx={tr.startX} cy={tr.startY} r={8 * ui} fill={c} stroke="white" strokeWidth={2 * ui} />
                  <text
                    x={tr.startX} y={tr.startY + 5 * ui}
                    textAnchor="middle" fill="white" fontSize={14 * ui} fontWeight="bold"
                  >
                    {tr.routeNumber}
                  </text>
                </g>
              )
            })}

            {/* Current drawing */}
            {points.length >= 2 && (
              <>
                <path
                  d={pointsToSvgPath(points)}
                  fill="none"
                  stroke="white"
                  strokeWidth={6 * ui}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={pointsToSvgPath(points)}
                  fill="none"
                  stroke={drawColor}
                  strokeWidth={3 * ui}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}

            {/* Debug guide lines */}
            {points.length >= 2 && points.map((p, i) => {
              if (i === 0) return null
              return (
                <line
                  key={`seg-${i}`}
                  x1={points[i - 1].x} y1={points[i - 1].y}
                  x2={p.x} y2={p.y}
                  stroke={drawColor}
                  strokeWidth={1 * ui}
                  strokeDasharray={`${6 * ui},${4 * ui}`}
                  opacity={0.3}
                />
              )
            })}

            {/* Current points */}
            {points.map((p, i) => (
              <g key={i}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={8 * ui}
                  fill={i === 0 ? drawColor : '#FFFFFF'}
                  stroke={drawColor}
                  strokeWidth={2 * ui}
                />
                <text
                  x={p.x}
                  y={p.y + 4 * ui}
                  textAnchor="middle"
                  fill={i === 0 ? 'white' : drawColor}
                  fontSize={10 * ui}
                  fontWeight="bold"
                >
                  {i + 1}
                </text>
              </g>
            ))}
          </svg>
        })()}
      </div>

      {/* Actions */}
      {selectedRouteId && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleUndo}
            disabled={points.length === 0}
            className="px-3 py-1.5 text-xs bg-gray-100 rounded disabled:opacity-30"
          >
            ↩ Отменить точку
          </button>
          <button
            onClick={() => setPoints([])}
            disabled={points.length === 0}
            className="px-3 py-1.5 text-xs bg-gray-100 rounded disabled:opacity-30"
          >
            ✕ Сбросить
          </button>
          <button
            onClick={handleSave}
            disabled={points.length < 2}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded disabled:opacity-30"
          >
            💾 Сохранить маршрут
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
              const correctColor = route ? gradeToTopoColor(route.grade) : tr.color
              return (
                <div key={tr.id} className="flex items-center justify-between text-sm py-1">
                  <span className="flex items-center gap-2">
                    <span
                      className="w-4 h-4 rounded-full inline-block flex-shrink-0"
                      style={{ backgroundColor: correctColor }}
                    />
                    <input
                      type="number"
                      min={1}
                      value={tr.routeNumber}
                      onChange={async (e) => {
                        const num = Math.max(1, parseInt(e.target.value) || 1)
                        await db.topoRoutes.update(tr.id, { routeNumber: num, color: correctColor })
                      }}
                      className="w-10 border border-gray-200 rounded px-1 py-0.5 text-xs text-center"
                    />
                    <span
                      className="truncate cursor-pointer hover:text-amber-600"
                      onClick={() => {
                        if (route) setEditingRoute({ id: route.id, name: route.name, grade: route.grade, routeType: route.routeType, numberInSector: route.numberInSector })
                      }}
                      title="Нажми чтобы редактировать"
                    >
                      {route?.name || tr.routeId} ({route?.grade})
                    </span>
                  </span>
                  <button
                    onClick={() => handleDeleteTopoRoute(tr.id)}
                    className="text-xs text-red-500 flex-shrink-0 ml-1"
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
