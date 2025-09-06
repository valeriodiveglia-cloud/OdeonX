// src/app/api/users/admin-upsert/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from "@supabase/supabase-js"

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Role = 'owner' | 'admin' | 'staff'

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || ""
  const useBearer = /^Bearer\s+/.test(authHeader)
  const supabase = useBearer
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: authHeader } }
      })
    : createRouteHandlerClient({ cookies })

  // DEBUG BLOCK (temporary)
  const rawCookie = req.headers.get("cookie") || ""
  const hasSbCookie = /sb-.*-auth-token/i.test(rawCookie)
  const { data: dbgAuth } = await supabase.auth.getUser()
  if (!dbgAuth?.user) {
    return NextResponse.json({
      error: "Unauthorized",
      debug: { useBearer, hasAuthHeader: !!authHeader, hasSbCookie }
    }, { status: 401 })
  }


  // caller must be logged in
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // role checks via RPC (match by uid/email inside DB)
  const { data: isOwner } = await supabase.rpc('app_is_owner')
  const { data: isAdmin } = await supabase.rpc('app_is_admin')
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // payload (flat)
  const body = await req.json().catch(() => ({} as any))
  const id = body?.id
  const email = String(body?.email ?? '').trim().toLowerCase()
  const role = String(body?.role ?? 'staff').trim().toLowerCase() as Role
  const payload = {
    email,
    phone: body?.phone ?? null,
    name: body?.name ?? null,
    position: body?.position ?? null,
    role,
    is_active: Boolean(body?.is_active ?? true),
  }

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  // admins can only manage staff accounts
  if (isAdmin && !isOwner) {
    if (payload.role !== 'staff') {
      return NextResponse.json({ error: 'Admins can set role to staff only' }, { status: 403 })
    }
    if (id) {
      const { data: target, error: tErr } = await supabase
        .from('app_accounts')
        .select('role')
        .eq('id', id)
        .maybeSingle()
      if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 })
      if (!target) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
      if (String(target.role).toLowerCase() !== 'staff') {
        return NextResponse.json({ error: 'Admins can modify staff only' }, { status: 403 })
      }
    }
  }

  // update vs insert
  if (id !== undefined && id !== null && String(id).length > 0) {
    const { data, error } = await supabase
      .from('app_accounts')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      // bubble RLS as 403 when relevant
      const msg = String(error.message || '').toLowerCase()
      const code = msg.includes('policy') || msg.includes('rls') ? 403 : 400
      return NextResponse.json({ error: error.message }, { status: code })
    }
    return NextResponse.json({ ok: true, data })
  }

  const { data, error } = await supabase
    .from('app_accounts')
    .insert(payload as any)
    .select('*')
    .single()

  if (error) {
    const msg = String(error.message || '').toLowerCase()
    const code = msg.includes('policy') || msg.includes('rls') ? 403 : 400
    return NextResponse.json({ error: error.message }, { status: code })
  }
  return NextResponse.json({ ok: true, data })
}
