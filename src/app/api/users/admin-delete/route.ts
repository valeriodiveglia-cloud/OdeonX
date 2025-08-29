import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
function anon() {
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
    const body = await req.json()
    const { accountId, userId, email } = body || {}

    if (!accountId && !userId && !email) {
      return NextResponse.json({ error: 'Missing identifiers' }, { status: 400 })
    }

    const caller = await getCaller(req)
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = svc()

    // ruolo del caller
    const { data: me, error: meErr } = await db
      .from('app_accounts')
      .select('id, role')
      .eq('user_id', caller.id)
      .maybeSingle()
    if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 })
    const myRole = me?.role as Role | undefined
    if (!myRole) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // trova target
    const { data: target, error: tErr } = await db
      .from('app_accounts')
      .select('id, user_id, email, role')
      .or([
        accountId ? `id.eq.${accountId}` : '',
        (!accountId && userId) ? `user_id.eq.${userId}` : '',
        (!accountId && !userId && email) ? `email.eq.${String(email).toLowerCase()}` : '',
      ].filter(Boolean).join(','))
      .maybeSingle()
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 })
    if (!target) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    // regole: admin solo staff. owner tutti, ma non l’ultimo owner
    if (myRole === 'admin' && target.role !== 'staff') {
      return NextResponse.json({ error: 'Admins can delete staff only' }, { status: 403 })
    }

    if (target.role === 'owner') {
      const { count: ownersCount, error: cntErr } = await db
        .from('app_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'owner')
      if (cntErr) return NextResponse.json({ error: cntErr.message }, { status: 400 })
      if ((ownersCount ?? 0) <= 1) {
        return NextResponse.json({ error: 'Cannot delete the last owner' }, { status: 403 })
      }
      if (myRole !== 'owner') {
        return NextResponse.json({ error: 'Only owners can delete owners' }, { status: 403 })
      }
    }

    // elimina anche in Auth (se c'è user_id o lo troviamo per email)
    const uid = target.user_id || userId || null
    if (uid) {
      const delAuth = await db.auth.admin.deleteUser(uid)
      if (delAuth.error) {
        return NextResponse.json({ error: `Auth delete failed: ${delAuth.error.message}` }, { status: 400 })
      }
    } else if (email) {
      const list = await db.auth.admin.listUsers({ page: 1, perPage: 1, email })
      const u = list.data?.users?.[0]
      if (u && u.email?.toLowerCase() === String(email).toLowerCase()) {
        const delAuth = await db.auth.admin.deleteUser(u.id)
        if (delAuth.error) {
          return NextResponse.json({ error: `Auth delete failed: ${delAuth.error.message}` }, { status: 400 })
        }
      }
    }

    // elimina riga DB
    const { error: delDbErr } = await db.from('app_accounts').delete().eq('id', target.id)
    if (delDbErr) return NextResponse.json({ error: `DB delete failed: ${delDbErr.message}` }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
