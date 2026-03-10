import { useState } from 'react'
import { db } from '../../lib/db/schema'
import { useI18n } from '../../lib/i18n'
import type { Route } from '../../lib/db/schema'

const GRADE_OPINIONS = ['Soft', 'Fair', 'Hard'] as const

interface ReviewFormProps {
  route: Route
  onClose: () => void
}

export function ReviewForm({ route, onClose }: ReviewFormProps) {
  const { t } = useI18n()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [gradeOpinion, setGradeOpinion] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rating === 0) return
    setSaving(true)

    const localId = crypto.randomUUID()
    const now = new Date().toISOString()

    try {
      await db.reviews.add({
        id: localId,
        localId,
        userId: 'local-user',
        routeId: route.id,
        rating,
        comment: comment || undefined,
        gradeOpinion: gradeOpinion || undefined,
        syncStatus: 'pending',
        createdAt: now,
      })

      await db.syncQueue.add({
        entity: 'review',
        localId,
        action: 'create',
        payload: { routeId: route.id, rating, comment, gradeOpinion },
        createdAt: Date.now(),
        retryCount: 0,
      })

      onClose()
    } catch (err) {
      console.error('Failed to save review:', err)
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
          <h3 className="text-lg font-bold">{t('review.title')}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 text-2xl leading-none">
            &times;
          </button>
        </div>

        <div className="text-sm text-gray-500 mb-4">
          <span className="font-mono font-bold text-blue-700">{route.grade}</span>{' '}
          {route.name}
        </div>

        {/* Star rating */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 mb-1 block">{t('review.routeQuality')}</label>
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
            {t('review.grade')} {route.grade}
          </label>
          <div className="flex gap-2">
            {GRADE_OPINIONS.map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => setGradeOpinion(gradeOpinion === op ? '' : op)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  gradeOpinion === op
                    ? op === 'Soft' ? 'bg-green-100 text-green-700 ring-2 ring-green-400'
                      : op === 'Hard' ? 'bg-red-100 text-red-700 ring-2 ring-red-400'
                      : 'bg-blue-100 text-blue-700 ring-2 ring-blue-400'
                    : 'bg-gray-50 text-gray-600'
                }`}
              >
                {t(`review.gradeOpinion.${op}` as any)}
              </button>
            ))}
          </div>
        </div>

        {/* Comment */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 mb-1 block">{t('review.comment')}</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder={t('review.commentPlaceholder')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={saving || rating === 0}
          className="w-full bg-blue-600 text-white rounded-lg py-3 font-medium disabled:opacity-50"
        >
          {saving ? t('saving') : t('review.submit')}
        </button>
      </form>
    </div>
  )
}
