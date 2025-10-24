// src/app/event-calculator/_data/useEventBundles.ts
'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase_shim'

type BundleRowDB = {
  id: string
  bundle_id: string
  dish_id: string
  qty: number
  modifiers: string[]
  created_at?: string | null
}

type EventBundleDB = {
  id: string
  event_id: string
  type_key: string
  label: string
  created_at?: string | null
  rows?: BundleRowDB[]
}

type BundleRowInput = {
  dish_id: string
  qty?: number
  modifiers?: string[]
}

type BundleRowPatch = Partial<Pick<BundleRowDB, 'dish_id' | 'qty' | 'modifiers'>>

/** Sort stabile per le righe: created_at ASC, poi id ASC */
function sortRowsStable(rows?: BundleRowDB[]): BundleRowDB[] {
  const list = Array.isArray(rows) ? rows.slice() : []
  list.sort((a, b) => {
    const ca = a.created_at ? Date.parse(a.created_at) : 0
    const cb = b.created_at ? Date.parse(b.created_at) : 0
    if (ca !== cb) return ca - cb
    // fallback stabile su id
    if (a.id !== b.id) return String(a.id).localeCompare(String(b.id))
    return 0
  })
  return list
}

export function useEventBundles(eventId: string | null) {
  const [bundles, setBundles] = useState<EventBundleDB[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<any>(null)

  const fetchAll = useCallback(async (evId: string) => {
    const { data, error: err } = await supabase
      .from('event_bundles')
      .select(
        `
        id,
        event_id,
        type_key,
        label,
        created_at,
        rows:event_bundle_rows(
          id,
          bundle_id,
          dish_id,
          qty,
          modifiers,
          created_at
        )
      `
      )
      .eq('event_id', evId)
      // ordinamento bundle
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      // ordinamento RIGHE NIDIFICATE (PostgREST)
      .order('created_at', { ascending: true, foreignTable: 'event_bundle_rows' })
      .order('id', { ascending: true, foreignTable: 'event_bundle_rows' })

    if (err) throw err

    // Fallback JS per garantire ordine deterministico delle righe
    const normalized: EventBundleDB[] = (data ?? []).map((b: any) => ({
      id: String(b.id),
      event_id: String(b.event_id),
      type_key: String(b.type_key),
      label: String(b.label ?? ''),
      created_at: b.created_at ?? null,
      rows: sortRowsStable(
        (Array.isArray(b.rows) ? b.rows : []).map((r: any) => ({
          id: String(r.id),
          bundle_id: String(r.bundle_id),
          dish_id: String(r.dish_id ?? ''),
          qty: Number.isFinite(Number(r.qty)) ? Number(r.qty) : 0,
          modifiers: Array.isArray(r.modifiers) ? r.modifiers : [],
          created_at: r.created_at ?? null,
        }))
      ),
    }))

    return normalized
  }, [])

  const refetch = useCallback(async () => {
    if (!eventId) return
    setLoading(true)
    setError(null)
    try {
      const list = await fetchAll(eventId)
      setBundles(list)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [eventId, fetchAll])

  useEffect(() => {
    if (!eventId) return
    let ignore = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const list = await fetchAll(eventId)
        if (!ignore) setBundles(list)
      } catch (e) {
        if (!ignore) setError(e)
      } finally {
        if (!ignore) setLoading(false)
      }
    })()
    return () => { ignore = true }
  }, [eventId, fetchAll])

  // ========== CRUD ==========

  async function createBundle(evId: string, type_key: string, label: string) {
    try {
      setLoading(true)
      setError(null)
      const { data, error: err } = await supabase
        .from('event_bundles')
        .insert([{ event_id: evId, type_key, label }])
        .select(
          `
          id,
          event_id,
          type_key,
          label,
          created_at,
          rows:event_bundle_rows(
            id,
            bundle_id,
            dish_id,
            qty,
            modifiers,
            created_at
          )
        `
        )
        .single()
      if (err) throw err
      await refetch()
      return data as EventBundleDB
    } catch (e) {
      setError(e)
      throw e
    } finally {
      setLoading(false)
    }
  }

  async function deleteBundle(bundleId: string) {
    try {
      setLoading(true)
      setError(null)
      // cleanup righe (se non c'è cascade)
      const { error: rowsErr } = await supabase
        .from('event_bundle_rows')
        .delete()
        .eq('bundle_id', bundleId)
      if (rowsErr && rowsErr.code !== 'PGRST116') throw rowsErr

      const { error: bErr } = await supabase
        .from('event_bundles')
        .delete()
        .eq('id', bundleId)
      if (bErr) throw bErr

      await refetch()
      return true
    } catch (e) {
      setError(e)
      throw e
    } finally {
      setLoading(false)
    }
  }

  async function addRow(bundleId: string, row: BundleRowInput) {
    try {
      setLoading(true)
      setError(null)
      const payload = {
        bundle_id: bundleId,
        dish_id: row.dish_id,
        qty: row.qty ?? 1,
        modifiers: row.modifiers ?? [],
      }
      const { data, error: err } = await supabase
        .from('event_bundle_rows')
        .insert([payload])
        .select(`id,bundle_id,dish_id,qty,modifiers,created_at`)
        .single()
      if (err) throw err
      await refetch()
      return data as BundleRowDB
    } catch (e) {
      setError(e)
      throw e
    } finally {
      setLoading(false)
    }
  }

  async function updateRow(rowId: string, patch: BundleRowPatch) {
    try {
      setLoading(true)
      setError(null)
      const { data, error: err } = await supabase
        .from('event_bundle_rows')
        .update(patch)
        .eq('id', rowId)
        .select(`id,bundle_id,dish_id,qty,modifiers,created_at`)
        .single()
      if (err) throw err
      await refetch()
      return data as BundleRowDB
    } catch (e) {
      setError(e)
      throw e
    } finally {
      setLoading(false)
    }
  }

  async function deleteRow(rowId: string) {
    try {
      setLoading(true)
      setError(null)
      const { error: err } = await supabase
        .from('event_bundle_rows')
        .delete()
        .eq('id', rowId)
      if (err) throw err
      await refetch()
      return true
    } catch (e) {
      setError(e)
      throw e
    } finally {
      setLoading(false)
    }
  }

  return {
    bundles,
    setBundles,
    loading,
    error,
    refetch,
    createBundle,
    deleteBundle,
    addRow,
    updateRow,
    deleteRow,
  }
}
