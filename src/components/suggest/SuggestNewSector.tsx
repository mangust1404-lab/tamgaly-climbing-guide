import { useState } from 'react'
import { db } from '../../lib/db/schema'
import { useUser } from '../../lib/userContext'
import { useI18n } from '../../lib/i18n'

export function SuggestNewSector() {
  const { t } = useI18n()
  const { user } = useUser()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [comment, setComment] = useState('')
  const [sent, setSent] = useState(false)

  if (sent) {
    return (
      <div className="text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2 text-center">
        {t('suggest.sent')}
      </div>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          if (!user) { alert(t('suggest.loginFirst')); return }
          setOpen(true)
        }}
        className="w-full text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-lg py-2.5 font-medium"
      >
        + {t('suggest.newSector')}
      </button>
    )
  }

  return (
    <div className="bg-blue-50 rounded-lg p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium">{t('suggest.newSector')}</span>
        <button onClick={() => setOpen(false)} className="text-gray-400 text-xs">&times;</button>
      </div>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder={t('suggest.sectorName')}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder={t('suggest.sectorDescPlaceholder')}
        rows={3}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
      />
      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder={t('suggest.comment')}
        rows={2}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
      />
      <button
        onClick={async () => {
          if (!name.trim() || !user?.id) return
          const data = JSON.stringify({ name: name.trim(), description: description.trim() })
          const suggestion = {
            id: crypto.randomUUID(),
            userId: user.id,
            userName: user.displayName,
            sectorId: 'new',
            type: 'sector-info' as const,
            status: 'pending' as const,
            data,
            comment: comment || undefined,
            createdAt: new Date().toISOString(),
          }
          await db.suggestions.add(suggestion)
          await db.syncQueue.add({
            entity: 'suggestion',
            action: 'create',
            localId: suggestion.id,
            payload: suggestion as unknown as Record<string, unknown>,
            createdAt: Date.now(),
            retryCount: 0,
          })
          setName('')
          setDescription('')
          setComment('')
          setOpen(false)
          setSent(true)
          setTimeout(() => setSent(false), 3000)
        }}
        disabled={!name.trim()}
        className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40"
      >
        {t('suggest.send')}
      </button>
    </div>
  )
}
