import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { LoginView } from '@/views/LoginView'
import { MainContainer } from '@/views/MainContainer'
import { KDSView } from '@/views/KDSView'

function AppInner() {
  const { staff } = useAuth()

  if (!staff) return <LoginView />

  return <MainContainer />
}

export default function App() {
  // Kitchen Display System — back-of-house, no auth, separate audience.
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/kds')) {
    return <KDSView />
  }

  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
