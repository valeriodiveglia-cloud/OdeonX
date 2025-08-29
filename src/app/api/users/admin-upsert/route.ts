import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function svc() {
  // Service role per operazioni DB/Auth privilegiate
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function anon() {
  // Anon per verificare il JWT lato server
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

async function getCaller(req: Request) {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  const supaAnon = anon()
  const { data, error } = await supaAnon.auth.getUser(token)
  if (error) return null
  return data.user ?? null
}

type Role = 'owner' | 'admin' | 'staff'

export async function POST(req: Request) {
  try {
    const caller = await getCaller(req)
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = svc()

    // ruolo del chiamante
    const { data: me, error: meErr } = await db
      .from('app_accounts')
      .select('role')
      .eq('user_id', caller.id)
      .maybeSingle()
    if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 })

    const myRole = me?.role as Role | undefined
    if (!myRole) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id, email, phone, name, position, role, is_active } = await req.json()

    const payload = {
      email: String(email || '').toLowerCase(),
      phone: phone || null,
      name: name || null,
      position: position || null,
      role: ((role as Role) || 'staff') as Role,
      is_active: !!is_active,
    }
    if (!payload.email || !payload.email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    // REGOLE:
    // - admin può creare/modificare SOLO staff (e può impostare solo role=staff)
    if (myRole === 'admin') {
      if (id) {
        const { data: target, error: tErr } = await db
          .from('app_accounts')
          .select('role')
          .eq('id', id)
          .maybeSingle()
        if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 })
        if (!target) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
        if (target.role !== 'staff') {
          return NextResponse.json({ error: 'Admins can modify staff only' }, { status: 403 })
        }
      }
      if (payload.role !== 'staff') {
        return NextResponse.json({ error: 'Admins can set role to staff only' }, { status: 403 })
      }
    }

    // Owner che demote un owner: non può lasciare 0 owner
    if (myRole === 'owner' && id) {
      const { data: before } = await db.from('app_accounts').select('role').eq('id', id).maybeSingle()
      if (before?.role === 'owner' && payload.role !== 'owner') {
        const { count } = await db
          .from('app_accounts')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'owner')
        if ((count ?? 0) <= 1) {
          return NextResponse.json({ error: 'Cannot demote the last owner' }, { status: 403 })
        }
      }
    }

    // upsert: se ho id -> update, altrimenti insert
    if (id) {
      const { data, error } = await db
        .from('app_accounts')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true, data })
    } else {
      const { data, error } = await db
        .from('app_accounts')
        .insert(payload as any)
        .select('*')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true, data })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
