import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useOfflineStatus } from '../../hooks/useOfflineStatus'
import { useAutoSync } from '../../hooks/useAutoSync'
import { useSwipeBack } from '../../hooks/useSwipeBack'
import { useI18n, LANG_FLAGS, LANG_CYCLE } from '../../lib/i18n'

export function Layout() {
  const isOnline = useOfflineStatus()
  const { syncing, pendingCount, lastResult, lastError, doSync } = useAutoSync()
  const { t, lang, setLang } = useI18n()
  const location = useLocation()
  useSwipeBack()

  const isMapPage = location.pathname === '/map'

  const bottomNav = [
    { to: '/leaderboard', label: t('nav.leaderboard'), icon: '🏆' },
    { to: '/activity', label: t('nav.activity'), icon: '📡' },
    { to: '/map', label: t('nav.map'), icon: '🗺' },
    { to: '/', label: t('nav.home'), icon: '🏔' },
  ]

  return (
    <div className="flex flex-col h-[100dvh]">
      {/* Top-right: profile + language */}
      <div className="fixed top-0 right-0 z-50 flex items-center gap-1 px-2 py-1 bg-white/80 backdrop-blur rounded-bl-lg shadow-sm">
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
              isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
            }`
          }
        >
          <span className="text-sm">👤</span>
          <span className="text-[10px]">{t('nav.profile')}</span>
        </NavLink>
        <button
          onClick={() => {
            const idx = LANG_CYCLE.indexOf(lang)
            setLang(LANG_CYCLE[(idx + 1) % LANG_CYCLE.length])
          }}
          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-gray-600 hover:bg-gray-100 transition-colors"
          title="Switch language"
        >
          <span className="text-sm">{LANG_FLAGS[lang]}</span>
          <span className="text-[10px]">{lang.toUpperCase()}</span>
        </button>
      </div>

      {/* Status bar: offline or pending sync — below top-right buttons */}
      {!isOnline ? (
        <div className="flex items-center justify-center px-3 py-1.5 mt-9 text-xs bg-gray-100 text-gray-600">
          {t('status.offline')}
        </div>
      ) : pendingCount > 0 ? (
        <button
          onClick={doSync}
          disabled={syncing}
          className={`flex flex-col items-center justify-center gap-0.5 px-3 py-2 mt-9 text-xs font-medium transition-colors cursor-pointer border-b ${
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
        <div className="flex items-center justify-center px-3 py-1 mt-9 text-xs bg-green-50 text-green-600">
          ✓ {lastResult.pushed > 0 ? `↑${lastResult.pushed}` : ''} {lastResult.pulled > 0 ? `↓${lastResult.pulled}` : ''}
        </div>
      ) : null}

      {/* Spacer for top-right fixed buttons when no status bar is shown */}
      {isOnline && pendingCount === 0 && !(lastResult && lastResult.pushed + lastResult.pulled > 0) && !isMapPage && (
        <div className="h-9 flex-shrink-0" />
      )}

      <main className={`flex-1 flex flex-col min-h-0 relative ${isMapPage ? 'overflow-hidden' : 'overflow-y-auto pb-14'}`}>
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 px-2 py-1 flex justify-around items-center safe-bottom">
        {bottomNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center px-3 py-1 text-xs transition-colors ${
                isActive ? 'text-blue-600' : 'text-gray-500'
              }`
            }
          >
            <span className="text-lg">{item.icon}</span>
            <span className="text-[10px]">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
