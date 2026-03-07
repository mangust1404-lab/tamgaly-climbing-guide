import { useRef, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useGps } from '../../hooks/useGps'
import { distanceMeters, formatDistance } from '../../lib/map/geo'
import type { Sector } from '../../lib/db/schema'

// Tamgaly-Tas center coordinates
const DEFAULT_CENTER: [number, number] = [75.535, 43.805]
const DEFAULT_ZOOM = 14

interface OfflineMapProps {
  sectors: Sector[]
}

export function OfflineMap({ sectors }: OfflineMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const gpsMarkerRef = useRef<maplibregl.Marker | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const navigate = useNavigate()
  const { position } = useGps()
  const [mapReady, setMapReady] = useState(false)
  const [nearestSector, setNearestSector] = useState<{ name: string; distance: string } | null>(null)

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm-tiles',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      maxZoom: 18,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    map.on('load', () => {
      setMapReady(true)
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [])

  // Update sector markers when sectors change AND map is ready
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    // Remove old markers
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    sectors.forEach((sector) => {
      const el = document.createElement('div')
      el.innerHTML = `
        <div style="
          background: #1e3a5f;
          color: white;
          padding: 4px 10px;
          border-radius: 16px;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          border: 2px solid white;
        ">${sector.name}</div>
      `
      el.addEventListener('click', () => {
        navigate(`/sector/${sector.id}`)
      })

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([sector.longitude, sector.latitude])
        .addTo(map)

      markersRef.current.push(marker)
    })
  }, [sectors, navigate, mapReady])

  // Update GPS position on map
  useEffect(() => {
    if (!mapRef.current || !mapReady || !position) return

    const { latitude, longitude } = position

    if (!gpsMarkerRef.current) {
      const el = document.createElement('div')
      el.style.cssText = `
        width: 18px; height: 18px;
        background: #4285f4;
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 0 8px rgba(66, 133, 244, 0.6);
      `
      gpsMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([longitude, latitude])
        .addTo(mapRef.current)
    } else {
      gpsMarkerRef.current.setLngLat([longitude, latitude])
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
  }, [position, sectors, mapReady])

  // Center map on GPS position
  const centerOnGps = () => {
    if (mapRef.current && position) {
      mapRef.current.flyTo({
        center: [position.longitude, position.latitude],
        zoom: 16,
        duration: 1000,
      })
    }
  }

  return (
    <div className="relative w-full flex-1" style={{ minHeight: 300 }}>
      <div ref={mapContainer} className="absolute inset-0" />

      {/* GPS center button */}
      <button
        onClick={centerOnGps}
        className="absolute bottom-4 right-3 bg-white rounded-full w-10 h-10 shadow-lg flex items-center justify-center text-lg z-10"
        title="Моя позиция"
      >
        📍
      </button>

      {/* Nearest sector info */}
      {nearestSector && (
        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur rounded-lg px-3 py-2 shadow text-sm z-10">
          <span className="text-gray-500">Ближайший:</span>{' '}
          <span className="font-semibold">{nearestSector.name}</span>{' '}
          <span className="text-blue-600">{nearestSector.distance}</span>
        </div>
      )}

      {/* GPS accuracy warning */}
      {position && position.accuracy > 50 && (
        <div className="absolute top-3 right-3 bg-yellow-100 text-yellow-800 rounded-lg px-3 py-1 text-xs shadow z-10">
          GPS: ±{Math.round(position.accuracy)}м
        </div>
      )}
    </div>
  )
}
