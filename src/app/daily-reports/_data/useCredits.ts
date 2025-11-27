// src/app/daily-reports/_data/useCredits.ts 
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

export type LedgerType = 'credit' | 'repayment'
export type CreditRow = {
  id: string
  branch: string | null
  date: string
  type: LedgerType
  customer_id: string | null
  customer_name: string | null
  customer_phone?: string | null
  customer_email?: string | null
  amount: number
  reference?: string | null
  shift: string | null
  handledBy: string | null
  note?: string | null
}
export type PaymentItem = { id: string; credit_id: string; amount: number; date: string; note: string | null }
export type Totals = { paid: number; remaining: number; status: 'Paid' | 'Unpaid' }

export function todayISO() {
  const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function ymd(date: Date) { return date.toISOString().slice(0, 10) }
function safeNumber(n: any, fallback = 0) { const x = Number(n); return Number.isFinite(x) ? x : fallback }
const BASE_COLUMNS = `
  id, branch, date, type, customer_id, customer_name, customer_phone, customer_email,
  amount, reference, shift, handledBy:handled_by, note
`
const uuid = () => (crypto?.randomUUID?.() || `rand-${Math.random().toString(36).slice(2)}`)

export function useCredits(params?: { year?: number; month?: number; branchName?: string | null }) {
  const [rows, setRows] = useState<CreditRow[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [totalsMap, setTotalsMap] = useState<Record<string, Totals>>({})
  const [staffOpts, setStaffOpts] = useState<string[]>([])
  const [currentUserName, setCurrentUserName] = useState<string>('')
  const [currentShiftName, setCurrentShiftName] = useState<string>('')

  const isActiveRef = useRef<boolean>(true)
  const editorOpenRef = useRef<boolean>(false)
  const pendingRefreshRef = useRef<boolean>(false)
  const lastBranchRef = useRef<string>('')
  const lastDateRef = useRef<string>('')

  // safe setters per evitare setState dopo unmount / wake
  const safeSetRows = (updater: CreditRow[] | ((prev: CreditRow[]) => CreditRow[])) => {
    if (!isActiveRef.current) return
    setRows(updater as any)
  }
  const safeSetLoading = (val: boolean) => {
    if (!isActiveRef.current) return
    setLoading(val)
  }
  const safeSetTotalsMap = (
    updater: Record<string, Totals> | ((prev: Record<string, Totals>) => Record<string, Totals>)
  ) => {
    if (!isActiveRef.current) return
    setTotalsMap(updater as any)
  }
  const safeSetStaffOpts = (updater: string[] | ((prev: string[]) => string[])) => {
    if (!isActiveRef.current) return
    setStaffOpts(updater as any)
  }
  const safeSetCurrentUserName = (val: string) => {
    if (!isActiveRef.current) return
    setCurrentUserName(val)
  }
  const safeSetCurrentShiftName = (val: string) => {
    if (!isActiveRef.current) return
    setCurrentShiftName(val)
  }

  useEffect(() => {
    isActiveRef.current = true
    return () => {
      isActiveRef.current = false
    }
  }, [])

  const loadUserMeta = useCallback(() => {
    try {
      const u = localStorage.getItem('user.displayName') || localStorage.getItem('user.name') || ''
      const s = localStorage.getItem('dailyreports.currentShiftName') || localStorage.getItem('currentShiftName') || ''
      safeSetCurrentUserName(u || '')
      safeSetCurrentShiftName(s || '')
    } catch { }
  }, [])

  const buildStaffOpts = useCallback((data: CreditRow[]) => {
    const set = new Set<string>()
    for (const r of data) if (r.handledBy && r.handledBy.trim()) set.add(r.handledBy.trim())
    const arr = Array.from(set); arr.sort((a, b) => a.localeCompare(b))
    safeSetStaffOpts(arr)
  }, [])

  const fetchCredits = useCallback(async () => {
    if (editorOpenRef.current) {
      pendingRefreshRef.current = true
      return
    }
    safeSetLoading(true)
    try {
      let q = supabase
        .from('credits')
        .select(BASE_COLUMNS)
        .order('date', { ascending: true })

      if (params?.year != null && params?.month != null) {
        const start = new Date(params.year, params.month, 1)
        const end = new Date(params.year, params.month + 1, 1)
        q = q.gte('date', ymd(start)).lt('date', ymd(end))
      } else {
        // Default behavior: current month +/- 1
        const now = new Date()
        const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const to = new Date(now.getFullYear(), now.getMonth() + 2, 1)
        q = q.gte('date', ymd(from)).lt('date', ymd(to))
      }

      if (params?.branchName) {
        q = q.eq('branch', params.branchName)
      }

      const { data, error } = await q

      if (!isActiveRef.current) return

      if (error) {
        console.error('fetchCredits error', {
          message: (error as any)?.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
          code: (error as any)?.code,
        })
        return
      }

      const list = (data || []) as CreditRow[]

      // preload totalsMap per tutte le righe in una volta
      const initialTotals: Record<string, Totals> = {}
      try {
        const ids = list.map(r => r.id).filter(Boolean)
        if (ids.length) {
          const { data: pays, error: pErr } = await supabase
            .from('credit_payments')
            .select('credit_id, amount')
            .in('credit_id', ids)

          if (!isActiveRef.current) return

          if (!pErr && pays) {
            const paidByCredit: Record<string, number> = {}
            for (const p of pays as any[]) {
              const cid = String(p.credit_id)
              const amt = safeNumber(p.amount, 0)
              paidByCredit[cid] = (paidByCredit[cid] || 0) + amt
            }
            for (const r of list) {
              const id = r.id
              const initial = Math.round(safeNumber(r.amount, 0))
              const paid = Math.round(safeNumber(paidByCredit[id], 0))
              const remaining = Math.max(0, initial - paid)
              const status: Totals['status'] = remaining === 0 ? 'Paid' : 'Unpaid'
              initialTotals[id] = { paid, remaining, status }
            }
          } else {
            for (const r of list) {
              const initial = Math.round(safeNumber(r.amount, 0))
              initialTotals[r.id] = {
                paid: 0,
                remaining: initial,
                status: initial === 0 ? 'Paid' : 'Unpaid',
              }
            }
          }
        } else {
          // niente righe
        }
      } catch (e: any) {
        console.error('fetchCredits totals preload error', {
          message: e?.message,
          details: e?.details,
          hint: e?.hint,
          code: e?.code,
        })
        const fallback: Record<string, Totals> = {}
        for (const r of list) {
          const initial = Math.round(safeNumber(r.amount, 0))
          fallback[r.id] = {
            paid: 0,
            remaining: initial,
            status: initial === 0 ? 'Paid' : 'Unpaid',
          }
        }
        Object.assign(initialTotals, fallback)
      }

      safeSetRows(list)
      safeSetTotalsMap(initialTotals)
      buildStaffOpts(list)
    } catch (e: any) {
      if (!isActiveRef.current) return
      console.error('fetchCredits unexpected error', {
        message: e?.message,
        details: e?.details,
        hint: e?.hint,
        code: e?.code,
      })
    } finally {
      safeSetLoading(false)
      pendingRefreshRef.current = false
    }
  }, [buildStaffOpts, params?.year, params?.month, params?.branchName])

  const fetchTotalsOne = useCallback(async (id: string): Promise<Totals | null> => {
    try {
      const row = rows.find(r => r.id === id)
      let initial = safeNumber(row?.amount, 0)
      if (!row) {
        const { data: one, error: e1 } = await supabase
          .from('credits')
          .select('amount')
          .eq('id', id)
          .single()

        if (e1) {
          console.error('fetchTotalsOne credits error', {
            message: (e1 as any)?.message,
            details: (e1 as any)?.details,
            hint: (e1 as any)?.hint,
            code: (e1 as any)?.code,
          })
          return null
        }
        initial = safeNumber((one as any)?.amount, 0)
      }

      const { data: agg, error: e2 } = await supabase
        .from('credit_payments')
        .select('amount')
        .eq('credit_id', id)

      if (e2) {
        console.error('fetchTotalsOne payments error', {
          message: (e2 as any)?.message,
          details: (e2 as any)?.details,
          hint: (e2 as any)?.hint,
          code: (e2 as any)?.code,
        })
        return null
      }

      const paid = (agg || []).reduce((s: number, p: any) => s + safeNumber(p.amount, 0), 0)
      const remaining = Math.max(0, Math.round(initial) - Math.round(paid))
      const status: Totals['status'] = remaining === 0 ? 'Paid' : 'Unpaid'
      return { paid: Math.round(paid), remaining, status }
    } catch (e: any) {
      console.error('fetchTotalsOne unexpected', {
        message: e?.message,
        details: e?.details,
        hint: e?.hint,
        code: e?.code,
      })
      return null
    }
  }, [rows])

  const refreshTotalsFor = useCallback(async (id: string) => {
    const t = await fetchTotalsOne(id); if (!t) return
    safeSetTotalsMap(prev => ({ ...prev, [id]: t }))
  }, [fetchTotalsOne])

  const fetchPayments = useCallback(async (creditId: string): Promise<PaymentItem[]> => {
    try {
      const { data, error } = await supabase
        .from('credit_payments')
        .select('id, credit_id, amount, date, note')
        .eq('credit_id', creditId)
        .order('date', { ascending: true })

      if (error) {
        console.error('fetchPayments error', {
          message: (error as any)?.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
          code: (error as any)?.code,
        })
        return []
      }

      return (data || []) as PaymentItem[]
    } catch (e: any) {
      console.error('fetchPayments unexpected error', {
        message: e?.message,
        details: e?.details,
        hint: e?.hint,
        code: e?.code,
      })
      return []
    }
  }, [])

  const addPayment = useCallback(async (creditId: string, input: { amount: number; note?: string | null; date?: string }): Promise<PaymentItem | null> => {
    try {
      const payload = {
        credit_id: creditId,
        amount: Math.round(safeNumber(input.amount, 0)),
        date: input.date || new Date().toISOString(),
        note: input.note ?? null,
      }
      const { data, error } = await supabase
        .from('credit_payments')
        .insert(payload)
        .select('id, credit_id, amount, date, note')
        .single()
      if (error) throw error
      try {
        window.dispatchEvent(new CustomEvent('credits:payments:changed', {
          detail: { creditId, branch: lastBranchRef.current, dateStr: lastDateRef.current },
        }))
        localStorage.setItem('credits_payments_last_emit_at', String(Date.now()))
      } catch { }
      void refreshTotalsFor(creditId)
      return data as PaymentItem
    } catch (e: any) {
      console.error('addPayment error', {
        message: e?.message,
        details: e?.details,
        hint: e?.hint,
        code: e?.code,
      })
      return null
    }
  }, [refreshTotalsFor])

  const updatePayment = useCallback(async (creditId: string, paymentId: string, updates: Partial<Omit<PaymentItem, 'id' | 'credit_id'>>): Promise<PaymentItem | null> => {
    try {
      const patch: any = {}
      if (typeof updates.amount === 'number') patch.amount = Math.round(safeNumber(updates.amount, 0))
      if (updates.date) patch.date = updates.date
      if (updates.note !== undefined) patch.note = updates.note
      const { data, error } = await supabase
        .from('credit_payments')
        .update(patch)
        .eq('id', paymentId)
        .select('id, credit_id, amount, date, note')
        .single()
      if (error) throw error
      try {
        window.dispatchEvent(new CustomEvent('credits:payments:changed', {
          detail: { creditId, branch: lastBranchRef.current, dateStr: lastDateRef.current },
        }))
        localStorage.setItem('credits_payments_last_emit_at', String(Date.now()))
      } catch { }
      void refreshTotalsFor(creditId)
      return data as PaymentItem
    } catch (e: any) {
      console.error('updatePayment error', {
        message: e?.message,
        details: e?.details,
        hint: e?.hint,
        code: e?.code,
      })
      return null
    }
  }, [refreshTotalsFor])

  const deletePayment = useCallback(async (creditId: string, paymentId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('credit_payments')
        .delete()
        .eq('id', paymentId)
        .eq('credit_id', creditId)
        .select('id')

      if (error) throw error
      const ok = Array.isArray(data) ? data.length > 0 : !!data
      if (!ok) {
        console.warn('deletePayment: no row deleted', { creditId, paymentId, data })
        return false
      }
      try {
        window.dispatchEvent(new CustomEvent('credits:payments:changed', {
          detail: { creditId, branch: lastBranchRef.current, dateStr: lastDateRef.current },
        }))
        localStorage.setItem('credits_payments_last_emit_at', String(Date.now()))
      } catch { }
      void refreshTotalsFor(creditId)
      return true
    } catch (e: any) {
      console.error('deletePayment error', {
        message: e?.message,
        details: e?.details,
        hint: e?.hint,
        code: e?.code,
      })
      return false
    }
  }, [refreshTotalsFor])

  const upsertCredit = useCallback(async (row: CreditRow): Promise<CreditRow | null> => {
    try {
      lastBranchRef.current = row.branch || ''
      lastDateRef.current = row.date || ''
      const payload = {
        id: row.id,
        branch: row.branch,
        date: row.date,
        type: row.type,
        customer_id: row.customer_id ?? null,
        customer_name: row.customer_name ?? null,
        customer_phone: row.customer_phone ?? null,
        customer_email: row.customer_email ?? null,
        amount: Math.round(safeNumber(row.amount, 0)),
        reference: row.reference ?? null,
        shift: row.shift ?? null,
        handled_by: row.handledBy ?? null,
        note: row.note ?? null,
      }
      const { data, error } = await supabase
        .from('credits')
        .upsert(payload, { onConflict: 'id' })
        .select(BASE_COLUMNS)
        .single()
      if (error) throw error
      if (!isActiveRef.current) return data as CreditRow
      safeSetRows(prev => {
        const idx = prev.findIndex(r => r.id === (data as CreditRow).id)
        if (idx === -1) {
          return [...prev, data as CreditRow].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          )
        }
        const copy = [...prev]
        copy[idx] = data as CreditRow
        return copy
      })
      try {
        window.dispatchEvent(new CustomEvent('credits:credits:changed', {
          detail: { id: (data as CreditRow).id, branch: lastBranchRef.current, dateStr: lastDateRef.current },
        }))
        localStorage.setItem('credits_last_emit_at', String(Date.now()))
      } catch { }
      void refreshTotalsFor((data as CreditRow).id)
      return data as CreditRow
    } catch (e: any) {
      console.error('upsertCredit error', {
        message: e?.message,
        details: e?.details,
        hint: e?.hint,
        code: e?.code,
      })
      return null
    }
  }, [refreshTotalsFor])

  const deleteCredit = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('credits')
        .delete()
        .eq('id', id)
      if (error) throw error
      if (!isActiveRef.current) return true
      safeSetRows(prev => prev.filter(r => r.id !== id))
      safeSetTotalsMap(prev => { const { [id]: _, ...rest } = prev; return rest })
      try {
        window.dispatchEvent(new CustomEvent('credits:credits:changed', { detail: { id } }))
        localStorage.setItem('credits_last_emit_at', String(Date.now()))
      } catch { }
      return true
    } catch (e: any) {
      console.error('deleteCredit error', {
        message: e?.message,
        details: e?.details,
        hint: e?.hint,
        code: e?.code,
      })
      return false
    }
  }, [])

  const bulkDeleteCredits = useCallback(async (ids: string[]): Promise<boolean> => {
    if (!ids.length) return true
    try {
      const { error } = await supabase
        .from('credits')
        .delete()
        .in('id', ids)
      if (error) throw error
      if (!isActiveRef.current) return true
      safeSetRows(prev => prev.filter(r => !ids.includes(r.id)))
      safeSetTotalsMap(prev => {
        const next: Record<string, Totals> = {}
        for (const k of Object.keys(prev)) if (!ids.includes(k)) next[k] = prev[k]
        return next
      })
      try {
        window.dispatchEvent(new CustomEvent('credits:credits:changed', { detail: { ids } }))
        localStorage.setItem('credits_last_emit_at', String(Date.now()))
      } catch { }
      return true
    } catch (e: any) {
      console.error('bulkDeleteCredits error', {
        message: e?.message,
        details: e?.details,
        hint: e?.hint,
        code: e?.code,
      })
      return false
    }
  }, [])

  useEffect(() => {
    loadUserMeta()
    void fetchCredits()

    const chName = `credits-realtime-${uuid()}`
    const ch = supabase
      .channel(chName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credits' }, () => { void fetchCredits() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credit_payments' }, () => { void fetchCredits() })
      .subscribe()

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadUserMeta()
        void fetchCredits()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    const onStorage = (ev: StorageEvent) => {
      if (!ev.key) return
      if (
        ev.key === 'dr_branch_last_emit_at' ||
        ev.key === 'credits_payments_last_emit_at' ||
        ev.key === 'credits_last_emit_at'
      ) {
        void fetchCredits()
      }
    }
    window.addEventListener('storage', onStorage)

    const onBranch = () => { void fetchCredits() }
    const onPayments = () => { void fetchCredits() }
    const onCredits = () => { void fetchCredits() }
    window.addEventListener('dailyreports:branch:changed', onBranch as any)
    window.addEventListener('credits:payments:changed', onPayments as any)
    window.addEventListener('credits:credits:changed', onCredits as any)

    const onEditor = (ev: Event) => {
      // @ts-ignore
      const open = !!ev?.detail?.open
      editorOpenRef.current = open
      if (!open && pendingRefreshRef.current) {
        pendingRefreshRef.current = false
        void fetchCredits()
      }
    }
    window.addEventListener('credits:editor:set', onEditor as any)

    return () => {
      try { supabase.removeChannel(ch) } catch { }
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('dailyreports:branch:changed', onBranch as any)
      window.removeEventListener('credits:payments:changed', onPayments as any)
      window.removeEventListener('credits:credits:changed', onCredits as any)
      window.removeEventListener('credits:editor:set', onEditor as any)
      isActiveRef.current = false
    }
  }, [fetchCredits, loadUserMeta])

  const customers = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.customer_name && r.customer_name.trim()) set.add(r.customer_name.trim())
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  return {
    rows, customers, totalsMap,
    staffOpts, currentUserName, currentShiftName,
    loading,
    upsertCredit, deleteCredit, bulkDeleteCredits,
    fetchPayments, addPayment, updatePayment, deletePayment,
    refreshTotalsFor, fetchTotalsOne,
  }
}