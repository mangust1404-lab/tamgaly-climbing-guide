/**
 * Merge route data (lengthM, quickdraws, grade fixes, new routes, splits)
 * into the admin-saved topo-data.json, preserving admin's topos, topoRoutes,
 * sector structure, and all other data.
 */
import { readFileSync, writeFileSync } from 'fs'

const ADMIN_FILE = 'data/topo-data-admin.json'
const OUTPUT_FILE = 'data/topo-data.json'

const admin = JSON.parse(readFileSync(ADMIN_FILE, 'utf-8'))
const now = new Date().toISOString()

// Start from admin version
const data = { ...admin }

// Ensure areas array — include both 'tamgaly-tas' and 'tamgaly' (admin-created sectors use 'tamgaly')
if (!data.areas) data.areas = []
const areaIds = new Set(data.areas.map(a => a.id))
if (!areaIds.has('tamgaly-tas')) {
  data.areas.push({
    id: 'tamgaly-tas', name: 'Тамгалы-Тас', slug: 'tamgaly-tas',
    description: 'Скалолазный район на берегу реки Или, 120 км от Алматы',
    latitude: 44.0630, longitude: 76.9960,
  })
}
if (!areaIds.has('tamgaly')) {
  data.areas.push({
    id: 'tamgaly', name: 'Тамгалы-Тас', slug: 'tamgaly',
    description: 'Скалолазный район на берегу реки Или, 120 км от Алматы',
    latitude: 44.0630, longitude: 76.9960,
  })
}

// Deduplicate route slugs within each sector
const slugCounts = new Map()
for (const r of data.routes) {
  const key = `${r.sectorId}:${r.slug}`
  const count = slugCounts.get(key) || 0
  if (count > 0) {
    r.slug = `${r.slug}-${count}`
    console.log(`  * Dedup slug: ${r.name} → ${r.slug}`)
  }
  slugCounts.set(key, count + 1)
}

function makeSlug(name) {
  return name.toLowerCase().replace(/[^a-zа-яёәіңғүұқөһ0-9]+/gi, '-').replace(/^-|-$/g, '')
}

function gs(grade) {
  const g = grade.toLowerCase().replace(/\s/g, '')
  const map = {
    '?': 0, '4': 50, '5': 75, '5a': 80, '5a+': 85, '5b': 90, '5b+': 95, '5c': 100, '5c+': 105,
    '6a': 110, '6a+': 115, '6b': 120, '6b+': 125, '6c': 130, '6c+': 135,
    '7a': 140, '7a+': 145, '7b': 150, '7b+': 155, '7c': 160, '7c+': 165,
    '8a': 170, '8a+': 175,
  }
  return map[g] || 100
}

// Build route map by ID
const routeMap = new Map(data.routes.map(r => [r.id, r]))

// Helper: find route by name + sector
function findRoute(name, sectorId) {
  return data.routes.find(r => r.name === name && r.sectorId === sectorId)
}

let nextId = 101 // Will be recalculated
for (const r of data.routes) {
  const n = parseInt(r.id.replace('route-', ''))
  if (!isNaN(n) && n < 100000 && n >= nextId) nextId = n + 1
}

function addRoute(sectorId, name, grade, opts = {}) {
  // Check if route already exists (by name + sector)
  const existing = findRoute(name, sectorId)
  if (existing) {
    // Just update
    updateRoute(existing, { grade, ...opts })
    return existing
  }
  const id = `route-${nextId++}`
  const route = {
    id, sectorId, name, slug: makeSlug(name),
    grade, gradeSystem: 'french', gradeSort: gs(grade),
    pitches: 1, routeType: opts.routeType || 'sport',
    numberInSector: opts.num || 0,
    status: 'published', createdAt: now, updatedAt: now,
  }
  if (opts.lengthM) route.lengthM = opts.lengthM
  if (opts.quickdraws) route.quickdraws = opts.quickdraws
  data.routes.push(route)
  console.log(`  + NEW: ${name} ${grade} [${id}]`)
  return route
}

function updateRoute(route, updates) {
  if (!route) return
  const changes = []
  if (updates.name && route.name !== updates.name) {
    changes.push(`name: ${route.name} → ${updates.name}`)
    route.name = updates.name
    route.slug = makeSlug(updates.name)
  }
  if (updates.grade && updates.grade !== '?' && route.grade !== updates.grade) {
    changes.push(`grade: ${route.grade} → ${updates.grade}`)
    route.grade = updates.grade
    route.gradeSort = gs(updates.grade)
  }
  if (updates.routeType && route.routeType !== updates.routeType) {
    changes.push(`type: → ${updates.routeType}`)
    route.routeType = updates.routeType
  }
  if (updates.lengthM && !route.lengthM) {
    changes.push(`len: +${updates.lengthM}`)
    route.lengthM = updates.lengthM
  }
  if (updates.quickdraws && !route.quickdraws) {
    changes.push(`qd: +${updates.quickdraws}`)
    route.quickdraws = updates.quickdraws
  }
  if (changes.length) console.log(`  ~ UPD: ${route.name} [${route.id}]: ${changes.join(', ')}`)
}

