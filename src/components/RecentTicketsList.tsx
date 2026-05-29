import type { MyTicketRow } from '@/hooks/useMyTickets'

interface Props {
  tickets: MyTicketRow[]
  onMarkDone: (id: string) => void
}

// Server's saved tickets today. Pending tickets (status='sent') show a Done
// button. Completed ones are muted. Use case: after entering an order in
// SHIFT4, the server taps Done here to confirm it was logged.
export function RecentTicketsList({ tickets, onMarkDone }: Props) {
  if (tickets.length === 0) return null

  const pending = tickets.filter(t => t.status === 'sent')
  const done = tickets.filter(t => t.status === 'done')

  return (
    <div className="mx-4 mb-4">
      <p className="text-gray-dim text-[11px] font-semibold uppercase tracking-wider mb-2 px-1">
        Today's Tickets ({pending.length} pending)
      </p>
      <div className="flex flex-col gap-2">
        {pending.map(t => <TicketRow key={t.id} ticket={t} onMarkDone={onMarkDone} />)}
        {done.map(t => <TicketRow key={t.id} ticket={t} onMarkDone={onMarkDone} />)}
      </div>
    </div>
  )
}

function TicketRow({ ticket, onMarkDone }: { ticket: MyTicketRow; onMarkDone: (id: string) => void }) {
  const isPending = ticket.status === 'sent'
  const time = new Date(ticket.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const summary = ticket.items
    .slice(0, 3)
    .map(i => (i.quantity > 1 ? `${i.quantity}x ` : '') + i.menuItemName)
    .join(', ')
  const extra = ticket.items.length > 3 ? ` +${ticket.items.length - 3} more` : ''

  return (
    <div className={`p-3 rounded-lg ${isPending ? 'bg-surface border border-maroon/40' : 'bg-surface opacity-60'}`}>
      <div className="flex justify-between items-start mb-1">
        <div className="flex items-baseline gap-2">
          <span className="text-white font-bold tracking-wide">{ticket.tableNumber}</span>
          <span className="text-gray text-xs">{ticket.guestCount}g</span>
          <span className="text-gray-dim text-xs">{time}</span>
        </div>
        {isPending ? (
          <button
            onClick={() => onMarkDone(ticket.id)}
            className="bg-maroon text-white text-xs px-3 py-1 rounded-md font-medium active:opacity-80 transition-opacity"
          >
            Done
          </button>
        ) : (
          <span className="text-gray-dim text-[11px] uppercase tracking-wider">Done</span>
        )}
      </div>
      <p className="text-gray text-[13px] leading-snug">
        {summary || '(no items)'}
        {extra}
      </p>
    </div>
  )
}
