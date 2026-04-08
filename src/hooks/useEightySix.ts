import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { API_CONFIG } from '@/lib/constants'

export interface EightySixItem {
  id: string
  itemName: string
  eightySixedBy: string
  createdAt: string
}

export function useEightySix() {
  const [items, setItems] = useState<EightySixItem[]>([])

  // Initial fetch
  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('vox_eighty_six')
        .select('*')
        .eq('restaurant_id', API_CONFIG.restaurantId)
        .order('created_at', { ascending: false })

      if (data) {
        setItems(data.map(mapRow))
      }
    }
    fetch()
  }, [])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`vox-86-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vox_eighty_six',
          filter: `restaurant_id=eq.${API_CONFIG.restaurantId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setItems(prev => [mapRow(payload.new), ...prev])
          } else if (payload.eventType === 'DELETE') {
            setItems(prev => prev.filter(i => i.id !== (payload.old as any).id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const eightySix = useCallback(async (itemName: string, staffName: string) => {
    await supabase.from('vox_eighty_six').insert({
      restaurant_id: API_CONFIG.restaurantId,
      item_name: itemName,
      eighty_sixed_by: staffName,
    })
  }, [])

  const unEightySix = useCallback(async (itemName: string) => {
    await supabase
      .from('vox_eighty_six')
      .delete()
      .eq('restaurant_id', API_CONFIG.restaurantId)
      .eq('item_name', itemName)
  }, [])

  const isEightySixed = useCallback((itemName: string) => {
    return items.some(i => i.itemName.toLowerCase() === itemName.toLowerCase())
  }, [items])

  return { items, eightySix, unEightySix, isEightySixed }
}

function mapRow(row: any): EightySixItem {
  return {
    id: row.id,
    itemName: row.item_name,
    eightySixedBy: row.eighty_sixed_by,
    createdAt: row.created_at,
  }
}
