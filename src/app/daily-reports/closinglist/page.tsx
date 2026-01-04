// src/app/daily-reports/closinglist/page.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronUpIcon,
  ChevronDownIcon,
  PlusIcon,
  CalendarDaysIcon,
  EllipsisVerticalIcon,
  CheckCircleIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useClosingList, type ClosingRow } from '../_data/useClosingList'
import { useSettings } from '@/contexts/SettingsContext'
import { getDailyReportsDictionary } from '../_i18n'

type SortKey =
  | 'date' | 'dow' | 'time' | 'branch'
  | 'revenue' | 'unpaid' | 'cashout' | 'cashToTake' | 'card' | 'transfer'

/* ---------- Branch badge helpers ---------- */
type SelectedBranch = { id?: string | null; name: string; address?: string }
const BRANCH_KEYS = ['dailyreports.selectedBranch', 'dailyreports.selectedBranch.v1'] as const

function loadSelectedBranch(): SelectedBranch | null {
  for (const key of BRANCH_KEYS) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      if (raw.trim().startsWith('{')) {
        const obj = JSON.parse(raw)
        const name = String(obj?.name || '').trim()
        if (name) {
          return {
            id: obj?.id != null ? String(obj.id) : null,
            name,
            address: obj?.address ? String(obj.address) : '',
          }
        }
      }
      const name = String(raw).trim()
      if (name) return { name }
    } catch { }
  }
  return null
}

/* ---------- Lightweight modal ---------- */
function Modal({
  title,
  children,
  onClose,
  footer,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  footer?: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-lg h-full bg-white shadow-xl overflow-y-auto">
        <div className="px-5 py-4 border-b">
          <div className="text-lg font-semibold text-gray-900">{title}</div>
        </div>
        <div className="px-5 py-4 text-gray-800">{children}</div>
        <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
          {footer}
        </div>
      </div>
    </div>
  )
}

/* ---------- Page ---------- */
const REQUIRED_WORD = 'DELETE'

