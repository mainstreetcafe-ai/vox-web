import { supabase } from '@/lib/supabase'
import { API_CONFIG } from '@/lib/constants'
import type { ParsedCommand } from './commandParser'
import type { CommandResponse } from '@/types'
import type { StaffMember } from '@/contexts/AuthContext'

export async function logCommand(
  parsed: ParsedCommand,
  response: CommandResponse,
  staff: StaffMember,
): Promise<void> {
  await supabase.from('vox_commands').insert({
    restaurant_id: API_CONFIG.restaurantId,
    staff_id: staff.id,
    staff_name: staff.name,
    transcription: parsed.rawTranscript,
    intent: parsed.intent,
    entities: parsed.entities,
    confidence: parsed.confidence,
    response_text: response.text,
    response_type: response.type,
  })
}
