// app/daily-reports/credits/page.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  PlusIcon,
  XMarkIcon,
  CheckCircleIcon,
  ArrowUpTrayIcon,
  MagnifyingGlassIcon,
  BarsArrowUpIcon,
  BarsArrowDownIcon,
  FunnelIcon,
  EllipsisVerticalIcon,
  BanknotesIcon,
  ClockIcon,
  PencilSquareIcon,
  TrashIcon,
  UserIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CreditCardIcon,
  WalletIcon,
  BuildingLibraryIcon,
  EllipsisHorizontalIcon,
} from '@heroicons/react/24/outline'
import CircularLoader from '@/components/CircularLoader'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/Button'
import {
  TableContainer,
  Table,
  TableHead,
  TableHeadRow,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/Table'

import {
  useCredits,
  type CreditRow,
  type PaymentItem,
  type Totals,
  todayISO,
} from '../_data/useCredits'
import { supabase } from '@/lib/supabase_shim'
import { useDRBranch } from '../_data/useDRBranch'
import { useBridgeLegacyBranch as useBridgeLegacyBranchRaw } from '../_data/branchLegacyBridge'
import { useSettings } from '@/contexts/SettingsContext'
import { getDailyReportsDictionary } from '../_i18n'
import MonthPicker from '@/components/MonthPicker'

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
      window.dispatchEvent(new CustomEvent('dailyreports:branch:changed', { detail: { name: v || '' } }))
      window.dispatchEvent(new CustomEvent('credits:branch:changed', { detail: { name: v || '' } }))
    } catch { }
  }
  return { name, setName }
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}
function nowLocalISODateTimeMinutes() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
function toLocalDateTimeInput(isoLike: string) {
  const hasTime = /T\d{2}:\d{2}/.test(isoLike)
  const dateObj = hasTime ? new Date(isoLike) : new Date(`${isoLike}T00:00`)
  if (Number.isNaN(dateObj.getTime())) return nowLocalISODateTimeMinutes()
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}T${pad2(dateObj.getHours())}:${pad2(dateObj.getMinutes())}`
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
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${pad2(d.getFullYear())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
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


function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4 bg-white shadow-sm min-h-full">
      {title ? <div className="text-sm font-semibold text-gray-800 mb-3">{title}</div> : null}
      {children}
    </div>
  )
}

const inputBase =
  'mt-1 w-full h-11 rounded-lg border border-gray-400 bg-white text-gray-900 placeholder-gray-500 px-3 focus:outline-none focus:ring-2 focus:ring-blue-700/30 focus:border-blue-700 transition-colors'

function MoneyInput({ value, onChange, className = '', disabled = false }: { value: number; onChange: (v: number) => void; className?: string; disabled?: boolean }) {
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
      className={`${inputBase} text-right tabular-nums ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''} ${className}`}
    />
  )
}

function Overlay({ children, onClose, maxWidth = 'max-w-2xl' }: { children: React.ReactNode; onClose: () => void; maxWidth?: string }) {
  useEffect(() => {
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = orig
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300" onClick={onClose} />
      <div className={`relative w-full bg-white rounded-3xl shadow-xl overflow-y-auto animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[95vh] ${maxWidth}`}>
        {children}
      </div>
    </div>
  )
}

/* Payment edit modal */
function PaymentEditModal({ creditId, payment, onClose, onSaved, updatePayment, t }: { creditId: string; payment: PaymentItem; onClose: () => void; onSaved: (p: PaymentItem) => void; updatePayment: (creditId: string, paymentId: string, updates: Partial<Omit<PaymentItem, 'id' | 'credit_id'>>) => Promise<PaymentItem | null>; t: ReturnType<typeof getDailyReportsDictionary>['credits']['payments'] }) {
  const initialInput = useRef<string>(toLocalDateTimeInput(payment.date))
  const [date, setDate] = useState<string>(initialInput.current)
  const [amount, setAmount] = useState<number>(payment.amount)
  const [note, setNote] = useState<string>(payment.note || '')
  const canSave = amount > 0
  async function handleSave() {
    if (!canSave) return
    const userChangedDate = date !== initialInput.current
    const iso = userChangedDate ? new Date(date).toISOString() : new Date().toISOString()
    const saved = await updatePayment(creditId, payment.id, { amount, date: iso, note: note || null })
    if (saved) onSaved(saved)
  }
  return (
    <Overlay onClose={onClose} maxWidth="max-w-lg">
      <div className="flex flex-col text-gray-900">
        <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="text-lg font-bold text-slate-800">{t.editPayment}</div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="px-8 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.dateTime}</label>
              <input
                type="datetime-local"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
              <div className="text-[10px] text-slate-400 mt-1 font-semibold">{t.dateHint}</div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.amount}</label>
              <MoneyInput
                value={amount}
                onChange={setAmount}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.note}</label>
            <input
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
        </div>
        <div className="px-8 py-5 border-t border-slate-100 flex items-center justify-end bg-slate-50/30 gap-2">
          <Button variant="outline" onClick={onClose} className="px-4 py-2 h-10 text-xs font-semibold">{t.cancel}</Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave} className="px-4 py-2 h-10 text-xs font-semibold">{t.saveChanges}</Button>
        </div>
      </div>
    </Overlay>
  )
}

function HistoryModal({
  credit,
  onClose,
  fetchPayments,
  deletePayment,
  updatePayment,
  fetchTotalsOne,
  t,
}: {
  credit: CreditRow
  onClose: () => void
  fetchPayments: (creditId: string) => Promise<PaymentItem[]>
  deletePayment: (creditId: string, paymentId: string) => Promise<boolean>
  updatePayment: (creditId: string, paymentId: string, updates: Partial<Omit<PaymentItem, 'id' | 'credit_id'>>) => Promise<PaymentItem | null>
  fetchTotalsOne: (id: string) => Promise<Totals | null>
  t: ReturnType<typeof getDailyReportsDictionary>['credits']['history'] | any
}) {
  const { language } = useSettings()
  const paymentsT = getDailyReportsDictionary(language).credits.payments
  const [items, setItems] = useState<PaymentItem[]>([])
  const [summary, setSummary] = useState<{ total: number; paid: number; left: number }>({
    total: Math.round(credit.amount || 0),
    paid: 0,
    left: Math.round(credit.amount || 0),
  })
  const [editing, setEditing] = useState<PaymentItem | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function refetch() {
    const list = await fetchPayments(credit.id)
    setItems(list)
    const totals = await fetchTotalsOne(credit.id)
    const paid = totals?.paid ?? list.reduce((s, p) => s + (p.amount || 0), 0)
    const left = totals?.remaining ?? Math.max(0, Math.round(credit.amount || 0) - paid)
    setSummary({ total: Math.round(credit.amount || 0), paid, left })
  }

  useEffect(() => {
    void refetch()
    const ch = supabase
      .channel(`credit-history-${credit.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'credit_payments', filter: `credit_id=eq.${credit.id}` },
        () => { void refetch() },
      )
      .subscribe()
    const onVisible = () => { if (document.visibilityState === 'visible') void refetch() }
    document.addEventListener('visibilitychange', onVisible)
    const onPing = (ev: any) => { if (ev?.detail?.creditId === credit.id) void refetch() }
    window.addEventListener('credits:payments:changed', onPing as any)
    return () => {
      try { supabase.removeChannel(ch) } catch { }
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('credits:payments:changed', onPing as any)
    }
  }, [credit.id, credit.amount, fetchTotalsOne])

  const headers = useMemo(() => t?.headers || t?.table || {}, [t])

  return (
    <Overlay onClose={onClose} maxWidth="max-w-3xl">
      <div className="flex flex-col text-gray-900 max-h-[85vh]">
        <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-lg font-bold text-slate-800">{t.title}</div>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
              summary.left === 0 
                ? 'bg-green-50 text-green-700 border-green-100' 
                : 'bg-yellow-50 text-yellow-750 border-yellow-100'
            }`}>
              {summary.left === 0 ? t.badge.paid : t.badge.unpaid}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-8 py-5 flex-1 overflow-y-auto">
          {/* Metadata Row */}
          <div className="flex flex-wrap items-center gap-y-2 gap-x-6 pb-4 border-b border-slate-100 mb-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.summary.initial}</span>
              <span className="font-semibold text-slate-800 tabular-nums">{fmtInt(summary.total)} ₫</span>
            </div>
            <div className="h-3.5 w-px bg-slate-200 hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.summary.paid}</span>
              <span className="font-semibold text-slate-800 tabular-nums">{fmtInt(summary.paid)} ₫</span>
            </div>
            <div className="h-3.5 w-px bg-slate-200 hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.summary.remaining}</span>
              <span className="font-bold text-slate-900 tabular-nums">{fmtInt(summary.left)} ₫</span>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs italic font-semibold">{t.empty || 'No payments recorded.'}</div>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableHeadRow>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-[13rem]">{headers.dateTime || t.table?.dateTime || 'Date and time'}</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider w-[9rem]">{headers.amount || t.table?.amount || 'Amount'}</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{headers.methodNote || headers.note || t.table?.methodNote || t.table?.note || 'Method / Note'}</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-16">{headers.edit || 'Edit'}</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-16">{headers.delete || 'Delete'}</th>
                  </TableHeadRow>
                </TableHead>
                <TableBody>
                  {items.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="px-4 py-3.5 whitespace-nowrap">{fmtDateTimeDMYHM(p.date)}</TableCell>
                      <TableCell className="px-4 py-3.5 text-right tabular-nums font-semibold text-slate-800">{fmtInt(p.amount)} ₫</TableCell>
                      <TableCell className="px-4 py-3.5 text-slate-600">{p.note || '-'}</TableCell>
                      <TableCell className="px-4 py-3.5 text-center">
                        <button
                          className="p-1 rounded-full text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-colors"
                          title={headers.edit || 'Edit'}
                          onClick={() => setEditing(p)}
                        >
                          <PencilSquareIcon className="w-4 h-4" />
                        </button>
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-center">
                        <button
                          className="p-1 rounded-full text-slate-400 hover:text-red-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                          title={headers.delete || 'Delete'}
                          disabled={deletingId === p.id}
                          onClick={async () => {
                            if (deletingId) return
                            const ok = window.confirm(t.confirmDelete)
                            if (!ok) return
                            setDeletingId(p.id)
                            try {
                              const deleted = await deletePayment(credit.id, p.id)
                              if (deleted) {
                                setItems(prev => prev.filter(it => it.id !== p.id))
                                try {
                                  window.dispatchEvent(
                                    new CustomEvent('credits:payments:changed', {
                                      detail: { creditId: credit.id },
                                    }),
                                  )
                                } catch { }
                                await refetch()
                              } else {
                                alert(t.deleteFailed)
                              }
                            } catch {
                              alert(t.deleteFailed)
                            } finally {
                              setDeletingId(null)
                            }
                          }}
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </div>
      </div>

      {editing && (
        <PaymentEditModal
          creditId={credit.id}
          payment={editing}
          onClose={() => setEditing(null)}
          onSaved={async _p => {
            setEditing(null)
            await refetch()
          }}
          updatePayment={updatePayment}
          t={paymentsT}
        />
      )}
    </Overlay>
  )
}

type PaymentMethod = 'cash' | 'card' | 'bank' | 'other'
function methodLabel(m: PaymentMethod, otherText: string, t: ReturnType<typeof getDailyReportsDictionary>['credits']['payments']) {
  switch (m) {
    case 'cash': return t.methods.cash
    case 'card': return t.methods.card
    case 'bank': return t.methods.bank
    case 'other': return otherText.trim() ? otherText.trim() : t.methods.other
  }
}

function MethodButton({ active, onClick, children, title, icon: Icon }: { active: boolean; onClick: () => void; children: string; title: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full inline-flex items-center justify-center gap-2.5 px-3 h-11 rounded-xl text-xs font-semibold transition-all ${
        active 
          ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700' 
          : 'bg-[#eef0f6] text-slate-700 hover:bg-slate-200/80'
      }`}
      title={title}
    >
      <Icon className={`w-5 h-5 ${active ? 'text-white' : 'text-slate-450'}`} />
      <span>{children}</span>
    </button>
  )
}

