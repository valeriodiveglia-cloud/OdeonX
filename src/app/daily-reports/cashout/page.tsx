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
} from '@heroicons/react/24/outline'

import {
  useCashout,
  type CashoutRow,
  type Sup,
} from '@/app/daily-reports/_data/useCashout'

import { useDailyReportSettings } from '@/app/daily-reports/_data/useDailyReportSettings'
import { useSettings } from '@/contexts/SettingsContext'
import { getDailyReportsDictionary } from '../_i18n'

/* ---------- Const usate per util locali ---------- */
const SETTINGS_LS_KEY = 'dailysettings.initialInfo.v1'

/* ---------- Primitives ---------- */
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
function MoneyInput({ value, onChange, className = '' }: { value: number; onChange: (v: number) => void; className?: string }) {
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
      onChange={e => { const n = parseDigits(e.target.value); setRaw(fmtInt(n)); onChange(n) }}
      onFocus={() => { if (parseDigits(raw) === 0) setRaw('') }}
      onBlur={() => { if (!raw || parseDigits(raw) === 0) { setRaw('0'); onChange(0) } }}
      placeholder="0"
      className={`border rounded-lg px-2 h-10 w-full text-right bg-white tabular-nums ${className}`}
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
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-3xl h-full bg-white shadow-xl overflow-y-auto">{children}</div>
    </div>
  )
}

