// src/app/api/users/send-access-link/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabaseAnonServer } from '@/lib/supabaseAdmin' // se hai un file dedicato, cambia import

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: Request) {
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

    const redirectTo = `${site}/auth/update-password`

    // 1) invito (nuovo utente)
    const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo })
    if (!invite.error) {
      return NextResponse.json({ ok: true, mode: 'invite' })
    }

    // 2) già esiste → reset password (così non “autentica” nessuno finché non clicca l’email)
    const msg = invite.error.message?.toLowerCase() || ''
    const already = msg.includes('already') || msg.includes('exists') || msg.includes('registered')
    if (already) {
      // usa il client anon lato server (non quello browser)
      const { error: resetErr } = await supabaseAnonServer.auth.resetPasswordForEmail(email, { redirectTo })
      if (resetErr) return NextResponse.json({ error: resetErr.message }, { status: 400 })
      return NextResponse.json({ ok: true, mode: 'password_reset' })
    }

    return NextResponse.json({ error: invite.error.message || 'Invite failed' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
