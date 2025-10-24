// src/app/catering/_data/useEventExtraFeeRows.ts
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

/** Scope normalizzato usato dai calcoli/UI */
export type ExtraFeeScopeNorm = 'total' | 'bundles' | 'equipment' | 'staff' | 'transport' | 'assets'

export type ExtraFeeRow = {
  id: string
  event_id: string
  label: string
  amount: number
  notes: string | null
  // campi di calcolo/visualizzazione standard
  qty: number
  unit_price: number | null
  calc_mode: boolean
  cost: number | null
  markup_x: number | null
  created_at: string
  updated_at: string

  // ── NUOVI: pass-through % e scope dal DB (non distruttivi)
  /** possono chiamarsi percent | percentage | rate nel DB (number o string) */
  percent?: number | string | null
  percentage?: number | string | null
  rate?: number | string | null
  /** valore normalizzato 0…1 per i calcoli */
  percentNorm?: number | null

  /** possono chiamarsi base | apply_on | scope nel DB (string) */
  base?: string | null
  apply_on?: string | null
  scope?: string | null
  /** scope normalizzato per i calcoli/UI */
  scopeNorm?: ExtraFeeScopeNorm | null
}

type CreateInput = {
  label?: string
  amount?: number | string
  notes?: string | null
  qty?: number | string
  unit_price?: number | string | null
  calc_mode?: boolean
  cost?: number | string | null
  markup_x?: number | string | null
}

type UpdateInput = {
  id: string
  patch: Partial<
    Pick<
      ExtraFeeRow,
      'label' | 'amount' | 'notes' | 'qty' | 'unit_price' | 'calc_mode' | 'cost' | 'markup_x'
    >
  >
}

function clampNonNeg(n: number): number {
  if (!Number.isFinite(n)) return 0
  return n < 0 ? 0 : n
}
function clampNonNegInt(n: number): number {
  if (!Number.isFinite(n)) return 0
  const x = Math.floor(n)
  return x < 0 ? 0 : x
}
function toNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replaceAll(',', ''))
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

/** parse percentuale da percent|percentage|rate (0…1 o 0…100) → 0…1 */
function parsePercentAny(raw: any): number | null {
  const candidate = raw?.percent ?? raw?.percentage ?? raw?.rate
  if (candidate == null) return null

  const fromStr = (s: string): number | null => {
    const t = s.replace(',', '.').replace(/[%\s]/g, '')
    if (!t) return null
    const n = Number(t)
    if (!Number.isFinite(n)) return null
    if (n <= 1) return n >= 0 ? n : null
    if (n < 1000) return n / 100
    return null
  }

  if (typeof candidate === 'string') return fromStr(candidate)
  const n = Number(candidate)
  if (!Number.isFinite(n)) return null
  if (n <= 1) return n >= 0 ? n : null
  if (n < 1000) return n / 100
  return null
}

/** normalizza base/apply_on/scope in uno scope canonico */
function normalizeScope(raw: any): ExtraFeeScopeNorm | null {
  const k = String(raw ?? '').toLowerCase().trim()
  if (!k) return 'total'
  const map: Record<string, ExtraFeeScopeNorm> = {
    total: 'total', grand: 'total', grand_total: 'total', price: 'total',
    bundles: 'bundles', bundle: 'bundles',
    equipment: 'equipment',
    staff: 'staff',
    transport: 'transport',
    assets: 'assets', asset: 'assets',
  }
  return map[k] ?? 'total'
}

function normalizeRow(r: any): ExtraFeeRow {
  const percentNorm = parsePercentAny(r)
  const scopeRaw = r?.scope ?? r?.apply_on ?? r?.base
  const scopeNorm = normalizeScope(scopeRaw)

  return {
    id: String(r.id),
    event_id: String(r.event_id),
    label: String(r.label ?? ''),
    amount: clampNonNeg(toNum(r.amount, 0)),
    notes: r.notes ?? null,
    qty: clampNonNegInt(toNum(r.qty, 1)),
    unit_price: r.unit_price == null ? null : clampNonNeg(toNum(r.unit_price, 0)),
    calc_mode: !!r.calc_mode,
    cost: r.cost == null ? null : clampNonNeg(toNum(r.cost, 0)),
    markup_x: r.markup_x == null ? null : clampNonNeg(toNum(r.markup_x, 0)),
    created_at: String(r.created_at ?? ''),
    updated_at: String(r.updated_at ?? ''),

    // ── pass-through grezzi dal DB (se esistono li lasciamo invariati)
    percent: r?.percent ?? null,
    percentage: r?.percentage ?? null,
    rate: r?.rate ?? null,
    percentNorm: percentNorm,

    base: r?.base ?? null,
    apply_on: r?.apply_on ?? null,
    scope: r?.scope ?? null,
    scopeNorm: scopeNorm,
  }
}

/**
 * Hook CRUD per event_extra_fee_rows.
 * Ordine per created_at asc. Espone percentuali/scope dal DB (DB-first).
 */
