// src/app/(app)/settings/categories/[kind]/list/route.ts
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

export async function GET(_req: Request, ctx: any) {
  const supabase = createRouteHandlerClient({ cookies })

  const raw = ctx?.params?.kind as string | string[] | undefined
  const kind = Array.isArray(raw) ? raw[0] : raw
  if (!kind || !isKind(kind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
  }

  const table = tableByKind[kind]
  const { data, error } = await supabase
    .from(table)
    .select('id,name,description,sort_order,is_active')
    .order('sort_order', { ascending: true, nullsFirst: true })
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data: data ?? [] })
}

