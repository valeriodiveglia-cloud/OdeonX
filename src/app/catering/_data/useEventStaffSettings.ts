// src/app/catering/_data/useEventStaffSettings.ts
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

export type Id = string

export type StaffSettings = {
  event_id: Id
  markup_x: number | null
  updated_at?: string | null
}

type State = {
  loading: boolean
  error: string | null
  settings: StaffSettings | null
  refresh: () => Promise<void>
  /** Upsert del markup staff per l’evento */
  setMarkupX: (value: number) => Promise<boolean>
  /** (Opzionale) Propaga il markup nelle righe staff, se hai una colonna markup_x sulle righe */
  propagateMarkupToRows: (value: number) => Promise<boolean>
}

/* ───────── Cross-tab & Global Defaults ───────── */
const KEY_BUMP = 'eventcalc.settings.bump'

// LS dove salviamo il default globale staff (solo markup)
const KEY_GLOBAL_STAFF_DEFAULTS = 'eventcalc.global.staff.defaults'
const SCHEMA_VERSION = 1

function num(n: unknown, d = 0) {
  const x = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(x) ? x : d
}
function clampMarkup(x: number) {
  return Number.isFinite(x) && x > 0 ? x : 1
}
function readGlobalStaffDefaults(): { markupX: number; updatedAt: number; __v: number } {
  try {
    const raw = localStorage.getItem(KEY_GLOBAL_STAFF_DEFAULTS)
    if (!raw) return { markupX: 1, updatedAt: Date.now(), __v: SCHEMA_VERSION }
    const obj = JSON.parse(raw) || {}
    return {
      markupX: clampMarkup(num(obj.markupX, 1)),
      updatedAt: num(obj.updatedAt, Date.now()),
      __v: num(obj.__v, SCHEMA_VERSION),
    }
  } catch {
    return { markupX: 1, updatedAt: Date.now(), __v: SCHEMA_VERSION }
  }
}
function writeGlobalStaffDefaults(markupX: number) {
  try {
    const payload = {
      markupX: clampMarkup(num(markupX, 1)),
      updatedAt: Date.now(),
      __v: SCHEMA_VERSION,
    }
    localStorage.setItem(KEY_GLOBAL_STAFF_DEFAULTS, JSON.stringify(payload))
    try { localStorage.setItem(KEY_BUMP, String(Date.now())) } catch {}
  } catch {
    // ignore
  }
}

/** Hook per gestire il markup dello Staff su DB (tabella: event_staff_settings) */
export default function useEventStaffSettings(eventId: Id | null): State {
  const [loading, setLoading] = useState<boolean>(!!eventId)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<StaffSettings | null>(null)
  const alive = useRef(true)
  const seedingRef = useRef(false)

  const ensureId = useCallback(() => {
    if (!eventId || String(eventId).trim() === '') throw new Error('Missing event id')
    return String(eventId).trim()
  }, [eventId])

  const refresh = useCallback(async () => {
    if (!eventId) {
      setSettings(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const eid = ensureId()

      // 1) leggi eventuale record
      const { data, error: sErr } = await supabase
        .from('event_staff_settings')
        .select('event_id, markup_x, updated_at')
        .eq('event_id', eid)
        .maybeSingle()
      if (sErr) throw sErr

      const noSettings = !data || data.markup_x == null
      const seedKey = `eventcalc.staff.seeded:${eid}`
      const seededInLS = (() => { try { return !!localStorage.getItem(seedKey) } catch { return false } })()

      // 2) SEED per evento nuovo: copia dai global defaults → salva su DB → bump → stato
      if (!seedingRef.current && noSettings && !seededInLS) {
        seedingRef.current = true
        try {
          const gd = readGlobalStaffDefaults()
          const v = clampMarkup(gd.markupX)
          const { error: upErr } = await supabase
            .from('event_staff_settings')
            .upsert({ event_id: eid, markup_x: v }, { onConflict: 'event_id' })
          if (upErr) throw upErr

          // marca come seedato e ping cross-tab
          try { localStorage.setItem(seedKey, String(Date.now())) } catch {}
          try { localStorage.setItem(KEY_BUMP, String(Date.now())) } catch {}

          if (!alive.current) return
          setSettings({ event_id: eid, markup_x: v, updated_at: null })
          setLoading(false)
          return
        } catch (seedErr: any) {
          if (!alive.current) return
          setError(seedErr?.message || 'Failed to seed staff settings')
          // continuiamo sotto con il fallback virtuale
        } finally {
          seedingRef.current = false
        }
      }

      // 3) percorso normale: uso DB o virtual default 1 se assente
      if (!alive.current) return
      const s: StaffSettings | null = data
        ? {
            event_id: data.event_id as string,
            markup_x: (data.markup_x ?? null) as number | null,
            updated_at: (data as any)?.updated_at ?? null,
          }
        : { event_id: eid, markup_x: 1, updated_at: null }

      setSettings(s)
      setLoading(false)
    } catch (e: any) {
      if (!alive.current) return
      setSettings(null)
      setLoading(false)
      setError(e?.message || 'Failed to load staff settings')
    }
  }, [eventId, ensureId])

  useEffect(() => {
    alive.current = true
    refresh()
    return () => { alive.current = false }
  }, [refresh])

  const setMarkupX = useCallback(async (value: number) => {
    try {
      const eid = ensureId()
      const v = clampMarkup(value)

      // 1) aggiorna evento su DB
      const { error: upErr } = await supabase
        .from('event_staff_settings')
        .upsert({ event_id: eid, markup_x: v }, { onConflict: 'event_id' })
      if (upErr) throw upErr

      // 2) aggiorna anche il DEFAULT GLOBALE (nuovi eventi erediteranno questo)
      writeGlobalStaffDefaults(v)

      // 3) stato + bump
      setSettings(prev => (prev ? { ...prev, markup_x: v } : { event_id: eid, markup_x: v }))
      try { localStorage.setItem(KEY_BUMP, String(Date.now())) } catch {}

      return true
    } catch (e: any) {
      setError(e?.message || 'Failed to save staff markup')
      return false
    }
  }, [ensureId])

  const propagateMarkupToRows = useCallback(async (value: number) => {
    // Usa solo se hai una colonna `markup_x` su event_staff_rows
    try {
      const eid = ensureId()
      const v = clampMarkup(value)
      const { error: updErr } = await supabase
        .from('event_staff_rows')
        .update({ markup_x: v })
        .eq('event_id', eid)
      if (updErr) throw updErr

      // bump anche qui per coerenza
      try { localStorage.setItem(KEY_BUMP, String(Date.now())) } catch {}

      return true
    } catch (e: any) {
      setError(e?.message || 'Failed to propagate staff markup to rows')
      return false
    }
  }, [ensureId])

  return useMemo(() => ({
    loading,
    error,
    settings,
    refresh,
    setMarkupX,
    propagateMarkupToRows,
  }), [loading, error, settings, refresh, setMarkupX, propagateMarkupToRows])
}
