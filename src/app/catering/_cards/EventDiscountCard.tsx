// src/app/catering/_cards/EventDiscountCard.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Switch } from '@headlessui/react'
import { PlusIcon, TrashIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline'
import { useEventCalc } from '@/app/catering/_state/EventCalcProvider'
import useEventDiscountRows from '@/app/catering/_data/useEventDiscountRows'

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

// Bundles + items
import { useEventBundles as useEventBundlesDB } from '@/app/catering/_data/useEventBundles'
import useFinalDishes from '@/app/catering/_data/useFinalDishes'
import useMaterials from '@/app/catering/_data/useMaterials'

// Company assets + Extra fee
import { useEventCompanyAssetRows } from '@/app/catering/_data/useEventCompanyAssetRows'
import { useEventExtraFeeRows } from '@/app/catering/_data/useEventExtraFeeRows'

// Calc bus
import { emitCalcTick } from '@/app/catering/_data/useCalcBus'

// Stesse util della page per coerenza
import { effectiveLimit, getMarkupX, type BundleConfig } from '@/app/catering/_settings/bundleConfig'

// Supabase per fallback settings
import { supabase } from '@/lib/supabase_shim'

// i18n
import { useECT } from '../_i18n'

/* ============== Helpers ============== */
const fmt = (n: number | null | undefined) => {
  if (n == null || Number.isNaN(n)) return '-'
  try { return new Intl.NumberFormat('en-US').format(Math.round(n)) } catch { return String(Math.round(n ?? 0)) }
}
const toInt = (v: string) => {
  const s = (v ?? '').replace(/[^\d-]/g, '')
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n) : 0
}
const round0 = (n: number) => Math.round(Number.isFinite(n) ? n : 0)

/* ==== Meta in LS ==== */
type PctScope =
  | 'bundles_all'
  | `bundle:${string}`
  | 'equipment'
  | 'staff'
  | 'transport'
  | 'assets'
  | 'total_excl_extrafee'
  | 'total_incl_extrafee'
type PctMeta = { enabled: boolean; pctValue: string; scope: PctScope }
type PctMetaMap = Record<string, PctMeta>
const DEFAULT_SCOPE: PctScope = 'total_incl_extrafee'
const LS_META_KEY = 'eventcalc.discounts.pctmeta'
const LS_BUNDLE_SETTINGS_KEY = 'eventcalc.bundleSettings'

function loadMeta(): PctMetaMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = JSON.parse(localStorage.getItem(LS_META_KEY) || '{}') as Record<string, any>
    const fixed: PctMetaMap = {}
    for (const [id, m] of Object.entries(raw)) {
      fixed[id] = {
        enabled: !!(m as any).enabled,
        pctValue: typeof (m as any).pctValue === 'string' ? (m as any).pctValue : '0',
        scope: ((m as any).scope as PctScope) || DEFAULT_SCOPE,
      }
    }
    return fixed
  } catch { return {} }
}
function saveMeta(m: PctMetaMap) { try { localStorage.setItem(LS_META_KEY, JSON.stringify(m)) } catch {} }
function isBundleScope(s: PctScope) { return s.startsWith('bundle:') }
function safeParseJSON<T=any>(s: string | null): T | null { if (!s) return null; try { return JSON.parse(s) as T } catch { return null } }

/* ==== LIVE totals hook (preferisce broadcast/LS, fallback su DB) ==== */
const readJSON = <T,>(k: string): T | null => {
  try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) as T : null } catch { return null }
}
const readNum = (k: string): number | null => {
  try { const raw = localStorage.getItem(k); if (raw == null) return null; const n = Number(raw); return Number.isFinite(n) ? n : null } catch { return null }
}

type LiveTotals = {
  bundles: number | null
  equipment: number | null
  staff: number | null
  transport: number | null
  assets: number | null
  extrafee: number | null
}

