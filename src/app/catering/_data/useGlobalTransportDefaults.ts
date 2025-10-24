'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

export type Id = string
export type VehicleDefault = { id: Id; name: string; cost_per_km: number }
export type GlobalTransportDefaults = {
  markupX: number
  vehicleTypes: VehicleDefault[]
  updatedAt: number
  __v: number
}

const SCHEMA_VERSION = 1
const KEY_DEFAULTS = 'eventcalc.global.transport.defaults'
export const KEY_BUMP = 'eventcalc.settings.bump'

const TRANSPORT_TABLE = 'transport_defaults' as const
const ROW_KEY = 'global' as const

/* ===================== Utils ===================== */

function safeUUID(): string {
  try {
    const c: any = (globalThis as any)?.crypto
    if (c?.randomUUID) return c.randomUUID()
    const rnd = new Uint8Array(16)
    if (c?.getRandomValues) c.getRandomValues(rnd)
    else for (let i = 0; i < 16; i++) rnd[i] = Math.floor(Math.random() * 256)
    rnd[6] = (rnd[6] & 0x0f) | 0x40
    rnd[8] = (rnd[8] & 0x3f) | 0x80
    const hex = Array.from(rnd, b => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
  } catch {
    return `id_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
  }
}
function num(n: unknown, d = 0) { const x = typeof n === 'number' ? n : Number(n); return Number.isFinite(x) ? x : d }
function clampMarkup(x: number) { return Number.isFinite(x) && x > 0 ? x : 1 }
function bumpNow() { try { localStorage.setItem(KEY_BUMP, String(Date.now())) } catch {} }

/* ===================== Factory & LS ===================== */

function factoryDefaults(): GlobalTransportDefaults {
  return {
    markupX: 1,
    vehicleTypes: [
      { id: 'van',   name: 'Van',   cost_per_km: 0.7 },
      { id: 'truck', name: 'Truck', cost_per_km: 1.2 },
    ],
    updatedAt: Date.now(),
    __v: SCHEMA_VERSION,
  }
}

function readDefaultsLS(): GlobalTransportDefaults {
  try {
    const raw = localStorage.getItem(KEY_DEFAULTS)
    if (!raw) return factoryDefaults()
    const obj = JSON.parse(raw)
    const markupX = clampMarkup(num(obj?.markupX, 1))
    const items = Array.isArray(obj?.vehicleTypes) ? obj.vehicleTypes : []
    const vehicleTypes: VehicleDefault[] = items
      .map((it: any) => ({
        id: String(it?.id || '').trim() || safeUUID(),
        name: String(it?.name || '').trim(),
        cost_per_km: num(it?.cost_per_km, 0),
      }))
      .filter((it: VehicleDefault) => it.name.length > 0)
    return { markupX, vehicleTypes, updatedAt: num(obj?.updatedAt, Date.now()), __v: SCHEMA_VERSION }
  } catch { return factoryDefaults() }
}

function writeDefaultsLS(payload: GlobalTransportDefaults) {
  const data: GlobalTransportDefaults = {
    markupX: clampMarkup(num(payload.markupX, 1)),
    vehicleTypes: (payload.vehicleTypes || [])
      .map(it => ({
        id: String(it?.id || '').trim() || safeUUID(),
        name: String(it?.name || '').trim(),
        cost_per_km: num(it?.cost_per_km, 0),
      }))
      .filter(it => it.name.length > 0),
    updatedAt: Date.now(),
    __v: SCHEMA_VERSION,
  }
  try { localStorage.setItem(KEY_DEFAULTS, JSON.stringify(data)) } catch {}
  bumpNow()
  return data
}

/* ===================== DB I/O ===================== */

async function readDefaultsDB(): Promise<GlobalTransportDefaults | null> {
  const { data, error } = await supabase
    .from(TRANSPORT_TABLE)
    .select('markup_x, vehicle_types, updated_at')
    .eq('key', ROW_KEY)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) { console.warn('[transport_defaults] read error:', error.message); return null }
  if (!data) return null

  const items = Array.isArray((data as any).vehicle_types) ? (data as any).vehicle_types : []
  const vehicleTypes: VehicleDefault[] = items
    .map((it: any) => ({
      id: String(it?.id || '').trim() || safeUUID(),
      name: String(it?.name || '').trim(),
      cost_per_km: num(it?.cost_per_km, 0),
    }))
    .filter((it: VehicleDefault) => it.name.length > 0)

  return {
    markupX: clampMarkup(num((data as any).markup_x, 1)),
    vehicleTypes,
    updatedAt: (data as any).updated_at ? Date.parse((data as any).updated_at) : Date.now(),
    __v: SCHEMA_VERSION,
  }
}

/** Update-then-insert robusto (funziona anche se manca l’indice UNIQUE su key). */
async function upsertTransportRow(toWrite: {
  key: string
  markup_x: number
  vehicle_types: Array<{ id: string; name: string; cost_per_km: number }>
  updated_at: string
}) {
  // 1) UPDATE
  const { data: upd, error: uerr } = await supabase
    .from(TRANSPORT_TABLE)
    .update({
      markup_x: toWrite.markup_x,
      vehicle_types: toWrite.vehicle_types,
      updated_at: toWrite.updated_at,
    })
    .eq('key', ROW_KEY)
    .select('markup_x, vehicle_types, updated_at')
    .maybeSingle()

  if (uerr) throw uerr
  if (upd) return upd

  // 2) INSERT se non esiste
  const { data: ins, error: ierr } = await supabase
    .from(TRANSPORT_TABLE)
    .insert(toWrite)
    .select('markup_x, vehicle_types, updated_at')
    .single()

  if (ierr) throw ierr
  return ins
}

/* ===================== Hook ===================== */

type State = {
  loading: boolean
  error: string | null
  defaults: GlobalTransportDefaults

  refresh: () => void
  resetToFactory: () => void

  setMarkupX: (x: number) => void
  replaceVehicleTypes: (items: Array<{ id?: string; name: string; cost_per_km: number }>) => void
  addVehicleType: (item: { name: string; cost_per_km: number }) => void
  updateVehicleType: (id: Id, patch: Partial<Omit<VehicleDefault, 'id'>>) => void
  removeVehicleType: (id: Id) => void

  /** Salvataggio atomico: DB → LS → state (usa snapshot di ritorno dal DB). */
  saveAll: (payload: { markupX?: number; vehicleTypes?: Array<{ id?: string; name: string; cost_per_km: number }> }) => Promise<void>
}

export default function useGlobalTransportDefaults(): State {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [defaults, setDefaults] = useState<GlobalTransportDefaults>(() => readDefaultsLS())
  const alive = useRef(true)

  // Bootstrap: preferisci DB, fallback LS; allinea sempre LS allo snapshot caricato
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setError(null)
      const fromDB = await readDefaultsDB()
      if (cancelled) return
      const snapshot = fromDB ?? readDefaultsLS()
      const normalized = writeDefaultsLS(snapshot)
      setDefaults(normalized)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // cross-tab sync
  useEffect(() => {
    alive.current = true
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY_BUMP) {
        try {
          const next = readDefaultsLS()
          setDefaults(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
        } catch {}
      }
    }
    window.addEventListener('storage', onStorage)
    return () => { alive.current = false; window.removeEventListener('storage', onStorage) }
  }, [])

  const refresh = useCallback(() => {
    setLoading(true); setError(null)
    ;(async () => {
      try {
        const res = await readDefaultsDB()
        const next = res || readDefaultsLS()
        if (!alive.current) return
        setDefaults(writeDefaultsLS(next))
      } catch (e: any) {
        if (!alive.current) return
        setError(e?.message || 'Failed to read transport defaults')
      } finally {
        if (alive.current) setLoading(false)
      }
    })()
  }, [])

  const writeLocal = useCallback((mutator: (prev: GlobalTransportDefaults) => GlobalTransportDefaults) => {
    setDefaults(prev => writeDefaultsLS(mutator(prev)))
  }, [])

  const resetToFactory = useCallback(() => { writeLocal(() => factoryDefaults()) }, [writeLocal])

  const setMarkupX = useCallback((x: number) => {
    const v = clampMarkup(num(x, 1))
    writeLocal(prev => ({ ...prev, markupX: v, updatedAt: Date.now(), __v: SCHEMA_VERSION }))
  }, [writeLocal])

  const replaceVehicleTypes = useCallback((items: Array<{ id?: string; name: string; cost_per_km: number }>) => {
    const clean = (items || [])
      .map(it => ({ id: String(it?.id || '').trim() || safeUUID(), name: String(it?.name || '').trim(), cost_per_km: num(it?.cost_per_km, 0) }))
      .filter(it => it.name.length > 0)
    writeLocal(prev => ({ ...prev, vehicleTypes: clean, updatedAt: Date.now(), __v: SCHEMA_VERSION }))
  }, [writeLocal])

  const addVehicleType = useCallback((item: { name: string; cost_per_km: number }) => {
    const it = { id: safeUUID(), name: String(item?.name || '').trim(), cost_per_km: num(item?.cost_per_km, 0) }
    if (!it.name) return
    writeLocal(prev => ({ ...prev, vehicleTypes: [...prev.vehicleTypes, it], updatedAt: Date.now(), __v: SCHEMA_VERSION }))
  }, [writeLocal])

  const updateVehicleType = useCallback((id: Id, patch: Partial<Omit<VehicleDefault, 'id'>>) => {
    writeLocal(prev => {
      const next = prev.vehicleTypes.map(v =>
        v.id === id ? {
          ...v,
          name: typeof patch.name === 'string' ? String(patch.name).trim() : v.name,
          cost_per_km: patch.cost_per_km !== undefined ? num(patch.cost_per_km, v.cost_per_km) : v.cost_per_km,
        } : v
      )
      return { ...prev, vehicleTypes: next, updatedAt: Date.now(), __v: SCHEMA_VERSION }
    })
  }, [writeLocal])

  const removeVehicleType = useCallback((id: Id) => {
    writeLocal(prev => ({ ...prev, vehicleTypes: prev.vehicleTypes.filter(v => v.id !== id), updatedAt: Date.now(), __v: SCHEMA_VERSION }))
  }, [writeLocal])

  /** FIX “devo salvare due volte” */
  const saveAll: State['saveAll'] = useCallback(async (payload) => {
    setError(null)

    // 1) Prepara snapshot da scrivere
    const cleanedVehicles = (payload.vehicleTypes ?? []).map(it => ({
      id: String(it?.id || '').trim() || safeUUID(),
      name: String(it?.name || '').trim(),
      cost_per_km: num((it as any)?.cost_per_km, 0),
    })).filter(v => v.name.length > 0)

    const toWrite = {
      key: ROW_KEY,
      markup_x: clampMarkup(num(payload.markupX, 1)),
      vehicle_types: cleanedVehicles,
      updated_at: new Date().toISOString(),
    }

    // 2) UPDATE → se non c'è riga, INSERT (sempre con .select().single())
    const data = await upsertTransportRow(toWrite)

    // 3) Normalizza l’eco dal DB
    const items = Array.isArray((data as any)?.vehicle_types) ? (data as any).vehicle_types : []
    const vehicleTypes: VehicleDefault[] = items
      .map((it: any) => ({
        id: String(it?.id || '').trim() || safeUUID(),
        name: String(it?.name || '').trim(),
        cost_per_km: num(it?.cost_per_km, 0),
      }))
      .filter((it: VehicleDefault) => it.name.length > 0)

    const snapshotFromDB: GlobalTransportDefaults = {
      markupX: clampMarkup(num((data as any)?.markup_x, 1)),
      vehicleTypes,
      updatedAt: (data as any)?.updated_at ? Date.parse((data as any).updated_at) : Date.now(),
      __v: SCHEMA_VERSION,
    }

    // 4) Persisti su LS e poi aggiorna lo state con lo stesso snapshot
    const normalized = writeDefaultsLS(snapshotFromDB)
    setDefaults(normalized)
  }, [])

  return useMemo(() => ({
    loading, error, defaults,
    refresh, resetToFactory,
    setMarkupX, replaceVehicleTypes, addVehicleType, updateVehicleType, removeVehicleType,
    saveAll,
  }), [loading, error, defaults, refresh, resetToFactory, setMarkupX, replaceVehicleTypes, addVehicleType, updateVehicleType, removeVehicleType, saveAll])
}