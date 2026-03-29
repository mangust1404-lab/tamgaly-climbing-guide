import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { db } from './db/schema'
import { syncUser } from './offline/syncService'

const STORAGE_KEY = 'tamgaly_user'

export interface LocalUser {
  id: string
  displayName: string
  createdAt: string
}

interface UserContextValue {
  user: LocalUser | null
  register: (name: string, pin?: string) => LocalUser
  restore: (user: LocalUser) => void
  lookupByName: (name: string) => Promise<Array<{ id: string; display_name: string; created_at: string; has_pin: number }>>
  verifyPin: (userId: string, pin: string) => Promise<boolean>
  setPin: (pin: string) => Promise<boolean>
  updateName: (name: string) => void
}

const UserCtx = createContext<UserContextValue>(null!)

function loadUser(): LocalUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(loadUser)

  const register = useCallback((displayName: string, pin?: string) => {
    const newUser: LocalUser = {
      id: crypto.randomUUID(),
      displayName: displayName.trim(),
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser))
    setUser(newUser)
    db.users.put({
      id: newUser.id,
      displayName: newUser.displayName,
      createdAt: newUser.createdAt,
      updatedAt: newUser.createdAt,
    } as any).catch(() => {})
    syncUser(newUser).then(() => {
      if (pin) {
        const API_BASE = import.meta.env.VITE_API_URL || '/api'
        fetch(`${API_BASE}/sync/user/set-pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: newUser.id, pin }),
        }).catch(() => {})
      }
    }).catch(() => {})
    return newUser
  }, [])

  const lookupByName = useCallback(async (name: string) => {
    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    try {
      const res = await fetch(`${API_BASE}/sync/user/lookup?name=${encodeURIComponent(name.trim())}`)
      if (!res.ok) return []
      return await res.json()
    } catch {
      return []
    }
  }, [])

  const restore = useCallback((restored: LocalUser) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(restored))
    setUser(restored)
    db.users.put({
      id: restored.id,
      displayName: restored.displayName,
      createdAt: restored.createdAt,
      updatedAt: restored.createdAt,
    } as any).catch(() => {})
    syncUser(restored).catch(() => {})
  }, [])

  const verifyPin = useCallback(async (userId: string, pin: string) => {
    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    try {
      const res = await fetch(`${API_BASE}/sync/user/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, pin }),
      })
      if (!res.ok) return false
      const data = await res.json()
      return data.valid === true
    } catch {
      return false
    }
  }, [])

  const setPin = useCallback(async (pin: string) => {
    if (!user) return false
    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    try {
      const res = await fetch(`${API_BASE}/sync/user/set-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, pin }),
      })
      return res.ok
    } catch {
      return false
    }
  }, [user])

  const updateName = useCallback((name: string) => {
    setUser(prev => {
      if (!prev) return prev
      const updated = { ...prev, displayName: name.trim() }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      // Update local DB
      db.users.update(updated.id, { displayName: updated.displayName, updatedAt: new Date().toISOString() }).catch(() => {})
      // Sync to server
      syncUser(updated).catch(() => {})
      return updated
    })
  }, [])

  return (
    <UserCtx.Provider value={{ user, register, restore, lookupByName, verifyPin, setPin, updateName }}>
      {children}
    </UserCtx.Provider>
  )
}

export function useUser() {
  return useContext(UserCtx)
}
