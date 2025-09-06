// src/app/recipes/page.tsx
'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase_shim'
import {
  PlusIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  XMarkIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  EllipsisVerticalIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import ExcelJS from 'exceljs'

// i18n + settings
import { t } from '@/lib/i18n'
import { useSettings } from '@/contexts/SettingsContext'

/* ---------- DB: views and tables ---------- */
const VW_PREP_LIST = 'prep_list_with_uom_vw'
const VW_FINAL_LIST = 'final_list_vw'
const TBL_PREP = 'prep_recipes'
const TBL_FINAL = 'final_recipes'
const TBL_CATS = 'recipe_categories'
const TBL_DISH_CATS = 'dish_categories'
const TBL_MAT = 'materials'
const TBL_UOM = 'uom'
const TBL_PREP_ITEMS = 'prep_recipe_items'
const TBL_FINAL_ITEMS = 'final_recipe_items'
/* tags */
const TBL_TAGS = 'tags'
const TBL_FINAL_TAGS = 'final_recipe_tags'

/* ---------- Types ---------- */
type Category = { id: number; name: string }

type PrepRow = {
  id: string
  name: string
  category: string | null
  type: 'food' | 'beverage' | null
  yield_qty: number | null
  uom_name: string | null
  waste_pct: number | null
  cost_unit_vnd: number | null
  last_update: string | null
}

type FinalRow = {
  id: string
  name: string
  category: string | null
  type: 'food' | 'beverage' | null
  cost_unit_vnd: number | null
  price_vnd: number | null
  cost_ratio: number | null
  suggested_price_vnd: number | null
  last_update: string | null
}

type IngredientLine = {
  id: string
  ref_type: 'material' | 'prep' | null
  ref_id: string | null
  name: string
  qty: number | ''
  uom: string
  cost: number | '' // costo NETTO di riga (qty * unit)
}

type MatOption = { id: string; label: string; unit_cost: number | null; uom_name: string | null }
type PrepOption = { id: string; label: string; unit_cost: number | null; uom_name: string | null }
type Uom = { id: number; name: string }

type PrepHeaderDraft = {
  name?: string
  category_id?: number | null
  type?: 'food' | 'beverage' | null
  yield_qty?: number | null
  waste_pct?: number | null
  uom_id?: number | null
  portion_size?: number | null
}

type FinalHeaderDraft = {
  name?: string
  category_id?: number | null
  type?: 'food' | 'beverage' | null
  price_vnd?: number | null
}

/* ---------- UI helpers ---------- */
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
function fmtNum(n?: number | null) {
  if (n == null) return ''
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
}
function fmtInt(n?: number | null) {
  if (n == null) return ''
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
}
function typeLabel(t?: 'food' | 'beverage' | null, lang?: any) {
  if (!t) return ''
  return t === 'beverage' ? tKey('Drink', lang) : tKey('Food', lang)
}
function pct(n?: number | null) {
  if (n == null) return ''
  return `${Number(n).toFixed(1)}%`
}
function uid() {
  return Math.random().toString(36).slice(2)
}
function tKey<K extends string>(key: K, lang: unknown) {
  return t(key, lang)
}

/* Two-option toggle styled to match input height and border */
function TypeToggle({
  value,
  onChange,
  disabled,
  labels,
}: {
  value: 'food' | 'beverage' | ''
  onChange: (v: 'food' | 'beverage') => void
  disabled?: boolean
  labels: { food: string; beverage: string }
}) {
  const wrapDisabled = disabled ? 'opacity-60 pointer-events-none' : ''
  const btnBase = 'flex-1 h-10 text-sm font-medium focus:outline-none'
  const btnActive = 'bg-blue-600 text-white'
  const btnInactive = 'bg-white text-gray-900 hover:bg-gray-50'
  return (
    <div className={`w-full rounded-lg border border-gray-300 overflow-hidden flex ${wrapDisabled}`}>
      <button
        type="button"
        aria-pressed={value === 'food'}
        className={`${btnBase} ${value === 'food' ? btnActive : btnInactive}`}
        onClick={() => onChange('food')}
      >
        {labels.food}
      </button>
      <div className="w-px bg-gray-300" aria-hidden />
      <button
        type="button"
        aria-pressed={value === 'beverage'}
        className={`${btnBase} ${value === 'beverage' ? btnActive : btnInactive}`}
        onClick={() => onChange('beverage')}
      >
        {labels.beverage}
      </button>
    </div>
  )
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

function SectionCard({
  title,
  children,
  actions,
}: {
  title: string
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border p-4 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-gray-800">{title}</div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </div>
  )
}

/* =====================================================
   Ingredients Editor - colonna UnitCost + colonna Total (netto di riga)
===================================================== */
function IngredientsEditor({
  lines,
  setLines,
  showTotal,
  matOptions,
  prepOptions,
  readOnly = false,
}: {
  lines: IngredientLine[]
  setLines: (up: IngredientLine[]) => void
  showTotal?: boolean
  matOptions: MatOption[]
  prepOptions: PrepOption[]
  readOnly?: boolean
}) {
  const { language, currency } = useSettings()

  const matMap = useMemo(() => {
    const m = new Map<string, MatOption>()
    matOptions.forEach(o => m.set(String(o.id), o))
    return m
  }, [matOptions])

  const prepMap = useMemo(() => {
    const m = new Map<string, PrepOption>()
    prepOptions.forEach(o => m.set(String(o.id), o))
    return m
  }, [prepOptions])

  // Somma dei TOTALI di riga
  const total = useMemo(() => lines.reduce((s, r) => s + (Number(r.cost) || 0), 0), [lines])

  function unitForRow(row: IngredientLine) {
    if (row.ref_type === 'material' && row.ref_id) return matMap.get(String(row.ref_id))?.unit_cost ?? null
    if (row.ref_type === 'prep' && row.ref_id) return prepMap.get(String(row.ref_id))?.unit_cost ?? null
    return null
  }

  function updateLine(id: string, patch: Partial<IngredientLine>) {
    setLines(lines.map(l => (l.id === id ? { ...l, ...patch } : l)))
  }
  function addLine() {
    setLines([...lines, { id: uid(), ref_type: null, ref_id: null, name: '', qty: '', uom: '', cost: '' }])
  }
  function delLine(id: string) {
    setLines(lines.filter(l => l.id !== id))
  }

  function applySelection(rowId: string, value: string) {
    if (!value) {
      updateLine(rowId, { ref_type: null, ref_id: null, name: '', uom: '', cost: '' })
      return
    }
    const [kind, realId] = value.split(':')
    const cur = lines.find(l => l.id === rowId)
    const qtyNum = cur && typeof cur.qty === 'number' ? cur.qty : 0

    if (kind === 'm') {
      const m = matMap.get(realId)
      const autoCost = m?.unit_cost != null ? Math.round((m.unit_cost || 0) * qtyNum) : ''
      updateLine(rowId, {
        ref_type: 'material',
        ref_id: realId,
        name: m?.label || '',
        uom: m?.uom_name || '',
        cost: autoCost, // totale di riga
      })
    } else {
      const p = prepMap.get(realId)
      const autoCost = p?.unit_cost != null ? Math.round((p.unit_cost || 0) * qtyNum) : ''
      updateLine(rowId, {
        ref_type: 'prep',
        ref_id: realId,
        name: p?.label || '',
        uom: p?.uom_name || '',
        cost: autoCost, // totale di riga
      })
    }
  }

  function onQtyChange(id: string, v: string) {
    const qty = v === '' ? '' : Number(v)
    const row = lines.find(l => l.id === id)
    if (!row) return
    if (qty === '') {
      updateLine(id, { qty, cost: row.cost })
      return
    }
    let unit = 0
    if (row.ref_type === 'material' && row.ref_id) unit = matMap.get(String(row.ref_id))?.unit_cost || 0
    if (row.ref_type === 'prep' && row.ref_id) unit = prepMap.get(String(row.ref_id))?.unit_cost || 0
    const autoCost = Math.round((unit || 0) * qty) // totale di riga
    updateLine(id, { qty, cost: autoCost })
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-gray-900">
          <colgroup>
            <col className="w-[26rem]" />
            <col className="w-[8rem]" />
            <col className="w-[8rem]" />
            <col className="w-[10rem]" /> 
            <col className="w-[10rem]" /> 
            <col className="w-[3rem]" />
          </colgroup>
          <thead>
            <tr className="bg-blue-50 text-gray-800">
              <th className="p-2 text-left font-semibold">{t('Item', language)}</th>
              <th className="p-2 text-right font-semibold">{t('Qty', language)}</th>
              <th className="p-2 text-left font-semibold">{t('Uom', language)}</th>
              {/* PATCH: nuova colonna costo unitario */}
              <th className="p-2 text-right font-semibold">
                {t('UnitCost', language)} ({currency})
              </th>
              {/* PATCH: colonna totale di riga (netto) */}
              <th className="p-2 text-right font-semibold">
                {t('Total', language)} ({currency})
              </th>
              <th className="p-2 text-right font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map(row => {
              const unit = unitForRow(row)
              return (
                <tr key={row.id} className="border-t">
                  <td className="p-2">
                    <select
                      className="w-full border rounded-lg px-2 py-1 bg-white"
                      value={
                        row.ref_type === 'material' && row.ref_id
                          ? `m:${row.ref_id}`
                          : row.ref_type === 'prep' && row.ref_id
                          ? `p:${row.ref_id}`
                          : ''
                      }
                      onChange={e => applySelection(row.id, e.target.value)}
                      disabled={readOnly}
                    >
                      <option value="">{t('Select', language)}</option>
                      <optgroup label={t('Materials', language)}>
                        {matOptions.map(o => (
                          <option key={`m-${o.id}`} value={`m:${o.id}`}>{o.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label={t('Preparations', language)}>
                        {prepOptions.map(o => (
                          <option key={`p-${o.id}`} value={`p:${o.id}`}>{o.label}</option>
                        ))}
                      </optgroup>
                    </select>
                  </td>

                  <td className="p-2">
                    <input
                      type="number"
                      step={1}
                      className="w-full border rounded-lg px-2 py-1 text-right"
                      value={row.qty}
                      onChange={e => onQtyChange(row.id, e.target.value)}
                      disabled={readOnly}
                      aria-label={t('Qty', language)}
                    />
                  </td>

                  <td className="p-2">
                    <input
                      className="w-full border rounded-lg px-2 py-1"
                      value={row.uom}
                      onChange={e => {/* keep readonly to avoid mismatch */}}
                      disabled={true}
                      aria-label={t('Uom', language)}
                    />
                  </td>

                  {/* PATCH: costo unitario sola lettura, calcolato dal mapping */}
                  <td className="p-2">
                    <input
                      type="number"
                      step={1}
                      className="w-full border rounded-lg px-2 py-1 text-right bg-gray-50 select-none"
                      value={unit == null ? '' : Math.round(unit)}
                      readOnly
                      aria-readonly="true"
                      tabIndex={-1}
                      aria-label={`${t('UnitCost', language)} (${currency})`}
                    />
                  </td>

                  {/* Totale NETTO di riga (qty * unit) - già esistente */}
                  <td className="p-2">
                    <input
                      type="number"
                      step={1}
                      className="w-full border rounded-lg px-2 py-1 text-right bg-gray-50 select-none"
                      value={row.cost}
                      readOnly
                      aria-readonly="true"
                      tabIndex={-1}
                      aria-label={`${t('Total', language)} (${currency})`}
                    />
                  </td>

                  <td className="p-2 text-right">
                    {!readOnly && (
                      <button onClick={() => delLine(row.id)} className="p-1 rounded hover:bg-red-50" aria-label={t('Delete', language)}>
                        <TrashIcon className="w-5 h-5 text-red-600" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {lines.length === 0 && (
              <tr><td className="p-3 text-gray-500" colSpan={6}>{t('NoMaterials', language)}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        {!readOnly && (
          <button className="px-3 py-1.5 rounded-lg border" onClick={() => setLines([...lines, { id: uid(), ref_type: null, ref_id: null, name: '', qty: '', uom: '', cost: '' }])}>
            {t('AddRow', language)}
          </button>
        )}
        {showTotal && (
          <div className="text-sm font-semibold text-gray-900">
            {t('Total', language)}: {fmtNum(total)}
          </div>
        )}
      </div>
    </div>
  )
}

/* =====================================================
   Prep Editor
===================================================== */
type PrepEditorProps = {
  mode: 'create' | 'edit' | 'view'
  id?: string
  categories: Category[]
  matOptions: MatOption[]
  prepOptions: PrepOption[]
  uoms: Uom[]
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
  initialHeader?: PrepHeaderDraft | null
  initialLines?: IngredientLine[] | null
  onCategoryCreated?: (c: Category) => void
}

function PrepEditor(props: PrepEditorProps) {
  const {
    mode,
    id,
    categories,
    matOptions,
    prepOptions,
    uoms,
    onClose,
    onSaved,
    onDeleted,
    initialHeader,
    initialLines,
    onCategoryCreated,
  } = props

  const { language } = useSettings()

  const [viewMode, setViewMode] = useState(mode === 'view')
  const [catsLocal, setCatsLocal] = useState<Category[]>(categories || [])
  const [showAddCat, setShowAddCat] = useState(false)

  useEffect(() => { setCatsLocal(categories || []) }, [categories])

  async function handleAddCategory() {
    if (viewMode) return
    setShowAddCat(true)
  }

  async function createCategory(name: string) {
    const { data, error } = await supabase
      .from(TBL_CATS)
      .insert({ name: name.trim() })
      .select()
      .single()
    if (error) { alert(error.message); return }
    const created = { id: data.id as number, name: data.name as string }
    setCatsLocal(prev => [...prev, created])
    setCategory(String(created.id))
    onCategoryCreated?.(created)
  }

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [type, setType] = useState<'food' | 'beverage' | ''>('')
  const [yieldQty, setYieldQty] = useState('')
  const [portionSize, setPortionSize] = useState('1')
  const [wastePct, setWastePct] = useState('0')
  const [uomId, setUomId] = useState('')
  const [lines, setLines] = useState<IngredientLine[]>([
    { id: uid(), ref_type: null, ref_id: null, name: '', qty: '', uom: '', cost: '' },
  ])

  useEffect(() => {
    if (mode === 'edit' || mode === 'view') {
      const h = initialHeader || {}
      setName(h.name || '')
      setCategory(h.category_id ? String(h.category_id) : '')
      setType((h.type as any) || '')
      setYieldQty(h.yield_qty != null ? String(h.yield_qty) : '')
      setWastePct(h.waste_pct != null ? String(h.waste_pct as any) : '0') // safe fallback
      setUomId(h.uom_id ? String(h.uom_id) : '')
      setPortionSize(h.portion_size != null ? String(h.portion_size) : '1')
      if (initialLines && initialLines.length > 0) {
        setLines(initialLines)
      } else {
        setLines([{ id: uid(), ref_type: null, ref_id: null, name: '', qty: '', uom: '', cost: '' }])
      }
      setViewMode(mode === 'view')
    } else {
      setName('')
      setCategory('')
      setType('')
      setYieldQty('')
      setWastePct('0')
      setUomId('')
      setPortionSize('1')
      setLines([{ id: uid(), ref_type: null, ref_id: null, name: '', qty: '', uom: '', cost: '' }])
      setViewMode(false)
    }
  }, [mode, id, initialHeader, initialLines])

  const totalCost = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.cost) || 0), 0),
    [lines]
  )

  const nServ = useMemo(() => {
    const y = Number(yieldQty || '0')
    const p = Number(portionSize || '0') || 1
    const w = Number(wastePct || '0')
    const effective = y * (1 - w / 100)
    return y > 0 && p > 0 ? effective / p : 0
  }, [yieldQty, portionSize, wastePct])

  const servingCost = useMemo(() => (nServ > 0 ? totalCost / nServ : 0), [totalCost, nServ])

  async function save() {
    if (viewMode) return
    const prepId = id as string | undefined

    if (prepId) {
      const { error } = await supabase
        .from(TBL_PREP)
        .update({
          name: name.trim(),
          category_id: category ? Number(category) : null,
          type: type || null,
          yield_qty: yieldQty ? Number(yieldQty) : null,
          waste_pct: wastePct ? Number(wastePct) : 0,
          cost_per_unit_vnd: Math.round(servingCost),
          uom_id: uomId ? Number(uomId) : null,
          portion_size: portionSize ? Number(portionSize) : null,
        })
        .eq('id', prepId)
      if (error) {
        alert(`Save failed: ${error.message}`)
        return
      }

      await supabase.from(TBL_PREP_ITEMS).delete().eq('prep_id', prepId)
      const payload = lines
        .filter(l => l.name || l.ref_id)
        .map(l => ({
          prep_id: prepId,
          ref_type: l.ref_type,
          ref_id: l.ref_id,
          name: l.name,
          qty: l.qty === '' ? null : Number(l.qty),
          uom: l.uom || null,
          cost: l.cost === '' ? null : Number(l.cost),
        }))
      if (payload.length) {
        const { error: itemsErr } = await supabase.from(TBL_PREP_ITEMS).insert(payload)
        if (itemsErr) {
          alert(`Save items failed: ${itemsErr.message}`)
          return
        }
      }
      onSaved()
      return
    }

    const { data, error } = await supabase
      .from(TBL_PREP)
      .insert({
        name: name.trim(),
        category_id: category ? Number(category) : null,
        type: type || null,
        yield_qty: yieldQty ? Number(yieldQty) : null,
        waste_pct: wastePct ? Number(wastePct) : 0,
        cost_per_unit_vnd: Math.round(servingCost),
        uom_id: uomId ? Number(uomId) : null,
        portion_size: portionSize ? Number(portionSize) : null,
      })
      .select('id')
      .single()
    if (error || !data?.id) {
      alert(`Save failed: ${error?.message || 'missing id'}`)
      return
    }
    const newId = data.id as string

    const payload = lines
      .filter(l => l.name || l.ref_id)
      .map(l => ({
        prep_id: newId,
        ref_type: l.ref_type,
        ref_id: l.ref_id,
        name: l.name,
        qty: l.qty === '' ? null : Number(l.qty),
        uom: l.uom || null,
        cost: l.cost === '' ? null : Number(l.cost),
      }))
    if (payload.length) {
      const { error: itemsErr } = await supabase.from(TBL_PREP_ITEMS).insert(payload)
      if (itemsErr) {
        alert(`Save items failed: ${itemsErr.message}`)
        return
      }
    }
    onSaved()
  }

  async function handleDelete() {
    if (viewMode || !id) return
    const ok = window.confirm(t('DeletePrepConfirm', language))
    if (!ok) return
    const { error } = await supabase.from(TBL_PREP).delete().eq('id', id)
    if (error) alert(`Delete failed: ${error.message}`)
    else onDeleted()
  }

  const canSave = !viewMode && name.trim().length > 0

  return (
    <Overlay onClose={onClose}>
      <div className="p-4 md:p-6 text-gray-900">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xl font-bold">
            {viewMode
              ? t('PrepSheet', language)
              : id
              ? t('EditPrepTitle', language)
              : t('NewPrepTitle', language)}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label={t('Close', language)}>
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <SectionCard title={t('Header', language)}>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-sm text-gray-800">{t('RecipeName', language)}</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 disabled:bg-gray-50 h-10"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={viewMode}
                />
              </div>
              <div>
                <label className="text-sm text-gray-800">{t('Category', language)}</label>
                <select
                  className={`mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 bg-white disabled:bg-gray-50 h-10 ${category ? 'text-gray-900' : 'text-gray-500'}`}
                  value={category}
                  onChange={async e => {
                    const v = e.target.value
                    if (v === '__add__') { await handleAddCategory(); return }
                    setCategory(v)
                  }}
                  disabled={viewMode}
                >
                  <option value="">{t('Select', language)}...</option>
                  {catsLocal.map(c => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                  <option value="__add__">➕ {t('AddCategory', language)}</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-800">{t('Type', language)}</label>
                <div className="mt-1">
                  <TypeToggle
                    value={type}
                    onChange={v => setType(v)}
                    disabled={viewMode}
                    labels={{ food: t('Food', language), beverage: t('Drink', language) }}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-800">{t('Yield', language)}</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 disabled:bg-gray-50 h-10"
                  type="number"
                  step={1}
                  value={yieldQty}
                  onChange={(e) => setYieldQty(e.target.value)}
                  disabled={viewMode}
                />
              </div>
              <div>
                <label className="text-sm text-gray-800">{t('PortionSize', language)}</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 disabled:bg-gray-50 h-10"
                  type="number"
                  step={1}
                  value={portionSize}
                  onChange={(e) => setPortionSize(e.target.value)}
                  disabled={viewMode}
                />
              </div>
              <div>
                <label className="text-sm text-gray-800">{t('Uom', language)}</label>
                <select
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 bg-white disabled:bg-gray-50 h-10"
                  value={uomId}
                  onChange={(e) => setUomId(e.target.value)}
                  disabled={viewMode}
                >
                  <option value="">{t('Select', language)}</option>
                  {uoms.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-800">{t('WastePct', language)}</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 disabled:bg-gray-50 h-10"
                  type="number"
                  step={1}
                  value={wastePct}
                  onChange={(e) => setWastePct(e.target.value)}
                  disabled={viewMode}
                />
              </div>
              <div className="col-span-2">
                <div className="text-xs text-gray-600">{t('NumberOfServings', language)}</div>
                <div className="text-lg font-semibold text-gray-900">
                  {Number.isFinite(nServ) ? (nServ || 0).toFixed(2) : ''}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title={t('Pricing', language)}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-600">{t('TotalCost', language)}</div>
                <div className="text-lg font-semibold text-gray-900">{fmtNum(totalCost)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-600">{t('ServingCost', language)}</div>
                <div className="text-lg font-semibold text-gray-900">{fmtNum(servingCost)}</div>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="mt-4">
          <SectionCard title={t('Ingredients', language)}>
            <IngredientsEditor
              lines={lines}
              setLines={setLines}
              showTotal
              matOptions={matOptions}
              prepOptions={prepOptions}
              readOnly={viewMode}
            />
          </SectionCard>
        </div>

        {showAddCat && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddCat(false)} />
            <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-lg font-semibold">{t('AddPrepCategory', language)}</div>
                <button onClick={() => setShowAddCat(false)} className="p-1 rounded hover:bg-gray-100" aria-label={t('Close', language)}>
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>
              <input
                id="addCatInput"
                autoFocus
                className="w-full border rounded-lg px-2 py-1 text-gray-900 mb-4"
                placeholder={t('CategoryNamePlaceholder', language)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    const value = (e.target as HTMLInputElement).value.trim()
                    if (value) await createCategory(value)
                    setShowAddCat(false)
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAddCat(false)} className="px-3 py-1.5 rounded-lg border">{t('Cancel', language)}</button>
                <button
                  onClick={async () => {
                    const value = (document.querySelector<HTMLInputElement>('#addCatInput')?.value || '').trim()
                    if (value) await createCategory(value)
                    setShowAddCat(false)
                  }}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white"
                >
                  {t('AddCategory', language)}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {viewMode ? (
              <button
                onClick={() => setViewMode(false)}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 active:scale-95"
              >
                {t('Edit', language)}
              </button>
            ) : (
              id && (
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 rounded-lg border text-red-600 hover:bg-red-50"
                >
                  {t('Delete', language)}
                </button>
              )
            )}
          </div>

          <div>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border hover:opacity-80 active:scale-95"
            >
              {t('Close', language)}
            </button>
            {!viewMode && (
              <button
                onClick={save}
                disabled={!canSave}
                className="ml-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 active:scale-95 disabled:opacity-50"
              >
                {t('Save', language)}
              </button>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  )
}

/* =====================================================
   Dish Editor (Final) con TAGS
===================================================== */
type FinalEditorProps = {
  mode: 'create' | 'edit' | 'view'
  id?: string
  categories: Category[]
  matOptions: MatOption[]
  prepOptions: PrepOption[]
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
  initialHeader?: FinalHeaderDraft | null
  initialLines?: IngredientLine[] | null
  onCategoryCreated?: (c: Category) => void
}

type Tag = { id: number; name: string }

function FinalEditor(props: FinalEditorProps) {
  const {
    mode,
    id,
    categories,
    matOptions,
    prepOptions,
    onClose,
    onSaved,
    onDeleted,
    initialHeader,
    initialLines,
    onCategoryCreated,
  } = props

  const { language, currency } = useSettings()

  const [viewMode, setViewMode] = useState(mode === 'view')
  const [catsLocal, setCatsLocal] = useState<Category[]>(categories || [])
  const [showAddCat, setShowAddCat] = useState(false)

  // TAGS
  const MAX_TAGS = 5
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])
  const [tagInput, setTagInput] = useState('')
  const [openSug, setOpenSug] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const sugRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { setCatsLocal(categories || []) }, [categories])

  // Catalogo tag
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from(TBL_TAGS).select('id,name').order('name')
      setAllTags(data || [])
    })()
  }, [])

  // Carica TAG del piatto in edit/view
  useEffect(() => {
    (async () => {
      if (!(mode === 'edit' || mode === 'view') || !id) return
      const { data: links } = await supabase
        .from(TBL_FINAL_TAGS)
        .select('tag_id, tags:tag_id ( id, name )')
        .eq('final_id', id)
      const tags = (links || [])
        .map((r: any) => r.tags)
        .filter(Boolean) as Tag[]
      setSelectedTags(tags.sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_TAGS))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, id])

  async function handleAddCategory() {
    if (viewMode) return
    setShowAddCat(true)
  }
  async function createCategory(name: string) {
    const { data, error } = await supabase
      .from(TBL_DISH_CATS)
      .insert({ name: name.trim() })
      .select()
      .single()
    if (error) { alert(error.message); return }
    const created = { id: data.id as number, name: data.name as string }
    setCatsLocal(prev => [...prev, created])
    setCategory(String(created.id))
    onCategoryCreated?.(created)
  }

  const filteredSuggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase()
    const pool = allTags.filter(t => !selectedTags.some(s => s.id === t.id))
    if (!q) return pool.slice(0, 10)
    return pool.filter(t => t.name.toLowerCase().includes(q)).slice(0, 10)
  }, [allTags, selectedTags, tagInput])

  function addTag(tag: Tag) {
    if (viewMode) return
    if (selectedTags.length >= MAX_TAGS) {
      alert(`Max ${MAX_TAGS} tags`)
      return
    }
    if (selectedTags.some(t => t.id === tag.id)) return
    setSelectedTags(prev => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)))
    setTagInput('')
    setHighlight(-1)
    setOpenSug(false)
    inputRef.current?.focus()
  }

  async function createOrSelectByName(nameRaw: string) {
    const value = nameRaw.trim()
    if (!value) return
    if (selectedTags.length >= MAX_TAGS) {
      alert(`Max ${MAX_TAGS} tags`)
      return
    }
    const existing = allTags.find(t => t.name.toLowerCase() === value.toLowerCase())
    if (existing) { addTag(existing); return }
    const { data, error } = await supabase.from(TBL_TAGS).insert({ name: value }).select('id,name').single()
    if (error || !data) { alert(error?.message || 'Tag create failed'); return }
    // aggiorna catalogo e aggiungi subito come chip
    setAllTags(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    addTag(data)
  }

  function removeTag(idNum: number) {
    if (viewMode) return
    setSelectedTags(prev => prev.filter(t => t.id !== idNum))
  }

  const [name, setName] = useState('')
  const [category, setCategory] = useState('') // id category as string
  const [type, setType] = useState<'food' | 'beverage' | ''>('') // required
  const [price, setPrice] = useState('') // required
  const [markup, setMarkup] = useState<string>('4')

  const [lines, setLines] = useState<IngredientLine[]>([
    { id: uid(), ref_type: null, ref_id: null, name: '', qty: '', uom: '', cost: '' },
  ])

  useEffect(() => {
    if (mode === 'edit' || mode === 'view') {
      const h = initialHeader || {}
      setName(h.name || '')
      setCategory(h.category_id ? String(h.category_id) : '')
      setType((h.type as any) || '')
      setPrice(h.price_vnd != null ? String(h.price_vnd) : '')
      if (initialLines && initialLines.length > 0) {
        setLines(initialLines)
      } else {
        setLines([{ id: uid(), ref_type: null, ref_id: null, name: '', qty: '', uom: '', cost: '' }])
      }
      setViewMode(mode === 'view')
    } else {
      setName('')
      setCategory('')
      setType('')
      setPrice('')
      setLines([{ id: uid(), ref_type: null, ref_id: null, name: '', qty: '', uom: '', cost: '' }])
      setSelectedTags([])
      setViewMode(false)
    }
  }, [mode, id, initialHeader, initialLines])

  const totalCost = useMemo(() => lines.reduce((s, l) => s + (Number(l.cost) || 0), 0), [lines])
  const priceNum = useMemo(() => Number(price || '0'), [price])
  const foodCostRatio = useMemo(() => (priceNum > 0 ? totalCost / priceNum : 0), [totalCost, priceNum])
  const suggestedPrice = useMemo(() => {
    const m = Number(markup || '4')
    if (!isFinite(m) || m <= 0) return 0
    return Math.round(totalCost * m)
  }, [totalCost, markup])

  // Required fields
  const nameOk = name.trim().length > 0
  const categoryOk = !!category
  const typeOk = type === 'food' || type === 'beverage'
  const priceOk = Number.isFinite(Number(price)) && Number(price) > 0
  const canSave = !viewMode && nameOk && categoryOk && typeOk && priceOk

  function guardAndExplain(): boolean {
    if (canSave) return true
    alert(t('PleaseFillRequired', language) || 'Please fill the required fields')
    return false
  }

  async function saveTagsForFinal(finalId: string) {
    const { data: existing } = await supabase
      .from(TBL_FINAL_TAGS)
      .select('tag_id')
      .eq('final_id', finalId)

    const existingIds = new Set<number>((existing || []).map((r: any) => r.tag_id as number))
    const desiredIds = new Set<number>(selectedTags.map(t => t.id))

    const toInsert = [...desiredIds].filter(id => !existingIds.has(id))
    const toDelete = [...existingIds].filter(id => !desiredIds.has(id))

    if (toInsert.length) {
      const payload = toInsert.map(tag_id => ({ final_id: finalId, tag_id }))
      const { error } = await supabase.from(TBL_FINAL_TAGS).insert(payload)
      if (error) throw new Error(error.message)
    }
    if (toDelete.length) {
      const { error } = await supabase
        .from(TBL_FINAL_TAGS)
        .delete()
        .eq('final_id', finalId)
        .in('tag_id', toDelete)
      if (error) throw new Error(error.message)
    }
  }

  async function save() {
    if (viewMode) return
    if (!guardAndExplain()) return

    const finalId = id as string | undefined

    if (finalId) {
      const { error } = await supabase
        .from(TBL_FINAL)
        .update({
          name: name.trim(),
          category_id: Number(category),
          type,
          price_vnd: Number(price),
        })
        .eq('id', finalId)
      if (error) { alert(`Save failed: ${error.message}`); return }

      await supabase.from(TBL_FINAL_ITEMS).delete().eq('final_id', finalId)
      const payload = lines.filter(l => l.name || l.ref_id).map(l => ({
        final_id: finalId,
        ref_type: l.ref_type,
        ref_id: l.ref_id,
        name: l.name,
        qty: l.qty === '' ? null : Number(l.qty),
        uom: l.uom || null,
        cost: l.cost === '' ? null : Number(l.cost),
      }))
      if (payload.length) {
        const { error: itemsErr } = await supabase.from(TBL_FINAL_ITEMS).insert(payload)
        if (itemsErr) { alert(`Save items failed: ${itemsErr.message}`); return }
      }

      try {
        await saveTagsForFinal(finalId)
        // PATCH: avvisa la Page di ricaricare la mappa tag senza refresh pagina
        window.dispatchEvent(new CustomEvent('final-tags-updated'))
      } catch (e: any) {
        alert(`Save tags failed: ${e.message}`)
        return
      }

      onSaved()
    } else {
      const { data, error } = await supabase
        .from(TBL_FINAL)
        .insert({
          name: name.trim(),
          category_id: Number(category),
          type,
          price_vnd: Number(price),
        })
        .select('id')
        .single()
      if (error || !data?.id) { alert(`Save failed: ${error?.message || 'missing id'}`); return }
      const newId = data.id as string

      const payload = lines.filter(l => l.name || l.ref_id).map(l => ({
        final_id: newId,
        ref_type: l.ref_type,
        ref_id: l.ref_id,
        name: l.name,
        qty: l.qty === '' ? null : Number(l.qty),
        uom: l.uom || null,
        cost: l.cost === '' ? null : Number(l.cost),
      }))
      if (payload.length) {
        const { error: itemsErr } = await supabase.from(TBL_FINAL_ITEMS).insert(payload)
        if (itemsErr) { alert(`Save items failed: ${itemsErr.message}`); return }
      }

      try {
        await saveTagsForFinal(newId)
        // PATCH: avvisa la Page di ricaricare la mappa tag anche in creazione
        window.dispatchEvent(new CustomEvent('final-tags-updated'))
      } catch (e: any) {
        alert(`Save tags failed: ${e.message}`)
        return
      }

      onSaved()
    }
  }

  async function handleDelete() {
    if (viewMode || !id) return
    const ok = window.confirm(t('DeleteDishConfirm', language))
    if (!ok) return
    const { error } = await supabase.from(TBL_FINAL).delete().eq('id', id)
    if (error) alert(`Delete failed: ${error.message}`)
    else onDeleted()
  }

  return (
    <Overlay onClose={onClose}>
      <div className="p-4 md:p-6 text-gray-900">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xl font-bold">
            {viewMode
              ? t('DishSheet', language)
              : id
              ? t('EditDishTitle', language)
              : t('NewDishTitle', language)}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label={t('Close', language)}>
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <SectionCard title={t('Header', language)}>
            <div className="grid grid-cols-2 gap-3">
              {/* Dish name */}
              <div className="col-span-2">
                <label className="text-sm text-gray-800">{t('DishName', language)}</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 disabled:bg-gray-50 h-10"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={viewMode}
                />
              </div>

              {/* Category */}
              <div>
                <label className="text-sm text-gray-800">{t('Category', language)}</label>
                <select
                  className={`mt-1 w-full border rounded-lg px-2 py-1 h-10 bg-white disabled:bg-gray-50 ${category ? 'text-gray-900' : 'text-gray-500'}`}
                  value={category}
                  onChange={async e => {
                    const v = e.target.value
                    if (v === '__add__') { await handleAddCategory(); return }
                    setCategory(v)
                  }}
                  disabled={viewMode}
                >
                  <option value="">{t('Select', language)}...</option>
                  {catsLocal.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                  <option value="__add__">➕ {t('AddCategory', language)}</option>
                </select>
              </div>

              {/* Type */}
              <div>
                <label className="text-sm text-gray-800">{t('Type', language)}</label>
                <div className="mt-1">
                  <TypeToggle
                    value={type}
                    onChange={v => setType(v)}
                    disabled={viewMode}
                    labels={{ food: t('Food', language), beverage: t('Drink', language) }}
                  />
                </div>
              </div>

              {/* Price */}
              <div className="col-span-2">
                <label className="text-sm text-gray-800">{t('Price', language)} ({currency})</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 disabled:bg-gray-50 h-10"
                  type="number"
                  step={1}
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  disabled={viewMode}
                />
              </div>
            </div>
          </SectionCard>

          {/* Pricing */}
          <SectionCard title={t('Pricing', language)}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600">{t('TotalCost', language)} ({currency})</label>
                <div className="h-10 rounded-lg border bg-gray-50 px-3 flex items-center justify-end select-none">
                  <span className="font-semibold tabular-nums">{fmtNum(totalCost)}</span>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-600">{t('FoodCostPct', language)}</label>
                <div className="h-10 rounded-lg border bg-gray-50 px-3 flex items-center justify-end select-none">
                  <span className="font-semibold tabular-nums">
                    {priceNum > 0 ? `${(foodCostRatio * 100).toFixed(1)}%` : ''}
                  </span>
                </div>
              </div>

              <div className="col-span-2 border-t border-gray-200 my-2" />

              <div>
                <label className="text-xs text-gray-600">{t('Markup', language)}</label>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={markup}
                  onChange={(e) => setMarkup(e.target.value)}
                  disabled={viewMode}
                  className="h-10 w-full border rounded-lg px-2 text-right text-gray-900 disabled:bg-gray-50"
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">{t('SuggestedPrice', language)} ({currency})</label>
                <div className="h-10 rounded-lg border bg-gray-50 px-3 flex items-center justify-end select-none">
                  <span className="font-semibold tabular-nums">{fmtNum(suggestedPrice)}</span>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ---------- TAGS: card compatta, Select Tags allineato al titolo ---------- */}
        <div className="mt-4">
          <SectionCard
            title={t('Tags', language)}
            actions={<div className="text-sm text-gray-700">{t('SelectTags', language) || 'Select Tags'}</div>}
          >
            {/* Riga unica, subito sotto al titolo: input (1/3) + chips, centrati verticalmente */}
            <div className="mt-1 flex items-center gap-3">
              {/* Input box 1/3 (Enter per aggiungere) */}
              <div className="relative w-1/3">
                <input
  ref={inputRef}
  className="w-full border rounded-lg px-2 h-10"
  placeholder={t('AddTag', language) || 'Add tag'}
  disabled={viewMode}
  value={tagInput}
  onChange={(e) => {
    setTagInput(e.target.value)
    setOpenSug(true)
    setHighlight(-1)
  }}
  onFocus={() => setOpenSug(true)}
  onKeyDown={async (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(h + 1, filteredSuggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlight >= 0 && filteredSuggestions[highlight]) {
        addTag(filteredSuggestions[highlight])
      } else {
        await createOrSelectByName(tagInput)
      }
    } else if (e.key === 'Escape') {
      setOpenSug(false)
    }
  }}
  onBlur={() => setTimeout(() => setOpenSug(false), 120)}
/>

{/* Suggerimenti: solo se c’è query e match */}
{openSug && tagInput.trim() !== '' && filteredSuggestions.length > 0 && selectedTags.length < MAX_TAGS && (
  <div
    ref={sugRef}
    className="absolute z-10 mt-1 w-full bg-white border rounded-xl shadow-lg max-h-56 overflow-auto"
  >
    {filteredSuggestions.map((s, idx) => (
      <button
        key={s.id}
        type="button"
        className={`w-full text-left px-3 py-2 hover:bg-blue-50 ${idx === highlight ? 'bg-blue-50' : ''}`}
        onMouseEnter={() => setHighlight(idx)}
        onMouseDown={(e) => { e.preventDefault(); addTag(s) }}
      >
        {s.name}
      </button>
    ))}
  </div>
)}

              </div>

              {/* Chips sulla stessa riga, centrati verticalmente */}
              <div className="flex items-center gap-2 flex-wrap">
                {selectedTags.length === 0 && (
                  <span className="text-gray-500 text-sm">{t('NoTags', language) || 'No Tags'}</span>
                )}
                {selectedTags.map(tag => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm"
                  >
                    {tag.name}
                    {!viewMode && (
                      <button
                        type="button"
                        className="hover:text-blue-900"
                        aria-label="Remove tag"
                        onClick={() => removeTag(tag.id)}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Ingredients */}
        <div className="mt-4">
          <SectionCard title={t('Ingredients', language)}>
            <IngredientsEditor
              lines={lines}
              setLines={setLines}
              showTotal
              matOptions={matOptions}
              prepOptions={prepOptions}
              readOnly={viewMode}
            />
          </SectionCard>
        </div>

        {showAddCat && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddCat(false)} />
            <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-lg font-semibold">{t('AddDishCategory', language)}</div>
                <button onClick={() => setShowAddCat(false)} className="p-1 rounded hover:bg-gray-100" aria-label={t('Close', language)}>
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>
              <input
                id="addCatInput"
                autoFocus
                className="w-full border rounded-lg px-2 py-1 text-gray-900 mb-4"
                placeholder={t('CategoryNamePlaceholder', language)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    const value = (e.target as HTMLInputElement).value.trim()
                    if (value) await createCategory(value)
                    setShowAddCat(false)
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAddCat(false)} className="px-3 py-1.5 rounded-lg border">{t('Cancel', language)}</button>
                <button
                  onClick={async () => {
                    const value = (document.querySelector<HTMLInputElement>('#addCatInput')?.value || '').trim()
                    if (value) await createCategory(value)
                    setShowAddCat(false)
                  }}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white"
                >
                  {t('AddCategory', language)}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {viewMode ? (
              <button
                onClick={() => setViewMode(false)}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 active:scale-95"
              >
                {t('Edit', language)}
              </button>
            ) : (
              id && (
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 rounded-lg border text-red-600 hover:bg-red-50"
                >
                  {t('Delete', language)}
                </button>
              )
            )}
          </div>

          <div>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border hover:opacity-80 active:scale-95"
            >
              {t('Close', language)}
            </button>
            {!viewMode && (
              <button
                onClick={save}
                disabled={!canSave}
                className="ml-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 active:scale-95 disabled:opacity-50"
              >
                {t('Save', language)}
              </button>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  )
}

/* =====================================================
   Main Page
===================================================== */

export default function Page() {
  const { language, currency } = useSettings()

  const [tab, setTab] = useState<'Dish' | 'Prep'>('Dish')

  const [prepCats, setPrepCats] = useState<Category[]>([])
  const [dishCats, setDishCats] = useState<Category[]>([])
  const [uoms, setUoms] = useState<Uom[]>([])
  const [preps, setPreps] = useState<PrepRow[]>([])
  const [finals, setFinals] = useState<FinalRow[]>([])

  // Mappa tags per final_id
  const [finalTagsMap, setFinalTagsMap] = useState<Record<string, string[]>>({})

  // Filtri Dishes
  const [filterFinalName, setFilterFinalName] = useState('')
  const [filterFinalCat, setFilterFinalCat] = useState('')
  const [filterFinalType, setFilterFinalType] = useState<'food' | 'beverage' | ''>('')

  // Filtri Preps
  const [filterPrepName, setFilterPrepName] = useState('')
  const [filterPrepCat, setFilterPrepCat] = useState('')
  const [filterPrepType, setFilterPrepType] = useState<'food' | 'beverage' | ''>('')

  const [sortColFinal, setSortColFinal] = useState<keyof FinalRow>('name')
  const [sortAscFinal, setSortAscFinal] = useState(true)
  const [sortColPrep, setSortColPrep] = useState<keyof PrepRow>('name')
  const [sortAscPrep, setSortAscPrep] = useState(true)

  const [openPrep, setOpenPrep] = useState(false)
  const [openFinal, setOpenFinal] = useState(false)
  const [prepMode, setPrepMode] = useState<'create' | 'edit' | 'view'>('create')
  const [finalMode, setFinalMode] = useState<'create' | 'edit' | 'view'>('create')
  const [editingPrepId, setEditingPrepId] = useState<string | undefined>(undefined)
  const [editingFinalId, setEditingFinalId] = useState<string | undefined>(undefined)

  const [matOptions, setMatOptions] = useState<MatOption[]>([])
  const [prepOptions, setPrepOptions] = useState<PrepOption[]>([])

  const [prepInitialHeader, setPrepInitialHeader] = useState<PrepHeaderDraft | null>(null)
  const [prepInitialLines, setPrepInitialLines] = useState<IngredientLine[] | null>(null)

  const [finalInitialHeader, setFinalInitialHeader] = useState<FinalHeaderDraft | null>(null)
  const [finalInitialLines, setFinalInitialLines] = useState<IngredientLine[] | null>(null)

  // Selezione a checkbox per liste
  const [showSelectDish, setShowSelectDish] = useState(false)
  const [showSelectPrep, setShowSelectPrep] = useState(false)
  const [selectedDishIds, setSelectedDishIds] = useState<Set<string>>(new Set())
  const [selectedPrepIds, setSelectedPrepIds] = useState<Set<string>>(new Set())

  // Kebab menu
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [menuOpen])

  useEffect(() => {
    (async () => {
      await fetchUoms()
      await Promise.all([fetchPrepCats(), fetchDishCats(), fetchPrepList(), fetchFinalList()])
      await fetchIngredientSources()
      await fetchFinalsTagsMap()
    })()
  }, [])

  // PATCH: ascolta l'evento emesso dal FinalEditor e aggiorna la mappa tag subito
  useEffect(() => {
    const handler = () => {
      fetchFinalsTagsMap()
    }
    window.addEventListener('final-tags-updated', handler)
    return () => window.removeEventListener('final-tags-updated', handler)
  }, [])

  async function fetchPrepCats() {
    const { data } = await supabase.from(TBL_CATS).select('*').order('name')
    if (data) setPrepCats(data)
  }
  async function fetchDishCats() {
    const { data } = await supabase.from(TBL_DISH_CATS).select('*').order('name')
    if (data) setDishCats(data)
  }

  async function fetchUoms() {
    const { data } = await supabase.from(TBL_UOM).select('id,name').order('name')
    if (data) setUoms(data)
  }
  async function fetchPrepList() {
    const { data } = await supabase.from(VW_PREP_LIST).select('*').order('last_update', { ascending: false })
    if (data) setPreps(data)
  }
  async function fetchFinalList() {
    const { data } = await supabase.from(VW_FINAL_LIST).select('*').order('last_update', { ascending: false })
    if (data) {
      setFinals(data)
    }
  }

  // FIX: funzione robusta, nessun uso di variabile 'map' e controllo tipo array
  async function fetchFinalsTagsMap() {
    const { data, error } = await supabase
      .from(TBL_FINAL_TAGS)
      .select('final_id, tags:tag_id ( name )')
    if (error) {
      console.error('tags map error', error)
      setFinalTagsMap({})
      return
    }
    const out: Record<string, string[]> = {}
    const rows: any[] = Array.isArray(data) ? data : []
    for (const row of rows) {
      const fid = String(row.final_id)
      const tagName = row?.tags?.name as string | undefined
      if (!tagName) continue
      if (!out[fid]) out[fid] = []
      out[fid].push(tagName)
    }
    Object.keys(out).forEach(k => out[k].sort((a, b) => a.localeCompare(b)))
    setFinalTagsMap(out)
  }

 async function fetchIngredientSources() {
  // UOM map
  try {
    const { data: uomsAll, error: uomsErr } = await supabase.from(TBL_UOM).select('id,name').order('name')
    if (uomsErr) {
      console.error('uom error', uomsErr)
    }
    const uomMap = new Map((uomsAll || []).map((u: any) => [String(u.id), u.name]))

    // 1) Probe minimal su materials per capire se è un problema di rete/RLS
    const probe = await supabase.from(TBL_MAT).select('id,name').limit(1)
    if (probe.error) {
      console.error('materials probe error', probe.error)
      setMatOptions([]) // non bloccare l’app
    } else {
      // 2) Fetch esteso ma con fallback colonne
      //   Se alcune colonne non esistono o non sono accessibili, rifacciamo una select ridotta
      let matsAll: any[] | null = null
      let matsErr: any = null

      const full = await supabase
        .from(TBL_MAT)
        .select('id,name,unit_cost,unit_cost_vat,vat_rate_percent,uom_id')
        .order('name')

      if (full.error) {
        console.warn('materials full select failed, retrying lean select', full.error)
        matsErr = full.error
        const lean = await supabase
          .from(TBL_MAT)
          .select('id,name,unit_cost,uom_id')
          .order('name')
        if (lean.error) {
          console.error('materials lean select error', lean.error)
          setMatOptions([])
        } else {
          matsAll = lean.data || []
        }
      } else {
        matsAll = full.data || []
      }

      if (matsAll) {
        const num = (v: any) => {
          const n = Number(v)
          return Number.isFinite(n) ? n : null
        }
        const options = matsAll.map((m: any) => {
          const netUnit = num(m.unit_cost)
          const vatPct = num((m as any).vat_rate_percent) ?? 0
          const grossUnit =
            netUnit != null
              ? Math.round(netUnit * (1 + vatPct / 100))
              : num((m as any).unit_cost_vat)
          return {
            id: String(m.id),
            label: m.name as string,
            unit_cost: grossUnit ?? netUnit ?? null,
            uom_name: String(uomMap.get(String(m.uom_id)) ?? ''),
          }
        })
        setMatOptions(options)
      }
    }

    // PREPARATIONS
    const { data: prepsAll, error: prepsErr } = await supabase
      .from(VW_PREP_LIST)
      .select('id,name,cost_unit_vnd,uom_name')
      .order('name')
    if (prepsErr) {
      console.error('preps error', prepsErr)
      setPrepOptions([])
    } else {
      setPrepOptions((prepsAll || []).map((p: any) => ({
        id: String(p.id),
        label: p.name,
        unit_cost: p.cost_unit_vnd ?? null,
        uom_name: String(p.uom_name ?? ''),
      })))
    }
  } catch (e) {
    // Catch generale per intercettare “TypeError: Failed to fetch”
    console.error('fetchIngredientSources fatal', e)
    setMatOptions([])
    setPrepOptions([])
  }
}


  function toggleSortFinal(col: keyof FinalRow) {
    if (sortColFinal === col) setSortAscFinal(!sortAscFinal)
    else { setSortColFinal(col); setSortAscFinal(true) }
  }
  function toggleSortPrep(col: keyof PrepRow) {
    if (sortColPrep === col) setSortAscPrep(!sortAscPrep)
    else { setSortColPrep(col); setSortAscPrep(true) }
  }

  function openCreateFinal() {
    setFinalMode('create'); setEditingFinalId(undefined)
    setFinalInitialHeader({ name: '', category_id: null, type: null, price_vnd: null })
    setFinalInitialLines([{ id: uid(), ref_type: null, ref_id: null, name: '', qty: '', uom: '', cost: '' }])
    setOpenFinal(true)
  }
  function openCreatePrep() {
    setPrepMode('create')
    setEditingPrepId(undefined)
    setPrepInitialHeader(null)
    setPrepInitialLines([{ id: uid(), ref_type: null, ref_id: null, name: '', qty: '', uom: '', cost: '' }])
    setOpenPrep(true)
  }

  async function openViewFinal(id: string) {
    setFinalMode('view'); setEditingFinalId(id)
    const [hdr, items] = await Promise.all([
      supabase.from(TBL_FINAL).select('id,name,category_id,type,price_vnd').eq('id', id).single(),
      supabase.from(TBL_FINAL_ITEMS).select('id, ref_type, ref_id, name, qty, uom, cost').eq('final_id', id)
    ])
    const headerDraft: FinalHeaderDraft = hdr && !hdr.error && hdr.data ? {
      name: hdr.data.name ?? '',
      category_id: hdr.data.category_id ?? null,
      type: (hdr.data.type as any) ?? null,
      price_vnd: hdr.data.price_vnd ?? null,
    } : {}
    const linesDraft: IngredientLine[] = items && !items.error && items.data && items.data.length
      ? items.data.map((r: any) => ({
          id: r.id || uid(),
          ref_type: r.ref_type,
          ref_id: r.ref_id,
          name: r.name ?? '',
          qty: r.qty ?? '',
          uom: r.uom ?? '',
          cost: r.cost ?? '',
        }))
      : [{ id: uid(), ref_type: null, ref_id: null, name: '', qty: '', uom: '', cost: '' }]
    setFinalInitialHeader(headerDraft)
    setFinalInitialLines(linesDraft)
    setOpenFinal(true)
  }

  async function openViewPrep(id: string) {
    setPrepMode('view')
    setEditingPrepId(id)

    const [hdr, items] = await Promise.all([
      supabase.from(TBL_PREP).select('id,name,category_id,type,yield_qty,waste_pct,uom_id,portion_size').eq('id', id).single(),
      supabase.from(TBL_PREP_ITEMS).select('id, ref_type, ref_id, name, qty, uom, cost').eq('prep_id', id)
    ])

    const headerDraft: PrepHeaderDraft = hdr && !hdr.error && hdr.data ? {
      name: hdr.data.name ?? '',
      category_id: hdr.data.category_id ?? null,
      type: (hdr.data.type as any) ?? null,
      yield_qty: hdr.data.yield_qty ?? null,
      waste_pct: hdr.data.waste_pct ?? 0,
      uom_id: hdr.data.uom_id ?? null,
      portion_size: hdr.data.portion_size ?? 1,
    } : {}

    const linesDraft: IngredientLine[] = items && !items.error && items.data && items.data.length
      ? items.data.map((r: any) => ({
          id: r.id || uid(),
          ref_type: r.ref_type,
          ref_id: r.ref_id,
          name: r.name ?? '',
          qty: r.qty ?? '',
          uom: r.uom ?? '',
          cost: r.cost ?? '',
        }))
      : [{ id: uid(), ref_type: null, ref_id: null, name: '', qty: '', uom: '', cost: '' }]

    setPrepInitialHeader(headerDraft)
    setPrepInitialLines(linesDraft)
    setOpenPrep(true)
  }

  async function openEditFinal(id: string) {
    setFinalMode('edit'); setEditingFinalId(id)
    const [hdr, items] = await Promise.all([
      supabase.from(TBL_FINAL).select('id,name,category_id,type,price_vnd').eq('id', id).single(),
      supabase.from(TBL_FINAL_ITEMS).select('id, ref_type, ref_id, name, qty, uom, cost').eq('final_id', id)
    ])
    const headerDraft: FinalHeaderDraft = hdr && !hdr.error && hdr.data ? {
      name: hdr.data.name ?? '',
      category_id: hdr.data.category_id ?? null,
      type: (hdr.data.type as any) ?? null,
      price_vnd: hdr.data.price_vnd ?? null,
    } : {}
    const linesDraft: IngredientLine[] = items && !items.error && items.data && items.data.length
      ? items.data.map((r: any) => ({
          id: r.id || uid(),
          ref_type: r.ref_type,
          ref_id: r.ref_id,
          name: r.name ?? '',
          qty: r.qty ?? '',
          uom: r.uom ?? '',
          cost: r.cost ?? '',
        }))
      : [{ id: uid(), ref_type: null, ref_id: null, name: '', qty: '', uom: '', cost: '' }]
    setFinalInitialHeader(headerDraft)
    setFinalInitialLines(linesDraft)
    setOpenFinal(true)
  }

  async function openEditPrep(id: string) {
    setPrepMode('edit')
    setEditingPrepId(id)

    const [hdr, items] = await Promise.all([
      supabase
        .from(TBL_PREP)
        .select('id,name,category_id,type,yield_qty,waste_pct,uom_id,portion_size')
        .eq('id', id)
        .single(),
      supabase
        .from(TBL_PREP_ITEMS)
        .select('id, ref_type, ref_id, name, qty, uom, cost')
        .eq('prep_id', id)
    ])

    const headerDraft: PrepHeaderDraft = hdr && !hdr.error && hdr.data ? {
      name: hdr.data.name ?? '',
      category_id: hdr.data.category_id ?? null,
      type: (hdr.data.type as any) ?? null,
      yield_qty: hdr.data.yield_qty ?? null,
      waste_pct: hdr.data.waste_pct ?? 0,
      uom_id: hdr.data.uom_id ?? null,
      portion_size: hdr.data.portion_size ?? 1,
    } : {}

    const linesDraft: IngredientLine[] = items && !items.error && items.data && items.data.length
      ? items.data.map((r: any) => ({
          id: r.id || uid(),
          ref_type: r.ref_type,
          ref_id: r.ref_id,
          name: r.name ?? '',
          qty: r.qty ?? '',
          uom: r.uom ?? '',
          cost: r.cost ?? '',
        }))
      : [{ id: uid(), ref_type: null, ref_id: null, name: '', qty: '', uom: '', cost: '' }]

    setPrepInitialHeader(headerDraft)
    setPrepInitialLines(linesDraft)

    setOpenPrep(true)
  }

  /* --------- VIEW LISTS with filters + sorting --------- */

  const viewFinals = useMemo(() => {
  const q = filterFinalName.toLowerCase().trim()
  const cat = filterFinalCat.toLowerCase().trim()
  const type = filterFinalType

  const f = finals.filter(r => {
    const tags = finalTagsMap[r.id] || []
    const matchNameOrTag = q
      ? r.name.toLowerCase().includes(q) || tags.some(tg => tg.toLowerCase().includes(q))
      : true

    const matchCat = cat ? (r.category ?? '').toLowerCase() === cat : true
    const matchType = type ? r.type === type : true

    return matchNameOrTag && matchCat && matchType
  })

  return [...f].sort((a, b) => {
    const av = String((a as any)[sortColFinal] ?? '')
    const bv = String((b as any)[sortColFinal] ?? '')
    return sortAscFinal
      ? av.localeCompare(bv, undefined, { numeric: true })
      : bv.localeCompare(av, undefined, { numeric: true })
  })
}, [finals, filterFinalName, filterFinalCat, filterFinalType, sortColFinal, sortAscFinal, finalTagsMap])


  const viewPreps = useMemo(() => {
    const name = filterPrepName.toLowerCase().trim()
    const cat = filterPrepCat.toLowerCase().trim()
    const type = filterPrepType

    const f = preps.filter(r => {
      const matchName = name ? r.name.toLowerCase().includes(name) : true
      const matchCat = cat ? (r.category ?? '').toLowerCase() === cat : true
      const matchType = type ? r.type === type : true
      return matchName && matchCat && matchType
    })

    return [...f].sort((a, b) => {
      const col = sortColPrep || 'name'
      const va = String((a as any)[col] ?? '')
      const vb = String((b as any)[col] ?? '')
      return sortAscPrep
        ? va.localeCompare(vb, undefined, { numeric: true })
        : vb.localeCompare(va, undefined, { numeric: true })
    })
  }, [preps, filterPrepName, filterPrepCat, filterPrepType, sortColPrep, sortAscPrep])

  function handlePrepCategoryCreated(c: Category) {
    setPrepCats(prev => (prev.some(x => x.id === c.id) ? prev : [...prev, c]))
  }
  function handleDishCategoryCreated(c: Category) {
    setDishCats(prev => (prev.some(x => x.id === c.id) ? prev : [...prev, c]))
  }

  /* --------- EXPORT HELPERS --------- */

  function parseDateOrEmpty(s: string | null) {
    if (!s) return null
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  }

  async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function exportDishes() {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Dishes')

    ws.columns = [
      { header: t('Name', language), width: 34 },
      { header: t('Category', language), width: 20 },
      { header: t('Type', language), width: 10 },
      { header: `${t('UnitCost', language)} (${currency})`, width: 16, style: { numFmt: '#,##0', alignment: { horizontal: 'right' } } },
      { header: `${t('Price', language)} (${currency})`, width: 14, style: { numFmt: '#,##0', alignment: { horizontal: 'right' } } },
      { header: t('FoodCostPct', language), width: 14, style: { numFmt: '0.0%', alignment: { horizontal: 'right' } } },
      { header: `${t('SuggestedPrice', language)} (${currency})`, width: 20, style: { numFmt: '#,##0', alignment: { horizontal: 'right' } } },
      { header: t('Updated', language), width: 14, style: { numFmt: 'dd/mm/yyyy', alignment: { horizontal: 'right' } } },
    ]

    ws.getRow(1).font = { bold: true }
    ws.getRow(1).alignment = { horizontal: 'center' }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
    ws.getRow(1).border = { bottom: { style: 'thin', color: { argb: 'FF93C5FD' } } }

    const rows = viewFinals.map(r => ([
      r.name,
      r.category ?? '',
      typeLabel(r.type, language),
      r.cost_unit_vnd ?? null,
      r.price_vnd ?? null,
      r.cost_ratio ?? null,
      r.suggested_price_vnd ?? null,
      parseDateOrEmpty(r.last_update),
    ]))
    rows.forEach(row => ws.addRow(row as any))

    ws.addTable({
      name: 'DishesTable',
      ref: 'A1',
      headerRow: true,
      totalsRow: false,
      style: { theme: 'TableStyleMedium2', showRowStripes: true },
      columns: ws.columns.map(c => ({ name: c.header as string })),
      rows,
    })

    
    const stamp = new Date()
    const y = stamp.getFullYear()
    const m = String(stamp.getMonth() + 1).padStart(2, '0')
    const d = String(stamp.getDate()).padStart(2, '0')
    await downloadWorkbook(wb, `Dishes_${y}${m}${d}.xlsx`)
  }

  async function exportPreps() {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Preps')

    ws.columns = [
      { header: t('Name', language), width: 34 },
      { header: t('Category', language), width: 20 },
      { header: t('Type', language), width: 10 },
      { header: t('YieldQty', language), width: 12, style: { numFmt: '#,##0', alignment: { horizontal: 'right' } } },
      { header: t('Uom', language), width: 10 },
      { header: t('WastePct', language), width: 12, style: { numFmt: '0.0%', alignment: { horizontal: 'right' } } },
      { header: `${t('UnitCost', language)} (${currency})`, width: 18, style: { numFmt: '#,##0', alignment: { horizontal: 'right' } } },
      { header: t('Updated', language), width: 14, style: { numFmt: 'dd/mm/yyyy', alignment: { horizontal: 'right' } } },
    ]

    ws.getRow(1).font = { bold: true }
    ws.getRow(1).alignment = { horizontal: 'center' }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
    ws.getRow(1).border = { bottom: { style: 'thin', color: { argb: 'FF93C5FD' } } }

    const rows = viewPreps.map(r => ([
      r.name,
      r.category ?? '',
      typeLabel(r.type, language),
      r.yield_qty ?? null,
      r.uom_name ?? '',
      r.waste_pct != null ? Number(r.waste_pct) / 100 : null,
      r.cost_unit_vnd ?? null,
      parseDateOrEmpty(r.last_update),
    ]))
    rows.forEach(row => ws.addRow(row as any))

    ws.addTable({
      name: 'PrepsTable',
      ref: 'A1',
      headerRow: true,
      totalsRow: false,
      style: { theme: 'TableStyleMedium2', showRowStripes: true },
      columns: ws.columns.map(c => ({ name: c.header as string })),
      rows,
    })

    const stamp = new Date()
    const y = stamp.getFullYear()
    const m = String(stamp.getMonth() + 1).padStart(2, '0')
    const d = String(stamp.getDate()).padStart(2, '0')
    await downloadWorkbook(wb, `Preps_${y}${m}${d}.xlsx`)
  }

  /* --------- BULK MENU ACTIONS --------- */
  function getActiveSelection() {
    if (tab === 'Dish') return Array.from(selectedDishIds)
    return Array.from(selectedPrepIds)
  }
  function ensureAnySelected(): string[] | null {
    const ids = getActiveSelection()
    if (!ids.length) {
      alert(t('NothingSelected', language))
      return null
    }
    return ids
  }
   async function actionMoveToTrash() {
    const ids = ensureAnySelected()
    if (!ids) return
    const ok = window.confirm(t('MoveToTrash', language))
    if (!ok) return
    const table = tab === 'Dish' ? TBL_FINAL : TBL_PREP
    const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).in('id', ids)
    if (error) { alert(error.message); return }
    // aggiorna liste locali
    if (tab === 'Dish') setFinals(prev => prev.filter(r => !ids.includes(r.id)))
    else setPreps(prev => prev.filter(r => !ids.includes(r.id)))
    setSelectedDishIds(new Set()); setSelectedPrepIds(new Set()); setMenuOpen(false)
  }

  async function actionArchive() {
    const ids = ensureAnySelected()
    if (!ids) return
    const table = tab === 'Dish' ? TBL_FINAL : TBL_PREP
    const { error } = await supabase.from(table).update({ archived_at: new Date().toISOString() }).in('id', ids)
    if (error) { alert(error.message); return }
    // rimuovi dalla lista “attiva” (le viste non mostrano archiviati)
    if (tab === 'Dish') setFinals(prev => prev.filter(r => !ids.includes(r.id)))
    else setPreps(prev => prev.filter(r => !ids.includes(r.id)))
    setSelectedDishIds(new Set()); setSelectedPrepIds(new Set()); setMenuOpen(false)
  }

  /* --------- SELECTION HELPERS --------- */
  function toggleSelectMode() {
    if (tab === 'Dish') {
      const next = !showSelectDish
      setShowSelectDish(next)
      if (!next) setSelectedDishIds(new Set())
    } else {
      const next = !showSelectPrep
      setShowSelectPrep(next)
      if (!next) setSelectedPrepIds(new Set())
    }
  }
  function isRowSelected(id: string) {
    return tab === 'Dish' ? selectedDishIds.has(id) : selectedPrepIds.has(id)
  }
  function setRowSelected(id: string, checked: boolean) {
    if (tab === 'Dish') {
      setSelectedDishIds(prev => {
        const s = new Set(prev)
        if (checked) s.add(id); else s.delete(id)
        return s
      })
    } else {
      setSelectedPrepIds(prev => {
        const s = new Set(prev)
        if (checked) s.add(id); else s.delete(id)
        return s
      })
    }
  }
  function toggleSelectAll(checked: boolean) {
    if (tab === 'Dish') {
      if (checked) setSelectedDishIds(new Set(viewFinals.map(r => r.id)))
      else setSelectedDishIds(new Set())
    } else {
      if (checked) setSelectedPrepIds(new Set(viewPreps.map(r => r.id)))
      else setSelectedPrepIds(new Set())
    }
  }
  const allChecked = useMemo(() => {
    if (tab === 'Dish') {
      return viewFinals.length > 0 && viewFinals.every(r => selectedDishIds.has(r.id))
    } else {
      return viewPreps.length > 0 && viewPreps.every(r => selectedPrepIds.has(r.id))
    }
  }, [tab, viewFinals, viewPreps, selectedDishIds, selectedPrepIds])

  // JSX
  return (
    <div className="max-w-7xl mx-auto p-4 text-gray-100">
      {/* Title row with kebab menu on the LEFT of the title */}
      <div className="flex items-center mb-4">
        {((tab === 'Dish' && showSelectDish) || (tab === 'Prep' && showSelectPrep)) && (
          <div className="relative mr-2" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="p-2 rounded-lg hover:bg-white/10 focus:outline-none"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={t('Actions', language)}
            >
              <EllipsisVerticalIcon className="w-6 h-6 text-white" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute left-0 mt-2 w-48 rounded-xl border bg-white text-gray-900 shadow-lg z-10"
              >
                <button
                  role="menuitem"
                  className="w-full text-left px-3 py-2 hover:bg-gray-50"
                  onClick={actionMoveToTrash}
                >
                  {t('MoveToTrash', language)}
                </button>
                <button
                  role="menuitem"
                  className="w-full text-left px-3 py-2 hover:bg-gray-50"
                  onClick={actionArchive}
                >
                  {t('Archive', language)}
                </button>
              </div>
            )}
          </div>
        )}

        <h1 className="text-2xl font-bold">{t('Recipes', language)}</h1>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-xl border overflow-hidden mb-4">
        <button
          aria-pressed={tab === 'Dish'}
          className={`px-4 py-2 font-medium transition ${tab === 'Dish' ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 hover:bg-blue-50'}`}
          onClick={() => setTab('Dish')}
        >
          {t('Dish', language)}
        </button>
        <button
          aria-pressed={tab === 'Prep'}
          className={`px-4 py-2 font-medium transition ${tab === 'Prep' ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 hover:bg-blue-50'}`}
          onClick={() => setTab('Prep')}
        >
          {t('Prep', language)}
        </button>
      </div>

      {/* Dish list */}
      {tab === 'Dish' && (
        <div className="bg-white rounded-2xl shadow p-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 flex-1">
              <input
                value={filterFinalName}
                onChange={e => setFilterFinalName(e.target.value)}
                placeholder={`${t('FilterByName', language)} / tag`}
                className="border rounded-lg px-2 py-1 h-10 text-gray-900 placeholder-gray-600"
              />

              <select
                value={filterFinalCat}
                onChange={e => setFilterFinalCat(e.target.value)}
                className="border rounded-lg px-2 py-1 h-10 bg-white text-gray-900"
              >
                <option value="">{t('AllCategories', language)}</option>
                {dishCats.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <select
                value={filterFinalType}
                onChange={e => setFilterFinalType(e.target.value as any)}
                className="border rounded-lg px-2 py-1 h-10 bg-white text-gray-900"
              >
                <option value="">{t('AllTypes', language)}</option>
                <option value="food">{t('Food', language)}</option>
                <option value="beverage">{t('Drink', language)}</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={exportDishes}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-blue-700 hover:bg-blue-50"
                title={t('ExportDishesTitle', language)}
              >
                <ArrowDownTrayIcon className="w-5 h-5" />
                {t('Export', language)}
              </button>
              <button
                onClick={toggleSelectMode}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border ${
                showSelectDish
                ? 'border-blue-600 text-blue-700 bg-blue-100'
                : 'text-blue-700 hover:bg-blue-50 border-gray-300'
                }`}
                title={t('EnableSelectionTitle', language)}
              >
                <CheckCircleIcon className="w-5 h-5" />
                <span>{showSelectDish ? t('Selecting', language) : t('Select', language)}</span>
              </button>

              <button
                onClick={openCreateFinal}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white"
              >
                <PlusIcon className="w-5 h-5" />
                {t('NewDish', language)}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed text-sm text-gray-900">
              <colgroup>
                {showSelectDish && <col className="w-[3rem]" />}
                {[
                  <col key="d-name" className="w-[18rem]" />,
                  <col key="d-cat" className="w-[12rem]" />,
                  <col key="d-type" className="w-[7rem]" />,
                  <col key="d-uc" className="w-[9rem]" />,
                  <col key="d-price" className="w-[9rem]" />,
                  <col key="d-fc" className="w-[9rem]" />,
                  <col key="d-sug" className="w-[11rem]" />,
                  <col key="d-upd" className="w-[12rem]" />,
                ]}
              </colgroup>

              <thead>
                <tr className="bg-blue-50 text-gray-800">
                  {showSelectDish && (
                    <th className="p-2">
                      <input
                        type="checkbox"
                        aria-label={t('SelectAllDishesAria', language)}
                        className="w-4 h-4"
                        checked={allChecked}
                        onChange={e => toggleSelectAll(e.target.checked)}
                      />
                    </th>
                  )}
                  <th className="p-2">
                    <button type="button" onClick={() => toggleSortFinal('name')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-start font-semibold">
                        <span>{t('Name', language)}</span>
                        <SortIcon active={sortColFinal === 'name'} asc={sortAscFinal} />
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleSortFinal('category')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-start font-semibold">
                        <span>{t('Category', language)}</span>
                        <SortIcon active={sortColFinal === 'category'} asc={sortAscFinal} />
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleSortFinal('type')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-start font-semibold">
                        <span>{t('Type', language)}</span>
                        <SortIcon active={sortColFinal === 'type'} asc={sortAscFinal} />
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleSortFinal('cost_unit_vnd')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-end font-semibold">
                        <SortIcon active={sortColFinal === 'cost_unit_vnd'} asc={sortAscFinal} />
                        <span className="block text-right leading-tight">
                          {t('UnitCost', language)}<br />({currency})
                        </span>
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleSortFinal('price_vnd')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-end font-semibold">
                        <SortIcon active={sortColFinal === 'price_vnd'} asc={sortAscFinal} />
                        <span>{t('Price', language)} ({currency})</span>
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleSortFinal('cost_ratio')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-end font-semibold">
                        <SortIcon active={sortColFinal === 'cost_ratio'} asc={sortAscFinal} />
                        <span>{t('FoodCostPct', language)}</span>
                      </div>
                    </button>
                  </th>
                  <th className="p-2 hidden md:table-cell">
                    <button type="button" onClick={() => toggleSortFinal('suggested_price_vnd')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-end font-semibold">
                        <SortIcon active={sortColFinal === 'suggested_price_vnd'} asc={sortAscFinal} />
                        <span className="block text-right leading-tight">
                          {t('SuggestedPrice', language)}<br />({currency})
                        </span>
                      </div>
                    </button>
                  </th>
                  <th className="p-2 hidden md:table-cell">
                    <button type="button" onClick={() => toggleSortFinal('last_update')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-end font-semibold">
                        <SortIcon active={sortColFinal === 'last_update'} asc={sortAscFinal} />
                        <span>{t('UpdatedShort', language)}</span>
                      </div>
                    </button>
                  </th>
                </tr>
              </thead>

              <tbody>
                {viewFinals.map(r => {
                  const checked = selectedDishIds.has(r.id)
                  return (
                    <tr
                      key={r.id}
                      className={`border-t ${showSelectDish ? '' : 'hover:bg-blue-50/40 cursor-pointer'}`}
                      onClick={() => { if (!showSelectDish) openViewFinal(r.id) }}
                    >
                      {showSelectDish && (
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4"
                            checked={checked}
                            onChange={e => setRowSelected(r.id, e.target.checked)}
                          />
                        </td>
                      )}
                      <td className="p-2 truncate">
                        <span className="inline-block max-w-[17rem] truncate">{r.name}</span>
                      </td>
                      <td className="p-2 truncate">
                        <span className="inline-block max-w-[11rem] truncate">{r.category ?? ''}</span>
                      </td>
                      <td className="p-2">{typeLabel(r.type, language)}</td>
                      <td className="p-2 text-right tabular-nums whitespace-nowrap">{fmtNum(r.cost_unit_vnd)}</td>
                      <td className="p-2 text-right tabular-nums whitespace-nowrap">{fmtNum(r.price_vnd)}</td>
                      <td className="p-2 text-right tabular-nums whitespace-nowrap">
                        {r.cost_ratio == null ? '' : `${(Number(r.cost_ratio) * 100).toFixed(1)}%`}
                      </td>
                      <td className="p-2 text-right tabular-nums whitespace-nowrap hidden md:table-cell">
                        {fmtNum(r.suggested_price_vnd ?? null)}
                      </td>
                      <td className="p-2 text-right tabular-nums whitespace-nowrap hidden md:table-cell">
                        {fmtDate(r.last_update)}
                      </td>
                    </tr>
                  )
                })}

                {viewFinals.length === 0 && (
                  <tr><td className="p-3 text-gray-500" colSpan={showSelectDish ? 9 : 8}>{t('NoDishes', language)}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Prep list */}
      {tab === 'Prep' && (
        <div className="bg-white rounded-2xl shadow p-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 flex-1">
              <input
                value={filterPrepName}
                onChange={e => setFilterPrepName(e.target.value)}
                placeholder={t('FilterByName', language)}
                className="border rounded-lg px-2 py-1 h-10 text-gray-900 placeholder-gray-600"
              />
              <select
                value={filterPrepCat}
                onChange={e => setFilterPrepCat(e.target.value)}
                className="border rounded-lg px-2 py-1 h-10 bg-white text-gray-900"
              >
                <option value="">{t('AllCategories', language)}</option>
                {prepCats.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <select
                value={filterPrepType}
                onChange={e => setFilterPrepType(e.target.value as any)}
                className="border rounded-lg px-2 py-1 h-10 bg-white text-gray-900"
              >
                <option value="">{t('AllTypes', language)}</option>
                <option value="food">{t('Food', language)}</option>
                <option value="beverage">{t('Drink', language)}</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={exportPreps}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-blue-700 hover:bg-blue-50"
                title={t('ExportPrepsTitle', language)}
              >
                <ArrowDownTrayIcon className="w-5 h-5" />
                {t('Export', language)}
              </button>
              <button
  onClick={toggleSelectMode}
  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border ${
    showSelectPrep
      ? 'border-blue-600 text-blue-700 bg-blue-100'
      : 'text-blue-700 hover:bg-blue-50 border-gray-300'
  }`}
  title={t('EnableSelectionTitle', language)}
>
  <CheckCircleIcon className="w-5 h-5" />
  <span>{showSelectPrep ? t('Selecting', language) : t('Select', language)}</span>
</button>

              <button
                onClick={openCreatePrep}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white"
              >
                <PlusIcon className="w-5 h-5" />
                {t('NewPrep', language)}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed text-sm text-gray-900">
              <colgroup>
                {showSelectPrep && <col className="w-[3rem]" />}
                {[
                  <col key="p-name" className="w-[18rem]" />,
                  <col key="p-cat" className="w-[12rem]" />,
                  <col key="p-type" className="w-[7rem]" />,
                  <col key="p-yq" className="w-[8rem]" />,
                  <col key="p-uom" className="w-[7rem]" />,
                  <col key="p-wst" className="w-[8rem]" />,
                  <col key="p-uc" className="w-[10rem]" />,
                  <col key="p-upd" className="w-[12rem]" />,
                ]}
              </colgroup>

              <thead>
                <tr className="bg-blue-50 text-gray-800">
                  {showSelectPrep && (
                    <th className="p-2">
                      <input
                        type="checkbox"
                        aria-label={t('SelectAllPrepsAria', language)}
                        className="w-4 h-4"
                        checked={allChecked}
                        onChange={e => toggleSelectAll(e.target.checked)}
                      />
                    </th>
                  )}
                  <th className="p-2">
                    <button type="button" onClick={() => toggleSortPrep('name')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-start font-semibold">
                        <span>{t('Name', language)}</span>
                        <SortIcon active={sortColPrep === 'name'} asc={sortAscPrep} />
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleSortPrep('category')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-start font-semibold">
                        <span>{t('Category', language)}</span>
                        <SortIcon active={sortColPrep === 'category'} asc={sortAscPrep} />
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleSortPrep('type')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-start font-semibold">
                        <span>{t('Type', language)}</span>
                        <SortIcon active={sortColPrep === 'type'} asc={sortAscPrep} />
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleSortPrep('yield_qty')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-end font-semibold">
                        <SortIcon active={sortColPrep === 'yield_qty'} asc={sortAscPrep} />
                        <span>{t('YieldQty', language)}</span>
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <div className="flex items-center gap-1 justify-start font-semibold">
                      <span>{t('Uom', language)}</span>
                    </div>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleSortPrep('waste_pct')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-end font-semibold">
                        <SortIcon active={sortColPrep === 'waste_pct'} asc={sortAscPrep} />
                        <span>{t('WastePct', language)}</span>
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleSortPrep('cost_unit_vnd')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-end font-semibold">
                        <SortIcon active={sortColPrep === 'cost_unit_vnd'} asc={sortAscPrep} />
                        <span>{t('UnitCost', language)} ({currency})</span>
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleSortPrep('last_update')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-end font-semibold">
                        <SortIcon active={sortColPrep === 'last_update'} asc={sortAscPrep} />
                        <span>{t('UpdatedShort', language)}</span>
                      </div>
                    </button>
                  </th>
                </tr>
              </thead>

              <tbody>
                {viewPreps.map(r => {
                  const checked = selectedPrepIds.has(r.id)
                  return (
                    <tr
                      key={r.id}
                      className={`border-t ${showSelectPrep ? '' : 'hover:bg-blue-50/40 cursor-pointer'}`}
                      onClick={() => { if (!showSelectPrep) openViewPrep(r.id) }}
                    >
                      {showSelectPrep && (
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4"
                            checked={checked}
                            onChange={e => setRowSelected(r.id, e.target.checked)}
                          />
                        </td>
                      )}
                      <td className="p-2 truncate">
                        <span className="inline-block max-w-[17rem] truncate">{r.name}</span>
                      </td>
                      <td className="p-2 truncate">
                        <span className="inline-block max-w-[11rem] truncate">{r.category ?? ''}</span>
                      </td>
                      <td className="p-2">{typeLabel(r.type, language)}</td>
                      <td className="p-2 text-right tabular-nums whitespace-nowrap">{fmtInt(r.yield_qty)}</td>
                      <td className="p-2">{r.uom_name ?? ''}</td>
                      <td className="p-2 text-right tabular-nums whitespace-nowrap">{pct(r.waste_pct)}</td>
                      <td className="p-2 text-right tabular-nums whitespace-nowrap">{fmtNum(r.cost_unit_vnd)}</td>
                      <td className="p-2 text-right tabular-nums whitespace-nowrap hidden md:table-cell">{fmtDate(r.last_update)}</td>
                    </tr>
                  )
                })}

                {viewPreps.length === 0 && (
                  <tr><td className="p-3 text-gray-500" colSpan={showSelectPrep ? 9 : 8}>{t('NoPreps', language)}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Editors */}
      {openFinal && (
        <FinalEditor
          mode={finalMode}
          id={editingFinalId}
          categories={dishCats}
          matOptions={matOptions}
          prepOptions={prepOptions}
          onClose={() => setOpenFinal(false)}
          onSaved={async () => { setOpenFinal(false); await fetchFinalList() }}
          onDeleted={async () => { setOpenFinal(false); await fetchFinalList() }}
          initialHeader={finalInitialHeader}
          initialLines={finalInitialLines}
          onCategoryCreated={handleDishCategoryCreated}
        />
      )}

      {openPrep && (
        <PrepEditor
          mode={prepMode}
          id={editingPrepId}
          categories={prepCats}
          matOptions={matOptions}
          prepOptions={prepOptions}
          uoms={uoms}
          onClose={() => setOpenPrep(false)}
          onSaved={async () => { setOpenPrep(false); await fetchPrepList(); await fetchIngredientSources() }}
          onDeleted={async () => { setOpenPrep(false); await fetchPrepList() }}
          initialHeader={prepInitialHeader}
          initialLines={prepInitialLines}
          onCategoryCreated={handlePrepCategoryCreated}
        />
      )}
    </div>
  )
}
