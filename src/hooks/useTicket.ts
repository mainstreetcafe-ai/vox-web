import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Ticket, OrderType, TicketItem } from '@/types'
import type { StaffMember } from '@/contexts/AuthContext'
import { parseTicketUtterance } from '@/services/ticketParser'
import {
  enqueue, flushQueue, isQueued, markDoneWhenSynced, removeByLocalKey, syncedId,
} from '@/services/ticketQueue'

// Phase 1 (notepad): no auto-cancel while building, no auto-clear after save.
// Server explicitly cancels or taps "Done" after entering into SHIFT4.
//
// Offline posture (2026-07-27): a dictated ticket is CAPTURED the moment it
// exists here. Sends go through the localStorage queue (services/ticketQueue),
// so a dead tailnet reads as "saved on phone -- waiting for network", never as
// a failed dictation. The in-progress draft persists across a reload
// (store+sync pairing: local write is the truth, the relayed row converges).
//
// Hardened 2026-07-29 against the K3 findings (F8-F12, F14): sends are gated
// on 'building' (a synced ticket cannot re-enqueue); Done clears the screen
// only after the intent is durable somewhere (row updated, queue entry
// persisted, or sync-map hit) -- every failure branch keeps the ticket visible
// with an error; removals answer honestly when nothing matched; a new table
// cannot silently orphan a sent ticket; cancelling an unsynced ticket also
// dequeues it; a restored draft is schema-checked and adopts any sync that
// landed while the app was dead.

const DRAFT_KEY = 'vox_draft_ticket_v1'

function loadDraft(): (Ticket & { id?: string }) | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const t = JSON.parse(raw) as Ticket & { id?: string }
    if (t.status !== 'building' && t.status !== 'sent') return null
    // schema-drift guard (F14): a malformed draft crashes sendTicket later
    if (!Array.isArray(t.items) || typeof t.tableNumber !== 'string') return null
    // adopt a sync that landed but never reached the draft -- kill window (F3)
    if (!t.id && t.localKey) {
      const id = syncedId(t.localKey)
      if (id) return { ...t, id, pendingSync: false }
    }
    return t
  } catch { return null }
}

