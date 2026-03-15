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
  register: (name: string) => LocalUser
  restore: (user: LocalUser) => void
  lookupByName: (name: string) => Promise<Array<{ id: string; display_name: string; created_at: string }>>
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

  const register = useCallback((displayName: string) => {
    const newUser: LocalUser = {
      id: crypto.randomUUID(),
      displayName: displayName.trim(),
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser))
    setUser(newUser)
    // Save to local DB so leaderboard can find the user
    db.users.put({
      id: newUser.id,
      displayName: newUser.displayName,
      createdAt: newUser.createdAt,
      updatedAt: newUser.createdAt,
    } as any).catch(() => {})
    // Sync to server (fire-and-forget)
    syncUser(newUser).catch(() => {})
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
    <UserCtx.Provider value={{ user, register, restore, lookupByName, updateName }}>
      {children}
    </UserCtx.Provider>
  )
}

export function useUser() {
  return useContext(UserCtx)
}
