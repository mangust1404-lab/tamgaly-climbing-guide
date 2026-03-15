import { describe, it, expect } from 'vitest'
import { distanceMeters, bearing, formatDistance } from '../lib/map/geo'

describe('distanceMeters', () => {
  it('returns 0 for same point', () => {
    expect(distanceMeters(44.063, 76.996, 44.063, 76.996)).toBe(0)
  })

  it('calculates roughly correct distance for known points', () => {
    // Almaty to Tamgaly-Tas is ~120 km
    const d = distanceMeters(43.2380, 76.9457, 44.0630, 76.9960)
    expect(d).toBeGreaterThan(90_000)
    expect(d).toBeLessThan(100_000)
  })

  it('is symmetric', () => {
    const d1 = distanceMeters(44.063, 76.996, 44.070, 77.000)
    const d2 = distanceMeters(44.070, 77.000, 44.063, 76.996)
    expect(Math.abs(d1 - d2)).toBeLessThan(0.01)
  })
})

describe('bearing', () => {
  it('returns ~0 for due north', () => {
    const b = bearing(44.0, 77.0, 45.0, 77.0)
    expect(b).toBeLessThan(5)
  })

  it('returns ~90 for due east', () => {
    const b = bearing(44.0, 77.0, 44.0, 78.0)
    expect(b).toBeGreaterThan(85)
    expect(b).toBeLessThan(95)
  })
})

describe('formatDistance', () => {
  it('formats meters for distances under 1km', () => {
    expect(formatDistance(500)).toBe('500 м')
    expect(formatDistance(0)).toBe('0 м')
  })

  it('formats kilometers for distances over 1km', () => {
    expect(formatDistance(1500)).toBe('1.5 км')
    expect(formatDistance(120000)).toBe('120.0 км')
  })
})
