// src/app/daily-reports/wastage-report/page.tsx
'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { useDRBranch } from '../_data/useDRBranch'
import {
  PlusIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  BarsArrowUpIcon,
  BarsArrowDownIcon,
  FunnelIcon,
  Squares2X2Icon,
  ArchiveBoxIcon,
  BeakerIcon,
  EllipsisVerticalIcon,
  CheckCircleIcon,
  TrashIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline'
import CircularLoader from '@/components/CircularLoader'
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
import MonthPicker from '@/components/MonthPicker'

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
    saving: 'Saving…',
    saveAndAddNew: 'Save & Add New',
    registerTitle: 'Register Wastage',
    editTitle: 'Edit Wastage',
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
  useEffect(() => {
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = orig
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[95vh]">
        {children}
      </div>
    </div>
  )
}

function CenterOverlay({ children, onClose, maxWidth = 'max-w-md' }: { children: React.ReactNode; onClose: () => void; maxWidth?: string }) {
  useEffect(() => {
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = orig
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300" onClick={onClose} />
      <div className={`relative w-full ${maxWidth} bg-white rounded-3xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200`}>
        {children}
      </div>
    </div>
  )
}

function TypePickerModal({ onPick, onClose, t }: { onPick: (t: WType) => void; onClose: () => void; t: typeof DEFAULT_T['picker'] }) {
  const items = [
    {
      key: 'Dish' as WType,
      label: t.items.Dish.label,
      desc: t.items.Dish.desc,
      Icon: Squares2X2Icon,
      gradient: 'from-orange-500/10 to-amber-500/10 border-orange-200/50',
      iconColor: 'text-orange-600',
    },
    {
      key: 'Material' as WType,
      label: t.items.Material.label,
      desc: t.items.Material.desc,
      Icon: ArchiveBoxIcon,
      gradient: 'from-blue-500/10 to-cyan-500/10 border-blue-200/50',
      iconColor: 'text-blue-600',
    },
    {
      key: 'Prep' as WType,
      label: t.items.Prep.label,
      desc: t.items.Prep.desc,
      Icon: BeakerIcon,
      gradient: 'from-purple-500/10 to-pink-500/10 border-purple-200/50',
      iconColor: 'text-purple-600',
    },
  ]
  return (
    <CenterOverlay onClose={onClose} maxWidth="max-w-2xl">
      <div className="flex flex-col text-slate-900 bg-white p-6 sm:p-8">
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
          <div className="text-lg font-bold text-slate-800">{t.title}</div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-655 hover:bg-slate-100 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          {items.map(({ key, label, desc, Icon, gradient, iconColor }) => (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              className="group relative flex flex-col items-center text-center p-5 rounded-2xl border border-slate-200 bg-white hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
            >
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr ${gradient} border transition-transform duration-350 group-hover:scale-110`}>
                <Icon className={`h-6 w-6 ${iconColor}`} />
              </span>
              <div className="font-semibold text-slate-800 text-sm mt-4 group-hover:text-blue-600 transition-colors">
                {label}
              </div>
              <div className="text-xs text-slate-450 mt-1.5 leading-relaxed px-1">
                {desc}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-end">
          <Button
            variant="primary"
            onClick={onClose}
            className="px-4 py-2 h-10 text-xs font-semibold"
          >
            {t.close}
          </Button>
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
  selectedBranchName,
  language,
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
  onSaved: (row: WastageRow, keepOpen?: boolean) => Promise<void> | void
  onDeleted: (id: string) => Promise<void> | void
  selectedBranchName: string
  language: string
  t: typeof DEFAULT_T['editor']
}) {
  const safeCategories = Array.isArray(categories) ? categories : []
  const safeMaterials = Array.isArray(materials) ? materials : []
  const safeDishes = Array.isArray(dishes) ? dishes : []
  const safePreps = Array.isArray(preps) ? preps : []

  const [viewMode, setViewMode] = useState(mode === 'view')
  const [isSaving, setIsSaving] = useState(false)
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
  const [qtyInput, setQtyInput] = useState<string>(initialRow?.qty ? String(initialRow.qty) : '')
  const qty = parseFloat(qtyInput.replace(',', '.')) || 0

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

  /* Tracks previous values to implement "only on change" logic (skips mount) */
  const prevKeyMaterial = useRef(`${type}:${categoryId}`)
  useEffect(() => {
    const key = `${type}:${categoryId}`
    if (key === prevKeyMaterial.current) return
    prevKeyMaterial.current = key

    if (type === 'Material') {
      /* If item selected matches new category, preserve it */
      let keepItem = false
      if (itemId) {
        const currentItem = safeMaterials.find(x => x.id === itemId)
        if (currentItem && (currentItem.category_id || '') === categoryId) {
          keepItem = true
        }
      }

      if (!keepItem) {
        setItemId('')
        setItemName('')
        setUnit('')
        setPackageCost(0)
        setUnitCost(0)
      } else {
        // If we kept the item, ensure categoryName is synced
        const c = safeCategories.find(c => c.id === categoryId)
        setCategoryName(c ? c.name : '')
      }

      if (!keepItem) {
        const c = safeCategories.find(c => c.id === categoryId)
        setCategoryName(c ? c.name : '')
      }
    }
  }, [type, categoryId, safeCategories, itemId, safeMaterials])

  const prevKeyDish = useRef(`${type}:${categoryName}`)
  useEffect(() => {
    const key = `${type}:${categoryName}`
    if (key === prevKeyDish.current) return
    prevKeyDish.current = key

    if (type === 'Dish' || type === 'Prep') {
      /* If we have an item selected, check if it belongs to the new category. If so, preserve it. */
      let keepItem = false
      if (itemId) {
        const list = type === 'Dish' ? safeDishes : safePreps
        const currentItem = list.find(x => x.id === itemId)
        if (currentItem && (currentItem.category || '') === categoryName) {
          keepItem = true
        }
      }

      if (!keepItem) {
        setItemId('')
        setItemName('')
        setUnit('')
        setUnitCost(0)
      }
    }
  }, [type, categoryName, itemId, safeDishes, safePreps])

  const canSave = useMemo(() => {
    if (!date || !time) return false
    if (qty <= 0) return false
    if (!itemId) return false
    return true
  }, [date, time, qty, itemId])

  async function handleSave(keepOpen = false) {
    if (!canSave || viewMode || isSaving) return
    setIsSaving(true)
    try {
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
        qty: qty || 0,
        unitCost: Math.round(unitCost || 0),
        totalCost: Math.round((unitCost || 0) * (qty || 0)),
        chargeTo,
        reason: reason ? reason : null,
        responsible: responsible ? responsible : null,
        enteredBy: enteredBy ? enteredBy : null,
      }
      await onSaved(row, keepOpen)
      if (keepOpen) {
        setCategoryId('')
        setCategoryName('')
        setItemId('')
        setItemName('')
        setUnit('')
        setQtyInput('')
        setPackageCost(0)
        setUnitCost(0)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (viewMode || !initialRow?.id || isSaving) return
    if (!window.confirm(t.confirmDelete)) return
    setIsSaving(true)
    try {
      await onDeleted(initialRow.id)
    } catch (err) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Overlay onClose={() => { if (!isSaving) onClose() }}>
      <div className="flex flex-col text-gray-900">
        <div className="px-8 py-5 border-b border-slate-100 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="text-lg font-bold text-slate-800">
              {viewMode ? t.title : initialRow?.id ? (t.editTitle || 'Edit Wastage') : (t.registerTitle || 'Register Wastage')}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="p-1 rounded-full text-slate-400 hover:text-slate-655 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
              title={t.close}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
          {!viewMode && (
            <div className="flex border-b border-slate-100 mt-2">
              {(['Dish', 'Material', 'Prep'] as WType[]).map(tt => {
                const active = tt === type
                const typeLabel = t.typeTabs?.[tt] || tt
                return (
                  <button
                    key={tt}
                    type="button"
                    onClick={() => {
                      if (viewMode || isSaving) return
                      setType(tt)
                      setCategoryId('')
                      setCategoryName('')
                      setItemId('')
                      setItemName('')
                      setUnit('')
                      setPackageCost(0)
                      setUnitCost(0)
                      setQtyInput('')
                    }}
                    className={`px-4 py-2 text-xs font-semibold border-b-2 transition cursor-pointer ${
                      active
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                    disabled={viewMode || isSaving}
                  >
                    {typeLabel}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="px-8 py-5">
          {/* Branch display */}
          <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100 mb-4">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{language === 'vi' ? 'Chi nhánh' : 'Branch'}</span>
            <div className="h-3 w-px bg-slate-200" />
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
              {selectedBranchName || '-'}
            </span>
          </div>

          <div className="space-y-4">
            {/* Row 1: Date & Time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.date}</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold disabled:opacity-50"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  disabled={viewMode || isSaving}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.time}</label>
                <input
                  type="time"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold disabled:opacity-50"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  disabled={viewMode || isSaving}
                />
              </div>
            </div>

            {/* Row 2: Category & Item */}
            <div className="grid grid-cols-2 gap-4">
              {type === 'Material' ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.category}</label>
                    <select
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold cursor-pointer disabled:opacity-50"
                      value={categoryId}
                      onChange={e => setCategoryId(e.target.value)}
                      disabled={viewMode || isSaving}
                    >
                      <option value="">{t.fields.category}</option>
                      {safeCategories.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.item}</label>
                    <select
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold cursor-pointer disabled:opacity-50"
                      value={itemId}
                      onChange={e => {
                        const val = e.target.value
                        setItemId(val)
                        if (val) {
                          const m = safeMaterials.find(x => x.id === val)
                          if (m?.category_id) setCategoryId(m.category_id)
                        }
                      }}
                      disabled={viewMode || isSaving}
                    >
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
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.category}</label>
                    <select
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold cursor-pointer disabled:opacity-50"
                      value={categoryName}
                      onChange={e => {
                        if (viewMode || isSaving) return
                        setCategoryName(e.target.value)
                        setItemId('')
                        setItemName('')
                        setUnit('')
                        setUnitCost(0)
                        setQtyInput('')
                      }}
                      disabled={viewMode || isSaving}
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
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{type === 'Dish' ? t.typeOpts.Dish : t.typeOpts.Prep}</label>
                    <select
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold cursor-pointer disabled:opacity-50"
                      value={itemId}
                      onChange={e => {
                        const val = e.target.value
                        setItemId(val)
                        if (val) {
                          const list = type === 'Dish' ? safeDishes : safePreps
                          const item = list.find(x => x.id === val)
                          if (item?.category) setCategoryName(item.category)
                        }
                      }}
                      disabled={viewMode || isSaving}
                    >
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
            </div>

            {/* Row 3: Quantity, Unit, Cost */}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-3">
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.qty}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold text-right tabular-nums disabled:opacity-50"
                  value={qtyInput}
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9.,]/g, '')
                    setQtyInput(val)
                  }}
                  disabled={viewMode || isSaving}
                  placeholder="0"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.unit}</label>
                <div className="h-10 flex items-center text-slate-900 font-semibold text-sm px-1">
                  <span>{unit || '-'}</span>
                </div>
              </div>
              {type === 'Material' ? (
                <>
                  <div className="col-span-4">
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider text-right">{t.fields.packageCost}</label>
                    <div className="h-10 flex items-center justify-end text-slate-900 font-semibold text-sm px-1">
                      <span>{packageCost ? `${fmtInt(packageCost)} ₫` : '0 ₫'}</span>
                    </div>
                  </div>
                  <div className="col-span-3">
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider text-right">{t.fields.unitCost}</label>
                    <div className="h-10 flex items-center justify-end text-slate-900 font-semibold text-sm px-1">
                      <span>{unitCost ? `${fmtInt(unitCost)} ₫` : '0 ₫'}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="col-span-7">
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider text-right">{t.unitCostInput || t.fields.unitCost}</label>
                  <div className="h-10 flex items-center justify-end text-slate-900 font-semibold text-sm px-1">
                    <span>{unitCost ? `${fmtInt(unitCost)} ₫` : '0 ₫'}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Row 4: Responsible, Entered By */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.responsible}</label>
                <input
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold disabled:opacity-50"
                  placeholder={t.responsiblePh || ''}
                  value={responsible}
                  onChange={e => setResponsible(e.target.value)}
                  disabled={viewMode || isSaving}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.enteredBy}</label>
                <div className="h-10 flex items-center text-slate-900 font-semibold text-sm px-1 gap-2">
                  <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>{enteredBy || '-'}</span>
                </div>
              </div>
            </div>

            {/* Row 5: Reason */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.fields.reason}</label>
              <input
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold disabled:opacity-50"
                placeholder={t.reasonPh || ''}
                value={reason}
                onChange={e => setReason(e.target.value)}
                disabled={viewMode || isSaving}
              />
            </div>

            {/* Segmented & Total Cost row */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.fields.chargeTo}</span>
                <Segmented
                  value={chargeTo}
                  onChange={v => setChargeTo(v as 'Restaurant' | 'Staff')}
                  options={[
                    { label: t.chargeToOpts.Restaurant, value: 'Restaurant' },
                    { label: t.chargeToOpts.Staff, value: 'Staff' },
                  ]}
                  disabled={viewMode || isSaving}
                />
              </div>
              <div className="text-sm font-bold text-slate-800">
                {t.totalsLabel || t.fields.totalCost}: <span className="text-base text-blue-600 font-extrabold">{fmtInt(totalCost)} ₫</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-8 py-5 border-t border-slate-100 flex items-center justify-between bg-slate-50/30 gap-2">
          <div className="flex items-center gap-2">
            {viewMode ? (
              <Button
                variant="primary"
                onClick={() => setViewMode(false)}
                className="px-4 py-2 h-10 text-xs font-semibold"
              >
                {t.edit}
              </Button>
            ) : (
              initialRow?.id && (
                <Button
                  variant="outline"
                  onClick={handleDelete}
                  disabled={isSaving}
                  className="px-4 py-2 h-10 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                >
                  {t.delete}
                </Button>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 h-10 text-xs font-semibold"
            >
              {t.close}
            </Button>
            {!viewMode && (
              <>
                {!initialRow?.id && (
                  <Button
                    variant="outline"
                    onClick={() => handleSave(true)}
                    disabled={!canSave || isSaving}
                    className="ml-2 px-4 py-2 h-10 text-xs font-semibold inline-flex items-center gap-2"
                  >
                    {isSaving && (
                      <svg className="animate-spin h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    {t.saveAndAddNew || 'Save & Add New'}
                  </Button>
                )}
                <Button
                  variant="primary"
                  onClick={() => handleSave(false)}
                  disabled={!canSave || isSaving}
                  className="ml-2 px-4 py-2 h-10 text-xs font-semibold inline-flex items-center gap-2"
                >
                  {isSaving && (
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {isSaving ? t.saving : t.save}
                </Button>
              </>
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

  const { rows, loading, master, insertWastage, updateWastage, deleteWastage, bulkDeleteWastage } = useWastage({
    year,
    month,
    branchName: selectedBranch?.name || null,
  })
  const { categories, materials, dishes, preps } = master

  const [qText, setQText] = useState<string>('')

  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortAsc, setSortAsc] = useState<boolean>(false)

  // Column filter state: per-column set of allowed display values
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string> | null>>({})
  // Which column menu is currently open
  const [openMenu, setOpenMenu] = useState<SortKey | null>(null)

  const columnMenuDict = {
    sortAsc: language === 'vi' ? 'Sắp xếp tăng dần' : 'Sort Ascending',
    sortDesc: language === 'vi' ? 'Sắp xếp giảm dần' : 'Sort Descending',
    selectAll: language === 'vi' ? 'Chọn tất cả' : 'Select All',
    deselectAll: language === 'vi' ? 'Bỏ chọn tất cả' : 'Deselect All',
    filterPlaceholder: language === 'vi' ? 'Lọc...' : 'Filter...',
    clearFilters: language === 'vi' ? 'Xóa bộ lọc' : 'Clear Filters',
  }

  function applySort(k: SortKey, asc: boolean) {
    setSortKey(k)
    setSortAsc(asc)
    setOpenMenu(null)
  }

  function applyColumnFilter(col: SortKey, vals: Set<string> | null) {
    setColumnFilters(prev => ({ ...prev, [col]: vals }))
    setOpenMenu(null)
  }

  function clearColumnFilter(col: SortKey) {
    setColumnFilters(prev => {
      const next = { ...prev }
      delete next[col]
      return next
    })
    setOpenMenu(null)
  }

  // Display value helper for filter checkboxes
  const displayValue = useCallback((r: WastageRow, key: SortKey): string => {
    switch (key) {
      case 'date': return fmtDateDMY(r.date)
      case 'dow': return dow3(r.date)
      case 'time': return r.time
      case 'type': return r.type
      case 'category': return r.categoryName || ''
      case 'item': return r.itemName
      case 'unit': return r.unit || ''
      case 'qty': return fmtInt(r.qty)
      case 'unitCost': return fmtInt(r.unitCost)
      case 'totalCost': return fmtInt(r.totalCost)
      case 'chargeTo': return r.chargeTo
      default: return ''
    }
  }, [])

  // Unique filterable values per column
  const columnValues = useMemo(() => {
    const map: Record<string, string[]> = {}
    const keys: SortKey[] = ['date', 'dow', 'time', 'type', 'category', 'item', 'unit', 'qty', 'unitCost', 'totalCost', 'chargeTo']
    keys.forEach(k => {
      const s = new Set<string>()
      rows.forEach(r => {
        const v = displayValue(r, k)
        if (v) s.add(v)
      })
      map[k] = Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    })
    return map
  }, [rows, displayValue])

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

  function onPickMonth(val: string) {
    const [y, m] = val.split('-').map(Number)
    if (Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12) {
      setYear(y)
      setMonth(m - 1)
    }
  }

  const monthLabel = `${monthName(month)} ${year}`

  const visibleRows = useMemo(() => {
    let out = rows.slice()
    if (qText.trim()) {
      const s = qText.trim().toLowerCase()
      out = out.filter(r => {
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
    }
    // Apply column filters
    for (const [col, allowed] of Object.entries(columnFilters)) {
      if (!allowed) continue
      out = out.filter(r => allowed.has(displayValue(r, col as SortKey)))
    }
    out.sort((a, b) => {
      const av = sortValue(a, sortKey)
      const bv = sortValue(b, sortKey)
      let cmp: number
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortAsc ? cmp : -cmp
    })
    return out
  }, [rows, qText, sortKey, sortAsc, columnFilters, displayValue])

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

  async function onSavedRow(r: WastageRow, keepOpen?: boolean) {
    let result: WastageRow | null = null
    if (editorInitialRow?.id) {
      // Edit existing
      result = await updateWastage(editorInitialRow.id, { ...r, id: undefined }) // Ensure we pass partial, but ID is in arg 1
    } else {
      // Create new
      result = await insertWastage(r)
    }

    if (!result) {
      alert(t.errors?.saveFailed || 'Failed to save wastage entry')
      throw new Error('Save failed')
    }

    if (!keepOpen) {
      setOpenEditor(false)
      setEditorInitialRow(null)
    }
  }

  async function onDeletedRow(id: string) {
    if (!id) return
    const ok = await deleteWastage(id)
    if (!ok) {
      alert(t.editor.deleteFail || 'Delete failed')
      throw new Error('Delete failed')
    }
    setOpenEditor(false)
    setEditorInitialRow(null)
  }

  const allSelected = visibleRows.length > 0 && visibleRows.every(r => !!selected[r.id])
  const someSelected = visibleRows.some(r => !!selected[r.id]) && !allSelected
  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = someSelected
  }, [someSelected, allSelected, visibleRows.length])

  function toggleSelectAll() {
    if (visibleRows.length === 0) return
    if (allSelected) setSelected({})
    else {
      const next: Record<string, boolean> = {}
      visibleRows.forEach(r => {
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
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <PageHeader
        title={t.title}
        subtitle={language === 'vi'
          ? 'Xem và quản lý báo cáo hao hụt hàng ngày.'
          : 'View and manage daily wastage reports.'}
        badgeText={validating ? t.branchPill.loading : selectedBranch?.name || t.branchPill.none}
        badgeLoading={validating}
        left={
          selectMode ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                aria-label={t.menu.more}
                className="p-0 h-auto w-auto bg-transparent border-0 outline-none text-blue-200 hover:text-white focus:outline-none cursor-pointer flex items-center"
                title={t.menu.more}
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
          ) : null
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={selectMode ? 'primary' : 'secondary-dark'}
              onClick={() => {
                setSelectMode(s => !s)
                setMenuOpen(false)
                setSelected({})
              }}
              className="h-9 px-3 text-xs font-semibold"
              title={selectMode ? t.select.exitTitle : t.select.enterTitle}
            >
              <CheckCircleIcon className="w-5 h-5 mr-1.5 inline-block" />
              {selectMode ? t.select.active : t.select.inactive}
            </Button>

            <Button
              variant="primary"
              onClick={() => setShowTypePicker(true)}
              className="h-9 px-3 text-xs font-semibold"
              title={t.add.title}
            >
              <PlusIcon className="w-5 h-5 mr-1.5 inline-block" />
              {t.add.button}
            </Button>
          </div>
        }
      />

      <MonthPicker
        value={monthInputValue}
        onChange={(newVal) => {
          if (newVal > monthInputValue && aheadIsFutureGuard(year, month)) {
            return
          }
          onPickMonth(newVal)
        }}
        language={language}
        colorClass="text-blue-100 hover:text-white"
        labelColorClass="text-white"
        iconColorClass="text-blue-200 hover:text-white"
        className="mt-3 mb-4"
      />

      <TableContainer>
        {loading && <CircularLoader />}

        <Table>
          <TableHead>
            <TableHeadRow>
              {selectMode && (
                <th className="px-6 py-4 w-7 text-left">
                  <input ref={headerCbRef} type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="h-4 w-4" title={t.table.selectAll} />
                </th>
              )}
              {([
                ['date', t.table.headers.date],
                ['dow', t.table.headers.day, false, true],
                ['time', t.table.headers.time],
                ['type', t.table.headers.type],
                ['category', t.table.headers.category],
                ['item', t.table.headers.item],
                ['unit', t.table.headers.unit],
                ['qty', t.table.headers.qty, true],
                ['unitCost', t.table.headers.unitCost, true],
                ['totalCost', t.table.headers.totalCost, true],
                ['chargeTo', t.table.headers.chargeTo]
              ] as [SortKey, string, boolean?, boolean?][]).map(([k, lbl, right, center]) => {
                const colWidths: Record<SortKey, string> = {
                  date: 'w-[120px]',
                  dow: 'w-[60px]',
                  time: 'w-[80px]',
                  type: 'w-[100px]',
                  category: 'w-[150px]',
                  item: 'w-auto',
                  unit: 'w-[80px]',
                  qty: 'w-[80px]',
                  unitCost: 'w-[120px]',
                  totalCost: 'w-[130px]',
                  chargeTo: 'w-[120px]',
                }
                return (
                  <ColumnHeader
                    key={k}
                    colKey={k}
                    label={lbl}
                    sortKey={sortKey}
                    sortAsc={sortAsc}
                    onSort={applySort}
                    values={columnValues[k] || []}
                    activeFilter={columnFilters[k] || null}
                    onFilter={(s) => applyColumnFilter(k, s)}
                    onClear={() => clearColumnFilter(k)}
                    open={openMenu === k}
                    onToggle={() => setOpenMenu(openMenu === k ? null : k)}
                    onClose={() => setOpenMenu(null)}
                    dict={columnMenuDict}
                    right={!!right}
                    center={!!center}
                    className={colWidths[k]}
                  />
                )
              })}
            </TableHeadRow>
          </TableHead>
          <TableBody>
            {visibleRows.length === 0 && !loading && (
              <tr>
                <td colSpan={12} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                  {t.table.empty}
                </td>
              </tr>
            )}
            {visibleRows.map(r => (
              <TableRow key={r.id} onClick={() => openViewRow(r)} onDoubleClick={() => openEditRow(r)} className="cursor-pointer">
                {selectMode && (
                  <TableCell className="w-7" onClick={e => e.stopPropagation()}>
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
                  </TableCell>
                )}
                <TableCell className="whitespace-nowrap">{fmtDateDMY(r.date)}</TableCell>
                <TableCell className="whitespace-nowrap lowercase font-mono text-center">{dow3(r.date)}</TableCell>
                <TableCell className="whitespace-nowrap">{r.time}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.type === 'Dish' ? 'bg-orange-100 text-orange-800' :
                    r.type === 'Material' ? 'bg-blue-100 text-blue-800' :
                      'bg-purple-100 text-purple-800'
                    }`}>
                    {r.type}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap truncate max-w-[150px]" title={r.categoryName || ''}>{r.categoryName || '-'}</TableCell>
                <TableCell className="truncate max-w-[200px]" title={r.itemName}>{r.itemName}</TableCell>
                <TableCell className="whitespace-nowrap">{r.unit || '-'}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{fmtInt(r.qty)}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{fmtInt(r.unitCost)}</TableCell>
                <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums text-slate-800">{fmtInt(r.totalCost)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.chargeTo === 'Restaurant' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {r.chargeTo}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>

            <TableBody>
              <TableRow className="bg-slate-50/50 font-semibold border-t border-slate-200">
                {selectMode && <TableCell className="w-7">{null}</TableCell>}
                <TableCell colSpan={7}>{t.table.totals}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtInt(totals.sumQty)}</TableCell>
                <TableCell className="text-right">-</TableCell>
                <TableCell className="text-right font-bold tabular-nums text-slate-800">{fmtInt(totals.sumTotal)}</TableCell>
                <TableCell>{null}</TableCell>
              </TableRow>
            </TableBody>
        </Table>
      </TableContainer>

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
          selectedBranchName={selectedBranch?.name || ''}
          language={language}
          t={t.editor}
        />
      )}
    </div>
  )
}

/* ---------- Column Header with Excel-style dropdown ---------- */
type ColumnHeaderProps = {
  colKey: SortKey
  label: string
  sortKey: SortKey
  sortAsc: boolean
  onSort: (k: SortKey, asc: boolean) => void
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
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onClose])

  const isActive = sortKey === colKey
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
    <th className={`px-6 py-4 ${right ? 'text-right' : ''} ${className} relative`} ref={ref}>
      <div className={`flex items-center gap-1 font-semibold ${center ? 'justify-center' : right ? 'justify-end' : 'justify-start'}`}>
        <span className="select-none text-slate-500 uppercase tracking-wider text-xs">{label}</span>
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
          <EllipsisVerticalIcon className="w-4 h-4 text-gray-500" />
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
              {allVisibleChecked
                ? dict.deselectAll
                : dict.selectAll}
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
                  <span className="truncate text-xs">{v}</span>
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

function sortValue(r: WastageRow, key: SortKey) {
  switch (key) {
    case 'date':
      return new Date(r.date).getTime()
    case 'dow':
      return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(dow3(r.date))
    case 'time':
      return Number(r.time.replace(':', ''))
    case 'type':
      return r.type
    case 'category':
      return r.categoryName || ''
    case 'item':
      return r.itemName || ''
    case 'unit':
      return r.unit || ''
    case 'qty':
      return r.qty
    case 'unitCost':
      return r.unitCost
    case 'totalCost':
      return r.totalCost
    case 'chargeTo':
      return r.chargeTo
    default:
      return 0
  }
}

/* ---------- Month forward guard ---------- */
function aheadIsFutureGuard(y: number, m: number) {
  const now = new Date()
  const ny = now.getFullYear()
  const nm = now.getMonth()
  return y > ny || (y === ny && m >= nm)
}
