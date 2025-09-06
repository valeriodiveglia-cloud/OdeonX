// src/app/api/categories/[kind]/delete/route.ts
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

function parseIdFrom(anything: unknown): number | null {
  const n = Number(anything)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function GET()   { return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 }) }
export async function PUT()   { return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 }) }

export async function DELETE(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  // proxy su POST per avere una sola logica
  return POST(req, ctx)
}

export async function POST(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const gate = await authOr401()
  if (!gate.ok) return gate.response
  const { supabase } = gate

  const { kind: raw } = await params
  const kind = Array.isArray(raw) ? raw[0] : raw
  if (!kind || !isKind(kind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
  }
  const table = tableByKind[kind]

  let id: number | null = null
  try {
    // prova dal body { id }
    const body = await req.clone().json().catch(() => null) as any
    if (body && (body.id ?? body?.row?.id) != null) {
      id = parseIdFrom(body.id ?? body?.row?.id)
    }
  } catch { /* ignore */ }

  if (id == null) {
    // fallback da query ?id=...
    const url = new URL(req.url)
    id = parseIdFrom(url.searchParams.get('id'))
  }

  if (id == null) {
    return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) {
    const isPerm = /permission denied|row-level security|violates row-level|not authorized/i.test(error.message || '')
    return NextResponse.json(
      { error: isPerm ? 'Forbidden' : error.message },
      { status: isPerm ? 403 : 500 }
    )
  }

  // Se non esisteva, restituiamo comunque 200 con deleted=false
  return NextResponse.json({ deleted: !!data, id }, { status: 200 })
}
