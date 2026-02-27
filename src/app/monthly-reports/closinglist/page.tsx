'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    CalendarDaysIcon,
    MagnifyingGlassIcon,
    ArrowDownTrayIcon,
    EllipsisVerticalIcon,
    BarsArrowUpIcon,
    BarsArrowDownIcon,
    FunnelIcon,
} from '@heroicons/react/24/outline'
import { useClosingList, type ClosingRow } from '../../daily-reports/_data/useClosingList'
import { useSettings } from '@/contexts/SettingsContext'
import { getMonthlyReportsDictionary } from '../_i18n'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import { exportToExcelTable, type ExcelColumn } from '@/lib/exportUtils'

type SortKey = 'date' | 'dow' | 'time' | 'branch' | 'revenue' | 'unpaid' | 'cashout' | 'cashToTake' | 'card' | 'transfer'

type Branch = { id: string; name: string }

/* Helper for Third Party Fallback */
function getThirdPartyPayments(r: ClosingRow) {
    if (r.thirdPartyAmounts && r.thirdPartyAmounts.length > 0) {
        return r.thirdPartyAmounts
    }
    // Fallback legacy
    const out = []
    if (r.gojek > 0) out.push({ label: 'Gojek', amount: r.gojek })
    if (r.grab > 0) out.push({ label: 'Grab', amount: r.grab })
    if (r.capichi > 0) out.push({ label: 'Capichi', amount: r.capichi })
    return out
}

