// src/app/(app)/settings/categories/[kind]/upsert/route.ts
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
const isKind = (v: string): v is Kind =>
  v === 'dish' || v === 'prep' || v === 'equipment'

export async function POST(req: Request, ctx: any) {
  const supabase = createRouteHandlerClient({ cookies })

  // 1) Param [kind]
  const raw = ctx?.params?.kind as string | string[] | undefined
  const kind = Array.isArray(raw) ? raw[0] : raw
  if (!kind || !isKind(kind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
  }
  const table = tableByKind[kind]

  // 2) Body parsing
  const body = await req.json().catch(() => ({} as any))
  const row = (body as any)?.row
  if (!row || !row.name || String(row.name).trim() === '') {
    return NextResponse.json({ error: 'Name required' }, { status: 400 })
  }

  // 3) Normalize payload
  const payload = {
    name: String(row.name).trim(),
    description: row.description ?? null,
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : null,
    is_active: typeof row.is_active === 'boolean' ? row.is_active : true,
  }

  // 4) Upsert
  let result
  if (row.id !== undefined && row.id !== null && String(row.id).length > 0) {
    result = await supabase
      .from(table)
      .update(payload)
      .eq('id', row.id)
      .select()
      .single()
  } else {
    result = await supabase
      .from(table)
      .insert(payload)
      .select()
      .single()
  }

  const { data, error } = result
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
}
