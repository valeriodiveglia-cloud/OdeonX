// src/app/daily-reports/_data/useDeposits.ts
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

/* ---------- Types ---------- */

export type TotalsStatus = 'Paid' | 'Unpaid' | 'Open'
export type Totals = { paid: number; remaining: number; status: TotalsStatus }

export type DepositRow = {
  id: string
  branch: string | null
  date: string
  event_date: string | null
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

export type PaymentItem = {
  id: string
  deposit_id: string
  amount: number
  date: string
  note: string | null
  endedBy?: string | null
}

/* ---------- Helpers (shift, staff, totals) ---------- */

const SETTINGS_LS_KEY = 'dailysettings.initialInfo.v1'

function hhmmToMin(t: string): number {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return NaN
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return NaN
  return h * 60 + min
}

type ShiftWin = { name: string; startMin: number; endMin: number }

function loadShiftLabels(): string[] {
  try {
    const raw = localStorage.getItem(SETTINGS_LS_KEY)
    if (!raw) return ['Lunch', 'Dinner', 'All day']
    const p = JSON.parse(raw)
    const out: string[] = []
    const arr = Array.isArray(p?.shifts) ? p.shifts : []
    for (const it of arr) {
      if (typeof it === 'string') {
        const s = it.trim()
        if (s) out.push(s)
      } else if (it && typeof it === 'object') {
        const name = String(it.name ?? it.label ?? '').trim()
        if (name) out.push(name)
      }
    }
    const uniq = Array.from(new Set(out)).filter(Boolean)
    return uniq.length ? uniq : ['Lunch', 'Dinner', 'All day']
  } catch {
    return ['Lunch', 'Dinner', 'All day']
  }
}

function loadShiftWindows(): ShiftWin[] {
  try {
    const raw = localStorage.getItem(SETTINGS_LS_KEY)
    if (!raw) return []
    const p = JSON.parse(raw)

    const arr1 = Array.isArray(p?.shift_windows) ? p.shift_windows : null
    if (arr1) {
      const out: ShiftWin[] = []
      for (const it of arr1) {
        const name = String(it?.name || '').trim()
        const s = hhmmToMin(String(it?.start || ''))
        const e = hhmmToMin(String(it?.end || ''))
        if (name && Number.isFinite(s) && Number.isFinite(e)) out.push({ name, startMin: s, endMin: e })
      }
      if (out.length) return out
    }

    const arr2 = Array.isArray(p?.shifts) ? p.shifts : null
    if (arr2) {
      const out: ShiftWin[] = []
      for (const item of arr2) {
        if (typeof item === 'string') {
          const m = item.match(/^(.+?)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/)
          if (m) {
            const name = m[1].trim()
            const s = hhmmToMin(m[2])
            const e = hhmmToMin(m[3])
            if (name && Number.isFinite(s) && Number.isFinite(e)) out.push({ name, startMin: s, endMin: e })
          }
        } else if (item && typeof item === 'object') {
          const name = String(item?.name || '').trim() || String(item?.label || '').trim()
          const s = hhmmToMin(String(item?.start || item?.from || ''))
          const e = hhmmToMin(String(item?.end || item?.to || ''))
          if (name && Number.isFinite(s) && Number.isFinite(e)) out.push({ name, startMin: s, endMin: e })
        }
      }
      if (out.length) return out
    }

    return []
  } catch {
    return []
  }
}

function pickCurrentShiftName(): string {
  const wins = loadShiftWindows()
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  for (const w of wins) {
    const inWin =
      w.startMin <= w.endMin
        ? nowMin >= w.startMin && nowMin < w.endMin
        : nowMin >= w.startMin || nowMin < w.endMin
    if (inWin) return w.name
  }

  const labels = loadShiftLabels()
  if (labels.includes('All day')) return 'All day'
  if (labels.includes('Lunch') && nowMin < 16 * 60) return 'Lunch'
  if (labels.includes('Dinner')) return 'Dinner'
  return labels[0] || ''
}

function loadStaffOptions(): string[] {
  try {
    const raw = localStorage.getItem(SETTINGS_LS_KEY)
    if (!raw) return []
    const p = JSON.parse(raw)
    const arr = Array.isArray(p?.staff) ? p.staff : []
    const out: string[] = []
    for (const it of arr) {
      if (typeof it === 'string') {
        const s = it.trim()
        if (s) out.push(s)
      } else if (it && typeof it === 'object') {
        const s = String(it?.name || '').trim()
        if (s) out.push(s)
      }
    }
    return Array.from(new Set(out))
  } catch {
    return []
  }
}

/* Totals: deduplica pagamenti per id per sicurezza */
function computeTotalsForRow(row: DepositRow, allPayments: PaymentItem[]): Totals {
  const totalBase = Math.round(row.amount || 0)

  const seen = new Set<string>()
  let paid = 0

  for (const p of allPayments) {
    if (p.deposit_id !== row.id) continue
    const pid = p.id || ''
    if (!pid) continue
    if (seen.has(pid)) continue
    seen.add(pid)
    paid += Math.round(p.amount || 0)
  }

  if (totalBase > 0) {
    const remaining = Math.max(0, totalBase - paid)
    const status: TotalsStatus = remaining === 0 ? 'Paid' : 'Unpaid'
    return { paid, remaining, status }
  }
  return { paid, remaining: 0, status: 'Open' }
}

/* ---------- Hook main ---------- */

export function useDeposits(params?: { year?: number; month?: number; branchName?: string | null }) {
  const [rows, setRows] = useState<DepositRow[]>([])
  const [payments, setPayments] = useState<PaymentItem[]>([])
  const [totalsMap, setTotalsMap] = useState<Record<string, Totals>>({})
  const [loading, setLoading] = useState<boolean>(true)
  const [staffOpts, setStaffOpts] = useState<string[]>([])
  const [currentUserName, setCurrentUserName] = useState<string>('')
  const [currentShiftName, setCurrentShiftName] = useState<string>('')

  // Initial load: deposits + payments
  useEffect(() => {
    let cancelled = false
    async function loadAll() {
      setLoading(true)
      try {
        let qDep = supabase.from('deposits').select('*')

        if (params?.year != null && params?.month != null) {
          const start = new Date(params.year, params.month, 1)
          const end = new Date(params.year, params.month + 1, 1)
          const p = (n: number) => String(n).padStart(2, '0')
          const startISO = `${start.getFullYear()}-${p(start.getMonth() + 1)}-${p(start.getDate())}`
          const endISO = `${end.getFullYear()}-${p(end.getMonth() + 1)}-${p(end.getDate())}`
          qDep = qDep.gte('date', startISO).lt('date', endISO)
        }

        if (params?.branchName) {
          qDep = qDep.eq('branch', params.branchName)
        }

        const { data: depData, error: depErr } = await qDep

        if (!cancelled && !depErr && depData) {
          const mapped: DepositRow[] = depData.map((r: any) => ({
            id: String(r.id),
            branch: r.branch ?? null,
            date: r.date || new Date().toISOString().slice(0, 10),
            event_date: r.event_date ?? null,
            customer_id: r.customer_id ?? null,
            customer_name: r.customer_name ?? null,
            customer_phone: r.customer_phone ?? null,
            customer_email: r.customer_email ?? null,
            amount: Number(r.amount || 0),
            reference: r.reference ?? null,
            shift: r.shift ?? null,
            handledBy: r.handled_by ?? null,
            note: r.note ?? null,
          }))
          setRows(mapped)

          // Fetch payments only for these deposits
          const depIds = mapped.map(d => d.id)
          if (depIds.length > 0) {
            const { data: payData, error: payErr } = await supabase
              .from('deposit_payments')
              .select('*')
              .in('deposit_id', depIds)

            if (!cancelled && !payErr && payData) {
              const mappedPay: PaymentItem[] = payData.map((p: any) => ({
                id: String(p.id),
                deposit_id: String(p.deposit_id),
                amount: Number(p.amount || 0),
                date: p.date || new Date().toISOString(),
                note: p.note ?? null,
                endedBy: p.ended_by ?? null,
              }))
              setPayments(mappedPay)
            }
          } else {
            setPayments([])
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const staff = loadStaffOptions()
    setStaffOpts(staff)
    setCurrentShiftName(pickCurrentShiftName())

    void loadAll()
    return () => {
      cancelled = true
    }
  }, [])

  // Current user name from auth + app_accounts
  useEffect(() => {
    let cancelled = false
    async function fetchCurrentUserName() {
      try {
        const { data: authData } = await supabase.auth.getUser()
        const user = authData?.user
        if (!user) return

        const { data, error } = await supabase
          .from('app_accounts')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()

        if (cancelled) return

        const anyData = data as any
        const name =
          anyData?.short_name ||
          anyData?.full_name ||
          anyData?.name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email ||
          ''
        if (!cancelled && name) setCurrentUserName(name)
      } catch {
        // ignore
      }
    }
    void fetchCurrentUserName()
    return () => {
      cancelled = true
    }
  }, [])

  // Totals map recompute when rows or payments change
  useEffect(() => {
    const map: Record<string, Totals> = {}
    for (const row of rows) {
      map[row.id] = computeTotalsForRow(row, payments)
    }
    setTotalsMap(map)
  }, [rows, payments])

  /* ---------- Internal helpers to sync local state with DB ---------- */

  function applyRowsUpdate(
    next: DepositRow[] | ((prev: DepositRow[]) => DepositRow[]),
  ) {
    setRows(next as any)
  }

  function applyPaymentsUpdate(
    next: PaymentItem[] | ((prev: PaymentItem[]) => PaymentItem[]),
  ) {
    setPayments(next as any)
    try {
      const count =
        typeof next === 'function'
          ? (next as (prev: PaymentItem[]) => PaymentItem[])(payments).length
          : next.length
      window.dispatchEvent(
        new CustomEvent('deposits:payments:changed', {
          detail: { count },
        }),
      )
    } catch { }
  }

  /* ---------- Public API ---------- */

  async function upsertDeposit(input: DepositRow): Promise<DepositRow | null> {
    const isNew = !input.id
    const id = input.id || crypto.randomUUID()
    const payload = {
      id,
      branch: input.branch || '',
      date: input.date,
      event_date: input.event_date || null,
      customer_id: input.customer_id,
      customer_name: input.customer_name,
      customer_phone: input.customer_phone,
      customer_email: input.customer_email,
      amount: Math.round(Number(input.amount || 0)),
      reference: input.reference || null,
      shift: input.shift,
      handled_by: input.handledBy,
      note: input.note || null,
    }

    const { data, error } = await supabase
      .from('deposits')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .maybeSingle()

    if (error || !data) return null

    const row: DepositRow = {
      id: String(data.id),
      branch: data.branch ?? null,
      date: data.date || input.date,
      event_date: data.event_date ?? null,
      customer_id: data.customer_id ?? null,
      customer_name: data.customer_name ?? null,
      customer_phone: data.customer_phone ?? null,
      customer_email: data.customer_email ?? null,
      amount: Number(data.amount || 0),
      reference: data.reference ?? null,
      shift: data.shift ?? null,
      handledBy: data.handled_by ?? null,
      note: data.note ?? null,
    }

    applyRowsUpdate(prev => {
      const idx = prev.findIndex(r => r.id === row.id)
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = row
        return copy
      }
      return [...prev, row]
    })

    try {
      window.dispatchEvent(
        new CustomEvent('deposits:changed', { detail: { isNew, id: row.id } }),
      )
    } catch { }

    return row
  }

  async function deleteDeposit(id: string): Promise<boolean> {
    const { error } = await supabase.from('deposits').delete().eq('id', id)
    if (error) return false

    applyRowsUpdate(prev => prev.filter(r => r.id !== id))
    applyPaymentsUpdate(prev => prev.filter(p => p.deposit_id !== id))
    return true
  }

  async function bulkDeleteDeposits(ids: string[]): Promise<boolean> {
    if (!ids.length) return true
    const { error } = await supabase.from('deposits').delete().in('id', ids)
    if (error) return false

    const setIds = new Set(ids)
    applyRowsUpdate(prev => prev.filter(r => !setIds.has(r.id)))
    applyPaymentsUpdate(prev => prev.filter(p => !setIds.has(p.deposit_id)))
    return true
  }

  async function fetchPayments(depositId: string): Promise<PaymentItem[]> {
    // Usa lo stato locale che è già in sync con il DB
    return payments
      .filter(p => p.deposit_id === depositId)
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }

  async function addPayment(
    depositId: string,
    input: { amount: number; note?: string | null; date?: string },
  ): Promise<PaymentItem | null> {
    const payload = {
      deposit_id: depositId,
      amount: Math.round(Number(input.amount || 0)),
      date: input.date || new Date().toISOString(),
      note: input.note ?? null,
      ended_by: currentUserName || null,
    }

    const { data, error } = await supabase
      .from('deposit_payments')
      .insert(payload)
      .select()
      .maybeSingle()

    if (error || !data) return null

    const item: PaymentItem = {
      id: String(data.id),
      deposit_id: String(data.deposit_id),
      amount: Number(data.amount || 0),
      date: data.date || payload.date,
      note: data.note ?? null,
      endedBy: data.ended_by ?? null,
    }

    applyPaymentsUpdate(prev => [...prev, item])

    return item
  }

  async function updatePayment(
    depositId: string,
    paymentId: string,
    updates: Partial<Omit<PaymentItem, 'id' | 'deposit_id'>>,
  ): Promise<PaymentItem | null> {
    const payload: any = {}
    if (updates.amount !== undefined) {
      payload.amount = Math.round(Number(updates.amount || 0))
    }
    if (updates.date !== undefined) {
      payload.date = updates.date
    }
    if (updates.note !== undefined) {
      payload.note = updates.note
    }
    if (updates.endedBy !== undefined) {
      payload.ended_by = updates.endedBy
    }

    const { data, error } = await supabase
      .from('deposit_payments')
      .update(payload)
      .eq('id', paymentId)
      .eq('deposit_id', depositId)
      .select()
      .maybeSingle()

    if (error || !data) return null

    const updated: PaymentItem = {
      id: String(data.id),
      deposit_id: String(data.deposit_id),
      amount: Number(data.amount || 0),
      date: data.date,
      note: data.note ?? null,
      endedBy: data.ended_by ?? null,
    }

    applyPaymentsUpdate(prev =>
      prev.map(p => (p.id === updated.id ? updated : p)),
    )

    return updated
  }

  async function deletePayment(depositId: string, paymentId: string): Promise<boolean> {
    const { error } = await supabase
      .from('deposit_payments')
      .delete()
      .eq('id', paymentId)
      .eq('deposit_id', depositId)

    if (error) return false

    applyPaymentsUpdate(prev =>
      prev.filter(p => !(p.id === paymentId && p.deposit_id === depositId)),
    )
    return true
  }

  async function refreshTotalsFor(_id: string): Promise<void> {
    // I totals vengono già aggiornati dal useEffect su [rows, payments]
  }

  async function fetchTotalsOne(id: string): Promise<Totals | null> {
    const row = rows.find(r => r.id === id)
    if (!row) return null
    return computeTotalsForRow(row, payments)
  }

  return {
    rows,
    totalsMap,
    loading,
    staffOpts,
    currentUserName,
    currentShiftName,
    upsertDeposit,
    deleteDeposit,
    bulkDeleteDeposits,
    fetchPayments,
    addPayment,
    updatePayment,
    deletePayment,
    refreshTotalsFor,
    fetchTotalsOne,
  }
}