export default function MonthlyClosingListPage() {
    const router = useRouter()
    const { language } = useSettings()
    const dict = getMonthlyReportsDictionary(language)
    const t = dict.closingList

    const [qText, setQText] = useState('')
    const [sortKey, setSortKey] = useState<SortKey>('date')
    const [sortAsc, setSortAsc] = useState(false)

    // Column filter state: per-column set of allowed display values
    const [columnFilters, setColumnFilters] = useState<Partial<Record<SortKey, Set<string>>>>({})
    // Which column menu is currently open
    const [openMenu, setOpenMenu] = useState<SortKey | null>(null)

    const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
    const monthInputValue = useMemo(() => toMonthInputValue(monthCursor), [monthCursor])

    // Branch filter
    const [branches, setBranches] = useState<Branch[]>([])
    const [selectedBranchId, setSelectedBranchId] = useState<string>('all')
    const selectedBranchName = useMemo(() => {
        if (selectedBranchId === 'all') return null
        return branches.find(b => b.id === selectedBranchId)?.name || null
    }, [selectedBranchId, branches])

    // Load branches
    useEffect(() => {
        async function loadBranches() {
            const { data } = await supabase.from('provider_branches').select('id, name').order('name')
            if (data) {
                setBranches(data)
            }
        }
        loadBranches()
    }, [])

    // Data from hook
    const { rows, loading } = useClosingList({
        year: monthCursor.getFullYear(),
        month: monthCursor.getMonth(),
        branchName: selectedBranchName,
    })

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

    // Helper to get display value for a row + column
    const displayValue = useCallback((r: ClosingRow, k: SortKey): string => {
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

    // Search filter + column filters
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
    }, [rows, qText, sortKey, sortAsc, columnFilters, displayValue])

    // KPI
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

    function prevMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), -1)) }
    function nextMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), 1)) }
    function onPickMonth(val: string) {
        const d = fromMonthInputValue(val)
        if (d) setMonthCursor(d)
    }

    async function handleExport() {
        // 1. Identify dynamic columns
        const uniqueAppNames = new Set<string>()
        filtered.forEach(r => {
            const list = getThirdPartyPayments(r)
            list.forEach(item => {
                if (item.label && item.amount > 0) uniqueAppNames.add(item.label.trim())
            })
        })
        const sortedApps = Array.from(uniqueAppNames).sort((a, b) => a.localeCompare(b))

        // 2. Define Columns
        const columns: ExcelColumn[] = [
            { header: t.table.headers.date, key: 'date', width: 15, total: 'Totals:' },
            { header: t.table.headers.day, key: 'day', width: 8 },
            { header: t.table.headers.time, key: 'time', width: 10 },
            { header: t.table.headers.branch, key: 'branch', width: 25 },
            { header: t.table.headers.unpaid, key: 'unpaid', width: 15, total: true },
            { header: t.table.headers.cashOut, key: 'cashout', width: 15, total: true },
            { header: t.table.headers.card, key: 'card', width: 15, total: true },
            { header: t.table.headers.transfer, key: 'transfer', width: 15, total: true },
        ]

        sortedApps.forEach(app => {
            columns.push({ header: app, key: `app_${app}`, width: 15, total: true })
        })

        columns.push({ header: t.table.headers.cashToTake, key: 'cashToTake', width: 15, total: true })
        columns.push({ header: t.table.headers.revenue, key: 'revenue', width: 15, total: true })

        // 3. Prepare Data
        const data = filtered.map(r => {
            const row: any = {
                date: formatDMY(r.date),
                day: dow3(r.date),
                time: r.time,
                branch: r.branch,
                unpaid: r.unpaid,
                cashout: r.cashout,
                card: r.card,
                transfer: r.transfer,
                cashToTake: r.cashToTake,
                revenue: r.revenue
            }

            const list = getThirdPartyPayments(r)
            const rowApps: Record<string, number> = {}
            list.forEach(item => { if (item.label) rowApps[item.label.trim()] = item.amount })

            sortedApps.forEach(app => {
                row[`app_${app}`] = rowApps[app] || 0
            })

            return row
        })

        await exportToExcelTable('Closing List', `closing-list-${monthInputValue}.xlsx`, columns, data)
    }

    if (loading && branches.length === 0) return <div className="p-6 text-gray-200">{t.common.loading}</div>

    return (
        <div className="max-w-none mx-auto p-4 text-gray-100">
            {/* Header */}
            <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-white">{t.title}</h1>
                </div>

                <div className="flex items-center gap-2">
                    {/* Branch Picker */}
                    <select
                        value={selectedBranchId}
                        onChange={(e) => setSelectedBranchId(e.target.value)}
                        className="h-9 rounded-lg border border-blue-400/30 bg-blue-600/15 text-blue-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                    >
                        <option value="all">All Branches</option>
                        {branches.map(b => (
                            <option key={b.id} value={b.id} className="text-gray-900">{b.name}</option>
                        ))}
                    </select>

                    {/* Search box */}
                    <div className="relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                        <input
                            type="text"
                            placeholder={t.search.placeholder}
                            value={qText}
                            onChange={e => setQText(e.target.value)}
                            className="h-9 pl-9 pr-3 rounded-lg border border-blue-400/30 bg-blue-600/15
                         text-blue-100 placeholder-blue-300 caret-blue-200
                         focus:outline-none focus:ring-2 focus:ring-blue-400/40 w-[200px]"
                        />
                    </div>

                    {/* Export Button */}
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                        title="Export to CSV"
                    >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                        <span className="hidden sm:inline">Export</span>
                    </button>
                </div>
            </div>

            {/* Divider */}
            <div className="border-t border-blue-400/20 my-3"></div>

            {/* Month Nav */}
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

            {/* Table */}
            <div className="bg-white rounded-2xl shadow p-3">
                <table className="w-full table-auto text-sm text-gray-900">
                    <thead>
                        <tr>
                            <ColumnHeader colKey="date" label={t.table.headers.date} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.date || []} activeFilter={columnFilters.date || null} onFilter={(s) => applyColumnFilter('date', s)} onClear={() => clearColumnFilter('date')} open={openMenu === 'date'} onToggle={() => setOpenMenu(v => v === 'date' ? null : 'date')} onClose={() => setOpenMenu(null)} dict={t.table.columnMenu} center className="w-[100px]" />
                            <ColumnHeader colKey="dow" label={t.table.headers.day} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.dow || []} activeFilter={columnFilters.dow || null} onFilter={(s) => applyColumnFilter('dow', s)} onClear={() => clearColumnFilter('dow')} open={openMenu === 'dow'} onToggle={() => setOpenMenu(v => v === 'dow' ? null : 'dow')} onClose={() => setOpenMenu(null)} dict={t.table.columnMenu} center className="w-[50px]" />
                            <ColumnHeader colKey="time" label={t.table.headers.time} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.time || []} activeFilter={columnFilters.time || null} onFilter={(s) => applyColumnFilter('time', s)} onClear={() => clearColumnFilter('time')} open={openMenu === 'time'} onToggle={() => setOpenMenu(v => v === 'time' ? null : 'time')} onClose={() => setOpenMenu(null)} dict={t.table.columnMenu} center className="w-[70px]" />
                            <ColumnHeader colKey="branch" label={t.table.headers.branch} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.branch || []} activeFilter={columnFilters.branch || null} onFilter={(s) => applyColumnFilter('branch', s)} onClear={() => clearColumnFilter('branch')} open={openMenu === 'branch'} onToggle={() => setOpenMenu(v => v === 'branch' ? null : 'branch')} onClose={() => setOpenMenu(null)} dict={t.table.columnMenu} center className="w-[180px]" />
                            <ColumnHeader colKey="unpaid" label={t.table.headers.unpaid} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.unpaid || []} activeFilter={columnFilters.unpaid || null} onFilter={(s) => applyColumnFilter('unpaid', s)} onClear={() => clearColumnFilter('unpaid')} open={openMenu === 'unpaid'} onToggle={() => setOpenMenu(v => v === 'unpaid' ? null : 'unpaid')} onClose={() => setOpenMenu(null)} dict={t.table.columnMenu} right />
                            <ColumnHeader colKey="cashout" label={t.table.headers.cashOut} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.cashout || []} activeFilter={columnFilters.cashout || null} onFilter={(s) => applyColumnFilter('cashout', s)} onClear={() => clearColumnFilter('cashout')} open={openMenu === 'cashout'} onToggle={() => setOpenMenu(v => v === 'cashout' ? null : 'cashout')} onClose={() => setOpenMenu(null)} dict={t.table.columnMenu} right />
                            <ColumnHeader colKey="card" label={t.table.headers.card} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.card || []} activeFilter={columnFilters.card || null} onFilter={(s) => applyColumnFilter('card', s)} onClear={() => clearColumnFilter('card')} open={openMenu === 'card'} onToggle={() => setOpenMenu(v => v === 'card' ? null : 'card')} onClose={() => setOpenMenu(null)} dict={t.table.columnMenu} right />
                            <ColumnHeader colKey="transfer" label={t.table.headers.transfer} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.transfer || []} activeFilter={columnFilters.transfer || null} onFilter={(s) => applyColumnFilter('transfer', s)} onClear={() => clearColumnFilter('transfer')} open={openMenu === 'transfer'} onToggle={() => setOpenMenu(v => v === 'transfer' ? null : 'transfer')} onClose={() => setOpenMenu(null)} dict={t.table.columnMenu} right />
                            <ColumnHeader colKey="cashToTake" label={t.table.headers.cashToTake} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.cashToTake || []} activeFilter={columnFilters.cashToTake || null} onFilter={(s) => applyColumnFilter('cashToTake', s)} onClear={() => clearColumnFilter('cashToTake')} open={openMenu === 'cashToTake'} onToggle={() => setOpenMenu(v => v === 'cashToTake' ? null : 'cashToTake')} onClose={() => setOpenMenu(null)} dict={t.table.columnMenu} right />
                            <ColumnHeader colKey="revenue" label={t.table.headers.revenue} sortKey={sortKey} sortAsc={sortAsc} onSort={applySort} values={columnValues.revenue || []} activeFilter={columnFilters.revenue || null} onFilter={(s) => applyColumnFilter('revenue', s)} onClear={() => clearColumnFilter('revenue')} open={openMenu === 'revenue'} onToggle={() => setOpenMenu(v => v === 'revenue' ? null : 'revenue')} onClose={() => setOpenMenu(null)} dict={t.table.columnMenu} right />
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={10} className="text-center text-gray-500 py-6">
                                    {t.table.noResults}
                                </td>
                            </tr>
                        )}
                        {filtered.map(r => (
                            <tr
                                key={r.id}
                                className="border-t hover:bg-blue-50/40 cursor-pointer"
                                onClick={() => router.push(`/daily-reports/cashier-closing?id=${r.id}&mode=readonly`)}
                            >
                                <td className="p-2 truncate max-w-[100px] text-center" title={formatDMY(r.date)}>{formatDMY(r.date)}</td>
                                <td className="p-2 lowercase font-mono text-center truncate max-w-[50px]" title={dow3(r.date)}>{dow3(r.date)}</td>
                                <td className="p-2 text-center truncate max-w-[70px]" title={r.time}>{r.time}</td>
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
                                <td className="p-2" colSpan={4}>{t.table.totals}</td>
                                <td className="p-2 text-right font-bold">{fmt(stats.totalUnpaid)}</td>
                                <td className="p-2 text-right font-bold">{fmt(stats.totalCashout)}</td>
                                <td className="p-2 text-right font-bold">{fmt(stats.totalCard)}</td>
                                <td className="p-2 text-right font-bold">{fmt(stats.totalTransfer)}</td>
                                <td className="p-2 text-right font-bold bg-blue-100/10 underline decoration-blue-500/30">{fmt(stats.totalToTake)}</td>
                                <td className="p-2 text-right font-bold">{fmt(stats.totalRevenue)}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
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
    const ref = useRef<HTMLDivElement>(null)
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
        return { top: rect.bottom + 4, left: right ? Math.max(0, rect.right - 220) : rect.left }
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

    function toggleOne(v: string) {
        const next = new Set(localChecked)
        if (next.has(v)) next.delete(v)
        else next.add(v)
        setLocalChecked(next)
    }

    function handleApply() {
        // If all values are checked, remove the filter entirely
        if (localChecked.size >= values.length) onFilter(null)
        else onFilter(new Set(localChecked))
    }

    return (
        <th className={`p-2 ${right ? 'text-right' : ''} ${className} relative`} ref={ref as any}>
            <div className={`flex items-center gap-1 font-semibold ${center ? 'justify-center' : right ? 'justify-end' : 'justify-start'}`}>
                <span className="select-none">{label}</span>
                {/* Sort indicator */}
                {isActive && (
                    sortAsc
                        ? <BarsArrowUpIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                        : <BarsArrowDownIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                )}
                {/* Filter indicator */}
                {hasFilter && <FunnelIcon className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />}
                {/* Kebab menu button */}
                <button
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
                            onClick={() => onSort(colKey, true)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${isActive && sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'
                                }`}
                        >
                            <BarsArrowUpIcon className="w-4 h-4" />
                            {dict.sortAsc}
                        </button>
                        <button
                            onClick={() => onSort(colKey, false)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${isActive && !sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'
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
                            onClick={toggleAll}
                            className="text-xs text-blue-600 hover:text-blue-800 mb-1 cursor-pointer"
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
                            onClick={onClear}
                            className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
                        >
                            {dict.clearFilters}
                        </button>
                        <button
                            onClick={handleApply}
                            className="px-3 py-1 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer"
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
