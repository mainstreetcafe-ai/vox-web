import { useState, useMemo, useEffect } from 'react'
import { Haptics } from '@/lib/haptics'
import { loadGrammar, type GrammarItem } from '@/services/grammar'
import { Overlay } from './Overlay'

// Grammar-powered item picker: tap a dish, get ITS OWN modifier sets as chips.
//
// The sets come from `vox-grammar.json`, compiled nightly from the POS menu plus
// 40k+ observed (item x modifier) sales rows -- so the chips a server sees are the
// modifiers that dish is actually sold with, ordered by real frequency, including
// the removal sets ("Veg Omlt NO" -> Mushroom). This is SHIFT4's modifier UX,
// driven by our own graph, working entirely offline.
//
// Offline is the point: the classify endpoint is tailnet-only and drops under iOS
// Low Power Mode. Tapping must never depend on the network.

interface Props {
  onAdd: (name: string, qty: number, modifiers: string[]) => void
  onClose: () => void
}

export function ItemPicker({ onAdd, onClose }: Props) {
  const [items, setItems] = useState<GrammarItem[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<GrammarItem | null>(null)
  const [mods, setMods] = useState<string[]>([])
  const [qty, setQty] = useState(1)

  useEffect(() => { loadGrammar().then(g => setItems(g.items)) }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q
      ? items.filter(i => i.name.toLowerCase().includes(q))
      : items.filter(i => i.observed)   // start with what actually sells
    return pool.slice(0, 40)
  }, [items, query])

  const toggle = (m: string) => {
    Haptics.light()
    setMods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }

  const commit = () => {
    if (!selected) return
    Haptics.medium()
    onAdd(selected.name, qty, mods)
    setSelected(null); setMods([]); setQty(1); setQuery('')
  }

  return (
    <Overlay>
    <div className="fixed inset-0 z-50 flex flex-col bg-bg overflow-x-hidden">
      {/* header */}
      <div className="pt-[env(safe-area-inset-top,20px)] px-4 shrink-0 border-b border-white/10">
        <div className="flex items-center justify-between py-3">
          <h3 className="text-white text-[17px] font-semibold">
            {selected ? selected.name : 'Add item'}
          </h3>
          <button
            onClick={() => (selected ? setSelected(null) : onClose())}
            className="text-gray text-[14px] px-2 py-1"
          >
            {selected ? 'Back' : 'Close'}
          </button>
        </div>
        {!selected && (
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search the menu"
            className="w-full mb-3 px-3 h-[44px] rounded-xl bg-surface border border-white/5
                       text-white text-[15px] placeholder:text-gray-dim outline-none"
          />
        )}
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!selected ? (
          <div className="grid grid-cols-2 gap-2">
            {results.map(it => (
              <button
                key={it.name}
                onClick={() => { Haptics.light(); setSelected(it); setMods([]); setQty(1) }}
                className="min-h-[58px] rounded-xl bg-surface active:bg-surface-hover
                           border border-white/5 px-3 py-2 text-left"
              >
                <span className="text-white text-[14px] leading-tight block">{it.name}</span>
                {it.sets.length > 0 && (
                  <span className="text-gray-dim text-[10px]">
                    {it.sets.length} option{it.sets.length === 1 ? '' : 's'}
                  </span>
                )}
              </button>
            ))}
            {results.length === 0 && (
              <p className="text-gray-dim text-[13px] col-span-2 text-center py-6">
                No match. Check the spelling, or use voice.
              </p>
            )}
          </div>
        ) : (
          <div>
            {selected.sets.map(set => (
              <div key={set.set} className="mb-4">
                <p className="text-gray-dim text-[10px] uppercase tracking-widest mb-2">
                  {set.set}
                </p>
                <div className="flex flex-wrap gap-2">
                  {set.modifiers.slice(0, 12).map(m => (
                    <button
                      key={m.name}
                      onClick={() => toggle(m.name)}
                      className={`min-h-[40px] px-3 rounded-full border text-[14px] transition-colors ${
                        mods.includes(m.name)
                          ? 'bg-maroon border-maroon text-white'
                          : 'bg-surface border-white/5 text-gray active:bg-surface-hover'
                      }`}
                    >
                      {m.name}
                      {m.price > 0 && (
                        <span className="text-[11px] opacity-60 ml-1">
                          +${m.price.toFixed(2)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {selected.sets.length === 0 && (
              <p className="text-gray-dim text-[13px] mb-4">No options for this item.</p>
            )}

            <p className="text-gray-dim text-[10px] uppercase tracking-widest mb-2">Quantity</p>
            <div className="flex gap-2 mb-4">
              {[1, 2, 3, 4, 5, 6].map(n => (
                <button
                  key={n}
                  onClick={() => { Haptics.light(); setQty(n) }}
                  className={`w-[44px] h-[44px] rounded-full text-[15px] font-semibold border ${
                    qty === n ? 'bg-maroon border-maroon text-white'
                              : 'bg-surface border-white/5 text-gray'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* commit bar */}
      {selected && (
        <div className="shrink-0 px-4 pt-2 pb-[max(env(safe-area-inset-bottom,16px),16px)]
                        border-t border-white/10">
          <button
            onClick={commit}
            className="w-full min-h-[56px] rounded-xl bg-maroon active:opacity-80
                       text-white text-[17px] font-semibold"
          >
            Add {qty > 1 ? `${qty} x ` : ''}{selected.name}
            {mods.length > 0 ? ` (${mods.length})` : ''}
          </button>
          {mods.length > 0 && (
            <p className="text-gray text-[12px] text-center mt-2">{mods.join(', ')}</p>
          )}
        </div>
      )}
    </div>
    </Overlay>
  )
}