function splitRoute(routeId, p1, p2) {
  const route = routeMap.get(routeId)
  if (!route) {
    // Try find by name
    console.log(`  ! ${routeId} not in admin version, skipping split`)
    return
  }
  // Update existing → P1
  const origName = route.name
  updateRoute(route, { name: origName + ' P1', grade: p1.grade, routeType: p1.routeType })
  if (p1.lengthM) { route.lengthM = p1.lengthM }
  if (p1.quickdraws && !route.quickdraws) { route.quickdraws = p1.quickdraws }
  route.pitches = 1
  // Add P2
  addRoute(route.sectorId, origName + ' P2', p2.grade, {
    lengthM: p2.lengthM, quickdraws: p2.quickdraws, routeType: p2.routeType || route.routeType,
  })
}

// ===== APPLY ROUTE DATA =====

// --- УТРЕННИЙ (sector already exists in admin as sector-utrenniy) ---
console.log('\n=== Утренний ===')
const utrRoutes = [
  ['Құмтышқан', '5c+', 12, 6], ['Тасбақа', '5c', 12, 7], ['Үкі', '6a', 10, 6],
  ['Түлкі', '6a', 10, 7], ['Кекілік', '5c', 10, 6], ['Жарқұс', '5a', 15, 5],
  ['Қорқау P1', '5a', 15, 5], ['Қорқау P2', '5b', 25, 11], ['Қарлығаш', '5c', 15, 7],
]
utrRoutes.forEach(([n, g, l, q], i) => addRoute('sector-utrenniy', n, g, { lengthM: l, quickdraws: q, num: i+1 }))

// --- ВИСЯЧИЙ КАМЕНЬ ---
console.log('\n=== Висячий Камень ===')
splitRoute('route-22', { grade: '6a', lengthM: 25, quickdraws: 8 }, { grade: '5b+', lengthM: 18, quickdraws: 7 })
splitRoute('route-23', { grade: '5b', lengthM: 25, quickdraws: 10 }, { grade: '5c', lengthM: 20, quickdraws: 7 })
splitRoute('route-24', { grade: '6c', lengthM: 20, quickdraws: 8 }, { grade: '6b+', lengthM: 15, quickdraws: 6 })

// --- ЯБЛОКИ ---
console.log('\n=== Яблоки ===')
updateRoute(routeMap.get('route-29'), { lengthM: 12, quickdraws: 5 })
updateRoute(routeMap.get('route-30'), { lengthM: 10, quickdraws: 5 })
updateRoute(routeMap.get('route-31'), { lengthM: 20 })
splitRoute('route-32', { grade: '6a', lengthM: 20, quickdraws: 12 }, { grade: '5c', lengthM: 15, quickdraws: 8 })
updateRoute(routeMap.get('route-33'), { grade: '5c', lengthM: 20, quickdraws: 9 })
updateRoute(routeMap.get('route-34'), { lengthM: 20, quickdraws: 10 })
splitRoute('route-35', { grade: '5a', lengthM: 18, quickdraws: 7 }, { grade: '5b', lengthM: 15, quickdraws: 8 })
updateRoute(routeMap.get('route-36'), { lengthM: 18, quickdraws: 9 })
updateRoute(routeMap.get('route-37'), { lengthM: 18, quickdraws: 10 })
updateRoute(routeMap.get('route-38'), { name: 'Не ищи сову!' })
updateRoute(routeMap.get('route-39'), { name: 'Печенька', lengthM: 17, quickdraws: 8 })
updateRoute(routeMap.get('route-40'), { lengthM: 17, quickdraws: 7 })
updateRoute(routeMap.get('route-41'), { lengthM: 18, quickdraws: 8 })
updateRoute(routeMap.get('route-42'), { name: 'Напугай сову!', lengthM: 18 })
updateRoute(routeMap.get('route-43'), { name: 'Найди сову!', lengthM: 20 })

// --- ЗУБ ---
console.log('\n=== Зуб ===')
updateRoute(routeMap.get('route-44'), { lengthM: 20, quickdraws: 9 })
updateRoute(routeMap.get('route-45'), { lengthM: 20, quickdraws: 9 })
updateRoute(routeMap.get('route-46'), { lengthM: 25, quickdraws: 10 })
updateRoute(routeMap.get('route-47'), { lengthM: 25, quickdraws: 11 })

