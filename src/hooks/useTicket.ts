import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { API_CONFIG } from '@/lib/constants'
import type { Ticket, TicketStatus, OrderType } from '@/types'
import type { StaffMember } from '@/contexts/AuthContext'
import { parseTicketUtterance } from '@/services/ticketParser'

const TICKET_TIMEOUT_MS = 5 * 60 * 1000

export function useTicket(staff: StaffMember | null) {
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [statusText, setStatusText] = useState('')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isActive = ticket !== null && ticket.status === 'building'

  const clearTicketTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const resetTimeout = useCallback(() => {
    clearTicketTimeout()
    timeoutRef.current = setTimeout(() => {
      setTicket(null)
      setStatusText('')
    }, TICKET_TIMEOUT_MS)
  }, [clearTicketTimeout])

  useEffect(() => clearTicketTimeout, [clearTicketTimeout])

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
    resetTimeout()
  }, [staff, resetTimeout])

  const processUtterance = useCallback((utterance: string): string => {
    if (!ticket || ticket.status !== 'building') return 'No active ticket'

    const command = parseTicketUtterance(utterance)
    if (!command) return `Couldn't parse: "${utterance}"`

    resetTimeout()

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
        clearTicketTimeout()
        setTicket(null)
        setStatusText('')
        return 'CANCEL'
    }
  }, [ticket, resetTimeout, clearTicketTimeout])

  const sendTicket = useCallback(async (
    onSendMessage: (sender: string, text: string, type: 'alert' | 'manager' | 'info') => Promise<void>,
  ): Promise<boolean> => {
    if (!ticket || !staff) return false

    // 1. Insert into vox_tickets
    const { error } = await supabase.from('vox_tickets').insert({
      restaurant_id: API_CONFIG.restaurantId,
      table_number: ticket.tableNumber,
      server_id: ticket.serverId,
      server_name: ticket.serverName,
      guest_count: ticket.guestCount,
      order_type: ticket.orderType,
      items: ticket.items,
      status: 'sent',
    })

    if (error) {
      setStatusText('Failed to save ticket')
      return false
    }

    // 2. Post to feed
    const itemLines = ticket.items.map(i => {
      const mods = i.modifiers.map(m => m.text).join(', ')
      return `  ${i.menuItemName}${mods ? ' (' + mods + ')' : ''}`
    }).join('\n')
    await onSendMessage(
      ticket.serverName,
      `Order ${ticket.tableNumber} (${ticket.guestCount}g):\n${itemLines}`,
      'alert',
    )

    // 3. Webhook for Telegram relay
    if (API_CONFIG.n8nBaseUrl) {
      fetch(`${API_CONFIG.n8nBaseUrl}/webhook/vox-ticket`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(API_CONFIG.voxAuthToken ? { 'X-Vox-Auth': API_CONFIG.voxAuthToken } : {}),
        },
        body: JSON.stringify({
          table_number: ticket.tableNumber,
          server_name: ticket.serverName,
          guest_count: ticket.guestCount,
          items: ticket.items,
          restaurant_id: API_CONFIG.restaurantId,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {})
    }

    // 4. Update table session item count + check total
    const checkTotal = ticket.items.reduce(
      (sum, i) => sum + (i.menuItemPrice ?? 0) * i.quantity, 0,
    )
    await supabase
      .from('vox_table_sessions')
      .update({ item_count: ticket.items.length, check_total: checkTotal })
      .eq('restaurant_id', API_CONFIG.restaurantId)
      .eq('table_number', ticket.tableNumber)

    clearTicketTimeout()
    setTicket(prev => prev ? { ...prev, status: 'sent' as TicketStatus } : null)
    setStatusText('Order sent!')

    setTimeout(() => {
      setTicket(null)
      setStatusText('')
    }, 2000)

    return true
  }, [ticket, staff, clearTicketTimeout])

  const cancelTicket = useCallback(() => {
    clearTicketTimeout()
    setTicket(null)
    setStatusText('')
  }, [clearTicketTimeout])

  return {
    ticket,
    isActive,
    statusText,
    startTicket,
    processUtterance,
    sendTicket,
    cancelTicket,
  }
}
