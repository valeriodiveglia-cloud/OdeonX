import { createClient } from '@supabase/supabase-js'

// Legge dalle env (Vercel e .env.local)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Messaggio chiaro se mancano le chiavi
  throw new Error('Supabase env vars mancanti: NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
