// NOTE: Shim per ambienti client: intercetta .from('equipment_categories'|'categories'|'suppliers')
// e reindirizza a /api/... che usa i cookie (sessione utente).
// Per tutte le altre tabelle, forward al client reale **con type overload** per evitare union.
import { supabase as realSupabase } from '@/lib/supabase'

type InterceptedTable = 'equipment_categories' | 'categories' | 'suppliers'

// Mappa tabella -> API endpoint
const tableToApi: Record<InterceptedTable, string> = {
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

// Tipi "thenable" per preservare la catena .select(...).order(...).then(...)
type ThenableResult = PromiseLike<{ data: any; error: any }>
type ShimAfterSelect = ThenableResult & { order: (_col: string, _opts?: any) => ThenableResult }
type ShimFromBuilder = {
  select: (_cols?: string) => ShimAfterSelect
  order: (_col: string, _opts?: any) => ThenableResult
}

// Overload di tipo:
// - se la tabella è una delle intercettate, ritorna il builder shim
// - altrimenti ritorna il builder reale di supabase (che ha upsert/insert/delete ecc.)
export const supabase: {
  from(table: 'equipment_categories'): ShimFromBuilder
  from(table: 'categories'): ShimFromBuilder
  from(table: 'suppliers'): ShimFromBuilder
  // fallback: qualunque altra tabella -> builder reale
  from(table: string): ReturnType<typeof realSupabase.from>
} = {
  from(table: string): any {
    if ((table as InterceptedTable) in tableToApi) {
      const api = tableToApi[table as InterceptedTable]
      const doFetch = () => fetchAsSupabaseResult(api)

      const chainAfterSelect: any = Object.assign(
        {
          order: (_col: string, _opts?: any) => doFetch(),
        },
        {
          then: (onFulfilled: any, onRejected: any) => doFetch().then(onFulfilled, onRejected),
          catch: (onRejected: any) => doFetch().catch(onRejected),
          finally: (onFinally: any) => doFetch().finally(onFinally),
        }
      )

      return {
        select: (_cols?: string) => chainAfterSelect,
        order: (_col: string, _opts?: any) =>
          // .order chiamato senza .select: ritorniamo un thenable semplice
          ({
            then: (onFulfilled: any, onRejected: any) => doFetch().then(onFulfilled, onRejected),
            catch: (onRejected: any) => doFetch().catch(onRejected),
            finally: (onFinally: any) => doFetch().finally(onFinally),
          }),
      } as ShimFromBuilder
    }

    // Tabella non intercettata: passa al client reale (tipi completi: upsert, insert, ecc.)
    return (realSupabase as any).from(table)
  },
}
