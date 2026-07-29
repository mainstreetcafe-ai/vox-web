// Offline ticket sync queue (2026-07-27) -- the "dropped call must never look
// like a misunderstanding" layer.
//
// Pattern adapted from block/buzz's optimistic-send + echo reconciliation
// (desktop messageMerge.ts, Apache 2.0), transposed to Supabase: a ticket the
// server dictated is CAPTURED the moment it exists locally (localKey), queued
// in localStorage, and synced when the network allows. On sync, the server id
// is reconciled onto the in-memory ticket by localKey -- identity preserved,
// nothing flickers, no duplicate insert.
//
// Hardened 2026-07-29 against the K3 adversarial findings (F1-F5, F13):
// inserts are idempotent on vox_tickets.local_key (a retry with a lost
// response, or a cross-tab double-flush, converges to the same row); storage
// failure falls back to an in-memory mirror and is REPORTED, a corrupt blob is
// quarantined, never overwritten; each sync lands in a durable sync-map BEFORE
// the transient echo event; a Done that arrives mid-insert is reconciled after
// the insert instead of discarded; a hung fetch times out instead of wedging
// the flusher.
//
// Visible-failure doctrine: a queued ticket is a STATE the server can see
// ("saved on phone -- waiting for network"), never a silent hole. The queue
// count is surfaced in the offline banner; every transition fires
// 'vox-queue-changed'; a successful sync fires 'vox-ticket-synced'.

import { supabase } from '@/lib/supabase'
import { API_CONFIG } from '@/lib/constants'
import type { TicketItem, OrderType } from '@/types'

const QUEUE_KEY = 'vox_ticket_queue_v1'
const SYNCMAP_KEY = 'vox_ticket_syncmap_v1'
const SYNC_TIMEOUT_MS = 15_000
const SYNCMAP_MAX = 50

export interface QueuedCreate {
  kind: 'create'
  localKey: string
  queuedAt: string
  tableNumber: string
  serverId: string
  serverName: string
  guestCount: number
  orderType: OrderType
  items: TicketItem[]
  checkTotal: number
  markDoneAfterSync?: boolean
}

export interface QueuedMarkDone {
  kind: 'mark_done'
  localKey: string
  queuedAt: string
  ticketId: string
}

export type QueueEntry = QueuedCreate | QueuedMarkDone

// --- storage layer: localStorage primary, in-memory mirror fallback (F2).
// While storage is broken the mirror is the tab-local truth, so a full disk
// degrades to "syncs while this tab lives" instead of silent loss.
let mirror: QueueEntry[] = []
let storageBroken = false

function load(): QueueEntry[] {
  let raw: string | null = null
  try { raw = localStorage.getItem(QUEUE_KEY) } catch { return [...mirror] }
  if (storageBroken) return [...mirror] // last save never landed; storage is stale
  if (raw === null) return []
  try {
    const q = JSON.parse(raw) as QueueEntry[]
    if (!Array.isArray(q)) throw new Error('queue blob is not an array')
    mirror = q
    return q
  } catch {
    // corrupt blob: quarantine it before anything can overwrite it (F2)
    try { localStorage.setItem(QUEUE_KEY + '.corrupt', raw) } catch { /* best effort */ }
    return [...mirror]
  }
}

/** Persist the queue. Returns false when localStorage failed -- the mirror
 *  still holds the entries, but they will not survive a reload. */
function save(q: QueueEntry[]): boolean {
  mirror = q
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
    storageBroken = false
  } catch {
    storageBroken = true
  }
  window.dispatchEvent(new CustomEvent('vox-queue-changed', {
    detail: { length: q.length, persisted: !storageBroken },
  }))
  return !storageBroken
}

export function queueLength(): number { return load().length }

export function isQueued(localKey: string): boolean {
  return load().some(e => e.localKey === localKey)
}

/** Queue an entry. Returns false when it could NOT be persisted (storage
 *  failure) -- it still lives in the in-memory mirror, but the caller must
 *  surface a hard "not saved" state instead of implying safety. */
export function enqueue(entry: QueueEntry): boolean {
  const q = load()
  // one create per localKey -- a re-send replaces the payload, never duplicates
  const rest = q.filter(e => !(e.kind === entry.kind && e.localKey === entry.localKey))
  rest.push(entry)
  return save(rest)
}

/** Drop every queued entry for a localKey (ticket cancelled before sync, F12). */
export function removeByLocalKey(localKey: string): void {
  save(load().filter(e => e.localKey !== localKey))
}

/** Mark a queued (not-yet-synced) create so its ticket flips to done right
 *  after sync. Returns true only when the flag is durably persisted. */
export function markDoneWhenSynced(localKey: string): boolean {
  const q = load()
  const entry = q.find(e => e.kind === 'create' && e.localKey === localKey) as QueuedCreate | undefined
  if (!entry) return false
  entry.markDoneAfterSync = true
  return save(q)
}

// --- sync-map (F3): localKey -> server id, written synchronously the moment a
// sync lands and BEFORE the transient echo event. Survives a kill between the
// sync and the draft learning its id; loadDraft/markDone consult it.
function readSyncMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SYNCMAP_KEY)
    const m = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    return m && typeof m === 'object' ? m : {}
  } catch { return {} }
}

export function syncedId(localKey: string): string | null {
  return readSyncMap()[localKey] ?? null
}

