import { useState } from 'react'
import { db } from '../../lib/db/schema'

const CONDITIONS = [
  { value: 'dry', label: 'Сухо', emoji: '☀️', color: 'bg-green-100 text-green-700' },
  { value: 'damp', label: 'Влажно', emoji: '💧', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'wet', label: 'Мокро', emoji: '🌧️', color: 'bg-blue-100 text-blue-700' },
  { value: 'icy', label: 'Лёд', emoji: '🧊', color: 'bg-purple-100 text-purple-700' },
] as const

interface ConditionReportProps {
  sectorId: string
  onClose: () => void
}

export function ConditionReport({ sectorId, onClose }: ConditionReportProps) {
  const [condition, setCondition] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!condition) return
    setSaving(true)

    const localId = crypto.randomUUID()
    const now = new Date().toISOString()

    try {
      // Store as a review with conditionsNote
      await db.reviews.add({
        id: localId,
        localId,
        userId: 'local-user',
        routeId: sectorId, // Using routeId field for sectorId in condition reports
        rating: 0,
        conditionsNote: `${condition}${note ? ': ' + note : ''}`,
        syncStatus: 'pending',
        createdAt: now,
      })

      await db.syncQueue.add({
        entity: 'review',
        localId,
        action: 'create',
        payload: { routeId: sectorId, rating: 0, conditionsNote: `${condition}: ${note}` },
        createdAt: Date.now(),
        retryCount: 0,
      })

      onClose()
    } catch (err) {
      console.error('Failed to save condition report:', err)
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
          <h3 className="text-lg font-bold">Условия на секторе</h3>
          <button type="button" onClick={onClose} className="text-gray-400 text-2xl leading-none">
            &times;
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-4">
          {CONDITIONS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCondition(condition === c.value ? '' : c.value)}
              className={`flex flex-col items-center py-3 rounded-lg text-xs transition-colors ${
                condition === c.value
                  ? `${c.color} ring-2 ring-offset-1`
                  : 'bg-gray-50 text-gray-600'
              }`}
            >
              <span className="text-2xl mb-1">{c.emoji}</span>
              <span className="font-medium">{c.label}</span>
            </button>
          ))}
        </div>

        <div className="mb-4">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Доп. информация (лужи у основания, влажная верхняя часть...)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={saving || !condition}
          className="w-full bg-blue-600 text-white rounded-lg py-3 font-medium disabled:opacity-50"
        >
          {saving ? 'Сохранение...' : 'Отправить'}
        </button>
      </form>
    </div>
  )
}
