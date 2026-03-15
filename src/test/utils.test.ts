import { describe, it, expect } from 'vitest'
import { gradeToTopoColor, gradeColor, gradeGroups } from '../lib/utils'

describe('gradeToTopoColor', () => {
  it('returns blue for grade 4 routes', () => {
    expect(gradeToTopoColor('4a')).toBe('#3B82F6')
    expect(gradeToTopoColor('4c')).toBe('#3B82F6')
  })

  it('returns amber for grade 5 routes', () => {
    expect(gradeToTopoColor('5a')).toBe('#F59E0B')
    expect(gradeToTopoColor('5c+')).toBe('#F59E0B')
  })

  it('returns green for grade 6 routes', () => {
    expect(gradeToTopoColor('6a')).toBe('#22C55E')
    expect(gradeToTopoColor('6c+')).toBe('#22C55E')
  })

  it('returns red for grade 7 routes', () => {
    expect(gradeToTopoColor('7a')).toBe('#EF4444')
    expect(gradeToTopoColor('7c+')).toBe('#EF4444')
  })

  it('returns black for grade 8 routes', () => {
    expect(gradeToTopoColor('8a')).toBe('#1F2937')
  })

  it('returns gray for unknown grades', () => {
    expect(gradeToTopoColor('???')).toBe('#6B7280')
  })
})

describe('gradeColor', () => {
  it('returns correct CSS classes for each grade range', () => {
    expect(gradeColor('4a')).toContain('bg-blue')
    expect(gradeColor('5b')).toContain('bg-amber')
    expect(gradeColor('6a+')).toContain('bg-green')
    expect(gradeColor('7b')).toContain('bg-red')
    expect(gradeColor('8a')).toContain('bg-gray')
  })
})

describe('gradeGroups', () => {
  it('extracts unique grade groups sorted ascending', () => {
    const grades = ['5a', '5b', '5c+', '6a', '6a+', '6b', '7a']
    const groups = gradeGroups(grades)
    expect(groups).toEqual(['5a', '5b', '5c', '6a', '6b', '7a'])
  })

  it('handles empty array', () => {
    expect(gradeGroups([])).toEqual([])
  })

  it('deduplicates grades with and without + suffix', () => {
    const grades = ['6a', '6a+']
    const groups = gradeGroups(grades)
    expect(groups).toEqual(['6a'])
  })
})
