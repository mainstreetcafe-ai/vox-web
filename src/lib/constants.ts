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
  mockPin: '1234',
} as const

export const API_CONFIG = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  n8nBaseUrl: import.meta.env.VITE_N8N_BASE_URL ?? '',
  voxAuthToken: import.meta.env.VITE_VOX_AUTH_TOKEN ?? '',
  webhookCommand: '/webhook/vox-command',
  webhookConfirm: '/webhook/vox-confirm',
  restaurantId: '85279515-6aff-4612-9944-7bdeda5fa73f',
  telegramGroupId: '-1002900126881',
} as const
