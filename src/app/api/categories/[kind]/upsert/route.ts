// src/app/api/categories/[kind]/upsert/route.ts
import { NextResponse } from 'next/server'
import { authOr401 } from '@/lib/routeAuth'

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

export async function GET()   { return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 }) }
export async function PUT()   { return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 }) }
export async function DELETE(){ return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 }) }

export async function POST(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const gate = await authOr401()
  if (!gate.ok) return gate.response
  const { supabase } = gate

  const { kind: raw } = await params
  const kind = Array.isArray(raw) ? raw[0] : raw
  if (!kind || !isKind(kind)) return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
  const table = tableByKind[kind]

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const row: RowInput = (body as any)?.row ?? (body as any) ?? {}

  const name = String(row?.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const sortOrder =
    (typeof row.sort_order === 'number' && Number.isFinite(row.sort_order)) ? row.sort_order : 0

  const payload = {
    name,
    description: row.description ?? null,
    sort_order: sortOrder,
    is_active: row.is_active ?? true,
  }

  const sel = 'id,name,description,sort_order,is_active'

  const result = row.id != null
    ? await supabase.from(table).update(payload).eq('id', row.id!).select(sel).single()
    : await supabase.from(table).insert(payload).select(sel).single()

  if (result.error) {
    const isPerm = /permission denied|row-level security|violates row-level|not authorized/i.test(result.error.message || '')
    return NextResponse.json({ error: isPerm ? 'Forbidden' : result.error.message }, { status: isPerm ? 403 : 500 })
  }

  return NextResponse.json({ data: result.data }, { status: row.id != null ? 200 : 201 })
}
