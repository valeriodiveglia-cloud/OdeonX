// src/app/catering/_data/useEventStaffRows.ts
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

export type StaffRow = {
  id: string
  event_id: string
  name: string
  role: string
  cost_per_hour: number
  hours: number
  notes: string | null
  created_at?: string
  updated_at?: string
}

export type StaffCreateInput = {
  name: string
  role: string
  cost_per_hour: number
  hours: number
  notes?: string | null
}

type HookState = {
  loading: boolean
  error: string | null
  rows: StaffRow[]
  totals: { costTotal: number } // il prezzo si calcola in UI col markup card
  create: (input: StaffCreateInput) => Promise<StaffRow | null>
  update: (id: string, patch: Partial<Pick<StaffRow, 'name' | 'role' | 'cost_per_hour' | 'hours' | 'notes'>>) => Promise<void>
  remove: (id: string) => Promise<void>
  refresh: () => Promise<void> // 👈 aggiunto
}

/* ───────── helpers numerici (no formattazione negli input) ───────── */
function toNum(n: unknown): number {
  const x = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(x) ? x : 0
}
function clampPos(n: number): number { return n < 0 ? 0 : n }

/* ───────── Markup staff (persistito in LS, sync cross-tab) ───────── */
export function useStaffMarkup() {
  const LS_KEY = 'eventcalc.staff.markupMul'

  // default 1; reidratiamo da LS al mount per evitare il "1.00" dovuto all'SSR
  const [markup, setMarkupState] = useState<number>(1)

  // Hydration iniziale dal localStorage (fix SSR)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(LS_KEY)
      const n = Number(raw)
      setMarkupState(Number.isFinite(n) && n > 0 ? n : 1)
    } catch {
      // ignora
    }
  }, [])

  // Persistenza su cambio
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem(LS_KEY, String(markup)) } catch {}
  }, [markup])

  // Re-sync cross-tab e quando la pagina torna visibile/in focus
  useEffect(() => {
    function readLS() {
      try {
        const raw = localStorage.getItem(LS_KEY)
        const n = Number(raw)
        if (Number.isFinite(n) && n > 0) setMarkupState(n)
      } catch {}
    }
    function onStorage(e: StorageEvent) {
      if (e.key === LS_KEY) readLS()
    }
    function onVisible() {
      if (document.visibilityState === 'visible') readLS()
    }
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', readLS)
    return () => {
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', readLS)
    }
  }, [])

  const setMarkup = useCallback((n: number) => {
    const v = clampPos(toNum(n))
    setMarkupState(v > 0 ? v : 1)
  }, [])

  return { markup, setMarkup }
}

/* ───────── CRUD staff su Supabase ─────────
 *  - Ordinamento stabile: created_at ASC, poi id ASC
 *  - Nessuna logica UI qui (solo dati)
 */
export function useStaffRows(eventId?: string | null): HookState {
  const [loading, setLoading] = useState<boolean>(!!eventId)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<StaffRow[]>([])

  const loadFromDB = useCallback(async (evId: string) => {
    const { data, error } = await supabase
      .from('event_staff_rows')
      .select('*')
      .eq('event_id', evId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })

    if (error) throw error

    const list: StaffRow[] = (data || []).map((r: any) => ({
      id: String(r.id),
      event_id: String(r.event_id),
      name: String(r.name ?? ''),
      role: String(r.role ?? ''),
      cost_per_hour: clampPos(toNum(r.cost_per_hour)),
      hours: clampPos(toNum(r.hours)),
      notes: r.notes ?? null,
      created_at: r.created_at ?? undefined,
      updated_at: r.updated_at ?? undefined,
    }))

    return list
  }, [])

  // API pubblica per ricaricare (usata dal Summary, cross-tab ticks, ecc.)
  const refresh = useCallback(async () => {
    if (!eventId) {
      setRows([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await loadFromDB(eventId)
      setRows(list)
    } catch (e: any) {
      setRows([])
      setError(e?.message || 'Failed to load staff rows')
    } finally {
      setLoading(false)
    }
  }, [eventId, loadFromDB])

  // Load iniziale + reload su cambio eventId
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!eventId) {
        if (!alive) return
        setRows([])
        setLoading(false)
        setError(null)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const list = await loadFromDB(eventId)
        if (!alive) return
        setRows(list)
      } catch (e: any) {
        if (!alive) return
        setRows([])
        setError(e?.message || 'Failed to load staff rows')
      } finally {
        if (!alive) return
        setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [eventId, loadFromDB])

  // Totali costo (il prezzo viene dalla card: price = cost * markup)
  const totals = useMemo(() => {
    let costTotal = 0
    for (const r of rows) {
      costTotal += clampPos(toNum(r.cost_per_hour)) * clampPos(toNum(r.hours))
    }
    return { costTotal }
  }, [rows])

  // Create
  const create = useCallback<HookState['create']>(async (input) => {
    if (!eventId) return null
    const payload = {
      event_id: eventId, // text (match con event_headers.id)
      name: String(input.name ?? ''),
      role: String(input.role ?? ''),
      cost_per_hour: clampPos(toNum(input.cost_per_hour)),
      hours: clampPos(toNum(input.hours)),
      notes: input.notes ?? null,
    }
    try {
      const { data, error } = await supabase
        .from('event_staff_rows')
        .insert(payload)
        .select('*')
        .single()
      if (error) throw error

      const row: StaffRow = {
        id: String(data.id),
        event_id: String(data.event_id),
        name: String(data.name ?? ''),
        role: String(data.role ?? ''),
        cost_per_hour: clampPos(toNum(data.cost_per_hour)),
        hours: clampPos(toNum(data.hours)),
        notes: data.notes ?? null,
        created_at: data.created_at ?? undefined,
        updated_at: data.updated_at ?? undefined,
      }

      // optimistic append (mantiene l’ordine naturale di inserimento)
      setRows(prev => [...prev, row])
      return row
    } catch (e: any) {
      setError(e?.message || 'Create failed')
      return null
    }
  }, [eventId])

  // Update
  const update = useCallback<HookState['update']>(async (id, patch) => {
    const payload: any = {}
    if ('name' in patch) payload.name = String(patch.name ?? '')
    if ('role' in patch) payload.role = String(patch.role ?? '')
    if ('cost_per_hour' in patch) payload.cost_per_hour = clampPos(toNum(patch.cost_per_hour))
    if ('hours' in patch) payload.hours = clampPos(toNum(patch.hours))
    if ('notes' in patch) payload.notes = patch.notes ?? null

    // optimistic update
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...payload } as StaffRow : r))
    try {
      const { error } = await supabase.from('event_staff_rows').update(payload).eq('id', id)
      if (error) throw error
    } catch (e: any) {
      console.warn('[useEventStaffRows] update failed:', e?.message || e)
      setError(e?.message || 'Update failed')
    }
  }, [])

  // Delete
  const remove = useCallback<HookState['remove']>(async (id) => {
    // optimistic remove
    setRows(prev => prev.filter(r => r.id !== id))
    try {
      const { error } = await supabase.from('event_staff_rows').delete().eq('id', id)
      if (error) throw error
    } catch (e: any) {
      console.warn('[useEventStaffRows] delete failed:', e?.message || e)
      setError(e?.message || 'Delete failed')
      // opzionale: potresti ricaricare dal DB per riallineare
    }
  }, [])

  return { loading, error, rows, totals, create, update, remove, refresh }
}

export default useStaffRows
