import { Outlet, NavLink } from 'react-router-dom'
import { useOfflineStatus } from '../../hooks/useOfflineStatus'
import { useAutoSync } from '../../hooks/useAutoSync'
import { useI18n, LANG_FLAGS, LANG_CYCLE } from '../../lib/i18n'

export function Layout() {
  const isOnline = useOfflineStatus()
  const { syncing, pendingCount, lastResult, lastError, doSync } = useAutoSync()
  const { t, lang, setLang } = useI18n()

  const navItems = [
    { to: '/', label: t('nav.home'), icon: '🏔' },
    { to: '/map', label: t('nav.map'), icon: '🗺' },
    { to: '/leaderboard', label: t('nav.leaderboard'), icon: '🏆' },
    { to: '/activity', label: t('nav.activity'), icon: '📡' },
    { to: '/profile', label: t('nav.profile'), icon: '👤' },
  ]

  return (
    <div className="flex flex-col h-[100dvh]">
      {/* Status bar: offline or pending sync */}
      {!isOnline ? (
        <div className="flex items-center justify-center px-3 py-1.5 text-xs bg-gray-100 text-gray-600">
          {t('status.offline')}
        </div>
      ) : pendingCount > 0 ? (
        <button
          onClick={doSync}
          disabled={syncing}
          className={`flex flex-col items-center justify-center gap-0.5 px-3 py-2 text-xs font-medium transition-colors cursor-pointer border-b ${
            lastError
              ? 'bg-red-100 text-red-800 border-red-200'
              : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 active:bg-yellow-300 border-yellow-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{syncing ? '⏳' : lastError ? '⚠️' : '🔄'}</span>
            <span>{syncing ? t('status.syncing') : `${t('status.pending', { n: pendingCount })} — ${t('status.sync')}`}</span>
          </div>
          {lastError && !syncing && (
            <span className="text-[10px] text-red-600 truncate max-w-[90vw]">{lastError}</span>
          )}
        </button>
      ) : lastResult && lastResult.pushed + lastResult.pulled > 0 ? (
        <div className="flex items-center justify-center px-3 py-1 text-xs bg-green-50 text-green-600">
          ✓ {lastResult.pushed > 0 ? `↑${lastResult.pushed}` : ''} {lastResult.pulled > 0 ? `↓${lastResult.pulled}` : ''}
        </div>
      ) : null}

      <main className="flex-1 overflow-y-auto flex flex-col min-h-0 pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 px-2 py-1 flex justify-around items-center safe-bottom">
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
          onClick={() => {
            const idx = LANG_CYCLE.indexOf(lang)
            setLang(LANG_CYCLE[(idx + 1) % LANG_CYCLE.length])
          }}
          className="text-lg px-1 py-1"
          title="Switch language"
        >
          {LANG_FLAGS[lang]}
        </button>
      </nav>
    </div>
  )
}
