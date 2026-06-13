export const APP_CONFIG = {
  version: '1.0.0',
  restaurantName: 'Main Street Cafe',
  restaurantAddress: '208 E. Main Street, Lewisville, TX',
  tableCount: 54,
  taxRate: 0.0825,
  sessionTimeoutMs: 8 * 60 * 60 * 1000,
  silenceTimeoutMs: 1500,
  responseDismissMs: 4500,
  maxLoginAttempts: 5,
  lockoutDurationMs: 5 * 60 * 1000,
} as const

export const API_CONFIG = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  // Voice-classify fallback (Workstream B). Empty until the vox-classify tunnel
  // is live; while empty the client skips the LLM call and posts unknowns to the
  // Feed exactly as before (graceful degrade). The n8n + Telegram relay was
  // retired with the 2026-05-29 notepad reframe.
  classifyUrl: import.meta.env.VITE_VOX_CLASSIFY_URL ?? '',
  classifyToken: import.meta.env.VITE_VOX_CLASSIFY_TOKEN ?? '',
  restaurantId: '85279515-6aff-4612-9944-7bdeda5fa73f',
} as const
