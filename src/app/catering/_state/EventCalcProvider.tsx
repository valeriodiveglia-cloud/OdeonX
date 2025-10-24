// src/app/catering/_state/EventCalcProvider.tsx
'use client'
import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react'
import { supabase } from '@/lib/supabase_shim'

/**
 * Provider con "bozza locale finché non salvo"
 * - Mantiene bozza completa in memoria + localStorage (draft/persisted)
 * - Dirty flags per sezione e globale
 * - saveAll()/discardDraft() + setSaveHandler() per integrazione DB
 * - Espone API compat per le card (header/bundle/transport)
 */

export type ClientType = 'private' | 'company'

export type CompanyInfo = {
  companyName: string
  directorName: string
  taxCode: string
  addressLine: string
  city: string
  province: string
  zip: string
  country: string
}

export type EventHeader = {
  name: string
  date: string
  location: string
  pax: number | ''
  notes: string
  startTime: string
  endTime: string
  totalHours: number
  hostOrPoc: string
  phone: string
  email: string
  preferredContact: 'phone' | 'email' | 'whatsapp' | 'zalo' | 'telegram' | 'other' | ''
  clientType: ClientType
  company: CompanyInfo
}

export type ModifierSlotCfg = { label: string; categories: string[]; required: boolean }
export type BundleConfig = {
  label: string
  maxModifiers: number
  dishCategories: string[]
  modifierSlots: ModifierSlotCfg[]
  /** Markup multiplier (es. 1.5 = +50%) */
  markupX?: number
}

/** Vehicle types configurabili nel modal dei trasporti */
export type VehicleType = {
  id: string
  name: string
  costPerKm: number
}

/** Righe Transport (shape draft locale) */
export type TransportRow = {
  id: string
  from: string
  to: string
  vehicle: string
  roundTrip: boolean
  notes: string
}

/** Struttura bozza complessiva */
export type Draft = {
  header: EventHeader
  bundleSettings: Record<string, BundleConfig>
  transport: {
    markupX: number
    vehicleTypes: VehicleType[]
    rows: TransportRow[]
  }
}

type DirtySections = {
  header: boolean
  bundleSettings: boolean
  transport: boolean
}

type SaveHandler = (input: { eventId: string | null; draft: Draft }) => Promise<void>

/** API esposta dal provider */
type EventCalcState = {
  /** Event id (se disponibile). Il provider prova a leggerlo automaticamente */
  eventId: string | null

  /** Stato "bozza" completo e version per triggerare memos */
  draft: Draft
  draftVersion: number

  /** Dirty flags per sezione e globale */
  dirtySections: DirtySections
  isDirtyGlobal: boolean

  /** Stato di salvataggio in corso */
  saving: boolean
  lastSavedAt: number | null

  /** Update helpers generici */
  updateDraft: (section: keyof Draft, patch: any) => void
  setDraft: React.Dispatch<React.SetStateAction<Draft>>

  /** API per integrare con pagina e DB */
  saveAll: () => Promise<void>
  discardDraft: () => void
  setSaveHandler: (fn: SaveHandler) => void
  loadFromDB: (data: Partial<Draft>) => void

  /** Compatibilità con API già usate dalle card */
  header: EventHeader
  updateHeader: (patch: Partial<EventHeader>) => void

  bundleSettings: Record<string, BundleConfig>
  setBundleSettings: React.Dispatch<React.SetStateAction<Record<string, BundleConfig>>>

  transportMarkupX: number
  setTransportMarkupX: (x: number) => void
  transportVehicleTypes: VehicleType[]
  addVehicleType: (vt: { name: string; costPerKm: number }) => void
  updateVehicleType: (id: string, patch: Partial<Omit<VehicleType, 'id'>>) => void
  removeVehicleType: (id: string) => void

  transportRows: TransportRow[]
  addTrip: () => void
  updateTrip: (id: string, patch: Partial<Omit<TransportRow, 'id'>>) => void
  removeTrip: (id: string) => void
}

