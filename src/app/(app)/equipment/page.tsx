// src/app/equipment/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
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
} from '@heroicons/react/24/outline'
import Papa from 'papaparse'
import ExcelJS from 'exceljs'

// i18n + settings
import { t } from '@/lib/i18n'
import { useSettings } from '@/contexts/SettingsContext'

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
  /** VAT per-item (percent, es. 10 = 10%). Se null, usa default globale */
  vat_rate_percent: number | null
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

  // Con 0 o meno: tutto ciò che è nel passato è "vecchio"
  if (m <= 0) {
    return d.getTime() < Date.now() - 1000 // 1s di tolleranza
  }

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
   Bulk VAT Modal (uguale a Materials)
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
}
function EquipmentEditor(props: EditorProps) {
  const { language: lang, vatEnabled, vatRate } = useSettings()

  const {
    mode, id, cats, sups, onClose, onSaved, onDeleted, initial, onCategoryCreated, onSupplierCreated
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

  // NEW: modal add entity
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

      // NEW: stima markup partendo da final_price salvato
      const c = Number(h.cost ?? 0)
      const fp = Number(h.final_price ?? 0)
      if (isFinite(c) && c > 0 && isFinite(fp) && fp > 0) {
        const pct = vatEnabled ? ((h.vat_rate_percent ?? vatRate ?? 0) / 100) : 0
        const base = c * (1 + pct)
        const m = base > 0 ? fp / base : 1.5
        setMarkupStr(String(Number.isFinite(m) ? Number(m.toFixed(3)) : 1.5))
      } else {
        setMarkupStr('1.5')
      }
    } else {
      setName(''); setCategoryId(''); setSupplierId(''); setCost(''); setNotes(''); setVatRatePct(''); setViewMode(false)
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

  const canSave = !viewMode && name.trim().length > 0 && categoryId && supplierId

  async function save() {
    if (viewMode) return
    const cNum = cost ? Number(cost) : null
    const pctVal = vatEnabled
      ? (vatRatePct.trim() === '' ? (vatRate ?? 0) : Math.max(0, Math.min(100, Number(vatRatePct))))
      : 0
    const base = cNum != null ? (vatEnabled ? cNum * (1 + (pctVal as number) / 100) : cNum) : null
    const fp = base != null ? base * (markupNum || 0) : null

    const payload: any = {
      name: name.trim(),
      category_id: categoryId ? Number(categoryId) : null,
      supplier_id: supplierId || null,
      cost: cNum,
      final_price: fp, // NEW: coerente con markup+VAT
      notes: notes || null,
      last_update: new Date().toISOString(),
      vat_rate_percent: vatEnabled
        ? (vatRatePct.trim() === '' ? null : Math.max(0, Math.min(100, Number(vatRatePct))))
        : null,
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

              {/* VAT Rate per-item (visibile solo se VAT globale abilitato) */}
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

              {/* NEW: Markup */}
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
              <button onClick={() => setViewMode(false)} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 active:scale-95">{t('Edit', lang)}</button>
            ) : (
              id && <button onClick={handleDelete} className="px-4 py-2 rounded-lg border text-red-600 hover:bg-red-50">{t('Delete', lang)}</button>
            )}
          </div>
          <div>
            <button onClick={onClose} className="px-4 py-2 rounded-lg border hover:opacity-80 active:scale-95">{t('Close', lang)}</button>
            {!viewMode && (
              <button onClick={save} disabled={!canSave} className="ml-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 active:scale-95 disabled:opacity-50">{t('Save', lang)}</button>
            )}
          </div>
        </div>
      </div>

      {/* NEW: AddEntityModal for Category/Supplier */}
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
   Resolve Import Modal — Equipment (stile Materials)
===================================================== */
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
type UnifiedChoice = {
  categoryByKey: Record<string, number | string | null | undefined>
  supplierByKey: Record<string, string | null | undefined>
}

function ResolveImportModal(props: {
  pending: {
    conflicts: ConflictItem[]
    rows: CsvRow[]
    newValues: { categories: string[]; suppliers: string[] }
  }
  cats: Cat[]
  sups: Sup[]
  onConfirm: (choice: UnifiedChoice) => void
  onCancel: () => void
}) {
  const { language: lang } = useSettings()
  const { pending, cats, sups, onConfirm, onCancel } = props

  const [catByKey, setCatByKey] = useState<Record<string, number | string | null | undefined>>({})
  const [supByKey, setSupByKey] = useState<Record<string, string | null | undefined>>({})

  const catExists = (n?: string | null) =>
    !!n && cats.some(c => c.name.toLowerCase() === String(n).toLowerCase())
  const supExists = (n?: string | null) =>
    !!n && sups.some(s => s.name.toLowerCase() === String(n).toLowerCase())

  useEffect(() => {
    // blocca scroll sotto al modal
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    const initCats: Record<string, number | string | null | undefined> = {}
    const initSups: Record<string, string | null | undefined> = {}

    // Precompila conflitti con i valori correnti (come Materials)
    for (const it of pending.conflicts) {
      if (it.categoryChanged) initCats[it.key] = it.currentCategoryId ?? null
      if (it.supplierChanged) initSups[it.key] = it.currentSupplierId ?? null
    }

    // Nuovi valori globali: default = CREA
    for (const n of pending.newValues.categories || []) {
      const name = String(n).trim()
      if (name) initCats[`__global__:cat:${name}`] = labelCreate(name)
    }
    for (const n of pending.newValues.suppliers || []) {
      const name = String(n).trim()
      if (name) initSups[`__global__:sup:${name}`] = labelCreate(name)
    }

    setCatByKey(initCats)
    setSupByKey(initSups)

    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [pending, onCancel])

  const hasConflicts = pending.conflicts.length > 0
  const hasNewCats = (pending.newValues.categories || []).length > 0
  const hasNewSups = (pending.newValues.suppliers || []).length > 0

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-3 md:p-6" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl max-h-[90vh] text-gray-900 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white rounded-t-2xl border-b px-5 py-4 flex items-center justify-between">
          <h2 className="text-xl md:text-2xl font-bold text-blue-800">{t('ResolveImport', lang)}</h2>
          <button onClick={onCancel} className="p-1 rounded hover:bg-gray-100" aria-label={t('Close', lang)}>
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-6 overflow-y-auto flex-1 min-h-0 max-h-[calc(90vh-120px)]">
          {!hasConflicts && !hasNewCats && !hasNewSups && (
            <div className="text-sm text-gray-600">
              {t('NothingToResolve', lang) || 'Nothing to resolve.'}
            </div>
          )}

          {/* Conflitti su record esistenti */}
          {hasConflicts && (
            <section>
              <h3 className="text-lg font-semibold mb-3">{t('ConflictsExisting', lang)}</h3>
              <div className="space-y-4">
                {pending.conflicts.map(it => (
                  <div key={it.key} className="border rounded-2xl p-4 bg-white shadow-sm">
                    <div className="font-medium mb-3 text-gray-900">
                      {it.name}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Categoria */}
                      {it.categoryChanged && (
                        <label className="flex flex-col gap-1">
                          <span className="text-sm text-gray-700">{t('Category', lang)}</span>
                          <select
                            className="h-10 px-2 border rounded-lg text-gray-900 bg-white"
                            value={typeof catByKey[it.key] === 'undefined' ? '' : String(catByKey[it.key] ?? '')}
                            onChange={e => setCatByKey(s => ({ ...s, [it.key]: e.target.value === '' ? null : e.target.value }))}
                          >
                            {(() => {
                              const v = catByKey[it.key]
                              const isCreate = typeof v === 'string' && String(v).startsWith('__create__:')
                              const createName = isCreate ? String(v).split(':', 2)[1] : ''
                              return (
                                <>
                                  <option value="">{t('KeepEmpty', lang)}</option>
                                  {isCreate && (
                                    <option value={String(v)}>
                                      + {t('AddCategory', lang)} “{createName}”
                                    </option>
                                  )}
                                  {cats.map(c => (
                                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                                  ))}
                                </>
                              )
                            })()}
                          </select>

                          <div className="text-xs text-gray-600 flex items-center gap-2">
                            <span>
                              {t('CSV', lang)}: <span className="font-mono">{it.csvCategoryName || 'n/a'}</span>
                            </span>
                            {it.csvCategoryName && !catExists(it.csvCategoryName) && (
                              <button
                                type="button"
                                className="text-blue-700 hover:underline"
                                onClick={() =>
                                  setCatByKey(s => ({
                                    ...s,
                                    [it.key]: labelCreate(it.csvCategoryName as string),
                                  }))
                                }
                                title={t('AddCategory', lang)}
                              >
                                + {t('AddCategory', lang)}
                              </button>
                            )}
                          </div>
                        </label>
                      )}

                      {/* Fornitore */}
                      {it.supplierChanged && (
                        <label className="flex flex-col gap-1">
                          <span className="text-sm text-gray-700">{t('Supplier', lang)}</span>
                          <select
                            className="h-10 px-2 border rounded-lg text-gray-900 bg-white"
                            value={typeof supByKey[it.key] === 'undefined' ? '' : String(supByKey[it.key] ?? '')}
                            onChange={e => setSupByKey(s => ({ ...s, [it.key]: e.target.value === '' ? null : e.target.value }))}
                          >
                            {(() => {
                              const v = supByKey[it.key]
                              const isCreate = typeof v === 'string' && String(v).startsWith('__create__:')
                              const createName = isCreate ? String(v).split(':', 2)[1] : ''
                              return (
                                <>
                                  <option value="">{t('KeepEmpty', lang)}</option>
                                  {isCreate && (
                                    <option value={String(v)}>
                                      + {t('AddSupplier', lang)} “{createName}”
                                    </option>
                                  )}
                                  {sups.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </>
                              )
                            })()}
                          </select>

                          <div className="text-xs text-gray-600 flex items-center gap-2">
                            <span>
                              {t('CSV', lang)}: <span className="font-mono">{it.csvSupplierName || 'n/a'}</span>
                            </span>
                            {it.csvSupplierName && !supExists(it.csvSupplierName) && (
                              <button
                                type="button"
                                className="text-blue-700 hover:underline"
                                onClick={() =>
                                  setSupByKey(s => ({
                                    ...s,
                                    [it.key]: labelCreate(it.csvSupplierName as string),
                                  }))
                                }
                                title={t('AddSupplier', lang)}
                              >
                                + {t('AddSupplier', lang)}
                              </button>
                            )}
                          </div>
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Nuove categorie dal CSV */}
          {hasNewCats && (
            <section>
              <h3 className="text-lg font-semibold mb-3">
                {t('NewCategoriesFromCsv', lang) || 'New categories in CSV'}
              </h3>
              <div className="space-y-3">
                {pending.newValues.categories.map(n => {
                  const key = `__global__:cat:${n}`
                  const val = catByKey[key]
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="text-sm font-medium">{n}</div>
                        <div className="text-xs text-gray-500">
                          {t('ChooseCreateOrMap', lang) || 'Choose to create it or map to an existing category'}
                        </div>
                      </div>
                      <select
                        className="h-10 px-2 border rounded-lg text-gray-900 bg-white"
                        value={typeof val === 'undefined' ? labelCreate(n) : String(val ?? '')}
                        onChange={e => setCatByKey(s => ({ ...s, [key]: e.target.value }))}
                      >
                        <option value={labelCreate(n)}>+ {t('AddCategory', lang)} “{n}”</option>
                        {cats.map(c => (
                          <option key={c.id} value={String(c.id)}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Nuovi fornitori dal CSV */}
          {hasNewSups && (
            <section>
              <h3 className="text-lg font-semibold mb-3">
                {t('NewSuppliersFromCsv', lang) || 'New suppliers in CSV'}
              </h3>
              <div className="space-y-3">
                {pending.newValues.suppliers.map(n => {
                  const key = `__global__:sup:${n}`
                  const val = supByKey[key]
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="text-sm font-medium">{n}</div>
                        <div className="text-xs text-gray-500">
                          {t('ChooseCreateOrMap', lang) || 'Choose to create it or map to an existing supplier'}
                        </div>
                      </div>
                      <select
                        className="h-10 px-2 border rounded-lg text-gray-900 bg-white"
                        value={typeof val === 'undefined' ? labelCreate(n) : String(val ?? '')}
                        onChange={e => setSupByKey(s => ({ ...s, [key]: e.target.value }))}
                      >
                        <option value={labelCreate(n)}>+ {t('AddSupplier', lang)} “{n}”</option>
                        {sups.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white rounded-b-2xl border-t px-5 py-4 flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border">{t('Cancel', lang)}</button>
          <button
            onClick={() => onConfirm({
              categoryByKey: catByKey,
              supplierByKey: supByKey,
            })}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white"
          >
            {t('Continue', lang)}
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
  // 🔧 usa il valore della card Equipment
  const { language, currency, vatEnabled, vatRate, equipmentReviewMonths, equipmentCsvConfirm, askCsvConfirm } = useSettings()
  const locale = language === 'vi' ? 'vi-VN' : 'en-US'

  // Normalizza equipmentReviewMonths (fallback 4, supporto 0)
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

  const [filters, setFilters] = useState({
    name: '',
    categoryId: '' as string | number | '',
    supplierId: '' as string | '',
  })

  // Import / export
  const fileRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)

  // Editor
  const [openEditor, setOpenEditor] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | 'view'>('create')
  const [editingId, setEditingId] = useState<string | undefined>(undefined)
  const [initialItem, setInitialItem] = useState<Partial<Equip> | null>(null)

  // Selection
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const selectedIds = useMemo(() => Object.keys(selected).filter(id => selected[id]), [selected])
  const headerCbRef = useRef<HTMLInputElement>(null)
  const [selectMode, setSelectMode] = useState(false)

  // Kebab menu
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

  // Bulk VAT modal
  const [showVatModal, setShowVatModal] = useState(false)

  // ====== Resolve Import Modal state ======
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
    // include vat_rate_percent
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

  // ==== Helpers VAT ====
  function effVatPct(e: Equip) {
    if (!vatEnabled) return 0
    const r = (e.vat_rate_percent ?? vatRate ?? 0)
    return Math.max(0, Math.min(100, Number(r)))
  }
  function vatAmount(e: Equip) {
    const c = e.cost ?? 0
    return c * (effVatPct(e) / 100)
  }
  const markup = 1.5
  function finalCalc(e: Equip) {
    // NEW: preferisci il final_price salvato (riflette il markup scelto nell’editor)
    if (e.final_price != null) return e.final_price
    const c = e.cost ?? 0
    const base = vatEnabled ? c + vatAmount(e) : c
    return base * markup
  }

  function applyFilters(list: Equip[]) {
    let r = [...list]
    if (filters.name.trim()) r = r.filter(x => x.name.toLowerCase().includes(filters.name.trim().toLowerCase()))
    if (filters.categoryId !== '') r = r.filter(x => x.category_id === Number(filters.categoryId))
    if (filters.supplierId !== '') r = r.filter(x => x.supplier_id === String(filters.supplierId))

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
      let cmp: number
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
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
    // English
    'equipment': 'equipment',
    'name': 'equipment',
    'category': 'category',
    'supplier': 'supplier',
    'cost': 'cost',
    'notes': 'notes',
    // Vietnamese
    'thiết bị': 'equipment',
    'tên': 'equipment',
    'danh mục': 'category',
    'nhà cung cấp': 'supplier',
    'chi phí': 'cost',
    'ghi chú': 'notes',
    // ignore
    'final price': '__ignore__',
    'final_price': '__ignore__',
    'last update': '__ignore__',
    'last_update': '__ignore__',
    'giá cuối': '__ignore__',
    'cập nhật lần cuối': '__ignore__',
  }
  const toKey = (s: string) => s.normalize('NFKC').trim().toLowerCase()

  /* =========================
     NUOVA LOGICA DI IMPORT (stile Materials)
     - ResolveImportModal per conflitti e creazioni
  ========================= */
  function buildKey(name: string) {
    return (name || '').trim().toLowerCase()
  }

  async function runImport(
    data: CsvRow[],
    catMap: Record<string, number>,
    supMap: Record<string, string>,
    overrides: UnifiedChoice | null
  ) {
    // indicizzazione esistenti per key = name
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

      // applica override dal modal se presenti (undefined = lasciare com’è)
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

      const cost = moneyToNumber(r.cost)
      const proposed = {
        name,
        category_id,
        supplier_id,
        cost,
        final_price: cost != null ? Number(cost) * 1.5 : null,
        notes: r.notes || null,
      }

      const candidates = listByKey.get(key) || []
      // priorità supplier → category → più recente
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
          (existing.final_price ?? null) !== (proposed.final_price ?? null) ||
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
          transformHeader: h => headerMap[normKey(h)] ?? normKey(h),
          complete: res => resolve(res),
          error: reject,
        })
      })

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
        const category  = String(r['category'] ?? '').trim()
        const supplier  = String(r['supplier'] ?? '').trim()
        const rawCost   = r['cost']
        const notes     = r['notes'] ?? null

        const missing: string[] = []
        if (!equipment) missing.push(t('Equipment', language))
        if (!category)  missing.push(t('Category', language))
        if (!supplier)  missing.push(t('Supplier', language))
        if (rawCost == null || String(rawCost).trim() === '') missing.push(t('Cost', language))

        if (missing.length) bad.push({ row: idx + 2, missing })

        return { equipment, category, supplier, cost: rawCost, notes }
      })
      .filter(r =>
        r.equipment.length > 0 &&
        r.category.length  > 0 &&
        r.supplier.length  > 0 &&
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

      // Mappe nomi → id attuali
      const catMap: Record<string, number> = {}
      cats.forEach(c => { catMap[toKey(c.name)] = c.id })
      const supMap: Record<string, string> = {}
      sups.forEach(s => { supMap[toKey(s.name)] = s.id })

      // Conflitti e nuovi valori (come Materials)
      const listByKey = new Map<string, Equip[]>()
      for (const m of rows) {
        const k = buildKey(m.name)
        const arr = listByKey.get(k)
        if (arr) arr.push(m); else listByKey.set(k, [m])
      }

      const conflicts: ConflictItem[] = []
      for (const r of data) {
        const key = buildKey(r.equipment)
        const candidates = listByKey.get(key) || []
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

      const csvCats = uniqLower(data.map(r => r.category || ''))
      const csvSups = uniqLower(data.map(r => r.supplier || ''))
      const existingCatNames = cats.map(c => c.name.toLowerCase())
      const existingSupNames = sups.map(s => s.name.toLowerCase())
      const newCats = csvCats
        .filter(n => n && !existingCatNames.includes(n))
        .map(capitalizeFirst)
      const newSups = csvSups
        .filter(n => n && !existingSupNames.includes(n))
        .map(capitalizeFirst)

      // Decidi se chiedere conferma/modale in base alle impostazioni
const needConfirm = (typeof equipmentCsvConfirm === 'boolean' ? equipmentCsvConfirm : askCsvConfirm)

if (!needConfirm) {
  // ⚡ Modal disabilitato: crea automaticamente nuove categorie/fornitori se servono,
  // poi importa direttamente applicando i valori del CSV (anche in presenza di conflitti).

  // 1) crea le nuove categorie/fornitori mancanti (se ci sono)
  try {
    // crea categorie
    if (newCats.length > 0) {
      const { error: insCatsErr } = await supabase
        .from(TBL_EQ_CATS)
        .insert(newCats.map(n => ({ name: capitalizeFirst(n) })))
      if (insCatsErr) throw insCatsErr
    }

    // crea fornitori
    if (newSups.length > 0) {
      const { error: insSupsErr } = await supabase
        .from(TBL_SUPS)
        .insert(newSups.map(n => ({ name: capitalizeFirst(n) })))
      if (insSupsErr) throw insSupsErr
    }

    // 2) ricarica mappe nome→id aggiornate in memoria locale
    const [cRes2, sRes2] = await Promise.all([
      supabase.from<Cat>(TBL_EQ_CATS).select('*').order('name', { ascending: true }),
      supabase.from<Sup>(TBL_SUPS).select('*').order('name', { ascending: true }),
    ])
    if (cRes2.data) setCats(cRes2.data)
    if (sRes2.data) setSups(sRes2.data)

    const catMap2: Record<string, number> = {}
    const supMap2: Record<string, string> = {}
    ;(cRes2.data || cats).forEach(c => { catMap2[c.name.toLowerCase()] = c.id })
    ;(sRes2.data || sups).forEach(s => { supMap2[s.name.toLowerCase()] = s.id })

    // 3) import diretto: runImport userà le mappe aggiornate per applicare i valori del CSV
    await runImport(data, catMap2, supMap2, null)
    return
  } catch (e: any) {
    alert(`${t('ImportFailed', language)}: ${e?.message || String(e)}`)
    setProgress(null)
    if (fileRef.current) fileRef.current.value = ''
    return
  }
}

// Se serve conferma/modale:
if (conflicts.length === 0 && newCats.length === 0 && newSups.length === 0) {
  // sola conferma "sei sicuro?"
  const ok = window.confirm(t('ProceedWithImportQuestion', language) || 'Proceed with import?')
  if (!ok) { setProgress(null); if (fileRef.current) fileRef.current.value = ''; return }
  await runImport(data, catMap, supMap, null)
  return
}

// Apri modal unificato (serve davvero conferma)
setUnifiedOpen({
  conflicts,
  rows: data,
  newValues: { categories: newCats, suppliers: newSups },
})

    } catch (err: any) {
      alert(`${t('ImportFailed', language)}: ${err.message}`)
    } finally {
      await new Promise(r => setTimeout(r, 200))
      setProgress(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function onUnifiedConfirm(choice: UnifiedChoice) {
    if (!unifiedOpen) return
    const pending = unifiedOpen
    setUnifiedOpen(null)
    setProgress(0)
    try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch {}
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    try {
      // Determina quali creare (__create__)
      const toCreateCats = new Set<string>()
      const toCreateSups = new Set<string>()
      for (const v of Object.values(choice.categoryByKey)) {
        if (typeof v === 'string' && v.startsWith('__create__:')) toCreateCats.add(v.split(':', 2)[1])
      }
      for (const v of Object.values(choice.supplierByKey)) {
        if (typeof v === 'string' && v.startsWith('__create__:')) toCreateSups.add(v.split(':', 2)[1])
      }

      const { data: insCats, error: insCatsErr } = toCreateCats.size
  ? await supabase
      .from(TBL_EQ_CATS)
      .insert([...toCreateCats].map(n => ({ name: capitalizeFirst(n) })))
      .select()   // <<— aggiungi questo
  : { data: [] as { id: number; name: string }[], error: null as any }

const { data: insSups, error: insSupsErr } = toCreateSups.size
  ? await supabase
      .from(TBL_SUPS)
      .insert([...toCreateSups].map(n => ({ name: capitalizeFirst(n) })))
      .select()   // <<— e anche qui
  : { data: [] as { id: string; name: string }[], error: null as any }

if (insCatsErr || insSupsErr) throw (insCatsErr || insSupsErr)


      // Ricostruisci mappe nome→id aggiornate
      const catMap: Record<string, number> = {}
      const supMap: Record<string, string> = {}
      cats.forEach(c => { catMap[c.name.toLowerCase()] = c.id })
      sups.forEach(s => { supMap[s.name.toLowerCase()] = s.id })
      insCats?.forEach(c => { catMap[c.name.toLowerCase()] = c.id })
      insSups?.forEach(s => { supMap[s.name.toLowerCase()] = s.id })

      // Risolvi override numerici
      const resolvedOverrides: UnifiedChoice = { categoryByKey: {}, supplierByKey: {} }
      for (const [key, val] of Object.entries(choice.categoryByKey)) {
        if (val == null || val === '') resolvedOverrides.categoryByKey[key] = null
        else if (typeof val === 'string' && val.startsWith('__create__:')) {
          const name = val.split(':', 2)[1].toLowerCase()
          resolvedOverrides.categoryByKey[key] = catMap[name]
        } else resolvedOverrides.categoryByKey[key] = Number(val)
      }
      for (const [key, val] of Object.entries(choice.supplierByKey)) {
        if (val == null || val === '') resolvedOverrides.supplierByKey[key] = null
        else if (typeof val === 'string' && val.startsWith('__create__:')) {
          const name = val.split(':', 2)[1].toLowerCase()
          resolvedOverrides.supplierByKey[key] = supMap[name]
        } else resolvedOverrides.supplierByKey[key] = val
      }

      await runImport(pending.rows, catMap, supMap, resolvedOverrides)
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
      // Solo VAT RATE (niente VAT amount)
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

  function toggleSelectAllVisible() {
    const next: Record<string, boolean> = { ...selected }
    if (allVisibleSelected) {
      for (const m of filtered) next[m.id] = false
    } else {
      for (const m of filtered) next[m.id] = true
    }
    setSelected(next)
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

  // === Bulk edit VAT (uguale a Materials) ===
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

  if (loading) return <div className="p-6">{t('Loading', language)}</div>

  return (
    <div className="max-w-7xl mx-auto p-4 text-gray-100">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
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

          <h1 className="text-2xl font-bold text-white">{t('CateringRentalEquipment', language)}</h1>
          {selectedIds.length > 0 && (
            <span className="ml-2 text-sm text-blue-200">({selectedIds.length} {t('SelectedCountSuffix', language)})</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-lg
                       bg-blue-600/15 text-blue-200 hover:bg-blue-600/25
                       border border-blue-400/30 disabled:opacity-60"
            title={t('ExportExcel', language)}
          >
            <ArrowUpTrayIcon className="w-5 h-5" />
            {t('Export', language)}
          </button>

          <input ref={fileRef} type="file" accept=".csv" hidden onChange={handlePickFile} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={progress != null}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-lg
                       bg-blue-600/15 text-blue-200 hover:bg-blue-600/25
                       border border-blue-400/30 disabled:opacity-60"
            title={t('ImportCSV', language)}
          >
            <ArrowDownTrayIcon className="w-5 h-5" />
            {t('Import', language)}
          </button>

          <button
            onClick={() => setSelectMode(s => !s)}
            className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border ${
              selectMode
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border-blue-400/30'
            }`}
            title={selectMode ? t('ExitSelection', language) : t('EnterSelection', language)}
          >
            <CheckCircleIcon className="w-5 h-5" />
            {selectMode ? t('Selecting', language) : t('Select', language)}
          </button>

          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-80"
          >
            <PlusIcon className="w-5 h-5" /> {t('NewEquipment', language)}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow p-3 mb-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={t('FilterByName', language)}
            value={filters.name}
            onChange={e => setFilters(s => ({ ...s, name: e.target.value }))}
            className="border rounded-lg px-2 h-9 text-sm text-gray-900 placeholder-gray-600 w-[220px]"
          />
          <select
            value={filters.categoryId}
            onChange={e => setFilters(s => ({ ...s, categoryId: e.target.value }))}
            className="border rounded-lg px-2 h-9 text-sm bg-white text-gray-900 w-[180px]"
          >
            <option value="">{t('AllCategories', language)}</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            value={filters.supplierId}
            onChange={e => setFilters(s => ({ ...s, supplierId: e.target.value }))}
            className="border rounded-lg px-2 h-9 text-sm bg-white text-gray-900 w-[200px]"
          >
            <option value="">{t('AllSuppliers', language)}</option>
            {sups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <div className="ml-auto" />
          <button
            type="button"
            onClick={() => setFilters({ name: '', categoryId: '', supplierId: '' })}
            className="inline-flex items-center gap-1 px-3 h-9 rounded-lg
                       border border-blue-600 text-blue-700 hover:bg-blue-50"
            title={t('ClearFilters', language)}
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
                <col key="c1" className="w-[22rem]" />,
                <col key="c2" className="w-[14rem]" />,
                <col key="c3" className="w-[16rem]" />,
                <col key="c4" className="w-[10rem]" />, // Cost
                vatEnabled ? <col key="c5" className="w-[9rem]" /> : null, // VAT %
                // VAT amount nascosta
                <col key="c7" className="w-[12rem]" />, // Final
                <col key="c8" className="w-[10rem]" />, // Updated
                <col key="c9" className="w-[18rem]" />, // Notes
              ].filter(Boolean) as any}
            </colgroup>

            <thead>
              <tr className="bg-blue-50 text-gray-800">
                {/* select */}
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

                {/* Equipment - left */}
                <th className="p-2 text-left">
                  <button type="button" onClick={() => toggleSort('name')} className="w-full cursor-pointer">
                    <div className="flex items-center gap-1 justify-start font-semibold">
                      <span>{t('Equipment', language)}</span>
                      <SortIcon active={sortCol==='name'} asc={sortAsc} />
                    </div>
                  </button>
                </th>

                {/* Category - left */}
                <th className="p-2 text-left">
                  <button type="button" onClick={() => toggleSort('category_id')} className="w-full cursor-pointer">
                    <div className="flex items-center gap-1 justify-start font-semibold">
                      <span>{t('Category', language)}</span>
                      <SortIcon active={sortCol==='category_id'} asc={sortAsc} />
                    </div>
                  </button>
                </th>

                {/* Supplier - left */}
                <th className="p-2 text-left">
                  <button type="button" onClick={() => toggleSort('supplier_id')} className="w-full cursor-pointer">
                    <div className="flex items-center gap-1 justify-start font-semibold">
                      <span>{t('Supplier', language)}</span>
                      <SortIcon active={sortCol==='supplier_id'} asc={sortAsc} />
                    </div>
                  </button>
                </th>

                {/* Cost - right */}
                <th className="p-2 text-right">
                  <button type="button" onClick={() => toggleSort('cost')} className="w-full cursor-pointer">
                    <div className="flex items-center gap-1 justify-end font-semibold">
                      <SortIcon active={sortCol==='cost'} asc={sortAsc} />
                      <span>{t('Cost', language)}</span>
                    </div>
                  </button>
                </th>

                {/* VAT % - right */}
                {vatEnabled && (
                  <th className="p-2 text-right">
                    <button type="button" onClick={() => toggleSort('vat_rate')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-end font-semibold">
                        <SortIcon active={sortCol==='vat_rate'} asc={sortAsc} />
                        <span>{t('VatRatePct', language)}</span>
                      </div>
                    </button>
                  </th>
                )}

                {/* Final Price - right */}
                <th className="p-2 text-right">
                  <button type="button" onClick={() => toggleSort('final_calc')} className="w-full cursor-pointer">
                    <div className="flex items-center gap-1 justify-end font-semibold">
                      <SortIcon active={sortCol==='final_calc'} asc={sortAsc} />
                      <span>{t('FinalPrice', language)}</span>
                    </div>
                  </button>
                </th>

                {/* Updated - right */}
                                <th className="p-2 text-right">
                  <button type="button" onClick={() => toggleSort('last_update')} className="w-full cursor-pointer">
                    <div className="flex items-center gap-1 justify-end font-semibold">
                      <SortIcon active={sortCol==='last_update'} asc={sortAsc} />
                      <span>{t('LastUpdate', language)}</span>
                    </div>
                  </button>
                </th>

                {/* Notes - left */}
                <th className="p-2 text-left">
                  <button type="button" onClick={() => toggleSort('notes')} className="w-full cursor-pointer">
                    <div className="flex items-center gap-1 justify-start font-semibold">
                      <span>{t('Notes', language)}</span>
                      <SortIcon active={sortCol==='notes'} asc={sortAsc} />
                    </div>
                  </button>
                </th>
              </tr>
            </thead>

            <tbody>
              {filtered.map(it => {
                const isSelected = !!selected[it.id]
                return (
                  <tr
                    key={it.id}
                    className={`border-t hover:bg-blue-50 ${isSelected ? 'bg-blue-100/70' : ''}`}
                  >
                    {/* Checkbox */}
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

                    {/* Name */}
                    <td className="p-2 font-medium cursor-pointer text-blue-700 hover:underline"
                        onClick={() => openView(it)}>
                      {it.name}
                    </td>

                    {/* Category */}
                    <td className="p-2">
                      {cats.find(c => c.id === it.category_id)?.name || ''}
                    </td>

                    {/* Supplier */}
                    <td className="p-2">
                      {sups.find(s => s.id === it.supplier_id)?.name || ''}
                    </td>

                    {/* Cost */}
                    <td className="p-2 text-right">
                      {it.cost != null ? num.format(it.cost) : ''}
                    </td>

                    {/* VAT Rate */}
                    {vatEnabled && (
                      <td className="p-2 text-right">
                        {effVatPct(it)}%
                      </td>
                    )}

                    {/* Final Price */}
                    <td className="p-2 text-right font-semibold">
                      {num.format(finalCalc(it))}
                    </td>

                    {/* Last update */}
                    <td className={`p-2 text-right ${isOlderThanMonths(it.last_update, reviewM) ? 'text-red-600 font-medium' : ''}`}>
                      {fmtDate(it.last_update)}
                    </td>

                    {/* Notes */}
                    <td className="p-2 truncate max-w-[200px]">
                      {it.notes || ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {openEditor && (
        <EquipmentEditor
          mode={editorMode}
          id={editingId}
          cats={cats}
          sups={sups}
          initial={initialItem}
          onClose={() => setOpenEditor(false)}
          onSaved={async () => { await fetchAll(); setOpenEditor(false) }}   // chiudi dopo salvataggio
          onDeleted={async () => { await fetchAll(); setOpenEditor(false) }} // chiudi dopo delete
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
    </div>
  )
}
