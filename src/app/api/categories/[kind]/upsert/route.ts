import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const runtime = 'nodejs'

const tableByKind = {
  dish: 'dish_categories',
  prep: 'recipe_categories',
  equipment: 'equipment_categories',
} as const

type Kind = keyof typeof tableByKind
const isKind = (v: string): v is Kind =>
  v === 'dish' || v === 'prep' || v === 'equipment'

export async function POST(req: Request, ctx: any) {
  // Narrowing sicuro del param dinamico [kind]
  const raw = ctx?.params?.kind as string | string[] | undefined
  const kind = Array.isArray(raw) ? raw[0] : raw
  if (!kind || !isKind(kind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
  }

  const table = tableByKind[kind]

  // Body minimale { row?: { id?, name } }
  const { row } = (await req.json().catch(() => ({}))) as { row?: any }
  const name = String(row?.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const payload = { name }

  const result = row?.id
    ? await supabaseAdmin.from(table).update(payload).eq('id', row.id).select('id,name').single()
    : await supabaseAdmin.from(table).insert(payload).select('id,name').single()

  const { data, error } = result
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
