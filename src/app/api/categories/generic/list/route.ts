// src/app/api/categories/generic/list/route.ts
import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const tableByKind = {
  dish: 'dish_categories',
  prep: 'recipe_categories',
  equipment: 'equipment_categories',
} as const
type Kind = keyof typeof tableByKind
const isKind = (v: string): v is Kind => v in tableByKind

export async function POST() { return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 }) }
export async function PUT()  { return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 }) }
export async function DELETE(){ return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 }) }

export async function GET(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const kindParam = url.searchParams.get('kind') || ''
    const kind = Array.isArray(kindParam) ? kindParam[0] : kindParam
    if (!isKind(kind)) {
      return NextResponse.json({ error: 'Invalid kind (use dish|prep|equipment)' }, { status: 400 })
    }

    const table = tableByKind[kind]
    const { data, error } = await supabase
      .from(table)
      .select('id,name,description,sort_order,is_active')
      .order('sort_order', { ascending: true, nullsFirst: true })
      .order('name', { ascending: true })

    if (error) {
      const isPerm = /permission denied|row-level security|not authorized|violates row-level/i.test(error.message || '')
      return NextResponse.json({ error: isPerm ? 'Forbidden' : error.message }, { status: isPerm ? 403 : 500 })
    }

    return NextResponse.json({ data: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 })
  }
}
