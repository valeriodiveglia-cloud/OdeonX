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
  ArrowPathIcon,
  BarsArrowUpIcon,
  BarsArrowDownIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline'
import CircularLoader from '@/components/CircularLoader'
import ExcelJS from 'exceljs'

interface ColumnHeaderProps {
  colKey: string
  label: string
  sortCol: string
  sortAsc: boolean
  onSort: (key: any, asc: boolean) => void
  values: string[]
  activeFilter: Set<string> | null
  onFilter: (vals: Set<string> | null) => void
  onClear: () => void
  open: boolean
  onToggle: () => void
  onClose: () => void
  dict: {
    sortAsc: string
    sortDesc: string
    selectAll: string
    deselectAll: string
    filterPlaceholder: string
    clearFilters: string
  }
  right?: boolean
  center?: boolean
  className?: string
}

function ColumnHeader({
  colKey,
  label,
  sortCol,
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

  const isActive = sortCol === colKey
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

  // helper to ensure all strings are safely handled
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
          sortAsc ? (
            <BarsArrowUpIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
          ) : (
            <BarsArrowDownIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
          )
        )}
        {hasFilter && <FunnelIcon className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />}
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            onToggle()
          }}
          className="ml-0.5 p-0.5 rounded hover:bg-gray-200 transition-colors flex-shrink-0 cursor-pointer"
          aria-label={`Menu ${label}`}
        >
          <EllipsisVerticalIcon className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>

      {open && dropdownStyle && (
        <div
          className="fixed bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] min-w-[220px] text-left text-sm text-gray-700 normal-case"
          style={dropdownStyle}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-2 space-y-1">
            <button
              type="button"
              onClick={() => onSort(colKey, true)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${
                isActive && sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'
              }`}
            >
              <BarsArrowUpIcon className="w-4 h-4" />
              {dict.sortAsc}
            </button>
            <button
              type="button"
              onClick={() => onSort(colKey, false)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${
                isActive && !sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'
              }`}
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
              className="w-full mb-2 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
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

    const { data: materials, error: checkError } = await supabase
      .from('materials')
      .select('name')
      .eq('supplier_id', id)
      .is('deleted_at', null)

    if (checkError) {
      console.error('[SupplierEditor] Error checking materials:', checkError)
    } else if (materials && materials.length > 0) {
      const materialNames = materials.map((m: any) => m.name).join(', ')
      const msg = (lang as string) === 'vi' 
        ? `Không thể xóa nhà cung cấp này vì đang liên kết với các nguyên liệu sau:\n\n${materialNames}`
        : (lang as string) === 'it'
        ? `Impossibile eliminare questo fornitore perché è associato ai seguenti materiali:\n\n${materialNames}`
        : `Cannot delete this supplier because it is associated with the following materials:\n\n${materialNames}`
      alert(msg)
      return
    }

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

  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string> | null>>({})
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const hasActiveFilters = Object.values(columnFilters).some(vals => vals !== null)
  function clearAllColumnFilters() {
    setColumnFilters({})
  }

  function applyColumnFilter(col: SortKey, vals: Set<string> | null) {
    setColumnFilters(prev => ({ ...prev, [col]: vals }))
    setOpenMenu(null)
  }

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

  function getColValue(it: Supplier, k: string) {
    switch (k) {
      case 'name':
        return it.name || ''
      case 'poc':
        return it.poc || ''
      case 'phone':
        return it.phone || ''
      case 'email':
        return it.email || ''
      case 'order_method':
        return it.order_method || ''
      case 'payment_term':
        return it.payment_term || ''
      case 'payment_method':
        return it.payment_method || ''
      case 'notes':
        return it.notes || ''
      default:
        return ''
    }
  }

  function handleSort(col: SortKey, asc: boolean) {
    setSortCol(col)
    setSortAsc(asc)
  }

  function applyFilters(list: Supplier[]) {
    let r = [...list]

    // Apply column checklist filters
    Object.entries(columnFilters).forEach(([col, vals]) => {
      if (!vals) return
      r = r.filter(x => {
        const v = getColValue(x, col)
        return vals.has(v)
      })
    })

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
    if (allVisibleSelected) {
      setSelected({})
    } else {
      const next: Record<string, boolean> = {}
      filtered.forEach(m => next[m.id] = true)
      setSelected(next)
    }
  }

  function openCreate() { setEditorMode('create'); setEditingId(undefined); setInitialItem(null); setOpenEditor(true) }
  function openView(it: Supplier) { setEditorMode('view'); setEditingId(it.id); setInitialItem(it); setOpenEditor(true) }
  function openEdit(it: Supplier) { setEditorMode('edit'); setEditingId(it.id); setInitialItem(it); setOpenEditor(true) }

  async function bulkDelete() {
    if (selectedIds.length === 0) return

    // Check if any selected suppliers are referenced by active materials
    const { data: materials, error: checkError } = await supabase
      .from('materials')
      .select('name, supplier_id')
      .in('supplier_id', selectedIds)
      .is('deleted_at', null)

    if (checkError) {
      console.error('[SuppliersPage] Error checking materials bulk:', checkError)
    } else if (materials && materials.length > 0) {
      // Find the names of suppliers that are in use
      const usedSupplierIds = new Set(materials.map((m: any) => m.supplier_id))
      const usedSuppliers = rows.filter(r => usedSupplierIds.has(r.id)).map(r => r.name).join(', ')

      const msg = (language as string) === 'vi'
        ? `Không thể xóa một số nhà cung cấp đã chọn vì họ đang liên kết với các nguyên liệu hoạt động. Các nhà cung cấp liên quan: ${usedSuppliers}`
        : (language as string) === 'it'
        ? `Alcuni dei fornitori selezionati non possono essere eliminati perché sono associati a dei materiali attivi. Fornitori interessati: ${usedSuppliers}`
        : `Some of the selected suppliers cannot be deleted because they are associated with active materials. Affected suppliers: ${usedSuppliers}`
      alert(msg)
      return
    }

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
      a.download = `suppliers_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert(`${t('ExportFailed', language)}: ${err.message}`)
    }
  }

  if (loading) return <CircularLoader />

  const columnHeaderDict = {
    sortAsc: language === 'vi' ? 'Sắp xếp tăng dần' : 'Sort Ascending',
    sortDesc: language === 'vi' ? 'Sắp xếp giảm dần' : 'Sort Descending',
    selectAll: language === 'vi' ? 'Chọn tất cả' : 'Select All',
    deselectAll: language === 'vi' ? 'Bỏ chọn tất cả' : 'Deselect All',
    filterPlaceholder: language === 'vi' ? 'Lọc...' : 'Filter...',
    clearFilters: language === 'vi' ? 'Xóa bộ lọc' : 'Clear Filters',
  }

  return (
    <div className="max-w-none mx-auto p-4 text-gray-100">
      {/* Header */}
      <div className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
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

            <h1 className="text-2xl font-bold text-white sm:text-3xl tracking-tight leading-normal">{t('Suppliers', language) || 'Suppliers'}</h1>
            {selectedIds.length > 0 && (
              <span className="ml-2 text-sm text-blue-200">({selectedIds.length} {t('SelectedCountSuffix', language) || 'selected'})</span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            {language === 'vi'
              ? 'Quản lý thông tin nhà cung cấp, phương thức đặt hàng và điều khoản thanh toán'
              : 'Manage supplier information, order methods, and payment terms'}
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllColumnFilters}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-red-600/10 hover:bg-red-600/20 text-red-200 border border-red-500/20 text-sm font-medium cursor-pointer"
            >
              <XMarkIcon className="w-4 h-4" />
              {language === 'vi' ? 'Xóa bộ lọc' : 'Clear Filters'}
            </button>
          )}

          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-lg
                       bg-blue-600/15 text-blue-200 hover:bg-blue-600/25
                       border border-blue-400/30 text-sm font-medium cursor-pointer"
            title={t('Export', language)}
          >
            <ArrowUpTrayIcon className="w-5 h-5" />
            {t('Export', language)}
          </button>

          <button
            onClick={() => setSelectMode(s => !s)}
            className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border text-sm font-medium cursor-pointer ${selectMode
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
            className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white text-sm font-medium cursor-pointer hover:opacity-80"
          >
            <PlusIcon className="w-5 h-5" /> {(t('NewSupplier', language) || t('New', language) || 'New')}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow p-3 overflow-x-auto">
        <table className="w-full table-auto text-sm text-gray-900">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
              <th className="p-2 w-7">
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

              <ColumnHeader
                colKey="name"
                label={t('Name', language) || 'Name'}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={handleSort}
                values={Array.from(new Set(rows.map(r => getColValue(r, 'name')))).sort()}
                activeFilter={columnFilters.name || null}
                onFilter={vals => applyColumnFilter('name', vals)}
                onClear={() => applyColumnFilter('name', null)}
                open={openMenu === 'name'}
                onToggle={() => setOpenMenu(openMenu === 'name' ? null : 'name')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="text-[11px]"
              />

              <ColumnHeader
                colKey="poc"
                label={t('PointOfContact', language) || 'Point of Contact'}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={handleSort}
                values={Array.from(new Set(rows.map(r => getColValue(r, 'poc')))).sort()}
                activeFilter={columnFilters.poc || null}
                onFilter={vals => applyColumnFilter('poc', vals)}
                onClear={() => applyColumnFilter('poc', null)}
                open={openMenu === 'poc'}
                onToggle={() => setOpenMenu(openMenu === 'poc' ? null : 'poc')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="text-[11px]"
              />

              <ColumnHeader
                colKey="email"
                label={t('Email', language) || 'Email'}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={handleSort}
                values={Array.from(new Set(rows.map(r => getColValue(r, 'email')))).sort()}
                activeFilter={columnFilters.email || null}
                onFilter={vals => applyColumnFilter('email', vals)}
                onClear={() => applyColumnFilter('email', null)}
                open={openMenu === 'email'}
                onToggle={() => setOpenMenu(openMenu === 'email' ? null : 'email')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="text-[11px]"
              />

              <ColumnHeader
                colKey="phone"
                label={t('Phone', language) || 'Phone'}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={handleSort}
                values={Array.from(new Set(rows.map(r => getColValue(r, 'phone')))).sort()}
                activeFilter={columnFilters.phone || null}
                onFilter={vals => applyColumnFilter('phone', vals)}
                onClear={() => applyColumnFilter('phone', null)}
                open={openMenu === 'phone'}
                onToggle={() => setOpenMenu(openMenu === 'phone' ? null : 'phone')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="text-[11px]"
              />

              <ColumnHeader
                colKey="order_method"
                label={t('OrderMethod', language) || 'Order Method'}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={handleSort}
                values={Array.from(new Set(rows.map(r => getColValue(r, 'order_method')))).sort()}
                activeFilter={columnFilters.order_method || null}
                onFilter={vals => applyColumnFilter('order_method', vals)}
                onClear={() => applyColumnFilter('order_method', null)}
                open={openMenu === 'order_method'}
                onToggle={() => setOpenMenu(openMenu === 'order_method' ? null : 'order_method')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="text-[11px]"
              />

              <ColumnHeader
                colKey="payment_term"
                label={t('PaymentTerm', language) || 'Payment Term'}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={handleSort}
                values={Array.from(new Set(rows.map(r => getColValue(r, 'payment_term')))).sort()}
                activeFilter={columnFilters.payment_term || null}
                onFilter={vals => applyColumnFilter('payment_term', vals)}
                onClear={() => applyColumnFilter('payment_term', null)}
                open={openMenu === 'payment_term'}
                onToggle={() => setOpenMenu(openMenu === 'payment_term' ? null : 'payment_term')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="text-[11px]"
              />

              <ColumnHeader
                colKey="payment_method"
                label={t('PaymentMethod', language) || 'Payment Method'}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={handleSort}
                values={Array.from(new Set(rows.map(r => getColValue(r, 'payment_method')))).sort()}
                activeFilter={columnFilters.payment_method || null}
                onFilter={vals => applyColumnFilter('payment_method', vals)}
                onClear={() => applyColumnFilter('payment_method', null)}
                open={openMenu === 'payment_method'}
                onToggle={() => setOpenMenu(openMenu === 'payment_method' ? null : 'payment_method')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="text-[11px]"
              />

              <ColumnHeader
                colKey="notes"
                label={t('Notes', language) || 'Notes'}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={handleSort}
                values={Array.from(new Set(rows.map(r => getColValue(r, 'notes')))).sort()}
                activeFilter={columnFilters.notes || null}
                onFilter={vals => applyColumnFilter('notes', vals)}
                onClear={() => applyColumnFilter('notes', null)}
                open={openMenu === 'notes'}
                onToggle={() => setOpenMenu(openMenu === 'notes' ? null : 'notes')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="text-[11px]"
              />
            </tr>
          </thead>

          <tbody>
            {filtered.map((it, idx) => {
              const isSelected = !!selected[it.id]
              return (
                <tr
                  key={it.id}
                  className={`border-b border-gray-100 hover:bg-blue-50/40 cursor-pointer ${
                    idx % 2 === 0 ? 'bg-gray-50/30' : ''
                  }`}
                  onClick={() => openView(it)}
                  onDoubleClick={() => openEdit(it)}
                >
                  {/* checkbox: non propagare il click */}
                  <td
                    className="px-3 py-2.5 text-center"
                    onClick={e => e.stopPropagation()}
                    onDoubleClick={e => e.stopPropagation()}
                  >
                    {selectMode && (
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={isSelected}
                        onChange={e => setSelected(s => ({ ...s, [it.id]: e.target.checked }))}
                      />
                    )}
                  </td>

                  {/* niente link blu: il click è sulla riga */}
                  <td className="px-3 py-2.5 text-xs text-gray-900 font-semibold truncate max-w-[20rem]">{it.name}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 truncate max-w-[14rem]">{it.poc}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 truncate max-w-[22rem]">{it.email}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 truncate max-w-[14rem]">{it.phone}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 truncate max-w-[16rem]">{it.order_method}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 truncate max-w-[16rem]">{it.payment_term}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 truncate max-w-[16rem]">{it.payment_method}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 truncate max-w-[22rem]">{it.notes}</td>
                </tr>
              )
            })}

            {filtered.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-center text-gray-500" colSpan={9}>
                  {t('NoSuppliers', language) || 'No suppliers found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openEditor && (
        <SupplierEditor
          mode={editorMode}
          id={editingId}
          initial={initialItem}
          onClose={() => setOpenEditor(false)}
          onSaved={async () => {
            await fetchAll()
            setOpenEditor(false)
          }}
          onDeleted={async () => {
            await fetchAll()
            setOpenEditor(false)
          }}
        />
      )}
    </div>
  )
}
