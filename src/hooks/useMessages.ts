import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { API_CONFIG } from '@/lib/constants'
import type { FeedMessage, MessageType } from '@/types'

export function useMessages() {
  const [messages, setMessages] = useState<FeedMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Initial fetch + refetch when the tab becomes visible. The visibility
  // refetch catches anything that landed during the realtime-subscribe race
  // (briefing INSERT that beat SUBSCRIBED -- observed 2026-05-29).
  useEffect(() => {
    async function fetchMessages() {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data, error } = await supabase
        .from('vox_messages')
        .select('*')
        .eq('restaurant_id', API_CONFIG.restaurantId)
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(50)

      if (!error && data) {
        setMessages(data.map(mapRow))
      }
      setIsLoading(false)
    }

    fetchMessages()

    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchMessages()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`vox-messages-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'vox_messages',
          filter: `restaurant_id=eq.${API_CONFIG.restaurantId}`,
        },
        (payload) => {
          const msg = mapRow(payload.new)
          setMessages(prev => [msg, ...prev])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const markRead = useCallback(async (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, isRead: true } : m))
    await supabase.from('vox_messages').update({ is_read: true }).eq('id', id)
  }, [])

  const sendMessage = useCallback(async (senderName: string, text: string, type: MessageType) => {
    await supabase.from('vox_messages').insert({
      restaurant_id: API_CONFIG.restaurantId,
      sender_name: senderName,
      message_text: text,
      message_type: type,
    })
  }, [])

  return { messages, isLoading, markRead, sendMessage }
}

function mapRow(row: any): FeedMessage {
  return {
    id: row.id,
    senderName: row.sender_name,
    messageText: row.message_text,
    messageType: row.message_type,
    timestamp: row.created_at,
    isRead: row.is_read,
  }
}
