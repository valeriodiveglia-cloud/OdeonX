// src/app/catering/_data/useEventTransportSettings.ts
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

export type Id = string

export type TransportSettings = {
  event_id: Id
  markup_x: number | null
  updated_at?: string | null
}

export type VehicleTypeRow = {
  id: Id
  event_id: Id
  name: string
  cost_per_km: number
  created_at?: string | null
  updated_at?: string | null
}

type State = {
  loading: boolean
  error: string | null

  /** Valori EFFETTIVI da usare in UI:
   *  - per-evento se presenti
   *  - altrimenti GLOBAL DEFAULTS (senza scrivere sul DB)
   */
  settings: TransportSettings | null
  vehicleTypes: VehicleTypeRow[]

  refresh: () => Promise<void>

  /** Scrive/aggiorna il markup per-EVENTO (usare solo quando si “adotta” esplicitamente) */
  setMarkupX: (value: number) => Promise<boolean>

  /** Propaga markup_x su event_transport_rows (per-EVENTO) */
  propagateMarkupToRows: (value: number) => Promise<boolean>

  /** Rimpiazza i vehicle types per-EVENTO (delete + insert) */
  replaceVehicleTypes: (items: Array<{ name: string; cost_per_km: number }>) => Promise<boolean>
}

/* ===================== Global defaults (LS) ===================== */
const KEY_GLOBAL_DEFAULTS = 'eventcalc.global.transport.defaults'
const KEY_BUMP = 'eventcalc.settings.bump'

type GlobalDefaultsLS = {
  markupX?: number
  vehicleTypes?: Array<{ id?: string; name: string; cost_per_km: number }>
  updatedAt?: number
  __v?: number
}

function num(n: unknown, d = 0) {
  const x = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(x) ? x : d
}
function clampMarkup(x: number) {
  return Number.isFinite(x) && x > 0 ? x : 1
}
function slug(s: string) {
  return s.normalize?.('NFD').replace?.(/\p{Diacritic}/gu, '')?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item'
}
/** Fallback hard-coded, coerente coi default del draft locale */
function factoryDefaults() {
  return {
    markupX: 1,
    vehicleTypes: [
      { name: 'Van',   cost_per_km: 0.7 },
      { name: 'Truck', cost_per_km: 1.2 },
    ],
  }
}
function readGlobalDefaults(): { markupX: number; vehicleTypes: Array<{ name: string; cost_per_km: number }> } {
  try {
    const raw = localStorage.getItem(KEY_GLOBAL_DEFAULTS)
    if (!raw) return factoryDefaults()
    const obj: GlobalDefaultsLS = JSON.parse(raw) || {}
    const markupX = clampMarkup(num(obj.markupX, 1))
    const items = Array.isArray(obj.vehicleTypes) ? obj.vehicleTypes : []
    const vehicleTypes = items
      .map(it => ({
        name: String(it?.name || '').trim(),
        cost_per_km: num(it?.cost_per_km, 0),
      }))
      .filter(it => it.name.length > 0)
    return {
      markupX,
      vehicleTypes: vehicleTypes.length > 0 ? vehicleTypes : factoryDefaults().vehicleTypes,
    }
  } catch {
    return factoryDefaults()
  }
}

/** Mappa i GLOBAL defaults in righe “virtuali” per questo evento (id stabili, no DB) */
function mapGlobalToRows(eid: string, items: Array<{ name: string; cost_per_km: number }>): VehicleTypeRow[] {
  return items.map(it => ({
    id: `global:${slug(it.name)}`,   // id stabile derivato dal nome (niente FK)
    event_id: eid,
    name: it.name,
    cost_per_km: num(it.cost_per_km, 0),
  }))
}

