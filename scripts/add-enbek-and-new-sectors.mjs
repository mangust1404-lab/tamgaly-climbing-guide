/**
 * Add route data for Енбек sector and create 2 new sectors:
 * - Сектор Вечерний (5 routes)
 * - Сектор За Висячим камнем (3 routes)
 *
 * Only ADDS info (lengthM, quickdraws, names with P1/P2). Does NOT overwrite existing values.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const dataPath = join(process.cwd(), 'data', 'topo-data.json')
const data = JSON.parse(readFileSync(dataPath, 'utf-8'))

const GRADE_SORT = {
  '4': 30, '4a': 40, '4b': 50, '4c': 60,
  '5a': 70, '5a+': 75, '5b': 85, '5b+': 90, '5c': 100, '5c+': 105,
  '6a': 120, '6a+': 135, '6b': 150, '6b+': 170, '6c': 190, '6c+': 210,
  '7a': 240, '7a+': 270, '7b': 300, '7b+': 340, '7c': 380, '7c+': 420,
  '8a': 470, '8a+': 520,
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '')
}

// Helper: update a route, only adding new info (not overwriting existing)
function addInfo(routeId, updates) {
  const route = data.routes.find(r => r.id === routeId)
  if (!route) {
    console.warn(`Route ${routeId} not found!`)
    return
  }
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'name') {
      // Only add P1/P2 suffix if not already there
      if (!route.name.includes('P1') && !route.name.includes('P2') && value.includes('P')) {
        route.name = value
        route.slug = slugify(value)
      }
    } else if (route[key] == null || route[key] === undefined) {
      route[key] = value
    }
  }
  console.log(`  Updated ${route.name} (${routeId}): lengthM=${route.lengthM}, qd=${route.quickdraws}`)
}

// Helper: create a new route
let routeCounter = Date.now()
function newRoute(sectorId, name, grade, opts = {}) {
  const id = `route-${routeCounter++}`
  const route = {
    id,
    sectorId,
    name,
    slug: slugify(name),
    grade,
    gradeSystem: 'french',
    gradeSort: GRADE_SORT[grade] || 0,
    lengthM: opts.lengthM || null,
    pitches: opts.pitches || 1,
    routeType: opts.routeType || 'sport',
    description: opts.description || null,
    protection: null,
    firstAscent: null,
    firstAscentDate: null,
    qualityRating: null,
    numberInSector: opts.numberInSector || null,
    latitude: null,
    longitude: null,
    tags: null,
    status: opts.status || 'published',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    quickdraws: opts.quickdraws || null,
    ropeLength: opts.ropeLength || null,
    terrainTags: opts.terrainTags || null,
    holdTypes: opts.holdTypes || null,
  }
  data.routes.push(route)
  console.log(`  Added ${name} (${id}): ${grade}, ${opts.lengthM}m, ${opts.quickdraws}qd`)
  return id
}

// ==========================================
// Енбек — update existing routes with length/quickdraws data
// ==========================================
console.log('\n=== Енбек ===')

// Single pitch routes
addInfo('route-1774026494761', { lengthM: 12, quickdraws: 8, numberInSector: 1 })  // Песочник 6a+
addInfo('route-1774026422902', { lengthM: 12, quickdraws: 7, numberInSector: 2 })  // Зов Ктулху 6b
addInfo('route-1774026383330', { lengthM: 11, quickdraws: 6, numberInSector: 3 })  // То, чего не может быть 6b
addInfo('route-1774026350172', { lengthM: 15, quickdraws: 7, numberInSector: 4 })  // Золото 6a
addInfo('route-1774026322935', { lengthM: 17, quickdraws: 8, numberInSector: 5 })  // Топливо 5b+
addInfo('route-1774026285463', { lengthM: 18, quickdraws: 9, numberInSector: 6 })  // Поломай, Ко 6b
addInfo('route-1774026140040', { lengthM: 22, quickdraws: 10, numberInSector: 7 }) // Одноразовые герои 7b
addInfo('route-1774026106182', { lengthM: 12, quickdraws: 7, numberInSector: 8 })  // Мессия 5b

// Multipitch: Батарея 5с/6c+, 30м, 6+10 qd
addInfo('route-1774026061356', { name: 'Батарея P1', lengthM: 11, quickdraws: 6, numberInSector: 9 })
addInfo('route-1774026072197', { name: 'Батарея P2', lengthM: 19, quickdraws: 10, numberInSector: 9 })

// Multipitch: Кукольщик 6a/6b+, 35м, 7+9 qd
addInfo('route-1774025949989', { name: 'Кукольщик P1', lengthM: 15, quickdraws: 7, numberInSector: 10 })
addInfo('route-1774025989518', { name: 'Кукольщик P2', lengthM: 20, quickdraws: 9, numberInSector: 10 })

// Санаторий 6a, 15м, 6 qd
addInfo('route-1774112021075', { lengthM: 15, quickdraws: 6, numberInSector: 11 })

// Multipitch: Орион 5b/6c, 30м, 7+11 qd
addInfo('route-1774112122533', { name: 'Орион P1', lengthM: 12, quickdraws: 7, numberInSector: 12 })
addInfo('route-1774111958445', { name: 'Орион P2', lengthM: 18, quickdraws: 11, numberInSector: 12 })

// Multipitch: Экстремальная атлетика 5c/6c, 30м, 7+10 qd
addInfo('route-1774025768803', { name: 'Экстремальная атлетика P1', lengthM: 12, quickdraws: 7, numberInSector: 13 })
addInfo('route-1774025847757', { name: 'Экстремальная атлетика P2', lengthM: 18, quickdraws: 10, numberInSector: 13 })

// Multipitch: УЗПА 6b/7a, 35м, 7+9 qd
addInfo('route-1774025654857', { name: 'УЗПА P1', lengthM: 15, quickdraws: 7, numberInSector: 14 })
addInfo('route-1774025708051', { name: 'УЗПА P2', lengthM: 20, quickdraws: 9, numberInSector: 14 })
// Fix pitches count on P1 (was set to 2 by admin, but it's a single pitch since they're split)
const uzpaP1 = data.routes.find(r => r.id === 'route-1774025654857')
if (uzpaP1 && uzpaP1.pitches === 2) uzpaP1.pitches = 1

// ==========================================
// NEW SECTOR: Вечерний
// ==========================================
console.log('\n=== Сектор Вечерний (new) ===')
const vecherniySectorId = 'sector-vecherniy'

// Check if sector already exists
if (!data.sectors.find(s => s.id === vecherniySectorId)) {
  data.sectors.push({
    id: vecherniySectorId,
    areaId: 'tamgaly-tas',
    name: 'Вечерний',
    slug: 'vecherniy',
    description: null,
    latitude: 44.063,
    longitude: 76.996,
    approachDescription: null,
    approachTimeMin: null,
    approachGpsTrack: null,
    orientation: null,
    sunExposure: null,
    sortOrder: 16,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    coverImageUrl: null,
    sunFrom: null,
    sunTo: null,
  })
  console.log('  Created sector Вечерний')
}

newRoute(vecherniySectorId, 'Бесимся', '6b+', { lengthM: 28, quickdraws: 12, numberInSector: 1 })
newRoute(vecherniySectorId, 'Маргарита', '6c', { lengthM: 28, quickdraws: 13, numberInSector: 2 })
newRoute(vecherniySectorId, 'Бесогон', '7b+', { lengthM: 25, quickdraws: 10, numberInSector: 3 })
newRoute(vecherniySectorId, 'Коперник', '7a+', { lengthM: 25, quickdraws: 13, numberInSector: 4 })
newRoute(vecherniySectorId, 'Свистопляс', '7c+', { lengthM: 23, quickdraws: 10, numberInSector: 5, status: 'project' })

// ==========================================
// NEW SECTOR: За Висячим камнем
// ==========================================
console.log('\n=== Сектор За Висячим камнем (new) ===')
const zaVisyachimSectorId = 'sector-za-visyachim'

if (!data.sectors.find(s => s.id === zaVisyachimSectorId)) {
  data.sectors.push({
    id: zaVisyachimSectorId,
    areaId: 'tamgaly-tas',
    name: 'За Висячим камнем',
    slug: 'za-visyachim-kamnem',
    description: null,
    latitude: 44.063,
    longitude: 76.996,
    approachDescription: null,
    approachTimeMin: null,
    approachGpsTrack: null,
    orientation: null,
    sunExposure: null,
    sortOrder: 17,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    coverImageUrl: null,
    sunFrom: null,
    sunTo: null,
  })
  console.log('  Created sector За Висячим камнем')
}

newRoute(zaVisyachimSectorId, 'Разгар сезона', '6a', { lengthM: 10, quickdraws: 5, numberInSector: 1 })
newRoute(zaVisyachimSectorId, 'Непохожая на сны', '6b', { lengthM: 10, quickdraws: 6, numberInSector: 2 })
newRoute(zaVisyachimSectorId, 'Молодой пожарный', '7a', { lengthM: 10, quickdraws: 6, numberInSector: 3 })

// ==========================================
// Save
// ==========================================
data.version = (data.version || 160) + 1
console.log(`\nTotal: ${data.sectors.length} sectors, ${data.routes.length} routes, version ${data.version}`)
writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8')
console.log('Saved to', dataPath)
