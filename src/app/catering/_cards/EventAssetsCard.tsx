// src/app/catering/_cards/EventAssetsCard.tsx
'use client'

import { useEffect, useMemo, useRef, useState, KeyboardEvent, useCallback } from 'react'
import { TrashIcon, PlusIcon } from '@heroicons/react/24/outline'
import { Switch } from '@headlessui/react'
import { useEventCalc } from '@/app/catering/_state/EventCalcProvider'
import { useEventCompanyAssetRows } from '@/app/catering/_data/useEventCompanyAssetRows'
import { useECT } from '../_i18n'

/* ===================== fmt & utils ===================== */
const fmt = (n: number | null | undefined) => {
  if (n == null || Number.isNaN(n)) return '-'
  try { return new Intl.NumberFormat('en-US').format(n) } catch { return String(n) }
}
const toInt = (s: string) => {
  const n = Number(s)
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0
}
const toMoney = (s: string) => {
  const n = Number(s)
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
}
function uuid() {
  try {
    // @ts-ignore
    if (globalThis?.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch {}
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}
function autoEventId(fallback?: string | null): string | null {
  try {
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href)
      const fromUrl = u.searchParams.get('eventId')
      if (fromUrl && fromUrl.trim()) return fromUrl.trim()
    }
  } catch {}
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

/* ===================== Tipi locali ===================== */
type UIRow = {
  id: string
  name: string
  qty: number
  includePrice: boolean
  unitPrice: number | null
}
type DBRow = {
  id: string
  asset_name: string | null
  qty: number | null
  include_price: boolean | null
  unit_price_vnd: number | null
}

/* ===================== Signatures (dirty) ===================== */
/** Signature della bozza: usa SEMPRE i draft visibili (qtyDraft/priceDraft) se presenti,
    così anche gli stepper (freccette su/giù) fanno diventare dirty immediatamente. */
const sigDraft = (
  rows: UIRow[],
  qtyDraft: Record<string, string>,
  priceDraft: Record<string, string>
) => {
  const lines = (rows || []).map(r => {
    const qtyEff = toInt(qtyDraft[r.id] ?? String(r.qty ?? 0))
    const unitEff = r.includePrice ? toMoney(priceDraft[r.id] ?? String(r.unitPrice ?? 0)) : null
    return `R|${(r.name || '').replace(/\|/g, '¦')}|${qtyEff}|${r.includePrice ? 1 : 0}|${unitEff == null ? '' : unitEff}`
  })
  lines.sort()
  return `${lines.length}|${lines.join('~')}`
}

const sigDB = (rows: DBRow[]) => {
  const lines = (rows || []).map(r =>
    `R|${(r.asset_name || '').replace(/\|/g, '¦')}|${Number(r.qty || 0)}|${r.include_price ? 1 : 0}|${r.unit_price_vnd == null ? '' : Number(r.unit_price_vnd)}`
  )
  lines.sort()
  return `${lines.length}|${lines.join('~')}`
}

/* ===================== Component ===================== */
export default function EventAssetsCard({ title = 'Company assets' }: { title?: string }) {
  const t = useECT()
  const tt = t as (k: any, fallback?: string) => string
  const { eventId: eventIdFromCtx } = useEventCalc()
  const eventId = autoEventId(eventIdFromCtx || null)
  const useDB = !!eventId

  const db = useEventCompanyAssetRows(useDB ? eventId! : null)

  // ===== Bozza locale =====
  const [rows, setRows] = useState<UIRow[]>([])
  const hydratedOnceRef = useRef(false)
  const postSaveSilenceRef = useRef(false)

  const mapDbToUi = (r: DBRow): UIRow => ({
    id: r.id,
    name: r.asset_name ?? '',
    qty: Number(r.qty ?? 0) || 0,
    includePrice: !!r.include_price,
    unitPrice: r.unit_price_vnd == null ? null : Number(r.unit_price_vnd),
  })

  // Draft numerici per input (mentre digiti)
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({})
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({})
  const editingRef = useRef<{ price?: string; qty?: string }>({})

  // Reset completo al cambio evento
  useEffect(() => {
    function onEventChanged() {
      hydratedOnceRef.current = false
      postSaveSilenceRef.current = false
      setRows([])
      setPriceDraft({})
      setQtyDraft({})
    }
    window.addEventListener('event:changed', onEventChanged)
    return () => window.removeEventListener('event:changed', onEventChanged)
  }, [])

  // Hydrate draft UI da DB (prima volta e quando NON siamo dirty)
  const sigDbMemo = useMemo(() => sigDB(db.rows as any), [db.rows])
  const sigDraftMemo = useMemo(() => sigDraft(rows, qtyDraft, priceDraft), [rows, qtyDraft, priceDraft])
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

  // Mantieni i draft string allineati ai valori riga (senza disturbare la riga in edit)
  useEffect(() => {
    setPriceDraft(prev => {
      const next = { ...prev }
      for (const r of rows) {
        const isEditing = editingRef.current.price === r.id
        if (!isEditing) next[r.id] = r.unitPrice == null ? '' : String(r.unitPrice)
      }
      for (const k of Object.keys(next)) { if (!rows.find(r => r.id === k)) delete next[k] }
      return next
    })
    setQtyDraft(prev => {
      const next = { ...prev }
      for (const r of rows) {
        const isEditing = editingRef.current.qty === r.id
        if (!isEditing) next[r.id] = String(r.qty ?? 0)
      }
      for (const k of Object.keys(next)) { if (!rows.find(r => r.id === k)) delete next[k] }
      return next
    })
  }, [rows])

  // Bridge dirty → SaveBar
  useEffect(() => {
    if (postSaveSilenceRef.current && sigDraftMemo !== sigDbMemo) return
    if (postSaveSilenceRef.current && sigDraftMemo === sigDbMemo) postSaveSilenceRef.current = false
    const dirty = sigDraftMemo !== sigDbMemo
    try {
      window.dispatchEvent(new CustomEvent('eventcalc:dirty', { detail: { card: 'assets', dirty } }))
    } catch {}
  }, [sigDraftMemo, sigDbMemo])

  // Persistenza su "Save" globale (create/update/delete)
  useEffect(() => {
    if (!useDB) return
    const onSave = async () => {
      postSaveSilenceRef.current = true
      try {
        const dbMap = new Map((db.rows || []).map((r: any) => [r.id, r as DBRow]))
        const draftMap = new Map(rows.map(r => [r.id, r]))

        // DELETE: presenti su DB ma non nella bozza
        for (const r of (db.rows || []) as any as DBRow[]) {
          if (!draftMap.has(r.id)) {
            try { await db.deleteRow(r.id) } catch (e) { console.error('[assets save] delete', e) }
          }
        }

        // ADD / UPDATE
        for (const r of rows) {
          const existing = dbMap.get(r.id)
          if (!existing || String(r.id).startsWith('tmp:')) {
            try {
              await db.addRow({
                asset_name: r.name || '',
                qty: Number(r.qty || 0),
                include_price: !!r.includePrice,
                unit_price_vnd: r.includePrice ? (r.unitPrice == null ? 0 : Number(r.unitPrice)) : null,
              } as any)
            } catch (e) { console.error('[assets save] create', e) }
          } else {
            const changed =
              (existing.asset_name || '') !== (r.name || '') ||
              Number(existing.qty || 0) !== Number(r.qty || 0) ||
              !!existing.include_price !== !!r.includePrice ||
              (existing.unit_price_vnd == null ? null : Number(existing.unit_price_vnd)) !==
                (r.includePrice ? (r.unitPrice == null ? 0 : Number(r.unitPrice)) : null)

            if (changed) {
              try {
                await db.updateRow(r.id, {
                  asset_name: r.name || '',
                  qty: Number(r.qty || 0),
                  include_price: !!r.includePrice,
                  unit_price_vnd: r.includePrice ? (r.unitPrice == null ? 0 : Number(r.unitPrice)) : null,
                } as any)
              } catch (e) { console.error('[assets save] update', e) }
            }
          }
        }
      } catch (e) {
        console.error('[assets save] FAILED', e)
      } finally {
        setTimeout(() => { postSaveSilenceRef.current = false }, 2500)
      }
    }

    window.addEventListener('eventcalc:save', onSave as EventListener)
    return () => window.removeEventListener('eventcalc:save', onSave as EventListener)
  }, [useDB, rows, db.rows, db])

  /* ===================== Azioni (solo draft) ===================== */
  const addRow = useCallback(() => {
    setRows(rs => [...rs, { id: `tmp:${uuid()}`, name: '', qty: 1, includePrice: false, unitPrice: null }])
  }, [])

  const removeRow = useCallback((id: string) => {
    setRows(rs => rs.filter(r => r.id !== id))
    setPriceDraft(d => { const { [id]: _, ...rest } = d; return rest })
    setQtyDraft(d => { const { [id]: _, ...rest } = d; return rest })
  }, [])

  const updateRow = useCallback((id: string, patch: Partial<UIRow>) => {
    setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }, [])

  function onQtyBlur(id: string) {
    const raw = qtyDraft[id]
    updateRow(id, { qty: toInt(raw ?? '0') })
    editingRef.current.qty = undefined
  }
  function onPriceBlur(id: string) {
    const raw = priceDraft[id]
    updateRow(id, { unitPrice: (rows.find(r => r.id === id)?.includePrice ? toMoney(raw ?? '0') : null) })
    editingRef.current.price = undefined
  }
  function onQtyKey(e: KeyboardEvent<HTMLInputElement>) { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }
  function onPriceKey(e: KeyboardEvent<HTMLInputElement>) { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }

  function toggleIncludePrice(id: string, next: boolean) {
    updateRow(id, { includePrice: next, unitPrice: next ? (rows.find(r => r.id === id)?.unitPrice ?? 0) : null })
    if (!next) setPriceDraft(m => ({ ...m, [id]: '' }))
  }

  /* ===================== Totali & Broadcast ===================== */
  const totals = useMemo(() => {
    let total = 0
    for (const r of rows) {
      if (!r.includePrice) continue
      const qty  = toInt(qtyDraft[r.id] ?? String(r.qty ?? 0))
      const unit = toMoney(priceDraft[r.id] ?? String(r.unitPrice ?? 0))
      total += qty * unit
    }
    return { total }
  }, [rows, qtyDraft, priceDraft])

  useEffect(() => {
    const key = `eventcalc.assets.total:${eventId || ''}`
    try { localStorage.setItem(key, String(totals.total || 0)) } catch {}
    try {
      window.dispatchEvent(new CustomEvent('assets:total', {
        detail: { eventId: eventId || null, total: totals.total || 0 }
      }))
    } catch {}
  }, [totals.total, eventId])

  const loading = db.loading

  /* ===================== Render ===================== */
  const titleText = tt('assets.title', title)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{titleText}</h2>
          <span className="text-sm text-gray-500">({rows.length})</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="px-3 h-9 rounded bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99] transition disabled:opacity-60"
            onClick={addRow}
            disabled={loading || !useDB}
            title={useDB ? tt('assets.add_row_title', 'Add asset row') : tt('assets.need_event_id', 'Provide eventId to add DB rows')}
          >
            <span className="inline-flex items-center gap-2">
              <PlusIcon className="w-4 h-4" />
              {tt('assets.add', 'Add asset')}
            </span>
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {rows.length === 0 && !loading && (
          <div className="text-sm text-gray-500 px-1 py-4">
            {tt('assets.empty', 'No assets yet. Click "Add asset" to insert your first row.')}
          </div>
        )}

        {rows.map(row => {
          const rowTotal = row.includePrice
            ? (toInt(qtyDraft[row.id] ?? String(row.qty ?? 0)) * toMoney(priceDraft[row.id] ?? String(row.unitPrice ?? 0)))
            : 0

          return (
            <div key={row.id} className="border border-gray-200 rounded-xl p-2">
              {/* Layout: Name | Qty | [Toggle + Unit price + Total price + Remove] */}
              <div className="flex items-end gap-3 flex-nowrap overflow-x-auto">
                {/* Name */}
                <div className="flex-1 min-w-[560px]">
                  <label className="text-xs text-gray-600 mb-1 block">{tt('assets.name', 'Name')}</label>
                  <input
                    type="text"
                    className="border rounded-lg px-2 h-9 w-full bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={row.name}
                    onChange={e => updateRow(row.id, { name: e.target.value })}
                    placeholder={tt('assets.name_ph', 'Asset name')}
                    aria-label={tt('assets.name_aria', 'Asset name')}
                  />
                </div>

                {/* Qty */}
                <div className="w-[100px]">
                  <label className="text-xs text-gray-600 mb-1 block">{tt('assets.qty', 'Qty')}</label>
                  <input
                    type="number" step={1} min={0} inputMode="numeric"
                    className="border rounded-lg px-2 h-9 w-full text-right bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={qtyDraft[row.id] ?? String(row.qty ?? 0)}
                    onChange={e => setQtyDraft(m => ({ ...m, [row.id]: e.target.value }))}
                    onFocus={() => { editingRef.current.qty = row.id }}
                    onBlur={() => onQtyBlur(row.id)}
                    onKeyDown={onQtyKey}
                    placeholder="0"
                    aria-label={tt('assets.qty_aria', 'Quantity')}
                  />
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Toggle + Unit Price + Total Price + Remove */}
                <div className="ml-auto flex items-end gap-3">
                  {/* Toggle */}
                  <div className="w-[120px]">
                    <label className="text-xs text-gray-600 mb-1 block">{tt('assets.include_price', 'Include price')}</label>
                    <div className="h-9 flex items-center">
                      <Switch
                        checked={row.includePrice}
                        onChange={(v: boolean) => toggleIncludePrice(row.id, v)}
                        className={`${row.includePrice ? 'bg-blue-600' : 'bg-gray-300'} relative inline-flex h-6 w-11 items-center rounded-full transition`}
                        aria-label={tt('assets.include_price', 'Include price')}
                        title={tt('assets.include_price', 'Include price')}
                      >
                        <span
                          className={`${row.includePrice ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition`}
                        />
                      </Switch>
                    </div>
                  </div>

                  {/* Unit price */}
                  <div className="w-[160px]">
                    <label className="text-xs text-gray-600 mb-1 block">{tt('assets.unit_price', 'Unit price')}</label>
                    <input
                      type="number" step={1} min={0} inputMode="decimal"
                      className="border rounded-lg px-2 h-9 w-full text-right bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                      value={priceDraft[row.id] ?? (row.unitPrice == null ? '' : String(row.unitPrice))}
                      onChange={e => setPriceDraft(m => ({ ...m, [row.id]: e.target.value }))}
                      onFocus={() => { editingRef.current.price = row.id }}
                      onBlur={() => onPriceBlur(row.id)}
                      onKeyDown={onPriceKey}
                      disabled={!row.includePrice}
                      placeholder={row.includePrice ? '0' : '-'}
                      aria-label={tt('assets.unit_price_aria', 'Unit price (VND)')}
                      title={row.includePrice ? tt('assets.unit_price_title', 'Unit price in VND') : tt('assets.enable_toggle', 'Enable the toggle to edit')}
                    />
                  </div>

                  {/* Total price (read-only) */}
                  <div className="w-[160px]">
                    <label className="text-xs text-gray-600 mb-1 block">{tt('assets.total_price', 'Total price')}</label>
                    <div
                      className="border rounded-lg h-9 w-full bg-gray-50 text-gray-900 flex items-center justify-end px-2 font-medium select-none"
                      aria-label={tt('assets.row_total_aria', 'Row total price')}
                      title={tt('assets.row_total_title', 'Quantity x Unit price when included')}
                    >
                      {fmt(rowTotal)}
                    </div>
                  </div>

                  {/* Remove */}
                  <div className="h-9 flex items-center">
                    <button
                      className="p-2 rounded text-red-600 hover:text-red-500 hover:bg-red-50"
                      onClick={() => removeRow(row.id)}
                      title={tt('assets.remove_title', 'Remove asset row')}
                      aria-label={tt('assets.remove_aria', 'Remove row')}
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {/* Totals (footer) */}
        <div className="border-t border-gray-200 pt-3 flex flex-wrap items-center justify-end gap-6">
          <div className="text-sm text-gray-600">{tt('assets.totals', 'Totals')}</div>
          <div className="text-sm">
            <span className="text-gray-600 mr-1">{tt('assets.price_label', 'Price')}:</span>
            <span className="font-semibold">{fmt(totals.total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}