/**
 * Add Каньон, Салқын sectors and update Лев routes
 */
import { readFileSync, writeFileSync } from 'fs'

const FILE = 'data/topo-data.json'
const data = JSON.parse(readFileSync(FILE, 'utf-8'))

// Find max numeric route ID
const maxId = Math.max(...data.routes.map(r => {
  const n = parseInt(r.id.replace('route-', ''))
  return isNaN(n) || n > 100000 ? 0 : n
}))
let nextId = maxId + 1
const now = new Date().toISOString()

function makeSlug(name) {
  return name.toLowerCase().replace(/[^a-zа-яёәіңғүұқөһ0-9]+/gi, '-').replace(/^-|-$/g, '')
}

function gradeSort(grade) {
  const g = grade.toLowerCase().replace(/\s/g, '')
  const map = {
    '4': 50, '4a': 55, '4b': 60, '4c': 65, '5': 75,
    '5a': 80, '5a+': 85, '5b': 90, '5b+': 95, '5c': 100, '5c+': 105,
    '6a': 110, '6a+': 115, '6b': 120, '6b+': 125, '6c': 130, '6c+': 135,
    '7a': 140, '7a+': 145, '7b': 150, '7b+': 155, '7c': 160, '7c+': 165,
    '8a': 170, '8a+': 175,
  }
  return map[g] || 100
}

function addRoute(sectorId, name, grade, opts = {}) {
  const id = `route-${nextId++}`
  const route = {
    id, sectorId, name, slug: makeSlug(name),
    grade, gradeSystem: 'french', gradeSort: gradeSort(grade),
    pitches: 1, routeType: opts.routeType || 'sport',
    numberInSector: opts.num || 0,
    status: 'published', createdAt: now, updatedAt: now,
  }
  if (opts.lengthM) route.lengthM = opts.lengthM
  if (opts.quickdraws) route.quickdraws = opts.quickdraws
  data.routes.push(route)
  console.log(`  + ${name} ${grade} [${id}]`)
}

// ==========================================
// КАНЬОН — new sector + routes
// ==========================================
console.log('\n=== Каньон ===')
data.sectors.push({
  id: 'sector-kanyon', areaId: 'tamgaly-tas', name: 'Каньон', slug: 'kanyon',
  description: null, latitude: 0, longitude: 0,
  orientation: null, sunExposure: null, sortOrder: 17,
  createdAt: now, updatedAt: now,
})

const kanyonRoutes = [
  ['Плесень', '?'],
  ['Детский мир', '5'],
  ['Солнечный зайчик', '?'],
  ['Хорошо', '?'],
  ['Зоопарк', '?'],
  ['Государство', '?'],
  ['Сияние', '5b'],
  ['Винтовка', '6b'],
  ['Мимикрия', '6a'],
  ['Вечная весна', '6b+'],
  ['Офелия', '5c'],
  ['Малиновая девочка', '5b'],
  ['Липовый мёд', '?'],
]
kanyonRoutes.forEach(([name, grade], i) => {
  addRoute('sector-kanyon', name, grade, { num: i + 1 })
})

// ==========================================
// САЛҚЫН — new sector + routes
// ==========================================
console.log('\n=== Салқын ===')
data.sectors.push({
  id: 'sector-salkyn', areaId: 'tamgaly-tas', name: 'Салқын', slug: 'salkyn',
  description: null, latitude: 0, longitude: 0,
  orientation: null, sunExposure: null, sortOrder: 18,
  createdAt: now, updatedAt: now,
})

const salkynRoutes = [
  ['Мысықтын қадамы', '6b'],
  ['Балық дауысы', '6c'],
  ['Әйел сақалы', '6c'],
  ['Тау тамыры', '7a'],
  ['Құс сілекейі', '7b'],
  ['Аю көктамыры', '7a'],
]
salkynRoutes.forEach(([name, grade], i) => {
  addRoute('sector-salkyn', name, grade, { num: i + 1 })
})

// ==========================================
// ЛЕВ — update Разминка grade, add 2 new routes
// ==========================================
console.log('\n=== Лев ===')
const razminkaRoute = data.routes.find(r => r.name === 'Разминка' && r.sectorId === 'sector-lev')
if (razminkaRoute) {
  console.log(`  ~ Разминка grade: ${razminkaRoute.grade} → 7b`)
  razminkaRoute.grade = '7b'
  razminkaRoute.gradeSort = gradeSort('7b')
  razminkaRoute.updatedAt = now
}

// Add new routes
const levRoutes = data.routes.filter(r => r.sectorId === 'sector-lev')
const maxLevNum = Math.max(...levRoutes.map(r => r.numberInSector || 0), 0)
addRoute('sector-lev', 'Немейский лев', '6a', { num: maxLevNum + 1 })
addRoute('sector-lev', 'Сфинкс', '6b', { num: maxLevNum + 2 })

// Bump version
data.version = (data.version || 0) + 1
writeFileSync(FILE, JSON.stringify(data))
console.log(`\nDone! Version: ${data.version}, Total routes: ${data.routes.length}`)
