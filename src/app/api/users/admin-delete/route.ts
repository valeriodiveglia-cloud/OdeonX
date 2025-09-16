// src/app/api/users/admin-delete/route.ts
import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type Role = 'owner' | 'admin' | 'staff'
type DeleteBody = {
  accountId?: string | number | null
  userId?: string | null
  email?: string | null
}

// Service role client (bypassa RLS)
function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function anonWithBearer(authorization: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authorization } } }
  )
}

// Blocca metodi diversi da POST
export async function GET() { return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 }) }
export async function PUT() { return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 }) }
export async function DELETE() { return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 }) }

// Helper: trova UID nell’area Authentication a partire dall’email (scorre pagine di listUsers)
async function findAuthUserIdByEmail(db: ReturnType<typeof svc>, email: string): Promise<string | null> {
  try {
    const perPage = 200
    for (let page = 1; page <= 10; page++) {
      const res = await db.auth.admin.listUsers({ page, perPage })
      const users = res.data?.users || []
      const hit = users.find(u => (u.email || '').toLowerCase() === email.toLowerCase())
      if (hit?.id) return hit.id
      if (users.length < perPage) break
    }
  } catch {}
  return null
}

export async function POST(req: Request) {
  try {
    // 1) Auth del chiamante: cookie o Bearer
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
    const useBearer = /^Bearer\s+/.test(authHeader)
    const userClient = useBearer ? anonWithBearer(authHeader) : createRouteHandlerClient({ cookies })

    const { data: meAuth, error: meAuthErr } = await userClient.auth.getUser()
    if (meAuthErr || !meAuth?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // 2) Autorizzazione (owner o admin)
    const { data: isOwner } = await userClient.rpc('app_is_owner')
    const { data: isAdmin } = await userClient.rpc('app_is_admin')
    if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const myRole: Role = isOwner ? 'owner' : (isAdmin ? 'admin' : 'staff')

    // 3) Body
    let bodyUnknown: unknown
    try { bodyUnknown = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
    const body = (bodyUnknown ?? {}) as DeleteBody
    const accountId = body?.accountId ?? null
    const userId = body?.userId ?? null
    const email = (body?.email ?? null)?.toString().trim().toLowerCase() || null

    if (!accountId && !userId && !email) {
      return NextResponse.json({ error: 'Missing identifiers' }, { status: 400 })
    }

    // 4) Target opzionale da app_accounts (se esiste)
    const db = svc()
    let target: { id: number; user_id: string | null; email: string; role: Role } | null = null
    if (accountId || userId || email) {
      const orFilters: string[] = []
      if (accountId) orFilters.push(`id.eq.${accountId}`)
      if (userId && !accountId) orFilters.push(`user_id.eq.${userId}`)
      if (email && !accountId && !userId) orFilters.push(`email.eq.${email}`)
      if (orFilters.length) {
        const { data: t, error: tErr } = await db
          .from('app_accounts')
          .select('id, user_id, email, role')
          .or(orFilters.join(','))
          .maybeSingle()
        if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 })
        target = t ?? null
      }
    }

    // 5) Guard-rail (se conosciamo il ruolo)
    if (target) {
      if (target.user_id && target.user_id === meAuth.user.id) {
        return NextResponse.json({ error: 'Cannot delete your own account via this endpoint' }, { status: 400 })
      }
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
    }

    // 6) Determina UID da cancellare in Authentication
    let uid: string | null = userId || target?.user_id || null
    const keyEmail = email || target?.email || null
    if (!uid && keyEmail) {
      uid = await findAuthUserIdByEmail(db, keyEmail) // <-- NOVITÀ: troviamo UID anche senza riga DB
    }

    // 7) Cancella in Authentication (se trovato)
    let authDeleted = false
    let authDeleteError: string | null = null
    if (uid) {
      const delAuth = await db.auth.admin.deleteUser(uid)
      if (delAuth.error) {
        authDeleteError = delAuth.error.message || 'Auth delete failed'
      } else {
        authDeleted = true
      }
    }

    // 8) Cancella riga(e) su app_accounts (idempotente: per id, altrimenti per email/user_id)
    let appAccountsDeleted = 0
    try {
      if (target?.id) {
        const { count, error } = await db.from('app_accounts').delete({ count: 'exact' }).eq('id', target.id)
        if (error) throw error
        appAccountsDeleted = count || 0
      } else if (keyEmail) {
        const { count, error } = await db.from('app_accounts').delete({ count: 'exact' }).eq('email', keyEmail)
        if (error) throw error
        appAccountsDeleted = count || 0
      } else if (uid) {
        const { count, error } = await db.from('app_accounts').delete({ count: 'exact' }).eq('user_id', uid)
        if (error) throw error
        appAccountsDeleted = count || 0
      }
    } catch (e: any) {
      return NextResponse.json({
        ok: false,
        authDeleted,
        authDeleteError,
        appAccountsDeleted,
        appAccountsDeleteError: e?.message || 'delete app_accounts failed',
      }, { status: 400 })
    }

    // 9) Risposta
    const nothingFound = !authDeleted && appAccountsDeleted === 0
    if (nothingFound && !keyEmail && !uid) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      authDeleted,
      authDeleteError,
      appAccountsDeleted,
      lookedUpByEmail: !!keyEmail,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 })
  }
}
