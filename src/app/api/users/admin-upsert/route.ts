// src/app/api/users/admin-upsert/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Role = 'owner' | 'admin' | 'staff'
type UpsertBody = {
  id?: number | string | null
  email?: string
  phone?: string | null
  name?: string | null
  position?: string | null
  role?: Role
  is_active?: boolean | null
}

// Blocca metodi diversi da POST
export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
export async function PUT() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
export async function DELETE() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}

export async function POST(req: Request) {
  try {
    // Supporto sia Cookie (SSR) che Bearer (server-to-server)
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
    const useBearer = /^Bearer\s+/.test(authHeader)
    const supabase = useBearer
      ? createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: authHeader } } }
        )
      : createRouteHandlerClient({ cookies })

    // Caller deve essere loggato
    const { data: auth, error: authErr } = await supabase.auth.getUser()
    if (authErr || !auth?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Controllo privilegi (owner o admin)
    const { data: isOwner } = await supabase.rpc('app_is_owner')
    const { data: isAdmin } = await supabase.rpc('app_is_admin')
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parse JSON robusto
    let bodyUnknown: unknown
    try {
      bodyUnknown = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const body = (bodyUnknown ?? {}) as UpsertBody

    const rawEmail = String(body?.email ?? '').trim().toLowerCase()
    if (!rawEmail || !rawEmail.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    let role: Role = (String(body?.role ?? 'staff').trim().toLowerCase() as Role)
    if (!['owner', 'admin', 'staff'].includes(role)) {
      role = 'staff'
    }

    const payload = {
      email: rawEmail,
      phone: body?.phone ?? null,
      name: body?.name ?? null,
      position: body?.position ?? null,
      role,
      is_active: Boolean(body?.is_active ?? true),
    }

    const idPresent = body?.id !== undefined && body?.id !== null && String(body?.id).length > 0

    // Regola: un admin (non owner) può gestire solo account 'staff'
    if (isAdmin && !isOwner) {
      if (payload.role !== 'staff') {
        return NextResponse.json({ error: 'Admins can set role to staff only' }, { status: 403 })
      }
      if (idPresent) {
        const { data: target, error: tErr } = await supabase
          .from('app_accounts')
          .select('role')
          .eq('id', body!.id as any)
          .maybeSingle()
        if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 })
        if (!target) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
        if (String(target.role).toLowerCase() !== 'staff') {
          return NextResponse.json({ error: 'Admins can modify staff only' }, { status: 403 })
        }
      }
    }

    if (idPresent) {
      const { data, error } = await supabase
        .from('app_accounts')
        .update(payload)
        .eq('id', body!.id as any)
        .select('*')
        .single()

      if (error) {
        const isPerm =
          /permission denied|row-level security|violates row-level|not authorized|policy|rls/i.test(
            error.message || ''
          )
        return NextResponse.json(
          { error: isPerm ? 'Forbidden' : error.message },
          { status: isPerm ? 403 : 400 }
        )
      }
      return NextResponse.json({ ok: true, data })
    }

    const { data, error } = await supabase
      .from('app_accounts')
      .insert(payload as any)
      .select('*')
      .single()

    if (error) {
      const isPerm =
        /permission denied|row-level security|violates row-level|not authorized|policy|rls/i.test(
          error.message || ''
        )
      return NextResponse.json(
        { error: isPerm ? 'Forbidden' : error.message },
        { status: isPerm ? 403 : 400 }
      )
    }

    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}
