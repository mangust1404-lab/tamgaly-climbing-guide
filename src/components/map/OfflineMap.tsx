import { useRef, useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useGps } from '../../hooks/useGps'
import { distanceMeters, formatDistance } from '../../lib/map/geo'
import { gradeToTopoColor } from '../../lib/utils'
import { useI18n } from '../../lib/i18n'
import type { Area, Route, Sector } from '../../lib/db/schema'

// Tamgaly-Tas center coordinates
const DEFAULT_CENTER: [number, number] = [44.0630, 76.9960] // [lat, lng] for Leaflet
const DEFAULT_ZOOM = 16

interface OfflineMapProps {
  sectors: Sector[]
  area?: Area
  routes?: Route[]
  allRoutes?: Route[]
}

export function OfflineMap({ sectors, area, routes = [], allRoutes }: OfflineMapProps) {
  const { t, td } = useI18n()
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const gpsMarkerRef = useRef<L.CircleMarker | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const routeMarkersRef = useRef<L.Marker[]>([])
  const navigate = useNavigate()
  const { position } = useGps()
  const [nearestSector, setNearestSector] = useState<{ name: string; distance: string } | null>(null)

  // Compute sector gradient: proportional color bar by grade distribution
  const colorSource = allRoutes ?? routes
  const sectorGradients = useMemo(() => {
    const result: Record<string, string> = {}
    for (const sector of sectors) {
      const sectorRoutes = colorSource.filter(r => r.sectorId === sector.id)
      if (sectorRoutes.length === 0) { result[sector.id] = '#2563eb'; continue }
      // Count routes per grade prefix (4,5,6,7,8)
      const counts = new Map<string, number>()
      for (const r of sectorRoutes) {
        const prefix = r.grade.charAt(0)
        counts.set(prefix, (counts.get(prefix) || 0) + 1)
      }
      // Sort by grade prefix ascending
      const sorted = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      const total = sectorRoutes.length
      // Build CSS linear-gradient with proportional stops
      const segments: string[] = []
      let pos = 0
      const prefixColors: Record<string, string> = {
        '4': '#3B82F6', '5': '#F59E0B', '6': '#22C55E', '7': '#EF4444', '8': '#1F2937',
      }
      for (const [prefix, count] of sorted) {
        const color = prefixColors[prefix] || '#6B7280'
        const pct = (count / total) * 100
        segments.push(`${color} ${pos.toFixed(1)}%`)
        segments.push(`${color} ${(pos + pct).toFixed(1)}%`)
        pos += pct
      }
      result[sector.id] = segments.length > 0
        ? `linear-gradient(90deg, ${segments.join(', ')})`
        : '#2563eb'
    }
    return result
  }, [sectors, colorSource])

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = L.map(mapContainer.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Update sector markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Remove old markers
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    // Entrance marker
    if (area) {
      const entranceIcon = L.divIcon({
        html: `<div style="display:flex;flex-direction:column;align-items:center;">
          <div style="
            background: #dc2626;
            color: white;
            padding: 2px 7px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 700;
            white-space: nowrap;
            box-shadow: 0 1px 4px rgba(0,0,0,0.4);
          ">${t('map.entrance')}</div>
          <div style="
            width: 0; height: 0;
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-top: 5px solid #dc2626;
          "></div>
        </div>`,
        className: '',
        iconSize: [0, 0],
        iconAnchor: [0, 22],
      })
      const entranceMarker = L.marker([area.latitude, area.longitude], { icon: entranceIcon }).addTo(map)
      markersRef.current.push(entranceMarker)
    }

    sectors.forEach((sector) => {
      const gradient = sectorGradients[sector.id] || '#2563eb'
      const isGradient = gradient.startsWith('linear-gradient')
      const icon = L.divIcon({
        html: `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
          <div style="position:relative;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.4);">
            <div style="
              position:absolute;inset:0;
              background: ${gradient};
            "></div>
            <div style="
              position:relative;
              color: white;
              padding: 2px 7px;
              font-size: 10px;
              font-weight: 700;
              white-space: nowrap;
              line-height: 1.3;
              text-shadow: 0 1px 2px rgba(0,0,0,0.5);
            ">${td(sector.name)}</div>
          </div>
          <div style="
            width: 0; height: 0;
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-top: 5px solid ${isGradient ? '#666' : gradient};
          "></div>
        </div>`,
        className: '',
        iconSize: [0, 0],
        iconAnchor: [0, 22],
      })

      const marker = L.marker([sector.latitude, sector.longitude], { icon, zIndexOffset: 1000 })
        .addTo(map)
        .on('click', () => {
          navigate(`/sector/${sector.id}`)
        })

      markersRef.current.push(marker)
    })

    // Fit map to show all markers
    if (sectors.length > 0) {
      const lats = sectors.map(s => s.latitude)
      const lngs = sectors.map(s => s.longitude)
      if (area) { lats.push(area.latitude); lngs.push(area.longitude) }
      const bounds = L.latLngBounds(
        [Math.min(...lats) - 0.001, Math.min(...lngs) - 0.001],
        [Math.max(...lats) + 0.001, Math.max(...lngs) + 0.001],
      )
      map.fitBounds(bounds, { padding: [30, 30] })
    }
  }, [sectors, area, navigate, t, sectorGradients])

  // Route markers (shown at higher zoom levels)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Remove old route markers
    routeMarkersRef.current.forEach((m) => m.remove())
    routeMarkersRef.current = []

    const updateRouteVisibility = () => {
      const zoom = map.getZoom()
      const show = zoom >= 18
      routeMarkersRef.current.forEach(m => {
        if (show) m.addTo(map)
        else m.remove()
      })
    }

    routes.forEach((route) => {
      if (!route.latitude || !route.longitude) return
      // Grade-based color for route dot
      const g = route.grade.toLowerCase()
      let dotColor = '#6B7280'
      if (g.startsWith('4')) dotColor = '#3B82F6'
      else if (g.startsWith('5')) dotColor = '#F59E0B'
      else if (g.startsWith('6')) dotColor = '#22C55E'
      else if (g.startsWith('7')) dotColor = '#EF4444'
      else if (g.startsWith('8')) dotColor = '#1F2937'

      const icon = L.divIcon({
        html: `<div style="display:flex;align-items:center;gap:3px;cursor:pointer;">
          <div style="
            width: 10px; height: 10px;
            background: ${dotColor};
            border-radius: 50%;
            border: 1.5px solid white;
            box-shadow: 0 1px 2px rgba(0,0,0,0.3);
            flex-shrink: 0;
          "></div>
          <div style="
            background: white;
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 9px;
            font-weight: 700;
            white-space: nowrap;
            box-shadow: 0 1px 2px rgba(0,0,0,0.2);
            line-height: 1.2;
            font-family: monospace;
            color: #374151;
          ">${route.grade}</div>
        </div>`,
        className: '',
        iconSize: [0, 0],
        iconAnchor: [5, 5],
      })

      const marker = L.marker([route.latitude, route.longitude], { icon })
        .bindTooltip(td(route.name), { direction: 'right', offset: [10, 0], className: 'route-tooltip' })
        .on('click', () => {
          navigate(`/route/${route.id}`)
        })

      routeMarkersRef.current.push(marker)
    })

    // Show/hide based on zoom
    updateRouteVisibility()
    map.on('zoomend', updateRouteVisibility)

    return () => {
      map.off('zoomend', updateRouteVisibility)
      routeMarkersRef.current.forEach((m) => m.remove())
      routeMarkersRef.current = []
    }
  }, [routes, navigate])

  // Update GPS position on map
  useEffect(() => {
    if (!mapRef.current || !position) return

    const { latitude, longitude } = position

    if (!gpsMarkerRef.current) {
      gpsMarkerRef.current = L.circleMarker([latitude, longitude], {
        radius: 8,
        fillColor: '#4285f4',
        fillOpacity: 1,
        color: 'white',
        weight: 3,
      }).addTo(mapRef.current)
    } else {
      gpsMarkerRef.current.setLatLng([latitude, longitude])
    }

    // Find nearest sector
    if (sectors.length > 0) {
      let minDist = Infinity
      let nearest = sectors[0]
      for (const s of sectors) {
        const d = distanceMeters(latitude, longitude, s.latitude, s.longitude)
        if (d < minDist) {
          minDist = d
          nearest = s
        }
      }
      setNearestSector({
        name: td(nearest.name),
        distance: formatDistance(minDist),
      })
    }
  }, [position, sectors])

  // Center map on GPS position
  const centerOnGps = () => {
    if (mapRef.current && position) {
      mapRef.current.flyTo([position.latitude, position.longitude], 17, { duration: 1 })
    }
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0" />

      {/* GPS center button */}
      <button
        onClick={centerOnGps}
        className="absolute bottom-4 right-3 bg-white rounded-full w-10 h-10 shadow-lg flex items-center justify-center text-lg"
        style={{ zIndex: 1000 }}
        title={t('map.myPosition')}
      >
        📍
      </button>

      {/* Nearest sector info */}
      {nearestSector && (
        <div
          className="absolute top-3 left-3 bg-white/90 backdrop-blur rounded-lg px-3 py-2 shadow text-sm"
          style={{ zIndex: 1000 }}
        >
          <span className="text-gray-500">{t('map.nearest')}</span>{' '}
          <span className="font-semibold">{nearestSector.name}</span>{' '}
          <span className="text-blue-600">{nearestSector.distance}</span>
        </div>
      )}

      {/* GPS accuracy warning */}
      {position && position.accuracy > 50 && (
        <div
          className="absolute top-3 right-3 bg-yellow-100 text-yellow-800 rounded-lg px-3 py-1 text-xs shadow"
          style={{ zIndex: 1000 }}
        >
          GPS: ±{Math.round(position.accuracy)}{t('route.meters')}
        </div>
      )}
    </div>
  )
}
