import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { calculateTotalScore } from '../lib/scoring/points'

const STYLE_COLORS: Record<string, string> = {
  onsight: 'bg-green-100 text-green-700',
  flash: 'bg-yellow-100 text-yellow-700',
  redpoint: 'bg-red-100 text-red-700',
  toprope: 'bg-blue-100 text-blue-700',
  attempt: 'bg-gray-100 text-gray-500',
}

const STYLE_LABELS: Record<string, string> = {
  onsight: 'Онсайт',
  flash: 'Флэш',
  redpoint: 'Редпоинт',
  toprope: 'Топроуп',
  attempt: 'Попытка',
}

export function ProfilePage() {
  const ascents = useLiveQuery(() =>
    db.ascents.orderBy('date').reverse().toArray(),
  )
  const routes = useLiveQuery(() => db.routes.toArray())

  const stats = useMemo(() => {
    if (!ascents || !routes) return null

    const routeMap = new Map(routes.map((r) => [r.id, r]))
    const completed = ascents.filter((a) => a.style !== 'attempt')
    const totalScore = calculateTotalScore(completed.map((a) => a.points))

    // Best grade
    let bestGrade = ''
    let bestGradeSort = 0
    for (const a of completed) {
      const route = routeMap.get(a.routeId)
      if (route && route.gradeSort > bestGradeSort) {
        bestGradeSort = route.gradeSort
        bestGrade = route.grade
      }
    }

    // Style breakdown
    const byStyle: Record<string, number> = {}
    for (const a of ascents) {
      byStyle[a.style] = (byStyle[a.style] || 0) + 1
    }

    // Grade pyramid
    const gradeCount: Record<string, number> = {}
    for (const a of completed) {
      const route = routeMap.get(a.routeId)
      if (route) {
        gradeCount[route.grade] = (gradeCount[route.grade] || 0) + 1
      }
    }
    const pyramid = Object.entries(gradeCount)
      .map(([grade, count]) => ({
        grade,
        count,
        sort: routeMap.get(completed.find((a) => {
          const r = routeMap.get(a.routeId)
          return r?.grade === grade
        })?.routeId || '')?.gradeSort || 0,
      }))
      .sort((a, b) => b.sort - a.sort)

    return {
      totalAscents: ascents.length,
      completedAscents: completed.length,
      totalScore,
      bestGrade,
      byStyle,
      pyramid,
      pending: ascents.filter((a) => a.syncStatus === 'pending').length,
    }
  }, [ascents, routes])

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-1">Профиль</h1>
      <p className="text-gray-400 text-xs mb-4">Локальная статистика пролазов</p>

      {!stats || stats.totalAscents === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">👤</p>
          <p className="text-sm">Пока нет пролазов</p>
          <p className="text-xs mt-1">Открой маршрут и залогируй пролаз</p>
        </div>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-2 mb-6">
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.totalScore}</div>
              <div className="text-xs text-blue-500">Очков</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.bestGrade || '—'}</div>
              <div className="text-xs text-green-500">Макс. категория</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.completedAscents}</div>
              <div className="text-xs text-purple-500">Пролазов</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.pending}</div>
              <div className="text-xs text-orange-500">Ожидает синхр.</div>
            </div>
          </div>

          {/* Style breakdown */}
          <h2 className="text-sm font-semibold mb-2">По стилю</h2>
          <div className="flex flex-wrap gap-2 mb-6">
            {Object.entries(stats.byStyle).map(([style, count]) => (
              <span
                key={style}
                className={`px-2.5 py-1 rounded-full text-xs font-medium ${STYLE_COLORS[style] || 'bg-gray-100'}`}
              >
                {STYLE_LABELS[style] || style}: {count}
              </span>
            ))}
          </div>

          {/* Grade pyramid */}
          {stats.pyramid.length > 0 && (
            <>
              <h2 className="text-sm font-semibold mb-2">Пирамида категорий</h2>
              <div className="space-y-1">
                {stats.pyramid.map(({ grade, count }) => {
                  const maxCount = Math.max(...stats.pyramid.map((p) => p.count))
                  const width = Math.max(20, (count / maxCount) * 100)
                  return (
                    <div key={grade} className="flex items-center gap-2">
                      <span className="w-10 text-xs font-mono text-right text-gray-600">
                        {grade}
                      </span>
                      <div className="flex-1 h-5 bg-gray-50 rounded overflow-hidden">
                        <div
                          className="h-full bg-blue-400 rounded flex items-center px-1.5"
                          style={{ width: `${width}%` }}
                        >
                          <span className="text-[10px] text-white font-medium">{count}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* Admin link */}
      <div className="mt-8 pt-4 border-t border-gray-100">
        <Link
          to="/admin/topo"
          className="text-xs text-gray-400 underline"
        >
          Админ: редактор топо
        </Link>
      </div>
    </div>
  )
}
