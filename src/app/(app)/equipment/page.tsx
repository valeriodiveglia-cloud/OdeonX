// src/app/equipment/page.tsx

'use client'
import type { ParseResult } from 'papaparse'
import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase_shim'
import {
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  XMarkIcon,
  TrashIcon,
  PlusIcon,
  EllipsisVerticalIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  BarsArrowUpIcon,
  BarsArrowDownIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline'
import CircularLoader from '@/components/CircularLoader'
import Papa from 'papaparse'
import ExcelJS from 'exceljs'

// i18n + settings
import { t } from '@/lib/i18n'
import { useSettings } from '@/contexts/SettingsContext'

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

  const isActive = sortCol === colKey
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

/* ---------- DB tables ---------- */
const TBL_EQ = 'rental_equipment'
const TBL_EQ_CATS = 'equipment_categories'
const TBL_SUPS = 'suppliers'

/* ---------- Types ---------- */
type Cat = { id: number; name: string }
type Sup = { id: string; name: string }

type Equip = {
  id: string
  name: string
  category_id: number | null
  supplier_id: string | null
  cost: number | null
  vat_rate_percent: number | null
  markup_x: number | null
  final_price: number | null
  notes: string | null
  created_at: string
  last_update: string | null
  deleted_at: string | null
}

type CsvRow = {
  equipment: string
  category: string
  supplier: string
  cost?: string | number | null
  notes?: string | null
  vat_rate_percent?: string | number | null
}

/* ---------- Import resolve types (unica definizione) ---------- */
type ConflictItem = {
  key: string
  name: string
  currentCategoryId: number | null
  currentSupplierId: string | null
  csvCategoryName: string | null
  csvSupplierName: string | null
  categoryChanged: boolean
  supplierChanged: boolean
}
type UnifiedPending = {
  conflicts: ConflictItem[]
  rows: CsvRow[]
  newValues: { categories: string[]; suppliers: string[] }
}
type UnifiedChoice = {
  categoryByKey: Record<string, number | string | null | undefined>
  supplierByKey: Record<string, string | null | undefined>
  newCategoryMap: Record<string, number | string | undefined>
  newSupplierMap: Record<string, string | undefined>
  toCreateCats: Record<string, boolean>
  toCreateSups: Record<string, boolean>
}

/* ---------- Small UI helpers ---------- */
function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return <span className="inline-block w-4" />
  return asc ? (
    <ChevronUpIcon className="w-4 h-4 inline-block text-gray-700" />
  ) : (
    <ChevronDownIcon className="w-4 h-4 inline-block text-gray-700" />
  )
}
function fmtDate(s?: string | null) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}
function isOlderThanMonths(s?: string | null, months?: number | null) {
  if (!s) return false
  const d = new Date(s)
  if (isNaN(d.getTime())) return false
  const m = Number(months)
  if (!isFinite(m)) return false
  if (m <= 0) return d.getTime() < Date.now() - 1000
  const threshold = new Date()
  threshold.setMonth(threshold.getMonth() - m)
  return d < threshold
}
function moneyToNumber(raw: string | number | null | undefined) {
  if (raw == null) return null
  return Number(String(raw).replace(/\s+/g, '').replace(/,/g, ''))
}
function normKey(k: string) {
  return String(k || '')
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
function uniqLower(a: string[]) {
  return [...new Set(a.filter(Boolean).map(s => String(s).trim().toLowerCase()))]
}
function labelCreate(name: string) {
  return `__create__:${name}`
}
function capitalizeFirst(str: string) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}
// Title Case helpers
function toTitleCase(s: string) {
  const str = String(s || '').toLowerCase().trim()
  if (!str) return ''
  try {
    return str.replace(/\b\p{L}+/gu, w => w[0].toUpperCase() + w.slice(1))
  } catch {
    return str.replace(/\b([A-Za-zÀ-ÖØ-öø-ÿ]+)/g, w => w[0].toUpperCase() + w.slice(1))
  }
}
function titleCaseIf(v: string | null | undefined) {
  if (v == null) return v as any
  return toTitleCase(String(v))
}

/* =====================================================
   Overlay + Section
===================================================== */
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

