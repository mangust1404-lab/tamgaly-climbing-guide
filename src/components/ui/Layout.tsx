import { Outlet, NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Главная', icon: '🏔' },
  { to: '/map', label: 'Карта', icon: '🗺' },
  { to: '/leaderboard', label: 'Рейтинг', icon: '🏆' },
  { to: '/profile', label: 'Профиль', icon: '👤' },
]

export function Layout() {
  return (
    <div className="flex flex-col min-h-[100dvh]">
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      <nav className="sticky bottom-0 bg-white border-t border-gray-200 px-2 py-1 flex justify-around safe-area-bottom">
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
