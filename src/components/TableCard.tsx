import type { TableSession } from '@/types'
import { formatElapsed } from '@/lib/time'

interface Props {
  table: TableSession
}

const borderColorMap = {
  active: 'bg-maroon',
  attention: 'bg-warning',
  closed: 'bg-success',
  open: 'bg-gray-dim',
}

export function TableCard({ table }: Props) {
  const isOccupied = table.status === 'active' || table.status === 'attention'

  return (
    <div className="bg-surface rounded-xl overflow-hidden flex">
      {/* Left border accent */}
      <div className={`w-1 shrink-0 ${borderColorMap[table.status]}`} />

      <div className="flex-1 flex justify-between items-start px-5 py-4">
        {/* Left side */}
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-white text-[22px] font-bold">{table.tableNumber}</span>
            {isOccupied && (
              <span className="text-gray text-[13px]">{table.guestCount} guests</span>
            )}
          </div>

          {isOccupied && table.openedAt && (
            <p className="text-gray-dim text-xs mt-0.5">
              {formatElapsed(table.openedAt)} -- {table.itemCount} items
            </p>
          )}

          {table.status === 'attention' && (
            <p className="text-warning text-xs font-semibold mt-1">Needs attention</p>
          )}

          {table.status === 'open' && (
            <p className="text-gray-dim text-xs mt-0.5">Open / unsat</p>
          )}
        </div>

        {/* Right side */}
        <div className="text-right">
          {table.status === 'closed' ? (
            <span className="text-success text-[11px] font-semibold">CLOSED</span>
          ) : table.checkTotal > 0 ? (
            <span className="text-white text-xl font-semibold">
              ${table.checkTotal.toFixed(2)}
            </span>
          ) : (
            <span className="text-gray-dim text-sm">--</span>
          )}
        </div>
      </div>
    </div>
  )
}
