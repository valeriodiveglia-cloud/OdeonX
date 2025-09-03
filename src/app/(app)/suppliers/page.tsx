// src/app/suppliers/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'
import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  EllipsisVerticalIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import ExcelJS from 'exceljs'

/* ---------- DB ---------- */
const TBL_SUPS = 'suppliers'

type Supplier = {
  id: string
  name: string
  poc: string | null
  phone: string | null
  email: string | null
  order_method: string | null
  payment_term: string | null
  payment_method: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

/* ---------- UI helpers ---------- */
function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return <span className="inline-block w-4" />
  return asc ? (
    <svg className="w-4 h-4 inline-block text-gray-700" viewBox="0 0 20 20" fill="currentColor"><path d="M3 12l7-8 7 8H3z" /></svg>
  ) : (
    <svg className="w-4 h-4 inline-block text-gray-700" viewBox="0 0 20 20" fill="currentColor"><path d="M17 8l-7 8-7-8h14z" /></svg>
  )
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-3xl h-full bg-white shadow-xl overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4 bg-white shadow-sm h-full">
      <div className="text-sm font-semibold text-gray-800 mb-3">{title}</div>
      {children}
    </div>
  )
}

/* ---------- Editor overlay ---------- */
function SupplierEditor(props: {
  mode: 'create' | 'edit' | 'view'
  id?: string
  initial?: Partial<Supplier> | null
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const { language: lang } = useSettings()
  const { mode, id, initial, onClose, onSaved, onDeleted } = props
  const [viewMode, setViewMode] = useState(mode === 'view')

  const [name, setName] = useState('')
  const [poc, setPoc] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [orderMethod, setOrderMethod] = useState('')
  const [paymentTerm, setPaymentTerm] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (mode === 'edit' || mode === 'view') {
      const h = initial || {}
      setName(h.name || '')
      setPoc(h.poc || '')
      setPhone(h.phone || '')
      setEmail(h.email || '')
      setOrderMethod(h.order_method || '')
      setPaymentTerm(h.payment_term || '')
      setPaymentMethod(h.payment_method || '')
      setNotes(h.notes || '')
      setViewMode(mode === 'view')
    } else {
      setName(''); setPoc(''); setPhone(''); setEmail('')
      setOrderMethod(''); setPaymentTerm(''); setPaymentMethod(''); setNotes('')
      setViewMode(false)
    }
  }, [mode, id, initial])

  const canSave = !viewMode && name.trim().length > 0

  async function save() {
    if (viewMode) return
    const payload = {
      name: name.trim(),
      poc: poc || null,
      phone: phone || null,
      email: email || null,
      order_method: orderMethod || null,
      payment_term: paymentTerm || null,
      payment_method: paymentMethod || null,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    }
    if (id) {
      const { error } = await supabase.from(TBL_SUPS).update(payload).eq('id', id)
      if (error) { alert(`${t('SavedErr', lang)}: ${error.message}`); return }
      onSaved(); return
    }
    const { error } = await supabase.from(TBL_SUPS).insert(payload as any)
    if (error) { alert(`${t('SavedErr', lang)}: ${error.message}`); return }
    onSaved()
  }

  async function handleDelete() {
    if (viewMode || !id) return
    const ok = window.confirm(t('DeleteConfirm', lang) || 'Delete?')
    if (!ok) return
    const { error } = await supabase.from(TBL_SUPS).delete().eq('id', id)
    if (error) alert(`${t('DeleteFailed', lang)}: ${error.message}`)
    else onDeleted()
  }

  return (
    <Overlay onClose={onClose}>
      <div className="h-full flex flex-col text-gray-900">
        <div className="px-4 md:px-6 pt-4 pb-3 flex items-center justify-between border-b">
          <div className="text-xl font-bold">
            {viewMode
              ? (t('Supplier', lang) || 'Supplier')
              : (id ? (t('Edit', lang) || 'Edit') : (t('New', lang) || 'New'))}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label={t('Close', lang)}>
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>

        <div className="px-4 md:px-6 py-4 grid gap-4 md:grid-cols-2 flex-1 overflow-y-auto items-start">
          <SectionCard title={t('Header', lang) || 'Header'}>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-sm text-gray-800">{t('Name', lang)}</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 disabled:bg-gray-50 h-10"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={viewMode}
                />
              </div>

              <div>
                <label className="text-sm text-gray-800">{t('PointOfContact', lang)}</label>
                <input className="mt-1 w-full border rounded-lg px-2 py-1 h-10"
                       value={poc} onChange={e => setPoc(e.target.value)} disabled={viewMode} />
              </div>
              <div>
                <label className="text-sm text-gray-800">{t('Phone', lang)}</label>
                <input className="mt-1 w-full border rounded-lg px-2 py-1 h-10"
                       value={phone} onChange={e => setPhone(e.target.value)} disabled={viewMode} />
              </div>

              <div className="col-span-2">
                <label className="text-sm text-gray-800">{t('Email', lang)}</label>
                <input type="email" className="mt-1 w-full border rounded-lg px-2 py-1 h-10"
                       value={email} onChange={e => setEmail(e.target.value)} disabled={viewMode} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title={t('Details', lang) || 'Details'}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-800">{t('OrderMethod', lang)}</label>
                <input className="mt-1 w-full border rounded-lg px-2 py-1 h-10"
                       value={orderMethod} onChange={e => setOrderMethod(e.target.value)} disabled={viewMode} />
              </div>
              <div>
                <label className="text-sm text-gray-800">{t('PaymentTerm', lang)}</label>
                <input className="mt-1 w-full border rounded-lg px-2 py-1 h-10"
                       value={paymentTerm} onChange={e => setPaymentTerm(e.target.value)} disabled={viewMode} />
              </div>
              <div className="col-span-2">
                <label className="text-sm text-gray-800">{t('PaymentMethod', lang)}</label>
                <input className="mt-1 w-full border rounded-lg px-2 py-1 h-10"
                       value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} disabled={viewMode} />
              </div>

              <div className="col-span-2">
                <label className="text-sm text-gray-800">{t('Notes', lang)}</label>
                <input className="mt-1 w-full border rounded-lg px-2 py-1 h-10"
                       value={notes} onChange={e => setNotes(e.target.value)} disabled={viewMode} />
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="px-4 md:px-6 py-4 border-t flex items-center justify-between">
          <div className="flex items-center gap-2">
            {viewMode ? (
              <button onClick={() => setViewMode(false)} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 active:scale-95">
                {t('Edit', lang)}
              </button>
            ) : (
              id && <button onClick={handleDelete} className="px-4 py-2 rounded-lg border text-red-600 hover:bg-red-50">{t('Delete', lang)}</button>
            )}
          </div>
          <div>
            <button onClick={onClose} className="px-4 py-2 rounded-lg border hover:opacity-80 active:scale-95">{t('Close', lang)}</button>
            {!viewMode && (
              <button onClick={save} disabled={!canSave} className="ml-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 active:scale-95 disabled:opacity-50">
                {t('Save', lang)}
              </button>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  )
}

