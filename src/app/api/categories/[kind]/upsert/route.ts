import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export const runtime = 'nodejs'

const tableByKind = {
  dish: 'dish_categories',
  prep: 'recipe_categories',
  equipment: 'equipment_categories',
} as const
type Kind = keyof typeof tableByKind
const isKind = (v: string): v is Kind => v in tableByKind

type RowInput = {
  id?: number
  name?: string
  description?: string | null
  sort_order?: number | null
  is_active?: boolean | null
}

export async function POST(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind: raw } = await params
  const kind = Array.isArray(raw) ? raw[0] : raw
  if (!kind || !isKind(kind)) return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
  const table = tableByKind[kind]

  const body = (await req.json().catch(() => ({}))) as { row?: RowInput }
  const row = body?.row ?? {}
  const name = String(row?.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const supabase = createRouteHandlerClient({ cookies })

  // Enforce session (RLS/permessi utente)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = {
    name,
    description: row.description ?? null,
    sort_order: row.sort_order ?? null,
    is_active: row.is_active ?? true,
  }

  const result = row.id != null
    ? await supabase.from(table).update(payload).eq('id', row.id).select('id,name,description,sort_order,is_active').single()
    : await supabase.from(table).insert(payload).select('id,name,description,sort_order,is_active').single()

  const { data, error } = result
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: row.id != null ? 200 : 201 })
}
