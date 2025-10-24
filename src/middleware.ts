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
    '/catering/:path*',
  ],
}

// ========== Utils ==========

// Ricostruisce un valore cookie chunked (.0 .1 ...) dato il baseName
function joinCookieChunks(req: NextRequest, baseName: string): string | null {
  const chunks = req.cookies
    .getAll()
    .filter(c => c.name === baseName || c.name.startsWith(`${baseName}.`))
    .map(c => {
      const val = (c.value?.startsWith('"') && c.value?.endsWith('"')) ? c.value.slice(1, -1) : c.value
      const m = c.name.match(/\.(\d+)$/)
      return { idx: m ? parseInt(m[1], 10) : -1, val }
    })

  if (chunks.length === 0) return null
  if (chunks.every(c => c.idx === -1)) return chunks[0].val || null
  chunks.sort((a, b) => a.idx - b.idx)
  return chunks.map(c => c.val).join('')
}

// Safe JSON.parse
function tryParseJson<T = any>(s: string): T | null {
  try { return JSON.parse(s) } catch { return null }
}

// Base64/Base64URL decode to UTF-8 string
function b64ToUtf8(maybe: string): string | null {
  try {
    let s = maybe.trim()
    s = s.replace(/^base64[-:]/, '')
    s = s.replace(/-/g, '+').replace(/_/g, '/')
    s += '='.repeat((4 - (s.length % 4)) % 4)
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(s, 'base64').toString('utf-8')
    }
    // @ts-ignore
    return atob(s)
  } catch {
    return null
  }
}

function getPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj)
}

// Estrae l'access_token da un envelope JSON (anche base64/base64url) oppure, se già JWT "nudo", lo restituisce
function extractAccessToken(envelopeOrJwt: string | null): string | null {
  if (!envelopeOrJwt) return null
  let raw = envelopeOrJwt
  if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1)
  if (raw.split('.').length === 3) return raw

  let parsed = tryParseJson<any>(raw)
  if (!parsed) {
    const decoded = b64ToUtf8(raw)
    if (decoded) parsed = tryParseJson<any>(decoded)
  }

  if (parsed) {
    const candidates = [
      'access_token',
      'accessToken',
      'currentSession.access_token',
      'currentSession.accessToken',
      'session.access_token',
      'session.accessToken',
    ]
    for (const p of candidates) {
      const v = getPath(parsed, p)
      if (typeof v === 'string' && v.split('.').length === 3) return v
    }
  }

  return null
}

// Cerca token in qualsiasi cookie sb-*-auth-token (chunked incluso) o legacy
function findAccessTokenOrEnvelope(req: NextRequest): {
  jwt: string | null
  envelopeFound: boolean
  cookieNames: string[]
} {
  const all = req.cookies.getAll()
  const cookieNames = all.map(c => c.name)

  const baseNames = new Set<string>()
  for (const c of all) {
    if (/^sb-[^-]+-auth-token(?:\.\d+)?$/.test(c.name)) baseNames.add(c.name.replace(/\.\d+$/, ''))
  }

  for (const base of baseNames) {
    const joined = joinCookieChunks(req, base)
    if (joined) {
      const jwt = extractAccessToken(joined)
      if (jwt) return { jwt, envelopeFound: true, cookieNames }
      return { jwt: null, envelopeFound: true, cookieNames }
    }
  }

  const legacyRaw =
    req.cookies.get('sb-access-token')?.value ||
    req.cookies.get('sb-auth-token')?.value ||
    req.cookies.get('access-token')?.value ||
    null
  if (legacyRaw) {
    const jwt = extractAccessToken(legacyRaw)
    if (jwt) return { jwt, envelopeFound: true, cookieNames }
    return { jwt: null, envelopeFound: true, cookieNames }
  }

  return { jwt: null, envelopeFound: false, cookieNames }
}

// Decodifica Base64URL per leggere il payload del JWT
function base64UrlToJson<T = any>(b64url: string): T | null {
  try {
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
    const padLen = b64.length % 4
    if (padLen) b64 += '='.repeat(4 - padLen)
    const txt =
      typeof Buffer !== 'undefined'
        ? Buffer.from(b64, 'base64').toString('utf-8')
        // @ts-ignore
        : atob(b64)
    return JSON.parse(txt)
  } catch {
    return null
  }
}