/* =====================================================
   Bulk VAT Modal
===================================================== */
function BulkVatModal({
  lang,
  count,
  defaultVat,
  onCancel,
  onConfirm,
}: {
  lang: string
  count: number
  defaultVat: number
  onCancel: () => void
  onConfirm: (mode: 'set' | 'delta', value: number) => void
}) {
  const [mode, setMode] = useState<'set' | 'delta'>('set')
  const [val, setVal] = useState<string>('')

  function clamp(n: number) {
    return Math.max(0, Math.min(100, n))
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 text-gray-900">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-blue-800">{t('EditVatRate', lang)}</h2>
          <button onClick={onCancel} className="p-1 rounded hover:bg-gray-100" aria-label={t('Close', lang)}>
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          {t('AffectNItems', lang).replace('{n}', String(count))}
        </p>

        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="vat_mode"
              value="set"
              checked={mode === 'set'}
              onChange={() => setMode('set')}
            />
            <span className="text-sm">{t('SetExactRate', lang)}</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="vat_mode"
              value="delta"
              checked={mode === 'delta'}
              onChange={() => setMode('delta')}
            />
            <span className="text-sm">{t('AdjustBy', lang)} (±)</span>
          </label>

          <div>
            <label className="text-sm text-gray-800">{t('VatPercent', lang)}</label>
            <input
              className="mt-1 w-full border rounded-lg px-2 py-2 text-gray-900 h-10"
              type="number"
              step="1"
              min={0}
              max={100}
              value={val}
              onChange={e => setVal(e.target.value)}
              placeholder={mode === 'set' ? String(defaultVat) : '0'}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border">
            {t('Cancel', lang)}
          </button>
          <button
            onClick={() => {
              const num = Number(val)
              if (!isFinite(num)) return
              const v = mode === 'set' ? clamp(num) : num
              onConfirm(mode, v)
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"
            disabled={val.trim() === '' || !isFinite(Number(val))}
          >
            {t('Apply', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}

/* =====================================================
   Bulk Markup Modal
===================================================== */
function BulkMarkupModal({
  lang,
  count,
  defaultMarkup,
  onCancel,
  onConfirm,
}: {
  lang: string
  count: number
  defaultMarkup: number
  onCancel: () => void
  onConfirm: (mode: 'set' | 'delta', value: number) => void
}) {
  const [mode, setMode] = useState<'set' | 'delta'>('set')
  const [val, setVal] = useState<string>('')

  function clamp(n: number) {
    return Math.max(0, Math.min(100, n))
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 text-gray-900">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-blue-800">{t('BulkEditMarkup', lang) || 'Bulk Edit Markup'}</h2>
          <button onClick={onCancel} className="p-1 rounded hover:bg-gray-100" aria-label={t('Close', lang)}>
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          {(t('AffectNItems', lang) || 'Affects {n} items').replace('{n}', String(count))}
        </p>

        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mk_mode"
              value="set"
              checked={mode === 'set'}
              onChange={() => setMode('set')}
            />
            <span className="text-sm">{t('SetExactValue', lang) || 'Set exact value'}</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mk_mode"
              value="delta"
              checked={mode === 'delta'}
              onChange={() => setMode('delta')}
            />
            <span className="text-sm">{t('AdjustBy', lang) || 'Adjust by'} (±)</span>
          </label>

          <div>
            <label className="text-sm text-gray-800">{(t('Markup', lang) || 'Markup')} (×)</label>
            <input
              className="mt-1 w-full border rounded-lg px-2 py-2 text-gray-900 h-10"
              type="number"
              step="0.1"
              min={0}
              value={val}
              onChange={e => setVal(e.target.value)}
              placeholder={mode === 'set' ? String(defaultMarkup) : '0'}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border">
            {t('Cancel', lang)}
          </button>
          <button
            onClick={() => {
              const num = Number(val)
              if (!isFinite(num)) return
              const v = mode === 'set' ? clamp(num) : num
              onConfirm(mode, v)
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"
            disabled={val.trim() === '' || !isFinite(Number(val))}
          >
            {t('Apply', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}

/* =====================================================
   Add Entity Modal (Category / Supplier)
===================================================== */
function AddEntityModal({
  lang,
  type,
  onCancel,
  onCreated,
}: {
  lang: string
  type: 'category' | 'supplier'
  onCancel: () => void
  onCreated: (entity: Cat | Sup) => void
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const isCategory = type === 'category'
  const title = isCategory ? t('AddCategory', lang) : t('AddSupplier', lang)
  const placeholder = isCategory ? t('NewCategoryNamePrompt', lang) : t('NewSupplierNamePrompt', lang)

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      if (isCategory) {
        const { data, error } = await supabase
          .from(TBL_EQ_CATS)
          .insert({ name: trimmed })
          .select()
          .single()
        if (error || !data) throw error || new Error('Insert failed')
        onCreated({ id: data.id as number, name: data.name as string })
      } else {
        const { data, error } = await supabase
          .from(TBL_SUPS)
          .insert({ name: trimmed })
          .select()
          .single()
        if (error || !data) throw error || new Error('Insert failed')
        onCreated({ id: data.id as string, name: data.name as string })
      }
    } catch (e: any) {
      alert((t('CreateFailed', lang) || 'Create failed') + (e?.message ? `: ${e.message}` : ''))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[75] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 text-gray-900">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-blue-800">{title}</h2>
          <button onClick={onCancel} className="p-1 rounded hover:bg-gray-100" aria-label={t('Close', lang)}>
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <label className="text-sm text-gray-800">{t('Name', lang)}</label>
        <input
          autoFocus
          className="mt-1 w-full border rounded-lg px-2 py-2 text-gray-900 h-10"
          value={name}
          placeholder={placeholder}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleCreate()
          }}
        />

        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border">
            {t('Cancel', lang)}
          </button>
          <button
            onClick={handleCreate}
            disabled={name.trim() === '' || saving}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"
          >
            {t('Create', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}

/* =====================================================
   Editor create/edit/view
===================================================== */
type EditorProps = {
  mode: 'create' | 'edit' | 'view'
  id?: string
  cats: Cat[]
  sups: Sup[]
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
  initial?: Partial<Equip> | null
  onCategoryCreated?: (c: Cat) => void
  onSupplierCreated?: (s: Sup) => void
  userRole?: string | null
}
function EquipmentEditor(props: EditorProps) {
  const { language: lang, vatEnabled, vatRate } = useSettings()

  const {
    mode, id, cats, sups, onClose, onSaved, onDeleted, initial, onCategoryCreated, onSupplierCreated, userRole
  } = props

  const [viewMode, setViewMode] = useState(mode === 'view')
  const [catsLocal, setCatsLocal] = useState<Cat[]>(cats)
  const [supsLocal, setSupsLocal] = useState<Sup[]>(sups)

  useEffect(() => { setCatsLocal(cats) }, [cats])
  useEffect(() => { setSupsLocal(sups) }, [sups])

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [supplierId, setSupplierId] = useState<string>('')
  const [cost, setCost] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [vatRatePct, setVatRatePct] = useState<string>('') // per-item VAT%
  const [markupStr, setMarkupStr] = useState<string>('1.5') // NEW: markup editor

  const [addType, setAddType] = useState<null | 'category' | 'supplier'>(null)

  useEffect(() => {
    if (mode === 'edit' || mode === 'view') {
      const h = initial || {}
      setName(h.name || '')
      setCategoryId(h.category_id ? String(h.category_id) : '')
      setSupplierId(h.supplier_id ? String(h.supplier_id) : '')
      setCost(h.cost != null ? String(h.cost) : '')
      setNotes(h.notes || '')
      setVatRatePct(h.vat_rate_percent != null ? String(h.vat_rate_percent) : '')
      setViewMode(mode === 'view')

      // ✅ Usa il markup salvato (o 1.5). NON derivarlo dal final_price.
      const mk = Number(h.markup_x ?? 1.5)
      setMarkupStr(Number.isFinite(mk) ? String(mk) : '1.5')
    } else {
      setName('')
      setCategoryId('')
      setSupplierId('')
      setCost('')
      setNotes('')
      setVatRatePct('')
      setViewMode(false)
      setMarkupStr('1.5')
    }
  }, [mode, id, initial, vatEnabled, vatRate])

  function effVatPctLocal() {
    if (!vatEnabled) return 0
    const raw = vatRatePct.trim() === '' ? (vatRate ?? 0) : Number(vatRatePct)
    const clamped = Math.max(0, Math.min(100, isFinite(raw) ? raw : 0))
    return clamped
  }

  const markupNum = useMemo(() => {
    const n = Number(markupStr)
    return isFinite(n) && n >= 0 ? n : 0
  }, [markupStr])

  const finalPrice = useMemo(() => {
    const c = Number(cost || '0')
    if (!isFinite(c) || c <= 0) return ''
    const pct = effVatPctLocal() / 100
    const withVat = vatEnabled ? c * (1 + pct) : c
    return (withVat * markupNum).toFixed(2)
  }, [cost, vatEnabled, vatRatePct, vatRate, markupNum])

  const costOk = useMemo(() => {
    const n = Number(cost)
    return cost.trim() !== '' && Number.isFinite(n) && n > 0
  }, [cost])

  const canSave = !viewMode
    && name.trim().length > 0
    && !!categoryId
    && !!supplierId
    && costOk


  async function save() {
    if (viewMode) return

    const cNum = cost ? Number(cost) : null
    const pctVal = vatEnabled
      ? (vatRatePct.trim() === '' ? (vatRate ?? 0) : Math.max(0, Math.min(100, Number(vatRatePct))))
      : null

    // Payload senza final_price: lo calcola il trigger in DB
    const payload: any = {
      name: name.trim(),
      category_id: categoryId ? Number(categoryId) : null,
      supplier_id: supplierId || null,
      cost: cNum,
      markup_x: markupNum || null,
      notes: notes || null,
      last_update: new Date().toISOString(),
      vat_rate_percent: vatEnabled ? pctVal : null,
    }

    if (id) {
      const { error } = await supabase.from(TBL_EQ).update(payload).eq('id', id)
      if (error) { alert(`${t('SaveFailed', lang)}: ${error.message}`); return }
      onSaved()
      return
    }

    const { error } = await supabase.from(TBL_EQ).insert(payload)
    if (error) { alert(`${t('SaveFailed', lang)}: ${error.message}`); return }
    onSaved()
  }

  async function handleDelete() {
    if (viewMode || !id) return
    const ok = window.confirm(t('DeleteConfirm', lang))
    if (!ok) return
    const { error } = await supabase.from(TBL_EQ).delete().eq('id', id)
    if (error) alert(`${t('DeleteFailed', lang)}: ${error.message}`)
    else onDeleted()
  }

  return (
    <Overlay onClose={onClose}>
      <div className="h-full flex flex-col text-gray-900">
        <div className="px-4 md:px-6 pt-4 pb-3 flex items-center justify-between border-b">
          <div className="text-xl font-bold">
            {viewMode ? t('EquipmentOne', lang) : (id ? t('EditEquipment', lang) : t('NewEquipment', lang))}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label={t('Close', lang)}>
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>

        <div className="px-4 md:px-6 py-4 grid gap-4 md:grid-cols-2 flex-1 overflow-y-auto items-start">
          <SectionCard title={t('Header', lang)}>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-sm text-gray-800">{t('Equipment', lang)}</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 disabled:bg-gray-50 h-10"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={viewMode}
                />
              </div>

              <div>
                <label className="text-sm text-gray-800">{t('Category', lang)}</label>
                <select
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 bg-white disabled:bg-gray-50 h-10"
                  value={categoryId}
                  onChange={async e => {
                    const v = e.target.value
                    if (v === '__add__') { setAddType('category'); return }
                    setCategoryId(v)
                  }}
                  disabled={viewMode}
                >
                  <option value="">{t('Select', lang)}</option>
                  {catsLocal.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="__add__">➕ {t('AddCategory', lang)}</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-800">{t('Supplier', lang)}</label>
                <select
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 bg-white disabled:bg-gray-50 h-10"
                  value={supplierId}
                  onChange={async e => {
                    const v = e.target.value
                    if (v === '__add__') { setAddType('supplier'); return }
                    setSupplierId(v)
                  }}
                  disabled={viewMode}
                >
                  <option value="">{t('Select', lang)}</option>
                  {supsLocal.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value="__add__">➕ {t('AddSupplier', lang)}</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="text-sm text-gray-800">{t('Notes', lang)}</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 disabled:bg-gray-50 h-10"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  disabled={viewMode}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title={t('Pricing', lang)}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-800">{t('Cost', lang)}</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 disabled:bg-gray-50 h-10"
                  type="number"
                  step="any"
                  value={cost}
                  onChange={e => setCost(e.target.value)}
                  disabled={viewMode}
                />
              </div>

              {vatEnabled && (
                <div>
                  <label className="text-sm text-gray-800">{t('VatRatePct', lang)}</label>
                  <input
                    className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 disabled:bg-gray-50 h-10"
                    type="number"
                    step="1"
                    min={0}
                    max={100}
                    value={vatRatePct}
                    onChange={e => setVatRatePct(e.target.value)}
                    placeholder={vatRate != null ? String(vatRate) : '0'}
                    disabled={viewMode}
                  />
                </div>
              )}

              <div>
                <label className="text-sm text-gray-800">{t('Markup', lang) || 'Markup (×)'}</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 disabled:bg-gray-50 h-10"
                  type="number"
                  step="0.5"
                  min={0}
                  value={markupStr}
                  onChange={e => setMarkupStr(e.target.value)}
                  disabled={viewMode}
                />
              </div>

              <div className={vatEnabled ? '' : 'col-span-2'}>
                <label className="text-sm text-gray-800">{t('FinalPriceAuto', lang)}</label>
                <div className="mt-1 h-10 rounded-lg border bg-gray-50 px-3 flex items-center justify-end select-none">
                  <span className="font-semibold tabular-nums">{finalPrice || '--'}</span>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="px-4 md:px-6 py-4 border-t flex items-center justify-between">
          <div className="flex items-center gap-2">
            {viewMode ? (
              userRole !== 'accountant' && (
                <button onClick={() => setViewMode(false)} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 active:scale-95">{t('Edit', lang)}</button>
              )
            ) : (
              id && userRole !== 'accountant' && <button onClick={handleDelete} className="px-4 py-2 rounded-lg border text-red-600 hover:bg-red-50">{t('Delete', lang)}</button>
            )}
          </div>
          <div>
            <button onClick={onClose} className="px-4 py-2 rounded-lg border hover:opacity-80 active:scale-95">{t('Close', lang)}</button>
            {!viewMode && userRole !== 'accountant' && (
              <button onClick={save} disabled={!canSave} className="ml-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 active:scale-95 disabled:opacity-50">{t('Save', lang)}</button>
            )}
          </div>
        </div>
      </div>

      {addType && (
        <AddEntityModal
          lang={lang}
          type={addType}
          onCancel={() => setAddType(null)}
          onCreated={(entity) => {
            if (addType === 'category') {
              const c = entity as Cat
              setCatsLocal(prev => [...prev, c])
              setCategoryId(String(c.id))
              onCategoryCreated?.(c)
            } else {
              const s = entity as Sup
              setSupsLocal(prev => [...prev, s])
              setSupplierId(String(s.id))
              onSupplierCreated?.(s)
            }
            setAddType(null)
          }}
        />
      )}
    </Overlay>
  )
}

/* =====================================================
   Resolve Import Modal — stile Materials
===================================================== */
function ResolveImportModal({
  pending,
  cats,
  sups,
  onConfirm,
  onCancel,
}: {
  pending: UnifiedPending
  cats: Cat[]
  sups: Sup[]
  onConfirm: (choice: UnifiedChoice) => void
  onCancel: () => void
}) {
  const { language: lang } = useSettings()

  // Lookup per nome (lowercase) → entity
  const catByLower = useMemo(() => {
    const m = new Map<string, Cat>()
    cats.forEach(c => m.set(String(c.name).toLowerCase(), c))
    return m
  }, [cats])
  const supByLower = useMemo(() => {
    const m = new Map<string, Sup>()
    sups.forEach(s => m.set(String(s.name).toLowerCase(), s))
    return m
  }, [sups])

  // Righe da visualizzare: unione di "conflicts" + righe CSV con cat/sup mancanti
  const rows = useMemo(() => {
    const bag = new Map<string, {
      key: string
      titleName: string
      csvCategoryName: string | null
      csvSupplierName: string | null
      currentCategoryId: number | null
      currentSupplierId: string | null
      categoryChanged: boolean
      supplierChanged: boolean
    }>()

    // 1) conflitti calcolati lato parsing
    for (const it of (pending.conflicts || [])) {
      bag.set(it.key, {
        key: it.key,
        titleName: toTitleCase(it.name),
        csvCategoryName: titleCaseIf(it.csvCategoryName),
        csvSupplierName: titleCaseIf(it.csvSupplierName),
        currentCategoryId: it.currentCategoryId,
        currentSupplierId: it.currentSupplierId,
        categoryChanged: !!it.categoryChanged,
        supplierChanged: !!it.supplierChanged,
      })
    }

    // 2) “nuovi” casi: se il CSV cita cat/sup non presenti in DB,
    // aggiungiamo comunque una riga da risolvere anche se non ci sono conflitti
    for (const r of (pending.rows || [])) {
      const name = toTitleCase(String(r.equipment || ''))
      if (!name) continue
      const key = normKey(name)

      const csvCat = titleCaseIf(r.category as any)
      const csvSup = titleCaseIf(r.supplier as any)
      const lowerCat = (csvCat || '').toLowerCase()
      const lowerSup = (csvSup || '').toLowerCase()

      const catInDb = !!lowerCat && catByLower.has(lowerCat)
      const supInDb = !!lowerSup && supByLower.has(lowerSup)

      // Se uno dei due non esiste in DB → riga “da creare”
      if (!catInDb || !supInDb) {
        bag.set(key, {
          key,
          titleName: name,
          csvCategoryName: csvCat || null,
          csvSupplierName: csvSup || null,
          currentCategoryId: catInDb ? (catByLower.get(lowerCat) as Cat).id : null,
          currentSupplierId: supInDb ? (supByLower.get(lowerSup) as Sup).id : null,
          categoryChanged: !catInDb,
          supplierChanged: !supInDb,
        })
      }
    }

    const out = Array.from(bag.values())
    out.sort((a, b) => a.titleName.localeCompare(b.titleName, undefined, { numeric: true }))
    return out
  }, [pending.conflicts, pending.rows, catByLower, supByLower])

  // Stato scelte per riga (category/supplier)
  const [categoryByKey, setCategoryByKey] = useState<Record<string, number | string | null>>({})
  const [supplierByKey, setSupplierByKey] = useState<Record<string, string | null>>({})

  // “Nuovi” nomi dal CSV (servono per Add all)
  const newCatNames = useMemo(
    () => (pending.newValues?.categories || []).map(toTitleCase),
    [pending.newValues?.categories]
  )
  const newSupNames = useMemo(
    () => (pending.newValues?.suppliers || []).map(toTitleCase),
    [pending.newValues?.suppliers]
  )

  // Mappe & flag per creazioni bulk
  const [newCategoryMap, setNewCategoryMap] = useState<Record<string, number | string>>({})
  const [newSupplierMap, setNewSupplierMap] = useState<Record<string, string>>({})
  const [toCreateCats, setToCreateCats] = useState<Record<string, boolean>>({})
  const [toCreateSups, setToCreateSups] = useState<Record<string, boolean>>({})

  // Pre-lock quando una colonna è già valida e non “changed”
  useEffect(() => {
    setCategoryByKey(prev => {
      const next = { ...prev }
      rows.forEach(r => {
        const locked = !!r.currentCategoryId && !r.categoryChanged
        if (locked && typeof next[r.key] === 'undefined') next[r.key] = r.currentCategoryId
      })
      return next
    })
    setSupplierByKey(prev => {
      const next = { ...prev }
      rows.forEach(r => {
        const locked = !!r.currentSupplierId && !r.supplierChanged
        if (locked && typeof next[r.key] === 'undefined') next[r.key] = r.currentSupplierId as any
      })
      return next
    })
  }, [rows])

  // Add all: marca tutte le nuove categorie/fornitori da creare
  // Add all: marca tutte le nuove categorie/fornitori da creare
  function handleAddAll() {
    const nc: Record<string, boolean> = {}
    const ns: Record<string, boolean> = {}
    const ncm: Record<string, string> = {}
    const nsm: Record<string, string> = {}
    const catBy: Record<string, string> = {}
    const supBy: Record<string, string> = {}

    newCatNames.forEach(n => {
      nc[n] = true
      ncm[n] = labelCreate(n)
      rows.forEach(r => {
        if (r.csvCategoryName && toTitleCase(r.csvCategoryName) === n) {
          catBy[r.key] = labelCreate(n)
        }
      })
    })

    newSupNames.forEach(n => {
      ns[n] = true
      nsm[n] = labelCreate(n)
      rows.forEach(r => {
        if (r.csvSupplierName && toTitleCase(r.csvSupplierName) === n) {
          supBy[r.key] = labelCreate(n)
        }
      })
    })

    setToCreateCats(nc)
    setToCreateSups(ns)
    setNewCategoryMap(ncm)
    setNewSupplierMap(nsm)
    setCategoryByKey(prev => ({ ...prev, ...catBy }))
    setSupplierByKey(prev => ({ ...prev, ...supBy }))
  }


  function handleContinue() {
    onConfirm({ categoryByKey, supplierByKey, newCategoryMap, newSupplierMap, toCreateCats, toCreateSups })
  }

  // UI classes (stesso look del modal Materials)
  const colHead = 'text-xs font-semibold uppercase tracking-wide text-gray-800'
  const selectBase =
    'w-full h-10 border rounded-lg px-2 bg-white text-gray-900 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40'
  const actionText = 'text-sm text-blue-700 hover:underline cursor-pointer select-none'
  const plusBtn =
    'w-6 h-6 border border-blue-400 text-blue-700 rounded flex items-center justify-center hover:bg-blue-50'

  return (
    <div className="fixed inset-0 z-[65] flex items-start justify-center p-4">
      <div className="absolute inset-0 bg-black/55" onClick={onCancel} />
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="text-xl font-bold text-gray-900">{t('ResolveImport', lang) || 'Resolve import'}</div>
          <button onClick={handleAddAll} className="text-sm text-blue-700 hover:underline" title="Add all">
            {t('AddAll', lang) || 'Add all'}
          </button>
        </div>

        {/* Body */}
        <div className="p-5 max-h-[70vh] overflow-auto">
          {rows.length === 0 && (
            <div className="text-gray-800">{t('NothingToResolve', lang) || 'Nothing to resolve.'}</div>
          )}

          {rows.length > 0 && (
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-x-6 gap-y-5">
              <div className={colHead}>{t('Name', lang) || 'Name'}</div>
              <div className={colHead}>{t('Category', lang) || 'Category'}</div>
              <div className={colHead}>{t('Supplier', lang) || 'Supplier'}</div>

              {rows.map(r => {
                const catLocked = !!r.currentCategoryId && !r.categoryChanged
                const supLocked = !!r.currentSupplierId && !r.supplierChanged
                const selectedCat = (categoryByKey[r.key] ?? (catLocked ? r.currentCategoryId : '')) as any
                const selectedSup = (supplierByKey[r.key] ?? (supLocked ? r.currentSupplierId : '')) as any

                return (
                  <Fragment key={r.key}>
                    {/* NAME */}
                    <div className="py-1">
                      <div className="text-sm font-semibold text-gray-900">{r.titleName}</div>
                    </div>

                    {/* CATEGORY */}
                    <div className="py-1">
                      <select
                        className={selectBase}
                        value={selectedCat ?? ''}
                        onChange={e => {
                          const v = e.target.value
                          setCategoryByKey(prev => ({
                            ...prev,
                            [r.key]: v === '' ? null : (isNaN(Number(v)) ? v : Number(v))
                          }))
                        }}
                        disabled={catLocked}
                      >
                        <option value="">{t('SelectCategory', lang) || 'Select Category'}</option>
                        {cats.map(c => (
                          <option key={c.id} value={c.id}>{toTitleCase(c.name)}</option>
                        ))}
                        {r.csvCategoryName && (
                          <option value={labelCreate(r.csvCategoryName)}>
                            {t('CreateNew', lang) || 'Create new'}: {toTitleCase(r.csvCategoryName)}
                          </option>
                        )}
                      </select>

                      {!catLocked && r.csvCategoryName && (
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className={actionText}
                            onClick={() => {
                              setCategoryByKey(prev => ({ ...prev, [r.key]: labelCreate(r.csvCategoryName!) }))
                              setToCreateCats(prev => ({ ...prev, [toTitleCase(r.csvCategoryName!)]: true }))
                            }}
                          >
                            {toTitleCase(r.csvCategoryName)}
                          </span>
                          <button
                            className={plusBtn}
                            onClick={() => {
                              setCategoryByKey(prev => ({ ...prev, [r.key]: labelCreate(r.csvCategoryName!) }))
                              setToCreateCats(prev => ({ ...prev, [toTitleCase(r.csvCategoryName!)]: true }))
                            }}
                            title={t('Add', lang) || 'Add'}
                            aria-label={t('Add', lang) || 'Add'}
                          >
                            +
                          </button>
                        </div>
                      )}

                      {catLocked && (
                        <div className="mt-1 text-xs text-green-700">
                          <span className="px-2 py-0.5 rounded-full border border-green-300 bg-green-50">
                            {t('LockedExisting', lang) || 'Existing (locked)'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* SUPPLIER */}
                    <div className="py-1">
                      <select
                        className={selectBase}
                        value={selectedSup ?? ''}
                        onChange={e => {
                          const v = e.target.value
                          setSupplierByKey(prev => ({ ...prev, [r.key]: v === '' ? null : v }))
                        }}
                        disabled={supLocked}
                      >
                        <option value="">{t('SelectSupplier', lang) || 'Select Supplier'}</option>
                        {sups.map(s => (
                          <option key={s.id} value={s.id}>{toTitleCase(s.name)}</option>
                        ))}
                        {r.csvSupplierName && (
                          <option value={labelCreate(r.csvSupplierName)}>
                            {t('CreateNew', lang) || 'Create new'}: {toTitleCase(r.csvSupplierName)}
                          </option>
                        )}
                      </select>

                      {!supLocked && r.csvSupplierName && (
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className={actionText}
                            onClick={() => {
                              setSupplierByKey(prev => ({ ...prev, [r.key]: labelCreate(r.csvSupplierName!) }))
                              setToCreateSups(prev => ({ ...prev, [toTitleCase(r.csvSupplierName!)]: true }))
                            }}
                          >
                            {toTitleCase(r.csvSupplierName)}
                          </span>
                          <button
                            className={plusBtn}
                            onClick={() => {
                              setSupplierByKey(prev => ({ ...prev, [r.key]: labelCreate(r.csvSupplierName!) }))
                              setToCreateSups(prev => ({ ...prev, [toTitleCase(r.csvSupplierName!)]: true }))
                            }}
                            title={t('Add', lang) || 'Add'}
                            aria-label={t('Add', lang) || 'Add'}
                          >
                            +
                          </button>
                        </div>
                      )}

                      {supLocked && (
                        <div className="mt-1 text-xs text-green-700">
                          <span className="px-2 py-0.5 rounded-full border border-green-300 bg-green-50">
                            {t('LockedExisting', lang) || 'Existing (locked)'}
                          </span>
                        </div>
                      )}
                    </div>
                  </Fragment>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-100"
          >
            {t('Cancel', lang) || 'Cancel'}
          </button>
          <button
            onClick={handleContinue}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-90"
          >
            {t('Continue', lang) || 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* =====================================================
   Import progress modal
===================================================== */
function ImportProgressModal({ progress }: { progress: number }) {
  const { language } = useSettings()
  const pct = Math.min(100, Math.max(0, Math.round(progress)))
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 text-gray-900">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-blue-800">{t('ImportInProgress', language)}</h2>
          <span className="text-2xl font-extrabold tabular-nums">{pct}%</span>
        </div>
        <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-[width] duration-200 ease-out"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          />
        </div>
      </div>
    </div>
  )
}

/* =====================================================
   Page
===================================================== */
type SortKey =
  | 'name'
  | 'category_id'
  | 'supplier_id'
  | 'cost'
  | 'vat_rate'
  | 'final_calc'
  | 'last_update'
  | 'notes'

export default function EquipmentPage() {
  const { language, currency, vatEnabled, vatRate, equipmentReviewMonths, equipmentCsvConfirm, askCsvConfirm, defaultMarkupEquipmentPct } = useSettings()
  const locale = language === 'vi' ? 'vi-VN' : 'en-US'

  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    const fetchRole = async () => {
      const { data: user } = await supabase.auth.getUser()
      if (user?.user) {
        const { data } = await supabase.from('app_accounts').select('role').eq('user_id', user.user.id).single()
        setRole(data?.role || 'staff')
      }
    }
    fetchRole()
  }, [])

  const reviewM = useMemo(() => {
    const n = Number(equipmentReviewMonths)
    return Number.isFinite(n) ? n : 4
  }, [equipmentReviewMonths])

  const num = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: currency === 'VND' ? 0 : 2,
        minimumFractionDigits: currency === 'VND' ? 0 : 2,
      } as any),
    [locale, currency]
  )

  const [cats, setCats] = useState<Cat[]>([])
  const [sups, setSups] = useState<Sup[]>([])
  const [rows, setRows] = useState<Equip[]>([])
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

  const fileRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)

  const [openEditor, setOpenEditor] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | 'view'>('create')
  const [editingId, setEditingId] = useState<string | undefined>(undefined)
  const [initialItem, setInitialItem] = useState<Partial<Equip> | null>(null)

  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const selectedIds = useMemo(() => Object.keys(selected).filter(id => selected[id]), [selected])
  const headerCbRef = useRef<HTMLInputElement>(null)
  const [selectMode, setSelectMode] = useState(false)

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

  // Bulk modals
  const [showVatModal, setShowVatModal] = useState(false)
  const [showMarkupModal, setShowMarkupModal] = useState(false)

  // Resolve Import Modal state
  const [unifiedOpen, setUnifiedOpen] = useState<null | {
    conflicts: ConflictItem[]
    rows: CsvRow[]
    newValues: { categories: string[]; suppliers: string[] }
  }>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [cRes, sRes, eRes] = await Promise.all([
      supabase.from(TBL_EQ_CATS).select('*').order('name', { ascending: true }),
      supabase.from(TBL_SUPS).select('*').order('name', { ascending: true }),
      supabase.from(TBL_EQ).select('*').is('deleted_at', null).order('created_at', { ascending: false }),
    ])
    if (cRes.data) setCats(cRes.data as Cat[])
    if (sRes.data) setSups(sRes.data as Sup[])
    setRows((eRes.data as Equip[]) || [])
    setLoading(false)
    setSelected({})
  }

  function toggleSort(col: SortKey) {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(true) }
  }

  // Helpers VAT & Final
  function effVatPct(e: Equip) {
    if (!vatEnabled) return 0
    // se l’item non ha la VAT impostata, usa il default dei Settings
    const raw = e.vat_rate_percent
    const v = raw == null ? (vatRate ?? 0) : Number(raw)
    return Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0))
  }

  const defaultMarkup = Number(defaultMarkupEquipmentPct ?? 1.5)

  function finalCalc(e: Equip) {
    const c = e.cost ?? 0
    const base = vatEnabled ? c * (1 + effVatPct(e) / 100) : c
    const m = e.markup_x ?? defaultMarkup
    return base * m
  }

  function getColValue(it: Equip, k: string) {
    switch (k) {
      case 'name':
        return it.name || ''
      case 'category_id': {
        const c = cats.find(x => x.id === it.category_id)
        return c ? c.name : ''
      }
      case 'supplier_id': {
        const s = sups.find(x => x.id === it.supplier_id)
        return s ? s.name : ''
      }
      case 'cost':
        return it.cost != null ? num.format(it.cost) : ''
      case 'vat_rate':
        return `${effVatPct(it)}%`
      case 'markup_x':
        return it.markup_x != null ? it.markup_x.toString() : ''
      case 'final_calc':
        return num.format(finalCalc(it))
      case 'notes':
        return it.notes || ''
      case 'last_update':
        return fmtDate(it.last_update)
      default:
        return ''
    }
  }

  function handleSort(col: SortKey, asc: boolean) {
    setSortCol(col)
    setSortAsc(asc)
  }

  function applyFilters(list: Equip[]) {
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
      const getVal = (it: Equip): any => {
        switch (sortCol) {
          case 'category_id': return it.category_id ?? -Infinity
          case 'supplier_id': return it.supplier_id ?? ''
          case 'cost': return it.cost ?? -Infinity
          case 'vat_rate': return effVatPct(it)
          case 'final_calc': return finalCalc(it)
          case 'last_update': return it.last_update ? new Date(it.last_update).getTime() : 0
          case 'notes': return (it.notes ?? '').toLowerCase()
          case 'name':
          default: return (it.name ?? '').toLowerCase()
        }
      }
      const av = getVal(a)
      const bv = getVal(b)
      const cmp = (typeof av === 'number' && typeof bv === 'number')
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortAsc ? cmp : -cmp
    })

    return r
  }

  function openCreate() {
    setEditorMode('create')
    setEditingId(undefined)
    setInitialItem(null)
    setOpenEditor(true)
  }
  function openView(it: Equip) {
    setEditorMode('view'); setEditingId(it.id); setInitialItem(it); setOpenEditor(true)
  }
  function openEdit(it: Equip) {
    setEditorMode('edit'); setEditingId(it.id); setInitialItem(it); setOpenEditor(true)
  }

  /* =====================================================
     CSV: header map & helpers
  ===================================================== */
  const headerMap: Record<string, string> = {
    'equipment': 'equipment',
    'name': 'equipment',
    'category': 'category',
    'supplier': 'supplier',
    'cost': 'cost',
    'notes': 'notes',
    'thiết bị': 'equipment',
    'tên': 'equipment',
    'danh mục': 'category',
    'nhà cung cấp': 'supplier',
    'chi phí': 'cost',
    'ghi chú': 'notes',
    'final price': '__ignore__',
    'final_price': '__ignore__',
    'last update': '__ignore__',
    'last_update': '__ignore__',
    'giá cuối': '__ignore__',
    'cập nhật lần cuối': '__ignore__',
    'vat': 'vat_rate_percent',
    'vat rate': 'vat_rate_percent',
    'vat rate (%)': 'vat_rate_percent',
    'vatratepct': 'vat_rate_percent',
    'vat_rate_percent': 'vat_rate_percent',
  }
  const toKey = (s: string) => s.normalize('NFKC').trim().toLowerCase()

  // chiave normalizzata per gli equipment
  function buildKey(name: string) {
    return normKey(String(name || '').normalize('NFKC'))
  }

  async function runImport(
    data: CsvRow[],
    catMap: Record<string, number>,
    supMap: Record<string, string>,
    overrides: UnifiedChoice | null
  ) {
    const listByKey = new Map<string, Equip[]>()
    for (const e of rows) {
      const k = buildKey(e.name)
      const arr = listByKey.get(k)
      if (arr) arr.push(e); else listByKey.set(k, [e])
    }

    let inserted = 0, updated = 0, skipped = 0

    for (let i = 0; i < data.length; i++) {
      const r = data[i]
      const name = (r.equipment || '').trim()
      const supplierName = (r.supplier || '').trim().toLowerCase()
      const categoryName = (r.category || '').trim().toLowerCase()

      if (!name || !supplierName || !categoryName) {
        skipped++; setProgress(Math.round(((i + 1) / data.length) * 100)); continue
      }

      let category_id: number | null | undefined =
        catMap[categoryName] ?? cats.find(c => c.name.toLowerCase() === categoryName)?.id ?? null
      let supplier_id: string | null | undefined =
        supMap[supplierName] ?? sups.find(s => s.name.toLowerCase() === supplierName)?.id ?? null

      const key = buildKey(name)

      if (overrides) {
        if (Object.prototype.hasOwnProperty.call(overrides.categoryByKey, key)) {
          const ov = overrides.categoryByKey[key]
          if (typeof ov !== 'undefined') category_id = ov === '' ? null : (ov as number | null)
        }
        if (Object.prototype.hasOwnProperty.call(overrides.supplierByKey, key)) {
          const ov = overrides.supplierByKey[key]
          if (typeof ov !== 'undefined') supplier_id = ov === '' ? null : (ov as string | null)
        }
      }

      if (!category_id || !supplier_id) {
        skipped++; setProgress(Math.round(((i + 1) / data.length) * 100)); continue
      }

      if (typeof vatEnabled !== 'boolean') {
        alert('Settings non ancora caricati. Riprova tra 1 secondo.')
        return
      }

      const cost = moneyToNumber(r.cost)
      // ✅ Se VAT disattivo → null; se attivo → numero
      // nuovo: se nel CSV c'è un VAT valido, usa quello; altrimenti fallback ai settings
      let vatPctNum: number | null = null
      if (vatEnabled) {
        const fromCsv = r.vat_rate_percent
        if (fromCsv == null || String(fromCsv).trim?.() === '') {
          vatPctNum = Number(vatRate ?? 0)
        } else {
          const s = String(fromCsv).trim().replace('%', '').replace(/\s+/g, '').replace(',', '.')
          const n = Number(s)
          vatPctNum = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : Number(vatRate ?? 0)
        }
      } else {
        vatPctNum = null
      }


      // ✅ Nessun calcolo di final_price lato client: pensa a tutto il trigger in DB
      const proposed = {
        name,
        category_id,
        supplier_id,
        cost,
        markup_x: defaultMarkup,
        vat_rate_percent: vatPctNum,
        notes: r.notes || null,
      }

      const candidates = listByKey.get(key) || []
      const bySupplier = candidates.find(m => m.supplier_id === supplier_id)
      const byCategory = candidates.find(m => m.category_id === category_id)
      const mostRecent = candidates.length
        ? [...candidates].sort((a, b) =>
          (new Date(b.last_update || b.created_at).getTime()) -
          (new Date(a.last_update || a.created_at).getTime())
        )[0]
        : null
      const existing = bySupplier || byCategory || mostRecent || null

      if (existing) {
        const changed =
          (existing.category_id ?? null) !== (proposed.category_id ?? null) ||
          (existing.supplier_id ?? null) !== (proposed.supplier_id ?? null) ||
          (existing.cost ?? null) !== (proposed.cost ?? null) ||
          (existing.vat_rate_percent ?? null) !== (proposed.vat_rate_percent ?? null) ||
          (existing.markup_x ?? null) !== (proposed.markup_x ?? null) ||
          (existing.notes ?? null) !== (proposed.notes ?? null)


        if (!changed) {
          skipped++
        } else {
          const { error } = await supabase
            .from(TBL_EQ)
            .update({ ...proposed, last_update: new Date().toISOString() })
            .eq('id', existing.id)
          if (error) { skipped++ } else { updated++ }
        }
      } else {
        const { error } = await supabase
          .from(TBL_EQ)
          .insert({ ...proposed, last_update: new Date().toISOString() })
        if (error) { skipped++ } else { inserted++ }
      }

      setProgress(Math.round(((i + 1) / data.length) * 100))
    }

    setProgress(100)
    alert(`${t('CSVImportedOk', language)}.
${t('Inserted', language)}: ${inserted}
${t('Updated', language)}: ${updated}
${t('Skipped', language)}: ${skipped}`)
    await fetchAll()
  }

  /* -------- Import CSV (usa ResolveImportModal) -------- */
  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setProgress(0)
    try {
      const parsed = await new Promise<any>((resolve, reject) => {
        Papa.parse(f, {
          header: true,
          skipEmptyLines: 'greedy',
          dynamicTyping: false,
          transformHeader: (h: string, _i: number): string => headerMap[normKey(h)] ?? normKey(h),
          complete: (res: ParseResult<CsvRow>): void => resolve(res),
          error: (err: unknown): void => reject(err),
        })
      })

      // pulizia righe
      const cleaned = ((parsed.data as Record<string, any>[]) || []).map(r => {
        const out: Record<string, any> = {}
        Object.keys(r || {}).forEach(k => {
          if (k === '__ignore__') return
          const v = r[k]
          out[k] = typeof v === 'string' ? v.trim() : v
        })
        return out
      })

      type Bad = { row: number; missing: string[] }
      const bad: Bad[] = []

      const data: CsvRow[] = cleaned.map((r, idx) => {
        const equipment = String(r['equipment'] ?? '').trim()
        const category = String(r['category'] ?? '').trim()
        const supplier = String(r['supplier'] ?? '').trim()
        const rawCost = r['cost']
        const notes = r['notes'] ?? null

        // NEW: lettura/normalizzazione VAT (opzionale)
        const rawVat = r['vat_rate_percent']
        // accetta "21", "21.0", "21,0" → clamp 0..100; se vuoto o non numerico → null
        const vat_rate_percent =
          rawVat == null || String(rawVat).trim() === ''
            ? null
            : (() => {
              const n = Number(String(rawVat).replace(',', '.'))
              return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null
            })()

        const missing: string[] = []
        if (!equipment) missing.push(t('Equipment', language))
        if (!category) missing.push(t('Category', language))
        if (!supplier) missing.push(t('Supplier', language))
        if (rawCost == null || String(rawCost).trim() === '') missing.push(t('Cost', language))

        if (missing.length) bad.push({ row: idx + 2, missing })

        return { equipment, category, supplier, cost: rawCost, notes, vat_rate_percent }
      })
        .filter(r =>
          r.equipment.length > 0 &&
          r.category.length > 0 &&
          r.supplier.length > 0 &&
          r.cost !== null && String(r.cost).trim() !== ''
        )


      if (!data.length) {
        const samples = bad.slice(0, 5).map(b => `r${b.row}: ${b.missing.join(', ')}`).join(' | ')
        alert(
          `${t('CSVEmptyOrHeaders', language)}\n` +
          `${t('RequiredCols', language)}: ${t('Equipment', language)}, ${t('Category', language)}, ${t('Supplier', language)}, ${t('Cost', language)}. ${t('Notes', language)} ${t('IsOptional', language)}.\n` +
          (bad.length ? `${t('RowsFailingValidation', language)} (${bad.length}): ${samples}` : '')
        )
        return
      }

      const catMap: Record<string, number> = {}
      cats.forEach((c: any) => { catMap[toKey(c.name)] = c.id })
      const supMap: Record<string, string> = {}
      sups.forEach((s: any) => { supMap[toKey(s.name)] = s.id })

      const listByKey = new Map<string, Equip[]>()
      for (const m of rows) {
        const k = buildKey(m.name)
        const arr = listByKey.get(k)
        if (arr) arr.push(m); else listByKey.set(k, [m])
      }

      const conflicts: ConflictItem[] = []
      const nk = (s: string | null | undefined) => normKey(String(s || '').normalize('NFKC'))

      for (const r of data) {
        const key = buildKey(r.equipment)
        const candidates = listByKey.get(key) || []
        if (candidates.length === 0) continue

        const csvCatNorm = nk(r.category)
        const csvSupNorm = nk(r.supplier)

        const csvCatId = csvCatNorm
          ? cats.find(c => nk(c.name) === csvCatNorm)?.id ?? null
          : null
        const csvSupId = csvSupNorm
          ? sups.find(s => nk(s.name) === csvSupNorm)?.id ?? null
          : null

        const alreadyOk = candidates.some(m =>
          (m.category_id ?? null) === (csvCatId ?? null) &&
          (m.supplier_id ?? null) === (csvSupId ?? null)
        )
        if (alreadyOk) continue

        const bySupplier = csvSupId ? candidates.find(m => m.supplier_id === csvSupId) : undefined
        const byCategory = csvCatId ? candidates.find(m => m.category_id === csvCatId) : undefined
        const mostRecent = [...candidates].sort((a, b) =>
          (new Date(b.last_update || b.created_at).getTime()) -
          (new Date(a.last_update || a.created_at).getTime())
        )[0]
        const current = bySupplier || byCategory || mostRecent

        const currentCatNorm = current.category_id != null
          ? nk(cats.find(c => c.id === current.category_id)?.name)
          : ''
        const currentSupNorm = current.supplier_id != null
          ? nk(sups.find(s => s.id === current.supplier_id)?.name)
          : ''

        const categoryChanged = csvCatNorm !== currentCatNorm
        const supplierChanged = csvSupNorm !== currentSupNorm

        if (categoryChanged || supplierChanged) {
          conflicts.push({
            key,
            name: r.equipment,
            currentCategoryId: current.category_id,
            currentSupplierId: current.supplier_id,
            csvCategoryName: r.category || null,
            csvSupplierName: r.supplier || null,
            categoryChanged,
            supplierChanged,
          })
        }
      }

      // nuovi valori dal CSV (non esistenti in DB)
      const csvCats = uniqLower(data.map(r => r.category || ''))
      const csvSups = uniqLower(data.map(r => r.supplier || ''))
      const existingCatNames = cats.map(c => c.name.toLowerCase())
      const existingSupNames = sups.map(s => s.name.toLowerCase())
      const newCats = csvCats.filter(n => n && !existingCatNames.includes(n)).map(capitalizeFirst)
      const newSups = csvSups.filter(n => n && !existingSupNames.includes(n)).map(capitalizeFirst)

      // preferenze utente: mostrare modale risoluzione?
      const needConfirm = (typeof equipmentCsvConfirm === 'boolean'
        ? equipmentCsvConfirm
        : askCsvConfirm)

      // Import automatico senza modale
      if (!needConfirm) {
        try {
          if (newCats.length > 0) {
            const { error: insCatsErr } = await supabase
              .from(TBL_EQ_CATS)
              .insert(newCats.map(n => ({ name: capitalizeFirst(n) })))
            if (insCatsErr) throw insCatsErr
          }
          if (newSups.length > 0) {
            const { error: insSupsErr } = await supabase
              .from(TBL_SUPS)
              .insert(newSups.map(n => ({ name: capitalizeFirst(n) })))
            if (insSupsErr) throw insSupsErr
          }

          const [cRes2, sRes2] = await Promise.all([
            supabase.from(TBL_EQ_CATS).select('*').order('name', { ascending: true }),
            supabase.from(TBL_SUPS).select('*').order('name', { ascending: true }),
          ])
          if (cRes2.data) setCats(cRes2.data)
          if (sRes2.data) setSups(sRes2.data)

          const catMap2: Record<string, number> = {}
          const supMap2: Record<string, string> = {}
            ; (cRes2.data || cats).forEach((c: any) => { catMap2[toKey(c.name)] = c.id })
            ; (sRes2.data || sups).forEach((s: any) => { supMap2[toKey(s.name)] = s.id })

          await runImport(data, catMap2, supMap2, null)
          return
        } catch (e: any) {
          alert(`${t('ImportFailed', language)}: ${e?.message || String(e)}`)
          setProgress(null)
          if (fileRef.current) fileRef.current.value = ''
          return
        }
      }

      // Se serve conferma ma NON ci sono conflitti né nuove entità → importa direttamente
      if (needConfirm) {
        if (conflicts.length === 0 && newCats.length === 0 && newSups.length === 0) {
          // mappe attuali (niente inserimenti)
          const catMap2: Record<string, number> = {}
          const supMap2: Record<string, string> = {}
          cats.forEach((c: any) => { catMap2[toKey(c.name)] = c.id })
          sups.forEach((s: any) => { supMap2[toKey(s.name)] = s.id })

          await runImport(data, catMap2, supMap2, null)
          return
        }
      }

      // Apri il modal SOLO se ci sono conflitti o nuove entità
      if (conflicts.length > 0 || newCats.length > 0 || newSups.length > 0) {
        setUnifiedOpen({
          conflicts,
          rows: data,
          newValues: { categories: newCats, suppliers: newSups },
        })
        return
      }

      // Caso residuale: nessun conflitto e nessuna nuova entità, e (stranamente) needConfirm==false
      {
        const catMap2: Record<string, number> = {}
        const supMap2: Record<string, string> = {}
        cats.forEach((c: any) => { catMap2[toKey(c.name)] = c.id })
        sups.forEach((s: any) => { supMap2[toKey(s.name)] = s.id })
        await runImport(data, catMap2, supMap2, null)
        return
      }


    } catch (err: any) {
      alert(`${t('ImportFailed', language)}: ${err.message}`)
    } finally {
      await new Promise(r => setTimeout(r, 200))
      setProgress(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  /* -------- Export Excel -------- */
  async function handleExportExcel() {
    try {
      setExporting(true)
      const list = applyFilters(rows).map(r => {
        const catName = cats.find(c => c.id === r.category_id)?.name || ''
        const supName = sups.find(s => s.id === r.supplier_id)?.name || ''
        const effPct = effVatPct(r)
        const finalComputed = finalCalc(r)
        return {
          Equipment: r.name,
          Category: catName,
          Supplier: supName,
          Cost: r.cost ?? null,
          ...(vatEnabled ? { VatRatePct: effPct } : {}),
          FinalPrice: finalComputed,
          LastUpdate: r.last_update ? new Date(r.last_update) : null,
          Notes: r.notes || '',
        }
      })

      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet(t('EquipmentSheet', language))

      const baseCols: any[] = [
        { header: t('Equipment', language), key: 'Equipment', width: 32 },
        { header: t('Category', language), key: 'Category', width: 20 },
        { header: t('Supplier', language), key: 'Supplier', width: 24 },
        { header: `${t('Cost', language)} (${currency})`, key: 'Cost', width: 14, style: { numFmt: '#,##0.00' } },
      ]
      const vatCols = vatEnabled ? [
        { header: t('VatRatePct', language), key: 'VatRatePct', width: 12 },
      ] : []
      const tailCols = [
        { header: `${t('FinalPrice', language)} (${currency})`, key: 'FinalPrice', width: 16, style: { numFmt: '#,##0.00' } },
        { header: t('LastUpdate', language), key: 'LastUpdate', width: 18, style: { numFmt: 'dd/mm/yyyy' } },
        { header: t('Notes', language), key: 'Notes', width: 40 },
      ]

      ws.columns = [...baseCols, ...vatCols, ...tailCols]
      ws.addRows(list as any[])

      const headerRow = ws.getRow(1)
      headerRow.font = { bold: true }
      headerRow.alignment = { vertical: 'middle', horizontal: 'left' }
      headerRow.height = 20
      headerRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF93C5FD' } } }
      })

      const cols = ws.columns?.map(c => ({ name: String(c.header), filterButton: true })) ?? []
      ws.addTable({
        name: 'EquipmentTable',
        ref: 'A1',
        headerRow: true,
        totalsRow: false,
        style: { theme: 'TableStyleMedium2', showRowStripes: true },
        columns: cols,
        rows: list.map((r: any) => Object.values(r)),
      })

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `equipment_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert(`${t('ExportFailed', language)}: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  // ==== Bulk actions ====
  const filtered = applyFilters(rows)
  const allVisibleSelected = filtered.length > 0 && filtered.every(m => !!selected[m.id])
  const someVisibleSelected = filtered.some(m => !!selected[m.id]) && !allVisibleSelected

  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = someVisibleSelected
  }, [someVisibleSelected, allVisibleSelected, filtered.length])

  useEffect(() => { if (!selectMode) setSelected({}) }, [selectMode])

  // === Conferma dal ResolveImportModal ===
  const onUnifiedConfirm = useCallback(async (choice: UnifiedChoice) => {
    if (!unifiedOpen) return
    const pending = unifiedOpen
    setUnifiedOpen(null)
    setProgress(0)

    try {
      try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch { }
      await new Promise<void>(r => requestAnimationFrame(() => r()))

      // Raccogli le nuove entità da creare
      const toCreateCats = new Set<string>()
      const toCreateSups = new Set<string>()

      for (const v of Object.values(choice.categoryByKey || {}))
        if (typeof v === 'string' && v.startsWith('__create__:'))
          toCreateCats.add(v.split(':', 2)[1])

      for (const v of Object.values(choice.supplierByKey || {}))
        if (typeof v === 'string' && v.startsWith('__create__:'))
          toCreateSups.add(v.split(':', 2)[1])

      for (const [name, label] of Object.entries(choice.newCategoryMap || {}))
        if (label && String(label).startsWith('__create__:')) toCreateCats.add(name)

      for (const [name, label] of Object.entries(choice.newSupplierMap || {}))
        if (label && String(label).startsWith('__create__:')) toCreateSups.add(name)

      for (const [name, yes] of Object.entries(choice.toCreateCats || {}))
        if (yes) toCreateCats.add(name)

      for (const [name, yes] of Object.entries(choice.toCreateSups || {}))
        if (yes) toCreateSups.add(name)

      // Crea nuove categorie/fornitori se richiesti
      const { data: insCats, error: insCatsErr } = toCreateCats.size
        ? await supabase.from(TBL_EQ_CATS).insert([...toCreateCats].map(n => ({ name: capitalizeFirst(n) }))).select()
        : { data: [] as { id: number; name: string }[], error: null as any }

      const { data: insSups, error: insSupsErr } = toCreateSups.size
        ? await supabase.from(TBL_SUPS).insert([...toCreateSups].map(n => ({ name: capitalizeFirst(n) }))).select()
        : { data: [] as { id: string; name: string }[], error: null as any }

      if (insCatsErr || insSupsErr) throw (insCatsErr || insSupsErr)

      // Map nome normalizzato -> id (esistenti + nuovi)
      const catMap: Record<string, number> = {}
      const supMap: Record<string, string> = {}
      cats.forEach(c => { catMap[normKey(c.name)] = c.id })
      sups.forEach(s => { supMap[normKey(s.name)] = s.id })
      insCats?.forEach(c => { catMap[normKey(c.name)] = c.id })
      insSups?.forEach(s => { supMap[normKey(s.name)] = s.id })

      // Risolvi override del modal
      const resolvedOverrides: UnifiedChoice = {
        categoryByKey: {},
        supplierByKey: {},
        newCategoryMap: {},
        newSupplierMap: {},
        toCreateCats: {},
        toCreateSups: {},
      }

      for (const [k, v] of Object.entries(choice.categoryByKey || {})) {
        if (v == null || v === '') resolvedOverrides.categoryByKey[k] = null
        else if (typeof v === 'string' && v.startsWith('__create__:')) {
          const name = normKey(v.split(':', 2)[1])
          resolvedOverrides.categoryByKey[k] = catMap[name]
        } else {
          resolvedOverrides.categoryByKey[k] = Number(v)
        }
      }

      for (const [k, v] of Object.entries(choice.supplierByKey || {})) {
        if (v == null || v === '') resolvedOverrides.supplierByKey[k] = null
        else if (typeof v === 'string' && v.startsWith('__create__:')) {
          const name = normKey(v.split(':', 2)[1])
          resolvedOverrides.supplierByKey[k] = supMap[name]
        } else {
          resolvedOverrides.supplierByKey[k] = v
        }
      }

      // Esegui l’import
      await runImport(pending.rows, catMap, supMap, resolvedOverrides)
    } catch (err: any) {
      alert(`${t('ImportFailed', language)}: ${err?.message || String(err)}`)
    } finally {
      await new Promise(r => setTimeout(r, 200))
      setProgress(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [unifiedOpen, cats, sups, language])


  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelected({})
    } else {
      const next: Record<string, boolean> = {}
      for (const m of filtered) next[m.id] = true
      setSelected(next)
    }
  }

  async function bulkMarkReviewed() {
    if (selectedIds.length === 0) return
    const now = new Date().toISOString()
    const { error } = await supabase.from(TBL_EQ).update({ last_update: now }).in('id', selectedIds)
    if (error) { alert(`${t('FailedToMarkReviewed', language)}: ${error.message}`); return }
    await fetchAll()
  }

  async function bulkMoveToTrash() {
    if (selectedIds.length === 0) return
    const confirmMsg = `${t('MoveToTrashConfirm', language).replace('{n}', String(selectedIds.length))}\n${t('MoveToTrashExplain', language)}`
    const ok = window.confirm(confirmMsg)
    if (!ok) return
    const now = new Date().toISOString()
    const { error } = await supabase.from(TBL_EQ).update({ deleted_at: now }).in('id', selectedIds)
    if (error) { alert(`${t('FailedToMoveTrash', language)}: ${error.message}`); return }
    await fetchAll()
  }

  // === Bulk edit VAT ===
  async function bulkApplyVat(mode: 'set' | 'delta', value: number) {
    if (selectedIds.length === 0) { setShowVatModal(false); return }
    try {
      const now = new Date().toISOString()
      const selectedRows = rows.filter(m => selectedIds.includes(m.id))
      await Promise.all(
        selectedRows.map(async (m) => {
          const base = m.vat_rate_percent ?? (vatRate ?? 0)
          let newVal = mode === 'set' ? value : base + value
          newVal = Math.max(0, Math.min(100, newVal))
          const { error } = await supabase
            .from(TBL_EQ)
            .update({ vat_rate_percent: newVal, last_update: now })
            .eq('id', m.id)
          if (error) throw error
        })
      )
      setShowVatModal(false)
      await fetchAll()
    } catch (e: any) {
      alert(`${t('SavedErr', language)}: ${e?.message || 'Bulk VAT failed'}`)
    }
  }

  // === Bulk edit MARKUP ===
  async function bulkApplyMarkup(mode: 'set' | 'delta', value: number) {
    if (selectedIds.length === 0) { setShowMarkupModal(false); return }
    try {
      const now = new Date().toISOString()
      const selectedRows = rows.filter(m => selectedIds.includes(m.id))

      await Promise.all(
        selectedRows.map(async (m) => {
          const current = m.markup_x ?? defaultMarkup
          let newMarkup = mode === 'set' ? value : current + value
          newMarkup = Math.max(0, Math.min(100, newMarkup))

          // ✅ Aggiorniamo SOLO markup_x; final_price lo ricalcola il trigger in DB
          const { error } = await supabase
            .from(TBL_EQ)
            .update({ markup_x: newMarkup, last_update: now })
            .eq('id', m.id)

          if (error) throw error
        })
      )

      setShowMarkupModal(false)
      await fetchAll()
    } catch (e: any) {
      alert(`${t('SavedErr', language)}: ${e?.message || 'Bulk Markup failed'}`)
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
                  <div className="absolute z-10 mt-2 w-64 rounded-xl border border-white/10 bg-white text-gray-900 shadow-xl">
                    {/* Bulk Edit Markup */}
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 disabled:opacity-50"
                      onClick={() => { setMenuOpen(false); setShowMarkupModal(true) }}
                      disabled={selectedIds.length === 0}
                    >
                      {t('BulkEditMarkup', language) || 'Bulk Edit Markup'}
                    </button>

                    {/* Bulk Edit VAT */}
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 disabled:opacity-50"
                      onClick={() => { setMenuOpen(false); setShowVatModal(true) }}
                      disabled={selectedIds.length === 0 || !vatEnabled}
                      title={!vatEnabled ? t('VatDisabledWarn', language) : undefined}
                    >
                      {t('BulkEditVat', language)}
                    </button>

                    <button
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 disabled:opacity-50"
                      onClick={() => { setMenuOpen(false); bulkMarkReviewed() }}
                      disabled={selectedIds.length === 0}
                    >
                      {t('MarkAsReviewed', language)}
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 text-red-600 disabled:opacity-50 flex items-center gap-2"
                      onClick={() => { setMenuOpen(false); bulkMoveToTrash() }}
                      disabled={selectedIds.length === 0}
                    >
                      <TrashIcon className="w-4 h-4" />
                      {t('MoveToTrash', language)}
                    </button>
                  </div>
                )}
              </div>
            )}

            <h1 className="text-2xl font-bold text-white sm:text-3xl tracking-tight leading-normal">{t('CateringRentalEquipment', language)}</h1>
            {selectedIds.length > 0 && (
              <span className="ml-2 text-sm text-blue-200">({selectedIds.length} {t('SelectedCountSuffix', language)})</span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            {language === 'vi'
              ? 'Quản lý thiết bị cho thuê, chi phí và cấu hình thuế VAT'
              : 'Manage rental equipment, costs, and VAT configurations'}
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
            disabled={exporting}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-lg
                       bg-blue-600/15 text-blue-200 hover:bg-blue-600/25
                       border border-blue-400/30 disabled:opacity-60 text-sm font-medium cursor-pointer"
            title={t('ExportExcel', language)}
          >
            <ArrowUpTrayIcon className="w-5 h-5" />
            {t('Export', language)}
          </button>

          {role && role !== 'accountant' && (
            <>
              <input ref={fileRef} type="file" accept=".csv" hidden onChange={handlePickFile} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={progress != null}
                className="inline-flex items-center gap-2 px-3 h-9 rounded-lg
                           bg-blue-600/15 text-blue-200 hover:bg-blue-600/25
                           border border-blue-400/30 disabled:opacity-60 text-sm font-medium cursor-pointer"
                title={t('ImportCSV', language)}
              >
                <ArrowDownTrayIcon className="w-5 h-5" />
                {t('Import', language)}
              </button>
            </>
          )}

          {role && role !== 'accountant' && (
            <button
              onClick={() => setSelectMode(s => !s)}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border text-sm font-medium cursor-pointer ${selectMode
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border-blue-400/30'
                }`}
              title={selectMode ? t('ExitSelection', language) : t('EnterSelection', language)}
            >
              <CheckCircleIcon className="w-5 h-5" />
              {selectMode ? t('Selecting', language) : t('Select', language)}
            </button>
          )}

          {role && role !== 'accountant' && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white text-sm font-medium cursor-pointer hover:opacity-80"
            >
              <PlusIcon className="w-5 h-5" /> {t('NewEquipment', language)}
            </button>
          )}
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
                label={t('Equipment', language)}
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
                colKey="category_id"
                label={t('Category', language)}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={handleSort}
                values={Array.from(new Set(rows.map(r => getColValue(r, 'category_id')))).sort()}
                activeFilter={columnFilters.category_id || null}
                onFilter={vals => applyColumnFilter('category_id', vals)}
                onClear={() => applyColumnFilter('category_id', null)}
                open={openMenu === 'category_id'}
                onToggle={() => setOpenMenu(openMenu === 'category_id' ? null : 'category_id')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="text-[11px]"
              />

              <ColumnHeader
                colKey="supplier_id"
                label={t('Supplier', language)}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={handleSort}
                values={Array.from(new Set(rows.map(r => getColValue(r, 'supplier_id')))).sort()}
                activeFilter={columnFilters.supplier_id || null}
                onFilter={vals => applyColumnFilter('supplier_id', vals)}
                onClear={() => applyColumnFilter('supplier_id', null)}
                open={openMenu === 'supplier_id'}
                onToggle={() => setOpenMenu(openMenu === 'supplier_id' ? null : 'supplier_id')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="text-[11px]"
              />

              <ColumnHeader
                colKey="cost"
                label={`${t('Cost', language)} (${currency})`}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={handleSort}
                values={Array.from(new Set(rows.map(r => getColValue(r, 'cost')))).sort()}
                activeFilter={columnFilters.cost || null}
                onFilter={vals => applyColumnFilter('cost', vals)}
                onClear={() => applyColumnFilter('cost', null)}
                open={openMenu === 'cost'}
                onToggle={() => setOpenMenu(openMenu === 'cost' ? null : 'cost')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                right
                className="text-[11px]"
              />

              {vatEnabled && (
                <ColumnHeader
                  colKey="vat_rate"
                  label={t('VatRatePct', language)}
                  sortCol={sortCol}
                  sortAsc={sortAsc}
                  onSort={handleSort}
                  values={Array.from(new Set(rows.map(r => getColValue(r, 'vat_rate')))).sort()}
                  activeFilter={columnFilters.vat_rate || null}
                  onFilter={vals => applyColumnFilter('vat_rate', vals)}
                  onClear={() => applyColumnFilter('vat_rate', null)}
                  open={openMenu === 'vat_rate'}
                  onToggle={() => setOpenMenu(openMenu === 'vat_rate' ? null : 'vat_rate')}
                  onClose={() => setOpenMenu(null)}
                  dict={columnHeaderDict}
                  right
                  className="text-[11px]"
                />
              )}

              <ColumnHeader
                colKey="final_calc"
                label={`${t('FinalPrice', language)} (${currency})`}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={handleSort}
                values={Array.from(new Set(rows.map(r => getColValue(r, 'final_calc')))).sort()}
                activeFilter={columnFilters.final_calc || null}
                onFilter={vals => applyColumnFilter('final_calc', vals)}
                onClear={() => applyColumnFilter('final_calc', null)}
                open={openMenu === 'final_calc'}
                onToggle={() => setOpenMenu(openMenu === 'final_calc' ? null : 'final_calc')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                right
                className="text-[11px]"
              />

              <ColumnHeader
                colKey="last_update"
                label={t('LastUpdate', language)}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={handleSort}
                values={Array.from(new Set(rows.map(r => getColValue(r, 'last_update')))).sort()}
                activeFilter={columnFilters.last_update || null}
                onFilter={vals => applyColumnFilter('last_update', vals)}
                onClear={() => applyColumnFilter('last_update', null)}
                open={openMenu === 'last_update'}
                onToggle={() => setOpenMenu(openMenu === 'last_update' ? null : 'last_update')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                right
                className="text-[11px]"
              />

              <ColumnHeader
                colKey="notes"
                label={t('Notes', language)}
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
                  onClick={() => {
                    if (selectMode) {
                      setSelected(s => ({ ...s, [it.id]: !s[it.id] }))
                    } else {
                      openView(it)
                    }
                  }}
                  className={`border-b border-gray-100 hover:bg-blue-50/40 cursor-pointer ${
                    idx % 2 === 0 ? 'bg-gray-50/30' : ''
                  }`}
                >
                  <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                    {selectMode && (
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={isSelected}
                        onChange={e => setSelected(s => ({ ...s, [it.id]: e.target.checked }))}
                      />
                    )}
                  </td>

                  <td className="px-3 py-2.5 text-xs text-gray-900 font-semibold truncate max-w-[22rem]">
                    {it.name}
                  </td>

                  <td className="px-3 py-2.5 text-xs text-gray-600 truncate max-w-[14rem]">
                    {cats.find(c => c.id === it.category_id)?.name || ''}
                  </td>

                  <td className="px-3 py-2.5 text-xs text-gray-600 truncate max-w-[16rem]">
                    {sups.find(s => s.id === it.supplier_id)?.name || ''}
                  </td>

                  <td className="px-3 py-2.5 text-right font-mono text-gray-900 whitespace-nowrap">
                    {it.cost != null ? num.format(it.cost) : ''}
                  </td>

                  {vatEnabled && (
                    <td className="px-3 py-2.5 text-right font-mono text-gray-600 whitespace-nowrap">
                      {effVatPct(it)}%
                    </td>
                  )}

                  <td className="px-3 py-2.5 text-right font-mono text-gray-900 font-semibold whitespace-nowrap">
                    {num.format(finalCalc(it))}
                  </td>

                  <td className={`px-3 py-2.5 text-right font-mono whitespace-nowrap ${isOlderThanMonths(it.last_update, reviewM) ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                    {fmtDate(it.last_update)}
                  </td>

                  <td className="px-3 py-2.5 text-xs text-gray-600 truncate max-w-[18rem]">
                    {it.notes || ''}
                  </td>
                </tr>
              )
            })}

            {filtered.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-center text-gray-500" colSpan={vatEnabled ? 9 : 8}>
                  {t('NoEquipment', language) || 'No equipment found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openEditor && (
        <EquipmentEditor
          mode={role === 'accountant' ? 'view' : editorMode}
          id={editingId}
          cats={cats}
          sups={sups}
          initial={initialItem}
          onClose={() => setOpenEditor(false)}
          onSaved={async () => { await fetchAll(); setOpenEditor(false) }}
          onDeleted={async () => { await fetchAll(); setOpenEditor(false) }}
          userRole={role}
        />
      )}

      {progress != null && <ImportProgressModal progress={progress} />}

      {unifiedOpen && (
        <ResolveImportModal
          pending={unifiedOpen}
          cats={cats}
          sups={sups}
          onConfirm={onUnifiedConfirm}
          onCancel={() => setUnifiedOpen(null)}
        />
      )}

      {showVatModal && (
        <BulkVatModal
          lang={language}
          count={selectedIds.length}
          defaultVat={vatRate ?? 0}
          onCancel={() => setShowVatModal(false)}
          onConfirm={bulkApplyVat}
        />
      )}

      {showMarkupModal && (
        <BulkMarkupModal
          lang={language}
          count={selectedIds.length}
          defaultMarkup={defaultMarkup}
          onCancel={() => setShowMarkupModal(false)}
          onConfirm={bulkApplyMarkup}
        />
      )}
    </div>
  )
}
