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
      // PINs are verified server-side: vox_verify_pin (SECURITY DEFINER) checks the
      // bcrypt pin_hash and returns the staff row only on match. The anon key can no
      // longer read pin/pin_hash, so credentials never reach the client bundle.
      const { data, error: queryError } = await supabase.rpc('vox_verify_pin', {
        p_restaurant_id: API_CONFIG.restaurantId,
        p_pin: pin,
      })

      const match = Array.isArray(data) ? data[0] : null
      if (queryError || !match) {
        setError('Incorrect PIN')
        setIsLoading(false)
        return false
      }

      setStaff({ id: match.id, name: match.name, role: match.role })
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
