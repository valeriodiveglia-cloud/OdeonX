import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Blocca metodi diversi da POST
export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
export async function PUT() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
export async function DELETE() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}

type DeleteBody = { id?: string }

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const id = String((body as DeleteBody)?.id ?? '').trim()
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    const { error } = await supabase.from('suppliers').delete().eq('id', id)
    if (error) {
      const isPerm =
        /permission denied|row-level security|violates row-level|not authorized/i.test(
          error.message || ''
        )
      return NextResponse.json(
        { error: isPerm ? 'Forbidden' : error.message },
        { status: isPerm ? 403 : 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}
