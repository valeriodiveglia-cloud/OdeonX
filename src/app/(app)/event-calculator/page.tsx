// src/app/event-calculator/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  PlusIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  DocumentTextIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { Dialog } from '@headlessui/react'
import { supabase } from '@/lib/supabase_shim'

/* ---------- DB: view ---------- */
const VW_FINAL_LIST = 'final_list_vw'

/* ---------- Types ---------- */
type Id = string

type Dish = {
  id: Id
  name: string
  category_name: string | null
  unit_cost: number | null
  price: number | null
}

/** Dinamico: i tipi bundle ora sono stringhe libere, create da UI */
type BundleType = string

// Modifiers: fino a MAX_MODS ids; ereditano la qty della riga.
type BundleRow = {
  id: string
  dish_id: Id | ''
  qty: number
  modifiers: Id[] // 0..MAX_MODS
}

type Bundle = {
  id: string
  type: BundleType
  label: string
  rows: BundleRow[]
}

type EventHeader = {
  name: string
  host: string
  poc: string
  phone: string
  email: string
  company: string
  date: string
  time: string
  location: string
  pax: number | ''
  notes: string
}

/* ---------- Equipment (DB) ---------- */
type Equipment = {
  id: Id
  name: string
  category_id: number | null
  category_name: string | null
  cost: number | null
  final_price: number | null
  db_note: string | null
}
type EqRow = {
  id: string
  category_id: number | null  // null = Any
  equipment_id: Id | ''
  qty: number
  notes: string
}
type EqCategory = { id: number; name: string }

/* ---------- Staff ---------- */
type StaffRow = {
  id: string
  role: string
  hours: number
  rate: number
  markupPct: number
}

/* ---------- Utils ---------- */
const ANY = 'Any'
const MAX_MODS = 5

