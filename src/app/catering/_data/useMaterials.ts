// src/app/catering/_data/useMaterials.ts
/**
 * CHANGELOG 2025-09-25
 * - Allineato allo schema reale:
 *   materials: id(uuid), name, category_id(int), unit_cost, unit_cost_vat, vat_rate_percent, uses_vat
 *   categories: id(int), name(text)
 * - Due fetch: categories -> materials, mapping category_id → categories.name
 * - unit_cost sempre LORDO:
 *     unit_cost_vat ?? (uses_vat ? unit_cost*(1 + vat_rate_percent/100) : unit_cost)
 * - ID normalizzato a stringa (uuid)
 * - Nessuna join/niente colonne “fragili”; ordinamento per name
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

export type MaterialItem = {
  id: string
  name: string
  category_name: string | null
  unit_cost: number | null // lordo
}

type Row = Record<string, any>

export default function useMaterials() {
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      // 1) Categories: id, name
      const catsRes = await supabase
        .from('categories')
        .select('id, name')
        .order('id', { ascending: true })

      const catMap: Record<string, string> = {}
      if (!catsRes.error && Array.isArray(catsRes.data)) {
        for (const c of catsRes.data as Row[]) {
          const key = String(c.id ?? '')
          if (key) catMap[key] = String(c.name ?? '')
        }
      } else if (catsRes.error) {
        // Non blocco il flusso: fallback a nessuna categoria risolta
        console.warn('[useMaterials] categories error:', catsRes.error.message)
      }

      // 2) Materials: colonne “sicure”, nessuna join
      const matsRes = await supabase
        .from('materials')
        .select('id, name, category_id, unit_cost, unit_cost_vat, vat_rate_percent, uses_vat')
        .order('name', { ascending: true })

      if (matsRes.error) {
        console.warn('[useMaterials] materials error:', matsRes.error.message)
        if (!cancelled) {
          setError(matsRes.error.message)
          setMaterials([])
          setLoading(false)
        }
        return
      }

      const rows: Row[] = (matsRes.data as Row[] | null) ?? []
      // Map preciso alla shape attesa dalla UI
      const mapped: MaterialItem[] = rows.map((r) => {
        const id = String(r.id ?? '')
        const name = String(r.name ?? '')
        const catId = r.category_id != null ? String(r.category_id) : ''
        const category_name = catId ? (catMap[catId] ?? null) : null

        const net = Number(r.unit_cost ?? 0)
        const vat = Number(r.vat_rate_percent ?? 0)
        const usesVat = Boolean(r.uses_vat)
        let gross: number | null = null

        if (r.unit_cost_vat != null && Number.isFinite(Number(r.unit_cost_vat))) {
          gross = Number(r.unit_cost_vat)
        } else if (Number.isFinite(net)) {
          gross = usesVat ? net * (1 + (Number.isFinite(vat) ? vat : 0) / 100) : net
        } else {
          gross = null
        }

        return {
          id,
          name,
          category_name,
          unit_cost: gross,
        }
      }).filter(m => m.id) // scarta record senza id

      if (!cancelled) {
        setMaterials(mapped)
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return { materials, loading, error }
}
