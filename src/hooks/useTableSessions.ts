import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { API_CONFIG } from '@/lib/constants'
import type { TableSession, TableStatusType } from '@/types'

// Sort order: active/attention first, then by section (B,E,L,P,R,W), then by number within section
const SECTION_ORDER = ['B', 'W', 'E', 'L', 'P', 'R']

function tableSort(a: TableSession, b: TableSession): number {
  const aIdx = SECTION_ORDER.indexOf(a.section)
  const bIdx = SECTION_ORDER.indexOf(b.section)
  if (aIdx !== bIdx) return aIdx - bIdx
  const aNum = parseInt(a.tableNumber.slice(1)) || 0
  const bNum = parseInt(b.tableNumber.slice(1)) || 0
  return aNum - bNum
}

export function useTableSessions(serverId?: string) {
  const [tables, setTables] = useState<TableSession[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Initial fetch
  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('vox_table_sessions')
        .select('*')
        .eq('restaurant_id', API_CONFIG.restaurantId)

      if (!error && data) {
        setTables(data.map(mapRow).sort(tableSort))
      }
      setIsLoading(false)
    }
    fetch()
  }, [])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`vox-tables-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vox_table_sessions',
          filter: `restaurant_id=eq.${API_CONFIG.restaurantId}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const updated = mapRow(payload.new)
            setTables(prev => {
              const idx = prev.findIndex(t => t.tableNumber === updated.tableNumber)
              if (idx >= 0) {
                const next = [...prev]
                next[idx] = updated
                return next
              }
              return [...prev, updated].sort(tableSort)
            })
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const seatTable = useCallback(async (tableNumber: string, guestCount: number, sId: string) => {
    await supabase
      .from('vox_table_sessions')
      .update({
        status: 'active',
        guest_count: guestCount,
        server_id: sId,
        opened_at: new Date().toISOString(),
        closed_at: null,
        check_total: 0,
        item_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('restaurant_id', API_CONFIG.restaurantId)
      .eq('table_number', tableNumber)
  }, [])

  const clearTable = useCallback(async (tableNumber: string) => {
    await supabase
      .from('vox_table_sessions')
      .update({
        status: 'open',
        guest_count: 0,
        server_id: null,
        opened_at: null,
        closed_at: null,
        check_total: 0,
        item_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('restaurant_id', API_CONFIG.restaurantId)
      .eq('table_number', tableNumber)
  }, [])

  const closeTable = useCallback(async (tableNumber: string) => {
    await supabase
      .from('vox_table_sessions')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('restaurant_id', API_CONFIG.restaurantId)
      .eq('table_number', tableNumber)
  }, [])

  const flagAttention = useCallback(async (tableNumber: string) => {
    await supabase
      .from('vox_table_sessions')
      .update({
        status: 'attention',
        updated_at: new Date().toISOString(),
      })
      .eq('restaurant_id', API_CONFIG.restaurantId)
      .eq('table_number', tableNumber)
  }, [])

  // Filter to server's tables if serverId provided
  const myTables = serverId
    ? tables.filter(t => t.serverId === serverId && t.status !== 'open')
    : tables

  return { tables, myTables, isLoading, seatTable, clearTable, closeTable, flagAttention }
}

function mapRow(row: any): TableSession {
  return {
    tableNumber: row.table_number,
    section: row.section || row.table_number?.charAt(0) || '',
    status: row.status as TableStatusType,
    guestCount: row.guest_count,
    checkTotal: Number(row.check_total) || 0,
    itemCount: row.item_count,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    serverId: row.server_id,
  }
}
