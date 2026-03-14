import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Route } from '../../lib/db/schema'
import { gradeToTopoColor } from '../../lib/utils'
import { useI18n } from '../../lib/i18n'
import { useUser } from '../../lib/userContext'

const GRADES_ORDERED = [
  '4', '4a', '4b', '4c',
  '5a', '5a+', '5b', '5b+', '5c', '5c+',
  '6a', '6a+', '6b', '6b+', '6c', '6c+',
  '7a', '7a+', '7b', '7b+', '7c', '7c+',
  '8a', '8a+',
]

/** Get nearby grades: ±range around the official grade */
function nearbyGrades(grade: string, range = 3): string[] {
  const idx = GRADES_ORDERED.indexOf(grade)
  if (idx === -1) return GRADES_ORDERED.slice(0, 7)
  const from = Math.max(0, idx - range)
  const to = Math.min(GRADES_ORDERED.length, idx + range + 1)
  return GRADES_ORDERED.slice(from, to)
}

interface GradeVotingProps {
  route: Route
  compact?: boolean
}

export function GradeVoting({ route, compact }: GradeVotingProps) {
  const { t } = useI18n()
  const { user } = useUser()
  const userId = user?.id ?? 'anon'
  const [saving, setSaving] = useState(false)

  const reviews = useLiveQuery(
    () => db.reviews.where('routeId').equals(route.id).toArray(),
    [route.id],
  )

  const myVote = reviews?.find(r => r.userId === userId)?.gradeOpinion
  const votes = reviews?.filter(r => r.gradeOpinion) ?? []

  const gradeCounts: Record<string, number> = {}
  for (const v of votes) {
    if (v.gradeOpinion) gradeCounts[v.gradeOpinion] = (gradeCounts[v.gradeOpinion] || 0) + 1
  }
  const total = votes.length
  const maxCount = Math.max(0, ...Object.values(gradeCounts))

  let consensusGrade: string | null = null
  if (total > 0) {
    consensusGrade = Object.entries(gradeCounts).reduce((a, b) => b[1] > a[1] ? b : a, ['', 0])[0]
  }

  const grades = nearbyGrades(route.grade)

  const handleVote = async (grade: string) => {
    if (saving) return
    setSaving(true)
    try {
      const existing = reviews?.find(r => r.userId === userId)
      if (existing) {
        const newGrade = existing.gradeOpinion === grade ? undefined : grade
        await db.reviews.update(existing.id, { gradeOpinion: newGrade })
      } else {
        const localId = crypto.randomUUID()
        await db.reviews.add({
          id: localId,
          localId,
          userId: userId,
          routeId: route.id,
          rating: 0,
          gradeOpinion: grade,
          syncStatus: 'pending',
          createdAt: new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error('Failed to save grade vote:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={compact ? 'mx-2 my-1 bg-white/80 rounded-lg p-2 border border-gray-200' : 'bg-gray-50 rounded-xl p-3'}>
      {/* Label */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-gray-500 font-medium">{t('route.voteGrade')}</span>
        {total > 0 && consensusGrade && (
          <div className="flex items-center gap-1.5">
            <span
              className="font-mono font-bold px-1.5 py-0.5 rounded text-white text-[11px]"
              style={{ backgroundColor: gradeToTopoColor(consensusGrade) }}
            >
              {consensusGrade}
            </span>
            <span className="text-[10px] text-gray-400">{total} {t('route.people')}</span>
          </div>
        )}
      </div>

      {/* Grade buttons with bars */}
      <div className="flex items-end gap-0.5">
        {grades.map((g) => {
          const count = gradeCounts[g] || 0
          const barH = maxCount > 0 ? Math.max(3, (count / maxCount) * 24) : 0
          const isOfficial = g === route.grade
          const isMyVote = g === myVote
          const color = gradeToTopoColor(g)

          return (
            <button
              key={g}
              onClick={() => handleVote(g)}
              disabled={saving}
              className="flex flex-col items-center flex-1 min-w-0"
            >
              {/* Vote count bar */}
              {count > 0 && (
                <div className="flex flex-col items-center mb-0.5">
                  <span className="text-[8px] text-gray-500 leading-none mb-px">{count}</span>
                  <div
                    className="rounded-sm transition-all duration-200"
                    style={{
                      height: `${barH}px`,
                      width: '100%',
                      minWidth: '14px',
                      backgroundColor: color,
                      opacity: 0.8,
                    }}
                  />
                </div>
              )}
              {/* Grade pill */}
              <div
                className={`w-full text-center text-[10px] font-mono font-bold py-1 rounded transition-all ${
                  isMyVote
                    ? 'text-white shadow-sm'
                    : isOfficial
                      ? 'text-white border-2 border-gray-400'
                      : 'text-gray-700'
                }`}
                style={{
                  backgroundColor: isMyVote
                    ? color
                    : `${color}50`, // 50 = ~30% opacity hex
                }}
              >
                {g}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
