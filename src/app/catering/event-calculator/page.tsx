// src/app/catering/event-calculator/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Dialog } from '@headlessui/react'
import { TrashIcon, XMarkIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useSearchParams, useRouter } from 'next/navigation'

import { useEventCalc } from '@/app/catering/_state/EventCalcProvider'
import useFinalDishes, { Dish } from '@/app/catering/_data/useFinalDishes'
import {
  type BundleConfig,
  dishAllowedByCfg,
  modifierAllowedByCfg,
  effectiveLimit,
  getMarkupX,
} from '@/app/catering/_settings/bundleConfig'
import {
  useEventBundles as useEventBundlesDB,
} from '@/app/catering/_data/useEventBundles'
import useMaterials, { type MaterialItem } from '@/app/catering/_data/useMaterials'
import { supabase } from '@/lib/supabase_shim'
import { useECT } from '@/app/catering/_i18n' // 👈 i18n
import CircularLoader from '@/components/CircularLoader'

// Cards
import EventInfoCard, { type EventInfo } from '@/app/catering/_cards/EventInfoCard'
import EquipmentCard from '@/app/catering/_cards/EventEquipmentCard'
import StaffCard from '@/app/catering/_cards/EventStaffCard'
import TransportCard from '@/app/catering/_cards/EventTransportCard'
import EventAssetsCard from '@/app/catering/_cards/EventAssetsCard'
import ExtraFeeCard from '@/app/catering/_cards/EventExtraFeeCard'
import EventDiscountCard from '@/app/catering/_cards/EventDiscountCard'
import EventTotalsCard from '@/app/catering/_cards/EventTotalsCard'

// ====== Tipi / helpers ======
type Id = string
type BundleType = string
type BundleRow = { id: string; dish_id: Id | ''; qty: number; modifiers: Id[] }
type BundleFromDB = { id: string; type_key: string; label: string; rows: BundleRow[] }

const LS_BUNDLE_SETTINGS_KEY = 'eventcalc.bundleSettings'
const savedSigKey = (eventId?: string | null) => `eventcalc.savedSig.bundles:${eventId || ''}`
const lastSavedKey = (eventId?: string | null) => `eventcalc.lastSavedAt:${eventId || ''}`

type SelectableItem = { id: string; name: string; category_name: string | null; unit_cost: number | null }

function uuid() {
  try { if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID() } catch { }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}
function toNum(v: string, fallback = 0) { if (v === '') return fallback; const n = Number(v); return Number.isFinite(n) ? n : fallback }
function clampPos(n: number) { return Number.isFinite(n) ? Math.max(0, n) : 0 }
const MAX_QTY_SAFE = 1_000_000
const clampQty = (n: number) => Math.min(clampPos(n), MAX_QTY_SAFE)
function withSelectedOption<T extends { id: string }>(options: T[], selectedId: Id | '', all: T[]) {
  if (!selectedId) return options
  const present = options.some(o => o.id === selectedId)
  if (present) return options
  const found = all.find(d => d.id === selectedId)
  return found ? [found, ...options] : options
}
function sellPriceFor(item: SelectableItem | undefined, cfg?: BundleConfig | null): number {
  if (!item) return 0
  const unit = Number(item.unit_cost ?? 0)
  const m = getMarkupX(cfg)
  return unit * m
}
function safeParseJSON<T = any>(s: string | null): T | null { if (!s) return null; try { return JSON.parse(s) as T } catch { return null } }
const fmt0 = (n: number | null | undefined) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(Number(n ?? 0)))

// === EventId resolver (URL -> draft LS -> ctx/legacy -> UUID)
function useResolvedEventId(ctx: any) {
  const searchParams = useSearchParams()
  const resolved = useMemo(() => {
    const q = (searchParams?.get('eventId') || '').trim()
    if (q) return q
    let draft = ''; try { draft = (localStorage.getItem('eventcalc.draftEventId') || '').trim() } catch { }
    if (draft) return draft
    const ctxId = (ctx?.draftEventId || ctx?.eventId || '').trim()
    if (ctxId) return ctxId
    let legacy = ''
    try { legacy = (localStorage.getItem('event_current_id') || localStorage.getItem('eventId') || '').trim() } catch { }
    return legacy || uuid()
  }, [searchParams, ctx?.draftEventId, ctx?.eventId])

  // Propaga verso provider + legacy + draft key
  useEffect(() => {
    try {
      localStorage.setItem('event_current_id', resolved)
      localStorage.setItem('eventId', resolved)
      localStorage.setItem('eventcalc.draftEventId', resolved)
    } catch { }
    try {
      if (ctx && ctx.eventId !== resolved) {
        if (typeof ctx.setEventId === 'function') ctx.setEventId(resolved)
        else if (typeof ctx.setCurrentEventId === 'function') ctx.setCurrentEventId(resolved)
        else if (typeof ctx.set === 'function') ctx.set({ eventId: resolved })
      }
    } catch { }
  }, [resolved, ctx])

  return resolved
}

// === Mantiene l’URL sempre con ?eventId e sincronizza LS <-> URL
function EnsureEventIdParam() {
  const router = useRouter()
  const sp = useSearchParams()

  useEffect(() => {
    if (typeof window === 'undefined') return

    const fromUrl = (sp.get('eventId') || '').trim()
    if (fromUrl) {
      try { localStorage.setItem('eventcalc.draftEventId', fromUrl) } catch { }
      return
    }

    const fromLS = (localStorage.getItem('eventcalc.draftEventId') || '').trim()
    if (!fromLS) return

    const url = new URL(window.location.href)
    url.searchParams.set('eventId', fromLS)
    router.replace(url.pathname + '?' + url.searchParams.toString() + url.hash)
  }, [sp, router])

  return null
}

function clearEventLocalCache(eventId: string | null | undefined) {
  if (!eventId) return
  try {
    localStorage.removeItem(`eventcalc.bundles.totals:${eventId}`)
    localStorage.removeItem(`eventcalc.total.afterDiscounts:${eventId}`)
  } catch { }
}

// === Firma contenuti (no ID!) per confronto server/bozza ===
function signatureOf(
  bundles: (BundleFromDB[] | DraftBundle[]),
  qtyDrafts: Record<string, string>,
  bundleSettings: Record<string, BundleConfig>
) {
  const lines: string[] = []
  for (const b of [...(bundles || [])]) {
    const cfg = bundleSettings[b.type_key]
    const limit = effectiveLimit(cfg || undefined)
    const rowLines = (b.rows || []).map(r => {
      const raw = qtyDrafts[r.id] ?? String(r.qty ?? 0)
      const q = Math.min(clampPos(Number(raw) || 0), MAX_QTY_SAFE)
      const mods = Array.from({ length: limit }, (_, i) => r.modifiers?.[i] || '').join(',')
      return `R|${r.dish_id || ''}|${q}|${mods}`
    }).sort()
    lines.push(`B|${b.type_key}|${b.label}|${rowLines.length}|${rowLines.join('~')}`)
  }
  lines.sort()
  return lines.join('||')
}

