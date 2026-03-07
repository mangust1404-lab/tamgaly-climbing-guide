import { Outlet, NavLink } from 'react-router-dom'
import { useOfflineStatus } from '../../hooks/useOfflineStatus'
import { useSync } from '../../hooks/useSync'

const navItems = [
  { to: '/', label: 'Главная', icon: '🏔' },
  { to: '/map', label: 'Карта', icon: '🗺' },
  { to: '/leaderboard', label: 'Рейтинг', icon: '🏆' },
  { to: '/profile', label: 'Профиль', icon: '👤' },
]

export function Layout() {
  const isOnline = useOfflineStatus()
  const { pendingCount, syncing, sync } = useSync()

  return (
    <div className="flex flex-col min-h-[100dvh]">
      {/* Offline / sync status bar */}
      {(!isOnline || pendingCount > 0) && (
        <div className={`flex items-center justify-between px-3 py-1.5 text-xs ${
          isOnline ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
        }`}>
          <span>
            {!isOnline && 'Офлайн'}
            {isOnline && pendingCount > 0 && `${pendingCount} ожидает синхронизации`}
          </span>
          {isOnline && pendingCount > 0 && (
            <button
              onClick={sync}
              disabled={syncing}
              className="font-medium underline"
            >
              {syncing ? 'Синхронизация...' : 'Синхронизировать'}
            </button>
          )}
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      <nav className="sticky bottom-0 bg-white border-t border-gray-200 px-2 py-1 flex justify-around">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center px-3 py-1 text-xs transition-colors ${
                isActive ? 'text-blue-600' : 'text-gray-500'
              }`
            }
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
