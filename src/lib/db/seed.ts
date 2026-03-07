import { db } from './schema'
import type { Area, Sector, Route } from './schema'

/**
 * Seed database with sample Tamgaly-Tas data.
 * In production, this data would come from the server via "Download Area" flow.
 */
export async function seedDemoData() {
  const existingAreas = await db.areas.count()
  if (existingAreas > 0) return // Already seeded

  const area: Area = {
    id: 'area-tamgaly',
    name: 'Тамгалы-Тас',
    slug: 'tamgaly-tas',
    description: 'Скалолазный район на берегу реки Или, 120 км от Алматы. Гранитные скалы, ~200 маршрутов от 5b до 8a.',
    latitude: 43.805,
    longitude: 75.535,
    bboxNorth: 43.815,
    bboxSouth: 43.795,
    bboxEast: 75.545,
    bboxWest: 75.525,
    approachInfo: 'От Алматы ~1.5-2 часа на машине на север через Капчагай. Есть ворота на входе.',
    accessNotes: 'Сезон: март-май, сентябрь-ноябрь. Летом слишком жарко.',
    rockType: 'granite',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const sectors: Sector[] = [
    {
      id: 'sector-gavan',
      areaId: 'area-tamgaly',
      name: 'Гавань',
      slug: 'gavan',
      description: 'Ущелье, окружённое скалами. Плиты (до 7b) и лёгкие мультипитчи.',
      latitude: 43.804,
      longitude: 75.534,
      approachDescription: 'От ворот прямо по тропе, ~10 минут.',
      approachTimeMin: 10,
      orientation: 'Юг',
      sunExposure: 'Утром тень, днём солнце',
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sector-riverside',
      areaId: 'area-tamgaly',
      name: 'Ривёрсайд',
      slug: 'riverside',
      description: 'Более сложные маршруты (до 8a) и мультипитчи. Ближе к реке.',
      latitude: 43.806,
      longitude: 75.536,
      approachDescription: 'От ворот направо вдоль забора, потом к реке, ~15 минут.',
      approachTimeMin: 15,
      orientation: 'Запад',
      sunExposure: 'Утром тень, после обеда солнце',
      sortOrder: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sector-prigorod',
      areaId: 'area-tamgaly',
      name: 'Пригород',
      slug: 'prigorod',
      description: 'Новый сектор с маршрутами 6-7 категории.',
      latitude: 43.803,
      longitude: 75.533,
      approachDescription: 'От основного сектора налево, 5 минут.',
      approachTimeMin: 5,
      orientation: 'Юго-восток',
      sunExposure: 'Утром солнце',
      sortOrder: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sector-utrenniy',
      areaId: 'area-tamgaly',
      name: 'Утренний',
      slug: 'utrenniy',
      description: 'Восемь лёгких маршрутов для новичков.',
      latitude: 43.802,
      longitude: 75.532,
      approachDescription: 'Рядом с Пригородом, 2 минуты.',
      approachTimeMin: 7,
      orientation: 'Восток',
      sunExposure: 'Утром солнце, днём тень',
      sortOrder: 4,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]

  // Sample routes for Gavan sector
  const routes: Route[] = [
    {
      id: 'route-1', sectorId: 'sector-gavan', name: 'Разминка', slug: 'razminka',
      grade: '5b', gradeSystem: 'french', gradeSort: 85, lengthM: 15, pitches: 1,
      routeType: 'sport', description: '', numberInSector: 1,
      tags: ['slab'], status: 'published',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: 'route-2', sectorId: 'sector-gavan', name: 'Первые шаги', slug: 'pervye-shagi',
      grade: '5c', gradeSystem: 'french', gradeSort: 100, lengthM: 18, pitches: 1,
      routeType: 'sport', description: '', numberInSector: 2,
      tags: ['face'], status: 'published',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: 'route-3', sectorId: 'sector-gavan', name: 'Классика', slug: 'klassika',
      grade: '6a', gradeSystem: 'french', gradeSort: 120, lengthM: 20, pitches: 1,
      routeType: 'sport', description: '', numberInSector: 3,
      tags: ['slab', 'crimps'], status: 'published',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: 'route-4', sectorId: 'sector-gavan', name: 'Гранитный угол', slug: 'granitny-ugol',
      grade: '6b+', gradeSystem: 'french', gradeSort: 170, lengthM: 22, pitches: 1,
      routeType: 'sport', description: '', numberInSector: 4,
      tags: ['corner', 'crimps'], status: 'published',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: 'route-5', sectorId: 'sector-gavan', name: 'Щель капитана', slug: 'shchel-kapitana',
      grade: '6c', gradeSystem: 'french', gradeSort: 190, lengthM: 25, pitches: 1,
      routeType: 'trad', description: '', protection: 'Камы 0.5-3',
      numberInSector: 5, tags: ['crack'], status: 'published',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: 'route-6', sectorId: 'sector-riverside', name: 'Речной бриз', slug: 'rechnoy-briz',
      grade: '7a', gradeSystem: 'french', gradeSort: 240, lengthM: 28, pitches: 1,
      routeType: 'sport', description: '', numberInSector: 1,
      tags: ['overhang', 'endurance'], status: 'published',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: 'route-7', sectorId: 'sector-riverside', name: 'Проект Или', slug: 'proekt-ili',
      grade: '7b+', gradeSystem: 'french', gradeSort: 340, lengthM: 30, pitches: 1,
      routeType: 'sport', description: '', numberInSector: 2,
      tags: ['overhang', 'power'], status: 'published',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: 'route-8', sectorId: 'sector-riverside', name: 'Мультипитч Ривёрсайд', slug: 'multipitch-riverside',
      grade: '6a', gradeSystem: 'french', gradeSort: 120, lengthM: 60, pitches: 3,
      routeType: 'multi-pitch', description: '', numberInSector: 3,
      tags: ['multi-pitch', 'slab'], status: 'published',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: 'route-9', sectorId: 'sector-prigorod', name: 'Новосёл', slug: 'novosel',
      grade: '6b', gradeSystem: 'french', gradeSort: 150, lengthM: 20, pitches: 1,
      routeType: 'sport', description: '', numberInSector: 1,
      tags: ['face'], status: 'published',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: 'route-10', sectorId: 'sector-utrenniy', name: 'Доброе утро', slug: 'dobroe-utro',
      grade: '5a', gradeSystem: 'french', gradeSort: 70, lengthM: 12, pitches: 1,
      routeType: 'sport', description: '', numberInSector: 1,
      tags: ['slab', 'beginner'], status: 'published',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
  ]

  await db.transaction('rw', [db.areas, db.sectors, db.routes], async () => {
    await db.areas.add(area)
    await db.sectors.bulkAdd(sectors)
    await db.routes.bulkAdd(routes)
  })

  console.log('Demo data seeded: 1 area, 4 sectors, 10 routes')
}
