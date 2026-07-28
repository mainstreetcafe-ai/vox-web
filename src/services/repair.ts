// Deterministic transcript repair BEFORE parse/classify -- the TS port of
// _system/scripts/lib/vox_repair.py (keep the two in sync; python is the
// reference implementation, proven on the real 2026-07-26 pilot failures).
//
// Why client-side: the phone loses the tailnet under iOS Low Power Mode exactly
// when a shift is busiest, so repair cannot depend on network. The grammar
// already ships in the bundle; this layer runs against it offline.
//
// House rules (the matcher discipline, applied to speech):
// - Deterministic. No model call. Same input -> same output.
// - Refuse-on-ambiguity: two candidates at the same edit distance = NO repair.
// - Every repair is REPORTED, never silent: the UI shows "heard X -> using Y".

import type { Grammar } from './grammar'

export interface Repair {
  from: string
  to: string
  kind: 'table' | 'table-split' | 'stt-confusion' | 'menu-word'
  distance: number
}

export interface RepairResult {
  text: string
  original: string
  repairs: Repair[]
  changed: boolean
}

// Words that must NEVER be fuzzy-repaired into menu vocabulary. Mirrors
// PROTECTED in vox_repair.py -- curated, not inferred.
const PROTECTED = new Set([
  'people', 'person', 'guests', 'guest', 'table', 'tables', 'party', 'top', 'tops',
  'order', 'orders', 'check', 'checks', 'split', 'side', 'sides', 'with', 'without',
  'please', 'thanks', 'thank', 'want', 'wants', 'would', 'like', 'need', 'needs',
  'have', 'here', 'there', 'them', 'they', 'that', 'this', 'then', 'than', 'some',
  'just', 'make', 'made', 'give', 'take', 'took', 'open', 'close', 'closed', 'seat',
  'seated', 'unsat', 'ready', 'wait', 'waiting', 'more', 'another', 'extra', 'half',
  'well', 'done', 'medium', 'rare', 'over', 'easy', 'hard', 'instead', 'also', 'only',
  'next', 'last', 'first', 'back', 'left', 'right', 'going', 'gonna', 'okay', 'yeah',
  'sorry', 'again', 'still', 'about', 'around', 'everything', 'anything', 'nothing',
])

// Table universe (mirrors VALID_TABLES in commandParser.ts)
const SECTIONS: Record<string, number> = { B: 10, W: 6, E: 6, L: 10, P: 9, R: 13 }
const VALID_TABLES = new Set(
  Object.entries(SECTIONS).flatMap(([s, n]) =>
    Array.from({ length: n }, (_, i) => `${s}${i + 1}`)),
)

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
}

// Letter-name confusions the STT makes on single-letter table sections.
const LETTER_SOUNDS: Record<string, string[]> = {
  b: ['bee', 'be', 'bbc', 'bb', 'b'],
  w: ['double you', 'double u', 'w'],
  e: ['ee', 'e'],
  l: ['el', 'ell', 'l'],
  p: ['pea', 'pee', 'p'],
  r: ['are', 'ar', 'r'],
}
const SOUND_TO_LETTER: Record<string, string> = {}
for (const [L, sounds] of Object.entries(LETTER_SOUNDS))
  for (const s of sounds) SOUND_TO_LETTER[s] = L.toUpperCase()

// Curated STT confusions -- phonetic pairs edit distance cannot reach.
// Mirror of _system/data/vox-stt-confusions.json (add rows there first; the
// python selftest guards them). Bundled so repair works with no network.
const CONFUSIONS: Record<string, string> = {
  'copies': 'coffees',
  'copy': 'coffee',
  'coffe': 'coffee',
  'cofee': 'coffee',
  "pancake's": 'pancakes',
  'omelet': 'omelette',
  'hash brown': 'hash browns',
  'hashbrown': 'hash browns',
  'scramble': 'scrambled',
  'benedic': 'benedict',
  'mimosas': 'mimosa',
  'waffles': 'waffle',
}

const MIN_FUZZY_LEN = 4
const MAX_DIST_RATIO = 0.34

/** Levenshtein distance, iterative two-row (mirror of _lev). */
function lev(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)))
    }
    prev = cur
  }
  return prev[b.length]
}

/** Build the repair word-vocabulary from the bundled grammar. */
export function buildVocab(grammar: Grammar): Set<string> {
  const words = new Set<string>()
  const addWords = (name: string) => {
    for (const w of name.toLowerCase().match(/[a-z]+/g) ?? [])
      if (w.length >= MIN_FUZZY_LEN) words.add(w)
  }
  for (const it of grammar.items) {
    addWords(it.name)
    for (const s of it.sets) for (const m of s.modifiers) addWords(m.name)
  }
  for (const m of grammar.global_modifiers) addWords(m.name)
  return words
}

