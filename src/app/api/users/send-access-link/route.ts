// src/app/api/users/send-access-link/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabaseAnonServer } from '@/lib/supabaseAnonServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function normalizeBaseUrl(input?: string | null): string | null {
  if (!input) return null
  let u = input.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(u)) return null
  try {
    const url = new URL(u)
    return `${url.protocol}//${url.host}${url.pathname === '' ? '' : url.pathname}`.replace(/\/+$/, '')
  } catch {
    return null
  }
}

// --- helper: auth client cookie o Bearer
function getAuthedClient(req: Request) {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const useBearer = /^Bearer\s+/.test(authHeader)
  return useBearer
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: authHeader } } },
      )
    : createRouteHandlerClient({ cookies })
}

// --- helper: trova utente in Authentication per email (listUsers paginato)
async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  try {
    const perPage = 200
    for (let page = 1; page <= 10; page++) {
      const res = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
      const users = res.data?.users || []
      const hit = users.find(u => (u.email || '').toLowerCase() === email.toLowerCase())
      if (hit?.id) return hit.id
      if (users.length < perPage) break
    }
  } catch {}
  return null
}

export async function POST(req: Request) {
  const supabase = getAuthedClient(req)

  // must be logged-in and owner/admin
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: isOwner } = await supabase.rpc('app_is_owner')
  const { data: isAdmin } = await supabase.rpc('app_is_admin')
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // diagnosi rapida
  if (req.headers.get('x-diag') === '1') {
    return NextResponse.json({
      diag: {
        has_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        has_anon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        has_service: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        site_url: process.env.NEXT_PUBLIC_SITE_URL || null,
      },
    })
  }

  try {
    const body = await req.json().catch(() => null)
    const email: string = body?.email?.trim()?.toLowerCase()
    const redirectToBase: string | undefined = body?.redirectToBase

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    // base site: body > origin > env
    const fromBody = normalizeBaseUrl(redirectToBase)
    const fromOrigin = normalizeBaseUrl(req.headers.get('origin'))
    const fromEnv = normalizeBaseUrl(process.env.NEXT_PUBLIC_SITE_URL || null)
    const site = fromBody || fromOrigin || fromEnv
    if (!site) {
      return NextResponse.json({ error: 'Missing/invalid site URL (redirectToBase/origin/NEXT_PUBLIC_SITE_URL)' }, { status: 500 })
    }

    // Forziamo il giro: /auth/callback → /auth/update-password
    const redirectParam = encodeURIComponent('/auth/update-password')
    const redirectTo = `${site}/auth/callback?redirect=${redirectParam}`

    // client service-role per DB (bypassa RLS) – lo useremo per collegare app_accounts.user_id
    const srv = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    // best-effort: crea riga app_accounts se manca
    try {
      await srv.from('app_accounts').upsert(
  { email },
  { onConflict: 'email', ignoreDuplicates: true }
)
    } catch {}

    // --- Se l’utente ESISTE in Authentication → set needs_onboarding, collega user_id, manda reset
    const existsUid = await findAuthUserIdByEmail(email)
    if (existsUid) {
      try {
        await supabaseAdmin.auth.admin.updateUserById(existsUid, {
          user_metadata: { needs_onboarding: true, is_onboarded: false },
        })
      } catch {}

      // ⬇️ collega subito la riga su app_accounts
      try {
        await srv
          .from('app_accounts')
          .update({ user_id: existsUid })
          .is('user_id', null)
          .eq('email', email)
      } catch {}

      const { error: resetErr } = await supabaseAnonServer.auth.resetPasswordForEmail(email, { redirectTo })
      if (resetErr) {
        return NextResponse.json({ error: resetErr.message, redirectTo }, { status: 400 })
      }
      return NextResponse.json({
        ok: true,
        mode: 'password_reset',
        redirectTo,
        note: 'Existing user: metadata set + app_accounts linked + reset email → /auth/callback → /auth/update-password',
      })
    }

    // --- Altrimenti invito nuovo utente (abbiamo già creato app_accounts)
    const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo })
    if (!invite.error) {
      const newUid = invite.data?.user?.id || null

      // metadati onboarding
      try {
        if (newUid) {
          await supabaseAdmin.auth.admin.updateUserById(newUid, {
            user_metadata: { needs_onboarding: true, is_onboarded: false },
          })
        }
      } catch {}

      // ⬇️ collega subito app_accounts.user_id se abbiamo l’uid dell’invito
      try {
        if (newUid) {
          await srv
            .from('app_accounts')
            .update({ user_id: newUid })
            .is('user_id', null)
            .eq('email', email)
        }
      } catch {}

      return NextResponse.json({
        ok: true,
        mode: 'invite',
        redirectTo,
        note: 'New user: invite sent; onboarding flags set; app_accounts linked → /auth/callback → /auth/update-password',
      })
    }

    return NextResponse.json({ error: invite.error.message || 'Invite failed', redirectTo }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
