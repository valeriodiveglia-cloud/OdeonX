// src/app/api/places/route.ts
import { NextRequest, NextResponse } from 'next/server'

const ORS_URL = 'https://api.openrouteservice.org/geocode/autocomplete'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const size = Math.min(Number(searchParams.get('size') || 8), 10)
  const country = (searchParams.get('country') || 'VN').toUpperCase()

  if (!q || q.length < 3) {
    return NextResponse.json({ items: [] })
  }

  // Default focus su Ho Chi Minh City (puoi spostarlo su Hanoi o leggere dalle EventInfo)
  const focusLat = Number(process.env.PLACES_FOCUS_LAT ?? 10.776889)
  const focusLon = Number(process.env.PLACES_FOCUS_LON ?? 106.700806)

  const url = new URL(ORS_URL)
  url.searchParams.set('api_key', process.env.ORS_API_KEY || '')
  url.searchParams.set('text', q)
  url.searchParams.set('size', String(size))
  // Bias paese
  url.searchParams.set('boundary.country', country)
  // Bias geografico (aumenta la pertinenza locale)
  url.searchParams.set('focus.point.lat', String(focusLat))
  url.searchParams.set('focus.point.lon', String(focusLon))
  // Mostra soprattutto indirizzi e luoghi puntuali
  url.searchParams.set('layers', 'address,street,venue')
  // Sorgenti dati
  url.searchParams.set('sources', 'openstreetmap,whosonfirst,openaddresses')
  // Lingua suggerimenti (inglese per l’app; puoi agganciare i18n)
  url.searchParams.set('lang', 'en')

  try {
    const r = await fetch(url.toString(), { next: { revalidate: 0 } })
    if (!r.ok) {
      const txt = await r.text()
      return NextResponse.json({ items: [], error: txt || 'geocoding failed' }, { status: 500 })
    }
    const j = await r.json()

    const items =
      Array.isArray(j?.features)
        ? j.features.map((f: any) => {
            const props = f?.properties || {}
            // Etichetta leggibile
            const label =
              props.label ||
              [props.name, props.housenumber, props.street, props.locality, props.region, props.country]
                .filter(Boolean)
                .join(', ')
            return { id: f?.id || `${props.id || props.gid}`, label }
          })
        : []

    return NextResponse.json({ items })
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e?.message || 'error' }, { status: 500 })
  }
}
