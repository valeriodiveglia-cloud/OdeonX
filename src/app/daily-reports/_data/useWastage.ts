// src/app/daily-reports/_data/useWastage.ts
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { useRealtimeChannel } from './useRealtimeChannel'

/* ---------- Types ---------- */
export type WType = 'Dish' | 'Material' | 'Prep'

export type WastageRow = {
  id: string
  date: string
  time: string
  type: WType
  categoryId?: string | null
  categoryName?: string | null
  itemId?: string | null
  itemName: string
  unit?: string | null
  qty: number
  unitCost: number
  totalCost: number
  chargeTo: 'Restaurant' | 'Staff'
  reason?: string | null
  responsible?: string | null
  enteredBy?: string | null
  branchName?: string | null
}

export type Category = { id: string; name: string }

export type Material = {
  id: string
  name: string
  category_id: string | null
  unit: string | null          // UOM label (es. "gr", "ml", "unit")
  package_size: number | null
  package_price: number | null
  unit_cost?: number | null    // gross unit cost, allineato a Recipes
}

export type Dish = {
  id: string
  name: string
  category: string | null
  cost_unit_vnd: number | null
}

export type Prep = {
  id: string
  name: string
  category: string | null
  cost_unit_vnd: number | null
  unit?: string | null
}

/* ---------- Const ---------- */
const TBL_WASTAGE = 'wastage_entries'

/* ---------- Small utils ---------- */
function toISODate(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function toNum(v: any): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/* ---------- Master data loaders ---------- */
async function fetchCategories(): Promise<Category[]> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('id,name')
      .order('name', { ascending: true })

    if (error && (error as any).message) {
      console.error('fetchCategories error', error)
    }
    if (!data) return []

    return data.map(r => ({ id: String(r.id), name: String(r.name) }))
  } catch (e) {
    console.error('fetchCategories fatal', e)
    return []
  }
}

async function fetchMaterials(): Promise<Material[]> {
  try {
    // UOM map:
    // - byId: id -> name
    // - byName: lower(name) -> name (fallback se materials.uom_id contiene direttamente "gr"/"ml"/"unit")
    const { data: uomData, error: uomErr } = await supabase
      .from('uom')
      .select('id,name')

    if (uomErr && (uomErr as any).message) {
      console.error('fetchMaterials uom error', uomErr)
    }

    const uomById = new Map<string, string>()
    const uomByName = new Map<string, string>()

    for (const u of (uomData || [])) {
      const idStr = String(u.id)
      const nameStr = String(u.name || '')
      uomById.set(idStr, nameStr)
      if (nameStr) {
        uomByName.set(nameStr.toLowerCase(), nameStr)
      }
    }

    // Materiali con colonne nuove e vecchie, per compatibilità
    const { data, error } = await supabase
      .from('materials')
      .select('id,name,category_id,packaging_size,package_price,unit_cost,unit_cost_vat,vat_rate_percent,uom_id')
      .limit(2000)

    if (error && (error as any).message) {
      console.error('fetchMaterials error', error)
    }
    if (!data) return []

    return data.map(r => {
      const net = toNum((r as any).unit_cost)
      const vatPct = toNum((r as any).vat_rate_percent) ?? 0
      const grossFromNet =
        net != null ? Math.round(net * (1 + vatPct / 100)) : null
      const grossFromCol = toNum((r as any).unit_cost_vat)
      const unitCost = grossFromNet ?? grossFromCol ?? net ?? null

      const rawUom = (r as any).uom_id
      let unitLabel: string | null = null
      if (rawUom != null) {
        const rawStr = String(rawUom)
        unitLabel =
          uomById.get(rawStr) ||
          uomByName.get(rawStr.toLowerCase()) ||
          rawStr ||
          null
      }

      return {
        id: String(r.id),
        name: String(r.name),
        category_id: r.category_id != null ? String(r.category_id) : null,
        unit: unitLabel,
        package_size: r.packaging_size != null ? Number(r.packaging_size) : null,
        package_price: r.package_price != null ? Number(r.package_price) : null,
        unit_cost: unitCost,
      }
    })
  } catch (e) {
    console.error('fetchMaterials fatal', e)
    return []
  }
}

async function fetchDishes(): Promise<Dish[]> {
  try {
    const { data, error } = await supabase
      .from('final_list_vw')
      .select('id,name,category,cost_unit_vnd')
      .limit(2000)

    if (error && (error as any).message) {
      console.error('fetchDishes error', error)
    }
    if (!data) return []

    return data.map(r => ({
      id: String(r.id ?? String(r.name)),
      name: String(r.name),
      category: r.category ? String(r.category) : null,
      cost_unit_vnd: r.cost_unit_vnd != null ? Number(r.cost_unit_vnd) : null,
    }))
  } catch (e) {
    console.error('fetchDishes fatal', e)
    return []
  }
}

