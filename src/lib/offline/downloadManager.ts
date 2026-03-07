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

        // Sectors
        for (const row of bundle.sectors) {
          await db.sectors.put(toCamel(row) as any)
        }

        // Routes
        for (const row of bundle.routes) {
          const route = toCamel(row) as any
          // Parse tags JSON string if present
          if (typeof route.tags === 'string') {
            try { route.tags = JSON.parse(route.tags) } catch { /* keep as string */ }
          }
          await db.routes.put(route)
        }

        // Topos
        for (const row of bundle.topos) {
          await db.topos.put(toCamel(row) as any)
        }

        // TopoRoutes
        for (const row of bundle.topoRoutes) {
          await db.topoRoutes.put(toCamel(row) as any)
        }

        // Save download version timestamp
        await db.syncMeta.put({
          key: `download:${areaId}`,
          value: String(bundle.version),
        })
      },
    )

    onProgress({ stage: 'saving', message: 'Закрепление хранилища...', percent: 85 })

    // Request persistent storage so the browser doesn't evict our data
    if (navigator.storage?.persist) {
      await navigator.storage.persist()
    }

    onProgress({ stage: 'done', message: 'Район загружен для офлайн-доступа!', percent: 100 })
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
