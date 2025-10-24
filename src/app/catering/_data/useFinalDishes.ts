'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

export type Dish = {
  id: string
  name: string
  category_name: string | null
  unit_cost: number | null
  price: number | null
}

/**
 * Prova in sequenza più SELECT compatibili con possibili schemi della view:
 * - Alcune view espongono: category, cost_unit_vnd, price_vnd
 * - Altre: category_name, unit_cost, price
 * - Altre miste (category + unit_cost/price)
 * Appena una SELECT va a buon fine, normalizziamo i campi.
 */
export function useFinalDishes() {
  const [dishes, setDishes] = useState<Dish[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setError(null)

      // Varianti di select: dalla più probabile alle alternative
      const selects = [
        'id,name,category,cost_unit_vnd,price_vnd',
        'id,name,category_name,cost_unit_vnd,price_vnd',
        'id,name,category,unit_cost,price',
        'id,name,category_name,unit_cost,price',
        // fallback minimale se le superiori falliscono
        'id,name,category,category_name,unit_cost,price,cost_unit_vnd,price_vnd',
      ]

      let rows: any[] | null = null
      let lastErr: any = null

      for (const sel of selects) {
        try {
          const { data, error } = await supabase.from('final_list_vw').select(sel)
          if (error) throw error
          rows = (data as any[]) ?? []
          lastErr = null
          break
        } catch (e) {
          lastErr = e
          // prova la prossima variante
        }
      }

      if (!alive) return

      if (!rows) {
        console.error('final_list_vw error:', lastErr?.message || lastErr)
        setDishes([])
        setError(lastErr?.message || 'Fetch error')
        setLoading(false)
        return
      }

      const mapped: Dish[] = rows.map((r: any) => {
        const cat = (r.category_name ?? r.category) ?? null
        const cost = (r.cost_unit_vnd ?? r.unit_cost) ?? null
        const prc  = (r.price_vnd ?? r.price) ?? null
        return {
          id: r.id ?? r.name,
          name: String(r.name ?? '(unnamed)').trim(),
          category_name: cat == null ? null : String(cat).trim(),
          unit_cost: cost == null ? null : Number(cost),
          price: prc == null ? null : Number(prc),
        }
      })

      mapped.sort((a, b) => a.name.localeCompare(b.name))
      setDishes(mapped)
      setLoading(false)
    })()

    return () => { alive = false }
  }, [])

  return { dishes, loading, error }
}

// permetti sia default che named import
export default useFinalDishes