/** Closest vocabulary word, or null when ambiguous / too far (refuse). */
function bestWord(token: string, vocab: Set<string>): { word: string; d: number } | null {
  if (vocab.has(token) || token.length < MIN_FUZZY_LEN) return null
  let best: string | null = null
  let bestD = 99
  let runnerD = 99
  for (const cand of vocab) {
    if (Math.abs(cand.length - token.length) > 2) continue
    const d = lev(token, cand)
    if (d < bestD) { best = cand; runnerD = bestD; bestD = d }
    else if (d < runnerD) runnerD = d
  }
  if (best === null || bestD > Math.max(1, Math.floor(best.length * MAX_DIST_RATIO))) return null
  if (bestD === runnerD) return null // ambiguous -- refuse
  return { word: best, d: bestD }
}

/** Repair mangled table ids: 'BBC one' -> 'B1'; 'B13 people' -> 'B1 3 people'. */
function repairTables(text: string, reps: Repair[]): string {
  const sounds = Object.keys(SOUND_TO_LETTER).sort((a, b) => b.length - a.length)
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const nums = [...Object.keys(NUMBER_WORDS), '\\d{1,2}'].join('|')
  const pat = new RegExp(`\\b(${sounds.map(esc).join('|')})\\s*[- ]?\\s*(${nums})\\b`, 'gi')

  let out = text.replace(pat, (m, soundRaw: string, numRaw: string) => {
    const letter = SOUND_TO_LETTER[soundRaw.toLowerCase()]
    const n = NUMBER_WORDS[numRaw.toLowerCase()] ?? parseInt(numRaw, 10)
    if (letter === undefined || Number.isNaN(n)) return m
    const tid = `${letter}${n}`
    if (VALID_TABLES.has(tid) && m.toUpperCase().replace(/\s/g, '') !== tid) {
      reps.push({ from: m, to: tid, kind: 'table', distance: 0 })
      return tid
    }
    return m
  })

  // run-together table+party: 'B13 people' -> 'B1 3 people' (B13 is not a table)
  out = out.replace(/\b([BWELPRbwelpr])(\d{2,3})(\s+(?:people|guests|top|party))\b/g,
    (m, letterRaw: string, digits: string, tail: string) => {
      const letter = letterRaw.toUpperCase()
      if (VALID_TABLES.has(`${letter}${digits}`)) return m
      for (const cut of [1, 2]) {
        const head = digits.slice(0, cut)
        const rest = digits.slice(cut)
        if (rest && VALID_TABLES.has(`${letter}${head}`)) {
          const to = `${letter}${head} ${rest}`
          reps.push({ from: m, to, kind: 'table-split', distance: 0 })
          return to + tail
        }
      }
      return m
    })
  return out
}

/** Repair a transcript against the grammar vocabulary. Pure + deterministic. */
export function repairTranscript(text: string, vocab: Set<string>): RepairResult {
  const repairs: Repair[] = []
  let out = repairTables(text, repairs)

  out = out.replace(/\b[A-Za-z]{4,}\b/g, (tok) => {
    const low = tok.toLowerCase()
    const fixed = CONFUSIONS[low]
    if (fixed) {
      repairs.push({ from: tok, to: fixed, kind: 'stt-confusion', distance: 0 })
      return /^[A-Z]/.test(tok) ? fixed[0].toUpperCase() + fixed.slice(1) : fixed
    }
    if (PROTECTED.has(low) || vocab.has(low) || low in NUMBER_WORDS) return tok
    const cand = bestWord(low, vocab)
    if (!cand) return tok
    repairs.push({ from: tok, to: cand.word, kind: 'menu-word', distance: cand.d })
    return /^[A-Z]/.test(tok) ? cand.word[0].toUpperCase() + cand.word.slice(1) : cand.word
  })

  return { text: out, original: text, repairs, changed: out !== text }
}

/** One-line human summary for the UI: 'heard "BBC one" -> using "B1"'. */
export function describeRepairs(r: RepairResult): string {
  if (!r.changed) return ''
  return r.repairs.map(x => `heard "${x.from}" -> using "${x.to}"`).join('; ')
}

// per-grammar vocab memo -- the grammar object is a stable singleton from
// loadGrammar(), so one build serves the whole session
let vocabCache: { grammar: Grammar; vocab: Set<string> } | null = null

export function vocabFor(grammar: Grammar): Set<string> {
  if (vocabCache?.grammar !== grammar) {
    vocabCache = { grammar, vocab: buildVocab(grammar) }
  }
  return vocabCache.vocab
}
