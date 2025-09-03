import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = (await req.json().catch(() => ({}))) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('suppliers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
