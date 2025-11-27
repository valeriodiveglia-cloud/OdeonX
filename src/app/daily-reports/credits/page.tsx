// app/daily-reports/credits/page.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  PlusIcon,
  XMarkIcon,
  CheckCircleIcon,
  ArrowUpTrayIcon,
  MagnifyingGlassIcon,
  ArrowsUpDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  BanknotesIcon,
  ClockIcon,
  PencilSquareIcon,
  TrashIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CreditCardIcon,
  WalletIcon,
  BuildingLibraryIcon,
} from '@heroicons/react/24/outline'
import CircularLoader from '@/components/CircularLoader'

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

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow">{children}</div>
}
function PageHeader({ title, left, after, right }: { title: string; left?: React.ReactNode; after?: React.ReactNode; right?: React.ReactNode }) {
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

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-3xl h-full bg-white shadow-xl overflow-y-auto">{children}</div>
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
    <Overlay onClose={onClose}>
      <div className="h-full flex flex-col text-gray-900">
        <div className="px-4 md:px-6 pt-4 pb-3 flex items-center justify-between border-b">
          <div className="text-xl font-bold">{t.editPayment}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>
        <div className="px-4 md:px-6 py-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-800">{t.dateTime}</label>
              <input type="datetime-local" className={inputBase} value={date} onChange={e => setDate(e.target.value)} />
              <div className="text-xs text-gray-500 mt-1">{t.dateHint}</div>
            </div>
            <div>
              <label className="text-sm text-gray-800">{t.amount}</label>
              <MoneyInput value={amount} onChange={setAmount} className="h-11" />
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-800">{t.note}</label>
            <input className={inputBase} value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <div className="px-4 md:px-6 py-4 border-t flex items-center justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border hover:opacity-80">{t.cancel}</button>
          <button onClick={handleSave} disabled={!canSave} className="ml-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 disabled:opacity-50">{t.saveChanges}</button>
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
    <Overlay onClose={onClose}>
      <div className="h-full flex flex-col text-gray-900">
        <div className="px-4 md:px-6 pt-handlebars tm-uqs-grid-vertical pb-3 flex items-center justify-between border-b">
          <div className="flex items-center gap-3">
            <div className="text-xl font-bold">{t.title}</div>
            <span className={`text-xs px-2 py-1 rounded-full ${summary.left === 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {summary.left === 0 ? t.badge.paid : t.badge.unpaid}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>

        <div className="px-4 md:px-6 py-4">
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">{t.summary.initial}</div>
              <div className="text-lg font-semibold">{fmtInt(summary.total)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">{t.summary.paid}</div>
              <div className="text-lg font-semibold">{fmtInt(summary.paid)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">{t.summary.remaining}</div>
              <div className="text-lg font-semibold">{fmtInt(summary.left)}</div>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="text-sm text-gray-600">{t.empty}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-600">
                    <th className="text-left p-2 w-[14rem]">{headers.dateTime || t.table?.dateTime || 'Date and time'}</th>
                    <th className="text-right p-2 w-[10rem]">{headers.amount || t.table?.amount || 'Amount'}</th>
                    <th className="text-left p-2">{headers.methodNote || headers.note || t.table?.methodNote || t.table?.note || 'Method / Note'}</th>
                    <th className="text-center p-2 w-16">{headers.edit || 'Edit'}</th>
                    <th className="text-center p-2 w-16">{headers.delete || 'Delete'}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(p => (
                    <tr key={p.id} className="border-t">
                      <td className="p-2 whitespace-nowrap">{fmtDateTimeDMYHM(p.date)}</td>
                      <td className="p-2 text-right tabular-nums">{fmtInt(p.amount)}</td>
                      <td className="p-2">{p.note || '-'}</td>
                      <td className="p-2 text-center">
                        <button className="p-0 h-auto w-auto bg-transparent hover:opacity-80" title={headers.edit || 'Edit'} onClick={() => setEditing(p)}>
                          <PencilSquareIcon className="w-5 h-5 text-blue-700" />
                        </button>
                      </td>
                      <td className="p-2 text-center">
                        <button
                          className="p-0 h-auto w-auto bg-transparent hover:opacity-80 disabled:opacity-50"
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
                          <TrashIcon className={`w-5 h-5 ${deletingId === p.id ? 'text-gray-400' : 'text-red-600'}`} />
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
            creditId={credit.id}
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
      className={`w-full inline-flex items-center justify-center gap-2 px-3 h-11 rounded-xl border transition ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-600/10 text-blue-900 border-blue-300 hover:bg-blue-600/20'
        }`}
      title={title}
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium">{children}</span>
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
    <Overlay onClose={onClose}>
      <div className="h-full flex flex-col text-gray-900">
        <div className="px-4 md:px-6 pt-4 pb-3 flex items-center justify-between border-b">
          <div className="text-xl font-bold">{t.confirmPayment}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>

        <div className="px-4 md:px-6 py-4 space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">{t.customer}</div>
              <div className="font-medium truncate">{credit.customer_name || '-'}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">{t.initial}</div>
              <div className="font-semibold">{fmtInt(credit.amount)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">{t.remaining}</div>
              <div className="font-semibold">{fmtInt(remaining)}</div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <SectionCard title={t.details.title}>
              <div className="grid gap-4">
                <div>
                  <label className="text-sm text-gray-800">{t.details.dateTime}</label>
                  <input type="datetime-local" className={inputBase} value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-800">{t.details.amount}</label>
                    <button
                      type="button"
                      onClick={() => setAmount(remaining)}
                      className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                      title={t.details.maxTitle}
                    >
                      {t.details.max}
                    </button>
                  </div>
                  <MoneyInput value={amount} onChange={setAmount} className="h-11" />
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-gray-500">{t.details.maxLabel.replace('{amount}', fmtInt(remaining))}</span>
                    {amountError && <span className="text-red-600">{amountError}</span>}
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title={t.method.title}>
              <div className="grid grid-cols-2 gap-2">
                <MethodButton active={method === 'cash'} onClick={() => setMethod('cash')} title={t.methods.cash} icon={BanknotesIcon}>{t.methods.cash}</MethodButton>
                <MethodButton active={method === 'card'} onClick={() => setMethod('card')} title={t.methods.card} icon={CreditCardIcon}>{t.methods.card}</MethodButton>
                <MethodButton active={method === 'bank'} onClick={() => setMethod('bank')} title={t.methods.bank} icon={BuildingLibraryIcon}>{t.methods.bank}</MethodButton>
                <MethodButton active={method === 'other'} onClick={() => setMethod('other')} title={t.methods.other} icon={WalletIcon}>{t.methods.other}</MethodButton>
              </div>
              {method === 'other' && (
                <div className="mt-3">
                  <label className="text-sm text-gray-800">{t.method.otherLabel}</label>
                  <input className={inputBase} placeholder={t.method.otherPlaceholder} value={otherText} onChange={e => setOtherText(e.target.value)} />
                </div>
              )}
              {methodError && <div className="mt-2 text-xs text-red-600">{methodError}</div>}
            </SectionCard>
          </div>
        </div>

        <div className="px-4 md:px-6 py-4 border-t flex items-center justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border hover:opacity-80">{t.cancel}</button>
          <button
            onClick={handleSave}
            disabled={hasError || saving}
            className={`ml-2 px-4 py-2 rounded-lg text-white hover:opacity-80 ${hasError || saving ? 'bg-blue-400' : 'bg-blue-600'}`}
            title={hasError ? t.method.fixErrors : t.method.saveTitle}
          >
            {saving ? t.saving : t.savePayment}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

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
  historyT,
  t,
  errors,
}: {
  mode: 'create' | 'view' | 'edit'
  staffOpts: string[]
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

  const defaultShift = useMemo(() => pickCurrentShiftName() || currentShiftName || '', [currentShiftName])
  const [shift, setShift] = useState<string>(initial.shift || defaultShift)

  const [handledBy, setHandledBy] = useState<string>(initial.handledBy || currentUserName || staffOpts[0] || '')
  const [note, setNote] = useState<string>(initial.note || '')

  const [isPaid, setIsPaid] = useState<boolean>(false)
  const [remaining, setRemaining] = useState<number>(0)
  const [showHistory, setShowHistory] = useState(false)

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
      <Overlay onClose={onClose}>
        <div className="h-full flex flex-col text-gray-900">
          <div className="px-4 md:px-6 pt-4 pb-3 flex items-center justify-between border-b">
            <div className="text-xl font-bold">{viewMode ? t.title.view : initial.id ? t.title.edit : t.title.new}</div>
            <div className="flex items-center gap-2">
              {initial.id && (
                <button onClick={() => setShowHistory(true)} className="inline-flex items-center gap-2 px-3 h-9 rounded-lg border hover:bg-gray-50" title={t.history}>
                  <ClockIcon className="w-5 h-5" /> {t.history}
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
                  <label className="text-sm text-gray-800">{t.fields.branch}</label>
                  <input className={`${inputBase} ${branchOk ? 'bg-gray-50' : 'bg-red-50 border-red-400'}`} value={selectedBranchName || ''} readOnly />
                  {!branchOk && <div className="mt-1 text-xs text-red-600">{errors.branch}</div>}
                </div>
                <div>
                  <label className="text-sm text-gray-800">{t.fields.date}</label>
                  <input type="date" className={inputBase} value={date} onChange={e => setDate(e.target.value)} disabled={viewMode} />
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm text-gray-800">{t.fields.customer}</label>
                  <input className={inputBase} value={customerName} onChange={e => setCustomerName(e.target.value)} disabled={viewMode} />
                </div>
                <div>
                  <label className="text-sm text-gray-800">{t.fields.phone}</label>
                  <input className={inputBase} value={customerPhone || ''} onChange={e => setCustomerPhone(e.target.value)} disabled={viewMode} />
                </div>
                <div>
                  <label className="text-sm text-gray-800">{t.fields.email}</label>
                  <input className={inputBase} value={customerEmail || ''} onChange={e => setCustomerEmail(e.target.value)} disabled={viewMode} />
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm text-gray-800">{t.fields.initial}</label>
                  <MoneyInput value={amount} onChange={setAmount} className="h-11" disabled={viewMode} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm text-gray-800">{t.fields.remaining}</label>
                  <input className={`${inputBase} bg-gray-50`} value={fmtInt(remaining)} readOnly />
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm text-gray-800">{t.fields.reference}</label>
                  <input className={inputBase} value={reference} onChange={e => setReference(e.target.value)} disabled={viewMode} />
                </div>
                <div>
                  <label className="text-sm text-gray-800">{t.fields.shift}</label>
                  <input className={inputBase} value={shift} onChange={e => setShift(e.target.value)} disabled={viewMode} />
                </div>
                <div>
                  <label className="text-sm text-gray-800">{t.fields.handledBy}</label>
                  <input className={`${inputBase} bg-gray-50`} value={handledBy || currentUserName || ''} readOnly />
                </div>
              </div>

              <div className="mt-4">
                <label className="text-sm text-gray-800">{t.fields.notes}</label>
                <textarea className={`${inputBase} h-24`} value={note || ''} onChange={e => setNote(e.target.value)} placeholder={t.fields.notesPlaceholder} disabled={viewMode} />
              </div>
            </SectionCard>
          </div>

          <div className="px-4 md:px-6 py-4 border-t flex items-center justify-between">
            <div className="flex items-center gap-2">
              {viewMode ? (
                <button onClick={() => setViewMode(false)} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80">{t.actions.edit}</button>
              ) : (
                initial.id && <button onClick={handleDelete} className="px-4 py-2 rounded-lg border text-red-600 hover:bg-red-50">{t.actions.delete}</button>
              )}
            </div>
            <div>
              <button onClick={onClose} className="px-4 py-2 rounded-lg border hover:opacity-80">{t.actions.close}</button>
              {!viewMode && (
                <button onClick={handleSave} disabled={!canSave} className="ml-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 disabled:opacity-50">{t.actions.save}</button>
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

type SortKeyBase = 'date' | 'customer_name' | 'amount' | 'reference' | 'shift' | 'handledBy' | 'status'
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
  const {
    rows,
    totalsMap,
    staffOpts,
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
  } = useCredits()

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

  const [search, setSearch] = useState<string>('')
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

  const now = new Date()
  const [year, setYear] = useState<number>(now.getFullYear())
  const [month, setMonth] = useState<number>(now.getMonth())
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

  const visibleRows = useMemo(() => {
    const branchName = (activeBranch || '').trim()
    const base = branchName ? nowMonthFiltered.filter(x => (x.row.branch || '') === branchName) : nowMonthFiltered
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
        stat.includes(q)
      )
    })
  }, [nowMonthFiltered, search, activeBranch])

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
    <div className="max-w-none mx-auto p-4 text-gray-100">
      <PageHeader
        title={t.title}
        left={
          <>
            {selectMode && (
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
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 hover:bg-blue-200 hover:text-red-700 disabled:opacity-50"
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
            )}
          </>
        }
        after={
          <div className="ml-2 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-600/15 px-3 py-1 text-xs text-blue-100" title={t.branchPill.tooltip}>
            <span className="h-2 w-2 rounded-full bg-green-400" />
            <span className="font-medium">{activeBranch ? activeBranch : t.branchPill.all}</span>
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
                <button onClick={() => setSearch('')} className="absolute right-2 top-2 h-5 w-5 text-blue-200 hover:text-white" aria-label={t.search.clear} title={t.search.clear}>
                  ×
                </button>
              )}
            </div>

            <button
              onClick={() => void handleExport(sortedRows, totalsMap)}
              className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border border-blue-400/30"
              title={t.export.title}
            >
              <ArrowUpTrayIcon className="w-5 h-5" /> {t.export.label}
            </button>

            <button
              onClick={() => {
                setSelectMode(s => !s)
                setMenuOpen(false)
              }}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border ${selectMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border-blue-400/30'
                }`}
              title={selectMode ? t.select.exitTitle : t.select.enterTitle}
            >
              <CheckCircleIcon className="w-5 h-5" />
              {selectMode ? t.select.active : t.select.inactive}
            </button>

            <button
              onClick={() => {
                setEditorMode('create')
                setInitialRow({
                  date: todayISO(),
                  handledBy: currentUserName,
                  shift: pickCurrentShiftName() || currentShiftName || null,
                })
                setOpenEditor(true)
              }}
              className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-80"
              title={t.actions.newTitle}
            >
              <PlusIcon className="w-5 h-5" /> {t.actions.new}
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
        t={t.monthNav}
      />

      <Card>
        <div className="p-3 overflow-x-auto">
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
          />
        </div>
      </Card>

      {openEditor && initialRow && (
        <EditorModal
          mode={editorMode}
          initial={initialRow}
          staffOpts={staffOpts.length ? staffOpts : ['Staff']}
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

function MonthNav({ monthLabel, monthInputValue, onPickMonth, prevMonth, nextMonth, guardDisabled, t }: { monthLabel: string; monthInputValue: string; onPickMonth: (v: string) => void; prevMonth: () => void; nextMonth: () => void; guardDisabled: boolean; t: ReturnType<typeof getDailyReportsDictionary>['credits']['monthNav'] }) {
  const baseBtn = 'flex items-center gap-1 text-blue-100 hover:text-white transition'

  return (
    <div className="mt-3 mb-4 flex items-center justify-between text-sm text-blue-100">
      <button type="button" onClick={prevMonth} className={baseBtn} title={t.prevTitle}>
        <ChevronLeftIcon className="w-4 h-4" />
        <span>{t.previous}</span>
      </button>

      <div className="flex items-center gap-2 text-white">
        <span className="text-base font-semibold">{monthLabel}</span>
        <div className="relative w-6 h-6">
          <CalendarDaysIcon className="w-6 h-6 text-blue-200" />
          <input type="month" value={monthInputValue} onChange={e => onPickMonth(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={t.pick} title={t.pick} />
        </div>
      </div>

      <button type="button" onClick={guardDisabled ? undefined : nextMonth} disabled={guardDisabled} aria-disabled={guardDisabled} className={`${baseBtn} ${guardDisabled ? 'cursor-default' : ''}`} title={t.nextTitle}>
        <span>{t.next}</span>
        <ChevronRightIcon className="w-4 h-4" />
      </button>
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
}) {
  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = rows.some(r => !!selected[r.id]) && !rows.every(r => !!selected[r.id])
  }, [selected, rows])

  const SortableHeader = ({ label, colKey, className }: { label: string; colKey: SortKeyWithBranch; className?: string }) => {
    const active = sort.key === colKey
    const dir = sort.dir
    return (
      <th className={`p-2 ${className || ''}`}>
        <button type="button" onClick={() => setSort((prev: any) => (prev.key !== colKey ? { key: colKey, dir: 'asc' } : { key: colKey, dir: prev.dir === 'asc' ? 'desc' : 'asc' }))} className="inline-flex items-center gap-1 font-semibold text-left hover:opacity-80" title={t.table.sortTitle.replace('{label}', label)}>
          <span>{label}</span>
          {!active && <ArrowsUpDownIcon className="w-4 h-4 text-gray-400" />}
          {active && dir === 'asc' && <ChevronUpIcon className="w-4 h-4 text-gray-700" />}
          {active && dir === 'desc' && <ChevronDownIcon className="w-4 h-4 text-gray-700" />}
        </button>
      </th>
    )
  }

  const totalInitial = useMemo(() => sortedRows.reduce((s, x) => s + Math.round(x.row.amount || 0), 0), [sortedRows])
  const totalRemaining = useMemo(() => sortedRows.reduce((s, x) => s + Math.round(totalsMap[x.row.id]?.remaining ?? Math.round(x.row.amount || 0)), 0), [sortedRows, totalsMap])

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
                title={t.table.selectAll}
              />
            ) : null}
          </th>
          <SortableHeader label={t.table.headers.date} colKey="date" className="w-[8.5rem] text-left" />
          <SortableHeader label={t.table.headers.customer} colKey="customer_name" className="w-[22rem] text-left" />
          <SortableHeader label={t.table.headers.initial} colKey="amount" className="w-[8rem] text-right" />
          <th className="p-2 w-[8rem] text-right font-semibold">{t.table.headers.remaining}</th>
          <SortableHeader label={t.table.headers.status} colKey="status" className="w-[8rem] text-left" />
          <SortableHeader label={t.table.headers.reference} colKey="reference" className="w-[12rem] text-left" />
          <SortableHeader label={t.table.headers.branch} colKey="branch" className="w-[10rem] text-left" />
          <SortableHeader label={t.table.headers.shift} colKey="shift" className="w-[9rem] text-left" />
          <SortableHeader label={t.table.headers.handledBy} colKey="handledBy" className="w-[11rem] text-left" />
          <th className="p-2 w-12 text-center">{t.table.headers.action}</th>
        </tr>
      </thead>
      <tbody>
        {sortedRows.map(x => {
          const r = x.row
          const rem = totalsMap[r.id]?.remaining ?? Math.round(r.amount || 0)
          const isPaid = rem === 0
          const statusRaw = totalsMap[r.id]?.status || (isPaid ? 'Paid' : 'Unpaid')
          const statusText = statusRaw === 'Paid' ? t.status.paid : statusRaw === 'Unpaid' ? t.status.unpaid : t.status.open
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
              <td className="p-2 w-7" onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                {selectMode ? (
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={!!selected[r.id]}
                    onChange={e => setSelected((prev: any) => ({ ...prev, [r.id]: e.target.checked }))}
                    title={t.table.selectRow}
                  />
                ) : null}
              </td>
              <td className="p-2 whitespace-nowrap">{fmtDateDMY(r.date)}</td>
              <td className="p-2 whitespace-nowrap">{r.customer_name || '-'}</td>
              <td className="p-2 text-right tabular-nums">{fmtInt(r.amount)}</td>
              <td className="p-2 text-right tabular-nums">{fmtInt(rem)}</td>
              <td className="p-2 whitespace-nowrap">
                <span className={`px-2 py-0.5 rounded-full text-xs ${isPaid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {statusText}
                </span>
              </td>
              <td className="p-2 whitespace-nowrap">{r.reference || '-'}</td>
              <td className="p-2 whitespace-nowrap">{r.branch || '-'}</td>
              <td className="p-2 whitespace-nowrap">{r.shift || '-'}</td>
              <td className="p-2 whitespace-nowrap">{r.handledBy || '-'}</td>
              <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                <button
                  className={`p-0 h-auto w-auto bg-transparent ${isPaid ? 'opacity-60 hover:opacity-80' : 'hover:opacity-80'}`}
                  title={isPaid ? t.table.action.history : t.table.action.record}
                  onClick={() => {
                    if (isPaid) setHistoryRow(r)
                    else setPayingRow(r)
                  }}
                >
                  <BanknotesIcon className={`w-6 h-6 ${isPaid ? 'text-gray-500' : 'text-blue-700'}`} />
                </button>
              </td>
            </tr>
          )
        })}
        {sortedRows.length === 0 && (
          <tr>
            <td colSpan={11} className="text-center text-sm text-gray-500 py-6">
              {t.table.empty}
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
            <td className="p-2 text-right font-semibold tabular-nums">{fmtInt(totalInitial)}</td>
            <td className="p-2 text-right font-semibold tabular-nums">{fmtInt(totalRemaining)}</td>
            <td className="p-2" colSpan={6} />
          </tr>
        </tfoot>
      )}
    </table>
  )
}

async function handleExport(sortedRows: { row: CreditRow }[], totalsMap: Record<string, Totals>) {
  const XLSX = await import('xlsx')
  const data = sortedRows.map(x => ({
    Date: fmtDateDMY(x.row.date),
    Customer: x.row.customer_name || '',
    'Initial credit': Math.round(x.row.amount || 0),
    Remaining: Math.round(totalsMap[x.row.id]?.remaining ?? Math.round(x.row.amount || 0)),
    Status: totalsMap[x.row.id]?.status ?? 'Unpaid',
    Reference: x.row.reference || '',
    Branch: x.row.branch || '',
    Shift: x.row.shift || '',
    HandledBy: x.row.handledBy || '',
    Notes: x.row.note || '',
  }))
  const totalInitial = sortedRows.reduce((s, x) => s + Math.round(x.row.amount || 0), 0)
  const totalRemaining = sortedRows.reduce((s, x) => s + Math.round(totalsMap[x.row.id]?.remaining ?? Math.round(x.row.amount || 0)), 0)
  data.push({
    Date: '',
    Customer: 'TOTALS',
    'Initial credit': totalInitial,
    Remaining: totalRemaining,
    Status: '',
    Reference: '',
    Branch: '',
    Shift: '',
    HandledBy: '',
    Notes: '',
  } as any)
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 24 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Credits')
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `credits_${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

type ShiftWin = { name: string; startMin: number; endMin: number }
const SETTINGS_LS_KEY = 'dailysettings.initialInfo.v1'

function hhmmToMin(t: string): number {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return NaN
  const h = Number(m[1]), min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return NaN
  return h * 60 + min
}
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
            const s = hhmmToMin(m[2]), e = hhmmToMin(m[3])
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
    const inWin = w.startMin <= w.endMin ? nowMin >= w.startMin && nowMin < w.endMin : nowMin >= w.startMin || nowMin < w.endMin
    if (inWin) return w.name
  }

  const labels = loadShiftLabels()
  if (labels.includes('All day')) return 'All day'
  if (labels.includes('Lunch') && nowMin < 16 * 60) return 'Lunch'
  if (labels.includes('Dinner')) return 'Dinner'
  return labels[0] || ''
}