export default function ClosingListPage() {
  const router = useRouter()
  const { language } = useSettings()
  const dict = getDailyReportsDictionary(language)
  const t = dict.closingList

  const [qText, setQText] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortAsc, setSortAsc] = useState(false)

  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
  const monthInputValue = useMemo(() => toMonthInputValue(monthCursor), [monthCursor])

  // Branch pill
  const [selectedBranchName, setSelectedBranchName] = useState<string>(() => loadSelectedBranch()?.name || '')

  // Data from hook
  const { rows, loading, deleteMany } = useClosingList({
    year: monthCursor.getFullYear(),
    month: monthCursor.getMonth(),
    branchName: selectedBranchName || null,
  })

  // Select mode + kebab
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const selectedIds = useMemo(() => Object.keys(selected).filter(id => selected[id]), [selected])
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const headerCbRef = useRef<HTMLInputElement>(null)

  // Delete confirm modal
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  // Sync branch pill on storage changes
  useEffect(() => {
    function onStorage(ev: StorageEvent) {
      if (!ev.key) return
      if ((BRANCH_KEYS as readonly string[]).includes(ev.key)) {
        setSelectedBranchName(loadSelectedBranch()?.name || '')
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Outside click for kebab
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  // Indeterminate header checkbox
  // Search filter only. Mese e branch sono già gestiti dall hook.
  const filtered = useMemo(() => {
    let out = rows.slice()
    if (qText.trim()) {
      const s = qText.trim().toLowerCase()
      out = out.filter(r =>
        r.branch.toLowerCase().includes(s) ||
        formatDMY(r.date).includes(s) ||
        dow3(r.date).includes(s) ||
        r.time.includes(s)
      )
    }
    out.sort((a, b) => {
      const av = sortValue(a, sortKey)
      const bv = sortValue(b, sortKey)
      let cmp: number
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortAsc ? cmp : -cmp
    })
    return out
  }, [rows, qText, sortKey, sortAsc])

  const allSelected = filtered.length > 0 && filtered.every(r => !!selected[r.id])
  const someSelected = filtered.some(r => !!selected[r.id]) && !allSelected
  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = someSelected
  }, [someSelected, allSelected, filtered.length])

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc(v => !v)
    else { setSortKey(k); setSortAsc(true) }
  }



  // KPI calcolati sulle righe visibili
  const stats = useMemo(() => {
    const count = filtered.length
    const sum = (fn: (r: ClosingRow) => number) => filtered.reduce((s, r) => s + (fn(r) || 0), 0)
    const totalRevenue = sum(r => r.revenue)
    const totalUnpaid = sum(r => r.unpaid)
    const totalCashout = sum(r => r.cashout)
    const totalCard = sum(r => r.card)
    const totalTransfer = sum(r => r.transfer)
    const totalToTake = sum(r => r.cashToTake)
    const avgRevenue = count ? Math.round(totalRevenue / count) : 0
    return { count, totalRevenue, totalUnpaid, totalCashout, totalCard, totalTransfer, totalToTake, avgRevenue }
  }, [filtered])

  function goToCloseDay() {
    router.push('/daily-reports/cashier-closing')
  }

  function prevMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), -1)) }
  function nextMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), 1)) }
  function onPickMonth(val: string) {
    const d = fromMonthInputValue(val)
    if (d) setMonthCursor(d)
  }

  function toggleSelectAll() {
    if (rows.length === 0) return
    if (allSelected) setSelected({})
    else {
      const next: Record<string, boolean> = {}
      filtered.forEach(r => { next[r.id] = true })
      setSelected(next)
    }
  }

  // Open modal instead of immediate delete
  function requestDeleteSelected() {
    if (!selectedIds.length) return
    setConfirmText('')
    setConfirmOpen(true)
    setMenuOpen(false)
  }

  function performDeleteSelected() {
    const ids = selectedIds
    if (!ids.length) return
    deleteMany(ids).then(() => {
      setSelected({})
      setConfirmOpen(false)
    }).catch(err => {
      console.error(err)
      alert(t.errors.failedDelete)
    })
  }

  if (loading) return <div className="p-6 text-gray-200">{t.common.loading}</div>

  const deleteSummary = t.modal.summary.replace('{count}', String(selectedIds.length))
  const deleteTypeHint = t.modal.typeHint.replace('{word}', REQUIRED_WORD)
  const deletePlaceholder = t.modal.placeholder.replace('{word}', REQUIRED_WORD)

  return (
    <div className="max-w-none mx-auto p-4 text-gray-100">
      {/* Header con kebab + branch pill + search + add */}
      <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {/* Kebab menu: visibile in Selecting */}
          {selectMode && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                aria-label={t.menu.moreActions}
                className="p-0 h-auto w-auto bg-transparent border-0 outline-none text-blue-200 hover:text-white focus:outline-none"
                title={t.menu.moreActions}
              >
                <EllipsisVerticalIcon className="h-6 w-6" />
              </button>
              {menuOpen && (
                <div className="absolute z-10 mt-2 min-w-[12rem] rounded-xl border bg-white text-gray-800 shadow-lg py-1">
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 hover:bg-blue-200 hover:text-red-700 disabled:opacity-50"
                    onClick={requestDeleteSelected}
                    disabled={selectedIds.length === 0}
                  >
                    <TrashIcon className="h-4 w-4" />
                    <span>{t.menu.delete}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <h1 className="text-2xl font-bold text-white">{t.title}</h1>

          <div
            className="hidden md:inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-600/15 px-3 py-1 text-xs text-blue-100"
            title={t.branchPill.tooltip}
          >
            <span className="h-2 w-2 rounded-full bg-green-400" />
            <span className="font-medium">{selectedBranchName || t.branchPill.all}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search box blu */}
          <input
            type="text"
            placeholder={t.search.placeholder}
            value={qText}
            onChange={e => setQText(e.target.value)}
            className="h-9 px-3 rounded-lg border border-blue-400/30 bg-blue-600/15
                       text-blue-100 placeholder-blue-300 caret-blue-200
                       focus:outline-none focus:ring-2 focus:ring-blue-400/40 w-[200px]"
          />

          {/* Toggle Select */}
          <button
            onClick={() => { setSelectMode(s => !s); setMenuOpen(false); setSelected({}) }}
            className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border ${selectMode
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border-blue-400/30'
              }`}
            title={selectMode ? t.select.exitTitle : t.select.enterTitle}
          >
            <CheckCircleIcon className="w-5 h-5" />
            {selectMode ? t.select.activeLabel : t.select.inactiveLabel}
          </button>

          {/* Add closing */}
          <button
            onClick={goToCloseDay}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-80"
            title={t.addClosing.title}
          >
            <PlusIcon className="w-5 h-5" />
            {t.addClosing.label}
          </button>
        </div>
      </div>

      {/* Divisore */}
      <div className="border-t border-blue-400/20 my-3"></div>

      {/* Barra mensile sopra i KPI */}
      <div className="mb-3 grid grid-cols-3 items-center">
        <div className="justify-self-start">
          <button
            type="button"
            onClick={prevMonth}
            className="text-blue-200 hover:text-white underline underline-offset-4 decoration-blue-300/40"
          >
            {t.monthNav.previous}
          </button>
        </div>
        <div className="justify-self-center flex items-center gap-2">
          <span className="text-white font-semibold">{formatMonthLabel(monthCursor)}</span>
          <div className="relative w-6 h-6">
            <CalendarDaysIcon className="w-6 h-6 text-blue-200" />
            <input
              type="month"
              value={monthInputValue}
              onChange={e => onPickMonth(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label={t.monthNav.pickLabel}
            />
          </div>
        </div>
        <div className="justify-self-end">
          <button
            type="button"
            onClick={nextMonth}
            className="text-blue-200 hover:text-white underline underline-offset-4 decoration-blue-300/40"
          >
            {t.monthNav.next}
          </button>
        </div>
      </div>

      {/* Tiles KPI */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
        <StatPill label={t.kpi.closings} value={stats.count} />
        <StatPill label={t.kpi.totalRevenue} value={stats.totalRevenue} money />
        <StatPill label={t.kpi.averageRevenue} value={stats.avgRevenue} money />
        <StatPill label={t.kpi.totalUnpaid} value={stats.totalUnpaid} money />
        <StatPill label={t.kpi.totalCashOut} value={stats.totalCashout} money />
        <StatPill label={t.kpi.totalCard} value={stats.totalCard} money />
        <StatPill label={t.kpi.totalTransfer} value={stats.totalTransfer} money />
        <StatPill label={t.kpi.totalToTake} value={stats.totalToTake} money />
      </div>

      {/* Tabella */}
      <div className="bg-white rounded-2xl shadow p-3">
        <table className="w-full table-auto text-sm text-gray-900">
          <thead>
            <tr>
              {selectMode ? (
                <th className="p-2 w-7">
                  <input
                    ref={headerCbRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4"
                    title={t.table.selectAll}
                  />
                </th>
              ) : null}
              <Th label={t.table.headers.date} active={sortKey === 'date'} asc={sortAsc} onClick={() => toggleSort('date')} className="w-[100px]" center />
              <Th label={t.table.headers.day} active={sortKey === 'dow'} asc={sortAsc} onClick={() => toggleSort('dow')} className="w-[50px]" center />
              <Th label={t.table.headers.time} active={sortKey === 'time'} asc={sortAsc} onClick={() => toggleSort('time')} className="w-[70px]" center />
              <Th label={t.table.headers.branch} active={sortKey === 'branch'} asc={sortAsc} onClick={() => toggleSort('branch')} className="w-[180px]" center />
              <Th label={t.table.headers.unpaid} active={sortKey === 'unpaid'} asc={sortAsc} onClick={() => toggleSort('unpaid')} right />
              <Th label={t.table.headers.cashOut} active={sortKey === 'cashout'} asc={sortAsc} onClick={() => toggleSort('cashout')} right />
              <Th label={t.table.headers.card} active={sortKey === 'card'} asc={sortAsc} onClick={() => toggleSort('card')} right />
              <Th label={t.table.headers.transfer} active={sortKey === 'transfer'} asc={sortAsc} onClick={() => toggleSort('transfer')} right />
              <Th label={t.table.headers.cashToTake} active={sortKey === 'cashToTake'} asc={sortAsc} onClick={() => toggleSort('cashToTake')} right />
              <Th label={t.table.headers.revenue} active={sortKey === 'revenue'} asc={sortAsc} onClick={() => toggleSort('revenue')} right />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={selectMode ? 10 : 9} className="text-center text-gray-500 py-6">
                  {t.table.noResults}
                </td>
              </tr>
            )}
            {filtered.map(r => (
              <tr
                key={r.id}
                className="border-t hover:bg-blue-50/40 cursor-pointer"
                onClick={() => {
                  if (!selectMode) {
                    router.push(`/daily-reports/cashier-closing?id=${encodeURIComponent(r.id)}`)
                  }
                }}
              >
                {selectMode ? (
                  <td className="p-2 w-7" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={!!selected[r.id]}
                      onChange={e => setSelected(prev => ({ ...prev, [r.id]: e.target.checked }))}
                      title={t.table.selectRow}
                    />
                  </td>
                ) : null}
                <td className="p-2 whitespace-nowrap overflow-hidden text-ellipsis max-w-[100px] text-center">{formatDMY(r.date)}</td>
                <td className="p-2 whitespace-nowrap overflow-hidden text-ellipsis max-w-[50px] text-center lowercase font-mono">{dow3(r.date)}</td>
                <td className="p-2 whitespace-nowrap overflow-hidden text-ellipsis max-w-[70px] text-center">{r.time}</td>
                <td className="p-2 truncate max-w-[180px] text-center" title={r.branch}>{r.branch}</td>
                <td className="p-2 whitespace-nowrap text-right tabular-nums">{fmt(r.unpaid)}</td>
                <td className="p-2 whitespace-nowrap text-right tabular-nums">{fmt(r.cashout)}</td>
                <td className="p-2 whitespace-nowrap text-right tabular-nums">{fmt(r.card)}</td>
                <td className="p-2 whitespace-nowrap text-right tabular-nums">{fmt(r.transfer)}</td>
                <td className="p-2 whitespace-nowrap text-right tabular-nums font-bold">{fmt(r.cashToTake)}</td>
                <td className="p-2 whitespace-nowrap text-right tabular-nums">{fmt(r.revenue)}</td>
              </tr>
            ))}
            {filtered.length > 0 && (
              <tr className="border-t bg-gray-50 font-semibold">
                <td className="p-2" colSpan={selectMode ? 5 : 4}>{t.table.totals}</td>
                <td className="p-2 text-right">{fmt(stats.totalUnpaid)}</td>
                <td className="p-2 text-right">{fmt(stats.totalCashout)}</td>
                <td className="p-2 font-bold text-right tabular-nums">{fmt(stats.totalCard)}</td>
                <td className="p-2 font-bold text-right tabular-nums">{fmt(stats.totalTransfer)}</td>
                <td className="p-2 text-right">{fmt(stats.totalToTake)}</td>
                <td className="p-2 text-right">{fmt(stats.totalRevenue)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {
        confirmOpen && (
          <Modal
            title={t.modal.title}
            onClose={() => setConfirmOpen(false)}
            footer={
              <>
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="px-4 py-2 rounded-lg border hover:opacity-80"
                >
                  {t.modal.cancel}
                </button>
                <button
                  onClick={performDeleteSelected}
                  disabled={confirmText.trim() !== REQUIRED_WORD}
                  className={`px-4 py-2 rounded-lg ${confirmText.trim() === REQUIRED_WORD
                    ? 'bg-red-600 text-white hover:opacity-90'
                    : 'bg-red-600/40 text-white/80 cursor-not-allowed'
                    }`}
                >
                  {t.modal.confirm}
                </button>
              </>
            }
          >
            <div className="space-y-3">
              <p>{t.modal.permanent}</p>
              <p>{deleteSummary}</p>
              <p className="text-sm text-gray-600">
                {deleteTypeHint}
              </p>
              <input
                autoFocus
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder={deletePlaceholder}
                className="w-full h-11 px-3 border rounded-lg bg-white"
              />
            </div>
          </Modal>
        )
      }
    </div >
  )
}

/* --- Helpers UI --- */
function Th({ label, active, asc, onClick, right, center, className = '' }: { label: string; active: boolean; asc: boolean; onClick: () => void; right?: boolean; center?: boolean; className?: string }) {
  return (
    <th className={`p-2 ${right ? 'text-right' : center ? 'text-center' : ''} ${className}`}>
      <button onClick={onClick} className={`w-full flex items-center gap-1 font-semibold cursor-pointer ${right ? 'justify-end' : center ? 'justify-center' : ''}`}>
        {!right && !center && <SortIcon active={active} asc={asc} />}
        {center && <div className="w-4" />} {/* Placeholder for balance if needed, or just center text */}
        <span>{label}</span>
        {(right || center) && <SortIcon active={active} asc={asc} />}
      </button>
    </th>
  )
}
function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return <span className="inline-block w-4" />
  return asc ? <ChevronUpIcon className="w-4 h-4 text-gray-700" /> : <ChevronDownIcon className="w-4 h-4 text-gray-700" />
}
function StatPill({ label, value, money }: { label: string; value: number; money?: boolean }) {
  return (
    <div className="text-left rounded-xl border border-blue-400/30 bg-blue-600/10 text-blue-100 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-base font-semibold tabular-nums">{money ? fmt(value) : value}</div>
    </div>
  )
}

/* --- Utils --- */
function formatDMY(isoDate: string) {
  const d = new Date(isoDate)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}
function dow3(isoDate: string) { return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(isoDate).getDay()] }
function sortValue(r: ClosingRow, key: SortKey) {
  switch (key) {
    case 'date': return new Date(r.date).getTime()
    case 'dow': return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(dow3(r.date))
    case 'time': return Number(r.time.replace(':', ''))
    case 'branch': return r.branch.toLowerCase()
    case 'revenue': return r.revenue
    case 'unpaid': return r.unpaid
    case 'cashout': return r.cashout
    case 'cashToTake': return r.cashToTake
    case 'card': return r.card
    case 'transfer': return r.transfer
    default: return 0
  }
}
function fmt(n: number) { return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function toMonthInputValue(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function fromMonthInputValue(val: string) { const [y, m] = val.split('-').map(Number); return new Date(y, m - 1, 1) }
function formatMonthLabel(d: Date) { return d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) }