function useLiveSectionTotals(eventId?: string | null): LiveTotals {
  const [live, setLive] = useState<LiveTotals>({ bundles: null, equipment: null, staff: null, transport: null, assets: null, extrafee: null })

  useEffect(() => {
    if (!eventId) return
    const eq  = readJSON<{ cost?: number; price?: number }>(`eventcalc.equipment.totals:${eventId}`)
    const st  = readNum(`eventcalc.staff.price:${eventId}`)
    const tr  = readJSON<{ cost?: number; price?: number }>(`eventcalc.transport.totals:${eventId}`)
    const as  = readNum(`eventcalc.assets.total:${eventId}`)
    const ef  = readNum(`eventcalc.extrafee.total:${eventId}`)
    const b1  = readNum(`eventcalc.bundles.total:${eventId}`)
    const b2  = readNum(`eventcalc.bundles.price:${eventId}`)
    const b3  = readJSON<{ price?: number; total?: number }>(`eventcalc.bundles.totals:${eventId}`)
    const bu  = b1 ?? b2 ?? (b3?.price ?? b3?.total ?? null)
    setLive({
      bundles: bu ?? null,
      equipment: eq?.price ?? null,
      staff: st ?? null,
      transport: tr?.price ?? null,
      assets: as ?? null,
      extrafee: ef ?? null,
    })
  }, [eventId])

  useEffect(() => {
    if (!eventId) return
    const onEq = (e: any) => { if (e?.detail?.eventId === eventId) setLive(s => ({ ...s, equipment: Number(e.detail?.price || 0) })) }
    const onSt = (e: any) => { if (e?.detail?.eventId === eventId) setLive(s => ({ ...s, staff: Number(e.detail?.price || 0) })) }
    const onTr = (e: any) => { if (e?.detail?.eventId === eventId) setLive(s => ({ ...s, transport: Number(e.detail?.price || 0) })) }
    const onAs = (e: any) => { if (e?.detail?.eventId === eventId) setLive(s => ({ ...s, assets: Number(e.detail?.total || 0) })) }
    const onBu = (e: any) => { if (e?.detail?.eventId === eventId) setLive(s => ({ ...s, bundles: Number(e.detail?.price ?? e.detail?.total ?? 0) })) }
    const onEf = (e: any) => { if (e?.detail?.eventId === eventId) setLive(s => ({ ...s, extrafee: Number(e.detail?.total || 0) })) }

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
        } else if (k.startsWith('eventcalc.extrafee.total')) {
          setLive(s => ({ ...s, extrafee: readNum(k) }))
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
    window.addEventListener('extrafee:total', onEf as EventListener)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('equipment:totals', onEq as EventListener)
      window.removeEventListener('staff:totals', onSt as EventListener)
      window.removeEventListener('transport:totals', onTr as EventListener)
      window.removeEventListener('assets:total', onAs as EventListener)
      window.removeEventListener('bundles:totals', onBu as EventListener)
      window.removeEventListener('extrafee:total', onEf as EventListener)
      window.removeEventListener('storage', onStorage)
    }
  }, [eventId])

  return live
}

