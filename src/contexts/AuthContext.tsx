import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { API_CONFIG } from '@/lib/constants'

export interface StaffMember {
  id: string
  name: string
  role: 'owner' | 'manager' | 'server' | 'host' | 'kitchen'
}

interface AuthContextValue {
  staff: StaffMember | null
  isLoading: boolean
  error: string | null
  login: (pin: string) => Promise<boolean>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffMember | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const login = useCallback(async (pin: string): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      const { data, error: queryError } = await supabase
        .from('vox_staff')
        .select('id, name, role')
        .eq('restaurant_id', API_CONFIG.restaurantId)
        .eq('pin', pin)
        .eq('is_active', true)
        .single()

      if (queryError || !data) {
        setError('Incorrect PIN')
        setIsLoading(false)
        return false
      }

      setStaff({ id: data.id, name: data.name, role: data.role })
      setIsLoading(false)
      return true
    } catch {
      setError('Connection error')
      setIsLoading(false)
      return false
    }
  }, [])

  const logout = useCallback(() => {
    setStaff(null)
    setError(null)
  }, [])

  return (
    <AuthContext.Provider value={{ staff, isLoading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