// --- БИБЛИОТЕКА ---
console.log('\n=== Библиотека ===')
updateRoute(routeMap.get('route-52'), { lengthM: 18, routeType: 'trad' })
updateRoute(routeMap.get('route-53'), { lengthM: 15, quickdraws: 7 })
updateRoute(routeMap.get('route-54'), { lengthM: 20, routeType: 'trad' })
updateRoute(routeMap.get('route-55'), { routeType: 'trad' })
updateRoute(routeMap.get('route-56'), { name: 'Мы', lengthM: 15, quickdraws: 5 })
updateRoute(routeMap.get('route-57'), { lengthM: 15, quickdraws: 5 })
updateRoute(routeMap.get('route-58'), { lengthM: 15, quickdraws: 5 })
updateRoute(routeMap.get('route-59'), { name: 'Планета людей', lengthM: 17, quickdraws: 7 })
updateRoute(routeMap.get('route-60'), { lengthM: 15, quickdraws: 8 })
updateRoute(routeMap.get('route-61'), { lengthM: 15, quickdraws: 6 })

// --- ПРИГОРОД ---
console.log('\n=== Пригород ===')
updateRoute(routeMap.get('route-62'), { lengthM: 15, quickdraws: 7 })
updateRoute(routeMap.get('route-63'), { lengthM: 13 })
updateRoute(routeMap.get('route-64'), { grade: '6a+', lengthM: 20 })
updateRoute(routeMap.get('route-66'), { lengthM: 24, quickdraws: 13 })
updateRoute(routeMap.get('route-67'), { lengthM: 26, quickdraws: 13 })
updateRoute(routeMap.get('route-68'), { grade: '7a+', lengthM: 24, quickdraws: 12 })

// --- ГОРОД ---
console.log('\n=== Город ===')
splitRoute('route-71', { grade: '6b', lengthM: 23, quickdraws: 10 }, { grade: '7a', lengthM: 25, quickdraws: 13 })
// Отдельная реальность: admin already split — route-1774024865928 is P1 (6a), route-72 is P2 (6c)
updateRoute(routeMap.get('route-1774024865928'), { name: 'Отдельная реальность P1', lengthM: 27, quickdraws: 10 })
updateRoute(routeMap.get('route-72'), { name: 'Отдельная реальность P2', lengthM: 25, quickdraws: 12 })
splitRoute('route-73', { grade: '6c', lengthM: 30, quickdraws: 10 }, { grade: '7a+', lengthM: 25, quickdraws: 9 })
splitRoute('route-75', { grade: '7a+', lengthM: 25, quickdraws: 13 }, { grade: '7b', lengthM: 25, quickdraws: 14 })
splitRoute('route-76', { grade: '6b+', lengthM: 25, quickdraws: 11 }, { grade: '6b', lengthM: 20, quickdraws: 10 })
updateRoute(routeMap.get('route-77'), { routeType: 'trad', lengthM: 40 })

// --- СЕРПЫ ---
console.log('\n=== Серпы ===')
updateRoute(routeMap.get('route-78'), { lengthM: 35 })
updateRoute(routeMap.get('route-79'), { lengthM: 25, quickdraws: 11 })
addRoute('sector-serpy', 'Серп', '6b', { lengthM: 25, routeType: 'trad' })
updateRoute(routeMap.get('route-80'), { lengthM: 30, quickdraws: 17 })
updateRoute(routeMap.get('route-81'), { routeType: 'trad', lengthM: 40 })
updateRoute(routeMap.get('route-82'), { lengthM: 35, quickdraws: 15 })

// --- БАСТИОН (admin has combined "Бастион и Карнизы") ---
console.log('\n=== Бастион ===')
updateRoute(routeMap.get('route-83'), { lengthM: 30 })
updateRoute(routeMap.get('route-84'), { lengthM: 20, quickdraws: 10 })
updateRoute(routeMap.get('route-85'), { lengthM: 20, quickdraws: 14 })
updateRoute(routeMap.get('route-86'), { lengthM: 22, quickdraws: 14 })
updateRoute(routeMap.get('route-87'), { lengthM: 22, quickdraws: 8 })
updateRoute(routeMap.get('route-88'), { lengthM: 18, quickdraws: 6 })
updateRoute(routeMap.get('route-89'), { lengthM: 18 })
updateRoute(routeMap.get('route-90'), { name: 'Семя', lengthM: 15, quickdraws: 7 })
updateRoute(routeMap.get('route-91'), { lengthM: 15, quickdraws: 7 })
updateRoute(routeMap.get('route-92'), { lengthM: 15, quickdraws: 7 })
updateRoute(routeMap.get('route-93'), { lengthM: 15, quickdraws: 6 })
updateRoute(routeMap.get('route-94'), { lengthM: 15, quickdraws: 7 })
updateRoute(routeMap.get('route-95'), { name: 'Надька', lengthM: 15, quickdraws: 6 })
updateRoute(routeMap.get('route-96'), { lengthM: 15, quickdraws: 6 })

