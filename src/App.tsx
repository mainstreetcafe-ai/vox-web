import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { LoginView } from '@/views/LoginView'
import { MainContainer } from '@/views/MainContainer'

function AppInner() {
  const { staff } = useAuth()

  if (!staff) return <LoginView />

  return <MainContainer />
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
