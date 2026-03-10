import { useState } from 'react'
import { db } from '../../lib/db/schema'
import { calculatePoints } from '../../lib/scoring/points'
import { useI18n } from '../../lib/i18n'
import type { Route } from '../../lib/db/schema'

const STYLE_KEYS = [
  { value: 'onsight', key: 'style.onsight', emoji: '🔴' },
  { value: 'flash', key: 'style.flash', emoji: '⚡' },
  { value: 'redpoint', key: 'style.redpoint', emoji: '🟢' },
  { value: 'toprope', key: 'style.toprope', emoji: '🔵' },
  { value: 'attempt', key: 'style.attempt', emoji: '⬜' },
] as const

const GRADES = [
  '4', '4a', '4b', '4c',
  '5a', '5a+', '5b', '5b+', '5c', '5c+',
  '6a', '6a+', '6b', '6b+', '6c', '6c+',
  '7a', '7a+', '7b', '7b+', '7c', '7c+',
  '8a', '8a+',
]

interface AscentFormProps {
  route: Route
  onClose: () => void
  onSaved?: () => void
}

export function AscentForm({ route, onClose, onSaved }: AscentFormProps) {
  const { t } = useI18n()
  const [style, setStyle] = useState<string>('redpoint')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [rating, setRating] = useState(0)
  const [gradeFeeling, setGradeFeeling] = useState<'soft' | 'fair' | 'hard' | null>(null)
  const [personalGrade, setPersonalGrade] = useState('')
  const [saving, setSaving] = useState(false)

  const points = calculatePoints(route.grade, style)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const localId = crypto.randomUUID()
    const now = new Date().toISOString()

    try {
      // Save ascent to local DB
      await db.ascents.add({
        id: localId,
        localId,
        userId: 'local-user', // will be replaced after auth
        routeId: route.id,
        date,
        style: style as any,
        rating: rating || undefined,
        personalGrade: personalGrade || (gradeFeeling && gradeFeeling !== 'fair' ? `${gradeFeeling}:${route.grade}` : undefined),
        notes: notes || undefined,
        isPublic: true,
        points,
        syncStatus: 'pending',
        createdAt: now,
      })

      // Add to sync queue
      await db.syncQueue.add({
        entity: 'ascent',
        localId,
        action: 'create',
        payload: { routeId: route.id, date, style, rating, notes, points },
        createdAt: Date.now(),
        retryCount: 0,
      })

      onSaved?.()
      onClose()
    } catch (err) {
      console.error('Failed to save ascent:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <form
        onSubmit={handleSubmit}
        className="bg-white w-full rounded-t-2xl p-4 pb-8 animate-slide-up"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">{t('ascent.title')}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 text-2xl leading-none">
            &times;
          </button>
        </div>

        <div className="text-sm text-gray-500 mb-4">
          <span className="font-mono font-bold text-blue-700">{route.grade}</span>{' '}
          {route.name}
        </div>

        {/* Style selection */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 mb-2 block">{t('ascent.style')}</label>
          <div className="grid grid-cols-5 gap-1">
            {STYLE_KEYS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStyle(s.value)}
                className={`flex flex-col items-center py-2 rounded-lg text-xs transition-colors ${
                  style === s.value
                    ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500'
                    : 'bg-gray-50 text-gray-600'
                }`}
              >
                <span className="text-lg">{s.emoji}</span>
                <span className="mt-0.5">{t(s.key as any)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 mb-1 block">{t('ascent.date')}</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {/* Rating */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 mb-1 block">
            {t('ascent.rating')}
          </label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star === rating ? 0 : star)}
                className={`text-2xl ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        {/* Grade opinion */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            {route.grade} — {t('ascent.gradeOpinion')}
          </label>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {([['soft', t('route.softer')], ['fair', t('route.fair')], ['hard', t('route.harder')]] as const).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => { setGradeFeeling(gradeFeeling === val ? null : val); if (val === 'fair') setPersonalGrade('') }}
                className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                  gradeFeeling === val
                    ? val === 'soft' ? 'bg-green-100 text-green-700 ring-2 ring-green-500'
                      : val === 'hard' ? 'bg-red-100 text-red-700 ring-2 ring-red-500'
                      : 'bg-blue-100 text-blue-700 ring-2 ring-blue-500'
                    : 'bg-gray-50 text-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {(gradeFeeling === 'soft' || gradeFeeling === 'hard') && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                {t('ascent.yourGrade')}
              </label>
              <div className="flex flex-wrap gap-1">
                {GRADES.filter(g => {
                  const ri = GRADES.indexOf(route.grade)
                  if (ri === -1) return true
                  return gradeFeeling === 'soft'
                    ? GRADES.indexOf(g) < ri && GRADES.indexOf(g) >= ri - 4
                    : GRADES.indexOf(g) > ri && GRADES.indexOf(g) <= ri + 4
                }).map(g => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setPersonalGrade(personalGrade === g ? '' : g)}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition-colors ${
                      personalGrade === g
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 mb-1 block">{t('ascent.notes')}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={t('ascent.notesPlaceholder')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
          />
        </div>

        {/* Points preview */}
        {points > 0 && (
          <div className="text-center text-sm text-blue-600 font-medium mb-4">
            +{points} {t('route.points')}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-green-600 text-white rounded-lg py-3 font-medium disabled:opacity-50"
        >
          {saving ? t('saving') : t('save')}
        </button>
      </form>
    </div>
  )
}
