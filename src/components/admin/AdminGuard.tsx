import { useState, useEffect } from 'react'
import { isAdminLoggedIn, adminLogin, adminFetch } from '../../lib/adminAuth'

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(isAdminLoggedIn())
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!isAdminLoggedIn()) { setChecking(false); return }
    // Verify token is still valid
    adminFetch('/api/admin/check')
      .then(r => { if (!r.ok) setAuthed(false); setChecking(false) })
      .catch(() => { setAuthed(false); setChecking(false) })
  }, [])

  const handleLogin = async () => {
    setError('')
    const result = await adminLogin(password)
    if (result.ok) {
      setAuthed(true)
    } else {
      setError(result.error || 'Неверный пароль')
    }
  }

  if (checking) return <div className="p-8 text-center text-gray-400">Проверка...</div>

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm">
          <h2 className="text-lg font-bold text-center mb-4">Админ-панель</h2>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="Пароль"
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm mb-3 focus:border-blue-400 focus:outline-none"
          />
          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
          <button
            onClick={handleLogin}
            className="w-full bg-blue-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Войти
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
