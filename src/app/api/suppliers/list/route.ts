import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
export const runtime = 'nodejs'

export async function GET(_req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('suppliers')
    .select('id,name')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 403 })
  return NextResponse.json({ data: data ?? [] })
}
