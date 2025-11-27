// src/app/catering/_cards/EventTransportCard.tsx
'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { TrashIcon, PlusIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { useEventCalc } from '@/app/catering/_state/EventCalcProvider'
import { useEventTransportRows } from '@/app/catering/_data/useEventTransportRows'
import useTransportSettings from '@/app/catering/_data/useEventTransportSettings' // DB: markup + vehicle types
import useGlobalTransportDefaults from '@/app/catering/_data/useGlobalTransportDefaults' // LS: global defaults
import { useECT } from '@/app/catering/_i18n' // 👈 i18n

/* ===================== Formatting & Utils ===================== */
const fmt = (n: number | null | undefined) => {
  if (n == null || Number.isNaN(n)) return '—'
  try { return new Intl.NumberFormat('en-US').format(Math.round(n)) } catch { return String(Math.round(n ?? 0)) }
}

function uuid() {
  try {
    // @ts-ignore
    if (globalThis?.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch { }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

function useDebounced<T>(value: T, delay = 250) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t) }, [value, delay])
  return v
}

/* ===================== Distance Cache (SWR) ===================== */
type DistRes = { km: number; minutes: number }
const distanceCache = new Map<string, DistRes>()
const inflight = new Map<string, Promise<DistRes>>()
const DIST_LS_PREFIX = 'eventcalc.distance:'
const DIST_CACHE_VER = 1
const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30

function mkKey(country: string, from: string, to: string) {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  return `${country}|${norm(from)}|${norm(to)}`
}
function lsRead(key: string): { res: DistRes; t: number; v: number } | null {
  try {
    const raw = localStorage.getItem(DIST_LS_PREFIX + key)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return null
    const v = Number(obj.v ?? 0)
    const t = Number(obj.t ?? 0)
    const km = Number(obj.km ?? 0)
    const minutes = Number(obj.minutes ?? 0)
    if (!Number.isFinite(t) || v !== DIST_CACHE_VER) return null
    return { res: { km, minutes }, t, v }
  } catch { return null }
}
function lsWrite(key: string, res: DistRes) {
  try {
    const payload = JSON.stringify({ v: DIST_CACHE_VER, t: Date.now(), km: Number(res.km || 0), minutes: Number(res.minutes || 0) })
    localStorage.setItem(DIST_LS_PREFIX + key, payload)
  } catch { }
}
function cacheGet(country: string, from: string, to: string): { res: DistRes | null; fresh: boolean } {
  const key = mkKey(country, from, to)
  const mem = distanceCache.get(key)
  if (mem) return { res: mem, fresh: true }
  const ls = lsRead(key)
  if (ls) {
    distanceCache.set(key, ls.res)
    const fresh = (Date.now() - ls.t) < CACHE_MAX_AGE_MS && (ls.res.km > 0 || ls.res.minutes > 0)
    return { res: ls.res, fresh }
  }
  return { res: null, fresh: false }
}
async function fetchDistance(country: string, from: string, to: string): Promise<DistRes> {
  const key = mkKey(country, from, to)
  const existing = inflight.get(key)
  if (existing) return existing
  const p = (async () => {
    const r = await fetch('/api/distance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, country }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j?.error || 'Distance failed')
    const res: DistRes = { km: Number(j.km) || 0, minutes: Number(j.minutes) || 0 }
    distanceCache.set(key, res)
    lsWrite(key, res)
    return res
  })()
  inflight.set(key, p)
  try { return await p } finally { inflight.delete(key) }
}

/* ===================== eventId resolver ===================== */
function autoEventId(fallback?: string | null): string | null {
  try {
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href)
      const fromUrl = u.searchParams.get('eventId')
      if (fromUrl && fromUrl.trim()) return fromUrl.trim()
    }
  } catch { }
  try {
    const ls: any = (globalThis as any)?.localStorage
    const ss: any = (globalThis as any)?.sessionStorage
    const candidates = [
      fallback,
      ls?.getItem?.('event_current_id'),
      ss?.getItem?.('event_current_id'),
      ls?.getItem?.('eventId'),
      ss?.getItem?.('eventId'),
      (globalThis as any)?.__EVENT_ID__,
    ].map(v => (v ? String(v).trim() : ''))
    const found = candidates.find(v => v.length > 0)
    return found || null
  } catch {
    return fallback || null
  }
}

