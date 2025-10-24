'use client'

import { useEffect, useMemo, useState } from 'react'
import { useEventCalc } from '@/app/catering/_state/EventCalcProvider'
import useFinalDishes from '@/app/catering/_data/useFinalDishes'
import { useEventBundles as useEventBundlesDB } from '@/app/catering/_data/useEventBundles'
import { type BundleConfig } from '@/app/catering/_settings/bundleConfig'
import useMaterials from '@/app/catering/_data/useMaterials'
import useEventEquipmentRows from '@/app/catering/_data/useEventEquipmentRows'
import useEquipment from '@/app/catering/_data/useEventEquipment'
import { useEventCompanyAssetRows } from '@/app/catering/_data/useEventCompanyAssetRows'
import { useEventExtraFeeRows } from '@/app/catering/_data/useEventExtraFeeRows'
import useStaffRows, { useStaffMarkup } from '@/app/catering/_data/useEventStaffRows'
import useEventTransportRows from '@/app/catering/_data/useEventTransportRows'
import { useTransportSettings } from '@/app/catering/_data/useEventTransportSettings'
import useEventDiscountRows from '@/app/catering/_data/useEventDiscountRows'
import { useEventHeader } from '@/app/catering/_data/useEventHeader'
import { supabase } from '@/lib/supabase_shim'
import { useCalcTick } from '@/app/catering/_data/useCalcBus'
import { useECT } from '@/app/catering/_i18n'

const LS_BUNDLE_SETTINGS_KEY = 'eventcalc.bundleSettings'

