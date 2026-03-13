import { useRef, useEffect, useState, useCallback } from 'react'
import OpenSeadragon from 'openseadragon'
import type { TopoRoute, Route } from '../../lib/db/schema'
import { useI18n } from '../../lib/i18n'
import { gradeToTopoColor } from '../../lib/utils'

interface TopoViewerProps {
  /** URL to the topo image (full-res or DZI XML). */
  imageUrl: string
  imageWidth: number
  imageHeight: number
  /** SVG route overlays with linked route data. */
  topoRoutes: (TopoRoute & { route?: Route })[]
  /** Called when a route line is tapped (or tapped again to deselect). */
  onRouteSelect?: (routeId: string | null) => void
  /** Currently highlighted route ID. */
  selectedRouteId?: string | null
}

export function TopoViewer({
  imageUrl,
  imageWidth,
  imageHeight,
  topoRoutes,
  onRouteSelect,
  selectedRouteId,
}: TopoViewerProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null)
  const svgOverlayRef = useRef<SVGSVGElement | null>(null)
  const [ready, setReady] = useState(false)

  // Keep topoRoutes in a ref so the OSD click handler always has the latest data
  const topoRoutesRef = useRef(topoRoutes)
  topoRoutesRef.current = topoRoutes
  const onRouteSelectRef = useRef(onRouteSelect)
  onRouteSelectRef.current = onRouteSelect
  const selectedRouteIdRef = useRef(selectedRouteId)
  selectedRouteIdRef.current = selectedRouteId

  // UI scale factor: keeps circles/strokes/text visible regardless of image resolution
  const ui = Math.max(1, (imageWidth || 1) / 500)

  // Initialize OpenSeadragon viewer
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return

    const viewer = OpenSeadragon({
      element: containerRef.current,
      prefixUrl: '',
      tileSources: {
        type: 'image',
        url: imageUrl,
        buildPyramid: false,
      } as any,
      showNavigationControl: false,
      gestureSettingsTouch: {
        pinchToZoom: true,
        flickEnabled: true,
        clickToZoom: false,
      },
      gestureSettingsMouse: {
        clickToZoom: false,
      },
      minZoomLevel: 0.5,
      maxZoomLevel: 5,
      visibilityRatio: 0.8,
    })

    viewer.addHandler('open', () => {
      setReady(true)
    })

    // Route selection via tap — convert click to image coords and hit-test
    viewer.addHandler('canvas-click', (event: any) => {
      const cb = onRouteSelectRef.current
      if (!cb) return
      const viewportPoint = viewer.viewport.pointFromPixel(event.position)
      const imagePoint = viewer.viewport.viewportToImageCoordinates(viewportPoint)
      const ix = imagePoint.x
      const iy = imagePoint.y
      // Hit-test threshold in image pixels (scales with image size)
      const threshold = Math.max(20, (imageWidth || 500) / 25)
      let bestRoute: string | null = null
      let bestDist = threshold
      for (const tr of topoRoutesRef.current) {
        // Check start circle
        if (tr.startX && tr.startY) {
          const d = Math.hypot(ix - tr.startX, iy - tr.startY)
          if (d < bestDist) { bestDist = d; bestRoute = tr.routeId }
        }
        // Check anchor circle
        if (tr.anchorX && tr.anchorY) {
          const d = Math.hypot(ix - tr.anchorX, iy - tr.anchorY)
          if (d < bestDist) { bestDist = d; bestRoute = tr.routeId }
        }
        // Check along path by sampling the SVG path element in the overlay
        const svg = svgOverlayRef.current
        if (svg && tr.svgPath) {
          const tmpPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          tmpPath.setAttribute('d', tr.svgPath)
          svg.appendChild(tmpPath)
          const len = tmpPath.getTotalLength()
          const steps = Math.max(10, Math.round(len / 20))
          for (let s = 0; s <= steps; s++) {
            const pt = tmpPath.getPointAtLength((s / steps) * len)
            const d = Math.hypot(ix - pt.x, iy - pt.y)
            if (d < bestDist) { bestDist = d; bestRoute = tr.routeId }
          }
          svg.removeChild(tmpPath)
        }
      }
      if (bestRoute) {
        event.preventDefaultAction = true
        // Toggle: tap same route again → deselect
        cb(bestRoute === selectedRouteIdRef.current ? null : bestRoute)
      }
    })

    viewerRef.current = viewer

    return () => {
      viewer.destroy()
      viewerRef.current = null
      setReady(false)
    }
  }, [imageUrl, imageWidth])

  // Create/update SVG overlay
  const updateOverlay = useCallback(() => {
    if (!viewerRef.current || !ready) return

    const viewer = viewerRef.current

    // Remove old overlay
    if (svgOverlayRef.current) {
      svgOverlayRef.current.remove()
      svgOverlayRef.current = null
    }

    // Create SVG element sized to the image
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', `0 0 ${imageWidth} ${imageHeight}`)
    svg.style.position = 'absolute'
    svg.style.top = '0'
    svg.style.left = '0'
    svg.style.width = '100%'
    svg.style.height = '100%'
    svg.style.pointerEvents = 'none'

    // Draw route lines — non-selected routes first (behind), selected on top
    const hasSelection = !!selectedRouteId
    const sorted = [...topoRoutes].sort((a, b) => {
      if (a.routeId === selectedRouteId) return 1
      if (b.routeId === selectedRouteId) return -1
      return 0
    })

    sorted.forEach((tr) => {
      const isSelected = tr.routeId === selectedRouteId
      const isDimmed = hasSelection && !isSelected
      const color = tr.route ? gradeToTopoColor(tr.route.grade) : (tr.color || '#FF4444')
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      if (isDimmed) group.setAttribute('opacity', '0.2')

      // Route line (white border + colored line)
      const borderPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      borderPath.setAttribute('d', tr.svgPath)
      borderPath.setAttribute('fill', 'none')
      borderPath.setAttribute('stroke', 'white')
      borderPath.setAttribute('stroke-width', String((isSelected ? 8 : 5) * ui))
      borderPath.setAttribute('stroke-linecap', 'round')
      borderPath.setAttribute('stroke-linejoin', 'round')
      group.appendChild(borderPath)

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', tr.svgPath)
      path.setAttribute('fill', 'none')
      path.setAttribute('stroke', color)
      path.setAttribute('stroke-width', String((isSelected ? 5 : 3) * ui))
      path.setAttribute('stroke-linecap', 'round')
      path.setAttribute('stroke-linejoin', 'round')
      group.appendChild(path)

      // Start marker (numbered circle)
      if (tr.startX && tr.startY) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        circle.setAttribute('cx', String(tr.startX))
        circle.setAttribute('cy', String(tr.startY))
        circle.setAttribute('r', String((isSelected ? 14 : 11) * ui))
        circle.setAttribute('fill', color)
        circle.setAttribute('stroke', 'white')
        circle.setAttribute('stroke-width', String(2.5 * ui))
        group.appendChild(circle)

        if (tr.routeNumber !== undefined) {
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
          text.setAttribute('x', String(tr.startX))
          text.setAttribute('y', String(tr.startY))
          text.setAttribute('text-anchor', 'middle')
          text.setAttribute('dominant-baseline', 'central')
          text.setAttribute('fill', 'white')
          text.setAttribute('font-size', String((isSelected ? 13 : 10) * ui))
          text.setAttribute('font-weight', 'bold')
          text.textContent = String(tr.routeNumber)
          group.appendChild(text)
        }
      }

      // Anchor marker (X at the top)
      if (tr.anchorX && tr.anchorY) {
        const anchor = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        anchor.setAttribute('x', String(tr.anchorX))
        anchor.setAttribute('y', String(tr.anchorY))
        anchor.setAttribute('text-anchor', 'middle')
        anchor.setAttribute('dominant-baseline', 'central')
        anchor.setAttribute('fill', color)
        anchor.setAttribute('font-size', String(24 * ui))
        anchor.setAttribute('font-weight', 'bold')
        anchor.setAttribute('stroke', 'white')
        anchor.setAttribute('stroke-width', String(2 * ui))
        anchor.textContent = '\u2297'
        group.appendChild(anchor)
      }

      svg.appendChild(group)
    })

    // Add SVG as an overlay on the image
    const rect = viewer.viewport.imageToViewportRectangle(0, 0, imageWidth, imageHeight)
    viewer.addOverlay({
      element: svg,
      location: new OpenSeadragon.Rect(rect.x, rect.y, rect.width, rect.height),
    })

    svgOverlayRef.current = svg
  }, [ready, topoRoutes, selectedRouteId, imageWidth, imageHeight, ui])

  useEffect(() => {
    updateOverlay()
  }, [updateOverlay])

  return (
    <div className="relative bg-gray-900 rounded-lg overflow-hidden">
      <div ref={containerRef} className="w-full aspect-[4/3]" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
          {t('topo.loading')}
        </div>
      )}
    </div>
  )
}
