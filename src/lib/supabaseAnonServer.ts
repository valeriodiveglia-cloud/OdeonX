import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabaseAnonServer = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})
