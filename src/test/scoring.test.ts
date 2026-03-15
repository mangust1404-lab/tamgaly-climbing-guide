import { describe, it, expect } from 'vitest'
import { gradeToSortValue, calculatePoints, calculateTotalScore } from '../lib/scoring/points'

describe('gradeToSortValue', () => {
  it('returns correct base points for known grades', () => {
    expect(gradeToSortValue('5a')).toBe(70)
    expect(gradeToSortValue('6a')).toBe(120)
    expect(gradeToSortValue('6a+')).toBe(135)
    expect(gradeToSortValue('7b+')).toBe(340)
  })

  it('is case-insensitive', () => {
    expect(gradeToSortValue('6A')).toBe(120)
    expect(gradeToSortValue('6A+')).toBe(135)
  })

  it('returns 0 for unknown grades', () => {
    expect(gradeToSortValue('unknown')).toBe(0)
  })

  it('falls back to base grade when + variant not found', () => {
    // 5a+ is not in table, should strip + and return 5a = 70
    expect(gradeToSortValue('5a+')).toBe(70)
  })
})

describe('calculatePoints', () => {
  it('applies onsight multiplier (1.5x)', () => {
    expect(calculatePoints('6a', 'onsight')).toBe(180) // 120 * 1.5
  })

  it('applies flash multiplier (1.3x)', () => {
    expect(calculatePoints('6a', 'flash')).toBe(156) // 120 * 1.3
  })

  it('applies redpoint multiplier (1.0x)', () => {
    expect(calculatePoints('6a', 'redpoint')).toBe(120)
  })

  it('applies toprope multiplier (0.5x)', () => {
    expect(calculatePoints('6a', 'toprope')).toBe(60)
  })

  it('gives 0 points for attempts', () => {
    expect(calculatePoints('7a', 'attempt')).toBe(0)
  })
})

describe('calculateTotalScore', () => {
  it('sums all points when fewer than bestN', () => {
    expect(calculateTotalScore([100, 200, 150])).toBe(450)
  })

  it('takes only best N ascents', () => {
    const points = [10, 50, 30, 20, 40]
    // Best 3: 50, 40, 30 = 120
    expect(calculateTotalScore(points, 3)).toBe(120)
  })

  it('returns 0 for empty array', () => {
    expect(calculateTotalScore([])).toBe(0)
  })
})
