'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

/** Tipi public */
export type Id = string
export type EqCategory = { id: number; name: string }

export type Equipment = {
  id: Id
  name: string
  category_id: number | null
  category_name: string | null
  cost: number | null
  final_price: number | null
  /** NEW: VAT rate percent from DB (per-item), e.g. 10 = 10% */
  vat_rate_percent: number | null
  notes: string | null
}

type UseEquipmentState = {
  equipment: Equipment[]
  categories: EqCategory[]
  loading: boolean
  error: string | null
  /** Forza un reload dal DB */
  refresh: () => Promise<void>
}

/**
 * Hook di lettura per l’equipment no-magia, cross-tab friendly.
 * Sorgente: Supabase
 *  - rental_equipment: id, name, category_id, cost, final_price, vat_rate_percent, notes
 *  - equipment_categories (fallback a categories): id, name
 */
export function useEquipment(): UseEquipmentState {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [categories, setCategories] = useState<EqCategory[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const alive = useRef(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 1) categorie
      let cats: EqCategory[] = []
      {
        const try1 = await supabase.from('equipment_categories').select('id, name')
        if (!try1.error) {
          cats = (try1.data as any[]).map(r => ({ id: Number(r.id), name: String(r.name) }))
        } else {
          const try2 = await supabase.from('categories').select('id, name')
          if (!try2.error) {
            cats = (try2.data as any[]).map(r => ({ id: Number(r.id), name: String(r.name) }))
          }
        }
        cats.sort((a, b) => a.name.localeCompare(b.name))
      }

      // 2) attrezzature (include per-item VAT rate)
      const { data: eq, error: eqErr } = await supabase
        .from('rental_equipment')
        .select('id, name, category_id, cost, final_price, vat_rate_percent, notes')

      if (eqErr) throw eqErr

      const catMap = new Map<number, string>(cats.map(c => [c.id, c.name]))
      const list: Equipment[] = (eq as any[]).map(r => ({
        id: String(r.id),
        name: String(r.name ?? '').trim(),
        category_id: r.category_id == null ? null : Number(r.category_id),
        category_name:
          r.category_id == null ? null : (catMap.get(Number(r.category_id)) ?? null),
        cost: r.cost == null ? null : Number(r.cost),
        final_price: r.final_price == null ? null : Number(r.final_price),
        vat_rate_percent: r.vat_rate_percent == null ? null : Number(r.vat_rate_percent),
        notes: r.notes == null ? null : String(r.notes),
      }))

      list.sort((a, b) => a.name.localeCompare(b.name))

      if (!alive.current) return
      setCategories(cats)
      setEquipment(list)
      setLoading(false)
    } catch (e: any) {
      if (!alive.current) return
      setError(e?.message || 'Failed to load rental_equipment')
      setEquipment([])
      setCategories([])
      setLoading(false)
    }
  }, [])

  // initial load
  useEffect(() => {
    alive.current = true
    load()
    return () => { alive.current = false }
  }, [load])

  // soft re-sync on focus/visibility (no polling)
  useEffect(() => {
    const onFocus = () => { load() }
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  return useMemo(() => ({
    equipment,
    categories,
    loading,
    error,
    refresh: load,
  }), [equipment, categories, loading, error, load])
}

export default useEquipment
