// src/app/daily-reports/wastage-report/page.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { useDRBranch } from '../_data/useDRBranch'
import {
  PlusIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowsUpDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  Squares2X2Icon,
  ArchiveBoxIcon,
  BeakerIcon,
  EllipsisVerticalIcon,
  CheckCircleIcon,
  TrashIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline'
import CircularLoader from '@/components/CircularLoader'

import {
  useWastage,
  type WType,
  type WastageRow,
  type Category,
  type Material,
  type Dish,
  type Prep,
} from '../_data/useWastage'
import { useSettings } from '@/contexts/SettingsContext'
import { getDailyReportsDictionary } from '../_i18n'

/* ---------- Const & LS Keys ---------- */
const BRANCH_KEYS = ['dailyreports.selectedBranch', 'dailyreports.selectedBranch.v1'] as const
const TBL_APP_ACCOUNTS = 'app_accounts'

/* ---------- i18n fallback ---------- */
const DEFAULT_T = {
  title: 'Wastage Report',
  branchPill: { tooltip: 'Branch selected from the Daily Reports modal', loading: 'Loading…', none: '(no branch)' },
  search: { placeholder: 'Search...', clear: 'Clear' },
  select: { enterTitle: 'Select', exitTitle: 'Exit selection', active: 'Selecting', inactive: 'Select' },
  add: { title: 'Add Wastage', button: 'Add Wastage' },
  monthNav: { previous: 'Previous', next: 'Next', pick: 'Pick month', prevTitle: 'Previous month', nextTitle: 'Next month' },
  table: {
    loading: 'Loading…',
    selectAll: 'Select all',
    selectRow: 'Select row',
    headers: {
      date: 'Date',
      day: 'Day',
      time: 'Time',
      type: 'Type',
      category: 'Category',
      item: 'Item',
      unit: 'Unit',
      qty: 'Qty',
      unitCost: 'Unit cost',
      totalCost: 'Total cost',
      chargeTo: 'Charge to',
    },
    empty: 'No wastage in this month.',
    totals: 'Totals',
  },
  menu: { more: 'More actions', delete: 'Delete', bulkConfirm: 'Delete {count} rows?' },
  picker: {
    title: 'Add Wastage',
    close: 'Close',
    items: {
      Dish: { label: 'Dish', desc: 'Final dishes and portions' },
      Material: { label: 'Material', desc: 'Raw materials and packaging' },
      Prep: { label: 'Prep', desc: 'Preps and semi-finished items' },
    },
  },
  editor: {
    title: 'Wastage',
    edit: 'Edit',
    delete: 'Delete',
    close: 'Close',
    save: 'Save',
    typeTabs: { Dish: 'Dish', Material: 'Material', Prep: 'Prep' },
    fields: {
      date: 'Date',
      time: 'Time',
      type: 'Type',
      chargeTo: 'Charge to',
      reason: 'Reason',
      responsible: 'Responsible',
      enteredBy: 'Entered by',
      category: 'Category',
      item: 'Item',
      unit: 'Unit',
      qty: 'Qty',
      unitCost: 'Unit cost',
      totalCost: 'Total cost',
      packageCost: 'Package cost',
    },
    chargeToOpts: { Restaurant: 'Restaurant', Staff: 'Staff' },
    typeOpts: { Dish: 'Dish', Material: 'Material', Prep: 'Prep' },
    confirmDelete: 'Delete this wastage entry?',
    quantityPlaceholder: 'Quantity',
    itemPlaceholder: 'Select item',
    noItems: '(no items)',
    packageAuto: 'Unit cost (auto)',
    unitCostInput: 'Unit cost',
    responsiblePh: 'e.g., Staff or Table...',
    reasonPh: 'e.g., expired, damaged during prep, returned by guest',
    totalsLabel: 'Total',
    deleteFail: 'Delete failed',
  },
  errors: {
    saveFailed: 'Failed to save wastage entry',
  },
}

/* ---------- Primitives ---------- */
function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow">{children}</div>
}

function PageHeader({ title, left, after, right }: { title: string; left?: React.ReactNode; after?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {left}
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {after}
        </div>
        <div className="flex items-center gap-2">{right}</div>
      </div>
      <div className="mt-3 border-t border-white/15" />
    </div>
  )
}

/* ---------- Helpers ---------- */
function loadSelectedBranch(): { id?: string | null; name: string } | null {
  for (const key of BRANCH_KEYS) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      if (raw.trim().startsWith('{')) {
        const obj = JSON.parse(raw)
        const name = String(obj?.name || '').trim()
        if (name) return { id: obj?.id != null ? String(obj.id) : null, name }
      }
      const name = String(raw).trim()
      if (name) return { name }
    } catch { }
  }
  return null
}

