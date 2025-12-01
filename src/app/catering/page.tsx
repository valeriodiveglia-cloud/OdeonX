// src/app/catering/page.tsx
'use client'

/**
 * CHANGELOG 2025-10-29
 * - Rimosso completamente lo status "Unpaid" dall'app (UI, sort cycle, modal).
 * - Nessun aggiornamento automatico dello status quando si flagga "Paid".
 * - Se nel DB c'è "unpaid", viene visualizzato come "Pending" (compat legacy).
 * - ManagePaymentModal: se payment_plan === 'full' mostro solo "Balance" (Deposit nascosto).
 * - ManagePaymentModal: precompila "Paid at" da deposit_paid_at / balance_paid_at (DB) se presenti.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PlusIcon,
  ArrowPathIcon,
  ChevronUpDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  EllipsisVerticalIcon,
  CheckCircleIcon,
  TrashIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import CircularLoader from '@/components/CircularLoader'
import { Dialog } from '@headlessui/react'
import { supabase } from '@/lib/supabase_shim'
import useEventList from '@/app/catering/_data/useEventList'
import { useECT } from './_i18n'

type SortKey = 'total' | 'date' | 'event' | 'host' | 'id' | 'payment' | 'status'
type SortDir = 'asc' | 'desc'

type NextDueKind = 'deposit' | 'balance'
type PaymentDraft = {
  deposit: { dueDate: string | null; amount: number | null; paid: boolean; paidAt: string | null }
  balance: { dueDate: string | null; amount: number | null; paid: boolean; paidAt: string | null }
}

/* ====== Status (senza "unpaid") ====== */
type StatusKey = 'inquiry' | 'pending' | 'confirmed' | 'done'
const STATUS_META: Record<StatusKey, { label: string; cls: string }> = {
  inquiry: { label: 'Inquiry', cls: 'bg-slate-100 text-slate-800 ring-1 ring-slate-200' },
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200' },
  confirmed: { label: 'Confirmed', cls: 'bg-blue-100 text-blue-800 ring-1 ring-blue-200' },
  done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200' },
}
const STATUS_ORDER: StatusKey[] = ['inquiry', 'pending', 'confirmed', 'done']

// Compat: se il DB ha "unpaid", mostralo come "pending"
function asStatusKey(v: any): StatusKey | null {
  if (v === 'unpaid') return 'pending'
  return v === 'inquiry' || v === 'pending' || v === 'confirmed' || v === 'done' ? v : null
}

