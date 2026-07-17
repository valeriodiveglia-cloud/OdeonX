// app/daily-reports/deposits/page.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  PlusIcon,
  XMarkIcon,
  ArrowUpTrayIcon,
  MagnifyingGlassIcon,
  BarsArrowUpIcon,
  BarsArrowDownIcon,
  FunnelIcon,
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
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowsUpDownIcon,
} from '@heroicons/react/24/outline'
import CircularLoader from '@/components/CircularLoader'

import { supabase } from '@/lib/supabase_shim'
import { useDRBranch } from '../_data/useDRBranch'
import { useBridgeLegacyBranch as useBridgeLegacyBranchRaw } from '../_data/branchLegacyBridge'
import { useDeposits } from '../_data/useDeposits'
import { useSettings } from '@/contexts/SettingsContext'
import { drI18n } from '../_i18n'
import MonthPicker from '@/components/MonthPicker'
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


function StatPill({ label, value, money }: { label: string; value: number; money?: boolean }) {
  return (
    <div className="text-left rounded-xl border border-slate-200/60 bg-white text-slate-800 px-3.5 py-3 shadow-3xs hover:shadow-2xs transition-all duration-250">
      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-none">{label}</div>
      <div className="text-sm font-extrabold text-slate-800 tabular-nums mt-2 leading-none">{money ? fmtInt(value) : value}</div>
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
    () => initial.shift || currentShiftName || '',
    [initial.shift, currentShiftName],
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

type SortKeyBase = 'date' | 'customer_name' | 'amount' | 'paid' | 'remaining' | 'reference' | 'shift' | 'handledBy' | 'status'
type SortKeyWithBranch = SortKeyBase | 'branch'
type SortState = { key: SortKeyWithBranch | null; dir: 'asc' | 'desc' }

type RowCalc = { row: DepositRow; paid: number; remaining: number; status: TotalsStatus }

export default function DepositsPage() {
  // Month navigation (deve essere prima di useDeposits per passare year/month)
  const now = new Date()
  const [year, setYear] = useState<number>(now.getFullYear())
  const [month, setMonth] = useState<number>(now.getMonth())

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
  } = useDeposits({ year, month })

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

  const [columnFilters, setColumnFilters] = useState<Partial<Record<SortKeyWithBranch, Set<string>>>>({})
  const [openMenu, setOpenMenu] = useState<SortKeyWithBranch | null>(null)

  const columnMenuDict = {
    sortAsc: language === 'vi' ? 'Sắp xếp tăng dần' : 'Sort Ascending',
    sortDesc: language === 'vi' ? 'Sắp xếp giảm dần' : 'Sort Descending',
    selectAll: language === 'vi' ? 'Chọn tất cả' : 'Select All',
    deselectAll: language === 'vi' ? 'Bỏ chọn tất cả' : 'Deselect All',
    filterPlaceholder: language === 'vi' ? 'Lọc...' : 'Filter...',
    clearFilters: language === 'vi' ? 'Xóa bộ lọc' : 'Clear Filters',
  }

  function applySort(k: SortKeyWithBranch, asc: boolean) {
    setSortState({ key: k, dir: asc ? 'asc' : 'desc' })
    setOpenMenu(null)
  }

  function applyColumnFilter(col: SortKeyWithBranch, vals: Set<string> | null) {
    setColumnFilters(prev => ({ ...prev, [col]: vals }))
    setOpenMenu(null)
  }

  function clearColumnFilter(col: SortKeyWithBranch) {
    setColumnFilters(prev => {
      const next = { ...prev }
      delete next[col]
      return next
    })
    setOpenMenu(null)
  }

  const displayValue = React.useCallback(
    (x: RowCalc, key: SortKeyWithBranch): string => {
      switch (key) {
        case 'date': return fmtDateDMY(x.row.date)
        case 'customer_name': return x.row.customer_name || ''
        case 'amount': return fmtInt(x.row.amount)
        case 'paid': return fmtInt(x.paid)
        case 'remaining': return fmtInt(x.remaining)
        case 'status': return statusLabel(x.status, t.status)
        case 'reference': return x.row.reference || ''
        case 'branch': return x.row.branch || ''
        case 'shift': return x.row.shift || ''
        case 'handledBy': return x.row.handledBy || ''
        default: return ''
      }
    },
    [t.status]
  )

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
      return { row: r, paid: totals.paid, remaining: totals.remaining, status: totals.status }
    })
  }, [rows, totalsMap])


  const monthFiltered = useMemo(() => {
    return rowsWithCalc.filter(x => {
      // 1) Logic base: date in selected month
      const dstr = x.row.date || ''
      const d = /T/.test(dstr) ? new Date(dstr) : new Date(`${dstr}T00:00`)
      const inMonth = d >= monthStart && d < monthEnd

      // 2) Carry-over logic: if remaining > 0, we show it even if it's from the past
      // (The hook already fetches past unpaid deposits, but we must ensure we don't filter them out here)
      const isUnpaid = x.remaining > 0
      // We only want to "carry over" strict past deposits. Future deposits (if any)
      // matching the filter might be weird but let's stick to "unpaid or in-month".
      // Carry-over logic:
      if (inMonth) return true
      if (d < monthStart && isUnpaid) return true

      return false
    })
  }, [rowsWithCalc, monthStart, monthEnd])

  const columnValues = useMemo(() => {
    const map: Partial<Record<SortKeyWithBranch, string[]>> = {}
    const keys: SortKeyWithBranch[] = ['date', 'customer_name', 'amount', 'paid', 'remaining', 'status', 'reference', 'branch', 'shift', 'handledBy']
    keys.forEach(k => {
      const s = new Set<string>()
      monthFiltered.forEach(x => { const v = displayValue(x, k); if (v) s.add(v) })
      map[k] = Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    })
    return map
  }, [monthFiltered, displayValue])

  const visibleRows = useMemo(() => {
    const branchName = (activeBranch || '').trim()
    let base = branchName
      ? monthFiltered.filter(x => (x.row.branch || '') === branchName)
      : monthFiltered

    // Apply column checklist filters
    for (const [col, allowed] of Object.entries(columnFilters)) {
      if (allowed && allowed.size > 0) {
        base = base.filter(x => allowed.has(displayValue(x, col as SortKeyWithBranch)))
      }
    }

    return base
  }, [monthFiltered, activeBranch, columnFilters, displayValue])

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
        case 'paid':
          return (a.paid - b.paid) * dir
        case 'remaining':
          return (a.remaining - b.remaining) * dir
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

  const stats = useMemo(() => {
    const count = visibleRows.length
    const totalAmount = visibleRows.reduce((s, x) => s + (x.row.amount || 0), 0)
    const totalPaid = visibleRows.reduce((s, x) => s + (totalsMap[x.row.id]?.paid || 0), 0)
    const totalRemaining = visibleRows.reduce((s, x) => s + (totalsMap[x.row.id]?.remaining || 0), 0)
    return { count, totalAmount, totalPaid, totalRemaining }
  }, [visibleRows, totalsMap])

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <PageHeader
        title={t.pageTitle || t.title || 'Deposits'}
        subtitle={t.subtitle}
        badgeText={activeBranch ? activeBranch : t.branchChip?.all || '(all)'}
        left={
          selectMode ? (
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
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 hover:bg-slate-100 disabled:opacity-50 text-xs font-semibold text-left"
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
          ) : undefined
        }
        actions={
          <div className="flex items-center gap-2">

            <Button
              variant="secondary-dark"
              onClick={() => void handleExport(sortedRows, totalsMap, t)}
              className="px-3 h-9 text-xs font-semibold"
              title={t.export.title}
              icon={ArrowUpTrayIcon}
            >
              <span>{t.export.button}</span>
            </Button>

            <Button
              variant={selectMode ? 'primary' : 'secondary-dark'}
              onClick={() => {
                setSelectMode(s => !s)
                setMenuOpen(false)
              }}
              className="px-3 h-9 text-xs font-semibold"
              title={selectMode ? t.selectionMenu.exitTitle : t.selectionMenu.enterTitle}
              icon={CheckCircleIcon}
            >
              <span>{selectMode ? t.selectionMenu.activeLabel : t.selectionMenu.inactiveLabel}</span>
            </Button>

            <Button
              variant="primary"
              onClick={() => {
                setEditorMode('create')
                setInitialRow({
                  date: todayISO(),
                  event_date: '',
                  handledBy: currentUserName,
                  shift: currentShiftName || null,
                } as Partial<DepositRow>)
                setOpenEditor(true)
              }}
              className="px-3 h-9 text-xs font-semibold"
              title={t.common.newDeposit}
              icon={PlusIcon}
            >
              <span>{t.common.newDeposit}</span>
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

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatPill label={t.table?.totals ?? 'Total Deposits'} value={stats.count} />
        <StatPill label={t.columns?.agreed ?? 'Total Amount'} value={stats.totalAmount} money />
        <StatPill label={t.columns?.paid ?? 'Total Paid'} value={stats.totalPaid} money />
        <StatPill label={t.columns?.remaining ?? 'Total Remaining'} value={stats.totalRemaining} money />
      </div>

      <TableContainer>
        {showLoading && rows.length === 0 && (
          <CircularLoader />
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
          monthStart={monthStart}
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
  monthStart,
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
  monthStart: Date
  t: any
  columnFilters: Partial<Record<SortKeyWithBranch, Set<string>>>
  openMenu: SortKeyWithBranch | null
  setOpenMenu: React.Dispatch<React.SetStateAction<SortKeyWithBranch | null>>
  columnValues: Partial<Record<SortKeyWithBranch, string[]>>
  applySort: (k: SortKeyWithBranch, asc: boolean) => void
  applyColumnFilter: (col: SortKeyWithBranch, vals: Set<string> | null) => void
  clearColumnFilter: (col: SortKeyWithBranch) => void
  columnMenuDict: { sortAsc: string; sortDesc: string; selectAll: string; deselectAll: string; filterPlaceholder: string; clearFilters: string }
}) {
  useEffect(() => {
    if (headerCbRef.current)
      headerCbRef.current.indeterminate =
        rows.some(r => !!selected[r.id]) && !rows.every(r => !!selected[r.id])
  }, [selected, rows, headerCbRef])

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
                title={t.selectionMenu.selectAllTitle}
              />
            </th>
          )}
          <ColumnHeader colKey="date" label={t.columns.date} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.date || []} activeFilter={columnFilters.date || null} onFilter={(s) => applyColumnFilter('date', s)} onClear={() => clearColumnFilter('date')} open={openMenu === 'date'} onToggle={() => setOpenMenu(v => v === 'date' ? null : 'date')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} className="w-[8.5rem]" />
          <ColumnHeader colKey="customer_name" label={t.columns.customer} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.customer_name || []} activeFilter={columnFilters.customer_name || null} onFilter={(s) => applyColumnFilter('customer_name', s)} onClear={() => clearColumnFilter('customer_name')} open={openMenu === 'customer_name'} onToggle={() => setOpenMenu(v => v === 'customer_name' ? null : 'customer_name')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} className="w-[16rem]" />
          <ColumnHeader colKey="amount" label={t.columns.agreed} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.amount || []} activeFilter={columnFilters.amount || null} onFilter={(s) => applyColumnFilter('amount', s)} onClear={() => clearColumnFilter('amount')} open={openMenu === 'amount'} onToggle={() => setOpenMenu(v => v === 'amount' ? null : 'amount')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} right className="w-[10rem]" />
          <ColumnHeader colKey="paid" label={t.columns.paid} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.paid || []} activeFilter={columnFilters.paid || null} onFilter={(s) => applyColumnFilter('paid', s)} onClear={() => clearColumnFilter('paid')} open={openMenu === 'paid'} onToggle={() => setOpenMenu(v => v === 'paid' ? null : 'paid')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} right className="w-[10rem]" />
          <ColumnHeader colKey="remaining" label={t.columns.remaining} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.remaining || []} activeFilter={columnFilters.remaining || null} onFilter={(s) => applyColumnFilter('remaining', s)} onClear={() => clearColumnFilter('remaining')} open={openMenu === 'remaining'} onToggle={() => setOpenMenu(v => v === 'remaining' ? null : 'remaining')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} right className="w-[10rem]" />
          <ColumnHeader colKey="status" label={t.columns.status} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.status || []} activeFilter={columnFilters.status || null} onFilter={(s) => applyColumnFilter('status', s)} onClear={() => clearColumnFilter('status')} open={openMenu === 'status'} onToggle={() => setOpenMenu(v => v === 'status' ? null : 'status')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} className="w-[8rem]" />
          <ColumnHeader colKey="reference" label={t.columns.reference} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.reference || []} activeFilter={columnFilters.reference || null} onFilter={(s) => applyColumnFilter('reference', s)} onClear={() => clearColumnFilter('reference')} open={openMenu === 'reference'} onToggle={() => setOpenMenu(v => v === 'reference' ? null : 'reference')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} className="w-[10rem]" />
          <ColumnHeader colKey="shift" label={t.columns.shift} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.shift || []} activeFilter={columnFilters.shift || null} onFilter={(s) => applyColumnFilter('shift', s)} onClear={() => clearColumnFilter('shift')} open={openMenu === 'shift'} onToggle={() => setOpenMenu(v => v === 'shift' ? null : 'shift')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} className="w-[7.5rem]" />
          <ColumnHeader colKey="handledBy" label={t.columns.handledBy} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.handledBy || []} activeFilter={columnFilters.handledBy || null} onFilter={(s) => applyColumnFilter('handledBy', s)} onClear={() => clearColumnFilter('handledBy')} open={openMenu === 'handledBy'} onToggle={() => setOpenMenu(v => v === 'handledBy' ? null : 'handledBy')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} className="w-[9.5rem]" />
          <th className="px-6 py-4 w-12 text-center bg-gray-50/75 border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-slate-500">{t.columns.action}</th>
        </TableHeadRow>
      </TableHead>
      <TableBody>
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
                    onChange={e =>
                      setSelected((prev: any) => ({
                        ...prev,
                        [r.id]: e.target.checked,
                      }))
                    }
                    title={t.selectionMenu.selectRowTitle}
                  />
                </TableCell>
              )}
              <TableCell className="whitespace-nowrap">
                <span className={new Date(r.date) < monthStart ? 'text-red-500 font-medium' : ''}>
                  {fmtDateDMY(r.date)}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap font-semibold text-slate-805">{r.customer_name || '-'}</TableCell>
              <TableCell className="text-right tabular-nums font-semibold text-slate-700 whitespace-nowrap">{fmtInt(r.amount)} ₫</TableCell>
              <TableCell className="text-right tabular-nums text-emerald-600 font-semibold whitespace-nowrap">{fmtInt(totals.paid || 0)} ₫</TableCell>
              <TableCell className="text-right tabular-nums text-slate-900 font-bold whitespace-nowrap">{fmtInt(totals.remaining || 0)} ₫</TableCell>
              <TableCell className="whitespace-nowrap">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${totals.status === 'Paid'
                    ? 'bg-emerald-50 text-emerald-700'
                    : totals.status === 'Unpaid'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-blue-50 text-blue-700'
                    }`}
                >
                  {statusText}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap text-slate-600 font-medium">{r.reference || '-'}</TableCell>
              <TableCell className="whitespace-nowrap">{r.shift || '-'}</TableCell>
              <TableCell className="whitespace-nowrap text-slate-600 font-medium">{r.handledBy || '-'}</TableCell>
              <TableCell className="text-center" onClick={e => e.stopPropagation()}>
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
                    className={`w-5 h-5 ${isPaid ? 'text-slate-450' : 'text-blue-600'}`}
                  />
                </button>
              </TableCell>
            </TableRow>
          )
        })}
        {sortedRows.length === 0 && (
          <TableRow>
            <TableCell colSpan={selectMode ? 11 : 10} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
              {t.table.noRows || 'No deposits recorded.'}
            </TableCell>
          </TableRow>
        )}
      </TableBody>

        <tfoot>
          <TableRow className="border-t border-slate-200 bg-slate-50/50">
            {selectMode && <TableCell className="w-12">{null}</TableCell>}
            <TableCell>{null}</TableCell>
            <TableCell className="text-right font-bold text-slate-800">{t.table.totals || 'Totals'}</TableCell>
            <TableCell className="text-right font-bold text-slate-700 tabular-nums whitespace-nowrap">
              {fmtInt(totalAmount)} ₫
            </TableCell>
            <TableCell className="text-right font-bold text-emerald-600 tabular-nums whitespace-nowrap">
              {fmtInt(totalPaid)} ₫
            </TableCell>
            <TableCell className="text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">
              {fmtInt(Math.max(0, totalAmount - totalPaid))} ₫
            </TableCell>
            <TableCell colSpan={5}>{null}</TableCell>
          </TableRow>
        </tfoot>
    </Table>
  )
}

/* --- Column Header with Excel-style dropdown --- */
type ColumnHeaderProps = {
  colKey: SortKeyWithBranch
  label: string
  sortKey: SortKeyWithBranch | null
  sortAsc: boolean
  onSort: (k: SortKeyWithBranch, asc: boolean) => void
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
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleScroll() {
      onClose();
    }
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [open, onClose])

  const isActive = sortKey === colKey
  const hasFilter = !!activeFilter
  const dropdownStyle = useMemo(() => {
    if (!open || !ref.current) return undefined
    const rect = ref.current.getBoundingClientRect()
    const width = 220;
      let left = right ? rect.right - width : rect.left;
      if (left + width > window.innerWidth) {
        left = window.innerWidth - width - 8;
      }
      if (left < 8) {
        left = 8;
      }
      return { top: rect.bottom + 4, left: left, width: `${width}px` };
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
    <th className={`p-2 ${right ? 'text-right' : ''} ${className} relative`} ref={ref}>
      <div className={`flex items-center gap-1 font-semibold ${center ? 'justify-center' : right ? 'justify-end' : 'justify-start'}`}>
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
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(t.export.sheetName ?? 'Deposits')

  ws.columns = [
    { header: t.export.colDate ?? 'Date', key: 'date', width: 12 },
    { header: t.export.colCustomer ?? 'Customer', key: 'customer', width: 24 },
    { header: t.export.colAgreedAmount ?? 'Agreed amount', key: 'agreed', width: 14 },
    { header: t.export.colPaid ?? 'Paid', key: 'paid', width: 14 },
    { header: t.export.colRemaining ?? 'Remaining', key: 'remaining', width: 14 },
    { header: t.export.colStatus ?? 'Status', key: 'status', width: 10 },
    { header: t.export.colReference ?? 'Reference', key: 'reference', width: 18 },
    { header: t.export.colBranch ?? 'Branch', key: 'branch', width: 14 },
    { header: t.export.colShift ?? 'Shift', key: 'shift', width: 12 },
    { header: t.export.colHandledBy ?? 'HandledBy', key: 'handledBy', width: 16 },
    { header: t.export.colNotes ?? 'Notes', key: 'notes', width: 32 },
  ]

  sortedRows.forEach(x => {
    const r = x.row
    const totals = totalsMap[r.id] || {
      paid: 0,
      remaining: Math.round(r.amount || 0),
      status: (r.amount || 0) > 0 ? 'Unpaid' : 'Open',
    }
    const statusText = statusLabel(totals.status, t.status)
    ws.addRow({
      date: fmtDateDMY(r.date),
      customer: r.customer_name || '',
      agreed: Math.round(r.amount || 0),
      paid: Math.round(totals.paid || 0),
      remaining: Math.round(totals.remaining || 0),
      status: statusText,
      reference: r.reference || '',
      branch: r.branch || '',
      shift: r.shift || '',
      handledBy: r.handledBy || '',
      notes: r.note || '',
    })
  })

  const totalAmount = sortedRows.reduce(
    (s, x) => s + Math.round(x.row.amount || 0),
    0,
  )
  const totalPaid = sortedRows.reduce(
    (s, x) => s + Math.round(totalsMap[x.row.id]?.paid || 0),
    0,
  )

  ws.addRow({
    date: '',
    customer: t.export.totalsRowLabel ?? 'TOTALS',
    agreed: totalAmount,
    paid: totalPaid,
    remaining: '',
    status: '',
    reference: '',
    branch: '',
    shift: '',
    handledBy: '',
    notes: '',
  })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
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
