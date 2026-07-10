// src/app/api/users/send-access-link/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
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
async function getAuthedClient(req: Request) {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const useBearer = /^Bearer\s+/.test(authHeader)
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
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // ignore
          }
        },
      },
    }
  )
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
  console.log('[send-access-link] POST called')
  let supabase
  try {
    supabase = await getAuthedClient(req)
    console.log('[send-access-link] getAuthedClient OK')
  } catch (e: any) {
    console.error('[send-access-link] getAuthedClient FAILED:', e?.message)
    return NextResponse.json({ error: 'Auth client creation failed: ' + (e?.message || 'unknown') }, { status: 500 })
  }

  // must be logged-in and owner/admin
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  console.log('[send-access-link] getUser:', auth?.user?.email || 'null', 'error:', authErr?.message || 'none')
  if (!auth?.user) return NextResponse.json({ error: 'Unauthorized', detail: authErr?.message || 'no user' }, { status: 401 })
  const { data: isOwner } = await supabase.rpc('app_is_owner')
  const { data: isAdmin } = await supabase.rpc('app_is_admin')
  console.log('[send-access-link] isOwner:', isOwner, 'isAdmin:', isAdmin)
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

    // --- Recupera il nome dell'utente da app_accounts o hr_staff
    let userName = ''
    try {
      const { data: accData } = await srv
        .from('app_accounts')
        .select('name')
        .eq('email', email)
        .maybeSingle()
      if (accData?.name) {
        userName = accData.name
      } else {
        const { data: staffData } = await srv
          .from('hr_staff')
          .select('full_name')
          .eq('email', email)
          .maybeSingle()
        if (staffData?.full_name) {
          userName = staffData.full_name
        }
      }
    } catch {}

    // --- Se l'utente ESISTE in Authentication → set needs_onboarding, collega user_id, manda reset
    const existsUid = await findAuthUserIdByEmail(email)
    console.log('[send-access-link] existsUid:', existsUid, 'email:', email)
    if (existsUid) {
      try {
        await supabaseAdmin.auth.admin.updateUserById(existsUid, {
          user_metadata: { needs_onboarding: true, is_onboarded: false, full_name: userName },
        })
      } catch (e) {
        console.error('[send-access-link] Error updating existing user:', e)
      }

      // ⬇️ collega subito la riga su app_accounts
      try {
        await srv
          .from('app_accounts')
          .update({ user_id: existsUid })
          .is('user_id', null)
          .eq('email', email)
      } catch {}

      console.log('[send-access-link] Sending resetPasswordForEmail to:', email, 'redirectTo:', redirectTo)
      const { error: resetErr } = await supabaseAnonServer.auth.resetPasswordForEmail(email, { redirectTo })
      console.log('[send-access-link] resetPasswordForEmail result:', resetErr ? resetErr.message : 'OK')
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
    console.log('[send-access-link] Sending invite to:', email, 'redirectTo:', redirectTo)
    const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { 
      redirectTo,
      data: {
        full_name: userName,
        needs_onboarding: true,
        is_onboarded: false
      }
    })
    if (!invite.error) {
      const newUid = invite.data?.user?.id || null

      // metadati onboarding
      try {
        if (newUid) {
          await supabaseAdmin.auth.admin.updateUserById(newUid, {
            user_metadata: { needs_onboarding: true, is_onboarded: false, full_name: userName },
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
    console.error('[send-access-link] CATCH ERROR:', e?.message, e?.stack)
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
