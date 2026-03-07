import { Hono } from 'hono'
import { getDb } from '../db/connection'

export const downloadRouter = new Hono()

/**
 * GET /api/download/area/:areaId
 *
 * Returns a single JSON bundle with ALL data for an area:
 * area, sectors, routes, topos, topoRoutes.
 *
 * The client saves this to IndexedDB for full offline access.
 */
downloadRouter.get('/area/:areaId', async (c) => {
  const db = getDb()
  const areaId = c.req.param('areaId')

  const area = db.prepare('SELECT * FROM area WHERE id = ?').get(areaId)
  if (!area) return c.json({ error: 'Area not found' }, 404)

  const sectors = db.prepare(
    'SELECT * FROM sector WHERE area_id = ? ORDER BY sort_order',
  ).all(areaId)

  const sectorIds = sectors.map((s: any) => s.id)
  const routePlaceholders = sectorIds.map(() => '?').join(',')

  const routes = sectorIds.length > 0
    ? db.prepare(
        `SELECT * FROM route WHERE sector_id IN (${routePlaceholders}) AND status = 'published' ORDER BY grade_sort`,
      ).all(...sectorIds)
    : []

  const topos = sectorIds.length > 0
    ? db.prepare(
        `SELECT * FROM topo WHERE sector_id IN (${routePlaceholders}) ORDER BY sort_order`,
      ).all(...sectorIds)
    : []

  const topoIds = topos.map((t: any) => t.id)
  const topoPlaceholders = topoIds.map(() => '?').join(',')

  const topoRoutes = topoIds.length > 0
    ? db.prepare(
        `SELECT * FROM topo_route WHERE topo_id IN (${topoPlaceholders})`,
      ).all(...topoIds)
    : []

  // Leaderboard snapshot for offline display
  const leaderboard = db.prepare(`
    SELECT
      a.user_id,
      COALESCE(u.display_name, 'Anonymous') as display_name,
      SUM(a.points) as total_points,
      COUNT(*) as ascent_count
    FROM ascent a
    LEFT JOIN app_user u ON a.user_id = u.id
    WHERE a.style != 'attempt'
    GROUP BY a.user_id
    ORDER BY total_points DESC
    LIMIT 50
  `).all()

  return c.json({
    version: Date.now(),
    area,
    sectors,
    routes,
    topos,
    topoRoutes,
    leaderboard,
  })
})
