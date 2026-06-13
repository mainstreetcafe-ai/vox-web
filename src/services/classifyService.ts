// LLM voice-classify fallback (Workstream B, 2026-06-13).
//
// When the local regex fast-path (commandParser.ts) returns unknown, this asks
// the on-Mini Ollama classifier (vox-classify.mainstreetcafe.ai) to read the
// transcript and maps its structured intent back onto the client's ParsedCommand
// so the existing executor/ticket flow handles it unchanged.
//
// Degrades safely: returns null on no endpoint, low confidence, network error,
// abort, or a non-mappable result -- the caller then posts the line to the Feed
// exactly as before. Never throws.

import { API_CONFIG } from '@/lib/constants'
import type { ParsedCommand } from './commandParser'

// Server intent enum -- mirrors INTENTS in _system/scripts/lib/vox_classify_core.py.
// Keep the two in sync.
type ServerIntent =
  | 'open_table' | 'add_items' | 'menu_lookup' | 'customer_lookup'
  | 'sales_query' | 'staff_query' | 'table_status' | 'seat_table'
  | 'eighty_six' | 'un_eighty_six' | 'unknown'

interface ClassifyResponse {
  intent: ServerIntent
  confidence: number
  entities: {
    table: string | null
    party_size: number | null
    items: { name: string; qty: number }[]
    item_name: string | null
    customer_name: string | null
    query: string | null
  }
  raw_text: string
}

// Valid table universe (mirrors VALID_TABLES in commandParser.ts) -- handed to the
// model as context so it can repair STT slips like "B63 people" -> B6, party 3.
const VALID_TABLES: string[] = [
  ...Array.from({ length: 10 }, (_, i) => `B${i + 1}`),
  ...Array.from({ length: 6 }, (_, i) => `W${i + 1}`),
  ...Array.from({ length: 6 }, (_, i) => `E${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `L${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `P${i + 1}`),
  ...Array.from({ length: 13 }, (_, i) => `R${i + 1}`),
]

const CLASSIFY_TIMEOUT_MS = 4000
// Client treats anything below this as unknown -> Feed (build doc default 0.6).
export const CLASSIFY_CONFIDENCE_THRESHOLD = 0.6

function itemsToString(items: { name: string; qty: number }[]): string {
  return items.map(i => (i.qty > 1 ? `${i.qty} ${i.name}` : i.name)).join(', ')
}

function mapToCommand(r: ClassifyResponse): ParsedCommand | null {
  const e = r.entities
  const base = { confidence: r.confidence, rawTranscript: r.raw_text }
  switch (r.intent) {
    case 'open_table':
      if (!e.table) return null
      return { ...base, intent: 'ticket_start',
        entities: { table_number: e.table, guest_count: String(e.party_size ?? 2) } }
    case 'add_items':
      if (!e.items.length) return null
      return { ...base, intent: 'order_submit',
        entities: { table_number: e.table ?? '', items: itemsToString(e.items) } }
    case 'menu_lookup':
      if (!e.item_name) return null
      return { ...base, intent: 'menu_lookup', entities: { item_name: e.item_name } }
    case 'customer_lookup':
      if (!e.customer_name) return null
      return { ...base, intent: 'customer_lookup', entities: { customer_name: e.customer_name } }
    case 'sales_query':
      return { ...base, intent: 'sales_query', entities: {} }
    case 'staff_query':
      return { ...base, intent: 'staff_check', entities: e.query ? { staff_name: e.query } : {} }
    case 'table_status':
      if (!e.table) return null
      return { ...base, intent: 'table_status', entities: { table_number: e.table } }
    case 'seat_table':
      if (!e.table) return null
      return { ...base, intent: 'seat_table',
        entities: { table_number: e.table, party_size: String(e.party_size ?? 2) } }
    case 'eighty_six':
      if (!e.item_name) return null
      return { ...base, intent: 'eighty_six', entities: { item_name: e.item_name } }
    case 'un_eighty_six':
      if (!e.item_name) return null
      return { ...base, intent: 'un_eighty_six', entities: { item_name: e.item_name } }
    default:
      return null
  }
}

export async function classifyTranscript(transcript: string): Promise<ParsedCommand | null> {
  if (!API_CONFIG.classifyUrl) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS)
  try {
    const resp = await fetch(`${API_CONFIG.classifyUrl}/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_CONFIG.classifyToken ? { Authorization: `Bearer ${API_CONFIG.classifyToken}` } : {}),
      },
      body: JSON.stringify({ transcript, context: { tables: VALID_TABLES } }),
      signal: controller.signal,
    })
    if (!resp.ok) return null
    const data = (await resp.json()) as ClassifyResponse
    if (!data || data.intent === 'unknown') return null
    if (typeof data.confidence !== 'number' || data.confidence < CLASSIFY_CONFIDENCE_THRESHOLD) return null
    return mapToCommand(data)
  } catch {
    return null // network / abort / parse -> degrade to Feed
  } finally {
    clearTimeout(timer)
  }
}
