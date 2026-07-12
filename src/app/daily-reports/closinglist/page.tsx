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
  BarsArrowUpIcon,
  BarsArrowDownIcon,
  FunnelIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { useClosingList, type ClosingRow } from '../_data/useClosingList'
import { useSettings } from '@/contexts/SettingsContext'
import { getDailyReportsDictionary } from '../_i18n'
import MonthPicker from '@/components/MonthPicker'
import PageHeader from '@/components/PageHeader'
import Button from '@/components/Button'
import { TableContainer, Table, TableHead, TableHeadRow, TableBody, TableRow, TableCell } from '@/components/Table'

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

  const columnMenuDict = {
    sortAsc: language === 'vi' ? 'Sắp xếp tăng dần' : 'Sort Ascending',
    sortDesc: language === 'vi' ? 'Sắp xếp giảm dần' : 'Sort Descending',
    selectAll: language === 'vi' ? 'Chọn tất cả' : 'Select All',
    deselectAll: language === 'vi' ? 'Bỏ chọn tất cả' : 'Deselect All',
    filterPlaceholder: language === 'vi' ? 'Lọc...' : 'Filter...',
    clearFilters: language === 'vi' ? 'Xóa bộ lọc' : 'Clear Filters',
  }

  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortAsc, setSortAsc] = useState(false)

  // Column filter state: per-column set of allowed display values
  const [columnFilters, setColumnFilters] = useState<Partial<Record<SortKey, Set<string>>>>({})
  // Which column menu is currently open
  const [openMenu, setOpenMenu] = useState<SortKey | null>(null)

  function applySort(k: SortKey, asc: boolean) {
    setSortKey(k)
    setSortAsc(asc)
    setOpenMenu(null)
  }

  function applyColumnFilter(k: SortKey, allowed: Set<string> | null) {
    setColumnFilters(prev => {
      const next = { ...prev }
      if (!allowed) delete next[k]
      else next[k] = allowed
      return next
    })
    setOpenMenu(null)
  }

  function clearColumnFilter(k: SortKey) {
    setColumnFilters(prev => {
      const next = { ...prev }
      delete next[k]
      return next
    })
    setOpenMenu(null)
  }

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

  // Helper to get display value for a row + column
  const displayValue = React.useCallback((r: ClosingRow, k: SortKey): string => {
    switch (k) {
      case 'date': return formatDMY(r.date)
      case 'dow': return dow3(r.date)
      case 'time': return r.time
      case 'branch': return r.branch
      case 'unpaid': return fmt(r.unpaid)
      case 'cashout': return fmt(r.cashout)
      case 'card': return fmt(r.card)
      case 'transfer': return fmt(r.transfer)
      case 'cashToTake': return fmt(r.cashToTake)
      case 'revenue': return fmt(r.revenue)
      default: return ''
    }
  }, [])

  // Build unique display values per column (for filter checkboxes)
  const columnValues = useMemo(() => {
    const map: Partial<Record<SortKey, string[]>> = {}
    const sets: Partial<Record<SortKey, Set<string>>> = {}
    const keys: SortKey[] = ['date', 'dow', 'time', 'branch', 'unpaid', 'cashout', 'card', 'transfer', 'cashToTake', 'revenue']
    keys.forEach(k => { sets[k] = new Set() })
    rows.forEach(r => {
      sets.date!.add(formatDMY(r.date))
      sets.dow!.add(dow3(r.date))
      sets.time!.add(r.time)
      sets.branch!.add(r.branch)
      sets.unpaid!.add(fmt(r.unpaid))
      sets.cashout!.add(fmt(r.cashout))
      sets.card!.add(fmt(r.card))
      sets.transfer!.add(fmt(r.transfer))
      sets.cashToTake!.add(fmt(r.cashToTake))
      sets.revenue!.add(fmt(r.revenue))
    })
    keys.forEach(k => {
      map[k] = Array.from(sets[k]!).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    })
    return map
  }, [rows])

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

  const filtered = useMemo(() => {
    let out = rows.slice()
    // Apply per-column value filters
    for (const [k, allowed] of Object.entries(columnFilters) as [SortKey, Set<string>][]) {
      if (allowed && allowed.size > 0) {
        out = out.filter(r => allowed.has(displayValue(r, k)))
      }
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
  }, [rows, sortKey, sortAsc, columnFilters, displayValue])

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
      <PageHeader
        title={t.title}
        subtitle={language === 'vi'
          ? 'Xem và quản lý danh sách chốt ca hàng ngày, báo cáo và trạng thái đồng bộ.'
          : 'View and manage historical cashier closings, reports, and sync status.'}
        badgeText={selectedBranchName || (language === 'vi' ? 'Tất cả chi nhánh' : 'All branches')}
        left={
          selectMode ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                aria-label={t.menu.moreActions}
                className="p-0 h-auto w-auto bg-transparent border-0 outline-none text-blue-200 hover:text-white focus:outline-none cursor-pointer flex items-center"
                title={t.menu.moreActions}
              >
                <EllipsisVerticalIcon className="h-6 w-6" />
              </button>
              {menuOpen && (
                <div className="absolute left-0 z-10 mt-2 min-w-[12rem] rounded-xl border border-slate-150 bg-white text-slate-800 shadow-lg py-1">
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-650 hover:bg-red-50 text-left text-xs font-semibold disabled:opacity-50"
                    onClick={requestDeleteSelected}
                    disabled={selectedIds.length === 0}
                  >
                    <TrashIcon className="h-4 w-4" />
                    <span>{t.menu.delete}</span>
                  </button>
                </div>
              )}
            </div>
          ) : null
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Toggle Select */}
            <Button
              variant={selectMode ? 'primary' : 'secondary-dark'}
              size="md"
              icon={CheckCircleIcon}
              onClick={() => { setSelectMode(s => !s); setMenuOpen(false); setSelected({}) }}
              className="h-9 px-3 text-xs font-semibold"
              title={selectMode ? t.select.exitTitle : t.select.enterTitle}
            >
              {selectMode ? t.select.activeLabel : t.select.inactiveLabel}
            </Button>

            {/* Add closing */}
            <Button
              variant="primary"
              size="md"
              icon={PlusIcon}
              onClick={goToCloseDay}
              className="h-9 px-3 text-xs font-semibold"
              title={t.addClosing.title}
            >
              {t.addClosing.label}
            </Button>
          </div>
        }
      />

      {/* MonthPicker sullo sfondo scuro */}
      <MonthPicker
        value={monthInputValue}
        onChange={(val) => {
          const d = fromMonthInputValue(val)
          if (d) setMonthCursor(d)
        }}
        language={language}
        colorClass="text-blue-100 hover:text-white"
        labelColorClass="text-white"
        iconColorClass="text-blue-200 hover:text-white"
        className="mb-4 no-print"
      />

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
      <TableContainer>
        <Table>
          <TableHead>
            <TableHeadRow>
              {selectMode ? (
                <th className="px-6 py-4 w-7 text-center">
                  <input
                    ref={headerCbRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    title={t.table.selectAll}
                  />
                </th>
              ) : null}
              <ColumnHeader colKey="date" label={t.table.headers.date} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.date || []} activeFilter={columnFilters.date || null} onFilter={(s) => applyColumnFilter('date', s)} onClear={() => clearColumnFilter('date')} open={openMenu === 'date'} onToggle={() => setOpenMenu(v => v === 'date' ? null : 'date')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} center className="w-[100px] text-xs font-semibold" />
              <ColumnHeader colKey="dow" label={t.table.headers.day} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.dow || []} activeFilter={columnFilters.dow || null} onFilter={(s) => applyColumnFilter('dow', s)} onClear={() => clearColumnFilter('dow')} open={openMenu === 'dow'} onToggle={() => setOpenMenu(v => v === 'dow' ? null : 'dow')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} center className="w-[50px] text-xs font-semibold" />
              <ColumnHeader colKey="time" label={t.table.headers.time} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.time || []} activeFilter={columnFilters.time || null} onFilter={(s) => applyColumnFilter('time', s)} onClear={() => clearColumnFilter('time')} open={openMenu === 'time'} onToggle={() => setOpenMenu(v => v === 'time' ? null : 'time')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} center className="w-[70px] text-xs font-semibold" />
              <ColumnHeader colKey="branch" label={t.table.headers.branch} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.branch || []} activeFilter={columnFilters.branch || null} onFilter={(s) => applyColumnFilter('branch', s)} onClear={() => clearColumnFilter('branch')} open={openMenu === 'branch'} onToggle={() => setOpenMenu(v => v === 'branch' ? null : 'branch')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} center className="text-xs font-semibold whitespace-nowrap" />
              <ColumnHeader colKey="unpaid" label={t.table.headers.unpaid} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.unpaid || []} activeFilter={columnFilters.unpaid || null} onFilter={(s) => applyColumnFilter('unpaid', s)} onClear={() => clearColumnFilter('unpaid')} open={openMenu === 'unpaid'} onToggle={() => setOpenMenu(v => v === 'unpaid' ? null : 'unpaid')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} right className="text-xs font-semibold" />
              <ColumnHeader colKey="cashout" label={t.table.headers.cashOut} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.cashout || []} activeFilter={columnFilters.cashout || null} onFilter={(s) => applyColumnFilter('cashout', s)} onClear={() => clearColumnFilter('cashout')} open={openMenu === 'cashout'} onToggle={() => setOpenMenu(v => v === 'cashout' ? null : 'cashout')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} right className="text-xs font-semibold" />
              <ColumnHeader colKey="card" label={t.table.headers.card} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.card || []} activeFilter={columnFilters.card || null} onFilter={(s) => applyColumnFilter('card', s)} onClear={() => clearColumnFilter('card')} open={openMenu === 'card'} onToggle={() => setOpenMenu(v => v === 'card' ? null : 'card')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} right className="text-xs font-semibold" />
              <ColumnHeader colKey="transfer" label={t.table.headers.transfer} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.transfer || []} activeFilter={columnFilters.transfer || null} onFilter={(s) => applyColumnFilter('transfer', s)} onClear={() => clearColumnFilter('transfer')} open={openMenu === 'transfer'} onToggle={() => setOpenMenu(v => v === 'transfer' ? null : 'transfer')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} right className="text-xs font-semibold" />
              <ColumnHeader colKey="cashToTake" label={t.table.headers.cashToTake} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.cashToTake || []} activeFilter={columnFilters.cashToTake || null} onFilter={(s) => applyColumnFilter('cashToTake', s)} onClear={() => clearColumnFilter('cashToTake')} open={openMenu === 'cashToTake'} onToggle={() => setOpenMenu(v => v === 'cashToTake' ? null : 'cashToTake')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} right className="text-xs font-semibold" />
              <ColumnHeader colKey="revenue" label={t.table.headers.revenue} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.revenue || []} activeFilter={columnFilters.revenue || null} onFilter={(s) => applyColumnFilter('revenue', s)} onClear={() => clearColumnFilter('revenue')} open={openMenu === 'revenue'} onToggle={() => setOpenMenu(v => v === 'revenue' ? null : 'revenue')} onClose={() => setOpenMenu(null)} dict={columnMenuDict} right className="text-xs font-semibold" />
            </TableHeadRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={selectMode ? 11 : 10} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                  {t.table.noResults}
                </TableCell>
              </TableRow>
            )}
            {filtered.map(r => (
              <TableRow
                key={r.id}
                onClick={() => {
                  if (!selectMode) {
                    router.push(`/daily-reports/cashier-closing?id=${encodeURIComponent(r.id)}`)
                  }
                }}
              >
                {selectMode ? (
                  <TableCell className="w-7 text-center" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={!!selected[r.id]}
                      onChange={e => setSelected(prev => ({ ...prev, [r.id]: e.target.checked }))}
                      title={t.table.selectRow}
                    />
                  </TableCell>
                ) : null}
                <TableCell className="whitespace-nowrap overflow-hidden text-ellipsis max-w-[100px] text-center">{formatDMY(r.date)}</TableCell>
                <TableCell className="whitespace-nowrap text-center lowercase font-mono">{dow3(r.date)}</TableCell>
                <TableCell className="whitespace-nowrap overflow-hidden text-ellipsis max-w-[70px] text-center">{r.time}</TableCell>
                <TableCell className="text-center whitespace-nowrap">{r.branch}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  <div className="flex items-center justify-end gap-1.5">
                    {r.date >= '2026-07-12' && typeof r.posUnpaid === 'number' && r.posUnpaid !== r.unpaid && (
                      <ExclamationTriangleIcon
                        className="h-4 w-4 text-amber-500 cursor-help flex-shrink-0"
                        title={language === 'vi'
                          ? `Không khớp với POS! POS báo: ${fmt(r.posUnpaid)}`
                          : `Mismatch with POS! POS reports: ${fmt(r.posUnpaid)}`}
                      />
                    )}
                    <span>{fmt(r.unpaid)}</span>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{fmt(r.cashout)}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{fmt(r.card)}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{fmt(r.transfer)}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums font-bold">{fmt(r.cashToTake)}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{fmt(r.revenue)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-slate-50/80 font-bold border-t border-slate-200">
              <TableCell className="text-center" colSpan={selectMode ? 5 : 4}>{t.table.totals}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(stats.totalUnpaid)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(stats.totalCashout)}</TableCell>
              <TableCell className="text-right tabular-nums font-extrabold">{fmt(stats.totalCard)}</TableCell>
              <TableCell className="text-right tabular-nums font-extrabold">{fmt(stats.totalTransfer)}</TableCell>
              <TableCell className="text-right tabular-nums font-extrabold">{fmt(stats.totalToTake)}</TableCell>
              <TableCell className="text-right tabular-nums font-extrabold text-blue-650">{fmt(stats.totalRevenue)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

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

/* --- Column Header with Excel-style dropdown --- */
type ColumnHeaderProps = {
  colKey: SortKey
  label: string
  sortKey: SortKey
  sortAsc: boolean
  onSort: (k: SortKey, asc: boolean) => void
  values: string[]
  activeFilter: Set<string> | null
  onFilter: (s: Set<string> | null) => void
  onClear: () => void
  open: boolean
  onToggle: () => void
  onClose: () => void
  dict: { sortAsc: string; sortDesc: string; selectAll: string; deselectAll: string; filterPlaceholder: string; clearFilters: string }
  right?: boolean
  center?: boolean
  className?: string
}

function ColumnHeader({ colKey, label, sortKey, sortAsc, onSort, values, activeFilter, onFilter, onClear, open, onToggle, onClose, dict, right, center, className = '' }: ColumnHeaderProps) {
  const ref = useRef<HTMLTableCellElement>(null)
  const [filterSearch, setFilterSearch] = useState('')
  const [localChecked, setLocalChecked] = useState<Set<string>>(new Set(values))

  // Sync local state when menu opens or values change
  useEffect(() => {
    if (open) {
      setLocalChecked(activeFilter ? new Set(activeFilter) : new Set(values))
      setFilterSearch('')
    }
  }, [open, values, activeFilter])

  // Click-outside handler
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onClose])

  const isActive = sortKey === colKey
  const hasFilter = !!activeFilter
  const dropdownStyle = useMemo(() => {
    if (!open || !ref.current) return undefined
    const rect = ref.current.getBoundingClientRect()
    return { top: rect.bottom + window.scrollY + 4, left: right ? Math.max(0, rect.right - 220) : rect.left }
  }, [open, right])

  const filteredValues = filterSearch
    ? values.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase()))
    : values

  const allVisibleChecked = filteredValues.length > 0 && filteredValues.every(v => localChecked.has(v))

  function toggleAll() {
    const next = new Set(localChecked)
    if (allVisibleChecked) {
      filteredValues.forEach(v => next.delete(v))
    } else {
      filteredValues.forEach(v => next.add(v))
    }
    setLocalChecked(next)
  }

  // Modified slightly to filter values correctly
  function toggleOne(v: string) {
    const next = new Set(localChecked)
    if (next.has(v)) next.delete(v); else next.add(v)
    setLocalChecked(next)
  }

  function handleApply() {
    let finalChecked = localChecked
    if (filterSearch) {
      finalChecked = new Set([...localChecked].filter(x => filteredValues.includes(x)))
    }
    if (finalChecked.size >= values.length) onFilter(null); else onFilter(finalChecked)
  }

  return (
    <th className={`px-6 py-4 ${right ? 'text-right' : ''} ${className} relative`} ref={ref}>
      <div className={`flex items-center gap-1 font-semibold ${center ? 'justify-center' : right ? 'justify-end' : 'justify-start'}`}>
        <span className="select-none text-slate-500 uppercase tracking-wider text-xs">{label}</span>
        {isActive && (
          sortAsc
            ? <BarsArrowUpIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
            : <BarsArrowDownIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
        )}
        {/* Filter indicator */}
        {hasFilter && <FunnelIcon className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />}
        {/* Kebab menu button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          className="ml-0.5 p-0.5 rounded hover:bg-gray-200 transition-colors flex-shrink-0 cursor-pointer"
          aria-label={`Menu ${label}`}
        >
          <EllipsisVerticalIcon className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Dropdown panel */}
      {open && dropdownStyle && (
        <div
          className="fixed bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] min-w-[220px] text-left text-sm text-gray-700"
          style={dropdownStyle}
          onClick={e => e.stopPropagation()}
        >
          {/* Sort section */}
          <div className="px-3 py-2 space-y-1">
            <button
              type="button"
              onClick={() => onSort(colKey, true)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${isActive && sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'
                }`}
            >
              <BarsArrowUpIcon className="w-4 h-4" />
              {dict.sortAsc}
            </button>
            <button
              type="button"
              onClick={() => onSort(colKey, false)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${isActive && !sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'
                }`}
            >
              <BarsArrowDownIcon className="w-4 h-4" />
              {dict.sortDesc}
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200" />

          {/* Filter section */}
          <div className="px-3 py-2">
            {/* Search */}
            <input
              type="text"
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              placeholder={dict.filterPlaceholder}
              className="w-full mb-2 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            />

            {/* Select all / Deselect all */}
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-blue-600 hover:text-blue-800 mb-1 cursor-pointer font-medium"
            >
              {allVisibleChecked ? dict.deselectAll : dict.selectAll}
            </button>

            {/* Checkbox list */}
            <div className="max-h-[200px] overflow-y-auto space-y-0.5">
              {filteredValues.map(v => (
                <label key={v} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localChecked.has(v)}
                    onChange={() => toggleOne(v)}
                    className="accent-blue-600 rounded"
                  />
                  <span className="truncate text-xs">{v}</span>
                </label>
              ))}
              {filteredValues.length === 0 && (
                <div className="text-xs text-gray-400 py-1 text-center">—</div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer font-medium"
            >
              {dict.clearFilters}
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-3 py-1 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer font-medium"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </th>
  )
}
function StatPill({ label, value, money }: { label: string; value: number; money?: boolean }) {
  return (
    <div className="text-left rounded-xl border border-slate-200/60 bg-white text-slate-800 px-3.5 py-3 shadow-3xs hover:shadow-2xs transition-all duration-250">
      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-none">{label}</div>
      <div className="text-sm font-extrabold text-slate-800 tabular-nums mt-2 leading-none">{money ? fmt(value) : value}</div>
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