/* ===================== Hook principale ===================== */
export function useTransportSettings(eventId: Id | null): State {
  // Inizializzo OTTIMISTICAMENTE con i GLOBAL per evitare “flicker” sui nuovi eventi
  const initial = useMemo(() => {
    if (!eventId) return { settings: null as TransportSettings | null, vehicleTypes: [] as VehicleTypeRow[] }
    const gd = readGlobalDefaults()
    return {
      settings: { event_id: eventId, markup_x: clampMarkup(gd.markupX), updated_at: null },
      vehicleTypes: mapGlobalToRows(eventId, gd.vehicleTypes),
    }
  }, [eventId])

  const [loading, setLoading] = useState<boolean>(!!eventId)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<TransportSettings | null>(initial.settings)
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeRow[]>(initial.vehicleTypes)
  const alive = useRef(true)

  const ensureId = useCallback(() => {
    if (!eventId || String(eventId).trim() === '') {
      throw new Error('Missing event id')
    }
    return String(eventId).trim()
  }, [eventId])

  const refresh = useCallback(async () => {
    if (!eventId) {
      setSettings(null)
      setVehicleTypes([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const eid = ensureId()

      // 1) settings per-evento
      const { data: sData, error: sErr } = await supabase
        .from('event_transport_settings')
        .select('event_id, markup_x, updated_at')
        .eq('event_id', eid)
        .maybeSingle()
      if (sErr) throw sErr

      // 2) vehicle types per-evento
      const { data: vData, error: vErr } = await supabase
        .from('event_transport_vehicle_types')
        .select('id, event_id, name, cost_per_km, created_at, updated_at')
        .eq('event_id', eid)
        .order('created_at', { ascending: true })
      if (vErr) throw vErr

      if (!alive.current) return

      // ---- Strategy: usa per-evento SE esiste, altrimenti GLOBAL in sola lettura ----
      const hasPerEventVehicles = (vData?.length ?? 0) > 0
      const hasPerEventSettings = !!sData && sData.markup_x != null

      if (hasPerEventVehicles || hasPerEventSettings) {
        // Modalità “storico / adottato”: usa i valori DB di questo evento
        const s: TransportSettings = sData
          ? {
              event_id: sData.event_id as string,
              markup_x: (sData.markup_x ?? null) as number | null,
              updated_at: (sData as any)?.updated_at ?? null,
            }
          : { event_id: eid, markup_x: 1, updated_at: null } // se manca record settings ma ci sono veicoli
        setSettings(s)
        setVehicleTypes((vData ?? []) as VehicleTypeRow[])
      } else {
        // Modalità “nuovo evento”: NON scriviamo nulla su DB; usiamo i GLOBAL
        const gd = readGlobalDefaults()
        setSettings({ event_id: eid, markup_x: clampMarkup(gd.markupX), updated_at: null })
        setVehicleTypes(mapGlobalToRows(eid, gd.vehicleTypes))
      }

      setLoading(false)
    } catch (e: any) {
      if (!alive.current) return
      setError(e?.message || 'Failed to load transport settings')
      // In caso di errore lascio l’optimistic state (globali) che avevamo già impostato
      setLoading(false)
    }
  }, [eventId, ensureId])

  useEffect(() => {
    alive.current = true
    refresh()
    return () => { alive.current = false }
  }, [refresh])

  /* ===================== Mutazioni (PER-EVENTO, su richiesta esplicita) ===================== */
  const setMarkupX = useCallback(async (value: number) => {
    try {
      const eid = ensureId()
      const v = Number.isFinite(value) && value > 0 ? value : 1
      const { error: upErr } = await supabase
        .from('event_transport_settings')
        .upsert({ event_id: eid, markup_x: v }, { onConflict: 'event_id' })
      if (upErr) throw upErr
      setSettings(prev => (prev ? { ...prev, markup_x: v } : { event_id: eid, markup_x: v }))
      try { localStorage.setItem(KEY_BUMP, String(Date.now())) } catch {}
      return true
    } catch (e: any) {
      setError(e?.message || 'Failed to save markup_x')
      return false
    }
  }, [ensureId])

  const propagateMarkupToRows = useCallback(async (value: number) => {
    try {
      const eid = ensureId()
      const v = Number.isFinite(value) && value > 0 ? value : 1
      const { error: updErr } = await supabase
        .from('event_transport_rows')
        .update({ markup_x: v })
        .eq('event_id', eid)
      if (updErr) throw updErr
      return true
    } catch (e: any) {
      setError(e?.message || 'Failed to propagate markup_x to rows')
      return false
    }
  }, [ensureId])

  const replaceVehicleTypes = useCallback(async (items: Array<{ name: string; cost_per_km: number }>) => {
    try {
      const eid = ensureId()
      // 1) delete all old
      const { error: delErr } = await supabase
        .from('event_transport_vehicle_types')
        .delete()
        .eq('event_id', eid)
      if (delErr) throw delErr

      // 2) insert new (skip empty names)
      const payload = (items || [])
        .map(it => ({
          event_id: eid,
          name: String(it?.name || '').trim(),
          cost_per_km: num(it?.cost_per_km, 0),
        }))
        .filter(it => it.name.length > 0)

      if (payload.length > 0) {
        const { error: insErr } = await supabase
          .from('event_transport_vehicle_types')
          .insert(payload)
        if (insErr) throw insErr
      }

      // 3) refresh list
      const { data, error: vErr } = await supabase
        .from('event_transport_vehicle_types')
        .select('id, event_id, name, cost_per_km, created_at, updated_at')
        .eq('event_id', eid)
        .order('created_at', { ascending: true })
      if (vErr) throw vErr

      setVehicleTypes((data ?? []) as VehicleTypeRow[])
      try { localStorage.setItem(KEY_BUMP, String(Date.now())) } catch {}
      return true
    } catch (e: any) {
      setError(e?.message || 'Failed to replace vehicle types')
      return false
    }
  }, [ensureId])

  return useMemo(() => ({
    loading,
    error,
    settings,
    vehicleTypes,
    refresh,
    setMarkupX,
    propagateMarkupToRows,
    replaceVehicleTypes,
  }), [loading, error, settings, vehicleTypes, refresh, setMarkupX, propagateMarkupToRows, replaceVehicleTypes])
}

export default useTransportSettings
