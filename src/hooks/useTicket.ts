import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Ticket, OrderType, TicketItem } from '@/types'
import type { StaffMember } from '@/contexts/AuthContext'
import { parseTicketUtterance } from '@/services/ticketParser'
import { enqueue, flushQueue, isQueued, markDoneWhenSynced } from '@/services/ticketQueue'

// Phase 1 (notepad): no auto-cancel while building, no auto-clear after save.
// Server explicitly cancels or taps "Done" after entering into SHIFT4.
//
// Offline posture (2026-07-27): a dictated ticket is CAPTURED the moment it
// exists here. Sends go through the localStorage queue (services/ticketQueue),
// so a dead tailnet reads as "saved on phone -- waiting for network", never as
// a failed dictation. The in-progress draft persists across a reload
// (store+sync pairing: local write is the truth, the relayed row converges).

const DRAFT_KEY = 'vox_draft_ticket_v1'

function loadDraft(): (Ticket & { id?: string }) | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const t = JSON.parse(raw) as Ticket & { id?: string }
    return (t.status === 'building' || t.status === 'sent') ? t : null
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
    } catch { /* quota */ }
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
  ) => {
    if (!staff) return

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
  }, [staff])

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
        setTicket(prev => {
          if (!prev) return null
          const idx = prev.items.findIndex(i =>
            i.menuItemName.toLowerCase().includes(command.itemName.toLowerCase())
          )
          if (idx === -1) return prev
          return { ...prev, items: prev.items.filter((_, j) => j !== idx) }
        })
        return `Removed ${command.itemName}`
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
        setTicket(null)
        setStatusText('')
        return 'CANCEL'
    }
  }, [ticket])

  // Save the ticket and keep it on screen so the server can read it on the
  // walk back to the POS terminal. Status stays 'sent' until the server taps
  // Done. The write goes THROUGH the queue: captured locally first, synced to
  // vox_tickets when the network allows. Returns true whenever the ticket is
  // captured -- a dead tailnet is a sync state, not a failed dictation.
  const sendTicket = useCallback(async (): Promise<boolean> => {
    if (!ticket || !staff) return false

    const checkTotal = ticket.items.reduce(
      (sum, i) => sum + (i.menuItemPrice ?? 0) * i.quantity, 0,
    )
    const localKey = ticket.localKey ?? crypto.randomUUID()

    enqueue({
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
    setStatusText('Saved on phone -- syncing')

    await flushQueue() // resolves the vox-ticket-synced echo on success

    // if the entry is still queued the sync failed -- say so, visibly
    if (isQueued(localKey)) {
      setStatusText('Saved on phone -- offline, will sync (ticket is safe)')
    }
    return true
  }, [ticket, staff])

  // Server taps Done after entering the order into SHIFT4. We mark the row
  // 'done' for the dashboard's "Today's tickets" list, then clear the screen.
  // Offline-safe: an unsynced ticket flips to done at sync time; a failed
  // update is queued rather than silently dropped (the old fire-and-forget
  // here was a decision-without-effect hole).
  const markDone = useCallback(async (): Promise<void> => {
    const t = ticket
    setTicket(null)
    setStatusText('')
    if (!t) return

    if (!t.id) {
      // never synced -- tell the queue to create it directly as done
      if (t.localKey) markDoneWhenSynced(t.localKey)
      void flushQueue()
      return
    }
    try {
      const { error } = await supabase
        .from('vox_tickets')
        .update({ status: 'done', status_changed_at: new Date().toISOString() })
        .eq('id', t.id)
      if (error) throw error
    } catch {
      enqueue({ kind: 'mark_done', localKey: t.localKey ?? crypto.randomUUID(),
                queuedAt: new Date().toISOString(), ticketId: t.id })
    }
  }, [ticket])

  const cancelTicket = useCallback(() => {
    setTicket(null)
    setStatusText('')
  }, [])

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
