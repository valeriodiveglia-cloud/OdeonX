// src/app/api/categories/[kind]/list/route.ts
import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

const tableByKind = {
  dish: 'dish_categories',
  prep: 'recipe_categories',
  equipment: 'equipment_categories',
} as const

type Kind = keyof typeof tableByKind
const isKind = (v: string): v is Kind =>
  v === 'dish' || v === 'prep' || v === 'equipment'

export async function GET(_req: Request, ctx: { params?: { kind?: string } }) {
  const raw = ctx?.params?.kind
  const kind = Array.isArray(raw) ? raw[0] : raw
  if (!kind || !isKind(kind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
  }

  // Client legato ai cookie HttpOnly ⇒ usa la sessione dell’utente
  const supabase = createRouteHandlerClient({ cookies })

  try {
    const table = tableByKind[kind]
    const { data, error } = await supabase
      .from(table)
      .select('id,name,description,sort_order,is_active')
      .order('sort_order', { ascending: true, nullsFirst: true })
      .order('name', { ascending: true })

    if (error) {
      // Se la sessione manca/scade, o RLS blocca, PostgREST può dare 401/403
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    return NextResponse.json({ data: data ?? [] })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Unknown server error' },
      { status: 500 }
    )
  }
}