export default function CateringIndexPage() {
  const router = useRouter()
  const { rows: events, loading, error, refresh } = useEventList()
  const t = useECT()
  const tt = t as (k: any, fallback?: string) => string
  const STATUS_LABEL_FALLBACK: Record<StatusKey, string> = {
    inquiry: 'Inquiry',
    pending: 'Pending',
    confirmed: 'Confirmed',
    done: 'Done',
  }
  const statusLabel = (k: StatusKey) => tt(`status.${k}`, STATUS_LABEL_FALLBACK[k])

  const [liveTick, setLiveTick] = useState(0)
  const bump = () => setLiveTick(t => (t + 1) % 1_000_000)

  // Sorting (default: total asc)
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'total', dir: 'asc' })
  const [statusCycle, setStatusCycle] = useState<{
    index: number
    order: StatusKey[]
    prevSort: { key: SortKey; dir: SortDir }
  } | null>(null)

  // Selecting
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const selectedIds = useMemo(() => Object.keys(selected).filter(id => selected[id]), [selected])
  const headerCbRef = useRef<HTMLInputElement>(null)

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [deleting, setDeleting] = useState(false)

  // Row menus
  const [rowMenuOpen, setRowMenuOpen] = useState<string | null>(null)

  // Modals
  const [paymentModalFor, setPaymentModalFor] = useState<string | null>(null)
  const [statusModalFor, setStatusModalFor] = useState<string | null>(null)

  // Drafts client-only
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, PaymentDraft>>({})
  const [statusDrafts, setStatusDrafts] = useState<Record<string, StatusKey>>({})

  // Hydrate map DB
  const [dbStatusMap, setDbStatusMap] = useState<Record<string, StatusKey | null>>({})
  const [dbPaidMap, setDbPaidMap] = useState<Record<string, { deposit: boolean; balance: boolean }>>({})
  const [dbDueMap, setDbDueMap] = useState<Record<string, { depDue: string | null; balDue: string | null }>>({})
  const [dbPlanPctMap, setDbPlanPctMap] = useState<Record<string, { plan: 'full' | 'installments' | null; depPct: number | null; balPct: number | null }>>({})

  // Prerequisiti “Manage payment”
  const [canManagePaymentMap, setCanManagePaymentMap] = useState<Record<string, boolean>>({})
  const [checkingManageMap, setCheckingManageMap] = useState<Record<string, boolean>>({})
  const [manageHintMap, setManageHintMap] = useState<Record<string, string>>({})

  /* ====== Hydrate DB per righe visibili ====== */
  useEffect(() => {
    if (!events.length) {
      setDbStatusMap({})
      setDbPaidMap({})
      setDbDueMap({})
      setDbPlanPctMap({})
      return
    }
    const ids = events.map(r => r.id)
      ; (async () => {
        const { data, error } = await supabase
          .from('event_headers')
          .select('id, status, deposit_paid_at, balance_paid_at, deposit_due_date, balance_due_date, deposit_percent, balance_percent, payment_plan')
          .in('id', ids)
        if (error || !data) return

        const sMap: Record<string, StatusKey | null> = {}
        const pMap: Record<string, { deposit: boolean; balance: boolean }> = {}
        const dMap: Record<string, { depDue: string | null; balDue: string | null }> = {}
        const pctMap: Record<string, { plan: 'full' | 'installments' | null; depPct: number | null; balPct: number | null }> = {}

        for (const row of data) {
          const id = (row as any).id as string
          sMap[id] = asStatusKey((row as any).status)
          pMap[id] = { deposit: !!(row as any).deposit_paid_at, balance: !!(row as any).balance_paid_at }
          dMap[id] = { depDue: (row as any).deposit_due_date ?? null, balDue: (row as any).balance_due_date ?? null }
          pctMap[id] = {
            plan: (row as any).payment_plan ?? null,
            depPct: normDbPct((row as any).deposit_percent),
            balPct: normDbPct((row as any).balance_percent),
          }
        }
        setDbStatusMap(sMap)
        setDbPaidMap(pMap)
        setDbDueMap(dMap)
        setDbPlanPctMap(pctMap)
      })()
  }, [events])

  // Totals change listeners
  useEffect(() => {
    const onTotals = () => bump()
    const onStorage = (e: StorageEvent) => { if ((e.key || '').startsWith('eventcalc.total.afterDiscounts:')) bump() }
    window.addEventListener('totals:afterDiscounts', onTotals as EventListener)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('totals:afterDiscounts', onTotals as EventListener)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  // Click outside per menu
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
      setRowMenuOpen(prev => {
        if (!prev) return prev
        const el = document.getElementById(`row-menu-${prev}`)
        if (el && !el.contains(e.target as Node)) return null
        return prev
      })
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const rowsShown = useMemo(() => events, [events])
  const allVisibleSelected = rowsShown.length > 0 && rowsShown.every(m => !!selected[m.id])
  const someVisibleSelected = rowsShown.some(m => !!selected[m.id]) && !allVisibleSelected
  useEffect(() => { if (headerCbRef.current) headerCbRef.current.indeterminate = someVisibleSelected }, [someVisibleSelected, allVisibleSelected, rowsShown.length])

  function hardNavigate(url: string) { if (typeof window !== 'undefined') window.location.assign(url); else router.push(url) }
  function clearPerEventLocalCache(eventId: string) {
    try {
      localStorage.removeItem(`eventcalc.bundles.totals:${eventId}`)
      localStorage.removeItem(`eventcalc.total.afterDiscounts:${eventId}`)
    } catch { }
  }
  function getCurrentEventIdLS(): string | null {
    try { return localStorage.getItem('event_current_id') || localStorage.getItem('eventId') || null } catch { return null }
  }
  const onRowActivate = (id: string) => {
    if (selectMode) { setSelected(s => ({ ...s, [id]: !s[id] })); return }
    try { localStorage.removeItem('eventcalc.draftEventId') } catch { }
    const prev = getCurrentEventIdLS(); if (prev && prev !== id) clearPerEventLocalCache(prev)
    try { localStorage.setItem('event_current_id', id); localStorage.setItem('eventId', id) } catch { }
    hardNavigate(`/catering/event-calculator?eventId=${encodeURIComponent(id)}`)
  }
  const onNewEvent = () => {
    const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    try {
      localStorage.setItem('eventcalc.draftEventId', id)
      clearPerEventLocalCache(id)
      localStorage.setItem('event_current_id', id)
      localStorage.setItem('eventId', id)
    } catch { }
    hardNavigate(`/catering/event-calculator?eventId=${encodeURIComponent(id)}`)
  }

  // Sorting helpers
  function defaultDirFor(_k: SortKey): SortDir { return 'asc' }
  function toggleSort(key: SortKey) {
    if (key === 'status') return toggleStatusCycle()
    setStatusCycle(null)
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDirFor(key) })
  }
  function effectiveStatus(rowId: string): StatusKey | null { return statusDrafts[rowId] ?? dbStatusMap[rowId] ?? null }
  function toggleStatusCycle() {
    if (!statusCycle) { setStatusCycle({ index: 0, order: STATUS_ORDER, prevSort: sort }); setSort({ key: 'status', dir: 'asc' }); return }
    const next = statusCycle.index + 1
    if (next < statusCycle.order.length) setStatusCycle({ ...statusCycle, index: next })
    else { setSort(statusCycle.prevSort); setStatusCycle(null) }
  }

  function readTotalForSort(row: any): number {
    const live = readLSAfterDiscounts(row.id)
    const tval = live ?? row.total_vnd ?? 0
    const n = Number(tval)
    return Number.isFinite(n) ? n : 0
  }
  function dateToSortable(d?: string | null): number {
    if (!d) return Number.POSITIVE_INFINITY
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d))
    if (m) return Number(`${m[1]}${m[2]}${m[3]}`)
    const ts = Date.parse(String(d))
    return Number.isFinite(ts) ? ts : Number.POSITIVE_INFINITY
  }
  function strCmp(a?: string | null, b?: string | null) { return (a ?? '').toLowerCase().localeCompare((b ?? '').toLowerCase(), undefined, { sensitivity: 'base' }) }

  // Payment sorting
  function paymentSortValue(row: any, drafts: Record<string, PaymentDraft>): number {
    const d = drafts[row.id]
    const paidDeposit = d?.deposit.paid === true ? true : !!dbPaidMap[row.id]?.deposit
    const paidBalance = d?.balance.paid === true ? true : !!dbPaidMap[row.id]?.balance
    if (paidDeposit && paidBalance) return Number.POSITIVE_INFINITY

    const depDue = d?.deposit.dueDate ?? dbDueMap[row.id]?.depDue ?? null
    const balDue = d?.balance.dueDate ?? dbDueMap[row.id]?.balDue ?? null

    const nextDraftDue =
      d
        ? (!paidDeposit && d.deposit.dueDate
          ? dateToSortable(d.deposit.dueDate)
          : (!paidBalance && d.balance.dueDate ? dateToSortable(d.balance.dueDate) : Number.POSITIVE_INFINITY))
        : Number.POSITIVE_INFINITY
    if (Number.isFinite(nextDraftDue)) return nextDraftDue

    const nextDbDue =
      !paidDeposit && depDue ? dateToSortable(depDue)
        : (!paidBalance && balDue ? dateToSortable(balDue) : Number.POSITIVE_INFINITY)

    if (Number.isFinite(nextDbDue)) return nextDbDue
    return dateToSortable(row?.next_due_date ?? null)
  }

  const rowsSorted = useMemo(() => {
    const deco = events.map((row, idx) => ({ row, idx }))
    deco.sort((A, B) => {
      let cmp = 0
      if (sort.key === 'status' && statusCycle) {
        const rot = [...statusCycle.order.slice(statusCycle.index), ...statusCycle.order.slice(0, statusCycle.index)]
        const rank = (id: string) => { const st = effectiveStatus(id); const pos = st ? rot.indexOf(st) : -1; return pos >= 0 ? pos : rot.length }
        cmp = rank(A.row.id) - rank(B.row.id)
        if (cmp !== 0) return cmp
        return A.idx - B.idx
      }
      switch (sort.key) {
        case 'payment': cmp = paymentSortValue(A.row, paymentDrafts) - paymentSortValue(B.row, paymentDrafts); break
        case 'total': cmp = readTotalForSort(A.row) - readTotalForSort(B.row); break
        case 'date': cmp = dateToSortable(A.row.event_date) - dateToSortable(B.row.event_date); break
        case 'event': cmp = strCmp(A.row.event_name, B.row.event_name); break
        case 'host': cmp = strCmp(A.row.host_name, B.row.host_name); break
        case 'id':
        default: cmp = strCmp(A.row.id, B.row.id)
      }
      if (sort.dir === 'desc') cmp = -cmp
      if (cmp !== 0) return cmp
      return A.idx - B.idx
    })
    return deco.map(d => d.row)
  }, [events, sort, liveTick, paymentDrafts, statusDrafts, dbStatusMap, dbPaidMap, dbDueMap, statusCycle])

  function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
    if (!active) return <ChevronUpDownIcon className="w-4 h-4 opacity-60" aria-hidden="true" />
    return dir === 'asc' ? <ArrowUpIcon className="w-4 h-4" aria-hidden="true" /> : <ArrowDownIcon className="w-4 h-4" aria-hidden="true" />
  }
  function thSortProps(k: SortKey) { const active = sort.key === k; const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'; return { active, ariaSort } }

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelected({})
    } else {
      const next: Record<string, boolean> = {}
      for (const m of rowsSorted) next[m.id] = true
      setSelected(next)
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return
    const ok = window.confirm(tt('bulk.delete_confirm', `Delete ${selectedIds.length} event(s) and all related rows? This cannot be undone.`))
    if (!ok) return
    setDeleting(true)
    try {
      selectedIds.forEach(clearPerEventLocalCache)
      const { error } = await supabase.rpc('event_delete_full_many', { p_event_ids: selectedIds })
      if (error) throw error
      try {
        const cur = getCurrentEventIdLS()
        if (cur && selectedIds.includes(cur)) {
          localStorage.removeItem('event_current_id')
          localStorage.removeItem('eventId')
          localStorage.removeItem('eventcalc.draftEventId')
        }
      } catch { }
      await refresh()
      setSelected({})
      setSelectMode(false)
      setMenuOpen(false)
      alert(tt('bulk.deleted_ok', 'Deleted successfully.'))
    } catch (e: any) {
      alert(tt('bulk.deleted_fail', `Delete failed: ${e?.message || String(e)}`))
    } finally {
      setDeleting(false)
    }
  }

  // ------- Prereq checking for Manage Payment -------
  useEffect(() => {
    if (!rowMenuOpen) return
    const rowId = rowMenuOpen
    setCheckingManageMap(m => ({ ...m, [rowId]: true }))
      ; (async () => {
        try {
          const totalEff = readLSAfterDiscounts(rowId) ?? (events.find(r => r.id === rowId)?.total_vnd ?? null)
          const totalOk = Number.isFinite(Number(totalEff)) && Number(totalEff) > 0
          if (!totalOk) { setCanManagePaymentMap(m => ({ ...m, [rowId]: false })); setManageHintMap(m => ({ ...m, [rowId]: tt('pay.hint_missing_total', 'Missing or zero Total') })); return }

          const planPct = dbPlanPctMap[rowId]
          const due = dbDueMap[rowId]
          if (!planPct || !due) {
            setCanManagePaymentMap(m => ({ ...m, [rowId]: false }))
            setManageHintMap(m => ({ ...m, [rowId]: tt('pay.hint_missing_data', 'Missing payment data') }))
            return
          }

          const plan = planPct.plan
          const depPct = planPct.depPct
          const balPct = planPct.balPct
          const depDue = due.depDue
          const balDue = due.balDue

          let can = false, hint = ''
          if (plan === 'full') { can = !!balDue; if (!can) hint = tt('pay.hint_missing_bal_due', 'Missing balance due date') }
          else {
            const haveDates = !!depDue && !!balDue
            const havePct = depPct != null || balPct != null
            can = haveDates && havePct
            if (!haveDates) hint = tt('pay.hint_missing_dates', 'Missing deposit/balance due date')
            else if (!havePct) hint = tt('pay.hint_missing_pct', 'Missing deposit% or balance%')
          }
          setCanManagePaymentMap(m => ({ ...m, [rowId]: can }))
          setManageHintMap(m => ({ ...m, [rowId]: hint }))
        } finally {
          setCheckingManageMap(m => ({ ...m, [rowId]: false }))
        }
      })()
  }, [rowMenuOpen, events, dbPlanPctMap, dbDueMap])

  // ------- Modals logic -------
  function openPaymentModal(rowId: string) {
    setRowMenuOpen(null)
    setPaymentModalFor(rowId)
  }

  // Salva SOLO i paid_at; NON cambia lo status
  async function savePaymentDraft(rowId: string, next: PaymentDraft) {
    setPaymentModalFor(null)
    setPaymentDrafts(prev => ({ ...prev, [rowId]: next }))

    const toIsoOrNull = (s: string | null) => {
      if (!s) return null
      const d = new Date(s)
      return isNaN(d.getTime()) ? null : d.toISOString()
    }
    const depositIso = next.deposit.paid ? (toIsoOrNull(next.deposit.paidAt) ?? new Date().toISOString()) : null
    const balanceIso = next.balance.paid ? (toIsoOrNull(next.balance.paidAt) ?? new Date().toISOString()) : null

    try {
      const { error } = await supabase
        .from('event_headers')
        .update({ deposit_paid_at: depositIso, balance_paid_at: balanceIso }) // <-- niente status
        .eq('id', rowId)
      if (error) throw error

      // Aggiorna solo flags locali, NON lo status
      setDbPaidMap(m => ({ ...m, [rowId]: { deposit: !!depositIso, balance: !!balanceIso } }))
    } catch (e: any) {
      alert(tt('pay.save_failed', `Saving payment failed: ${e?.message || String(e)}`))
    }
  }

  function openStatusModal(rowId: string) { setRowMenuOpen(null); setStatusModalFor(rowId) }
  async function saveStatus(rowId: string, status: StatusKey | null) {
    try {
      const { error } = await supabase.from('event_headers').update({ status: status ?? null }).eq('id', rowId)
      if (error) throw error
      setStatusDrafts(prev => { const next = { ...prev }; if (!status) delete next[rowId]; else next[rowId] = status; return next })
      setDbStatusMap(prev => ({ ...prev, [rowId]: status ?? null }))
      setStatusModalFor(null)
    } catch (e: any) { alert(tt('status.save_failed', `Saving status failed: ${e?.message || String(e)}`)) }
  }

  return (
    <div className="max-w-7xl mx-auto p-4 text-gray-100">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {selectMode && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                className="p-2 rounded-lg hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                title={tt('bulk.menu_title', 'Bulk actions')}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                disabled={deleting}
              >
                <EllipsisVerticalIcon className="w-6 h-6 text-white" />
              </button>
              {menuOpen && (
                <div className="absolute z-10 mt-2 w-56 rounded-xl border border-white/10 bg-white text-gray-900 shadow-xl">
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-red-600 disabled:opacity-50 flex items-center gap-2"
                    onClick={handleBulkDelete}
                    disabled={selectedIds.length === 0 || deleting}
                  >
                    <TrashIcon className="w-4 h-4" />
                    {tt('bulk.delete', 'Delete')}
                  </button>
                </div>
              )}
            </div>
          )}

          <h1 className="text-2xl font-bold text-white">{tt('catering.title', 'Catering')}</h1>
          {events.length > 0 && <span className="ml-1 text-sm text-blue-200">({events.length})</span>}
          {selectedIds.length > 0 && <span className="ml-2 text-sm text-blue-200">({selectedIds.length} {tt('catering.selected', 'selected')})</span>}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectMode(s => { const next = !s; if (!next) setSelected({}); setMenuOpen(false); return next })}
            className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border ${selectMode
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border-blue-400/30'
              }`}
            title={selectMode ? tt('select.exit', 'Exit selecting') : tt('select.enter', 'Enter selecting')}
            disabled={deleting}
          >
            <CheckCircleIcon className="w-5 h-5" />
            {selectMode ? tt('select.active', 'Selecting') : tt('select.button', 'Select')}
          </button>

          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-lg
                       bg-blue-600/15 text-blue-200 hover:bg-blue-600/25
                       border border-blue-400/30 disabled:opacity-60"
            aria-label={tt('refresh.aria', 'Refresh list')}
            title={tt('refresh.title', 'Refresh')}
            disabled={deleting}
          >
            <ArrowPathIcon className="w-5 h-5" />
            {tt('refresh.btn', 'Refresh')}
          </button>

          <button
            type="button"
            onClick={onNewEvent}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-80 disabled:opacity-60"
            disabled={deleting}
          >
            <PlusIcon className="w-5 h-5" />
            {tt('catering.new_event', 'New event')}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow text-gray-900">
        {error && (
          <div className="px-4 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200 rounded-t-2xl">
            {tt('common.error', 'Error')}: {error}
          </div>
        )}

        <div className="p-3">
          <div>
            <table className="w-full table-fixed text-sm text-gray-900">
              {/* Column widths sum ~76rem (fits 80rem container) */}
              <colgroup>
                <col className="w-[3rem]" />
                <col className="w-[9rem]" />
                <col className="w-[20rem]" />
                <col className="w-[11rem]" />
                <col className="w-[13rem]" />
                <col className="w-[9rem]" />
                <col className="w-[8rem]" />
                <col className="w-[3rem]" />
              </colgroup>

              <thead>
                <tr className="bg-blue-50 text-gray-800">
                  {/* Select column */}
                  <th className="p-2 text-left">
                    {selectMode ? (
                      <input
                        ref={headerCbRef}
                        type="checkbox"
                        className="h-4 w-4"
                        checked={rowsSorted.length > 0 && rowsSorted.every(m => !!selected[m.id])}
                        onChange={toggleSelectAllVisible}
                        title={tt('select.all', 'Select all')}
                        aria-label={tt('select.all', 'Select all')}
                      />
                    ) : null}
                  </th>

                  {/* Date */}
                  {(() => {
                    const { active, ariaSort } = thSortProps('date'); return (
                      <th className="p-2 text-left text-xs font-semibold uppercase tracking-wide" aria-sort={ariaSort as any}>
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('date')} title={tt('table.sort.date', 'Sort by date')} disabled={deleting}>
                          <span>{tt('table.col.date', 'Date')}</span><SortIndicator active={active} dir={sort.dir} />
                        </button>
                      </th>
                    )
                  })()}

                  {/* Event */}
                  {(() => {
                    const { active, ariaSort } = thSortProps('event'); return (
                      <th className="p-2 text-left text-xs font-semibold uppercase tracking-wide" aria-sort={ariaSort as any}>
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('event')} title={tt('table.sort.event', 'Sort by event title')} disabled={deleting}>
                          <span>{tt('table.col.event', 'Event')}</span><SortIndicator active={active} dir={sort.dir} />
                        </button>
                      </th>
                    )
                  })()}

                  {/* Host */}
                  {(() => {
                    const { active, ariaSort } = thSortProps('host'); return (
                      <th className="p-2 text-left text-xs font-semibold uppercase tracking-wide" aria-sort={ariaSort as any}>
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('host')} title={tt('table.sort.host', 'Sort by host')} disabled={deleting}>
                          <span>{tt('table.col.host', 'Host')}</span><SortIndicator active={active} dir={sort.dir} />
                        </button>
                      </th>
                    )
                  })()}

                  {/* Payment */}
                  {(() => {
                    const { active, ariaSort } = thSortProps('payment'); return (
                      <th className="p-2 text-left text-xs font-semibold uppercase tracking-wide" aria-sort={ariaSort as any}>
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('payment')} title={tt('table.sort.payment', 'Sort by payment')} disabled={deleting}>
                          <span>{tt('table.col.payment', 'Payment')}</span><SortIndicator active={active} dir={sort.dir} />
                        </button>
                      </th>
                    )
                  })()}

                  {/* Status (ciclo gruppi) */}
                  {(() => {
                    const active = sort.key === 'status'
                    const ariaSort = active ? 'other' : 'none'
                    const cycleLabel = statusCycle ? ` (${statusLabel(STATUS_ORDER[statusCycle.index])})` : ''
                    return (
                      <th className="p-2 text-left text-xs font-semibold uppercase tracking-wide" aria-sort={ariaSort as any}>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1"
                          onClick={() => toggleSort('status')}
                          title={tt('table.group.status', 'Group by status') + cycleLabel}
                          disabled={deleting}
                        >
                          <span>{tt('table.col.status', 'Status')}</span>
                          <ChevronUpDownIcon className={`w-4 h-4 ${active ? '' : 'opacity-60'}`} aria-hidden="true" />
                          {statusCycle && (
                            <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-700">
                              {statusLabel(STATUS_ORDER[statusCycle.index])}
                            </span>
                          )}
                        </button>
                      </th>
                    )
                  })()}

                  {/* Total (VND) */}
                  {(() => {
                    const { active, ariaSort } = thSortProps('total'); return (
                      <th className="p-2 text-right text-xs font-semibold uppercase tracking-wide" aria-sort={ariaSort as any}>
                        <button type="button" className="inline-flex items-center gap-1 float-right" onClick={() => toggleSort('total')} title={tt('table.sort.total', 'Sort by total')} disabled={deleting}>
                          <span>{tt('table.col.total_vnd', 'Total (VND)')}</span><SortIndicator active={active} dir={sort.dir} />
                        </button>
                      </th>
                    )
                  })()}

                  <th className="p-2"></th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-4">
                      <CircularLoader />
                    </td>
                  </tr>
                ) : rowsSorted.length === 0 ? (
                  <tr className="border-t">
                    <td className="p-4 text-sm text-gray-500" colSpan={8}>
                      {tt('catering.empty', 'No events. Create with "New event".')}
                    </td>
                  </tr>
                ) : (
                  rowsSorted.map((row) => {
                    const live = readLSAfterDiscounts(row.id)
                    const totalEff = live ?? row.total_vnd
                    const isSelected = !!selected[row.id]

                    const pay = paymentInfo(
                      row,
                      paymentDrafts[row.id],
                      dbPaidMap[row.id],
                      dbDueMap[row.id],
                      { deposit: tt('payment.deposit', 'Deposit'), balance: tt('payment.balance', 'Balance') }
                    )

                    const canManage = !!canManagePaymentMap[row.id]
                    const checking = !!checkingManageMap[row.id]
                    const hint = manageHintMap[row.id] || ''

                    // Status draft → DB
                    const stKey = statusDrafts[row.id] ?? dbStatusMap[row.id] ?? null
                    const stMeta = stKey ? STATUS_META[stKey] : null

                    return (
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        className={`border-t hover:bg-blue-50 cursor-pointer ${isSelected ? 'bg-blue-100/70' : ''}`}
                        onClick={() => onRowActivate(row.id)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowActivate(row.id) } }}
                      >
                        <td className="p-2">
                          {selectMode && (
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={isSelected}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setSelected(s => ({ ...s, [row.id]: e.target.checked }))}
                            />
                          )}
                        </td>

                        <td className="p-2">{formatDate(row.event_date)}</td>

                        <td className="p-2">
                          <div className="truncate font-medium">{row.event_name ?? '-'}</div>
                          <div className="text-xs text-gray-500 truncate">{row.id}</div>
                        </td>

                        <td className="p-2"><div className="truncate">{row.host_name ?? '-'}</div></td>

                        {/* Payment */}
                        <td className="p-2">
                          {!pay ? (
                            <span className="text-gray-500">-</span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <span className="truncate">{pay.label}</span>
                              {pay.overdue && <ExclamationTriangleIcon className="w-4 h-4 text-amber-600 shrink-0" aria-label={tt('payment.overdue', 'Overdue')} />}
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="p-2">
                          {stMeta ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${stMeta.cls}`}>{statusLabel(stKey!)}</span>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>

                        {/* Total */}
                        <td className="p-2 font-semibold text-right tabular-nums">{formatVND(totalEff)}</td>

                        {/* Row kebab */}
                        <td className="p-2">
                          <div className="relative" id={`row-menu-${row.id}`}>
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-gray-100 focus:outline-none"
                              title={tt('row.actions', 'Actions')}
                              aria-haspopup="menu"
                              aria-expanded={rowMenuOpen === row.id}
                              onClick={(e) => { e.stopPropagation(); setRowMenuOpen(prev => prev === row.id ? null : row.id) }}
                            >
                              <EllipsisVerticalIcon className="w-5 h-5 text-gray-700" />
                            </button>
                            {rowMenuOpen === row.id && (
                              <div className="absolute right-0 mt-2 w-48 rounded-xl border border-gray-200 bg-white shadow-lg z-10" onClick={e => e.stopPropagation()}>
                                <button
                                  className="w-full text-left px-3 py-2 hover:bg-blue-50 disabled:opacity-50"
                                  onClick={() => canManage && !checking && openPaymentModal(row.id)}
                                  disabled={checking || !canManage}
                                  title={checking ? tt('pay.checking', 'Checking…') : (canManage ? tt('pay.manage', 'Manage payment') : (hint || tt('pay.missing', 'Missing data')))}
                                >
                                  {tt('pay.manage', 'Manage payment')}
                                </button>
                                <button className="w-full text-left px-3 py-2 hover:bg-blue-50" onClick={() => openStatusModal(row.id)}>
                                  {tt('status.title', 'Status')}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ===== Modals ===== */}
      <ManagePaymentModal
        open={!!paymentModalFor}
        onClose={() => setPaymentModalFor(null)}
        rowId={paymentModalFor}
        effectiveTotal={
          paymentModalFor
            ? (readLSAfterDiscounts(paymentModalFor) ??
              (events.find(r => r.id === paymentModalFor)?.total_vnd ?? null))
            : null
        }
        draft={paymentModalFor ? paymentDrafts[paymentModalFor] : undefined}
        dbDue={paymentModalFor ? dbDueMap[paymentModalFor] : undefined}
        dbPlanPct={paymentModalFor ? dbPlanPctMap[paymentModalFor] : undefined}
        dbPaidFlags={paymentModalFor ? dbPaidMap[paymentModalFor] : undefined}
        onSave={savePaymentDraft}
      />

      <StatusModal
        open={!!statusModalFor}
        onClose={() => setStatusModalFor(null)}
        rowId={statusModalFor}
        current={statusModalFor ? (statusDrafts[statusModalFor] ?? dbStatusMap[statusModalFor] ?? null) : null}
        onSave={saveStatus}
      />
    </div>
  )
}

