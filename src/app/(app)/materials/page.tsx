// src/app/materials/page.tsx
'use client'

import type { ParseResult } from 'papaparse'
import React, { useEffect, useMemo, useRef, useState } from 'react'
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

/* ---------- DB tables ---------- */
const TBL_MATERIALS = 'materials'
const TBL_CATS = 'categories'
const TBL_SUPS = 'suppliers'
const TBL_UOM = 'uom'

/* ---------- Types ---------- */
type Cat = { id: number; name: string }
type Uom = { id: number; name: string }
type Sup = { id: string; name: string }

type Mat = {
  id: string
  name: string
  category_id: number | null
  brand: string | null
  supplier_id: string | null
  uom_id: number | null
  packaging_size: number | null
  package_price: number | null
  unit_cost: number | null
  vat_rate_percent: number | null
  notes: string | null
  is_food_drink: boolean
  is_default: boolean
  created_at: string
  last_update: string
  deleted_at: string | null
}

type CsvRow = {
  name: string
  category: string
  brand?: string | null
  supplier: string
  uom: string
  packaging_size?: string | number | null
  package_price?: string | number | null
  vat_rate_percent?: string | number | null
  is_food_drink?: boolean | null
  is_default?: boolean | null
}

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

/* ---------- Small UI helpers ---------- */
function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return <span className="inline-block w-4" />
  return asc ? (
    <ChevronUpIcon className="w-4 h-4 inline-block text-gray-700" />
  ) : (
    <ChevronDownIcon className="w-4 h-4 inline-block text-gray-700" />
  )
}

/* ---------- Formatting / utils ---------- */
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
function uniqLower(a: string[]) {
  return [...new Set(a.filter(Boolean).map(s => s.trim().toLowerCase()))]
}
function normKey(k: string) {
  return String(k || '')
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
function sameNum(a: number | null | undefined, b: number | null | undefined, eps = 1e-9) {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.abs(a - b) <= eps
}
function buildKey(name: string | null | undefined, brand: string | null | undefined) {
  const n = (name || '').trim().toLowerCase()
  const b = (brand || '').trim().toLowerCase()
  return `${n}|${b}`
}
function labelCreate(name: string) {
  return `__create__:${name}`
}
function normalizeUom(raw: string): { uom: 'gr' | 'ml' | 'unit'; factor: number } {
  const s = String(raw || '').trim().toLowerCase()
  if (['unit', 'pz', 'pcs', 'pc', 'piece', 'pieces', 'each', 'ea', 'u'].includes(s)) return { uom: 'unit', factor: 1 }
  if (['g', 'gr', 'gram', 'grams', 'grammo', 'grammi'].includes(s)) return { uom: 'gr', factor: 1 }
  if (['kg', 'kgs', 'kilogram', 'kilograms', 'chilogrammo', 'chilogrammi'].includes(s)) return { uom: 'gr', factor: 1000 }
  if (['ml', 'milliliter', 'milliliters', 'millilitro', 'millilitri'].includes(s)) return { uom: 'ml', factor: 1 }
  if (['cl', 'centiliter', 'centiliters', 'centilitro', 'centilitri'].includes(s)) return { uom: 'ml', factor: 10 }
  if (['dl', 'deciliter', 'deciliters', 'decilitro', 'decilitri'].includes(s)) return { uom: 'ml', factor: 100 }
  if (['l', 'lt', 'ltr', 'liter', 'liters', 'litro', 'litri'].includes(s)) return { uom: 'ml', factor: 1000 }
  return { uom: 'unit', factor: 1 }
}

// Title Case helpers
// STRICT: usata per normalizzare dati da salvare/mostrare (trim ai bordi).
function toTitleCase(s: string) {
  const str = String(s || '').toLowerCase().trim()
  if (!str) return ''
  return str.replace(/\b\p{L}+/gu, w => w[0].toUpperCase() + w.slice(1))
}
// LIVE: usata durante la digitazione — NON fa trim, così lo spazio appena digitato non sparisce.
function toTitleCaseLive(s: string) {
  const str = String(s ?? '').toLowerCase()
  return str.replace(/\b\p{L}+/gu, w => (w ? w[0].toUpperCase() + w.slice(1) : w))
}

function titleCaseIf(v: string | null | undefined): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s ? toTitleCase(s) : null
}

