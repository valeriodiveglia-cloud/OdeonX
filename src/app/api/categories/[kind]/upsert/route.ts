import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const tableByKind = {
  dish: 'dish_categories',
  prep: 'recipe_categories',
  equipment: 'equipment_categories',
} as const

export async function POST(
  req: Request,
  { params }: { params: { kind: 'dish'|'prep'|'equipment' } }
) {
  const table = tableByKind[params.kind]
  const { row } = await req.json()
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