function fmtInt(n: number) {
  try {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0))
  } catch {
    return String(Math.round(n || 0))
  }
}
function parseDigits(s: string): number {
  const digits = String(s || '').replace(/[^\d]/g, '')
  const n = Number(digits || 0)
  return Number.isFinite(n) ? n : 0
}
function fmtDateDMY(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}
function monthName(m: number) {
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m]
}
function todayISO() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function nowHM() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}
function uuid() {
  return typeof crypto !== 'undefined' && (crypto as any).randomUUID
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
function dow3(isoDate: string) {
  const d = new Date(isoDate)
  const idx = d.getDay()
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][idx] || ''
}

/* ---------- Inputs ---------- */
function MoneyInput({ value, onChange, className = '' }: { value: number; onChange: (v: number) => void; className?: string }) {
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
      onChange={e => {
        const n = parseDigits(e.target.value)
        setRaw(fmtInt(n))
        onChange(n)
      }}
      onFocus={() => {
        if (parseDigits(raw) === 0) setRaw('')
      }}
      onBlur={() => {
        if (!raw || parseDigits(raw) === 0) {
          setRaw('0')
          onChange(0)
        }
      }}
      placeholder="0"
      className={`border rounded-lg px-2 h-10 w-full text-right bg-white tabular-nums ${className}`}
    />
  )
}

