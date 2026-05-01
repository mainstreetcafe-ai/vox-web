import { useEffect, useState } from 'react'
import type { KDSTicket } from '@/types'

interface KDSCardProps {
  ticket: KDSTicket
  onAdvance: (id: string, status: KDSTicket['status']) => void
  onRevert: (id: string, status: KDSTicket['status']) => void
}

const ADVANCE_LABEL: Record<KDSTicket['status'], string> = {
  sent: 'START',
  cooking: 'READY',
  ready: 'OUT',
  served: '',
}

const STATUS_LABEL: Record<KDSTicket['status'], string> = {
  sent: 'NEW',
  cooking: 'COOKING',
  ready: 'READY',
  served: 'SERVED',
}

function elapsedSeconds(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`
}

function elapsedColorClass(seconds: number, status: KDSTicket['status']): string {
  if (status === 'served') return 'bg-zinc-700'
  if (status === 'ready') return 'bg-blue-700'
  // For active tickets (sent/cooking) escalate by elapsed time since created.
  if (seconds < 5 * 60) return 'bg-emerald-700'
  if (seconds < 10 * 60) return 'bg-amber-700'
  return 'bg-rose-700'
}

export function KDSCard({ ticket, onAdvance, onRevert }: KDSCardProps) {
  const [, force] = useState(0)
  // Tick every second for the elapsed badge.
  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const sinceCreated = elapsedSeconds(ticket.createdAt)
  const sinceStatusChange = elapsedSeconds(ticket.statusChangedAt)
  const colorClass = elapsedColorClass(sinceCreated, ticket.status)

  // Group items by seat
  const seats = new Map<number, typeof ticket.items>()
  for (const item of ticket.items) {
    const arr = seats.get(item.seat) ?? []
    arr.push(item)
    seats.set(item.seat, arr)
  }
  const seatNumbers = Array.from(seats.keys()).sort((a, b) => a - b)

  const isFading = ticket.status === 'served'

  return (
    <div
      className={`rounded-2xl overflow-hidden flex flex-col bg-zinc-900 border-2 transition-opacity duration-500 ${
        isFading ? 'opacity-60 border-zinc-700' : 'border-zinc-800'
      }`}
    >
      {/* Header */}
      <div className={`${colorClass} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-black tracking-tight text-white">
            {ticket.tableNumber}
          </span>
          <span className="text-sm font-medium text-white/85">
            {ticket.guestCount}g · {ticket.orderType === 'to_go' ? 'TO GO' : 'DINE IN'}
          </span>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-white/75 leading-tight">
            {STATUS_LABEL[ticket.status]}
          </div>
          <div className="text-xl font-bold text-white tabular-nums leading-tight">
            {formatElapsed(sinceCreated)}
          </div>
        </div>
      </div>

      {/* Items grouped by seat */}
      <div className="flex-1 px-4 py-3 space-y-3">
        {seatNumbers.map(seat => (
          <div key={seat}>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
              {seat === 0 ? 'Shared' : `Seat ${seat}`}
            </div>
            <ul className="space-y-1">
              {(seats.get(seat) ?? []).map((item, idx) => (
                <li key={idx} className="text-zinc-100">
                  <span className="font-semibold text-base">
                    {item.quantity > 1 && <span className="text-amber-400 mr-1">{item.quantity}×</span>}
                    {item.menuItemName}
                  </span>
                  {item.modifiers.length > 0 && (
                    <ul className="pl-4 mt-0.5 space-y-0.5">
                      {item.modifiers.map((m, j) => (
                        <li key={j} className="text-sm text-amber-300">
                          ▸ {m.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Server + bump bar */}
      <div className="border-t border-zinc-800">
        <div className="px-4 py-2 text-xs text-zinc-500 flex items-center justify-between">
          <span>{ticket.serverName}</span>
          {ticket.status !== 'sent' && (
            <button
              onClick={() => onRevert(ticket.id, ticket.status)}
              className="text-zinc-400 hover:text-zinc-200 underline"
            >
              undo
            </button>
          )}
        </div>
        {ticket.status !== 'served' && (
          <button
            onClick={() => onAdvance(ticket.id, ticket.status)}
            className="w-full py-4 text-lg font-bold tracking-wide text-white bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 transition-colors"
          >
            {ADVANCE_LABEL[ticket.status]} →
          </button>
        )}
        {ticket.status === 'served' && (
          <div className="w-full py-3 text-center text-sm text-zinc-500">
            served · {formatElapsed(sinceStatusChange)} ago
          </div>
        )}
      </div>
    </div>
  )
}
