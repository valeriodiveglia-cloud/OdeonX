// app/daily-reports/deposits/page.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  PlusIcon,
  XMarkIcon,
  ArrowUpTrayIcon,
  MagnifyingGlassIcon,
  ArrowsUpDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  CheckCircleIcon,
  TrashIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BanknotesIcon,
  ClockIcon,
  PencilSquareIcon,
  CreditCardIcon,
  WalletIcon,
  BuildingLibraryIcon,
} from '@heroicons/react/24/outline'

import { supabase } from '@/lib/supabase_shim'
import { useDRBranch } from '../_data/useDRBranch'
import { useBridgeLegacyBranch as useBridgeLegacyBranchRaw } from '../_data/branchLegacyBridge'
import { useDeposits } from '../_data/useDeposits'
import { useSettings } from '@/contexts/SettingsContext'
import { drI18n } from '../_i18n'

/* ---------- Bridge branch legacy + LS fallback ---------- */

function useBridgeSafe() {
  try {
    const b: any = typeof useBridgeLegacyBranchRaw === 'function' ? useBridgeLegacyBranchRaw() : null
    if (b && typeof b.setName === 'function') return b
  } catch { }
  const [name, setNameState] = useState<string>(() => {
    try {
      return localStorage.getItem('DR_BRANCH_NAME') || ''
    } catch {
      return ''
    }
  })
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'DR_BRANCH_NAME') setNameState(e.newValue || '')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const setName = (v: string) => {
    try {
      if (v) localStorage.setItem('DR_BRANCH_NAME', v)
      else localStorage.removeItem('DR_BRANCH_NAME')
      localStorage.setItem('dr_branch_last_emit_at', String(Date.now()))
      setNameState(v || '')
      window.dispatchEvent(new CustomEvent('dr:branch:changed', { detail: { name: v || '' } }))
      window.dispatchEvent(
        new CustomEvent('dailyreports:branch:changed', { detail: { name: v || '' } }),
      )
      window.dispatchEvent(new CustomEvent('deposits:branch:changed', { detail: { name: v || '' } }))
    } catch { }
  }
  return { name, setName }
}

/* ---------- Date, number helpers ---------- */

function pad2(n: number) {
  return String(n).padStart(2, '0')
}
function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function nowLocalISODateTimeMinutes() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours(),
  )}:${pad2(d.getMinutes())}`
}
function toLocalDateTimeInput(isoLike: string) {
  const hasTime = /T\d{2}:\d{2}/.test(isoLike)
  const dateObj = hasTime ? new Date(isoLike) : new Date(`${isoLike}T00:00`)
  if (Number.isNaN(dateObj.getTime())) return nowLocalISODateTimeMinutes()
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(
    dateObj.getDate(),
  )}T${pad2(dateObj.getHours())}:${pad2(dateObj.getMinutes())}`
}
function fmtDateDMY(iso: string) {
  if (!iso) return ''
  const d = /T/.test(iso) ? new Date(iso) : new Date(`${iso}T00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
}
function fmtDateTimeDMYHM(iso: string) {
  if (!iso) return ''
  const d = /T/.test(iso) ? new Date(iso) : new Date(`${iso}T00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(
    d.getHours(),
  )}:${pad2(d.getMinutes())}`
}
function fmtInt(n: number) {
  try {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0))
  } catch {
    return String(Math.round(n || 0))
  }
}
function parseDigits(s: string) {
  const digits = String(s ?? '').replace(/[^\d]+/g, '')
  const n = Number(digits || 0)
  return Number.isFinite(n) ? n : 0
}
function monthName(m: number) {
  return [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ][m]
}
function aheadIsFutureGuard(y: number, m: number) {
  const now = new Date()
  const ny = now.getFullYear()
  const nm = now.getMonth()
  return y > ny || (y === ny && m >= nm)
}

/* ---------- UI primitives ---------- */

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow">{children}</div>
}
function PageHeader({
  title,
  left,
  after,
  right,
}: {
  title: string
  left?: React.ReactNode
  after?: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {left}
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {after}
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  )
}

// MODIFICA: aggiunto className opzionale e tolto h-full di default
function SectionCard({
  title,
  children,
  className,
}: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl border p-4 bg-white shadow-sm ${className || ''}`}>
      {title ? <div className="text-sm font-semibold text-gray-800 mb-3">{title}</div> : null}
      {children}
    </div>
  )
}

const inputBase =
  'mt-1 w-full h-11 rounded-lg border border-gray-400 bg-white text-gray-900 placeholder-gray-500 px-3 focus:outline-none focus:ring-2 focus:ring-blue-700/30 focus:border-blue-700 transition-colors'

function MoneyInput({
  value,
  onChange,
  className = '',
  disabled = false,
}: {
  value: number
  onChange: (v: number) => void
  className?: string
  disabled?: boolean
}) {
  const [raw, setRaw] = useState<string>(fmtInt(value))
  const lastRef = useRef<number>(value)
  useEffect(() => {
    if (value !== lastRef.current) {
      lastRef.current = value
      setRaw(fmtInt(value))
    }
  }, [value])
  return (
    <input
      type="text"
      inputMode="numeric"
      value={raw}
      disabled={disabled}
      onChange={e => {
        if (disabled) return
        const n = parseDigits(e.target.value)
        setRaw(fmtInt(n))
        onChange(n)
      }}
      onFocus={() => {
        if (disabled) return
        if (parseDigits(raw) === 0) setRaw('')
      }}
      onBlur={() => {
        if (disabled) return
        if (!raw || parseDigits(raw) === 0) {
          setRaw('0')
          onChange(0)
        }
      }}
      placeholder="0"
      className={`${inputBase} text-right tabular-nums ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''
        } ${className}`}
    />
  )
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-3xl h-full bg-white shadow-xl overflow-y-auto">{children}</div>
    </div>
  )
}

/* ---------- Types + local hook for deposits ---------- */

