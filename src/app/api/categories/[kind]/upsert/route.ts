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
const isKind = (v: string): v is Kind => v === 'dish' || v === 'prep' || v === 'equipment'

export async function POST(req: Request, ctx: { params: { kind: string } }) {
  const raw = ctx?.params?.kind
  const kind = Array.isArray(raw) ? raw[0] : raw
  if (!kind || !isKind(kind)) return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
  const table = tableByKind[kind]

  const { row } = (await req.json().catch(() => ({}))) as { row?: any }
  const name = String(row?.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  // Client UTENTE: prende il token dai cookie Supabase
  const supabase = createRouteHandlerClient({ cookies })

  // opzionale: se vuoi forzare che sia loggato
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = { name }
  const result = row?.id
    ? await supabase.from(table).update(payload).eq('id', row.id).select('id,name').single()
    : await supabase.from(table).insert(payload).select('id,name').single()

  const { data, error } = result
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
