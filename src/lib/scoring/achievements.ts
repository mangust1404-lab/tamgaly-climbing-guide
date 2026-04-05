import type { Ascent, Route, Sector } from '../db/schema'

export interface AchievementDef {
  type: string
  targetId: string | null
  name: string
  icon: string
  description: string
}

const SCORED_STYLES = ['onsight', 'flash', 'redpoint']

/**
 * Calculate achievements for a user.
 * Returns newly earned achievements (not yet in existing set).
 */
export function calculateAchievements(
  userAscents: Ascent[],
  routes: Route[],
  sectors: Sector[],
  existingTypes: Set<string>, // "type:targetId" keys already earned
): AchievementDef[] {
  const scored = userAscents.filter(a => SCORED_STYLES.includes(a.style))
  const climbedRouteIds = new Set(scored.map(a => a.routeId))
  const achievements: AchievementDef[] = []

  // Sector master: climbed all published routes in a sector
  for (const sector of sectors) {
    const key = `sector_master:${sector.id}`
    if (existingTypes.has(key)) continue
    const sectorRoutes = routes.filter(r => r.sectorId === sector.id && r.status === 'published')
    if (sectorRoutes.length === 0) continue
    const allClimbed = sectorRoutes.every(r => climbedRouteIds.has(r.id))
    if (allClimbed) {
      achievements.push({
        type: 'sector_master',
        targetId: sector.id,
        name: sector.name,
        icon: '🥇',
        description: `Все маршруты сектора ${sector.name}`,
      })
    }
  }

  // Grade king: climbed all routes of a grade prefix (5, 6, 7)
  for (const prefix of ['5', '6', '7', '8']) {
    const key = `grade_king:${prefix}`
    if (existingTypes.has(key)) continue
    const gradeRoutes = routes.filter(r => r.grade.startsWith(prefix) && r.status === 'published')
    if (gradeRoutes.length === 0) continue
    const allClimbed = gradeRoutes.every(r => climbedRouteIds.has(r.id))
    if (allClimbed) {
      const names: Record<string, string> = {
        '5': 'Король пятёрок',
        '6': 'Король шестёрок',
        '7': 'Король семёрок',
        '8': 'Король восьмёрок',
      }
      achievements.push({
        type: 'grade_king',
        targetId: prefix,
        name: names[prefix],
        icon: '👑',
        description: `Все маршруты категории ${prefix}`,
      })
    }
  }

  // Route type masters: multi-pitch and trad
  for (const [routeType, name, icon] of [['multi-pitch', 'Мастер мультипитчей', '🧗'], ['trad', 'Трэд-воин', '🪨']] as const) {
    const key = `type_master:${routeType}`
    if (existingTypes.has(key)) continue
    const typeRoutes = routes.filter(r => r.routeType === routeType && r.status === 'published')
    if (typeRoutes.length === 0) continue
    const allClimbed = typeRoutes.every(r => climbedRouteIds.has(r.id))
    if (allClimbed) {
      achievements.push({
        type: 'type_master',
        targetId: routeType,
        name,
        icon,
        description: `Все ${routeType === 'multi-pitch' ? 'мультипитчи' : 'трэд маршруты'}`,
      })
    }
  }

  // Legend of Tamgaly: climbed ALL published routes
  const legendKey = 'legend:all'
  if (!existingTypes.has(legendKey)) {
    const allPublished = routes.filter(r => r.status === 'published')
    if (allPublished.length > 0 && allPublished.every(r => climbedRouteIds.has(r.id))) {
      achievements.push({
        type: 'legend',
        targetId: 'all',
        name: 'Легенда Тамгалы',
        icon: '🏆',
        description: 'Все маршруты Тамгалы',
      })
    }
  }

  return achievements
}
