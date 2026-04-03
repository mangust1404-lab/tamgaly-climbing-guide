import { useEffect, useState } from 'react'
import type { MotivationMessage } from '../../lib/scoring/motivation'

interface Props {
  messages: MotivationMessage[]
  onDone: () => void
}

export function MotivationToast({ messages, onDone }: Props) {
  const [current, setCurrent] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (current >= messages.length) {
      onDone()
      return
    }
    setVisible(true)
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => setCurrent(c => c + 1), 300)
    }, 3000)
    return () => clearTimeout(timer)
  }, [current, messages.length, onDone])

  if (current >= messages.length) return null
  const msg = messages[current]

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
      <div
        className={`pointer-events-auto bg-white rounded-2xl shadow-2xl px-6 py-5 max-w-xs text-center transition-all duration-300 border-2 ${
          msg.type === 'celebrate' ? 'border-yellow-400' :
          msg.type === 'streak' ? 'border-orange-400' :
          msg.type === 'milestone' ? 'border-blue-400' :
          'border-green-400'
        } ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}
        onClick={() => { setVisible(false); setTimeout(() => setCurrent(c => c + 1), 200) }}
      >
        <div className="text-5xl mb-2">{msg.icon}</div>
        <div className="text-lg font-bold">{msg.title}</div>
        {msg.subtitle && <div className="text-sm text-gray-500 mt-1">{msg.subtitle}</div>}
      </div>
    </div>
  )
}
