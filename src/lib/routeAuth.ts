// src/lib/routeAuth.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient, Session } from '@supabase/supabase-js'

export async function authOr401(): Promise<
  | { ok: true; supabase: SupabaseClient; session: Session }
  | { ok: false; response: NextResponse }
> {
  const jar = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return jar.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          try { jar.set({ name, value, ...options }) } catch {}
        },
        remove(name: string, options: any) {
          try { jar.set({ name, value: '', ...options }) } catch {}
        },
      },
    }
  ) as unknown as SupabaseClient

  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { ok: true, supabase, session }
}
