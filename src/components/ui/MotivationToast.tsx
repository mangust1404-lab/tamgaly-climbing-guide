import { useEffect, useRef, useState } from 'react'
import type { MotivationMessage } from '../../lib/scoring/motivation'

interface Props {
  messages: MotivationMessage[]
  onDone: () => void
}

export function MotivationToast({ messages, onDone }: Props) {
  const [visible, setVisible] = useState(true)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  // Show first message, auto-close after 3.5s
  useEffect(() => {
    const fadeTimer = setTimeout(() => setVisible(false), 3000)
    const closeTimer = setTimeout(() => onDoneRef.current(), 3500)
    return () => { clearTimeout(fadeTimer); clearTimeout(closeTimer) }
  }, [])

  if (messages.length === 0) return null
  const msg = messages[0]

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={() => { setVisible(false); setTimeout(() => onDoneRef.current(), 200) }}
    >
      <div className="absolute inset-0 bg-black/20" />
      <div
        className={`relative bg-white rounded-2xl shadow-2xl px-8 py-6 max-w-xs text-center transition-all duration-300 border-2 ${
          msg.type === 'celebrate' ? 'border-yellow-400' :
          msg.type === 'streak' ? 'border-orange-400' :
          msg.type === 'milestone' ? 'border-blue-400' :
          'border-green-400'
        } ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}
      >
        <div className="text-5xl mb-3">{msg.icon}</div>
        <div className="text-lg font-bold">{msg.title}</div>
        {msg.subtitle && <div className="text-sm text-gray-500 mt-1">{msg.subtitle}</div>}
        {messages.length > 1 && (
          <div className="mt-2 text-xs text-gray-400">
            {messages.slice(1).map((m, i) => (
              <span key={i} className="mr-1">{m.icon} {m.title}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
