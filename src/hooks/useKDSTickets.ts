import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { API_CONFIG } from '@/lib/constants'
import type { KDSStatus, KDSTicket, TicketItem } from '@/types'

const ARCHIVE_FADE_MS = 60_000  // served tickets stay on screen 60s, then drop off

interface VoxTicketRow {
  id: string
  table_number: string
  server_name: string
  guest_count: number
  order_type: 'dine_in' | 'to_go'
  items: TicketItem[]
  status: KDSStatus
  created_at: string
  status_changed_at: string
}

function mapRow(row: VoxTicketRow): KDSTicket {
  return {
    id: row.id,
    tableNumber: row.table_number,
    serverName: row.server_name,
    guestCount: row.guest_count,
    orderType: row.order_type,
    items: row.items ?? [],
    status: row.status,
    createdAt: row.created_at,
    statusChangedAt: row.status_changed_at ?? row.created_at,
  }
}

const NEXT_STATUS: Record<KDSStatus, KDSStatus | null> = {
  sent: 'cooking',
  cooking: 'ready',
  ready: 'served',
  served: null,
}

export function useKDSTickets() {
  const [tickets, setTickets] = useState<KDSTicket[]>([])

  // Initial fetch: active tickets + recently-served (last ARCHIVE_FADE_MS)
  useEffect(() => {
    async function fetch() {
      const cutoff = new Date(Date.now() - ARCHIVE_FADE_MS).toISOString()
      const { data } = await supabase
        .from('vox_tickets')
        .select('*')
        .eq('restaurant_id', API_CONFIG.restaurantId)
        .or(`status.in.(sent,cooking,ready),and(status.eq.served,status_changed_at.gte.${cutoff})`)
        .order('created_at', { ascending: true })

      if (data) {
        setTickets(data.map(mapRow))
      }
    }
    fetch()
  }, [])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`vox-kds-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vox_tickets',
          filter: `restaurant_id=eq.${API_CONFIG.restaurantId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const t = mapRow(payload.new as VoxTicketRow)
            setTickets(prev => [...prev.filter(x => x.id !== t.id), t]
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
          } else if (payload.eventType === 'UPDATE') {
            const t = mapRow(payload.new as VoxTicketRow)
            setTickets(prev => prev.map(x => x.id === t.id ? t : x))
          } else if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id: string }).id
            setTickets(prev => prev.filter(x => x.id !== id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Drop served tickets from local state ARCHIVE_FADE_MS after they're served.
  useEffect(() => {
    const served = tickets.filter(t => t.status === 'served')
    if (served.length === 0) return

    const timers = served.map(t => {
      const elapsed = Date.now() - new Date(t.statusChangedAt).getTime()
      const remaining = Math.max(0, ARCHIVE_FADE_MS - elapsed)
      return setTimeout(() => {
        setTickets(prev => prev.filter(x => x.id !== t.id))
      }, remaining)
    })

    return () => { timers.forEach(clearTimeout) }
  }, [tickets])

  const advance = useCallback(async (ticketId: string, currentStatus: KDSStatus) => {
    const next = NEXT_STATUS[currentStatus]
    if (!next) return
    await supabase
      .from('vox_tickets')
      .update({ status: next })
      .eq('id', ticketId)
  }, [])

  const revert = useCallback(async (ticketId: string, currentStatus: KDSStatus) => {
    const previous: Record<KDSStatus, KDSStatus | null> = {
      sent: null,
      cooking: 'sent',
      ready: 'cooking',
      served: 'ready',
    }
    const prev = previous[currentStatus]
    if (!prev) return
    await supabase
      .from('vox_tickets')
      .update({ status: prev })
      .eq('id', ticketId)
  }, [])

  return { tickets, advance, revert }
}