/* ===== Helpers per snapshot totali -> RPC DB ===== */
type TotalsSnap = {
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
const SNAP_KEY = (eid: string) => `eventcalc.snap.totals:${eid}`
const toI = (n: any) => Math.round(Number(n) || 0)
function readTotalsSnap(eid: string): TotalsSnap | null {
  try { const raw = localStorage.getItem(SNAP_KEY(eid)); return raw ? JSON.parse(raw) as TotalsSnap : null } catch { return null }
}
function hasCompleteSnap(s: any): s is TotalsSnap {
  if (!s || typeof s !== 'object') return false
  const req: (keyof TotalsSnap)[] = [
    'bundlesCost', 'bundlesPrice',
    'equipmentCost', 'equipmentPrice',
    'staffCost', 'staffPrice',
    'transportCost', 'transportPrice',
    'assetsPrice',
    'extraFeeCost', 'extraFeePrice',
    'discountsTotal',
    'grandCost', 'grandPrice', 'priceAfterDiscounts',
  ]
  return req.every(k => Number.isFinite(Number((s as any)[k])))
}
function mapSnapToRpcPayload(s: TotalsSnap) {
  return {
    bundles_cost: toI(s.bundlesCost),
    bundles_price: toI(s.bundlesPrice),
    equipment_cost: toI(s.equipmentCost),
    equipment_price: toI(s.equipmentPrice),
    staff_cost: toI(s.staffCost),
    staff_price: toI(s.staffPrice),
    transport_cost: toI(s.transportCost),
    transport_price: toI(s.transportPrice),
    assets_price: toI(s.assetsPrice),
    extrafee_cost: toI(s.extraFeeCost),
    extrafee_price: toI(s.extraFeePrice),
    discounts_total: toI(s.discountsTotal),
    grand_cost: toI(s.grandCost),
    grand_price: toI(s.grandPrice),
    price_after_discounts: toI(s.priceAfterDiscounts),
    people_count: Number.isFinite(Number(s.peopleCount)) ? Math.round(Number(s.peopleCount)) : null,
    budget_per_person: s.budgetPerPerson != null ? toI(s.budgetPerPerson) : null,
    budget_total: s.budgetTotal != null ? toI(s.budgetTotal) : null,
    service_hours: s.serviceHours != null ? Number(s.serviceHours) : null,
  }
}

// ===================================================================
// ROOT
// ===================================================================
export default function EventCalculatorPageRoot() {
  const ec = useEventCalc()
  const eventId = useResolvedEventId(ec)

  const prevRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevRef.current
    if (prev && prev !== eventId) {
      clearEventLocalCache(prev)
      try { window.dispatchEvent(new CustomEvent('event:changed', { detail: { from: prev, to: eventId } })) } catch { }
    }
    prevRef.current = eventId
  }, [eventId])

  return (
    <>
      <EnsureEventIdParam />
      <EventBundleScene key={`scene:${eventId}`} eventId={eventId} />
    </>
  )
}

// ===================================================================
// SCENA
// ===================================================================
type DraftRow = BundleRow & { __tmp?: boolean }
type DraftBundle = BundleFromDB & { __tmp?: boolean }
const tmpId = () => `tmp:${uuid()}`

// ===== i18n helpers per la SaveBar =====
function i18nFmt(t: any, key: string, vars?: Record<string, any>) {
  const raw = typeof t === 'function' ? t(key) : key
  if (!vars) return String(raw)
  return String(raw).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''))
}
function lastSavedLabel(ts: number | null, t: any) {
  if (!ts) return t('eventcalc.savebar.never_saved')
  const d = new Date(ts)
  let time = ''
  try { time = d.toLocaleTimeString() } catch { }
  const msg = i18nFmt(t, 'eventcalc.savebar.saved_at', { time })
  return msg || `Saved at ${time}`
}