// Pagine/asset pubblici
function isPublicPath(pathname: string) {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||           // API sempre pubbliche
    pathname.startsWith('/auth') ||          // login/callback/update-password
    pathname === '/login' ||
    pathname === '/' ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff2?)$/.test(pathname)
  )
}

// Percorsi protetti
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
  '/catering',
]

// ========== Middleware ==========
export async function middleware(req: NextRequest) {
  const DEBUG = process.env.NEXT_PUBLIC_DEBUG_AUTH === '1'
  const url = new URL(req.url)
  const { pathname, search } = url

  // ping
  if (pathname === '/__mw-ping') {
    const res = new NextResponse(null, { status: 204 })
    res.headers.set('x-mw', 'alive')
    return res
  }

  // Non-GET passano
  if (req.method !== 'GET') return NextResponse.next()

  // Pubblici e asset passano
  if (isPublicPath(pathname)) return NextResponse.next()

  // Solo per path protetti
  const isProtected = PROTECTED.some(p => pathname === p || pathname.startsWith(p + '/'))
  if (!isProtected) return NextResponse.next()

  // === Sessione: JWT preferito, altrimenti “envelope presente” ===
  const { jwt, envelopeFound, cookieNames } = findAccessTokenOrEnvelope(req)
  const hasAnySessionSignal = !!jwt || envelopeFound

  if (DEBUG) {
    let snapshot: any = null
    if (jwt && jwt.split('.').length === 3) {
      const p = base64UrlToJson<any>(jwt.split('.')[1])
      snapshot = {
        needs_onboarding: p?.user_metadata?.needs_onboarding ?? p?.user_meta_data?.needs_onboarding,
        is_onboarded: p?.user_metadata?.is_onboarded ?? p?.user_meta_data?.is_onboarded,
        sub: p?.sub,
        iat: p?.iat,
      }
    }
    console.log('[MW]', {
      path: pathname,
      hasAnySessionSignal,
      hasJwt: !!jwt,
      tokenLen: jwt?.length || 0,
      cookieNames,
      payload_user_metadata: snapshot,
    })
  }

  // 1) Nessun segnale di sessione → login
  if (!hasAnySessionSignal) {
    const to = new URL('/login', req.url)
    to.searchParams.set('redirect', pathname + (search || ''))
    return NextResponse.redirect(to, 302)
  }

  // 1.5) BLOCCO “inattivo/eliminato” (senza usare cookie): se ho un JWT, prendo sub e chiedo allo
  //      /api/auth/is-active?userId=<sub>. Se non attivo → /login (inactive).
  if (jwt && jwt.split('.').length === 3) {
    try {
      const payload = base64UrlToJson<any>(jwt.split('.')[1])
      const sub: string | null = payload?.sub || null
      if (sub) {
        const checkUrl = new URL('/api/auth/is-active', req.url)
        checkUrl.searchParams.set('userId', sub)
        const resp = await fetch(checkUrl.toString(), { cache: 'no-store' })
        if (resp.ok) {
          const info: any = await resp.json().catch(() => ({}))
          if (!info?.active) {
            const to = new URL('/login', req.url)
            to.searchParams.set('error', 'inactive')
            to.searchParams.set('redirect', pathname + (search || ''))
            return NextResponse.redirect(to, 302)
          }
        }
      }
    } catch {
      // fail-open: se il check fallisce, non blocchiamo
    }
  }

  // 2) Se ho un JWT leggibile, applico SOLO le regole di onboarding
  if (jwt && jwt.split('.').length === 3) {
    const payload = base64UrlToJson<any>(jwt.split('.')[1])
    const meta = payload?.user_metadata || payload?.user_meta_data || {}
    const needs = meta.needs_onboarding === true
    const isOn = meta.is_onboarded === true

    if (needs && !isOn && !pathname.startsWith('/auth/update-password')) {
      const to = new URL('/auth/update-password', req.url)
      to.searchParams.set('next', pathname + (search || ''))
      return NextResponse.redirect(to, 302)
    }

    // sessione ok e/o onboarding completo → passa
    return NextResponse.next()
  }

  // 3) Envelope presente ma JWT non leggibile → non permettere il bypass
  const to = new URL('/login', req.url)
  to.searchParams.set('redirect', pathname + (search || ''))
  return NextResponse.redirect(to, 302)
}
