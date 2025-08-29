import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const tableByKind = {
  dish: 'dish_categories',
  prep: 'recipe_categories',
  equipment: 'equipment_categories',
} as const

export async function GET(
  _req: Request,
  { params }: { params: { kind: 'dish'|'prep'|'equipment' } }
) {
  const table = tableByKind[params.kind]
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('id,name')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
