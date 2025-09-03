// src/lib/supabaseServer.ts
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export function createSupabaseServer() {
  // In Next 15 alcuni ambienti tipizzano cookies() come Promise<ReadonlyRequestCookies>.
  // Manteniamo l'API sincrona senza refactor dei call-site: castiamo a any per il type-checker.
  // @ts-expect-error Next 15 may type cookies() as Promise; we intentionally coerce here.
  const cookieStore: any = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          cookieStore.set(name, value, options)
        },
        remove(name: string, options: any) {
          cookieStore.set(name, '', { ...options, maxAge: 0 })
        },
      },
    }
  )
}
