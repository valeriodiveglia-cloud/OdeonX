import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Solo POST: qualsiasi altro metodo riceve 405
export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
export async function PUT() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
export async function DELETE() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}

type SupplierRow = {
  id?: string
  name?: string
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse JSON sicuro
    let body: unknown = null
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const row = (body as { row?: SupplierRow })?.row ?? {}
    const name = String(row?.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }

    const payload = { name }

    const result = row?.id
      ? await supabase.from('suppliers')
          .update(payload)
          .eq('id', row.id!)
          .select('id,name')
          .single()
      : await supabase.from('suppliers')
          .insert(payload)
          .select('id,name')
          .single()

    const { data, error } = result
    if (error) {
      // 403 per errori RLS/permessi, altrimenti 500
      const isPerm =
        /permission denied|row-level security|violates row-level|not authorized/i.test(
          error.message || ''
        )
      return NextResponse.json(
        { error: isPerm ? 'Forbidden' : error.message },
        { status: isPerm ? 403 : 500 }
      )
    }

    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}
