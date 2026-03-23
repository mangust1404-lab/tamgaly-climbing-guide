/**
 * Add route data from guidebook text to topo-data.json
 * - Adds new routes with name, grade, lengthM, quickdraws
 * - Splits multipitch routes into separate P1/P2 routes
 * - Updates existing routes: lengthM/quickdraws only if not already set
 * - Updates grades, names, routeType from authoritative guidebook data
 */
import { readFileSync, writeFileSync } from 'fs'

const FILE = 'data/topo-data.json'
const data = JSON.parse(readFileSync(FILE, 'utf-8'))

let nextId = 101 // max existing numeric ID is 100
const now = new Date().toISOString()

function makeSlug(name) {
  return name.toLowerCase()
    .replace(/[^a-zа-яёәіңғүұқөһ0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
}

function gradeSort(grade) {
  const g = grade.toLowerCase().replace(/\s/g, '')
  const map = {
    '4': 50, '4a': 55, '4b': 60, '4c': 65,
    '5a': 80, '5a+': 85, '5b': 90, '5b+': 95, '5c': 100, '5c+': 105,
    '6a': 110, '6a+': 115, '6b': 120, '6b+': 125, '6c': 130, '6c+': 135,
    '7a': 140, '7a+': 145, '7b': 150, '7b+': 155, '7c': 160, '7c+': 165,
    '8a': 170, '8a+': 175, '8b': 180,
  }
  return map[g] || 100
}

function findRoute(name) {
  return data.routes.find(r => r.name === name)
}

function findRouteById(id) {
  return data.routes.find(r => r.id === id)
}

function addRoute(sectorId, name, grade, opts = {}) {
  const id = `route-${nextId++}`
  const route = {
    id,
    sectorId,
    name,
    slug: makeSlug(name),
    grade,
    gradeSystem: 'french',
    gradeSort: gradeSort(grade),
    pitches: 1,
    routeType: opts.routeType || 'sport',
    numberInSector: opts.numberInSector || 0,
    status: 'published',
    createdAt: now,
    updatedAt: now,
  }
  if (opts.lengthM) route.lengthM = opts.lengthM
  if (opts.quickdraws) route.quickdraws = opts.quickdraws
  data.routes.push(route)
  console.log(`  + NEW ${name} ${grade} [${id}]`)
  return route
}

function updateRoute(route, updates) {
  const changes = []
  if (updates.name && route.name !== updates.name) {
    changes.push(`name: ${route.name} → ${updates.name}`)
    route.name = updates.name
    route.slug = makeSlug(updates.name)
  }
  if (updates.grade && route.grade !== updates.grade) {
    changes.push(`grade: ${route.grade} → ${updates.grade}`)
    route.grade = updates.grade
    route.gradeSort = gradeSort(updates.grade)
  }
  if (updates.routeType && route.routeType !== updates.routeType) {
    changes.push(`type: ${route.routeType} → ${updates.routeType}`)
    route.routeType = updates.routeType
  }
  // Only add lengthM/quickdraws if not already set
  if (updates.lengthM && !route.lengthM) {
    changes.push(`lengthM: +${updates.lengthM}`)
    route.lengthM = updates.lengthM
  }
  if (updates.quickdraws && !route.quickdraws) {
    changes.push(`quickdraws: +${updates.quickdraws}`)
    route.quickdraws = updates.quickdraws
  }
  if (updates.pitches !== undefined) route.pitches = updates.pitches
  route.updatedAt = now
  if (changes.length) console.log(`  ~ UPD ${route.name} ${route.grade} [${route.id}]: ${changes.join(', ')}`)
}

function splitMultipitch(routeId, p1, p2) {
  const route = findRouteById(routeId)
  if (!route) { console.error(`  ! Route ${routeId} not found`); return }
  // Update existing to P1
  updateRoute(route, {
    name: route.name + ' P1',
    grade: p1.grade,
    lengthM: p1.lengthM,
    quickdraws: p1.quickdraws,
    pitches: 1,
    routeType: p1.routeType,
  })
  // For lengthM on split: clear old combined length
  if (route.lengthM && p1.lengthM && route.lengthM !== p1.lengthM) {
    route.lengthM = p1.lengthM
  }
  // Add P2
  return addRoute(route.sectorId, route.name.replace(' P1', ' P2'), p2.grade, {
    lengthM: p2.lengthM,
    quickdraws: p2.quickdraws,
    routeType: p2.routeType || route.routeType,
    numberInSector: (route.numberInSector || 0) + 0.5,
  })
}

// ==========================================
// 1. УТРЕННИЙ — create sector + 9 new routes
// ==========================================
console.log('\n=== Утренний ===')
data.sectors.push({
  id: 'sector-utrenniy',
  areaId: 'tamgaly-tas',
  name: 'Утренний',
  slug: 'utrenniy',
  description: null,
  latitude: 0,
  longitude: 0,
  orientation: 'Юго-восток',
  sunExposure: null,
  sortOrder: 16,
  approachDescription: null,
  approachTimeMin: null,
  createdAt: now,
  updatedAt: now,
})
console.log('  + NEW sector Утренний')

const utrRoutes = [
  ['Құмтышқан', '5c+', 12, 6],
  ['Тасбақа', '5c', 12, 7],
  ['Үкі', '6a', 10, 6],
  ['Түлкі', '6a', 10, 7],
  ['Кекілік', '5c', 10, 6],
  ['Жарқұс', '5a', 15, 5],
  ['Қорқау P1', '5a', 15, 5],
  ['Қорқау P2', '5b', 25, 11],
  ['Қарлығаш', '5c', 15, 7],
]
utrRoutes.forEach(([name, grade, len, qd], i) => {
  addRoute('sector-utrenniy', name, grade, { lengthM: len, quickdraws: qd, numberInSector: i + 1 })
})

// ==========================================
// 2. ВИСЯЧИЙ КАМЕНЬ — split 3 multipitch into 6
// ==========================================
console.log('\n=== Висячий Камень ===')
splitMultipitch('route-22', // Тоторо
  { grade: '6a', lengthM: 25, quickdraws: 8 },
  { grade: '5b+', lengthM: 18, quickdraws: 7 },
)
splitMultipitch('route-23', // Хаул
  { grade: '5b', lengthM: 25, quickdraws: 10 },
  { grade: '5c', lengthM: 20, quickdraws: 7 },
)
splitMultipitch('route-24', // Навсикая
  { grade: '6c', lengthM: 20, quickdraws: 8 },
  { grade: '6b+', lengthM: 15, quickdraws: 6 },
)

// ==========================================
// 3. ЯБЛОКИ — update existing + split Блин, Мороженое
// ==========================================
console.log('\n=== Яблоки ===')
updateRoute(findRouteById('route-29'), { lengthM: 12, quickdraws: 5 }) // Ватрушка
updateRoute(findRouteById('route-30'), { lengthM: 10, quickdraws: 5 }) // Дамские пальчики
updateRoute(findRouteById('route-31'), { lengthM: 20 }) // Шарлотка

// Блин → split P1/P2
splitMultipitch('route-32',
  { grade: '6a', lengthM: 20, quickdraws: 12 },
  { grade: '5c', lengthM: 15, quickdraws: 8 },
)

updateRoute(findRouteById('route-33'), { grade: '5c', lengthM: 20, quickdraws: 9 }) // Бублик
updateRoute(findRouteById('route-34'), { lengthM: 20, quickdraws: 10 }) // Трубочки с кремом

// Мороженое → split P1/P2
splitMultipitch('route-35',
  { grade: '5a', lengthM: 18, quickdraws: 7 },
  { grade: '5b', lengthM: 15, quickdraws: 8 },
)

updateRoute(findRouteById('route-36'), { lengthM: 18, quickdraws: 9 }) // Пирожное
updateRoute(findRouteById('route-37'), { lengthM: 18, quickdraws: 10 }) // Торт
// Не ищи сову — no length/qd data from user
updateRoute(findRouteById('route-38'), { name: 'Не ищи сову!' }) // add "!"
updateRoute(findRouteById('route-39'), { name: 'Печенька', lengthM: 17, quickdraws: 8 })
updateRoute(findRouteById('route-40'), { lengthM: 17, quickdraws: 7 }) // Незавершённый гештальт
updateRoute(findRouteById('route-41'), { lengthM: 18, quickdraws: 8 }) // Булочка
updateRoute(findRouteById('route-42'), { name: 'Напугай сову!', lengthM: 18 })
updateRoute(findRouteById('route-43'), { name: 'Найди сову!', lengthM: 20 })

// ==========================================
// 4. ЗУБ — update existing
// ==========================================
console.log('\n=== Зуб ===')
updateRoute(findRouteById('route-44'), { lengthM: 20, quickdraws: 9 }) // Мудрости
updateRoute(findRouteById('route-45'), { lengthM: 20, quickdraws: 9 }) // Выпавший
updateRoute(findRouteById('route-46'), { lengthM: 25, quickdraws: 10 }) // Коренной
updateRoute(findRouteById('route-47'), { lengthM: 25, quickdraws: 11 }) // Молочный

// ==========================================
// 5. БИБЛИОТЕКА — update existing + fix names
// ==========================================
console.log('\n=== Библиотека ===')
updateRoute(findRouteById('route-52'), { lengthM: 18, routeType: 'trad' }) // Иностранка
updateRoute(findRouteById('route-53'), { lengthM: 15, quickdraws: 7 }) // Почтамт
updateRoute(findRouteById('route-54'), { lengthM: 20, routeType: 'trad' }) // Гриб (лев)
updateRoute(findRouteById('route-55'), { routeType: 'trad' }) // Гриб (прав)
updateRoute(findRouteById('route-56'), { name: 'Мы', lengthM: 15, quickdraws: 5 })
updateRoute(findRouteById('route-57'), { lengthM: 15, quickdraws: 5 }) // Теория времени
updateRoute(findRouteById('route-58'), { lengthM: 15, quickdraws: 5 }) // Архипелаг
updateRoute(findRouteById('route-59'), { name: 'Планета людей', lengthM: 17, quickdraws: 7 })
updateRoute(findRouteById('route-60'), { lengthM: 15, quickdraws: 8 }) // На дороге
updateRoute(findRouteById('route-61'), { lengthM: 15, quickdraws: 6 }) // Ремесло

// ==========================================
// 6. ПРИГОРОД — update existing
// ==========================================
console.log('\n=== Пригород ===')
updateRoute(findRouteById('route-62'), { lengthM: 15, quickdraws: 7 }) // Сюрприз #2
updateRoute(findRouteById('route-63'), { lengthM: 13 }) // Щель страха
updateRoute(findRouteById('route-64'), { grade: '6a+', lengthM: 20 }) // Щель боли
updateRoute(findRouteById('route-66'), { lengthM: 24, quickdraws: 13 }) // Мескалито
updateRoute(findRouteById('route-67'), { lengthM: 26, quickdraws: 13 }) // Сюрприз
updateRoute(findRouteById('route-68'), { grade: '7a+', lengthM: 24, quickdraws: 12 }) // Нагваль

// ==========================================
// 7. ГОРОД — split multipitch + update single routes
// ==========================================
console.log('\n=== Город ===')
// Щель Ратмира, Щель с птицами — leave as is (trad, no clear pitch data)

splitMultipitch('route-71', // Сила безмолвия
  { grade: '6b', lengthM: 23, quickdraws: 10 },
  { grade: '7a', lengthM: 25, quickdraws: 13 },
)
splitMultipitch('route-72', // Отдельная реальность
  { grade: '6a', lengthM: 27, quickdraws: 10 },
  { grade: '6c', lengthM: 25, quickdraws: 12 },
)
splitMultipitch('route-73', // Огонь изнутри
  { grade: '6c', lengthM: 30, quickdraws: 10 },
  { grade: '7a+', lengthM: 25, quickdraws: 9 },
)
splitMultipitch('route-75', // Сказки о силе
  { grade: '7a+', lengthM: 25, quickdraws: 13 },
  { grade: '7b', lengthM: 25, quickdraws: 14 },
)
splitMultipitch('route-76', // Колесо времени
  { grade: '6b+', lengthM: 25, quickdraws: 11 },
  { grade: '6b', lengthM: 20, quickdraws: 10 },
)
// Щель ярости — trad, add length
updateRoute(findRouteById('route-77'), { routeType: 'trad', lengthM: 40 })

// ==========================================
// 8. СЕРПЫ — update existing + add Серп
// ==========================================
console.log('\n=== Серпы ===')
updateRoute(findRouteById('route-78'), { lengthM: 35 }) // Червяк
updateRoute(findRouteById('route-79'), { lengthM: 25, quickdraws: 11 }) // Малый серп
// Add new route: Серп
addRoute('sector-serpy', 'Серп', '6b', { lengthM: 25, routeType: 'trad', numberInSector: 2.5 })
updateRoute(findRouteById('route-80'), { lengthM: 30, quickdraws: 17 }) // Белый подтёк
updateRoute(findRouteById('route-81'), { routeType: 'trad', lengthM: 40 }) // Щель с ласточками
updateRoute(findRouteById('route-82'), { lengthM: 35, quickdraws: 15 }) // Гнёзда

// ==========================================
// 9. БАСТИОН — update existing + fix names
// ==========================================
console.log('\n=== Бастион ===')
updateRoute(findRouteById('route-83'), { lengthM: 30 }) // Слева от бастиона
updateRoute(findRouteById('route-84'), { lengthM: 20, quickdraws: 10 }) // Подвиг разведчика
updateRoute(findRouteById('route-85'), { lengthM: 20, quickdraws: 14 }) // Грибоедовский вальс
updateRoute(findRouteById('route-86'), { lengthM: 22, quickdraws: 14 }) // Прямая дорога
updateRoute(findRouteById('route-87'), { lengthM: 22, quickdraws: 8 }) // Поезд
updateRoute(findRouteById('route-88'), { lengthM: 18, quickdraws: 6 }) // Искры
updateRoute(findRouteById('route-89'), { lengthM: 18 }) // Шишки
updateRoute(findRouteById('route-90'), { name: 'Семя', lengthM: 15, quickdraws: 7 })
updateRoute(findRouteById('route-91'), { lengthM: 15, quickdraws: 7 }) // Палата номер шесть
updateRoute(findRouteById('route-92'), { lengthM: 15, quickdraws: 7 }) // Лихо
updateRoute(findRouteById('route-93'), { lengthM: 15, quickdraws: 6 }) // Время колокольчиков
updateRoute(findRouteById('route-94'), { lengthM: 15, quickdraws: 7 }) // Верка
updateRoute(findRouteById('route-95'), { name: 'Надька', lengthM: 15, quickdraws: 6 })
updateRoute(findRouteById('route-96'), { lengthM: 15, quickdraws: 6 }) // Любка

// ==========================================
// 10. КАРНИЗЫ — split multipitch + add new trad routes
// ==========================================
console.log('\n=== Карнизы ===')

// От винта! → split P1/P2
splitMultipitch('route-97',
  { grade: '6a+', quickdraws: 14 },
  { grade: '7c+', quickdraws: 14 },
)

// Add new trad routes
addRoute('sector-karnizy', 'Осень', '6a', { lengthM: 25, routeType: 'trad', numberInSector: 5 })
addRoute('sector-karnizy', 'Хозяйка', '6b+', { lengthM: 25, routeType: 'trad', numberInSector: 6 })
addRoute('sector-karnizy', 'Посошок', '6b+', { lengthM: 25, routeType: 'trad', numberInSector: 7 })

// Пляши в огне! → split P1/P2
splitMultipitch('route-98',
  { grade: '6c', quickdraws: 14 },
  { grade: '8a+', quickdraws: 14 },
)

// Пашкина щель — add lengthM for P2 section
updateRoute(findRouteById('route-99'), { lengthM: 30 })

// Три щели → split into P1, P2, P3
const triRoute = findRouteById('route-100')
updateRoute(triRoute, { name: 'Три щели P1', lengthM: 15 })
addRoute('sector-karnizy', 'Три щели P2', '6a+', { lengthM: 12, routeType: 'trad', numberInSector: 11 })
addRoute('sector-karnizy', 'Три щели P3', '6a+', { lengthM: 25, routeType: 'trad', numberInSector: 12 })

// ==========================================
// 11. ЗАМАНКА — update existing
// ==========================================
console.log('\n=== Заманка ===')
updateRoute(findRouteById('route-14'), { lengthM: 15, quickdraws: 8 }) // Дина
updateRoute(findRouteById('route-15'), { lengthM: 15, quickdraws: 8 }) // Алиса
updateRoute(findRouteById('route-16'), { lengthM: 12, quickdraws: 7 }) // Бармаглот
updateRoute(findRouteById('route-17'), { grade: '6c', lengthM: 13, quickdraws: 8 }) // Чеширский кот (was 7a → 6c)
updateRoute(findRouteById('route-18'), { lengthM: 13, quickdraws: 8 }) // Синяя Гусеница
updateRoute(findRouteById('route-1773462586738'), { lengthM: 12, quickdraws: 8 }) // Съешь меня
updateRoute(findRouteById('route-19'), { lengthM: 10, quickdraws: 5 }) // Соня
updateRoute(findRouteById('route-20'), { lengthM: 10, quickdraws: 5 }) // Мартовский заяц
updateRoute(findRouteById('route-21'), { lengthM: 10, quickdraws: 6 }) // Безумный Шляпник

// ==========================================
// Reassign numberInSector per sector (sort by existing number, then assign sequential)
// ==========================================
console.log('\n=== Reassigning numberInSector ===')
const sectorIds = [...new Set(data.routes.map(r => r.sectorId))]
for (const sid of sectorIds) {
  const routes = data.routes.filter(r => r.sectorId === sid)
  routes.sort((a, b) => (a.numberInSector || 999) - (b.numberInSector || 999))
  routes.forEach((r, i) => { r.numberInSector = i + 1 })
}

// Bump version
data.version = (data.version || 0) + 1

// Write
writeFileSync(FILE, JSON.stringify(data))
console.log(`\nDone! Version: ${data.version}, Total routes: ${data.routes.length}`)
