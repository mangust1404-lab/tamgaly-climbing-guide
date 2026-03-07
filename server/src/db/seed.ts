/**
 * Seed the server database with demo data for Tamgaly-Tas.
 * Run after migration:
 *   npx tsx server/src/db/seed.ts
 */

import { getDb } from './connection'
import { mkdirSync } from 'fs'
import { join } from 'path'

mkdirSync(join(process.cwd(), 'server', 'data'), { recursive: true })

const db = getDb()

const AREA_ID = 'tamgaly-tas'

// Check if already seeded
const existing = db.prepare('SELECT id FROM area WHERE id = ?').get(AREA_ID)
if (existing) {
  console.log('Database already seeded. Skipping.')
  process.exit(0)
}

db.exec('BEGIN')

try {
  // Area
  db.prepare(`
    INSERT INTO area (id, name, slug, description, latitude, longitude, bbox_north, bbox_south, bbox_east, bbox_west, elevation_m, rock_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    AREA_ID,
    'Тамгалы-Тас',
    'tamgaly-tas',
    'Скалолазный район на берегу реки Или, 120 км от Алматы. Гранитные скалы высотой до 40м.',
    43.8,
    75.53,
    43.81,
    43.79,
    75.55,
    75.51,
    600,
    'granite',
  )

  // Sectors
  const sectors = [
    { id: 'sector-gavan', name: 'Гавань', slug: 'gavan', desc: 'Основной сектор с большинством маршрутов. Южная экспозиция.', lat: 43.8005, lon: 75.5310, orientation: 'Юг', sun: 'Солнце до 15:00', sort: 1, approach: 'От парковки 10 мин по тропе вдоль реки', approachMin: 10 },
    { id: 'sector-riverside', name: 'Ривёрсайд', slug: 'riverside', desc: 'Сектор вдоль реки. Нависающие маршруты.', lat: 43.7990, lon: 75.5325, orientation: 'Юго-запад', sun: 'Солнце до 16:00', sort: 2, approach: 'От парковки 15 мин вниз по течению', approachMin: 15 },
    { id: 'sector-prigorod', name: 'Пригород', slug: 'prigorod', desc: 'Сектор для начинающих. Простые маршруты.', lat: 43.8015, lon: 75.5290, orientation: 'Восток', sun: 'Утреннее солнце', sort: 3, approach: 'От парковки 5 мин', approachMin: 5 },
    { id: 'sector-utrenniy', name: 'Утренний', slug: 'utrenniy', desc: 'Компактный сектор с техничными маршрутами.', lat: 43.8020, lon: 75.5300, orientation: 'Юго-восток', sun: 'Солнце до 13:00', sort: 4, approach: 'От парковки 8 мин по верхней тропе', approachMin: 8 },
  ]

  const sectorStmt = db.prepare(`
    INSERT INTO sector (id, area_id, name, slug, description, latitude, longitude, orientation, sun_exposure, sort_order, approach_description, approach_time_min)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const s of sectors) {
    sectorStmt.run(s.id, AREA_ID, s.name, s.slug, s.desc, s.lat, s.lon, s.orientation, s.sun, s.sort, s.approach, s.approachMin)
  }

  // Routes
  const routes = [
    { id: 'route-1', sector: 'sector-gavan', name: 'Первый контакт', slug: 'pervyy-kontakt', grade: '5a', sort: 70, type: 'sport', length: 15, num: 1 },
    { id: 'route-2', sector: 'sector-gavan', name: 'Утренняя разминка', slug: 'utrennyaya-razminka', grade: '5b', sort: 85, type: 'sport', length: 18, num: 2 },
    { id: 'route-3', sector: 'sector-gavan', name: 'Крымский мост', slug: 'krymskiy-most', grade: '6a+', sort: 135, type: 'sport', length: 22, num: 3 },
    { id: 'route-4', sector: 'sector-gavan', name: 'Шторм', slug: 'shtorm', grade: '6c', sort: 190, type: 'sport', length: 25, num: 4 },
    { id: 'route-5', sector: 'sector-gavan', name: 'Капитан', slug: 'kapitan', grade: '7a', sort: 240, type: 'sport', length: 28, num: 5 },
    { id: 'route-6', sector: 'sector-riverside', name: 'Речной поток', slug: 'rechnoy-potok', grade: '5c', sort: 100, type: 'sport', length: 16, num: 1 },
    { id: 'route-7', sector: 'sector-riverside', name: 'Навес', slug: 'naves', grade: '6b+', sort: 170, type: 'sport', length: 20, num: 2 },
    { id: 'route-8', sector: 'sector-riverside', name: 'Водопад', slug: 'vodopad', grade: '7b', sort: 300, type: 'sport', length: 24, num: 3 },
    { id: 'route-9', sector: 'sector-prigorod', name: 'Тропинка', slug: 'tropinka', grade: '4a', sort: 40, type: 'sport', length: 10, num: 1 },
    { id: 'route-10', sector: 'sector-utrenniy', name: 'Солнечный луч', slug: 'solnechnyy-luch', grade: '6a', sort: 120, type: 'sport', length: 20, num: 1 },
  ]

  const routeStmt = db.prepare(`
    INSERT INTO route (id, sector_id, name, slug, grade, grade_system, grade_sort, length_m, pitches, route_type, number_in_sector, status)
    VALUES (?, ?, ?, ?, ?, 'french', ?, ?, 1, ?, ?, 'published')
  `)

  for (const r of routes) {
    routeStmt.run(r.id, r.sector, r.name, r.slug, r.grade, r.sort, r.length, r.type, r.num)
  }

  db.exec('COMMIT')
  console.log(`Seeded: 1 area, ${sectors.length} sectors, ${routes.length} routes.`)
} catch (err) {
  db.exec('ROLLBACK')
  console.error('Seed failed:', err)
  process.exit(1)
}