function EventBundleScene({ eventId }: { eventId: string }) {
  const t = useECT() // 👈 i18n
  const router = useRouter()
  const ec = useEventCalc()
  const [eventInfo, setEventInfo] = useState<EventInfo | undefined>(undefined)

  const { dishes, loading } = useFinalDishes()
  const { materials, loading: materialsLoading } = useMaterials()

  const items: SelectableItem[] = useMemo(() => {
    const d: SelectableItem[] = (dishes || []).map((x: Dish) => ({ id: x.id, name: x.name, category_name: x.category_name ?? null, unit_cost: x.unit_cost ?? null }))
    const m: SelectableItem[] = (materials || []).map((y: MaterialItem) => ({ id: y.id, name: y.name, category_name: y.category_name ?? null, unit_cost: y.unit_cost ?? null }))
    return [...d, ...m]
  }, [dishes, materials])

  // === Settings (Provider -> LS -> DB)
  const settingsFromCtx = (ec as any)?.bundleSettings as Record<string, BundleConfig> | undefined
  const [bundleSettings, setBundleSettings] = useState<Record<string, BundleConfig>>({})

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const hasCtx = !!(settingsFromCtx && Object.keys(settingsFromCtx).length)
      if (hasCtx) { if (!cancelled) setBundleSettings(settingsFromCtx!); return }
      const fromLS = safeParseJSON<Record<string, BundleConfig>>(typeof window !== 'undefined' ? localStorage.getItem(LS_BUNDLE_SETTINGS_KEY) : null)
      if (fromLS && Object.keys(fromLS).length) { if (!cancelled) setBundleSettings(fromLS); return }
      const { data, error } = await supabase.from('bundle_types').select('*').order('key', { ascending: true })
      if (error) { console.warn('[eventbundle] load bundle_types error:', error.message); return }
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
        setBundleSettings(map)
        try { localStorage.setItem(LS_BUNDLE_SETTINGS_KEY, JSON.stringify(map)) } catch { }
      }
    }
    hydrate()
    return () => { cancelled = true }
  }, [settingsFromCtx])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== LS_BUNDLE_SETTINGS_KEY) return
      const next = safeParseJSON<Record<string, BundleConfig>>(e.newValue)
      if (next && Object.keys(next).length) setBundleSettings(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // === Hook DB
  const {
    error: errorDB,
    bundles,
    createBundle,
    deleteBundle,
    addRow: addRowDB,
    updateRow: updateRowDB,
    deleteRow: deleteRowDB,
  } = useEventBundlesDB(eventId)

  const bundlesSafe = bundles || []

  // ====== BOZZE ======
  const [bundleDrafts, setBundleDrafts] = useState<DraftBundle[]>([])
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({})
  const hydratedDraftOnceRef = useRef(false)

  // ====== GATE: ignoriamo dirty nei primi 900ms (anti-flicker) ======
  const [coldStartSilence, setColdStartSilence] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setColdStartSilence(false), 900)
    return () => clearTimeout(id)
  }, [])

  // ====== GATE finché la bozza non è idratata dai dati server ======
  const [hydrationReady, setHydrationReady] = useState(false)
  const [suppressingDirty, setSuppressingDirty] = useState(true)

  const showQty = (row: BundleRow) => (qtyDrafts[row.id] ?? String(row.qty ?? 0))
  const computeQty = (row: BundleRow) => {
    const draft = qtyDrafts[row.id]
    return clampQty(draft === undefined ? (row.qty || 0) : clampPos(toNum(draft, row.qty || 0)))
  }
  const onQtyFocus = (row: BundleRow) => setQtyDrafts(d => (d[row.id] === undefined ? { ...d, [row.id]: String(row.qty ?? 0) } : d))
  const onQtyChange = (row: BundleRow, nextStr: string) => setQtyDrafts(d => ({ ...d, [row.id]: nextStr }))
  const commitQty = (_: string, row: BundleRow) => { const next = computeQty(row); setQtyDrafts(d => { const c = { ...d }; delete c[row.id]; return c }); changeRowLocal('', row.id, { qty: next }) }
  const cancelQty = (row: BundleRow) => setQtyDrafts(d => { const c = { ...d }; delete c[row.id]; return c })

  // ==== Firme (server vs bozza) + override ottimistico dopo save
  const sigServerRaw = useMemo(
    () => signatureOf(bundlesSafe as DraftBundle[], {}, bundleSettings),
    [bundlesSafe, bundleSettings]
  )
  const [serverSigOverride, setServerSigOverride] = useState<string | null>(null)
  const sigServer = serverSigOverride ?? sigServerRaw
  const sigDraft = useMemo(
    () => signatureOf(bundleDrafts as DraftBundle[], qtyDrafts, bundleSettings),
    [bundleDrafts, qtyDrafts, bundleSettings]
  )

  useEffect(() => {
    if (serverSigOverride && sigServerRaw === sigDraft) setServerSigOverride(null)
  }, [sigServerRaw, sigDraft, serverSigOverride])
  useEffect(() => { setServerSigOverride(null) }, [eventId])

  // Hydrate bozza
  useEffect(() => {
    const noDrafts = bundleDrafts.length === 0
    const dirtyNow = sigDraft !== sigServerRaw
    if (!hydratedDraftOnceRef.current || noDrafts) {
      setBundleDrafts(JSON.parse(JSON.stringify(bundlesSafe)))
      hydratedDraftOnceRef.current = true
      setHydrationReady(true)
      return
    }
    if (!dirtyNow) {
      setBundleDrafts(JSON.parse(JSON.stringify(bundlesSafe)))
      setHydrationReady(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigServerRaw])

  useEffect(() => {
    if (hydrationReady) setSuppressingDirty(false)
  }, [hydrationReady])

  // ====== Wizard ======
  const [wizOpen, setWizOpen] = useState(false)
  const [wizType, setWizType] = useState<BundleType | null>(null)
  const [wizRows, setWizRows] = useState<BundleRow[]>([])
  const [saving, setSaving] = useState(false)

  const requiredCountFor = (t: BundleType) => {
    const cfg = bundleSettings[t]; if (!cfg) return 0
    const limit = effectiveLimit(cfg)
    return cfg.modifierSlots.slice(0, limit).filter(s => s.required).length
  }
  const blankRowFor = (t: BundleType): BundleRow => ({ id: tmpId(), dish_id: '', qty: 1, modifiers: Array(requiredCountFor(t)).fill('') })
  const labelForType = (t: BundleType) => bundleSettings[t]?.label || t

  async function addBundleFromWizard() {
    const t = wizType; if (!t) return
    setSaving(true)
    try {
      const cfg = bundleSettings[t]; const limit = effectiveLimit(cfg)
      const cleaned = wizRows.map(r => ({ id: tmpId(), dish_id: r.dish_id, qty: r.qty, modifiers: (r.modifiers || []).slice(0, limit) }))
      const draft: DraftBundle = { id: tmpId(), type_key: t, label: labelForType(t), rows: cleaned, __tmp: true }
      setBundleDrafts(prev => [...prev, draft])
      setWizOpen(false); setWizRows([])
    } finally { setSaving(false) }
  }

  // ====== Operazioni BOZZA ======
  function removeBundleLocal(id: string) {
    setBundleDrafts(prev => prev.filter(b => b.id !== id))
  }
  function addRowLocal(bundleId: string, bundleTypeKey: string) {
    const req = requiredCountFor(bundleTypeKey)
    setBundleDrafts(prev => prev.map(b => b.id !== bundleId ? b : {
      ...b,
      rows: [...(b.rows || []), { id: tmpId(), dish_id: '', qty: 1, modifiers: Array(req).fill('') }]
    }))
  }
  function changeRowLocal(_bundleId: string, rowId: string, patch: Partial<BundleRow>) {
    setBundleDrafts(prev => prev.map(b => ({
      ...b,
      rows: (b.rows || []).map(r => r.id === rowId ? {
        ...r,
        ...(patch.dish_id !== undefined ? { dish_id: patch.dish_id } : {}),
        ...(patch.qty !== undefined ? { qty: clampQty(patch.qty as number) } : {}),
        ...(patch.modifiers !== undefined ? { modifiers: patch.modifiers as Id[] } : {}),
      } : r)
    })))
  }
  function removeRowLocal(_bundleId: string, rowId: string) {
    setBundleDrafts(prev => prev.map(b => ({ ...b, rows: (b.rows || []).filter(r => r.id !== rowId) })))
  }
  function changeModifierLocal(_bundleId: string, row: BundleRow, idx: number, newId: Id) {
    setBundleDrafts(prev => prev.map(b => ({
      ...b,
      rows: (b.rows || []).map(r => r.id !== row.id ? r : { ...r, modifiers: r.modifiers.map((m, i) => i === idx ? newId : m) })
    })))
  }
  function removeModifierLocal(_bundleId: string, row: BundleRow, idx: number) {
    setBundleDrafts(prev => prev.map(b => ({
      ...b,
      rows: (b.rows || []).map(r => r.id !== row.id ? r : { ...r, modifiers: r.modifiers.filter((_, i) => i !== idx) })
    })))
  }
  function addModifierForRowLocal(row: BundleRow, cfg?: BundleConfig | null) {
    const limit = effectiveLimit(cfg || undefined)
    const arr = Array.isArray(row.modifiers) ? row.modifiers.slice(0, limit) : []
    const nextIdx = arr.length
    if (nextIdx >= limit) return
    if (!cfg?.modifierSlots?.[nextIdx]) return
    const next = arr.concat('')
    setBundleDrafts(prev => prev.map(b => ({ ...b, rows: (b.rows || []).map(r => r.id !== row.id ? r : { ...r, modifiers: next }) })))
  }

  const addButtonDisabled = Object.keys(bundleSettings).length === 0

  // ====== GRAND TOTALS (Bundles) - calcolo su BOZZA ======
  const bundlesGrandTotals = useMemo(() => {
    let qty = 0, cost = 0, price = 0
    for (const b of (bundleDrafts || [])) {
      const cfg = bundleSettings[b.type_key]
      const limit = effectiveLimit(cfg)
      for (const r of (b.rows || [])) {
        const q = computeQty(r)
        const base = r.dish_id ? items.find(d => d.id === r.dish_id) : undefined
        cost += (base?.unit_cost || 0) * q
        price += sellPriceFor(base, cfg) * q
        for (let i = 0; i < limit; i++) {
          const mid = r.modifiers?.[i]; if (!mid) continue
          const md = items.find(d => d.id === mid)
          cost += (md?.unit_cost || 0) * q
          price += sellPriceFor(md, cfg) * q
        }
        qty += q
      }
    }
    return { qty, cost, price }
  }, [bundleDrafts, items, bundleSettings, qtyDrafts])

  // Broadcast live totali bundles
  useEffect(() => {
    const key = `eventcalc.bundles.totals:${eventId || ''}`
    const payload = { cost: Math.round(bundlesGrandTotals.cost || 0), price: Math.round(bundlesGrandTotals.price || 0) }
    try { localStorage.setItem(key, JSON.stringify(payload)) } catch { }
    try { window.dispatchEvent(new CustomEvent('bundles:totals', { detail: { eventId, ...payload } })) } catch { }
  }, [eventId, bundlesGrandTotals.cost, bundlesGrandTotals.price])

  // ====== Dirty bridge Bundles ======
  const postSaveSilenceRef = useRef(false)
  useEffect(() => {
    const onSaved = () => {
      postSaveSilenceRef.current = true
      setTimeout(() => { postSaveSilenceRef.current = false }, 2500)
    }
    window.addEventListener('eventcalc:saved', onSaved as EventListener)
    window.addEventListener('eventcalc:saved-ok', onSaved as EventListener)
    return () => {
      window.removeEventListener('eventcalc:saved', onSaved as EventListener)
      window.removeEventListener('eventcalc:saved-ok', onSaved as EventListener)
    }
  }, [])

  useEffect(() => {
    if (suppressingDirty || coldStartSilence) return
    if (postSaveSilenceRef.current && sigDraft !== sigServer) return
    if (postSaveSilenceRef.current && sigDraft === sigServer) postSaveSilenceRef.current = false
    const dirty = sigDraft !== sigServer
    try { window.dispatchEvent(new CustomEvent('eventcalc:dirty', { detail: { card: 'bundles', dirty } })) } catch { }
  }, [sigDraft, sigServer, suppressingDirty, coldStartSilence])

  // ====== SaveBar state ======
  const [dirtyCards, setDirtyCards] = useState<Record<string, boolean>>({})
  const [lastSavedAtUI, setLastSavedAtUI] = useState<number | null>(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(lastSavedKey(eventId)) : null
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  })
  useEffect(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(lastSavedKey(eventId)) : null
    const n = raw ? Number(raw) : NaN
    setLastSavedAtUI(Number.isFinite(n) && n > 0 ? n : null)
  }, [eventId])

  useEffect(() => {
    const onDirty = (ev: Event) => {
      if (suppressingDirty || coldStartSilence) return
      const e = ev as CustomEvent<{ card?: string; dirty?: boolean }>
      const card = e.detail?.card || 'unknown'
      const dirty = !!e.detail?.dirty
      setDirtyCards(prev => ({ ...prev, [card]: dirty }))
    }
    const onSaved = () => {
      const now = Date.now()
      setLastSavedAtUI(now)
      try { localStorage.setItem(lastSavedKey(eventId), String(now)) } catch { }

      setDirtyCards(prev => {
        const next: Record<string, boolean> = {}
        for (const k of Object.keys(prev)) next[k] = false
        return next
      })

      setSuppressingDirty(true)
      setTimeout(() => setSuppressingDirty(false), 1200)
    }
    window.addEventListener('eventcalc:dirty', onDirty as EventListener)
    window.addEventListener('eventcalc:saved', onSaved as EventListener)
    window.addEventListener('eventcalc:saved-ok', onSaved as EventListener)
    return () => {
      window.removeEventListener('eventcalc:dirty', onDirty as EventListener)
      window.removeEventListener('eventcalc:saved', onSaved as EventListener)
      window.removeEventListener('eventcalc:saved-ok', onSaved as EventListener)
    }
  }, [suppressingDirty, coldStartSilence, eventId])

  // === final: “dirty” mostrabile in UI (niente flicker iniziale) ===
  const displayDirty = !coldStartSilence && !suppressingDirty && Object.values(dirtyCards).some(Boolean)
  const disableSave = ec.saving || !displayDirty

  // ====== Save All ======
  const onSaveAll = useCallback(async () => {
    // 1. Prima salviamo l'header (che crea il record su DB per le FK)
    try {
      await new Promise<void>((resolve) => {
        let done = false
        const handler = () => {
          if (done) return
          done = true
          resolve()
        }
        window.addEventListener('eventcalc:header-saved-ok', handler, { once: true })
        window.dispatchEvent(new CustomEvent('eventcalc:save-header'))
        // Timeout di sicurezza (se la card non c'è o errore)
        setTimeout(() => {
          if (!done) {
            done = true
            window.removeEventListener('eventcalc:header-saved-ok', handler)
            resolve()
          }
        }, 2000)
      })
    } catch { }

    // 2. Poi salviamo il resto (Transport, Staff, ecc)
    try { window.dispatchEvent(new CustomEvent('eventcalc:save')) } catch { }
    await ec.saveAll()
  }, [ec])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase()
      if ((e.ctrlKey || e.metaKey) && key === 's') { e.preventDefault(); onSaveAll() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onSaveAll])

  // ====== SAVE HANDLER (diff bozza -> DB) ======
  useEffect(() => {
    ec.setSaveHandler(async ({ eventId: eid }) => {
      const draftsById = new Map<string, DraftBundle>(bundleDrafts.map(b => [b.id, b]))

      // 🔧 FIX: normalizza rows e usa tuple readonly per soddisfare TS
      const serverEntries: readonly (readonly [string, BundleFromDB])[] =
        (bundlesSafe ?? []).map(b => {
          const safe: BundleFromDB = {
            ...b,
            rows: (b as any).rows ?? [],
          }
          return [b.id, safe] as const
        })
      const serverById = new Map<string, BundleFromDB>(serverEntries)

      // DELETE bundles rimossi
      for (const bServer of (bundlesSafe || [])) {
        if (!draftsById.has(bServer.id)) { try { await deleteBundle(bServer.id) } catch (e) { console.error('[save] deleteBundle', e) } }
      }

      // UPSERT righe
      for (const bDraft of bundleDrafts) {
        const cfg = bundleSettings[bDraft.type_key]
        const limit = effectiveLimit(cfg)
        const trimMods = (mods: Id[]) => (Array.isArray(mods) ? mods.slice(0, limit) : [])

        if (!serverById.has(bDraft.id) || String(bDraft.id).startsWith('tmp:')) {
          try {
            const created = await createBundle(eid || eventId, bDraft.type_key, bDraft.label)
            const newBundleId = (created && (created as any).id) ? (created as any).id : bDraft.id
            for (const r of (bDraft.rows || [])) {
              const effectiveQty = clampQty(computeQty(r))
              const payload = { dish_id: r.dish_id, qty: effectiveQty, modifiers: trimMods(r.modifiers) }
              try { await addRowDB(newBundleId, payload) } catch (e) { console.error('[save] addRow new-bundle', e) }
            }
          } catch (e) { console.error('[save] createBundle', e) }
          continue
        }

        const bServer = serverById.get(bDraft.id)!
        const serverRowsById = new Map<string, BundleRow>((bServer.rows || []).map(r => [r.id, r]))

        for (const rServer of (bServer.rows || [])) {
          const exists = (bDraft.rows || []).some(r => r.id === rServer.id)
          if (!exists) { try { await deleteRowDB(rServer.id) } catch (e) { console.error('[save] deleteRow', e) } }
        }

        for (const rDraft of (bDraft.rows || [])) {
          const effectiveQty = clampQty(computeQty(rDraft))
          if (!serverRowsById.has(rDraft.id) || String(rDraft.id).startsWith('tmp:')) {
            const payload = { dish_id: rDraft.dish_id, qty: effectiveQty, modifiers: trimMods(rDraft.modifiers) }
            try { await addRowDB(bDraft.id, payload) } catch (e) { console.error('[save] addRow', e) }
          } else {
            const rServer = serverRowsById.get(rDraft.id)!
            const modsDraft = trimMods(rDraft.modifiers)
            const modsServerLimited = trimMods(rServer.modifiers || [])
            const changed =
              String(rServer.dish_id || '') !== String(rDraft.dish_id || '') ||
              Number(rServer.qty || 0) !== Number(effectiveQty || 0) ||
              modsServerLimited.join('|') !== modsDraft.join('|')
            if (changed) {
              const payload: Partial<BundleRow> = { dish_id: rDraft.dish_id, qty: effectiveQty, modifiers: modsDraft }
              try { await updateRowDB(rDraft.id, payload) } catch (e) { console.error('[save] updateRow', e) }
            }
          }
        }
      }

      // ====== SCRITTURA TOTALI (solo se snapshot completo) ======
      try {
        const id = (eid || eventId) as string
        const snap = readTotalsSnap(id)
        if (snap && hasCompleteSnap(snap)) {
          const payload = mapSnapToRpcPayload(snap)
          const { error } = await supabase.rpc('event_totals_upsert', {
            p_event_id: id,
            p_totals: payload as any,
          })
          if (error) {
            console.error('[save] event_totals_upsert error:', error.message)
          } else {
            try {
              window.dispatchEvent(new CustomEvent('event_totals:updated', { detail: { eventId: id, total: payload.price_after_discounts } }))
              window.dispatchEvent(new CustomEvent('events:refetch', { detail: { eventId: id, total: payload.price_after_discounts } }))
            } catch { }
          }
        } else {
          console.warn('[save] skip event_totals_upsert: snapshot missing or incomplete')
        }
      } catch (e) {
        console.error('[save] totals snapshot/rpc exception', e)
      }

      // ====== FINE SAVE ======
      setServerSigOverride(sigDraft) // ottimistico, evita flicker post-save
      setQtyDrafts({})
      try {
        window.dispatchEvent(new CustomEvent('eventcalc:saved'))
        window.dispatchEvent(new CustomEvent('eventcalc:saved-ok', { detail: { eventId: eid || eventId } }))
        window.dispatchEvent(new CustomEvent('eventcalc:dirty', { detail: { card: 'bundles', dirty: false } }))
      } catch { }

      try {
        localStorage.setItem(savedSigKey(eid || eventId), sigDraft)
        const now = Date.now()
        localStorage.setItem(lastSavedKey(eid || eventId), String(now))
      } catch { }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ec, eventId, bundleDrafts, qtyDrafts, bundleSettings, bundlesSafe, sigDraft])

  // Allineamento SaveBar su refresh post-mount
  useEffect(() => {
    if (!hydratedDraftOnceRef.current) return
    const sKey = savedSigKey(eventId)
    const savedSig = typeof window !== 'undefined' ? localStorage.getItem(sKey) : null
    if (savedSig && savedSig === sigServerRaw) {
      try { window.dispatchEvent(new CustomEvent('eventcalc:dirty', { detail: { card: 'bundles', dirty: false } })) } catch { }
    }
  }, [eventId, sigServerRaw])

  // ====================== UI ======================
  const bundleTypes = useMemo(() => Object.keys(bundleSettings), [bundleSettings])

  // ====================== Toolbar actions ======================
  const hardNavigate = (url: string) => {
    if (typeof window !== 'undefined') window.location.assign(url)
    else router.push(url)
  }
  const clearPerEventLocalCache = (id: string) => {
    try {
      localStorage.removeItem(`eventcalc.bundles.totals:${id}`)
      localStorage.removeItem(`eventcalc.total.afterDiscounts:${id}`)
    } catch { }
  }
  const newId = () =>
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  // <<< CAMBIATO: Back porta sempre a /catering >>>
  const onBack = () => {
    hardNavigate('/catering')
  }

  const onNewCatering = () => {
    const id = newId()
    try {
      localStorage.setItem('eventcalc.draftEventId', id)
      clearPerEventLocalCache(id)
      localStorage.setItem('event_current_id', id)
      localStorage.setItem('eventId', id)
      window.dispatchEvent(new CustomEvent('event:changed', { detail: { from: eventId, to: id } }))
    } catch { }
    hardNavigate(`/catering/event-calculator?eventId=${encodeURIComponent(id)}`)
  }

  const onGoSummary = () => {
    const id = eventId || ''
    hardNavigate(`/catering/eventsummary?eventId=${encodeURIComponent(id)}`)
  }

  if (loading || materialsLoading) return <CircularLoader />

  return (
    <div className="max-w-7xl mx-auto p-4 text-gray-100 pb-28">
      {/* ───────── Editor Toolbar (Back / New / Summary) ───────── */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3 h-9 rounded-lg
                     bg-blue-600/15 text-blue-200 hover:bg-blue-600/25
                     border border-blue-400/30"
          aria-label={t('common.back')}
          title={t('common.back')}
        >
          ← {t('common.back')}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onNewCatering}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-90"
            aria-label={t('catering.new_event')}
            title={t('catering.new_event')}
          >
            + {t('catering.new_event')}
          </button>
          <button
            type="button"
            onClick={onGoSummary}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-lg
                       bg-blue-600/15 text-blue-200 hover:bg-blue-600/25
                       border border-blue-400/30"
            aria-label={t('Summary')}
            title={t('Summary')}
          >
            → {t('Summary')}
          </button>
        </div>
      </div>

      {/* SaveBar */}
      <div className="fixed bottom-4 left-0 right-0 pointer-events-none z-[70] flex justify-center">
        <div
          className="pointer-events-auto bg-white/95 border border-gray-200 shadow-lg rounded-xl px-3 py-2 flex items-center justify-between gap-3"
          style={{
            width: 'min(80rem, calc(100vw - 2rem))',
            maxWidth: 'calc(100vw - (var(--leftnav-w, 56px) * 2) - 2rem)',
          }}
        >
          <div className="text-sm text-gray-700">
            {ec.saving
              ? t('eventcalc.savebar.saving')
              : displayDirty
                ? t('eventcalc.savebar.unsaved')
                : lastSavedLabel(lastSavedAtUI, t)}
          </div>
          <div className="flex items-center gap-2">
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-xs border rounded bg-gray-50 text-gray-600">
              Ctrl/⌘ + S
            </kbd>
            <button
              className="h-9 px-3 rounded bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600 disabled:shadow-none hover:bg-blue-700"
              onClick={onSaveAll}
              disabled={disableSave}
              aria-disabled={disableSave}
            >
              {ec.saving ? t('eventcalc.savebar.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </div>

      {/* Event Info */}
      <div className="mb-4">
        <EventInfoCard key={`info:${eventId}`} title={t('eventinfo.title')} value={eventInfo} onChange={setEventInfo} />
      </div>

      {/* DB state */}
      {errorDB && (<div className="mb-4 bg-red-50 text-red-800 border border-red-200 rounded-lg px-3 py-2 text-sm">{String(errorDB)}</div>)}

      {/* Bundles */}
      <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow mb-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold">{t('Bundles')}</h2>
          <button
            className="px-3 h-9 rounded bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
            onClick={() => { setWizType(null); setWizRows([]); setWizOpen(true) }}
            disabled={Object.keys(bundleSettings).length === 0}
            title={Object.keys(bundleSettings).length === 0 ? 'Create at least one bundle type in Event Settings' : 'Add a new bundle'}
          >
            <span className="inline-flex items-center gap-2"><PlusIcon className="w-4 h-4" />Add bundle</span>
          </button>
        </div>

        <div className="p-3 space-y-4">
          {Object.keys(bundleSettings).length === 0 && (
            <div className="text-sm text-gray-600">
              No bundle types configured. Go to <strong>Event Settings</strong> and create at least one.
            </div>
          )}
          {bundleDrafts.length === 0 && (<div className="text-sm text-gray-600">No bundles yet. Click “Add bundle” to start.</div>)}

          {bundleDrafts.map((b: DraftBundle) => {
            const cfg = bundleSettings[b.type_key]
            const limit = effectiveLimit(cfg)
            const usedCols = Math.max(0, ...((b.rows || []).map(r => Array.isArray(r.modifiers) ? r.modifiers.length : 0)))

            const stableRows = [...(b.rows || [])].sort((r1, r2) => String(r1.id).localeCompare(String(r2.id)))
            let qtyTotal = 0, costTotal = 0, priceTotal = 0

            return (
              <div key={b.id} className="border border-gray-200 rounded-xl p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-medium text-gray-900">{b.label}</div>
                  <button onClick={() => removeBundleLocal(b.id)} className="text-red-600 hover:text-red-500 text-sm flex items-center gap-1">
                    <TrashIcon className="w-4 h-4" />
                    Remove
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm whitespace-nowrap table-auto">
                    <thead>
                      <tr className="bg-gray-50 text-gray-800">
                        <th className="text-left px-3 py-2 min-w-[320px]">Dish</th>
                        {Array.from({ length: usedCols }, (_, i) => (
                          <th key={i} className="text-left px-3 py-2 min-w-[320px]">
                            {cfg?.modifierSlots?.[i]?.label || `Modifier ${i + 1}`}
                          </th>
                        ))}
                        {usedCols === 0 && <th className="text-left px-3 py-2 w-[72px]"></th>}
                        <th className="text-right px-3 py-2 min-w-[96px]">{t('equipment.col.qty')}</th>
                        <th className="text-center px-3 py-2 min-w-[120px]">{t('eventstaff.col.cost')}</th>
                        <th className="text-center px-3 py-2 min-w-[120px]">{t('eventstaff.col.price')}</th>
                        <th className="text-center px-3 py-2 min-w-[72px]"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {stableRows.map(r => {
                        const baseItem = r.dish_id ? items.find(d => d.id === r.dish_id) : undefined
                        const baseOptionsRaw = cfg ? items.filter(it => dishAllowedByCfg(cfg, it)) : items
                        const dishOptions = withSelectedOption(baseOptionsRaw, r.dish_id, items)

                        const q = computeQty(r)
                        const baseCost = (baseItem?.unit_cost || 0) * q
                        const basePrice = sellPriceFor(baseItem, cfg) * q

                        const modCosts = Array.from({ length: usedCols }, (_, i) => {
                          const mid = r.modifiers[i]; const md = mid ? items.find(d => d.id === mid) : undefined
                          return (md?.unit_cost || 0) * q
                        })
                        const modPrices = Array.from({ length: usedCols }, (_, i) => {
                          const mid = r.modifiers[i]; const md = mid ? items.find(d => d.id === mid) : undefined
                          return sellPriceFor(md, cfg) * q
                        })

                        const rowCost = baseCost + modCosts.reduce((a, x) => a + x, 0)
                        const rowPrice = basePrice + modPrices.reduce((a, x) => a + x, 0)

                        qtyTotal += q
                        costTotal += rowCost
                        priceTotal += rowPrice

                        const dishOutOfScope = !!(baseItem && cfg && !dishAllowedByCfg(cfg, baseItem))

                        const nextIdxRow = Array.isArray(r.modifiers) ? r.modifiers.length : 0
                        const canAddRowCol = nextIdxRow < limit && !!cfg?.modifierSlots?.[nextIdxRow]

                        return (
                          <tr key={r.id} className="border-b border-gray-100 align-top">
                            {/* Dish/Item */}
                            <td className="px-3 py-2 min-w-[320px]">
                              <div className="flex flex-col gap-1">
                                <select
                                  className="border rounded-lg px-2 h-10 text-gray-900 bg-white w-full"
                                  value={r.dish_id}
                                  onChange={e => changeRowLocal(b.id, r.id, { dish_id: e.target.value as Id | '' })}
                                >
                                  <option value="">{(loading || materialsLoading) ? t('totals.loading') : 'Select item'}</option>
                                  {dishOptions.map(d => (
                                    <option key={d.id} value={d.id}>
                                      {d.name}{d.category_name ? ` (${d.category_name})` : ''}
                                    </option>
                                  ))}
                                </select>
                                {dishOutOfScope && (
                                  <span className="text-xs text-amber-600">
                                    Item not allowed by this bundle’s categories
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Modifiers */}
                            {Array.from({ length: usedCols }, (_, i) => {
                              const mid = r.modifiers[i]
                              const slotCfg = cfg?.modifierSlots?.[i]
                              const optsRaw = cfg ? items.filter(it => modifierAllowedByCfg(cfg, i, it)) : items
                              const opts = withSelectedOption(optsRaw, mid ?? '', items)
                              const required = !!slotCfg?.required
                              const isLastCol = i === usedCols - 1

                              if (typeof mid !== 'undefined') {
                                return (
                                  <td key={i} className="px-3 py-2 min-w-[320px]">
                                    <div className="flex items-center gap-2">
                                      <select
                                        className="border rounded-lg px-2 h-10 text-gray-900 bg-white w-full"
                                        value={mid}
                                        onChange={e => changeModifierLocal(b.id, r, i, e.target.value as Id)}
                                      >
                                        <option value="">{slotCfg?.label || `Modifier ${i + 1}`}</option>
                                        {opts.map(md => (
                                          <option key={md.id} value={md.id}>
                                            {md.name}{md.category_name ? ` (${md.category_name})` : ''}
                                          </option>
                                        ))}
                                      </select>
                                      <button
                                        className="text-red-600 hover:text-red-500"
                                        onClick={() => removeModifierLocal(b.id, r, i)}
                                        title="Remove modifier"
                                      >
                                        <TrashIcon className="w-4 h-4" />
                                      </button>
                                      {isLastCol && canAddRowCol && (
                                        <button
                                          className="w-10 h-10 rounded border border-gray-300 hover:bg-gray-50 inline-flex items-center justify-center"
                                          onClick={() => addModifierForRowLocal(r, cfg)}
                                          title="Add modifier to this row"
                                          aria-label="Add modifier to this row"
                                        >
                                          <PlusIcon className="w-5 h-5" />
                                        </button>
                                      )}
                                    </div>
                                    {required && !mid && (
                                      <span className="text-xs text-red-600">Required</span>
                                    )}
                                  </td>
                                )
                              }

                              const isLast = i === usedCols - 1
                              return (
                                <td key={i} className="px-3 py-2 min-w-[320px]">
                                  <div className="h-10 flex items-center gap-2">
                                    <span className="opacity-50">-</span>
                                    {isLast && canAddRowCol && (
                                      <button
                                        className="w-10 h-10 rounded border border-gray-300 hover:bg-gray-50 inline-flex items-center justify-center"
                                        onClick={() => addModifierForRowLocal(r, cfg)}
                                        title="Add modifier to this row"
                                        aria-label="Add modifier to this row"
                                      >
                                        <PlusIcon className="w-5 h-5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )
                            })}

                            {usedCols === 0 && (
                              <td className="px-3 py-2 w-[72px]">
                                {canAddRowCol && (
                                  <button
                                    className="w-10 h-10 rounded border border-gray-300 hover:bg-gray-50 inline-flex items-center justify-center"
                                    onClick={() => addModifierForRowLocal(r, cfg)}
                                    title="Add modifier to this row"
                                    aria-label="Add modifier to this row"
                                  >
                                    <PlusIcon className="w-5 h-5" />
                                  </button>
                                )}
                              </td>
                            )}

                            {/* Qty */}
                            <td className="px-3 py-2 text-right min-w-[96px]">
                              <input
                                type="number" min={0} step={1} inputMode="numeric"
                                className="border rounded-lg px-2 h-10 text-right text-gray-900 bg-white w-24"
                                value={showQty(r)}
                                onFocus={() => onQtyFocus(r)}
                                onChange={e => onQtyChange(r, e.target.value)}
                                onBlur={() => commitQty(b.id, r)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' || e.key === 'Tab') (e.target as HTMLInputElement).blur()
                                  if (e.key === 'Escape') cancelQty(r)
                                }}
                              />
                            </td>

                            {/* Totali */}
                            <td className="px-3 py-2 text-center min-w-[120px]">
                              <div className="h-10 w-24 mx-auto flex items-center justify-center text-gray-900 font-medium">
                                {fmt0(rowCost)}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center min-w-[120px]">
                              <div className="h-10 w-24 mx-auto flex items-center justify-center text-gray-900 font-medium">
                                {fmt0(rowPrice)}
                              </div>
                            </td>

                            {/* actions */}
                            <td className="px-3 py-2 text-center min-w-[72px]">
                              <div className="h-10 w-full flex items-center justify-center">
                                <button
                                  className="text-red-600 hover:text-red-500"
                                  onClick={() => removeRowLocal(b.id, r.id)}
                                  title="Remove row"
                                >
                                  <TrashIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50">
                        <td
                          className="px-3 py-2 text-right text-gray-700 font-semibold"
                          colSpan={1 + (usedCols === 0 ? 1 : usedCols)}
                        >
                          {t('totals.label.totals')}
                        </td>
                        <td className="px-3 py-2 text-right min-w-[96px] text-gray-900 font-semibold">
                          {fmt0(qtyTotal)}
                        </td>
                        <td className="px-3 py-2 text-center min-w-[120px]">
                          <div className="h-10 w-24 mx-auto flex items-center justify-center text-gray-900 font-semibold">
                            {fmt0(costTotal)}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center min-w-[120px]">
                          <div className="h-10 w-24 mx-auto flex items-center justify-center text-gray-900 font-semibold">
                            {fmt0(priceTotal)}
                          </div>
                        </td>
                        <td className="px-3 py-2 min-w-[72px]"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="pt-2">
                  <button
                    className="text-sm px-3 h-9 rounded bg-blue-600 hover:bg-blue-700 text-white shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                    onClick={() => addRowLocal(b.id, b.type_key)}
                    disabled={(loading || materialsLoading) && items.length === 0}
                    title={(loading || materialsLoading) && items.length === 0 ? 'Loading items…' : 'Add a new row'}
                  >
                    <span className="inline-flex items-center gap-2">
                      <PlusIcon className="w-4 h-4" />
                      Add row
                    </span>
                  </button>
                </div>
              </div>
            )
          })}

          {/* GRAND TOTALS */}
          {bundleDrafts.length > 0 && (
            <div className="border-t border-gray-200 pt-3">
              <div className="flex items-center justify-end gap-6">
                <div className="text-sm text-gray-600">Bundles grand totals</div>
                <div className="text-sm">
                  <span className="text-gray-600 mr-1">{t('equipment.col.qty')}:</span>
                  <span className="font-semibold">{fmt0(bundlesGrandTotals.qty)}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-600 mr-1">{t('eventstaff.col.cost')}:</span>
                  <span className="font-semibold">{fmt0(bundlesGrandTotals.cost)}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-600 mr-1">{t('eventstaff.col.price')}:</span>
                  <span className="font-semibold">{fmt0(bundlesGrandTotals.price)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Altre card */}
      <div className="mb-4"><EquipmentCard key={`equip:${eventId}`} title={t('equipment.title')} /></div>
      <div className="mb-4"><StaffCard key={`staff:${eventId}`} /></div>
      <div className="mb-4"><TransportCard key={`transport:${eventId}`} title={t('Transportation')} /></div>
      <div className="mb-4"><EventAssetsCard key={`assets:${eventId}`} title={t('assets.title')} /></div>
      <div className="mb-4"><ExtraFeeCard key={`fee:${eventId}`} /></div>
      <div className="mb-4"><EventDiscountCard key={`disc:${eventId}`} /></div>
      <div className="mb-4"><EventTotalsCard key={`totals:${eventId}`} /></div>

      {/* Wizard */}
      <Dialog open={wizOpen} onClose={setWizOpen}>
        <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
        <div className="fixed inset-0 flex items-start justify-center p-4">
          <Dialog.Panel className="w-auto max-w-[96vw] bg-white border border-gray-200 rounded-2xl p-4 shadow-xl text-gray-900">
            <div className="flex items-center justify-between mb-3">
              <Dialog.Title className="text-lg font-semibold">
                {!wizType ? 'Choose bundle type' : `Configure ${labelForType(wizType)}`}
              </Dialog.Title>
              <button className="opacity-70 hover:opacity-100" onClick={() => setWizOpen(false)}>
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {!wizType ? (
              <div className="grid sm:grid-cols-2 gap-3">
                {Object.keys(bundleSettings).map(bt => (
                  <button
                    key={bt}
                    onClick={() => { setWizType(bt); setWizRows([blankRowFor(bt)]) }}
                    className="p-3 rounded-lg border border-gray-200 hover:bg-gray-50 text-left"
                  >
                    <div className="font-medium">{bundleSettings[bt]?.label || bt}</div>
                    <div className="text-xs text-gray-600">
                      Select to add rows with base item and required modifiers.
                    </div>
                  </button>
                ))}
                {Object.keys(bundleSettings).length === 0 && (
                  <div className="text-sm text-gray-600 p-3">
                    No bundle types. Open <strong>Event Settings</strong> and create at least one.
                  </div>
                )}
              </div>
            ) : (
              <WizardTable
                key={`wiz:${wizType}`}
                items={items}
                bundleSettings={bundleSettings}
                wizType={wizType}
                wizRows={wizRows}
                setWizRows={setWizRows}
                addBundle={addBundleFromWizard}
                saving={saving}
              />
            )}
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  )
}

/* =============== WizardTable =============== */
function WizardTable(props: {
  items: SelectableItem[]
  bundleSettings: Record<string, BundleConfig>
  wizType: string
  wizRows: BundleRow[]
  setWizRows: React.Dispatch<React.SetStateAction<BundleRow[]>>
  addBundle: () => Promise<void>
  saving: boolean
}) {
  const { items, bundleSettings, wizType, wizRows, setWizRows, addBundle, saving } = props
  const cfg = bundleSettings[wizType]
  const limit = effectiveLimit(cfg || undefined)
  const usedCols = Math.max(0, ...wizRows.map(r => r.modifiers.length))

  const addRow = () => setWizRows(rows => [
    ...rows,
    { id: tmpId(), dish_id: '', qty: 1, modifiers: Array(cfg?.modifierSlots.filter(s => s.required).length || 0).fill('') }
  ])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">{cfg?.label || wizType}</div>
        <div className="flex gap-2">
          <button
            className="text-sm px-3 h-9 rounded border border-blue-600 text-blue-600 bg-white hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            onClick={addRow}
          >
            + Add row
          </button>
          <button
            className="text-sm px-3 h-9 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            onClick={addBundle}
            disabled={wizRows.length === 0 || saving}
          >
            {saving ? 'Saving…' : 'Add bundle'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm table-auto">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-2 min-w-[320px]">Dish</th>
              {Array.from({ length: usedCols }, (_, i) => (
                <th key={i} className="text-left px-3 py-2 min-w-[320px]">
                  {cfg?.modifierSlots?.[i]?.label || `Modifier ${i + 1}`}
                </th>
              ))}
              {usedCols === 0 && <th className="text-left px-3 py-2 w-[72px]"></th>}
              <th className="text-right px-3 py-2 min-w-[96px]">Qty</th>
              <th className="text-center px-3 py-2 min-w-[120px]">Cost</th>
              <th className="text-center px-3 py-2 min-w-[120px]">Price</th>
              <th className="text-center px-3 py-2 min-w-[72px]"></th>
            </tr>
          </thead>
          <tbody>
            {wizRows.map(r => {
              const baseItem = r.dish_id ? items.find(d => d.id === r.dish_id) : undefined
              const q = clampQty(r.qty || 0)
              const baseCost = (baseItem?.unit_cost || 0) * q
              const basePrice = sellPriceFor(baseItem, cfg) * q

              const baseOptionsRaw = cfg ? items.filter(it => dishAllowedByCfg(cfg, it)) : items
              const dishOptions = withSelectedOption(baseOptionsRaw, r.dish_id, items)

              const nextIdxRowWiz = Array.isArray(r.modifiers) ? r.modifiers.length : 0
              const addRowCol = nextIdxRowWiz < limit && !!cfg?.modifierSlots?.[nextIdxRowWiz]

              return (
                <tr key={r.id} className="border-b border-gray-100 align-top">
                  <td className="px-3 py-2 min-w-[320px]">
                    <div className="flex items-center gap-2">
                      <select
                        className="border rounded-lg px-2 h-10 text-gray-900 bg-white w-full"
                        value={r.dish_id}
                        onChange={e => setWizRows(rows => rows.map(x => x.id === r.id ? { ...x, dish_id: e.target.value as Id | '' } : x))}
                      >
                        <option value="">Select item</option>
                        {dishOptions.map(d => (
                          <option key={d.id} value={d.id}>
                            {d.name}{d.category_name ? ` (${d.category_name})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>

                  {Array.from({ length: usedCols }, (_, i) => {
                    const mid = r.modifiers[i]
                    const slotCfg = cfg?.modifierSlots?.[i]
                    const optsRaw = cfg ? items.filter(it => modifierAllowedByCfg(cfg, i, it)) : items
                    const opts = withSelectedOption(optsRaw, mid ?? '', items)
                    const isLast = i === usedCols - 1

                    if (typeof mid !== 'undefined') {
                      return (
                        <td key={i} className="px-3 py-2 min-w-[320px]">
                          <div className="flex items-center gap-2">
                            <select
                              className="border rounded-lg px-2 h-10 text-gray-900 bg-white w-full"
                              value={mid}
                              onChange={e => setWizRows(rows => rows.map(x => x.id !== r.id ? x : {
                                ...x,
                                modifiers: x.modifiers.map((m, idx) => idx === i ? (e.target.value as Id) : m)
                              }))}
                            >
                              <option value="">{slotCfg?.label || `Modifier ${i + 1}`}</option>
                              {opts.map(md => (
                                <option key={md.id} value={md.id}>
                                  {md.name}{md.category_name ? ` (${md.category_name})` : ''}
                                </option>
                              ))}
                            </select>
                            <button
                              className="text-red-600 hover:text-red-500"
                              onClick={() => setWizRows(rows => rows.map(x => x.id !== r.id ? x : {
                                ...x, modifiers: x.modifiers.filter((_, idx) => idx !== i)
                              }))}
                              title="Remove modifier"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                            {isLast && addRowCol && (
                              <button
                                className="w-10 h-10 rounded border border-gray-300 hover:bg-gray-50 inline-flex items-center justify-center"
                                onClick={() => setWizRows(rows => rows.map(x => x.id === r.id ? { ...x, modifiers: [...x.modifiers, ''] } : x))}
                                title="Add modifier to this row"
                                aria-label="Add modifier to this row"
                              >
                                <PlusIcon className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )
                    }

                    return (
                      <td key={i} className="px-3 py-2 min-w-[320px]">
                        <div className="h-10 flex items-center gap-2">
                          <span className="opacity-50">-</span>
                          {isLast && addRowCol && (
                            <button
                              className="w-10 h-10 rounded border border-gray-300 hover:bg-gray-50 inline-flex items-center justify-center"
                              onClick={() => setWizRows(rows => rows.map(x => x.id === r.id ? { ...x, modifiers: [...x.modifiers, ''] } : x))}
                              title="Add modifier to this row"
                              aria-label="Add modifier to this row"
                            >
                              <PlusIcon className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )
                  })}

                  {usedCols === 0 && (
                    <td className="px-3 py-2 w-[72px]">
                      {addRowCol && (
                        <button
                          className="w-10 h-10 rounded border border-gray-300 hover:bg-gray-50 inline-flex items-center justify-center"
                          onClick={() => setWizRows(rows => rows.map(x => x.id === r.id ? { ...x, modifiers: [...x.modifiers, ''] } : x))}
                          title="Add modifier to this row"
                          aria-label="Add modifier to this row"
                        >
                          <PlusIcon className="w-5 h-5" />
                        </button>
                      )}
                    </td>
                  )}

                  <td className="px-3 py-2 text-right min-w-[96px]">
                    <input
                      className="border rounded-lg px-2 h-10 text-right text-gray-900 bg-white w-24"
                      type="number" min={0} step={1} inputMode="numeric"
                      value={String(r.qty)}
                      onChange={e => setWizRows(rows => rows.map(x => x.id === r.id ? { ...x, qty: clampQty(toNum(e.target.value, 0)) } : x))}
                    />
                  </td>
                  <td className="px-3 py-2 text-center min-w-[120px]">
                    <div className="h-10 w-24 mx-auto flex items-center justify-center text-gray-900 font-medium">{fmt0(baseCost)}</div>
                  </td>
                  <td className="px-3 py-2 text-center min-w-[120px]">
                    <div className="h-10 w-24 mx-auto flex items-center justify-center text-gray-900 font-medium">{fmt0(basePrice)}</div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="h-10 w-full flex items-center justify-center">
                      <button
                        className="text-red-600 hover:text-red-500"
                        onClick={() => setWizRows(rows => rows.filter(x => x.id !== r.id))}
                        title="Remove row"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}