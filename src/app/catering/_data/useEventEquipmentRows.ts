// src/app/catering/_data/useEventEquipmentRows.ts
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

export type Id = string

export type EventEquipmentRow = {
  id: Id
  event_id: Id
  equipment_id: Id | null
  qty: number
  notes: string | null
  unit_cost_override: number | null
  vat_override_percent: number | null
  markup_x_override: number | null
  created_at?: string
  updated_at?: string
}

type State = {
  rows: EventEquipmentRow[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  createRow: (init?: Partial<EventEquipmentRow>) => Promise<EventEquipmentRow | null>
  updateRow: (id: Id, patch: Partial<EventEquipmentRow>) => Promise<boolean>
  deleteRow: (id: Id) => Promise<boolean>
}

/**
 * CRUD per event_equipment_rows. No-magia, cross-tab friendly.
 * Re-sync su focus/visibility; niente polling, niente debounce nascosti.
 */
export function useEventEquipmentRows(eventId: Id | null | undefined): State {
  const [rows, setRows] = useState<EventEquipmentRow[]>([])
  const [loading, setLoading] = useState<boolean>(!!eventId)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)

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
      const { data, error } = await supabase
        .from('event_equipment_rows')
        .select('id, event_id, equipment_id, qty, notes, unit_cost_override, vat_override_percent, markup_x_override, created_at, updated_at')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true })

      if (error) throw error
      if (!alive.current) return
      setRows((data ?? []) as EventEquipmentRow[])
      setLoading(false)
    } catch (e: any) {
      if (!alive.current) return
      setError(e?.message || 'Failed to load event_equipment_rows')
      setRows([])
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    alive.current = true
    refresh()
    return () => { alive.current = false }
  }, [refresh])

  useEffect(() => {
    const onFocus = () => { refresh() }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const createRow = useCallback(async (init?: Partial<EventEquipmentRow>) => {
    if (!eventId) return null
    try {
      const proposed = {
        event_id: eventId,
        equipment_id: init?.equipment_id ?? null,
        qty: Number(init?.qty ?? 1),
        notes: init?.notes ?? null,
        unit_cost_override: init?.unit_cost_override ?? null,
        vat_override_percent: init?.vat_override_percent ?? null,
        markup_x_override: init?.markup_x_override ?? null,
      }
      const { data, error } = await supabase
        .from('event_equipment_rows')
        .insert(proposed)
        .select()
        .maybeSingle()
      if (error) throw error
      const row = data as EventEquipmentRow
      setRows(prev => [...prev, row])
      return row
    } catch (e: any) {
      console.error('[useEventEquipmentRows] insert error:', e)
      setError(e?.message || 'Insert failed')
      return null
    }
  }, [eventId])

  const updateRow = useCallback(async (id: Id, patch: Partial<EventEquipmentRow>) => {
    try {
      const { error } = await supabase
        .from('event_equipment_rows')
        .update(patch)
        .eq('id', id)
      if (error) throw error
      setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } as EventEquipmentRow : r)))
      return true
    } catch (e: any) {
      console.error('[useEventEquipmentRows] update error:', e)
      setError(e?.message || 'Update failed')
      return false
    }
  }, [])

  const deleteRow = useCallback(async (id: Id) => {
    try {
      const { error } = await supabase
        .from('event_equipment_rows')
        .delete()
        .eq('id', id)
      if (error) throw error
      setRows(prev => prev.filter(r => r.id !== id))
      return true
    } catch (e: any) {
      console.error('[useEventEquipmentRows] delete error:', e)
      setError(e?.message || 'Delete failed')
      return false
    }
  }, [])

  return useMemo(() => ({
    rows, loading, error, refresh, createRow, updateRow, deleteRow,
  }), [rows, loading, error, refresh, createRow, updateRow, deleteRow])
}

export default useEventEquipmentRows
