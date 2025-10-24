// src/app/catering/_cards/EventExtraFeeCard.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { TrashIcon, PlusIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline'
import { Switch } from '@headlessui/react'
import { useEventCalc } from '@/app/catering/_state/EventCalcProvider'
import { useEventExtraFeeRows, type ExtraFeeRow } from '@/app/catering/_data/useEventExtraFeeRows'

// Staff
import { useStaffRows } from '@/app/catering/_data/useEventStaffRows'
import useStaffSettings from '@/app/catering/_data/useEventStaffSettings'
import { calcStaffTotals } from '@/app/catering/_settings/staffPricing'

// Equipment
import { useEventEquipmentRows } from '@/app/catering/_data/useEventEquipmentRows'
import useEquipment from '@/app/catering/_data/useEventEquipment'

// Transport
import { useEventTransportRows } from '@/app/catering/_data/useEventTransportRows'
import { useTransportSettings } from '@/app/catering/_data/useEventTransportSettings'

// Bundles (DB + calcolo locale)
import { useEventBundles as useEventBundlesDB } from '@/app/catering/_data/useEventBundles'
import useFinalDishes from '@/app/catering/_data/useFinalDishes'
import useMaterials from '@/app/catering/_data/useMaterials'

// Company assets (DB)
import { useEventCompanyAssetRows } from '@/app/catering/_data/useEventCompanyAssetRows'

// Calc bus
import { emitCalcTick } from '@/app/catering/_data/useCalcBus'

// i18n
import { useECT } from '@/app/catering/_i18n'

/* ───────── Types ───────── */
type Draft = {
  label: string
  qty: string
  unit: string
  calcEnabled: boolean
  cost: string
  markupX: string
  advMode: AdvMode
  pctValue: string
  pctBase: PctBase
}

type ExtraFeeRowDB = ExtraFeeRow & {
  qty?: number | null
  unit_price?: number | null
  calc_mode?: boolean | null
  cost?: number | null
  markup_x?: number | null
}

type AdvMode = 'cost' | 'percentage'
type PctBase =
  | 'bundles'
  | 'equipment'
  | 'staff'
  | 'transport'
  | 'assets'
  | 'total_excl_extrafee'
  | 'total_incl_extrafee'

/* ───────── Utils numeriche ───────── */
function toNum(v: string): number {
  if (v == null) return 0
  const s = v.replace(/\s+/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  if (s === '') return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}
function toInt(v: string): number {
  const n = Math.floor(Math.max(0, toNum(v)))
  return Number.isFinite(n) ? n : 0
}
const fmt = (n: number | null | undefined) => {
  if (n == null || Number.isNaN(n)) return '-'
  try { return new Intl.NumberFormat('en-US').format(Math.round(n)) } catch { return String(Math.round(n ?? 0)) }
}
const fmtMx = (mx: string | number | undefined) => {
  const m = Number(mx ?? 1)
  if (!Number.isFinite(m) || m <= 0) return '×1'
  return `×${m.toFixed(2).replace(/\.?0+$/,'')}`
}
const round0 = (n: number) => Math.round(Number.isFinite(n) ? n : 0)

/* ───────── Bundle settings (markup/limit) ───────── */
const LS_BUNDLE_SETTINGS_KEY = 'eventcalc.bundleSettings'
type BundleSettingsLite = Record<string, { markupX?: number; markup?: number; modifierSlots?: any[]; maxModifiers?: number }>
function loadBundleSettings(): BundleSettingsLite {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(LS_BUNDLE_SETTINGS_KEY) || '{}') as BundleSettingsLite } catch { return {} }
}

// >>> FIX: accetta anche null (per compat con chiamate che passano cfg|null|undefined)
type MarkupCfg = { markupX?: number; markup?: number } | null | undefined
const getCfgMarkup = (cfg: MarkupCfg) => {
  const raw = (cfg?.markupX ?? cfg?.markup)
  const m = Number(raw)
  return Number.isFinite(m) && m > 0 ? m : 1
}

function effectiveLimitLite(cfg?: { modifierSlots?: any[]; maxModifiers?: number } | null): number {
  if (!cfg) return 0
  const a = Number(cfg.maxModifiers ?? 0)
  const b = Array.isArray(cfg.modifierSlots) ? cfg.modifierSlots.length : 0
  const lim = Math.max(0, a, b)
  return Math.min(lim, 16)
}

/* ───────── Item unificato (FD + MAT) ───────── */
type SelectableItem = { id: string; unit_cost: number | null | undefined }
// >>> usa MarkupCfg anche qui
function sellPriceFor(item: SelectableItem | undefined, cfg?: MarkupCfg): number {
  if (!item) return 0
  const unit = Number(item.unit_cost ?? 0) || 0
  const m = getCfgMarkup(cfg)
  return unit * m
}

