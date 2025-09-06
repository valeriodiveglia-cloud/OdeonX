import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { row } = (await req.json().catch(() => ({}))) as { row?: any }
  const name = String(row?.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const payload = { name }
  const result = row?.id
    ? await supabase.from('suppliers').update(payload).eq('id', row.id).select('id,name').single()
    : await supabase.from('suppliers').insert(payload).select('id,name').single()

  const { data, error } = result
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
