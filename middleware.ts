import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

export async function middleware(req: NextRequest) {
  // Cloniamo l'header host/headers per evitare warning di Next
  const res = NextResponse.next({ request: { headers: req.headers } })

  // In Next 15 il middleware deve toccare i cookie per mantenerli freschi
  const supabase = createMiddlewareClient({ req, res })

  // Questa chiamata fa il "refresh" dei cookie se la sessione esiste
  await supabase.auth.getSession()

  return res
}

/**
 * Applichiamo il middleware a:
 * - tutte le pagine/app route (esclude asset statici)
 * - le API interne (/api/**) così i route handler vedono i cookie utente
 */
export const config = {
  matcher: [
    // API interne
    '/api/:path*',
    // Pagine app (escludi statiche e immagini)
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)',
  ],
}