/* ==== Fallbacks per prezzi base (in caso non ci sia stato LIVE) ==== */
function useBaseFallbacks(eventId?: string | null) {
  // Bundles
  const { bundles } = useEventBundlesDB(eventId || '')
  const { dishes } = useFinalDishes()
  const { materials } = useMaterials()
  const itemsMap = useMemo(() => {
    const m = new Map<string, { unit_cost: number | null }>()
    for (const d of dishes || []) m.set(String(d.id), { unit_cost: d.unit_cost })
    for (const it of materials || []) m.set(String(it.id), { unit_cost: it.unit_cost })
    return m
  }, [dishes, materials])

  const [bundleSettings, setBundleSettings] = useState<Record<string, BundleConfig>>({})
  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const fromLS = safeParseJSON<Record<string, BundleConfig>>(
        typeof window !== 'undefined' ? localStorage.getItem(LS_BUNDLE_SETTINGS_KEY) : null
      )
      if (fromLS && Object.keys(fromLS).length) { if (!cancelled) setBundleSettings(fromLS); return }
      const { data } = await supabase.from('bundle_types').select('*').order('key', { ascending: true })
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
      if (!cancelled) {
        setBundleSettings(map)
        try { localStorage.setItem(LS_BUNDLE_SETTINGS_KEY, JSON.stringify(map)) } catch {}
      }
    }
    hydrate()
    return () => { cancelled = true }
  }, [])

  const bundlePriceById = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of (bundles || [])) {
      const cfg = bundleSettings[b.type_key]
      const limit = effectiveLimit(cfg || undefined)
      const mx = getMarkupX(cfg) || 1
      let price = 0
      for (const r of (b.rows || [])) {
        const q = Math.max(0, Number(r.qty ?? 0)) || 0
        if (r.dish_id != null && r.dish_id !== '') {
          const uc = Number(itemsMap.get(String(r.dish_id))?.unit_cost ?? 0) || 0
          price += q * uc * mx
        }
        const mods: any[] = Array.isArray(r.modifiers) ? r.modifiers : []
        for (const mid of mods.slice(0, limit)) {
          if (!mid) continue
          const uc = Number(itemsMap.get(String(mid))?.unit_cost ?? 0) || 0
          price += q * uc * mx
        }
      }
      map.set(String(b.id), price)
    }
    return map
  }, [bundles, bundleSettings, itemsMap])

  const bundlesPriceFallback = useMemo(
    () => Array.from(bundlePriceById.values()).reduce((a, x) => a + x, 0),
    [bundlePriceById]
  )

  // Equipment
  const { rows: eqRows } = useEventEquipmentRows(eventId || null)
  const { equipment: eqMaster } = useEquipment()
  const eqById = useMemo(() => new Map(eqMaster.map(e => [e.id, e])), [eqMaster])
  const equipmentPriceFallback = useMemo(() => {
    let tot = 0
    for (const r of eqRows || []) {
      const it = r.equipment_id ? eqById.get(r.equipment_id) : undefined
      const unitCostOverride = r.unit_cost_override != null ? Number(r.unit_cost_override) : null
      const unitCost = unitCostOverride != null ? (Number.isFinite(unitCostOverride) ? unitCostOverride! : 0) : (Number(it?.cost ?? 0) || 0)
      const markupX = r.markup_x_override != null ? (Number(r.markup_x_override) || 1) : null
      const unitPrice = markupX != null ? unitCost * markupX : (Number(it?.final_price ?? 0) || unitCost)
      const qty = Number(r.qty ?? 0) || 0
      tot += unitPrice * qty
    }
    return tot
  }, [eqRows, eqById])

  // Staff
  const { rows: staffRows } = useStaffRows(eventId || '')
  const ss = useStaffSettings(eventId || '')
  const staffMarkup = Number(ss.settings?.markup_x ?? 1) || 1
  const staffPriceFallback = useMemo(() => {
    const simple = (staffRows || []).map(r => ({ cost_per_hour: r.cost_per_hour, hours: r.hours }))
    const t = calcStaffTotals(simple, staffMarkup)
    return t.priceTotal || 0
  }, [staffRows, staffMarkup])

  // Transport
  const { rows: trRows } = useEventTransportRows(eventId || null)
  const ts = useTransportSettings(eventId || null)
  const vtMap = useMemo(() => new Map(ts.vehicleTypes.map(v => [v.id, v])), [ts.vehicleTypes])
  const transportGlobalMx = Number(ts.settings?.markup_x ?? 1) || 1
  const transportPriceFallback = useMemo(() => {
    let cost = 0
    for (const r of trRows || []) {
      const vt = r.vehicle_key ? vtMap.get(r.vehicle_key) : undefined
      const km = Number(r.distance_km ?? 0) || 0
      const legs = r.round_trip ? 2 : 1
      const cpk = Number(r.cost_per_km ?? vt?.cost_per_km ?? 0) || 0
      cost += km * legs * cpk
    }
    return cost * transportGlobalMx
  }, [trRows, vtMap, transportGlobalMx])

  // Company assets
  const assetsHook = useEventCompanyAssetRows(eventId || null)
  const assetsPriceFallback = useMemo(() => {
    let t = 0
    for (const r of assetsHook.rows || []) {
      if (!r.include_price) continue
      const qty = Number(r.qty ?? 0) || 0
      const unit = Number(r.unit_price_vnd ?? 0) || 0
      t += qty * unit
    }
    return t
  }, [assetsHook.rows])

  // Extra fee (fallback quando non c'è live)
  const extraFeeHook = useEventExtraFeeRows(eventId || '')
  const extraFeePriceFallback = useMemo(() => {
    let t = 0
    const rowsEF: any[] = Array.isArray(extraFeeHook.rows) ? extraFeeHook.rows : []
    for (const r of rowsEF) {
      const qty = Number(r.qty ?? 1) || 1
      const calc = !!r.calc_mode
      if (calc) {
        const c  = Number(r.cost ?? 0) || 0
        const mx = Number(r.markup_x ?? 1) || 1
        if (c > 0) t += qty * c * mx
        else t += Number(r.amount ?? 0) || 0
      } else {
        const unit = r.unit_price != null ? Number(r.unit_price) : null
        const amt  = Number(r.amount ?? 0) || 0
        if (unit != null) t += qty * (Number.isFinite(unit) ? unit : 0)
        else t += amt
      }
    }
    return t
  }, [extraFeeHook.rows])

  return {
    bundlePriceById,
    bundlesPriceFallback,
    equipmentPriceFallback,
    staffPriceFallback,
    transportPriceFallback,
    assetsPriceFallback,
    extraFeePriceFallback,
  }
}

