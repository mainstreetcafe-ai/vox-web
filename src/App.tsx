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
      {/* Vox is a phone tool. On a wide screen, say so instead of floating the phone UI in black. */}
      <div className="hidden md:flex fixed top-0 inset-x-0 z-50 justify-center bg-maroon/90 text-white text-[13px] py-1.5 px-4 text-center">
        Vox is built for your phone -- open vox.mainstreetcafe.ai on your device
      </div>
      <AppInner />
    </AuthProvider>
  )
}
