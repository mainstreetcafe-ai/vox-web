import { useState, useCallback, useEffect } from 'react'
import { useSwipeable } from 'react-swipeable'
import { PageIndicator } from '@/components/PageIndicator'
import { DashboardView } from './DashboardView'
import { CommandView } from './CommandView'
import { FeedView } from './FeedView'
import { Haptics } from '@/lib/haptics'

export function MainContainer() {
  const [page, setPage] = useState(1) // 0=Dashboard, 1=Command, 2=Feed
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  // Listen for online/offline
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const swipeTo = useCallback((dir: number) => {
    setPage(p => {
      const next = p + dir
      if (next < 0 || next > 2) return p
      Haptics.light()
      return next
    })
  }, [])

  const handlers = useSwipeable({
    onSwipedLeft: () => swipeTo(1),
    onSwipedRight: () => swipeTo(-1),
    trackMouse: false,
    preventScrollOnSwipe: true,
    delta: 50,
  })

  return (
    <div className="h-full flex flex-col bg-bg" {...handlers}>
      {/* Top bar -- padded below Dynamic Island */}
      <div className="pt-[env(safe-area-inset-top,20px)] shrink-0">
        <div className="pt-2">
        <PageIndicator pageCount={3} currentPage={page} />
        {!isOnline && (
          <p className="text-warning text-[10px] text-center mt-1">Offline</p>
        )}
        </div>
      </div>

      {/* Swipe container */}
      <div className="flex-1 relative overflow-hidden">
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ width: '300%', transform: `translateX(-${page * 33.333}%)` }}
        >
          <div className="w-1/3 h-full"><DashboardView /></div>
          <div className="w-1/3 h-full"><CommandView /></div>
          <div className="w-1/3 h-full"><FeedView /></div>
        </div>
      </div>
    </div>
  )
}
