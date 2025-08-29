// src/lib/server/auth.ts
import { createClient } from '@supabase/supabase-js'

export type AccountRole = 'owner' | 'admin' | 'staff'

// client anonimo per validare il JWT dell’Authorization
const supaAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// client service-role per leggere app_accounts senza RLS
const supaService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

/**
 * Estrae ruolo e userId dall’Authorization Bearer
 * @returns { role, userId }
 */
export async function getCallerInfo(req: Request): Promise<{ role: AccountRole | null; userId: string | null }> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return { role: null, userId: null }

  // valida il token con client anon
  const { data, error } = await supaAnon.auth.getUser(token)
  const userId = data?.user?.id ?? null
  if (error || !userId) return { role: null, userId: null }

  // recupera ruolo da app_accounts
  const { data: me, error: selErr } = await supaService
    .from('app_accounts')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  if (selErr) return { role: null, userId }

  return {
    role: (me?.role as AccountRole | undefined) ?? null,
    userId,
  }
}
