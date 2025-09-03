// src/lib/supabase_shim.ts
// Scopo: evitare rogne di typing con Next 15 mantenendo la stessa API del client reale.
// Pass-through: esporta il client reale ma con return type "any" su .from(...)
// così le chiamate .select/.insert/.update/.upsert/.delete/.single() ecc. sono accettate dal type-checker.

import { supabase as realSupabase } from '@/lib/supabase'

type AnyClient = any

export const supabase: AnyClient = {
  from(table: string): AnyClient {
    // ritorna direttamente il builder reale ma tipizzato "any"
    return (realSupabase as AnyClient).from(table) as AnyClient
  },
  // forward di moduli/namespace utili
  auth: (realSupabase as AnyClient).auth,
  storage: (realSupabase as AnyClient).storage,
  functions: (realSupabase as AnyClient).functions,
  rpc: (realSupabase as AnyClient).rpc?.bind(realSupabase),
}
