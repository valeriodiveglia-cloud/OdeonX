// src/app/catering/_cards/EventEquipmentCard.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { TrashIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useEventCalc } from '@/app/catering/_state/EventCalcProvider'
import { useEventEquipmentRows } from '@/app/catering/_data/useEventEquipmentRows'
import useEquipment from '@/app/catering/_data/useEventEquipment'
import { useECT } from '@/app/catering/_i18n'

type Id = string

type EqRow = {
  id: string
  category_id: number | null // UI-only filter
  equipment_id: Id | ''
  qty: number
  notes: string
}

/* ───────── utils ───────── */
function fmt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '-'
  try { return new Intl.NumberFormat('en-US').format(n) } catch { return String(n) }
}
function parseIntLoose(s: string): number {
  const digits = String(s ?? '').replace(/\D+/g, '')
  if (!digits) return 0
  const n = Number(digits)
  return Number.isFinite(n) ? n : 0
}
function clampPos(n: number) { return Number.isFinite(n) ? Math.max(0, n) : 0 }
const tmpId = () => `tmp:${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
function deepClone<T>(x: T): T { return JSON.parse(JSON.stringify(x)) }

/** Confronta contenuti persistenti (ignora ID e category_id UI) */
function signatureOfDraft(rows: EqRow[]) {
  const lines = (rows || []).map(r =>
    `R|${r.equipment_id || ''}|${Number(r.qty || 0)}|${(r.notes || '').replace(/\|/g, '¦')}`
  )
  lines.sort()
  return `${lines.length}|${lines.join('~')}`
}
function signatureOfDB(dbRows: Array<{ id: string; equipment_id: Id | null; qty: number | null; notes: string | null }>) {
  const lines = (dbRows || []).map(r =>
    `R|${r.equipment_id || ''}|${Number(r.qty || 0)}|${(r.notes || '').replace(/\|/g, '¦')}`
  )
  lines.sort()
  return `${lines.length}|${lines.join('~')}`
}

/* ───────── Component ───────── */
export default function EventEquipmentCard({ title }: { title?: string }) {
  const t = useECT()
  const ANY = t('equipment.any')

  const ctx = useEventCalc?.() as any
  const eventId: string | null = useMemo(() => {
    const fromCtx = ctx?.eventId ?? null
    if (fromCtx) return String(fromCtx)
    if (typeof window !== 'undefined') {
      const fromLS = window.localStorage.getItem('eventcalc.draftEventId')
      return fromLS || null
    }
    return null
  }, [ctx])

  // Equipment master data (centralized hook)
  const { equipment, categories, loading: eqLoading, error: eqError, refresh } = useEquipment()

  // Persisted event rows (DB)
  const {
    rows: dbRows,
    error: rowsError,
    createRow, updateRow, deleteRow,
  } = useEventEquipmentRows(eventId)

  // ===== Draft (local only, no live writes) =====
  const [rows, setRows] = useState<EqRow[]>([])
  const hydratedOnceRef = useRef(false)

  const mapDbToUi = (r: { id: string; equipment_id: Id | null; qty: number | null; notes: string | null }): EqRow => ({
    id: r.id,
    category_id: null,
    equipment_id: r.equipment_id ?? '',
    qty: Number(r.qty ?? 1),
    notes: r.notes ?? '',
  })

  const sigDB = useMemo(() => signatureOfDB(dbRows || []), [dbRows])
  const sigDraft = useMemo(() => signatureOfDraft(rows), [rows])

  // Post-save "silence" window to avoid transient dirty flicker while server rehydrates
  const postSaveSilenceRef = useRef(false)
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

  // Hydrate draft from DB:
  // - first time
  // - whenever server signature changes AND we're not dirty
  useEffect(() => {
    if (!dbRows) return
    const dirty = sigDraft !== sigDB
    if (!hydratedOnceRef.current || rows.length === 0) {
      setRows(dbRows.map(mapDbToUi))
      hydratedOnceRef.current = true
      return
    }
    if (!dirty) {
      setRows(dbRows.map(mapDbToUi))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigDB])

  // Equipment index for lookups
  const equipmentMap = useMemo(() => new Map(equipment.map(e => [e.id, e])), [equipment])
  const dbRowMap = useMemo(() => new Map((dbRows || []).map((r: any) => [r.id, r])), [dbRows])

  // Totali UI (footer di card): PRICE = final_price (fallback cost) × qty
  const totalsUI = useMemo(() => {
    let price = 0
    for (const r of rows) {
      const it = r.equipment_id ? equipmentMap.get(r.equipment_id) : undefined
      const unit = (it?.final_price ?? it?.cost ?? 0)
      price += unit * (r.qty || 0)
    }
    return { price }
  }, [rows, equipmentMap])

  // Totali per broadcast (allineati con EventTotalsCard: cost = cost, price = markup/override o final_price)
  const totalsForBroadcast = useMemo(() => {
    let cost = 0
    let price = 0
    for (const r of rows) {
      const db = dbRowMap.get(r.id) as any | undefined
      const eqId = r.equipment_id || db?.equipment_id || ''
      const it = eqId ? equipmentMap.get(eqId) : undefined

      const qty = Number(r.qty ?? db?.qty ?? 0) || 0

      // unit cost (override -> catalog cost -> 0)
      const unitCostOverride = db?.unit_cost_override
      const unitCost = unitCostOverride != null && Number.isFinite(Number(unitCostOverride))
        ? Number(unitCostOverride)
        : Number(it?.cost ?? 0)

      // unit price (markup override -> final_price -> unitCost)
      const markupX = db?.markup_x_override
      const unitPrice =
        (markupX != null && Number.isFinite(Number(markupX))) ? unitCost * Number(markupX)
        : (Number(it?.final_price ?? 0) || unitCost)

      cost  += qty * unitCost
      price += qty * unitPrice
    }
    return { cost, price }
  }, [rows, equipmentMap, dbRowMap])

  // Broadcast live totals -> LS + evento
  useEffect(() => {
    const key = `eventcalc.equipment.totals:${eventId || ''}`
    try { localStorage.setItem(key, JSON.stringify(totalsForBroadcast)) } catch {}
    try {
      window.dispatchEvent(new CustomEvent('equipment:totals', {
        detail: { eventId: eventId || null, ...totalsForBroadcast }
      }))
    } catch {}
  }, [totalsForBroadcast, eventId])

  // Dirty bridge (emit only when not in post-save silence)
  useEffect(() => {
    if (postSaveSilenceRef.current && sigDraft !== sigDB) return
    if (postSaveSilenceRef.current && sigDraft === sigDB) postSaveSilenceRef.current = false
    const dirty = sigDraft !== sigDB
    try {
      window.dispatchEvent(new CustomEvent('eventcalc:dirty', { detail: { card: 'equipment', dirty } }))
    } catch {}
  }, [sigDraft, sigDB])

  // Persist draft on global save command
  useEffect(() => {
    const onSave = async () => {
      // silenzia i dispatch dirty finché il server non rientra
      postSaveSilenceRef.current = true
      try {
        // Diff + commit
        const dbMap = new Map((dbRows || []).map(r => [r.id, r]))
        const draftMap = new Map(rows.map(r => [r.id, r]))

        // DELETE rows presenti su DB ma non nella bozza
        for (const r of (dbRows || [])) {
          if (!draftMap.has(r.id)) {
            try { await deleteRow(r.id) } catch (e) { console.error('[equipment save] deleteRow', e) }
          }
        }

        // ADD / UPDATE draft rows
        for (const r of rows) {
          const existing = dbMap.get(r.id)
          if (!existing || String(r.id).startsWith('tmp:')) {
            // create
            try {
              await createRow({
                equipment_id: r.equipment_id || null,
                qty: Number(r.qty || 0),
                notes: r.notes || null,
              })
            } catch (e) { console.error('[equipment save] createRow', e) }
          } else {
            // update if changed
            const changed =
              String(existing.equipment_id || '') !== String(r.equipment_id || '') ||
              Number(existing.qty || 0) !== Number(r.qty || 0) ||
              String(existing.notes || '') !== String(r.notes || '')
            if (changed) {
              try {
                await updateRow(r.id, {
                  equipment_id: r.equipment_id || null,
                  qty: Number(r.qty || 0),
                  notes: r.notes || null,
                })
              } catch (e) { console.error('[equipment save] updateRow', e) }
            }
          }
        }
      } catch (e) {
        console.error('[equipment save] FAILED', e)
      } finally {
        // non resetto lo stato locale: l’hydrate rientra quando i dati server coincidono con la signature
        // failsafe anti-flicker
        setTimeout(() => { postSaveSilenceRef.current = false }, 2500)
      }
    }

    window.addEventListener('eventcalc:save', onSave as EventListener)
    return () => window.removeEventListener('eventcalc:save', onSave as EventListener)
  }, [rows, dbRows, createRow, updateRow, deleteRow])

  // Row ops — LOCAL ONLY (no DB writes until Save)
  function addRow() {
    setRows(rs => [...rs, { id: tmpId(), category_id: null, equipment_id: '', qty: 1, notes: '' }])
    // opzionale: refresh catalog per avere opzioni aggiornate
    try { refresh() } catch {}
  }
  function removeRow(id: string) {
    setRows(rs => rs.filter(r => r.id !== id))
  }
  function setCategory(rowId: string, catValue: string) {
    const nextCat: number | null = catValue === '' ? null : Number(catValue)
    setRows(rs => rs.map(r => (r.id === rowId ? { ...r, category_id: nextCat } : r)))
  }
  function setItem(rowId: string, equipmentId: string) {
    setRows(rs => rs.map(r => (r.id === rowId ? { ...r, equipment_id: equipmentId } : r)))
  }
  function setQty(rowId: string, qtyStr: string) {
    const qtyParsed = clampPos(parseIntLoose(qtyStr))
    setRows(rs => rs.map(r => (r.id === rowId ? { ...r, qty: qtyParsed } : r)))
  }
  function setNotes(rowId: string, notes: string) {
    setRows(rs => rs.map(r => (r.id === rowId ? { ...r, notes } : r)))
  }

  const addDisabled = !eventId || (eqLoading && equipment.length === 0)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{title ?? t('equipment.title')}</h2>
          {!eventId && (
            <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-900">
              {t('equipment.badge_no_event')}
            </span>
          )}
          {(rowsError || eqError) && (
            <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-700">
              {rowsError || eqError}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            className="px-3 h-9 rounded bg-blue-600 text-white disabled:opacity-50"
            onClick={() => addRow()}
            disabled={addDisabled}
            title={
              !eventId
                ? t('equipment.need_event_id')
                : (eqLoading && equipment.length === 0 ? t('equipment.loading') : t('equipment.add_row_title'))
            }
          >
            {eqLoading ? (
              t('equipment.loading')
            ) : (
              <span className="inline-flex items-center gap-2">
                <PlusIcon className="w-4 h-4" />
                {t('equipment.add')}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 text-gray-800">
                <th className="text-left px-3 py-2">{t('equipment.col.item')}</th>
                <th className="text-left px-3 py-2">{t('equipment.col.category')}</th>
                <th className="text-right px-3 py-2 min-w-[96px]">{t('equipment.col.qty')}</th>
                <th className="text-center px-3 py-2 min-w-[120px]">{t('equipment.col.unit_price')}</th>
                <th className="text-center px-3 py-2 min-w-[120px]">{t('equipment.col.total')}</th>
                <th className="text-left px-3 py-2">{t('equipment.col.notes')}</th>
                <th className="px-3 py-2 min-w-[72px]"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const item = r.equipment_id ? equipmentMap.get(r.equipment_id) : undefined
                const unitPrice = item ? (item.final_price ?? item.cost ?? 0) : 0
                const lineTotal = unitPrice * (r.qty || 0)

                const itemOptions = r.category_id == null
                  ? equipment
                  : equipment.filter(e => (e.category_id ?? null) === r.category_id)

                return (
                  <tr key={r.id} className="border-b border-gray-100 align-top">
                    {/* Item */}
                    <td className="px-3 py-2">
                      <select
                        className="border rounded-lg px-2 h-10 w-[260px] bg-white"
                        value={r.equipment_id}
                        onChange={e => setItem(r.id, e.target.value as Id)}
                        disabled={!eventId}
                      >
                        <option value="">{eqLoading ? t('equipment.loading') : '-'}</option>
                        {itemOptions.map(it => (
                          <option key={it.id} value={it.id}>
                            {it.name}{it.category_name ? ` (${it.category_name})` : ''}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Category */}
                    <td className="px-3 py-2">
                      <select
                        className="border rounded-lg px-2 h-10 min-w-[180px] bg-white"
                        value={r.category_id == null ? '' : String(r.category_id)}
                        onChange={e => setCategory(r.id, e.target.value)}
                      >
                        <option value="">{ANY}</option>
                        {categories.map(c => (
                          <option key={c.id} value={String(c.id)}>{c.name}</option>
                        ))}
                      </select>
                    </td>

                    {/* Qty — spinner arrows, step = 1 */}
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step={1}
                        min={0}
                        inputMode="numeric"
                        className="border rounded-lg px-2 h-10 w-24 text-right bg-white"
                        value={String(r.qty)}
                        onChange={e => setQty(r.id, e.target.value)}
                        disabled={!eventId}
                        aria-label={t('equipment.qty_aria')}
                      />
                    </td>

                    {/* Unit price */}
                    <td className="px-3 py-2 text-center min-w-[120px]">
                      <div className="h-10 w-24 mx-auto flex items-center justify-center font-medium">
                        {fmt(unitPrice)}
                      </div>
                    </td>

                    {/* Line total */}
                    <td className="px-3 py-2 text-center min-w-[120px]">
                      <div className="h-10 w-24 mx-auto flex items-center justify-center font-medium">
                        {fmt(lineTotal)}
                      </div>
                    </td>

                    {/* Notes */}
                    <td className="px-3 py-2">
                      <input
                        className="border rounded-lg px-2 h-10 w-full bg-white"
                        value={r.notes}
                        placeholder={
                          item?.notes
                            ? t('equipment.notes_db_prefix').replace('{note}', String(item.notes))
                            : t('equipment.notes_optional')
                        }
                        onChange={e => setNotes(r.id, e.target.value)}
                        disabled={!eventId}
                        aria-label={t('equipment.col.notes')}
                      />
                    </td>

                    {/* Remove */}
                    <td className="px-3 py-2">
                      <div className="h-10 w-full flex items-center justify-center">
                        <button
                          className="p-2 rounded text-red-600 hover:text-red-500 hover:bg-red-50 disabled:opacity-50"
                          onClick={() => removeRow(r.id)}
                          title={t('equipment.remove_title')}
                          disabled={!eventId}
                          aria-label={t('equipment.remove_aria')}
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
                <td className="px-3 py-2 text-right pr-2 opacity-70">{t('equipment.totals')}</td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-center">
                  <div className="h-10 w-24 mx-auto flex items-center justify-center font-semibold">
                    {fmt(totalsUI.price)}
                  </div>
                </td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}