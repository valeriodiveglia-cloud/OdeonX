// src/app/daily-reports/_data/useClosingList.ts
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

export type ClosingRow = {
  id: string
  date: string      // ISO yyyy-mm-dd
  time: string      // HH:mm
  branch: string
  revenue: number
  unpaid: number
  cashout: number
  cashToTake: number
  enteredBy?: string | null
}

export type UseClosingListArgs = {
  year: number
  month: number     // 0-11
  branchName: string | null
}

// Tabella reale su Supabase
const TABLE_NAME = 'cashier_closings'

// Denominazioni per ricostruire il contante da cash_json
const DENOMS = [
  { key: 'd500k', face: 500_000 },
  { key: 'd200k', face: 200_000 },
  { key: 'd100k', face: 100_000 },
  { key: 'd50k', face: 50_000 },
  { key: 'd20k', face: 20_000 },
  { key: 'd10k', face: 10_000 },
  { key: 'd5k', face: 5_000 },
  { key: 'd2k', face: 2_000 },
  { key: 'd1k', face: 1_000 },
] as const

type DenomKey = typeof DENOMS[number]['key']

export function useClosingList({ year, month, branchName }: UseClosingListArgs) {
  const [rows, setRows] = useState<ClosingRow[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Protezione wake/unmount
  const isActiveRef = useRef(true)
  useEffect(() => {
    isActiveRef.current = true
    return () => {
      isActiveRef.current = false
    }
  }, [])

  // Safe setters
  const safeSetRows = (updater: ClosingRow[] | ((prev: ClosingRow[]) => ClosingRow[])) => {
    if (!isActiveRef.current) return
    setRows(updater as any)
  }
  const safeSetLoading = (val: boolean) => {
    if (!isActiveRef.current) return
    setLoading(val)
  }
  const safeSetError = (val: string | null) => {
    if (!isActiveRef.current) return
    setError(val)
  }

  const monthStart = useMemo(() => new Date(year, month, 1), [year, month])
  const monthEnd = useMemo(() => new Date(year, month + 1, 1), [year, month])

  const startISO = useMemo(() => toISODate(monthStart), [monthStart])
  const endISO = useMemo(() => toISODate(monthEnd), [monthEnd])

  const refresh = useCallback(async () => {
    try {
      safeSetLoading(true)
      safeSetError(null)

      let q = supabase
        .from(TABLE_NAME)
        .select(
          [
            'id',
            'report_date',
            'branch_name',
            'opening_float_vnd',
            'revenue_vnd',
            'unpaid_vnd',
            'cash_out_vnd',
            'cash_json',
            'cashier_name',
            'created_at',
          ].join(',')
        )
        .gte('report_date', startISO)
        .lt('report_date', endISO)
        .order('report_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (branchName) q = q.eq('branch_name', branchName)

      const { data, error } = await q
      if (!isActiveRef.current) return

      if (error) throw error

      const mapped: ClosingRow[] = (data || []).map(mapDbRowToClosingRow)

      safeSetRows(mapped)
    } catch (e: any) {
      if (!isActiveRef.current) return
      console.error('useClosingList refresh error', e)
      safeSetRows([])
      safeSetError(e?.message || 'Failed to load closings')
    } finally {
      safeSetLoading(false)
    }
  }, [startISO, endISO, branchName])

  useEffect(() => {
    refresh().catch(() => { })

    const onFocus = () => {
      if (document.visibilityState === 'visible') {
        refresh().catch(() => { })
      }
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refresh])

  const insertClosing = useCallback(
    async (row: Omit<ClosingRow, 'id'>) => {
      const payload = {
        report_date: row.date,
        branch_name: row.branch,
        opening_float_vnd: 0,
        revenue_vnd: row.revenue,
        unpaid_vnd: row.unpaid,
        cash_out_vnd: row.cashout,
        cash_json: null,
        cashier_name: row.enteredBy ?? null,
      }

      const { data, error } = await supabase
        .from(TABLE_NAME)
        .insert(payload)
        .select(
          [
            'id',
            'report_date',
            'branch_name',
            'opening_float_vnd',
            'revenue_vnd',
            'unpaid_vnd',
            'cash_out_vnd',
            'cash_json',
            'cashier_name',
            'created_at',
          ].join(',')
        )
        .single()

      if (!isActiveRef.current) return null

      if (error) throw error

      const mapped = mapDbRowToClosingRow(data)

      const inMonth = mapped.date >= startISO && mapped.date < endISO
      const branchOK = !branchName || branchName === mapped.branch

      if (inMonth && branchOK) {
        safeSetRows(prev => [mapped, ...prev])
      }

      return mapped
    },
    [startISO, endISO, branchName]
  )

  const deleteMany = useCallback(async (ids: string[]) => {
    if (!ids.length) return { count: 0 }
    const { error } = await supabase.from(TABLE_NAME).delete().in('id', ids)
    if (!isActiveRef.current) return { count: 0 }
    if (error) throw error
    safeSetRows(prev => prev.filter(r => !ids.includes(r.id)))
    return { count: ids.length }
  }, [])

  const stats = useMemo(() => {
    const count = rows.length
    const sum = (fn: (r: ClosingRow) => number) =>
      rows.reduce((s, r) => s + (fn(r) || 0), 0)
    const totalRevenue = sum(r => r.revenue)
    const totalUnpaid = sum(r => r.unpaid)
    const totalCashout = sum(r => r.cashout)
    const totalToTake = sum(r => r.cashToTake)
    const avgRevenue = count ? Math.round(totalRevenue / count) : 0
    return { count, totalRevenue, totalUnpaid, totalCashout, totalToTake, avgRevenue }
  }, [rows])

  // Realtime: aggiornamento automatico quando cambia cashier_closings
  useEffect(() => {
    const channel = supabase
      .channel('rt-cashier-closings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE_NAME },
        (payload: any) => {
          if (!isActiveRef.current) return

          const { eventType, new: newRow, old } = payload

          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const mapped = mapDbRowToClosingRow(newRow)
            const inMonth = mapped.date >= startISO && mapped.date < endISO
            const branchOK = !branchName || branchName === mapped.branch

            safeSetRows(prev => {
              const idx = prev.findIndex(r => r.id === mapped.id)
              // se non rientra nel filtro, rimuovi se esiste
              if (!inMonth || !branchOK) {
                if (idx === -1) return prev
                const next = [...prev]
                next.splice(idx, 1)
                return next
              }

              if (idx >= 0) {
                const next = [...prev]
                next[idx] = mapped
                return next
              }
              // nuovo closing che rientra in filtro: metti in cima
              return [mapped, ...prev]
            })
          }

          if (eventType === 'DELETE') {
            const id = String(old?.id ?? '')
            if (!id) return
            safeSetRows(prev => prev.filter(r => r.id !== id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [startISO, endISO, branchName])

  return {
    rows,
    loading,
    error,
    stats,
    refresh,
    insertClosing,
    deleteMany,
  }
}

/* Utils */

function toISODate(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function mapDbRowToClosingRow(r: any): ClosingRow {
  const date = String(r.report_date)

  const created = r.created_at ? new Date(r.created_at) : null
  const time = created ? formatTimeHM(created) : '00:00'

  const revenue = toNum(r.revenue_vnd)
  const unpaid = toNum(r.unpaid_vnd)
  const cashout = toNum(r.cash_out_vnd)
  const floatTarget = toNum(r.opening_float_vnd)
  const countedCash = cashFromJson(r.cash_json)
  const cashToTake = Math.max(0, countedCash - floatTarget)

  return {
    id: String(r.id),
    date,
    time,
    branch: String(r.branch_name || ''),
    revenue,
    unpaid,
    cashout,
    cashToTake,
    enteredBy: r.cashier_name ? String(r.cashier_name) : null,
  }
}

function toNum(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatTimeHM(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function cashFromJson(raw: any): number {
  if (!raw) return 0
  let obj: Partial<Record<DenomKey, number>> | null = null

  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw)
    } catch {
      obj = null
    }
  } else if (typeof raw === 'object') {
    obj = raw as any
  }

  if (!obj) return 0

  let sum = 0
  for (const d of DENOMS) {
    const pieces = Number((obj as any)[d.key] || 0)
    if (!Number.isFinite(pieces)) continue
    sum += pieces * d.face
  }
  return Math.round(sum)
}