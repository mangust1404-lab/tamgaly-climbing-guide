import { useState } from 'react'
import { NavLink } from 'react-router-dom'

const ADMIN_PAGES = [
  { to: '/admin/moderation', label: 'Модерация' },
  { to: '/admin/topo', label: 'Топо' },
  { to: '/admin/photos', label: 'Фото' },
  { to: '/admin/sectors', label: 'Секторы' },
]

export function AdminNav() {
  const [updating, setUpdating] = useState(false)
  const [updateMsg, setUpdateMsg] = useState('')

  const forceUpdate = async () => {
    setUpdating(true)
    setUpdateMsg('')
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      if (reg) {
        await reg.update()
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
          setUpdateMsg('Обновлено! Перезагрузка...')
          setTimeout(() => window.location.reload(), 1000)
          return
        }
      }
      // No SW or no update — just hard reload
      setUpdateMsg('Перезагрузка...')
      setTimeout(() => window.location.reload(), 500)
    } catch {
      setUpdateMsg('Ошибка, перезагружаю...')
      setTimeout(() => window.location.reload(), 500)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <nav className="flex items-center gap-1 overflow-x-auto pb-2 mb-3">
      {ADMIN_PAGES.map((p) => (
        <NavLink
          key={p.to}
          to={p.to}
          className={({ isActive }) =>
            `px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`
          }
        >
          {p.label}
        </NavLink>
      ))}
      <button
        onClick={forceUpdate}
        disabled={updating}
        className="ml-auto px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors flex-shrink-0"
      >
        {updating ? '...' : '🔄 Обновить'}
      </button>
      {updateMsg && <span className="text-[10px] text-green-600 flex-shrink-0">{updateMsg}</span>}
    </nav>
  )
}
