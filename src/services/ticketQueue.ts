// Offline ticket sync queue (2026-07-27) -- the "dropped call must never look
// like a misunderstanding" layer.
//
// Pattern adapted from block/buzz's optimistic-send + echo reconciliation
// (desktop messageMerge.ts, Apache 2.0), transposed to Supabase: a ticket the
// server dictated is CAPTURED the moment it exists locally (localKey), queued
// in localStorage, and synced when the network allows. On sync, the server id
// is reconciled onto the in-memory ticket by localKey -- identity preserved,
// nothing flickers, no duplicate insert (each queue entry syncs exactly once).
//
// Visible-failure doctrine: a queued ticket is a STATE the server can see
// ("saved on phone -- waiting for network"), never a silent hole. The queue
// count is surfaced in the offline banner; every transition fires
// 'vox-queue-changed'; a successful sync fires 'vox-ticket-synced'.

import { supabase } from '@/lib/supabase'
import { API_CONFIG } from '@/lib/constants'
import type { TicketItem, OrderType } from '@/types'

const QUEUE_KEY = 'vox_ticket_queue_v1'

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

function load(): QueueEntry[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as QueueEntry[]) : []
  } catch { return [] }
}

function save(q: QueueEntry[]): void {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) } catch { /* quota */ }
  window.dispatchEvent(new CustomEvent('vox-queue-changed', { detail: { length: q.length } }))
}

export function queueLength(): number { return load().length }

export function isQueued(localKey: string): boolean {
  return load().some(e => e.localKey === localKey)
}

export function enqueue(entry: QueueEntry): void {
  const q = load()
  // one create per localKey -- a re-send replaces the payload, never duplicates
  const rest = q.filter(e => !(e.kind === entry.kind && e.localKey === entry.localKey))
  rest.push(entry)
  save(rest)
}

/** Mark a queued (not-yet-synced) create so its ticket flips to done right after sync. */
export function markDoneWhenSynced(localKey: string): boolean {
  const q = load()
  const entry = q.find(e => e.kind === 'create' && e.localKey === localKey) as QueuedCreate | undefined
  if (!entry) return false
  entry.markDoneAfterSync = true
  save(q)
  return true
}

let flushing = false

/** Attempt to sync every queued entry. Safe to call from anywhere, any time:
 *  re-entrant calls no-op, per-entry failure keeps the entry queued, and the
 *  function never throws. */
export async function flushQueue(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    let q = load()
    for (const entry of [...q]) {
      const ok = await syncOne(entry)
      if (ok) {
        q = load().filter(e => !(e.kind === entry.kind && e.localKey === entry.localKey))
        save(q)
      }
      // failure: leave it queued; the next trigger (online/visibility/interval)
      // retries. Order preserved so a create always precedes its mark_done.
    }
  } finally {
    flushing = false
  }
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

    const { data, error } = await supabase
      .from('vox_tickets')
      .insert({
        restaurant_id: API_CONFIG.restaurantId,
        table_number: entry.tableNumber,
        server_id: entry.serverId,
        server_name: entry.serverName,
        guest_count: entry.guestCount,
        order_type: entry.orderType,
        items: entry.items,
        status: entry.markDoneAfterSync ? 'done' : 'sent',
      })
      .select('id')
      .single()
    if (error || !data) return false

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
      detail: { localKey: entry.localKey, id: data.id as string },
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
