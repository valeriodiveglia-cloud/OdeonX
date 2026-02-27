'use client'

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import { useCashLedger, CashLedgerRow } from './_data/useCashLedger'
import {
    CalendarDaysIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    BuildingLibraryIcon,
    ArrowDownTrayIcon,
    EllipsisVerticalIcon,
    BarsArrowUpIcon,
    BarsArrowDownIcon,
    FunnelIcon,
} from '@heroicons/react/24/outline'

import { exportToExcelTable, type ExcelColumn } from '@/lib/exportUtils'

type Branch = {
    id: string
    name: string
}

type SortKey = 'date' | 'day' | 'branch' | 'amount' | 'status' | 'depositDate'

const columnMenuDict = {
    sortAsc: 'Sort Ascending',
    sortDesc: 'Sort Descending',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    filterPlaceholder: 'Search...',
    clearFilters: 'Clear Filters',
}

export default function CashLedgerPage() {
    const now = new Date()
    const [year, setYear] = useState(now.getFullYear())
    const [month, setMonth] = useState(now.getMonth()) // 0-11
    const [selectedBranch, setSelectedBranch] = useState<string>('') // '' = All
    const [branches, setBranches] = useState<Branch[]>([])
    const [branchesLoading, setBranchesLoading] = useState(true)

    const [sortKey, setSortKey] = useState<SortKey>('date')
    const [sortAsc, setSortAsc] = useState(false)
    const [columnFilters, setColumnFilters] = useState<Record<string, Set<string> | null>>({})
    const [openMenu, setOpenMenu] = useState<SortKey | null>(null)

    // Load branches
    useEffect(() => {
        async function loadBranches() {
            const { data } = await supabase.from('provider_branches').select('id, name').order('name')
            if (data) {
                setBranches(data)
            }
            setBranchesLoading(false)
        }
        loadBranches()
    }, [])

    const { rows, loading, refresh, deposit, undeposit, updateDepositDate, totalPending } = useCashLedger({
        year,
        month,
        branchName: selectedBranch || null
    })

    const handlePrevMonth = () => {
        if (month === 0) {
            setMonth(11)
            setYear(y => y - 1)
        } else {
            setMonth(m => m - 1)
        }
    }

    const handleNextMonth = () => {
        if (month === 11) {
            setMonth(0)
            setYear(y => y + 1)
        } else {
            setMonth(m => m + 1)
        }
    }

    const monthLabel = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
    const monthInputValue = `${year}-${String(month + 1).padStart(2, '0')}`

    function onPickMonth(val: string) {
        const [y, m] = val.split('-').map(Number)
        if (y && m) {
            setYear(y)
            setMonth(m - 1)
        }
    }

    function applySort(k: SortKey, asc: boolean) {
        setSortKey(k); setSortAsc(asc); setOpenMenu(null)
    }
    function applyColumnFilter(col: SortKey, vals: Set<string> | null) {
        setColumnFilters(prev => ({ ...prev, [col]: vals })); setOpenMenu(null)
    }
    function clearColumnFilter(col: SortKey) {
        setColumnFilters(prev => { const n = { ...prev }; delete n[col]; return n }); setOpenMenu(null)
    }

    // Display value helper for filter checkboxes
    const displayValue = useCallback((r: CashLedgerRow, key: SortKey): string => {
        switch (key) {
            case 'date': return formatDMY(r.date)
            case 'day': return formatDay(new Date(r.date))
            case 'branch': return r.branch || ''
            case 'amount': return fmt(r.cash_to_take)
            case 'status': return r.cash_to_take === 0 ? 'Null' : (r.deposited ? 'Deposited' : 'Pending')
            case 'depositDate': return r.deposited && r.deposit_date ? formatDMY(r.deposit_date) : '-'
            default: return ''
        }
    }, [])

    // Unique filterable values per column
    const columnValues = useMemo(() => {
        const map: Record<string, string[]> = {}
        const keys: SortKey[] = ['date', 'day', 'branch', 'amount', 'status', 'depositDate']
        keys.forEach(k => {
            const s = new Set<string>()
            rows.forEach(r => { const v = displayValue(r, k); if (v) s.add(v) })
            map[k] = Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        })
        return map
    }, [rows, displayValue])

    const kpis = useMemo(() => {
        let deposited = 0
        let pending = 0
        for (const r of rows) {
            if (r.deposited) {
                deposited += r.cash_to_take
            } else {
                pending += r.cash_to_take
            }
        }
        return { deposited, pending }
    }, [rows])

    const sortedRows = useMemo(() => {
        let out = [...rows]
        // Apply column filters
        for (const [col, allowed] of Object.entries(columnFilters)) {
            if (!allowed) continue
            out = out.filter(r => allowed.has(displayValue(r, col as SortKey)))
        }
        out.sort((a, b) => {
            let cmp = 0
            switch (sortKey) {
                case 'date':
                case 'day':
                    cmp = new Date(a.date).getTime() - new Date(b.date).getTime()
                    break
                case 'branch':
                    cmp = a.branch.localeCompare(b.branch)
                    break
                case 'amount':
                    cmp = a.cash_to_take - b.cash_to_take
                    break
                case 'status':
                    cmp = (a.deposited ? 1 : 0) - (b.deposited ? 1 : 0)
                    break
                case 'depositDate':
                    cmp = (a.deposit_date || '').localeCompare(b.deposit_date || '')
                    break
            }
            return sortAsc ? cmp : -cmp
        })
        return out
    }, [rows, sortKey, sortAsc, columnFilters, displayValue])

    async function handleExport() {
        const columns: ExcelColumn[] = [
            { header: 'Date', key: 'date', width: 12, total: 'Totals:' },
            { header: 'Day', key: 'day', width: 12 },
            { header: 'Branch', key: 'branch', width: 20 },
            { header: 'Cash Revenues', key: 'amount', width: 15, total: true, fmt: '#,##0' },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Deposit Date', key: 'depositDate', width: 15 },
        ]

        const data = sortedRows.map(r => ({
            date: formatDMY(r.date),
            day: formatDay(new Date(r.date)),
            branch: r.branch,
            amount: r.cash_to_take,
            status: r.cash_to_take === 0 ? 'Null' : (r.deposited ? 'Deposited' : 'Pending'),
            depositDate: r.deposited && r.deposit_date ? formatDMY(r.deposit_date) : ''
        }))

        // KPIs
        const extraRows = [
            ['Deposited (Current Month)', '', '', fmt(kpis.deposited)],
            ['Pending (Current Month)', '', '', fmt(kpis.pending)],
            ['Total Pending', '', '', fmt(totalPending)]
        ]

        await exportToExcelTable('Cash Ledger', `cash-ledger-${monthInputValue}.xlsx`, columns, data, extraRows)
    }

    if (branchesLoading) return <CircularLoader />

    return (
        <div className="max-w-none mx-auto p-4 text-gray-100">
            {/* Header */}
            <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-white">Cash Ledger</h1>
                </div>

                <div className="flex items-center gap-2">
                    {/* Branch Picker */}
                    <select
                        value={selectedBranch}
                        onChange={e => setSelectedBranch(e.target.value)}
                        className="h-9 rounded-lg border border-blue-400/30 bg-blue-600/15 text-blue-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                    >
                        <option value="" className="text-gray-900">All Branches</option>
                        {branches.map(b => (
                            <option key={b.id} value={b.name} className="text-gray-900">{b.name}</option>
                        ))}
                    </select>

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
                        onClick={handlePrevMonth}
                        className="text-blue-200 hover:text-white underline underline-offset-4 decoration-blue-300/40"
                    >
                        Previous
                    </button>
                </div>
                <div className="justify-self-center flex items-center gap-2">
                    <span className="text-white font-semibold">{monthLabel}</span>
                    <div className="relative w-6 h-6">
                        <CalendarDaysIcon className="w-6 h-6 text-blue-200" />
                        <input
                            type="month"
                            value={monthInputValue}
                            onChange={e => onPickMonth(e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                    </div>
                </div>
                <div className="justify-self-end">
                    <button
                        type="button"
                        onClick={handleNextMonth}
                        className="text-blue-200 hover:text-white underline underline-offset-4 decoration-blue-300/40"
                    >
                        Next
                    </button>
                </div>
            </div>

            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                <StatPill label="Deposited (Current Month)" value={kpis.deposited} money />
                <StatPill label="Pending (Current Month)" value={kpis.pending} money />
                <StatPill label="Total Pending" value={totalPending} money />
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow p-3 overflow-x-auto">
                {loading ? (
                    <div className="flex justify-center p-12"><CircularLoader /></div>
                ) : (
                    <table className="w-full table-auto text-sm text-gray-900">
                        <thead>
                            <tr>
                                {([
                                    ['date', 'Date'],
                                    ['day', 'Day'],
                                    ['branch', 'Branch'],
                                    ['amount', 'Cash Revenues', true],
                                    ['status', 'Status', false, true],
                                    ['depositDate', 'Deposit Date', false, true],
                                ] as [SortKey, string, boolean?, boolean?][]).map(([k, lbl, right, center]) => (
                                    <ColumnHeader
                                        key={k}
                                        colKey={k}
                                        label={lbl}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues[k] || []}
                                        activeFilter={columnFilters[k] || null}
                                        onFilter={(s) => applyColumnFilter(k, s)}
                                        onClear={() => clearColumnFilter(k)}
                                        open={openMenu === k}
                                        onToggle={() => setOpenMenu(openMenu === k ? null : k)}
                                        onClose={() => setOpenMenu(null)}
                                        dict={columnMenuDict}
                                        right={!!right}
                                        center={!!center}
                                    />
                                ))}
                                <th className="p-2 text-center font-semibold text-gray-700">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedRows.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center text-gray-500 py-6">
                                        No data found for this period.
                                    </td>
                                </tr>
                            )}
                            {sortedRows.map((row, idx) => {
                                const dateObj = new Date(row.date)
                                return (
                                    <tr key={`${row.date}-${row.branch}-${idx}`} className="border-t hover:bg-blue-50/40">
                                        <td className="p-2 whitespace-nowrap">{formatDMY(row.date)}</td>
                                        <td className="p-2 whitespace-nowrap text-gray-600">{formatDay(dateObj)}</td>
                                        <td className="p-2 whitespace-nowrap">{row.branch}</td>
                                        <td className="p-2 whitespace-nowrap text-right tabular-nums font-semibold text-gray-900">
                                            {fmt(row.cash_to_take)}
                                        </td>
                                        <td className="p-2 whitespace-nowrap text-center">
                                            {row.cash_to_take === 0 ? (
                                                <span className="text-gray-400">Null</span>
                                            ) : row.deposited ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">
                                                    <CheckCircleIcon className="w-3 h-3 mr-1" />
                                                    Deposited
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800">
                                                    <ExclamationCircleIcon className="w-3 h-3 mr-1" />
                                                    Pending
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-2 whitespace-nowrap text-center">
                                            {row.deposited && row.deposit_date ? (
                                                <div className="flex items-center justify-center gap-1 group">
                                                    <span className="text-gray-700">{formatDMY(row.deposit_date)}</span>
                                                    <div className="relative w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-blue-500">
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                                                        </svg>
                                                        <input
                                                            type="date"
                                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                                            value={row.deposit_date}
                                                            onChange={(e) => updateDepositDate(row, e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="p-2 whitespace-nowrap text-center">
                                            {row.cash_to_take > 0 && (
                                                <button
                                                    onClick={() => row.deposited ? undeposit(row) : deposit(row)}
                                                    title={row.deposited ? "Undo Deposit" : "Mark as Deposited"}
                                                    className={`p-0 h-auto w-auto bg-transparent hover:opacity-80 transition-opacity ${row.deposited ? 'text-blue-600' : 'text-gray-400 hover:text-blue-600'}`}
                                                >
                                                    <BuildingLibraryIcon className="w-5 h-5" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                            {sortedRows.length > 0 && (
                                <tr className="border-t bg-gray-50 font-semibold">
                                    <td className="p-2" colSpan={3}>Totals</td>
                                    <td className="p-2 text-right tabular-nums text-gray-900">
                                        {fmt(sortedRows.reduce((sum, r) => sum + r.cash_to_take, 0))}
                                    </td>
                                    <td className="p-2" colSpan={3}></td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}

/* --- Column Header with Excel-style dropdown --- */
type ColumnHeaderProps = {
    colKey: SortKey; label: string; sortKey: SortKey; sortAsc: boolean
    onSort: (k: SortKey, asc: boolean) => void; values: string[]
    activeFilter: Set<string> | null; onFilter: (s: Set<string> | null) => void; onClear: () => void
    open: boolean; onToggle: () => void; onClose: () => void
    dict: { sortAsc: string; sortDesc: string; selectAll: string; deselectAll: string; filterPlaceholder: string; clearFilters: string }
    right?: boolean; center?: boolean; className?: string
}

function ColumnHeader({ colKey, label, sortKey, sortAsc, onSort, values, activeFilter, onFilter, onClear, open, onToggle, onClose, dict, right, center, className = '' }: ColumnHeaderProps) {
    const ref = useRef<HTMLDivElement>(null)
    const [filterSearch, setFilterSearch] = useState('')
    const [localChecked, setLocalChecked] = useState<Set<string>>(new Set(values))

    useEffect(() => { if (open) { setLocalChecked(activeFilter ? new Set(activeFilter) : new Set(values)); setFilterSearch('') } }, [open, values, activeFilter])
    useEffect(() => {
        if (!open) return
        function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
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
    const filteredValues = filterSearch ? values.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase())) : values
    const allVisibleChecked = filteredValues.length > 0 && filteredValues.every(v => localChecked.has(v))
    function toggleAll() { const next = new Set(localChecked); if (allVisibleChecked) { filteredValues.forEach(v => next.delete(v)) } else { filteredValues.forEach(v => next.add(v)) }; setLocalChecked(next) }
    function toggleOne(v: string) { const next = new Set(localChecked); if (next.has(v)) next.delete(v); else next.add(v); setLocalChecked(next) }
    function handleApply() { if (localChecked.size >= values.length) onFilter(null); else onFilter(new Set(localChecked)) }

    return (
        <th className={`p-2 ${right ? 'text-right' : center ? 'text-center' : ''} ${className} relative`} ref={ref as any}>
            <div className={`flex items-center gap-1 font-semibold ${center ? 'justify-center' : right ? 'justify-end' : 'justify-start'}`}>
                <span className="select-none">{label}</span>
                {isActive && (sortAsc ? <BarsArrowUpIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" /> : <BarsArrowDownIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />)}
                {hasFilter && <FunnelIcon className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />}
                <button onClick={(e) => { e.stopPropagation(); onToggle() }} className="ml-0.5 p-0.5 rounded hover:bg-gray-200 transition-colors flex-shrink-0 cursor-pointer" aria-label={`Menu ${label}`}>
                    <EllipsisVerticalIcon className="w-4 h-4 text-gray-500" />
                </button>
            </div>
            {open && (
                <div className="fixed bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] min-w-[220px] text-left text-sm text-gray-700" style={dropdownStyle} onClick={e => e.stopPropagation()}>
                    <div className="px-3 py-2 space-y-1">
                        <button onClick={() => onSort(colKey, true)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${isActive && sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'}`}><BarsArrowUpIcon className="w-4 h-4" />{dict.sortAsc}</button>
                        <button onClick={() => onSort(colKey, false)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${isActive && !sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'}`}><BarsArrowDownIcon className="w-4 h-4" />{dict.sortDesc}</button>
                    </div>
                    <div className="border-t border-gray-200" />
                    <div className="px-3 py-2">
                        <input type="text" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder={dict.filterPlaceholder} className="w-full mb-2 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        <button onClick={toggleAll} className="text-xs text-blue-600 hover:text-blue-800 mb-1 cursor-pointer">{allVisibleChecked ? dict.deselectAll : dict.selectAll}</button>
                        <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                            {filteredValues.map(v => (<label key={v} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer"><input type="checkbox" checked={localChecked.has(v)} onChange={() => toggleOne(v)} className="accent-blue-600 rounded" /><span className="truncate text-xs">{v}</span></label>))}
                            {filteredValues.length === 0 && (<div className="text-xs text-gray-400 py-1 text-center">—</div>)}
                        </div>
                    </div>
                    <div className="border-t border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
                        <button onClick={onClear} className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer">{dict.clearFilters}</button>
                        <button onClick={handleApply} className="px-3 py-1 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer">OK</button>
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

function formatDay(d: Date) {
    return d.toLocaleDateString('en-US', { weekday: 'long' })
}

function fmt(n: number | undefined) {
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n || 0))
}
