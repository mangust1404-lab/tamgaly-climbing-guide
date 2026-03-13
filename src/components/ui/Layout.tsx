import { Outlet, NavLink } from 'react-router-dom'
import { useOfflineStatus } from '../../hooks/useOfflineStatus'
import { useI18n } from '../../lib/i18n'

export function Layout() {
  const isOnline = useOfflineStatus()
  const { t, lang, setLang } = useI18n()

  const navItems = [
    { to: '/', label: t('nav.home'), icon: '🏔' },
    { to: '/map', label: t('nav.map'), icon: '🗺' },
    { to: '/profile', label: t('nav.profile'), icon: '👤' },
  ]

  return (
    <div className="flex flex-col h-[100dvh]">
      {/* Offline indicator */}
      {!isOnline && (
        <div className="flex items-center justify-center px-3 py-1.5 text-xs bg-gray-100 text-gray-600">
          {t('status.offline')}
        </div>
      )}

      <main className="flex-1 overflow-y-auto flex flex-col min-h-0">
        <Outlet />
      </main>

      <nav className="flex-shrink-0 bg-white border-t border-gray-200 px-2 py-1 flex justify-around items-center">
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
        <button
          onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}
          className="text-xs text-gray-400 px-1 py-1 uppercase font-mono"
          title="Switch language"
        >
          {lang === 'ru' ? 'EN' : 'RU'}
        </button>
      </nav>
    </div>
  )
}
