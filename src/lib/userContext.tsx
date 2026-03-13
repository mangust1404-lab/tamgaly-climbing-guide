import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

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
    return newUser
  }, [])

  const updateName = useCallback((name: string) => {
    setUser(prev => {
      if (!prev) return prev
      const updated = { ...prev, displayName: name.trim() }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
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
