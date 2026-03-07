import { useState, useEffect, useCallback } from 'react'

export interface GpsPosition {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
}

export function useGps(enabled = true) {
  const [position, setPosition] = useState<GpsPosition | null>(null)
  const [error, setError] = useState<string | null>(null)

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setError('GPS не поддерживается')
      return undefined
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        })
        setError(null)
      },
      (err) => {
        setError(err.message)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      },
    )

    return watchId
  }, [])

  useEffect(() => {
    if (!enabled) return
    const watchId = start()
    return () => {
      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId)
      }
    }
  }, [enabled, start])

  return { position, error }
}
