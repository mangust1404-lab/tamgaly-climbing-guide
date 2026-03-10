/** Grade → topo line color (traffic light by difficulty) */
export function gradeToTopoColor(grade: string): string {
  const g = grade.toLowerCase()
  if (g.startsWith('4')) return '#3B82F6'       // blue - 4s
  if (g.startsWith('5')) return '#F59E0B'        // amber/yellow - 5s
  if (g.startsWith('6')) return '#22C55E'        // green - 6s
  if (g.startsWith('7')) return '#EF4444'        // red - 7s
  if (g.startsWith('8')) return '#1F2937'        // black - 8s
  return '#6B7280'                               // gray - unknown
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
