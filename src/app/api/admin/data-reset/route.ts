// app/api/admin/data-reset/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCallerInfo } from '@/lib/server/auth'

type Scope =
  | 'materials'
  | 'suppliers'
  | 'categories'
  | 'recipes'
  | 'equipment'
  | 'settings'
  | 'all'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export async function POST(req: NextRequest) {
  try {
    // 1) prendo userId dalla sessione
    const { role: baseRole, userId } = await getCallerInfo(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // 2) ruolo vero dal DB (service role, zero RLS)
    const { data: acc, error: accErr } = await admin
      .from('app_accounts')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
    if (accErr) {
      return NextResponse.json({ error: `Accounts lookup failed: ${accErr.message}` }, { status: 500 })
    }
    const role = String(acc?.role || baseRole || '').toLowerCase()

    // 3) input
    const body = await req.json().catch(() => ({}))
    const scope = String(body?.scope || '').toLowerCase() as Scope

    const allowed: Scope[] = [
      'materials', 'suppliers', 'categories', 'recipes', 'equipment', 'settings', 'all',
    ]
    if (!allowed.includes(scope)) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
    }

    // 4) autorizzazioni
    if (scope === 'all') {
      if (role !== 'owner') {
        return NextResponse.json({ error: `Only owner can reset all (your role: ${role || 'none'})` }, { status: 403 })
      }
    } else {
      if (role !== 'owner' && role !== 'admin') {
        return NextResponse.json({ error: `Forbidden (your role: ${role || 'none'})` }, { status: 403 })
      }
    }

    // 5) esecuzione per scope singolo
    const runSingle = async (s: Exclude<Scope, 'all'>) => {
      if (s === 'suppliers') {
        const { error } = await admin.rpc('admin_reset_suppliers')
        if (error) throw error
        return
      }
      if (s === 'settings') {
        const { error } = await admin.rpc('admin_reset_settings')
        if (error) throw error
        return
      }
      // per materials / recipes / equipment / categories usiamo la centrale passando userId
      const { error } = await admin.rpc('admin_reset_data', {
        scope: s,
        caller_user_id: userId,
      })
      if (error) throw error
    }

    // 6) dispatch
    if (scope === 'all') {
      // ordine sensato
      for (const s of ['recipes', 'materials', 'equipment', 'categories'] as const) {
        await runSingle(s)
      }
      await runSingle('suppliers')
      await runSingle('settings')
      return NextResponse.json({ ok: true }, { status: 200 })
    } else {
      await runSingle(scope as Exclude<Scope, 'all'>)
      return NextResponse.json({ ok: true }, { status: 200 })
    }
  } catch (e: any) {
    // errore dettagliato in risposta per debuggare senza aprire server logs
    return NextResponse.json(
      { error: e?.message || 'Internal error', code: e?.code, details: e?.details, hint: e?.hint },
      { status: 500 }
    )
  }
}
