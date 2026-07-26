import { useState } from 'react'
import { Haptics } from '@/lib/haptics'

// Quick-add buttons for the highest-frequency inputs on the floor.
//
// Grounded in 60 days of SHIFT4 item sales (queried 2026-07-26): the top five
// items are ALL drinks -- Water 3,268 / Coffee 3,110 / Unsweet Tea 1,116 /
// Sweet Tea 843 / OJ 419 -- roughly a fifth of every item rung up. A server's
// most repeated action is ringing a drink, so it gets buttons, not dictation.
//
// These work with NO network and NO speech: the pilot's classify endpoint is
// tailnet-only and iOS Low Power Mode drops it exactly when a shift is busiest
// (observed 2026-07-26 at 6% battery). Buttons are the floor of the system.
export const QUICK_DRINKS = [
  { label: 'Water', name: 'Water' },
  { label: 'Coffee', name: 'Coffee' },
  { label: 'Unsweet', name: 'Unsweet Ice Tea' },
  { label: 'Sweet Tea', name: 'Sweet Ice Tea' },
  { label: 'OJ', name: 'Orange Juice' },
  { label: 'Dr Pepper', name: 'Dr. Pepper (Refill)' },
] as const

interface QuickAddProps {
  onAdd: (name: string, qty: number) => void
  disabled?: boolean
}

/** One-tap drink row. Long-press-free: tap adds 1, the stepper handles more. */
export function QuickDrinks({ onAdd, disabled }: QuickAddProps) {
  return (
    <div className="w-full">
      <p className="text-gray-dim text-[10px] uppercase tracking-widest mb-2">Quick add</p>
      <div className="grid grid-cols-3 gap-2">
        {QUICK_DRINKS.map(d => (
          <button
            key={d.name}
            disabled={disabled}
            onClick={() => { Haptics.light(); onAdd(d.name, 1) }}
            className="min-h-[52px] rounded-xl bg-surface active:bg-surface-hover
                       border border-white/5 text-white text-[15px] font-medium
                       disabled:opacity-30 transition-colors"
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  )
}

interface PartySizeProps {
  value: number
  onChange: (n: number) => void
  max?: number
}

/** Party-size stepper -- the highest-frequency numeric input in the building. */
export function PartySize({ value, onChange, max = 8 }: PartySizeProps) {
  const sizes = Array.from({ length: max }, (_, i) => i + 1)
  return (
    <div className="w-full">
      <p className="text-gray-dim text-[10px] uppercase tracking-widest mb-2">Party size</p>
      <div className="flex gap-2 flex-wrap">
        {sizes.map(n => (
          <button
            key={n}
            onClick={() => { Haptics.light(); onChange(n) }}
            className={`w-[44px] h-[44px] rounded-full text-[16px] font-semibold
                        border transition-colors ${
              value === n
                ? 'bg-maroon border-maroon text-white'
                : 'bg-surface border-white/5 text-gray active:bg-surface-hover'
            }`}
          >
            {n}
          </button>
        ))}
        <button
          onClick={() => { Haptics.light(); onChange(value >= max ? value + 1 : max + 1) }}
          className="h-[44px] px-4 rounded-full bg-surface border border-white/5
                     text-gray text-[14px] active:bg-surface-hover"
        >
          {value > max ? `${value}` : 'more'}
        </button>
      </div>
    </div>
  )
}

interface SheetProps {
  table: string
  onOpenTable: (table: string, party: number) => void
  onClose: () => void
}

/** Table action sheet: the tap-a-table flow. Open is the dominant action, so it
 *  leads and carries the party stepper inline -- two taps from floor to ticket. */
export function TableActionSheet({ table, onOpenTable, onClose }: SheetProps) {
  const [party, setParty] = useState(2)
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70"
         onClick={onClose}>
      <div className="bg-bg border-t border-white/10 rounded-t-2xl px-4 pt-4
                      pb-[max(env(safe-area-inset-bottom,16px),16px)]"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-white text-2xl font-semibold">{table}</h3>
          <button onClick={onClose} className="text-gray text-[13px] px-2 py-1">Close</button>
        </div>

        <div className="mb-4"><PartySize value={party} onChange={setParty} /></div>

        <button
          onClick={() => { Haptics.medium?.() ?? Haptics.light(); onOpenTable(table, party) }}
          className="w-full min-h-[56px] rounded-xl bg-maroon active:opacity-80
                     text-white text-[17px] font-semibold mb-2"
        >
          Open {table} -- {party} {party === 1 ? 'guest' : 'guests'}
        </button>
        <p className="text-gray-dim text-[11px] text-center">
          Opens a ticket. Add items by tapping or by voice.
        </p>
      </div>
    </div>
  )
}
