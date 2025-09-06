// src/app/api/diag/cookies/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

export async function GET() {
  const jar = await cookies()
  const all = jar.getAll().map(c => ({ name: c.name, value: (c.value || '').slice(0, 12) + '…' }))
  const sb = all.filter(c => c.name.includes('sb-') && c.name.includes('-auth-token'))
  return NextResponse.json({ allNames: all.map(c => c.name), supabaseAuthCookies: sb })
}
