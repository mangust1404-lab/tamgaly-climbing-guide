/**
 * Parse KML/GPX file exported from theCrag and extract sector GPS coordinates.
 *
 * Usage:
 *   npx tsx scripts/import-from-kml.ts data/tamgaly-tas.kml > sectors-coords.json
 *
 * KML format contains <Placemark> elements with <Point><coordinates> tags.
 * GPX format contains <wpt> elements with lat/lon attributes.
 */

import { readFileSync } from 'fs'

interface SectorCoord {
  name: string
  latitude: number
  longitude: number
}

function parseKML(content: string): SectorCoord[] {
  const results: SectorCoord[] = []

  // Match Placemark elements
  const placemarkRegex = /<Placemark>([\s\S]*?)<\/Placemark>/g
  let match: RegExpExecArray | null

  while ((match = placemarkRegex.exec(content)) !== null) {
    const block = match[1]

    // Extract name
    const nameMatch = block.match(/<name>(.*?)<\/name>/)
    const name = nameMatch ? nameMatch[1].trim() : 'Unknown'

    // Extract coordinates (lon,lat,alt format in KML)
    const coordMatch = block.match(/<coordinates>\s*([\d.,-]+)\s*<\/coordinates>/)
    if (coordMatch) {
      const [lon, lat] = coordMatch[1].split(',').map(Number)
      if (lat && lon) {
        results.push({ name, latitude: lat, longitude: lon })
      }
    }
  }

  return results
}

function parseGPX(content: string): SectorCoord[] {
  const results: SectorCoord[] = []

  // Match waypoint elements
  const wptRegex = /<wpt\s+lat="([\d.-]+)"\s+lon="([\d.-]+)">([\s\S]*?)<\/wpt>/g
  let match: RegExpExecArray | null

  while ((match = wptRegex.exec(content)) !== null) {
    const lat = parseFloat(match[1])
    const lon = parseFloat(match[2])
    const block = match[3]

    const nameMatch = block.match(/<name>(.*?)<\/name>/)
    const name = nameMatch ? nameMatch[1].trim() : 'Unknown'

    results.push({ name, latitude: lat, longitude: lon })
  }

  return results
}

function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Usage: npx tsx scripts/import-from-kml.ts <path-to-kml-or-gpx>')
    process.exit(1)
  }

  const content = readFileSync(filePath, 'utf-8')
  const isGPX = filePath.toLowerCase().endsWith('.gpx')

  const sectors = isGPX ? parseGPX(content) : parseKML(content)

  console.log(JSON.stringify(sectors, null, 2))
  console.error(`Parsed ${sectors.length} sector coordinates from ${filePath}`)
}

main()