/* ---------- Page ---------- */
type SortKey =
  | 'name' | 'poc' | 'phone' | 'email'
  | 'order_method' | 'payment_term' | 'payment_method'
  | 'notes'

export default function SuppliersPage() {
  const { language } = useSettings()

  const [rows, setRows] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)

  const [sortCol, setSortCol] = useState<SortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)

  const [filters, setFilters] = useState({
    q: '',
    orderMethod: '',
    paymentTerm: '',
    paymentMethod: '',
  })

  // selection
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const selectedIds = useMemo(() => Object.keys(selected).filter(id => selected[id]), [selected])
  const headerCbRef = useRef<HTMLInputElement>(null)

  // kebab menu
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  // editor
  const [openEditor, setOpenEditor] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | 'view'>('create')
  const [editingId, setEditingId] = useState<string | undefined>(undefined)
  const [initialItem, setInitialItem] = useState<Partial<Supplier> | null>(null)

  useEffect(() => { fetchAll() }, [])
  async function fetchAll() {
    setLoading(true)
    const { data } = await supabase.from(TBL_SUPS).select('*').order('name', { ascending: true })
    setRows((data as Supplier[]) || [])
    setLoading(false)
    setSelected({})
  }

  function toggleSort(col: SortKey) {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(true) }
  }

  const orderMethodOptions = useMemo(() => {
    return Array.from(new Set((rows || []).map(r => (r.order_method || '').trim()).filter(Boolean))).sort()
  }, [rows])
  const paymentTermOptions = useMemo(() => {
    return Array.from(new Set((rows || []).map(r => (r.payment_term || '').trim()).filter(Boolean))).sort()
  }, [rows])
  const paymentMethodOptions = useMemo(() => {
    return Array.from(new Set((rows || []).map(r => (r.payment_method || '').trim()).filter(Boolean))).sort()
  }, [rows])

  function applyFilters(list: Supplier[]) {
    const q = filters.q.trim().toLowerCase()
    const om = filters.orderMethod.trim().toLowerCase()
    const pt = filters.paymentTerm.trim().toLowerCase()
    const pm = filters.paymentMethod.trim().toLowerCase()

    let r = [...list]
    if (q) {
      r = r.filter(x =>
        [x.name, x.poc, x.phone, x.email, x.order_method, x.payment_term, x.payment_method, x.notes]
          .filter(Boolean)
          .some(v => String(v).toLowerCase().includes(q))
      )
    }
    if (om) r = r.filter(x => (x.order_method || '').toLowerCase() === om)
    if (pt) r = r.filter(x => (x.payment_term || '').toLowerCase() === pt)
    if (pm) r = r.filter(x => (x.payment_method || '').toLowerCase() === pm)

    r.sort((a, b) => {
      const getVal = (it: Supplier): any => {
        switch (sortCol) {
          case 'poc': return (it.poc || '').toLowerCase()
          case 'phone': return (it.phone || '').toLowerCase()
          case 'email': return (it.email || '').toLowerCase()
          case 'order_method': return (it.order_method || '').toLowerCase()
          case 'payment_term': return (it.payment_term || '').toLowerCase()
          case 'payment_method': return (it.payment_method || '').toLowerCase()
          case 'notes': return (it.notes || '').toLowerCase()
          case 'name':
          default: return (it.name || '').toLowerCase()
        }
      }
      const av = getVal(a)
      const bv = getVal(b)
      let cmp: number
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortAsc ? cmp : -cmp
    })
    return r
  }

  const filtered = applyFilters(rows)
  const allVisibleSelected = filtered.length > 0 && filtered.every(m => !!selected[m.id])
  const someVisibleSelected = filtered.some(m => !!selected[m.id]) && !allVisibleSelected
  useEffect(() => { if (headerCbRef.current) headerCbRef.current.indeterminate = someVisibleSelected }, [someVisibleSelected])

  function toggleSelectAllVisible() {
    const next: Record<string, boolean> = { ...selected }
    if (allVisibleSelected) filtered.forEach(m => next[m.id] = false)
    else filtered.forEach(m => next[m.id] = true)
    setSelected(next)
  }

  function openCreate() { setEditorMode('create'); setEditingId(undefined); setInitialItem(null); setOpenEditor(true) }
  function openView(it: Supplier) { setEditorMode('view'); setEditingId(it.id); setInitialItem(it); setOpenEditor(true) }
  function openEdit(it: Supplier) { setEditorMode('edit'); setEditingId(it.id); setInitialItem(it); setOpenEditor(true) }

  async function bulkDelete() {
    if (selectedIds.length === 0) return
    const ok = window.confirm((t('DeleteConfirm', language) || 'Delete selected?') + ` (${selectedIds.length})`)
    if (!ok) return
    const { error } = await supabase.from(TBL_SUPS).delete().in('id', selectedIds)
    if (error) { alert(`${t('DeleteFailed', language)}: ${error.message}`); return }
    await fetchAll()
  }

  async function handleExportExcel() {
    try {
      const list = filtered.map(r => ({
        [t('Name', language) || 'Name']: r.name || '',
        [t('PointOfContact', language) || 'Point of Contact']: r.poc || '',
        [t('Phone', language) || 'Phone']: r.phone || '',
        [t('Email', language) || 'Email']: r.email || '',
        [t('OrderMethod', language) || 'Order Method']: r.order_method || '',
        [t('PaymentTerm', language) || 'Payment Term']: r.payment_term || '',
        [t('PaymentMethod', language) || 'Payment Method']: r.payment_method || '',
        [t('Notes', language) || 'Notes']: r.notes || '',
      }))

      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet(t('Suppliers', language) || 'Suppliers')

      ws.columns = [
        { header: t('Name', language) || 'Name', key: 'Name', width: 28 },
        { header: t('PointOfContact', language) || 'Point of Contact', key: 'POC', width: 22 },
        { header: t('Phone', language) || 'Phone', key: 'Phone', width: 16 },
        { header: t('Email', language) || 'Email', key: 'Email', width: 28 },
        { header: t('OrderMethod', language) || 'Order Method', key: 'OrderMethod', width: 18 },
        { header: t('PaymentTerm', language) || 'Payment Term', key: 'PaymentTerm', width: 18 },
        { header: t('PaymentMethod', language) || 'Payment Method', key: 'PaymentMethod', width: 18 },
        { header: t('Notes', language) || 'Notes', key: 'Notes', width: 36 },
      ] as any

      ws.addRows(list as any[])
      const headerRow = ws.getRow(1)
      headerRow.font = { bold: true }
      headerRow.alignment = { vertical: 'middle', horizontal: 'left' }
      headerRow.height = 20
      headerRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF93C5FD' } } }
      })

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `suppliers_${new Date().toISOString().slice(0,10)}.xlsx`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert(`${t('ExportFailed', language)}: ${err.message}`)
    }
  }

  if (loading) return <div className="p-6">{t('Loading', language)}</div>

  return (
    <div className="max-w-7xl mx-auto p-4 text-gray-100">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Kebab menu in modalità selezione */}
          {selectMode && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                className="p-2 rounded-lg hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                title={t('BulkActions', language)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <EllipsisVerticalIcon className="w-6 h-6 text-white" />
              </button>
              {menuOpen && (
                <div className="absolute z-10 mt-2 w-56 rounded-xl border border-white/10 bg-white text-gray-900 shadow-xl">
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-red-600 disabled:opacity-50 flex items-center gap-2"
                    onClick={() => { setMenuOpen(false); bulkDelete() }}
                    disabled={selectedIds.length === 0}
                  >
                    <TrashIcon className="w-4 h-4" />
                    {t('Delete', language)}
                  </button>
                </div>
              )}
            </div>
          )}

          <h1 className="text-2xl font-bold text-white">{t('Suppliers', language) || 'Suppliers'}</h1>
          {selectedIds.length > 0 && (
            <span className="ml-2 text-sm text-blue-200">({selectedIds.length} {t('SelectedCountSuffix', language) || 'selected'})</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-lg
                       bg-blue-600/15 text-blue-200 hover:bg-blue-600/25
                       border border-blue-400/30"
            title={t('Export', language)}
          >
            <ArrowUpTrayIcon className="w-5 h-5" />
            {t('Export', language)}
          </button>

          <button
            onClick={() => setSelectMode(s => !s)}
            className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border ${
              selectMode
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border-blue-400/30'
            }`}
            title={selectMode ? (t('ExitSelection', language) || 'Exit selection') : (t('EnterSelection', language) || 'Select')}
          >
            <CheckCircleIcon className="w-5 h-5" />
            {selectMode ? (t('Selecting', language) || 'Selecting') : (t('Select', language) || 'Select')}
          </button>

          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-80"
          >
            <PlusIcon className="w-5 h-5" /> {(t('NewSupplier', language) || t('New', language) || 'New')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow p-3 mb-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={t('SearchSuppliersPlaceholder', language) || 'Search suppliers, contact, phone, email…'}
            value={filters.q}
            onChange={e => setFilters(s => ({ ...s, q: e.target.value }))}
            className="border rounded-lg px-2 h-9 text-sm text-gray-900 placeholder-gray-600 w-[260px]"
          />
          <select
            value={filters.orderMethod}
            onChange={e => setFilters(s => ({ ...s, orderMethod: e.target.value }))}
            className="border rounded-lg px-2 h-9 text-sm bg-white text-gray-900 w-[200px]"
            title={t('OrderMethod', language)}
          >
            <option value="">{(t('All', language) || 'All') + ' · ' + (t('OrderMethod', language) || 'Order Method')}</option>
            {orderMethodOptions.map(v => <option key={v} value={v.toLowerCase()}>{v}</option>)}
          </select>

          {/* ⇨ Payment Term prima di Payment Method */}
          <select
            value={filters.paymentTerm}
            onChange={e => setFilters(s => ({ ...s, paymentTerm: e.target.value }))}
            className="border rounded-lg px-2 h-9 text-sm bg-white text-gray-900 w-[200px]"
            title={t('PaymentTerm', language)}
          >
            <option value="">{(t('All', language) || 'All') + ' · ' + (t('PaymentTerm', language) || 'Payment Term')}</option>
            {paymentTermOptions.map(v => <option key={v} value={v.toLowerCase()}>{v}</option>)}
          </select>

          <select
            value={filters.paymentMethod}
            onChange={e => setFilters(s => ({ ...s, paymentMethod: e.target.value }))}
            className="border rounded-lg px-2 h-9 text-sm bg-white text-gray-900 w-[220px]"
            title={t('PaymentMethod', language)}
          >
            <option value="">{(t('All', language) || 'All') + ' · ' + (t('PaymentMethod', language) || 'Payment Method')}</option>
            {paymentMethodOptions.map(v => <option key={v} value={v.toLowerCase()}>{v}</option>)}
          </select>

          <div className="ml-auto" />
          <button
            type="button"
            onClick={() => setFilters({ q: '', orderMethod: '', paymentTerm: '', paymentMethod: '' })}
            className="inline-flex items-center gap-1 px-3 h-9 rounded-lg
                       border border-blue-600 text-blue-700 hover:bg-blue-50"
            title={t('Clear', language)}
          >
            {t('Clear', language)}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow p-3">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed text-sm text-gray-900">
            <colgroup>
              {[
                <col key="c0" className="w-[3rem]" />,
                <col key="c1" className="w-[20rem]" />,
                <col key="c2" className="w-[14rem]" />,
                <col key="c3" className="w-[22rem]" />, // Email (più larga)
                <col key="c4" className="w-[14rem]" />, // Phone
                <col key="c5" className="w-[16rem]" />, // Order Method
                <col key="c6" className="w-[16rem]" />, // Payment Term
                <col key="c7" className="w-[16rem]" />, // Payment Method
                <col key="c8" className="w-[22rem]" />, // Notes
              ]}
            </colgroup>

            <thead>
              <tr className="bg-blue-50 text-gray-800">
                <th className="p-2 text-left">
                  {selectMode ? (
                    <input
                      ref={headerCbRef}
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every(m => !!selected[m.id])}
                      onChange={toggleSelectAllVisible}
                      className="h-4 w-4"
                      title={t('SelectAll', language)}
                    />
                  ) : null}
                </th>

                {([
                  ['name', 'Name'],
                  ['poc', 'PointOfContact'],
                  ['email', 'Email'],
                  ['phone', 'Phone'],
                  ['order_method', 'OrderMethod'],
                  ['payment_term', 'PaymentTerm'],
                  ['payment_method', 'PaymentMethod'],
                  ['notes', 'Notes'],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th key={key} className="p-2 text-left">
                    <button type="button" onClick={() => toggleSort(key)} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-start font-semibold">
                        <span>{t(label as any, language) || label}</span>
                        <SortIcon active={sortCol===key} asc={sortAsc} />
                      </div>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filtered.map(it => {
                const isSelected = !!selected[it.id]
                return (
                  <tr key={it.id} className={`border-t hover:bg-blue-50 ${isSelected ? 'bg-blue-100/70' : ''}`}>
                    <td className="p-2">
                      {selectMode && (
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={isSelected}
                          onChange={e => setSelected(s => ({ ...s, [it.id]: e.target.checked }))}
                        />
                      )}
                    </td>

                    <td className="p-2 font-medium cursor-pointer text-blue-700 hover:underline" onClick={() => openView(it)}>{it.name}</td>
                    <td className="p-2">{it.poc}</td>
                    <td className="p-2 truncate">{it.email}</td>
                    <td className="p-2">{it.phone}</td>
                    <td className="p-2">{it.order_method}</td>
                    <td className="p-2">{it.payment_term}</td>
                    <td className="p-2">{it.payment_method}</td>
                    <td className="p-2 truncate">{it.notes}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

     {openEditor && (
        <SupplierEditor
          mode={editorMode}
          id={editingId}
          initial={initialItem}
          onClose={() => setOpenEditor(false)}
          onSaved={async () => {
            await fetchAll()
            setOpenEditor(false)   // chiudi dopo il save
          }}
          onDeleted={async () => {
            await fetchAll()
            setOpenEditor(false)   // chiudi dopo il delete
          }}
        />
      )}
    </div>        
  )               
}
