// src/app/api/diag/auth/route.ts
import { NextResponse } from 'next/server'
import { authOr401 } from '@/lib/routeAuth'

export const runtime = 'nodejs'

export async function GET() {
  const gate = await authOr401()
  if (!gate.ok) return gate.response
  const { supabase, session } = gate

  const user = session.user
  const { data: acct, error } = await supabase
    .from('app_accounts')
    .select('user_id, role, is_active')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    session: { userId: user.id, email: user.email },
    appAccount: acct ?? null,
    appAccountError: error?.message ?? null,
  })
}