// Карнизы routes (admin combined Бастион+Карнизы as sector-bastion)
const bastionId = data.sectors.find(s => s.name.includes('Бастион'))?.id || 'sector-bastion'
// От винта — admin already has route-1774026875847 "От винта" 6a+ (P1), just add P2
updateRoute(routeMap.get('route-1774026875847'), { name: 'От винта P1', quickdraws: 14 })
addRoute(bastionId, 'От винта P2', '7c+', { quickdraws: 14 })
addRoute(bastionId, 'Осень', '6a', { lengthM: 25, routeType: 'trad' })
addRoute(bastionId, 'Хозяйка', '6b+', { lengthM: 25, routeType: 'trad' })
addRoute(bastionId, 'Посошок', '6b+', { lengthM: 25, routeType: 'trad' })
// Пляши в огне! — 2 pitches
addRoute(bastionId, 'Пляши в огне! P1', '6c', { quickdraws: 14 })
addRoute(bastionId, 'Пляши в огне! P2', '8a+', { quickdraws: 14 })
// Пашкина щель
addRoute(bastionId, 'Пашкина щель', '6a', { lengthM: 30, routeType: 'trad' })
// Три щели — 3 pitches
addRoute(bastionId, 'Три щели P1', '6a+', { lengthM: 15, routeType: 'trad' })
addRoute(bastionId, 'Три щели P2', '6a+', { lengthM: 12, routeType: 'trad' })
addRoute(bastionId, 'Три щели P3', '6a+', { lengthM: 25, routeType: 'trad' })

// --- ЗАМАНКА ---
console.log('\n=== Заманка ===')
updateRoute(routeMap.get('route-14'), { lengthM: 15, quickdraws: 8 })
updateRoute(routeMap.get('route-15'), { lengthM: 15, quickdraws: 8 })
updateRoute(routeMap.get('route-16'), { lengthM: 12, quickdraws: 7 })
updateRoute(routeMap.get('route-17'), { grade: '6c', lengthM: 13, quickdraws: 8 })
updateRoute(routeMap.get('route-18'), { lengthM: 13, quickdraws: 8 })
updateRoute(routeMap.get('route-1773462586738'), { lengthM: 12, quickdraws: 8 })
updateRoute(routeMap.get('route-19'), { lengthM: 10, quickdraws: 5 })
updateRoute(routeMap.get('route-20'), { lengthM: 10, quickdraws: 5 })
updateRoute(routeMap.get('route-21'), { lengthM: 10, quickdraws: 6 })

// --- КАНЬОН (admin sectorId = sector-1774116505503) ---
console.log('\n=== Каньон ===')
const kanyonSectorId = data.sectors.find(s => s.name === 'Каньон')?.id
if (kanyonSectorId) {
  const kr = [
    ['Плесень','?'], ['Детский мир','5'], ['Солнечный зайчик','?'], ['Хорошо','?'],
    ['Зоопарк','?'], ['Государство','?'], ['Сияние','5b'], ['Винтовка','6b'],
    ['Мимикрия','6a'], ['Вечная весна','6b+'], ['Офелия','5c'], ['Малиновая девочка','5b'],
    ['Липовый мёд','?'],
  ]
  kr.forEach(([n, g], i) => addRoute(kanyonSectorId, n, g, { num: i+1 }))
}

// --- САЛҚЫН (admin sectorId = sector-салкын-...) ---
console.log('\n=== Салқын ===')
const salkynSectorId = data.sectors.find(s => s.name.trim() === 'Салқын')?.id
if (salkynSectorId) {
  const sr = [
    ['Мысықтын қадамы','6b'], ['Балық дауысы','6c'], ['Әйел сақалы','6c'],
    ['Тау тамыры','7a'], ['Құс сілекейі','7b'], ['Аю көктамыры','7a'],
  ]
  sr.forEach(([n, g], i) => addRoute(salkynSectorId, n, g, { num: i+1 }))
}

// --- ЛЕВ ---
console.log('\n=== Лев ===')
const razminkaRoute = data.routes.find(r => r.name === 'Разминка' && r.sectorId === 'sector-lev')
if (razminkaRoute) updateRoute(razminkaRoute, { grade: '7b' })
addRoute('sector-lev', 'Немейский лев', '6a')
addRoute('sector-lev', 'Сфинкс', '6b')

// Bump version
data.version = (admin.version || 0) + 1

writeFileSync(OUTPUT_FILE, JSON.stringify(data))
console.log(`\nDone! Version: ${data.version}, Routes: ${data.routes.length}, Sectors: ${data.sectors.length}`)
console.log(`Topos: ${data.topos?.length}, TopoRoutes: ${data.topoRoutes?.length}`)