async function fetchPreps(): Promise<Prep[]> {
  try {
    const { data, error } = await supabase
      .from('prep_recipes')
      .select('id,name,category_id,cost_per_unit_vnd,uom_id')
      .limit(2000)

    if (error && (error as any).message) {
      console.error('fetchPreps error', error)
    }
    if (!data) return []

    const { data: cats } = await supabase
      .from('recipe_categories')
      .select('id,name')

    const catById = new Map<string, string>(
      (cats || []).map(c => [String(c.id), String(c.name)])
    )

    // UOM per le preps:
    // supporta sia FK numerica, sia stringhe tipo "gr"/"ml"/"unit"
    const { data: uom, error: uomErr } = await supabase
      .from('uom')
      .select('id,name')

    if (uomErr && (uomErr as any).message) {
      console.error('fetchPreps uom error', uomErr)
    }

    const uomById = new Map<string, string>()
    const uomByName = new Map<string, string>()
    for (const u of (uom || [])) {
      const idStr = String(u.id)
      const nameStr = String(u.name || '')
      uomById.set(idStr, nameStr)
      if (nameStr) {
        uomByName.set(nameStr.toLowerCase(), nameStr)
      }
    }

    return (data || []).map(r => {
      const rawUom = (r as any).uom_id
      let unitLabel = 'unit'
      if (rawUom != null) {
        const rawStr = String(rawUom)
        unitLabel =
          uomById.get(rawStr) ||
          uomByName.get(rawStr.toLowerCase()) ||
          rawStr ||
          'unit'
      }

      return {
        id: String(r.id ?? String(r.name)),
        name: String(r.name),
        category:
          r.category_id != null
            ? catById.get(String(r.category_id)) || null
            : null,
        cost_unit_vnd:
          r.cost_per_unit_vnd != null ? Number(r.cost_per_unit_vnd) : 0,
        unit: unitLabel,
      }
    })
  } catch (e) {
    console.error('fetchPreps fatal', e)
    return []
  }
}

