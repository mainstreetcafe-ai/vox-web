import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { API_CONFIG } from '@/lib/constants'
import type { Ticket, OrderType } from '@/types'
import type { StaffMember } from '@/contexts/AuthContext'
import { parseTicketUtterance } from '@/services/ticketParser'

// Phase 1 (notepad): no auto-cancel while building, no auto-clear after save.
// Server explicitly cancels or taps "Done" after entering into SHIFT4.

export function useTicket(staff: StaffMember | null) {
  const [ticket, setTicket] = useState<(Ticket & { id?: string }) | null>(null)
  const [statusText, setStatusText] = useState('')

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

  // Save the ticket to vox_tickets and keep it on screen so the server can
  // read it on the walk back to the POS terminal. Status stays 'sent' until
  // the server taps Done.
  const sendTicket = useCallback(async (): Promise<boolean> => {
    if (!ticket || !staff) return false

    const checkTotal = ticket.items.reduce(
      (sum, i) => sum + (i.menuItemPrice ?? 0) * i.quantity, 0,
    )

    const { data, error } = await supabase
      .from('vox_tickets')
      .insert({
        restaurant_id: API_CONFIG.restaurantId,
        table_number: ticket.tableNumber,
        server_id: ticket.serverId,
        server_name: ticket.serverName,
        guest_count: ticket.guestCount,
        order_type: ticket.orderType,
        items: ticket.items,
        status: 'sent',
      })
      .select('id')
      .single()

    if (error || !data) {
      setStatusText('Failed to save ticket')
      return false
    }

    // Mirror item count + estimated total onto the table session for the
    // dashboard, but do not post to the feed and do not call any n8n/Telegram
    // webhook -- Phase 1 is a notepad, SHIFT4 is the system of record.
    await supabase
      .from('vox_table_sessions')
      .update({ item_count: ticket.items.length, check_total: checkTotal })
      .eq('restaurant_id', API_CONFIG.restaurantId)
      .eq('table_number', ticket.tableNumber)

    setTicket(prev => prev ? { ...prev, id: data.id as string, status: 'sent' } : null)
    setStatusText('Saved -- enter in SHIFT4, then tap Done')

    return true
  }, [ticket, staff])

  // Server taps Done after entering the order into SHIFT4. We mark the row
  // 'done' for the dashboard's "Today's tickets" list, then clear the screen.
  const markDone = useCallback(async (): Promise<void> => {
    if (!ticket || !ticket.id) {
      setTicket(null)
      setStatusText('')
      return
    }

    await supabase
      .from('vox_tickets')
      .update({ status: 'done', status_changed_at: new Date().toISOString() })
      .eq('id', ticket.id)

    setTicket(null)
    setStatusText('')
  }, [ticket])

  const cancelTicket = useCallback(() => {
    setTicket(null)
    setStatusText('')
  }, [])

  return {
    ticket,
    isActive,
    isOpen,
    statusText,
    startTicket,
    processUtterance,
    sendTicket,
    markDone,
    cancelTicket,
  }
}
