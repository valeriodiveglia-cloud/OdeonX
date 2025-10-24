// src/app/catering/_data/useEventDiscountRows.ts
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

export type Id = string

export type DiscountRow = {
  id: Id
  event_id: string
  label: string | null
  amount: number // positivo: sconto
  calc_mode: boolean | null // false=manual, true=percentage
  created_at?: string | null
  updated_at?: string | null
}

type State = {
  rows: DiscountRow[]
  loading: boolean
  error: string | null
  canQuery: boolean
  totalAmount: number
  refresh: () => Promise<void>
  createRow: (patch?: Partial<DiscountRow>) => Promise<DiscountRow | null>
  updateRow: (opts: { id: Id; patch: Partial<DiscountRow> }) => Promise<boolean>
  deleteRow: (id: Id) => Promise<boolean>
}

function msgOf(e: any): string {
  if (!e) return 'Unknown error'
  if (typeof e === 'string') return e
  if (e.message) return String(e.message)
  try { return JSON.stringify(e) } catch { return String(e) }
}

export function useEventDiscountRows(eventId?: string | null): State {
  const table = 'event_discount_rows'
  const canQuery = !!eventId

  const [rows, setRows] = useState<DiscountRow[]>([])
  const [loading, setLoading] = useState<boolean>(!!canQuery) // spinner solo alla prima hydration
  const [error, setError] = useState<string | null>(null)

  const alive = useRef(true)
  const refreshing = useRef(false)
  const warnBucketRef = useRef<number>(0)

  const refresh = useCallback(async () => {
    if (!canQuery || refreshing.current) {
      if (!canQuery) { setRows([]); setLoading(false); setError(null) }
      return
    }
    refreshing.current = true
    // refresh SILENZIOSO: niente setLoading(true)
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('event_id', eventId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      if (!alive.current) return
      setRows((data || []) as DiscountRow[])
      setError(null)
      setLoading(false)
    } catch (e: any) {
      if (!alive.current) return
      const m = msgOf(e)
      setError(m)
      // Evita overlay rosso di Next per errori rete transitori
      const isFetchFail = m.includes('Failed to fetch')
      if (isFetchFail) {
        const bucket = Date.now() >>> 12 /* ~4096ms */
        if (warnBucketRef.current !== bucket) {
          warnBucketRef.current = bucket
          console.warn('[useEventDiscountRows] refresh warning: Failed to fetch (rete/CORS). Ritento a focus/visibilità.', e)
        }
      } else {
        console.warn('[useEventDiscountRows] refresh warning:', e)
      }
    } finally {
      refreshing.current = false
      if (alive.current) setLoading(false)
    }
  }, [canQuery, eventId])

  // prima hydration + reset quando cambia eventId
  useEffect(() => {
    alive.current = true
    refresh()
    return () => { alive.current = false }
  }, [refresh])

  // re-sync silenzioso su focus/visibilità
  useEffect(() => {
    if (!canQuery) return
    const onFocus = () => { refresh() }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [canQuery, refresh])

  // riallinea dopo salvataggi globali/cambio evento
  useEffect(() => {
    const onSaved = () => refresh()
    const onChanged = () => refresh()
    window.addEventListener('eventcalc:saved', onSaved as EventListener)
    window.addEventListener('event:changed', onChanged as EventListener)
    return () => {
      window.removeEventListener('eventcalc:saved', onSaved as EventListener)
      window.removeEventListener('event:changed', onChanged as EventListener)
    }
  }, [refresh])

  const createRow = useCallback(async (patch?: Partial<DiscountRow>) => {
    if (!canQuery) return null
    try {
      const payload: Partial<DiscountRow> = {
        event_id: eventId!,
        label: patch?.label ?? '',
        amount: Number(patch?.amount ?? 0) || 0,
        calc_mode: !!patch?.calc_mode,
      }
      const { data, error } = await supabase.from(table).insert(payload).select().maybeSingle()
      if (error) throw error
      const row = data as DiscountRow
      setRows(prev => [...prev, row])
      return row
    } catch (e: any) {
      const m = msgOf(e)
      console.warn('[useEventDiscountRows] create warning:', m, e)
      setError(m)
      return null
    }
  }, [canQuery, eventId])

  const updateRow = useCallback(async ({ id, patch }: { id: Id; patch: Partial<DiscountRow> }) => {
    try {
      const { error, data } = await supabase.from(table).update(patch).eq('id', id).select().maybeSingle()
      if (error) throw error
      const updated = data as DiscountRow
      setRows(prev => prev.map(r => (r.id === id ? updated : r)))
      return true
    } catch (e: any) {
      const m = msgOf(e)
      console.warn('[useEventDiscountRows] update warning:', m, e)
      setError(m)
      return false
    }
  }, [])

  const deleteRow = useCallback(async (id: Id) => {
    try {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
      setRows(prev => prev.filter(r => r.id !== id))
      return true
    } catch (e: any) {
      const m = msgOf(e)
      console.warn('[useEventDiscountRows] delete warning:', m, e)
      setError(m)
      return false
    }
  }, [])

  const totalAmount = useMemo(() => {
    return rows.reduce((acc, r) => acc + (Number(r.amount || 0) || 0), 0)
  }, [rows])

  return { rows, loading, error, canQuery, totalAmount, refresh, createRow, updateRow, deleteRow }
}

export default useEventDiscountRows
