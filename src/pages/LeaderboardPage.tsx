import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { calculateTotalScore } from '../lib/scoring/points'

type Period = 'all' | 'month' | 'week'

const STYLE_LABELS: Record<string, string> = {
  onsight: 'OS',
  flash: 'FL',
  redpoint: 'RP',
  toprope: 'TR',
}

export function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>('all')

  const ascents = useLiveQuery(() =>
    db.ascents.where('style').notEqual('attempt').toArray(),
  )

  const routes = useLiveQuery(() => db.routes.toArray())
  const users = useLiveQuery(() => db.users.toArray())

  const leaderboard = useMemo(() => {
    if (!ascents) return []

    const now = Date.now()
    const filtered = ascents.filter((a) => {
      if (period === 'all') return true
      const date = new Date(a.date).getTime()
      if (period === 'week') return now - date < 7 * 86400000
      if (period === 'month') return now - date < 30 * 86400000
      return true
    })

    // Group by userId
    const byUser = new Map<string, typeof filtered>()
    for (const a of filtered) {
      const arr = byUser.get(a.userId) || []
      arr.push(a)
      byUser.set(a.userId, arr)
    }

    const entries = Array.from(byUser.entries()).map(([userId, userAscents]) => {
      const points = userAscents.map((a) => a.points)
      const totalScore = calculateTotalScore(points)
      const user = users?.find((u) => u.id === userId)

      // Best ascent
      const best = userAscents.reduce((b, a) => (a.points > b.points ? a : b), userAscents[0])
      const bestRoute = routes?.find((r) => r.id === best.routeId)

      return {
        userId,
        displayName: user?.displayName || 'Скалолаз',
        totalScore,
        ascentCount: userAscents.length,
        bestGrade: bestRoute?.grade || '?',
        bestStyle: best.style,
      }
    })

    return entries.sort((a, b) => b.totalScore - a.totalScore)
  }, [ascents, users, routes, period])

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Таблица лидеров</h1>

      {/* Period filter */}
      <div className="flex gap-1 mb-4">
        {([['all', 'Всё время'], ['month', 'Месяц'], ['week', 'Неделя']] as const).map(
          ([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                period === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {label}
            </button>
          ),
        )}
      </div>

      {leaderboard.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🏆</p>
          <p className="text-sm">Пока нет пролазов</p>
          <p className="text-xs mt-1">Залогируй свой первый маршрут!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((entry, idx) => (
            <div
              key={entry.userId}
              className={`flex items-center gap-3 p-3 rounded-lg ${
                idx === 0
                  ? 'bg-yellow-50 border border-yellow-200'
                  : idx === 1
                    ? 'bg-gray-50 border border-gray-200'
                    : idx === 2
                      ? 'bg-orange-50 border border-orange-200'
                      : 'bg-white border border-gray-100'
              }`}
            >
              {/* Rank */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                idx === 0 ? 'bg-yellow-400 text-white' :
                idx === 1 ? 'bg-gray-400 text-white' :
                idx === 2 ? 'bg-orange-400 text-white' :
                'bg-gray-100 text-gray-500'
              }`}>
                {idx + 1}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {entry.displayName}
                </div>
                <div className="text-xs text-gray-400">
                  {entry.ascentCount} пролаз{entry.ascentCount === 1 ? '' : entry.ascentCount < 5 ? 'а' : 'ов'}
                  {' · '}макс {entry.bestGrade} {STYLE_LABELS[entry.bestStyle] || ''}
                </div>
              </div>

              {/* Score */}
              <div className="text-right">
                <div className="font-bold text-blue-600">{entry.totalScore}</div>
                <div className="text-[10px] text-gray-400">очков</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
