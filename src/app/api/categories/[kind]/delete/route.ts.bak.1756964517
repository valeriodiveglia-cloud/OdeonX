// src/app/api/categories/[kind]/delete/route.ts
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

  const rawKind = ctx?.params?.kind as string | string[] | undefined
  const kind = Array.isArray(rawKind) ? rawKind[0] : rawKind
  if (!kind || !isKind(kind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
  }

  const { id } = await req.json().catch(() => ({} as any))
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const table = tableByKind[kind]
  const { error } = await supabase.from(table).delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
