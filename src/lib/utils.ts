/** Route type → Russian label */
export function routeTypeLabel(type: string): string {
  switch (type) {
    case 'sport': return 'спорт'
    case 'trad': return 'трад'
    case 'boulder': return 'боулдер'
    case 'multi-pitch': return 'мультипитч'
    default: return type
  }
}

/** Grade → color class for the badge */
export function gradeColor(grade: string): string {
  const g = grade.toLowerCase()
  if (g.startsWith('4') || g.startsWith('5a') || g.startsWith('5b')) return 'bg-green-100 text-green-800'
  if (g.startsWith('5c') || g.startsWith('6a')) return 'bg-blue-100 text-blue-800'
  if (g.startsWith('6b') || g.startsWith('6c')) return 'bg-yellow-100 text-yellow-800'
  if (g.startsWith('7a') || g.startsWith('7b')) return 'bg-orange-100 text-orange-800'
  if (g.startsWith('7c') || g.startsWith('8')) return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-800'
}

/** Unique sorted list of grade "groups" from routes, for filter chips */
export function gradeGroups(grades: string[]): string[] {
  const groups = new Set<string>()
  for (const g of grades) {
    // Extract group like "5a", "6b", "7c" (without +)
    const match = g.match(/^(\d[a-c]?)/i)
    if (match) groups.add(match[1])
  }
  return [...groups].sort((a, b) => {
    const numA = parseInt(a), numB = parseInt(b)
    if (numA !== numB) return numA - numB
    return a.localeCompare(b)
  })
}