function recordSync(localKey: string, id: string): void {
  const m = readSyncMap()
  m[localKey] = id
  const keys = Object.keys(m)
  for (let i = 0; i < keys.length - SYNCMAP_MAX; i++) delete m[keys[i]]
  try { localStorage.setItem(SYNCMAP_KEY, JSON.stringify(m)) } catch { /* best effort */ }
}

let flushing = false
let flushAgain = false

/** Attempt to sync every queued entry. Safe to call from anywhere, any time:
 *  re-entrant calls schedule one follow-up pass (F13), per-entry failure keeps
 *  the entry queued, a hung entry times out (F5), and the function never
 *  throws. */
export async function flushQueue(): Promise<void> {
  if (flushing) { flushAgain = true; return }
  flushing = true
  try {
    let q = load()
    for (const entry of [...q]) {
      const ok = await withTimeout(syncOne(entry))
      if (ok) {
        q = load().filter(e => !(e.kind === entry.kind && e.localKey === entry.localKey))
        save(q)
      }
      // failure: leave it queued; the next trigger (online/visibility/interval)
      // retries. Order preserved so a create always precedes its mark_done.
    }
  } finally {
    flushing = false
    if (flushAgain) { flushAgain = false; void flushQueue() }
  }
}

/** Slow is failure (F5): the entry stays queued and the lock releases. A fetch
 *  that completes after the timeout is harmless -- the insert is idempotent on
 *  local_key, and mark_done re-applies the same status. */
function withTimeout(p: Promise<boolean>): Promise<boolean> {
  return Promise.race([
    p.catch(() => false),
    new Promise<boolean>(resolve => window.setTimeout(() => resolve(false), SYNC_TIMEOUT_MS)),
  ])
}

async function syncOne(entry: QueueEntry): Promise<boolean> {
  try {
    if (entry.kind === 'mark_done') {
      const { error } = await supabase
        .from('vox_tickets')
        .update({ status: 'done', status_changed_at: new Date().toISOString() })
        .eq('id', entry.ticketId)
      return !error
    }

    // Idempotent create (F1): local_key is UNIQUE on vox_tickets. A first
    // attempt whose response was lost, or a second tab flushing the same
    // entry, hits the conflict path and converges to the existing row instead
    // of duplicating the ticket. ignoreDuplicates (DO NOTHING) rather than
    // merge, so a retry can never clobber a row whose status already advanced.
    const wantsDone = entry.markDoneAfterSync === true
    const { data, error } = await supabase
      .from('vox_tickets')
      .upsert({
        restaurant_id: API_CONFIG.restaurantId,
        table_number: entry.tableNumber,
        server_id: entry.serverId,
        server_name: entry.serverName,
        guest_count: entry.guestCount,
        order_type: entry.orderType,
        items: entry.items,
        status: wantsDone ? 'done' : 'sent',
        local_key: entry.localKey,
      }, { onConflict: 'local_key', ignoreDuplicates: true })
      .select('id')
      .maybeSingle()
    if (error) return false

    const insertedFresh = data !== null
    let id = data?.id as string | undefined
    if (!id) {
      const { data: existing, error: selErr } = await supabase
        .from('vox_tickets')
        .select('id')
        .eq('local_key', entry.localKey)
        .maybeSingle()
      if (selErr || !existing) return false
      id = existing.id as string
    }

    // durable BEFORE the transient event (F3)
    recordSync(entry.localKey, id)

    // Done reconciliation (F4): the flag may have been set mid-insert (re-read
    // the stored entry, not the by-value copy), or the create may have
    // converged onto an existing 'sent' row while carrying markDoneAfterSync.
    const fresh = load().find(e => e.kind === 'create' && e.localKey === entry.localKey) as QueuedCreate | undefined
    const doneOwed = (wantsDone || fresh?.markDoneAfterSync === true) && !(wantsDone && insertedFresh)
    if (doneOwed) {
      const { error: doneErr } = await supabase
        .from('vox_tickets')
        .update({ status: 'done', status_changed_at: new Date().toISOString() })
        .eq('id', id)
      if (doneErr) {
        // keep the intent: a mark_done entry survives this create's removal
        enqueue({ kind: 'mark_done', localKey: entry.localKey, queuedAt: new Date().toISOString(), ticketId: id })
      }
    }

    // dashboard mirror (best-effort -- the ticket row is the record)
    await supabase
      .from('vox_table_sessions')
      .update({ item_count: entry.items.length, check_total: entry.checkTotal })
      .eq('restaurant_id', API_CONFIG.restaurantId)
      .eq('table_number', entry.tableNumber)
      .then(() => {}, () => {})

    // echo reconciliation: hand the server id back to whoever holds this
    // localKey in memory (useTicket swaps it in without touching identity)
    window.dispatchEvent(new CustomEvent('vox-ticket-synced', {
      detail: { localKey: entry.localKey, id },
    }))
    return true
  } catch {
    return false // network/abort -- stay queued
  }
}

/** Wire the standing flush triggers once (call from MainContainer). */
export function installFlushTriggers(): () => void {
  const onOnline = () => { void flushQueue() }
  const onVisible = () => { if (document.visibilityState === 'visible') void flushQueue() }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  const interval = window.setInterval(() => { void flushQueue() }, 30_000)
  void flushQueue() // and once now, for anything left over from a dead session
  return () => {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    window.clearInterval(interval)
  }
}
