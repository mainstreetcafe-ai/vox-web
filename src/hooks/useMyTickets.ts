import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { API_CONFIG } from '@/lib/constants'
import type { TicketItem, TicketStatus } from '@/types'

export interface MyTicketRow {
  id: string
  tableNumber: string
  guestCount: number
  items: TicketItem[]
  status: TicketStatus
  createdAt: string
}

// Today's saved tickets for one server. Sorted newest first.
// Phase 1 use: server pulls this up after walking back to the POS so they
// can confirm what they read off the phone earlier this shift.
export function useMyTickets(serverId: string | undefined) {
  const [tickets, setTickets] = useState<MyTicketRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!serverId) {
      setTickets([])
      setIsLoading(false)
      return
    }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    async function fetchTickets() {
      const { data, error } = await supabase
        .from('vox_tickets')
        .select('id, table_number, guest_count, items, status, created_at')
        .eq('restaurant_id', API_CONFIG.restaurantId)
        .eq('server_id', serverId)
        .in('status', ['sent', 'done'])
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })

      if (!error && data) {
        setTickets(data.map(mapRow))
      }
      setIsLoading(false)
    }

    fetchTickets()

    const channel = supabase
      .channel(`vox-my-tickets-${serverId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vox_tickets',
          filter: `server_id=eq.${serverId}`,
        },
        () => { fetchTickets() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [serverId])

  const markDone = useCallback(async (id: string) => {
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status: 'done' } : t))
    await supabase
      .from('vox_tickets')
      .update({ status: 'done', status_changed_at: new Date().toISOString() })
      .eq('id', id)
  }, [])

  return { tickets, isLoading, markDone }
}

function mapRow(row: Record<string, unknown>): MyTicketRow {
  return {
    id: row.id as string,
    tableNumber: row.table_number as string,
    guestCount: (row.guest_count as number) || 0,
    items: (row.items as TicketItem[]) || [],
    status: row.status as TicketStatus,
    createdAt: row.created_at as string,
  }
}
