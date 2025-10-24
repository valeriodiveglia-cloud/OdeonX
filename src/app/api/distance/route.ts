// src/app/api/distance/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'
// Region hint (Vercel): Hong Kong, Singapore, Mumbai, fallback US West
export const preferredRegion = ['hkg1', 'sin1', 'bom1', 'sfo1']

const ORS_KEY = process.env.ORS_API_KEY
const DEFAULT_COUNTRY = 'VN'

// === Cache settings (SWR) ===
const GEO_TTL_MS = 1000 * 60 * 60 * 24 * 30   // 30 giorni
const DIR_TTL_MS = 1000 * 60 * 60 * 24 * 30   // 30 giorni
const REVALIDATE_SECONDS = 60 * 60 * 24       // 24h per la cache di Next fetch()

type Coords = { lon: number; lat: number }
type DirRes = { meters: number; seconds: number }
type Timed<T> = { t: number; value: T }

// In-memory caches (per istanza/edge isolate)
const geoCache = new Map<string, Timed<Coords>>()
const dirCache = new Map<string, Timed<DirRes>>()

// De-dup richieste concorrenti
const geoInflight = new Map<string, Promise<Coords>>()
const dirInflight = new Map<string, Promise<DirRes>>()

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code })
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
function fresh<T>(entry: Timed<T> | undefined, ttl: number) {
  if (!entry) return false
  return (Date.now() - entry.t) < ttl
}
function geoKey(text: string, country: string) {
  return `${country.toUpperCase()}|${norm(text)}`
}
function dirKey(start: Coords, end: Coords, country: string) {
  return `${country.toUpperCase()}|${start.lon.toFixed(6)},${start.lat.toFixed(6)}|${end.lon.toFixed(6)},${end.lat.toFixed(6)}`
}

// === Geocode con cache SWR ===
async function geocodeOne(text: string, country = DEFAULT_COUNTRY): Promise<Coords> {
  const key = geoKey(text, country)
  const cached = geoCache.get(key)
  if (fresh(cached, GEO_TTL_MS)) return cached!.value

  // dedup concorrenti
  const infl = geoInflight.get(key)
  if (infl) return infl

  const p = (async () => {
    const url = new URL('https://api.openrouteservice.org/geocode/search')
    url.searchParams.set('api_key', ORS_KEY || '')
    url.searchParams.set('text', text)
    url.searchParams.set('size', '1')
    if (country) url.searchParams.set('boundary.country', country.toUpperCase())

    // Edge-friendly caching
    const r = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } })
    if (!r.ok) throw new Error(`Geocode failed for "${text}" (${r.status})`)
    const j = await r.json()
    const coords = j?.features?.[0]?.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) throw new Error(`No geocode result for "${text}"`)
    const [lon, lat] = coords
    const value: Coords = { lon: Number(lon), lat: Number(lat) }
    geoCache.set(key, { t: Date.now(), value })
    return value
  })()

  geoInflight.set(key, p)
  try { return await p } finally { geoInflight.delete(key) }
}

// === Directions con cache SWR ===
async function getDirections(start: Coords, end: Coords, country = DEFAULT_COUNTRY): Promise<DirRes> {
  const key = dirKey(start, end, country)
  const cached = dirCache.get(key)
  if (fresh(cached, DIR_TTL_MS)) return cached!.value

  const infl = dirInflight.get(key)
  if (infl) return infl

  const p = (async () => {
    const url = new URL('https://api.openrouteservice.org/v2/directions/driving-car')
    url.searchParams.set('api_key', ORS_KEY || '')
    url.searchParams.set('start', `${start.lon},${start.lat}`)
    url.searchParams.set('end', `${end.lon},${end.lat}`)

    const r = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } })
    if (!r.ok) throw new Error(`Directions failed (${r.status})`)
    const j = await r.json()
    const sum = j?.features?.[0]?.properties?.summary
    if (!sum) throw new Error('Directions summary missing')
    const value: DirRes = { meters: Number(sum.distance), seconds: Number(sum.duration) }
    dirCache.set(key, { t: Date.now(), value })
    return value
  })()

  dirInflight.set(key, p)
  try { return await p } finally { dirInflight.delete(key) }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    expects: 'POST',
    default_country: DEFAULT_COUNTRY,
    has_ORS_API_KEY: Boolean(ORS_KEY),
    cache: {
      geo_ttl_ms: GEO_TTL_MS,
      dir_ttl_ms: DIR_TTL_MS,
      revalidate_s: REVALIDATE_SECONDS,
    },
    runtime: 'edge',
    preferredRegion,
  })
}

export async function POST(req: NextRequest) {
  try {
    if (!ORS_KEY) return bad('ORS_API_KEY missing on server', 500)
    const { from, to, country } = (await req.json()) as { from?: string; to?: string; country?: string }
    if (!from || !to) return bad('Body must be { from, to, country? }')

    const c = (country || DEFAULT_COUNTRY).toUpperCase()

    // Geocode in parallelo (con cache + dedup)
    const [start, end] = await Promise.all([geocodeOne(from, c), geocodeOne(to, c)])
    const { meters, seconds } = await getDirections(start, end, c)

    // Nota: POST non è tipicamente cache-ato da proxy/CDN;
    // forniamo comunque headers utili per layer intermedi.
    const res = NextResponse.json({
      from, to, country: c,
      start, end,
      meters, km: meters / 1000,
      seconds, minutes: seconds / 60,
    })
    res.headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=2592000')
    return res
  } catch (e: any) {
    return bad(e?.message || 'Distance failed', 500)
  }
}
