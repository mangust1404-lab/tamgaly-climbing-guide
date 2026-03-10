import { db } from './schema'
import type { Area, Sector, Route } from './schema'

/**
 * Real Tamgaly-Tas route data (101 routes, 15 sectors).
 * Sources: alatau.guide, theCrag.
 */

const GRADE_SORT: Record<string, number> = {
  '4': 30, '4a': 40, '4b': 50, '4c': 60,
  '5a': 70, '5a+': 75, '5b': 85, '5b+': 90, '5c': 100, '5c+': 105,
  '6a': 120, '6a+': 135, '6b': 150, '6b+': 170, '6c': 190, '6c+': 210,
  '7a': 240, '7a+': 270, '7b': 300, '7b+': 340, '7c': 380, '7c+': 420,
  '8a': 470, '8a+': 520,
}

function gs(grade: string): number {
  return GRADE_SORT[grade.toLowerCase()] || 0
}

function slug(text: string): string {
  return text.toLowerCase()
    .replace(/[а-яё]/g, (ch) => {
      const m: Record<string, string> = {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo',
        'ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m',
        'н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u',
        'ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch',
        'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
      }
      return m[ch] || ch
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

let routeCounter = 0
function rt(sectorId: string, name: string, grade: string, type: 'sport' | 'trad' | 'multi-pitch' = 'sport', lengthM?: number, pitches = 1): Route {
  routeCounter++
  return {
    id: `route-${routeCounter}`,
    sectorId,
    name,
    slug: slug(name),
    grade,
    gradeSystem: 'french',
    gradeSort: gs(grade),
    lengthM,
    pitches,
    routeType: type,
    numberInSector: 0,
    status: 'published',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function numberRoutes(routes: Route[]) {
  routes.forEach((r, i) => { r.numberInSector = i + 1 })
  return routes
}

const SEED_VERSION = 5 // bump to force re-seed (GPS from field KMZ)

export async function seedDemoData() {
  // Check seed version — if old data exists, wipe and re-seed
  const meta = await db.syncMeta.get('seedVersion')
  if (meta?.value === String(SEED_VERSION)) return

  // Preserve admin-created sectors and routes (those with timestamp suffix IDs)
  const existingSectors = await db.sectors.toArray()
  const existingRoutes = await db.routes.toArray()
  const adminSectors = existingSectors.filter(s => /\-\d{10,}$/.test(s.id))
  const adminRoutes = existingRoutes.filter(r => /\-\d{10,}$/.test(r.id))

  // Clear seed data but preserve admin-created content
  await db.transaction('rw', [db.areas, db.sectors, db.routes, db.syncMeta], async () => {
    await db.areas.clear()
    await db.sectors.clear()
    await db.routes.clear()
  })

  routeCounter = 0

  const area: Area = {
    id: 'tamgaly-tas',
    name: 'Тамгалы-Тас',
    slug: 'tamgaly-tas',
    description: 'Скалолазный район на берегу реки Или, 120 км от Алматы. Туф (вулканическая порода), ~200 маршрутов от 4 до 8a+. Сезон: март—май, сентябрь—ноябрь.',
    latitude: 44.0640918,
    longitude: 76.9961879,
    bboxNorth: 44.072, bboxSouth: 44.058, bboxEast: 77.000, bboxWest: 76.990,
    approachInfo: 'От Алматы ~1.5—2 часа на машине на север через Капчагай. Вход в урочище: 44.0641, 76.9962.',
    accessNotes: 'Летом слишком жарко. Лучший сезон — весна и осень.',
    rockType: 'tuff',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  // ===================== ГАВАНЬ =====================
  const sectors: Sector[] = [
    // ===================== ГАВАНЬ =====================
    // Гавань — ущелье, идущее от реки (восток) вглубь (запад).
    // Координаты приблизительные — уточнить GPS на месте.
    { id: 'sector-vinni', areaId: 'tamgaly-tas', name: 'Винни-Пух', slug: 'vinni-pukh',
      description: 'Первая скала слева при входе в ущелье. Тёплая ранней весной. 13 маршрутов.',
      latitude: 44.0642, longitude: 76.9948,
      approachDescription: 'От парковки в ущелье, первая скала слева.', approachTimeMin: 5,
      orientation: 'Юг', sunExposure: 'Весь день солнце', sortOrder: 1,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'sector-zamanka', areaId: 'tamgaly-tas', name: 'Заманка', slug: 'zamanka',
      description: '«Алиса в стране чудес». Южная и северная стороны.',
      latitude: 44.0644, longitude: 76.9940,
      approachDescription: 'За скалой Манка.', approachTimeMin: 7,
      orientation: 'Юг/Север', sunExposure: 'Юг — солнце, север — тень', sortOrder: 2,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'sector-visyachiy', areaId: 'tamgaly-tas', name: 'Висячий Камень', slug: 'visyachiy-kamen',
      description: 'Большая скала с валуном наверху. Три мультипитча.',
      latitude: 44.0647, longitude: 76.9932,
      approachDescription: 'Дальше по ущелью от Заманки.', approachTimeMin: 10,
      orientation: 'Запад', sunExposure: 'После обеда', sortOrder: 3,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'sector-laboratoriya', areaId: 'tamgaly-tas', name: 'Лаборатория', slug: 'laboratoriya',
      description: 'Два маршрута под Висячим Камнем.',
      latitude: 44.0648, longitude: 76.9930,
      approachDescription: 'Под Висячим Камнем.', approachTimeMin: 10,
      orientation: 'Юг', sunExposure: 'Днём солнце', sortOrder: 4,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'sector-lev', areaId: 'tamgaly-tas', name: 'Лев', slug: 'lev',
      description: 'Справа от входа в Гавань. Два слэба и одна вертикаль.',
      latitude: 44.0638, longitude: 76.9950,
      approachDescription: 'Справа от входа в ущелье.', approachTimeMin: 5,
      orientation: 'Восток', sunExposure: 'Утром солнце', sortOrder: 5,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'sector-yabloki', areaId: 'tamgaly-tas', name: 'Яблоки', slug: 'yabloki',
      description: 'Лёгкие маршруты с «дырами». Первое солнце. 15 маршрутов. Перепробиты 2018.',
      latitude: 44.0650, longitude: 76.9925,
      approachDescription: 'Дальше по ущелью, восточная стена.', approachTimeMin: 10,
      orientation: 'Восток', sunExposure: 'Первое солнце утром', sortOrder: 6,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'sector-zub', areaId: 'tamgaly-tas', name: 'Зуб', slug: 'zub',
      description: '4 свежих маршрута на крепкой породе (2019).',
      latitude: 44.0652, longitude: 76.9922,
      approachDescription: 'Рядом с Яблоками.', approachTimeMin: 11,
      orientation: 'Восток', sunExposure: 'Утром солнце', sortOrder: 7,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'sector-rebro', areaId: 'tamgaly-tas', name: 'Ребро Жёсткости', slug: 'rebro',
      description: 'Трад-сектор с минимумом болтов.',
      latitude: 44.0654, longitude: 76.9919,
      approachDescription: 'Дальше от Зуба.', approachTimeMin: 12,
      orientation: 'Запад', sunExposure: 'После обеда', sortOrder: 8,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'sector-biblioteka', areaId: 'tamgaly-tas', name: 'Библиотека', slug: 'biblioteka',
      description: 'Самый дальний сектор Гавани. Два уровня.',
      latitude: 44.0657, longitude: 76.9914,
      approachDescription: 'Конец ущелья Гавань.', approachTimeMin: 15,
      orientation: 'Запад', sunExposure: 'После обеда', sortOrder: 9,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    // ===================== РИВЁРСАЙД =====================
    // Ривёрсайд — скалы вдоль реки, идут к северу от входа в Гавань.
    // Бастион — над рисунком Будды (OSM: 44.0613, 76.9964).
    { id: 'sector-prigorod', areaId: 'tamgaly-tas', name: 'Пригород', slug: 'prigorod',
      description: 'Начало Ривёрсайд. Микс трада и спорта.',
      latitude: 44.0633409, longitude: 76.9964891,
      approachDescription: 'От парковки направо вдоль реки.', approachTimeMin: 15,
      orientation: 'Запад', sunExposure: 'После обеда, жарко', sortOrder: 10,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'sector-gorod', areaId: 'tamgaly-tas', name: 'Город', slug: 'gorod',
      description: 'Мультипитчи и трад. Верёвка 60м.',
      latitude: 44.0624891, longitude: 76.9964802,
      approachDescription: 'Правее Пригорода.', approachTimeMin: 17,
      orientation: 'Запад', sunExposure: 'После обеда', sortOrder: 11,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'sector-enbek', areaId: 'tamgaly-tas', name: 'Енбек', slug: 'enbek',
      description: 'Сектор между Городом и Серпами.',
      latitude: 44.0618180, longitude: 76.9966855,
      approachDescription: 'Правее Города.', approachTimeMin: 18,
      orientation: 'Запад', sunExposure: 'После обеда', sortOrder: 12,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'sector-serpy', areaId: 'tamgaly-tas', name: 'Серпы', slug: 'serpy',
      description: 'Длинные сложные вертикали и нависания.',
      latitude: 44.0616365, longitude: 76.9967875,
      approachDescription: 'Правее Енбека.', approachTimeMin: 19,
      orientation: 'Запад', sunExposure: 'После обеда', sortOrder: 13,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'sector-bastion', areaId: 'tamgaly-tas', name: 'Бастион', slug: 'bastion',
      description: 'Над рисунком Будды. Верхний и нижний уровни. 14 маршрутов.',
      latitude: 44.0614, longitude: 76.9965,
      approachDescription: 'Правее Серпов.', approachTimeMin: 20,
      orientation: 'Запад', sunExposure: 'После обеда', sortOrder: 14,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'sector-karnizy', areaId: 'tamgaly-tas', name: 'Карнизы', slug: 'karnizy',
      description: 'Правее Бастиона. Мультипитчи до 8a.',
      latitude: 44.0608, longitude: 76.9966,
      approachDescription: 'Правее Бастиона.', approachTimeMin: 22,
      orientation: 'Запад', sunExposure: 'После обеда', sortOrder: 15,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ]

  const allRoutes: Route[] = [
    // Винни-Пух (13)
    ...numberRoutes([
      rt('sector-vinni', 'Неправильные пчёлы', '5c+'),
      rt('sector-vinni', 'Кристофер Робин', '5c'),
      rt('sector-vinni', 'Ловушка для Слонопотама', '5c'),
      rt('sector-vinni', 'Крошка Ру', '4'),
      rt('sector-vinni', 'Кенга', '5a+'),
      rt('sector-vinni', 'Сова', '5b'),
      rt('sector-vinni', 'Тигра', '5b'),
      rt('sector-vinni', 'Пятнистый Счастливус', '6b+'),
      rt('sector-vinni', 'Винни-Пух', '6a+'),
      rt('sector-vinni', 'Пятачок', '6c'),
      rt('sector-vinni', 'Левое ухо ослика Иа', '6b+'),
      rt('sector-vinni', 'Правое ухо ослика Иа', '6a'),
      rt('sector-vinni', 'Кролик', '6a'),
    ]),
    // Заманка (8)
    ...numberRoutes([
      rt('sector-zamanka', 'Дина', '6a'),
      rt('sector-zamanka', 'Алиса', '6a+'),
      rt('sector-zamanka', 'Бармаглот', '7a'),
      rt('sector-zamanka', 'Чеширский кот', '6c'),
      rt('sector-zamanka', 'Синяя Гусеница', '6b+'),
      rt('sector-zamanka', 'Соня', '5c'),
      rt('sector-zamanka', 'Мартовский заяц', '6c'),
      rt('sector-zamanka', 'Безумный Шляпник', '7a+'),
    ]),
    // Висячий Камень (3)
    ...numberRoutes([
      rt('sector-visyachiy', 'Тоторо', '6a', 'multi-pitch', 50, 2),
      rt('sector-visyachiy', 'Хаул', '5c', 'multi-pitch', 45, 2),
      rt('sector-visyachiy', 'Навсикая', '6c', 'multi-pitch', 55, 2),
    ]),
    // Лаборатория (1)
    ...numberRoutes([
      rt('sector-laboratoriya', 'Правая', '7a+'),
    ]),
    // Лев (3)
    ...numberRoutes([
      rt('sector-lev', 'Ррр-Мяу', '6a'),
      rt('sector-lev', 'Бонифаций', '6c'),
      rt('sector-lev', 'Разминка', '7a+'),
    ]),
    // Яблоки (15)
    ...numberRoutes([
      rt('sector-yabloki', 'Ватрушка', '5c'),
      rt('sector-yabloki', 'Дамские пальчики', '6c'),
      rt('sector-yabloki', 'Шарлотка', '6b'),
      rt('sector-yabloki', 'Блин', '6a'),
      rt('sector-yabloki', 'Бублик', '5c+'),
      rt('sector-yabloki', 'Трубочки с кремом', '6b+'),
      rt('sector-yabloki', 'Мороженое', '5b'),
      rt('sector-yabloki', 'Пирожное', '5c'),
      rt('sector-yabloki', 'Торт', '5b'),
      rt('sector-yabloki', 'Не ищи сову', '5c', 'trad'),
      rt('sector-yabloki', 'Печенка', '5b+'),
      rt('sector-yabloki', 'Незавершённый гештальт', '5b'),
      rt('sector-yabloki', 'Булочка', '5b+'),
      rt('sector-yabloki', 'Напугай сову', '4', 'trad'),
      rt('sector-yabloki', 'Найди сову', '4', 'trad'),
    ]),
    // Зуб (4)
    ...numberRoutes([
      rt('sector-zub', 'Мудрости', '6b+'),
      rt('sector-zub', 'Выпавший', '6b'),
      rt('sector-zub', 'Коренной', '6b+'),
      rt('sector-zub', 'Молочный', '6a+'),
    ]),
    // Ребро Жёсткости (4)
    ...numberRoutes([
      rt('sector-rebro', 'Гришина щель', '5b', 'trad'),
      rt('sector-rebro', 'Череп и покрышка', '5c', 'trad'),
      rt('sector-rebro', 'Астериск', '6c'),
      rt('sector-rebro', 'Крест', '5c+'),
    ]),
    // Библиотека (10)
    ...numberRoutes([
      rt('sector-biblioteka', 'Иностранка', '5b'),
      rt('sector-biblioteka', 'Почтамт', '7b'),
      rt('sector-biblioteka', 'Гриб (лев)', '6b'),
      rt('sector-biblioteka', 'Гриб (прав)', '6b+'),
      rt('sector-biblioteka', 'Ми', '5b'),
      rt('sector-biblioteka', 'Теория времени', '5b'),
      rt('sector-biblioteka', 'Архипелаг', '6b+'),
      rt('sector-biblioteka', 'Планея людей', '7a+'),
      rt('sector-biblioteka', 'На дороге', '6c+'),
      rt('sector-biblioteka', 'Ремесло', '6b'),
    ]),
    // Пригород (7)
    ...numberRoutes([
      rt('sector-prigorod', 'Сюрприз #2', '7c'),
      rt('sector-prigorod', 'Щель страха', '5c', 'trad'),
      rt('sector-prigorod', 'Щель боли', '6b', 'trad'),
      rt('sector-prigorod', 'Через карниз', '6a+', 'trad'),
      rt('sector-prigorod', 'Мескалито', '6c'),
      rt('sector-prigorod', 'Сюрприз', '7a+'),
      rt('sector-prigorod', 'Нагваль', '7a'),
    ]),
    // Город (9)
    ...numberRoutes([
      rt('sector-gorod', 'Щель Ратмира', '6c'),
      rt('sector-gorod', 'Щель с птицами', '5c'),
      rt('sector-gorod', 'Сила безмолвия', '7a', 'multi-pitch', 50, 2),
      rt('sector-gorod', 'Отдельная реальность', '6c', 'multi-pitch', 50, 2),
      rt('sector-gorod', 'Огонь изнутри', '7a', 'multi-pitch', 55, 2),
      rt('sector-gorod', 'Ломовая щель', '6b', 'trad'),
      rt('sector-gorod', 'Сказки о силе', '7b', 'multi-pitch', 60, 2),
      rt('sector-gorod', 'Колесо времени', '6b+', 'multi-pitch', 50, 2),
      rt('sector-gorod', 'Щель ярости', '6a'),
    ]),
    // Серпы (5)
    ...numberRoutes([
      rt('sector-serpy', 'Червяк', '6b+', 'trad'),
      rt('sector-serpy', 'Малый серп', '6c'),
      rt('sector-serpy', 'Белый подтёк', '7c'),
      rt('sector-serpy', 'Щель с ласточками', '6c'),
      rt('sector-serpy', 'Гнёзда', '6c'),
    ]),
    // Бастион (14)
    ...numberRoutes([
      rt('sector-bastion', 'Слева от бастиона', '6a', 'trad'),
      rt('sector-bastion', 'Подвиг разведчика', '7a'),
      rt('sector-bastion', 'Грибоедовский вальс', '7a+'),
      rt('sector-bastion', 'Прямая дорога', '7b'),
      rt('sector-bastion', 'Поезд', '6b'),
      rt('sector-bastion', 'Искры', '6c'),
      rt('sector-bastion', 'Шишки', '5c', 'trad'),
      rt('sector-bastion', 'Семья', '5b'),
      rt('sector-bastion', 'Палата номер шесть', '6b'),
      rt('sector-bastion', 'Лихо', '6b+'),
      rt('sector-bastion', 'Время колокольчиков', '5c'),
      rt('sector-bastion', 'Верка', '6b'),
      rt('sector-bastion', 'Надка', '5b'),
      rt('sector-bastion', 'Любка', '5c'),
    ]),
    // Карнизы (4)
    ...numberRoutes([
      rt('sector-karnizy', 'От винта', '7c+', 'multi-pitch', 50, 2),
      rt('sector-karnizy', 'Пляши в огне!', '8a', 'multi-pitch', 55, 2),
      rt('sector-karnizy', 'Пашкина щель', '7a', 'trad'),
      rt('sector-karnizy', 'Три щели', '6a', 'trad'),
    ]),
  ]

  await db.transaction('rw', [db.areas, db.sectors, db.routes, db.syncMeta], async () => {
    await db.areas.add(area)
    await db.sectors.bulkAdd(sectors)
    await db.routes.bulkAdd(allRoutes)
    // Restore admin-created sectors and routes
    if (adminSectors.length > 0) await db.sectors.bulkPut(adminSectors)
    if (adminRoutes.length > 0) await db.routes.bulkPut(adminRoutes)
    await db.syncMeta.put({ key: 'seedVersion', value: String(SEED_VERSION) })
  })

  console.log(`Seeded: 1 area, ${sectors.length} sectors, ${allRoutes.length} routes` +
    (adminSectors.length ? `, restored ${adminSectors.length} admin sectors, ${adminRoutes.length} admin routes` : ''))
}

/**
 * Restore topos from localStorage photo tags if DB topos are empty.
 * This recovers from a re-seed that accidentally wiped topos.
 */
export async function restoreToposFromTags() {
  const raw = localStorage.getItem('photo-tags')
  if (!raw) return

  let tags: Record<string, { type: string; sectorId?: string; sectorIds?: string[]; routeIds?: string[]; routeId?: string }>
  try { tags = JSON.parse(raw) } catch { return }

  const sectors = await db.sectors.toArray()
  const sectorIds = new Set(sectors.map(s => s.id))
  const routes = await db.routes.toArray()
  const routeMap = new Map(routes.map(r => [r.id, r]))

  // Remap orphaned sector IDs
  const remapSectorId = (id: string): string => {
    if (sectorIds.has(id)) return id
    const base = id.replace(/-\d{10,}$/, '')
    const match = sectors.find(s => base.startsWith(s.id))
    return match ? match.id : id
  }

  const PHOTO_DIR = '/topos/'
  const sectorPhotos = new Map<string, string[]>()
  const routePhotos = new Map<string, string[]>()

  for (const [file, tag] of Object.entries(tags)) {
    if (tag.type === 'skip' || tag.type === 'approach') continue
    const sid = tag.sectorId ? remapSectorId(tag.sectorId) : undefined
    if (!sid || !sectorIds.has(sid)) continue

    if (tag.type === 'sector') {
      const list = sectorPhotos.get(sid) || []
      list.push(file)
      sectorPhotos.set(sid, list)
    }
    if (tag.type === 'route') {
      const sList = sectorPhotos.get(sid) || []
      sList.push(file)
      sectorPhotos.set(sid, sList)
      const ids = tag.routeIds || (tag.routeId ? [tag.routeId] : [])
      for (const rid of ids) {
        if (routeMap.has(rid)) {
          const rList = routePhotos.get(rid) || []
          rList.push(file)
          routePhotos.set(rid, rList)
        }
      }
    }
  }

  // Helper: load image to get actual dimensions
  const getImageDims = (url: string): Promise<{ w: number; h: number }> =>
    new Promise(resolve => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth || 1920, h: img.naturalHeight || 1080 })
      img.onerror = () => resolve({ w: 1920, h: 1080 })
      img.src = url
    })

  // Create topo records
  const now = new Date().toISOString()
  for (const [sectorId, files] of sectorPhotos) {
    for (let i = 0; i < files.length; i++) {
      const dims = await getImageDims(PHOTO_DIR + files[i])
      await db.topos.put({
        id: `topo-${sectorId}-${i}`,
        sectorId,
        imageUrl: PHOTO_DIR + files[i],
        imageWidth: dims.w,
        imageHeight: dims.h,
        sortOrder: i + 1,
        createdAt: now,
        updatedAt: now,
      })
    }
  }
  for (const [routeId, files] of routePhotos) {
    const route = routeMap.get(routeId)
    if (!route) continue
    for (let i = 0; i < files.length; i++) {
      const dims = await getImageDims(PHOTO_DIR + files[i])
      await db.topos.put({
        id: `topo-route-${routeId}-${i}`,
        sectorId: route.sectorId,
        imageUrl: PHOTO_DIR + files[i],
        imageWidth: dims.w,
        imageHeight: dims.h,
        caption: `${route.name} (${route.grade})`,
        sortOrder: 10 + i,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  // Restore cover images from localStorage
  try {
    const coverRaw = localStorage.getItem('sector-covers')
    if (coverRaw) {
      const covers: Record<string, string> = JSON.parse(coverRaw)
      for (const [sectorId, filename] of Object.entries(covers)) {
        if (sectorIds.has(sectorId)) {
          await db.sectors.update(sectorId, { coverImageUrl: PHOTO_DIR + filename })
        }
      }
    }
  } catch { /* ignore */ }

  // Auto-set cover from first sector photo if no explicit cover
  for (const [sectorId, files] of sectorPhotos) {
    const sector = await db.sectors.get(sectorId)
    if (sector && !sector.coverImageUrl && files.length > 0) {
      await db.sectors.update(sectorId, { coverImageUrl: PHOTO_DIR + files[0] })
    }
  }

  const total = sectorPhotos.size + routePhotos.size
  if (total > 0) {
    console.log(`Restored topos from localStorage: ${sectorPhotos.size} sectors, ${routePhotos.size} routes`)
  }
}

// GPS coordinates from field KMZ waypoints (2026-03-08, 2026-03-09)
const SECTOR_GPS: Record<string, { latitude: number; longitude: number }> = {
  'sector-prigorod': { latitude: 44.0633409, longitude: 76.9964891 },
  'sector-gorod':    { latitude: 44.0624891, longitude: 76.9964802 },
  'sector-serpy':    { latitude: 44.0616365, longitude: 76.9967875 },
  'sector-zamanka':  { latitude: 44.0632248, longitude: 76.9982119 },
}

// Route-level GPS from KMZ waypoints
const ROUTE_GPS: Array<{ sectorId: string; name: string; latitude: number; longitude: number }> = [
  { sectorId: 'sector-prigorod', name: 'Мескалито', latitude: 44.0629180, longitude: 76.9964802 },
  { sectorId: 'sector-gorod', name: 'Отдельная реальность', latitude: 44.0624891, longitude: 76.9964802 },
]

export async function updateGpsCoordinates() {
  // Update sector GPS
  for (const [id, coords] of Object.entries(SECTOR_GPS)) {
    const existing = await db.sectors.get(id)
    if (existing) {
      await db.sectors.update(id, coords)
    }
  }

  // Update route GPS by name lookup
  for (const rg of ROUTE_GPS) {
    const routes = await db.routes.where('sectorId').equals(rg.sectorId).toArray()
    const route = routes.find(r => r.name === rg.name)
    if (route) {
      await db.routes.update(route.id, { latitude: rg.latitude, longitude: rg.longitude })
    }
  }

  // Add Enbek sector if missing
  const enbek = await db.sectors.get('sector-enbek')
  if (!enbek) {
    const now = new Date().toISOString()
    await db.sectors.add({
      id: 'sector-enbek',
      areaId: 'tamgaly-tas',
      name: 'Енбек',
      slug: 'enbek',
      description: 'Сектор между Городом и Серпами.',
      latitude: 44.0618180,
      longitude: 76.9966855,
      approachDescription: 'Правее Города.',
      approachTimeMin: 18,
      orientation: 'Запад',
      sunExposure: 'После обеда',
      sortOrder: 12,
      createdAt: now,
      updatedAt: now,
    })
    console.log('Added sector: Енбек')
  }
  console.log('GPS coordinates updated from KMZ waypoints')
}
