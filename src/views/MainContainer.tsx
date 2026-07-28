import { useState, useCallback, useEffect } from 'react'
import { useSwipeable } from 'react-swipeable'
import { PageIndicator } from '@/components/PageIndicator'
import { DashboardView } from './DashboardView'
import { CommandView } from './CommandView'
import { FeedView } from './FeedView'
import { Haptics } from '@/lib/haptics'
import { loadMenu } from '@/services/menuSearch'
import { loadGrammar } from '@/services/grammar'
import { postShiftBriefingIfNeeded } from '@/services/briefing'
import { installFlushTriggers, queueLength } from '@/services/ticketQueue'

export function MainContainer() {
  const [page, setPage] = useState(1) // 0=Dashboard, 1=Command, 2=Feed
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [queued, setQueued] = useState(queueLength())

  // Load menu from Supabase (with localStorage fallback), warm the bundled
  // grammar (transcript repair + pickers need it at startup, not first-tap),
  // and post the daily VIP briefing on first staff login of the day. The
  // briefing is delayed so the Feed's realtime subscription has time to
  // establish; otherwise the INSERT can land before SUBSCRIBED and the
  // briefing never reaches the UI until the next refetch (race observed in
  // pilot on 2026-05-29).
  useEffect(() => {
    loadMenu()
    loadGrammar()
    const t = setTimeout(() => { postShiftBriefingIfNeeded() }, 1500)
    return () => clearTimeout(t)
  }, [])

  // Offline ticket queue: standing flush triggers (online/visible/interval) +
  // live queued-count for the banner. A queued ticket is visible state, never
  // a silent hole.
  useEffect(() => {
    const uninstall = installFlushTriggers()
    const onQueue = (e: Event) =>
      setQueued((e as CustomEvent<{ length: number }>).detail.length)
    window.addEventListener('vox-queue-changed', onQueue)
    return () => {
      uninstall()
      window.removeEventListener('vox-queue-changed', onQueue)
    }
  }, [])

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
        {(!isOnline || queued > 0) && (
          <div className="mx-4 mt-1 rounded-lg bg-warning/10 border border-warning/30 px-3 py-1.5">
            <p className="text-warning text-[11px] text-center leading-snug" role="status">
              {!isOnline
                ? 'Offline -- buttons still work. Tickets save on the phone and sync when back.'
                : `Syncing ${queued} saved ticket${queued === 1 ? '' : 's'}...`}
              {!isOnline && queued > 0 && ` ${queued} ticket${queued === 1 ? '' : 's'} waiting.`}
            </p>
          </div>
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