function uuid() {
  try {
    // @ts-ignore
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch {}
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

/* Hydration-safe: locale fissa per render identico su server e client */
const NUMBER_LOCALE = 'en-US'
function fmt(n: number | null | undefined, d = 0) {
  if (n == null || Number.isNaN(n)) return '-'
  try {
    return new Intl.NumberFormat(NUMBER_LOCALE, {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(n)
  } catch {
    return Number(n).toFixed(d)
  }
}
function toNum(v: string, fallback = 0) {
  if (v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
function clampPos(n: number) {
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

/* ---------- Bundle Settings model (DINAMICO) ---------- */
type ModifierSlotCfg = {
  label: string
  categories: string[]   // categorie ammesse per questo slot (o [Any])
  required: boolean
}

type BundleConfig = {
  label: string
  maxModifiers: number        // 0..MAX_MODS
  dishCategories: string[]    // categorie ammesse per il dish (o [Any])
  modifierSlots: ModifierSlotCfg[] // fino a MAX_MODS slot
}

/** defaults iniziali (si possono cancellare e crearne di nuovi) */
const DEFAULT_BUNDLE_SETTINGS: Record<string, BundleConfig> = {
  'pasta-station': {
    label: 'Pasta Station',
    maxModifiers: 1,
    dishCategories: ['Pasta'],
    modifierSlots: [{ label: 'Salsa', categories: ['Sauce', 'Salse'], required: true }],
  },
  'pizza-station': {
    label: 'Pizza Station',
    maxModifiers: 2,
    dishCategories: ['Pizza'],
    modifierSlots: [
      { label: 'Salsa', categories: ['Sauce', 'Salse'], required: true },
      { label: 'Topping', categories: ['Topping'], required: false },
    ],
  },
  buffet: { label: 'Buffet', maxModifiers: 0, dishCategories: [ANY], modifierSlots: [] },
  canape: { label: 'Canapés', maxModifiers: 0, dishCategories: ['Finger Food', 'Canape'], modifierSlots: [] },
  bbq: {
    label: 'Barbecue',
    maxModifiers: 1,
    dishCategories: ['Meat', 'Veg', 'BBQ'],
    modifierSlots: [{ label: 'Salsa', categories: ['Sauce', 'Salse'], required: false }],
  },
  'sitting-meal': { label: 'Sitting Meal', maxModifiers: 0, dishCategories: [ANY], modifierSlots: [] },
}

/* ---------- helpers filtro ---------- */
function catAllowed(allowed: string[], cat: string | null) {
  if (!allowed || allowed.length === 0) return false
  if (allowed.includes(ANY)) return true
  if (!cat) return false
  return allowed.includes(cat)
}
function dishAllowedByCfg(cfg: BundleConfig, d: Dish) {
  return catAllowed(cfg.dishCategories, d.category_name)
}
function modifierAllowedByCfg(cfg: BundleConfig, slotIndex: number, d: Dish) {
  const slot = cfg.modifierSlots[slotIndex]
  if (!slot) return false
  return catAllowed(slot.categories, d.category_name)
}
function effectiveLimit(cfg?: BundleConfig | null) {
  if (!cfg) return 0
  return Math.min(cfg.maxModifiers ?? 0, cfg.modifierSlots.length ?? 0, MAX_MODS)
}

/* ---------- Fetch dishes ---------- */
function useFinalDishes() {
  const [dishes, setDishes] = useState<Dish[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from(VW_FINAL_LIST)
        .select('id, name, category_name:category, unit_cost:cost_unit_vnd, price:price_vnd')

      if (!alive) return
      if (error) {
        console.error('final_list_vw error:', error?.message || error)
        setDishes([])
        setLoading(false)
        return
      }

      const rows = (data as any[]) || []
      const mapped: Dish[] = rows.map((r: any) => ({
        id: r.id ?? r.name,
        name: (r.name ?? '(unnamed)').trim(),
        category_name: r.category_name ? String(r.category_name).trim() : null,
        unit_cost: r.unit_cost == null ? null : Number(r.unit_cost),
        price: r.price == null ? null : Number(r.price),
      }))

      mapped.sort((a, b) => a.name.localeCompare(b.name))
      setDishes(mapped)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  return { dishes, loading }
}

/* ---------- Fetch equipment + categories ---------- */
function useEquipment() {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [categories, setCategories] = useState<EqCategory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // attrezzi
        const { data: eq, error: eqErr } = await supabase
          .from('rental_equipment')
          .select('id, name, category_id, cost, final_price, notes')
        if (eqErr) throw eqErr

        // categorie (preferisci equipment_categories, fallback categories)
        let catRows: { id: number; name: string }[] = []
        let catErr: any = null
        const try1 = await supabase.from('equipment_categories').select('id, name')
        if (!try1.error) catRows = (try1.data as any[]) || []
        else {
          const try2 = await supabase.from('categories').select('id, name')
          if (!try2.error) catRows = (try2.data as any[]) || []
          else catErr = try2.error
        }
        if (catErr) console.warn('categories fallback error:', catErr?.message || catErr)

        const catMap = new Map<number, string>(catRows.map(r => [Number(r.id), String(r.name)]))

        const list: Equipment[] = (eq || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          category_id: r.category_id ?? null,
          category_name: r.category_id != null ? (catMap.get(Number(r.category_id)) || null) : null,
          cost: r.cost == null ? null : Number(r.cost),
          final_price: r.final_price == null ? null : Number(r.final_price),
          db_note: r.notes ?? null,
        }))

        list.sort((a, b) => a.name.localeCompare(b.name))
        const catList: EqCategory[] = catRows
          .map(r => ({ id: Number(r.id), name: String(r.name) }))
          .sort((a, b) => a.name.localeCompare(b.name))

        if (!alive) return
        setEquipment(list)
        setCategories(catList)
        setLoading(false)
      } catch (e) {
        if (!alive) return
        console.error('equipment load error:', e)
        setEquipment([])
        setCategories([])
        setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  return { equipment, categories, loading }
}

/* ---------- Page ---------- */
export default function EventCalculatorPage() {
  const { dishes, loading } = useFinalDishes()
  const { equipment, categories, loading: eqLoading } = useEquipment()

  // hydration guard
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // header
  const [header, setHeader] = useState<EventHeader>({
    name: '', host: '', poc: '', phone: '', email: '', company: '', date: '', time: '', location: '', pax: '', notes: '',
  })

  // tutte le categorie disponibili dai piatti (per checklist UI)
  const allCats = useMemo(() => {
    const s = new Set<string>()
    for (const d of dishes) if (d.category_name) s.add(d.category_name)
    return [ANY, ...Array.from(s).sort((a, b) => a.localeCompare(b))]
  }, [dishes])

  // ===== settings bundle: dinamico + persistenza =====
  const [bundleSettings, setBundleSettings] = useState<Record<string, BundleConfig>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('eventcalc.bundleSettings')
        if (raw) return JSON.parse(raw)
      } catch {}
    }
    return DEFAULT_BUNDLE_SETTINGS
  })

  // Stato salvataggio e messaggi
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  // carica bundle_settings da Supabase e sanifica label
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'bundle_settings')
          .single()
        if (!alive) return
        if (!error && data?.value) {
          const incoming = data.value as Record<string, BundleConfig>
          const sanitized = Object.fromEntries(
            Object.entries(incoming).map(([k, cfg]) => [
              k,
              { ...cfg, label: (cfg.label ?? k).trim() }
            ])
          ) as Record<string, BundleConfig>
          setBundleSettings(sanitized)
        }
      } catch {}
    })()
    return () => { alive = false }
  }, [])

  // salva su localStorage ad ogni modifica (cache locale)
  useEffect(() => {
    try { localStorage.setItem('eventcalc.bundleSettings', JSON.stringify(bundleSettings)) } catch {}
  }, [bundleSettings])

  const bundleTypes = useMemo(() => Object.keys(bundleSettings), [bundleSettings])

  const [cfgType, setCfgType] = useState<BundleType>(() => bundleTypes[0] || 'bundle-1')
  useEffect(() => {
    if (!bundleTypes.includes(cfgType) && bundleTypes.length) setCfgType(bundleTypes[0])
  }, [bundleTypes, cfgType])

  // add/remove type
  const [newTypeInput, setNewTypeInput] = useState('')
  function slugify(s: string) {
    return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `bundle-${Date.now()}`
  }
  function addBundleType() {
    const label = newTypeInput.trim() || 'New Bundle'
    const key = (() => {
      const base = slugify(label)
      let k = base, i = 1
      while (bundleSettings[k]) { k = `${base}-${i++}` }
      return k
    })()
    const def: BundleConfig = { label, maxModifiers: 0, dishCategories: [ANY], modifierSlots: [] }
    setBundleSettings(prev => ({ ...prev, [key]: def }))
    setCfgType(key)
    setNewTypeInput('')
  }
  function removeBundleType(key: string) {
    const inUse = bundles.some(b => b.type === key)
    if (inUse) { alert('Questo bundle type è in uso. Rimuovi/trasforma i bundle esistenti prima di cancellarlo.'); return }
    setBundleSettings(prev => {
      const { [key]: _, ...rest } = prev
      return rest
    })
  }

  // bundles + wizard
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [wizOpen, setWizOpen] = useState(false)
  const [wizType, setWizType] = useState<BundleType | null>(null)
  const [wizRows, setWizRows] = useState<BundleRow[]>([])
  const [wizError, setWizError] = useState<string>('')

  // equipment & staff
  const [eqRows, setEqRows] = useState<EqRow[]>([])
  const [staffRows, setStaffRows] = useState<StaffRow[]>([])

  // riepilogo
  const [transportCost, setTransportCost] = useState<number | ''>('')
  const [discountPct, setDiscountPct] = useState<number | ''>('') // resta in Summary
  const [extraFee, setExtraFee] = useState<number | ''>('')

  // lookup
  const dishMap = useMemo(() => new Map(dishes.map(d => [d.id, d])), [dishes])
  const equipmentMap = useMemo(() => new Map(equipment.map(e => [e.id, e])), [equipment])

  const labelForType = (t: BundleType) =>
    (bundleSettings[t]?.label || t)

  // helper: mantieni l’opzione selezionata anche se fuori filtro (per dishes)
  function withSelectedOption(options: Dish[], selectedId: Id | '') {
    if (!selectedId) return options
    const present = options.some(o => o.id === selectedId)
    if (present) return options
    const sel = dishMap.get(selectedId as Id)
    return sel ? [sel, ...options] : options
  }

  /* -------- Totals -------- */
  const foodCost = useMemo(() => {
    let t = 0
    for (const b of bundles) {
      for (const r of b.rows) {
        const d = r.dish_id ? dishMap.get(r.dish_id) : undefined
        const base = (d?.unit_cost || 0) * (r.qty || 0)
        const mods = (r.modifiers || []).reduce((a, mid) => a + (dishMap.get(mid)?.unit_cost || 0) * (r.qty || 0), 0)
        t += base + mods
      }
    }
    return t
  }, [bundles, dishMap])

  const foodPrice = useMemo(() => {
    let t = 0
    for (const b of bundles) {
      for (const r of b.rows) {
        const d = r.dish_id ? dishMap.get(r.dish_id) : undefined
        const base = (d?.price || 0) * (r.qty || 0)
        const mods = (r.modifiers || []).reduce((a, mid) => a + (dishMap.get(mid)?.price || 0) * (r.qty || 0), 0)
        t += base + mods
      }
    }
    return t
  }, [bundles, dishMap])

  const equipmentCost = useMemo(
    () => eqRows.reduce((a, r) => {
      const item = r.equipment_id ? equipmentMap.get(r.equipment_id) : undefined
      return a + ((item?.cost || 0) * (r.qty || 0))
    }, 0),
    [eqRows, equipmentMap]
  )
  const equipmentPrice = useMemo(
    () => eqRows.reduce((a, r) => {
      const item = r.equipment_id ? equipmentMap.get(r.equipment_id) : undefined
      return a + ((item?.final_price || 0) * (r.qty || 0))
    }, 0),
    [eqRows, equipmentMap]
  )

  const staffCost = useMemo(
    () => staffRows.reduce((a, r) => a + (r.hours || 0) * (r.rate || 0), 0),
    [staffRows]
  )
  const staffPrice = useMemo(
    () => staffRows.reduce((a, r) => {
      const base = (r.hours || 0) * (r.rate || 0)
      const price = base * (1 + (r.markupPct || 0) / 100)
      return a + price
    }, 0),
    [staffRows]
  )

  const totalCost  = foodCost + equipmentCost + staffCost + Number(transportCost || 0)
  const totalPrice = foodPrice + equipmentPrice + staffPrice
  const discounted = totalPrice * (1 - Number(discountPct || 0) / 100)
  const finalPrice = discounted + Number(extraFee || 0)

  /* -------- Bundle ops -------- */
  function requiredCountFor(t: BundleType) {
    const cfg = bundleSettings[t]
    if (!cfg) return 0
    const limit = effectiveLimit(cfg)
    return cfg.modifierSlots.slice(0, limit).filter(s => s.required).length
  }
  function blankRowFor(t: BundleType): BundleRow {
    const req = requiredCountFor(t)
    return { id: uuid(), dish_id: '', qty: 1, modifiers: Array(req).fill('') }
  }

  function removeBundle(id: string) {
    setBundles(b => b.filter(x => x.id !== id))
  }
  function addRow(bid: string) {
    setBundles(prev => prev.map(x =>
      x.id !== bid ? x : { ...x, rows: [...x.rows, blankRowFor(x.type)] }
    ))
  }
  function changeRow(bid: string, rid: string, patch: Partial<BundleRow>) {
    setBundles(prev => prev.map(b => b.id !== bid ? b : { ...b, rows: b.rows.map(r => (r.id === rid ? { ...r, ...patch } : r)) }))
  }
  function removeRow(bid: string, rid: string) {
    setBundles(prev => prev.map(b => b.id !== bid ? b : { ...b, rows: b.rows.filter(r => r.id !== rid) }))
  }
  function addModifier(bid: string, rid: string) {
    setBundles(prev =>
      prev.map(bundle => {
        if (bundle.id !== bid) return bundle
        const cfg = bundleSettings[bundle.type]
        const limit = effectiveLimit(cfg)
        return {
          ...bundle,
          rows: bundle.rows.map(row => {
            if (row.id !== rid) return row
            if (row.modifiers.length >= limit) return row
            const nextIdx = row.modifiers.length
            if (!cfg?.modifierSlots[nextIdx]) return row
            return { ...row, modifiers: [...row.modifiers, ''] }
          }),
        }
      })
    )
  }
  function changeModifier(bid: string, rid: string, idx: number, newDishId: Id) {
    setBundles(prev =>
      prev.map(bundle =>
        bundle.id !== bid ? bundle : {
          ...bundle,
          rows: bundle.rows.map(row =>
            row.id !== rid ? row : { ...row, modifiers: row.modifiers.map((m, i) => (i === idx ? newDishId : m)) }
          ),
        }
      )
    )
  }
  function removeModifier(bid: string, rid: string, idx: number) {
    setBundles(prev =>
      prev.map(bundle =>
        bundle.id !== bid ? bundle : {
          ...bundle,
          rows: bundle.rows.map(row =>
            row.id !== rid ? row : { ...row, modifiers: row.modifiers.filter((_, i) => i !== idx) }
          ),
        }
      )
    )
  }

  /* -------- Wizard -------- */
  function openWizard() {
    setWizType(null)
    setWizRows([])
    setWizError('')
    setWizOpen(true)
  }
  function chooseType(t: BundleType) {
    setWizType(t)
    setWizRows([blankRowFor(t)])
    setWizError('')
  }
  function wizAddRow() { if (wizType) setWizRows(rows => [...rows, blankRowFor(wizType)]) }
  function wizChangeRow(rid: string, patch: Partial<BundleRow>) {
    setWizRows(rows => rows.map(r => (r.id === rid ? { ...r, ...patch } : r)))
  }
  function wizRemoveRow(rid: string) {
    setWizRows(rows => rows.filter(r => r.id !== rid))
  }
  function wizAddModifier(rid: string) {
    if (!wizType) return
    const cfg = bundleSettings[wizType]
    const limit = effectiveLimit(cfg)
    setWizRows(rows =>
      rows.map(r => {
        if (r.id !== rid) return r
        if (r.modifiers.length >= limit) return r
        const nextIdx = r.modifiers.length
        if (!cfg?.modifierSlots[nextIdx]) return r
        return { ...r, modifiers: [...r.modifiers, ''] }
      })
    )
  }
  function wizChangeMod(rid: string, idx: number, newDishId: Id) {
    setWizRows(rows =>
      rows.map(r => (r.id !== rid ? r : { ...r, modifiers: r.modifiers.map((m, i) => (i === idx ? newDishId : m)) }))
    )
  }
  function wizRemoveMod(rid: string, idx: number) {
    setWizRows(rows => rows.map(r => (r.id !== rid ? r : { ...r, modifiers: r.modifiers.filter((_, i) => i !== idx) })))
  }

  function validateWizard(): string {
    if (!wizType) return 'Seleziona un tipo bundle'
    const cfg = bundleSettings[wizType]
    if (!cfg) return 'Configurazione bundle mancante'
    const limit = effectiveLimit(cfg)
    for (const r of wizRows) {
      if (!r.dish_id) return 'Seleziona un dish per ogni riga'
      const d = dishMap.get(r.dish_id)
      if (!d || !dishAllowedByCfg(cfg, d)) return 'Il dish scelto non è ammesso per questo bundle'
      cfg.modifierSlots.slice(0, limit).forEach((slot, idx) => {
        if (slot.required) {
          const mv = r.modifiers[idx]
          const modDish = mv ? dishMap.get(mv) : undefined
          if (!mv || !modDish || !modifierAllowedByCfg(cfg, idx, modDish)) {
            throw new Error(`Compila il modifier richiesto: ${slot.label}`)
          }
        }
      })
    }
    return ''
  }

  function confirmBundle() {
    try {
      const msg = validateWizard()
      setWizError(msg)
      if (msg) return
      if (!wizType) return
      const cfg = bundleSettings[wizType]
      const limit = effectiveLimit(cfg)
      const cleaned = wizRows.map(r => ({ ...r, modifiers: r.modifiers.slice(0, limit) }))
      setBundles(b => [...b, { id: uuid(), type: wizType, label: labelForType(wizType), rows: cleaned }])
      setWizOpen(false)
      setWizRows([])
      setWizError('')
    } catch (e: any) {
      setWizError(e?.message || 'Verifica i campi obbligatori')
    }
  }

  /* -------- APPLY & SAVE SETTINGS -------- */
  function applySettingsToBundles() {
    setBundles(prev => prev.map(bundle => {
      const cfg = bundleSettings[bundle.type]
      if (!cfg) return bundle
      const limit = effectiveLimit(cfg)

      const rows = bundle.rows.map(r => {
        let dish_id = r.dish_id
        if (dish_id) {
          const d = dishMap.get(dish_id)
          if (!d || !dishAllowedByCfg(cfg, d)) dish_id = ''
        }

        let modifiers = r.modifiers.slice(0, limit).map((mid, idx) => {
          if (!mid) return mid
          const md = dishMap.get(mid)
          return md && modifierAllowedByCfg(cfg, idx, md) ? mid : ''
        })

        cfg.modifierSlots.slice(0, limit).forEach((slot, idx) => {
          if (slot.required && typeof modifiers[idx] === 'undefined') {
            modifiers[idx] = ''
          }
        })

        return { ...r, dish_id, modifiers }
      })

      return { ...bundle, rows }
    }))
  }

  async function handleSaveSettings() {
    setSaving(true)
    try {
      const payload = { key: 'bundle_settings', value: bundleSettings }
      const { error } = await supabase.from('app_settings').upsert(payload, { onConflict: 'key' })
      if (error) throw error
      setSaveMsg('Impostazioni salvate (Supabase)')
    } catch (_) {
      try { localStorage.setItem('eventcalc.bundleSettings', JSON.stringify(bundleSettings)) } catch {}
      setSaveMsg('Impostazioni salvate (locale)')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 2500)
    }
  }

  function handleApplySettings() {
    applySettingsToBundles()
    setSaveMsg('Impostazioni applicate ai bundle')
    setTimeout(() => setSaveMsg(null), 2000)
  }

  /* -------- Equipment: helpers -------- */
  function addEqRow() {
    setEqRows(rows => [...rows, { id: uuid(), category_id: null, equipment_id: '', qty: 1, notes: '' }])
  }

  function setEqCategory(rowId: string, catValue: string) {
    const nextCat: number | null = catValue === '' ? null : Number(catValue)
    setEqRows(rows => rows.map(r => {
      if (r.id !== rowId) return r
      let equipment_id = r.equipment_id
      if (equipment_id) {
        const item = equipmentMap.get(equipment_id)
        const itemCat = item?.category_id ?? null
        const matches = nextCat == null || itemCat === nextCat
        if (!matches) equipment_id = ''
      }
      return { ...r, category_id: nextCat, equipment_id }
    }))
  }

  function setEqItem(rowId: string, equipmentId: string) {
    setEqRows(rows => rows.map(r => {
      if (r.id !== rowId) return r
      const item = equipmentMap.get(equipmentId)
      let category_id = r.category_id
      if (category_id == null) category_id = item?.category_id ?? null
      return { ...r, equipment_id: equipmentId, category_id }
    }))
  }

  function changeEqRow(id: string, patch: Partial<EqRow>) {
    setEqRows(rows => rows.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }
  function removeEqRow(id: string) { setEqRows(rows => rows.filter(r => r.id !== id)) }

  /* -------- Staff -------- */
  function addStaffRow() {
    setStaffRows(rows => [...rows, { id: uuid(), role: '', hours: 4, rate: 0, markupPct: 0 }])
  }
  function changeStaffRow(id: string, patch: Partial<StaffRow>) {
    setStaffRows(rows => rows.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }
  function removeStaffRow(id: string) { setStaffRows(rows => rows.filter(r => r.id !== id)) }

  /* ---------------- UI ---------------- */
  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Event Calculator</h1>
        <div className="text-sm opacity-80">Currency: VND</div>
      </header>

      {/* Header evento */}
      <section className="grid md:grid-cols-2 gap-4 bg-white/5 rounded-xl p-4">
        <Field label="Event" value={header.name} onChange={v => setHeader({ ...header, name: v })} />
        <Field label="Date" type="date" value={header.date} onChange={v => setHeader({ ...header, date: v })} />
        <Field label="Host" value={header.host} onChange={v => setHeader({ ...header, host: v })} />
        <Field label="Time" type="time" value={header.time} onChange={v => setHeader({ ...header, time: v })} />
        <Field label="Point of Contact" value={header.poc} onChange={v => setHeader({ ...header, poc: v })} />
        <Field label="Phone" value={header.phone} onChange={v => setHeader({ ...header, phone: v })} />
        <Field label="Company Info" value={header.company} onChange={v => setHeader({ ...header, company: v })} />
        <Field label="eMail" value={header.email} onChange={v => setHeader({ ...header, email: v })} />
        <Field label="Location" value={header.location} onChange={v => setHeader({ ...header, location: v })} />
        <label className="flex flex-col gap-1">
          <span className="text-sm opacity-80">Number of Pax</span>
          <input
            type="number"
            min={0}
            className="bg-transparent outline-none p-2 rounded-lg border border-white/10"
            value={String(header.pax)}
            onChange={e => setHeader({ ...header, pax: e.target.value === '' ? '' : clampPos(toNum(e.target.value, 0)) })}
          />
        </label>
        <div className="md:col-span-2">
          <Field label="Notes" textarea value={header.notes} onChange={v => setHeader({ ...header, notes: v })} />
        </div>
      </section>

      {/* ===== Bundle Settings ===== */}
      {mounted && (
        <section className="space-y-4 bg-white/5 rounded-xl p-4">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold">Bundle Settings</h2>
              <div className="text-xs opacity-70">Crea/cancella tipi e scegli categorie ammesse per dish e modifiers.</div>
            </div>
            <div className="flex items-center gap-2">
              <input
                className="bg-transparent outline-none p-2 rounded-lg border border-white/10"
                placeholder="New bundle label…"
                value={newTypeInput}
                onChange={e => setNewTypeInput(e.target.value)}
              />
              <button className="text-sm px-3 py-1.5 rounded bg-green-600/90 hover:bg-green-600 text-white" onClick={addBundleType}>
                + Add type
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm opacity-80">Bundle type</label>
            <select
              className="bg-transparent outline-none border border-white/10 rounded-lg p-1"
              value={cfgType}
              onChange={e => setCfgType(e.target.value)}
            >
              {bundleTypes.map(bt => (
                <option key={bt} value={bt} suppressHydrationWarning>
                  {(mounted ? bundleSettings[bt]?.label : DEFAULT_BUNDLE_SETTINGS[bt]?.label) || bt}
                </option>
              ))}
            </select>
            <button
              className="text-sm px-3 py-1.5 rounded border border-white/20 hover:bg-white/10"
              onClick={() => removeBundleType(cfgType)}
              title="Delete this type"
            >
              Delete type
            </button>
          </div>

          {(() => {
            const cfg = bundleSettings[cfgType]
            if (!cfg) return <div className="text-sm opacity-70">Seleziona un type</div>

            const updateCfg = (patch: Partial<BundleConfig>) =>
              setBundleSettings(prev => ({ ...prev, [cfgType]: { ...prev[cfgType], ...patch } }))

            const updateSlot = (idx: number, patch: Partial<ModifierSlotCfg>) =>
              setBundleSettings(prev => {
                const slots = [...prev[cfgType].modifierSlots]
                slots[idx] = { ...slots[idx], ...patch }
                return { ...prev, [cfgType]: { ...prev[cfgType], modifierSlots: slots } }
              })

            const addSlot = () =>
              setBundleSettings(prev => {
                if (prev[cfgType].modifierSlots.length >= MAX_MODS) return prev
                const slots = [...prev[cfgType].modifierSlots, { label: 'Modifier', categories: [ANY], required: false }]
                return {
                  ...prev,
                  [cfgType]: {
                    ...prev[cfgType],
                    modifierSlots: slots,
                    maxModifiers: Math.min(Math.max(prev[cfgType].maxModifiers, slots.length), MAX_MODS),
                  },
                }
              })

            const removeSlot = (idx: number) =>
              setBundleSettings(prev => {
                const slots = prev[cfgType].modifierSlots.filter((_, i) => i !== idx)
                const newMax = Math.min(prev[cfgType].maxModifiers, slots.length, MAX_MODS)
                return { ...prev, [cfgType]: { ...prev[cfgType], modifierSlots: slots, maxModifiers: newMax } }
              })

            const toggleDishCat = (cat: string) => {
              const has = cfg.dishCategories.includes(cat)
              const next = has ? cfg.dishCategories.filter(c => c !== cat) : [...cfg.dishCategories, cat]
              updateCfg({ dishCategories: next.length ? next : [ANY] })
            }
            const toggleSlotCat = (idx: number, cat: string) => {
              const slot = cfg.modifierSlots[idx]
              const has = slot.categories.includes(cat)
              const next = has ? slot.categories.filter(c => c !== cat) : [...slot.categories, cat]
              updateSlot(idx, { categories: next.length ? next : [ANY] })
            }

            return (
              <div className="grid md:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-sm opacity-80">Label</span>
                  <input
                    className="bg-transparent outline-none p-2 rounded-lg border border-white/10"
                    value={cfg.label}
                    onChange={e => updateCfg({ label: e.target.value })}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm opacity-80">Max modifiers (0..{MAX_MODS})</span>
                  <input
                    type="number" min={0} max={MAX_MODS}
                    className="bg-transparent outline-none p-2 rounded-lg border border-white/10"
                    value={cfg.maxModifiers}
                    onChange={e => updateCfg({ maxModifiers: Math.max(0, Math.min(MAX_MODS, toNum(e.target.value, 0))) })}
                  />
                </label>

                {/* Categorie Dish */}
                <div className="md:col-span-2">
                  <div className="text-sm opacity-80 mb-1">Dish categories allowed</div>
                  <CatChecklist allCats={allCats} selected={cfg.dishCategories} onToggle={toggleDishCat} />
                </div>

                {/* Slots */}
                <div className="md:col-span-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Modifier slots</div>
                    <button
                      className="text-sm px-3 py-1.5 rounded border border-white/20 hover:bg-white/10 disabled:opacity-50"
                      onClick={addSlot}
                      disabled={cfg.modifierSlots.length >= MAX_MODS}
                    >
                      + Add slot
                    </button>
                  </div>

                  {cfg.modifierSlots.length === 0 && <div className="text-sm opacity-70">No modifier slots</div>}

                  <div className="grid gap-3">
                    {cfg.modifierSlots.map((s, i) => (
                      <div key={i} className="grid md:grid-cols-3 gap-3 items-start border border-white/10 rounded-lg p-3">
                        <label className="flex flex-col gap-1">
                          <span className="text-sm opacity-80">Label slot {i + 1}</span>
                          <input
                            className="bg-transparent outline-none p-2 rounded-lg border border-white/10"
                            value={s.label}
                            onChange={e => updateSlot(i, { label: e.target.value })}
                          />
                        </label>
                        <div className="md:col-span-2">
                          <div className="text-sm opacity-80 mb-1">Allowed categories for slot {i + 1}</div>
                          <CatChecklist allCats={allCats} selected={s.categories} onToggle={(c) => toggleSlotCat(i, c)} />
                        </div>
                        <div className="flex items-center gap-4 md:col-span-3">
                          <label className="inline-flex items-center gap-2">
                            <input type="checkbox" checked={s.required} onChange={e => updateSlot(i, { required: e.target.checked })} />
                            <span className="text-sm">Required</span>
                          </label>
                          <button className="text-red-500 hover:text-red-400 text-sm" onClick={() => removeSlot(i)} title="Remove slot">
                            <TrashIcon className="w-4 h-4 inline" /> Remove slot
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottoni Salva / OK */}
                <div className="md:col-span-2 flex items-center justify-end gap-2 pt-1">
                  <button
                    className="text-sm px-3 py-1.5 rounded border border-white/20 hover:bg-white/10 disabled:opacity-50"
                    onClick={handleApplySettings}
                  >
                    OK / Applica
                  </button>
                  <button
                    className="text-sm px-3 py-1.5 rounded-lg bg-sky-600/90 hover:bg-sky-600 text-white disabled:opacity-50"
                    onClick={handleSaveSettings}
                    disabled={saving}
                  >
                    {saving ? 'Salvo…' : 'Salva'}
                  </button>
                </div>
                {saveMsg && <div className="md:col-span-2 text-xs opacity-70 text-right">{saveMsg}</div>}
              </div>
            )
          })()}
        </section>
      )}

      {/* Bundles */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Bundles</h2>
          <AddBtn onClick={openWizard}>Add bundle</AddBtn>
        </div>

        {bundles.length === 0 && (
          <p className="text-sm opacity-70">
            Aggiungi un bundle. Ogni riga ha piatto, fino a {MAX_MODS} modifiers (in base al type), <b>qty</b>, <b>cost</b> e <b>price</b>.
          </p>
        )}

        <div className="space-y-4">
          {bundles.map(b => {
            const cfg = bundleSettings[b.type]
            const limit = effectiveLimit(cfg)
            const slots = Array.from({ length: limit }, (_, i) => i)

            return (
              <div key={b.id} className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-medium">{b.label}</div>
                  <button onClick={() => removeBundle(b.id)} className="text-red-500 hover:text-red-400 text-sm flex items-center gap-1">
                    <TrashIcon className="w-4 h-4" /> Remove
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead>
                      <tr className="bg-white/10">
                        <Th className="px-3 py-2 min-w-[300px]">Dish</Th>
                        {slots.map(i => (
                          <Th key={i} className="px-3 py-2 min-w-[240px]">
                            {cfg?.modifierSlots?.[i]?.label || `Modifier ${i + 1}`}
                          </Th>
                        ))}
                        <Th className="px-3 py-2 text-right min-w-[96px]">Qty</Th>
                        <Th className="px-3 py-2 text-right min-w-[120px]">Cost</Th>
                        <Th className="px-3 py-2 text-right min-w-[120px]">Price</Th>
                        <Th className="px-3 py-2 text-right min-w-[72px]"></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.rows.map(r => {
                        const baseDish = r.dish_id ? dishMap.get(r.dish_id) : undefined
                        const baseCost = (baseDish?.unit_cost || 0) * (r.qty || 0)
                        const basePrice = (baseDish?.price || 0) * (r.qty || 0)

                        const dishOptionsRaw = cfg ? dishes.filter(d => dishAllowedByCfg(cfg, d)) : dishes
                        const dishOptions = withSelectedOption(dishOptionsRaw, r.dish_id)

                        const modCosts = slots.map(i => {
                          const mid = r.modifiers[i]
                          const md  = mid ? dishMap.get(mid) : undefined
                          return (md?.unit_cost || 0) * (r.qty || 0)
                        })
                        const modPrices = slots.map(i => {
                          const mid = r.modifiers[i]
                          const md  = mid ? dishMap.get(mid) : undefined
                          return (md?.price || 0) * (r.qty || 0)
                        })

                        const rowCost = baseCost + modCosts.reduce((a, x) => a + x, 0)
                        const rowPrice = basePrice + modPrices.reduce((a, x) => a + x, 0)
                        const dishOutOfScope = !!(baseDish && cfg && !dishAllowedByCfg(cfg, baseDish))

                        return (
                          <tr key={r.id} className="border-b border-white/10 align-top">
                            {/* Dish */}
                            <td className="px-3 py-2 min-w-[300px]">
                              <div className="flex flex-col gap-1">
                                <select
                                  className="bg-transparent outline-none p-1 w-full"
                                  value={r.dish_id}
                                  onChange={e => changeRow(b.id, r.id, { dish_id: e.target.value as Id | '' })}
                                >
                                  <option value="">Select dish</option>
                                  {dishOptions.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}{d.category_name ? ` (${d.category_name})` : ''}</option>
                                  ))}
                                </select>
                                {dishOutOfScope && <span className="text-xs text-amber-400">Dish fuori dalle categorie ammesse da questo bundle</span>}
                                <div>
                                  <button
                                    className="text-xs px-2 py-1 rounded border border-white/20 hover:bg-white/10 disabled:opacity-50"
                                    onClick={() => addModifier(b.id, r.id)}
                                    disabled={r.modifiers.length >= limit || !cfg?.modifierSlots[r.modifiers.length]}
                                  >
                                    + Modifier
                                  </button>
                                </div>
                              </div>
                            </td>

                            {/* Modifiers dinamici */}
                            {slots.map(i => {
                              const mid = r.modifiers[i]
                              const slotCfg = cfg?.modifierSlots?.[i]
                              const optsRaw = cfg ? dishes.filter(d => modifierAllowedByCfg(cfg, i, d)) : dishes
                              const opts = withSelectedOption(optsRaw, mid ?? '')
                              const required = !!slotCfg?.required
                              return (
                                <td key={i} className="px-3 py-2 min-w-[240px]">
                                  {typeof mid === 'undefined' ? (
                                    <span className="opacity-50">—</span>
                                  ) : (
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-2">
                                        <select
                                          className="bg-transparent outline-none p-1 w-full"
                                          value={mid}
                                          onChange={e => changeModifier(b.id, r.id, i, e.target.value as Id)}
                                        >
                                          <option value="">{slotCfg?.label || `Modifier ${i + 1}`}</option>
                                          {opts.map(md => (
                                            <option key={md.id} value={md.id}>{md.name}{md.category_name ? ` (${md.category_name})` : ''}</option>
                                          ))}
                                        </select>
                                        <button className="text-red-500 hover:text-red-400" onClick={() => removeModifier(b.id, r.id, i)} title="Remove modifier">
                                          <TrashIcon className="w-4 h-4" />
                                        </button>
                                      </div>
                                      {required && !mid && <span className="text-xs text-red-400">Required</span>}
                                    </div>
                                  )}
                                </td>
                              )
                            })}

                            {/* Qty */}
                            <td className="px-3 py-2 text-right min-w-[96px]">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                className="bg-transparent outline-none p-1 w-24 text-right"
                                value={r.qty}
                                onChange={e => changeRow(b.id, r.id, { qty: clampPos(toNum(e.target.value, 0)) })}
                              />
                            </td>

                            {/* Totals */}
                            <td className="px-3 py-2 text-right min-w-[120px]">{fmt(rowCost)}</td>
                            <td className="px-3 py-2 text-right min-w-[120px]">{fmt(rowPrice)}</td>

                            {/* actions */}
                            <td className="px-3 py-2 text-right min-w-[72px]">
                              <button className="text-red-500 hover:text-red-400" onClick={() => removeRow(b.id, r.id)} title="Remove row">
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="pt-2">
                  <button
                    className="text-sm px-3 py-1.5 rounded border border-white/20 hover:bg-white/10 disabled:opacity-50"
                    onClick={() => addRow(b.id)}
                    disabled={loading && dishes.length === 0}
                    title={loading && dishes.length === 0 ? 'Loading dishes…' : 'Add a new dish row'}
                  >
                    Add row
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Wizard dialog */}
      <Dialog open={wizOpen} onClose={setWizOpen}>
        <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
        <div className="fixed inset-0 flex items-start justify-center p-4">
          <Dialog.Panel className="w-auto max-w-[96vw] bg-neutral-900 border border-white/10 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <Dialog.Title className="text-lg font-semibold">
                {!wizType ? 'Choose bundle type' : `Configure ${labelForType(wizType)}`}
              </Dialog.Title>
              <button className="opacity-80 hover:opacity-100" onClick={() => setWizOpen(false)}>
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {!wizType ? (
              <div className="grid sm:grid-cols-2 gap-3">
                {bundleTypes.map(bt => (
                  <button
                    key={bt}
                    onClick={() => chooseType(bt)}
                    className="p-3 rounded-lg border border-white/10 hover:bg-white/10 text-left"
                  >
                    <div className="font-medium" suppressHydrationWarning>
                      {(mounted ? bundleSettings[bt]?.label : DEFAULT_BUNDLE_SETTINGS[bt]?.label) || bt}
                    </div>
                    <div className="text-xs opacity-70">Seleziona e poi aggiungi righe con piatti e i modifiers richiesti.</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{labelForType(wizType)} {loading ? <span className="text-xs opacity-60">(loading dishes…)</span> : null}</div>
                  <div className="flex gap-2">
                    <button className="text-sm px-3 py-1.5 rounded border border-white/20 hover:bg-white/10" onClick={wizAddRow}>+ Add row</button>
                    <button className="text-sm px-3 py-1.5 rounded-lg bg-sky-600/90 hover:bg-sky-600 text-white disabled:opacity-50" onClick={confirmBundle} disabled={wizRows.length === 0}>
                      Add bundle
                    </button>
                  </div>
                </div>

                {wizError && <div className="text-sm text-red-400">{wizError}</div>}

                {(() => {
                  const cfg = wizType ? bundleSettings[wizType] : null
                  const limit = effectiveLimit(cfg)
                  const slots = Array.from({ length: limit }, (_, i) => i)

                  return (
                    <div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-white/10">
                            <Th className="px-3 py-2 min-w-[300px]">Dish</Th>
                            {slots.map(i => (
                              <Th key={i} className="px-3 py-2 min-w-[240px]">{cfg?.modifierSlots?.[i]?.label || `Modifier ${i + 1}`}</Th>
                            ))}
                            <Th className="px-3 py-2 text-right min-w-[96px]">Qty</Th>
                            <Th className="px-3 py-2 text-right min-w-[120px]">Cost</Th>
                            <Th className="px-3 py-2 text-right min-w-[120px]">Price</Th>
                            <Th className="px-3 py-2 min-w-[72px]"></Th>
                          </tr>
                        </thead>
                        <tbody>
                          {wizRows.map(r => {
                            const baseDish = r.dish_id ? dishMap.get(r.dish_id) : undefined
                            const baseCost = (baseDish?.unit_cost || 0) * (r.qty || 0)
                            const basePrice = (baseDish?.price || 0) * (r.qty || 0)

                            const dishOptionsRaw = cfg ? dishes.filter(d => dishAllowedByCfg(cfg, d)) : dishes
                            const dishOptions = withSelectedOption(dishOptionsRaw, r.dish_id)

                            const modCosts = slots.map(i => {
                              const mid = r.modifiers[i]
                              const md  = mid ? dishMap.get(mid) : undefined
                              return (md?.unit_cost || 0) * (r.qty || 0)
                            })
                            const modPrices = slots.map(i => {
                              const mid = r.modifiers[i]
                              const md  = mid ? dishMap.get(mid) : undefined
                              return (md?.price || 0) * (r.qty || 0)
                            })
                            const rowCost = baseCost + modCosts.reduce((a, x) => a + x, 0)
                            const rowPrice = basePrice + modPrices.reduce((a, x) => a + x, 0)

                            return (
                              <tr key={r.id} className="border-b border-white/10 align-top">
                                <td className="px-3 py-2 min-w-[300px]">
                                  <div className="flex items-center gap-2">
                                    <select
                                      className="bg-transparent outline-none p-1 w-full"
                                      value={r.dish_id}
                                      onChange={e => wizChangeRow(r.id, { dish_id: e.target.value as Id | '' })}
                                    >
                                      <option value="">Select dish</option>
                                      {dishOptions.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}{d.category_name ? ` (${d.category_name})` : ''}</option>
                                      ))}
                                    </select>
                                    {r.modifiers.length < limit && cfg?.modifierSlots[r.modifiers.length] && (
                                      <button className="text-xs px-2 py-1 rounded border border-white/20 hover:bg-white/10" onClick={() => wizAddModifier(r.id)}>
                                        + Modifier
                                      </button>
                                    )}
                                  </div>
                                </td>

                                {slots.map(i => {
                                  const mid = r.modifiers[i]
                                  const slotCfg = cfg?.modifierSlots?.[i]
                                  const optsRaw = cfg ? dishes.filter(d => modifierAllowedByCfg(cfg, i, d)) : dishes
                                  const opts = withSelectedOption(optsRaw, mid ?? '')
                                  const required = !!slotCfg?.required
                                  return (
                                    <td key={i} className="px-3 py-2 min-w-[240px]">
                                      {typeof mid === 'undefined' ? (
                                        <span className="opacity-50">—</span>
                                      ) : (
                                        <div className="flex flex-col gap-1">
                                          <div className="flex items-center gap-2">
                                            <select
                                              className="bg-transparent outline-none p-1 w-full"
                                              value={mid}
                                              onChange={e => wizChangeMod(r.id, i, e.target.value as Id)}
                                            >
                                              <option value="">{slotCfg?.label || `Modifier ${i + 1}`}</option>
                                              {opts.map(md => (<option key={md.id} value={md.id}>{md.name}{md.category_name ? ` (${md.category_name})` : ''}</option>))}
                                            </select>
                                            <button className="text-red-500 hover:text-red-400" onClick={() => wizRemoveMod(r.id, i)} title="Remove modifier">
                                              <TrashIcon className="w-4 h-4" />
                                            </button>
                                          </div>
                                          {required && !mid && <span className="text-xs text-red-400">Required</span>}
                                        </div>
                                      )}
                                    </td>
                                  )
                                })}

                                <td className="px-3 py-2 text-right min-w-[96px]">
                                  <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    className="bg-transparent outline-none p-1 w-24 text-right"
                                    value={r.qty}
                                    onChange={e => wizChangeRow(r.id, { qty: clampPos(toNum(e.target.value, 0)) })}
                                  />
                                </td>

                                <td className="px-3 py-2 text-right min-w-[120px]">{fmt(rowCost)}</td>
                                <td className="px-3 py-2 text-right min-w-[120px]">{fmt(rowPrice)}</td>

                                <td className="px-3 py-2 text-right min-w-[72px]">
                                  <button className="text-red-500 hover:text-red-400" onClick={() => wizRemoveRow(r.id)} title="Remove row">
                                    <TrashIcon className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                })()}
              </div>
            )}
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Equipment - Item prima di Category */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Equipment</h2>
          <AddBtn onClick={addEqRow}>Add equipment</AddBtn>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-white/10">
                <Th className="px-3 py-2">Item</Th>
                <Th className="px-3 py-2">Category</Th>
                <Th className="px-3 py-2 text-right min-w-[96px]">Qty</Th>
                <Th className="px-3 py-2 text-right min-w-[120px]">Cost</Th>
                <Th className="px-3 py-2 text-right min-w-[120px]">Price</Th>
                <Th className="px-3 py-2">Notes</Th>
                <Th className="px-3 py-2"></Th>
              </tr>
            </thead>
            <tbody>
              {eqRows.map(r => {
                const item = r.equipment_id ? equipmentMap.get(r.equipment_id) : undefined
                const totalCost = (item?.cost || 0) * (r.qty || 0)
                const totalPrice = (item?.final_price || 0) * (r.qty || 0)

                const itemOptions = (() => {
                  if (r.category_id == null) return equipment
                  return equipment.filter(e => (e.category_id ?? null) === r.category_id)
                })()

                return (
                  <tr key={r.id} className="border-b border-white/10 align-top">
                    {/* Item */}
                    <td className="px-3 py-2">
                      <select
                        className="bg-transparent outline-none p-1 min-w-[260px]"
                        value={r.equipment_id}
                        onChange={e => setEqItem(r.id, e.target.value as Id)}
                      >
                        <option value="">{eqLoading ? 'Loading…' : '-'}</option>
                        {itemOptions.map(it => (
                          <option key={it.id} value={it.id}>
                            {it.name}{it.category_name ? ` (${it.category_name})` : ''}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Category */}
                    <td className="px-3 py-2">
                      <select
                        className="bg-transparent outline-none p-1 min-w-[180px]"
                        value={r.category_id == null ? '' : String(r.category_id)}
                        onChange={e => setEqCategory(r.id, e.target.value)}
                      >
                        <option value="">{ANY}</option>
                        {categories.map(c => (
                          <option key={c.id} value={String(c.id)}>{c.name}</option>
                        ))}
                      </select>
                    </td>

                    {/* Qty */}
                    <td className="px-3 py-2 text-right min-w-[96px]">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="bg-transparent outline-none p-1 w-20 text-right"
                        value={r.qty}
                        onChange={e => changeEqRow(r.id, { qty: clampPos(toNum(e.target.value, 0)) })}
                      />
                    </td>

                    {/* Totals */}
                    <td className="px-3 py-2 text-right min-w-[120px]">{fmt(totalCost)}</td>
                    <td className="px-3 py-2 text-right min-w-[120px]">{fmt(totalPrice)}</td>

                    {/* Notes */}
                    <td className="px-3 py-2">
                      <input
                        className="bg-transparent outline-none p-1 w-full"
                        value={r.notes}
                        placeholder={item?.db_note ? `DB note: ${item.db_note}` : ''}
                        onChange={e => changeEqRow(r.id, { notes: e.target.value })}
                      />
                    </td>

                    {/* Remove */}
                    <td className="px-3 py-2 text-right">
                      <button className="text-red-500 hover:text-red-400" onClick={() => removeEqRow(r.id)} title="Remove">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-right pr-2 opacity-70">Totals</td>
                <td className="px-3 py-2 text-right pr-2 opacity-70"></td>
                <td className="px-3 py-2 text-right font-medium">{fmt(equipmentCost)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmt(equipmentPrice)}</td>
                <td></td><td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Staff */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Staff</h2>
          <AddBtn onClick={addStaffRow}>Add staff</AddBtn>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-white/10">
                <Th className="px-3 py-2">Position</Th>
                <Th className="px-3 py-2 text-right min-w-[96px]">Hours</Th>
                <Th className="px-3 py-2 text-right min-w-[96px]">Rate</Th>
                <Th className="px-3 py-2 text-right min-w-[120px]">Cost</Th>
                <Th className="px-3 py-2 text-right min-w-[120px]">Mark Up %</Th>
                <Th className="px-3 py-2 text-right min-w-[120px]">Price</Th>
                <Th className="px-3 py-2"></Th>
              </tr>
            </thead>
            <tbody>
              {staffRows.map(r => {
                const base = (r.hours || 0) * (r.rate || 0)
                const price = base * (1 + (r.markupPct || 0) / 100)
                return (
                  <tr key={r.id} className="border-b border-white/10">
                    <td className="px-3 py-2">
                      <input
                        className="bg-transparent outline-none p-1 w-full"
                        value={r.role}
                        onChange={e => changeStaffRow(r.id, { role: e.target.value })}
                      />
                    </td>

                    <td className="px-3 py-2 text-right min-w-[96px]">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        className="bg-transparent outline-none p-1 w-24 text-right"
                        value={r.hours}
                        onChange={e => changeStaffRow(r.id, { hours: clampPos(toNum(e.target.value, 0)) })}
                      />
                    </td>

                    <td className="px-3 py-2 text-right min-w-[96px]">
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        className="bg-transparent outline-none p-1 w-24 text-right"
                        value={r.rate}
                        onChange={e => changeStaffRow(r.id, { rate: clampPos(toNum(e.target.value, 0)) })}
                      />
                    </td>

                    <td className="px-3 py-2 text-right min-w-[120px]">{fmt(base)}</td>

                    <td className="px-3 py-2 text-right min-w-[120px]">
                      <select
                        className="bg-transparent outline-none p-1 w-28 text-right"
                        value={String(r.markupPct)}
                        onChange={e => changeStaffRow(r.id, { markupPct: clampPos(toNum(e.target.value, 0)) })}
                      >
                        {[0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100].map(p => (
                          <option key={p} value={p}>{p}%</option>
                        ))}
                      </select>
                    </td>

                    <td className="px-3 py-2 text-right min-w-[120px]">{fmt(price)}</td>

                    <td className="px-3 py-2 text-right">
                      <button className="text-red-500 hover:text-red-400" onClick={() => removeStaffRow(r.id)} title="Remove">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="px-3 py-2 text-right pr-2 opacity-70" colSpan={3}>Totals</td>
                <td className="px-3 py-2 text-right font-medium">{fmt(staffCost)}</td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-right font-medium">{fmt(staffPrice)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Transportation */}
      <section className="space-y-2 bg-white/5 rounded-xl p-4">
        <h2 className="text-xl font-semibold">Transportation</h2>
        <div className="flex items-center justify-between gap-3">
          <div className="opacity-80">Transportation cost</div>
          <input
            type="number"
            min={0}
            step={1000}
            className="bg-transparent outline-none p-1 text-right w-40"
            value={transportCost}
            onChange={e => setTransportCost(e.target.value === '' ? '' : clampPos(toNum(e.target.value, 0)))}
          />
        </div>
      </section>

      {/* Extra Fee */}
      <section className="space-y-2 bg-white/5 rounded-xl p-4">
        <h2 className="text-xl font-semibold">Extra Fee</h2>
        <div className="flex items-center justify-between gap-3">
          <div className="opacity-80">Extra fee</div>
          <input
            type="number"
            min={0}
            step={1000}
            className="bg-transparent outline-none p-1 text-right w-40"
            value={extraFee}
            onChange={e => setExtraFee(e.target.value === '' ? '' : clampPos(toNum(e.target.value, 0)))}
          />
        </div>
      </section>

      {/* Summary */}
      <section className="space-y-3 bg-white/5 rounded-xl p-4">
        <h2 className="text-xl font-semibold">Summary</h2>
        <div className="grid md:grid-cols-2 gap-2">
          <SummaryRow label="Food Cost" value={fmt(foodCost)} />
          <SummaryRow label="Food Price" value={fmt(foodPrice)} />
          <SummaryRow label="Equipment Cost" value={fmt(equipmentCost)} />
          <SummaryRow label="Equipment Price" value={fmt(equipmentPrice)} />
          <SummaryRow label="Staff Cost" value={fmt(staffCost)} />
          <SummaryRow label="Staff Price" value={fmt(staffPrice)} />
          <SummaryRow label="Transportation" value={fmt(Number(transportCost || 0))} />
          <SummaryRow label="Extra Fee" value={fmt(Number(extraFee || 0))} />
          <SummaryRow label="Total Cost" value={fmt(totalCost)} bold />
          <SummaryRow label="Price" value={fmt(totalPrice)} />

          {/* Discount input */}
          <div className="flex items-center justify-between gap-3">
            <div className="opacity-80">Discount %</div>
            <input
              type="number"
              min={0}
              step={1}
              className="bg-transparent outline-none p-1 text-right w-28"
              value={discountPct}
              onChange={e => setDiscountPct(e.target.value === '' ? '' : clampPos(toNum(e.target.value, 0)))}
            />
          </div>

          <SummaryRow label="After Discount" value={fmt(discounted)} />
          <SummaryRow label="Final Price" value={fmt(finalPrice)} bold />
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button onClick={() => alert('Export quote PDF coming soon')} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-600/90 hover:bg-sky-600 text-white text-sm">
            <ArrowDownTrayIcon className="w-5 h-5" /> Export Quote
          </button>
          <button onClick={() => alert('Export contract PDF coming soon')} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm">
            <DocumentTextIcon className="w-5 h-5" /> Export Contract
          </button>
        </div>
      </section>
    </div>
  )
}

/* ---------- small UI helpers ---------- */
function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`text-left ${className}`}>{children}</th>
}
function Field({ label, value, onChange, type = 'text', textarea }: { label: string; value: string; onChange: (v: string) => void; type?: string; textarea?: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm opacity-80">{label}</span>
      {textarea ? (
        <textarea className="bg-transparent outline-none p-2 rounded-lg border border-white/10 min-h-[72px]" value={value} onChange={e => onChange(e.target.value)} />
      ) : (
        <input type={type} className="bg-transparent outline-none p-2 rounded-lg border border-white/10" value={value} onChange={e => onChange(e.target.value)} />
      )}
    </label>
  )
}
function AddBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600/90 hover:bg-green-600 text-white text-sm">
      <PlusIcon className="w-4 h-4" /> {children}
    </button>
  )
}
function SummaryRow({ label, value, bold = false }: { label: string; value: string | number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="opacity-80">{label}</div>
      <div className={bold ? 'font-semibold' : ''}>{value}</div>
    </div>
  )
}
function CatChecklist({ allCats, selected, onToggle }: { allCats: string[]; selected: string[]; onToggle: (c: string) => void }) {
  const sel = new Set(selected)
  return (
    <div className="flex flex-wrap gap-2">
      {allCats.map(cat => {
        const checked = sel.has(cat)
        return (
          <label key={cat} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs cursor-pointer ${checked ? 'bg-black text-white border-black' : 'bg-white/5 border-white/20'}`}>
            <input type="checkbox" className="hidden" checked={checked} onChange={() => onToggle(cat)} />
            <span>{cat}</span>
          </label>
        )
      })}
    </div>
  )
}
