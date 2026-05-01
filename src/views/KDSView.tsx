import { useEffect, useState } from 'react'
import { useKDSTickets } from '@/hooks/useKDSTickets'
import { KDSCard } from '@/components/KDSCard'

export function KDSView() {
  const { tickets, advance, revert } = useKDSTickets()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const active = tickets.filter(t => t.status !== 'served')
  const recentlyServed = tickets.filter(t => t.status === 'served')

  // Sort: oldest sent/cooking first (FIFO for the line); ready clustered after.
  const sorted = [...active].sort((a, b) => {
    const order: Record<string, number> = { sent: 0, cooking: 1, ready: 2 }
    const oa = order[a.status] ?? 99
    const ob = order[b.status] ?? 99
    if (oa !== ob) return oa - ob
    return a.createdAt.localeCompare(b.createdAt)
  })

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-baseline gap-4">
            <h1 className="text-xl font-black tracking-tight text-white">
              MSC · KDS
            </h1>
            <span className="text-sm text-zinc-400">
              {active.length} active
              {recentlyServed.length > 0 && (
                <span className="text-zinc-600"> · {recentlyServed.length} recently served</span>
              )}
            </span>
          </div>
          <div className="text-sm text-zinc-400 tabular-nums">
            {now.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })}
          </div>
        </div>
      </header>

      {/* Empty state */}
      {tickets.length === 0 && (
        <div className="flex items-center justify-center min-h-[60vh] text-zinc-600">
          <div className="text-center">
            <div className="text-3xl font-black mb-2">All clear</div>
            <div className="text-sm">No active tickets. Standing by for next order.</div>
          </div>
        </div>
      )}

      {/* Ticket grid */}
      <main className="p-4 grid gap-4 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
        {sorted.map(t => (
          <KDSCard key={t.id} ticket={t} onAdvance={advance} onRevert={revert} />
        ))}
        {recentlyServed.map(t => (
          <KDSCard key={t.id} ticket={t} onAdvance={advance} onRevert={revert} />
        ))}
      </main>
    </div>
  )
}