const defaultHeader: EventHeader = {
  name: '',
  date: '',
  location: '',
  pax: '',
  notes: '',
  startTime: '',
  endTime: '',
  totalHours: 0,
  hostOrPoc: '',
  phone: '',
  email: '',
  preferredContact: '',
  clientType: 'private',
  company: {
    companyName: '',
    directorName: '',
    taxCode: '',
    addressLine: '',
    city: '',
    province: '',
    zip: '',
    country: '',
  },
}

const defaultDraft: Draft = {
  header: defaultHeader,
  bundleSettings: {},
  transport: {
    markupX: 1.0,
    vehicleTypes: [
      { id: 'van', name: 'Van', costPerKm: 0.7 },
      { id: 'truck', name: 'Truck', costPerKm: 1.2 },
    ],
    rows: [],
  },
}

const defaultDirty: DirtySections = {
  header: false,
  bundleSettings: false,
  transport: false,
}

const Ctx = createContext<EventCalcState | null>(null)

/* ───────── Totals snapshot (per push autoritativo su DB) ───────── */
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

const SNAP_KEY = (eventId?: string | null) => `eventcalc.snap.totals:${eventId || ''}`
const AFTER_DISCOUNTS_KEY = (eventId?: string | null) => `eventcalc.total.afterDiscounts:${eventId || ''}`

function readTotalsSnapshot(eventId?: string | null): TotalsSnapshot | null {
  if (!eventId) return null
  try {
    const raw = localStorage.getItem(SNAP_KEY(eventId))
    return raw ? (JSON.parse(raw) as TotalsSnapshot) : null
  } catch {
    return null
  }
}

async function waitForSnapshot(eventId: string | null, tries = 3, delayMs = 200): Promise<TotalsSnapshot | null> {
  let attempt = 0
  while (attempt < tries) {
    const snap = readTotalsSnapshot(eventId)
    if (snap) return snap
    await new Promise(r => setTimeout(r, delayMs))
    attempt++
  }
  return readTotalsSnapshot(eventId)
}

async function pushAuthoritativeTotals(eventId: string, snap: TotalsSnapshot) {
  const payload = {
    bundles_cost: Math.round(snap.bundlesCost || 0),
    bundles_price: Math.round(snap.bundlesPrice || 0),
    equipment_cost: Math.round(snap.equipmentCost || 0),
    equipment_price: Math.round(snap.equipmentPrice || 0),
    staff_cost: Math.round(snap.staffCost || 0),
    staff_price: Math.round(snap.staffPrice || 0),
    transport_cost: Math.round(snap.transportCost || 0),
    transport_price: Math.round(snap.transportPrice || 0),
    assets_price: Math.round(snap.assetsPrice || 0),
    extrafee_cost: Math.round(snap.extraFeeCost || 0),
    extrafee_price: Math.round(snap.extraFeePrice || 0),
    discounts_total: Math.round(snap.discountsTotal || 0),
    people_count: snap.peopleCount ?? null,
    budget_per_person: snap.budgetPerPerson ?? null,
    budget_total: snap.budgetTotal ?? null,
    service_hours: snap.serviceHours ?? null,
  }

  const { data, error } = await supabase.rpc('event_totals_upsert', {
    p_event_id: eventId,
    p_totals: payload,
  } as any)

  if (error) {
    console.warn('[event_totals_upsert] error:', error.message)
    return null
  }

  // Aggiorna chiave di lista (coerenza cross-tab) con il dato autoritativo tornato dal server
  try {
    const after = Number((data as any)?.price_after_discounts ?? snap.priceAfterDiscounts ?? 0) || 0
    localStorage.setItem(AFTER_DISCOUNTS_KEY(eventId), String(Math.round(after)))
    window.dispatchEvent(new CustomEvent('totals:afterDiscounts', { detail: { eventId, total: Math.round(after) } }))
    window.dispatchEvent(new CustomEvent('event_totals:updated', { detail: { eventId, row: data } }))
  } catch {}
  return data
}

