import { useRef, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useGps } from '../../hooks/useGps'
import { distanceMeters, formatDistance } from '../../lib/map/geo'
import type { Area, Route, Sector } from '../../lib/db/schema'

// Tamgaly-Tas center coordinates
const DEFAULT_CENTER: [number, number] = [44.0630, 76.9960] // [lat, lng] for Leaflet
const DEFAULT_ZOOM = 16

interface OfflineMapProps {
  sectors: Sector[]
  area?: Area
  routes?: Route[]
}

export function OfflineMap({ sectors, area, routes = [] }: OfflineMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const gpsMarkerRef = useRef<L.CircleMarker | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const routeMarkersRef = useRef<L.Marker[]>([])
  const navigate = useNavigate()
  const { position } = useGps()
  const [nearestSector, setNearestSector] = useState<{ name: string; distance: string } | null>(null)

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
        html: `<div style="
          background: #dc2626;
          color: white;
          padding: 4px 10px;
          border-radius: 16px;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          border: 2px solid white;
        ">Вход</div>`,
        className: '',
        iconAnchor: [20, 12],
      })
      const entranceMarker = L.marker([area.latitude, area.longitude], { icon: entranceIcon }).addTo(map)
      markersRef.current.push(entranceMarker)
    }

    sectors.forEach((sector) => {
      const icon = L.divIcon({
        html: `<div style="
          background: #1e3a5f;
          color: white;
          padding: 4px 10px;
          border-radius: 16px;
          font-size: 13px;
          font-weight: 700;
          white-space: nowrap;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          border: 2px solid white;
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        ">${sector.name}</div>`,
        className: '',
        iconAnchor: [0, 0],
      })

      const marker = L.marker([sector.latitude, sector.longitude], { icon })
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
  }, [sectors, area, navigate])

  // Route markers (shown at higher zoom levels)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Remove old route markers
    routeMarkersRef.current.forEach((m) => m.remove())
    routeMarkersRef.current = []

    const updateRouteVisibility = () => {
      const zoom = map.getZoom()
      const show = zoom >= 17
      routeMarkersRef.current.forEach(m => {
        if (show) m.addTo(map)
        else m.remove()
      })
    }

    routes.forEach((route) => {
      if (!route.latitude || !route.longitude) return
      const icon = L.divIcon({
        html: `<div style="
          background: #15803d;
          color: #fff;
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          border: 2px solid white;
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        "><span style="font-family:monospace">${route.grade}</span> ${route.name}</div>`,
        className: '',
        iconAnchor: [0, 0],
      })

      const marker = L.marker([route.latitude, route.longitude], { icon })
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
        name: nearest.name,
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
        title="Моя позиция"
      >
        📍
      </button>

      {/* Nearest sector info */}
      {nearestSector && (
        <div
          className="absolute top-3 left-3 bg-white/90 backdrop-blur rounded-lg px-3 py-2 shadow text-sm"
          style={{ zIndex: 1000 }}
        >
          <span className="text-gray-500">Ближайший:</span>{' '}
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
          GPS: ±{Math.round(position.accuracy)}м
        </div>
      )}
    </div>
  )
}
