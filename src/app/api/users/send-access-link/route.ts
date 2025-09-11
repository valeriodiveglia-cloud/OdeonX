import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabaseAnonServer } from '@/lib/supabaseAnonServer'
import { createSupabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const useBearer = /^Bearer\s+/.test(authHeader)

  const supabase = useBearer
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: authHeader } } }
      )
    : createSupabaseServer()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isOwner } = await supabase.rpc('app_is_owner')
  const { data: isAdmin } = await supabase.rpc('app_is_admin')
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
    const email = body?.email?.trim()?.toLowerCase()
    const redirectToBase: string | undefined = body?.redirectToBase

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const site = redirectToBase || process.env.NEXT_PUBLIC_SITE_URL
    if (!site) return NextResponse.json({ error: 'Missing NEXT_PUBLIC_SITE_URL' }, { status: 500 })

    const redirectTo = `${site}/auth/callback?next=/login`

    const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo })
    if (!invite.error) return NextResponse.json({ ok: true, mode: 'invite' })

    const msg = invite.error.message?.toLowerCase() || ''
    const already = msg.includes('already') || msg.includes('exists') || msg.includes('registered')
    if (already) {
      const { error: resetErr } = await supabaseAnonServer.auth.resetPasswordForEmail(email, { redirectTo })
      if (resetErr) return NextResponse.json({ error: resetErr.message }, { status: 400 })
      return NextResponse.json({ ok: true, mode: 'password_reset' })
    }

    return NextResponse.json({ error: invite.error.message || 'Invite failed' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