function PaymentModal({
  credit,
  remaining,
  onClose,
  onSaved,
  addPayment,
  t,
}: {
  credit: CreditRow
  remaining: number
  onClose: () => void
  onSaved: (p: PaymentItem) => void
  addPayment: (creditId: string, input: { amount: number; note?: string | null; date?: string }) => Promise<PaymentItem | null>
  t: ReturnType<typeof getDailyReportsDictionary>['credits']['payments']
}) {
  const [date, setDate] = useState<string>(nowLocalISODateTimeMinutes())
  const [amount, setAmount] = useState<number>(remaining)
  const [saving, setSaving] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [otherText, setOtherText] = useState<string>('')

  const amountError =
    !Number.isFinite(amount)
      ? t.errors.amountInvalid
      : amount <= 0
        ? t.errors.amountMin
        : amount > Math.max(remaining, 0)
          ? t.errors.amountExceeds
          : !date
            ? t.errors.dateRequired
            : null
  const methodError = method === 'other' && !otherText.trim() ? t.errors.methodRequired : null
  const hasError = Boolean(amountError || methodError)

  async function handleSave() {
    if (saving) return
    if (hasError) {
      alert(t.errors.fixBeforeSave)
      return
    }
    setSaving(true)
    try {
      const iso = new Date(date).toISOString()
      const noteVal = methodLabel(method, otherText, t)
      const item = await addPayment(credit.id, { amount, note: noteVal, date: iso })
      if (item) onSaved(item)
      else alert(t.errors.addFailed)
    } catch {
      alert(t.errors.addFailed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth="max-w-3xl">
      <div className="flex flex-col text-gray-900">
        <div className="px-8 pt-6 pb-2 flex items-center justify-between">
          <div className="text-xl font-bold text-slate-800">{t.confirmPayment}</div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <XMarkIcon className="w-5.5 h-5.5" />
          </button>
        </div>

        <div className="px-8 py-4 space-y-6">
          {/* Metadata Row */}
          <div className="flex flex-wrap items-center gap-y-2 gap-x-6 pb-4 border-b border-slate-100 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.customer}</span>
              <span className="font-semibold text-slate-850 truncate max-w-[240px]">{credit.customer_name || '-'}</span>
            </div>
            <div className="h-3.5 w-px bg-slate-200 hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.initial}</span>
              <span className="font-semibold text-slate-800 tabular-nums">{fmtInt(credit.amount)} ₫</span>
            </div>
            <div className="h-3.5 w-px bg-slate-200 hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.remaining}</span>
              <span className="font-bold text-slate-900 tabular-nums">{fmtInt(remaining)} ₫</span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Column 1: Details */}
            <div className="space-y-4">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">{t.details.title}</div>
              <div className="space-y-4">
                {/* Row 1: Date */}
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-slate-455 pointer-events-none">
                    <CalendarDaysIcon className="w-5 h-5" />
                  </span>
                  <input
                    type="datetime-local"
                    className="w-full !mt-0 pl-10 pr-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                  />
                </div>
                {/* Row 2: Amount Input Box */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">{t.details.amount}</label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-sm font-semibold text-slate-400 pointer-events-none">
                      ₫
                    </span>
                    <MoneyInput
                      value={amount}
                      onChange={setAmount}
                      className="w-full !mt-0 pl-8 pr-16 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold !text-left"
                    />
                    <button
                      type="button"
                      onClick={() => setAmount(remaining)}
                      className="absolute right-2 px-3 py-1 text-[10px] font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors h-6.5 flex items-center"
                      title={t.details.maxTitle}
                    >
                      {t.details.max}
                    </button>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] font-semibold">
                    <span className="text-slate-400">{t.details.maxLabel.replace('{amount}', fmtInt(remaining))}</span>
                    {amountError && <span className="text-red-650">{amountError}</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Method */}
            <div className="space-y-4">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">{t.method.title}</div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <MethodButton active={method === 'cash'} onClick={() => setMethod('cash')} title={t.methods.cash} icon={BanknotesIcon}>{t.methods.cash}</MethodButton>
                  <MethodButton active={method === 'card'} onClick={() => setMethod('card')} title={t.methods.card} icon={CreditCardIcon}>{t.methods.card}</MethodButton>
                  <MethodButton active={method === 'bank'} onClick={() => setMethod('bank')} title={t.methods.bank} icon={BuildingLibraryIcon}>{t.methods.bank}</MethodButton>
                  <MethodButton active={method === 'other'} onClick={() => setMethod('other')} title={t.methods.other} icon={EllipsisHorizontalIcon}>{t.methods.other}</MethodButton>
                </div>
                {method === 'other' && (
                  <div className="animate-fadeIn">
                    <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">{t.method.otherLabel}</label>
                    <input
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold"
                      placeholder={t.method.otherPlaceholder}
                      value={otherText}
                      onChange={e => setOtherText(e.target.value)}
                    />
                  </div>
                )}
                {methodError && <div className="text-xs font-bold text-red-650">{methodError}</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="px-8 pt-4 pb-6 flex items-center justify-end gap-2.5">
          <Button variant="outline" onClick={onClose} className="px-4 py-2 h-10 text-xs font-semibold">{t.cancel}</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={hasError || saving}
            className="px-4 py-2 h-10 text-xs font-semibold"
            title={hasError ? t.method.fixErrors : t.method.saveTitle}
          >
            {saving ? t.saving : t.savePayment}
          </Button>
        </div>
      </div>
    </Overlay>
  )
}


function EditorModal({
  mode,
  staffOpts,
  shiftOpts,
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
  historyT,
  t,
  errors,
}: {
  mode: 'create' | 'view' | 'edit'
  staffOpts: string[]
  shiftOpts: string[]
  selectedBranchName: string
  initial: Partial<CreditRow>
  onClose: () => void
  onSaved: (row: CreditRow) => void
  onDeleted: (id: string) => void
  currentUserName: string
  currentShiftName: string
  fetchTotalsOne: (id: string) => Promise<Totals | null>
  fetchPayments: (creditId: string) => Promise<PaymentItem[]>
  deletePayment: (creditId: string, paymentId: string) => Promise<boolean>
  updatePayment: (creditId: string, paymentId: string, updates: Partial<Omit<PaymentItem, 'id' | 'credit_id'>>) => Promise<PaymentItem | null>
  historyT: any
  t: ReturnType<typeof getDailyReportsDictionary>['credits']['editor']
  errors: ReturnType<typeof getDailyReportsDictionary>['credits']['errors']
}) {
  const [viewMode, setViewMode] = useState(mode === 'view')
  const [date, setDate] = useState(initial.date || todayISO())

  const [customerId] = useState<string>(initial.customer_id || '')
  const [customerName, setCustomerName] = useState<string>(initial.customer_name || '')
  const [customerPhone, setCustomerPhone] = useState<string>(initial.customer_phone || '')
  const [customerEmail, setCustomerEmail] = useState<string>(initial.customer_email || '')

  const [amount, setAmount] = useState<number>(Number(initial.amount || 0))
  const [reference, setReference] = useState<string>(initial.reference || '')

  const finalShiftOpts = useMemo(() => (shiftOpts && shiftOpts.length) ? shiftOpts : ['Lunch', 'Dinner', 'All day'], [shiftOpts])
  const defaultShift = useMemo(() => (initial.shift || currentShiftName || finalShiftOpts[0] || ''), [initial.shift, currentShiftName, finalShiftOpts])
  const [shift, setShift] = useState<string>(defaultShift)

  const [handledBy, setHandledBy] = useState<string>(initial.handledBy || currentUserName || staffOpts[0] || '')
  const [note, setNote] = useState<string>(initial.note || '')

  const [isPaid, setIsPaid] = useState<boolean>(false)
  const [remaining, setRemaining] = useState<number>(0)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    if (!shift && defaultShift) setShift(defaultShift)
  }, [defaultShift, shift])

  useEffect(() => {
    ; (async () => {
      if (!initial.id) {
        setIsPaid(false)
        setRemaining(Math.round(amount || 0))
        return
      }
      const totals = await fetchTotalsOne(String(initial.id))
      const rem = totals?.remaining ?? Math.max(0, Math.round(amount || 0) - (totals?.paid ?? 0))
      setRemaining(rem)
      setIsPaid(rem === 0)
    })()
  }, [initial.id, amount, fetchTotalsOne])

  useEffect(() => {
    if (!initial.id && !initial.handledBy) setHandledBy(currentUserName || handledBy)
  }, [currentUserName, initial.id, initial.handledBy, handledBy])

  const branchOk = Boolean((selectedBranchName || '').trim())
  const canSave = branchOk && customerName.trim().length > 0 && amount > 0

  function handleSave() {
    if (!canSave || viewMode) {
      if (!branchOk) alert(errors.branch)
      return
    }
    onSaved({
      id: initial.id || crypto.randomUUID(),
      branch: selectedBranchName.trim(),
      date,
      type: 'credit',
      customer_id: customerId || null,
      customer_name: customerName ? customerName.trim() : null,
      customer_phone: customerPhone ? customerPhone.trim() : null,
      customer_email: customerEmail ? customerEmail.trim() : null,
      amount: Math.round(amount),
      reference: reference || null,
      shift: (shift || defaultShift) || null,
      handledBy: handledBy || currentUserName || null,
      note: note ? note.trim() : null,
    })
  }
  async function handleDelete() {
    if (viewMode || !initial.id) return
    if (!window.confirm(t.confirmDelete)) return
    onDeleted(initial.id)
  }

  return (
    <>
      <Overlay onClose={onClose} maxWidth="max-w-3xl">
        <div className="flex flex-col text-gray-900">
          <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-lg font-bold text-slate-800">
                {viewMode ? t.title.view : initial.id ? t.title.edit : t.title.new}
              </div>
              {!branchOk && <span className="text-xs text-red-650 font-semibold">{errors.branch}</span>}
            </div>
            <div className="flex items-center gap-2">
              {initial.id && (
                <Button
                  variant="outline"
                  onClick={() => setShowHistory(true)}
                  className="px-3 h-8.5 text-xs font-semibold"
                  title={t.history}
                  icon={ClockIcon}
                >
                  <span>{t.history}</span>
                </Button>
              )}
              <button
                onClick={onClose}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="px-8 py-6 space-y-5 flex-1">
            {/* Branch display */}
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Branch</span>
              <div className="h-3 w-px bg-slate-200" />
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                {selectedBranchName || '-'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.date}</label>
                {viewMode ? (
                  <div className="h-10 flex items-center text-sm font-semibold text-slate-850">{fmtDateDMY(date)}</div>
                ) : (
                  <input
                    type="date"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.shift}</label>
                {viewMode ? (
                  <div className="h-10 flex items-center text-sm font-semibold text-slate-855">{shift || '-'}</div>
                ) : (
                  <select
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold"
                    value={shift}
                    onChange={e => setShift(e.target.value)}
                  >
                    {finalShiftOpts.map((s, i) => (
                      <option key={`${s}-${i}`} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-4">
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.customer}</label>
                {viewMode ? (
                  <div className="h-10 flex items-center text-sm font-semibold text-slate-850 truncate">{customerName || '-'}</div>
                ) : (
                  <input
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                  />
                )}
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.phone}</label>
                {viewMode ? (
                  <div className="h-10 flex items-center text-sm font-semibold text-slate-850">{customerPhone || '-'}</div>
                ) : (
                  <input
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                  />
                )}
              </div>
              <div className="col-span-5">
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.email}</label>
                {viewMode ? (
                  <div className="h-10 flex items-center text-sm font-semibold text-slate-855 truncate">{customerEmail || '-'}</div>
                ) : (
                  <input
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold"
                    value={customerEmail}
                    onChange={e => setCustomerEmail(e.target.value)}
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-4">
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.initial}</label>
                {viewMode ? (
                  <div className="h-10 flex items-center text-sm font-bold text-slate-800 tabular-nums">{fmtInt(amount)} ₫</div>
                ) : (
                  <MoneyInput
                    value={amount}
                    onChange={setAmount}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold"
                  />
                )}
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.remaining}</label>
                <div className="h-10 flex items-center text-sm font-bold text-slate-800 tabular-nums">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    remaining === 0 
                      ? 'bg-green-50 text-green-700 border border-green-100' 
                      : 'bg-yellow-50 text-yellow-750 border border-yellow-100'
                  }`}>
                    {fmtInt(remaining)} ₫
                  </span>
                </div>
              </div>
              <div className="col-span-5">
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.reference}</label>
                {viewMode ? (
                  <div className="h-10 flex items-center text-sm font-semibold text-slate-800 truncate">{reference || '-'}</div>
                ) : (
                  <input
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.handledBy}</label>
              <div className="flex items-center gap-2 py-1.5">
                <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                  <UserIcon className="w-4 h-4" />
                </div>
                <span className="text-sm font-semibold text-slate-800">{handledBy || currentUserName || '-'}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.notes}</label>
              {viewMode ? (
                <div className="text-sm text-slate-700 bg-slate-50/50 rounded-xl border border-slate-150 p-3.5 min-h-[4.5rem] whitespace-pre-wrap font-medium">
                  {note || '-'}
                </div>
              ) : (
                <textarea
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-20 text-slate-900 font-medium resize-none"
                  value={note || ''}
                  onChange={e => setNote(e.target.value)}
                  placeholder={t.fields.notesPlaceholder}
                />
              )}
            </div>
          </div>

          <div className="px-8 py-5 border-t border-slate-100 flex items-center justify-between bg-slate-50/30">
            <div className="flex items-center gap-2">
              {viewMode ? (
                <Button variant="primary" onClick={() => setViewMode(false)} className="px-4 py-2 h-10 text-xs font-semibold">{t.actions.edit}</Button>
              ) : (
                initial.id && (
                  <Button
                    variant="danger-light"
                    onClick={handleDelete}
                    className="px-4 py-2 h-10 text-xs font-semibold"
                  >
                    {t.actions.delete}
                  </Button>
                )
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose} className="px-4 py-2 h-10 text-xs font-semibold">{t.actions.close}</Button>
              {!viewMode && (
                <Button variant="primary" onClick={handleSave} disabled={!canSave} className="px-4 py-2 h-10 text-xs font-semibold">{t.actions.save}</Button>
              )}
            </div>
          </div>
        </div>
      </Overlay>

      {showHistory && initial.id && (
        <HistoryModal
          credit={{ ...(initial as CreditRow), amount }}
          onClose={() => setShowHistory(false)}
          fetchPayments={fetchPayments}
          deletePayment={deletePayment}
          updatePayment={updatePayment}
          fetchTotalsOne={fetchTotalsOne}
          t={historyT}
        />
      )}
    </>
  )
}

type SortKeyBase = 'date' | 'customer_name' | 'amount' | 'remaining' | 'reference' | 'shift' | 'handledBy' | 'status'
type SortKeyWithBranch = SortKeyBase | 'branch'
type SortState = { key: SortKeyWithBranch | null; dir: 'asc' | 'desc' }

export default function CreditsPage() {
  const { language } = useSettings()
  const t = getDailyReportsDictionary(language).credits
  const historyT = useMemo(() => {
    const h = (t as any)?.history
    if (h) return h
    const p: any = (t as any)?.payments || {}
    return {
      title: p.title || 'Payment history',
      badge: p.badge || { paid: 'Paid', unpaid: 'Unpaid' },
      summary: p.summary || { initial: 'Initial', paid: 'Paid', remaining: 'Remaining' },
      table: p.table || p.headers || {
        dateTime: p.dateTime || 'Date and time',
        amount: p.amount || 'Amount',
        methodNote: p.methodNote || p.note || 'Method / Note',
        recordedBy: p.recordedBy || 'Recorded by',
        edit: p.edit || 'Edit',
        delete: p.delete || 'Delete',
      },
      noPayments: p.noPayments || p.empty || '',
      deleteConfirm: p.deleteConfirm || '',
      deleteFailed: p.deleteFailed || '',
    }
  }, [t])
  // Month navigation (deve essere prima di useCredits per passare year/month)
  const now = new Date()
  const [year, setYear] = useState<number>(now.getFullYear())
  const [month, setMonth] = useState<number>(now.getMonth())

  const {
    rows,
    totalsMap,
    staffOpts,
    shiftOpts,
    currentUserName,
    currentShiftName,
    loading,
    upsertCredit,
    deleteCredit,
    bulkDeleteCredits,
    fetchPayments,
    addPayment,
    updatePayment,
    deletePayment,
    refreshTotalsFor,
    fetchTotalsOne,
  } = useCredits({ year, month })

  const { branch } = useDRBranch({ validate: false })
  const officialName = branch?.name || ''

  const bridge = useBridgeSafe()
  const bridgeName = bridge?.name || ''
  const setBridgeName: (v: string) => void = bridge?.setName || (() => { })

  const activeBranch = bridgeName || officialName

  useEffect(() => {
    if (officialName && setBridgeName) setBridgeName(officialName)
  }, [officialName, setBridgeName])

  const [showLoading, setShowLoading] = useState(false)
  useEffect(() => {
    let t: any
    if (loading) t = setTimeout(() => setShowLoading(true), 200)
    else setShowLoading(false)
    return () => { if (t) clearTimeout(t) }
  }, [loading])

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const selectedIds = useMemo(() => Object.keys(selected).filter(id => selected[id]), [selected])
  const headerCbRef = useRef<HTMLInputElement>(null)
  const [openEditor, setOpenEditor] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'view' | 'edit'>('create')
  const [initialRow, setInitialRow] = useState<Partial<CreditRow> | null>(null)
  const [sort, setSort] = useState<SortState>({ key: null, dir: 'asc' })
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [payingRow, setPayingRow] = useState<CreditRow | null>(null)
  const [historyRow, setHistoryRow] = useState<CreditRow | null>(null)

  const [columnFilters, setColumnFilters] = useState<Partial<Record<SortKeyWithBranch | 'remaining', Set<string>>>>({})
  const [openMenu, setOpenMenu] = useState<SortKeyWithBranch | 'remaining' | null>(null)

  const columnMenuDict = {
    sortAsc: language === 'vi' ? 'Sắp xếp tăng dần' : 'Sort Ascending',
    sortDesc: language === 'vi' ? 'Sắp xếp giảm dần' : 'Sort Descending',
    selectAll: language === 'vi' ? 'Chọn tất cả' : 'Select All',
    deselectAll: language === 'vi' ? 'Bỏ chọn tất cả' : 'Deselect All',
    filterPlaceholder: language === 'vi' ? 'Lọc...' : 'Filter...',
    clearFilters: language === 'vi' ? 'Xóa bộ lọc' : 'Clear Filters',
  }

  function applySort(k: SortKeyWithBranch | 'remaining', asc: boolean) {
    setSort({ key: k, dir: asc ? 'asc' : 'desc' })
    setOpenMenu(null)
  }

  function applyColumnFilter(col: SortKeyWithBranch | 'remaining', vals: Set<string> | null) {
    setColumnFilters(prev => ({ ...prev, [col]: vals }))
    setOpenMenu(null)
  }

  function clearColumnFilter(col: SortKeyWithBranch | 'remaining') {
    setColumnFilters(prev => {
      const next = { ...prev }
      delete next[col]
      return next
    })
    setOpenMenu(null)
  }

  const displayValue = React.useCallback(
    (x: { row: CreditRow; remaining: number; status: Totals['status'] }, key: SortKeyWithBranch | 'remaining'): string => {
      switch (key) {
        case 'date': return fmtDateDMY(x.row.date)
        case 'customer_name': return x.row.customer_name || ''
        case 'amount': return fmtInt(x.row.amount)
        case 'remaining': return fmtInt(x.remaining)
        case 'status': return x.status === 'Paid' ? t.status.paid : x.status === 'Unpaid' ? t.status.unpaid : t.status.open
        case 'reference': return x.row.reference || ''
        case 'branch': return x.row.branch || ''
        case 'shift': return x.row.shift || ''
        case 'handledBy': return x.row.handledBy || ''
        default: return ''
      }
    },
    [t.status]
  )

  const monthInputValue = useMemo(() => `${year}-${String(month + 1).padStart(2, '0')}`, [year, month])
  const monthLabel = `${monthName(month)} ${year}`
  const monthStart = useMemo(() => new Date(year, month, 1), [year, month])
  const monthEnd = useMemo(() => new Date(year, month + 1, 1), [year, month])

  function prevMonth() {
    setMonth(m => {
      if (m === 0) { setYear(y => y - 1); return 11 }
      return m - 1
    })
  }
  function nextMonth() {
    setMonth(m => {
      if (m === 11) { setYear(y => y + 1); return 0 }
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

  const rowsWithCalc = useMemo(() => {
    return rows.map(r => {
      const totals = totalsMap[r.id] || {
        paid: 0,
        remaining: Math.round(r.amount || 0),
        status: 'Unpaid' as Totals['status'],
      }
      return { row: r, remaining: totals.remaining, status: totals.status }
    })
  }, [rows, totalsMap])

  const nowMonthFiltered = useMemo(() => {
    return rowsWithCalc.filter(x => {
      const dstr = x.row.date || ''
      const d = /T/.test(dstr) ? new Date(dstr) : new Date(`${dstr}T00:00`)
      return d >= monthStart && d < monthEnd
    })
  }, [rowsWithCalc, monthStart, monthEnd])

  const columnValues = useMemo(() => {
    const map: Partial<Record<SortKeyWithBranch | 'remaining', string[]>> = {}
    const keys: (SortKeyWithBranch | 'remaining')[] = ['date', 'customer_name', 'amount', 'remaining', 'status', 'reference', 'branch', 'shift', 'handledBy']
    keys.forEach(k => {
      const s = new Set<string>()
      nowMonthFiltered.forEach(x => { const v = displayValue(x, k); if (v) s.add(v) })
      map[k] = Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    })
    return map
  }, [nowMonthFiltered, displayValue])

  const visibleRows = useMemo(() => {
    const branchName = (activeBranch || '').trim()
    let base = branchName ? nowMonthFiltered.filter(x => (x.row.branch || '') === branchName) : nowMonthFiltered

    // Apply column checklist filters
    for (const [col, allowed] of Object.entries(columnFilters)) {
      if (allowed && allowed.size > 0) {
        base = base.filter(x => allowed.has(displayValue(x, col as any)))
      }
    }

    return base
  }, [nowMonthFiltered, activeBranch, columnFilters, displayValue])

  function toggleSort(key: SortKeyWithBranch) {
    setSort(prev => (prev.key !== key ? { key, dir: 'asc' } : { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }))
  }
  const sortedRows = useMemo(() => {
    if (!sort.key) return visibleRows
    const dir = sort.dir === 'asc' ? 1 : -1
    function cmp(a: any, b: any): number {
      const ra = a.row, rb = b.row
      switch (sort.key) {
        case 'amount': return (ra.amount - rb.amount) * dir
        case 'remaining': return (a.remaining - b.remaining) * dir
        case 'date': return (new Date(ra.date).getTime() - new Date(rb.date).getTime()) * dir
        case 'customer_name': return (ra.customer_name || '').toLowerCase().localeCompare((rb.customer_name || '').toLowerCase()) * dir
        case 'reference': return (ra.reference || '').toLowerCase().localeCompare((rb.reference || '').toLowerCase()) * dir
        case 'shift': return (ra.shift || '').toLowerCase().localeCompare((rb.shift || '').toLowerCase()) * dir
        case 'handledBy': return (ra.handledBy || '').toLowerCase().localeCompare((rb.handledBy || '').toLowerCase()) * dir
        case 'branch': return (ra.branch || '').toLowerCase().localeCompare((rb.branch || '').toLowerCase()) * dir
        case 'status': return a.status.localeCompare(b.status) * dir
      }
      return 0
    }
    return [...visibleRows].sort(cmp)
  }, [visibleRows, sort])

  async function bulkDelete() {
    const ids = selectedIds
    if (ids.length === 0) return
    const ok = window.confirm(t.menu.bulkConfirm.replace('{count}', String(ids.length)))
    if (!ok) return
    const done = await bulkDeleteCredits(ids)
    if (!done) return
    setSelected({})
  }

  const allSelected = rows.length > 0 && rows.every(r => !!selected[r.id])
  const someSelected = rows.some(r => !!selected[r.id]) && !allSelected
  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = someSelected
  }, [someSelected, allSelected, rows.length])

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        badgeText={activeBranch ? activeBranch : t.branchPill.all}
        left={
          selectMode ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                aria-label={t.menu.more}
                className="p-0 h-auto w-auto bg-transparent border-0 outline-none text-blue-200 hover:text-white focus:outline-none"
                title={t.menu.more}
              >
                <EllipsisVerticalIcon className="h-6 w-6" />
              </button>
              {menuOpen && (
                <div className="absolute z-10 mt-2 min-w-[12rem] rounded-xl border bg-white text-gray-800 shadow-lg py-1">
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 hover:bg-slate-100 disabled:opacity-50 text-xs font-semibold text-left"
                    onClick={() => {
                      setMenuOpen(false)
                      if (selectedIds.length) bulkDelete()
                    }}
                    disabled={selectedIds.length === 0}
                  >
                    <TrashIcon className="h-4 w-4" />
                    <span>{t.menu.delete}</span>
                  </button>
                </div>
              )}
            </div>
          ) : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary-dark"
              onClick={() => void handleExport(sortedRows, totalsMap)}
              className="px-3 h-9 text-xs font-semibold"
              title={t.export.title}
              icon={ArrowUpTrayIcon}
            >
              <span>{t.export.label}</span>
            </Button>

            <Button
              variant={selectMode ? 'primary' : 'secondary-dark'}
              onClick={() => {
                setSelectMode(s => !s)
                setMenuOpen(false)
              }}
              className="px-3 h-9 text-xs font-semibold"
              title={selectMode ? t.select.exitTitle : t.select.enterTitle}
              icon={CheckCircleIcon}
            >
              <span>{selectMode ? t.select.active : t.select.inactive}</span>
            </Button>

            <Button
              variant="primary"
              onClick={() => {
                setEditorMode('create')
                setInitialRow({
                  date: todayISO(),
                  handledBy: currentUserName,
                  shift: currentShiftName || null,
                })
                setOpenEditor(true)
              }}
              className="px-3 h-9 text-xs font-semibold"
              title={t.actions.newTitle}
              icon={PlusIcon}
            >
              <span>{t.actions.new}</span>
            </Button>
          </div>
        }
      />

      <MonthPicker
        value={monthInputValue}
        onChange={val => {
          if (val > monthInputValue && aheadIsFutureGuard(year, month)) {
            return
          }
          onPickMonth(val)
        }}
        language={language}
        colorClass="text-blue-100 hover:text-white"
        labelColorClass="text-white"
        iconColorClass="text-blue-200 hover:text-white"
        className="mb-4"
      />

      <TableContainer>
        {showLoading && rows.length === 0 && <CircularLoader />}
        <CreditsTable
          rows={rows}
          sortedRows={sortedRows}
          totalsMap={totalsMap}
          sort={sort}
          setSort={setSort}
          selected={selected}
          setSelected={setSelected}
          headerCbRef={headerCbRef}
          setEditorMode={setEditorMode}
          setInitialRow={r => setInitialRow(r)}
          setOpenEditor={setOpenEditor}
          setPayingRow={setPayingRow}
          setHistoryRow={setHistoryRow}
          selectMode={selectMode}
          t={t}
          columnFilters={columnFilters}
          openMenu={openMenu}
          setOpenMenu={setOpenMenu}
          columnValues={columnValues}
          applySort={applySort}
          applyColumnFilter={applyColumnFilter}
          clearColumnFilter={clearColumnFilter}
          columnMenuDict={columnMenuDict}
        />
      </TableContainer>

      {openEditor && initialRow && (
        <EditorModal
          mode={editorMode}
          initial={initialRow}
          staffOpts={staffOpts.length ? staffOpts : ['Staff']}
          shiftOpts={shiftOpts}
          selectedBranchName={activeBranch}
          onClose={() => setOpenEditor(false)}
          onSaved={async row => {
            const saved = await upsertCredit(row)
            if (!saved) {
              alert(t.errors.saveFailed)
              return
            }
            setOpenEditor(false)
          }}
          onDeleted={async id => {
            const ok = await deleteCredit(id)
            if (!ok) return
            setOpenEditor(false)
          }}
          currentUserName={currentUserName}
          currentShiftName={currentShiftName}
          fetchTotalsOne={fetchTotalsOne}
          fetchPayments={fetchPayments}
          deletePayment={deletePayment}
          updatePayment={updatePayment}
          historyT={historyT}
          t={t.editor}
          errors={t.errors}
        />
      )}

      {payingRow && (
        <PaymentModal
          credit={payingRow}
          remaining={totalsMap[payingRow.id]?.remaining ?? Math.max(0, Math.round(payingRow.amount || 0))}
          onClose={() => setPayingRow(null)}
          onSaved={async () => {
            setPayingRow(null)
            await refreshTotalsFor(payingRow.id)
          }}
          addPayment={addPayment}
          t={t.payments}
        />
      )}

      {historyRow && (
        <HistoryModal
          credit={historyRow}
          onClose={() => setHistoryRow(null)}
          fetchPayments={fetchPayments}
          deletePayment={deletePayment}
          updatePayment={updatePayment}
          fetchTotalsOne={fetchTotalsOne}
          t={historyT}
        />
      )}
    </div>
  )
}

function CreditsTable({
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
  setPayingRow,
  setHistoryRow,
  selectMode,
  t,
  columnFilters,
  openMenu,
  setOpenMenu,
  columnValues,
  applySort,
  applyColumnFilter,
  clearColumnFilter,
  columnMenuDict,
}: {
  rows: CreditRow[]
  sortedRows: { row: CreditRow; remaining: number; status: Totals['status'] }[]
  totalsMap: Record<string, Totals>
  sort: { key: SortKeyWithBranch | null; dir: 'asc' | 'desc' }
  setSort: (s: any) => void
  selected: Record<string, boolean>
  setSelected: (s: any) => void
  headerCbRef: React.RefObject<HTMLInputElement | null>
  setEditorMode: (m: 'view' | 'edit' | 'create') => void
  setInitialRow: (r: CreditRow) => void
  setOpenEditor: (b: boolean) => void
  setPayingRow: (r: CreditRow) => void
  setHistoryRow: (r: CreditRow) => void
  selectMode: boolean
  t: ReturnType<typeof getDailyReportsDictionary>['credits']
  columnFilters: Partial<Record<SortKeyWithBranch | 'remaining', Set<string>>>
  openMenu: SortKeyWithBranch | 'remaining' | null
  setOpenMenu: React.Dispatch<React.SetStateAction<SortKeyWithBranch | 'remaining' | null>>
  columnValues: Partial<Record<SortKeyWithBranch | 'remaining', string[]>>
  applySort: (k: SortKeyWithBranch | 'remaining', asc: boolean) => void
  applyColumnFilter: (col: SortKeyWithBranch | 'remaining', vals: Set<string> | null) => void
  clearColumnFilter: (col: SortKeyWithBranch | 'remaining') => void
  columnMenuDict: { sortAsc: string; sortDesc: string; selectAll: string; deselectAll: string; filterPlaceholder: string; clearFilters: string }
}) {
  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = rows.some(r => !!selected[r.id]) && !rows.every(r => !!selected[r.id])
  }, [selected, rows])

  const totalInitial = useMemo(() => sortedRows.reduce((s, x) => s + Math.round(x.row.amount || 0), 0), [sortedRows])
  const totalRemaining = useMemo(() => sortedRows.reduce((s, x) => s + Math.round(totalsMap[x.row.id]?.remaining ?? Math.round(x.row.amount || 0)), 0), [sortedRows, totalsMap])

  return (
    <Table className="text-sm text-gray-900 border-t border-slate-100">
      <TableHead>
        <TableHeadRow>
          {selectMode && (
            <th className="px-6 py-4 w-12 text-left bg-gray-50/75 border-b border-gray-200">
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
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                title={t.table.selectAll}
              />
            </th>
          )}
          <ColumnHeader colKey="date" label={t.table.headers.date} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.date || []} activeFilter={columnFilters.date || null} onFilter={(s) => applyColumnFilter('date', s)} onClear={() => clearColumnFilter('date')} open={openMenu === 'date'} onToggle={() => setOpenMenu(v => v === 'date' ? null : 'date')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} className="w-[8rem]" />
          <ColumnHeader colKey="customer_name" label={t.table.headers.customer} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.customer_name || []} activeFilter={columnFilters.customer_name || null} onFilter={(s) => applyColumnFilter('customer_name', s)} onClear={() => clearColumnFilter('customer_name')} open={openMenu === 'customer_name'} onToggle={() => setOpenMenu(v => v === 'customer_name' ? null : 'customer_name')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} className="w-[16rem]" />
          <ColumnHeader colKey="amount" label={t.table.headers.initial} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.amount || []} activeFilter={columnFilters.amount || null} onFilter={(s) => applyColumnFilter('amount', s)} onClear={() => clearColumnFilter('amount')} open={openMenu === 'amount'} onToggle={() => setOpenMenu(v => v === 'amount' ? null : 'amount')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} right className="w-[11rem]" />
          <ColumnHeader colKey="remaining" label={t.table.headers.remaining} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.remaining || []} activeFilter={columnFilters.remaining || null} onFilter={(s) => applyColumnFilter('remaining', s)} onClear={() => clearColumnFilter('remaining')} open={openMenu === 'remaining'} onToggle={() => setOpenMenu(v => v === 'remaining' ? null : 'remaining')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} right className="w-[11rem]" />
          <ColumnHeader colKey="status" label={t.table.headers.status} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.status || []} activeFilter={columnFilters.status || null} onFilter={(s) => applyColumnFilter('status', s)} onClear={() => clearColumnFilter('status')} open={openMenu === 'status'} onToggle={() => setOpenMenu(v => v === 'status' ? null : 'status')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} className="w-[8rem]" />
          <ColumnHeader colKey="reference" label={t.table.headers.reference} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.reference || []} activeFilter={columnFilters.reference || null} onFilter={(s) => applyColumnFilter('reference', s)} onClear={() => clearColumnFilter('reference')} open={openMenu === 'reference'} onToggle={() => setOpenMenu(v => v === 'reference' ? null : 'reference')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} className="w-[10rem]" />
          <ColumnHeader colKey="shift" label={t.table.headers.shift} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.shift || []} activeFilter={columnFilters.shift || null} onFilter={(s) => applyColumnFilter('shift', s)} onClear={() => clearColumnFilter('shift')} open={openMenu === 'shift'} onToggle={() => setOpenMenu(v => v === 'shift' ? null : 'shift')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} className="w-[7.5rem]" />
          <ColumnHeader colKey="handledBy" label={t.table.headers.handledBy} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.handledBy || []} activeFilter={columnFilters.handledBy || null} onFilter={(s) => applyColumnFilter('handledBy', s)} onClear={() => clearColumnFilter('handledBy')} open={openMenu === 'handledBy'} onToggle={() => setOpenMenu(v => v === 'handledBy' ? null : 'handledBy')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} className="w-[9.5rem]" />
          <th className="px-6 py-4 w-12 text-center bg-gray-50/75 border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-slate-500">{t.table.headers.action}</th>
        </TableHeadRow>
      </TableHead>
      <TableBody>
        {sortedRows.map(x => {
          const r = x.row
          const rem = totalsMap[r.id]?.remaining ?? Math.round(r.amount || 0)
          const isPaid = rem === 0
          const statusRaw = totalsMap[r.id]?.status || (isPaid ? 'Paid' : 'Unpaid')
          const statusText = statusRaw === 'Paid' ? t.status.paid : statusRaw === 'Unpaid' ? t.status.unpaid : t.status.open
          return (
            <TableRow
              key={r.id}
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
            >
              {selectMode && (
                <TableCell onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} className="w-12">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={!!selected[r.id]}
                    onChange={e => setSelected((prev: any) => ({ ...prev, [r.id]: e.target.checked }))}
                    title={t.table.selectRow}
                  />
                </TableCell>
              )}
              <TableCell className="whitespace-nowrap font-medium text-slate-600">{fmtDateDMY(r.date)}</TableCell>
              <TableCell className="whitespace-nowrap font-semibold text-slate-805">{r.customer_name || '-'}</TableCell>
              <TableCell className="text-right font-bold text-slate-800 tabular-nums">{fmtInt(r.amount)} ₫</TableCell>
              <TableCell className="text-right font-bold text-slate-800 tabular-nums">{fmtInt(rem)} ₫</TableCell>
              <TableCell className="whitespace-nowrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                  isPaid 
                    ? 'bg-green-50 text-green-700 border-green-100' 
                    : 'bg-yellow-50 text-yellow-750 border-yellow-100'
                }`}>
                  {statusText}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap text-slate-600 font-medium">{r.reference || '-'}</TableCell>
              <TableCell className="whitespace-nowrap text-slate-600 font-medium">{r.shift || '-'}</TableCell>
              <TableCell className="whitespace-nowrap text-slate-600 font-medium">{r.handledBy || '-'}</TableCell>
              <TableCell className="text-center" onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                <button
                  className="p-1 rounded-full text-slate-450 hover:text-blue-600 hover:bg-slate-100 transition-colors"
                  title={isPaid ? t.table.action.history : t.table.action.record}
                  onClick={() => {
                    if (isPaid) setHistoryRow(r)
                    else setPayingRow(r)
                  }}
                >
                  <BanknotesIcon className="w-5 h-5 text-slate-500" />
                </button>
              </TableCell>
            </TableRow>
          )
        })}
        {sortedRows.length === 0 && (
          <TableRow>
            <TableCell colSpan={selectMode ? 10 : 9} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
              {t.table.empty}
            </TableCell>
          </TableRow>
        )}
      </TableBody>

        <tfoot className="bg-slate-50/50">
          <tr className="border-t border-slate-200">
            {selectMode && <td className="px-6 py-4" />}
            <td className="px-6 py-4" />
            <td className="px-6 py-4 text-right font-bold text-slate-500 text-xs uppercase tracking-wider">{t.table.totals}</td>
            <td className="px-6 py-4 text-right font-extrabold text-slate-800 tabular-nums whitespace-nowrap">{fmtInt(totalInitial)} ₫</td>
            <td className="px-6 py-4 text-right font-extrabold text-slate-800 tabular-nums whitespace-nowrap">{fmtInt(totalRemaining)} ₫</td>
            <td className="px-6 py-4" colSpan={5} />
          </tr>
        </tfoot>
    </Table>
  )
}

