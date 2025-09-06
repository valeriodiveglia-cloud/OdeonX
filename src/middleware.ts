// src/middleware.ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// Attiva il middleware SOLO su questi percorsi (niente api/_next/login/assets)
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/archive/:path*',
    '/equipment/:path*',
    '/equipment-history/:path*',
    '/event-calculator/:path*',
    '/materials/:path*',
    '/materials-history/:path*',
    '/recipes/:path*',
    '/settings/:path*',
    '/suppliers/:path*',
    '/trash/:path*',
    '/users/:path*',
    '/admin/:path*',
  ],
}

// --- util ---
function getProjectRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const m = url.match(/^https?:\/\/([^.]+)\./)
  return m?.[1] || ''
}

function hasSupabaseSession(req: NextRequest) {
  const ref = getProjectRef()
  if (!ref) return false

  const names = req.cookies.getAll().map((c) => c.name)
  const reAuth = new RegExp(`^sb-${ref}-auth-token(?:\\.\\d+)?$`)
  const reRefresh = new RegExp(`^sb-${ref}-refresh-token(?:\\.\\d+)?$`)
  const legacy = ['sb-access-token', 'sb-refresh-token', 'session']

  return names.some((n) => reAuth.test(n) || reRefresh.test(n) || legacy.includes(n))
}

function isPublicPath(pathname: string) {
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/auth') ||
    pathname === '/login' ||
    pathname === '/' ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff2?)$/.test(pathname)
  ) {
    return true
  }
  return false
}

// Percorsi realmente protetti (per leggibilità nel codice; il matcher sopra li già limita)
const PROTECTED: string[] = [
  '/dashboard',
  '/archive',
  '/equipment',
  '/equipment-history',
  '/event-calculator',
  '/materials',
  '/materials-history',
  '/recipes',
  '/settings',
  '/suppliers',
  '/trash',
  '/users',
  '/admin',
]

// --- middleware ---
export function middleware(req: NextRequest) {
  const url = new URL(req.url)
  const { pathname, search } = url

  // health ping
  if (pathname === '/__mw-ping') {
    const res = new NextResponse(null, { status: 204 })
    res.headers.set('x-mw', 'alive')
    return res
  }

  // IMPORTANTISSIMO: lasciamo passare le non-GET (Server Actions, POST form, ecc.)
  if (req.method !== 'GET') return NextResponse.next()

  // lasciamo passare le robe pubbliche e gli asset
  if (isPublicPath(pathname)) return NextResponse.next()

  // Se il path è fra quelli protetti e non c'è sessione -> redirect al login
  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )

  if (isProtected && !hasSupabaseSession(req)) {
    const to = new URL('/login', req.url)
    to.searchParams.set('redirect', pathname + (search || ''))
    return NextResponse.redirect(to, 302)
  }

  return NextResponse.next()
}