/* ================= Helpers ================= */

function readLSAfterDiscounts(eventId: string): number | null {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(`eventcalc.total.afterDiscounts:${eventId}`) : null
    if (raw == null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch { return null }
}

function formatDate(d?: string | null) {
  if (!d) return '-'
  const s = String(d)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  try {
    const dt = new Date(s)
    const dd = String(dt.getDate()).padStart(2, '0')
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const yyyy = dt.getFullYear()
    return `${dd}-${mm}-${yyyy}`
  } catch { return s }
}

function formatVND(v?: number | null) {
  if (v == null) return '-'
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  const r = Math.round(n)
  try { return new Intl.NumberFormat('en-US').format(r) } catch { return String(r) }
}

/* ============== Payment column helper ============== */
function paymentInfo(
  row: any,
  draft?: PaymentDraft,
  dbFlags?: { deposit: boolean; balance: boolean },
  dbDue?: { depDue: string | null; balDue: string | null },
  labels?: { deposit: string; balance: string }
): { label: string; overdue: boolean } | null {
  const depositLabel = labels?.deposit ?? 'Deposit'
  const balanceLabel = labels?.balance ?? 'Balance'

  const paidDeposit = draft?.deposit.paid === true ? true : !!dbFlags?.deposit
  const paidBalance = draft?.balance.paid === true ? true : !!dbFlags?.balance
  if (paidDeposit && paidBalance) return { label: 'Paid', overdue: false }

  const depDue = draft?.deposit?.dueDate ?? dbDue?.depDue ?? null
  const balDue = draft?.balance?.dueDate ?? dbDue?.balDue ?? null

  let kind: NextDueKind | null = null
  let date: string | null = null

  if (!paidDeposit && depDue) { kind = 'deposit'; date = depDue }
  else if (!paidBalance && balDue) { kind = 'balance'; date = balDue }

  if (!kind || !date) {
    kind = (row?.next_due_kind ?? null) as NextDueKind | null
    date = (row?.next_due_date ?? null) as string | null
  }
  if (!kind || !date) return null

  const label = `${kind === 'deposit' ? depositLabel : balanceLabel} - ${formatDate(date)}`
  let overdue = false
  try {
    const ts = Date.parse(`${String(date).slice(0, 10)}T00:00:00Z`)
    overdue = Number.isFinite(ts) ? ts < Date.now() : false
  } catch { }
  return { label, overdue }
}

/* ============== Manage Payment Modal ============== */
function ManagePaymentModal(props: {
  open: boolean
  onClose: () => void
  rowId: string | null
  effectiveTotal: number | null
  draft?: PaymentDraft
  dbDue?: { depDue: string | null; balDue: string | null }
  dbPlanPct?: { plan: 'full' | 'installments' | null; depPct: number | null; balPct: number | null }
  dbPaidFlags?: { deposit: boolean; balance: boolean }
  onSave: (rowId: string, next: PaymentDraft) => void | Promise<void>
}) {
  const { open, onClose, rowId, effectiveTotal, draft, dbDue, dbPlanPct, dbPaidFlags, onSave } = props
  const [loading, setLoading] = useState(false)
  const [loc, setLoc] = useState<PaymentDraft>(() => ({
    deposit: { dueDate: '', amount: null, paid: false, paidAt: null },
    balance: { dueDate: '', amount: null, paid: false, paidAt: null },
  }))
  const [resolvedPlan, setResolvedPlan] = useState<'full' | 'installments' | null>(dbPlanPct?.plan ?? null)

  const t = useECT()
  const tt = t as (k: any, fallback?: string) => string

  function nowLocalDT(): string {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  function toLocalInput(iso: string): string {
    try {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      const pad = (n: number) => String(n).padStart(2, '0')
      const yyyy = d.getFullYear(), mm = pad(d.getMonth() + 1), dd = pad(d.getDate()), hh = pad(d.getHours()), mi = pad(d.getMinutes())
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
    } catch { return '' }
  }
  function toDateInput(v?: string | null): string {
    if (!v) return ''
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v))
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    try {
      const d = new Date(v)
      if (isNaN(d.getTime())) return ''
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    } catch { return '' }
  }

  useEffect(() => {
    let active = true
    async function hydrate() {
      if (!open || !rowId) return
      setLoading(true)
      try {
        // Leggi SEMPRE dal DB: payment_plan, percentuali, due date e paid_at
        let plan = dbPlanPct?.plan ?? null
        let depPct = dbPlanPct?.depPct ?? null
        let balPct = dbPlanPct?.balPct ?? null
        let depDue = dbDue?.depDue ?? null
        let balDue = dbDue?.balDue ?? null
        let depPaidIso: string | null = null
        let balPaidIso: string | null = null

        const { data, error } = await supabase
          .from('event_headers')
          .select('payment_plan, deposit_percent, balance_percent, deposit_due_date, balance_due_date, deposit_paid_at, balance_paid_at')
          .eq('id', rowId)
          .maybeSingle()

        if (!error && data) {
          plan = (data as any).payment_plan ?? plan
          depPct = normDbPct((data as any).deposit_percent) ?? depPct
          balPct = normDbPct((data as any).balance_percent) ?? balPct
          depDue = (data as any).deposit_due_date ?? depDue
          balDue = (data as any).balance_due_date ?? balDue
          depPaidIso = (data as any).deposit_paid_at ?? null
          balPaidIso = (data as any).balance_paid_at ?? null
        }

        const total = Number(effectiveTotal ?? 0)
        const effectiveDepPct =
          plan === 'installments'
            ? (depPct ?? (balPct != null ? Math.max(0, 100 - balPct) : 0))
            : null
        const effectiveBalPct =
          plan === 'full'
            ? 100
            : (balPct ?? (effectiveDepPct != null ? Math.max(0, 100 - effectiveDepPct) : 0))

        const depAmt = effectiveDepPct != null ? Math.round(total * (effectiveDepPct / 100)) : null
        const balAmt = effectiveBalPct != null ? Math.round(total * (effectiveBalPct / 100)) : null

        // Flags pagato: draft > DB flags > presenza paid_at
        const paidDeposit =
          draft?.deposit.paid === true
            ? true
            : (dbPaidFlags?.deposit === true) || !!depPaidIso

        const paidBalance =
          draft?.balance.paid === true
            ? true
            : (dbPaidFlags?.balance === true) || !!balPaidIso

        const depPaidAtLocal =
          draft?.deposit.paidAt ?? (depPaidIso ? toLocalInput(depPaidIso) : null)

        const balPaidAtLocal =
          draft?.balance.paidAt ?? (balPaidIso ? toLocalInput(balPaidIso) : null)

        if (!active) return
        setResolvedPlan(plan ?? null)
        setLoc({
          deposit: {
            dueDate: draft?.deposit.dueDate ?? (toDateInput(depDue) || ''),
            amount: draft?.deposit.amount ?? depAmt,
            paid: paidDeposit,
            paidAt: paidDeposit ? (depPaidAtLocal ?? nowLocalDT()) : null,
          },
          balance: {
            dueDate: draft?.balance.dueDate ?? (toDateInput(balDue) || ''),
            amount: draft?.balance.amount ?? balAmt,
            paid: paidBalance,
            paidAt: paidBalance ? (balPaidAtLocal ?? nowLocalDT()) : null,
          },
        })
      } finally {
        if (active) setLoading(false)
      }
    }
    hydrate()
    return () => { active = false }
  }, [open, rowId, dbDue, dbPlanPct, dbPaidFlags, draft, effectiveTotal])

  if (!open || !rowId) return null

  const isFull = resolvedPlan === 'full'

  return (
    <Dialog open={open} onClose={onClose}>
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
      <div className="fixed inset-0 flex items-start justify-center p-4">
        <Dialog.Panel className="w-full max-w-[560px] bg-white border border-gray-200 rounded-2xl p-4 shadow-xl text-gray-900">
          <div className="flex items-center justify-between mb-2">
            <div className="text-lg font-semibold">{tt('pay.title', 'Manage payment')}</div>
            {resolvedPlan && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {resolvedPlan === 'full' ? tt('payment.plan_full', 'Full') : tt('payment.plan_installments', 'Installments')}
              </span>
            )}
          </div>

          {loading ? (
            <div className="space-y-3">
              <div className="h-20 bg-gray-50 rounded animate-pulse" />
              <div className="h-20 bg-gray-50 rounded animate-pulse" />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Deposit (nascosto se FULL) */}
              {!isFull && (
                <div className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{tt('payment.deposit', 'Deposit')}</div>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={!!loc.deposit.paid}
                        onChange={e => setLoc(v => ({
                          ...v,
                          deposit: {
                            ...v.deposit,
                            paid: e.target.checked,
                            paidAt: e.target.checked ? (v.deposit.paidAt ?? nowLocalDT()) : null,
                          }
                        }))}
                      />
                      <span>{tt('payment.paid', 'Paid')}</span>
                    </label>
                  </div>

                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex flex-col">
                      <span className="text-sm text-gray-800">{tt('payment.due_date', 'Due date')}</span>
                      <input type="date" className="mt-1 w-full border rounded-lg px-2 h-10 bg-gray-50 text-gray-700" value={loc.deposit.dueDate ?? ''} readOnly disabled />
                    </label>
                    <label className="flex flex-col">
                      <span className="text-sm text-gray-800">{tt('payment.amount_vnd', 'Amount (VND)')}</span>
                      <input className="mt-1 w-full border rounded-lg px-2 h-10 text-right bg-gray-50 text-gray-700 tabular-nums" value={loc.deposit.amount == null ? '' : new Intl.NumberFormat('en-US').format(loc.deposit.amount)} readOnly disabled />
                    </label>
                  </div>

                  {loc.deposit.paid && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="flex flex-col sm:col-span-2">
                        <span className="text-sm text-gray-800">{tt('payment.paid_at', 'Paid at')}</span>
                        <input
                          type="datetime-local"
                          className="mt-1 w-full border rounded-lg px-2 h-10 bg-white"
                          value={loc.deposit.paidAt ?? ''}
                          onChange={e => setLoc(v => ({ ...v, deposit: { ...v.deposit, paidAt: e.target.value || null } }))}
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Balance */}
              <div className="border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{tt('payment.balance', 'Balance')}</div>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={!!loc.balance.paid}
                      onChange={e => setLoc(v => ({
                        ...v,
                        balance: {
                          ...v.balance,
                          paid: e.target.checked,
                          paidAt: e.target.checked ? (v.balance.paidAt ?? nowLocalDT()) : null,
                        }
                      }))}
                    />
                    <span>{tt('payment.paid', 'Paid')}</span>
                  </label>
                </div>

                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex flex-col">
                    <span className="text-sm text-gray-800">{tt('payment.due_date', 'Due date')}</span>
                    <input type="date" className="mt-1 w-full border rounded-lg px-2 h-10 bg-gray-50 text-gray-700" value={loc.balance.dueDate ?? ''} readOnly disabled />
                  </label>
                  <label className="flex flex-col">
                    <span className="text-sm text-gray-800">{tt('payment.amount_vnd', 'Amount (VND)')}</span>
                    <input className="mt-1 w-full border rounded-lg px-2 h-10 text-right bg-gray-50 text-gray-700 tabular-nums" value={loc.balance.amount == null ? '' : new Intl.NumberFormat('en-US').format(loc.balance.amount)} readOnly disabled />
                  </label>
                </div>

                {loc.balance.paid && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex flex-col sm:col-span-2">
                      <span className="text-sm text-gray-800">{tt('payment.paid_at', 'Paid at')}</span>
                      <input
                        type="datetime-local"
                        className="mt-1 w-full border rounded-lg px-2 h-10 bg-white"
                        value={loc.balance.paidAt ?? ''}
                        onChange={e => setLoc(v => ({ ...v, balance: { ...v.balance, paidAt: e.target.value || null } }))}
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button className="px-3 h-9 rounded border border-gray-300 bg-white hover:bg-gray-50" onClick={onClose} disabled={loading}>{tt('common.cancel', 'Cancel')}</button>
            <button className="px-3 h-9 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60" onClick={async () => { if (rowId) await onSave(rowId, loc) }} disabled={loading}>{tt('common.save', 'Save')}</button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  )
}

/* ============== Status Modal (senza "Unpaid") ============== */
function StatusModal(props: {
  open: boolean
  onClose: () => void
  rowId: string | null
  current: StatusKey | null
  onSave: (rowId: string, status: StatusKey | null) => void | Promise<void>
}) {
  const { open, onClose, rowId, current, onSave } = props
  const [value, setValue] = useState<StatusKey | ''>(current ?? '')
  useEffect(() => { setValue(current ?? '') }, [current, open])

  const t = useECT()
  const tt = t as (k: any, fallback?: string) => string

  if (!open || !rowId) return null
  const meta = value ? STATUS_META[value] : null

  return (
    <Dialog open={open} onClose={onClose}>
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
      <div className="fixed inset-0 flex items-start justify-center p-4">
        <Dialog.Panel className="w-full max-w-[420px] bg-white border border-gray-200 rounded-2xl p-4 shadow-xl text-gray-900">
          <div className="text-lg font-semibold mb-3">{tt('status.title', 'Status')}</div>

          <label className="flex flex-col">
            <span className="text-sm text-gray-800">{tt('status.select', 'Select status')}</span>
            <select
              className="mt-1 w-full border rounded-lg px-2 h-10 bg-white"
              value={value}
              onChange={e => setValue((e.target.value || '') as StatusKey | '')}
            >
              <option value="">{tt('status.empty', ' - empty - ')}</option>
              <option value="inquiry">{tt('status.inquiry', 'Inquiry')}</option>
              <option value="pending">{tt('status.pending', 'Pending')}</option>
              <option value="confirmed">{tt('status.confirmed', 'Confirmed')}</option>
              <option value="done">{tt('status.done', 'Done')}</option>
            </select>
          </label>

          <div className="mt-3 min-h-[28px]">
            {meta ? (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>
                {value ? tt(`status.${value}`, meta.label) : ''}
              </span>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button className="px-3 h-9 rounded border border-gray-300 bg-white hover:bg-gray-50" onClick={onClose}>{tt('common.cancel', 'Cancel')}</button>
            <button className="px-3 h-9 rounded bg-blue-600 text-white hover:bg-blue-700" onClick={async () => { await onSave(rowId, value ? (value as StatusKey) : null) }}>{tt('common.save', 'Save')}</button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  )
}

/* ============== Percent utility ============== */
function normDbPct(v: any): number | null {
  if (v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  if (n <= 1 && n >= 0) return n * 100
  if (n > 1 && n <= 100) return n
  return null
}