function parseCsvBool(raw: unknown): boolean | null {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return null
  if (['1', 'true', 'yes', 'y', 'si', 's', 'vero', 'ok', '✓', 'x'].includes(s)) return true
  if (['0', 'false', 'no', 'n', 'falso'].includes(s)) return false
  return null
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
   Material Editor - create/edit/view
===================================================== */
type MaterialEditorProps = {
  mode: 'create' | 'edit' | 'view'
  id?: string
  cats: Cat[]
  sups: Sup[]
  uoms: Uom[]
  initial?: Partial<Mat> | null
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
  onCategoryCreated?: (c: Cat) => void
  onSupplierCreated?: (s: Sup) => void
  userRole?: string | null
}

function MaterialEditor(props: MaterialEditorProps) {
  const {
    mode,
    id,
    cats,
    sups,
    uoms,
    initial,
    onClose,
    onSaved,
    onDeleted,
    onCategoryCreated,
    onSupplierCreated,
    userRole,
  } = props

  const { language: lang, vatEnabled, vatRate, materialsExclusiveDefault } = useSettings()

  const [viewMode, setViewMode] = useState(mode === 'view')
  const [catsLocal, setCatsLocal] = useState<Cat[]>(cats || [])
  const [supsLocal, setSupsLocal] = useState<Sup[]>(sups || [])

  useEffect(() => { setCatsLocal(cats || []) }, [cats])
  useEffect(() => { setSupsLocal(sups || []) }, [sups])

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [brand, setBrand] = useState('')
  const [supplierId, setSupplierId] = useState<string>('')
  const [uomId, setUomId] = useState<string>('')
  const [packSize, setPackSize] = useState<string>('')
  const [packPrice, setPackPrice] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [vatRatePct, setVatRatePct] = useState<string>('')
  const [isFoodDrink, setIsFoodDrink] = useState(true)
  const [isDefault, setIsDefault] = useState(true)

  const [showAddCat, setShowAddCat] = useState(false)
  const [showAddSup, setShowAddSup] = useState(false)

  useEffect(() => {
    if (mode === 'edit' || mode === 'view') {
      const h = initial || {}
      setName(h.name || '')
      setCategoryId(h.category_id ? String(h.category_id) : '')
      setBrand(h.brand || '')
      setSupplierId(h.supplier_id ? String(h.supplier_id) : '')
      setUomId(h.uom_id ? String(h.uom_id) : '')
      setPackSize(h.packaging_size != null ? String(h.packaging_size) : '')
      setPackPrice(h.package_price != null ? String(h.package_price) : '')
      setNotes(h.notes || '')
      setVatRatePct(h.vat_rate_percent != null ? String(h.vat_rate_percent) : '')
      setIsFoodDrink(h.is_food_drink ?? true)
      setIsDefault(h.is_default ?? true)
      setViewMode(mode === 'view')
    } else {
      setName(''); setCategoryId(''); setBrand(''); setSupplierId(''); setUomId('')
      setPackSize(''); setPackPrice(''); setNotes(''); setVatRatePct('')
      setIsFoodDrink(true); setIsDefault(true)
      setViewMode(false)
    }
  }, [mode, id, initial])

  const unitCost = useMemo(() => {
    const p = Number(packPrice || '0')
    const q = Number(packSize || '0')
    if (!isFinite(p) || !isFinite(q) || q <= 0) return ''
    return (p / q).toFixed(2)
  }, [packPrice, packSize])

  const hasPackSize = packSize.trim() !== '' && isFinite(Number(packSize)) && Number(packSize) > 0
  const hasPackPrice = packPrice.trim() !== '' && isFinite(Number(packPrice)) && Number(packPrice) > 0

  const canSave =
    !viewMode &&
    name.trim().length > 0 &&
    categoryId &&
    supplierId &&
    uomId &&
    hasPackSize &&
    hasPackPrice

  async function enforceSingleDefaultByName(materialName: string, keepId: string) {
    await supabase
      .from(TBL_MATERIALS)
      .update({ is_default: false })
      .eq('name', materialName)
      .neq('id', keepId)
  }

  async function save() {
    if (viewMode) return
    const payload = {
      name: toTitleCase(name.trim()),
      category_id: categoryId ? Number(categoryId) : null,
      brand: brand ? toTitleCase(brand) : null,
      supplier_id: supplierId || null,
      uom_id: uomId ? Number(uomId) : null,
      packaging_size: packSize ? Number(packSize) : null,
      package_price: packPrice ? Number(packPrice) : null,
      unit_cost: packPrice && packSize ? Number(packPrice) / Number(packSize) : null,
      notes: notes ? toTitleCase(notes) : null,
      vat_rate_percent: vatEnabled
        ? (vatRatePct.trim() === '' ? null : Math.max(0, Math.min(100, Number(vatRatePct))))
        : null,
      is_food_drink: !!isFoodDrink,
      is_default: !!isDefault,
      last_update: new Date().toISOString(),
    }

    if (id) {
      const { error } = await supabase.from(TBL_MATERIALS).update(payload).eq('id', id)
      if (error) { alert(`${t('SavedErr', lang)}: ${error.message}`); return }
      if (payload.is_default && materialsExclusiveDefault) {
        await enforceSingleDefaultByName(payload.name, id)
      }
      onSaved()
      return
    }

    const { data: ins, error } = await supabase
      .from(TBL_MATERIALS)
      .insert(payload)
      .select('id')
      .single()
    if (error || !ins?.id) { alert(`${t('SavedErr', lang)}: ${error?.message || 'Unknown error'}`); return }
    if (payload.is_default && materialsExclusiveDefault) {
      await enforceSingleDefaultByName(payload.name, ins.id as string)
    }
    onSaved()
  }

  async function handleDelete() {
    if (viewMode || !id) return
    const ok = window.confirm(t('ConfirmDeleteMaterial', lang))
    if (!ok) return
    const { error } = await supabase.from(TBL_MATERIALS).delete().eq('id', id)
    if (error) alert(`${t('DeleteFailed', lang)}: ${error.message}`)
    else onDeleted()
  }

  async function handleAddCategory() { if (!viewMode) setShowAddCat(true) }
  async function handleAddSupplier() { if (!viewMode) setShowAddSup(true) }

  async function createCategory(name: string) {
    const value = toTitleCase(name.trim())
    if (!value) return
    const { data, error } = await supabase.from(TBL_CATS).insert({ name: value }).select().single()
    if (error || !data) { alert(error?.message || t('CreateFailed', lang)); return }
    const created = { id: data.id as number, name: data.name as string }
    setCatsLocal(prev => [...prev, created])
    setCategoryId(String(created.id))
    onCategoryCreated?.(created)
  }
  async function createSupplier(name: string) {
    const value = toTitleCase(name.trim())
    if (!value) return
    const { data, error } = await supabase.from(TBL_SUPS).insert({ name: value }).select().single()
    if (error || !data) { alert(error?.message || t('CreateFailed', lang)); return }
    const created = { id: data.id as string, name: data.name as string }
    setSupsLocal(prev => [...prev, created])
    setSupplierId(String(created.id))
    onSupplierCreated?.(created)
  }

  return (
    <Overlay onClose={onClose}>
      <div className="h-full flex flex-col text-gray-900">
        {/* Top bar */}
        <div className="px-4 md:px-6 pt-4 pb-3 flex items-center justify-between border-b">
          <div className="text-xl font-bold">
            {viewMode
              ? t('Materials', lang)
              : (id ? t('EditMaterial', lang) : t('NewMaterial', lang))}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label={t('Close', lang)}>
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 md:px-6 py-4 grid gap-4 md:grid-cols-2 flex-1 overflow-y-auto items-start">
          {/* Header card */}
          <SectionCard title={t('Header', lang)}>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-sm text-gray-800">{t('Name', lang)}</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 disabled:bg-gray-50 h-10"
                  value={name}
                  onChange={e => setName(toTitleCaseLive(e.target.value))}
                  disabled={viewMode}
                />
              </div>

              {/* Category */}
              <div>
                <label className="text-sm text-gray-800">{t('Category', lang)}</label>
                <select
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 bg-white disabled:bg-gray-50 h-10"
                  value={categoryId}
                  onChange={async (e) => {
                    const v = (e.target as HTMLSelectElement).value
                    if (v === '__add__') { await handleAddCategory(); return }
                    setCategoryId(v)
                  }}
                  disabled={viewMode}
                >
                  <option value="">{t('Select', lang)}</option>
                  {catsLocal.map(c => <option key={c.id} value={c.id}>{toTitleCase(c.name)}</option>)}
                  <option value="__add__">➕ {t('AddCategory', lang)}</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-800">{t('Brand', lang)}</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 disabled:bg-gray-50 h-10"
                  value={brand}
                  onChange={e => setBrand(toTitleCaseLive(e.target.value))}
                  disabled={viewMode}
                />
              </div>

              <div className="col-span-2">
                <label className="text-sm text-gray-800">{t('Notes', lang)}</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 disabled:bg-gray-50 h-10"
                  value={notes}
                  onChange={e => setNotes(toTitleCaseLive(e.target.value))}
                  disabled={viewMode}
                />
              </div>
            </div>
          </SectionCard>

          {/* Purchase UOM card */}
          <SectionCard title={t('PurchaseUOM', lang)}>
            <div className="grid grid-cols-2 gap-3">
              {/* Supplier */}
              <div className="col-span-2">
                <label className="text-sm text-gray-800">{t('Supplier', lang)}</label>
                <select
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 bg-white disabled:bg-gray-50 h-10"
                  value={supplierId}
                  onChange={async (e) => {
                    const v = (e.target as HTMLSelectElement).value
                    if (v === '__add__') { await handleAddSupplier(); return }
                    setSupplierId(v)
                  }}
                  disabled={viewMode}
                >
                  <option value="">{t('Select', lang)}</option>
                  {supsLocal.map(s => <option key={s.id} value={s.id}>{toTitleCase(s.name)}</option>)}
                  <option value="__add__">➕ {t('AddSupplier', lang)}</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-800">{t('Uom', lang)}</label>
                <select
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 bg-white disabled:bg-gray-50 h-10"
                  value={uomId}
                  onChange={e => setUomId(e.target.value)}
                  disabled={viewMode}
                >
                  <option value="">{t('Select', lang)}</option>
                  {uoms.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-800">{t('PackagingSize', lang)}</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 disabled:bg-gray-50 h-10"
                  type="number"
                  step="any"
                  value={packSize}
                  onChange={e => setPackSize(e.target.value)}
                  disabled={viewMode}
                />
              </div>

              <div>
                <label className="text-sm text-gray-800">{t('PackagePrice', lang)}</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 disabled:bg-gray-50 h-10"
                  type="number"
                  step="any"
                  value={packPrice}
                  onChange={e => setPackPrice(e.target.value)}
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
                <label className="text-sm text-gray-800">{t('UnitCostAuto', lang)}</label>
                <div className="mt-1 h-10 rounded-lg border bg-gray-50 px-3 flex items-center justify-end select-none">
                  <span className="font-semibold tabular-nums">{unitCost || '--'}</span>
                </div>
              </div>

              <div className="col-span-2 flex items-center gap-8 mt-1">
                <label htmlFor="is_food_drink" className="flex items-center gap-3 text-gray-800">
                  <span>{t('FoodDrink', lang)}</span>
                  <input
                    type="checkbox"
                    id="is_food_drink"
                    checked={isFoodDrink}
                    onChange={e => setIsFoodDrink(e.target.checked)}
                    className="sr-only peer"
                    disabled={viewMode}
                  />
                  <div className="w-11 h-6 bg-gray-200 rounded-full peer-checked:bg-blue-600 relative transition-colors
                                  after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border
                                  after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-full" />
                </label>

                <label htmlFor="is_default" className="flex items-center gap-3 text-gray-800">
                  <span>{t('IsDefault', lang)}</span>
                  <input
                    type="checkbox"
                    id="is_default"
                    checked={isDefault}
                    onChange={e => setIsDefault(e.target.checked)}
                    className="sr-only peer"
                    disabled={viewMode}
                  />
                  <div className="w-11 h-6 bg-gray-200 rounded-full peer-checked:bg-blue-600 relative transition-colors
                                  after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border
                                  after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-full" />
                </label>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Footer */}
        <div className="px-4 md:px-6 py-4 border-t flex items-center justify-between">
          <div className="flex items-center gap-2">
            {viewMode ? (
              userRole !== 'accountant' && (
                <button
                  onClick={() => setViewMode(false)}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 active:scale-95"
                >
                  {t('Edit', lang)}
                </button>
              )
            ) : (
              id && (
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 rounded-lg border text-red-600 hover:bg-red-50"
                >
                  {t('Delete', lang)}
                </button>
              )
            )}
          </div>

          <div>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border hover:opacity-80 active:scale-95"
            >
              {t('Close', lang)}
            </button>

            {!viewMode && (
              <button
                onClick={save}
                disabled={!canSave}
                className="ml-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 active:scale-95 disabled:opacity-50"
              >
                {t('Save', lang)}
              </button>
            )}
          </div>
        </div>

        {/* Add Category Modal */}
        {/* ... (nessuna modifica qui) ... */}

        {/* Add Supplier Modal */}
        {/* ... (nessuna modifica qui) ... */}
      </div>
    </Overlay>
  )
}

/* =====================================================
   Import Resolve Modal — versione richiesta
===================================================== */
type ConflictItem = {
  key: string
  name: string
  brand: string | null
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

function ResolveImportModal({
  pending,
  cats,
  sups,
  onCancel,
  onConfirm,
}: {
  pending: UnifiedPending
  cats: Cat[]
  sups: Sup[]
  onCancel: () => void
  onConfirm: (choice: UnifiedChoice) => void
}) {
  const { language: lang } = useSettings()

  // mappe lookup
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

  // righe da mostrare
  const rows = useMemo(() => {
    const bag = new Map<string, {
      key: string
      titleName: string
      brand: string | null
      csvCategoryName: string | null
      csvSupplierName: string | null
      currentCategoryId: number | null
      currentSupplierId: string | null
      categoryChanged: boolean
      supplierChanged: boolean
    }>()

    for (const it of (pending.conflicts || [])) {
      bag.set(it.key, {
        key: it.key,
        titleName: toTitleCase(it.name),
        brand: titleCaseIf(it.brand),
        csvCategoryName: titleCaseIf(it.csvCategoryName),
        csvSupplierName: titleCaseIf(it.csvSupplierName),
        currentCategoryId: it.currentCategoryId,
        currentSupplierId: it.currentSupplierId,
        categoryChanged: !!it.categoryChanged,
        supplierChanged: !!it.supplierChanged,
      })
    }

    for (const r of (pending.rows || [])) {
      const name = toTitleCase(String(r.name || ''))
      const brand = titleCaseIf(r.brand as any)
      const key = buildKey(name, brand || null)

      const csvCat = titleCaseIf(r.category as any)
      const csvSup = titleCaseIf(r.supplier as any)
      const lowerCat = (csvCat || '').toLowerCase()
      const lowerSup = (csvSup || '').toLowerCase()

      const catInDb = !!lowerCat && catByLower.has(lowerCat)
      const supInDb = !!lowerSup && supByLower.has(lowerSup)

      if (!catInDb || !supInDb) {
        const merged = {
          key,
          titleName: name,
          brand: brand || null,
          csvCategoryName: csvCat || null,
          csvSupplierName: csvSup || null,
          currentCategoryId: catInDb ? (catByLower.get(lowerCat) as Cat).id : null,
          currentSupplierId: supInDb ? (supByLower.get(lowerSup) as Sup).id : null,
          categoryChanged: !catInDb,
          supplierChanged: !supInDb,
        }
        bag.set(key, { ...(bag.get(key) || {}), ...merged })
      }
    }

    const out = Array.from(bag.values())
    out.sort((a, b) => a.titleName.localeCompare(b.titleName, undefined, { numeric: true }))
    return out
  }, [pending.conflicts, pending.rows, catByLower, supByLower])

  // stato scelte per riga
  const [categoryByKey, setCategoryByKey] = useState<Record<string, number | string | null>>({})
  const [supplierByKey, setSupplierByKey] = useState<Record<string, string | null>>({})

  // insiemi nuovi dal CSV (servono per “Add all”, nessuna UI sotto)
  const newCatNames = useMemo(
    () => (pending.newValues?.categories || []).map(toTitleCase),
    [pending.newValues?.categories]
  )
  const newSupNames = useMemo(
    () => (pending.newValues?.suppliers || []).map(toTitleCase),
    [pending.newValues?.suppliers]
  )
  const [newCategoryMap, setNewCategoryMap] = useState<Record<string, number | string>>({})
  const [newSupplierMap, setNewSupplierMap] = useState<Record<string, string>>({})
  const [toCreateCats, setToCreateCats] = useState<Record<string, boolean>>({})
  const [toCreateSups, setToCreateSups] = useState<Record<string, boolean>>({})

  // prelock quando già valido
  useEffect(() => {
    setCategoryByKey(prev => {
      const next = { ...prev }
      rows.forEach(r => {
        const catLocked = !!r.currentCategoryId && !r.categoryChanged
        if (catLocked && typeof next[r.key] === 'undefined') next[r.key] = r.currentCategoryId
      })
      return next
    })
    setSupplierByKey(prev => {
      const next = { ...prev }
      rows.forEach(r => {
        const supLocked = !!r.currentSupplierId && !r.supplierChanged
        if (supLocked && typeof next[r.key] === 'undefined') next[r.key] = r.currentSupplierId as any
      })
      return next
    })
  }, [rows])

  // Add all
  function handleAddAll() {
    const nextCatByKey: Record<string, number | string | null> = { ...categoryByKey }
    const nextSupByKey: Record<string, string | null> = { ...supplierByKey }

    const nc: Record<string, boolean> = { ...toCreateCats }
    const ns: Record<string, boolean> = { ...toCreateSups }
    const ncm: Record<string, number | string> = { ...newCategoryMap }
    const nsm: Record<string, string> = { ...newSupplierMap }

    for (const r of rows) {
      // ---- CATEGORY ----
      const catLocked = !!r.currentCategoryId && !r.categoryChanged
      if (!catLocked && r.csvCategoryName) {
        const lower = r.csvCategoryName.toLowerCase()
        const existing = catByLower.get(lower)
        if (existing) {
          // seleziona categoria esistente
          nextCatByKey[r.key] = existing.id
        } else {
          // seleziona "Create new: ..."
          const title = toTitleCase(r.csvCategoryName)
          const label = labelCreate(title)
          nextCatByKey[r.key] = label
          nc[title] = true
          ncm[title] = label
        }
      }

      // ---- SUPPLIER ----
      const supLocked = !!r.currentSupplierId && !r.supplierChanged
      if (!supLocked && r.csvSupplierName) {
        const lower = r.csvSupplierName.toLowerCase()
        const existing = supByLower.get(lower)
        if (existing) {
          // seleziona supplier esistente
          nextSupByKey[r.key] = String(existing.id)
        } else {
          // seleziona "Create new: ..."
          const title = toTitleCase(r.csvSupplierName)
          const label = labelCreate(title)
          nextSupByKey[r.key] = label
          ns[title] = true
          nsm[title] = label
        }
      }
    }

    setCategoryByKey(nextCatByKey)
    setSupplierByKey(nextSupByKey)
    setToCreateCats(nc)
    setToCreateSups(ns)
    setNewCategoryMap(ncm)
    setNewSupplierMap(nsm)
  }

  function handleContinue() {
    onConfirm({ categoryByKey, supplierByKey, newCategoryMap, newSupplierMap, toCreateCats, toCreateSups })
  }

  // UI classes (azzurrino come Add all)
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
                  <React.Fragment key={r.key}>
                    {/* NAME */}
                    <div className="py-1">
                      <div className="text-sm font-semibold text-gray-900">{r.titleName}</div>
                      {r.brand && <div className="text-xs text-gray-600">{r.brand}</div>}
                    </div>

                    {/* CATEGORY */}
                    <div className="py-1">
                      <select
                        className={selectBase}
                        value={selectedCat ?? ''}
                        onChange={e => {
                          const v = e.target.value
                          setCategoryByKey(prev => ({ ...prev, [r.key]: v === '' ? null : (isNaN(Number(v)) ? v : Number(v)) }))
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

                      {/* testo azzurrino + + */}
                      {r.csvCategoryName && !catLocked && (
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
                            {t('LockedExisting', lang) || 'Existing fixed'}
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

                      {r.csvSupplierName && !supLocked && (
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
                            {t('LockedExisting', lang) || 'Existing fixed'}
                          </span>
                        </div>
                      )}
                    </div>
                  </React.Fragment>
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
   Import modal minimal
===================================================== */
function ImportProgressModal({ progress }: { progress: number }) {
  const { language } = useSettings()
  const pct = Math.min(100, Math.max(0, Math.round(progress)))
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('ImportInProgress', language)}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 text-gray-900">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-blue-800">{t('ImportInProgress', language)}</h2>
          <span className="text-2xl font-extrabold tabular-nums text-right min-w-[3.5rem]">
            {pct}%
          </span>
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

  function clamp(n: number) { return Math.max(0, Math.min(100, n)) }

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
            <input type="radio" name="vat_mode" value="set" checked={mode === 'set'} onChange={() => setMode('set')} />
            <span className="text-sm">{t('SetExactRate', lang)}</span>
          </label>

          <label className="flex items-center gap-2">
            <input type="radio" name="vat_mode" value="delta" checked={mode === 'delta'} onChange={() => setMode('delta')} />
            <span className="text-sm">{t('AdjustBy', lang)} (±)</span>
          </label>

          <div>
            <label className="text-sm text-gray-800">{t('VatPercent', lang)}</label>
            <input
              className="mt-1 w-full border rounded-lg px-2 py-2 text-gray-900 h-10"
              type="number" step="1" min={0} max={100}
              value={val}
              onChange={e => setVal(e.target.value)}
              placeholder={mode === 'set' ? String(defaultVat) : '0'}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border">{t('Cancel', lang)}</button>
          <button
            onClick={() => {
              const num = Number(val); if (!isFinite(num)) return
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
   Page
===================================================== */
type SortKey =
  | 'name'
  | 'category'
  | 'brand'
  | 'supplier'
  | 'uom'
  | 'packaging_size'
  | 'package_price'
  | 'package_plus_vat'
  | 'vat_rate'
  | 'unit_cost'
  | 'unit_plus_vat'
  | 'is_food_drink'
  | 'is_default'
  | 'last_update'

export default function MaterialsPage() {
  const {
    language: lang,
    currency,
    vatEnabled,
    vatRate,
    reviewMonths,
    askCsvConfirm,
    materialsExclusiveDefault,
  } = useSettings()

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

  const locale = lang === 'vi' ? 'vi-VN' : 'en-US'
  const money = useMemo(() => new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
    minimumFractionDigits: currency === 'VND' ? 0 : 2,
  }), [locale, currency])

  const num = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      }),
    [locale]
  )

  const [cats, setCats] = useState<Cat[]>([])
  const [uoms, setUoms] = useState<Uom[]>([])
  const [sups, setSups] = useState<Sup[]>([])
  const [mats, setMats] = useState<Mat[]>([])
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

  function clearColumnFilter(col: SortKey) {
    setColumnFilters(prev => {
      const n = { ...prev }
      delete n[col]
      return n
    })
    setOpenMenu(null)
  }

  function toggleSort(k: SortKey, asc?: boolean) {
    setSortCol(k)
    if (asc !== undefined) {
      setSortAsc(asc)
    } else {
      setSortAsc(prev => !prev)
    }
    setOpenMenu(null)
  }

  const getColValue = (m: Mat, k: string) => {
    switch (k) {
      case 'name':
        return toTitleCase(m.name)
      case 'category':
        return cats.find(c => c.id === m.category_id)?.name || ''
      case 'brand':
        return m.brand || ''
      case 'supplier':
        return sups.find(s => s.id === m.supplier_id)?.name || ''
      case 'uom':
        return uoms.find(u => u.id === m.uom_id)?.name || ''
      case 'packaging_size':
        return m.packaging_size != null ? m.packaging_size.toLocaleString(locale) : ''
      case 'package_price':
        return m.package_price != null ? num.format(m.package_price) : ''
      case 'vat_rate':
        return num.format(effVatPct(m)) + '%'
      case 'package_plus_vat':
        return num.format(packagePlusVat(m))
      case 'unit_cost':
        return m.unit_cost != null ? num.format(m.unit_cost) : ''
      case 'unit_plus_vat':
        return num.format(unitPlusVat(m))
      case 'is_food_drink':
        return m.is_food_drink ? t('Yes', lang) : t('No', lang)
      case 'is_default':
        return m.is_default ? t('Yes', lang) : t('No', lang)
      case 'last_update':
        return fmtDate(m.last_update)
      default:
        return ''
    }
  }

  const columnValues = useMemo(() => {
    const map: Record<string, string[]> = {}
    const filterableKeys = [
      'name',
      'category',
      'brand',
      'supplier',
      'uom',
      'packaging_size',
      'package_price',
      'vat_rate',
      'package_plus_vat',
      'unit_cost',
      'unit_plus_vat',
      'is_food_drink',
      'is_default',
      'last_update'
    ]
    filterableKeys.forEach(k => {
      const set = new Set<string>()
      mats.forEach(m => {
        const v = getColValue(m, k)
        if (v) set.add(v)
      })
      map[k] = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    })
    return map
  }, [mats, cats, sups, uoms, lang])

  const fileRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [unifiedOpen, setUnifiedOpen] = useState<any>(null)
  const [exporting, setExporting] = useState(false)

  const [openEditor, setOpenEditor] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | 'view'>('create')
  const [editingId, setEditingId] = useState<string | undefined>(undefined)
  const [initialMat, setInitialMat] = useState<Partial<Mat> | null>(null)

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

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [cRes, uRes, sRes, mRes] = await Promise.all([
      supabase.from(TBL_CATS).select('*').order('name', { ascending: true }),
      supabase.from(TBL_UOM).select('*').order('name', { ascending: true }),
      supabase.from(TBL_SUPS).select('*').order('name', { ascending: true }),
      supabase.from(TBL_MATERIALS).select('*').is('deleted_at', null).order('created_at', { ascending: false }),
    ])
    if (cRes.data) setCats(cRes.data)
    if (uRes.data) setUoms(uRes.data)
    if (sRes.data) setSups(sRes.data)
    setMats(mRes.data || [])
    setLoading(false)
    setSelected({})
  }



  function effVatPct(m: Mat) {
    if (!vatEnabled) return 0
    const r = (m.vat_rate_percent ?? vatRate ?? 0)
    return Math.max(0, Math.min(100, Number(r)))
  }
  function unitPlusVat(m: Mat) {
    const pct = effVatPct(m) / 100
    return (m.unit_cost ?? 0) * (1 + pct)
  }
  function packagePlusVat(m: Mat) {
    const pct = effVatPct(m) / 100
    return (m.package_price ?? 0) * (1 + pct)
  }
  async function enforceSingleDefaultByName(materialName: string, keepId: string) {
    await supabase
      .from(TBL_MATERIALS)
      .update({ is_default: false })
      .eq('name', materialName)
      .neq('id', keepId)
  }

  function applyFilters(list: Mat[]) {
    let rows = [...list]

    // Apply column checklist filters
    Object.entries(columnFilters).forEach(([col, vals]) => {
      if (!vals) return
      rows = rows.filter(m => {
        const v = getColValue(m, col)
        return vals.has(v)
      })
    })

    rows.sort((a, b) => {
      const getVal = (m: Mat): any => {
        switch (sortCol) {
          case 'category': {
            const c = cats.find(x => x.id === m.category_id)?.name ?? ''
            return c.toLowerCase()
          }
          case 'supplier': {
            const s = sups.find(x => x.id === m.supplier_id)?.name ?? ''
            return s.toLowerCase()
          }
          case 'uom': {
            const u = uoms.find(x => x.id === m.uom_id)?.name ?? ''
            return u.toLowerCase()
          }
          case 'vat_rate':
            return effVatPct(m)
          case 'unit_plus_vat':
            return unitPlusVat(m)
          case 'packaging_size':
            return m.packaging_size ?? -Infinity
          case 'package_price':
            return m.package_price ?? -Infinity
          case 'package_plus_vat':
            return packagePlusVat(m)
          case 'unit_cost':
            return m.unit_cost ?? -Infinity
          case 'is_food_drink':
            return m.is_food_drink ? 1 : 0
          case 'is_default':
            return m.is_default ? 1 : 0
          case 'last_update':
            return m.last_update ? new Date(m.last_update).getTime() : 0
          case 'brand':
            return (m.brand ?? '').toLowerCase()
          case 'name':
          default:
            return (m.name ?? '').toLowerCase()
        }
      }
      const av = getVal(a)
      const bv = getVal(b)
      let cmp: number
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortAsc ? cmp : -cmp
    })

    return rows
  }

  function openCreate() {
    setEditorMode('create')
    setEditingId(undefined)
    setInitialMat(null)
    setOpenEditor(true)
  }
  async function openView(mat: Mat) {
    setEditorMode('view'); setEditingId(mat.id); setInitialMat(mat); setOpenEditor(true)
  }
  async function openEdit(mat: Mat) {
    if (role === 'accountant') {
      openView(mat)
      return
    }
    setEditorMode('edit'); setEditingId(mat.id); setInitialMat(mat); setOpenEditor(true)
  }

  const headerMap: Record<string, string> = {
    'name': 'name',
    'ingredient': 'name',
    'category': 'category',
    'brand': 'brand',
    'supplier': 'supplier',
    'uom': 'uom',
    'packaging size': 'packaging_size',
    'packaging_size': 'packaging_size',
    'package cost': 'package_price',
    'package_cost': 'package_price',
    'vat rate (%)': 'vat_rate_percent',
    'vat rate': 'vat_rate_percent',
    'vat_rate_percent': 'vat_rate_percent',
    vat: 'vat_rate_percent',
    'status': '__ignore__',
    'notes': '__ignore__',
    'package qty': '__ignore__',
    'package_qty': '__ignore__',
    'unit cost': '__ignore__',
    'unit_cost': '__ignore__',

    // Food/Drink
    'fooddrink': 'is_food_drink',
    'food/drink': 'is_food_drink',
    'food / drink': 'is_food_drink',
    'food': 'is_food_drink',
    'alimentare': 'is_food_drink',
    'is_food_drink': 'is_food_drink',

    // Default
    'default': 'is_default',
    'is default': 'is_default',
    'predefinito': 'is_default',
    'is_default': 'is_default',
  }

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setProgress(0)

    try {
      const parsed = await new Promise<any>((resolve, reject) => {
        Papa.parse(f, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
          transformHeader: (h: string): string => headerMap[normKey(h)] ?? normKey(h),
          complete: (res: ParseResult<CsvRow>): void => resolve(res),
          error: (err: unknown): void => reject(err),
        })
      })

      // Normalizza subito in Title Case i campi rilevanti
      const rows: CsvRow[] = (parsed.data || [])
        .map((r: any) => ({
          name: toTitleCase(String(r['name'] ?? '').trim()),
          category: toTitleCase(String(r['category'] ?? '').trim()),
          brand: r['brand'] != null ? toTitleCase(String(r['brand']).trim()) : null,
          supplier: toTitleCase(String(r['supplier'] ?? '').trim()),
          uom: String(r['uom'] ?? '').trim(),
          packaging_size: r['packaging_size'] ?? null,
          package_price: r['package_price'] ?? null,
          vat_rate_percent: r['vat_rate_percent'] ?? null,
          // NUOVI: letti dal CSV se presenti
          is_food_drink: parseCsvBool(r['is_food_drink']),
          is_default: parseCsvBool(r['is_default']),
        }))
        .filter((r: any) => r.name || r.category || r.supplier)

      if (!rows.length) { alert(t('CSVEmptyOrBad', lang)); return }

      // Check UOM canoniche
      const haveCanon = new Set<string>(uoms.map(u => normalizeUom(String(u.name)).uom))
      const missingCanon = ['gr', 'ml', 'unit'].filter(x => !haveCanon.has(x))


      if (missingCanon.length) {
        const { error } = await supabase.from(TBL_UOM).insert(missingCanon.map(n => ({ name: n })))
        if (error) { alert(`${t('UOMMissing', lang)}: ${missingCanon.join(', ')}`); return }
        const uRes = await supabase.from(TBL_UOM).select('*').order('name', { ascending: true })
        if (uRes.data) setUoms(uRes.data)
      }

      const existingListByKey = new Map<string, Mat[]>()
      for (const m of mats) {
        const k = buildKey(m.name, m.brand)
        const arr = existingListByKey.get(k)
        if (arr) arr.push(m); else existingListByKey.set(k, [m])
      }

      const conflicts: ConflictItem[] = []
      for (const r of rows) {
        const key = buildKey(r.name, r.brand || null)
        const candidates = existingListByKey.get(key) || []
        if (candidates.length === 0) continue

        const csvCatLower = r.category ? r.category.trim().toLowerCase() : null
        const csvSupLower = r.supplier ? r.supplier.trim().toLowerCase() : null
        const csvCatId = csvCatLower != null ? cats.find(c => c.name.toLowerCase() === csvCatLower)?.id ?? null : null
        const csvSupId = csvSupLower != null ? sups.find(s => s.name.toLowerCase() === csvSupLower)?.id ?? null : null

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

        const currentCatName = current.category_id != null ? (cats.find(c => c.id === current.category_id)?.name.toLowerCase() || null) : null
        const currentSupName = current.supplier_id != null ? (sups.find(s => s.id === current.supplier_id)?.name.toLowerCase() || null) : null

        const categoryChanged = !!csvCatLower && !!currentCatName && csvCatLower !== currentCatName
        const supplierChanged = !!csvSupLower && !!currentSupName && csvSupLower !== currentSupName

        if (categoryChanged || supplierChanged) {
          conflicts.push({
            key,
            name: r.name,
            brand: r.brand || null,
            currentCategoryId: current.category_id,
            currentSupplierId: current.supplier_id,
            csvCategoryName: r.category || null,
            csvSupplierName: r.supplier || null,
            categoryChanged,
            supplierChanged,
          })
        }
      }

      const csvCats = uniqLower(rows.map((r: any) => r.category || ''))
      const csvSups = uniqLower(rows.map((r: any) => r.supplier || ''))
      const existingCatNames = cats.map(c => c.name.toLowerCase())
      const existingSupNames = sups.map(s => s.name.toLowerCase())
      const newCats = csvCats.filter(n => n && !existingCatNames.includes(n))
      const newSups = csvSups.filter(n => n && !existingSupNames.includes(n))

      if (conflicts.length === 0 && newCats.length === 0 && newSups.length === 0) {
        if (askCsvConfirm) {
          const ok = window.confirm('Proceed with import? This will update existing materials and add new ones.')
          if (!ok) { setProgress(null); if (fileRef.current) fileRef.current.value = ''; return }
        }
        const stats = await runImport(rows, {}, {}, null)
        alert(`${t('CSVImported', lang)}
${t('Inserted', lang)}: ${stats.inserted}
${t('Updated', lang)}: ${stats.updated}
${t('Skipped', lang)}: ${stats.skipped}`)
        await fetchAll()
        return
      }

      if (!askCsvConfirm) {
        let insCats: { id: number; name: string }[] = []
        let insSups: { id: string; name: string }[] = []

        if (newCats.length) {
          const { data } = await supabase
            .from(TBL_CATS)
            .insert(newCats.map(n => ({ name: toTitleCase(n) })))
            .select('id,name')
          insCats = data || []
        }
        if (newSups.length) {
          const { data } = await supabase
            .from(TBL_SUPS)
            .insert(newSups.map(n => ({ name: toTitleCase(n) })))
            .select('id,name')
          insSups = data || []
        }

        const catMap: Record<string, number> = {}
        const supMap: Record<string, string> = {}
          ;[...cats, ...insCats].forEach(c => { catMap[c.name.toLowerCase()] = c.id as number })
          ;[...sups, ...insSups].forEach(s => { supMap[s.name.toLowerCase()] = s.id as string })
        const stats = await runImport(rows, catMap, supMap, null)
        alert(`${t('CSVImported', lang)}
${t('Inserted', lang)}: ${stats.inserted}
${t('Updated', lang)}: ${stats.updated}
${t('Skipped', lang)}: ${stats.skipped}`)
        await fetchAll()
        return
      }

      // Chiedi conferma/risoluzione
      setUnifiedOpen({ conflicts, newValues: { categories: newCats, suppliers: newSups }, rows })
    } catch (err: any) {
      alert(`${t('ImportFailed', lang)}: ${err.message}`)
    } finally {
      setProgress(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function onUnifiedCancel() {
    setUnifiedOpen(null)
    setProgress(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onUnifiedConfirm(choice: UnifiedChoice) {
    if (!unifiedOpen) return
    const pending = unifiedOpen
    setUnifiedOpen(null)
    setProgress(0)

    try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch { }
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

    try {
      // 1) Colleziona i nomi da creare
      const createCats = new Set<string>()
      const createSups = new Set<string>()

      Object.values(choice.categoryByKey).forEach(v => {
        if (typeof v === 'string' && v.startsWith('__create__:')) {
          createCats.add(toTitleCase(v.split(':', 2)[1]))
        }
      })
      Object.values(choice.supplierByKey).forEach(v => {
        if (typeof v === 'string' && v.startsWith('__create__:')) {
          createSups.add(toTitleCase(v.split(':', 2)[1]))
        }
      })
      Object.entries(choice.newCategoryMap || {}).forEach(([name, v]) => {
        if (typeof v === 'string' && v.startsWith('__create__:')) createCats.add(toTitleCase(name))
      })
      Object.entries(choice.newSupplierMap || {}).forEach(([name, v]) => {
        if (typeof v === 'string' && v.startsWith('__create__:')) createSups.add(toTitleCase(name))
      })

      // 2) Crea solo quelli marcati
      const { data: insCats } =
        createCats.size
          ? await supabase.from(TBL_CATS).insert([...createCats].map(n => ({ name: toTitleCase(n) }))).select('id,name')
          : { data: [] as { id: number; name: string }[] }

      const { data: insSups } =
        createSups.size
          ? await supabase.from(TBL_SUPS).insert([...createSups].map(n => ({ name: toTitleCase(n) }))).select('id,name')
          : { data: [] as { id: string; name: string }[] }

      // 3) Mappe nome→id complete
      const catMap: Record<string, number> = {}
      const supMap: Record<string, string> = {}

      cats.forEach(c => { catMap[c.name.toLowerCase()] = c.id })
      sups.forEach(s => { supMap[s.name.toLowerCase()] = s.id })
      insCats?.forEach(c => { catMap[c.name.toLowerCase()] = c.id })
      insSups?.forEach(s => { supMap[s.name.toLowerCase()] = s.id })

      // 4) Applica override per i "nuovi" nomi
      Object.entries(choice.newCategoryMap || {}).forEach(([name, v]) => {
        const lower = name.toLowerCase()
        if (typeof v === 'string' && v.startsWith('__create__:')) {
          // creato sopra
        } else if (v != null && v !== '') {
          catMap[lower] = Number(v)
        }
      })
      Object.entries(choice.newSupplierMap || {}).forEach(([name, v]) => {
        const lower = name.toLowerCase()
        if (typeof v === 'string' && v.startsWith('__create__:')) {
          // creato sopra
        } else if (v != null && v !== '') {
          supMap[lower] = String(v)
        }
      })

      // 5) Risolvi override per riga
      const resolvedOverrides = {
        categoryByKey: {} as Record<string, number | null | undefined>,
        supplierByKey: {} as Record<string, string | null | undefined>,
      }

      Object.entries(choice.categoryByKey).forEach(([key, val]) => {
        if (val == null || val === '') resolvedOverrides.categoryByKey[key] = null
        else if (typeof val === 'string' && val.startsWith('__create__:')) {
          const name = val.split(':', 2)[1].toLowerCase()
          resolvedOverrides.categoryByKey[key] = catMap[name]
        } else {
          resolvedOverrides.categoryByKey[key] = Number(val)
        }
      })

      Object.entries(choice.supplierByKey).forEach(([key, val]) => {
        if (val == null || val === '') resolvedOverrides.supplierByKey[key] = null
        else if (typeof val === 'string' && val.startsWith('__create__:')) {
          const name = val.split(':', 2)[1].toLowerCase()
          resolvedOverrides.supplierByKey[key] = supMap[name]
        } else {
          resolvedOverrides.supplierByKey[key] = String(val)
        }
      })

      // 6) Import finale
      const stats = await runImport(pending.rows, catMap, supMap, resolvedOverrides)
      await new Promise(r => setTimeout(r, 150))

      alert(`${t('CSVImported', lang)}
${t('Inserted', lang)}: ${stats.inserted}
${t('Updated', lang)}: ${stats.updated}
${t('Skipped', lang)}: ${stats.skipped}`)

      await fetchAll()
    } catch (err: any) {
      alert(`${t('ImportFailed', lang)}: ${err.message}`)
    } finally {
      await new Promise(r => setTimeout(r, 200))
      setProgress(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ===== Import core con normalizzazione UOM + Title Case =====
  async function runImport(
    rows: CsvRow[],
    catMap: Record<string, number>,
    supMap: Record<string, string>,
    overrides: {
      categoryByKey: Record<string, number | null | undefined>,
      supplierByKey: Record<string, string | null | undefined>
    } | null
  ) {
    // alias UOM presenti in DB
    const uomByAlias = new Map<'gr' | 'ml' | 'unit', number>()
    for (const u of uoms) {
      const { uom } = normalizeUom(String(u.name))
      if (!uomByAlias.has(uom)) uomByAlias.set(uom, u.id)
    }
    async function ensureUom(uom: 'gr' | 'ml' | 'unit') {
      if (uomByAlias.has(uom)) return uomByAlias.get(uom)!
      const { data, error } = await supabase.from(TBL_UOM).insert({ name: uom }).select('id').single()
      if (!error && data?.id) {
        uomByAlias.set(uom, data.id as number)
        return data.id as number
      }
      throw new Error(`UOM non trovata o non creabile: ${uom}`)
    }

    const listByKey = new Map<string, Mat[]>()
    for (const m of mats) {
      const k = buildKey(m.name, m.brand)
      const arr = listByKey.get(k)
      if (arr) arr.push(m); else listByKey.set(k, [m])
    }

    let inserted = 0, updated = 0, skipped = 0

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const name = toTitleCase((r.name || '').trim())
      const brand = r.brand ? toTitleCase(r.brand.toString().trim()) : null
      const supplierName = toTitleCase((r.supplier || '').trim())
      const categoryName = toTitleCase((r.category || '').trim())

      if (!name || !supplierName || !categoryName) {
        skipped++; setProgress(Math.round(((i + 1) / rows.length) * 100)); continue
      }

      const norm = normalizeUom(String(r.uom || 'unit'))
      const uomId = uomByAlias.get(norm.uom) ?? await ensureUom(norm.uom)

      let category_id: number | null | undefined =
        catMap[categoryName.toLowerCase()] ?? cats.find(c => c.name.toLowerCase() === categoryName.toLowerCase())?.id ?? null
      let supplier_id: string | null | undefined =
        supMap[supplierName.toLowerCase()] ?? sups.find(s => s.name.toLowerCase() === supplierName.toLowerCase())?.id ?? null

      const key = buildKey(name, brand)

      if (overrides) {
        if (Object.prototype.hasOwnProperty.call(overrides.categoryByKey, key)) {
          const ov = overrides.categoryByKey[key]
          if (typeof ov !== 'undefined') category_id = ov
        }
        if (Object.prototype.hasOwnProperty.call(overrides.supplierByKey, key)) {
          const ov = overrides.supplierByKey[key]
          if (typeof ov !== 'undefined') supplier_id = ov
        }
      }

      if (!category_id || !supplier_id) {
        skipped++; setProgress(Math.round(((i + 1) / rows.length) * 100)); continue
      }

      const raw_packaging_size = moneyToNumber(r.packaging_size)
      const packaging_size = raw_packaging_size != null ? raw_packaging_size * norm.factor : null
      const package_price = moneyToNumber(r.package_price)
      const vat_rate_percent = moneyToNumber(r.vat_rate_percent)

      let unit_cost: number | null = null
      if (package_price != null && packaging_size != null && packaging_size > 0) {
        unit_cost = package_price / packaging_size
      }

      const proposed = {
        name, brand, supplier_id, category_id, uom_id: uomId,
        packaging_size, package_price, unit_cost,
        vat_rate_percent: vat_rate_percent != null ? Math.max(0, Math.min(100, vat_rate_percent)) : null,
        is_food_drink: (r as any).is_food_drink != null ? !!(r as any).is_food_drink : true,
        is_default: (r as any).is_default != null ? !!(r as any).is_default : true,
        last_update: new Date().toISOString(),
      }

      // selezione esistente: priorità supplier → category → più recente
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

      let currentId: string | null = null

      if (existing) {
        const changed =
          ((existing.category_id ?? null) !== (proposed.category_id ?? null)) ||
          ((existing.supplier_id ?? null) !== (proposed.supplier_id ?? null)) ||
          ((existing.uom_id ?? null) !== (proposed.uom_id ?? null)) ||
          !sameNum(existing.packaging_size as number | null, proposed.packaging_size) ||
          !sameNum(existing.package_price as number | null, proposed.package_price) ||
          !sameNum(existing.unit_cost as number | null, proposed.unit_cost) ||
          ((existing.notes ?? null) !== ((proposed as any).notes ?? null)) ||
          ((existing.brand ?? null) !== (proposed.brand ?? null)) ||
          (existing.is_food_drink !== proposed.is_food_drink) ||
          (existing.is_default !== proposed.is_default)

        if (!changed) {
          skipped++
        } else {
          const { error } = await supabase
            .from(TBL_MATERIALS)
            .update({ ...proposed, last_update: new Date().toISOString() })
            .eq('id', existing.id)
          if (error) {
            skipped++
          } else {
            updated++
            currentId = existing.id
          }
        }
      } else {
        const { data: ins, error } = await supabase
          .from(TBL_MATERIALS)
          .insert({ ...proposed, last_update: new Date().toISOString() })
          .select('id')
          .single()
        if (error || !ins?.id) {
          skipped++
        } else {
          inserted++
          currentId = ins.id as string
        }
      }

      if (currentId && materialsExclusiveDefault && proposed.is_default) {
        await enforceSingleDefaultByName(name, currentId)
      }

      setProgress(Math.round(((i + 1) / rows.length) * 100))
    }

    setProgress(100)
    return { inserted, updated, skipped }
  }

  async function handleExportExcel() {
    try {
      setExporting(true)
      const rows = applyFilters(mats).map(m => {
        const catName = cats.find(c => c.id === m.category_id)?.name || ''
        const supName = sups.find(s => s.id === m.supplier_id)?.name || ''
        const uomName = uoms.find(u => u.id === m.uom_id)?.name || ''
        const effVat = vatEnabled ? ((m.vat_rate_percent ?? vatRate ?? 0) / 100) : 0
        const unitPlusVatVal = (m.unit_cost ?? 0) * (1 + effVat)
        return {
          Name: toTitleCase(m.name),
          Category: toTitleCase(catName),
          Brand: m.brand ? toTitleCase(m.brand) : '',
          Supplier: toTitleCase(supName),
          UOM: uomName,
          PackSize: m.packaging_size ?? null,
          PackPrice: m.package_price ?? null,
          UnitCost: m.unit_cost ?? null,
          ...(vatEnabled ? {
            VatRatePct: m.vat_rate_percent ?? vatRate ?? 0,
            UnitCostPlusVat: unitPlusVatVal,
          } : {}),
          FoodDrink: m.is_food_drink ? t('Yes', lang) : t('No', lang),
          Default: m.is_default ? t('Yes', lang) : t('No', lang),
          LastUpdate: m.last_update ? new Date(m.last_update) : null,
        }
      })

      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Materials')

      const baseCols: any[] = [
        { header: t('Name', lang), key: 'Name', width: 30 },
        { header: t('Category', lang), key: 'Category', width: 20 },
        { header: t('Brand', lang), key: 'Brand', width: 20 },
        { header: t('Supplier', lang), key: 'Supplier', width: 24 },
        { header: 'UOM', key: 'UOM', width: 10 },
        { header: t('PackagingSize', lang), key: 'PackSize', width: 14 },
        { header: `${t('PackagePrice', lang)} (${currency})`, key: 'PackPrice', width: 16 },
        { header: `${t('UnitCost', lang)} (${currency})`, key: 'UnitCost', width: 16 },
      ]
      const vatCols = vatEnabled ? [
        { header: t('VatRatePct', lang), key: 'VatRatePct', width: 12 },
        { header: `${t('UnitCostPlusVat', lang)} (${currency})`, key: 'UnitCostPlusVat', width: 20 },
      ] : []
      const tailCols = [
        { header: t('FoodDrink', lang), key: 'FoodDrink', width: 12 },
        { header: t('IsDefault', lang), key: 'Default', width: 10 },
        { header: t('UpdatedAt', lang), key: 'LastUpdate', width: 18, style: { numFmt: 'dd/mm/yyyy' } },
      ]

      ws.columns = [...baseCols, ...vatCols, ...tailCols]
      ws.addRows(rows as any[])

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
        name: 'MaterialsTable',
        ref: 'A1',
        headerRow: true,
        totalsRow: false,
        style: { theme: 'TableStyleMedium2', showRowStripes: true },
        columns: cols,
        rows: rows.map((r: any) => Object.values(r)),
      })

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `materials_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert(`${t('ExportFailed', lang)}: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  // ==== Bulk actions / selezione ====
  const filtered = applyFilters(mats)
  const allVisibleSelected = filtered.length > 0 && filtered.every(m => !!selected[m.id])
  const someVisibleSelected = filtered.some(m => !!selected[m.id]) && !allVisibleSelected

  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = someVisibleSelected
  }, [someVisibleSelected, allVisibleSelected, filtered.length])

  useEffect(() => { if (!selectMode) setSelected({}) }, [selectMode])

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
    const { error } = await supabase.from(TBL_MATERIALS).update({ last_update: now }).in('id', selectedIds)
    if (error) { alert(t('MarkReviewedFailed', lang) + ': ' + error.message); return }
    await fetchAll()
  }

  async function bulkMoveToTrash() {
    if (selectedIds.length === 0) return
    const ok = window.confirm(t('ConfirmMoveToTrash', lang).replace('{n}', String(selectedIds.length)))
    if (!ok) return
    const now = new Date().toISOString()
    const { error } = await supabase.from(TBL_MATERIALS).update({ deleted_at: now }).in('id', selectedIds)
    if (error) { alert(t('MoveToTrashFailed', lang) + ': ' + error.message); return }
    await fetchAll()
  }

  // === Bulk edit VAT ===
  const [showVatModal, setShowVatModal] = useState(false)

  async function bulkApplyVat(mode: 'set' | 'delta', value: number) {
    if (selectedIds.length === 0) { setShowVatModal(false); return }
    try {
      const now = new Date().toISOString()
      const selectedMats = mats.filter(m => selectedIds.includes(m.id))
      await Promise.all(
        selectedMats.map(async (m) => {
          const base = m.vat_rate_percent ?? (vatRate ?? 0)
          let newVal = mode === 'set' ? value : base + value
          newVal = Math.max(0, Math.min(100, newVal))
          const { error } = await supabase
            .from(TBL_MATERIALS)
            .update({ vat_rate_percent: newVal, last_update: now })
            .eq('id', m.id)
          if (error) throw error
        })
      )
      setShowVatModal(false)
      await fetchAll()
    } catch (e: any) {
      alert(`${t('SavedErr', lang)}: ${e?.message || 'Bulk VAT failed'}`)
    }
  }

  if (loading) return <CircularLoader />

  // Header helper per UnitCostPlusVat su 3 righe in vietnamita
  const UnitPlusVatHeader = () => {
    if (lang !== 'vi') return <span>{t('UnitCostPlusVat', lang)}</span>
    return (
      <div className="flex flex-col items-center leading-tight">
        <span>Đơn</span><span>giá</span><span>+ VAT</span>
      </div>
    )
  }

  const columnHeaderDict = {
    sortAsc: lang === 'vi' ? 'Sắp xếp tăng dần' : 'Sort Ascending',
    sortDesc: lang === 'vi' ? 'Sắp xếp giảm dần' : 'Sort Descending',
    selectAll: lang === 'vi' ? 'Chọn tất cả' : 'Select All',
    deselectAll: lang === 'vi' ? 'Bỏ chọn tất cả' : 'Deselect All',
    filterPlaceholder: lang === 'vi' ? 'Lọc...' : 'Filter...',
    clearFilters: lang === 'vi' ? 'Xóa bộ lọc' : 'Clear Filters',
  }

  return (
    <div className="max-w-none mx-auto p-4 text-gray-100">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            {/* Kebab menu: visibile solo in modalità Select */}
            {selectMode && (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen(v => !v)}
                  className="p-2 rounded-lg hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                  title={t('BulkActions', lang)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <EllipsisVerticalIcon className="w-6 h-6 text-white" />
                </button>
                {menuOpen && (
                  <div className="absolute z-10 mt-2 w-64 rounded-xl border border-white/10 bg-white text-gray-900 shadow-xl">
                    {/* NEW: Bulk Edit VAT */}
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 disabled:opacity-50"
                      onClick={() => { setMenuOpen(false); setShowVatModal(true) }}
                      disabled={selectedIds.length === 0 || !vatEnabled}
                      title={!vatEnabled ? t('VatDisabledWarn', lang) : undefined}
                    >
                      {t('BulkEditVat', lang)}
                    </button>

                    <button
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 disabled:opacity-50"
                      onClick={() => { setMenuOpen(false); bulkMarkReviewed() }}
                      disabled={selectedIds.length === 0}
                    >
                      {t('MarkReviewed', lang)}
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 text-red-600 disabled:opacity-50 flex items-center gap-2"
                      onClick={() => { setMenuOpen(false); bulkMoveToTrash() }}
                      disabled={selectedIds.length === 0}
                    >
                      <TrashIcon className="w-4 h-4" />
                      {t('MoveToTrash', lang)}
                    </button>
                  </div>
                )}
              </div>
            )}

            <h1 className="text-2xl font-bold text-white sm:text-3xl tracking-tight leading-normal">{t('Materials', lang)}</h1>
            {selectedIds.length > 0 && (
              <span className="ml-2 text-sm text-blue-200">({selectedIds.length} {t('Selected', lang)})</span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            {lang === 'vi'
              ? 'Quản lý nguyên liệu, đơn giá và cấu hình thuế VAT'
              : 'Manage ingredients, unit costs, and VAT configurations'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-lg
                       bg-blue-600/15 text-blue-200 hover:bg-blue-600/25
                       border border-blue-400/30 disabled:opacity-60"
            title={t('Export', lang)}
          >
            <ArrowUpTrayIcon className="w-5 h-5" />
            {t('Export', lang)}
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
                           border border-blue-400/30 disabled:opacity-60"
                title={t('Import', lang)}
              >
                <ArrowDownTrayIcon className="w-5 h-5" />
                {t('Import', lang)}
              </button>
            </>
          )}

          {role && role !== 'accountant' && (
            <button
              onClick={() => setSelectMode(s => !s)}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border ${selectMode
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border-blue-400/30'
                }`}
              title={selectMode ? t('ExitSelection', lang) : t('EnterSelection', lang)}
            >
              <CheckCircleIcon className="w-5 h-5" />
              {selectMode ? t('Selecting', lang) : t('Select', lang)}
            </button>
          )}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllColumnFilters}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-red-600/10 hover:bg-red-600/20 text-red-200 border border-red-500/20 text-sm font-medium"
            >
              <XMarkIcon className="w-4 h-4" />
              {lang === 'vi' ? 'Xóa bộ lọc' : 'Clear Filters'}
            </button>
          )}

          {role && role !== 'accountant' && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-80"
            >
              <PlusIcon className="w-5 h-5" /> {t('NewMaterial', lang)}
            </button>
          )}
        </div>
      </div>

      {/* Tabella */}
      <div className="bg-white rounded-2xl shadow p-3 overflow-x-auto">
        <table key={vatEnabled ? 'vat-on' : 'vat-off'} className="w-full table-auto text-sm text-gray-900">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
              <th className="p-2 w-7">
                {selectMode ? (
                  <input
                    ref={headerCbRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    className="h-4 w-4"
                    title={t('SelectAll', lang)}
                  />
                ) : null}
              </th>

              <ColumnHeader
                colKey="name"
                label={t('Name', lang)}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={toggleSort}
                values={columnValues.name || []}
                activeFilter={columnFilters.name || null}
                onFilter={vals => applyColumnFilter('name', vals)}
                onClear={() => clearColumnFilter('name')}
                open={openMenu === 'name'}
                onToggle={() => setOpenMenu(openMenu === 'name' ? null : 'name')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="w-36 min-w-[7rem]"
              />

              <ColumnHeader
                colKey="category"
                label={t('Category', lang)}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={toggleSort}
                values={columnValues.category || []}
                activeFilter={columnFilters.category || null}
                onFilter={vals => applyColumnFilter('category', vals)}
                onClear={() => clearColumnFilter('category')}
                open={openMenu === 'category'}
                onToggle={() => setOpenMenu(openMenu === 'category' ? null : 'category')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="w-28 min-w-[5.5rem]"
              />

              <ColumnHeader
                colKey="brand"
                label={t('Brand', lang)}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={toggleSort}
                values={columnValues.brand || []}
                activeFilter={columnFilters.brand || null}
                onFilter={vals => applyColumnFilter('brand', vals)}
                onClear={() => clearColumnFilter('brand')}
                open={openMenu === 'brand'}
                onToggle={() => setOpenMenu(openMenu === 'brand' ? null : 'brand')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="w-20 min-w-[4.5rem]"
              />

              <ColumnHeader
                colKey="supplier"
                label={t('Supplier', lang)}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={toggleSort}
                values={columnValues.supplier || []}
                activeFilter={columnFilters.supplier || null}
                onFilter={vals => applyColumnFilter('supplier', vals)}
                onClear={() => clearColumnFilter('supplier')}
                open={openMenu === 'supplier'}
                onToggle={() => setOpenMenu(openMenu === 'supplier' ? null : 'supplier')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="w-28 min-w-[5.5rem]"
              />

              <ColumnHeader
                colKey="uom"
                label={t('Uom', lang)}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={toggleSort}
                values={columnValues.uom || []}
                activeFilter={columnFilters.uom || null}
                onFilter={vals => applyColumnFilter('uom', vals)}
                onClear={() => clearColumnFilter('uom')}
                open={openMenu === 'uom'}
                onToggle={() => setOpenMenu(openMenu === 'uom' ? null : 'uom')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="w-12 min-w-[2.5rem]"
                center
              />

              <ColumnHeader
                colKey="packaging_size"
                label={t('PackagingSize', lang)}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={toggleSort}
                values={columnValues.packaging_size || []}
                activeFilter={columnFilters.packaging_size || null}
                onFilter={vals => applyColumnFilter('packaging_size', vals)}
                onClear={() => clearColumnFilter('packaging_size')}
                open={openMenu === 'packaging_size'}
                onToggle={() => setOpenMenu(openMenu === 'packaging_size' ? null : 'packaging_size')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="w-16 min-w-[3.5rem]"
                center
              />

              <ColumnHeader
                colKey="package_price"
                label={t('PackagePrice', lang)}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={toggleSort}
                values={columnValues.package_price || []}
                activeFilter={columnFilters.package_price || null}
                onFilter={vals => applyColumnFilter('package_price', vals)}
                onClear={() => clearColumnFilter('package_price')}
                open={openMenu === 'package_price'}
                onToggle={() => setOpenMenu(openMenu === 'package_price' ? null : 'package_price')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="w-20 min-w-[4.5rem]"
                center
              />

              {vatEnabled && (
                <ColumnHeader
                  colKey="vat_rate"
                  label={t('VatRatePct', lang)}
                  sortCol={sortCol}
                  sortAsc={sortAsc}
                  onSort={toggleSort}
                  values={columnValues.vat_rate || []}
                  activeFilter={columnFilters.vat_rate || null}
                  onFilter={vals => applyColumnFilter('vat_rate', vals)}
                  onClear={() => clearColumnFilter('vat_rate')}
                  open={openMenu === 'vat_rate'}
                  onToggle={() => setOpenMenu(openMenu === 'vat_rate' ? null : 'vat_rate')}
                  onClose={() => setOpenMenu(null)}
                  dict={columnHeaderDict}
                  className="w-14 min-w-[3.5rem]"
                  center
                />
              )}

              {vatEnabled && (
                <ColumnHeader
                  colKey="package_plus_vat"
                  label={t('PackagePricePlusVat', lang)}
                  sortCol={sortCol}
                  sortAsc={sortAsc}
                  onSort={toggleSort}
                  values={columnValues.package_plus_vat || []}
                  activeFilter={columnFilters.package_plus_vat || null}
                  onFilter={vals => applyColumnFilter('package_plus_vat', vals)}
                  onClear={() => clearColumnFilter('package_plus_vat')}
                  open={openMenu === 'package_plus_vat'}
                  onToggle={() => setOpenMenu(openMenu === 'package_plus_vat' ? null : 'package_plus_vat')}
                  onClose={() => setOpenMenu(null)}
                  dict={columnHeaderDict}
                  className="w-22 min-w-[5.5rem]"
                  center
                />
              )}

              <ColumnHeader
                colKey="unit_cost"
                label={t('UnitCost', lang)}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={toggleSort}
                values={columnValues.unit_cost || []}
                activeFilter={columnFilters.unit_cost || null}
                onFilter={vals => applyColumnFilter('unit_cost', vals)}
                onClear={() => clearColumnFilter('unit_cost')}
                open={openMenu === 'unit_cost'}
                onToggle={() => setOpenMenu(openMenu === 'unit_cost' ? null : 'unit_cost')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="w-20 min-w-[4.5rem]"
                center
              />

              {vatEnabled && (
                <ColumnHeader
                  colKey="unit_plus_vat"
                  label={lang === 'vi' ? 'Đơn giá + VAT' : t('UnitCostPlusVat', lang)}
                  sortCol={sortCol}
                  sortAsc={sortAsc}
                  onSort={toggleSort}
                  values={columnValues.unit_plus_vat || []}
                  activeFilter={columnFilters.unit_plus_vat || null}
                  onFilter={vals => applyColumnFilter('unit_plus_vat', vals)}
                  onClear={() => clearColumnFilter('unit_plus_vat')}
                  open={openMenu === 'unit_plus_vat'}
                  onToggle={() => setOpenMenu(openMenu === 'unit_plus_vat' ? null : 'unit_plus_vat')}
                  onClose={() => setOpenMenu(null)}
                  dict={columnHeaderDict}
                  className="w-22 min-w-[5.5rem]"
                  center
                />
              )}

              <ColumnHeader
                colKey="is_food_drink"
                label={t('Food', lang) + '/' + t('Drink', lang)}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={toggleSort}
                values={columnValues.is_food_drink || []}
                activeFilter={columnFilters.is_food_drink || null}
                onFilter={vals => applyColumnFilter('is_food_drink', vals)}
                onClear={() => clearColumnFilter('is_food_drink')}
                open={openMenu === 'is_food_drink'}
                onToggle={() => setOpenMenu(openMenu === 'is_food_drink' ? null : 'is_food_drink')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="w-12 min-w-[3rem]"
                center
              />

              <ColumnHeader
                colKey="is_default"
                label={t('IsDefault', lang)}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={toggleSort}
                values={columnValues.is_default || []}
                activeFilter={columnFilters.is_default || null}
                onFilter={vals => applyColumnFilter('is_default', vals)}
                onClear={() => clearColumnFilter('is_default')}
                open={openMenu === 'is_default'}
                onToggle={() => setOpenMenu(openMenu === 'is_default' ? null : 'is_default')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="w-10 min-w-[2.5rem]"
                center
              />

              <ColumnHeader
                colKey="last_update"
                label={t('UpdatedAt', lang)}
                sortCol={sortCol}
                sortAsc={sortAsc}
                onSort={toggleSort}
                values={columnValues.last_update || []}
                activeFilter={columnFilters.last_update || null}
                onFilter={vals => applyColumnFilter('last_update', vals)}
                onClear={() => clearColumnFilter('last_update')}
                open={openMenu === 'last_update'}
                onToggle={() => setOpenMenu(openMenu === 'last_update' ? null : 'last_update')}
                onClose={() => setOpenMenu(null)}
                dict={columnHeaderDict}
                className="w-20 min-w-[4.5rem]"
                center
              />
            </tr>
          </thead>

          <tbody>
            {applyFilters(mats).map((m, idx) => {
              const catName = cats.find(c => c.id === m.category_id)?.name || ''
              const supName = sups.find(s => s.id === m.supplier_id)?.name || ''
              const uomName = uoms.find(u => u.id === m.uom_id)?.name || ''
              const effPct = effVatPct(m)

              const overdue =
                Number(reviewMonths) <= 0 ? true : isOlderThanMonths(m.last_update, Number(reviewMonths))

              return (
                <tr
                  key={m.id}
                  className={`border-t border-gray-100 hover:bg-gray-50/80 transition-colors cursor-pointer text-xs text-gray-600 ${
                    idx % 2 === 0 ? 'bg-gray-50/30' : ''
                  }`}
                  onClick={() => openView(m)}
                  onDoubleClick={() => role === 'accountant' ? openView(m) : openEdit(m)}
                >
                  <td className="px-3 py-2.5 w-7" onClick={e => e.stopPropagation()}>
                    {selectMode ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-blue-600 rounded"
                        checked={!!selected[m.id]}
                        onChange={e => setSelected(prev => ({ ...prev, [m.id]: e.target.checked }))}
                        title={t('SelectRow', lang)}
                      />
                    ) : null}
                  </td>

                  <td className="px-3 py-2.5 w-36 min-w-[7rem] whitespace-normal break-words leading-tight font-semibold text-gray-900">{toTitleCase(m.name)}</td>
                  <td className="px-3 py-2.5 w-28 min-w-[5.5rem] whitespace-normal break-words leading-tight">{toTitleCase(catName) || '-'}</td>
                  <td className="px-3 py-2.5 w-20 min-w-[4.5rem] whitespace-normal break-words leading-tight text-gray-500">{m.brand ? toTitleCase(m.brand) : '-'}</td>
                  <td className="px-3 py-2.5 w-28 min-w-[5.5rem] whitespace-normal break-words leading-tight">{toTitleCase(supName) || '-'}</td>

                  <td className="px-3 py-2.5 w-12 min-w-[2.5rem] text-center">{uomName || '-'}</td>

                  <td className="px-3 py-2.5 w-16 min-w-[3.5rem] text-center font-mono text-gray-900">
                    {m.packaging_size?.toLocaleString(locale) || '-'}
                  </td>
                  <td className="px-3 py-2.5 w-20 min-w-[4.5rem] text-center font-mono text-gray-900">
                    {m.package_price != null ? num.format(m.package_price) : '-'}
                  </td>

                  {vatEnabled && (
                    <td className="px-3 py-2.5 w-14 min-w-[3.5rem] text-center font-mono text-gray-500">
                      {num.format(effPct)}%
                    </td>
                  )}

                  {vatEnabled && (
                    <td className="px-3 py-2.5 w-22 min-w-[5.5rem] text-center font-mono text-gray-900">
                      {num.format(packagePlusVat(m))}
                    </td>
                  )}

                  <td className="px-3 py-2.5 w-20 min-w-[4.5rem] text-center font-mono text-gray-900">
                    {m.unit_cost != null ? num.format(m.unit_cost) : '-'}
                  </td>

                  {vatEnabled && (
                    <td className="px-3 py-2.5 w-22 min-w-[5.5rem] text-center font-mono text-gray-900">
                      {num.format(unitPlusVat(m))}
                    </td>
                  )}

                  <td className="px-3 py-2.5 w-12 min-w-[3rem] text-center">
                    {m.is_food_drink ? t('Yes', lang) : t('No', lang)}
                  </td>

                  <td className="px-3 py-2.5 w-10 min-w-[2.5rem] text-center">
                    {m.is_default ? t('Yes', lang) : t('No', lang)}
                  </td>

                  <td
                    className={`px-3 py-2.5 w-20 min-w-[4.5rem] text-center font-mono whitespace-normal leading-tight ${overdue ? 'text-red-600 font-semibold' : ''}`}
                    title={m.last_update || ''}
                  >
                    {fmtDate(m.last_update)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {applyFilters(mats).length === 0 && (
          <div className="text-center text-sm text-gray-500 py-6">
            {t('NoResults', lang) || 'Nessun risultato con i filtri attuali.'}
          </div>
        )}
      </div>

      {/* Modali & overlay */}
      {progress != null && <ImportProgressModal progress={progress} />}

      {unifiedOpen && (
        <ResolveImportModal
          pending={unifiedOpen}
          cats={cats}
          sups={sups}
          onCancel={onUnifiedCancel}
          onConfirm={onUnifiedConfirm}
        />
      )}

      {showVatModal && (
        <BulkVatModal
          lang={lang}
          count={selectedIds.length}
          defaultVat={vatRate ?? 0}
          onCancel={() => setShowVatModal(false)}
          onConfirm={(mode, value) => bulkApplyVat(mode, value)}
        />
      )}

      {openEditor && (
        <MaterialEditor
          mode={role === 'accountant' ? 'view' : editorMode}
          id={editingId}
          cats={cats}
          sups={sups}
          uoms={uoms}
          initial={initialMat}
          onClose={() => setOpenEditor(false)}
          onSaved={async () => { setOpenEditor(false); await fetchAll() }}
          onDeleted={async () => { setOpenEditor(false); await fetchAll() }}
          onCategoryCreated={(c) => setCats((prev) => [...prev, c])}
          onSupplierCreated={(s) => setSups((prev) => [...prev, s])}
          userRole={role}
        />
      )}
    </div>
  )
}