function Segmented({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  options: { label: string; value: string }[]
  disabled?: boolean
}) {
  return (
    <div className={`inline-flex rounded-lg border border-blue-300 overflow-hidden ${disabled ? 'opacity-60' : ''}`}>
      {options.map((opt, i) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              if (disabled) return
              onChange(opt.value)
            }}
            className={`px-3 py-2 text-sm transition ${active ? 'bg-blue-600 text-white' : 'bg-white text-gray-800 hover:bg-blue-50'
              } ${i > 0 ? 'border-l border-blue-300' : ''}`}
            disabled={!!disabled}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Modals ---------- */
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-3xl h-full bg-white shadow-xl overflow-y-auto">{children}</div>
    </div>
  )
}
function CenterOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4">{children}</div>
    </div>
  )
}
function TypePickerModal({ onPick, onClose, t }: { onPick: (t: WType) => void; onClose: () => void; t: typeof DEFAULT_T['picker'] }) {
  const items: { key: WType; label: string; desc: string; Icon: any }[] = [
    { key: 'Dish', label: t.items.Dish.label, desc: t.items.Dish.desc, Icon: Squares2X2Icon },
    { key: 'Material', label: t.items.Material.label, desc: t.items.Material.desc, Icon: ArchiveBoxIcon },
    { key: 'Prep', label: t.items.Prep.label, desc: t.items.Prep.desc, Icon: BeakerIcon },
  ]
  return (
    <CenterOverlay onClose={onClose}>
      <div className="rounded-2xl bg-white text-gray-900 shadow-xl overflow-hidden border border-blue-100">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-blue-100 bg-blue-50/40">
          <div className="text-lg font-bold text-blue-900">{t.title}</div>
          <button onClick={onClose} className="p-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50" title={t.close}>
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>

        <div className="p-2">
          <ul className="divide-y divide-blue-100">
            {items.map(({ key, label, desc, Icon }) => (
              <li key={key}>
                <button
                  onClick={() => onPick(key)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition text-left"
                  title={label}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 border border-blue-200">
                    <Icon className="h-6 w-6 text-blue-700" />
                  </span>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{label}</div>
                    <div className="text-xs text-blue-700/80">{desc}</div>
                  </div>
                  <svg viewBox="0 0 20 20" className="h-4 w-4 text-blue-400">
                    <path d="M7 5l6 5-6 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-5 pb-4 pt-3 border-t border-blue-100 flex items-center justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 bg:white hover:bg-blue-50">
            {t.close}
          </button>
        </div>
      </div>
    </CenterOverlay>
  )
}

/** Nome come in Credits: prima user_id su app_accounts.name, se vuoto ritorna email */
async function fetchCurrentUserNameFromDB(): Promise<string> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const user = auth?.user || null
    if (!user) return ''
    const userId = String(user.id)
    const email = String(user.email || '')
    const { data, error } = await supabase.from(TBL_APP_ACCOUNTS).select('name,email').eq('user_id', userId).limit(1).single()
    if (error) return user.user_metadata?.full_name || user.user_metadata?.name || email
    const dbName = String(data?.name || '').trim()
    if (dbName) return dbName
    const metaName = user.user_metadata?.full_name || user.user_metadata?.name
    if (metaName) return metaName
    const dbEmail = String(data?.email || '').trim()
    return dbEmail || email
  } catch {
    return ''
  }
}

function EditorModal({
  mode,
  initialType,
  initialRow,
  categories,
  materials,
  dishes,
  preps,
  onClose,
  onSaved,
  onDeleted,
  t,
}: {
  mode: 'create' | 'view' | 'edit'
  initialType: WType
  initialRow: Partial<WastageRow> | null
  categories: Category[]
  materials: Material[]
  dishes: Dish[]
  preps: Prep[]
  onClose: () => void
  onSaved: (row: WastageRow) => void
  onDeleted: (id: string) => void
  t: typeof DEFAULT_T['editor']
}) {
  const safeCategories = Array.isArray(categories) ? categories : []
  const safeMaterials = Array.isArray(materials) ? materials : []
  const safeDishes = Array.isArray(dishes) ? dishes : []
  const safePreps = Array.isArray(preps) ? preps : []

  const [viewMode, setViewMode] = useState(mode === 'view')
  const [type, setType] = useState<WType>((initialRow?.type as WType) || initialType)

  const [date, setDate] = useState<string>(initialRow?.date || todayISO())
  const [time, setTime] = useState<string>(initialRow?.time || nowHM())
  const [chargeTo, setChargeTo] = useState<'Restaurant' | 'Staff'>(initialRow?.chargeTo === 'Staff' ? 'Staff' : 'Restaurant')
  const [reason, setReason] = useState<string>(initialRow?.reason || '')

  const [responsible, setResponsible] = useState<string>(initialRow?.responsible || '')
  const [enteredBy, setEnteredBy] = useState<string>(initialRow?.enteredBy || '')

  const [categoryId, setCategoryId] = useState<string>(initialRow?.categoryId || '')
  const [categoryName, setCategoryName] = useState<string>(initialRow?.categoryName || '')

  const [itemId, setItemId] = useState<string>(initialRow?.itemId || '')
  const [itemName, setItemName] = useState<string>(initialRow?.itemName || '')

  const [unit, setUnit] = useState<string>(initialRow?.unit || '')
  const [qty, setQty] = useState<number>(initialRow?.qty || 0)

  const [packageCost, setPackageCost] = useState<number>(0)
  const [unitCost, setUnitCost] = useState<number>(initialRow?.unitCost || 0)
  const totalCost = useMemo(() => Math.round((unitCost || 0) * (qty || 0)), [unitCost, qty])

  useEffect(() => {
    let alive = true
    if (initialRow?.enteredBy) return
      ; (async () => {
        const name = await fetchCurrentUserNameFromDB()
        if (alive) setEnteredBy(name)
      })()
    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      const name = await fetchCurrentUserNameFromDB()
      if (alive) setEnteredBy(name)
    })
    return () => {
      alive = false
      sub?.subscription?.unsubscribe?.()
    }
  }, [initialRow])

  const materialOpts = useMemo(() => {
    if (type !== 'Material') return []
    if (!categoryId) return safeMaterials
    const cid = String(categoryId)
    return safeMaterials.filter(m => String(m.category_id || '') === cid)
  }, [type, safeMaterials, categoryId])

  const dishOpts = useMemo(() => {
    if (type !== 'Dish') return []
    if (!categoryName) return safeDishes
    return safeDishes.filter(d => (d.category || '') === categoryName)
  }, [type, safeDishes, categoryName])

  const prepOpts = useMemo(() => {
    if (type !== 'Prep') return []
    if (!categoryName) return safePreps
    return safePreps.filter(p => (p.category || '') === categoryName)
  }, [type, safePreps, categoryName])

  useEffect(() => {
    if (type === 'Material') {
      const m = materialOpts.find(x => x.id === itemId)
      if (m) {
        setItemName(m.name)
        setUnit(m.unit || '')
        const pkgPrice = Math.round(m.package_price || 0)
        const pkgSize = Number(m.package_size || 0)
        setPackageCost(pkgPrice)
        const perUnit = pkgSize && pkgPrice ? Math.round(pkgPrice / pkgSize) : 0
        setUnitCost(perUnit)
      } else if (!initialRow) {
        setItemName('')
        setUnit('')
        setPackageCost(0)
        setUnitCost(0)
      }
    } else if (type === 'Dish') {
      const d = dishOpts.find(x => x.id === itemId)
      if (d) {
        setItemName(d.name)
        setUnit('portion')
        setUnitCost(Math.round(d.cost_unit_vnd || 0))
      } else if (!initialRow) {
        setItemName('')
        setUnit('')
        setUnitCost(0)
      }
    } else if (type === 'Prep') {
      const p = prepOpts.find(x => x.id === itemId)
      if (p) {
        setItemName(p.name)
        setUnit(p.unit || 'unit')
        setUnitCost(Math.round(p.cost_unit_vnd || 0))
      } else if (!initialRow) {
        setItemName('')
        setUnit('')
        setUnitCost(0)
      }
    }
  }, [type, itemId, materialOpts, dishOpts, prepOpts, initialRow])

  useEffect(() => {
    if (type === 'Material') {
      const c = safeCategories.find(c => c.id === categoryId)
      setCategoryName(c ? c.name : '')
      setItemId('')
      setItemName('')
      setUnit('')
      setPackageCost(0)
      setUnitCost(0)
    }
  }, [type, categoryId, safeCategories])

  useEffect(() => {
    if (type === 'Dish' || type === 'Prep') {
      setItemId('')
      setItemName('')
      setUnit('')
      setUnitCost(0)
    }
  }, [type, categoryName])

  const canSave = useMemo(() => {
    if (!date || !time) return false
    if (qty <= 0) return false
    if (!itemId) return false
    return true
  }, [date, time, qty, itemId])

  function handleSave() {
    if (!canSave || viewMode) return
    const row: WastageRow = {
      id: initialRow?.id || uuid(),
      date,
      time,
      type,
      categoryId: type === 'Material' ? (categoryId || null) : undefined,
      categoryName: type === 'Material' ? (categoryName || null) : categoryName || null,
      itemId: itemId || null,
      itemName: itemName || '',
      unit: unit || null,
      qty: Math.round(qty || 0),
      unitCost: Math.round(unitCost || 0),
      totalCost: Math.round((unitCost || 0) * (qty || 0)),
      chargeTo,
      reason: reason ? reason : null,
      responsible: responsible ? responsible : null,
      enteredBy: enteredBy ? enteredBy : null,
    }
    onSaved(row)
  }

  function handleDelete() {
    if (viewMode || !initialRow?.id) return
    if (!window.confirm(t.confirmDelete)) return
    onDeleted(initialRow.id)
  }

  return (
    <Overlay onClose={onClose}>
      <div className="h-full flex flex-col text-gray-900">
        <div className="px-6 pt-5 pb-4 flex items-center justify-between border-b border-blue-100 bg-blue-50/20">
          <div className="flex items-center gap-3">
            <div className="text-xl font-bold text-blue-900">
              {viewMode ? t.title : initialRow?.id ? t.edit : t.save}
            </div>
            <div className="hidden sm:block">
              <div className="inline-flex rounded-lg border border-blue-300 overflow-hidden">
                {(['Dish', 'Material', 'Prep'] as WType[]).map(tt => {
                  const active = tt === type
                  const typeLabel = t.typeTabs?.[tt] || tt
                  return (
                    <button
                      key={tt}
                      onClick={() => {
                        if (viewMode) return
                        setType(tt)
                        setCategoryId('')
                        setCategoryName('')
                        setItemId('')
                        setItemName('')
                        setUnit('')
                        setPackageCost(0)
                        setUnitCost(0)
                        setQty(0)
                      }}
                      className={`px-3 py-2 text-sm transition ${active ? 'bg-blue-600 text-white' : 'bg-white text-gray-800 hover:bg-blue-50'} ${tt === 'Dish' ? '' : 'border-l border-blue-300'}`}
                      disabled={viewMode}
                    >
                      {typeLabel}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50" title={t.close}>
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>

        <div className="px-6 py-4 flex-1 overflow-y-auto">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm text-gray-800">{t.fields.date}</label>
              <input type="date" className="mt-1 w-full border rounded-lg px-3 h-11 bg-white" value={date} onChange={e => setDate(e.target.value)} disabled={viewMode} />
            </div>
            <div>
              <label className="text-sm text-gray-800">{t.fields.time}</label>
              <input type="time" className="mt-1 w-full border rounded-lg px-3 h-11 bg-white" value={time} onChange={e => setTime(e.target.value)} disabled={viewMode} />
            </div>

            {type === 'Material' ? (
              <>
                <div>
                  <label className="text-sm text-gray-800">{t.fields.category}</label>
                  <select className="mt-1 w-full border rounded-lg px-3 h-11 bg-white" value={categoryId} onChange={e => setCategoryId(e.target.value)} disabled={viewMode}>
                    <option value="">{t.fields.category}</option>
                    {safeCategories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-800">{t.fields.item}</label>
                  <select className="mt-1 w-full border rounded-lg px-3 h-11 bg:white" value={itemId} onChange={e => setItemId(e.target.value)} disabled={viewMode}>
                    <option value="">{materialOpts.length ? t.fields.item : t.noItems}</option>
                    {materialOpts.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-sm text-gray-800">{t.fields.category}</label>
                  <select
                    className="mt-1 w-full border rounded-lg px-3 h-11 bg-white"
                    value={categoryName}
                    onChange={e => {
                      if (viewMode) return
                      setCategoryName(e.target.value)
                      setItemId('')
                      setItemName('')
                      setUnit('')
                      setUnitCost(0)
                      setQty(0)
                    }}
                    disabled={viewMode}
                  >
                    <option value="">{t.fields.category}</option>
                    {Array.from(new Set((type === 'Dish' ? safeDishes : safePreps).map(x => x.category || '').filter(Boolean)))
                      .sort((a, b) => a.localeCompare(b))
                      .map(name => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-800">{type === 'Dish' ? t.typeOpts.Dish : t.typeOpts.Prep}</label>
                  <select className="mt-1 w-full border rounded-lg px-3 h-11 bg-white" value={itemId} onChange={e => setItemId(e.target.value)} disabled={viewMode}>
                    <option value="">{(type === 'Dish' ? dishOpts : prepOpts).length ? t.fields.item : t.noItems}</option>
                    {(type === 'Dish' ? dishOpts : prepOpts).map(x => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="text-sm text-gray-800">{t.fields.qty}</label>
              <input
                type="number"
                min={0}
                step={1}
                className="mt-1 w-full border rounded-lg px-3 h-11 bg-white text-right"
                value={Number.isFinite(qty) ? qty : 0}
                onChange={e => setQty(Math.max(0, Math.floor(Number(e.target.value || 0))))}
                disabled={viewMode}
              />
            </div>
            <div>
              <label className="text-sm text-gray-800">{t.fields.unit}</label>
              <input className="mt-1 w-full border rounded-lg px-3 h-11 bg-gray-50" value={unit || ''} readOnly />
            </div>

            {type === 'Material' && (
              <>
                <div>
                  <label className="text-sm text-gray-800">{t.fields.packageCost}</label>
                  <div className="mt-1">
                    <MoneyInput value={packageCost} onChange={() => { }} className="h-11 bg-gray-50 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-800">{t.fields.unitCost}</label>
                  <div className="mt-1">
                    <MoneyInput value={unitCost} onChange={() => { }} className="h-11 bg-gray-50 pointer-events-none" />
                  </div>
                </div>
              </>
            )}
            {(type === 'Dish' || type === 'Prep') && (
              <div className="md:col-span-2">
                <label className="text-sm text-gray-800">{t.unitCostInput || t.fields.unitCost}</label>
                <div className="mt-1">
                  <MoneyInput value={unitCost} onChange={setUnitCost} className="h-11" />
                </div>
              </div>
            )}

            <div>
              <label className="text-sm text-gray-800">{t.fields.responsible}</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 h-11 bg-white"
                placeholder={t.responsiblePh || ''}
                value={responsible}
                onChange={e => setResponsible(e.target.value)}
                disabled={viewMode}
              />
            </div>

            <div>
              <label className="text-sm text-gray-800">{t.fields.enteredBy}</label>
              <input className="mt-1 w-full border rounded-lg px-3 h-11 bg-gray-50" value={enteredBy} readOnly />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm text-gray-800">{t.fields.reason}</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 h-11 bg-white"
                placeholder={t.reasonPh || ''}
                value={reason}
                onChange={e => setReason(e.target.value)}
                disabled={viewMode}
              />
            </div>

            <div className="md:col-span-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-800">{t.fields.chargeTo}</span>
                <Segmented
                  value={chargeTo}
                  onChange={v => setChargeTo(v as 'Restaurant' | 'Staff')}
                  options={[
                    { label: t.chargeToOpts.Restaurant, value: 'Restaurant' },
                    { label: t.chargeToOpts.Staff, value: 'Staff' },
                  ]}
                  disabled={viewMode}
                />
              </div>
              <div className="text-sm text-gray-600">
                {t.totalsLabel || t.fields.totalCost}: <span className="font-semibold">{fmtInt(totalCost)} ₫</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 pt-4 border-t border-blue-100 flex items-center justify-between bg-blue-50/10 gap-2">
          <div className="flex items-center gap-2">
            {viewMode ? (
              <button onClick={() => setViewMode(false)} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80">
                {t.edit}
              </button>
            ) : (
              initialRow?.id && (
                <button onClick={handleDelete} className="px-4 py-2 rounded-lg border text-red-600 hover:bg-red-50">
                  {t.delete}
                </button>
              )
            )}
          </div>
          <div>
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-blue-300 bg-white hover:bg-blue-50">
              {t.close}
            </button>
            {!viewMode && (
              <button onClick={handleSave} disabled={!canSave} className="ml-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 disabled:opacity-50">
                {t.save}
              </button>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  )
}

/* ---------- Page ---------- */
type SortKey = 'date' | 'dow' | 'time' | 'type' | 'category' | 'item' | 'unit' | 'qty' | 'unitCost' | 'totalCost' | 'chargeTo'

export default function WastageReportPage() {
  const { language } = useSettings()
  const dict = getDailyReportsDictionary(language)
  const t = dict?.wastageReport || DEFAULT_T
  const { validating } = useDRBranch({ validate: false })
  const [selectedBranch] = useState(loadSelectedBranch())

  const now = new Date()
  const [year, setYear] = useState<number>(now.getFullYear())
  const [month, setMonth] = useState<number>(now.getMonth())
  const monthInputValue = useMemo(() => `${year}-${String(month + 1).padStart(2, '0')}`, [year, month])

  const { rows, loading, master, insertWastage, deleteWastage, bulkDeleteWastage } = useWastage({
    year,
    month,
    branchName: selectedBranch?.name || null,
  })
  const { categories, materials, dishes, preps } = master

  const [qText, setQText] = useState<string>('')

  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortAsc, setSortAsc] = useState<boolean>(false)

  const [showTypePicker, setShowTypePicker] = useState(false)

  const [openEditor, setOpenEditor] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'view' | 'edit'>('create')
  const [editorInitialRow, setEditorInitialRow] = useState<Partial<WastageRow> | null>(null)
  const [editorInitialType, setEditorInitialType] = useState<WType>('Dish')

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const selectedIds = useMemo(() => Object.keys(selected).filter(id => selected[id]), [selected])

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const headerCbRef = useRef<HTMLInputElement>(null)

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc(v => !v)
    else {
      setSortKey(k)
      setSortAsc(true)
    }
  }

  function prevMonth() {
    setMonth(m => (m === 0 ? (setYear(y => y - 1), 11) : m - 1))
  }
  function nextMonth() {
    setMonth(m => (m === 11 ? (setYear(y => y + 1), 0) : m + 1))
  }
  function onPickMonth(val: string) {
    const [y, m] = val.split('-').map(Number)
    if (Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12) {
      setYear(y)
      setMonth(m - 1)
    }
  }

  const monthLabel = `${monthName(month)} ${year}`

  const visibleRows = useMemo(() => {
    const s = qText.trim().toLowerCase()
    const filtered = !s
      ? rows
      : rows.filter(r => {
        return [
          fmtDateDMY(r.date).toLowerCase(),
          r.time,
          r.type,
          r.categoryName || '',
          r.itemName || '',
          r.unit || '',
          String(r.qty),
          String(r.unitCost),
          String(r.totalCost),
          r.chargeTo,
        ].some(v => v.toLowerCase().includes(s))
      })
    const arr = [...filtered]
    arr.sort((a, b) => {
      const av = (() => {
        switch (sortKey) {
          case 'date':
            return new Date(a.date).getTime()
          case 'dow':
            return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(dow3(a.date))
          case 'time':
            return Number(a.time.replace(':', ''))
          case 'type':
            return a.type
          case 'category':
            return a.categoryName || ''
          case 'item':
            return a.itemName || ''
          case 'unit':
            return a.unit || ''
          case 'qty':
            return a.qty
          case 'unitCost':
            return a.unitCost
          case 'totalCost':
            return a.totalCost
          case 'chargeTo':
            return a.chargeTo
          default:
            return 0
        }
      })()
      const bv = (() => {
        switch (sortKey) {
          case 'date':
            return new Date(b.date).getTime()
          case 'dow':
            return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(dow3(b.date))
          case 'time':
            return Number(b.time.replace(':', ''))
          case 'type':
            return b.type
          case 'category':
            return b.categoryName || ''
          case 'item':
            return b.itemName || ''
          case 'unit':
            return b.unit || ''
          case 'qty':
            return b.qty
          case 'unitCost':
            return b.unitCost
          case 'totalCost':
            return b.totalCost
          case 'chargeTo':
            return b.chargeTo
          default:
            return 0
        }
      })()
      let cmp: number
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortAsc ? cmp : -cmp
    })
    return arr
  }, [rows, qText, sortKey, sortAsc])

  const totals = useMemo(() => {
    let sumQty = 0
    let sumTotal = 0
    for (const r of visibleRows) {
      sumQty += Number(r.qty || 0)
      sumTotal += Number(r.totalCost || 0)
    }
    return { sumQty, sumTotal }
  }, [visibleRows])

  function openViewRow(r: WastageRow) {
    setEditorMode('view')
    setEditorInitialType(r.type)
    setEditorInitialRow(r)
    setOpenEditor(true)
  }

  function openEditRow(r: WastageRow) {
    setEditorMode('edit')
    setEditorInitialType(r.type)
    setEditorInitialRow(r)
    setOpenEditor(true)
  }

  async function onSavedRow(r: WastageRow) {
    try {
      await insertWastage(r)
      setOpenEditor(false)
      setEditorInitialRow(null)
    } catch (err) {
      console.error('Insert/update wastage failed', err)
      alert(t.errors?.saveFailed || 'Failed to save wastage entry')
    }
  }

  async function onDeletedRow(id: string) {
    if (!id) return
    const ok = await deleteWastage(id)
    if (!ok) return
    setOpenEditor(false)
    setEditorInitialRow(null)
  }

  const allSelected = rows.length > 0 && rows.every(r => !!selected[r.id])
  const someSelected = rows.some(r => !!selected[r.id]) && !allSelected
  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = someSelected
  }, [someSelected, allSelected, rows.length])

  function toggleSelectAll() {
    if (rows.length === 0) return
    if (allSelected) setSelected({})
    else {
      const next: Record<string, boolean> = {}
      rows.forEach(r => {
        next[r.id] = true
      })
      setSelected(next)
    }
  }

  async function bulkDelete() {
    const ids = selectedIds
    if (!ids.length) return
    const ok = window.confirm(t.menu.bulkConfirm.replace('{count}', String(ids.length)))
    if (!ok) return
    const deleted = await bulkDeleteWastage(ids)
    if (!deleted) return
    setSelected({})
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  return (
    <div className="max-w-none mx-auto p-4 text-gray-100">
      <PageHeader
        title={t.title}
        left={
          <>
            {selectMode && (
              <div className="relative" ref={menuRef}>
                <button onClick={() => setMenuOpen(v => !v)} aria-label={t.menu.more} className="p-0 h-auto w-auto bg-transparent border-0 outline-none text-blue-200 hover:text-white focus:outline-none" title={t.menu.more}>
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
          <div className="hidden md:inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-600/15 px-3 py-1 text-xs text-blue-100" title={t.branchPill.tooltip}>
            <span className="h-2 w-2 rounded-full bg-green-400" />
            <span className="font-medium">{validating ? t.branchPill.loading : selectedBranch?.name || t.branchPill.none}</span>
          </div>
        }
        right={
          <div className="flex items-center gap-3">
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-2.5 h-5 w-5 text-blue-200" />
              <input
                value={qText}
                onChange={e => setQText(e.target.value)}
                placeholder={t.search.placeholder}
                className="pl-9 pr-8 h-9 rounded-lg border border-blue-400/30 bg-blue-600/15 text-blue-50 placeholder-blue-200
                           focus:outline-none focus:ring-2 focus:ring-blue-400/40"
              />
              {qText && (
                <button onClick={() => setQText('')} className="absolute right-2 top-2 h-5 w-5 text-blue-200 hover:text-white" aria-label={t.search.clear} title={t.search.clear}>
                  ×
                </button>
              )}
            </div>

            <button
              onClick={() => {
                setSelectMode(s => !s)
                setMenuOpen(false)
                setSelected({})
              }}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border ${selectMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border-blue-400/30'}`}
              title={selectMode ? t.select.exitTitle : t.select.enterTitle}
            >
              <CheckCircleIcon className="w-5 h-5" />
              {selectMode ? t.select.active : t.select.inactive}
            </button>

            <button onClick={() => setShowTypePicker(true)} className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-80" title={t.add.title}>
              <PlusIcon className="w-5 h-5" />
              {t.add.button}
            </button>
          </div>
        }
      />

      <div className="mt-3 mb-4 flex items-center justify-between text-sm text-blue-100">
        <button type="button" onClick={prevMonth} className="flex items-center gap-1 hover:text-white" title={t.monthNav.prevTitle}>
          <ChevronLeftIcon className="w-4 h-4" />
          <span>{t.monthNav.previous}</span>
        </button>

        <div className="flex items-center gap-2 text-white">
          <span className="text-base font-semibold">{monthLabel}</span>
          <div className="relative w-6 h-6">
            <CalendarDaysIcon className="w-6 h-6 text-blue-200" />
            <input type="month" value={monthInputValue} onChange={e => onPickMonth(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={t.monthNav.pick} title={t.monthNav.pick} />
          </div>
        </div>

        <button
          type="button"
          onClick={aheadIsFutureGuard(year, month) ? () => { } : nextMonth}
          disabled={aheadIsFutureGuard(year, month)}
          className={`flex items-center gap-1 hover:text-white ${aheadIsFutureGuard(year, month) ? 'opacity-40 cursor-default' : ''}`}
          title={t.monthNav.nextTitle}
        >
          <span>{t.monthNav.next}</span>
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </div>

      <Card>
        <div className="p-3">
          {loading && <CircularLoader />}

          <table className="w-full table-auto text-sm text-gray-900">
            <thead>
              <tr>
                <th className="p-2 w-7">
                  {selectMode ? (
                    <input ref={headerCbRef} type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="h-4 w-4" title={t.table.selectAll} />
                  ) : null}
                </th>
                <Th label={t.table.headers.date} active={sortKey === 'date'} asc={sortAsc} onClick={() => toggleSort('date')} />
                <Th label={t.table.headers.day} active={sortKey === 'dow'} asc={sortAsc} onClick={() => toggleSort('dow')} />
                <Th label={t.table.headers.time} active={sortKey === 'time'} asc={sortAsc} onClick={() => toggleSort('time')} />
                <Th label={t.table.headers.type} active={sortKey === 'type'} asc={sortAsc} onClick={() => toggleSort('type')} />
                <Th label={t.table.headers.category} active={sortKey === 'category'} asc={sortAsc} onClick={() => toggleSort('category')} />
                <Th label={t.table.headers.item} active={sortKey === 'item'} asc={sortAsc} onClick={() => toggleSort('item')} />
                <Th label={t.table.headers.unit} active={sortKey === 'unit'} asc={sortAsc} onClick={() => toggleSort('unit')} />
                <Th label={t.table.headers.qty} active={sortKey === 'qty'} asc={sortAsc} onClick={() => toggleSort('qty')} right />
                <Th label={t.table.headers.unitCost} active={sortKey === 'unitCost'} asc={sortAsc} onClick={() => toggleSort('unitCost')} right />
                <Th label={t.table.headers.totalCost} active={sortKey === 'totalCost'} asc={sortAsc} onClick={() => toggleSort('totalCost')} right />
                <Th label={t.table.headers.chargeTo} active={sortKey === 'chargeTo'} asc={sortAsc} onClick={() => toggleSort('chargeTo')} />
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && !loading && (
                <tr>
                  <td colSpan={12} className="text-center text-gray-500 py-6">
                    {t.table.empty}
                  </td>
                </tr>
              )}
              {visibleRows.map(r => (
                <tr key={r.id} className="border-t hover:bg-blue-50/40 cursor-pointer" onClick={() => openViewRow(r)} onDoubleClick={() => openEditRow(r)}>
                  <td className="p-2 w-7" onClick={e => e.stopPropagation()}>
                    {selectMode ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={!!selected[r.id]}
                        onChange={e =>
                          setSelected(prev => ({
                            ...prev,
                            [r.id]: e.target.checked,
                          }))
                        }
                        title={t.table.selectRow}
                      />
                    ) : null}
                  </td>
                  <td className="p-2 whitespace-nowrap">{fmtDateDMY(r.date)}</td>
                  <td className="p-2 whitespace-nowrap lowercase font-mono">{dow3(r.date)}</td>
                  <td className="p-2 whitespace-nowrap">{r.time}</td>
                  <td className="p-2 whitespace-nowrap">{r.type}</td>
                  <td className="p-2 whitespace-nowrap">{r.categoryName || '-'}</td>
                  <td className="p-2">{r.itemName}</td>
                  <td className="p-2 whitespace-nowrap">{r.unit || '-'}</td>
                  <td className="p-2 text-right tabular-nums">{fmtInt(r.qty)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtInt(r.unitCost)}</td>
                  <td className="p-2 text-right font-semibold tabular-nums">{fmtInt(r.totalCost)}</td>
                  <td className="p-2 whitespace-nowrap">{r.chargeTo}</td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="border-t bg-blue-50/40">
                <td className="p-2 w-7" />
                <td className="p-2 text-right font-semibold" colSpan={7}>
                  {t.table.totals}
                </td>
                <td className="p-2 text-right font-semibold tabular-nums">{fmtInt(totals.sumQty)}</td>
                <td className="p-2 text-right font-semibold tabular-nums">-</td>
                <td className="p-2 text-right font-bold tabular-nums">{fmtInt(totals.sumTotal)}</td>
                <td className="p-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {showTypePicker && <TypePickerModal onPick={tt => { setEditorMode('create'); setEditorInitialType(tt); setEditorInitialRow(null); setShowTypePicker(false); setOpenEditor(true) }} onClose={() => setShowTypePicker(false)} t={t.picker} />}
      {openEditor && (
        <EditorModal
          mode={editorMode}
          initialType={editorInitialType}
          initialRow={editorInitialRow}
          categories={categories}
          materials={materials}
          dishes={dishes}
          preps={preps}
          onClose={() => setOpenEditor(false)}
          onSaved={onSavedRow}
          onDeleted={onDeletedRow}
          t={t.editor}
        />
      )}
    </div>
  )
}

/* ---------- Small helpers for header + table ---------- */
function Th({ label, active, asc, onClick, right }: { label: string; active: boolean; asc: boolean; onClick: () => void; right?: boolean }) {
  return (
    <th className={`p-2 ${right ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={onClick} className="w-full cursor-pointer">
        <div className={`flex items-center gap-1 font-semibold ${right ? 'justify-end' : ''}`}>
          {right ? null : <SortIcon active={active} asc={asc} />}
          <span>{label}</span>
          {right ? <SortIcon active={active} asc={asc} /> : null}
        </div>
      </button>
    </th>
  )
}
function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return <ArrowsUpDownIcon className="w-4 h-4 text-gray-400" />
  return asc ? <ChevronUpIcon className="w-4 h-4 text-gray-700" /> : <ChevronDownIcon className="w-4 h-4 text-gray-700" />
}

/* ---------- Month forward guard ---------- */
function aheadIsFutureGuard(y: number, m: number) {
  const now = new Date()
  const ny = now.getFullYear()
  const nm = now.getMonth()
  return y > ny || (y === ny && m >= nm)
}
