import { Protocol } from 'pmtiles'

let protocol: Protocol | null = null

/**
 * Register PMTiles protocol with MapLibre.
 * Call once before creating any map instances.
 */
export function registerPMTilesProtocol() {
  if (protocol) return protocol
  protocol = new Protocol()
  return protocol
}

/**
 * Build a PMTiles source URL for MapLibre.
 * Supports both remote URLs and local blob URLs from Cache API.
 */
export function pmtilesSourceUrl(url: string): string {
  return `pmtiles://${url}`
}
