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
import { useCredits, type CreditRow, type Totals } from '../../daily-reports/_data/useCredits'
import { useSettings } from '@/contexts/SettingsContext'
import { getMonthlyReportsDictionary } from '../_i18n'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import MonthPicker from '@/components/MonthPicker'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/Button'
import {
    TableContainer,
    Table,
    TableHead,
    TableHeadRow,
    TableBody,
    TableRow,
    TableCell,
} from '@/components/Table'

import { exportToExcelTable, type ExcelColumn } from '@/lib/exportUtils'

type SortKey = 'date' | 'customer' | 'amount' | 'paid' | 'remaining' | 'status' | 'branch' | 'reference' | 'shift' | 'handledBy'

type Branch = { id: string; name: string }

export default function MonthlyCreditsPage() {
    const { language } = useSettings()
    const dict = getMonthlyReportsDictionary(language)
    const t = dict.credits || {
        title: 'Credits',
        table: {
            headers: { date: 'Date', customer: 'Customer', amount: 'Amount', paid: 'Paid', remaining: 'Remaining', status: 'Status', branch: 'Branch', reference: 'Reference', shift: 'Shift', handledBy: 'Handled By' },
            noRows: 'No credits found.',
            totals: 'Totals'
        }
    }

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
    const { rows, totalsMap, loading } = useCredits({
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
    const displayValue = useCallback((r: CreditRow, key: SortKey): string => {
        const tot = totalsMap[r.id]
        switch (key) {
            case 'date': return formatDMY(r.date)
            case 'customer': return r.customer_name || ''
            case 'amount': return fmt(r.amount)
            case 'paid': return fmt(tot?.paid)
            case 'remaining': return fmt(tot?.remaining)
            case 'status': return tot?.status || ''
            case 'branch': return r.branch || ''
            case 'reference': return r.reference || ''
            case 'shift': return r.shift || ''
            case 'handledBy': return r.handledBy || ''
            default: return ''
        }
    }, [totalsMap])

    // Unique filterable values per column
    const columnValues = useMemo(() => {
        const map: Record<string, string[]> = {}
        const keys: SortKey[] = ['date', 'customer', 'amount', 'paid', 'remaining', 'status', 'branch', 'reference', 'shift', 'handledBy']
        keys.forEach(k => {
            const s = new Set<string>()
            rows.forEach(r => { const v = displayValue(r, k); if (v) s.add(v) })
            map[k] = Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        })
        return map
    }, [rows, displayValue])

    // Search & Sort
    const filtered = useMemo(() => {
        let out = rows.slice()
        // Apply column filters
        for (const [col, allowed] of Object.entries(columnFilters)) {
            if (!allowed) continue
            out = out.filter(r => allowed.has(displayValue(r, col as SortKey)))
        }
        out.sort((a, b) => {
            const av = sortValue(a, sortKey, totalsMap)
            const bv = sortValue(b, sortKey, totalsMap)
            let cmp: number
            if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
            else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
            return sortAsc ? cmp : -cmp
        })
        return out
    }, [rows, sortKey, sortAsc, totalsMap, columnFilters, displayValue])

    // KPI
    const stats = useMemo(() => {
        const count = filtered.length
        const totalAmount = filtered.reduce((s, r) => s + (r.amount || 0), 0)
        const totalPaid = filtered.reduce((s, r) => s + (totalsMap[r.id]?.paid || 0), 0)
        const totalRemaining = filtered.reduce((s, r) => s + (totalsMap[r.id]?.remaining || 0), 0)
        return { count, totalAmount, totalPaid, totalRemaining }
    }, [filtered, totalsMap])




    const columnMenuDict = t.table?.columnMenu || { sortAsc: 'Sort Ascending', sortDesc: 'Sort Descending', selectAll: 'Select All', deselectAll: 'Deselect All', filterPlaceholder: 'Search...', clearFilters: 'Clear Filters' }

    async function handleExport() {
        const columns: ExcelColumn[] = [
            { header: t.table?.headers?.date || 'Date', key: 'date', width: 12, total: 'Totals:' },
            { header: t.table?.headers?.customer || 'Customer', key: 'customer', width: 20 },
            { header: t.table?.headers?.amount || 'Amount', key: 'amount', width: 15, total: true, fmt: '#,##0' },
            { header: t.table?.headers?.paid || 'Paid', key: 'paid', width: 15, total: true, fmt: '#,##0' },
            { header: t.table?.headers?.remaining || 'Remaining', key: 'remaining', width: 15, total: true, fmt: '#,##0' },
            { header: t.table?.headers?.status || 'Status', key: 'status', width: 15 },
            { header: t.table?.headers?.branch || 'Branch', key: 'branch', width: 20 },
            { header: t.table?.headers?.shift || 'Shift', key: 'shift', width: 15 },
            { header: t.table?.headers?.handledBy || 'Handled By', key: 'handledBy', width: 20 },
            { header: t.table?.headers?.reference || 'Reference', key: 'reference', width: 25 },
        ]

        const data = filtered.map(r => {
            const tot = totalsMap[r.id]
            return {
                date: formatDMY(r.date),
                customer: r.customer_name,
                amount: r.amount,
                paid: tot?.paid || 0,
                remaining: tot?.remaining || 0,
                status: tot?.status || '',
                branch: r.branch,
                shift: r.shift,
                handledBy: r.handledBy,
                reference: r.reference
            }
        })

        await exportToExcelTable('Credits', `credits-${monthInputValue}.xlsx`, columns, data)
    }

    if (loading && branches.length === 0) return <CircularLoader />

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6">
            <PageHeader
                title={t.title || 'Credits'}
                subtitle={t.subtitle}
                actions={
                    <div className="flex items-center gap-2">
                        {/* Branch Picker */}
                        <select
                            value={selectedBranchId}
                            onChange={(e) => setSelectedBranchId(e.target.value)}
                            className="h-9 rounded-xl border border-blue-400/30 bg-blue-600/15 text-blue-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40 px-3 font-semibold"
                        >
                            <option value="all" className="text-gray-900">All Branches</option>
                            {branches.map(b => (
                                <option key={b.id} value={b.id} className="text-gray-900">{b.name}</option>
                            ))}
                        </select>

                        {/* Export Button */}
                        <Button
                            variant="secondary-dark"
                            onClick={handleExport}
                            className="px-3 h-9 text-xs font-semibold"
                            title="Export to CSV"
                            icon={ArrowDownTrayIcon}
                        >
                            <span>Export</span>
                        </Button>
                    </div>
                }
            />

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
                className="mb-4"
            />

            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <StatPill label="Total Credits" value={stats.count} />
                <StatPill label="Total Amount" value={stats.totalAmount} money />
                <StatPill label="Total Paid" value={stats.totalPaid} money />
                <StatPill label="Total Remaining" value={stats.totalRemaining} money />
            </div>

            {/* Table */}
            <TableContainer>
                <Table className="text-sm text-gray-900">
                    <TableHead>
                        <TableHeadRow>
                            {([
                                ['date', t.table?.headers?.date || 'Date'],
                                ['customer', t.table?.headers?.customer || 'Customer'],
                                ['amount', t.table?.headers?.amount || 'Amount', true],
                                ['paid', t.table?.headers?.paid || 'Paid', true],
                                ['remaining', t.table?.headers?.remaining || 'Remaining', true],
                                ['status', t.table?.headers?.status || 'Status'],
                                ['branch', t.table?.headers?.branch || 'Branch'],
                                ['shift', t.table?.headers?.shift || 'Shift'],
                                ['handledBy', t.table?.headers?.handledBy || 'Handled By'],
                                ['reference', t.table?.headers?.reference || 'Reference'],
                            ] as [SortKey, string, boolean?][]).map(([k, lbl, right]) => (
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
                                />
                            ))}
                        </TableHeadRow>
                    </TableHead>
                    <TableBody>
                        {filtered.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={10} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                                    {t.table?.empty || 'No credits found.'}
                                </TableCell>
                            </TableRow>
                        )}
                        {filtered.map(r => {
                            const tot = totalsMap[r.id]
                            const isPaid = tot?.status === 'Paid'
                            return (
                                <TableRow key={r.id}>
                                    <TableCell className="px-6 py-4 whitespace-nowrap font-medium text-slate-650">{formatDMY(r.date)}</TableCell>
                                    <TableCell className="px-6 py-4 whitespace-nowrap font-semibold text-slate-805">{r.customer_name}</TableCell>
                                    <TableCell className="px-6 py-4 whitespace-nowrap text-right tabular-nums font-bold text-slate-800">{fmt(r.amount)} ₫</TableCell>
                                    <TableCell className="px-6 py-4 whitespace-nowrap text-right tabular-nums text-slate-500 font-medium">{fmt(tot?.paid)} ₫</TableCell>
                                    <TableCell className="px-6 py-4 whitespace-nowrap text-right tabular-nums font-bold text-slate-800">{fmt(tot?.remaining)} ₫</TableCell>
                                    <TableCell className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                            isPaid 
                                                ? 'bg-green-50 text-green-700 border-green-100' 
                                                : 'bg-yellow-50 text-yellow-750 border-yellow-100'
                                        }`}>
                                            {tot?.status}
                                        </span>
                                    </TableCell>
                                    <TableCell className="px-6 py-4 whitespace-nowrap text-slate-600 font-medium">{r.branch}</TableCell>
                                    <TableCell className="px-6 py-4 whitespace-nowrap text-slate-600 font-medium">{r.shift}</TableCell>
                                    <TableCell className="px-6 py-4 whitespace-nowrap text-slate-600 font-medium">{r.handledBy}</TableCell>
                                    <TableCell className="px-6 py-4 whitespace-nowrap text-slate-500 font-medium">{r.reference || '-'}</TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                    {filtered.length > 0 && (
                        <tfoot className="bg-slate-50/50">
                            <tr className="border-t border-slate-200">
                                <td className="px-6 py-4" colSpan={2}>
                                    <span className="font-bold text-slate-500 text-xs uppercase tracking-wider">{t.table?.totals || 'Totals'}</span>
                                </td>
                                <td className="px-6 py-4 text-right font-extrabold text-slate-800 tabular-nums">{fmt(stats.totalAmount)} ₫</td>
                                <td className="px-6 py-4 text-right font-extrabold text-slate-800 tabular-nums">{fmt(stats.totalPaid)} ₫</td>
                                <td className="px-6 py-4 text-right font-extrabold text-slate-800 tabular-nums">{fmt(stats.totalRemaining)} ₫</td>
                                <td className="px-6 py-4" colSpan={5}></td>
                            </tr>
                        </tfoot>
                    )}
                </Table>
            </TableContainer>
        </div>
    )
}

/* --- Helpers UI --- */
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
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleScroll() {
      onClose();
    }
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [open, onClose])

    const isActive = sortKey === colKey
    const hasFilter = !!activeFilter
    const dropdownStyle = useMemo(() => {
        if (!open || !ref.current) return undefined
        const rect = ref.current.getBoundingClientRect()
        const width = 220;
      let left = right ? rect.right - width : rect.left;
      if (left + width > window.innerWidth) {
        left = window.innerWidth - width - 8;
      }
      if (left < 8) {
        left = 8;
      }
      return { top: rect.bottom + 4, left: left, width: `${width}px` };
    }, [open, right])
    const filteredValues = filterSearch ? values.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase())) : values
    const allVisibleChecked = filteredValues.length > 0 && filteredValues.every(v => localChecked.has(v))
    function toggleAll() { const next = new Set(localChecked); if (allVisibleChecked) { filteredValues.forEach(v => next.delete(v)) } else { filteredValues.forEach(v => next.add(v)) }; setLocalChecked(next) }
    function toggleOne(v: string) { const next = new Set(localChecked); if (next.has(v)) next.delete(v); else next.add(v); setLocalChecked(next) }
    function handleApply() {
        let finalChecked = localChecked;
        if (filterSearch) {
            finalChecked = new Set([...localChecked].filter(x => filteredValues.includes(x)));
        }
        if (finalChecked.size >= values.length) onFilter(null); 
        else onFilter(finalChecked);
    }

    return (
        <th className={`px-6 py-4 bg-gray-50/75 border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-slate-500 ${right ? 'text-right' : ''} ${className} relative`} ref={ref as any}>
            <div className={`flex items-center gap-1 font-bold ${center ? 'justify-center' : right ? 'justify-end' : 'justify-start'}`}>
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
        <div className="text-left rounded-2xl border border-blue-400/30 bg-blue-600/10 text-blue-100 p-4">
            <div className="text-[10px] uppercase font-bold tracking-wider opacity-85 text-blue-200 mb-1">{label}</div>
            <div className="text-lg font-extrabold tabular-nums text-white">{money ? fmt(value) + " ₫" : value}</div>
        </div>
    )
}

/* --- Utils --- */
function formatDMY(isoDate: string) {
    const d = new Date(isoDate)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}
function sortValue(r: CreditRow, key: SortKey, totals: Record<string, Totals>) {
    const t = totals[r.id]
    switch (key) {
        case 'date': return new Date(r.date).getTime()
        case 'customer': return r.customer_name || ''
        case 'amount': return r.amount
        case 'paid': return t?.paid || 0
        case 'remaining': return t?.remaining || 0
        case 'status': return t?.status || ''
        case 'branch': return r.branch || ''
        case 'reference': return r.reference || ''
        case 'shift': return r.shift || ''
        case 'handledBy': return r.handledBy || ''
        default: return 0
    }
}

function fmt(n: number | undefined) { return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function toMonthInputValue(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function fromMonthInputValue(val: string) { const [y, m] = val.split('-').map(Number); return new Date(y, m - 1, 1) }
function formatMonthLabel(d: Date) { return d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) }