/* ===================== Address Autocomplete ===================== */
type AddressInputProps = {
  value: string
  onChange: (next: string) => void
  onCommit?: (val: string) => void
  placeholder?: string
  country?: string
}
function AddressInput({ value, onChange, onCommit, placeholder, country = 'VN' }: AddressInputProps) {
  const t = useECT()
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<{ id: string; label: string }[]>([])
  const [loading, setLoading] = useState(false)
  const debounced = useDebounced(value, 250)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function run() {
      const q = (debounced ?? '').trim()
      if (q.length < 3) { setOptions([]); return }
      setLoading(true)
      try {
        const r = await fetch(`/api/places?q=${encodeURIComponent(q)}&country=${encodeURIComponent(country)}&size=6`)
        const j = await r.json()
        if (!cancelled) setOptions(Array.isArray(j?.items) ? j.items : [])
      } catch {
        if (!cancelled) setOptions([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [debounced, country])

  return (
    <div ref={wrapRef} className="relative w-full">
      <input
        type="text"
        className="border rounded-lg px-2 h-10 w-full bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={value ?? ''}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setTimeout(() => setOpen(false), 100); onCommit?.(value) }}
        placeholder={placeholder}
      />
      {open && (options.length > 0 || loading) && (
        <div className="absolute z-10 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white shadow">
          {loading && <div className="px-3 py-2 text-sm text-gray-500">{t('eventtransport.searching')}</div>}
          {!loading && options.map(opt => (
            <button
              key={opt.id}
              type="button"
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(opt.label); setOpen(false); onCommit?.(opt.label) }}
              title={opt.label}
            >
              {opt.label}
            </button>
          ))}
          {!loading && options.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">{t('eventtransport.no_suggestions')}</div>
          )}
        </div>
      )}
    </div>
  )
}

/* ===================== Tipi locali + signature helpers ===================== */
type UIRow = {
  id: string
  from: string
  to: string
  vehicle: string
  roundTrip: boolean
  notes: string
}
type DBRow = {
  id: string
  from_text: string | null
  to_text: string | null
  vehicle_key: string | null
  round_trip: boolean | null
  notes: string | null
  distance_km: number | null
  eta_minutes: number | null
  cost_per_km: number | null
}

type RowCalc = { km: number; minutes: number } | undefined

const sigDraft = (rows: UIRow[]) => {
  const lines = (rows || []).map(r =>
    `R|${(r.from || '').trim()}|${(r.to || '').trim()}|${(r.vehicle || '').trim()}|${r.roundTrip ? 1 : 0}|${(r.notes || '').replace(/\|/g, '¦')}`
  )
  lines.sort()
  return `${lines.length}|${lines.join('~')}`
}
const sigDB = (rows: DBRow[] | undefined) => {
  const lines = (rows || []).map(r =>
    `R|${(r.from_text || '').trim()}|${(r.to_text || '').trim()}|${(r.vehicle_key || '').trim()}|${(r.round_trip ? 1 : 0)}|${(r.notes || '').replace(/\|/g, '¦')}`
  )
  lines.sort()
  return `${lines.length}|${lines.join('~')}`
}

