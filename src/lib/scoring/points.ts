/**
 * Система очков за пролазы (вдохновлено 12Climb).
 *
 * Базовые очки привязаны к категории по французской системе.
 * Множитель зависит от стиля пролаза.
 */

const GRADE_BASE_POINTS: Record<string, number> = {
  // 4-5 grades: 10–100 (each category min > previous max)
  '4a': 10, '4b': 15, '4c': 20,
  '5a': 30, '5a+': 40, '5b': 50, '5b+': 60, '5c': 80, '5c+': 100,
  // 6 grades: 101–200
  '6a': 105, '6a+': 120, '6b': 135, '6b+': 155, '6c': 175, '6c+': 200,
  // 7 grades: 201–300
  '7a': 210, '7a+': 230, '7b': 250, '7b+': 270, '7c': 285, '7c+': 300,
  // 8 grades: 301–400
  '8a': 310, '8a+': 330, '8b': 350, '8b+': 370, '8c': 385, '8c+': 400,
  // 9 grades: 401+
  '9a': 420, '9a+': 450, '9b': 500,
}

const STYLE_MULTIPLIER: Record<string, number> = {
  onsight: 1.5,
  flash: 1.3,
  redpoint: 1.0,
  toprope: 0,
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