export function useTicket(staff: StaffMember | null) {
  const [ticket, setTicket] = useState<(Ticket & { id?: string }) | null>(loadDraft)
  const [statusText, setStatusText] = useState('')

  // store half of the pairing: every ticket change lands in localStorage first
  useEffect(() => {
    try {
      if (ticket) localStorage.setItem(DRAFT_KEY, JSON.stringify(ticket))
      else localStorage.removeItem(DRAFT_KEY)
    } catch {
      // a silently unsaved draft vanishes on reload -- say so (F2)
      setStatusText('Phone storage FULL -- ticket not saved, keep this screen open')
    }
  }, [ticket])

  // echo reconciliation: when the queue syncs our localKey, adopt the server id
  useEffect(() => {
    const onSynced = (e: Event) => {
      const { localKey, id } = (e as CustomEvent<{ localKey: string; id: string }>).detail
      setTicket(prev => {
        if (!prev || prev.localKey !== localKey) return prev
        return { ...prev, id, pendingSync: false }
      })
      setStatusText(prev =>
        prev.startsWith('Saved on phone') ? 'Saved -- enter in SHIFT4, then tap Done' : prev)
    }
    window.addEventListener('vox-ticket-synced', onSynced)
    return () => window.removeEventListener('vox-ticket-synced', onSynced)
  }, [])

  // True while the server is dictating items into this ticket.
  const isActive = ticket !== null && ticket.status === 'building'
  // True whenever a ticket is on screen (building OR saved-awaiting-Done).
  const isOpen = ticket !== null && ticket.status !== 'cancelled'

  const startTicket = useCallback((
    tableNumber: string,
    guestCount: number,
    orderType: OrderType = 'dine_in',
  ): boolean => {
    if (!staff) return false
    // a sent ticket awaiting Done must be closed explicitly, or it is orphaned
    // on the dashboard with no owner and no local trace (F11)
    if (ticket && ticket.status === 'sent') {
      setStatusText(`${ticket.tableNumber} still open -- tap Done or Cancel first`)
      return false
    }

    setTicket({
      tableNumber: tableNumber.toUpperCase(),
      serverName: staff.name,
      serverId: staff.id,
      guestCount,
      orderType,
      items: [],
      status: 'building',
      createdAt: new Date().toISOString(),
      localKey: crypto.randomUUID(),
    })
    setStatusText(`${tableNumber.toUpperCase()} -- ${guestCount} guests`)
    return true
  }, [staff, ticket])

  // Cancelling a captured-but-unsynced ticket must also dequeue it, or the
  // queued create syncs later and a cancelled ticket haunts the dashboard (F12)
  const discardTicket = useCallback((t: (Ticket & { id?: string }) | null) => {
    if (t?.localKey && t.pendingSync) removeByLocalKey(t.localKey)
    setTicket(null)
    setStatusText('')
  }, [])

  const processUtterance = useCallback((utterance: string): string => {
    if (!ticket || ticket.status !== 'building') return 'No active ticket'

    const command = parseTicketUtterance(utterance)
    if (!command) return `Couldn't parse: "${utterance}"`

    switch (command.type) {
      case 'add_item': {
        setTicket(prev => prev ? { ...prev, items: [...prev.items, command.item] } : null)
        const mods = command.item.modifiers.map(m => m.text).join(', ')
        return `Added: ${command.item.menuItemName}${mods ? ' -- ' + mods : ''}`
      }
      case 'remove_seat': {
        setTicket(prev => {
          if (!prev) return null
          return { ...prev, items: prev.items.filter(i => i.seat !== command.seat) }
        })
        return `Removed seat ${command.seat}`
      }
      case 'remove_item': {
        // honest reply (F10): find the target BEFORE mutating; a miss must
        // never confirm a removal that did not happen
        const idx = ticket.items.findIndex(i =>
          i.menuItemName.toLowerCase().includes(command.itemName.toLowerCase())
        )
        if (idx === -1) return `"${command.itemName}" not on ticket`
        const removedName = ticket.items[idx].menuItemName
        setTicket(prev => {
          if (!prev) return null
          return { ...prev, items: prev.items.filter((_, j) => j !== idx) }
        })
        return `Removed ${removedName}`
      }
      case 'add_modifier': {
        setTicket(prev => {
          if (!prev) return null
          return {
            ...prev,
            items: prev.items.map(i =>
              i.seat === command.seat
                ? { ...i, modifiers: [...i.modifiers, command.modifier] }
                : i
            ),
          }
        })
        return `Added ${command.modifier.text} to seat ${command.seat}`
      }
      case 'send':
        return 'SEND'
      case 'cancel':
        discardTicket(ticket)
        return 'CANCEL'
    }
  }, [ticket, discardTicket])

  // Save the ticket and keep it on screen so the server can read it on the
  // walk back to the POS terminal. Status stays 'sent' until the server taps
  // Done. The write goes THROUGH the queue: captured locally first, synced to
  // vox_tickets when the network allows. Returns true whenever the ticket is
  // captured -- a dead tailnet is a sync state, not a failed dictation.
  const sendTicket = useCallback(async (): Promise<boolean> => {
    // 'building' guard (F8): a synced ticket must not re-enqueue on a double
    // tap or stray caller -- without it a re-send duplicates the row
    if (!ticket || !staff || ticket.status !== 'building') return false

    const checkTotal = ticket.items.reduce(
      (sum, i) => sum + (i.menuItemPrice ?? 0) * i.quantity, 0,
    )
    const localKey = ticket.localKey ?? crypto.randomUUID()

    const persisted = enqueue({
      kind: 'create',
      localKey,
      queuedAt: new Date().toISOString(),
      tableNumber: ticket.tableNumber,
      serverId: ticket.serverId,
      serverName: ticket.serverName,
      guestCount: ticket.guestCount,
      orderType: ticket.orderType,
      items: ticket.items,
      checkTotal,
    })
    // optimistic: the ticket is 'sent' the moment it is captured locally
    setTicket(prev => prev ? { ...prev, localKey, status: 'sent', pendingSync: true } : null)
    setStatusText(persisted
      ? 'Saved on phone -- syncing'
      : 'Phone storage FULL -- NOT saved, keep this screen open until synced')

    await flushQueue() // resolves the vox-ticket-synced echo on success

    // if the entry is still queued the sync failed -- say so, visibly
    if (isQueued(localKey)) {
      setStatusText(persisted
        ? 'Saved on phone -- offline, will sync (ticket is safe)'
        : 'Phone storage FULL -- NOT saved, keep this screen open until synced')
    }
    return true
  }, [ticket, staff])

  // Server taps Done after entering the order into SHIFT4. We mark the row
  // 'done' for the dashboard's "Today's tickets" list, then clear the screen.
  // Durable-first (F9): the screen clears ONLY after the done intent is safe
  // somewhere -- row updated, queue entry persisted, or a queued create
  // flagged. Every failure branch keeps the ticket visible with an error.
  // Returns false when Done could not be recorded.
  const markDone = useCallback(async (): Promise<boolean> => {
    const t = ticket
    if (!t) { setStatusText(''); return true }

    const clear = () => { setTicket(null); setStatusText('') }
    const now = () => new Date().toISOString()
    // adopted id, or one that landed via a sync the draft never learned of (F3)
    const id = t.id ?? (t.localKey ? syncedId(t.localKey) : null)

    if (id) {
      try {
        const { error } = await supabase
          .from('vox_tickets')
          .update({ status: 'done', status_changed_at: now() })
          .eq('id', id)
        if (error) throw error
        clear()
        return true
      } catch {
        const queued = enqueue({
          kind: 'mark_done', localKey: t.localKey ?? crypto.randomUUID(),
          queuedAt: now(), ticketId: id,
        })
        if (queued) { clear(); void flushQueue(); return true }
        setStatusText('Done NOT saved -- try again when back online')
        return false
      }
    }

    // never synced: flip the queued create to done at sync time
    if (t.localKey && markDoneWhenSynced(t.localKey)) {
      clear()
      void flushQueue()
      return true
    }

    // no queue entry survived (kill window / legacy draft): re-capture the
    // ticket as a create-as-done -- the local_key upsert converges it onto
    // any row the lost sync already created
    const localKey = t.localKey ?? crypto.randomUUID()
    const checkTotal = t.items.reduce(
      (sum, i) => sum + (i.menuItemPrice ?? 0) * i.quantity, 0,
    )
    const queued = enqueue({
      kind: 'create', localKey, queuedAt: now(),
      tableNumber: t.tableNumber, serverId: t.serverId, serverName: t.serverName,
      guestCount: t.guestCount, orderType: t.orderType, items: t.items,
      checkTotal, markDoneAfterSync: true,
    })
    if (queued) { clear(); void flushQueue(); return true }
    setStatusText('Done NOT saved -- phone storage failed, keep this screen open')
    return false
  }, [ticket])

  const cancelTicket = useCallback(() => {
    discardTicket(ticket)
  }, [ticket, discardTicket])

  /** Button path: add an item without speech. Modifier categories are unknown from
   *  a tap (the grammar knows the SET, not our 4-way category enum), so they land as
   *  'side' -- the neutral bucket -- and the text is preserved verbatim for the POS. */
  const addItemManually = useCallback((
    name: string,
    quantity: number,
    modifiers: string[] = [],
    seat = 0,
  ) => {
    setTicket(prev => {
      if (!prev || prev.status !== 'building') return prev
      const item: TicketItem = {
        seat,
        quantity,
        menuItemName: name,
        menuItemPrice: null,
        modifiers: modifiers.map(text => ({ text, category: 'side' as const })),
        rawUtterance: `[tap] ${quantity > 1 ? quantity + ' x ' : ''}${name}` +
          (modifiers.length ? ` -- ${modifiers.join(', ')}` : ''),
      }
      return { ...prev, items: [...prev.items, item] }
    })
  }, [])

  return {
    ticket,
    isActive,
    isOpen,
    statusText,
    startTicket,
    addItemManually,
    processUtterance,
    sendTicket,
    markDone,
    cancelTicket,
  }
}