/* ===================== Component ===================== */
export default function EventTransportCard({ title }: { title?: string }) {
  const t = useECT()
  const titleText = title ?? t('Transportation') // usa chiave di navigazione già presente
  const { eventId: eventIdFromCtx } = useEventCalc()
  const eventId = autoEventId(eventIdFromCtx || null)
  const useDB = !!eventId

  // SETTINGS DAL DB (SOLO LETTURA: markup + vehicle types)
  const ts = useTransportSettings(eventId)
  const dbMarkupX = Number(ts.settings?.markup_x ?? 1) || 1
  const vehicleTypesDB = ts.vehicleTypes

  // GLOBAL DEFAULTS (LS) — usati dal pulsante "adotta globali"
  const { defaults: globalDefaults } = useGlobalTransportDefaults()
  const [adopting, setAdopting] = useState(false)
  const adoptGlobal = useCallback(async () => {
    if (!useDB || adopting) return
    setAdopting(true)
    try {
      const mx = Number(globalDefaults?.markupX ?? 1) || 1
      const items = (globalDefaults?.vehicleTypes || []).map(v => ({
        name: String(v.name || '').trim(),
        cost_per_km: Number(v.cost_per_km) || 0,
      }))
      await ts.setMarkupX(mx)
      await ts.replaceVehicleTypes(items)
      await ts.refresh()
      try { localStorage.setItem('eventcalc.settings.bump', String(Date.now())) } catch { }
    } catch (e) {
      console.warn('[transport] adopt global failed:', (e as any)?.message || e)
    } finally {
      setAdopting(false)
    }
  }, [useDB, adopting, globalDefaults, ts])

  // Cross-tab & focus refresh degli settings
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'eventcalc.settings.bump') {
        try { ts?.refresh?.() } catch { }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [ts])
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === 'visible') {
        try { ts?.refresh?.() } catch { }
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [ts])

  // Hook DB
  const db = useEventTransportRows(useDB ? eventId! : null)

  // ===== Draft locale (nessun write DB fino a "Save") =====
  const [rows, setRows] = useState<UIRow[]>([])
  const hydratedOnceRef = useRef(false)
  const postSaveSilenceRef = useRef(false)

  const mapDbToUi = (r: DBRow): UIRow => ({
    id: r.id,
    from: r.from_text || '',
    to: r.to_text || '',
    vehicle: r.vehicle_key || '',
    roundTrip: !!r.round_trip,
    notes: r.notes || '',
  })

  // Distance calc cache per riga (solo UI; persistiamo su Save)
  const [calcByRow, setCalcByRow] = useState<Record<string, RowCalc>>({})
  const [loadingRow, setLoadingRow] = useState<Record<string, boolean>>({})
  const COUNTRY = 'VN'
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  // Seed immediate di calc da DB/LS quando arrivano righe
  const dbIndexById = useMemo(() => {
    const m = new Map<string, DBRow>()
    for (const r of (db.rows || []) as any[]) m.set(r.id, r as any)
    return m
  }, [db.rows])

  // Re-hydrate draft dalle righe DB (prima volta o quando non siamo dirty)
  const sigDbMemo = useMemo(() => sigDB(db.rows as any), [db.rows])
  const sigDraftMemo = useMemo(() => sigDraft(rows), [rows])

  useEffect(() => {
    function onEventChanged() {
      hydratedOnceRef.current = false
      postSaveSilenceRef.current = false
      setRows([])
      setCalcByRow({})
    }
    window.addEventListener('event:changed', onEventChanged)
    return () => window.removeEventListener('event:changed', onEventChanged)
  }, [])

  useEffect(() => {
    if (!useDB) return
    const dirty = sigDraftMemo !== sigDbMemo
    if (!hydratedOnceRef.current || rows.length === 0) {
      setRows((db.rows || []).map(mapDbToUi))
      hydratedOnceRef.current = true
      return
    }
    if (!dirty) {
      setRows((db.rows || []).map(mapDbToUi))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useDB, sigDbMemo])

  // Seed calcByRow da DB/LS (stale-while-revalidate)
  useEffect(() => {
    const next: Record<string, RowCalc> = { ...calcByRow }
    let changed = false
    for (const r of rows) {
      if (next[r.id] !== undefined) continue
      const dbRow = dbIndexById.get(r.id)
      if (dbRow && (dbRow.distance_km != null || dbRow.eta_minutes != null)) {
        next[r.id] = { km: Number(dbRow.distance_km || 0), minutes: Number(dbRow.eta_minutes || 0) }
        changed = true
        continue
      }
      if (r.from && r.to) {
        const { res } = cacheGet(COUNTRY, r.from, r.to)
        if (res) { next[r.id] = res; changed = true }
      }
    }
    if (changed) setCalcByRow(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, dbIndexById])

  // Revalidate/compute distanza (solo UI, no DB qui)
  const calcKmForRow = useCallback(async (id: string, from: string, to: string) => {
    const f = (from ?? '').trim(); const t = (to ?? '').trim()
    if (!f || !t) return
    const { res, fresh } = cacheGet(COUNTRY, f, t)
    if (res) {
      setCalcByRow(m => (m[id]?.km === res.km && m[id]?.minutes === res.minutes) ? m : { ...m, [id]: res })
    }
    const needsFetch = !res || !fresh || res.km <= 0
    if (!needsFetch) return
    setLoadingRow(m => ({ ...m, [id]: true }))
    try {
      const net = await fetchDistance(COUNTRY, f, t)
      const still = rows.find(rr => rr.id === id)
      if (!mountedRef.current || !still || still.from.trim() !== f || still.to.trim() !== t) return
      setCalcByRow(m => ({ ...m, [id]: net }))
    } catch {
      // ignore
    } finally {
      if (mountedRef.current) setLoadingRow(m => ({ ...m, [id]: false }))
    }
  }, [rows])

  function commitIfReady(rowId: string, overrides?: { from?: string; to?: string }) {
    const row = rows.find(r => r.id === rowId)
    if (!row) return
    const f = overrides?.from ?? row.from
    const t = overrides?.to ?? row.to
    if (f && t) calcKmForRow(rowId, f, t)
  }

  // Dirty bridge
  useEffect(() => {
    if (postSaveSilenceRef.current && sigDraftMemo !== sigDbMemo) return
    if (postSaveSilenceRef.current && sigDraftMemo === sigDbMemo) postSaveSilenceRef.current = false
    const dirty = sigDraftMemo !== sigDbMemo
    try {
      window.dispatchEvent(new CustomEvent('eventcalc:dirty', { detail: { card: 'transport', dirty } }))
    } catch { }
  }, [sigDraftMemo, sigDbMemo])

  // Persistenza su "Save" globale
  useEffect(() => {
    if (!useDB) return
    const onSave = async () => {
      postSaveSilenceRef.current = true
      try {
        const dbMap = new Map((db.rows || []).map((r: any) => [r.id, r as DBRow]))
        const draftMap = new Map(rows.map(r => [r.id, r]))

        // DELETE
        for (const r of (db.rows || []) as any as DBRow[]) {
          if (!draftMap.has(r.id)) {
            try { await db.deleteRow(r.id) } catch (e) { console.error('[transport save] delete', e) }
          }
        }

        // ADD / UPDATE
        for (const r of rows) {
          const existing = dbMap.get(r.id)
          const vt = vehicleTypesDB.find(v => v.id === r.vehicle)
          const calc = calcByRow[r.id]
          const costPerKm = vt ? Number(vt.cost_per_km) : null

          if (!existing || String(r.id).startsWith('tmp:')) {
            try {
              await db.createRow({
                round_trip: !!r.roundTrip,
                markup_x: dbMarkupX,
                from_text: r.from || null,
                to_text: r.to || null,
                vehicle_key: r.vehicle || null,
                notes: r.notes || null,
                cost_per_km: costPerKm,
                distance_km: calc?.km ?? null,
                eta_minutes: calc ? Math.round(calc.minutes) : null,
              } as any)
            } catch (e) { console.error('[transport save] create', e) }
          } else {
            const changed =
              (existing.from_text || '') !== (r.from || '') ||
              (existing.to_text || '') !== (r.to || '') ||
              (existing.vehicle_key || '') !== (r.vehicle || '') ||
              !!existing.round_trip !== !!r.roundTrip ||
              (existing.notes || '') !== (r.notes || '') ||
              (costPerKm != null && Number(existing.cost_per_km || 0) !== Number(costPerKm)) ||
              (calc && (Number(existing.distance_km || 0) !== Number(calc.km || 0) ||
                Number(existing.eta_minutes || 0) !== Math.round(Number(calc.minutes || 0))))
            if (changed) {
              try {
                await db.updateRow(r.id, {
                  from_text: r.from || null,
                  to_text: r.to || null,
                  vehicle_key: r.vehicle || null,
                  round_trip: !!r.roundTrip,
                  notes: r.notes || null,
                  ...(costPerKm != null ? { cost_per_km: costPerKm } : {}),
                  ...(calc ? { distance_km: calc.km, eta_minutes: Math.round(calc.minutes) } : {}),
                } as any)
              } catch (e) { console.error('[transport save] update', e) }
            }
          }
        }
      } catch (e) {
        console.error('[transport save] FAILED', e)
      } finally {
        setTimeout(() => { postSaveSilenceRef.current = false }, 2500)
      }
    }

    window.addEventListener('eventcalc:save', onSave as EventListener)
    return () => window.removeEventListener('eventcalc:save', onSave as EventListener)
  }, [useDB, rows, db.rows, db, vehicleTypesDB, calcByRow, dbMarkupX])

  /* ===================== Azioni UI (solo draft) ===================== */
  const addTrip = useCallback(() => {
    setRows(rs => [
      ...rs,
      { id: `tmp:${uuid()}`, from: '', to: '', vehicle: '', roundTrip: true, notes: '' },
    ])
  }, [])

  const updateRow = useCallback((id: string, patch: Partial<UIRow>) => {
    setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }, [])

  const removeRow = useCallback((id: string) => {
    setRows(rs => rs.filter(r => r.id !== id))
    setCalcByRow(m => { const { [id]: _, ...rest } = m; return rest })
  }, [])

  /* ===================== Totali & Broadcast ===================== */
  const totals = useMemo(() => {
    let totalCost = 0
    for (const row of rows) {
      const calc = calcByRow[row.id]
      const vt = vehicleTypesDB.find(v => v.id === row.vehicle)
      if (!calc || !vt) continue
      const legs = row.roundTrip ? 2 : 1
      totalCost += (calc.km || 0) * (Number(vt.cost_per_km) || 0) * legs
    }
    const totalPrice = totalCost * dbMarkupX
    return { totalCost, totalPrice }
  }, [rows, calcByRow, vehicleTypesDB, dbMarkupX])

  useEffect(() => {
    if (!eventId) return
    const key = `eventcalc.transport.totals:${eventId}`
    const cost = Number(totals.totalCost || 0)
    const price = Number(totals.totalPrice || 0)
    try {
      localStorage.setItem(key, JSON.stringify({ cost, price }))
    } catch { }
    try {
      window.dispatchEvent(new CustomEvent('transport:totals', { detail: { eventId, cost, price } }))
    } catch { }
  }, [eventId, totals.totalCost, totals.totalPrice])

  const loading = useDB ? (db.loading || ts.loading) : false

  /* ===================== Render ===================== */
  return (
    <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{titleText}</h2>
          <span className="text-sm text-gray-500">({rows.length})</span>
        </div>

        <div className="flex items-center gap-3">
          {/* BADGE: markup read-only dal DB */}
          <span className="inline-flex items-center h-9 rounded-lg border border-gray-300 px-2 text-sm text-gray-700 bg-white">
            {t('eventstaff.markup')} <b className="ml-1">×{dbMarkupX.toFixed(2).replace(/\.?0+$/, '')}</b>
          </span>

          {/* ICON BUTTON: adopt global settings */}
          <button
            type="button"
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            title={t('eventstaff.adopt_global')}
            onClick={adoptGlobal}
            disabled={loading || !useDB || adopting}
            aria-label={t('eventstaff.adopt_global')}
          >
            <ArrowPathIcon className={`w-5 h-5 ${adopting ? 'animate-spin' : ''}`} />
          </button>

          <button
            className="px-3 h-9 rounded bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99] transition disabled:opacity-60"
            onClick={addTrip}
            disabled={loading || !useDB}
            title={t('eventtransport.add_row_title')}
          >
            <span className="inline-flex items-center gap-2">
              <PlusIcon className="w-4 h-4" />
              {t('eventtransport.add')}
            </span>
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {rows.length === 0 && !loading && (
          <div className="text-sm text-gray-500 px-1 py-4">
            {t('eventtransport.empty')}
          </div>
        )}

        {rows.map(row => {
          const calc = calcByRow[row.id]
          const isLoading = !!loadingRow[row.id]
          const vt = vehicleTypesDB.find(v => v.id === row.vehicle)
          const legs = row.roundTrip ? 2 : 1
          const cost = vt && calc ? (calc.km || 0) * (Number(vt.cost_per_km) || 0) * legs : 0
          const price = cost * dbMarkupX

          return (
            <div key={row.id} className="border border-gray-200 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-gray-500">{t('eventtransport.trip')}</span>
                <div className="inline-flex items-center gap-2 border rounded-lg px-2 h-9" role="group" aria-label={t('eventtransport.aria.trip_type')}>
                  <button
                    type="button"
                    className={`px-2 h-7 rounded ${!row.roundTrip ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}
                    onClick={() => updateRow(row.id, { roundTrip: false })}
                    onFocus={() => commitIfReady(row.id)}
                    title={t('eventtransport.trip.oneway')}
                  >
                    {t('eventtransport.trip.oneway')}
                  </button>
                  <button
                    type="button"
                    className={`px-2 h-7 rounded ${row.roundTrip ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}
                    onClick={() => updateRow(row.id, { roundTrip: true })}
                    onFocus={() => commitIfReady(row.id)}
                    title={t('eventtransport.trip.roundtrip')}
                  >
                    {t('eventtransport.trip.roundtrip')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr,260px,1fr] gap-3 items-stretch">
                <div className="space-y-2">
                  <div className="flex flex-col">
                    <label className="text-xs text-gray-500 mb-1">{t('eventtransport.col.from')}</label>
                    <AddressInput
                      value={row.from ?? ''}
                      onChange={v => updateRow(row.id, { from: v })}
                      onCommit={val => commitIfReady(row.id, { from: val })}
                      placeholder={t('eventtransport.ph.from')}
                      country="VN"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-gray-500 mb-1">{t('eventtransport.col.to')}</label>
                    <AddressInput
                      value={row.to ?? ''}
                      onChange={v => updateRow(row.id, { to: v })}
                      onCommit={val => commitIfReady(row.id, { to: val })}
                      placeholder={t('eventtransport.ph.to')}
                      country="VN"
                    />
                  </div>
                </div>

                <div className="flex flex-col justify-start h-full gap-2">
                  <div className="flex flex-col">
                    <label className="text-xs text-gray-500 mb-1">{t('eventtransport.col.vehicle')}</label>
                    <select
                      className="border rounded-lg px-2 h-10 w-full bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={row.vehicle ?? ''}
                      onChange={e => {
                        const vId = e.target.value
                        updateRow(row.id, { vehicle: vId })
                        commitIfReady(row.id)
                      }}
                      onFocus={() => commitIfReady(row.id)}
                    >
                      <option value="">{vehicleTypesDB.length ? t('eventtransport.select_vehicle') : t('eventtransport.no_vehicles_yet')}</option>
                      {vehicleTypesDB.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.name} — {v.cost_per_km}{t('eventtransport.per_km_suffix')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{t('eventtransport.col.distance_eta')}</span>
                      <div className="h-9 w-48 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center font-medium">
                        {isLoading
                          ? '…'
                          : (typeof calc?.km === 'number' && typeof calc?.minutes === 'number')
                            ? `${Number(calc.km.toFixed(2))} ${t('eventtransport.km_unit')} · ${Math.round(calc.minutes)} ${t('eventtransport.min_unit')}`
                            : '—'}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{t('eventstaff.col.cost')}</span>
                      <div className="h-9 w-24 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center font-semibold">
                        {fmt(cost)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{t('eventstaff.col.price')}</span>
                      <div className="h-9 w-24 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center font-semibold">
                        {fmt(price)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col h-full">
                    <label className="text-xs text-gray-500 mb-1">{t('eventtransport.col.notes')}</label>
                    <textarea
                      rows={4}
                      className="border rounded-lg px-2 py-2 w-full bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y min-h-[96px] max-h-64"
                      value={row.notes}
                      onChange={e => updateRow(row.id, { notes: e.target.value })}
                      onBlur={() => commitIfReady(row.id)}
                      placeholder={t('eventtransport.ph.notes')}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  className="p-2 rounded text-red-600 hover:text-red-500 hover:bg-red-50"
                  onClick={() => removeRow(row.id)} title={t('eventtransport.remove_title')}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        })}

        <div className="border-t border-gray-200 pt-3 flex flex-wrap items-center justify-end gap-6">
          <div className="text-sm text-gray-600">{t('eventstaff.totals')}</div>
          <div className="text-sm"><span className="text-gray-600 mr-1">{t('eventstaff.col.cost')}:</span><span className="font-semibold">{fmt(totals.totalCost)}</span></div>
          <div className="text-sm"><span className="text-gray-600 mr-1">{t('eventstaff.col.price')}:</span><span className="font-semibold">{fmt(totals.totalPrice)}</span></div>
        </div>
      </div>
    </div>
  )
}