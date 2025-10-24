// src/app/catering/_cards/EventStaffCard.tsx
'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PlusIcon, TrashIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { useEventCalc } from '@/app/catering/_state/EventCalcProvider'
import { useStaffRows } from '@/app/catering/_data/useEventStaffRows'
import useStaffSettings from '@/app/catering/_data/useEventStaffSettings' // ← markup da DB
import { calcStaffLine, calcStaffTotals } from '@/app/catering/_settings/staffPricing'
import { emitCalcTick } from '@/app/catering/_data/useCalcBus'
import { usePathname, useSearchParams } from 'next/navigation' // 👈 NEW
import { useECT } from '@/app/catering/_i18n' // 👈 NEW

type Id = string

/* ───────── utils numerici ───────── */
function toNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = typeof v === 'string' ? Number(v.replace(/\s+/g, '')) : Number(v)
  return Number.isFinite(n) ? n : 0
}
function clampPos(n: number) { return n < 0 ? 0 : n }
const round0 = (n: number) => Math.round(Number.isFinite(n) ? n : 0)

/* ───────── eventId fallback (Provider → LS draft) ───────── */
function uuid(): string {
  try {
    // @ts-ignore
    if (globalThis?.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch {}
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}
function useEventIdFromCtxOrDraft() {
  const ctx = useEventCalc()
  const fromCtx = (ctx as any)?.eventId || (ctx as any)?.draftEventId || ''
  const [eid, setEid] = useState<string>(fromCtx || '')
  useEffect(() => {
    if (fromCtx) { setEid(fromCtx); return }
    const k = 'eventcalc.draftEventId'
    const existing = typeof window !== 'undefined' ? localStorage.getItem(k) : null
    if (existing) setEid(existing)
    else {
      const v = uuid()
      try { localStorage.setItem(k, v) } catch {}
      setEid(v)
    }
  }, [fromCtx])
  return eid
}

/* ───────── fmt SOLO per celle finali ───────── */
const fmt = (n: number | null | undefined) => {
  if (n == null || Number.isNaN(n)) return '-'
  try { return new Intl.NumberFormat('en-US').format(Math.round(n)) } catch { return String(Math.round(n ?? 0)) }
}

/* ───────── emit staff totals (LS + event) ───────── */
function emitStaffTotals(eventId: string | undefined, rows: Array<{ cost_per_hour: number; hours: number }>, markupX: number) {
  const cost = round0(rows.reduce((a, r) => a + (Number(r.cost_per_hour || 0) * Number(r.hours || 0)), 0))
  const price = round0(cost * (Number(markupX || 1)))
  const keyC = `eventcalc.staff.cost:${eventId || ''}`
  const keyP = `eventcalc.staff.price:${eventId || ''}`
  try {
    localStorage.setItem(keyC, String(cost))
    localStorage.setItem(keyP, String(price))
    window.dispatchEvent(new CustomEvent('staff:totals', { detail: { eventId, cost, price } }))
  } catch {}
}

/* ───────── signature helpers (per dirty bridge) ───────── */
function sigDraft(rows: StaffRowUI[]) {
  const lines = (rows || []).map(r =>
    `R|${(r.name || '').trim()}|${(r.role || '').trim()}|${Number(r.cost_per_hour || 0)}|${Number(r.hours || 0)}|${(r.notes || '').replace(/\|/g, '¦')}`
  )
  lines.sort()
  return `${lines.length}|${lines.join('~')}`
}
function sigDB(rows: StaffRowDB[] | undefined) {
  const lines = (rows || []).map(r =>
    `R|${(r.name || '').trim()}|${(r.role || '').trim()}|${Number(r.cost_per_hour || 0)}|${Number(r.hours || 0)}|${(r.notes || '').replace(/\|/g, '¦')}`
  )
  lines.sort()
  return `${lines.length}|${lines.join('~')}`
}

/* ───────── tipi locali ───────── */
type StaffRowDB = {
  id: string
  name: string
  role: string
  cost_per_hour: number
  hours: number
  notes: string | null
}
type StaffRowUI = {
  id: string // può essere tmp:...
  name: string
  role: string
  cost_per_hour: number
  hours: number
  notes: string
}

/* ───────── GLOBAL STAFF DEFAULTS (LS) ───────── */
const STAFF_GLOBAL_LS_KEY = 'eventcalc.global.staff.defaults'
function readGlobalStaffMarkup(): number {
  try {
    const raw = localStorage.getItem(STAFF_GLOBAL_LS_KEY)
    if (!raw) return 1
    const obj = JSON.parse(raw)
    const v = typeof obj?.markupX === 'number' ? obj.markupX : Number(obj?.markupX)
    return Number.isFinite(v) && v > 0 ? v : 1
  } catch {
    return 1
  }
}

/* ───────── Component ───────── */
export default function EventStaffCard({ title }: { title?: string }) {
  const t = useECT() // 👈 i18n
  const titleText = title ?? t('eventstaff.title')
  const eventId = useEventIdFromCtxOrDraft()

  // Righe staff (DB)
  const { rows: dbRows, create, update, remove } = useStaffRows(eventId)

  // Markup da DB (SOLA LETTURA) — gestito in Event Settings
  const ss = useStaffSettings(eventId)
  const markup = Number(ss.settings?.markup_x ?? 1) || 1

  // Pulsante "adotta globali"
  const [adopting, setAdopting] = useState(false)
  const adoptGlobal = useCallback(async () => {
    if (!eventId || adopting) return
    setAdopting(true)
    try {
      const mx = readGlobalStaffMarkup()
      await ss.setMarkupX(mx)
      await ss.refresh()
      try { localStorage.setItem('eventcalc.settings.bump', String(Date.now())) } catch {}
    } catch (e) {
      console.warn('[staff] adopt global failed:', (e as any)?.message || e)
    } finally {
      setAdopting(false)
    }
  }, [eventId, adopting, ss])

  // Cross tab sync: bump da Event Settings
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'eventcalc.settings.bump') {
        try { ss?.refresh?.() } catch {}
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [ss])

  // Rientro tab
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === 'visible') {
        try { ss?.refresh?.() } catch {}
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [ss])

  // ===== Draft locale (niente write DB live) =====
  const [rows, setRows] = useState<StaffRowUI[]>([])
  const hydratedOnceRef = useRef(false)

  const mapDbToUi = (r: StaffRowDB): StaffRowUI => ({
    id: r.id,
    name: r.name || '',
    role: r.role || '',
    cost_per_hour: Number(r.cost_per_hour || 0),
    hours: Number(r.hours || 0),
    notes: r.notes || '',
  })

  const postSaveSilenceRef = useRef(false)
  const sigDbMemo = useMemo(() => sigDB(dbRows), [dbRows])
  const sigDraftMemo = useMemo(() => sigDraft(rows), [rows])

  // Reset quando cambia evento / quando il provider dice "saved"
  useEffect(() => {
    const onSaved = () => { postSaveSilenceRef.current = false }
    const onEventChanged = () => {
      postSaveSilenceRef.current = false
      hydratedOnceRef.current = false
      setRows([])
    }
    window.addEventListener('eventcalc:saved', onSaved as EventListener)
    window.addEventListener('event:changed', onEventChanged as EventListener)
    return () => {
      window.removeEventListener('eventcalc:saved', onSaved as EventListener)
      window.removeEventListener('event:changed', onEventChanged as EventListener)
    }
  }, [])

  // Hydrate draft da DB
  useEffect(() => {
    if (!dbRows) return
    const dirty = sigDraftMemo !== sigDbMemo
    if (!hydratedOnceRef.current || rows.length === 0) {
      setRows(dbRows.map(mapDbToUi))
      hydratedOnceRef.current = true
      return
    }
    if (!dirty) {
      setRows(dbRows.map(mapDbToUi))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigDbMemo])

  // 👇 discard AUTOMATICO quando cambi pagina / scheda / query string
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const routeKey = useMemo(() => `${pathname}?${searchParams?.toString() || ''}`, [pathname, searchParams])

  const discardToDB = useCallback(() => {
    try {
      setRows((dbRows || []).map(mapDbToUi))
      hydratedOnceRef.current = true
      postSaveSilenceRef.current = false
    } catch {}
  }, [dbRows])

  useEffect(() => {
    if (sigDraftMemo !== sigDbMemo) {
      discardToDB()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  // Emit totals (UI immediato) + calc tick
  useEffect(() => {
    emitStaffTotals(eventId, rows.map(r => ({ cost_per_hour: r.cost_per_hour, hours: r.hours })), markup)
    emitCalcTick()
  }, [rows, markup, eventId])

  // Dirty bridge
  useEffect(() => {
    if (postSaveSilenceRef.current && sigDraftMemo !== sigDbMemo) return
    if (postSaveSilenceRef.current && sigDraftMemo === sigDbMemo) postSaveSilenceRef.current = false
    const dirty = sigDraftMemo !== sigDbMemo
    try {
      window.dispatchEvent(new CustomEvent('eventcalc:dirty', { detail: { card: 'staff', dirty } }))
    } catch {}
  }, [sigDraftMemo, sigDbMemo])

  // Persistenza su "Save" globale
  useEffect(() => {
    const onSave = async () => {
      postSaveSilenceRef.current = true
      try {
        const dbMap = new Map((dbRows || []).map(r => [r.id, r]))
        const draftMap = new Map(rows.map(r => [r.id, r]))

        // DELETE
        for (const r of (dbRows || [])) {
          if (!draftMap.has(r.id)) {
            try { await remove(r.id) } catch (e) { console.error('[staff save] remove', e) }
          }
        }

        // ADD / UPDATE
        for (const r of rows) {
          const existing = dbMap.get(r.id)
          if (!existing || String(r.id).startsWith('tmp:')) {
            try {
              await create({
                name: r.name || '',
                role: r.role || '',
                cost_per_hour: Number(r.cost_per_hour || 0),
                hours: Number(r.hours || 0),
                notes: r.notes || '',
              })
            } catch (e) { console.error('[staff save] create', e) }
          } else {
            const changed =
              (existing.name || '') !== (r.name || '') ||
              (existing.role || '') !== (r.role || '') ||
              Number(existing.cost_per_hour || 0) !== Number(r.cost_per_hour || 0) ||
              Number(existing.hours || 0) !== Number(r.hours || 0) ||
              (existing.notes || '') !== (r.notes || '')
            if (changed) {
              try {
                await update(r.id, {
                  name: r.name || '',
                  role: r.role || '',
                  cost_per_hour: Number(r.cost_per_hour || 0),
                  hours: Number(r.hours || 0),
                  notes: r.notes || '',
                })
              } catch (e) { console.error('[staff save] update', e) }
            }
          }
        }
      } catch (e) {
        console.error('[staff save] FAILED', e)
      } finally {
        setTimeout(() => { postSaveSilenceRef.current = false }, 2500)
      }
    }

    window.addEventListener('eventcalc:save', onSave as EventListener)
    return () => window.removeEventListener('eventcalc:save', onSave as EventListener)
  }, [rows, dbRows, create, update, remove])

  /* ───────── calcoli UI ───────── */
  const computed = useMemo(() => {
    return rows.map(r => ({
      id: r.id,
      ...calcStaffLine({ cost_per_hour: r.cost_per_hour, hours: r.hours, markup_x: markup }),
    }))
  }, [rows, markup])

  const totalsWithPrice = useMemo(
    () => calcStaffTotals(rows.map(r => ({ cost_per_hour: r.cost_per_hour, hours: r.hours })), markup),
    [rows, markup]
  )

  const costTotalDraft = useMemo(
    () => round0(rows.reduce((a, r) => a + Number(r.cost_per_hour || 0) * Number(r.hours || 0), 0)),
    [rows]
  )

  /* ───────── azioni (SOLO LOCALE, no DB fino a Save) ───────── */
  const onAdd = useCallback(() => {
    setRows(rs => [...rs, { id: `tmp:${uuid()}`, name: '', role: '', cost_per_hour: 0, hours: 1, notes: '' }])
  }, [])

  const onChangeField = useCallback(
    (id: Id, field: 'name' | 'role' | 'cost_per_hour' | 'hours' | 'notes', value: string) => {
      setRows(rs => rs.map(r => {
        if (r.id !== id) return r
        if (field === 'cost_per_hour') return { ...r, cost_per_hour: clampPos(toNum(value)) }
        if (field === 'hours') return { ...r, hours: clampPos(toNum(value)) }
        if (field === 'name') return { ...r, name: value }
        if (field === 'role') return { ...r, role: value }
        return { ...r, notes: value }
      }))
    },
    []
  )

  const onRemove = useCallback((id: Id) => {
    setRows(rs => rs.filter(r => r.id !== id))
  }, [])

  return (
    <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{titleText}</h2>
          <span className="text-sm text-gray-500">({rows.length})</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center h-9 rounded-lg border border-gray-300 px-2 text-sm text-gray-700 bg-white">
            {t('eventstaff.markup')} <b className="ml-1">×{markup.toFixed(2).replace(/\.?0+$/,'')}</b>
          </span>

          {/* ICON BUTTON: adopt global settings */}
          <button
            type="button"
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            title={t('eventstaff.adopt_global')}
            onClick={adoptGlobal}
            disabled={!eventId || adopting}
            aria-label={t('eventstaff.adopt_global')}
          >
            <ArrowPathIcon className={`w-5 h-5 ${adopting ? 'animate-spin' : ''}`} />
          </button>

          <button
            className="px-3 h-9 rounded bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99] transition disabled:opacity-60"
            onClick={onAdd}
            title={t('eventstaff.add_row_title')}
            disabled={!eventId}
          >
            <span className="inline-flex items-center gap-2">
              <PlusIcon className="w-4 h-4" />
              {t('eventstaff.add')}
            </span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 text-gray-800">
                <th className="text-left px-3 py-2">{t('eventstaff.col.name')}</th>
                <th className="text-left px-3 py-2">{t('eventstaff.col.role')}</th>
                <th className="text-right px-3 py-2 min-w-[96px]">{t('eventstaff.col.cost_per_hour')}</th>
                <th className="text-right px-3 py-2 min-w-[96px]">{t('eventstaff.col.hours')}</th>
                <th className="text-center px-3 py-2 min-w-[120px]">{t('eventstaff.col.cost')}</th>
                <th className="text-center px-3 py-2 min-w-[120px]">{t('eventstaff.col.price')}</th>
                <th className="px-3 py-2 min-w-[72px]"></th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r, idx) => {
                const line = computed[idx]
                const rowCost = line?.cost ?? 0
                const rowPrice = line?.price ?? 0
                return (
                  <tr key={r.id} className="border-b border-gray-100 align-top">
                    {/* Name */}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        className="border rounded-lg px-2 h-10 w-[240px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={r.name}
                        onChange={e => onChangeField(r.id, 'name', e.target.value)}
                        placeholder={t('eventstaff.ph.name')}
                      />
                    </td>

                    {/* Role */}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        className="border rounded-lg px-2 h-10 w-[220px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={r.role}
                        onChange={e => onChangeField(r.id, 'role', e.target.value)}
                        placeholder={t('eventstaff.ph.role')}
                      />
                    </td>

                    {/* Cost per hour — step 1000 */}
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step={1000}
                        min={0}
                        inputMode="numeric"
                        className="border rounded-lg px-2 h-10 w-24 text-right bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={String(r.cost_per_hour)}
                        onChange={e => onChangeField(r.id, 'cost_per_hour', e.target.value)}
                        placeholder="0"
                        aria-label={t('eventstaff.aria.cost_per_hour')}
                        title={t('eventstaff.hint.step_thousand')}
                      />
                    </td>

                    {/* Hours — step 0.5 */}
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step={0.5}
                        min={0}
                        inputMode="decimal"
                        className="border rounded-lg px-2 h-10 w-24 text-right bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={String(r.hours)}
                        onChange={e => onChangeField(r.id, 'hours', e.target.value)}
                        placeholder="0"
                        aria-label={t('eventstaff.aria.hours')}
                        title={t('eventstaff.hint.step_half')}
                      />
                    </td>

                    {/* Totals */}
                    <td className="px-3 py-2 text-center min-w-[120px]">
                      <div className="h-10 w-24 mx-auto flex items-center justify-center font-medium">
                        {fmt(rowCost)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center min-w-[120px]">
                      <div className="h-10 w-24 mx-auto flex items-center justify-center font-medium">
                        {fmt(rowPrice)}
                      </div>
                    </td>

                    {/* Remove */}
                    <td className="px-3 py-2">
                      <div className="h-10 w-full flex items-center justify-center">
                        <button
                          className="p-2 rounded text-red-600 hover:text-red-500 hover:bg-red-50"
                          onClick={() => onRemove(r.id)}
                          title={t('eventstaff.remove_title')}
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
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-right pr-2 opacity-70">{t('eventstaff.totals')}</td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-center">
                  <div className="h-10 w-24 mx-auto flex items-center justify-center font-semibold">
                    {fmt(costTotalDraft)}
                  </div>
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="h-10 w-24 mx-auto flex items-center justify-center font-semibold">
                    {fmt(totalsWithPrice.priceTotal)}
                  </div>
                </td>
                <td className="px-3 py-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}