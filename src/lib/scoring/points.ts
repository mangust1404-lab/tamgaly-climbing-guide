/**
 * Система очков за пролазы (вдохновлено 12Climb).
 *
 * Базовые очки привязаны к категории по французской системе.
 * Множитель зависит от стиля пролаза.
 */

const GRADE_BASE_POINTS: Record<string, number> = {
  '4a': 40, '4b': 50, '4c': 60,
  '5a': 70, '5b': 85, '5c': 100,
  '6a': 120, '6a+': 135, '6b': 150, '6b+': 170, '6c': 190, '6c+': 210,
  '7a': 240, '7a+': 270, '7b': 300, '7b+': 340, '7c': 380, '7c+': 420,
  '8a': 470, '8a+': 520, '8b': 580, '8b+': 640, '8c': 700, '8c+': 770,
  '9a': 850, '9a+': 930, '9b': 1000,
}

const STYLE_MULTIPLIER: Record<string, number> = {
  onsight: 1.5,
  flash: 1.3,
  redpoint: 1.0,
  toprope: 0.5,
  attempt: 0,
}

/**
 * Numeric sort value for a French grade (for ordering routes by difficulty).
 */
export function gradeToSortValue(grade: string): number {
  const normalized = grade.toLowerCase().trim()
  const points = GRADE_BASE_POINTS[normalized]
  if (points !== undefined) return points
  // Fallback: strip + suffix and try base grade
  const base = normalized.replace('+', '')
  return GRADE_BASE_POINTS[base] ?? 0
}

/**
 * Calculate points for an ascent based on grade and style.
 */
export function calculatePoints(
  grade: string,
  style: 'onsight' | 'flash' | 'redpoint' | 'toprope' | 'attempt',
): number {
  const base = gradeToSortValue(grade)
  const multiplier = STYLE_MULTIPLIER[style] ?? 0
  return Math.round(base * multiplier)
}

/**
 * Calculate total score from a list of ascent points.
 * Uses best N ascents (default 20).
 */
export function calculateTotalScore(ascentPoints: number[], bestN = 20): number {
  const sorted = [...ascentPoints].sort((a, b) => b - a)
  return sorted.slice(0, bestN).reduce((sum, p) => sum + p, 0)
}
