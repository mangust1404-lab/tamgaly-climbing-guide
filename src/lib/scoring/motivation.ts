import type { Ascent, Route, Sector } from '../db/schema'

export interface MotivationMessage {
  icon: string
  title: string
  subtitle?: string
  type: 'celebrate' | 'streak' | 'progress' | 'milestone'
}

export interface ProgressItem {
  icon: string
  label: string
  current: number
  total: number
  type: 'sector' | 'grade'
}

const SCORED_STYLES = ['onsight', 'flash', 'redpoint']

/**
 * Generate motivation messages after a new ascent is saved.
 */
export function getMotivationMessages(
  allUserAscents: Ascent[],
  newAscent: { routeId: string; style: string },
  routes: Route[],
  sectors: Sector[],
): MotivationMessage[] {
  const messages: MotivationMessage[] = []
  const scored = allUserAscents.filter(a => SCORED_STYLES.includes(a.style))
  const routeMap = new Map(routes.map(r => [r.id, r]))
  const newRoute = routeMap.get(newAscent.routeId)

  // Total ascent milestones
  const totalScored = scored.length
  if (totalScored === 1) {
    messages.push({ icon: '🎉', title: 'Первый пролаз!', subtitle: 'Добро пожаловать в Тамгалы!', type: 'celebrate' })
  } else if (totalScored === 10) {
    messages.push({ icon: '🎯', title: 'Десятка!', subtitle: '10 маршрутов пройдено', type: 'milestone' })
  } else if (totalScored === 50) {
    messages.push({ icon: '⭐', title: 'Полтинник!', subtitle: '50 маршрутов — ты местный!', type: 'milestone' })
  } else if (totalScored === 100) {
    messages.push({ icon: '🌟', title: 'Сотка!', subtitle: 'Ты знаешь эти скалы лучше всех', type: 'milestone' })
  }

  // New max grade
  if (newRoute && SCORED_STYLES.includes(newAscent.style)) {
    const prevMaxSort = scored
      .filter(a => a.routeId !== newAscent.routeId || a.id !== scored[scored.length - 1]?.id)
      .reduce((max, a) => {
        const r = routeMap.get(a.routeId)
        return r && r.gradeSort > max ? r.gradeSort : max
      }, 0)

    if (newRoute.gradeSort > prevMaxSort && prevMaxSort > 0) {
      messages.push({
        icon: '🔥',
        title: `Новый уровень!`,
        subtitle: `Первая ${newRoute.grade}!`,
        type: 'celebrate',
      })
    }
  }

  // Streak (consecutive days)
  const dates = [...new Set(scored.map(a => a.date))].sort()
  if (dates.length >= 2) {
    let streak = 1
    for (let i = dates.length - 1; i > 0; i--) {
      const d1 = new Date(dates[i]).getTime()
      const d2 = new Date(dates[i - 1]).getTime()
      if (d1 - d2 <= 86400000 * 1.5) streak++
      else break
    }
    if (streak === 2) {
      messages.push({ icon: '⚡', title: '2 дня подряд!', subtitle: 'Держи темп!', type: 'streak' })
    } else if (streak >= 3) {
      messages.push({ icon: '🔥', title: `${streak} дней подряд!`, subtitle: 'Ты машина!', type: 'streak' })
    }
  }

  // Routes today
  const today = new Date().toISOString().split('T')[0]
  const todayCount = scored.filter(a => a.date === today).length
  if (todayCount === 5) {
    messages.push({ icon: '💪', title: '5 за день!', subtitle: 'Отличная тренировка!', type: 'milestone' })
  } else if (todayCount === 10) {
    messages.push({ icon: '🏋️', title: '10 за день!', subtitle: 'Настоящий марафон!', type: 'milestone' })
  }

  // Almost sector master (1-2 routes left)
  if (newRoute) {
    const climbedIds = new Set(scored.map(a => a.routeId))
    const sector = sectors.find(s => s.id === newRoute.sectorId)
    if (sector) {
      const sectorRoutes = routes.filter(r => r.sectorId === sector.id && r.status === 'published')
      const remaining = sectorRoutes.filter(r => !climbedIds.has(r.id)).length
      if (remaining === 0 && sectorRoutes.length > 0) {
        messages.push({ icon: '🥇', title: `Хозяин: ${sector.name}!`, subtitle: 'Все маршруты сектора пройдены!', type: 'celebrate' })
      } else if (remaining <= 2 && remaining > 0 && sectorRoutes.length >= 3) {
        messages.push({ icon: '🔜', title: `Почти Хозяин!`, subtitle: `Осталось ${remaining} до ${sector.name}`, type: 'progress' })
      }
    }
  }

  // First ascent of the day — always congratulate
  if (todayCount === 1 && newRoute && SCORED_STYLES.includes(newAscent.style)) {
    messages.push({ icon: '☀️', title: 'Первый пролаз дня!', subtitle: `${newRoute.name} ${newRoute.grade}`, type: 'celebrate' })
  }

  return messages
}

/**
 * Calculate progress towards achievements for display in profile.
 */
export function getAchievementProgress(
  userAscents: Ascent[],
  routes: Route[],
  sectors: Sector[],
): ProgressItem[] {
  const scored = userAscents.filter(a => SCORED_STYLES.includes(a.style))
  const climbedIds = new Set(scored.map(a => a.routeId))
  const progress: ProgressItem[] = []

  // Sector progress — show sectors where user climbed at least 1 route, sorted by completion %
  for (const sector of sectors) {
    const sectorRoutes = routes.filter(r => r.sectorId === sector.id && r.status === 'published')
    if (sectorRoutes.length === 0) continue
    const climbed = sectorRoutes.filter(r => climbedIds.has(r.id)).length
    if (climbed === 0 || climbed === sectorRoutes.length) continue // skip empty and completed
    progress.push({
      icon: '🥇',
      label: `Хозяин: ${sector.name}`,
      current: climbed,
      total: sectorRoutes.length,
      type: 'sector',
    })
  }

  // Grade progress
  for (const prefix of ['5', '6', '7']) {
    const gradeRoutes = routes.filter(r => r.grade.startsWith(prefix) && r.status === 'published')
    if (gradeRoutes.length === 0) continue
    const climbed = gradeRoutes.filter(r => climbedIds.has(r.id)).length
    if (climbed === 0 || climbed === gradeRoutes.length) continue
    const names: Record<string, string> = { '5': 'Король пятёрок', '6': 'Король шестёрок', '7': 'Король семёрок' }
    progress.push({
      icon: '👑',
      label: names[prefix],
      current: climbed,
      total: gradeRoutes.length,
      type: 'grade',
    })
  }

  // Sort by completion % descending
  progress.sort((a, b) => (b.current / b.total) - (a.current / a.total))

  return progress
}