/* ───────── Utils ───────── */
function safeUUID(): string {
  try {
    const c: any = (globalThis as any)?.crypto
    if (c && typeof c.randomUUID === 'function') return c.randomUUID.call(c)
  } catch {}
  try {
    const c: any = (globalThis as any)?.crypto
    const rnds = new Uint8Array(16)
    if (c?.getRandomValues) c.getRandomValues(rnds)
    else for (let i = 0; i < 16; i++) rnds[i] = Math.floor(Math.random() * 256)
    rnds[6] = (rnds[6] & 0x0f) | 0x40
    rnds[8] = (rnds[8] & 0x3f) | 0x80
    const hex = Array.from(rnds, b => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  } catch {
    return `id_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
  }
}
function toNumber(n: unknown, def = 0): number {
  const x = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(x) ? x : def
}

/** Recupera un eventId automatico: URL -> storage -> null */
function resolveEventId(): string | null {
  try {
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href)
      const qs = u.searchParams.get('eventId')
      if (qs && qs.trim()) return qs.trim()
    }
  } catch {}
  try {
    const ls: any = (globalThis as any)?.localStorage
    const ss: any = (globalThis as any)?.sessionStorage
    const candidates = [
      ls?.getItem?.('event_current_id'),
      ss?.getItem?.('event_current_id'),
      ls?.getItem?.('eventId'),
      ss?.getItem?.('eventId'),
      (globalThis as any)?.__EVENT_ID__,
    ].map(v => (v ? String(v).trim() : ''))
    const found = candidates.find(v => v.length > 0)
    return found || null
  } catch {
    return null
  }
}

/* ───────── Provider ───────── */
export function EventCalcProvider({ children }: { children: React.ReactNode }) {
  const [eventId] = useState<string | null>(() => resolveEventId())

  /** salva su ref l'handler esterno di salvataggio DB */
  const saveHandlerRef = useRef<SaveHandler | null>(null)
  const setSaveHandler = useCallback((fn: SaveHandler) => {
    saveHandlerRef.current = fn
  }, [])

  /** Chiavi di storage: per bozza e per snapshot persistito */
  const storageKeyBase = useMemo(() => {
    const byEvent = eventId?.trim()
    if (byEvent) return `eventcalc_${byEvent}`
    return `eventcalc_fallback`
  }, [eventId])

  const draftKey = `${storageKeyBase}_draft`
  const persistedKey = `${storageKeyBase}_persisted`

  /** Stato principale: bozza completa */
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(draftKey) : null
      if (raw) {
        const parsed = JSON.parse(raw) as Draft
        return {
          header: { ...defaultHeader, ...parsed.header },
          bundleSettings: parsed.bundleSettings || {},
          transport: {
            markupX: toNumber(parsed.transport?.markupX ?? 1.0, 1.0),
            vehicleTypes: Array.isArray(parsed.transport?.vehicleTypes)
              ? parsed.transport!.vehicleTypes.map(v => ({
                  id: v.id || safeUUID(),
                  name: v.name ?? '',
                  costPerKm: toNumber(v.costPerKm, 0),
                }))
              : defaultDraft.transport.vehicleTypes,
            rows: Array.isArray(parsed.transport?.rows)
              ? parsed.transport!.rows.map(r => ({
                  id: r.id || safeUUID(),
                  from: r.from ?? '',
                  to: r.to ?? '',
                  vehicle: r.vehicle ?? '',
                  roundTrip: typeof r.roundTrip === 'boolean' ? r.roundTrip : true,
                  notes: r.notes ?? '',
                }))
              : [],
          },
        }
      }
    } catch {}
    return defaultDraft
  })

  /** Snapshot dell'ultima versione "persistita" (serve per discard/comparazioni) */
  const [persisted, setPersisted] = useState<Draft>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(persistedKey) : null
      if (raw) {
        const parsed = JSON.parse(raw) as Draft
        return {
          header: { ...defaultHeader, ...parsed.header },
          bundleSettings: parsed.bundleSettings || {},
          transport: {
            markupX: toNumber(parsed.transport?.markupX ?? 1.0, 1.0),
            vehicleTypes: Array.isArray(parsed.transport?.vehicleTypes)
              ? parsed.transport!.vehicleTypes.map(v => ({
                  id: v.id || safeUUID(),
                  name: v.name ?? '',
                  costPerKm: toNumber(v.costPerKm, 0),
                }))
              : defaultDraft.transport.vehicleTypes,
            rows: Array.isArray(parsed.transport?.rows)
              ? parsed.transport!.rows.map(r => ({
                  id: r.id || safeUUID(),
                  from: r.from ?? '',
                  to: r.to ?? '',
                  vehicle: r.vehicle ?? '',
                  roundTrip: typeof r.roundTrip === 'boolean' ? r.roundTrip : true,
                  notes: r.notes ?? '',
                }))
              : [],
          },
        }
      }
    } catch {}
    return defaultDraft
  })

  /** Dirty per sezione e global */
  const [dirtySections, setDirtySections] = useState<DirtySections>(defaultDirty)
  const isDirtyGlobal = dirtySections.header || dirtySections.bundleSettings || dirtySections.transport

  /** Bookkeeping salvataggio */
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)

  /** Version per forzare update memos dove serve */
  const [draftVersion, setDraftVersion] = useState(0)

  /** Persistenza automatica della bozza su localStorage */
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft))
    } catch {
      // ignore quota / private mode
    }
  }, [draftKey, draft])

  /** Quando cambia eventId, ricarico eventuali snapshot se esistono */
  useEffect(() => {
    try {
      const rawDraft = localStorage.getItem(draftKey)
      if (rawDraft) {
        const parsed = JSON.parse(rawDraft) as Draft
        setDraft(parsed)
      } else {
        setDraft(defaultDraft)
      }
      const rawPersisted = localStorage.getItem(persistedKey)
      if (rawPersisted) {
        setPersisted(JSON.parse(rawPersisted) as Draft)
        setDirtySections(defaultDirty)
      } else {
        setPersisted(defaultDraft)
        setDirtySections(defaultDirty)
      }
    } catch {
      setDraft(defaultDraft)
      setPersisted(defaultDraft)
      setDirtySections(defaultDirty)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKeyBase])

  /** Helpers: segna dirty */
  const markDirty = useCallback((section: keyof DirtySections) => {
    setDirtySections(prev => ({ ...prev, [section]: true }))
  }, [])

  /** Update generico per sezione */
  const updateDraft = useCallback(
    (section: keyof Draft, patch: any) => {
      setDraft(prev => {
        const next = { ...prev }
        if (section === 'header') {
          next.header = { ...prev.header, ...(patch as Partial<EventHeader>) }
          markDirty('header')
        } else if (section === 'bundleSettings') {
          if (typeof patch === 'function') {
            next.bundleSettings = (patch as any)(prev.bundleSettings)
          } else {
            next.bundleSettings = { ...prev.bundleSettings, ...(patch as Record<string, BundleConfig>) }
          }
          markDirty('bundleSettings')
        } else if (section === 'transport') {
          const p = patch as Partial<Draft['transport']>
          next.transport = {
            markupX: p.markupX != null ? toNumber(p.markupX, prev.transport.markupX) : prev.transport.markupX,
            vehicleTypes: p.vehicleTypes ? p.vehicleTypes : prev.transport.vehicleTypes,
            rows: p.rows ? p.rows : prev.transport.rows,
          }
          markDirty('transport')
        }
        return next
      })
      setDraftVersion(v => v + 1)
    },
    [markDirty]
  )

  /** Compat: header */
  const header = draft.header
  const updateHeader = useCallback(
    (patch: Partial<EventHeader>) => updateDraft('header', patch),
    [updateDraft]
  )

  /** Compat: bundle settings */
  const bundleSettings = draft.bundleSettings
  const setBundleSettings = useCallback(
    (updater: React.SetStateAction<Record<string, BundleConfig>>) => {
      if (typeof updater === 'function') {
        const fn = updater as (prev: Record<string, BundleConfig>) => Record<string, BundleConfig>
        updateDraft('bundleSettings', (prev: Record<string, BundleConfig>) => fn(prev))
      } else {
        updateDraft('bundleSettings', updater)
      }
    },
    [updateDraft]
  )

  /** Compat: transport markup */
  const transportMarkupX = draft.transport.markupX
  const setTransportMarkupX = useCallback(
    (x: number) => {
      updateDraft('transport', { markupX: Number.isFinite(x) && x > 0 ? x : 1.0 })
    },
    [updateDraft]
  )

  /** Compat: vehicle types */
  const transportVehicleTypes = draft.transport.vehicleTypes
  const addVehicleType = useCallback(
    (vt: { name: string; costPerKm: number }) => {
      const newVt: VehicleType = {
        id: safeUUID(),
        name: vt.name ?? '',
        costPerKm: toNumber(vt.costPerKm, 0),
      }
      updateDraft('transport', { vehicleTypes: [...draft.transport.vehicleTypes, newVt] })
    },
    [draft.transport.vehicleTypes, updateDraft]
  )
  const updateVehicleType = useCallback(
    (id: string, patch: Partial<Omit<VehicleType, 'id'>>) => {
      const next = draft.transport.vehicleTypes.map(v =>
        v.id === id
          ? {
              ...v,
              ...patch,
              costPerKm: patch.costPerKm !== undefined ? toNumber(patch.costPerKm, v.costPerKm) : v.costPerKm,
            }
          : v
      )
      updateDraft('transport', { vehicleTypes: next })
    },
    [draft.transport.vehicleTypes, updateDraft]
  )
  const removeVehicleType = useCallback(
    (id: string) => {
      updateDraft('transport', { vehicleTypes: draft.transport.vehicleTypes.filter(v => v.id !== id) })
    },
    [draft.transport.vehicleTypes, updateDraft]
  )

  /** Compat: transport rows */
  const transportRows = draft.transport.rows
  const addTrip = useCallback(() => {
    const row: TransportRow = { id: safeUUID(), from: '', to: '', vehicle: '', roundTrip: true, notes: '' }
    updateDraft('transport', { rows: [...draft.transport.rows, row] })
  }, [draft.transport.rows, updateDraft])
  const updateTrip = useCallback(
    (id: string, patch: Partial<Omit<TransportRow, 'id'>>) => {
      const next = draft.transport.rows.map(r =>
        r.id === id ? { ...r, ...patch, roundTrip: patch.roundTrip ?? r.roundTrip } : r
      )
      updateDraft('transport', { rows: next })
    },
    [draft.transport.rows, updateDraft]
  )
  const removeTrip = useCallback(
    (id: string) => {
      updateDraft('transport', { rows: draft.transport.rows.filter(r => r.id !== id) })
    },
    [draft.transport.rows, updateDraft]
  )

  /** Carica dati "persistiti su DB" in bozza e azzera dirty */
  const loadFromDB = useCallback((data: Partial<Draft>) => {
    setDraft(prev => {
      const next: Draft = {
        header: { ...prev.header, ...data.header },
        bundleSettings: data.bundleSettings ?? prev.bundleSettings,
        transport: {
          markupX: data.transport?.markupX != null ? toNumber(data.transport.markupX, prev.transport.markupX) : prev.transport.markupX,
          vehicleTypes: data.transport?.vehicleTypes ?? prev.transport.vehicleTypes,
          rows: data.transport?.rows ?? prev.transport.rows,
        },
      }
      return next
    })
    setPersisted(prev => {
      const next: Draft = {
        header: { ...prev.header, ...data.header },
        bundleSettings: data.bundleSettings ?? prev.bundleSettings,
        transport: {
          markupX: data.transport?.markupX != null ? toNumber(data.transport.markupX, prev.transport.markupX) : prev.transport.markupX,
          vehicleTypes: data.transport?.vehicleTypes ?? prev.transport.vehicleTypes,
          rows: data.transport?.rows ?? prev.transport.rows,
        },
      }
      try {
        localStorage.setItem(persistedKey, JSON.stringify(next))
      } catch {}
      return next
    })
    setDirtySections(defaultDirty)
    setDraftVersion(v => v + 1)
  }, [persistedKey])

  /** Salvataggio: usa handler esterno se presente, altrimenti committa solo come "persisted" locale.
   *  Poi esegue l'UPSERT autoritativo dei totali su DB usando lo snapshot stabile calcolato dalla TotalsCard.
   */
  const saveAll = useCallback(async () => {
    setSaving(true)
    try {
      const handler = saveHandlerRef.current
      if (handler) {
        await handler({ eventId, draft })
      }
      // snapshot persistito locale
      setPersisted(draft)
      try {
        localStorage.setItem(persistedKey, JSON.stringify(draft))
      } catch {}
      setDirtySections(defaultDirty)
      setLastSavedAt(Date.now())

      // ---- PUSH AUTORITATIVO TOTALI ----
      if (eventId) {
        // prova a leggere uno snapshot stabile; se non c'è, attendi brevemente che la TotalsCard lo scriva
        const snap = readTotalsSnapshot(eventId) ?? await waitForSnapshot(eventId, 3, 220)
        if (snap) {
          await pushAuthoritativeTotals(eventId, snap)
        } else {
          // fallback ultra-minimo: allinea almeno la chiave afterDiscounts se presente
          try {
            const adRaw = localStorage.getItem(AFTER_DISCOUNTS_KEY(eventId))
            if (adRaw) {
              const val = Math.round(Number(adRaw) || 0)
              window.dispatchEvent(new CustomEvent('totals:afterDiscounts', { detail: { eventId, total: val } }))
            }
          } catch {}
          console.warn('[saveAll] Nessuno snapshot totals trovato in LS; saltato upsert autoritativo.')
        }
      }
    } finally {
      setSaving(false)
    }
  }, [draft, eventId, persistedKey])

  /** Scarta modifiche locali e ripristina l'ultima versione persistita nota */
  const discardDraft = useCallback(() => {
    setDraft(persisted)
    setDirtySections(defaultDirty)
    setDraftVersion(v => v + 1)
  }, [persisted])

  const value = useMemo<EventCalcState>(
    () => ({
      eventId,

      draft,
      draftVersion,

      dirtySections,
      isDirtyGlobal,

      saving,
      lastSavedAt,

      updateDraft,
      setDraft,

      saveAll,
      discardDraft,
      setSaveHandler,
      loadFromDB,

      // compat API già usate dalle card
      header,
      updateHeader,

      bundleSettings,
      setBundleSettings,

      transportMarkupX,
      setTransportMarkupX,

      transportVehicleTypes,
      addVehicleType,
      updateVehicleType,
      removeVehicleType,

      transportRows,
      addTrip,
      updateTrip,
      removeTrip,
    }),
    [
      eventId,
      draft,
      draftVersion,
      dirtySections,
      isDirtyGlobal,
      saving,
      lastSavedAt,
      updateDraft,
      setDraft,
      saveAll,
      discardDraft,
      setSaveHandler,
      loadFromDB,
      header,
      updateHeader,
      bundleSettings,
      setBundleSettings,
      transportMarkupX,
      setTransportMarkupX,
      transportVehicleTypes,
      addVehicleType,
      updateVehicleType,
      removeVehicleType,
      transportRows,
      addTrip,
      updateTrip,
      removeTrip,
    ]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useEventCalc() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useEventCalc must be used within <EventCalcProvider>')
  return ctx
}
