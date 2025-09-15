// src/app/api/users/send-access-link/route.ts
import { NextResponse } from 'next/server'
import { cookies } from "next/headers"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { createClient } from "@supabase/supabase-js"
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabaseAnonServer } from '@/lib/supabaseAnonServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: Request) {
  // auth inline: cookie o bearer
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || ""
  const useBearer = /^Bearer\s+/.test(authHeader)
  const supabase = useBearer
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } } })
    : createRouteHandlerClient({ cookies })
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: isOwner } = await supabase.rpc("app_is_owner")
  const { data: isAdmin } = await supabase.rpc("app_is_admin")
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  // DIAG TEMP: check env and caller role path
  if (req.headers.get("x-diag") === "1") {
    return NextResponse.json({
      diag: {
        has_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        has_anon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        has_service: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        site_url: process.env.NEXT_PUBLIC_SITE_URL || null
      }
    })
  }
  // Consenti solo a owner o admin

  try {
    const body = await req.json().catch(() => null)
    const email = body?.email?.trim()?.toLowerCase()
    const redirectToBase: string | undefined = body?.redirectToBase

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const site = redirectToBase || process.env.NEXT_PUBLIC_SITE_URL
    if (!site) {
      return NextResponse.json({ error: 'Missing NEXT_PUBLIC_SITE_URL' }, { status: 500 })
    }

    const redirectTo = `${site}/auth/callback?type=invite&next=/auth/update-password`

    // 1) Prova invito come nuovo utente
    console.log("DEBUG: calling inviteUserByEmail", email, redirectTo)
    const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo })
    console.log("DEBUG: invite result", invite)
    if (!invite.error) {
      return NextResponse.json({ ok: true, mode: 'invite' })
    }

    // 2) Se esiste gia, invia reset password con client anon lato server
    const msg = invite.error.message?.toLowerCase() || ''
    const already = msg.includes('already') || msg.includes('exists') || msg.includes('registered')
      console.log("DEBUG: fallback resetPasswordForEmail", email)
    if (already) {
      const { error: resetErr } = await supabaseAnonServer.auth.resetPasswordForEmail(email, { redirectTo })
        console.error("DEBUG: reset error", resetErr)
      if (resetErr) {
        return NextResponse.json({ error: resetErr.message }, { status: 400 })
      }
      return NextResponse.json({ ok: true, mode: 'password_reset' })
    }

    return NextResponse.json({ error: invite.error.message || 'Invite failed' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
