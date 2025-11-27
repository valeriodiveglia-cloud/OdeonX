// src/app/api/places/route.ts
import { NextRequest, NextResponse } from 'next/server'

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY || ''
const ORS_URL = 'https://api.openrouteservice.org/geocode/autocomplete'

async function searchGoogle(q: string, country: string, size: number) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
  url.searchParams.set('input', q)
  url.searchParams.set('key', GOOGLE_KEY)
  if (country) url.searchParams.set('components', `country:${country}`)
  // url.searchParams.set('types', 'geocode') // optional

  const r = await fetch(url, { next: { revalidate: 0 } })
  if (!r.ok) throw new Error(`Google Places failed (${r.status})`)
  const j = await r.json()
  if (j.status !== 'OK' && j.status !== 'ZERO_RESULTS') throw new Error(`Google Places status: ${j.status}`)

  return (j.predictions || []).slice(0, size).map((p: any) => ({
    id: p.place_id,
    label: p.description
  }))
}

async function searchORS(q: string, country: string, size: number) {
  // Default focus su Ho Chi Minh City
  const focusLat = Number(process.env.PLACES_FOCUS_LAT ?? 10.776889)
  const focusLon = Number(process.env.PLACES_FOCUS_LON ?? 106.700806)

  const url = new URL(ORS_URL)
  url.searchParams.set('api_key', process.env.ORS_API_KEY || '')
  url.searchParams.set('text', q)
  url.searchParams.set('size', String(size))
  url.searchParams.set('boundary.country', country)
  url.searchParams.set('focus.point.lat', String(focusLat))
  url.searchParams.set('focus.point.lon', String(focusLon))
  url.searchParams.set('layers', 'address,street,venue')
  url.searchParams.set('sources', 'openstreetmap,whosonfirst,openaddresses')
  url.searchParams.set('lang', 'en')

  const r = await fetch(url.toString(), { next: { revalidate: 0 } })
  if (!r.ok) {
    const txt = await r.text()
    throw new Error(txt || 'ORS geocoding failed')
  }
  const j = await r.json()

  return Array.isArray(j?.features)
    ? j.features.map((f: any) => {
      const props = f?.properties || {}
      const label =
        props.label ||
        [props.name, props.housenumber, props.street, props.locality, props.region, props.country]
          .filter(Boolean)
          .join(', ')
      return { id: f?.id || `${props.id || props.gid}`, label }
    })
    : []
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const size = Math.min(Number(searchParams.get('size') || 8), 10)
  const country = (searchParams.get('country') || 'VN').toUpperCase()

  if (!q || q.length < 3) {
    return NextResponse.json({ items: [] })
  }

  try {
    // Try Google first
    try {
      const items = await searchGoogle(q, country, size)
      return NextResponse.json({ items })
    } catch (e) {
      console.warn('Google Places failed, falling back to ORS', e)
    }

    // Fallback to ORS
    if (process.env.ORS_API_KEY) {
      const items = await searchORS(q, country, size)
      return NextResponse.json({ items })
    }

    throw new Error('All places providers failed')
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e?.message || 'error' }, { status: 500 })
  }
}