/* ======= Card ======= */
export default function EventDiscountCard() {
  const t = useECT() as (k: any, fallback?: string) => string
  const calcCtx = useEventCalc() as any
  const eventId: string | undefined = calcCtx?.eventId || calcCtx?.draftEventId

  // Hook righe sconti (DB)
  const { rows, canQuery, error, createRow, updateRow, deleteRow } = useEventDiscountRows(eventId)

  // Fallbacks per prezzi base
  const fallbacks = useBaseFallbacks(eventId)

  // LIVE preferito + fallback
  const live = useLiveSectionTotals(eventId)
  const bundles_all   = (live.bundles   ?? fallbacks.bundlesPriceFallback)
  const equipmentTot  = (live.equipment ?? fallbacks.equipmentPriceFallback)
  const staffTot      = (live.staff     ?? fallbacks.staffPriceFallback)
  const transportTot  = (live.transport ?? fallbacks.transportPriceFallback)
  const assetsTot     = (live.assets    ?? fallbacks.assetsPriceFallback)
  const extrafeeTot   = (live.extrafee  ?? fallbacks.extraFeePriceFallback)

  // Totali base per scope (non includono mai gli sconti)
  const baseTotalsLive = {
    bundles_all,
    equipment: equipmentTot,
    staff: staffTot,
    transport: transportTot,
    assets: assetsTot,
    total_excl_extrafee: bundles_all + equipmentTot + staffTot + transportTot + assetsTot,
    total_incl_extrafee: bundles_all + equipmentTot + staffTot + transportTot + assetsTot + extrafeeTot,
  }

  // META (IN-MEMORY; LS solo su save globale)
  const [pctMeta, setPctMeta] = useState<PctMetaMap>(() => loadMeta())

  // UI Draft (label + manuale) solo locale
  const [drafts, setDrafts] = useState<Record<string, { label: string; unit: string }>>({})
  useEffect(() => {
    setDrafts(prev => {
      const next = { ...prev }
      for (const r of rows) {
        if (!next[r.id]) next[r.id] = { label: r.label ?? '', unit: String(Math.round(r.amount ?? 0)) }
      }
      const ids = new Set(rows.map(r => r.id))
      for (const k of Object.keys(next)) if (!ids.has(k)) delete next[k]
      return next
    })
  }, [rows])

  const onDraft = (id: string, key: 'label' | 'unit', val: string) => {
    setDrafts(prev => ({ ...prev, [id]: { ...(prev[id] || { label: '', unit: '0' }), [key]: val } }))
    emitCalcTick()
  }

  // Modal state (solo locale; nessun commit DB/LS)
  const [modalFor, setModalFor] = useState<string | null>(null)
  const modalSnap = useRef<{ id: string; meta: PctMeta } | null>(null)

  function openModal(id: string) {
    const current = pctMeta[id] || { enabled: !!rows.find(x => x.id === id)?.calc_mode, pctValue: '0', scope: DEFAULT_SCOPE }
    modalSnap.current = { id, meta: { ...current } }
    setModalFor(id)
  }
  function closeModal() { modalSnap.current = null; setModalFor(null) }

  function baseFromScope(scope: PctScope): number {
    return scope === 'bundles_all' ? baseTotalsLive.bundles_all
      : scope === 'equipment' ? baseTotalsLive.equipment
      : scope === 'staff' ? baseTotalsLive.staff
      : scope === 'transport' ? baseTotalsLive.transport
      : scope === 'assets' ? baseTotalsLive.assets
      : scope === 'total_excl_extrafee' ? baseTotalsLive.total_excl_extrafee
      : scope === 'total_incl_extrafee' ? baseTotalsLive.total_incl_extrafee
      : /* bundle:ID */ (fallbacks.bundlePriceById.get(String(scope.slice('bundle:'.length))) || 0)
  }

  function Modal({ id }: { id: string }) {
    // Hook chiamati incondizionatamente per rispettare le regole dei hook
    const { bundles: modalBundles } = useEventBundlesDB(eventId || '')

    const row = rows.find(r => r.id === id)

    // Iniziali stabili per gli state locali del modale
    type BaseUI = 'bundles' | 'equipment' | 'staff' | 'transport' | 'assets' | 'total_excl_extrafee' | 'total_incl_extrafee'
    const scopeToBaseUI = (s: PctScope): BaseUI => (isBundleScope(s) || s === 'bundles_all') ? 'bundles' : (s as BaseUI)

    const initialMeta = useMemo<PctMeta>(() => {
      const fromSnap = modalSnap.current?.meta
      if (fromSnap) return fromSnap
      const existing = pctMeta[id]
      const enabled = existing?.enabled ?? !!row?.calc_mode
      const pctValue = existing?.pctValue ?? '0'
      const scope = existing?.scope ?? DEFAULT_SCOPE
      return { enabled, pctValue, scope }
    }, [id, pctMeta, row])

    const [enabled, setEnabled] = useState<boolean>(initialMeta.enabled)
    const [pctValue, setPctValue] = useState<string>(initialMeta.pctValue)
    const [baseUI, setBaseUI] = useState<BaseUI>(scopeToBaseUI(initialMeta.scope))
    const [bundleSel, setBundleSel] = useState<string>(isBundleScope(initialMeta.scope) ? initialMeta.scope.slice('bundle:'.length) : 'bundles_all')

    // Se la riga sparisce mentre il modale è aperto, chiudilo in modo pulito
    useEffect(() => { if (!row) closeModal() }, [row])

    const onSave = async () => {
      const scope: PctScope = baseUI === 'bundles'
        ? (bundleSel === 'bundles_all' ? 'bundles_all' : (`bundle:${bundleSel}` as PctScope))
        : (baseUI as PctScope)

      // Solo stato in-memory (niente LS qui!)
      const nextMap: PctMetaMap = { ...pctMeta, [id]: { enabled, pctValue, scope } }
      setPctMeta(nextMap)

      closeModal()
      emitCalcTick()
    }

    return (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="text-base font-semibold text-gray-900">{t('discounts.modal.title', 'Percentage settings')}</div>
              <button onClick={closeModal} className="p-1 rounded hover:bg-gray-100" aria-label={t('discounts.modal.close', 'Close')}>✕</button>
            </div>
            <div className="p-4 space-y-4 text-gray-900">
              <div className="grid sm:grid-cols-3 gap-3 items-end">
                <label className="flex flex-col sm:col-span-1">
                  <span className="text-sm text-gray-700">{t('discounts.modal.mode', 'Percentage mode')}</span>
                  <div className="h-10 flex items-center">
                    <Switch
                      checked={enabled}
                      onChange={setEnabled}
                      className={`${enabled ? 'bg-blue-600' : 'bg-gray-300'} relative inline-flex h-6 w-11 items-center rounded-full transition`}
                    >
                      <span className={`${enabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition`} />
                    </Switch>
                  </div>
                </label>

                <label className="flex flex-col sm:col-span-1">
                  <span className="text-sm text-gray-700">{t('discounts.modal.percent', 'Percentage (%)')}</span>
                  <input
                    inputMode="numeric"
                    className="mt-1 w-full border rounded-lg px-3 h-10 text-right"
                    value={pctValue}
                    onChange={(e) => setPctValue((e.target.value ?? '').replace(/[^\d-]/g, ''))}
                  />
                </label>

                <label className="flex flex-col sm:col-span-1">
                  <span className="text-sm text-gray-700">{t('discounts.modal.base', 'Base')}</span>
                  <select
                    className="mt-1 w-full border rounded-lg px-3 h-10"
                    value={baseUI}
                    onChange={(e) => setBaseUI(e.target.value as BaseUI)}
                  >
                    <option value="bundles">{t('discounts.base.bundles', 'Bundles')}</option>
                    <option value="equipment">{t('discounts.base.equipment', 'Equipment')}</option>
                    <option value="staff">{t('discounts.base.staff', 'Staff')}</option>
                    <option value="transport">{t('discounts.base.transport', 'Transport')}</option>
                    <option value="assets">{t('discounts.base.assets', 'Company assets')}</option>
                    <option value="total_excl_extrafee">{t('discounts.base.total_excl_extrafee', 'Totals (exclude extra fees)')}</option>
                    <option value="total_incl_extrafee">{t('discounts.base.total_incl_extrafee', 'Totals (include extra fees)')}</option>
                  </select>
                </label>
              </div>

              {baseUI === 'bundles' && (
                <div className="grid sm:grid-cols-1 gap-3">
                  <label className="flex flex-col">
                    <span className="text-sm text-gray-700">{t('discounts.modal.bundle_specific', 'Specific bundle')}</span>
                    <select
                      className="mt-1 w-full border rounded-lg px-3 h-10"
                      value={bundleSel}
                      onChange={(e) => setBundleSel(e.target.value)}
                    >
                      <option value="bundles_all">{t('discounts.modal.bundles_all', '- All bundles -')}</option>
                      {(modalBundles || []).map(b => (
                        <option key={b.id} value={String(b.id)}>{`${t('discounts.modal.bundle_prefix', 'Bundle:')} ${b.label}`}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              <div className="text-xs text-gray-600">
                {t('discounts.modal.note', 'No DB/LS write until you press global Save. UI shows local live values.')}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button type="button" onClick={closeModal} className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50">
                  {t('common.cancel', 'Cancel')}
                </button>
                <button type="button" onClick={onSave} className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:opacity-90">
                  {t('common.save', 'Save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ======= LIVE total (draft/meta) ======= */

  // Calcolo importo riga live: se abilitata e non c'è meta usa amount del DB (no 0)
  const liveRowAmountFor = (r: { id: string; amount?: number | null; calc_mode?: boolean | null }) => {
    const meta = pctMeta[r.id]
    const enabled = (meta?.enabled ?? !!r.calc_mode)
    if (!enabled) {
      const raw = drafts[r.id]?.unit ?? String(r.amount ?? 0)
      return Math.max(0, toInt(raw))
    }
    // enabled: usa meta se presente, altrimenti amount DB
    if (!meta) return Math.max(0, round0(Number(r.amount ?? 0)))
    const pct = Math.max(0, Number((meta.pctValue || '0').replace(/[^\d-]/g, '')) || 0) / 100
    const base = baseFromScope((meta.scope || DEFAULT_SCOPE))
    return round0(base * pct)
  }

  const liveDiscountTotal = useMemo(() => {
    let tSum = 0
    for (const r of rows) tSum += liveRowAmountFor(r)
    return round0(tSum)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rows.map(r => r.id).join('|'),
    JSON.stringify(pctMeta),
    JSON.stringify(drafts),
    baseTotalsLive.bundles_all, baseTotalsLive.equipment, baseTotalsLive.staff,
    baseTotalsLive.transport, baseTotalsLive.assets,
    baseTotalsLive.total_excl_extrafee, baseTotalsLive.total_incl_extrafee
  ])

  // Mappa per mostrare il nome del bundle nella chip
  const { bundles: allBundles } = useEventBundlesDB(eventId || '')
  const bundleLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of allBundles || []) m.set(String(b.id), b.label ?? String(b.id))
    return m
  }, [allBundles])

  /* ======= Dirty bridge -> SaveBar (signature) ======= */
  const numSig = (n: any) => (n == null || Number.isNaN(Number(n))) ? '' : Number(n).toFixed(4)
  const rowSigFromDB = (r: any) => [r.id, String(r.label ?? ''), (r.calc_mode ? '1':'0'), numSig(r.amount)].join('|')

  const draftSig = useMemo(() => {
    if (!rows) return '0'
    const parts: string[] = []
    for (const r of rows) {
      const d = drafts[r.id] || { label: r.label ?? '', unit: String(r.amount ?? 0) }
      const m = pctMeta[r.id]
      const enabled = m?.enabled ?? !!r.calc_mode
      let amt = 0, calc = enabled ? 1 : 0
      if (!enabled) {
        amt = Math.max(0, toInt(d.unit))
      } else if (m) {
        const pct = Math.max(0, Number((m.pctValue || '0').replace(/[^\d-]/g, '')) || 0) / 100
        const base = baseFromScope((m.scope || DEFAULT_SCOPE))
        amt = round0(base * pct)
      } else {
        // enabled ma senza meta -> manteniamo amount del DB per la signature locale
        amt = Math.max(0, Number(r.amount ?? 0))
      }
      parts.push([r.id, d.label ?? '', String(calc), numSig(amt)].join('|'))
    }
    parts.sort()
    return `${parts.length}|${parts.join('~')}`
  }, [rows, drafts, pctMeta,
      baseTotalsLive.bundles_all, baseTotalsLive.equipment, baseTotalsLive.staff,
      baseTotalsLive.transport, baseTotalsLive.assets,
      baseTotalsLive.total_excl_extrafee, baseTotalsLive.total_incl_extrafee])

  const dbSig = useMemo(() => {
    if (!rows) return '0'
    const parts = rows.map(r => rowSigFromDB(r)).sort()
    return `${parts.length}|${parts.join('~')}`
  }, [rows])

  const isDirty = useMemo(() => draftSig !== dbSig, [draftSig, dbSig])

  const postSaveSilenceRef = useRef(false)
  useEffect(() => {
    if (postSaveSilenceRef.current && draftSig !== dbSig) return
    if (postSaveSilenceRef.current && draftSig === dbSig) postSaveSilenceRef.current = false
    const dirty = draftSig !== dbSig
    try { window.dispatchEvent(new CustomEvent('eventcalc:dirty', { detail: { card: 'discounts', dirty } })) } catch {}
  }, [draftSig, dbSig])

  /* ======= BROADCAST: Totals live vs Summary =========
     - SEMPRE emettiamo 'discounts:total' (per EventTotalCard, in-memory)
     - Persistiamo su LS SOLO quando !isDirty (così la Summary cambia solo post-save)
  ===================================================== */
  useEffect(() => {
    try {
      // Evento live (EventTotalCard)
      window.dispatchEvent(new CustomEvent('discounts:total', {
        detail: { eventId, total: round0(liveDiscountTotal), live: true }
      }))
    } catch {}
    if (!isDirty) {
      try {
        const key = `eventcalc.discounts.total:${eventId || ''}`
        localStorage.setItem(key, String(round0(liveDiscountTotal)))
      } catch {}
    }
    emitCalcTick()
  }, [eventId, liveDiscountTotal, isDirty])

  /* ======= Save globale: commit TUTTO su DB ======= */
  useEffect(() => {
    if (!canQuery) return
    const onSave = async () => {
      postSaveSilenceRef.current = true
      try {
        const tasks: Promise<any>[] = []
        for (const r of rows) {
          const d = drafts[r.id] || { label: r.label ?? '', unit: String(r.amount ?? 0) }
          const m = pctMeta[r.id]
          const enabled = m?.enabled ?? !!r.calc_mode
          if (enabled) {
            if (!m) {
              tasks.push(updateRow({ id: r.id, patch: { label: d.label ?? '', calc_mode: true, amount: Math.max(0, Number(r.amount ?? 0)) } as any }))
            } else {
              const pct = Math.max(0, Number((m.pctValue || '0').replace(/[^\d-]/g, '')) || 0) / 100
              const base = baseFromScope((m.scope || DEFAULT_SCOPE))
              const amount = round0(base * pct)
              tasks.push(updateRow({ id: r.id, patch: { label: d.label ?? '', calc_mode: true, amount } as any }))
            }
          } else {
            const unitManual = Math.max(0, toInt(d.unit))
            tasks.push(updateRow({ id: r.id, patch: { label: d.label ?? '', calc_mode: false, amount: unitManual } as any }))
          }
        }
        await Promise.all(tasks)

        // —— Persistiamo snapshot coerente in LS (per Summary) e notifichiamo nel TAB corrente
        const currentLS = loadMeta()
        const nextLS: PctMetaMap = { ...currentLS }
        for (const r of rows) {
          const m = pctMeta[r.id]
          if (m && m.enabled && String(m.pctValue || '').trim() !== '') {
            nextLS[r.id] = { enabled: true, pctValue: m.pctValue, scope: m.scope || DEFAULT_SCOPE }
          } else {
            if (nextLS[r.id]) delete nextLS[r.id]
          }
        }
        saveMeta(nextLS)
      } catch (e) {
        console.error('[discount save] FAILED', e)
      } finally {
        setTimeout(() => { postSaveSilenceRef.current = false }, 1500)
        // Aggiorna sia LS (per Summary) che evento (per Totals)
        try {
          const key = `eventcalc.discounts.total:${eventId || ''}`
          localStorage.setItem(key, String(round0(liveDiscountTotal)))
          window.dispatchEvent(new CustomEvent('discounts:total', { detail: { eventId, total: round0(liveDiscountTotal) } }))
        } catch {}
        // Notifica refresh Summary post-commit
        try { window.dispatchEvent(new CustomEvent('eventcalc:saved', { detail: { card: 'discounts' } })) } catch {}
        emitCalcTick()
      }
    }
    window.addEventListener('eventcalc:save', onSave as EventListener)
    return () => window.removeEventListener('eventcalc:save', onSave as EventListener)
  }, [rows, pctMeta, drafts, baseTotalsLive, updateRow, canQuery, eventId, liveDiscountTotal])

  /* ====== UI ====== */
  if (!canQuery) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{t('discounts.title', 'Discounts')}</h2>
            <span className="text-sm text-gray-500">(0)</span>
          </div>
          <div />
        </div>
        <div className="p-3">
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
            {t('discounts.missing_event', 'Missing eventId. Open or create an event to add Discounts.')}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{t('discounts.title', 'Discounts')}</h2>
          <span className="text-sm text-gray-500">({rows.length})</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={async () => { await createRow({ label: '', amount: 0, calc_mode: false }); emitCalcTick() }}
            disabled={!canQuery}
            className="px-3 h-9 rounded bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99] transition disabled:cursor-not-allowed disabled:opacity-60"
            title={canQuery ? t('discounts.add_row_title', 'Add discount row') : t('discounts.need_event_id', 'Provide eventId to add DB rows')}
          >
            <span className="inline-flex items-center gap-2">
              <PlusIcon className="w-4 h-4" />
              {t('discounts.add', 'Add discount')}
            </span>
          </button>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-red-800">
            {t('discounts.load_error', 'Load error')}: {String(error)}
          </div>
        )}

        {rows.length === 0 && !error && (
          <div className="text-sm text-gray-500 px-1 py-4">
            {t('discounts.empty', 'No discounts yet. Click "Add discount" to insert your first row.')}
          </div>
        )}

        {rows.map((r) => {
          const meta = pctMeta[r.id] || { enabled: !!r.calc_mode, pctValue: '0', scope: DEFAULT_SCOPE as PctScope }
          const enabled = meta.enabled
          const d = drafts[r.id] || { label: r.label ?? '', unit: String(Math.round(r.amount ?? 0)) }

          const scopeLabel = (() => {
            const s = meta.scope
            if (isBundleScope(s)) {
              const bid = s.slice('bundle:'.length)
              const name = bundleLabelById.get(String(bid))
              return name ? `${t('discounts.scope.bundle', 'BUNDLE')} (${name})` : `${t('discounts.scope.bundle_selected', 'BUNDLE (selected)')}`
            }
            switch (s) {
              case 'bundles_all': return t('discounts.scope.bundles_all', 'BUNDLES (all)')
              case 'equipment': return t('discounts.scope.equipment', 'EQUIPMENT')
              case 'staff': return t('discounts.scope.staff', 'STAFF')
              case 'transport': return t('discounts.scope.transport', 'TRANSPORT')
              case 'assets': return t('discounts.scope.assets', 'COMPANY ASSETS')
              case 'total_excl_extrafee': return t('discounts.scope.total_excl_extrafee', 'TOTALS (exclude extra fees)')
              case 'total_incl_extrafee': return t('discounts.scope.total_incl_extrafee', 'TOTALS (include extra fees)')
              default: return '-'
            }
          })()

          const liveRowAmount = liveRowAmountFor(r)

          return (
            <div key={r.id} className="border border-gray-200 rounded-xl p-2">
              <div className="w-full flex items-end gap-1 flex-nowrap">
                {/* Label */}
                <div className="w-[380px] shrink-0">
                  <label className="text-xs text-gray-600 mb-1 block">{t('discounts.label', 'Label')}</label>
                  <input
                    className="border rounded-lg px-2 h-9 w-full bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={t('discounts.label_ph', 'Description')}
                    value={d.label}
                    onChange={(e) => onDraft(r.id, 'label', e.target.value)}
                    aria-label={t('discounts.label_aria', 'Discount label')}
                  />
                </div>

                {/* Switch + Edit */}
                <div className="w-[112px] shrink-0">
                  <label className="text-xs text-gray-600 mb-1 block">{t('discounts.percentage', 'Percentage')}</label>
                  <div className="h-9 w-full flex items-center justify-between">
                    <Switch
                      checked={enabled}
                      onChange={(v: boolean) => {
                        // Solo in-memory, niente LS qui
                        const next = { ...pctMeta, [r.id]: { enabled: v, pctValue: meta.pctValue, scope: meta.scope } }
                        setPctMeta(next)
                        emitCalcTick()
                      }}
                      className={`${enabled ? 'bg-blue-600' : 'bg-gray-300'} relative inline-flex h-6 w-11 items-center rounded-full transition`}
                      aria-label={t('discounts.toggle_pct_aria', 'Toggle percentage mode')}
                    >
                      <span className={`${enabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition`} />
                    </Switch>

                    <button
                      type="button"
                      className="h-9 w-9 rounded-lg border bg-white hover:bg-gray-50 inline-flex items-center justify-center"
                      onClick={() => openModal(r.id)}
                      aria-label={t('discounts.configure_pct_aria', 'Configure percentage')}
                      title={t('discounts.configure_pct_title', 'Configure percentage')}
                    >
                      <EllipsisVerticalIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* CHIP */}
                <div className="flex-1 min-w-[200px] flex items-end justify-end gap-2">
                  {enabled && (
                    <span
                      className="inline-flex items-center justify-center rounded-full bg-gray-100 text-gray-800 px-2 h-7 border border-gray-200 text-xs"
                      onClick={() => openModal(r.id)}
                      title={t('discounts.scope_chip_title', 'Click to configure')}
                    >
                      {`${String(meta.pctValue ?? '0').replace(/\.0+$/,'')}% ${scopeLabel}`}
                    </span>
                  )}
                </div>

                {/* Total discount (LIVE) */}
                <div className="w-[128px] shrink-0">
                  <label className="text-xs text-gray-600 mb-1 block text-right">{t('discounts.total_row', 'Total discount')}</label>
                  {enabled ? (
                    <div className="border rounded-lg h-9 w-full bg-gray-50 text-gray-900 flex items-center justify-end px-2 font-semibold select-none">
                      {fmt(liveRowAmount)}
                    </div>
                  ) : (
                    <input
                      inputMode="numeric"
                      className="border rounded-lg px-2 h-9 w-full text-right bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                      value={d.unit}
                      onChange={(e) => onDraft(r.id, 'unit', (e.target.value ?? '').replace(/[^\d-]/g, ''))}
                      aria-label={t('discounts.amount_aria', 'Discount amount (VND)')}
                    />
                  )}
                </div>

                {/* Remove */}
                <div className="w-[36px] shrink-0">
                  <label className="text-xs text-transparent mb-1 block select-none">.</label>
                  <button
                    type="button"
                    className="h-9 w-9 rounded-lg text-red-600 hover:text-red-500 hover:bg-red-50 inline-flex items-center justify-center"
                    onClick={async () => {
                      await deleteRow(r.id)
                      // NON tocchiamo LS qui; la Summary verrà aggiornata post-save
                      const m = { ...pctMeta }; delete m[r.id]; setPctMeta(m)
                      emitCalcTick()
                    }}
                    aria-label={t('discounts.remove_aria', 'Remove discount')}
                    title={t('discounts.remove_title', 'Remove discount')}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {/* Totals (LIVE) */}
        <div className="border-t border-gray-200 pt-3 flex flex-wrap items-center justify-end gap-6">
          <div className="text-sm text-gray-600">{t('discounts.totals', 'Totals')}</div>
          <div className="text-sm">
            <span className="text-gray-600 mr-1">{t('discounts.total_label', 'Discounts')}:</span>
            <span className="font-semibold">{fmt(liveDiscountTotal)}</span>
          </div>
        </div>
      </div>

      {modalFor && <Modal id={modalFor} />}
    </div>
  )
}