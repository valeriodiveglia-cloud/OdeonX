// src/app/api/categories/[kind]/list/route.ts
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

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind: raw } = await params
  const kind = Array.isArray(raw) ? raw[0] : raw

  if (!kind || !isKind(kind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
  }

  // ✅ Enforce auth (401 se non autenticato) e ottieni supabase “session-bound”
  const gate = await authOr401()
  if (!gate.ok) return gate.response
  const { supabase } = gate

  try {
    const table = tableByKind[kind]
    const { data, error } = await supabase
      .from(table)
      .select('id,name,description,sort_order,is_active')
      .order('sort_order', { ascending: true, nullsFirst: true })
      .order('name', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    return NextResponse.json({ data: data ?? [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