/* ---------- Hook ---------- */
export function useWastage(params: {
  year: number
  month: number
  branchName?: string | null
}) {
  const { year, month, branchName } = params

  const [categories, setCategories] = useState<Category[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [dishes, setDishes] = useState<Dish[]>([])
  const [preps, setPreps] = useState<Prep[]>([])

  const [rows, setRows] = useState<WastageRow[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // anti-spam: evitiamo di lanciare 50 refresh insieme dopo il wake
  const refreshLockRef = useRef(false)
  const lastRefreshAtRef = useRef(0)

  // master data once
  useEffect(() => {
    let alive = true
      ; (async () => {
        const [cs, ms, ds, ps] = await Promise.all([
          fetchCategories(),
          fetchMaterials(),
          fetchDishes(),
          fetchPreps(),
        ])
        if (!alive) return
        setCategories(cs)
        setMaterials(ms)
        setDishes(ds)
        setPreps(ps)
      })()
    return () => {
      alive = false
    }
  }, [])

  const refreshMonth = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const monthStart = new Date(year, month, 1)
      const monthEnd = new Date(year, month + 1, 1)

      let q = supabase
        .from(TBL_WASTAGE)
        .select(
          'id,date,time,wtype,category_id,category_name,item_id,item_name,unit,qty,unit_cost_vnd,total_cost_vnd,charge_target,reason,responsible,entered_by,branch_name'
        )
        .gte('date', toISODate(monthStart))
        .lt('date', toISODate(monthEnd))
        .order('date', { ascending: false })
        .order('time', { ascending: false })

      const branch = (branchName || '').trim()
      if (branch) q = q.eq('branch_name', branch)

      const { data, error } = await q
      if (error && (error as any).message) {
        console.error('Failed to load wastage entries', error)
        setError('Failed to load wastage entries')
        setRows([])
        return
      }

      const mapped: WastageRow[] = (data || []).map((r: any) => ({
        id: String(r.id),
        date: String(r.date),
        time: String(r.time),
        type: r.wtype as WType,
        categoryId: r.category_id ? String(r.category_id) : null,
        categoryName: r.category_name ? String(r.category_name) : null,
        itemId: r.item_id ? String(r.item_id) : null,
        itemName: String(r.item_name || ''),
        unit: r.unit ? String(r.unit) : null,
        qty: Number(r.qty || 0),
        unitCost: Number(r.unit_cost_vnd || 0),
        totalCost: Number(
          r.total_cost_vnd ||
          Number(r.unit_cost_vnd || 0) * Number(r.qty || 0)
        ),
        chargeTo: r.charge_target as 'Restaurant' | 'Staff',
        reason: r.reason ? String(r.reason) : null,
        responsible: r.responsible ? String(r.responsible) : null,
        enteredBy: r.entered_by ? String(r.entered_by) : null,
        branchName: r.branch_name ? String(r.branch_name) : null,
      }))

      setRows(mapped)
    } catch (e) {
      console.error('Failed to load wastage entries', e)
      setError('Failed to load wastage entries')
    } finally {
      setLoading(false)
    }
  }, [year, month, branchName])

  // Wrapper “safe”, usato da focus/online/realtime per evitare loop e spam
  const safeRefreshMonth = useCallback(
    async (reason?: string) => {
      const now = Date.now()
      // throttling 4s
      if (now - lastRefreshAtRef.current < 4000) {
        return
      }
      if (refreshLockRef.current) return
      refreshLockRef.current = true
      try {
        // utile per debug, se vuoi:
        if (reason) {
          // console.log('safeRefreshMonth via', reason)
        }
        await refreshMonth()
        lastRefreshAtRef.current = Date.now()
      } finally {
        refreshLockRef.current = false
      }
    },
    [refreshMonth]
  )

  // initial + wake-up handlers (focus, visibility, online)
  useEffect(() => {
    let alive = true

      ; (async () => {
        if (!alive) return
        await safeRefreshMonth('mount')
      })()

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void safeRefreshMonth('visibility')
      }
    }

    const onFocus = () => {
      void safeRefreshMonth('focus')
    }

    const onOnline = () => {
      void safeRefreshMonth('online')
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)

    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
    }
  }, [safeRefreshMonth])

  // Realtime: allunga la vita senza rompere dopo lo sleep
  useRealtimeChannel('dr-wastage', [TBL_WASTAGE], () => {
    void safeRefreshMonth('realtime')
  })

  async function insertWastage(row: WastageRow): Promise<WastageRow | null> {
    try {
      const payload = {
        date: row.date,
        time: row.time,
        wtype: row.type,
        category_id: row.categoryId ?? null,
        category_name: row.categoryName ?? null,
        item_id: row.itemId ?? null,
        item_name: row.itemName,
        unit: row.unit ?? null,
        qty: row.qty,
        unit_cost_vnd: row.unitCost,
        charge_target: row.chargeTo,
        reason: row.reason ?? null,
        responsible: row.responsible ?? null,
        entered_by: row.enteredBy ?? null,
        branch_name: branchName ?? null,
      }

      const { data, error } = await supabase
        .from(TBL_WASTAGE)
        .insert(payload)
        .select(
          'id,date,time,wtype,category_id,category_name,item_id,item_name,unit,qty,unit_cost_vnd,total_cost_vnd,charge_target,reason,responsible,entered_by,branch_name'
        )
        .single()

      if (error && (error as any).message) {
        throw error
      }
      if (!data) throw new Error('No data returned from insert')

      const mapped: WastageRow = {
        id: String(data.id),
        date: String(data.date),
        time: String(data.time),
        type: data.wtype as WType,
        categoryId: data.category_id ? String(data.category_id) : null,
        categoryName: data.category_name ? String(data.category_name) : null,
        itemId: data.item_id ? String(data.item_id) : null,
        itemName: String(data.item_name || ''),
        unit: data.unit ? String(data.unit) : null,
        qty: Number(data.qty || 0),
        unitCost: Number(data.unit_cost_vnd || 0),
        totalCost: Number(
          data.total_cost_vnd ||
          Number(data.unit_cost_vnd || 0) * Number(data.qty || 0)
        ),
        chargeTo: data.charge_target as 'Restaurant' | 'Staff',
        reason: data.reason ? String(data.reason) : null,
        responsible: data.responsible ? String(data.responsible) : null,
        enteredBy: data.entered_by ? String(data.entered_by) : null,
        branchName: data.branch_name ? String(data.branch_name) : null,
      }

      setRows(prev => [mapped, ...prev])
      return mapped
    } catch (e) {
      console.error('Insert wastage failed', e)
      return null
    }
  }

  async function deleteWastage(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.from(TBL_WASTAGE).delete().eq('id', id)
      if (error) throw error
      setRows(prev => prev.filter(r => r.id !== id))
      return true
    } catch (e) {
      console.error('Delete wastage failed', e)
      return false
    }
  }

  async function bulkDeleteWastage(ids: string[]): Promise<boolean> {
    try {
      const { error } = await supabase.from(TBL_WASTAGE).delete().in('id', ids)
      if (error) throw error
      setRows(prev => prev.filter(r => !ids.includes(r.id)))
      return true
    } catch (e) {
      console.error('Bulk delete wastage failed', e)
      return false
    }
  }

  const master = useMemo(
    () => ({ categories, materials, dishes, preps }),
    [categories, materials, dishes, preps]
  )

  return {
    rows,
    loading,
    error,
    master, // { categories, materials, dishes, preps }
    insertWastage,
    deleteWastage,
    bulkDeleteWastage,
    refreshMonth: safeRefreshMonth, // esponiamo la versione safe
  }
}