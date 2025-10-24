// src/app/catering/_data/useEventTransportRows.ts
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

export type Id = string

/** Righe normalizzate che l'hook espone SEMPRE alla UI */
export type EventTransportRowDB = {
  id: Id
  event_id: string
  from_text: string | null
  to_text: string | null
  vehicle_key: string | null
  round_trip: boolean | null
  distance_km: number | null
  eta_minutes: number | null
  cost_per_km: number | null
  markup_x: number | null
  notes: string | null
  created_at?: string | null
  updated_at?: string | null
}

type State = {
  rows: EventTransportRowDB[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  createRow: (patch?: Partial<EventTransportRowDB>) => Promise<EventTransportRowDB | null>
  updateRow: (id: Id, patch: Partial<EventTransportRowDB>) => Promise<boolean>
  deleteRow: (id: Id) => Promise<boolean>
}

/* ──────────────────────────────────────────────────────────────────────────────
   Schema probing (nomi colonne varianti) + adattamento tipi INTEGER on-the-fly
   ────────────────────────────────────────────────────────────────────────────── */

type ColMap = {
  fromCol: string
  toCol: string
  roundTripCol: string
}
const CANDIDATES: ColMap[] = [
  { fromCol: 'from_text',    toCol: 'to_text',    roundTripCol: 'round_trip' },
  { fromCol: 'from_address', toCol: 'to_address', roundTripCol: 'roundtrip'  },
  { fromCol: 'from',         toCol: 'to',         roundTripCol: 'round_trip' },
  { fromCol: 'from_label',   toCol: 'to_label',   roundTripCol: 'round_trip' },
]

const FIXED_COLS = [
  'id',
  'event_id',
  'vehicle_key',
  'distance_km',
  'eta_minutes',
  'cost_per_km',
  'markup_x',
  'notes',
  'created_at',
  'updated_at',
] as const

function msgOf(e: any): string {
  if (!e) return 'Unknown error'
  if (typeof e === 'string') return e
  if (e.message) return String(e.message)
  try { return JSON.stringify(e) } catch { return String(e) }
}
function isAbortLike(e: any): boolean {
  const s = msgOf(e)
  return (
    (e && (e.name === 'AbortError' || e.code === 'ABORT_ERR')) ||
    /aborted|AbortError|The user aborted a request|Failed to fetch/i.test(s)
  )
}

export function useEventTransportRows(eventId: string | null): State {
  const [rows, setRows] = useState<EventTransportRowDB[]>([])
  const [loading, setLoading] = useState<boolean>(!!eventId)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)
  const table = 'event_transport_rows'
  const canQuery = !!eventId

  // mappa nomi colonne rilevata
  const schemaRef = useRef<ColMap | null>(null)
  // flag: il DB richiede distance_km intero (dedotto dal primo errore)
  const distanceIntRef = useRef<boolean>(false)
  // sappiamo già che eta_minutes è spesso INTEGER: normalizziamo sempre a int
  const etaIsInt = true

  // AbortController per cancellare richieste in corso su unmount/navigazione
  const abortRef = useRef<AbortController | null>(null)
  function resetAbort() {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    return abortRef.current
  }

  /** Prova le varianti di SELECT finché una non riesce; salva la mappa trovata */
  const probeAndSelect = useCallback(async (signal?: AbortSignal) => {
    if (!eventId) throw new Error('Missing event id')

    const run = async (cols: string[]) => {
      let q = supabase
        .from(table)
        .select(cols.join(', '))
        .eq('event_id', eventId)
        .order('created_at', { ascending: true }) as any
      if (signal && typeof q.abortSignal === 'function') q = q.abortSignal(signal)
      const { data, error } = await q
      return { data, error }
    }

    if (schemaRef.current) {
      const m = schemaRef.current
      const cols = [...FIXED_COLS, m.fromCol, m.toCol, m.roundTripCol]
      const { data, error } = await run(cols)
      if (error) throw error
      return { data, map: m }
    }

    for (const cand of CANDIDATES) {
      const cols = [...FIXED_COLS, cand.fromCol, cand.toCol, cand.roundTripCol]
      const { data, error } = await run(cols)
      if (!error) {
        schemaRef.current = cand
        return { data, map: cand }
      }
      const m = msgOf(error)
      // se non è un errore "colonna inesistente", propaga (rete/rls/etc.)
      if (!/does not exist/i.test(m)) throw error
    }
    throw new Error('Unable to detect transport columns (from/to/round_trip).')
  }, [eventId])

  // 👉 Tipi derivati da probeAndSelect (per tipare il .map senza any implicito)
  type ProbeResult = Awaited<ReturnType<typeof probeAndSelect>>
  type RawRow = NonNullable<ProbeResult['data']>[number]

  /** Normalizza una riga grezza usando la mappa */
  function normalizeRow(raw: any, map: ColMap): EventTransportRowDB {
    return {
      id: raw.id,
      event_id: raw.event_id,
      from_text: (raw as any)[map.fromCol] ?? null,
      to_text: (raw as any)[map.toCol] ?? null,
      vehicle_key: raw.vehicle_key ?? null,
      round_trip: (raw as any)[map.roundTripCol] ?? null,
      distance_km: raw.distance_km ?? null,
      eta_minutes: raw.eta_minutes ?? null,
      cost_per_km: raw.cost_per_km ?? null,
      markup_x: raw.markup_x ?? null,
      notes: raw.notes ?? null,
      created_at: raw.created_at ?? null,
      updated_at: raw.updated_at ?? null,
    }
  }

  const refresh = useCallback(async () => {
    if (!canQuery) {
      setRows([])
      setLoading(false)
      // non segnare errore quando manca l'eventId
      return
    }
    setLoading(true); setError(null)
    const ctrl = resetAbort()
    try {
      const { data, map } = await probeAndSelect(ctrl.signal)
      if (!alive.current) return
      const norm = (data ?? []).map((r: RawRow) => normalizeRow(r, map))
      setRows(norm)
      setLoading(false)
    } catch (e: any) {
      if (!alive.current || isAbortLike(e)) {
        // silenzia errori di abort/navigazione
        setLoading(false)
        return
      }
      const m = msgOf(e)
      console.error('[useEventTransportRows] refresh error:', m, e)
      setRows([]); setLoading(false); setError(m)
    }
  }, [canQuery, probeAndSelect])

  useEffect(() => {
    alive.current = true
    refresh()
    return () => {
      alive.current = false
      if (abortRef.current) abortRef.current.abort()
    }
  }, [refresh])

  useEffect(() => {
    const onFocus = () => { if (canQuery) refresh() }
    const onVisible = () => { if (document.visibilityState === 'visible' && canQuery) refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh, canQuery])

  /** Helpers: mappa patch normalizzata -> patch DB reale in base alla mappa */
  function toDbPatch(patch: Partial<EventTransportRowDB>): Record<string, any> {
    const map = schemaRef.current
    const out: Record<string, any> = {}

    // Fissi (con coerce numerica robusta)
    if ('vehicle_key' in patch) out.vehicle_key = patch.vehicle_key ?? null
    if ('distance_km' in patch) {
      let v = patch.distance_km
      if (typeof v === 'string') v = Number(v)
      if (typeof v === 'number' && Number.isFinite(v)) {
        out.distance_km = distanceIntRef.current ? Math.round(v) : v
      } else {
        out.distance_km = v ?? null
      }
    }
    if ('eta_minutes' in patch) {
      let m = patch.eta_minutes
      if (typeof m === 'string') m = Number(m)
      if (typeof m === 'number' && Number.isFinite(m)) {
        out.eta_minutes = etaIsInt ? Math.round(m) : m
      } else {
        out.eta_minutes = m ?? null
      }
    }
    if ('cost_per_km' in patch) {
      let c = patch.cost_per_km
      if (typeof c === 'string') c = Number(c)
      out.cost_per_km = (typeof c === 'number' && Number.isFinite(c)) ? c : (c ?? null)
    }
    if ('markup_x' in patch) {
      let x = patch.markup_x
      if (typeof x === 'string') x = Number(x)
      out.markup_x = (typeof x === 'number' && Number.isFinite(x)) ? x : (x ?? null)
    }
    if ('notes' in patch) out.notes = patch.notes ?? null

    if (map) {
      if ('from_text' in patch) out[map.fromCol] = patch.from_text ?? null
      if ('to_text' in patch) out[map.toCol] = patch.to_text ?? null
      if ('round_trip' in patch) out[map.roundTripCol] = patch.round_trip ?? null
    }
    return out
  }

  /** Retry intelligente: se Postgres urla che un campo è INTEGER, adattiamo e riproviamo 1 volta */
  async function updateWithRetry(id: Id, payload: Record<string, any>): Promise<void> {
    const { error } = await supabase.from(table).update(payload).eq('id', id)
    if (!error) return
    const m = msgOf(error)

    // Heuristica: se si lamenta di integer su distance_km, arrotonda e riprova una sola volta
    if (/invalid input syntax for type integer/i.test(m) && 'distance_km' in payload) {
      if (typeof payload.distance_km === 'number') {
        payload.distance_km = Math.round(payload.distance_km)
        distanceIntRef.current = true
        const { error: e2 } = await supabase.from(table).update(payload).eq('id', id)
        if (!e2) return
        throw e2
      }
    }
    // Idem per eta_minutes (comunque noi già arrotondiamo in toDbPatch)
    if (/invalid input syntax for type integer/i.test(m) && 'eta_minutes' in payload) {
      if (typeof payload.eta_minutes === 'number') {
        payload.eta_minutes = Math.round(payload.eta_minutes)
        const { error: e2 } = await supabase.from(table).update(payload).eq('id', id)
        if (!e2) return
        throw e2
      }
    }
    throw error
  }

  const createRow = useCallback(async (patch?: Partial<EventTransportRowDB>) => {
    if (!canQuery) { setError('Missing event id'); return null }
    try {
      if (!schemaRef.current) await probeAndSelect()

      // base (eta -> int; distance -> numerico, adatteremo se serve)
      const base: Partial<EventTransportRowDB> = {
        event_id: eventId!,
        from_text: patch?.from_text ?? null,
        to_text: patch?.to_text ?? null,
        vehicle_key: patch?.vehicle_key ?? null,
        round_trip: typeof patch?.round_trip === 'boolean' ? patch?.round_trip : true,
        distance_km: typeof patch?.distance_km === 'number' ? patch!.distance_km : (patch?.distance_km ?? null),
        eta_minutes: typeof patch?.eta_minutes === 'number' ? Math.round(patch!.eta_minutes) : (patch?.eta_minutes ?? null),
        cost_per_km: patch?.cost_per_km ?? null,
        markup_x: patch?.markup_x ?? 1.0,
        notes: patch?.notes ?? null,
      }
      const insertPayload = { event_id: eventId!, ...toDbPatch(base) }

      // Primo tentativo insert
      let { data, error } = await supabase.from(table).insert(insertPayload).select().maybeSingle()
      if (error) {
        const m = msgOf(error)
        // fallback se distance deve essere intero
        if (/invalid input syntax for type integer/i.test(m) && 'distance_km' in insertPayload) {
          if (typeof insertPayload.distance_km === 'number') {
            insertPayload.distance_km = Math.round(insertPayload.distance_km)
            distanceIntRef.current = true
            const r2 = await supabase.from(table).insert(insertPayload).select().maybeSingle()
            data = r2.data; error = r2.error
          }
        }
      }
      if (error) throw error

      const map = schemaRef.current!
      const norm = normalizeRow(data, map)
      setRows(prev => [...prev, norm])
      return norm
    } catch (e: any) {
      if (isAbortLike(e)) return null
      const m = msgOf(e)
      console.error('[useEventTransportRows] insert error:', m, e)
      setError(m)
      return null
    }
  }, [canQuery, eventId, probeAndSelect])

  const updateRow = useCallback(async (id: Id, patch: Partial<EventTransportRowDB>) => {
    try {
      if (!schemaRef.current) await probeAndSelect()
      const payload = toDbPatch(patch)
      if (Object.keys(payload).length === 0) return true

      await updateWithRetry(id, payload)

      setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } as EventTransportRowDB : r)))
      return true
    } catch (e: any) {
      if (isAbortLike(e)) return false
      const m = msgOf(e)
      console.error('[useEventTransportRows] update error:', m, e)
      setError(m)
      return false
    }
  }, [probeAndSelect])

  const deleteRow = useCallback(async (id: Id) => {
    try {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
      setRows(prev => prev.filter(r => r.id !== id))
      return true
    } catch (e: any) {
      if (isAbortLike(e)) return false
      const m = msgOf(e)
      console.error('[useEventTransportRows] delete error:', m, e)
      setError(m)
      return false
    }
  }, [])

  return useMemo(() => ({
    rows, loading, error, refresh, createRow, updateRow, deleteRow,
  }), [rows, loading, error, refresh, createRow, updateRow, deleteRow])
}

export default useEventTransportRows