/* --- Column Header with Excel-style dropdown --- */
type ColumnHeaderProps = {
  colKey: SortKeyWithBranch | 'remaining'
  label: string
  sortKey: SortKeyWithBranch | 'remaining'
  sortAsc: boolean
  onSort: (k: SortKeyWithBranch | 'remaining', asc: boolean) => void
  values: string[]
  activeFilter: Set<string> | null
  onFilter: (s: Set<string> | null) => void
  onClear: () => void
  open: boolean
  onToggle: () => void
  onClose: () => void
  dict: { sortAsc: string; sortDesc: string; selectAll: string; deselectAll: string; filterPlaceholder: string; clearFilters: string }
  right?: boolean
  center?: boolean
  className?: string
}

function ColumnHeader({
  colKey,
  label,
  sortKey,
  sortAsc,
  onSort,
  values,
  activeFilter,
  onFilter,
  onClear,
  open,
  onToggle,
  onClose,
  dict,
  right,
  center,
  className = '',
}: ColumnHeaderProps) {
  const ref = useRef<HTMLTableCellElement>(null)
  const [filterSearch, setFilterSearch] = useState('')
  const [localChecked, setLocalChecked] = useState<Set<string>>(new Set(values))

  useEffect(() => {
    if (open) {
      setLocalChecked(activeFilter ? new Set(activeFilter) : new Set(values))
      setFilterSearch('')
    }
  }, [open, values, activeFilter])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onClose])

  const isActive = sortKey === colKey
  const hasFilter = !!activeFilter
  const dropdownStyle = useMemo(() => {
    if (!open || !ref.current) return undefined
    const rect = ref.current.getBoundingClientRect()
    return { top: rect.bottom + window.scrollY + 4, left: right ? Math.max(0, rect.right - 220) : rect.left }
  }, [open, right])

  const filteredValues = filterSearch
    ? values.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase()))
    : values

  const allVisibleChecked = filteredValues.length > 0 && filteredValues.every(v => localChecked.has(v))

  function toggleAll() {
    const next = new Set(localChecked)
    if (allVisibleChecked) {
      filteredValues.forEach(v => next.delete(v))
    } else {
      filteredValues.forEach(v => next.add(v))
    }
    setLocalChecked(next)
  }

  function toggleOne(v: string) {
    const next = new Set(localChecked)
    if (next.has(v)) next.delete(v); else next.add(v)
    setLocalChecked(next)
  }

  function handleApply() {
    let finalChecked = localChecked
    if (filterSearch) {
      finalChecked = new Set([...localChecked].filter(x => filteredValues.includes(x)))
    }
    if (finalChecked.size >= values.length) onFilter(null); else onFilter(finalChecked)
  }

  return (
    <th className={`px-6 py-4 bg-gray-50/75 border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-slate-500 ${right ? 'text-right' : ''} ${className} relative`} ref={ref}>
      <div className={`flex items-center gap-1 font-bold ${center ? 'justify-center' : right ? 'justify-end' : 'justify-start'}`}>
        <span className="select-none">{label}</span>
        {isActive && (
          sortAsc
            ? <BarsArrowUpIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
            : <BarsArrowDownIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
        )}
        {hasFilter && <FunnelIcon className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          className="ml-0.5 p-0.5 rounded hover:bg-gray-200 transition-colors flex-shrink-0 cursor-pointer"
          aria-label={`Menu ${label}`}
        >
          <EllipsisVerticalIcon className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {open && dropdownStyle && (
        <div
          className="fixed bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] min-w-[220px] text-left text-sm text-gray-700"
          style={dropdownStyle}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-2 space-y-1">
            <button
              type="button"
              onClick={() => onSort(colKey, true)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${isActive && sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'}`}
            >
              <BarsArrowUpIcon className="w-4 h-4" />
              {dict.sortAsc}
            </button>
            <button
              type="button"
              onClick={() => onSort(colKey, false)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${isActive && !sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'}`}
            >
              <BarsArrowDownIcon className="w-4 h-4" />
              {dict.sortDesc}
            </button>
          </div>

          <div className="border-t border-gray-200" />

          <div className="px-3 py-2">
            <input
              type="text"
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              placeholder={dict.filterPlaceholder}
              className="w-full mb-2 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-gray-900"
            />

            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-blue-600 hover:text-blue-800 mb-1 cursor-pointer font-medium"
            >
              {allVisibleChecked ? dict.deselectAll : dict.selectAll}
            </button>

            <div className="max-h-[200px] overflow-y-auto space-y-0.5">
              {filteredValues.map(v => (
                <label key={v} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localChecked.has(v)}
                    onChange={() => toggleOne(v)}
                    className="accent-blue-600 rounded"
                  />
                  <span className="truncate text-xs">{v || '(Empty)'}</span>
                </label>
              ))}
              {filteredValues.length === 0 && (
                <div className="text-xs text-gray-400 py-1 text-center">—</div>
              )}
            </div>
          </div>

          <div className="border-t border-gray-200" />

          <div className="px-3 py-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClear}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-xs font-semibold cursor-pointer"
            >
              {dict.clearFilters}
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors text-xs font-semibold cursor-pointer"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </th>
  )
}

async function handleExport(sortedRows: { row: CreditRow }[], totalsMap: Record<string, Totals>) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Credits')

  ws.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Customer', key: 'customer', width: 24 },
    { header: 'Initial credit', key: 'initial', width: 14 },
    { header: 'Remaining', key: 'remaining', width: 14 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Reference', key: 'reference', width: 18 },
    { header: 'Branch', key: 'branch', width: 14 },
    { header: 'Shift', key: 'shift', width: 12 },
    { header: 'HandledBy', key: 'handledBy', width: 16 },
    { header: 'Notes', key: 'notes', width: 24 },
  ]

  sortedRows.forEach(x => {
    ws.addRow({
      date: fmtDateDMY(x.row.date),
      customer: x.row.customer_name || '',
      initial: Math.round(x.row.amount || 0),
      remaining: Math.round(totalsMap[x.row.id]?.remaining ?? Math.round(x.row.amount || 0)),
      status: totalsMap[x.row.id]?.status ?? 'Unpaid',
      reference: x.row.reference || '',
      branch: x.row.branch || '',
      shift: x.row.shift || '',
      handledBy: x.row.handledBy || '',
      notes: x.row.note || '',
    })
  })

  const totalInitial = sortedRows.reduce((s, x) => s + Math.round(x.row.amount || 0), 0)
  const totalRemaining = sortedRows.reduce((s, x) => s + Math.round(totalsMap[x.row.id]?.remaining ?? Math.round(x.row.amount || 0)), 0)
  ws.addRow({
    date: '',
    customer: 'TOTALS',
    initial: totalInitial,
    remaining: totalRemaining,
    status: '',
    reference: '',
    branch: '',
    shift: '',
    handledBy: '',
    notes: '',
  })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `credits_${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}


