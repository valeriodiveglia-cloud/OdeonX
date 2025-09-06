// src/app/api/auth/callback/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET(req: Request) {
  const { origin, searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  if (code) {
    // scambia il "code" per una sessione e SCRIVE i cookie sb-*
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) { return cookieStore.get(name)?.value },
          set(name, value, options) { cookieStore.set({ name, value, ...options }) },
          remove(name, options) { cookieStore.set({ name, value: '', ...options, maxAge: 0 }) },
        },
      }
    )
    await supabase.auth.exchangeCodeForSession(code)
  }

  // dopo il login torna alla destinazione richiesta (se presente)
  const redirect = searchParams.get('redirect') || '/'
  return NextResponse.redirect(new URL(redirect, origin))
}
