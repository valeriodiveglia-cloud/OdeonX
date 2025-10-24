// src/app/catering/_data/useEventCompanyAssetRows.ts
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

export type Id = string

export type EventCompanyAssetRow = {
  id: Id
  event_id: string
  asset_name: string
  asset_id: string | null
  qty: number
  include_price: boolean
  unit_price_vnd: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

type InsertPayload = {
  asset_name?: string
  asset_id?: string | null
  qty?: number
  include_price?: boolean
  unit_price_vnd?: number | null
  notes?: string | null
}

type UpdatePayload = Partial<Omit<EventCompanyAssetRow, 'id' | 'event_id' | 'created_at' | 'updated_at'>> & {
  include_price?: boolean
  unit_price_vnd?: number | null
  qty?: number
  asset_name?: string
  asset_id?: string | null
  notes?: string | null
}

/**
 * Normalizza i campi prima di inviarli al DB in modo coerente con il vincolo:
 * - include_price = false -> unit_price_vnd deve essere null
 * - include_price = true  -> unit_price_vnd >= 0 (se assente, forziamo 0)
 * - qty >= 0 (clamp minimo 0)
 */
function sanitizeForDB<T extends { include_price?: boolean; unit_price_vnd?: number | null; qty?: number }>(
  data: T
): T {
  const out: any = { ...data }

  if (typeof out.qty === 'number') {
    out.qty = isFinite(out.qty) ? Math.max(0, out.qty) : 0
  }

  if (typeof out.include_price === 'boolean') {
    if (out.include_price === false) {
      out.unit_price_vnd = null
    } else {
      // include_price = true
      if (out.unit_price_vnd == null || !isFinite(out.unit_price_vnd)) {
        out.unit_price_vnd = 0
      } else {
        out.unit_price_vnd = Math.max(0, out.unit_price_vnd)
      }
    }
  }

  return out
}

export function useEventCompanyAssetRows(eventId: string | null) {
  const [rows, setRows] = useState<EventCompanyAssetRow[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const fetchRows = useCallback(async () => {
    if (!eventId) {
      setRows([])
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('event_company_asset_rows')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })

    if (!mountedRef.current) return
    if (error) {
      setError(error.message || 'Failed to load asset rows')
      setRows([])
    } else {
      // Anti flicker: sostituisco la collezione senza toccare eventuali stati locali della UI
      setRows((data as EventCompanyAssetRow[]) ?? [])
    }
    setLoading(false)
  }, [eventId])

  // Hydration iniziale
  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const refresh = useCallback(async () => {
    await fetchRows()
  }, [fetchRows])

  const addRow = useCallback(
    async (payload: InsertPayload = {}) => {
      if (!eventId) return null

      const defaults: InsertPayload = {
        asset_name: '',
        asset_id: null,
        qty: 1,
        include_price: false,
        unit_price_vnd: null,
        notes: null,
      }

      const body = sanitizeForDB({ ...defaults, ...payload })

      const { data, error } = await supabase
        .from('event_company_asset_rows')
        .insert([{ event_id: eventId, ...body }])
        .select('*')
        .single()

      if (error) {
        setError(error.message || 'Failed to add asset row')
        return null
      }

      const row = data as EventCompanyAssetRow
      setRows(prev => [...prev, row])
      return row
    },
    [eventId]
  )

  const updateRow = useCallback(
    async (id: Id, patch: UpdatePayload) => {
      if (!eventId) return null
      const body = sanitizeForDB(patch)

      const { data, error } = await supabase
        .from('event_company_asset_rows')
        .update(body)
        .eq('id', id)
        .eq('event_id', eventId)
        .select('*')
        .single()

      if (error) {
        setError(error.message || 'Failed to update asset row')
        return null
      }

      const updated = data as EventCompanyAssetRow
      setRows(prev => prev.map(r => (r.id === id ? updated : r)))
      return updated
    },
    [eventId]
  )

  const deleteRow = useCallback(
    async (id: Id) => {
      if (!eventId) return false

      const { error } = await supabase
        .from('event_company_asset_rows')
        .delete()
        .eq('id', id)
        .eq('event_id', eventId)

      if (error) {
        setError(error.message || 'Failed to delete asset row')
        return false
      }
      setRows(prev => prev.filter(r => r.id !== id))
      return true
    },
    [eventId]
  )

  // Ordinamento stabile in memoria (created_at asc). In caso di insert fuori ordine, riordiniamo.
  const orderedRows = useMemo(() => {
    return [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))
  }, [rows])

  return {
    rows: orderedRows,
    loading,
    error,
    refresh,
    addRow,
    updateRow,
    deleteRow,
  }
}
