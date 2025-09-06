// src/app/api/categories/[kind]/delete/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const tableByKind = {
  dish: 'dish_categories',
  prep: 'recipe_categories',
  equipment: 'equipment_categories',
} as const

type Kind = keyof typeof tableByKind
const isKind = (v: string): v is Kind => v in tableByKind

type DeleteBody = { id?: number | string }

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

export async function POST(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const { kind: raw } = await params
    const kind = Array.isArray(raw) ? raw[0] : raw
    if (!kind || !isKind(kind)) {
      return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
    }
    const table = tableByKind[kind]

    // Auth guard
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse body robusto
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const idRaw = (body as DeleteBody)?.id
    const id = typeof idRaw === 'number' ? idRaw : String(idRaw ?? '').trim()
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    const { error } = await supabase.from(table).delete().eq('id', id)
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
