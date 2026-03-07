import { useRef, useEffect, useState, useCallback } from 'react'
import OpenSeadragon from 'openseadragon'
import type { TopoRoute, Route } from '../../lib/db/schema'

interface TopoViewerProps {
  /** URL to the topo image (full-res or DZI XML). */
  imageUrl: string
  imageWidth: number
  imageHeight: number
  /** SVG route overlays with linked route data. */
  topoRoutes: (TopoRoute & { route?: Route })[]
  /** Called when a route line is tapped. */
  onRouteSelect?: (routeId: string) => void
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
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null)
  const svgOverlayRef = useRef<SVGSVGElement | null>(null)
  const [ready, setReady] = useState(false)

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
      },
      showNavigationControl: false,
      gestureSettingsTouch: {
        pinchToZoom: true,
        flickEnabled: true,
      },
      minZoomLevel: 0.5,
      maxZoomLevel: 5,
      visibilityRatio: 0.8,
    })

    viewer.addHandler('open', () => {
      setReady(true)
    })

    viewerRef.current = viewer

    return () => {
      viewer.destroy()
      viewerRef.current = null
      setReady(false)
    }
  }, [imageUrl])

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

    // Draw route lines
    topoRoutes.forEach((tr) => {
      const isSelected = tr.routeId === selectedRouteId
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      group.style.pointerEvents = 'auto'
      group.style.cursor = 'pointer'

      // Route line (white border + colored line)
      const borderPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      borderPath.setAttribute('d', tr.svgPath)
      borderPath.setAttribute('fill', 'none')
      borderPath.setAttribute('stroke', 'white')
      borderPath.setAttribute('stroke-width', isSelected ? '8' : '5')
      borderPath.setAttribute('stroke-linecap', 'round')
      borderPath.setAttribute('stroke-linejoin', 'round')
      group.appendChild(borderPath)

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', tr.svgPath)
      path.setAttribute('fill', 'none')
      path.setAttribute('stroke', tr.color || '#FF4444')
      path.setAttribute('stroke-width', isSelected ? '5' : '3')
      path.setAttribute('stroke-linecap', 'round')
      path.setAttribute('stroke-linejoin', 'round')
      path.setAttribute('opacity', isSelected ? '1' : '0.7')
      group.appendChild(path)

      // Start marker (numbered circle)
      if (tr.startX && tr.startY) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        circle.setAttribute('cx', String(tr.startX))
        circle.setAttribute('cy', String(tr.startY))
        circle.setAttribute('r', isSelected ? '22' : '18')
        circle.setAttribute('fill', tr.color || '#FF4444')
        circle.setAttribute('stroke', 'white')
        circle.setAttribute('stroke-width', '3')
        group.appendChild(circle)

        if (tr.routeNumber !== undefined) {
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
          text.setAttribute('x', String(tr.startX))
          text.setAttribute('y', String(tr.startY))
          text.setAttribute('text-anchor', 'middle')
          text.setAttribute('dominant-baseline', 'central')
          text.setAttribute('fill', 'white')
          text.setAttribute('font-size', isSelected ? '20' : '16')
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
        anchor.setAttribute('fill', tr.color || '#FF4444')
        anchor.setAttribute('font-size', '24')
        anchor.setAttribute('font-weight', 'bold')
        anchor.setAttribute('stroke', 'white')
        anchor.setAttribute('stroke-width', '2')
        anchor.textContent = '⊗'
        group.appendChild(anchor)
      }

      // Click handler
      group.addEventListener('click', (e) => {
        e.stopPropagation()
        onRouteSelect?.(tr.routeId)
      })

      svg.appendChild(group)
    })

    // Add SVG as an overlay on the image
    const rect = viewer.viewport.imageToViewportRectangle(0, 0, imageWidth, imageHeight)
    viewer.addOverlay({
      element: svg,
      location: new OpenSeadragon.Rect(rect.x, rect.y, rect.width, rect.height),
    })

    svgOverlayRef.current = svg
  }, [ready, topoRoutes, selectedRouteId, imageWidth, imageHeight, onRouteSelect])

  useEffect(() => {
    updateOverlay()
  }, [updateOverlay])

  return (
    <div className="relative bg-gray-900 rounded-lg overflow-hidden">
      <div ref={containerRef} className="w-full aspect-[4/3]" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
          Загрузка топо...
        </div>
      )}
    </div>
  )
}
