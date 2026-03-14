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
    <UserCtx.Provider value={{ user, register, updateName }}>
      {children}
    </UserCtx.Provider>
  )
}

export function useUser() {
  return useContext(UserCtx)
}