export function useEventExtraFeeRows(eventId: string | null | undefined) {
  const [rows, setRows] = useState<ExtraFeeRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const canQuery = !!eventId

  const fetchRows = useCallback(async () => {
    if (!canQuery) {
      setRows(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('event_extra_fee_rows')
      .select('*')
      .eq('event_id', eventId as string)
      .order('created_at', { ascending: true })

    if (!mountedRef.current) return
    if (error) {
      setError(error.message ?? 'Fetch error')
      setRows([])
    } else {
      const normalized = (data ?? []).map(normalizeRow)
      setRows(normalized)
    }
    setLoading(false)
  }, [canQuery, eventId])

  // mount, unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // initial and eventId change
  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  // Re-sync su focus/visibilitychange
  useEffect(() => {
    function onFocus() { fetchRows() }
    function onVisChange() { if (document.visibilityState === 'visible') fetchRows() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisChange)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisChange)
    }
  }, [fetchRows])

  const createRow = useCallback(
    async (input?: CreateInput) => {
      if (!canQuery) return { error: 'Missing eventId' as const }

      const calc_mode = Boolean(input?.calc_mode ?? false)
      const qty = clampNonNegInt(toNum(input?.qty, 1))

      // Se calc_mode true → persistiamo cost/markup_x, unit_price null
      // Se calc_mode false → persistiamo unit_price, cost/markup_x null
      const unit_price_raw = input?.unit_price
      const cost_raw = input?.cost
      const markup_raw = input?.markup_x

      const payload: Record<string, any> = {
        event_id: eventId as string,
        label: (input?.label ?? '').trim(),
        amount: clampNonNeg(toNum(input?.amount, 0)),
        notes: input?.notes == null ? null : String(input.notes).trim() || null,
        qty,
        calc_mode,
        unit_price: calc_mode ? null : clampNonNeg(toNum(unit_price_raw, 0)),
        cost: calc_mode ? clampNonNeg(toNum(cost_raw, 0)) : null,
        markup_x: calc_mode ? clampNonNeg(toNum(markup_raw, 0)) : null,
      }

      const { data, error } = await supabase
        .from('event_extra_fee_rows')
        .insert([payload])
        .select('*')
        .single()

      if (error) return { error: error.message }
      await fetchRows()
      return { data: normalizeRow(data) }
    },
    [canQuery, eventId, fetchRows]
  )

  const updateRow = useCallback(
    async ({ id, patch }: UpdateInput) => {
      if (!id) return { error: 'Missing id' as const }
      const upd: Record<string, unknown> = {}

      if (patch.label !== undefined) upd.label = String(patch.label).trim()
      if (patch.amount !== undefined) upd.amount = clampNonNeg(toNum(patch.amount, 0))
      if (patch.notes !== undefined) {
        const n = patch.notes
        upd.notes = n === null ? null : String(n).trim()
      }
      if (patch.qty !== undefined) upd.qty = clampNonNegInt(toNum(patch.qty, 0))
      if (patch.calc_mode !== undefined) upd.calc_mode = !!patch.calc_mode
      if (patch.unit_price !== undefined) {
        upd.unit_price = patch.unit_price === null ? null : clampNonNeg(toNum(patch.unit_price, 0))
      }
      if (patch.cost !== undefined) {
        upd.cost = patch.cost === null ? null : clampNonNeg(toNum(patch.cost, 0))
      }
      if (patch.markup_x !== undefined) {
        upd.markup_x = patch.markup_x === null ? null : clampNonNeg(toNum(patch.markup_x, 0))
      }

      const { data, error } = await supabase
        .from('event_extra_fee_rows')
        .update(upd)
        .eq('id', id)
        .select('*')
        .single()

      if (error) return { error: error.message }

      const normalized = normalizeRow(data)

      // Merge strutturale per anti flicker su campi in editing
      setRows(prev => {
        if (!prev) return prev
        const idx = prev.findIndex(r => r.id === id)
        if (idx === -1) return prev
        const next = [...prev]
        next[idx] = { ...next[idx], ...normalized }
        return next
      })
      return { data: normalized }
    },
    []
  )

  const deleteRow = useCallback(async (id: string) => {
    if (!id) return { error: 'Missing id' as const }
    const { error } = await supabase.from('event_extra_fee_rows').delete().eq('id', id)
    if (error) return { error: error.message }
    setRows(prev => (prev ? prev.filter(r => r.id !== id) : prev))
    return { ok: true as const }
  }, [])

  const totalAmount = useMemo(() => {
    if (!rows || rows.length === 0) return 0
    return rows.reduce((sum, r) => sum + clampNonNeg(toNum(r.amount, 0)), 0)
  }, [rows])

  return {
    rows,
    loading,
    error,
    refresh: fetchRows,
    createRow,
    updateRow,
    deleteRow,
    totalAmount,
    canQuery,
  }
}
