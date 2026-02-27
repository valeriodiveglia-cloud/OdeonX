'use client'

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import {
    CalendarDaysIcon,
    MagnifyingGlassIcon,
    ArrowDownTrayIcon,
    EllipsisVerticalIcon,
    BarsArrowUpIcon,
    BarsArrowDownIcon,
    FunnelIcon,
} from '@heroicons/react/24/outline'
import { useCashout, type CashoutRow } from '../../daily-reports/_data/useCashout'
import { useSettings } from '@/contexts/SettingsContext'
import { getMonthlyReportsDictionary } from '../_i18n'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'

import { exportToExcelTable, type ExcelColumn } from '@/lib/exportUtils'

type SortKey = 'date' | 'time' | 'description' | 'category' | 'amount' | 'supplier' | 'invoice' | 'delivery' | 'branch' | 'paidBy'

type Branch = { id: string; name: string }

export default function MonthlyCashoutPage() {
    const { language } = useSettings()
    const dict = getMonthlyReportsDictionary(language)
    const t = dict.cashout

    const [qText, setQText] = useState('')
    const [sortKey, setSortKey] = useState<SortKey>('date')
    const [sortAsc, setSortAsc] = useState(false)
    const [columnFilters, setColumnFilters] = useState<Record<string, Set<string> | null>>({})
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
    const { rows, loading } = useCashout({
        year: monthCursor.getFullYear(),
        month: monthCursor.getMonth(),
        branchName: selectedBranchName,
    })

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
    const displayValue = useCallback((r: CashoutRow, key: SortKey): string => {
        switch (key) {
            case 'date': return formatDMY(r.date)
            case 'time': return extractHHMM(r.created_at)
            case 'description': return r.description || ''
            case 'category': return r.category || ''
            case 'amount': return fmt(r.amount)
            case 'supplier': return r.supplier_name || ''
            case 'invoice': return r.invoice ? 'Yes' : '-'
            case 'delivery': return r.deliveryNote ? 'Yes' : '-'
            case 'branch': return r.branch || ''
            case 'paidBy': return r.paidBy || ''
            default: return ''
        }
    }, [])

    // Search & Sort
    // Unique filterable values per column
    const columnValues = useMemo(() => {
        const map: Record<string, string[]> = {}
        const keys: SortKey[] = ['date', 'time', 'description', 'category', 'amount', 'supplier', 'invoice', 'delivery', 'branch', 'paidBy']
        keys.forEach(k => {
            const s = new Set<string>()
            rows.forEach(r => { const v = displayValue(r, k); if (v) s.add(v) })
            map[k] = Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        })
        return map
    }, [rows, displayValue])

    const filtered = useMemo(() => {
        let out = rows.slice()
        if (qText.trim()) {
            const s = qText.trim().toLowerCase()
            out = out.filter(r =>
                (r.description || '').toLowerCase().includes(s) ||
                (r.category || '').toLowerCase().includes(s) ||
                (r.supplier_name || '').toLowerCase().includes(s) ||
                (r.branch || '').toLowerCase().includes(s) ||
                (r.paidBy || '').toLowerCase().includes(s) ||
                formatDMY(r.date).includes(s)
            )
        }
        // Apply column filters
        for (const [col, allowed] of Object.entries(columnFilters)) {
            if (!allowed) continue
            out = out.filter(r => allowed.has(displayValue(r, col as SortKey)))
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
        const totalAmount = filtered.reduce((s, r) => s + (r.amount || 0), 0)
        return { count, totalAmount }
    }, [filtered])

    function prevMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), -1)) }
    function nextMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), 1)) }
    function onPickMonth(val: string) {
        const d = fromMonthInputValue(val)
        if (d) setMonthCursor(d)
    }

    async function handleExport() {
        const columns: ExcelColumn[] = [
            { header: t.table.headers.date, key: 'date', width: 12, total: 'Totals:' },
            { header: t.table.headers.time, key: 'time', width: 8 },
            { header: t.table.headers.description, key: 'description', width: 40 },
            { header: t.table.headers.category, key: 'category', width: 20 },
            { header: t.table.headers.amount, key: 'amount', width: 15, total: true, fmt: '#,##0' },
            { header: t.table.headers.supplier, key: 'supplier', width: 25 },
            { header: t.table.headers.invoice, key: 'invoice', width: 10 },
            { header: t.table.headers.deliveryNote, key: 'delivery', width: 10 },
            { header: t.table.headers.branch, key: 'branch', width: 15 },
            { header: t.table.headers.paidBy, key: 'paidBy', width: 20 },
        ]

        const data = filtered.map(r => ({
            date: formatDMY(r.date),
            time: extractHHMM(r.created_at),
            description: r.description,
            category: r.category,
            amount: r.amount,
            supplier: r.supplier_name,
            invoice: r.invoice ? 'Yes' : 'No',
            delivery: r.deliveryNote ? 'Yes' : 'No',
            branch: r.branch,
            paidBy: r.paidBy
        }))

        await exportToExcelTable('Cashout', `cashout-${monthInputValue}.xlsx`, columns, data)
    }

    if (loading && branches.length === 0) return <CircularLoader />

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
                            placeholder={t.modal.description}
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
                        {t.modal.buttons.close}
                        Previous
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
                        />
                    </div>
                </div>
                <div className="justify-self-end">
                    <button
                        type="button"
                        onClick={nextMonth}
                        className="text-blue-200 hover:text-white underline underline-offset-4 decoration-blue-300/40"
                    >
                        Next
                    </button>
                </div>
            </div>

            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-2 gap-2 mb-3">
                <StatPill label="Total Transactions" value={stats.count} />
                <StatPill label={t.table.headers.amount} value={stats.totalAmount} money />
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow p-3 overflow-x-auto">
                <table className="w-full table-auto text-sm text-gray-900">
                    <thead>
                        <tr>
                            {([['date', t.table.headers.date], ['time', t.table.headers.time], ['description', t.table.headers.description], ['category', t.table.headers.category], ['amount', t.table.headers.amount, true], ['supplier', t.table.headers.supplier], ['invoice', t.table.headers.invoice], ['delivery', t.table.headers.deliveryNote], ['branch', t.table.headers.branch], ['paidBy', t.table.headers.paidBy]] as [SortKey, string, boolean?][]).map(([k, lbl, right]) => (
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
                                    dict={t.table.columnMenu}
                                    right={!!right}
                                />
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={10} className="text-center text-gray-500 py-6">
                                    {t.table.noRows}
                                </td>
                            </tr>
                        )}
                        {filtered.map(r => (
                            <tr key={r.id} className="border-t hover:bg-blue-50/40">
                                <td className="p-2 whitespace-nowrap">{formatDMY(r.date)}</td>
                                <td className="p-2 whitespace-nowrap text-gray-500">{extractHHMM(r.created_at)}</td>
                                <td className="p-2 whitespace-nowrap font-medium">{r.description}</td>
                                <td className="p-2 whitespace-nowrap text-gray-600">{r.category}</td>
                                <td className="p-2 whitespace-nowrap text-right tabular-nums font-semibold">{fmt(r.amount)}</td>
                                <td className="p-2 whitespace-nowrap text-gray-600">{r.supplier_name}</td>
                                <td className="p-2 whitespace-nowrap text-center">{r.invoice ? 'Yes' : '-'}</td>
                                <td className="p-2 whitespace-nowrap text-center">{r.deliveryNote ? 'Yes' : '-'}</td>
                                <td className="p-2 whitespace-nowrap text-gray-600">{r.branch}</td>
                                <td className="p-2 whitespace-nowrap text-gray-600">{r.paidBy}</td>
                            </tr>
                        ))}
                        {filtered.length > 0 && (
                            <tr className="border-t bg-gray-50 font-semibold">
                                <td className="p-2" colSpan={4}>{t.table.totals || 'Totals'}</td>
                                <td className="p-2 text-right">{fmt(stats.totalAmount)}</td>
                                <td className="p-2" colSpan={5}></td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

/* --- Helpers UI --- */
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

    useEffect(() => {
        if (open) {
            setLocalChecked(activeFilter ? new Set(activeFilter) : new Set(values))
            setFilterSearch('')
        }
    }, [open, values, activeFilter])

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
        if (allVisibleChecked) { filteredValues.forEach(v => next.delete(v)) }
        else { filteredValues.forEach(v => next.add(v)) }
        setLocalChecked(next)
    }

    function toggleOne(v: string) {
        const next = new Set(localChecked)
        if (next.has(v)) next.delete(v); else next.add(v)
        setLocalChecked(next)
    }

    function handleApply() {
        if (localChecked.size >= values.length) onFilter(null)
        else onFilter(new Set(localChecked))
    }

    return (
        <th className={`p-2 ${right ? 'text-right' : ''} ${className} relative`} ref={ref as any}>
            <div className={`flex items-center gap-1 font-semibold ${center ? 'justify-center' : right ? 'justify-end' : 'justify-start'}`}>
                <span className="select-none">{label}</span>
                {isActive && (
                    sortAsc
                        ? <BarsArrowUpIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                        : <BarsArrowDownIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                )}
                {hasFilter && <FunnelIcon className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />}
                <button
                    onClick={(e) => { e.stopPropagation(); onToggle() }}
                    className="ml-0.5 p-0.5 rounded hover:bg-gray-200 transition-colors flex-shrink-0 cursor-pointer"
                    aria-label={`Menu ${label}`}
                >
                    <EllipsisVerticalIcon className="w-4 h-4 text-gray-500" />
                </button>
            </div>

            {open && dropdownStyle && (
                <div
                    className="fixed bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] min-w-[220px] text-left text-sm text-gray-700"
                    style={dropdownStyle}
                    onClick={e => e.stopPropagation()}
                >
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

                    <div className="border-t border-gray-200" />

                    <div className="px-3 py-2">
                        <input
                            type="text"
                            value={filterSearch}
                            onChange={e => setFilterSearch(e.target.value)}
                            placeholder={dict.filterPlaceholder}
                            className="w-full mb-2 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <button
                            onClick={toggleAll}
                            className="text-xs text-blue-600 hover:text-blue-800 mb-1 cursor-pointer"
                        >
                            {allVisibleChecked ? dict.deselectAll : dict.selectAll}
                        </button>
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
function extractHHMM(iso?: string | null) {
    if (!iso) return ''
    try {
        const d = new Date(iso)
        const p = (n: number) => String(n).padStart(2, '0')
        return `${p(d.getHours())}:${p(d.getMinutes())}`
    } catch { return '' }
}
function sortValue(r: CashoutRow, key: SortKey) {
    switch (key) {
        case 'date': return new Date(r.date).getTime()
        case 'time': return r.created_at ? new Date(r.created_at).getTime() : 0
        case 'description': return r.description
        case 'category': return r.category || ''
        case 'amount': return r.amount
        case 'supplier': return r.supplier_name || ''
        case 'invoice': return r.invoice ? 1 : 0
        case 'delivery': return r.deliveryNote ? 1 : 0
        case 'branch': return r.branch || ''
        case 'paidBy': return r.paidBy || ''
        default: return 0
    }
}
function fmt(n: number) { return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function toMonthInputValue(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function fromMonthInputValue(val: string) { const [y, m] = val.split('-').map(Number); return new Date(y, m - 1, 1) }
function formatMonthLabel(d: Date) { return d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) }