function EditorModal({
  mode, staffOpts, shiftOpts, catOpts, suppliers, selectedBranchName, initial, onClose, onSaved, onDeleted, currentUserName,
  onCreateSupplier, t,
}: {
  mode: 'create' | 'view' | 'edit'
  staffOpts: string[]
  shiftOpts: string[]
  catOpts: string[]
  suppliers: Sup[]
  selectedBranchName: string
  initial: Partial<CashoutRow>
  onClose: () => void
  onSaved: (row: CashoutRow) => void
  onDeleted: (id: string) => void
  currentUserName: string
  onCreateSupplier: (name: string) => Promise<Sup | null>
  t: ReturnType<typeof getDailyReportsDictionary>['cashout']
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

  const defaultShift = useMemo(() => (pickCurrentShiftName() || (shiftOpts[0] || '')), [shiftOpts])
  const [shift, setShift] = useState<string>(initial.shift || defaultShift)
  const [paidBy] = useState<string>(initial.paidBy || currentUserName || (staffOpts[0] || ''))
  const [timeHHMM, setTimeHHMM] = useState<string>(() => extractHHMM(initial.created_at || undefined))

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

  function handleSave() {
    if (!canSave || viewMode) return
    const combinedTs = combineDateAndTimeToISO(String(date), timeHHMM || '00:00')
    onSaved({
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
    })
  }
  async function handleDelete() {
    if (viewMode || !initial.id) return
    if (!window.confirm(tm.deleteConfirm)) return
    onDeleted(initial.id)
  }
  return (
    <Overlay onClose={onClose}>
      <div className="h-full flex flex-col text-gray-900">
        <div className="px-4 md:px-6 pt-4 pb-3 flex items-center justify-between border-b">
          <div className="text-xl font-bold">
            {viewMode ? tm.viewTitle : (initial.id ? tm.editTitle : tm.newTitle)}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><XMarkIcon className="w-7 h-7" /></button>
        </div>
        <div className="px-4 md:px-6 py-4 flex-1 overflow-y-auto">
          <SectionCard>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-sm text-gray-800">{tm.branch}</label>
                <input className="mt-1 w-full border rounded-lg px-3 h-11 bg-gray-50" value={selectedBranchName || ''} readOnly />
              </div>

              <div className="md:col-span-2 grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm text-gray-800">{tm.date}</label>
                  <input
                    type="date"
                    className="mt-1 w-full border rounded-lg px-3 h-11 bg-white"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    disabled={viewMode}
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-800">{tm.time}</label>
                  <input
                    type="time"
                    className="mt-1 w-full border rounded-lg px-3 h-11 bg-white"
                    value={timeHHMM}
                    onChange={e => setTimeHHMM(e.target.value)}
                    disabled={viewMode}
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-800">{tm.amount}</label>
                  <div className="mt-1">
                    <MoneyInput value={amount} onChange={setAmount} className="h-11" />
                  </div>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="text-sm text-gray-800">{tm.description}</label>
                <input className="mt-1 w-full border rounded-lg px-3 h-11 bg-white" value={description} onChange={e => setDescription(e.target.value)} disabled={viewMode} />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-gray-800">{tm.category}</label>
                <select className="mt-1 w-full border rounded-lg px-3 h-11 bg-white" value={category || ''} onChange={e => setCategory(e.target.value)} disabled={viewMode}>
                  <option value="">{catOpts.length ? tm.categorySelect : tm.categoryEmpty}</option>
                  {catOpts.map((c, i) => <option key={`${c}-${i}`} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-gray-800">{tm.supplier}</label>
                <select
                  className="mt-1 w-full border rounded-lg px-3 h-11 bg-white"
                  value={supplierId}
                  onChange={e => handleSupplierSelect(e.target.value)}
                  disabled={viewMode}
                >
                  <option value="">{tm.supplierSelect}</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value="__add__">{tm.supplierAddPrefix}</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-800">{tm.shift}</label>
                <select className="mt-1 w-full border rounded-lg px-3 h-11 bg-white" value={shift || ''} onChange={e => setShift(e.target.value)} disabled={viewMode}>
                  {shiftOpts.map((s, i) => <option key={`${s}-${i}`} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-800">{tm.paidBy}</label>
                <input className="mt-1 w-full border rounded-lg px-3 h-11 bg-gray-50" value={paidBy || currentUserName || ''} readOnly />
              </div>
              <div className="md:col-span-2 flex flex-wrap items-center gap-x-12 gap-y-3 pt-1">
                <div className="flex items-center gap-3"><span className="text-sm text-gray-800">{tm.vatInvoice}</span><Toggle id="invoice_toggle" checked={invoice} onChange={setInvoice} disabled={viewMode} yesLabel={yesNo.yes} noLabel={yesNo.no} /></div>
                <div className="flex items-center gap-3"><span className="text-sm text-gray-800">{tm.deliveryNote}</span><Toggle id="delivery_toggle" checked={deliveryNote} onChange={setDeliveryNote} disabled={viewMode} yesLabel={yesNo.yes} noLabel={yesNo.no} /></div>
              </div>
            </div>
          </SectionCard>
        </div>
        <div className="px-4 md:px-6 py-4 border-t flex items-center justify-between">
          <div className="flex items-center gap-2">
            {viewMode ? (
              <button onClick={() => setViewMode(false)} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80">{tm.buttons.edit}</button>
            ) : (
              initial.id && <button onClick={handleDelete} className="px-4 py-2 rounded-lg border text-red-600 hover:bg-red-50">{tm.buttons.delete}</button>
            )}
          </div>
          <div>
            <button onClick={onClose} className="px-4 py-2 rounded-lg border hover:opacity-80">{tm.buttons.close}</button>
            {!viewMode && (
              <button onClick={handleSave} disabled={!canSave} className="ml-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 disabled:opacity-50">{tm.buttons.save}</button>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  )
}

/* ---------- Page ---------- */
type SortKeyBase = 'date' | 'description' | 'category' | 'amount' | 'supplier_name' | 'invoice' | 'deliveryNote' | 'shift' | 'paidBy'
type SortKeyWithBranch = SortKeyBase | 'branch'
type SortState = { key: SortKeyWithBranch | null; dir: 'asc' | 'desc' }

export default function CashoutPage() {
  const { language } = useSettings()
  const t = getDailyReportsDictionary(language).cashout
  const tm = t.modal
  const yesNo = t.yesNo
  const {
    rows,
    suppliers,
    staffOpts,
    shiftOpts,
    selectedBranchName,
    currentUserName,
    loading,
    createSupplier,
    upsertCashout,
    deleteCashout,
    bulkDeleteCashout,
  } = useCashout()

  // nuove categorie prese dai settings Daily Report
  const { cashOutCategories } = useDailyReportSettings()
  const catOpts = useMemo(
    () => (cashOutCategories && cashOutCategories.length ? cashOutCategories : ['Petty cash', 'Maintenance', 'Misc']),
    [cashOutCategories],
  )

  const [search, setSearch] = useState<string>('')

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const selectedIds = useMemo(() => Object.keys(selected).filter(id => selected[id]), [selected])

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const headerCbRef = useRef<HTMLInputElement>(null)

  const [openEditor, setOpenEditor] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'view' | 'edit'>('create')
  const [initialRow, setInitialRow] = useState<Partial<CashoutRow> | null>(null)

  const [sort, setSort] = useState<SortState>({ key: null, dir: 'asc' })

  // Month navigation
  const now = new Date()
  const [year, setYear] = useState<number>(now.getFullYear())
  const [month, setMonth] = useState<number>(now.getMonth())
  const monthLabel = `${monthName(month)} ${year}`
  const monthInputValue = useMemo(() => `${year}-${String(month + 1).padStart(2, '0')}`, [year, month])
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
    setInitialRow({
      date: todayISO(),
      invoice: false,
      deliveryNote: false,
      shift: pickCurrentShiftName() || (shiftOpts[0] || ''),
      paidBy: currentUserName,
      created_at: new Date().toISOString(),
    })
    setOpenEditor(true)
  }
  function openView(row: CashoutRow) { setEditorMode('view'); setInitialRow(row); setOpenEditor(true) }
  function openEdit(row: CashoutRow) { setEditorMode('edit'); setInitialRow(row); setOpenEditor(true) }

  async function onSavedRow(row: CashoutRow) {
    const saved = await upsertCashout(row)
    if (!saved) return
    setOpenEditor(false)
  }

  async function onDeletedRow(id: string) {
    const ok = await deleteCashout(id)
    if (!ok) return
    setOpenEditor(false)
  }

  function toggleSelectAll() {
    if (rows.length === 0) return
    const allSelected = rows.every(r => !!selected[r.id])
    if (allSelected) setSelected({})
    else {
      const next: Record<string, boolean> = {}
      rows.forEach(r => { next[r.id] = true })
      setSelected(next)
    }
  }

  async function bulkDelete() {
    const ids = selectedIds
    if (ids.length === 0) return
    const ok = window.confirm(`Delete ${ids.length}?`)
    if (!ok) return
    const deleted = await bulkDeleteCashout(ids)
    if (!deleted) return
    setSelected({})
  }

  /* ---------- Filter + Search ---------- */
  const visibleRows = useMemo(() => {
    const monthFiltered = rows.filter(r => {
      const d = new Date(r.date || '')
      return d >= monthStart && d < monthEnd
    })

    const branchName = (selectedBranchName || '').trim()
    const base = branchName ? monthFiltered.filter(r => (r.branch || '') === branchName) : monthFiltered

    const q = search.trim().toLowerCase()
    if (!q) return base
    return base.filter(r => {
      const dmy = fmtDateDMY(r.date).toLowerCase()
      const iso = String(r.date || '').toLowerCase()
      const amt = String(Math.round(r.amount || 0))
      const desc = (r.description || '').toLowerCase()
      const cat = (r.category || '').toLowerCase()
      const supp = (r.supplier_name || '').toLowerCase()
      const shift = (r.shift || '').toLowerCase()
      const by = (r.paidBy || '').toLowerCase()
      const br = (r.branch || '').toLowerCase()
      const inv = r.invoice ? 'yes' : 'no'
      const deln = r.deliveryNote ? 'yes' : 'no'
      return (
        desc.includes(q) || cat.includes(q) || supp.includes(q) || shift.includes(q) || by.includes(q) ||
        inv.includes(q) || deln.includes(q) || dmy.includes(q) || iso.includes(q) || amt.includes(q) || br.includes(q)
      )
    })
  }, [rows, search, selectedBranchName, monthStart, monthEnd])

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
    const XLSX = await import('xlsx')
    const data = sortedRows.map(r => ({
      [t.export.columns.date]: fmtDateDMY(r.date),
      [t.export.columns.time]: r.created_at ? extractHHMM(r.created_at) : '',
      [t.export.columns.description]: r.description || '',
      [t.export.columns.category]: r.category || '',
      [t.export.columns.amount]: Math.round(r.amount || 0),
      [t.export.columns.supplier]: r.supplier_name || '',
      [t.export.columns.invoice]: r.invoice ? yesNo.yes : yesNo.no,
      [t.export.columns.delivery]: r.deliveryNote ? yesNo.yes : yesNo.no,
      [t.export.columns.branch]: r.branch || '',
      [t.export.columns.paidBy]: r.paidBy || '',
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [
      { wch: 12 }, { wch: 8 }, { wch: 40 }, { wch: 20 },
      { wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 14 },
      { wch: 14 }, { wch: 16 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, t.export.sheetName)

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

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

  function SortableHeader({ label, colKey, className }: { label: string; colKey: SortKeyWithBranch; className?: string }) {
    const active = sort.key === colKey
    const dir = sort.dir
    return (
      <th className={`p-2 ${className || ''}`}>
        <button
          type="button"
          onClick={() => toggleSort(colKey)}
          className="inline-flex items-center gap-1 font-semibold text-left hover:opacity-80"
          title={t.table.sortTitle.replace('{label}', label)}
        >
          <span>{label}</span>
          {!active && <ArrowsUpDownIcon className="w-4 h-4 text-gray-400" />}
          {active && dir === 'asc' && <ChevronUpIcon className="w-4 h-4 text-gray-700" />}
          {active && dir === 'desc' && <ChevronDownIcon className="w-4 h-4 text-gray-700" />}
        </button>
      </th>
    )
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
                  aria-label={t.menu.moreActions}
                  className="p-0 h-auto w-auto bg-transparent border-0 outline-none text-blue-200 hover:text-white focus:outline-none"
                  title={t.menu.moreActions}
                >
                  <EllipsisVerticalIcon className="h-6 w-6" />
                </button>

                {menuOpen && (
                  <div className="absolute z-10 mt-2 min-w-[12rem] rounded-xl border bg-white text-gray-800 shadow-lg py-1">
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 hover:bg-blue-200 hover:text-red-700 disabled:opacity-50"
                      onClick={() => {
                        setMenuOpen(false)
                        const ids = Object.keys(selected).filter(id => selected[id])
                        if (ids.length && window.confirm(t.menu.bulkConfirm.replace('{count}', String(ids.length)))) {
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
            )}
          </>
        }
        after={
          <div
            className="ml-2 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-600/15 px-3 py-1 text-xs text-blue-100"
            title={t.branchPill.tooltip}
          >
            <span className="h-2 w-2 rounded-full bg-green-400" />
            <span className="font-medium">{selectedBranchName ? selectedBranchName : t.branchPill.all}</span>
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
                className="pl-9 pr-8 h-9 rounded-lg border border-blue-400/30 bg-blue-600/15 text-blue-50 placeholder-blue-200
                           focus:outline-none focus:ring-2 focus:ring-blue-400/40"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-2 h-5 w-5 text-blue-200 hover:text-white"
                  aria-label={t.search.clear}
                  title={t.search.clear}
                >
                  ×
                </button>
              )}
            </div>

            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-3 h-9 rounded-lg
                           bg-blue-600/15 text-blue-200 hover:bg-blue-600/25
                           border border-blue-400/30"
              title={t.export.title}
            >
              <ArrowUpTrayIcon className="w-5 h-5" />
              {t.export.label}
            </button>

            <button
              onClick={() => { setSelectMode(s => !s); setMenuOpen(false) }}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border ${selectMode
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border-blue-400/30'
                }`}
              title={selectMode ? t.select.exitTitle : t.select.enterTitle}
            >
              <CheckCircleIcon className="w-5 h-5" />
              {selectMode ? t.select.active : t.select.inactive}
            </button>

            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-80"
            >
              <PlusIcon className="w-5 h-5" /> {t.actions.newExpense}
            </button>
          </div>
        }
      />

      <div className="mt-3 border-t border-white/15" />

      <div className="mt-3 mb-4 flex items-center justify-between text-sm text-blue-100">
        <button
          type="button"
          onClick={prevMonth}
          className="flex items-center gap-1 hover:text-white"
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
              aria-label={t.monthNav.pick}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={nextMonth}
          className="flex items-center gap-1 hover:text-white"
        >
          <span>{t.monthNav.next}</span>
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </div>

      <Card>
        <div className="p-3 overflow-x-auto">
          {loading && <div className="text-sm text-gray-500 py-2">{t.table.loading}</div>}
          <table className="w-full table-auto text-sm text-gray-900">
            <thead>
              <tr>
                <th className="p-2 w-7">
                  {selectMode ? (
                    <input
                      ref={headerCbRef}
                      type="checkbox"
                      checked={rows.length > 0 && rows.every(r => !!selected[r.id])}
                      onChange={toggleSelectAll}
                      className="h-4 w-4"
                      title={t.table.selectAll}
                    />
                  ) : null}
                </th>

                <SortableHeader label={t.table.headers.date} colKey="date" className="w-[8.5rem] text-left" />
                <th className="p-2 w-[6.5rem] text-left font-semibold">{t.table.headers.time}</th>
                <SortableHeader label={t.table.headers.description} colKey="description" className="text-left" />
                <SortableHeader label={t.table.headers.category} colKey="category" className="w-[12rem] text-left" />
                <SortableHeader label={t.table.headers.amount} colKey="amount" className="w-[8rem] text-right" />
                <SortableHeader label={t.table.headers.supplier} colKey="supplier_name" className="w-[12rem] text-left" />
                <SortableHeader label={t.table.headers.invoice} colKey="invoice" className="w-[8rem] text-center" />
                <SortableHeader label={t.table.headers.deliveryNote} colKey="deliveryNote" className="w-[10rem] text-center" />
                <SortableHeader label={t.table.headers.branch} colKey="branch" className="w-[10rem] text-left" />
                <SortableHeader label={t.table.headers.paidBy} colKey="paidBy" className="w-[11rem] text-left" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={11} className="text-center text-sm text-gray-500 py-6">{t.table.noRows}</td></tr>
              )}
              {rows.length > 0 && (
                visibleRows.length === 0 && !loading ? (
                  <tr><td colSpan={11} className="text-center text-sm text-gray-500 py-6">{t.table.noRows}</td></tr>
                ) : (
                  visibleRows.length > 0 && [...sortedRows].map(r => (
                    <tr
                      key={r.id}
                      className="border-t hover:bg-blue-50/40 cursor-pointer"
                      onClick={() => openView(r)}
                      onDoubleClick={() => openEdit(r)}
                    >
                      <td className="p-2 w-7" onClick={e => e.stopPropagation()}>
                        {selectMode ? (
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={!!selected[r.id]}
                            onChange={e => setSelected(prev => ({ ...prev, [r.id]: e.target.checked }))}
                            title={t.table.selectRow}
                          />
                        ) : null}
                      </td>
                      <td className="p-2 whitespace-nowrap">{fmtDateDMY(r.date)}</td>
                      <td className="p-2 whitespace-nowrap">{r.created_at ? extractHHMM(r.created_at) : ''}</td>
                      <td className="p-2">{r.description}</td>
                      <td className="p-2 whitespace-nowrap">{r.category || '-'}</td>
                      <td className="p-2 text-right tabular-nums">{fmtInt(r.amount)}</td>
                      <td className="p-2 whitespace-nowrap">{r.supplier_name || '-'}</td>
                      <td className="p-2 text-center">{r.invoice ? yesNo.yes : yesNo.no}</td>
                      <td className="p-2 text-center">{r.deliveryNote ? yesNo.yes : yesNo.no}</td>
                      <td className="p-2 whitespace-nowrap">{r.branch || '-'}</td>
                      <td className="p-2 whitespace-nowrap">{r.paidBy || '-'}</td>
                    </tr>
                  ))
                )
              )}
            </tbody>

            <tfoot>
              <tr className="border-t bg-blue-50/50">
                <td className="p-2 w-7" />
                <td className="p-2 text-right font-semibold" colSpan={4}>
                  {t.table.totals}
                </td>
                <td className="p-2 text-right font-semibold tabular-nums">
                  {fmtInt(totalAmount)}
                </td>
                <td className="p-2" colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

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
          onDeleted={onDeletedRow}
          currentUserName={currentUserName}
          onCreateSupplier={createSupplier}
          t={t}
        />
      )}
    </div>
  )
}

/* ---------- Shift utilities locali ---------- */
type ShiftWin = { name: string; startMin: number; endMin: number }
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
          const name = String(item?.name || item?.label || '').trim()
          const s = hhmmToMin(String(item?.start || item?.from || ''))
          const e = hhmmToMin(String(item?.end || item?.to || ''))
          if (name && Number.isFinite(s) && Number.isFinite(e)) out.push({ name, startMin: s, endMin: e })
        }
      }
      if (out.length) return out
    }

    return []
  } catch { return [] }
}
function pickCurrentShiftName(): string {
  const wins = loadShiftWindows()
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  for (const w of wins) {
    const inWin = w.startMin <= w.endMin
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

function toTitleCase(s: string) {
  const str = String(s || '').toLowerCase().trim()
  if (!str) return ''
  return str.replace(/\b\p{L}+/gu, w => w[0].toUpperCase() + w.slice(1))
}