type DepositRow = {
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

// MODIFICA: aggiunto endedBy per copiare la logica da Credits
type PaymentItem = {
  id: string
  deposit_id: string
  amount: number
  date: string
  note: string | null
  endedBy?: string | null
}

type TotalsStatus = 'Paid' | 'Unpaid' | 'Open'
type Totals = { paid: number; remaining: number; status: TotalsStatus }

const LS_DEPOSITS_KEY = 'dailyreports.deposits.rows.v1'
const LS_DEPOSITS_PAYMENTS_KEY = 'dailyreports.deposits.payments.v1'
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

/* MODIFICA: deduplica payments per id per evitare duplicati sporchi */
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

function useDepositsLocal() {
  const [rows, setRows] = useState<DepositRow[]>([])
  const [payments, setPayments] = useState<PaymentItem[]>([])
  const [totalsMap, setTotalsMap] = useState<Record<string, Totals>>({})
  const [loading, setLoading] = useState<boolean>(true)
  const [staffOpts, setStaffOpts] = useState<string[]>([])
  const [currentUserName, setCurrentUserName] = useState<string>('')
  const [currentShiftName, setCurrentShiftName] = useState<string>('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_DEPOSITS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          setRows(
            parsed.map((r: any) => ({
              id: String(r.id || crypto.randomUUID()),
              branch: r.branch ?? null,
              date: r.date || todayISO(),
              event_date: r.event_date ?? null,
              customer_id: r.customer_id ?? null,
              customer_name: r.customer_name ?? null,
              customer_phone: r.customer_phone ?? null,
              customer_email: r.customer_email ?? null,
              amount: Number(r.amount || 0),
              reference: r.reference ?? null,
              shift: r.shift ?? null,
              handledBy: r.handledBy ?? null,
              note: r.note ?? null,
            })),
          )
        }
      }
    } catch { }

    try {
      const rawPay = localStorage.getItem(LS_DEPOSITS_PAYMENTS_KEY)
      if (rawPay) {
        const parsed = JSON.parse(rawPay)
        if (Array.isArray(parsed)) {
          setPayments(
            parsed.map((p: any) => ({
              id: String(p.id || crypto.randomUUID()),
              deposit_id: String(p.deposit_id || ''),
              amount: Number(p.amount || 0),
              date: p.date || new Date().toISOString(),
              note: p.note ?? null,
              endedBy: p.endedBy ?? null, // MODIFICA: preservo endedBy dal LS, se presente
            })),
          )
        }
      }
    } catch { }

    const staff = loadStaffOptions()
    setStaffOpts(staff)
    setCurrentShiftName(pickCurrentShiftName())
    setLoading(false)
  }, [])

  // MODIFICA: prende il nome utente da Supabase auth + app_accounts
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

        if (error || !data || cancelled) return

        const anyData = data as any
        const name =
          anyData.short_name ||
          anyData.full_name ||
          anyData.name ||
          user.user_metadata?.full_name ||
          user.email ||
          ''
        if (!cancelled && name) setCurrentUserName(name)
      } catch {
        // ignore
      }
    }
    fetchCurrentUserName()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const map: Record<string, Totals> = {}
    for (const row of rows) {
      map[row.id] = computeTotalsForRow(row, payments)
    }
    setTotalsMap(map)
  }, [rows, payments])

  function persistRows(next: DepositRow[]) {
    setRows(next)
    try {
      localStorage.setItem(LS_DEPOSITS_KEY, JSON.stringify(next))
      window.dispatchEvent(new CustomEvent('deposits:changed', { detail: { count: next.length } }))
    } catch { }
  }
  function persistPayments(next: PaymentItem[]) {
    setPayments(next)
    try {
      localStorage.setItem(LS_DEPOSITS_PAYMENTS_KEY, JSON.stringify(next))
      window.dispatchEvent(
        new CustomEvent('deposits:payments:changed', { detail: { count: next.length } }),
      )
    } catch { }
  }

  async function upsertDeposit(input: DepositRow): Promise<DepositRow | null> {
    const row: DepositRow = {
      ...input,
      id: input.id || crypto.randomUUID(),
      amount: Math.round(Number(input.amount || 0)),
      event_date: input.event_date ?? null,
    }
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === row.id)
      let next: DepositRow[]
      if (idx >= 0) {
        next = [...prev]
        next[idx] = row
      } else {
        next = [...prev, row]
      }
      try {
        localStorage.setItem(LS_DEPOSITS_KEY, JSON.stringify(next))
        window.dispatchEvent(new CustomEvent('deposits:changed', { detail: { count: next.length } }))
      } catch { }
      return next
    })
    return row
  }

  async function deleteDeposit(id: string): Promise<boolean> {
    let deleted = false
    let removedPayments = false
    setRows(prev => {
      const next = prev.filter(r => {
        if (r.id === id) {
          deleted = true
          return false
        }
        return true
      })
      if (deleted) {
        try {
          localStorage.setItem(LS_DEPOSITS_KEY, JSON.stringify(next))
          window.dispatchEvent(new CustomEvent('deposits:changed', { detail: { count: next.length } }))
        } catch { }
      }
      return next
    })
    setPayments(prev => {
      const next = prev.filter(p => {
        if (p.deposit_id === id) {
          removedPayments = true
          return false
        }
        return true
      })
      if (removedPayments) {
        try {
          localStorage.setItem(LS_DEPOSITS_PAYMENTS_KEY, JSON.stringify(next))
          window.dispatchEvent(
            new CustomEvent('deposits:payments:changed', { detail: { count: next.length } }),
          )
        } catch { }
      }
      return next
    })
    return deleted
  }

  async function bulkDeleteDeposits(ids: string[]): Promise<boolean> {
    if (!ids.length) return true
    const setIds = new Set(ids)
    let changedRows = false
    let changedPayments = false
    setRows(prev => {
      const next = prev.filter(r => {
        if (setIds.has(r.id)) {
          changedRows = true
          return false
        }
        return true
      })
      if (changedRows) {
        try {
          localStorage.setItem(LS_DEPOSITS_KEY, JSON.stringify(next))
          window.dispatchEvent(new CustomEvent('deposits:changed', { detail: { count: next.length } }))
        } catch { }
      }
      return next
    })
    setPayments(prev => {
      const next = prev.filter(p => {
        if (setIds.has(p.deposit_id)) {
          changedPayments = true
          return false
        }
        return true
      })
      if (changedPayments) {
        try {
          localStorage.setItem(LS_DEPOSITS_PAYMENTS_KEY, JSON.stringify(next))
          window.dispatchEvent(
            new CustomEvent('deposits:payments:changed', { detail: { count: next.length } }),
          )
        } catch { }
      }
      return next
    })
    return changedRows || changedPayments
  }

  /* MODIFICA: fetchPayments deduplica per id per evitare key duplicate in HistoryModal */
  async function fetchPayments(depositId: string): Promise<PaymentItem[]> {
    const seen = new Set<string>()
    const list: PaymentItem[] = []

    for (const p of payments) {
      if (p.deposit_id !== depositId) continue
      const pid = p.id || ''
      if (pid && seen.has(pid)) continue
      if (pid) seen.add(pid)
      list.push(p)
    }

    return list.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }

  // MODIFICA: qui setto endedBy = currentUserName dal DB app_accounts
  async function addPayment(
    depositId: string,
    input: { amount: number; note?: string | null; date?: string },
  ): Promise<PaymentItem | null> {
    const item: PaymentItem = {
      id: crypto.randomUUID(),
      deposit_id: depositId,
      amount: Math.round(Number(input.amount || 0)),
      date: input.date || new Date().toISOString(),
      note: input.note ?? null,
      endedBy: currentUserName || null,
    }
    setPayments(prev => {
      const next = [...prev, item]
      try {
        localStorage.setItem(LS_DEPOSITS_PAYMENTS_KEY, JSON.stringify(next))
        window.dispatchEvent(
          new CustomEvent('deposits:payments:changed', { detail: { count: next.length } }),
        )
      } catch { }
      return next
    })
    try {
      window.dispatchEvent(
        new CustomEvent('deposits:payments:changed', { detail: { depositId } }),
      )
    } catch { }
    return item
  }

  async function updatePayment(
    depositId: string,
    paymentId: string,
    updates: Partial<Omit<PaymentItem, 'id' | 'deposit_id'>>,
  ): Promise<PaymentItem | null> {
    let updated: PaymentItem | null = null
    setPayments(prev => {
      const next = prev.map(p => {
        if (p.id === paymentId && p.deposit_id === depositId) {
          updated = {
            ...p,
            ...updates,
            amount:
              updates.amount !== undefined
                ? Math.round(Number(updates.amount || 0))
                : p.amount,
          }
          return updated
        }
        return p
      })
      if (updated) {
        try {
          localStorage.setItem(LS_DEPOSITS_PAYMENTS_KEY, JSON.stringify(next))
          window.dispatchEvent(
            new CustomEvent('deposits:payments:changed', { detail: { count: next.length } }),
          )
        } catch { }
      }
      return next
    })
    if (updated) {
      try {
        window.dispatchEvent(
          new CustomEvent('deposits:payments:changed', { detail: { depositId } }),
        )
      } catch { }
    }
    return updated
  }

  async function deletePayment(depositId: string, paymentId: string): Promise<boolean> {
    let deleted = false
    setPayments(prev => {
      const next = prev.filter(p => {
        if (p.id === paymentId && p.deposit_id === depositId) {
          deleted = true
          return false
        }
        return true
      })
      if (deleted) {
        try {
          localStorage.setItem(LS_DEPOSITS_PAYMENTS_KEY, JSON.stringify(next))
          window.dispatchEvent(
            new CustomEvent('deposits:payments:changed', { detail: { count: next.length } }),
          )
        } catch { }
      }
      return next
    })
    if (deleted) {
      try {
        window.dispatchEvent(
          new CustomEvent('deposits:payments:changed', { detail: { depositId } }),
        )
      } catch { }
    }
    return deleted
  }

  async function refreshTotalsFor(_id: string): Promise<void> {
    // effect already recomputes
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

/* ---------- Payment helpers (method + status) ---------- */

type PaymentMethod = 'cash' | 'card' | 'bank' | 'other'

function methodLabel(m: PaymentMethod, otherText: string) {
  // Nota: qui manteniamo etichette canoniche in inglese per compatibilità con dati esistenti
  switch (m) {
    case 'cash':
      return 'Cash'
    case 'card':
      return 'Card'
    case 'bank':
      return 'Bank Transfer / e-Wallet'
    case 'other':
      return otherText.trim() ? otherText.trim() : 'Other'
  }
}

// Helper per ricostruire il metodo dal testo salvato nella nota (valori canonici in inglese)
function inferInitialMethod(
  note: string | null | undefined,
): { method: PaymentMethod; otherText: string } {
  const raw = (note || '').trim()
  if (!raw) return { method: 'cash', otherText: '' }
  if (raw === 'Cash') return { method: 'cash', otherText: '' }
  if (raw === 'Card') return { method: 'card', otherText: '' }
  if (raw === 'Bank Transfer / e-Wallet') return { method: 'bank', otherText: '' }
  return { method: 'other', otherText: raw }
}

// Converte la nota canonica in label tradotta, se è uno dei metodi standard
function formatMethodNote(note: string | null | undefined, tMethods: any): string {
  const raw = (note || '').trim()
  if (!raw) return ''
  if (raw === 'Cash') return tMethods.cash
  if (raw === 'Card') return tMethods.card
  if (raw === 'Bank Transfer / e-Wallet') return tMethods.bank
  return raw
}

function statusLabel(status: TotalsStatus, tStatus: any): string {
  switch (status) {
    case 'Paid':
      return tStatus.paid
    case 'Unpaid':
      return tStatus.unpaid
    default:
      return tStatus.open
  }
}

function MethodButton({
  active,
  onClick,
  children,
  title,
  icon: Icon,
}: {
  active: boolean
  onClick: () => void
  children: string
  title: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}) {
  let labelContent: React.ReactNode = children
  if (typeof children === 'string' && children !== 'CK / Ví' && children.includes(' / ')) {
    const bankMatch = children.match(/^Bank Transfer \/ (.+)$/i)
    if (bankMatch) {
      const rest = bankMatch[1]
      labelContent = (
        <>
          <span className="block leading-tight">{'Bank\u00a0Transfer'}</span>
          <span className="block leading-tight">{`/ ${rest}`}</span>
        </>
      )
    } else {
      labelContent = children.split(' / ').map((part, idx) => (
        <span key={idx} className="block leading-tight">
          {idx === 0 ? part : `/ ${part}`}
        </span>
      ))
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 min-h-[44px] rounded-xl border transition ${active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-blue-600/10 text-blue-900 border-blue-300 hover:bg-blue-600/20'
        }`}
      title={title}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span
        className="font-medium text-sm text-center leading-tight whitespace-normal break-words max-w-[12rem]"
        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {labelContent}
      </span>
    </button>
  )
}
/* ---------- Payment modals ---------- */

function PaymentEditModal({
  depositId,
  payment,
  onClose,
  onSaved,
  updatePayment,
  t,
}: {
  depositId: string
  payment: PaymentItem
  onClose: () => void
  onSaved: (p: PaymentItem) => void
  updatePayment: (
    depositId: string,
    paymentId: string,
    updates: Partial<Omit<PaymentItem, 'id' | 'deposit_id'>>,
  ) => Promise<PaymentItem | null>
  t: any
}) {
  const initialInput = useRef<string>(toLocalDateTimeInput(payment.date))
  const [date, setDate] = useState<string>(initialInput.current)
  const [amount, setAmount] = useState<number>(payment.amount)

  const initMethod = useRef(inferInitialMethod(payment.note || null))
  const [method, setMethod] = useState<PaymentMethod>(initMethod.current.method)
  const [otherText, setOtherText] = useState<string>(initMethod.current.otherText)

  const methodError =
    method === 'other' && !otherText.trim() ? t.validation.methodRequired : null
  const canSave = amount > 0 && !methodError

  async function handleSave() {
    if (!canSave) return
    const userChangedDate = date !== initialInput.current
    const iso = userChangedDate ? new Date(date).toISOString() : new Date().toISOString()
    const noteVal = methodLabel(method, otherText)
    const saved = await updatePayment(depositId, payment.id, { amount, date: iso, note: noteVal })
    if (saved) onSaved(saved)
  }

  return (
    <Overlay onClose={onClose}>
      <div className="h-full flex flex-col text-gray-900">
        <div className="px-4 md:px-6 pt-4 pb-3 flex items-center justify-between border-b">
          <div className="text-xl font-bold">{t.payment.editTitle}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>
        <div className="px-4 md:px-6 py-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-800">{t.payment.dateTime}</label>
              <input
                type="datetime-local"
                className={inputBase}
                value={date}
                onChange={e => setDate(e.target.value)}
              />
              <div className="text-xs text-gray-500 mt-1">
                {t.payment.dateHint}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-800">{t.payment.amount}</label>
              <MoneyInput value={amount} onChange={setAmount} className="h-11" />
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-800">{t.payment.method}</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <MethodButton
                active={method === 'cash'}
                onClick={() => setMethod('cash')}
                title={t.methods.cash}
                icon={BanknotesIcon}
              >
                {t.methods.cash}
              </MethodButton>
              <MethodButton
                active={method === 'card'}
                onClick={() => setMethod('card')}
                title={t.methods.card}
                icon={CreditCardIcon}
              >
                {t.methods.card}
              </MethodButton>
              <MethodButton
                active={method === 'bank'}
                onClick={() => setMethod('bank')}
                title={t.methods.bankShort ?? t.methods.bank}
                icon={BuildingLibraryIcon}
              >
                {t.methods.bankShort ?? t.methods.bank}
              </MethodButton>
              <MethodButton
                active={method === 'other'}
                onClick={() => setMethod('other')}
                title={t.methods.other}
                icon={WalletIcon}
              >
                {t.methods.other}
              </MethodButton>
            </div>
            {method === 'other' && (
              <div className="mt-3">
                <label className="text-sm text-gray-800">
                  {t.payment.methodSpecify}
                </label>
                <input
                  className={inputBase}
                  placeholder={t.payment.methodOtherPlaceholder}
                  value={otherText}
                  onChange={e => setOtherText(e.target.value)}
                />
              </div>
            )}
            {methodError && (
              <div className="mt-2 text-xs text-red-600">{methodError}</div>
            )}
          </div>
        </div>
        <div className="px-4 md:px-6 py-4 border-t flex items-center justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border hover:opacity-80">
            {t.common.cancel}
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="ml-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 disabled:opacity-50"
          >
            {t.common.saveChanges}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

function HistoryModal({
  deposit,
  onClose,
  fetchPayments,
  deletePayment,
  updatePayment,
  fetchTotalsOne,
  t,
}: {
  deposit: DepositRow
  onClose: () => void
  fetchPayments: (depositId: string) => Promise<PaymentItem[]>
  deletePayment: (depositId: string, paymentId: string) => Promise<boolean>
  updatePayment: (
    depositId: string,
    paymentId: string,
    updates: Partial<Omit<PaymentItem, 'id' | 'deposit_id'>>,
  ) => Promise<PaymentItem | null>
  fetchTotalsOne: (id: string) => Promise<Totals | null>
  t: any
}) {
  const [items, setItems] = useState<PaymentItem[]>([])
  const [summary, setSummary] = useState<{
    total: number
    paid: number
    left: number
    status: TotalsStatus
  }>({
    total: Math.round(deposit.amount || 0),
    paid: 0,
    left: Math.round(deposit.amount || 0),
    status: 'Open',
  })
  const [editing, setEditing] = useState<PaymentItem | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function refetch() {
    const list = await fetchPayments(deposit.id)
    setItems(list)
    const totals = await fetchTotalsOne(deposit.id)
    const paid = totals?.paid ?? list.reduce((s, p) => s + (p.amount || 0), 0)
    const left = totals?.remaining ?? Math.max(0, Math.round(deposit.amount || 0) - paid)
    const status = totals?.status ?? 'Open'
    setSummary({ total: Math.round(deposit.amount || 0), paid, left, status })
  }

  useEffect(() => {
    void refetch()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch()
    }
    document.addEventListener('visibilitychange', onVisible)
    const onPing = (ev: any) => {
      const did = ev?.detail?.depositId
      if (did === deposit.id) void refetch()
    }
    window.addEventListener('deposits:payments:changed', onPing as any)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('deposits:payments:changed', onPing as any)
    }
  }, [deposit.id, deposit.amount, fetchTotalsOne])

  const statusBadge = statusLabel(summary.status, t.status)

  return (
    <Overlay onClose={onClose}>
      <div className="h-full flex flex-col text-gray-900">
        <div className="px-4 md:px-6 pt-4 pb-3 flex items-center justify-between border-b">
          <div className="flex items-center gap-3">
            <div className="text-xl font-bold">{t.payment.historyTitle}</div>
            <span
              className={`text-xs px-2 py-1 rounded-full ${summary.status === 'Paid'
                  ? 'bg-green-100 text-green-700'
                  : summary.status === 'Unpaid'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-blue-100 text-blue-700'
                }`}
            >
              {statusBadge}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>

        <div className="px-4 md:px-6 py-4">
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">{t.payment.historyStatusAgreed}</div>
              <div className="text-lg font-semibold">{fmtInt(summary.total)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">{t.payment.historyStatusPaid}</div>
              <div className="text-lg font-semibold">{fmtInt(summary.paid)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">{t.payment.historyStatusRemaining}</div>
              <div className="text-lg font-semibold">{fmtInt(summary.left)}</div>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="text-sm text-gray-600">{t.payment.noPayments}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-600">
                    <th className="text-left p-2 w-[9rem]">{t.payment.dateTime}</th>
                    <th className="text-right p-2 w-[10rem]">{t.payment.amount}</th>
                    <th className="text-left p-2 w-[12rem]">{t.payment.methodNote}</th>
                    <th className="text-left p-2 w-[10rem]">
                      {t.payment.recordedBy}
                    </th>
                    <th className="text-center p-2 w-16">{t.common.edit}</th>
                    <th className="text-center p-2 w-16">{t.selectionMenu.delete}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(p => (
                    <tr key={p.id} className="border-t">
                      <td className="p-2 whitespace-nowrap">{fmtDateTimeDMYHM(p.date)}</td>
                      <td className="p-2 text-right tabular-nums">{fmtInt(p.amount)}</td>
                      <td className="p-2">
                        {formatMethodNote(p.note || null, t.methods) || '-'}
                      </td>
                      <td className="p-2 whitespace-nowrap">{p.endedBy || '-'}</td>
                      <td className="p-2 text-center">
                        <button
                          className="p-0 h-auto w-auto bg-transparent hover:opacity-80"
                          title={t.common.edit}
                          onClick={() => setEditing(p)}
                        >
                          <PencilSquareIcon className="w-5 h-5 text-blue-700" />
                        </button>
                      </td>
                      <td className="p-2 text-center">
                        <button
                          className="p-0 h-auto w-auto bg-transparent hover:opacity-80 disabled:opacity-50"
                          title={t.selectionMenu.delete}
                          disabled={deletingId === p.id}
                          onClick={async () => {
                            if (deletingId) return
                            const ok = window.confirm(t.payment.deleteConfirm)
                            if (!ok) return
                            setDeletingId(p.id)
                            try {
                              const deleted = await deletePayment(deposit.id, p.id)
                              if (deleted) {
                                setItems(prev => prev.filter(it => it.id !== p.id))
                                try {
                                  window.dispatchEvent(
                                    new CustomEvent('deposits:payments:changed', {
                                      detail: { depositId: deposit.id },
                                    }),
                                  )
                                } catch { }
                                await refetch()
                              } else {
                                alert(t.payment.deleteFailed)
                              }
                            } catch {
                              alert(t.payment.deleteUnexpected ?? t.payment.deleteFailed)
                            } finally {
                              setDeletingId(null)
                            }
                          }}
                        >
                          <TrashIcon
                            className={`w-5 h-5 ${deletingId === p.id ? 'text-gray-400' : 'text-red-600'
                              }`}
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {editing && (
          <PaymentEditModal
            depositId={deposit.id}
            payment={editing}
            onClose={() => setEditing(null)}
            onSaved={async _p => {
              setEditing(null)
              await refetch()
            }}
            updatePayment={updatePayment}
            t={t}
          />
        )}
      </div>
    </Overlay>
  )
}

function PaymentModal({
  deposit,
  remaining,
  onClose,
  onSaved,
  addPayment,
  t,
}: {
  deposit: DepositRow
  remaining: number
  onClose: () => void
  onSaved: (p: PaymentItem) => void
  addPayment: (
    depositId: string,
    input: { amount: number; note?: string | null; date?: string },
  ) => Promise<PaymentItem | null>
  t: any
}) {
  const [date, setDate] = useState<string>(nowLocalISODateTimeMinutes())
  const [amount, setAmount] = useState<number>(remaining > 0 ? remaining : 0)
  const [saving, setSaving] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [otherText, setOtherText] = useState<string>('')

  const amountError =
    !Number.isFinite(amount)
      ? t.validation.amountInvalid
      : amount <= 0
        ? t.validation.amountGtZero
        : remaining > 0 && amount > Math.max(remaining, 0)
          ? t.validation.amountExceedsRemaining
          : !date
            ? t.validation.dateRequired
            : null
  const methodError =
    method === 'other' && !otherText.trim() ? t.validation.methodRequired : null
  const hasError = Boolean(amountError || methodError)

  async function handleSave() {
    if (saving) return
    if (hasError) {
      alert(t.payment.confirmFixErrors)
      return
    }
    setSaving(true)
    try {
      const iso = new Date(date).toISOString()
      const noteVal = methodLabel(method, otherText)
      const item = await addPayment(deposit.id, { amount, note: noteVal, date: iso })
      if (item) onSaved(item)
      else alert(t.payment.addFailed)
    } catch {
      alert(t.payment.addUnexpected ?? t.payment.addFailed)
    } finally {
      setSaving(false)
    }
  }

  const agreed = Math.round(deposit.amount || 0)

  return (
    <Overlay onClose={onClose}>
      <div className="h-full flex flex-col text-gray-900">
        <div className="px-4 md:px-6 pt-4 pb-3 flex items-center justify-between border-b">
          <div className="text-xl font-bold">{t.payment.confirmTitle}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>

        <div className="px-4 md:px-6 py-4 space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">{t.payment.customer}</div>
              <div className="font-medium truncate">
                {deposit.customer_name || '-'}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">
                {t.payment.agreedAmount}
              </div>
              <div className="font-semibold">{fmtInt(agreed)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">{t.payment.remaining}</div>
              <div className="font-semibold">
                {agreed > 0 ? fmtInt(Math.max(remaining, 0)) : 'N/A'}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <SectionCard title={t.payment.detailsTitle ?? t.payment.detailsTitle}>
              <div className="grid gap-4">
                <div>
                  <label className="text-sm text-gray-800">
                    {t.payment.dateTime}
                  </label>
                  <input
                    type="datetime-local"
                    className={inputBase}
                    value={date}
                    onChange={e => setDate(e.target.value)}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-800">
                      {t.payment.amount}
                    </label>
                    {agreed > 0 && remaining > 0 && (
                      <button
                        type="button"
                        onClick={() => setAmount(remaining)}
                        className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                        title={t.payment.maxButtonTitle ?? 'Set to remaining'}
                      >
                        {t.payment.maxButton ?? 'Max'}
                      </button>
                    )}
                  </div>
                  <MoneyInput value={amount} onChange={setAmount} className="h-11" />
                  <div className="mt-1 flex items-center justify-between text-xs">
                    {agreed > 0 && (
                      <span className="text-gray-500">
                        {t.payment.maxHint
                          ? t.payment.maxHint.replace(
                            '{max}',
                            fmtInt(Math.max(remaining, 0)),
                          )
                          : `${t.payment.maxButton ?? 'Max'} ${fmtInt(
                            Math.max(remaining, 0),
                          )}`}
                      </span>
                    )}
                    {amountError && (
                      <span className="text-red-600">{amountError}</span>
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title={t.payment.method}>
              <div className="grid grid-cols-2 gap-2">
                <MethodButton
                  active={method === 'cash'}
                  onClick={() => setMethod('cash')}
                  title={t.methods.cash}
                  icon={BanknotesIcon}
                >
                  {t.methods.cash}
                </MethodButton>
                <MethodButton
                  active={method === 'card'}
                  onClick={() => setMethod('card')}
                  title={t.methods.card}
                  icon={CreditCardIcon}
                >
                  {t.methods.card}
                </MethodButton>
                <MethodButton
                  active={method === 'bank'}
                  onClick={() => setMethod('bank')}
                  title={t.methods.bank}
                  icon={BuildingLibraryIcon}
                >
                  {t.methods.bankShort ?? t.methods.bank}
                </MethodButton>
                <MethodButton
                  active={method === 'other'}
                  onClick={() => setMethod('other')}
                  title={t.methods.other}
                  icon={WalletIcon}
                >
                  {t.methods.other}
                </MethodButton>
              </div>
              {method === 'other' && (
                <div className="mt-3">
                  <label className="text-sm text-gray-800">
                    {t.payment.methodSpecify}
                  </label>
                  <input
                    className={inputBase}
                    placeholder={t.payment.methodOtherPlaceholder}
                    value={otherText}
                    onChange={e => setOtherText(e.target.value)}
                  />
                </div>
              )}
              {methodError && (
                <div className="mt-2 text-xs text-red-600">{methodError}</div>
              )}
            </SectionCard>
          </div>
        </div>

        <div className="px-4 md:px-6 py-4 border-t flex items-center justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border hover:opacity-80">
            {t.common.cancel}
          </button>
          <button
            onClick={handleSave}
            disabled={hasError || saving}
            className={`ml-2 px-4 py-2 rounded-lg text-white hover:opacity-80 ${hasError || saving ? 'bg-blue-400' : 'bg-blue-600'
              }`}
            title={
              hasError
                ? t.payment.saveDisabledTitle ?? 'Fix errors to save'
                : t.common.savePayment
            }
          >
            {saving ? t.common.saving : t.common.savePayment}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/* ---------- Editor Modal ---------- */

function EditorModal({
  mode,
  staffOpts,
  selectedBranchName,
  initial,
  onClose,
  onSaved,
  onDeleted,
  currentUserName,
  currentShiftName,
  fetchTotalsOne,
  fetchPayments,
  deletePayment,
  updatePayment,
  addPayment,
  t,
}: {
  mode: 'create' | 'view' | 'edit'
  staffOpts: string[]
  selectedBranchName: string
  initial: Partial<DepositRow>
  onClose: () => void
  onSaved: (row: DepositRow) => Promise<DepositRow | null> | DepositRow | null | void
  onDeleted: (id: string) => void
  currentUserName: string
  currentShiftName: string
  fetchTotalsOne: (id: string) => Promise<Totals | null>
  fetchPayments: (depositId: string) => Promise<PaymentItem[]>
  deletePayment: (depositId: string, paymentId: string) => Promise<boolean>
  updatePayment: (
    depositId: string,
    paymentId: string,
    updates: Partial<Omit<PaymentItem, 'id' | 'deposit_id'>>,
  ) => Promise<PaymentItem | null>
  addPayment: (
    depositId: string,
    input: { amount: number; note?: string | null; date?: string },
  ) => Promise<PaymentItem | null>
  t: any
}) {
  const [viewMode, setViewMode] = useState(mode === 'view')
  const [date, setDate] = useState(initial.date || todayISO())

  const [customerId] = useState<string>(initial.customer_id || '')
  const [customerName, setCustomerName] = useState<string>(
    initial.customer_name || '',
  )
  const [customerPhone, setCustomerPhone] = useState<string>(
    initial.customer_phone || '',
  )
  const [customerEmail, setCustomerEmail] = useState<string>(
    initial.customer_email || '',
  )

  const [amount, setAmount] = useState<number>(Number(initial.amount || 0))
  const [reference, setReference] = useState<string>(initial.reference || '')

  const defaultShift = useMemo(
    () => pickCurrentShiftName() || currentShiftName || '',
    [currentShiftName],
  )
  const [shift, setShift] = useState<string>(initial.shift || defaultShift)

  const [handledBy, setHandledBy] = useState<string>(
    initial.handledBy || currentUserName || staffOpts[0] || '',
  )
  const [note, setNote] = useState<string>(initial.note || '')

  const [remaining, setRemaining] = useState<number>(0)
  const [status, setStatus] = useState<TotalsStatus>('Open')
  const [showHistory, setShowHistory] = useState(false)

  const isNew = !initial.id
  const [firstPaymentAmount, setFirstPaymentAmount] = useState<number>(
    isNew ? 0 : 0,
  )
  const [firstMethod, setFirstMethod] = useState<PaymentMethod>('cash')
  const [firstOtherText, setFirstOtherText] = useState<string>('')

  useEffect(() => {
    ; (async () => {
      if (!initial.id) {
        const base = Math.round(amount || 0)
        setRemaining(base)
        setStatus(base > 0 ? 'Unpaid' : 'Open')
        return
      }
      const tts = await fetchTotalsOne(String(initial.id))
      const rem =
        tts?.remaining ?? Math.max(0, Math.round(amount || 0) - (tts?.paid ?? 0))
      const st =
        tts?.status ?? (amount > 0 ? (rem === 0 ? 'Paid' : 'Unpaid') : 'Open')
      setRemaining(rem)
      setStatus(st)
    })()
  }, [initial.id, amount, fetchTotalsOne])

  useEffect(() => {
    if (!initial.id && !initial.handledBy) setHandledBy(currentUserName || handledBy)
  }, [currentUserName, initial.id, initial.handledBy, handledBy])

  const branchOk = Boolean((selectedBranchName || '').trim())
  const canSave = branchOk && customerName.trim().length > 0 && amount >= 0

  async function handleSave() {
    if (!canSave || viewMode) {
      if (!branchOk) alert(t.editor.branchSelectError)
      return
    }
    const row: DepositRow = {
      id: initial.id || crypto.randomUUID(),
      branch: selectedBranchName.trim(),
      date,
      event_date: initial.event_date ?? null,
      customer_id: customerId || null,
      customer_name: customerName ? customerName.trim() : null,
      customer_phone: customerPhone ? customerPhone.trim() : null,
      customer_email: customerEmail ? customerEmail.trim() : null,
      amount: Math.round(amount),
      reference: reference || null,
      shift: (shift || defaultShift) || null,
      handledBy: handledBy || currentUserName || null,
      note: note ? note.trim() : null,
    }

    const savedRow = (await onSaved(row)) || row
    const depositIdForPayment = savedRow?.id || row.id

    if (isNew) {
      const payAmt = Math.round(firstPaymentAmount || 0)
      if (payAmt > 0) {
        const label = methodLabel(firstMethod, firstOtherText)
        try {
          await addPayment(depositIdForPayment, {
            amount: payAmt,
            note: label,
            date: new Date().toISOString(),
          })
        } catch { }
      }
    }
  }

  async function handleDelete() {
    if (viewMode || !initial.id) return
    if (!window.confirm(t.editor.deleteConfirm)) return
    onDeleted(initial.id)
  }

  const firstPayMethodError =
    isNew && firstPaymentAmount > 0 && firstMethod === 'other' && !firstOtherText.trim()
      ? t.validation.methodRequired
      : null

  const title = viewMode
    ? t.editor.viewTitle
    : initial.id
      ? t.editor.editTitle
      : t.editor.newTitle
  const statusPill = statusLabel(status, t.status)

  return (
    <>
      <Overlay onClose={onClose}>
        <div className="h-full flex flex-col text-gray-900">
          <div className="px-4 md:px-6 pt-4 pb-3 flex items-center justify-between border-b">
            <div className="flex items-center gap-3">
              <div className="text-xl font-bold">{title}</div>
              {initial.id && (
                <span
                  className={`text-xs px-2 py-1 rounded-full ${status === 'Paid'
                      ? 'bg-green-100 text-green-700'
                      : status === 'Unpaid'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                >
                  {statusPill}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {initial.id && (
                <button
                  onClick={() => setShowHistory(true)}
                  className="inline-flex items-center gap-2 px-3 h-9 rounded-lg border hover:bg-gray-50"
                  title={t.editor.historyButton}
                >
                  <ClockIcon className="w-5 h-5" /> {t.editor.historyButton}
                </button>
              )}
              <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
                <XMarkIcon className="w-7 h-7" />
              </button>
            </div>
          </div>

          <div className="px-4 md:px-6 py-4 flex-1 overflow-y-auto">
            <SectionCard>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <label className="text-sm text-gray-800">{t.editor.branch}</label>
                  <input
                    className={`${inputBase} ${branchOk ? 'bg-gray-50' : 'bg-red-50 border-red-400'
                      }`}
                    value={selectedBranchName || ''}
                    readOnly
                  />
                  {!branchOk && (
                    <div className="mt-1 text-xs text-red-600">
                      {t.editor.branchSelectError}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm text-gray-800">
                    {t.editor.depositDate}
                  </label>
                  <input
                    type="date"
                    className={inputBase}
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    disabled={viewMode}
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm text-gray-800">
                    {t.editor.customerName}
                  </label>
                  <input
                    className={inputBase}
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    disabled={viewMode}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-800">{t.editor.phone}</label>
                  <input
                    className={inputBase}
                    value={customerPhone || ''}
                    onChange={e => setCustomerPhone(e.target.value)}
                    disabled={viewMode}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-800">{t.editor.email}</label>
                  <input
                    className={inputBase}
                    value={customerEmail || ''}
                    onChange={e => setCustomerEmail(e.target.value)}
                    disabled={viewMode}
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm text-gray-800">
                    {t.editor.agreedAmount}
                  </label>
                  <MoneyInput
                    value={amount}
                    onChange={setAmount}
                    className="h-11"
                    disabled={viewMode}
                  />
                  <div className="mt-1 text-xs text-gray-500">
                    {t.editor.agreedHint}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-800">{t.editor.paid}</label>
                  <input
                    className={`${inputBase} bg-gray-50`}
                    value={fmtInt(Math.round(amount || 0) - remaining)}
                    readOnly
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-800">
                    {t.editor.remaining}
                  </label>
                  <input
                    className={`${inputBase} bg-gray-50`}
                    value={fmtInt(remaining)}
                    readOnly
                  />
                </div>
              </div>

              {isNew && !viewMode && (
                <div className="mt-6 grid gap-4 md:grid-cols-5">
                  <SectionCard title={t.payment.firstPaymentTitle} className="md:col-span-2">
                    <div className="grid gap-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-sm text-gray-800">
                            {t.payment.amountPaidNow}
                          </label>
                          {amount > 0 && (
                            <button
                              type="button"
                              onClick={() => setFirstPaymentAmount(amount)}
                              className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                              title={t.payment.maxButtonTitle ?? 'Set to agreed amount'}
                            >
                              {t.payment.maxButton ?? 'Max'}
                            </button>
                          )}
                        </div>
                        <MoneyInput
                          value={firstPaymentAmount}
                          onChange={setFirstPaymentAmount}
                          className="h-11"
                        />
                        <div className="mt-1 text-xs text-gray-500">
                          {t.payment.firstPaymentHint}
                        </div>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard title={t.payment.method} className="md:col-span-3">
                    <div className="grid grid-cols-2 gap-2">
                      <MethodButton
                        active={firstMethod === 'cash'}
                        onClick={() => setFirstMethod('cash')}
                        title={t.methods.cash}
                        icon={BanknotesIcon}
                      >
                        {t.methods.cash}
                      </MethodButton>
                      <MethodButton
                        active={firstMethod === 'card'}
                        onClick={() => setFirstMethod('card')}
                        title={t.methods.card}
                        icon={CreditCardIcon}
                      >
                        {t.methods.card}
                      </MethodButton>
                      <MethodButton
                        active={firstMethod === 'bank'}
                        onClick={() => setFirstMethod('bank')}
                        title={t.methods.bank}
                        icon={BuildingLibraryIcon}
                      >
                        {t.methods.bankShort ?? t.methods.bank}
                      </MethodButton>
                      <MethodButton
                        active={firstMethod === 'other'}
                        onClick={() => setFirstMethod('other')}
                        title={t.methods.other}
                        icon={WalletIcon}
                      >
                        {t.methods.other}
                      </MethodButton>
                    </div>
                    {firstMethod === 'other' && (
                      <div className="mt-3">
                        <label className="text-sm text-gray-800">
                          {t.payment.methodSpecify}
                        </label>
                        <input
                          className={inputBase}
                          placeholder={t.payment.methodOtherPlaceholder}
                          value={firstOtherText}
                          onChange={e => setFirstOtherText(e.target.value)}
                        />
                      </div>
                    )}
                    {firstPayMethodError && (
                      <div className="mt-2 text-xs text-red-600">{firstPayMethodError}</div>
                    )}
                  </SectionCard>
                </div>
              )}

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm text-gray-800">
                    {t.editor.reference}
                  </label>
                  <input
                    className={inputBase}
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    disabled={viewMode}
                    placeholder={t.editor.referencePlaceholder}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-800">{t.editor.shift}</label>
                  <input
                    className={inputBase}
                    value={shift}
                    onChange={e => setShift(e.target.value)}
                    disabled={viewMode}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-800">
                    {t.editor.handledBy}
                  </label>
                  <input
                    className={`${inputBase} bg-gray-50`}
                    value={handledBy || currentUserName || ''}
                    readOnly
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="text-sm text-gray-800">{t.editor.notes}</label>
                <textarea
                  className={`${inputBase} h-24`}
                  value={note || ''}
                  onChange={e => setNote(e.target.value)}
                  placeholder={t.editor.notesPlaceholder}
                  disabled={viewMode}
                />
              </div>
            </SectionCard>
          </div>

          <div className="px-4 md:px-6 py-4 border-t flex items-center justify-between">
            <div className="flex items-center gap-2">
              {viewMode ? (
                <button
                  onClick={() => setViewMode(false)}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80"
                >
                  {t.common.edit}
                </button>
              ) : (
                initial.id && (
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 rounded-lg border text-red-600 hover:bg-red-50"
                  >
                    {t.editor.deleteRecord}
                  </button>
                )
              )}
            </div>
            <div>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border hover:opacity-80"
              >
                {t.editor.close}
              </button>
              {!viewMode && (
                <button
                  onClick={handleSave}
                  disabled={!canSave || (!!firstPayMethodError && firstPaymentAmount > 0)}
                  className="ml-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 disabled:opacity-50"
                >
                  {t.editor.save}
                </button>
              )}
            </div>
          </div>
        </div>
      </Overlay>

      {showHistory && initial.id && (
        <HistoryModal
          deposit={{ ...(initial as DepositRow), amount }}
          onClose={() => setShowHistory(false)}
          fetchPayments={fetchPayments}
          deletePayment={deletePayment}
          updatePayment={updatePayment}
          fetchTotalsOne={fetchTotalsOne}
          t={t}
        />
      )}
    </>
  )
}
/* ---------- Page main ---------- */

type SortKeyBase = 'date' | 'customer_name' | 'amount' | 'reference' | 'shift' | 'handledBy' | 'status'
type SortKeyWithBranch = SortKeyBase | 'branch'
type SortState = { key: SortKeyWithBranch | null; dir: 'asc' | 'desc' }

type RowCalc = { row: DepositRow; remaining: number; status: TotalsStatus }

export default function DepositsPage() {
  const {
    rows: rowsState,
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
  } = useDeposits()

  const { language } = useSettings()
  const t = drI18n(language).deposits

  // safety: se per qualche motivo rows è undefined, usiamo sempre []
  const rows: DepositRow[] = Array.isArray(rowsState) ? rowsState : []

  const { branch } = useDRBranch({ validate: false })
  const officialName = branch?.name || ''

  const bridge = useBridgeSafe()
  const bridgeName = bridge?.name || ''
  const setBridgeName: (v: string) => void = bridge?.setName || (() => { })

  const activeBranch = bridgeName || officialName

  useEffect(() => {
    if (officialName && setBridgeName) setBridgeName(officialName)
  }, [officialName, setBridgeName])

  const [search, setSearch] = useState<string>('')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const selectedIds = useMemo(() => Object.keys(selected).filter(id => selected[id]), [selected])
  const headerCbRef = useRef<HTMLInputElement>(null)
  const [openEditor, setOpenEditor] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'view' | 'edit'>('create')
  const [initialRow, setInitialRow] = useState<Partial<DepositRow> | null>(null)
  const [sort, setSortState] = useState<SortState>({ key: null, dir: 'asc' })
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [payingRow, setPayingRow] = useState<DepositRow | null>(null)
  const [historyRow, setHistoryRow] = useState<DepositRow | null>(null)

  const now = new Date()
  const [year, setYear] = useState<number>(now.getFullYear())
  const [month, setMonth] = useState<number>(now.getMonth())
  const monthInputValue = useMemo(
    () => `${year}-${String(month + 1).padStart(2, '0')}`,
    [year, month],
  )
  const monthLabel = `${monthName(month)} ${year}`
  const monthStart = useMemo(() => new Date(year, month, 1), [year, month])
  const monthEnd = useMemo(() => new Date(year, month + 1, 1), [year, month])

  function prevMonth() {
    setMonth(m => {
      if (m === 0) {
        setYear(y => y - 1)
        return 11
      }
      return m - 1
    })
  }
  function nextMonth() {
    setMonth(m => {
      if (m === 11) {
        setYear(y => y + 1)
        return 0
      }
      return m + 1
    })
  }
  function onPickMonth(val: string) {
    const [y, m] = val.split('-').map(Number)
    if (Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12) {
      setYear(y)
      setMonth(m - 1)
    }
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const rowsWithCalc: RowCalc[] = useMemo(() => {
    return rows.map(r => {
      const totals = totalsMap[r.id] || {
        paid: 0,
        remaining: Math.round(r.amount || 0),
        status: (r.amount || 0) > 0 ? 'Unpaid' : 'Open',
      }
      return { row: r, remaining: totals.remaining, status: totals.status }
    })
  }, [rows, totalsMap])

  const monthFiltered = useMemo(() => {
    return rowsWithCalc.filter(x => {
      const dstr = x.row.date || ''
      const d = /T/.test(dstr) ? new Date(dstr) : new Date(`${dstr}T00:00`)
      return d >= monthStart && d < monthEnd
    })
  }, [rowsWithCalc, monthStart, monthEnd])

  const visibleRows = useMemo(() => {
    const branchName = (activeBranch || '').trim()
    const base = branchName
      ? monthFiltered.filter(x => (x.row.branch || '') === branchName)
      : monthFiltered
    const q = search.trim().toLowerCase()
    if (!q) return base
    return base.filter(x => {
      const r = x.row
      const dmy = fmtDateDMY(r.date).toLowerCase()
      const iso = String(r.date || '').toLowerCase()
      const amt = String(Math.round(r.amount || 0))
      const cust = (r.customer_name || '').toLowerCase()
      const ref = (r.reference || '').toLowerCase()
      const shift = (r.shift || '').toLowerCase()
      const by = (r.handledBy || '').toLowerCase()
      const br = (r.branch || '').toLowerCase()
      const note = (r.note || '').toLowerCase()
      const stat = x.status.toLowerCase()
      return (
        cust.includes(q) ||
        ref.includes(q) ||
        shift.includes(q) ||
        by.includes(q) ||
        dmy.includes(q) ||
        iso.includes(q) ||
        amt.includes(q) ||
        br.includes(q) ||
        note.includes(q) ||
        stat.includes(q)
      )
    })
  }, [monthFiltered, search, activeBranch])

  function toggleSort(key: SortKeyWithBranch) {
    setSortState(prev =>
      prev.key !== key ? { key, dir: 'asc' } : { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' },
    )
  }

  const sortedRows = useMemo(() => {
    if (!sort.key) return visibleRows
    const dir = sort.dir === 'asc' ? 1 : -1
    function cmp(a: RowCalc, b: RowCalc): number {
      const ra = a.row
      const rb = b.row
      switch (sort.key) {
        case 'amount':
          return ((ra.amount || 0) - (rb.amount || 0)) * dir
        case 'date':
          return (
            new Date(ra.date).getTime() - new Date(rb.date).getTime()
          ) * dir
        case 'customer_name':
          return (
            (ra.customer_name || '')
              .toLowerCase()
              .localeCompare((rb.customer_name || '').toLowerCase()) * dir
          )
        case 'reference':
          return (
            (ra.reference || '')
              .toLowerCase()
              .localeCompare((rb.reference || '').toLowerCase()) * dir
          )
        case 'shift':
          return (
            (ra.shift || '')
              .toLowerCase()
              .localeCompare((rb.shift || '').toLowerCase()) * dir
          )
        case 'handledBy':
          return (
            (ra.handledBy || '')
              .toLowerCase()
              .localeCompare((rb.handledBy || '').toLowerCase()) * dir
          )
        case 'branch':
          return (
            (ra.branch || '')
              .toLowerCase()
              .localeCompare((rb.branch || '').toLowerCase()) * dir
          )
        case 'status':
          return a.status.localeCompare(b.status) * dir
      }
      return 0
    }
    return [...visibleRows].sort(cmp)
  }, [visibleRows, sort])

  async function bulkDelete() {
    const ids = selectedIds
    if (ids.length === 0) return
    const msgTemplate = t.selectionMenu.bulkDeleteConfirm ?? 'Delete {count} selected record(s)?'
    const ok = window.confirm(
      msgTemplate.replace('{count}', String(ids.length)),
    )
    if (!ok) return
    const done = await bulkDeleteDeposits(ids)
    if (!done) return
    setSelected({})
  }

  const allSelected = rows.length > 0 && rows.every(r => !!selected[r.id])
  const someSelected = rows.some(r => !!selected[r.id]) && !allSelected
  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = someSelected
  }, [someSelected, allSelected, rows.length])

  const [showLoading, setShowLoading] = useState(false)
  useEffect(() => {
    let tmo: any
    if (loading) tmo = setTimeout(() => setShowLoading(true), 200)
    else setShowLoading(false)
    return () => {
      if (tmo) clearTimeout(tmo)
    }
  }, [loading])

  return (
    <div className="max-w-none mx-auto p-4 text-gray-100">
      <PageHeader
        title={t.pageTitle}
        left={
          <>
            {selectMode && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(v => !v)}
                  aria-label={t.selectionMenu.moreActionsAria}
                  className="p-0 h-auto w-auto bg-transparent border-0 outline-none text-blue-200 hover:text-white focus:outline-none"
                  title={t.selectionMenu.moreActionsTitle}
                >
                  <EllipsisVerticalIcon className="h-6 w-6" />
                </button>
                {menuOpen && (
                  <div className="absolute z-10 mt-2 min-w-[12rem] rounded-xl border bg-white text-gray-800 shadow-lg py-1">
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 hover:bg-blue-200 hover:text-red-700 disabled:opacity-50"
                      onClick={() => {
                        setMenuOpen(false)
                        if (selectedIds.length) bulkDelete()
                      }}
                      disabled={selectedIds.length === 0}
                    >
                      <TrashIcon className="h-4 w-4" />
                      <span>{t.selectionMenu.delete}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        }
        after={
          <div
            className="ml-2 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-600/15 px-3 py-1 text-xs text-blue-100"
            title={t.branchChip.title}
          >
            <span className="h-2 w-2 rounded-full bg-green-400" />
            <span className="font-medium">
              {activeBranch ? activeBranch : t.branchChip.all}
            </span>
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-2.5 h-5 w-5 text-blue-200" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t.search.placeholder}
                className="pl-9 pr-8 h-9 rounded-lg border border-blue-400/30 bg-blue-600/15 text-blue-50 placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-2 h-5 w-5 text-blue-200 hover:text-white"
                  aria-label={t.search.clearAria}
                  title={t.search.clearTitle}
                >
                  ×
                </button>
              )}
            </div>

            <button
              onClick={() => void handleExport(sortedRows, totalsMap, t)}
              className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border border-blue-400/30"
              title={t.export.title}
            >
              <ArrowUpTrayIcon className="w-5 h-5" /> {t.export.button}
            </button>

            <button
              onClick={() => {
                setSelectMode(s => !s)
                setMenuOpen(false)
              }}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border ${selectMode
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border-blue-400/30'
                }`}
              title={selectMode ? t.selectionMenu.exitTitle : t.selectionMenu.enterTitle}
            >
              <CheckCircleIcon className="w-5 h-5" />
              {selectMode ? t.selectionMenu.activeLabel : t.selectionMenu.inactiveLabel}
            </button>

            <button
              onClick={() => {
                setEditorMode('create')
                setInitialRow({
                  date: todayISO(),
                  event_date: '',
                  handledBy: currentUserName,
                  shift: pickCurrentShiftName() || currentShiftName || null,
                } as Partial<DepositRow>)
                setOpenEditor(true)
              }}
              className="inline-flex items-center justify-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-80"
            >
              <PlusIcon className="w-5 h-5" /> {t.common.newDeposit}
            </button>
          </div>
        }
      />

      <div className="mt-3 border-t border-white/15" />

      <MonthNav
        monthLabel={monthLabel}
        monthInputValue={monthInputValue}
        onPickMonth={onPickMonth}
        prevMonth={prevMonth}
        nextMonth={nextMonth}
        guardDisabled={aheadIsFutureGuard(year, month)}
        t={t}
      />

      <Card>
        <div className="p-3 overflow-x-auto">
          {showLoading && rows.length === 0 && (
            <div className="text-sm text-gray-500 py-2">{t.table.loading}</div>
          )}
          <DepositsTable
            rows={rows}
            sortedRows={sortedRows}
            totalsMap={totalsMap}
            sort={sort}
            setSort={toggleSort}
            selected={selected}
            setSelected={setSelected}
            headerCbRef={headerCbRef}
            setEditorMode={setEditorMode}
            setInitialRow={r => setInitialRow(r)}
            setOpenEditor={setOpenEditor}
            selectMode={selectMode}
            setPayingRow={setPayingRow}
            setHistoryRow={setHistoryRow}
            t={t}
          />
        </div>
      </Card>

      {openEditor && initialRow && (
        <EditorModal
          mode={editorMode}
          initial={initialRow}
          staffOpts={staffOpts}
          selectedBranchName={activeBranch}
          onClose={() => setOpenEditor(false)}
          onSaved={async row => {
            const saved = await upsertDeposit(row)
            if (!saved) {
              alert(t.editor.saveFailed)
              return null
            }
            setOpenEditor(false)
            return saved
          }}
          onDeleted={async id => {
            const ok = await deleteDeposit(id)
            if (!ok) return
            setOpenEditor(false)
          }}
          currentUserName={currentUserName}
          currentShiftName={currentShiftName}
          fetchTotalsOne={fetchTotalsOne}
          fetchPayments={fetchPayments}
          deletePayment={deletePayment}
          updatePayment={updatePayment}
          addPayment={addPayment}
          t={t}
        />
      )}

      {payingRow && (
        <PaymentModal
          deposit={payingRow}
          remaining={
            totalsMap[payingRow.id]?.remaining ??
            Math.max(0, Math.round(payingRow.amount || 0))
          }
          onClose={() => setPayingRow(null)}
          onSaved={async () => {
            await refreshTotalsFor(payingRow.id)
            setPayingRow(null)
          }}
          addPayment={addPayment}
          t={t}
        />
      )}

      {historyRow && (
        <HistoryModal
          deposit={historyRow}
          onClose={() => setHistoryRow(null)}
          fetchPayments={fetchPayments}
          deletePayment={deletePayment}
          updatePayment={updatePayment}
          fetchTotalsOne={fetchTotalsOne}
          t={t}
        />
      )}
    </div>
  )
}

/* ---------- Month nav ---------- */

function MonthNav({
  monthLabel,
  monthInputValue,
  onPickMonth,
  prevMonth,
  nextMonth,
  guardDisabled,
  t,
}: {
  monthLabel: string
  monthInputValue: string
  onPickMonth: (v: string) => void
  prevMonth: () => void
  nextMonth: () => void
  guardDisabled: boolean
  t: any
}) {
  const baseBtn = 'flex items-center gap-1 text-blue-100 hover:text-white transition'

  return (
    <div className="mt-3 mb-4 flex items-center justify-between text-sm text-blue-100">
      <button
        type="button"
        onClick={prevMonth}
        className={baseBtn}
        title={t.monthNav.prevTitle}
      >
        <ChevronLeftIcon className="w-4 h-4" />
        <span>{t.monthNav.previous}</span>
      </button>

      <div className="flex items-center gap-2 text-white">
        <span className="text-base font-semibold">{monthLabel}</span>
        <div className="relative w-6 h-6">
          <CalendarDaysIcon className="w-6 h-6 text-blue-200" />
          <input
            type="month"
            value={monthInputValue}
            onChange={e => onPickMonth(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label={t.monthNav.pickAria}
            title={t.monthNav.pickTitle}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={guardDisabled ? undefined : nextMonth}
        disabled={guardDisabled}
        aria-disabled={guardDisabled}
        className={`${baseBtn} ${guardDisabled ? 'cursor-default' : ''}`}
        title={t.monthNav.nextTitle}
      >
        <span>{t.monthNav.next}</span>
        <ChevronRightIcon className="w-4 h-4" />
      </button>
    </div>
  )
}

/* ---------- Table ---------- */

function DepositsTable({
  rows,
  sortedRows,
  totalsMap,
  sort,
  setSort,
  selected,
  setSelected,
  headerCbRef,
  setEditorMode,
  setInitialRow,
  setOpenEditor,
  selectMode,
  setPayingRow,
  setHistoryRow,
  t,
}: {
  rows: DepositRow[]
  sortedRows: RowCalc[]
  totalsMap: Record<string, Totals>
  sort: { key: SortKeyWithBranch | null; dir: 'asc' | 'desc' }
  setSort: (key: SortKeyWithBranch) => void
  selected: Record<string, boolean>
  setSelected: (s: any) => void
  headerCbRef: React.RefObject<HTMLInputElement | null>
  setEditorMode: (m: 'view' | 'edit' | 'create') => void
  setInitialRow: (r: DepositRow) => void
  setOpenEditor: (b: boolean) => void
  selectMode: boolean
  setPayingRow: (r: DepositRow) => void
  setHistoryRow: (r: DepositRow) => void
  t: any
}) {
  useEffect(() => {
    if (headerCbRef.current)
      headerCbRef.current.indeterminate =
        rows.some(r => !!selected[r.id]) && !rows.every(r => !!selected[r.id])
  }, [selected, rows, headerCbRef])

  const SortableHeader = ({
    label,
    colKey,
    className,
  }: {
    label: string
    colKey: SortKeyWithBranch
    className?: string
  }) => {
    const active = sort.key === colKey
    const dir = sort.dir
    return (
      <th className={`p-2 ${className || ''}`}>
        <button
          type="button"
          onClick={() => setSort(colKey)}
          className="inline-flex items-center gap-1 font-semibold text-left hover:opacity-80"
          title={t.table.sortBy.replace('{label}', label)}
        >
          <span>{label}</span>
          {!active && <ArrowsUpDownIcon className="w-4 h-4 text-gray-400" />}
          {active && dir === 'asc' && <ChevronUpIcon className="w-4 h-4 text-gray-700" />}
          {active && dir === 'desc' && <ChevronDownIcon className="w-4 h-4 text-gray-700" />}
        </button>
      </th>
    )
  }

  const totalAmount = useMemo(
    () => sortedRows.reduce((s, x) => s + Math.round(x.row.amount || 0), 0),
    [sortedRows],
  )
  const totalPaid = useMemo(
    () =>
      sortedRows.reduce(
        (s, x) => s + Math.round((totalsMap[x.row.id]?.paid ?? 0) || 0),
        0,
      ),
    [sortedRows, totalsMap],
  )

  return (
    <table className="w-full table-auto text-sm text-gray-900">
      <thead>
        <tr>
          <th className="p-2 w-7">
            {selectMode ? (
              <input
                ref={headerCbRef}
                type="checkbox"
                checked={rows.length > 0 && rows.every(r => !!selected[r.id])}
                onChange={() => {
                  if (rows.length === 0) return
                  const all = rows.every(r => !!selected[r.id])
                  if (all) setSelected({})
                  else {
                    const next: Record<string, boolean> = {}
                    rows.forEach(r => {
                      next[r.id] = true
                    })
                    setSelected(next)
                  }
                }}
                className="h-4 w-4"
                title={t.selectionMenu.selectAllTitle}
              />
            ) : null}
          </th>
          <SortableHeader
            label={t.columns.date}
            colKey="date"
            className="w-[8.5rem] text-left"
          />
          <SortableHeader
            label={t.columns.customer}
            colKey="customer_name"
            className="w-[22rem] text-left"
          />
          <SortableHeader
            label={t.columns.agreed}
            colKey="amount"
            className="w-[8rem] text-right"
          />
          <th className="p-2 w-[8rem] text-right font-semibold">
            {t.columns.paid}
          </th>
          <th className="p-2 w-[8rem] text-right font-semibold">
            {t.columns.remaining}
          </th>
          <SortableHeader
            label={t.columns.status}
            colKey="status"
            className="w-[8rem] text-left"
          />
          <SortableHeader
            label={t.columns.reference}
            colKey="reference"
            className="w-[12rem] text-left"
          />
          <SortableHeader
            label={t.columns.branch}
            colKey="branch"
            className="w-[10rem] text-left"
          />
          <SortableHeader
            label={t.columns.shift}
            colKey="shift"
            className="w-[9rem] text-left"
          />
          <SortableHeader
            label={t.columns.handledBy}
            colKey="handledBy"
            className="w-[11rem] text-left"
          />
          <th className="p-2 w-12 text-center">{t.columns.action}</th>
        </tr>
      </thead>
      <tbody>
        {sortedRows.map(x => {
          const r = x.row
          const totals = totalsMap[r.id] || {
            paid: 0,
            remaining: Math.round(r.amount || 0),
            status: (r.amount || 0) > 0 ? 'Unpaid' : 'Open',
          }
          const isPaid = totals.status === 'Paid'
          const statusText = statusLabel(totals.status, t.status)

          return (
            <tr
              key={r.id}
              className="border-t hover:bg-blue-50/40 cursor-pointer"
              onClick={() => {
                setEditorMode('view')
                setInitialRow(r)
                setOpenEditor(true)
              }}
              onDoubleClick={() => {
                setEditorMode('edit')
                setInitialRow(r)
                setOpenEditor(true)
              }}
              role="button"
            >
              <td
                className="p-2 w-7"
                onClick={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
              >
                {selectMode ? (
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={!!selected[r.id]}
                    onChange={e =>
                      setSelected((prev: any) => ({
                        ...prev,
                        [r.id]: e.target.checked,
                      }))
                    }
                    title={t.selectionMenu.selectRowTitle}
                  />
                ) : null}
              </td>
              <td className="p-2 whitespace-nowrap">{fmtDateDMY(r.date)}</td>
              <td className="p-2 whitespace-nowrap">{r.customer_name || '-'}</td>
              <td className="p-2 text-right tabular-nums">{fmtInt(r.amount)}</td>
              <td className="p-2 text-right tabular-nums">
                {fmtInt(totals.paid || 0)}
              </td>
              <td className="p-2 text-right tabular-nums">
                {fmtInt(totals.remaining || 0)}
              </td>
              <td className="p-2 whitespace-nowrap">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${totals.status === 'Paid'
                      ? 'bg-green-100 text-green-700'
                      : totals.status === 'Unpaid'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                >
                  {statusText}
                </span>
              </td>
              <td className="p-2 whitespace-nowrap">{r.reference || '-'}</td>
              <td className="p-2 whitespace-nowrap">{r.branch || '-'}</td>
              <td className="p-2 whitespace-nowrap">{r.shift || '-'}</td>
              <td className="p-2 whitespace-nowrap">{r.handledBy || '-'}</td>
              <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                <button
                  className={`p-0 h-auto w-auto bg-transparent ${isPaid ? 'opacity-60 hover:opacity-80' : 'hover:opacity-80'
                    }`}
                  title={
                    isPaid
                      ? t.table.viewPaymentHistory
                      : t.table.recordPayment
                  }
                  onClick={() => {
                    if (isPaid) {
                      setHistoryRow(r)
                    } else {
                      setPayingRow(r)
                    }
                  }}
                >
                  <BanknotesIcon
                    className={`w-6 h-6 ${isPaid ? 'text-gray-500' : 'text-blue-700'}`}
                  />
                </button>
              </td>
            </tr>
          )
        })}
        {sortedRows.length === 0 && (
          <tr>
            <td colSpan={12} className="text-center text-sm text-gray-500 py-6">
              {t.table.noRows}
            </td>
          </tr>
        )}
      </tbody>

      {sortedRows.length > 0 && (
        <tfoot>
          <tr className="border-t bg-blue-50/30">
            <td className="p-2 w-7" />
            <td className="p-2" />
            <td className="p-2 text-right font-semibold">{t.table.totals}</td>
            <td className="p-2 text-right font-semibold tabular-nums">
              {fmtInt(totalAmount)}
            </td>
            <td className="p-2 text-right font-semibold tabular-nums">
              {fmtInt(totalPaid)}
            </td>
            <td className="p-2" colSpan={7} />
          </tr>
        </tfoot>
      )}
    </table>
  )
}

/* ---------- Export helper ---------- */

async function handleExport(
  sortedRows: RowCalc[],
  totalsMap: Record<string, Totals>,
  t: any,
) {
  if (!sortedRows.length) {
    alert(t.export.nothingToExport)
    return
  }
  const XLSX = await import('xlsx')
  const data = sortedRows.map(x => {
    const r = x.row
    const totals = totalsMap[r.id] || {
      paid: 0,
      remaining: Math.round(r.amount || 0),
      status: (r.amount || 0) > 0 ? 'Unpaid' : 'Open',
    }
    const statusText = statusLabel(totals.status, t.status)
    return {
      [t.export.colDate ?? 'Date']: fmtDateDMY(r.date),
      [t.export.colCustomer ?? 'Customer']: r.customer_name || '',
      [t.export.colAgreedAmount ?? 'Agreed amount']: Math.round(r.amount || 0),
      [t.export.colPaid ?? 'Paid']: Math.round(totals.paid || 0),
      [t.export.colRemaining ?? 'Remaining']: Math.round(totals.remaining || 0),
      [t.export.colStatus ?? 'Status']: statusText,
      [t.export.colReference ?? 'Reference']: r.reference || '',
      [t.export.colBranch ?? 'Branch']: r.branch || '',
      [t.export.colShift ?? 'Shift']: r.shift || '',
      [t.export.colHandledBy ?? 'HandledBy']: r.handledBy || '',
      [t.export.colNotes ?? 'Notes']: r.note || '',
    }
  })
  const totalAmount = sortedRows.reduce(
    (s, x) => s + Math.round(x.row.amount || 0),
    0,
  )
  const totalPaid = sortedRows.reduce(
    (s, x) => s + Math.round(totalsMap[x.row.id]?.paid || 0),
    0,
  )

  data.push({
    [t.export.colDate ?? 'Date']: '',
    [t.export.colCustomer ?? 'Customer']:
      t.export.totalsRowLabel ?? 'TOTALS',
    [t.export.colAgreedAmount ?? 'Agreed amount']: totalAmount,
    [t.export.colPaid ?? 'Paid']: totalPaid,
    [t.export.colRemaining ?? 'Remaining']: '',
    [t.export.colStatus ?? 'Status']: '',
    [t.export.colReference ?? 'Reference']: '',
    [t.export.colBranch ?? 'Branch']: '',
    [t.export.colShift ?? 'Shift']: '',
    [t.export.colHandledBy ?? 'HandledBy']: '',
    [t.export.colNotes ?? 'Notes']: '',
  } as any)

  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [
    { wch: 12 },
    { wch: 24 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
    { wch: 16 },
    { wch: 32 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    ws,
    t.export.sheetName ?? 'Deposits',
  )
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const prefix = t.export.fileNamePrefix ?? 'deposits_'
  a.download = `${prefix}${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
