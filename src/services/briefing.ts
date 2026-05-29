import { supabase } from '@/lib/supabase'
import { API_CONFIG } from '@/lib/constants'

// Posts a single "VIP lapse" briefing into the feed if none has been posted today.
// Source signal matches the CARDTX-VIP-LAPSE cron: regulars with 20+ visits that
// haven't been seen in 60+ days. Top 5 by visit count.
//
// Idempotent on (restaurant_id, sender_name='Briefing', day) -- safe to call from
// every staff login. First call wins; subsequent calls short-circuit.
export async function postShiftBriefingIfNeeded(): Promise<void> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data: existing } = await supabase
    .from('vox_messages')
    .select('id')
    .eq('restaurant_id', API_CONFIG.restaurantId)
    .eq('sender_name', 'Briefing')
    .gte('created_at', todayStart.toISOString())
    .limit(1)

  if (existing && existing.length > 0) return

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 60)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const { data: vips } = await supabase
    .from('shift4_card_customer')
    .select('cardholder_normalized, visit_count, last_visit')
    .eq('restaurant_id', API_CONFIG.restaurantId)
    .gte('visit_count', 20)
    .lt('last_visit', cutoffStr)
    .order('visit_count', { ascending: false })
    .limit(5)

  if (!vips || vips.length === 0) return

  const now = Date.now()
  const lines = vips.map(v => {
    const last = new Date((v.last_visit as string) + 'T00:00:00')
    const daysAgo = Math.round((now - last.getTime()) / 86400000)
    return `${formatCardholder(v.cardholder_normalized as string)} (${v.visit_count} visits, ${daysAgo}d ago)`
  })

  const text = `VIP lapse — ${vips.length} regular${vips.length === 1 ? '' : 's'} not in 60+ days:\n${lines.join('\n')}`

  await supabase.from('vox_messages').insert({
    restaurant_id: API_CONFIG.restaurantId,
    sender_name: 'Briefing',
    message_text: text,
    message_type: 'info',
  })
}

function formatCardholder(s: string): string {
  if (!s) return 'Regular'
  if (s.includes('/')) {
    const [last, first] = s.split('/')
    return `${(first || '').trim()} ${(last || '').trim()}`.trim()
  }
  return s
}
