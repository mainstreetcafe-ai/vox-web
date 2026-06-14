import { supabase } from '@/lib/supabase'
import { API_CONFIG } from '@/lib/constants'
import type { ParsedCommand } from './commandParser'
import type { CommandResponse } from '@/types'
import type { StaffMember } from '@/contexts/AuthContext'

// `source` records the parse path so we can measure the post-fix unknown-rate
// by route (Workstream B B4): 'regex' = local fast-path, 'llm' = classify
// fallback, 'ticket' = ticket-mode utterance.
export type CommandSource = 'regex' | 'llm' | 'ticket'

export async function logCommand(
  parsed: ParsedCommand,
  response: CommandResponse,
  staff: StaffMember,
  source: CommandSource = 'regex',
): Promise<string | null> {
  const { data } = await supabase.from('vox_commands').insert({
    restaurant_id: API_CONFIG.restaurantId,
    staff_id: staff.id,
    staff_name: staff.name,
    transcription: parsed.rawTranscript,
    intent: parsed.intent,
    entities: parsed.entities,
    confidence: parsed.confidence,
    response_text: response.text,
    response_type: response.type,
    source,
  }).select('id').single()
  return data?.id ?? null
}

// One-tap "wrong" ground-truth signal: flags a just-logged command as a bad parse.
export async function flagCommandWrong(commandId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('vox_flag_command', { p_command_id: commandId })
  return !error && data === true
}