/* ───────── LS helpers + live totals hook ───────── */
const readJSON = <T,>(k: string): T | null => {
  try {
    const raw = localStorage.getItem(k)
    if (!raw) return null
    try { return JSON.parse(raw) as T } catch { return null }
  } catch { return null }
}
const readNum = (k: string): number | null => {
  try {
    const raw = localStorage.getItem(k)
    if (raw == null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch { return null }
}

type LiveTotals = {
  bundles: number | null
  equipment: number | null
  staff: number | null
  transport: number | null
  assets: number | null
}

function useLiveSectionTotals(eventId?: string | null): LiveTotals {
  const [live, setLive] = useState<LiveTotals>({ bundles: null, equipment: null, staff: null, transport: null, assets: null })

  // seed da LS
  useEffect(() => {
    if (!eventId) return
    const eq = readJSON<{ cost?: number; price?: number }>(`eventcalc.equipment.totals:${eventId}`)
    const staffPrice = readNum(`eventcalc.staff.price:${eventId}`)
    const tr = readJSON<{ cost?: number; price?: number }>(`eventcalc.transport.totals:${eventId}`)
    const assets = readNum(`eventcalc.assets.total:${eventId}`)
    const b1 = readNum(`eventcalc.bundles.total:${eventId}`)
    const b2 = readNum(`eventcalc.bundles.price:${eventId}`)
    const b3 = readJSON<{ price?: number; total?: number }>(`eventcalc.bundles.totals:${eventId}`)
    const bundles = b1 ?? b2 ?? (b3?.price ?? b3?.total ?? null)

    setLive({
      equipment: eq?.price ?? null,
      staff: staffPrice ?? null,
      transport: tr?.price ?? null,
      assets: assets ?? null,
      bundles: bundles ?? null,
    })
  }, [eventId])

  // listeners runtime
  useEffect(() => {
    if (!eventId) return
    const onEq = (e: any) => { if (e?.detail?.eventId === eventId) setLive(s => ({ ...s, equipment: Number(e.detail?.price || 0) })) }
    const onSt = (e: any) => { if (e?.detail?.eventId === eventId) setLive(s => ({ ...s, staff: Number(e.detail?.price || 0) })) }
    const onTr = (e: any) => { if (e?.detail?.eventId === eventId) setLive(s => ({ ...s, transport: Number(e.detail?.price || 0) })) }
    const onAs = (e: any) => { if (e?.detail?.eventId === eventId) setLive(s => ({ ...s, assets: Number(e.detail?.total || 0) })) }
    const onBu = (e: any) => { if (e?.detail?.eventId === eventId) setLive(s => ({ ...s, bundles: Number(e.detail?.price ?? e.detail?.total ?? 0) })) }
    const onStorage = (e: StorageEvent) => {
      if (!e.key || !e.key.endsWith(`:${eventId}`)) return
      try {
        const k = e.key
        if (k.startsWith('eventcalc.equipment.totals')) {
          const v = readJSON<{ price?: number }>(k)?.price ?? null
          setLive(s => ({ ...s, equipment: v }))
        } else if (k.startsWith('eventcalc.staff.price')) {
          setLive(s => ({ ...s, staff: readNum(k) }))
        } else if (k.startsWith('eventcalc.transport.totals')) {
          const v = readJSON<{ price?: number }>(k)?.price ?? null
          setLive(s => ({ ...s, transport: v }))
        } else if (k.startsWith('eventcalc.assets.total')) {
          setLive(s => ({ ...s, assets: readNum(k) }))
        } else if (k.startsWith('eventcalc.bundles')) {
          const v = readNum(k) ?? readJSON<{ price?: number; total?: number }>(k)?.price ?? null
          setLive(s => ({ ...s, bundles: v }))
        }
      } catch {}
    }

    window.addEventListener('equipment:totals', onEq as EventListener)
    window.addEventListener('staff:totals', onSt as EventListener)
    window.addEventListener('transport:totals', onTr as EventListener)
    window.addEventListener('assets:total', onAs as EventListener)
    window.addEventListener('bundles:totals', onBu as EventListener)
    window.addEventListener('storage', onStorage)

    return () => {
      window.removeEventListener('equipment:totals', onEq as EventListener)
      window.removeEventListener('staff:totals', onSt as EventListener)
      window.removeEventListener('transport:totals', onTr as EventListener)
      window.removeEventListener('assets:total', onAs as EventListener)
      window.removeEventListener('bundles:totals', onBu as EventListener)
      window.removeEventListener('storage', onStorage)
    }
  }, [eventId])

  return live
}

/* ───────── Dirty Guard ───────── */
const DIRTY_SS_KEY = 'eventcalc.dirty.extrafee'

function useDirtyGuard(eventId?: string | null) {
  const dirtyRef = useRef(false)

  const emitDirty = (v: boolean, origin = 'extrafee') => {
    try { sessionStorage.setItem(DIRTY_SS_KEY + (eventId ? `:${eventId}` : ''), v ? '1' : '0') } catch {}
    try { window.dispatchEvent(new CustomEvent('eventcalc:dirty', { detail: { card: 'extrafee', dirty: v, origin } })) } catch {}
  }

  const markDirty = () => {
    if (!dirtyRef.current) {
      dirtyRef.current = true
      emitDirty(true)
    } else {
      emitDirty(true, 'extrafee_ping')
    }
  }

  const clearDirty = () => {
    if (dirtyRef.current) {
      dirtyRef.current = false
      emitDirty(false)
    } else {
      emitDirty(false, 'extrafee_ping')
    }
  }

  useEffect(() => {
    // Re-assert da sessionStorage (es. hard refresh durante edit)
    try {
      const raw = sessionStorage.getItem(DIRTY_SS_KEY + (eventId ? `:${eventId}` : ''))
      if (raw === '1') {
        dirtyRef.current = true
        emitDirty(true, 'extrafee_restore')
      }
    } catch {}

    const onExternalDirty = (e: any) => {
      const origin = e?.detail?.origin
      const d = !!e?.detail?.dirty
      if (origin === 'extrafee' || String(origin || '').startsWith('extrafee_')) return
      if (!d && dirtyRef.current) {
        setTimeout(() => emitDirty(true, 'extrafee_guard'), 0)
      }
    }
    const onVis = () => {
      if (document.visibilityState === 'visible' && dirtyRef.current) {
        emitDirty(true, 'extrafee_visibility')
      }
    }
    window.addEventListener('eventcalc:dirty', onExternalDirty as EventListener)
    document.addEventListener('visibilitychange', onVis)

    return () => {
      window.removeEventListener('eventcalc:dirty', onExternalDirty as EventListener)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [eventId])

  return { markDirty, clearDirty, isDirty: () => dirtyRef.current }
}

/* ───────── Firma/row util ───────── */
const numSig = (n: any) => (n == null || Number.isNaN(Number(n))) ? '' : Number(n).toFixed(4)
function rowSigFromDB(r: ExtraFeeRowDB) {
  return [
    r.id,
    String(r.label ?? ''),
    String(Number(r.qty ?? 1)),
    (r.calc_mode ? '1' : '0'),
    numSig(r.unit_price),
    numSig(r.cost),
    numSig(r.markup_x),
    numSig(r.amount),
  ].join('|')
}

/* ===================== Component ===================== */
export default function ExtraFeeCard() {
  const t = useECT()

  const calcCtx = useEventCalc() as any
  const { eventId } = calcCtx || { eventId: undefined }
  const liveTotals = useLiveSectionTotals(eventId)
  const { markDirty, clearDirty, isDirty } = useDirtyGuard(eventId)

  const lastPersistedLS = useRef<number | null>(null)

  // ===== Bundles =====
  const { bundles } = useEventBundlesDB(eventId)
  const { dishes } = useFinalDishes()
  const { materials } = useMaterials()
  const bundleSettings = useMemo(() => loadBundleSettings(), [])

  // Mappa item
  const itemsMap = useMemo(() => {
    const map = new Map<string, SelectableItem>()
    for (const d of dishes || []) map.set(d.id, { id: d.id, unit_cost: d.unit_cost })
    for (const m of materials || []) map.set(String(m.id), { id: String(m.id), unit_cost: m.unit_cost })
    return map
  }, [dishes, materials])

  // Totale bundles (fallback)
  const bundlesPriceFromDB = useMemo(() => {
    if (!bundles?.length) return 0
    let total = 0
    const cfgByKey = bundleSettings
    for (const b of bundles) {
      const cfg = cfgByKey[b.type_key]
      const limit = effectiveLimitLite(cfg)
      for (const r of (b.rows || [])) {
        const q = Math.max(0, Number(r.qty ?? 0))
        const base = r.dish_id ? itemsMap.get(r.dish_id) : undefined
        let row = sellPriceFor(base, cfg) * q
        const mods: string[] = Array.isArray(r.modifiers) ? (r.modifiers as any) : []
        for (const mid of mods.slice(0, limit)) {
          const md = mid ? itemsMap.get(mid) : undefined
          row += sellPriceFor(md, cfg) * q
        }
        total += row
      }
    }
    return total
  }, [bundles, itemsMap, bundleSettings])

  // ===== Company assets (DB) (fallback)
  const { rows: assetRows } = useEventCompanyAssetRows(eventId || null)
  const assetsPriceFromDB = useMemo(() => {
    let sum = 0
    for (const r of assetRows || []) {
      if (!r?.include_price) continue
      const qty = Number(r?.qty ?? 0) || 0
      const unit = Number(r?.unit_price_vnd ?? 0) || 0
      sum += qty * unit
    }
    return sum
  }, [assetRows])

  // ===== Staff (fallback)
  const { rows: staffRows } = useStaffRows(eventId)
  const ss = useStaffSettings(eventId)
  const staffMarkup = Number(ss.settings?.markup_x ?? 1) || 1
  const staffPriceFromDB = useMemo(() => {
    const simple = staffRows.map(r => ({ cost_per_hour: r.cost_per_hour, hours: r.hours }))
    const t2 = calcStaffTotals(simple, staffMarkup)
    return t2.priceTotal || 0
  }, [staffRows, staffMarkup])

  // ===== Equipment (fallback)
  const { rows: eqRows } = useEventEquipmentRows(eventId)
  const { equipment: eqMaster } = useEquipment()
  const eqMap = useMemo(() => new Map(eqMaster.map(e => [e.id, e])), [eqMaster])
  const equipmentPriceFromDB = useMemo(() => {
    let tot = 0
    for (const r of eqRows ?? []) {
      const it = r.equipment_id ? eqMap.get(r.equipment_id) : undefined
      const unit = (it?.final_price ?? it?.cost ?? 0)
      const qty = Number(r.qty ?? 0)
      tot += unit * qty
    }
    return tot
  }, [eqRows, eqMap])

  // ===== Transport (fallback)
  const { rows: trRows } = useEventTransportRows(eventId || null)
  const ts = useTransportSettings(eventId || null)
  const trMarkupX = Number(ts.settings?.markup_x ?? 1) || 1
  const vehicleTypes = ts.vehicleTypes
  const vehicleMap = useMemo(() => new Map(vehicleTypes.map(v => [v.id, v])), [vehicleTypes])
  const transportPriceFromDB = useMemo(() => {
    let totalCost = 0
    for (const r of trRows ?? []) {
      const vt = r.vehicle_key ? vehicleMap.get(r.vehicle_key) : undefined
      if (!vt) continue
      const km = Number(r.distance_km ?? 0)
      const legs = r.round_trip ? 2 : 1
      const costPerKm = Number(vt.cost_per_km ?? 0)
      totalCost += km * costPerKm * legs
    }
    return totalCost * trMarkupX
  }, [trRows, vehicleMap, trMarkupX])

  // ===== Extra Fee rows (DB)
  const { rows, loading, error, createRow, updateRow, deleteRow, canQuery } = useEventExtraFeeRows(eventId)

  // Draft + meta percentage + modale
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [pctMetaLS, setPctMetaLS] = useState<Record<string, { advMode: AdvMode; pctValue: string; pctBase: PctBase }>>(() => {
    try { return JSON.parse(localStorage.getItem('eventcalc.extrafee.pctmeta') || '{}') } catch { return {} }
  })
  const [modalOpenFor, setModalOpenFor] = useState<string | null>(null)

  // (DEPRECATO IN EDIT) — non chiamare durante l'editing; usato SOLO post-save
  const persistPctMeta = (fullMap: Record<string, { advMode: AdvMode; pctValue: string; pctBase: PctBase }>) => {
    setPctMetaLS(fullMap)
    try { localStorage.setItem('eventcalc.extrafee.pctmeta', JSON.stringify(fullMap)) } catch {}
    try { window.dispatchEvent(new CustomEvent('extrafee:pctmeta', { detail: { updated: true } })) } catch {}
  }

  useEffect(() => {
    const onEventChanged = () => {
      setDrafts({})
      try { setPctMetaLS(JSON.parse(localStorage.getItem('eventcalc.extrafee.pctmeta') || '{}')) } catch { setPctMetaLS({}) }
      setModalOpenFor(null)
      clearDirty()
    }
    window.addEventListener('event:changed', onEventChanged)
    return () => window.removeEventListener('event:changed', onEventChanged)
  }, [clearDirty])

  // Seed/merge draft da DB
  useEffect(() => {
    if (!rows) return
    setDrafts(prev => {
      const next: Record<string, Draft> = { ...prev }
      for (const r0 of rows) {
        const r = r0 as ExtraFeeRowDB
        const stored = pctMetaLS[r.id] || { advMode: 'cost' as AdvMode, pctValue: '0', pctBase: 'total_incl_extrafee' as PctBase }
        if (!next[r.id]) {
          next[r.id] = {
            label: String(r.label ?? ''),
            qty: String(r.qty ?? 1),
            unit: String(r.unit_price ?? (r.amount ?? 0)),
            calcEnabled: Boolean(r.calc_mode ?? false),
            cost: String(r.cost ?? 0),
            markupX: String(r.markup_x ?? 1.5),
            advMode: stored.advMode,
            pctValue: stored.pctValue,
            pctBase: stored.pctBase,
          }
        } else {
          const d = next[r.id]
          next[r.id] = {
            label: d.label ?? '',
            qty: d.qty ?? '1',
            unit: d.unit ?? '0',
            calcEnabled: Boolean(d.calcEnabled),
            cost: d.cost ?? '0',
            markupX: d.markupX ?? '1.5',
            advMode: d.advMode ?? stored.advMode,
            pctValue: d.pctValue ?? stored.pctValue,
            pctBase: (d.pctBase as PctBase) ?? stored.pctBase,
          }
        }
      }
      const ids = new Set(rows.map(r => r.id))
      for (const k of Object.keys(next)) if (!ids.has(k)) delete next[k]
      return next
    })
  }, [rows, pctMetaLS])

  const onDraftChange = (id: string, key: keyof Draft, value: string | boolean | PctBase | AdvMode) => {
    setDrafts(prev => {
      const base: Draft = prev[id] ?? {
        label: '', qty: '1', unit: '0', calcEnabled: false,
        cost: '0', markupX: '1.5', advMode: 'cost', pctValue: '0', pctBase: 'total_incl_extrafee'
      }
      const nextRow: Draft = { ...base, [key]: value as any }
      const nextAll = { ...prev, [id]: nextRow }
      return nextAll
    })
    markDirty()
    emitCalcTick()
  }

  /* ======= Totali base (preferisci LIVE) ======= */
  const bundlesPriceTotal   = liveTotals.bundles   ?? bundlesPriceFromDB
  const equipmentPriceTotal = liveTotals.equipment ?? equipmentPriceFromDB
  const staffPriceTotal     = liveTotals.staff     ?? staffPriceFromDB
  const transportPriceTotal = liveTotals.transport ?? transportPriceFromDB
  const assetsPriceTotal    = liveTotals.assets    ?? assetsPriceFromDB

  const baseTotalsExclExtra = useMemo(
    () => bundlesPriceTotal + equipmentPriceTotal + staffPriceTotal + transportPriceTotal + assetsPriceTotal,
    [bundlesPriceTotal, equipmentPriceTotal, staffPriceTotal, transportPriceTotal, assetsPriceTotal]
  )

  /* ───────── Chip label per percentuale (localizzate) ───────── */
  const pctBaseLabel: Record<PctBase, string> = {
    bundles: t('extrafee.scope.bundles'),
    equipment: t('extrafee.scope.equipment'),
    staff: t('extrafee.scope.staff'),
    transport: t('extrafee.scope.transport'),
    assets: t('extrafee.scope.assets'),
    total_excl_extrafee: t('extrafee.scope.total_excl_extrafee'),
    total_incl_extrafee: t('extrafee.scope.total_incl_extrafee'),
  }

  /* ======== CALCOLO LIVE (self-consistent) ======== */
  type CalcRow = {
    id: string
    mode: 'manual' | 'cost' | 'pct_excl' | 'pct_incl'
    qty: number
    unitManual: number
    cost: number
    markupX: number
    pct: number
    pctBase?: PctBase
  }

  const calcRows: CalcRow[] = useMemo(() => {
    if (!rows) return []
    const out: CalcRow[] = []
    for (const r0 of rows) {
      const r = r0 as ExtraFeeRowDB
      const d = drafts[r.id]
      if (!d) continue
      const enabled = !!d.calcEnabled
      if (!enabled) {
        out.push({ id: r.id, mode: 'manual', qty: toInt(d.qty ?? '0'), unitManual: Math.max(0, toNum(d.unit ?? '0')), cost: 0, markupX: 1, pct: 0 })
      } else if (d.advMode === 'cost') {
        out.push({ id: r.id, mode: 'cost', qty: toInt(d.qty ?? '0'), unitManual: 0, cost: Math.max(0, toNum(d.cost ?? '0')), markupX: Math.max(0, toNum(d.markupX ?? '1')), pct: 0 })
      } else {
        const p = Math.max(0, toNum(d.pctValue ?? '0')) / 100
        const base = d.pctBase
        out.push({
          id: r.id,
          mode: base === 'total_incl_extrafee' ? 'pct_incl' : 'pct_excl',
          qty: 1, unitManual: 0, cost: 0, markupX: 1, pct: p,
          pctBase: base
        })
      }
    }
    return out
  }, [rows, drafts])

  const { rowTotalsLive, unitPricesLive, grandTotalLive } = useMemo(() => {
    const unitPrice = new Map<string, number>()
    const rowTotal  = new Map<string, number>()

    let N = 0 // somma righe indipendenti da "incl extra"
    let B = baseTotalsExclExtra
    let K = 0 // Σ p/(1+p) per tutte le pct_incl

    // 1) manual, cost e pct_excl
    for (const c of calcRows) {
      if (c.mode === 'manual') {
        const u = c.unitManual
        unitPrice.set(c.id, u)
        const t = c.qty * u
        rowTotal.set(c.id, t)
        N += t
      } else if (c.mode === 'cost') {
        const u = c.cost * c.markupX
        unitPrice.set(c.id, u)
        const t = c.qty * u
        rowTotal.set(c.id, t)
        N += t
      } else if (c.mode === 'pct_excl') {
        let base = 0
        switch (c.pctBase) {
          case 'bundles': base = bundlesPriceTotal; break
          case 'equipment': base = equipmentPriceTotal; break
          case 'staff': base = staffPriceTotal; break
          case 'transport': base = transportPriceTotal; break
          case 'assets': base = assetsPriceTotal; break
          case 'total_excl_extrafee':
          default: base = B; break
        }
        const t = c.pct * base
        unitPrice.set(c.id, t)
        rowTotal.set(c.id, t)
        N += t
      } else {
        const p = c.pct
        if (p > 0) K += p / (1 + p)
      }
    }

    // 2) Risolvi T e poi calcola le pct_incl
    let T = N
    if (K > 0 && K < 0.999999) {
      T = (N + K * B) / (1 - K)
    }
    for (const c of calcRows) {
      if (c.mode !== 'pct_incl') continue
      const amount = (c.pct / (1 + c.pct)) * (B + T)
      unitPrice.set(c.id, amount)
      rowTotal.set(c.id, amount)
    }

    // 3) Totale
    let G = 0
    for (const v of rowTotal.values()) G += v

    return { rowTotalsLive: rowTotal, unitPricesLive: unitPrice, grandTotalLive: round0(G) }
  }, [
    JSON.stringify(calcRows),
    baseTotalsExclExtra,
    bundlesPriceTotal, equipmentPriceTotal, staffPriceTotal, transportPriceTotal, assetsPriceTotal
  ])

  /* ========= BROADCAST: Totals live vs Summary =========
     - SEMPRE emettiamo 'extrafee:total' (in-memory) per EventTotalCard
     - Persistiamo su LS SOLO quando !isDirty (così la Summary cambia solo post-save)
  ======================================================= */
  useEffect(() => {
    if (!canQuery) return
    try {
      window.dispatchEvent(new CustomEvent('extrafee:total', {
        detail: { eventId, total: grandTotalLive, live: true }
      }))
    } catch {}
    if (!isDirty()) {
      const key = `eventcalc.extrafee.total:${eventId || ''}`
      if (lastPersistedLS.current !== grandTotalLive) {
        lastPersistedLS.current = grandTotalLive
        try { localStorage.setItem(key, String(grandTotalLive)) } catch {}
        // opzionale: ribatti anche senza flag live per chi ascolta solo il valore definitivo
        try { window.dispatchEvent(new CustomEvent('extrafee:total', { detail: { eventId, total: grandTotalLive } })) } catch {}
      }
    }
    emitCalcTick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grandTotalLive, canQuery, eventId, isDirty, drafts])

  /* ───────── Save globale: commit TUTTO su DB, poi dirty=false ───────── */
  useEffect(() => {
    if (!canQuery) return
    const onSave = async () => {
      try {
        if (!rows || !rows.length) { clearDirty(); return }
        const tasks: Promise<any>[] = []
        for (const r0 of rows) {
          const r = r0 as ExtraFeeRowDB
          const d = drafts[r.id]; if (!d) continue

          const calc_mode = !!d.calcEnabled
          const qty = calc_mode && d.advMode === 'percentage' ? 1 : toInt(d.qty ?? '0')

          if (!calc_mode) {
            const unitManual = Math.max(0, toNum(d.unit ?? '0'))
            const amount = qty * unitManual
            const same =
              (r.label ?? '') === (d.label ?? '') &&
              Number(r.qty ?? 1) === qty &&
              Boolean(r.calc_mode ?? false) === false &&
              Number(r.unit_price ?? 0) === unitManual &&
              Number(r.cost ?? 0) === 0 &&
              Number(r.markup_x ?? 0) === 0 &&
              Number(r.amount ?? 0) === amount
            if (!same) tasks.push(updateRow({ id: r.id, patch: { label: d.label ?? '', qty, calc_mode: false, unit_price: unitManual, cost: null, markup_x: null, amount } as any }))
          } else if (d.advMode === 'cost') {
            const cost = Math.max(0, toNum(d.cost ?? '0'))
            const markupX = Math.max(0, toNum(d.markupX ?? '1'))
            const amount = qty * (cost * markupX)
            const same =
              (r.label ?? '') === (d.label ?? '') &&
              Number(r.qty ?? 1) === qty &&
              Boolean(r.calc_mode ?? false) === true &&
              Number(r.unit_price ?? 0) === 0 &&
              Number(r.cost ?? 0) === cost &&
              Number(r.markup_x ?? 0) === markupX &&
              Number(r.amount ?? 0) === amount
            if (!same) tasks.push(updateRow({ id: r.id, patch: { label: d.label ?? '', qty, calc_mode: true, unit_price: null, cost, markup_x: markupX, amount } as any }))
          } else {
            const amount = rowTotalsLive.get(r.id) ?? 0
            const same =
              (r.label ?? '') === (d.label ?? '') &&
              Number(r.qty ?? 1) === qty &&
              Boolean(r.calc_mode ?? false) === true &&
              Number(r.unit_price ?? 0) === 0 &&
              Number(r.cost ?? 0) === 0 &&
              Number(r.markup_x ?? 0) === 0 &&
              Number(r.amount ?? 0) === amount
            if (!same) tasks.push(updateRow({ id: r.id, patch: { label: d.label ?? '', qty, calc_mode: true, unit_price: null, cost: null, markup_x: null, amount } as any }))
          }
        }
        await Promise.all(tasks)

        // Persisti la chip meta SOLO a salvataggio riuscito
        const nextMeta: Record<string, { advMode: AdvMode; pctValue: string; pctBase: PctBase }> = {}
        for (const r0 of rows) {
          const r = r0 as ExtraFeeRowDB
          const d = drafts[r.id]
          if (!d) continue
          const enabledPct = !!d.calcEnabled && d.advMode === 'percentage'
          nextMeta[r.id] = {
            advMode: d.advMode,
            pctValue: enabledPct ? (d.pctValue ?? '') : '',
            pctBase: d.pctBase,
          }
        }
        persistPctMeta(nextMeta)

        // Aggiorna LS del totale (per Summary) e notifica
        const key = `eventcalc.extrafee.total:${eventId || ''}`
        try { localStorage.setItem(key, String(grandTotalLive)) } catch {}
        try { window.dispatchEvent(new CustomEvent('extrafee:total', { detail: { eventId, total: grandTotalLive } })) } catch {}
        try { window.dispatchEvent(new CustomEvent('eventcalc:saved', { detail: { card: 'extrafee' } })) } catch {}
      } catch (e) {
        console.error('[extrafee save] FAILED', e)
      } finally {
        clearDirty() // spegni la SaveBar SOLO qui
      }
    }
    window.addEventListener('eventcalc:save', onSave as EventListener)
    return () => window.removeEventListener('eventcalc:save', onSave as EventListener)
  }, [rows, drafts, canQuery, rowTotalsLive, updateRow, clearDirty, eventId, grandTotalLive])

  /* ───────── Modal ───────── */
  function AdvancedModal({ id, onClose }: { id: string; onClose: () => void }) {
    const r = rows?.find(x => x.id === id) as ExtraFeeRowDB | undefined
    const d = drafts[id]
    if (!r || !d) return null

    const [local, setLocal] = useState<Draft>({ ...d })
    const setLocalField = (k: keyof Draft, v: any) => setLocal(prev => ({ ...prev, [k]: v }))
    const handleEnterBlur = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }

    const saveAndClose = () => {
      // Applica SOLO ai draft locali (no DB, no LS)
      setDrafts(prev => ({ ...prev, [id]: { ...(prev[id] ?? local), ...local } }))
      markDirty()
      emitCalcTick()
      onClose()
    }

    const cancelAndClose = () => {
      onClose() // non tocca i draft
    }

    return (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/50" onClick={cancelAndClose} />
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="text-base font-semibold text-gray-900">{t('extrafee.modal.title')}</div>
              <button onClick={cancelAndClose} className="p-1 rounded hover:bg-gray-100" aria-label={t('extrafee.modal.close')}>✕</button>
            </div>
            <div className="p-4 space-y-4 text-gray-900">
              <div>
                <div className="text-sm font-medium mb-2">{t('extrafee.modal.mode')}</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`px-3 h-9 rounded-lg border ${local.advMode === 'cost' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}
                    onClick={() => setLocalField('advMode', 'cost')}
                  >
                    {t('extrafee.modal.mode_cost')}
                  </button>
                  <button
                    type="button"
                    className={`px-3 h-9 rounded-lg border ${local.advMode === 'percentage' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}
                    onClick={() => setLocalField('advMode', 'percentage')}
                  >
                    {t('extrafee.modal.mode_pct')}
                  </button>
                </div>
              </div>

              {local.advMode === 'cost' ? (
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="flex flex-col">
                    <span className="text-sm text-gray-700">{t('extrafee.modal.cost')}</span>
                    <input
                      inputMode="decimal"
                      className="mt-1 w-full border rounded-lg px-3 h-10 text-right"
                      value={local.cost}
                      onChange={(e) => setLocalField('cost', (e.target.value ?? '').replace(/[^\d.,-]/g, ''))}
                      onKeyDown={handleEnterBlur}
                    />
                  </label>
                  <label className="flex flex-col">
                    <span className="text-sm text-gray-700">{t('extrafee.modal.markup_x')}</span>
                    <input
                      inputMode="decimal"
                      className="mt-1 w-full border rounded-lg px-3 h-10 text-right"
                      value={local.markupX}
                      onChange={(e) => setLocalField('markupX', (e.target.value ?? '').replace(/[^\d.,-]/g, ''))}
                      onKeyDown={handleEnterBlur}
                    />
                  </label>
                  <div className="sm:col-span-2 text-xs text-gray-600">{t('extrafee.modal.help_cost')}</div>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="flex flex-col">
                    <span className="text-sm text-gray-700">{t('extrafee.modal.percent')}</span>
                    <input
                      inputMode="decimal"
                      className="mt-1 w-full border rounded-lg px-3 h-10 text-right"
                      value={local.pctValue}
                      onChange={(e) => setLocalField('pctValue', (e.target.value ?? '').replace(/[^\d.,-]/g, ''))}
                      onKeyDown={handleEnterBlur}
                    />
                  </label>
                  <label className="flex flex-col">
                    <span className="text-sm text-gray-700">{t('extrafee.modal.base')}</span>
                    <select
                      className="mt-1 w-full border rounded-lg px-3 h-10"
                      value={local.pctBase}
                      onChange={(e) => setLocalField('pctBase', (e.target.value as PctBase))}
                    >
                      <option value="bundles">{t('extrafee.base.bundles')}</option>
                      <option value="equipment">{t('extrafee.base.equipment')}</option>
                      <option value="staff">{t('extrafee.base.staff')}</option>
                      <option value="transport">{t('extrafee.base.transport')}</option>
                      <option value="assets">{t('extrafee.base.assets')}</option>
                      <option value="total_excl_extrafee">{t('extrafee.base.total_excl_extrafee')}</option>
                      <option value="total_incl_extrafee">{t('extrafee.base.total_incl_extrafee')}</option>
                    </select>
                  </label>
                  <div className="sm:col-span-2 text-xs text-gray-600">
                    {t('extrafee.modal.help_pct')}
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button type="button" onClick={cancelAndClose} className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50">
                  {t('extrafee.modal.cancel')}
                </button>
                <button type="button" onClick={saveAndClose} className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:opacity-90">
                  {t('extrafee.modal.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ───────── Body ───────── */
  const body = useMemo(() => {
    const initialLoading = rows === null && loading
    if (!canQuery) {
      return (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
          {t('extrafee.missing_event')}
        </div>
      )
    }
    if (error) {
      return (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-red-800">
          {t('extrafee.load_error')}: {error}
        </div>
      )
    }
    if (rows === null || initialLoading) {
      return <div className="text-sm text-gray-500">{t('extrafee.loading')}</div>
    }

    return (
      <div className="p-3 space-y-2">
        {rows.length === 0 && (
          <div className="text-sm text-gray-500 px-1 py-4">
            {t('extrafee.empty')}
          </div>
        )}

        {rows.map((r0) => {
          const r = r0 as ExtraFeeRowDB
          const d = drafts[r.id]
          if (!d) return null

          const qtyDisabled = d.calcEnabled && d.advMode === 'percentage'
          const qtyShown = qtyDisabled ? '1' : d.qty
          const uPrice = unitPricesLive.get(r.id) ?? 0
          const rowTotal = rowTotalsLive.get(r.id) ?? 0

          const showPctChip = d.calcEnabled && d.advMode === 'percentage'
          const pctText = `${Number(toNum(d.pctValue)).toString().replace(/\.0+$/,'')}% ${pctBaseLabel[d.pctBase]}`

          return (
            <div key={r.id} className="border border-gray-200 rounded-xl p-2">
              <div className="w-full flex items-end gap-1 flex-nowrap">
                {/* Label */}
                <div className="w-[300px] shrink-0">
                  <label className="text-xs text-gray-600 mb-1 block">{t('extrafee.label')}</label>
                  <input
                    className="border rounded-lg px-2 h-9 w-full bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={t('extrafee.label_ph')}
                    value={d.label}
                    onChange={(e) => onDraftChange(r.id, 'label', e.target.value)}
                    aria-label={t('extrafee.label_aria')}
                  />
                </div>

                {/* Qty */}
                <div className="w-[72px] shrink-0">
                  <label className="text-xs text-gray-600 mb-1 block">{t('extrafee.qty')}</label>
                  <input
                    inputMode="numeric"
                    type="number"
                    min={0}
                    step={1}
                    disabled={qtyDisabled}
                    className={`border rounded-lg px-2 h-9 w-full text-right focus:outline-none focus:ring-2 ${qtyDisabled ? 'bg-gray-100 text-gray-500' : 'bg-white text-gray-900 focus:ring-blue-500'}`}
                    placeholder="0"
                    value={qtyShown}
                    onChange={(e) => {
                      const val = (e.target.value ?? '').replace(/[^\d]/g, '')
                      onDraftChange(r.id, 'qty', val)
                    }}
                    aria-label={t('extrafee.qty_aria')}
                  />
                </div>

                {/* Switch + Kebab */}
                <div className="w-[112px] shrink-0">
                  <label className="text-xs text-gray-600 mb-1 block">{t('extrafee.adv_label')}</label>
                  <div className="h-9 w-full flex items-center justify-between">
                    <Switch
                      checked={d.calcEnabled}
                      onChange={(v: boolean) => onDraftChange(r.id, 'calcEnabled', v)}
                      className={`${d.calcEnabled ? 'bg-blue-600' : 'bg-gray-300'} relative inline-flex h-6 w-11 items-center rounded-full transition`}
                      aria-label={t('extrafee.toggle_adv_aria')}
                    >
                      <span className={`${d.calcEnabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition`} />
                    </Switch>

                    <button
                      type="button"
                      className="h-9 w-9 rounded-lg border bg-white hover:bg-gray-50 inline-flex items-center justify-center"
                      onClick={() => setModalOpenFor(r.id)}
                      aria-label={t('extrafee.configure_adv_aria')}
                    >
                      <EllipsisVerticalIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Chips destra */}
                <div className="flex-1 min-w-[200px] flex items-end justify-end gap-2">
                  {d.calcEnabled && d.advMode === 'cost' && (
                    <span className="inline-flex items-center justify-center rounded-full bg-gray-100 text-gray-800 px-2 h-7 border border-gray-200 text-xs">
                      {fmtMx(d.markupX)}
                    </span>
                  )}
                  {showPctChip && (
                    <span className="inline-flex items-center justify-center rounded-full bg-gray-100 text-gray-800 px-2 h-7 border border-gray-200 text-xs">
                      {pctText}
                    </span>
                  )}
                </div>

                {/* Unit price */}
                <div className="w-[128px] shrink-0">
                  <label className="text-xs text-gray-600 mb-1 block text-right">{t('extrafee.unit_price')}</label>
                  {d.calcEnabled ? (
                    <div className="border rounded-lg h-9 w-full bg-gray-50 text-gray-900 flex items-center justify-end px-2 font-medium select-none">
                      {fmt(uPrice)}
                    </div>
                  ) : (
                    <input
                      inputMode="decimal"
                      className="border rounded-lg px-2 h-9 w-full text-right bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                      value={d.unit}
                      onChange={(e) => onDraftChange(r.id, 'unit', (e.target.value ?? '').replace(/[^\d.,-]/g, ''))}
                      aria-label={t('extrafee.unit_price_aria')}
                    />
                  )}
                </div>

                {/* Total */}
                <div className="w-[128px] shrink-0">
                  <label className="text-xs text-gray-600 mb-1 block text-right">{t('extrafee.total_price')}</label>
                  <div className="border rounded-lg h-9 w-full bg-gray-50 text-gray-900 flex items-center justify-end px-2 font-semibold select-none">
                    {fmt(rowTotal)}
                  </div>
                </div>

                {/* Remove */}
                <div className="w-[36px] shrink-0">
                  <label className="text-xs text-transparent mb-1 block select-none">.</label>
                  <button
                    type="button"
                    className="h-9 w-9 rounded-lg text-red-600 hover:text-red-500 hover:bg-red-50 inline-flex items-center justify-center"
                    onClick={async () => {
                      await deleteRow(r.id)
                      setDrafts(prev => {
                        const next = { ...prev }; delete next[r.id]; return next
                      })
                      // NON tocchiamo LS/meta in edit: Summary aggiorna solo post-save
                      emitCalcTick()
                    }}
                    aria-label={t('extrafee.remove_aria')}
                    title={t('extrafee.remove_aria')}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {/* Totals */}
        <div className="border-t border-gray-200 pt-3 flex flex-wrap items-center justify-end gap-6">
          <div className="text-sm text-gray-600">{t('extrafee.totals')}</div>
          <div className="text-sm">
            <span className="text-gray-600 mr-1">{t('extrafee.price_label')}:</span>
            <span className="font-semibold">{fmt(grandTotalLive)}</span>
          </div>
        </div>
      </div>
    )
  }, [
    canQuery, error, rows, loading, drafts, deleteRow,
    t, unitPricesLive, rowTotalsLive, grandTotalLive
  ])

  const handleAdd = async () => {
    if (!canQuery) return
    await createRow({ label: '', amount: 0, qty: 1, calc_mode: false, unit_price: 0, cost: null, markup_x: null } as any)
    emitCalcTick()
  }

  // Cleanup su uscita dalla card: scarta modifiche non salvate (solo il flag dirty; i draft restano in stato)
  const clearDirtyRef = useRef(clearDirty)
  useEffect(() => { clearDirtyRef.current = clearDirty }, [clearDirty])
  useEffect(() => {
    return () => { try { clearDirtyRef.current?.() } catch {} }
  }, [])

  return (
    <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{t('extrafee.title')}</h2>
          <span className="text-sm text-gray-500">({(rows?.length ?? 0)})</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAdd}
            disabled={!canQuery}
            className="px-3 h-9 rounded bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99] transition disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={t('extrafee.add_row_title')}
            title={t('extrafee.add_row_title')}
          >
            <span className="inline-flex items-center gap-2">
              <PlusIcon className="w-4 h-4" />
              {t('extrafee.add')}
            </span>
          </button>
        </div>
      </div>

      {body}

      {/* Advanced modal */}
      {modalOpenFor && <AdvancedModal id={modalOpenFor} onClose={() => setModalOpenFor(null)} />}
    </div>
  )
}