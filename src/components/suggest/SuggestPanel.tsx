import { useState, useRef } from 'react'
import { db } from '../../lib/db/schema'
import { useUser } from '../../lib/userContext'
import { useI18n } from '../../lib/i18n'

interface SuggestPanelProps {
  sectorId: string
}

const GRADES = [
  '4', '4a', '4b', '4c',
  '5a', '5a+', '5b', '5b+', '5c', '5c+',
  '6a', '6a+', '6b', '6b+', '6c', '6c+',
  '7a', '7a+', '7b', '7b+', '7c', '7c+',
  '8a', '8a+',
]

export function SuggestPanel({ sectorId }: SuggestPanelProps) {
  const { t } = useI18n()
  const { user } = useUser()
  const [mode, setMode] = useState<'menu' | 'photo' | 'route' | 'sector-info' | null>(null)
  const [sent, setSent] = useState(false)
  const [routeName, setRouteName] = useState('')
  const [routeGrade, setRouteGrade] = useState('6a')
  const [comment, setComment] = useState('')
  const [sectorDesc, setSectorDesc] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  if (!user) {
    return (
      <button
        onClick={() => alert(t('suggest.loginFirst'))}
        className="text-xs text-gray-400 underline"
      >
        + {t('suggest.title')}
      </button>
    )
  }

  if (sent) {
    return (
      <div className="text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2 text-center">
        {t('suggest.sent')}
      </div>
    )
  }

  const submitSuggestion = async (type: 'photo' | 'route' | 'topo-line', data: string, skipClose = false) => {
    const suggestion = {
      id: crypto.randomUUID(),
      userId: user.id,
      userName: user.displayName,
      sectorId,
      type,
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
    if (!skipClose) {
      setSent(true)
      setMode(null)
      setComment('')
      setTimeout(() => setSent(false), 3000)
    }
  }

  const [uploadingPhotos, setUploadingPhotos] = useState(0)

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploadingPhotos(files.length)
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.src = url
      await new Promise<void>(resolve => { img.onload = () => resolve() })

      const canvas = document.createElement('canvas')
      const maxW = 1600
      const scale = img.width > maxW ? maxW / img.width : 1
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
      URL.revokeObjectURL(url)

      const isLast = i === files.length - 1
      await submitSuggestion('photo', dataUrl, !isLast)
      setUploadingPhotos(files.length - i - 1)
    }
    setUploadingPhotos(0)
    e.target.value = ''
  }

  const handleRouteSubmit = async () => {
    if (!routeName.trim()) return
    const data = JSON.stringify({ name: routeName.trim(), grade: routeGrade, type: 'sport' })
    await submitSuggestion('route', data)
    setRouteName('')
  }

  // Menu mode
  if (!mode) {
    return (
      <div className="flex gap-2">
        <button
          onClick={() => setMode('menu')}
          className="text-xs text-blue-600 font-medium"
        >
          + {t('suggest.title')}
        </button>
      </div>
    )
  }

  if (mode === 'menu') {
    return (
      <div className="bg-blue-50 rounded-lg p-3 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">{t('suggest.title')}</span>
          <button onClick={() => setMode(null)} className="text-gray-400 text-xs">&times;</button>
        </div>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => fileRef.current?.click()}
            className="text-left text-sm bg-white rounded-lg px-3 py-2 border border-gray-200"
          >
            📷 {t('suggest.photo')}
          </button>
          <button
            onClick={() => setMode('route')}
            className="text-left text-sm bg-white rounded-lg px-3 py-2 border border-gray-200"
          >
            🧗 {t('suggest.route')}
          </button>
          <button
            onClick={() => setMode('sector-info')}
            className="text-left text-sm bg-white rounded-lg px-3 py-2 border border-gray-200"
          >
            📝 {t('suggest.sectorInfo')}
          </button>
        </div>
        {uploadingPhotos > 0 && (
          <div className="text-xs text-blue-600 text-center">{t('suggest.uploading')} ({uploadingPhotos})</div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handlePhotoUpload}
          className="hidden"
        />
      </div>
    )
  }

  if (mode === 'route') {
    return (
      <div className="bg-blue-50 rounded-lg p-3 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">{t('suggest.route')}</span>
          <button onClick={() => setMode('menu')} className="text-gray-400 text-xs">&larr;</button>
        </div>
        <input
          value={routeName}
          onChange={e => setRouteName(e.target.value)}
          placeholder={t('suggest.routeName')}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <div>
          <label className="text-xs text-gray-500 mb-1 block">{t('suggest.routeGrade')}</label>
          <div className="flex flex-wrap gap-1">
            {GRADES.map(g => (
              <button
                key={g}
                type="button"
                onClick={() => setRouteGrade(g)}
                className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                  routeGrade === g ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder={t('suggest.comment')}
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
        />
        <button
          onClick={handleRouteSubmit}
          disabled={!routeName.trim()}
          className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40"
        >
          {t('suggest.send')}
        </button>
      </div>
    )
  }

  if (mode === 'sector-info') {
    return (
      <div className="bg-blue-50 rounded-lg p-3 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">{t('suggest.sectorInfo')}</span>
          <button onClick={() => setMode('menu')} className="text-gray-400 text-xs">&larr;</button>
        </div>
        <textarea
          value={sectorDesc}
          onChange={e => setSectorDesc(e.target.value)}
          placeholder={t('suggest.sectorDescPlaceholder')}
          rows={4}
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
            if (!sectorDesc.trim()) return
            const data = JSON.stringify({ description: sectorDesc.trim() })
            await submitSuggestion('sector-info' as any, data)
            setSectorDesc('')
          }}
          disabled={!sectorDesc.trim()}
          className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40"
        >
          {t('suggest.send')}
        </button>
      </div>
    )
  }

  return null
}
