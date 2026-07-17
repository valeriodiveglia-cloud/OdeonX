// app/daily-reports/cashout/page.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  PlusIcon,
  EllipsisVerticalIcon,
  XMarkIcon,
  CheckCircleIcon,
  ArrowUpTrayIcon,
  MagnifyingGlassIcon,
  ArrowsUpDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TrashIcon,
  BarsArrowUpIcon,
  BarsArrowDownIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline'

import {
  useCashout,
  type CashoutRow,
  type Sup,
} from '@/app/daily-reports/_data/useCashout'

import { useDailyReportSettings } from '@/app/daily-reports/_data/useDailyReportSettings'
import { useSettings } from '@/contexts/SettingsContext'
import MonthPicker from '@/components/MonthPicker'
import Button from '@/components/Button'
import { TableContainer, Table, TableHead, TableHeadRow, TableBody, TableRow, TableCell } from '@/components/Table'
import PageHeader from '@/components/PageHeader'
import { getDailyReportsDictionary } from '../_i18n'
import { SupplierCombobox } from '@/app/finance/components/SupplierComponents'

/* ---------- Const usate per util locali ---------- */
const SETTINGS_LS_KEY = 'dailysettings.initialInfo.v1'




function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4 bg-white shadow-sm min-h-full">
      {title ? <div className="text-sm font-semibold text-gray-800 mb-3">{title}</div> : null}
      {children}
    </div>
  )
}

/* ---------- Helpers UI ---------- */
function todayISO() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function fmtDateDMY(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}
function monthName(m: number) {
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m]
}
function extractHHMM(iso?: string | null): string {
  try {
    const d = iso ? new Date(iso) : new Date()
    if (Number.isNaN(d.getTime())) return '00:00'
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return '00:00'
  }
}
function combineDateAndTimeToISO(dateISO: string, hhmm: string): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  const [H, M] = hhmm.split(':').map(Number)
  const dt = new Date(y, (m || 1) - 1, d || 1, H || 0, M || 0, 0)
  return dt.toISOString()
}
function fmtInt(n: number) {
  try { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }
  catch { return String(Math.round(n || 0)) }
}
function parseDigits(s: string): number {
  const digits = String(s || '').replace(/[^\d]/g, '')
  const n = Number(digits || 0)
  return Number.isFinite(n) ? n : 0
}

/* ---------- Money input ---------- */
function MoneyInput({ value, onChange, className = '', disabled }: { value: number; onChange: (v: number) => void; className?: string; disabled?: boolean }) {
  const [raw, setRaw] = useState<string>(fmtInt(value))
  const lastRef = useRef<number>(value)
  useEffect(() => {
    if (value !== lastRef.current) { lastRef.current = value; setRaw(fmtInt(value)) }
  }, [value])
  return (
    <input
      type="text"
      inputMode="numeric"
      value={raw}
      disabled={disabled}
      onChange={e => { const n = parseDigits(e.target.value); setRaw(fmtInt(n)); onChange(n) }}
      onFocus={() => { if (parseDigits(raw) === 0) setRaw('') }}
      onBlur={() => { if (!raw || parseDigits(raw) === 0) { setRaw('0'); onChange(0) } }}
      placeholder="0"
      className={`border rounded-lg px-2 h-10 w-full text-right bg-white disabled:bg-slate-50 disabled:text-slate-500 tabular-nums ${className}`}
    />
  )
}

/* ---------- Toggle ---------- */
function Toggle({
  id, checked, onChange, disabled, yesLabel = 'Yes', noLabel = 'No',
}: {
  id: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  yesLabel?: string
  noLabel?: string
}) {
  return (
    <label htmlFor={id} className={`flex items-center gap-3 text-gray-800 ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer select-none'}`}>
      <input type="checkbox" id={id} checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" disabled={!!disabled} />
      <div
        className="
          relative w-11 h-6 rounded-full shrink-0 transition-colors
          bg-gray-200 peer-checked:bg-blue-600
          after:content-[''] after:absolute after:top-0.5 after:left-0.5
          after:h-5 after:w-5 after:rounded-full after:bg-white after:border
          after:transition-transform after:translate-x-0
          peer-checked:after:translate-x-5
        "
      />
      <span className="text-sm">{checked ? yesLabel : noLabel}</span>
    </label>
  )
}

/* ---------- Modal ---------- */
function toTitleCase(s: string) {
  const str = String(s || '').toLowerCase().trim()
  if (!str) return ''
  return str.replace(/\b\p{L}+/gu, w => w[0].toUpperCase() + w.slice(1))
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10 animate-in fade-in zoom-in-95 duration-200">
        {children}
      </div>
    </div>
  )
}