// Number helpers
const fmt = (n: number | null | undefined) => {
  if (n == null || Number.isNaN(n)) return '-'
  try { return new Intl.NumberFormat('en-US').format(Math.round(n)) } catch { return String(Math.round(n ?? 0)) }
}
const onlyDigits = (s: string) => (s ?? '').toString().replace(/\D+/g, '')
const parseCurrency = (s: string) => Number(onlyDigits(s)) || 0
const formatCurrency = (n: number) => {
  const i = Math.round(Math.max(0, Number(n) || 0))
  return i.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// percent string: mostra fino a 8 decimali utili, senza zeri finali
const pctStrFull = (n: number) => Number(n).toFixed(8).replace(/\.?0+$/, '')

function getCfgMarkup(cfg?: BundleConfig | null): number {
  if (!cfg) return 1
  const anyCfg = cfg as any
  const raw = anyCfg.markupX ?? anyCfg.markup
  const m = Number(raw)
  return Number.isFinite(m) && m > 0 ? m : 1
}
function effectiveLimit(cfg?: BundleConfig | null) {
  if (!cfg) return 0
  const MAX_MODS = 16
  const a = Number(cfg.maxModifiers ?? 0)
  const b = Array.isArray(cfg.modifierSlots) ? cfg.modifierSlots.length : 0
  const lim = Math.max(0, a, b)
  return Math.min(lim, MAX_MODS)
}
function safeParseJSON<T = any>(s: string | null): T | null {
  if (!s) return null
  try { return JSON.parse(s) as T } catch { return null }
}

/* ---- ore da ISO fallback ---- */
function round2(x: number) { return Math.round(x * 100) / 100 }
function hoursBetweenISO(sa?: string | null, ea?: string | null) {
  if (!sa || !ea) return 0
  const s = new Date(sa).getTime()
  const e = new Date(ea).getTime()
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0
  let h = (e - s) / 3_600_000
  if (h < 0) h += 24
  return round2(Math.max(0, h))
}

/* ---- Snapshot Totals per render stabile ---- */
type TotalsSnapshot = {
  bundlesCost: number; bundlesPrice: number;
  equipmentCost: number; equipmentPrice: number;
  staffCost: number; staffPrice: number;
  transportCost: number; transportPrice: number;
  assetsPrice: number;
  extraFeeCost: number; extraFeePrice: number;
  grandCost: number; grandPrice: number;
  discountsTotal: number; priceAfterDiscounts: number;
  marginAfter: number; marginAfterPct: number; costPctAfter: number;
  peopleCount?: number; budgetTotal?: number; budgetPerPerson?: number; serviceHours?: number;
}
function readTotalsSnapshot(eventId?: string | null): TotalsSnapshot | null {
  if (!eventId) return null
  try {
    const raw = localStorage.getItem(`eventcalc.snap.totals:${eventId}`)
    return raw ? (JSON.parse(raw) as TotalsSnapshot) : null
  } catch { return null }
}
function writeTotalsSnapshot(eventId?: string | null, snap?: TotalsSnapshot | null) {
  if (!eventId || !snap) return
  try { localStorage.setItem(`eventcalc.snap.totals:${eventId}`, JSON.stringify(snap)) } catch {}
}

// Normalizza % dal DB (accetta 0..1 o 0..100 → 0..100)
const normDbPct = (v: any): number | null => {
  if (v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  if (n <= 1 && n >= 0) return n * 100
  if (n > 1 && n <= 100) return n
  return null
}

export default function EventTotalsCard() {
  const t = useECT()
  const tick = useCalcTick()
  const ctx = useEventCalc?.()
  const eventId: string | undefined = (ctx as any)?.eventId || (ctx as any)?.draftEventId

  // Snapshot anti-flicker
  const [viewSnap, setViewSnap] = useState<TotalsSnapshot | null>(null)
  useEffect(() => {
    setViewSnap(readTotalsSnapshot(eventId))
  }, [eventId])

  // === Bundle settings: Provider -> LS -> DB
  const settingsFromCtx = (ctx as any)?.bundleSettings as Record<string, BundleConfig> | undefined
  const [bundleSettings, setBundleSettings] = useState<Record<string, BundleConfig>>({})

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      if (settingsFromCtx && Object.keys(settingsFromCtx).length) {
        if (!cancelled) setBundleSettings(settingsFromCtx)
        return
      }
      const fromLS = safeParseJSON<Record<string, BundleConfig>>(
        typeof window !== 'undefined' ? localStorage.getItem(LS_BUNDLE_SETTINGS_KEY) : null
      )
      if (fromLS && Object.keys(fromLS).length) {
        if (!cancelled) setBundleSettings(fromLS)
        return
      }
      const { data, error } = await supabase.from('bundle_types').select('*').order('key', { ascending: true })
      if (error) return
      const map: Record<string, BundleConfig> = {}
      for (const row of data || []) {
        map[row.key as string] = {
          label: row.label ?? '',
          maxModifiers: row.max_modifiers ?? 0,
          dishCategories: Array.isArray(row.dish_categories) ? row.dish_categories : [],
          modifierSlots: Array.isArray(row.modifier_slots) ? row.modifier_slots : [],
          markupX: Number(row.markup_x) > 0 ? Number(row.markup_x) : 1,
        }
      }
      if (!cancelled && Object.keys(map).length) {
        setLocalBundleSettings(map)
      }
    }
    function setLocalBundleSettings(map: Record<string, BundleConfig>) {
      setBundleSettings(map)
      try { localStorage.setItem(LS_BUNDLE_SETTINGS_KEY, JSON.stringify(map)) } catch {}
    }
    hydrate()
    return () => { cancelled = true }
  }, [settingsFromCtx])

  // Dishes + Materials + Bundles
  const { dishes } = useFinalDishes()
  const { materials } = useMaterials()
  const { bundles, loading: bundlesLoading } = useEventBundlesDB(eventId || '')

  // Equipment (rows + catalog)
  const eqRows = useEventEquipmentRows(eventId || null)
  const eqCatalog = useEquipment()

  // Company assets + Extra fee
  const companyAssets = useEventCompanyAssetRows(eventId || null)
  const extraFee = useEventExtraFeeRows(eventId || '')

  // Staff
  const staffHook = useStaffRows(eventId || '')
  const staffRows = staffHook.rows || []
  const { markup: staffMarkup } = useStaffMarkup()

  // Transport
  const transport = useEventTransportRows(eventId || null)
  const transportSettings = useTransportSettings(eventId || null)

  // Discounts
  const discountsHook = useEventDiscountRows(eventId || null)

  // Event Header
  const { header, save } = useEventHeader(eventId || null)

  /** Mappa item unificata */
  const itemsMap = useMemo(() => {
    const map = new Map<string, { unit_cost: number | null | undefined }>()
    for (const d of dishes || []) map.set(d.id, { unit_cost: d.unit_cost })
    for (const m of materials || []) map.set(String(m.id), { unit_cost: m.unit_cost })
    return map
  }, [dishes, materials, tick])

  // ===== Bundles: cost & price (fallback da DB) =====
  const { bundlesCostDB, bundlesPriceDB } = useMemo(() => {
    if (!bundles?.length) return { bundlesCostDB: 0, bundlesPriceDB: 0 }
    let costSum = 0
    let priceSum = 0

    for (const b of bundles) {
      const cfg = bundleSettings?.[b.type_key]
      const limit = effectiveLimit(cfg)
      const markup = getCfgMarkup(cfg)
      for (const r of (b.rows || [])) {
        const q = Math.max(0, Number(r.qty ?? 0))
        if (r.dish_id) {
          const baseCost = Number(itemsMap.get(r.dish_id)?.unit_cost ?? 0) || 0
          costSum  += baseCost * q
          priceSum += baseCost * markup * q
        }
        const mods: string[] = Array.isArray(r.modifiers) ? (r.modifiers as any) : []
        for (const mid of mods.slice(0, limit)) {
          if (!mid) continue
          const mCost = Number(itemsMap.get(mid)?.unit_cost ?? 0) || 0
          costSum  += mCost * q
          priceSum += mCost * markup * q
        }
      }
    }
    return { bundlesCostDB: costSum, bundlesPriceDB: priceSum }
  }, [bundles, bundleSettings, itemsMap, tick])

  // ===== Bundles: override LIVE =====
  const [bundlesCostLS, setBundlesCostLS] = useState<number | null>(null)
  const [bundlesPriceLS, setBundlesPriceLS] = useState<number | null>(null)
  useEffect(() => {
    const key = `eventcalc.bundles.totals:${eventId || ''}`
    const read = () => {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) { setBundlesCostLS(null); setBundlesPriceLS(null); return }
        const obj = JSON.parse(raw) as { cost?: number; price?: number }
        setBundlesCostLS(Number(obj?.cost || 0))
        setBundlesPriceLS(Number(obj?.price || 0))
      } catch {}
    }
    read()
    const onStorage = (e: StorageEvent) => { if (e.key === key) read() }
    const onEvt = (e: any) => {
      const d = (e as CustomEvent).detail
      if (!eventId || d?.eventId === eventId) {
        setBundlesCostLS(Number(d?.cost || 0))
        setBundlesPriceLS(Number(d?.price || 0))
      }
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('bundles:totals', onEvt as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('bundles:totals', onEvt as EventListener)
    }
  }, [eventId])

  const bundlesCost = bundlesCostLS ?? bundlesCostDB
  const bundlesPrice = bundlesPriceLS ?? bundlesPriceDB

  // ===== Equipment: cost & price (fallback DB) =====
  const { equipmentCostDB, equipmentPriceDB } = useMemo(() => {
    const rows = eqRows.rows || []
    if (!rows.length) return { equipmentCostDB: 0, equipmentPriceDB: 0 }
    const catalog = eqCatalog.equipment || []
    const index = new Map(catalog.map(e => [e.id, e]))
    let cost = 0, price = 0
    for (const r of rows) {
      const qty = Number(r.qty ?? 0) || 0
      const base = index.get(r.equipment_id || '')
      const unitCostOverride = r.unit_cost_override != null ? Number(r.unit_cost_override) : null
      const unitCost = unitCostOverride != null ? (Number.isFinite(unitCostOverride) ? unitCostOverride! : 0) : (Number(base?.cost ?? 0) || 0)
      const markupX = r.markup_x_override != null ? (Number(r.markup_x_override) || 1) : null
      const unitPrice = markupX != null ? unitCost * markupX : (Number(base?.final_price ?? 0) || unitCost)
      cost  += qty * unitCost
      price += qty * unitPrice
    }
    return { equipmentCostDB: cost, equipmentPriceDB: price }
  }, [eqRows.rows, eqCatalog.equipment, tick])

  // ===== Equipment: override LIVE =====
  const [equipmentCostLS, setEquipmentCostLS] = useState<number | null>(null)
  const [equipmentPriceLS, setEquipmentPriceLS] = useState<number | null>(null)
  useEffect(() => {
    const key = `eventcalc.equipment.totals:${eventId || ''}`
    const read = () => {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) { setEquipmentCostLS(null); setEquipmentPriceLS(null); return }
        const obj = JSON.parse(raw) as { cost?: number; price?: number }
        setEquipmentCostLS(Number(obj?.cost || 0))
        setEquipmentPriceLS(Number(obj?.price || 0))
      } catch {}
    }
    read()
    const onStorage = (e: StorageEvent) => { if (e.key === key) read() }
    const onEvt = (e: any) => {
      const d = (e as CustomEvent).detail
      if (!eventId || d?.eventId === eventId) {
        setEquipmentCostLS(Number(d?.cost || 0))
        setEquipmentPriceLS(Number(d?.price || 0))
      }
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('equipment:totals', onEvt as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('equipment:totals', onEvt as EventListener)
    }
  }, [eventId])

  const equipmentCost = equipmentCostLS ?? equipmentCostDB
  const equipmentPrice = equipmentPriceLS ?? equipmentPriceDB

  // ===== Company assets (price only) =====
  const assetsPriceDB = useMemo(() => {
    const rows = companyAssets.rows || []
    let t = 0
    for (const r of rows) {
      if (!r.include_price) continue
      const qty = Number(r.qty ?? 0) || 0
      const unit = Number(r.unit_price_vnd ?? 0) || 0
      t += qty * unit
    }
    return t
  }, [companyAssets.rows, tick])

  const [assetsPriceLS, setAssetsPriceLS] = useState<number | null>(null)
  useEffect(() => {
    const key = `eventcalc.assets.total:${eventId || ''}`
    const read = () => {
      try {
        const raw = localStorage.getItem(key)
        setAssetsPriceLS(raw == null ? null : (Number(JSON.parse(raw)?.total ?? raw) || 0))
      } catch {}
    }
    read()
    const onStorage = (e: StorageEvent) => { if (e.key === key) read() }
    const onEvt = (e: any) => {
      const d = (e as CustomEvent).detail
      if (!eventId || d?.eventId === eventId) setAssetsPriceLS(Number(d?.total ?? 0) || 0)
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('assets:total', onEvt as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('assets:total', onEvt as EventListener)
    }
  }, [eventId])

  const assetsPrice = assetsPriceLS ?? assetsPriceDB

  // ===== Staff =====
  const [staffCostOverride, setStaffCostOverride] = useState<number | null>(null)
  const [staffPriceOverride, setStaffPriceOverride] = useState<number | null>(null)
  useEffect(() => {
    const keyC = `eventcalc.staff.cost:${eventId || ''}`
    const keyP = `eventcalc.staff.price:${eventId || ''}`
    const read = () => {
      try {
        const c = localStorage.getItem(keyC)
        const p = localStorage.getItem(keyP)
        setStaffCostOverride(c == null ? null : (Number(c) || 0))
        setStaffPriceOverride(p == null ? null : (Number(p) || 0))
      } catch {}
    }
    read()
    const onEvt = (e: any) => {
      const d = (e as CustomEvent).detail
      if (!eventId || d?.eventId === eventId) {
        setStaffCostOverride(Number(d?.cost || 0))
        setStaffPriceOverride(Number(d?.price || 0))
      }
    }
    window.addEventListener('staff:totals', onEvt as EventListener)
    return () => { window.removeEventListener('staff:totals', onEvt as EventListener) }
  }, [eventId])

  const staffCostFromRows = useMemo(
    () => (staffRows || []).reduce((a: number, r: any) => a + (Number(r.cost_per_hour || 0) * Number(r.hours || 0)), 0),
    [staffRows, tick]
  )
  const staffCost = staffCostOverride ?? staffCostFromRows
  const staffPrice = useMemo(
    () => (staffPriceOverride != null ? staffPriceOverride : Math.round(staffCost * (Number(staffMarkup || 1) || 1))),
    [staffCost, staffMarkup, staffPriceOverride, tick]
  )

  // ===== Transport =====
  const { transportCostDB, transportPriceDB } = useMemo(() => {
    const rows = transport.rows || []
    const vt = transportSettings.vehicleTypes || []
    const globalMarkup = Number(transportSettings.settings?.markup_x ?? 1) || 1
    const lookupCostPerKm = (vehicle_key: string | null) => {
      if (!vehicle_key) return null
      const byId = vt.find(v => v.id === vehicle_key)
      if (byId) return Number(byId.cost_per_km ?? 0) || 0
      const byName = vt.find(v => v.name === vehicle_key)
      if (byName) return Number(byName.cost_per_km ?? 0) || 0
      return null
    }
    let cost = 0, price = 0
    for (const r of rows) {
      const dist = Number(r.distance_km ?? 0) || 0
      const trips = r.round_trip ? 2 : 1
      const kmEff = dist * trips
      const cpk = (r.cost_per_km ?? lookupCostPerKm(r.vehicle_key) ?? 0) as number
      const mx = Number(r.markup_x ?? globalMarkup) || 1
      const rowCost = kmEff * cpk
      cost += rowCost
      price += rowCost * mx
    }
    return { transportCostDB: cost, transportPriceDB: price }
  }, [transport.rows, transportSettings.settings?.markup_x, transportSettings.vehicleTypes, tick])

  const [transportCostLS, setTransportCostLS] = useState<number | null>(null)
  const [transportPriceLS, setTransportPriceLS] = useState<number | null>(null)
  useEffect(() => {
    const key = `eventcalc.transport.totals:${eventId || ''}`
    const read = () => {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) { setTransportCostLS(null); setTransportPriceLS(null); return }
        const obj = JSON.parse(raw) as { cost?: number; price?: number }
        setTransportCostLS(Number(obj?.cost || 0))
        setTransportPriceLS(Number(obj?.price || 0))
      } catch {}
    }
    read()
    const onStorage = (e: StorageEvent) => { if (e.key === key) read() }
    const onEvt = (e: any) => {
      const d = (e as CustomEvent).detail
      if (!eventId || d?.eventId === eventId) {
        setTransportCostLS(Number(d?.cost || 0))
        setTransportPriceLS(Number(d?.price || 0))
      }
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('transport:totals', onEvt as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('transport:totals', onEvt as EventListener)
    }
  }, [eventId])

  const transportCost = transportCostLS ?? transportCostDB
  const transportPrice = transportPriceLS ?? transportPriceDB

  // ===== Extra fee =====
  const { extraFeeCost, extraFeePrice } = useMemo(() => {
    const rows: any[] = Array.isArray(extraFee.rows) ? extraFee.rows : []
    let tCost = 0, tPrice = 0
    for (const r of rows) {
      const qty = Number(r.qty ?? 1) || 1
      const calc = !!r.calc_mode
      if (calc) {
        const c  = Number(r.cost ?? 0) || 0
        const mx = Number(r.markup_x ?? 1) || 1
        if (c > 0) {
          tCost  += qty * c
          tPrice += qty * c * mx
        } else {
          tPrice += Number(r.amount ?? 0) || 0
        }
      } else {
        const unit = r.unit_price != null ? Number(r.unit_price) : null
        const amt  = Number(r.amount ?? 0) || 0
        if (unit != null) tPrice += qty * (Number.isFinite(unit) ? unit : 0)
        else tPrice += amt
      }
    }
    return { extraFeeCost: tCost, extraFeePrice: tPrice }
  }, [extraFee.rows, tick])

  const [extraFeeLS, setExtraFeeLS] = useState<number | null>(null)
  useEffect(() => {
    const key = `eventcalc.extrafee.total:${eventId || ''}`
    const read = () => {
      try {
        const v = localStorage.getItem(key)
        setExtraFeeLS(v == null ? null : (Number(v) || 0))
      } catch {}
    }
    read()
    const onStorage = (e: StorageEvent) => { if (e.key === key) read() }
    const onEvt = (e: any) => {
      const d = (e as CustomEvent).detail
      if (!eventId || d?.eventId === eventId) setExtraFeeLS(Number(d?.total ?? 0) || 0)
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('extrafee:total', onEvt as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('extrafee:total', onEvt as EventListener)
    }
  }, [eventId])

  const extraFeePriceEff = (extraFeeLS ?? extraFeePrice)

  // ===== Discounts =====
  const discountHookTotal = Number(discountsHook.totalAmount ?? 0) || 0
  const [discountLS, setDiscountLS] = useState<number | null>(null)
  useEffect(() => {
    const key = `eventcalc.discounts.total:${eventId || ''}`
    const read = () => {
      try {
        const v = localStorage.getItem(key)
        setDiscountLS(v == null ? null : (Number(v) || 0))
      } catch {}
    }
    read()
    const onEvt = (e: any) => {
      const d = (e as CustomEvent).detail
      if (!eventId || d?.eventId === eventId) setDiscountLS(Number(d?.total ?? 0) || 0)
    }
    window.addEventListener('discounts:total', onEvt as EventListener)
    return () => { window.removeEventListener('discounts:total', onEvt as EventListener) }
  }, [eventId])
  const discountsTotal = discountLS ?? discountHookTotal

  // ===== Header LIVE override =====
  type HeaderLive = { people?: number; budgetPerPerson?: number; budgetTotal?: number; totalHours?: number }
  const [headerLive, setHeaderLive] = useState<HeaderLive | null>(null)
  useEffect(() => {
    const key = `eventcalc.header:${eventId || ''}`
    const read = () => {
      try {
        const raw = localStorage.getItem(key)
        setHeaderLive(raw ? (JSON.parse(raw) as HeaderLive) : null)
      } catch {}
    }
    read()
    const onStorage = (e: StorageEvent) => { if (e.key === key) read() }
    const onEvt = (e: any) => {
      const d = (e as CustomEvent).detail
      if (!eventId || d?.eventId === eventId) {
        setHeaderLive({
          people: Number(d?.people) || 0,
          budgetPerPerson: Number(d?.budgetPerPerson) || 0,
          budgetTotal: Number(d?.budgetTotal) || 0,
          totalHours: Number(d?.totalHours) || 0,
        })
      }
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('eventinfo:changed', onEvt as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('eventinfo:changed', onEvt as EventListener)
    }
  }, [eventId])

  // People & Budget
  const peopleCount = Number(headerLive?.people ?? header?.people_count ?? 0) || 0
  const budgetPerPerson = Number(headerLive?.budgetPerPerson ?? header?.budget_per_person_vnd ?? 0) || 0
  const budgetTotal = (() => {
    if (headerLive?.budgetTotal != null) return Number(headerLive.budgetTotal)
    if (header?.budget_total_vnd != null) return Number(header.budget_total_vnd)
    return peopleCount * budgetPerPerson
  })()

  // Hours
  const serviceHours = (() => {
    const live = Number(headerLive?.totalHours ?? 0)
    if (live > 0) return live
    return hoursBetweenISO(header?.start_at, header?.end_at)
  })()

  // Grand totals
  const grandCost = bundlesCost + equipmentCost + staffCost + transportCost + extraFeeCost
  const grandPrice = bundlesPrice + equipmentPrice + staffPrice + transportPrice + assetsPrice + extraFeePriceEff

  // After discounts
  const priceAfterDiscounts = grandPrice - discountsTotal
  const marginAfter = priceAfterDiscounts - grandCost
  const marginAfterPct = priceAfterDiscounts > 0 ? (marginAfter / priceAfterDiscounts) * 100 : 0
  const costPctAfter   = priceAfterDiscounts > 0 ? (grandCost / priceAfterDiscounts) * 100 : 0

  // Loading
  const anyLoading =
    (!eventId) ||
    !!companyAssets.loading ||
    !!extraFee.loading ||
    !!transport.loading ||
    !!transportSettings.loading ||
    !!eqRows.loading ||
    !!eqCatalog.loading ||
    !!(staffHook as any)?.loading ||
    !!(discountsHook as any)?.loading ||
    !!bundlesLoading

  const loadingUI = anyLoading && !viewSnap

  // Snapshot update
  useEffect(() => {
    if (!eventId) return
    if (!anyLoading) {
      const snap: TotalsSnapshot = {
        bundlesCost, bundlesPrice,
        equipmentCost, equipmentPrice,
        staffCost, staffPrice,
        transportCost, transportPrice,
        assetsPrice,
        extraFeeCost, extraFeePrice: extraFeePriceEff,
        grandCost, grandPrice,
        discountsTotal, priceAfterDiscounts,
        marginAfter, marginAfterPct, costPctAfter,
        peopleCount, budgetTotal, budgetPerPerson, serviceHours,
      }
      setViewSnap(snap)
      writeTotalsSnapshot(eventId, snap)
    }
  }, [
    eventId, anyLoading,
    bundlesCost, bundlesPrice,
    equipmentCost, equipmentPrice,
    staffCost, staffPrice,
    transportCost, transportPrice,
    assetsPrice,
    extraFeeCost, extraFeePriceEff,
    grandCost, grandPrice,
    discountsTotal, priceAfterDiscounts,
    marginAfter, marginAfterPct, costPctAfter,
    peopleCount, budgetTotal, budgetPerPerson, serviceHours,
  ])

  // Fonte render
  const src = (!anyLoading && viewSnap)
    ? viewSnap
    : (anyLoading && viewSnap)
      ? viewSnap
      : {
          bundlesCost, bundlesPrice,
          equipmentCost, equipmentPrice,
          staffCost, staffPrice,
          transportCost, transportPrice,
          assetsPrice,
          extraFeeCost, extraFeePrice: extraFeePriceEff,
          grandCost, grandPrice,
          discountsTotal, priceAfterDiscounts,
          marginAfter, marginAfterPct, costPctAfter,
          peopleCount, budgetTotal, budgetPerPerson, serviceHours,
        }

  /* ──────────────────────────────────────────
     Payment split: stato locale + sync + SAVE BAR
     ────────────────────────────────────────── */
  type PaymentPref = {
    plan: 'full' | 'installments'
    depPct: number
    balPct: number
    depAmtLS?: number | null
    balAmtLS?: number | null
  }

  // DB preferito per le %, ma **NON** scartiamo mai gli importi LS (se presenti)
  function readPaymentPref(): PaymentPref {
    // 0) leggi eventuale LS per importi
    let ls: any = null
    try {
      const raw = localStorage.getItem(`eventcalc.payment:${eventId || ''}`)
      if (raw) ls = JSON.parse(raw)
    } catch {}

    const depAmtLS = Number.isFinite(Number(ls?.deposit_amount_vnd)) ? Number(ls.deposit_amount_vnd) : null
    const balAmtLS = Number.isFinite(Number(ls?.balance_amount_vnd)) ? Number(ls.balance_amount_vnd) : null

    // 1) Dal DB header (VINCE per le %)
    const planDb = (header as any)?.payment_plan as 'full' | 'installments' | undefined
    const depDb = normDbPct((header as any)?.deposit_percent)
    const balDb = normDbPct((header as any)?.balance_percent)

    if (planDb || depDb != null || balDb != null) {
      const plan: 'full' | 'installments' =
        planDb === 'full' || planDb === 'installments'
          ? planDb
          : (depDb != null && depDb > 0 && depDb < 100 ? 'installments' : 'full')
      const depPct = depDb != null ? depDb : (plan === 'full' ? 0 : 50)
      const balPct = balDb != null ? balDb : (plan === 'full' ? 100 : Math.max(0, 100 - depPct))
      return { plan, depPct, balPct, depAmtLS, balAmtLS }
    }

    // 2) Solo LS (caso senza DB)
    if (ls) {
      const depPct = Number(ls?.deposit_percent ?? 0) || 0
      const balPct = Number(ls?.balance_percent ?? Math.max(0, 100 - depPct)) || 0
      const plan: 'full' | 'installments' =
        (ls?.plan === 'installments' || ls?.plan === 'full')
          ? ls.plan
          : (depPct > 0 && depPct < 100 ? 'installments' : 'full')
      return { plan, depPct, balPct, depAmtLS, balAmtLS }
    }

    // 3) fallback
    return { plan: 'full', depPct: 0, balPct: 100, depAmtLS: null, balAmtLS: null }
  }

  const [{ depAmt, balAmt }, setAmts] = useState<{depAmt: number; balAmt: number}>({ depAmt: 0, balAmt: 0 })

  // SAVE BAR plumbing
  const [dirty, setDirty] = useState<boolean>(false)
  function announceDirty(v: boolean) {
    if (typeof window === 'undefined') return
    try {
      window.dispatchEvent(new CustomEvent('eventcalc:dirty', {
        detail: { eventId: eventId || null, card: 'totals', dirty: v }
      }))
    } catch {}
  }
  function announceSaved() {
    if (typeof window === 'undefined') return
    try {
      window.dispatchEvent(new CustomEvent('eventcalc:saved', {
        detail: { eventId: eventId || null, card: 'totals' }
      }))
    } catch {}
  }

  // Idrata importi da DB/LS quando cambiano header o totale
  useEffect(() => {
    const total = Math.max(0, Number(src.priceAfterDiscounts || 0))
    const pref = readPaymentPref()

    // Se in LS ho importi locali, **usali** (anche se il DB ha le %)
    if (pref.depAmtLS != null && pref.balAmtLS != null) {
      const dep = Math.max(0, Math.min(pref.depAmtLS, total))
      const bal = Math.max(0, Math.min(pref.balAmtLS, total - dep))
      setAmts({ depAmt: dep, balAmt: bal })
      return
    }

    // Altrimenti calcola dalle % del DB/LS
    const dep = Math.round((pref.depPct / 100) * total)
    const bal = Math.max(0, total - dep)
    setAmts({ depAmt: dep, balAmt: bal })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, src.priceAfterDiscounts, header?.payment_plan, (header as any)?.deposit_percent, (header as any)?.balance_percent])

  // Ascolta Company Info (EventInfoCard) → aggiorna importi qui
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onEvt = (e: any) => {
      const d = (e as CustomEvent).detail
      if (!eventId || d?.eventId === eventId) {
        const total = Math.max(0, Number(src.priceAfterDiscounts || 0))
        const depPct = Number(d?.deposit_percent ?? 0) || 0
        const dep = Math.round((depPct / 100) * total)
        const bal = Math.max(0, total - dep)
        setAmts({ depAmt: dep, balAmt: bal })
      }
    }
    window.addEventListener('payment:changed', onEvt as EventListener)
    return () => window.removeEventListener('payment:changed', onEvt as EventListener)
  }, [eventId, src.priceAfterDiscounts])

  // Commit locale (NO DB): scrive LS + spara evento per Company Info
  const commitPaymentLocal = (depAmount: number) => {
    const total = Math.max(0, Number(src.priceAfterDiscounts || 0))
    const dep = Math.max(0, Math.min(depAmount, total))
    const bal = Math.max(0, total - dep)

    const depPctExact = total > 0 ? (dep / total) * 100 : 0
    const balPctExact = Math.max(0, 100 - depPctExact)
    const plan: 'full' | 'installments' = depPctExact > 0 && depPctExact < 100 ? 'installments' : 'full'
    const payment_term = plan === 'full'
      ? '100% full payment'
      : `${pctStrFull(depPctExact)}/${pctStrFull(balPctExact)}`

    const key = `eventcalc.payment:${eventId || ''}`
    try {
      localStorage.setItem(key, JSON.stringify({
        plan,
        payment_term,
        deposit_percent: depPctExact,   // alta precisione
        balance_percent: balPctExact,   // alta precisione
        deposit_amount_vnd: dep,        // 👈 mantieni importi esatti
        balance_amount_vnd: bal,
      }))
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent('payment:changed', {
        detail: { eventId: eventId || null, plan, deposit_percent: depPctExact, balance_percent: balPctExact }
      }))
    } catch {}

    setAmts({ depAmt: dep, balAmt: bal })
    if (!dirty) { setDirty(true); announceDirty(true) }
  }

  const onChangeDeposit = (v: string) => {
    const n = parseCurrency(v)
    commitPaymentLocal(n)
  }
  const onChangeBalance = (v: string) => {
    const total = Math.max(0, Number(src.priceAfterDiscounts || 0))
    const n = parseCurrency(v)
    const dep = Math.max(0, total - n)
    commitPaymentLocal(dep)
  }

  // SAVE BAR → salva su DB (percentuali + _01 per più precisione)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onGlobalSave = async () => {
      if (!dirty || !save) return
      const total = Math.max(0, Number(src.priceAfterDiscounts || 0))
      const dep = Math.max(0, Math.min(depAmt, total))
      const bal = Math.max(0, total - dep)

      const depPctExact = total > 0 ? (dep / total) * 100 : 0
      const balPctExact = Math.max(0, 100 - depPctExact)
      const depPct01 = total > 0 ? Math.max(0, Math.min(1, dep / total)) : 0
      const balPct01 = Math.max(0, 1 - depPct01)
      const plan: 'full' | 'installments' = depPctExact > 0 && depPctExact < 100 ? 'installments' : 'full'
      const payment_term = plan === 'full'
        ? '100% full payment'
        : `${pctStrFull(depPctExact)}/${pctStrFull(balPctExact)}`

      await save({
        payment_plan: plan as any,
        payment_term,
        deposit_percent: depPctExact as any,
        balance_percent: balPctExact as any,
        deposit_percent_01: depPct01 as any,   // 👈 salva anche 0..1 ad alta precisione
        balance_percent_01: balPct01 as any,
      } as any)

      setDirty(false)
      announceDirty(false)
      announceSaved()
    }
    window.addEventListener('eventcalc:save', onGlobalSave as EventListener)
    return () => window.removeEventListener('eventcalc:save', onGlobalSave as EventListener)
  }, [dirty, save, depAmt, src.priceAfterDiscounts, eventId])

  // percentuali live per UI (senza arrotondare a 0.1)
  const depPctLive = src.priceAfterDiscounts > 0 ? (depAmt / src.priceAfterDiscounts) * 100 : 0
  const balPctLive = Math.max(0, 100 - depPctLive)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold">{t('totals.title')}</h2>
      </div>

      <div className="p-4 space-y-4">
        {loadingUI && <div className="text-sm text-gray-500">{t('totals.loading')}</div>}

        {!loadingUI && (
          <>
            {/* Tabella Cost | Price */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-700">
                    <th className="text-left px-3 py-2">{t('totals.col.section')}</th>
                    <th className="text-right px-3 py-2 w-[200px]">{t('totals.col.cost')}</th>
                    <th className="text-right px-3 py-2 w-[160px]">{t('totals.col.price')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <Row label={t('totals.row.bundles')}        cost={src.bundlesCost}        price={src.bundlesPrice} />
                  <Row label={t('totals.row.equipment')}      cost={src.equipmentCost}      price={src.equipmentPrice} />
                  <Row label={t('totals.row.staff')}          cost={src.staffCost}          price={src.staffPrice} />
                  <Row label={t('totals.row.transport')}      cost={src.transportCost}      price={src.transportPrice} />
                  <Row label={t('totals.row.assets')}         cost={0}                      price={src.assetsPrice} />
                  <Row label={t('totals.row.extrafee')}       cost={src.extraFeeCost}       price={src.extraFeePrice} />
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td className="px-3 py-3 text-right font-semibold">{t('totals.label.totals')}</td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {fmt(src.grandCost)}
                      {src.grandPrice > 0 && (
                        <span className="text-gray-500 text-xs ml-2">({((src.grandCost / src.grandPrice) * 100).toFixed(1)}%)</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">{fmt(src.grandPrice)}</td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="px-3 py-2 text-right text-gray-700">{t('discounts.total_label')}</td>
                    <td className="px-3 py-2 text-right text-gray-400">-</td>
                    <td className="px-3 py-2 text-right font-semibold text-red-700">− {fmt(src.discountsTotal)}</td>
                  </tr>
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td className="px-3 py-3 text-right font-semibold">{t('totals.label.after_discounts')}</td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {fmt(src.grandCost)}
                      {src.priceAfterDiscounts > 0 && (
                        <span className="text-gray-500 text-xs ml-2">({src.costPctAfter.toFixed(1)}%)</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">{fmt(src.priceAfterDiscounts)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Payment split (editable) */}
            <div className="border border-gray-200 rounded-xl p-3 bg-white">
              <div className="text-sm font-semibold text-gray-800 mb-2">{t('totals.payment_split.title')}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col">
                  <span className="text-xs text-gray-600">
                    {t('payment.deposit')} ({pctStrFull(depPctLive)}%)
                  </span>
                  <input
                    className="mt-1 w-full border rounded-lg px-2 h-10 text-gray-900 bg-white text-right tabular-nums"
                    value={formatCurrency(depAmt)}
                    onChange={e => onChangeDeposit(e.target.value ?? '')}
                    inputMode="numeric"
                  />
                </label>
                <label className="flex flex-col">
                  <span className="text-xs text-gray-600">
                    {t('payment.balance')} ({pctStrFull(balPctLive)}%)
                  </span>
                  <input
                    className="mt-1 w-full border rounded-lg px-2 h-10 text-gray-900 bg-white text-right tabular-nums"
                    value={formatCurrency(balAmt)}
                    onChange={e => onChangeBalance(e.target.value ?? '')}
                    inputMode="numeric"
                  />
                </label>
              </div>
              <div className="mt-2 text-[11px] text-gray-500">
                {t('totals.payment_split.note')}
              </div>
            </div>

            {/* KPI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
              <KPIBlock label={t('totals.kpi.margin_pct')} value={Number.isFinite(src.marginAfterPct) ? `${src.marginAfterPct.toFixed(1)}%` : '-'} />
              <KPIBlock label={t('totals.kpi.margin')}    value={fmt(src.marginAfter)} />
              <KPIBlock label={t('totals.kpi.cost_pct')}  value={Number.isFinite(src.costPctAfter)   ? `${src.costPctAfter.toFixed(1)}%`   : '-'} />
              <KPIBlock label={t('totals.kpi.people')}    value={src.peopleCount && src.peopleCount > 0 ? fmt(src.peopleCount) : '-'} />
              <KPIBlock label={t('totals.kpi.service_hours')} value={src.serviceHours && src.serviceHours > 0 ? String(src.serviceHours) : '-'} />
              <KPIBlock
                label={t('totals.kpi.budget_total')}
                value={src.budgetTotal && src.budgetTotal > 0 ? fmt(src.budgetTotal) : '-'}
                sub={src.peopleCount && src.budgetPerPerson && src.peopleCount > 0 && src.budgetPerPerson > 0 ? `~ ${fmt(src.budgetPerPerson)}${t('totals.kpi.per_person_suffix')}` : undefined}
              />
              <KPIBlock
                label={t('totals.kpi.delta_vs_budget')}
                valueClassName={
                  !src.budgetTotal || src.budgetTotal <= 0 ? 'text-gray-800'
                    : (src.priceAfterDiscounts - (src.budgetTotal || 0)) > 0 ? 'text-red-700'
                    : (src.priceAfterDiscounts - (src.budgetTotal || 0)) < 0 ? 'text-green-700'
                    : 'text-gray-800'
                }
                value={
                  src.budgetTotal && src.budgetTotal > 0
                    ? `${(src.priceAfterDiscounts - src.budgetTotal) > 0 ? '+' : ''}${fmt(src.priceAfterDiscounts - src.budgetTotal)}`
                    : '-'
                }
                sub={
                  src.budgetTotal && src.budgetTotal > 0
                    ? (() => {
                        const pct = ((src.priceAfterDiscounts - src.budgetTotal) / src.budgetTotal) * 100
                        return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`
                      })()
                    : undefined
                }
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, cost, price }: { label: string; cost: number; price: number }) {
  const pct = price > 0 ? (cost / price) * 100 : NaN
  return (
    <tr>
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2 text-right">
        <span className="tabular-nums">{fmt(cost)}</span>
        {price > 0 && (<span className="text-gray-500 text-xs ml-2">({pct.toFixed(1)}%)</span>)}
      </td>
      <td className="px-3 py-2 text-right">{fmt(price)}</td>
    </tr>
  )
}

function KPIBlock({
  label, value, sub, valueClassName = '',
}: { label: string; value: string; sub?: string; valueClassName?: string }) {
  return (
    <div className="border border-gray-200 rounded-xl p-3 bg-white shadow-sm">
      <div className="text-xs text-gray-600">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${valueClassName}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 tabular-nums">{sub}</div>}
    </div>
  )
}