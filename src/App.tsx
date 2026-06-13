import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { LoginView } from '@/views/LoginView'
import { MainContainer } from '@/views/MainContainer'

function AppInner() {
  const { staff } = useAuth()

  if (!staff) return <LoginView />

  return <MainContainer />
}

export default function App() {
  // KDS is DISABLED for the Phase 1 notepad pilot. It previously rendered the live
  // ticket board unauthenticated at /kds (anyone with the URL could read and mutate
  // tickets). The route now falls through to the PIN-gated app. Re-enable in Phase 2
  // behind auth + scoped RLS. KDSView/KDSCard/useKDSTickets remain in the tree, unused.
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
