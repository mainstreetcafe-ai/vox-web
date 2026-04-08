import type { Ticket } from '@/types'

interface Props {
  ticket: Ticket
  onSend: () => void
  onCancel: () => void
}

export function TicketView({ ticket, onSend, onCancel }: Props) {
  const isSent = ticket.status === 'sent'

  return (
    <div className="bg-[#1a1a1a] rounded-lg border border-gray-dim/20 p-4">
      {/* Header */}
      <div className="flex justify-between items-baseline mb-4 border-b border-gray-dim/20 pb-3">
        <div>
          <span className="text-xl font-bold tracking-wide">{ticket.tableNumber}</span>
          <span className="text-gray text-sm ml-3">
            {ticket.guestCount} guest{ticket.guestCount !== 1 ? 's' : ''}
          </span>
        </div>
        <span className="text-gray text-sm">{ticket.serverName}</span>
      </div>

      {/* Items */}
      <div className="space-y-3 min-h-[80px]">
        {ticket.items.length === 0 ? (
          <p className="text-gray-dim text-sm text-center py-6">
            Tap the ring and say an item
          </p>
        ) : (
          ticket.items.map((item, idx) => (
            <div
              key={`${idx}-${item.rawUtterance}`}
              className="transition-all duration-300"
              style={{
                animation: 'ticketItemIn 0.3s ease-out',
              }}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  {item.quantity > 1 && (
                    <span className="text-maroon font-bold mr-1.5">{item.quantity}x</span>
                  )}
                  <span className="font-medium">{item.menuItemName}</span>
                  {item.menuItemPrice !== null && (
                    <span className="text-gray-dim text-xs ml-2">
                      ${item.menuItemPrice.toFixed(2)}
                    </span>
                  )}
                </div>
                {item.seat > 0 && (
                  <span className="text-gray-dim text-xs ml-2 whitespace-nowrap">
                    Seat {item.seat}
                  </span>
                )}
              </div>
              {item.modifiers.length > 0 && (
                <div className="ml-4 mt-0.5 text-sm text-gray">
                  {item.modifiers.map((mod, mi) => (
                    <span key={mi}>
                      {mi > 0 && <span className="text-gray-dim mx-1">/</span>}
                      {mod.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Actions */}
      {ticket.items.length > 0 && !isSent && (
        <div className="mt-5 flex gap-3 border-t border-gray-dim/20 pt-4">
          <button
            onClick={onSend}
            className="flex-1 bg-maroon text-white py-3 rounded-lg font-medium text-base active:opacity-80 transition-opacity"
          >
            Send Order
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-3 text-gray text-sm active:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {isSent && (
        <div className="mt-5 text-center py-2">
          <span className="text-green-400 font-medium">Order sent</span>
        </div>
      )}

      <style>{`
        @keyframes ticketItemIn {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
