// Grammar service -- loads the compiled menu graph for offline item + modifier UI.
//
// `vox-grammar.json` is built nightly by _system/scripts/vox-grammar-builder.py from
// the POS menu joined to 40k+ observed (item x modifier) sales rows. It ships IN the
// bundle (~58KB) and is cached in localStorage, so the picker and transcript repair
// work with no network -- the tailnet classify endpoint drops under iOS Low Power
// Mode exactly when a shift is busiest (observed 2026-07-26).

export interface GrammarModifier { name: string; price: number; freq: number }
export interface GrammarSet { set: string; modifiers: GrammarModifier[] }
export interface GrammarItem { name: string; observed: boolean; sets: GrammarSet[] }
export interface Grammar {
  schema: number
  items: GrammarItem[]
  global_modifiers: GrammarModifier[]
  aliases: Record<string, string>
}

const CACHE_KEY = 'vox_grammar_v1'
let cached: Grammar | null = null

const EMPTY: Grammar = { schema: 1, items: [], global_modifiers: [], aliases: {} }

export async function loadGrammar(): Promise<Grammar> {
  if (cached) return cached
  // localStorage first: instant, and survives a dead network on a cold start.
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) { cached = JSON.parse(raw) as Grammar; return cached }
  } catch { /* corrupt cache -- fall through to the bundled copy */ }

  try {
    const res = await fetch(`${import.meta.env.BASE_URL}vox-grammar.json`)
    if (!res.ok) throw new Error(`grammar fetch ${res.status}`)
    const g = (await res.json()) as Grammar
    cached = g
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(g)) } catch { /* quota */ }
    return g
  } catch {
    // Never block the floor on a missing artifact -- the picker just shows empty
    // and voice/regex still work.
    cached = EMPTY
    return cached
  }
}

export function grammarSync(): Grammar | null { return cached }
