import { db } from '../db/schema'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export type DownloadProgress = {
  stage: 'fetching' | 'saving' | 'done' | 'error'
  message: string
  percent: number
}

type DownloadBundle = {
  version: number
  area: Record<string, unknown>
  sectors: Record<string, unknown>[]
  routes: Record<string, unknown>[]
  topos: Record<string, unknown>[]
  topoRoutes: Record<string, unknown>[]
  leaderboard: Record<string, unknown>[]
}

/** Convert snake_case server row to camelCase client object */
function toCamel(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    out[camel] = v
  }
  return out
}

/**
 * Download all data for an area from the server and save to IndexedDB.
 * Calls onProgress with status updates.
 */
export async function downloadArea(
  areaId: string,
  onProgress: (p: DownloadProgress) => void,
): Promise<void> {
  try {
    onProgress({ stage: 'fetching', message: 'Загрузка данных с сервера...', percent: 10 })

    const res = await fetch(`${API_BASE}/download/area/${areaId}`)
    if (!res.ok) {
      throw new Error(`Сервер вернул ошибку ${res.status}`)
    }

    const bundle: DownloadBundle = await res.json()
    onProgress({ stage: 'saving', message: 'Сохранение в локальную базу...', percent: 50 })

    await db.transaction(
      'rw',
      [db.areas, db.sectors, db.routes, db.topos, db.topoRoutes, db.syncMeta],
      async () => {
        // Area
        const area = toCamel(bundle.area)
        await db.areas.put(area as any)

        // Clear+bulkAdd ensures deletions propagate
        if (bundle.sectors.length > 0) {
          await db.sectors.clear()
          await db.sectors.bulkAdd(bundle.sectors.map(r => toCamel(r)) as any[])
        }

        if (bundle.routes.length > 0) {
          const routes = bundle.routes.map(row => {
            const route = toCamel(row) as any
            if (typeof route.tags === 'string') {
              try { route.tags = JSON.parse(route.tags) } catch { /* keep as string */ }
            }
            return route
          })
          await db.routes.clear()
          await db.routes.bulkAdd(routes as any[])
        }

        if (bundle.topos.length > 0) {
          await db.topos.clear()
          await db.topos.bulkAdd(bundle.topos.map(r => toCamel(r)) as any[])
        }

        if (bundle.topoRoutes.length > 0) {
          await db.topoRoutes.clear()
          await db.topoRoutes.bulkAdd(bundle.topoRoutes.map(r => toCamel(r)) as any[])
        }

        // Save download version timestamp
        await db.syncMeta.put({
          key: `download:${areaId}`,
          value: String(bundle.version),
        })
      },
    )

    // Prefetch topo images into service worker cache
    onProgress({ stage: 'saving', message: 'Кеширование фото...', percent: 70 })
    const topoImages = bundle.topos
      .map(t => toCamel(t) as any)
      .filter((t: any) => t.imageUrl && !t.imageUrl.startsWith('data:'))
      .map((t: any) => t.imageUrl as string)
    const sectorCovers = bundle.sectors
      .map(s => toCamel(s) as any)
      .filter((s: any) => s.coverImageUrl && !s.coverImageUrl.startsWith('data:'))
      .map((s: any) => s.coverImageUrl as string)
    const allImages = [...new Set([...topoImages, ...sectorCovers])]
    let cached = 0
    for (const url of allImages) {
      try {
        await fetch(url, { cache: 'reload' })
        cached++
      } catch { /* skip failed images */ }
    }
    console.log(`Prefetched ${cached}/${allImages.length} images for offline`)

    onProgress({ stage: 'saving', message: 'Закрепление хранилища...', percent: 90 })

    // Request persistent storage so the browser doesn't evict our data
    if (navigator.storage?.persist) {
      await navigator.storage.persist()
    }

    onProgress({ stage: 'done', message: `Загружено: ${cached} фото для офлайн`, percent: 100 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Неизвестная ошибка'
    onProgress({ stage: 'error', message, percent: 0 })
    throw err
  }
}

/** Check if area data is already downloaded */
export async function isAreaDownloaded(areaId: string): Promise<boolean> {
  const meta = await db.syncMeta.get(`download:${areaId}`)
  return !!meta
}

/**
 * Force-reload topo data from topo-data.json, bypassing version check.
 * This ensures the latest route overlays and photos are loaded.
 */
export async function refreshTopoData(
  onProgress: (p: DownloadProgress) => void,
): Promise<void> {
  try {
    onProgress({ stage: 'fetching', message: 'Загрузка данных...', percent: 10 })

    const base = import.meta.env.BASE_URL || '/'
    const resp = await fetch(`${base}data/topo-data.json`, { cache: 'no-cache' })
    if (!resp.ok) {
      throw new Error(`Ошибка загрузки: ${resp.status}`)
    }

    const data = await resp.json() as {
      version?: number
      topos?: Array<Record<string, unknown>>
      topoRoutes?: Array<Record<string, unknown>>
      routes?: Array<Record<string, unknown>>
      sectors?: Array<Record<string, unknown>>
      sectorCovers?: Record<string, string>
    }

    onProgress({ stage: 'saving', message: 'Сохранение...', percent: 50 })

    // Replace all data — clear+bulkAdd ensures deletions propagate
    await db.transaction('rw', [db.sectors, db.routes, db.topos, db.topoRoutes], async () => {
      if (data.sectors && data.sectors.length > 0) {
        await db.sectors.clear()
        await db.sectors.bulkAdd(data.sectors as any[])
      }
      if (data.routes && data.routes.length > 0) {
        await db.routes.clear()
        await db.routes.bulkAdd(data.routes as any[])
      }
      if (data.topos && data.topos.length > 0) {
        await db.topos.clear()
        await db.topos.bulkAdd(data.topos as any[])
      }
      if (data.topoRoutes && data.topoRoutes.length > 0) {
        await db.topoRoutes.clear()
        await db.topoRoutes.bulkAdd(data.topoRoutes as any[])
      }
    })
    if (data.sectorCovers) {
      for (const [sectorId, coverUrl] of Object.entries(data.sectorCovers)) {
        await db.sectors.update(sectorId, { coverImageUrl: coverUrl })
      }
    }

    await db.syncMeta.put({ key: 'topoDataVersion', value: String(data.version || 0) })

    // Prefetch topo images into service worker cache
    onProgress({ stage: 'saving', message: 'Кеширование фото...', percent: 70 })
    const imageUrls: string[] = []
    if (data.topos) {
      for (const t of data.topos) {
        const url = (t as any).imageUrl
        if (url && typeof url === 'string' && !url.startsWith('data:')) imageUrls.push(url)
      }
    }
    if (data.sectorCovers) {
      for (const url of Object.values(data.sectorCovers)) {
        if (url && !url.startsWith('data:')) imageUrls.push(url)
      }
    }
    if (data.sectors) {
      for (const s of data.sectors) {
        const url = (s as any).coverImageUrl
        if (url && typeof url === 'string' && !url.startsWith('data:')) imageUrls.push(url)
      }
    }
    const uniqueUrls = [...new Set(imageUrls)]
    let cached = 0
    for (const url of uniqueUrls) {
      try { await fetch(url, { cache: 'reload' }); cached++ } catch {}
    }
    console.log(`Prefetched ${cached}/${uniqueUrls.length} images for offline`)

    // Request persistent storage
    if (navigator.storage?.persist) {
      await navigator.storage.persist()
    }

    // Cache map tiles for Tamgaly area (offline)
    onProgress({ stage: 'saving', message: 'Кеширование карты...', percent: 85 })
    const tilesCached = await cacheMapTiles()

    const routeCount = data.routes?.length || 0
    onProgress({ stage: 'done', message: `Обновлено: ${routeCount} маршрутов, ${cached} фото, ${tilesCached} тайлов карты`, percent: 100 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ошибка обновления'
    onProgress({ stage: 'error', message, percent: 0 })
  }
}

/**
 * Cache map tiles for Tamgaly-Tas area for offline use.
 * Downloads OpenTopoMap tiles (terrain + trails) at zoom levels 14-17.
 */
async function cacheMapTiles(): Promise<number> {
  const TILE_URL = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
  const subdomains = ['a', 'b', 'c']

  // Tamgaly-Tas bounding box (slightly expanded)
  const bounds = { minLat: 44.054, maxLat: 44.073, minLng: 76.984, maxLng: 77.012 }
  const zoomLevels = [14, 15, 16, 17]

  function latLngToTile(lat: number, lng: number, z: number): [number, number] {
    const n = 2 ** z
    const x = Math.floor((lng + 180) / 360 * n)
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n)
    return [x, y]
  }

  const urls: string[] = []
  for (const z of zoomLevels) {
    const [xMin, yMin] = latLngToTile(bounds.maxLat, bounds.minLng, z)
    const [xMax, yMax] = latLngToTile(bounds.minLat, bounds.maxLng, z)
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const s = subdomains[(x + y) % subdomains.length]
        urls.push(TILE_URL.replace('{s}', s).replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)))
      }
    }
  }

  let cached = 0
  const cache = await caches.open('map-tiles')
  for (const url of urls) {
    try {
      const existing = await cache.match(url)
      if (!existing) {
        const resp = await fetch(url)
        if (resp.ok) { await cache.put(url, resp); cached++ }
      } else {
        cached++
      }
    } catch { /* skip failed tiles */ }
  }
  console.log(`Map tiles: ${cached}/${urls.length} cached for offline`)
  return cached
}
