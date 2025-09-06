// src/lib/requireSession.ts
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

type GateDenied = { ok: false; response: NextResponse }
type GateAllowed = {
  ok: true
  supabase: ReturnType<typeof createServerClient>
  session: {
    user: { id: string; email?: string | null }
    access_token: string
    expires_at?: number | null
  }
}

type CookieOptions = {
  name?: string
  path?: string
  domain?: string
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
  maxAge?: number
  expires?: Date
}

/**
 * Verifica che esista una sessione Supabase.
 * - Se manca: 401 JSON { error: 'Unauthorized' }
 * - Se c’è: ritorna supabase + session
 */
export async function requireSession(): Promise<GateDenied | GateAllowed> {
  // In Next 15, cookies() è async
  const cookieStore = await cookies()

  // Adattatore cookie tipato e poi castato per compat con varie versioni @supabase/ssr
  const cookieMethods = {
    get(name: string) {
      return cookieStore.get(name)?.value
    },
    set(name: string, value: string, options?: CookieOptions) {
      cookieStore.set({ name, value, ...options })
    },
    remove(name: string, options?: CookieOptions) {
      cookieStore.set({ name, value: '', ...options, maxAge: 0 })
    },
  } as const

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Cast esplicito per evitare il mismatch di tipi tra versioni
      cookies: cookieMethods as unknown as Parameters<typeof createServerClient>[2]['cookies'],
    }
  )

  const { data, error } = await supabase.auth.getSession()
  if (error || !data?.session) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const s = data.session
  return {
    ok: true,
    supabase,
    session: {
      user: { id: s.user.id, email: s.user.email },
      access_token: s.access_token,
      expires_at: s.expires_at ?? null,
    },
  }
}
