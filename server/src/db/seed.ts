/**
 * Seed the server database with real Tamgaly-Tas data (101 routes, 14 sectors).
 * Run after migration:
 *   npx tsx server/src/db/seed.ts
 */

import { getDb } from './connection'
import { mkdirSync } from 'fs'
import { join } from 'path'

mkdirSync(join(process.cwd(), 'server', 'data'), { recursive: true })

const db = getDb()

const AREA_ID = 'tamgaly-tas'

const existing = db.prepare('SELECT id FROM area WHERE id = ?').get(AREA_ID)
if (existing) {
  console.log('Database already seeded. Delete server/data/climbing.db to re-seed.')
  process.exit(0)
}

const GRADE_SORT: Record<string, number> = {
  '4': 30, '5a+': 75, '5b': 85, '5b+': 90, '5c': 100, '5c+': 105,
  '6a': 120, '6a+': 135, '6b': 150, '6b+': 170, '6c': 190, '6c+': 210,
  '7a': 240, '7a+': 270, '7b': 300, '7b+': 340, '7c': 380, '7c+': 420,
  '8a': 470, '8a+': 520,
}

function gs(grade: string): number { return GRADE_SORT[grade] || 0 }
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
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

db.exec('BEGIN')

try {
  // Area
  db.prepare(`INSERT INTO area (id, name, slug, description, latitude, longitude, bbox_north, bbox_south, bbox_east, bbox_west, elevation_m, rock_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    AREA_ID, 'Тамгалы-Тас', 'tamgaly-tas',
    'Скалолазный район на берегу реки Или, 120 км от Алматы. Туф, ~200 маршрутов от 4 до 8a+.',
    43.805, 75.535, 43.815, 43.795, 75.545, 75.525, 600, 'tuff')

  // Sectors
  const sectorData = [
    ['sector-vinni', 'Винни-Пух', 'Первая скала слева. 13 маршрутов.', 43.8040, 75.5340, 'Юг', 'Весь день солнце', 1, 'От парковки, первая скала слева.', 5],
    ['sector-zamanka', 'Заманка', '«Алиса в стране чудес». 8 маршрутов.', 43.8042, 75.5335, 'Юг/Север', 'Юг—солнце, север—тень', 2, 'За Манкой.', 7],
    ['sector-visyachiy', 'Висячий Камень', 'Три мультипитча.', 43.8045, 75.5330, 'Запад', 'После обеда', 3, 'Дальше от Заманки.', 10],
    ['sector-laboratoriya', 'Лаборатория', 'Два маршрута под Висячим Камнем.', 43.8046, 75.5328, 'Юг', 'Днём солнце', 4, 'Под Висячим Камнем.', 10],
    ['sector-lev', 'Лев', 'Справа от входа. 3 маршрута.', 43.8038, 75.5345, 'Восток', 'Утром солнце', 5, 'Справа от входа.', 5],
    ['sector-yabloki', 'Яблоки', 'Лёгкие маршруты. 15 шт. Перепробиты 2018.', 43.8048, 75.5325, 'Восток', 'Первое солнце утром', 6, 'Восточная стена ущелья.', 10],
    ['sector-zub', 'Зуб', '4 маршрута (2019).', 43.8050, 75.5322, 'Восток', 'Утром солнце', 7, 'Рядом с Яблоками.', 11],
    ['sector-rebro', 'Ребро Жёсткости', 'Трад-сектор.', 43.8052, 75.5320, 'Запад', 'После обеда', 8, 'Дальше от Зуба.', 12],
    ['sector-biblioteka', 'Библиотека', 'Самый дальний. Два уровня. 10 маршрутов.', 43.8055, 75.5315, 'Запад', 'После обеда', 9, 'Конец ущелья.', 15],
    ['sector-prigorod', 'Пригород', 'Начало Ривёрсайд. 7 маршрутов.', 43.8060, 75.5360, 'Запад', 'После обеда, жарко', 10, 'Направо вдоль реки.', 15],
    ['sector-gorod', 'Город', 'Мультипитчи и трад. 9 маршрутов.', 43.8062, 75.5365, 'Запад', 'После обеда', 11, 'Правее Пригорода.', 17],
    ['sector-serpy', 'Серпы', 'Сложные вертикали. 5 маршрутов.', 43.8065, 75.5370, 'Запад', 'После обеда', 12, 'Правее Города.', 18],
    ['sector-bastion', 'Бастион', 'Над Буддой. 14 маршрутов.', 43.8068, 75.5375, 'Запад', 'После обеда', 13, 'Правее Серпов.', 20],
    ['sector-karnizy', 'Карнизы', 'Мультипитчи до 8a.', 43.8070, 75.5380, 'Запад', 'После обеда', 14, 'Правее Бастиона.', 22],
  ] as const

  const sectorStmt = db.prepare(`INSERT INTO sector (id, area_id, name, slug, description, latitude, longitude, orientation, sun_exposure, sort_order, approach_description, approach_time_min)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  for (const s of sectorData) {
    sectorStmt.run(s[0], AREA_ID, s[1], slug(s[1]), s[2], s[3], s[4], s[5], s[6], s[7], s[8], s[9])
  }

  // Routes
  type R = [string, string, string, string, number | null, number]
  const routeData: R[] = [
    // Винни-Пух
    ['sector-vinni', 'Неправильные пчёлы', '5c+', 'sport', null, 1],
    ['sector-vinni', 'Кристофер Робин', '5c', 'sport', null, 1],
    ['sector-vinni', 'Ловушка для Слонопотама', '5c', 'sport', null, 1],
    ['sector-vinni', 'Крошка Ру', '4', 'sport', null, 1],
    ['sector-vinni', 'Кенга', '5a+', 'sport', null, 1],
    ['sector-vinni', 'Сова', '5b', 'sport', null, 1],
    ['sector-vinni', 'Тигра', '5b', 'sport', null, 1],
    ['sector-vinni', 'Пятнистый Счастливус', '6b+', 'sport', null, 1],
    ['sector-vinni', 'Винни-Пух', '6a+', 'sport', null, 1],
    ['sector-vinni', 'Пятачок', '6c', 'sport', null, 1],
    ['sector-vinni', 'Левое ухо ослика Иа', '6b+', 'sport', null, 1],
    ['sector-vinni', 'Правое ухо ослика Иа', '6a', 'sport', null, 1],
    ['sector-vinni', 'Кролик', '6a', 'sport', null, 1],
    // Заманка
    ['sector-zamanka', 'Дина', '6a', 'sport', null, 1],
    ['sector-zamanka', 'Алиса', '6a+', 'sport', null, 1],
    ['sector-zamanka', 'Бармаглот', '7a', 'sport', null, 1],
    ['sector-zamanka', 'Чеширский кот', '6c', 'sport', null, 1],
    ['sector-zamanka', 'Синяя Гусеница', '6b+', 'sport', null, 1],
    ['sector-zamanka', 'Соня', '5c', 'sport', null, 1],
    ['sector-zamanka', 'Мартовский заяц', '6c', 'sport', null, 1],
    ['sector-zamanka', 'Безумный Шляпник', '7a+', 'sport', null, 1],
    // Висячий Камень
    ['sector-visyachiy', 'Тоторо', '6a', 'multi-pitch', 50, 2],
    ['sector-visyachiy', 'Хаул', '5c', 'multi-pitch', 45, 2],
    ['sector-visyachiy', 'Навсикая', '6c', 'multi-pitch', 55, 2],
    // Лаборатория
    ['sector-laboratoriya', 'Правая', '7a+', 'sport', null, 1],
    // Лев
    ['sector-lev', 'Ррр-Мяу', '6a', 'sport', null, 1],
    ['sector-lev', 'Бонифаций', '6c', 'sport', null, 1],
    ['sector-lev', 'Разминка', '7a+', 'sport', null, 1],
    // Яблоки
    ['sector-yabloki', 'Ватрушка', '5c', 'sport', null, 1],
    ['sector-yabloki', 'Дамские пальчики', '6c', 'sport', null, 1],
    ['sector-yabloki', 'Шарлотка', '6b', 'sport', null, 1],
    ['sector-yabloki', 'Блин', '6a', 'sport', null, 1],
    ['sector-yabloki', 'Бублик', '5c+', 'sport', null, 1],
    ['sector-yabloki', 'Трубочки с кремом', '6b+', 'sport', null, 1],
    ['sector-yabloki', 'Мороженое', '5b', 'sport', null, 1],
    ['sector-yabloki', 'Пирожное', '5c', 'sport', null, 1],
    ['sector-yabloki', 'Торт', '5b', 'sport', null, 1],
    ['sector-yabloki', 'Не ищи сову', '5c', 'trad', null, 1],
    ['sector-yabloki', 'Печенка', '5b+', 'sport', null, 1],
    ['sector-yabloki', 'Незавершённый гештальт', '5b', 'sport', null, 1],
    ['sector-yabloki', 'Булочка', '5b+', 'sport', null, 1],
    ['sector-yabloki', 'Напугай сову', '4', 'trad', null, 1],
    ['sector-yabloki', 'Найди сову', '4', 'trad', null, 1],
    // Зуб
    ['sector-zub', 'Мудрости', '6b+', 'sport', null, 1],
    ['sector-zub', 'Выпавший', '6b', 'sport', null, 1],
    ['sector-zub', 'Коренной', '6b+', 'sport', null, 1],
    ['sector-zub', 'Молочный', '6a+', 'sport', null, 1],
    // Ребро Жёсткости
    ['sector-rebro', 'Гришина щель', '5b', 'trad', null, 1],
    ['sector-rebro', 'Череп и покрышка', '5c', 'trad', null, 1],
    ['sector-rebro', 'Астериск', '6c', 'sport', null, 1],
    ['sector-rebro', 'Крест', '5c+', 'sport', null, 1],
    // Библиотека
    ['sector-biblioteka', 'Иностранка', '5b', 'sport', null, 1],
    ['sector-biblioteka', 'Почтамт', '7b', 'sport', null, 1],
    ['sector-biblioteka', 'Гриб (лев)', '6b', 'sport', null, 1],
    ['sector-biblioteka', 'Гриб (прав)', '6b+', 'sport', null, 1],
    ['sector-biblioteka', 'Ми', '5b', 'sport', null, 1],
    ['sector-biblioteka', 'Теория времени', '5b', 'sport', null, 1],
    ['sector-biblioteka', 'Архипелаг', '6b+', 'sport', null, 1],
    ['sector-biblioteka', 'Планея людей', '7a+', 'sport', null, 1],
    ['sector-biblioteka', 'На дороге', '6c+', 'sport', null, 1],
    ['sector-biblioteka', 'Ремесло', '6b', 'sport', null, 1],
    // Пригород
    ['sector-prigorod', 'Сюрприз #2', '7c', 'sport', null, 1],
    ['sector-prigorod', 'Щель страха', '5c', 'trad', null, 1],
    ['sector-prigorod', 'Щель боли', '6b', 'trad', null, 1],
    ['sector-prigorod', 'Через карниз', '6a+', 'trad', null, 1],
    ['sector-prigorod', 'Мескалито', '6c', 'sport', null, 1],
    ['sector-prigorod', 'Сюрприз', '7a+', 'sport', null, 1],
    ['sector-prigorod', 'Нагваль', '7a', 'sport', null, 1],
    // Город
    ['sector-gorod', 'Щель Ратмира', '6c', 'sport', null, 1],
    ['sector-gorod', 'Щель с птицами', '5c', 'sport', null, 1],
    ['sector-gorod', 'Сила безмолвия', '7a', 'multi-pitch', 50, 2],
    ['sector-gorod', 'Отдельная реальность', '6c', 'multi-pitch', 50, 2],
    ['sector-gorod', 'Огонь изнутри', '7a', 'multi-pitch', 55, 2],
    ['sector-gorod', 'Ломовая щель', '6b', 'trad', null, 1],
    ['sector-gorod', 'Сказки о силе', '7b', 'multi-pitch', 60, 2],
    ['sector-gorod', 'Колесо времени', '6b+', 'multi-pitch', 50, 2],
    ['sector-gorod', 'Щель ярости', '6a', 'sport', null, 1],
    // Серпы
    ['sector-serpy', 'Червяк', '6b+', 'trad', null, 1],
    ['sector-serpy', 'Малый серп', '6c', 'sport', null, 1],
    ['sector-serpy', 'Белый подтёк', '7c', 'sport', null, 1],
    ['sector-serpy', 'Щель с ласточками', '6c', 'sport', null, 1],
    ['sector-serpy', 'Гнёзда', '6c', 'sport', null, 1],
    // Бастион
    ['sector-bastion', 'Слева от бастиона', '6a', 'trad', null, 1],
    ['sector-bastion', 'Подвиг разведчика', '7a', 'sport', null, 1],
    ['sector-bastion', 'Грибоедовский вальс', '7a+', 'sport', null, 1],
    ['sector-bastion', 'Прямая дорога', '7b', 'sport', null, 1],
    ['sector-bastion', 'Поезд', '6b', 'sport', null, 1],
    ['sector-bastion', 'Искры', '6c', 'sport', null, 1],
    ['sector-bastion', 'Шишки', '5c', 'trad', null, 1],
    ['sector-bastion', 'Семья', '5b', 'sport', null, 1],
    ['sector-bastion', 'Палата номер шесть', '6b', 'sport', null, 1],
    ['sector-bastion', 'Лихо', '6b+', 'sport', null, 1],
    ['sector-bastion', 'Время колокольчиков', '5c', 'sport', null, 1],
    ['sector-bastion', 'Верка', '6b', 'sport', null, 1],
    ['sector-bastion', 'Надка', '5b', 'sport', null, 1],
    ['sector-bastion', 'Любка', '5c', 'sport', null, 1],
    // Карнизы
    ['sector-karnizy', 'От винта', '7c+', 'multi-pitch', 50, 2],
    ['sector-karnizy', 'Пляши в огне!', '8a', 'multi-pitch', 55, 2],
    ['sector-karnizy', 'Пашкина щель', '7a', 'trad', null, 1],
    ['sector-karnizy', 'Три щели', '6a', 'trad', null, 1],
  ]

  const routeStmt = db.prepare(`INSERT INTO route (id, sector_id, name, slug, grade, grade_system, grade_sort, length_m, pitches, route_type, number_in_sector, status)
    VALUES (?, ?, ?, ?, ?, 'french', ?, ?, ?, ?, ?, 'published')`)

  let routeNum = 0
  let prevSector = ''
  let numInSector = 0
  for (const [sectorId, name, grade, type, length, pitches] of routeData) {
    routeNum++
    if (sectorId !== prevSector) { numInSector = 0; prevSector = sectorId }
    numInSector++
    routeStmt.run(`route-${routeNum}`, sectorId, name, slug(name), grade, gs(grade), length, pitches, type, numInSector)
  }

  db.exec('COMMIT')
  console.log(`Seeded: 1 area, ${sectorData.length} sectors, ${routeNum} routes.`)
} catch (err) {
  db.exec('ROLLBACK')
  console.error('Seed failed:', err)
  process.exit(1)
}