function EditorModal({
  mode, staffOpts, shiftOpts, catOpts, suppliers, selectedBranchName, initial, onClose, onSaved, onDeleted, currentUserName,
  onCreateSupplier, t, onSaveAndAdd, currentShiftName,
}: {
  mode: 'create' | 'view' | 'edit'
  staffOpts: string[]
  shiftOpts: string[]
  catOpts: string[]
  suppliers: Sup[]
  selectedBranchName: string
  initial: Partial<CashoutRow>
  onClose: () => void
  onSaved: (row: CashoutRow) => Promise<void>
  onDeleted: (id: string) => void
  currentUserName: string
  onCreateSupplier: (name: string) => Promise<Sup | null>
  t: ReturnType<typeof getDailyReportsDictionary>['cashout']
  onSaveAndAdd?: (row: CashoutRow) => Promise<void>
  currentShiftName: string
}) {
  const [viewMode, setViewMode] = useState(mode === 'view')
  const [date, setDate] = useState(initial.date || todayISO())
  const [description, setDescription] = useState(initial.description || '')
  const [category, setCategory] = useState(initial.category || '')
  const [amount, setAmount] = useState<number>(Number(initial.amount || 0))
  const [supplierId, setSupplierId] = useState<string>(initial.supplier_id || '')
  const [invoice, setInvoice] = useState<boolean>(!!initial.invoice)
  const [deliveryNote, setDeliveryNote] = useState<boolean>(!!initial.deliveryNote)
  const tm = t.modal
  const yesNo = t.yesNo

  const defaultShift = useMemo(() => (initial.shift || currentShiftName || shiftOpts[0] || ''), [initial.shift, currentShiftName, shiftOpts])
  const [shift, setShift] = useState<string>(initial.shift || defaultShift)
  const [paidBy] = useState<string>(initial.paidBy || currentUserName || (staffOpts[0] || ''))
  const [timeHHMM, setTimeHHMM] = useState<string>(() => extractHHMM(initial.created_at || undefined))

  const [isSaving, setIsSaving] = useState(false)
  const isDeletingRef = useRef(false)
  const lastDeleteClick = useRef(0)

  // FIX: Reset state when initial prop changes (e.g. for "Save & Add New" or re-opening)
  useEffect(() => {
    if (mode === 'edit' || mode === 'view') {
      setDate(initial.date || todayISO())
      setDescription(initial.description || '')
      setCategory(initial.category || '')
      setAmount(Number(initial.amount || 0))
      setSupplierId(initial.supplier_id || '')
      setInvoice(!!initial.invoice)
      setDeliveryNote(!!initial.deliveryNote)
      setShift(initial.shift || defaultShift)
      setTimeHHMM(extractHHMM(initial.created_at || undefined))
      setViewMode(mode === 'view')
    } else {
      // Create mode: reset fields but keep some defaults if provided in initial
      setDate(initial.date || todayISO())
      setDescription('')
      setCategory('')
      setAmount(0)
      setSupplierId('')
      setInvoice(false)
      setDeliveryNote(false)
      setShift(initial.shift || defaultShift)
      setTimeHHMM(extractHHMM(new Date().toISOString()))
      setViewMode(false)
    }
  }, [initial, mode, defaultShift])

  const supplierName = useMemo(() => suppliers.find(x => x.id === supplierId)?.name || '', [supplierId, suppliers])
  const canSave = description.trim().length > 0 && amount > 0

  async function handleSupplierSelect(value: string) {
    if (value !== '__add__') {
      setSupplierId(value)
      return
    }
    const nextName = window.prompt(tm.promptNewSupplier)
    const clean = String(nextName || '').trim()
    if (!clean) return
    const created = await onCreateSupplier(toTitleCase(clean))
    if (created?.id) {
      setSupplierId(created.id)
    }
  }

  async function handleSupplierAddNew(queryName: string) {
    const clean = String(queryName || '').trim()
    if (!clean) return
    const created = await onCreateSupplier(toTitleCase(clean))
    if (created?.id) {
      setSupplierId(created.id)
    }
  }

  function buildRow(): CashoutRow {
    const combinedTs = combineDateAndTimeToISO(String(date), timeHHMM || '00:00')
    return {
      id: initial.id || (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`),
      branch: selectedBranchName ? selectedBranchName : null,
      date,
      description: description.trim(),
      category: category ? String(category) : null,
      amount: Math.round(amount),
      supplier_id: supplierId || null,
      supplier_name: supplierName || null,
      invoice,
      deliveryNote,
      shift: (shift || defaultShift) || null,
      paidBy: paidBy || currentUserName || null,
      created_at: combinedTs,
    }
  }

  async function handleSave(e?: React.MouseEvent) {
    e?.preventDefault()
    e?.stopPropagation()
    console.log('[CashoutPage] handleSave called', { canSave, viewMode, description, amount })
    if (!canSave || viewMode || isSaving) return

    setIsSaving(true)
    try {
      await onSaved(buildRow())
    } catch (err) {
      console.error('[CashoutPage] handleSave error', err)
      alert('Error saving: ' + String(err))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveAndAdd(e?: React.MouseEvent) {
    e?.preventDefault()
    e?.stopPropagation()
    console.log('[CashoutPage] handleSaveAndAdd called', { canSave, viewMode })
    if (!canSave || viewMode || !onSaveAndAdd || isSaving) return

    setIsSaving(true)
    try {
      await onSaveAndAdd(buildRow())
    } catch (err) {
      console.error('[CashoutPage] handleSaveAndAdd error', err)
      alert('Error saving: ' + String(err))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(e?: React.MouseEvent) {
    e?.preventDefault()
    e?.stopPropagation()

    const now = Date.now()
    if (now - lastDeleteClick.current < 1000) return // Throttle 1s
    lastDeleteClick.current = now

    if (viewMode || !initial.id || isDeletingRef.current) return

    isDeletingRef.current = true
    if (!window.confirm(tm.deleteConfirm)) {
      isDeletingRef.current = false
      return
    }

    try {
      await onDeleted(initial.id)
    } catch (err) {
      console.error('Delete error', err)
      isDeletingRef.current = false
    }
  }
  return (
    <Overlay onClose={onClose}>
      <div className="flex flex-col text-slate-900 bg-white p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
          <div className="text-lg font-bold text-slate-800">
            {viewMode ? tm.viewTitle : (initial.id ? tm.editTitle : tm.newTitle)}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-650 hover:bg-slate-100 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Form */}
        <div className="mt-5 space-y-5 flex-1 overflow-y-auto pr-1">
          {/* Branch display */}
          <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tm.branch}</span>
            <div className="h-3 w-px bg-slate-200" />
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
              {selectedBranchName || '-'}
            </span>
          </div>

          {/* Date, Time, Amount (3 columns) */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{tm.date}</label>
              <input
                type="date"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold"
                value={date}
                onChange={e => setDate(e.target.value)}
                disabled={viewMode}
                max={todayISO()}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{tm.time}</label>
              <input
                type="time"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold"
                value={timeHHMM}
                onChange={e => setTimeHHMM(e.target.value)}
                disabled={viewMode}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{tm.amount}</label>
              <div className="mt-0">
                <MoneyInput value={amount} onChange={setAmount} className="h-10 border border-slate-200 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 rounded-xl" disabled={viewMode} />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{tm.description}</label>
            <input
              type="text"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold"
              value={description}
              onChange={e => { const v = e.target.value; setDescription(v.charAt(0).toUpperCase() + v.slice(1)) }}
              disabled={viewMode}
            />
          </div>

          {/* Category, Supplier (2 columns) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{tm.category}</label>
              <select
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold cursor-pointer"
                value={category || ''}
                onChange={e => setCategory(e.target.value)}
                disabled={viewMode}
              >
                <option value="">{catOpts.length ? tm.categorySelect : tm.categoryEmpty}</option>
                {catOpts.map((c, i) => <option key={`${c}-${i}`} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{tm.supplier}</label>
              {viewMode ? (
                <div className="h-10 flex items-center text-slate-900 font-semibold text-sm px-1 gap-2">
                  <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span>{supplierName || '-'}</span>
                </div>
              ) : (
                <SupplierCombobox
                  suppliers={suppliers}
                  selectedId={supplierId || null}
                  onChange={id => setSupplierId(id || '')}
                  onAddNew={handleSupplierAddNew}
                  placeholder={tm.supplierSelect}
                />
              )}
            </div>
          </div>

          {/* Shift, Paid by (2 columns) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{tm.shift}</label>
              <select
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold cursor-pointer"
                value={shift || ''}
                onChange={e => setShift(e.target.value)}
                disabled={viewMode}
              >
                {shiftOpts.map((s, i) => <option key={`${s}-${i}`} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Paid By display */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{tm.paidBy}</label>
              <div className="h-10 flex items-center text-slate-900 font-semibold text-sm px-1 gap-2">
                <svg className="w-4 h-4 text-slate-405 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>{paidBy || currentUserName || '-'}</span>
              </div>
            </div>
          </div>

          {/* Toggles (2 columns) */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="flex items-center gap-3">
              <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">{tm.vatInvoice}</span>
              <Toggle id="invoice_toggle" checked={invoice} onChange={setInvoice} disabled={viewMode} yesLabel={yesNo.yes} noLabel={yesNo.no} />
            </div>
            <div className="flex items-center gap-3">
              <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">{tm.deliveryNote}</span>
              <Toggle id="delivery_toggle" checked={deliveryNote} onChange={setDeliveryNote} disabled={viewMode} yesLabel={yesNo.yes} noLabel={yesNo.no} />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex justify-between items-center gap-3 pt-4 border-t border-slate-100 mt-5">
            <div className="flex items-center gap-2">
              {viewMode ? (
                <Button
                  variant="primary"
                  onClick={(e) => { e.preventDefault(); setViewMode(false) }}
                  className="h-10 text-xs font-semibold px-4"
                >
                  {tm.buttons.edit}
                </Button>
              ) : (
                initial.id && (
                  <Button
                    variant="danger"
                    onClick={handleDelete}
                    className="h-10 text-xs font-semibold px-4"
                  >
                    {tm.buttons.delete}
                  </Button>
                )
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isSaving}
                className="h-10 text-xs font-semibold px-4"
              >
                {tm.buttons.close}
              </Button>
              {!viewMode && (
                <>
                  {onSaveAndAdd && !initial.id && (
                    <Button
                      variant="outline"
                      onClick={handleSaveAndAdd}
                      disabled={!canSave || isSaving}
                      className="h-10 text-xs font-semibold px-4"
                    >
                      {isSaving ? 'Saving...' : ((t as any).buttons?.saveAndAdd || 'Save & Add New')}
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    onClick={handleSave}
                    disabled={!canSave || isSaving}
                    className="h-10 text-xs font-semibold px-4"
                  >
                    {isSaving ? 'Saving...' : tm.buttons.save}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Overlay>
  )
}

/* ---------- Page ---------- */
type SortKeyBase = 'date' | 'time' | 'description' | 'category' | 'amount' | 'supplier_name' | 'invoice' | 'deliveryNote' | 'shift' | 'paidBy'
type SortKeyWithBranch = SortKeyBase | 'branch'
type SortState = { key: SortKeyWithBranch | null; dir: 'asc' | 'desc' }

export default function CashoutPage() {
  const { language } = useSettings()
  const t = getDailyReportsDictionary(language).cashout
  const tm = t.modal
  const yesNo = t.yesNo
  // Month navigation (deve essere prima di useCashout per passare year/month)
  const now = new Date()
  const [year, setYear] = useState<number>(now.getFullYear())
  const [month, setMonth] = useState<number>(now.getMonth())

  const {
    rows,
    suppliers,
    staffOpts,
    shiftOpts,
    selectedBranchName,
    currentUserName,
    currentShiftName,
    loading,
    error,
    createSupplier,
    upsertCashout,
    deleteCashout,
    bulkDeleteCashout,
  } = useCashout({ year, month })

  // Display value helper for filter checkboxes
  const displayValue = React.useCallback((r: CashoutRow, key: SortKeyWithBranch): string => {
    switch (key) {
      case 'date': return fmtDateDMY(r.date)
      case 'time': return r.created_at ? extractHHMM(r.created_at) : ''
      case 'description': return r.description || ''
      case 'category': return r.category || ''
      case 'amount': return fmtInt(r.amount)
      case 'supplier_name': return r.supplier_name || ''
      case 'invoice': return r.invoice ? yesNo.yes : yesNo.no
      case 'deliveryNote': return r.deliveryNote ? yesNo.yes : yesNo.no
      case 'branch': return r.branch || ''
      case 'paidBy': return r.paidBy || ''
      default: return ''
    }
  }, [yesNo])

  // Unique filterable values per column
  const columnValues = useMemo(() => {
    const map: Partial<Record<SortKeyWithBranch, string[]>> = {}
    const keys: SortKeyWithBranch[] = ['date', 'time', 'description', 'category', 'amount', 'supplier_name', 'invoice', 'deliveryNote', 'branch', 'paidBy']
    keys.forEach(k => {
      const s = new Set<string>()
      rows.forEach(r => { const v = displayValue(r, k); if (v) s.add(v) })
      map[k] = Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    })
    return map
  }, [rows, displayValue])

  // nuove categorie prese dai settings Daily Report
  const { cashOutCategories } = useDailyReportSettings()
  const catOpts = useMemo(
    () => (cashOutCategories && cashOutCategories.length ? cashOutCategories : ['Petty cash', 'Maintenance', 'Misc']),
    [cashOutCategories],
  )


  const columnMenuDict = {
    sortAsc: language === 'vi' ? 'Sắp xếp tăng dần' : 'Sort Ascending',
    sortDesc: language === 'vi' ? 'Sắp xếp giảm dần' : 'Sort Descending',
    selectAll: language === 'vi' ? 'Chọn tất cả' : 'Select All',
    deselectAll: language === 'vi' ? 'Bỏ chọn tất cả' : 'Deselect All',
    filterPlaceholder: language === 'vi' ? 'Lọc...' : 'Filter...',
    clearFilters: language === 'vi' ? 'Xóa bộ lọc' : 'Clear Filters',
  }

  const [columnFilters, setColumnFilters] = useState<Partial<Record<SortKeyWithBranch, Set<string>>>>({})
  const [openMenu, setOpenMenu] = useState<SortKeyWithBranch | null>(null)

  function applySort(k: SortKeyWithBranch, asc: boolean) {
    setSort({ key: k, dir: asc ? 'asc' : 'desc' })
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

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const selectedIds = useMemo(() => Object.keys(selected).filter(id => selected[id]), [selected])

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const headerCbRef = useRef<HTMLInputElement>(null)

  const [openEditor, setOpenEditor] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'view' | 'edit'>('create')
  const [initialRow, setInitialRow] = useState<Partial<CashoutRow> | null>(null)

  const [sort, setSort] = useState<SortState>({ key: 'date', dir: 'desc' })
  const isBulkDeletingRef = useRef(false)
  const lastBulkDeleteClick = useRef(0)

  const monthLabel = `${monthName(month)} ${year}`
  const monthInputValue = useMemo(() => `${year}-${String(month + 1).padStart(2, '0')}`, [year, month])
  const monthStart = useMemo(() => new Date(year, month, 1), [year, month])
  const monthEnd = useMemo(() => new Date(year, month + 1, 1), [year, month])
  function onPickMonth(val: string) {
    const [y, m] = val.split('-').map(Number)
    if (Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12) {
      setYear(y); setMonth(m - 1)
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

  function openCreate() {
    setEditorMode('create')
    // Reverted to always default to today as per user request
    setInitialRow({
      date: todayISO(),
      invoice: false,
      deliveryNote: false,
      shift: currentShiftName || (shiftOpts[0] || ''),
      paidBy: currentUserName,
      created_at: new Date().toISOString(),
    })
    setOpenEditor(true)
  }
  function openView(row: CashoutRow) { setEditorMode('view'); setInitialRow(row); setOpenEditor(true) }
  function openEdit(row: CashoutRow) { setEditorMode('edit'); setInitialRow(row); setOpenEditor(true) }

  async function onSavedRow(row: CashoutRow) {
    try {
      const saved = await upsertCashout(row)
      if (!saved) {
        alert('Failed to save. Please check your connection and try again.')
        return
      }
      setOpenEditor(false)
    } catch (err) {
      console.error('[CashoutPage] onSavedRow error', err)
      alert('Failed to save: ' + String(err))
    }
  }

  async function onSaveAndAddRow(row: CashoutRow): Promise<void> {
    console.log('[CashoutPage] onSaveAndAddRow called', row)
    console.log('[CashoutPage] upsertCashout type:', typeof upsertCashout)

    try {
      const saved = await upsertCashout(row)
      console.log('[CashoutPage] upsertCashout result:', saved)

      if (!saved) {
        alert('Failed to save. Please check your connection and try again.')
        return
      }
      // Do NOT close editor. Instead, update initialRow to a new object to trigger reset.
      // We keep the same date/shift/paidBy as the previous one (or reset them? usually user wants same context)
      // The requirement says "save and add new expense", implying a fresh form.
      // Let's reset to defaults similar to openCreate, but maybe keep the date?
      // For now, let's just reset to the same defaults as openCreate would.

      // Re-calculate default date logic or just reuse the one from the saved row?
      // Usually when adding multiple, you want the same date.

      setInitialRow({
        date: row.date, // Keep the date user just used
        invoice: false,
        deliveryNote: false,
        shift: row.shift, // Keep the shift
        paidBy: row.paidBy, // Keep the payer
        created_at: new Date().toISOString(),
        // Ensure we pass a new object reference and NO ID
        id: undefined,
        description: '',
        amount: 0,
        category: '',
        supplier_id: '',
      })
    } catch (err) {
      console.error('[CashoutPage] onSaveAndAddRow error', err)
      alert('Failed to save: ' + String(err))
    }
  }

  async function onDeletedRow(id: string) {
    const ok = await deleteCashout(id)
    if (!ok) return
    setOpenEditor(false)
  }

  function toggleSelectAll() {
    if (visibleRows.length === 0) return
    const allSelected = visibleRows.every(r => !!selected[r.id])
    if (allSelected) setSelected({})
    else {
      const next: Record<string, boolean> = {}
      visibleRows.forEach(r => { next[r.id] = true })
      setSelected(next)
    }
  }

  async function bulkDelete() {
    const ids = selectedIds

    const now = Date.now()
    if (now - lastBulkDeleteClick.current < 1000) return // Throttle 1s
    lastBulkDeleteClick.current = now

    if (ids.length === 0 || isBulkDeletingRef.current) return

    isBulkDeletingRef.current = true
    const ok = window.confirm(t.menu.bulkConfirm.replace('{count}', String(ids.length)))
    if (!ok) {
      isBulkDeletingRef.current = false
      return
    }

    try {
      const deleted = await bulkDeleteCashout(ids)
      if (!deleted) return
      setSelected({})
    } finally {
      isBulkDeletingRef.current = false
    }
  }

  /* ---------- Filter + Search ---------- */
  const visibleRows = useMemo(() => {
    const monthFiltered = rows.filter(r => {
      const d = new Date(r.date || '')
      return d >= monthStart && d < monthEnd
    })

    const branchName = (selectedBranchName || '').trim()
    let out = branchName ? monthFiltered.filter(r => (r.branch || '') === branchName) : monthFiltered

    // Apply column checklist filters
    for (const [col, allowed] of Object.entries(columnFilters)) {
      if (allowed && allowed.size > 0) {
        out = out.filter(r => allowed.has(displayValue(r, col as SortKeyWithBranch)))
      }
    }

    return out
  }, [rows, selectedBranchName, monthStart, monthEnd, columnFilters, displayValue])

  /* ---------- Totali (solo valore, niente conteggio) ---------- */
  const totalAmount = useMemo(() => {
    return visibleRows.reduce((s, r) => s + Math.round(r.amount || 0), 0)
  }, [visibleRows])

  /* ---------- Sorting ---------- */
  function toggleSort(key: SortKeyWithBranch) {
    setSort(prev => {
      if (prev.key !== key) return { key, dir: 'asc' }
      return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
    })
  }

  const sortedRows = useMemo(() => {
    if (!sort.key) return visibleRows
    const dir = sort.dir === 'asc' ? 1 : -1
    const cmp = (a: CashoutRow, b: CashoutRow): number => {
      switch (sort.key) {
        case 'amount': return (a.amount - b.amount) * dir
        case 'date': return (new Date(a.date).getTime() - new Date(b.date).getTime()) * dir
        case 'time': return ((a.created_at ? new Date(a.created_at).getTime() : 0) - (b.created_at ? new Date(b.created_at).getTime() : 0)) * dir
        case 'invoice': return ((a.invoice ? 1 : 0) - (b.invoice ? 1 : 0)) * dir
        case 'deliveryNote': return ((a.deliveryNote ? 1 : 0) - (b.deliveryNote ? 1 : 0)) * dir
        case 'supplier_name': return ((a.supplier_name || '').toLowerCase()).localeCompare((b.supplier_name || '').toLowerCase()) * dir
        case 'description': return ((a.description || '').toLowerCase()).localeCompare((b.description || '').toLowerCase()) * dir
        case 'category': return ((a.category || '').toLowerCase()).localeCompare((b.category || '').toLowerCase()) * dir
        case 'shift': return ((a.shift || '').toLowerCase()).localeCompare((b.shift || '').toLowerCase()) * dir
        case 'paidBy': return ((a.paidBy || '').toLowerCase()).localeCompare((b.paidBy || '').toLowerCase()) * dir
        case 'branch': return ((a.branch || '').toLowerCase()).localeCompare((b.branch || '').toLowerCase()) * dir
      }
      return 0
    }
    return [...visibleRows].sort(cmp)
  }, [visibleRows, sort])

  /* ---------- Export ---------- */
  async function handleExport() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(t.export.sheetName)

    ws.columns = [
      { header: t.export.columns.date, key: 'date', width: 12 },
      { header: t.export.columns.time, key: 'time', width: 8 },
      { header: t.export.columns.description, key: 'description', width: 40 },
      { header: t.export.columns.category, key: 'category', width: 20 },
      { header: t.export.columns.amount, key: 'amount', width: 12 },
      { header: t.export.columns.supplier, key: 'supplier', width: 24 },
      { header: t.export.columns.invoice, key: 'invoice', width: 12 },
      { header: t.export.columns.delivery, key: 'delivery', width: 14 },
      { header: t.export.columns.branch, key: 'branch', width: 14 },
      { header: t.export.columns.paidBy, key: 'paidBy', width: 16 },
    ]

    sortedRows.forEach(r => {
      ws.addRow({
        date: fmtDateDMY(r.date),
        time: r.created_at ? extractHHMM(r.created_at) : '',
        description: r.description || '',
        category: r.category || '',
        amount: Math.round(r.amount || 0),
        supplier: r.supplier_name || '',
        invoice: r.invoice ? yesNo.yes : yesNo.no,
        delivery: r.deliveryNote ? yesNo.yes : yesNo.no,
        branch: r.branch || '',
        paidBy: r.paidBy || '',
      })
    })

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const dateStr = new Date().toISOString().slice(0, 10)
    a.download = t.export.fileName.replace('{date}', dateStr)
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  /* --- Column Header with Excel-style dropdown --- */
  type ColumnHeaderProps = {
    colKey: SortKeyWithBranch
    label: string
    sortKey: SortKeyWithBranch
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

  function ColumnHeader({ colKey, label, sortKey, sortAsc, onSort, values, activeFilter, onFilter, onClear, open, onToggle, onClose, dict, right, center, className = '' }: ColumnHeaderProps) {
    const ref = useRef<HTMLTableCellElement>(null)
    const [filterSearch, setFilterSearch] = useState('')
    const [localChecked, setLocalChecked] = useState<Set<string>>(new Set(values))

    // Sync local state when menu opens or values change
    useEffect(() => {
      if (open) {
        setLocalChecked(activeFilter ? new Set(activeFilter) : new Set(values))
        setFilterSearch('')
      }
    }, [open, values, activeFilter])

    // Click-outside handler
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
      <th className={`px-6 py-4 ${right ? 'text-right' : ''} ${className} relative`} ref={ref}>
        <div className={`flex items-center gap-1 font-semibold ${center ? 'justify-center' : right ? 'justify-end' : 'justify-start'}`}>
          <span className="select-none text-slate-500 uppercase tracking-wider text-xs">{label}</span>
          {isActive && (
            sortAsc
              ? <BarsArrowUpIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
              : <BarsArrowDownIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
          )}
          {/* Filter indicator */}
          {hasFilter && <FunnelIcon className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />}
          {/* Kebab menu button */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            className="ml-0.5 p-0.5 rounded hover:bg-gray-200 transition-colors flex-shrink-0 cursor-pointer"
            aria-label={`Menu ${label}`}
          >
            <EllipsisVerticalIcon className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Dropdown panel */}
        {open && dropdownStyle && (
          <div
            className="fixed bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] min-w-[220px] text-left text-sm text-gray-700"
            style={dropdownStyle}
            onClick={e => e.stopPropagation()}
          >
            {/* Sort section */}
            <div className="px-3 py-2 space-y-1">
              <button
                type="button"
                onClick={() => onSort(colKey, true)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${isActive && sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'
                  }`}
              >
                <BarsArrowUpIcon className="w-4 h-4" />
                {dict.sortAsc}
              </button>
              <button
                type="button"
                onClick={() => onSort(colKey, false)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${isActive && !sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'
                  }`}
              >
                <BarsArrowDownIcon className="w-4 h-4" />
                {dict.sortDesc}
              </button>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200" />

            {/* Filter section */}
            <div className="px-3 py-2">
              {/* Search */}
              <input
                type="text"
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                placeholder={dict.filterPlaceholder}
                className="w-full mb-2 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
              />

              {/* Select all / Deselect all */}
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-blue-600 hover:text-blue-800 mb-1 cursor-pointer font-medium"
              >
                {allVisibleChecked ? dict.deselectAll : dict.selectAll}
              </button>

              {/* Checkbox list */}
              <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                {filteredValues.map(v => (
                  <label key={v} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localChecked.has(v)}
                      onChange={() => toggleOne(v)}
                      className="accent-blue-600 rounded"
                    />
                    <span className="truncate text-xs">{v}</span>
                  </label>
                ))}
                {filteredValues.length === 0 && (
                  <div className="text-xs text-gray-400 py-1 text-center">—</div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onClear}
                className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer font-medium"
              >
                {dict.clearFilters}
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="px-3 py-1 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer font-medium"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </th>
    )
  }

  const allSelected = visibleRows.length > 0 && visibleRows.every(r => !!selected[r.id])
  const someSelected = visibleRows.some(r => !!selected[r.id]) && !allSelected
  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = someSelected
  }, [someSelected, allSelected, visibleRows.length])

  return (
    <div className="max-w-none mx-auto p-4 text-gray-100">
      <PageHeader
        title={t.title}
        subtitle={language === 'vi'
          ? 'Xem và quản lý chi phí tiền mặt hàng ngày.'
          : 'View and manage cash expenses.'}
        badgeText={selectedBranchName || (language === 'vi' ? 'Tất cả chi nhánh' : 'All branches')}
        left={
          selectMode ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                aria-label={t.menu.moreActions}
                className="p-0 h-auto w-auto bg-transparent border-0 outline-none text-blue-200 hover:text-white focus:outline-none cursor-pointer flex items-center"
                title={t.menu.moreActions}
              >
                <EllipsisVerticalIcon className="h-6 w-6" />
              </button>
              {menuOpen && (
                <div className="absolute left-0 z-10 mt-2 min-w-[12rem] rounded-xl border border-slate-150 bg-white text-slate-800 shadow-lg py-1">
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-655 hover:bg-red-50 text-left text-xs font-semibold disabled:opacity-50"
                    onClick={() => {
                      setMenuOpen(false)
                      const ids = Object.keys(selected).filter(id => selected[id])
                      if (ids.length) {
                        bulkDelete()
                      }
                    }}
                    disabled={selectedIds.length === 0}
                  >
                    <TrashIcon className="h-4 w-4" />
                    <span>{t.menu.delete}</span>
                  </button>
                </div>
              )}
            </div>
          ) : null
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Export */}
            <Button
              variant="secondary-dark"
              size="md"
              icon={ArrowUpTrayIcon}
              onClick={handleExport}
              className="h-9 px-3 text-xs font-semibold"
              title={t.export.title}
            >
              {t.export.label}
            </Button>

            {/* Toggle Select */}
            <Button
              variant={selectMode ? 'primary' : 'secondary-dark'}
              size="md"
              icon={CheckCircleIcon}
              onClick={() => { setSelectMode(s => !s); setMenuOpen(false); setSelected({}) }}
              className="h-9 px-3 text-xs font-semibold"
              title={selectMode ? t.select.exitTitle : t.select.enterTitle}
            >
              {selectMode ? t.select.active : t.select.inactive}
            </Button>

            {/* New Expense */}
            <Button
              variant="primary"
              size="md"
              icon={PlusIcon}
              onClick={openCreate}
              className="h-9 px-3 text-xs font-semibold"
            >
              {t.actions.newExpense}
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2">
          <XMarkIcon className="w-5 h-5" />
          {error}
        </div>
      )}

      <div className="mt-3 border-t border-white/15" />

      <MonthPicker
        value={monthInputValue}
        onChange={onPickMonth}
        language={language}
        colorClass="text-blue-100 hover:text-white"
        labelColorClass="text-white"
        iconColorClass="text-blue-200 hover:text-white"
        className="mt-3 mb-4"
      />

      <TableContainer>
        {loading && <div className="text-sm text-slate-500 p-4">{t.table.loading}</div>}
        <Table>
          <TableHead>
            <TableHeadRow>
              {selectMode && (
                <th className="px-6 py-4 w-7 text-center">
                  <input
                    ref={headerCbRef}
                    type="checkbox"
                    checked={visibleRows.length > 0 && visibleRows.every(r => !!selected[r.id])}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    title={t.table.selectAll}
                  />
                </th>
              )}

              <ColumnHeader colKey="date" label={t.table.headers.date} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.date || []} activeFilter={columnFilters.date || null} onFilter={(s) => applyColumnFilter('date', s)} onClear={() => clearColumnFilter('date')} open={openMenu === 'date'} onToggle={() => setOpenMenu(v => v === 'date' ? null : 'date')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} className="w-[120px]" />
              <ColumnHeader colKey="time" label={t.table.headers.time} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.time || []} activeFilter={columnFilters.time || null} onFilter={(s) => applyColumnFilter('time', s)} onClear={() => clearColumnFilter('time')} open={openMenu === 'time'} onToggle={() => setOpenMenu(v => v === 'time' ? null : 'time')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} className="w-[100px]" />
              <ColumnHeader colKey="description" label={t.table.headers.description} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.description || []} activeFilter={columnFilters.description || null} onFilter={(s) => applyColumnFilter('description', s)} onClear={() => clearColumnFilter('description')} open={openMenu === 'description'} onToggle={() => setOpenMenu(v => v === 'description' ? null : 'description')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} className="min-w-[200px]" />
              <ColumnHeader colKey="category" label={t.table.headers.category} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.category || []} activeFilter={columnFilters.category || null} onFilter={(s) => applyColumnFilter('category', s)} onClear={() => clearColumnFilter('category')} open={openMenu === 'category'} onToggle={() => setOpenMenu(v => v === 'category' ? null : 'category')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} className="w-[180px]" />
              <ColumnHeader colKey="amount" label={t.table.headers.amount} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.amount || []} activeFilter={columnFilters.amount || null} onFilter={(s) => applyColumnFilter('amount', s)} onClear={() => clearColumnFilter('amount')} open={openMenu === 'amount'} onToggle={() => setOpenMenu(v => v === 'amount' ? null : 'amount')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} right className="w-[140px]" />
              <ColumnHeader colKey="supplier_name" label={t.table.headers.supplier} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.supplier_name || []} activeFilter={columnFilters.supplier_name || null} onFilter={(s) => applyColumnFilter('supplier_name', s)} onClear={() => clearColumnFilter('supplier_name')} open={openMenu === 'supplier_name'} onToggle={() => setOpenMenu(v => v === 'supplier_name' ? null : 'supplier_name')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} className="w-[180px]" />
              <ColumnHeader colKey="invoice" label={t.table.headers.invoice} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.invoice || []} activeFilter={columnFilters.invoice || null} onFilter={(s) => applyColumnFilter('invoice', s)} onClear={() => clearColumnFilter('invoice')} open={openMenu === 'invoice'} onToggle={() => setOpenMenu(v => v === 'invoice' ? null : 'invoice')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} center className="w-[100px]" />
              <ColumnHeader colKey="deliveryNote" label={t.table.headers.deliveryNote} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.deliveryNote || []} activeFilter={columnFilters.deliveryNote || null} onFilter={(s) => applyColumnFilter('deliveryNote', s)} onClear={() => clearColumnFilter('deliveryNote')} open={openMenu === 'deliveryNote'} onToggle={() => setOpenMenu(v => v === 'deliveryNote' ? null : 'deliveryNote')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} center className="w-[120px]" />
              <ColumnHeader colKey="paidBy" label={t.table.headers.paidBy} sortKey={sort.key || 'date'} sortAsc={sort.dir === 'asc'} onSort={applySort} values={columnValues.paidBy || []} activeFilter={columnFilters.paidBy || null} onFilter={(s) => applyColumnFilter('paidBy', s)} onClear={() => clearColumnFilter('paidBy')} open={openMenu === 'paidBy'} onToggle={() => setOpenMenu(v => v === 'paidBy' ? null : 'paidBy')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} className="w-[160px]" />
            </TableHeadRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && !loading && (
              <TableRow><TableCell colSpan={selectMode ? 10 : 9} className="text-center py-8 text-slate-400 text-xs italic font-semibold">{t.table.noRows}</TableCell></TableRow>
            )}
            {rows.length > 0 && (
              visibleRows.length === 0 && !loading ? (
                <TableRow><TableCell colSpan={selectMode ? 10 : 9} className="text-center py-8 text-slate-400 text-xs italic font-semibold">{t.table.noRows}</TableCell></TableRow>
              ) : (
                visibleRows.length > 0 && [...sortedRows].map(r => (
                  <TableRow
                    key={r.id}
                    onClick={() => openView(r)}
                    onDoubleClick={() => openEdit(r)}
                  >
                    {selectMode && (
                      <TableCell className="px-6 py-4 w-7 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={!!selected[r.id]}
                          onChange={e => setSelected(prev => ({ ...prev, [r.id]: e.target.checked }))}
                          title={t.table.selectRow}
                        />
                      </TableCell>
                    )}
                    <TableCell className="whitespace-nowrap">{fmtDateDMY(r.date)}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.created_at ? extractHHMM(r.created_at) : ''}</TableCell>
                    <TableCell className="whitespace-normal break-words min-w-[200px] max-w-sm">{r.description}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.category || '-'}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-slate-900">{fmtInt(r.amount)}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.supplier_name || '-'}</TableCell>
                    <TableCell className="text-center">{r.invoice ? yesNo.yes : yesNo.no}</TableCell>
                    <TableCell className="text-center">{r.deliveryNote ? yesNo.yes : yesNo.no}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.paidBy || '-'}</TableCell>
                  </TableRow>
                ))
              )
            )}
          </TableBody>

          <tfoot>
            <TableRow className="border-t border-slate-200 bg-slate-50/80 font-semibold text-slate-900">
              {selectMode && <TableCell className="px-6 py-4 w-7">{null}</TableCell>}
              <TableCell className="text-right py-4 px-6 text-xs font-semibold uppercase text-slate-500 tracking-wider" colSpan={4}>
                {t.table.totals}
              </TableCell>
              <TableCell className="text-right py-4 px-6 tabular-nums text-sm font-bold text-slate-900">
                {fmtInt(totalAmount)}
              </TableCell>
              <TableCell className="px-6 py-4" colSpan={4}>{null}</TableCell>
            </TableRow>
          </tfoot>
        </Table>
      </TableContainer>

      {openEditor && initialRow && (
        <EditorModal
          mode={editorMode}
          initial={initialRow}
          staffOpts={staffOpts.length ? staffOpts : ['Staff']}
          shiftOpts={shiftOpts.length ? shiftOpts : ['Lunch', 'Dinner', 'All day']}
          catOpts={catOpts}
          suppliers={suppliers}
          selectedBranchName={selectedBranchName}
          onClose={() => setOpenEditor(false)}
          onSaved={onSavedRow}
          onSaveAndAdd={onSaveAndAddRow}
          onDeleted={onDeletedRow}
          currentUserName={currentUserName}
          currentShiftName={currentShiftName}
          onCreateSupplier={createSupplier}
          t={t}
        />
      )}
    </div>
  )
}



