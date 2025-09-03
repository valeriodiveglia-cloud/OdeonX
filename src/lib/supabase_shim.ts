// NOTE: Shim per ambienti client: intercetta .from('equipment_categories'|'categories'|'suppliers')
// e reindirizza a /api/... che usa i cookie (sessione utente).
// Per tutte le altre tabelle, forward al client reale.
import { supabase as realSupabase } from '@/lib/supabase'

// Mappa tabella -> API endpoint
const tableToApi: Record<string, string> = {
  equipment_categories: '/api/categories/equipment/list',
  categories: '/api/categories/generic/list',
  suppliers: '/api/suppliers/list',
}

// Helper fetch -> { data, error } in formato "supabase-like"
async function fetchAsSupabaseResult(url: string): Promise<{ data: any; error: any }> {
  try {
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText)
      return { data: null, error: new Error(msg || `HTTP ${res.status}`) }
    }
    const json = await res.json().catch(() => ({}))
    return { data: json?.data ?? null, error: null }
  } catch (e: any) {
    return { data: null, error: e }
  }
}

// Costruiamo un "client" compatibile per il sottoinsieme che usano le nostre pagine:
//   supabase.from('table').select('...').order('name', { ascending: true })
// Implementazione: select() ritorna un thenable (Promise-like) che ha anche .order().
// Così le catene esistenti continuano a funzionare.
export const supabase = {
  from(table: string) {
    const api = tableToApi[table]
    if (!api) {
      // Tabella non intercettata: usa il client reale
      return realSupabase.from(table)
    }

    const doFetch = () => fetchAsSupabaseResult(api)

    // Promise base (select senza order)
    const basePromise: any = {
      then: (onFulfilled: any, onRejected: any) => doFetch().then(onFulfilled, onRejected),
      catch: (onRejected: any) => doFetch().catch(onRejected),
      finally: (onFinally: any) => doFetch().finally(onFinally),
    }

    const chainAfterSelect: any = {
      then: (onFulfilled: any, onRejected: any) => doFetch().then(onFulfilled, onRejected),
      catch: (onRejected: any) => doFetch().catch(onRejected),
      finally: (onFinally: any) => doFetch().finally(onFinally),
      // .order(...) non cambia l'endpoint: lo manteniamo per compatibilità fluente
      order: (_col: string, _opts?: any) => chainAfterSelect,
    }

    return {
      // select(...) ritorna un "thenable" su cui spesso viene chiamato .order(...).
      // Noi ignoriamo le colonne richieste, perché l'API già restituisce i campi necessari.
      select: (_cols?: string) => chainAfterSelect,
      // Se qualcuno fa .from(...).select(...).order(...) manca la select? Copriamo anche il caso
      // raro in cui venga chiamato .order direttamente (ritorniamo un thenable).
      order: (_col: string, _opts?: any) => basePromise,
    }
  },
}
