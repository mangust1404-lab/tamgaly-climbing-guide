/**
 * Import routes from CSV file into the app's JSON seed format.
 *
 * CSV format (semicolon-separated):
 *   sector;name;grade;type;length_m;pitches;first_ascent;tags
 *
 * Usage:
 *   npx tsx scripts/import-from-csv.ts data/routes.csv > src/lib/db/imported-routes.json
 *
 * Then use the JSON to seed IndexedDB or import into PostgreSQL.
 */

import { readFileSync } from 'fs'

const GRADE_SORT: Record<string, number> = {
  '4a': 40, '4b': 50, '4c': 60,
  '5a': 70, '5b': 85, '5c': 100,
  '6a': 120, '6a+': 135, '6b': 150, '6b+': 170, '6c': 190, '6c+': 210,
  '7a': 240, '7a+': 270, '7b': 300, '7b+': 340, '7c': 380, '7c+': 420,
  '8a': 470, '8a+': 520, '8b': 580, '8b+': 640, '8c': 700,
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[а-яё]/g, (ch) => {
      const map: Record<string, string> = {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo',
        'ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m',
        'н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u',
        'ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch',
        'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
      }
      return map[ch] || ch
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function main() {
  const csvPath = process.argv[2]
  if (!csvPath) {
    console.error('Usage: npx tsx scripts/import-from-csv.ts <path-to-csv>')
    process.exit(1)
  }

  const content = readFileSync(csvPath, 'utf-8')
  const lines = content.trim().split('\n')
  const header = lines[0].split(';').map((h) => h.trim().toLowerCase())

  const routes = []
  const sectorMap = new Map<string, string>()
  let routeNum = 0

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';').map((c) => c.trim())
    const row: Record<string, string> = {}
    header.forEach((h, idx) => { row[h] = cols[idx] || '' })

    const sectorName = row['sector'] || 'Unknown'
    if (!sectorMap.has(sectorName)) {
      sectorMap.set(sectorName, `sector-${slugify(sectorName)}`)
    }

    const grade = row['grade'] || '5a'
    routeNum++

    routes.push({
      id: `route-${routeNum}`,
      sectorId: sectorMap.get(sectorName),
      name: row['name'] || `Route ${routeNum}`,
      slug: slugify(row['name'] || `route-${routeNum}`),
      grade,
      gradeSystem: 'french',
      gradeSort: GRADE_SORT[grade.toLowerCase()] || 0,
      lengthM: row['length_m'] ? parseFloat(row['length_m']) : undefined,
      pitches: row['pitches'] ? parseInt(row['pitches']) : 1,
      routeType: row['type'] || 'sport',
      firstAscent: row['first_ascent'] || undefined,
      tags: row['tags'] ? row['tags'].split(',').map((t) => t.trim()) : [],
      numberInSector: routeNum,
      status: 'published',
    })
  }

  const result = {
    sectors: Array.from(sectorMap.entries()).map(([name, id]) => ({
      id,
      name,
      slug: slugify(name),
    })),
    routes,
  }

  console.log(JSON.stringify(result, null, 2))
}

main()
