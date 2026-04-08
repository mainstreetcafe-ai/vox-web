import { createClient } from '@supabase/supabase-js'
import { API_CONFIG } from './constants'

export const supabase = createClient(API_CONFIG.supabaseUrl, API_CONFIG.supabaseAnonKey)
