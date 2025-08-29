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
  if (!row || !row.name || String(row.name).trim() === '') {
    return NextResponse.json({ error: 'Name required' }, { status: 400 })
  }

  // Se esiste id → update. Se non esiste → insert.
  const payload = {
    name: String(row.name).trim(),
    description: row.description ?? null,
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : null,
    is_active: typeof row.is_active === 'boolean' ? row.is_active : true,
  }

  let result
  if (row.id) {
    result = await supabaseAdmin.from(table).update(payload).eq('id', row.id).select().single()
  } else {
    result = await supabaseAdmin.from(table).insert(payload).select().single()
  }

  const { data, error } = result
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
