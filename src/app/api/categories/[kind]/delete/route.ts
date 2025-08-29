import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

const tableByKind = {
  dish: 'dish_categories',
  prep: 'recipe_categories',
  equipment: 'equipment_categories',
} as const

type Kind = keyof typeof tableByKind // 'dish' | 'prep' | 'equipment'

function isKind(v: string): v is Kind {
  return v === 'dish' || v === 'prep' || v === 'equipment'
}

export async function POST(
  req: Request,
  { params }: { params: Record<string, string | string[]> }
) {
  const raw = params.kind
  const kind = Array.isArray(raw) ? raw[0] : raw

  if (!kind || !isKind(kind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
  }

  const table = tableByKind[kind]

  let id: unknown
  try {
    const body = await req.json()
    id = body?.id
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!id || (typeof id !== 'string' && typeof id !== 'number')) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from(table).delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
