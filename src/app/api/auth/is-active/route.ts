// src/app/api/auth/is-active/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

// fallback: usato solo se non arriva userId
async function clientFromReq(req: Request) {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const useBearer = /^Bearer\s+/i.test(authHeader)
  if (useBearer) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } },
    )
  }
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // Fallback silenzioso
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({ name, value: '', ...options, maxAge: 0 })
          } catch {
            // Fallback silenzioso
          }
        },
      },
    }
  )
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')

    const srv = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    if (userId) {
      const { data: row } = await srv
        .from('app_accounts')
        .select('is_active')
        .eq('user_id', userId)
        .maybeSingle()

      const active = !!(row && row.is_active === true)
      return NextResponse.json({ active, hasRow: !!row, via: 'userId' })
    }

    // Fallback: prova a dedurre l’utente dalla sessione (se la rotta viene
    // chiamata senza userId – utile per test manuali)
    const supa = await clientFromReq(req)
    const { data: me } = await supa.auth.getUser()
    const uid = me?.user?.id || null
    if (!uid) return NextResponse.json({ active: false, reason: 'no-session' })

    const { data: row } = await srv
      .from('app_accounts')
      .select('is_active')
      .eq('user_id', uid)
      .maybeSingle()

    const active = !!(row && row.is_active === true)
    return NextResponse.json({ active, hasRow: !!row, via: 'session' })
  } catch (e: any) {
    return NextResponse.json({ active: false, error: e?.message || 'error' }, { status: 200 })
  }
}

export function POST() { return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 }) }
export const PUT = POST
export const DELETE = POST
