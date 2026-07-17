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
    XMarkIcon,
} from '@heroicons/react/24/outline'
import { useWastage, type WastageRow, type WType } from '../../daily-reports/_data/useWastage'
import { useSettings } from '@/contexts/SettingsContext'
import { getMonthlyReportsDictionary } from '../_i18n'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import MonthPicker from '@/components/MonthPicker'
import { exportToExcelTable, type ExcelColumn } from '@/lib/exportUtils'


type SortKey = 'date' | 'dow' | 'time' | 'branch' | 'type' | 'category' | 'item' | 'unit' | 'qty' | 'unitCost' | 'totalCost' | 'chargeTo'

type Branch = { id: string; name: string }

export default function MonthlyWastageReportPage() {
    const { language } = useSettings()
    const dict = getMonthlyReportsDictionary(language)
    const t = dict.wastageReport

    const [qText, setQText] = useState('')
    const [sortKey, setSortKey] = useState<SortKey>('date')
    const [sortAsc, setSortAsc] = useState(false)
    const [columnFilters, setColumnFilters] = useState<Record<string, Set<string> | null>>({})
    const [openMenu, setOpenMenu] = useState<SortKey | null>(null)
    const [selectedWastage, setSelectedWastage] = useState<WastageRow | null>(null)

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
    const { rows, loading } = useWastage({
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
    const displayValue = useCallback((r: WastageRow, key: SortKey): string => {
        switch (key) {
            case 'date': return formatDMY(r.date)
            case 'dow': return dow3(r.date)
            case 'time': return r.time
            case 'branch': return r.branchName || ''
            case 'type': return r.type
            case 'category': return r.categoryName || ''
            case 'item': return r.itemName
            case 'unit': return r.unit || ''
            case 'qty': return String(r.qty)
            case 'unitCost': return fmt(r.unitCost)
            case 'totalCost': return fmt(r.totalCost)
            case 'chargeTo': return r.chargeTo
            default: return ''
        }
    }, [])

    // Unique filterable values per column
    const columnValues = useMemo(() => {
        const map: Record<string, string[]> = {}
        const keys: SortKey[] = ['date', 'dow', 'time', 'branch', 'type', 'category', 'item', 'unit', 'qty', 'unitCost', 'totalCost', 'chargeTo']
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
        if (qText.trim()) {
            const s = qText.trim().toLowerCase()
            out = out.filter(r =>
                (r.itemName || '').toLowerCase().includes(s) ||
                (r.categoryName || '').toLowerCase().includes(s) ||
                (r.reason || '').toLowerCase().includes(s) ||
                (r.enteredBy || '').toLowerCase().includes(s) ||
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
        const totalCost = filtered.reduce((s, r) => s + (r.totalCost || 0), 0)
        const totalRestaurantCost = filtered.reduce((s, r) => s + (r.chargeTo === 'Restaurant' ? (r.totalCost || 0) : 0), 0)
        const totalStaffCost = filtered.reduce((s, r) => s + (r.chargeTo === 'Staff' ? (r.totalCost || 0) : 0), 0)
        return { count, totalCost, totalRestaurantCost, totalStaffCost }
    }, [filtered])




    const columnMenuDict = t.table?.columnMenu || { sortAsc: 'Sort Ascending', sortDesc: 'Sort Descending', selectAll: 'Select All', deselectAll: 'Deselect All', filterPlaceholder: 'Search...', clearFilters: 'Clear Filters' }

    async function handleExport() {
        const columns: ExcelColumn[] = [
            { header: t.table.headers.date, key: 'date', width: 12, total: 'Totals:' },
            { header: t.table.headers.day, key: 'day', width: 8 },
            { header: t.table.headers.time, key: 'time', width: 8 },
            { header: 'Branch', key: 'branch', width: 20 },
            { header: t.table.headers.type, key: 'type', width: 12 },
            { header: t.table.headers.category, key: 'category', width: 20 },
            { header: t.table.headers.item, key: 'item', width: 30 },
            { header: t.table.headers.unit, key: 'unit', width: 10 },
            { header: t.table.headers.qty, key: 'qty', width: 10, fmt: '0.00' },
            { header: t.table.headers.unitCost, key: 'unitCost', width: 15, fmt: '#,##0' },
            { header: t.table.headers.totalCost, key: 'totalCost', width: 15, total: true, fmt: '#,##0' },
            { header: t.table.headers.chargeTo, key: 'chargeTo', width: 15 },
        ]

        const data = filtered.map(r => ({
            date: formatDMY(r.date),
            day: dow3(r.date),
            time: r.time,
            branch: r.branchName,
            type: r.type,
            category: r.categoryName,
            item: r.itemName,
            unit: r.unit,
            qty: r.qty,
            unitCost: r.unitCost,
            totalCost: r.totalCost,
            chargeTo: r.chargeTo
        }))

        await exportToExcelTable('Wastage Report', `wastage-${monthInputValue}.xlsx`, columns, data)
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
                className="mb-3"
            />

            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <StatPill label="Total Items" value={stats.count} />
                <StatPill label={t.table.headers.totalCost} value={stats.totalCost} money />
                <StatPill label="Restaurant Cost" value={stats.totalRestaurantCost} money />
                <StatPill label="Staff Cost" value={stats.totalStaffCost} money />
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow p-3 overflow-x-auto">
                <table className="w-full table-auto text-sm text-gray-900">
                    <thead>
                        <tr>
                            {([
                                ['date', t.table.headers.date], ['dow', t.table.headers.day], ['time', t.table.headers.time],
                                ['branch', 'Branch'], ['type', t.table.headers.type], ['category', t.table.headers.category],
                                ['item', t.table.headers.item], ['unit', t.table.headers.unit],
                                ['qty', t.table.headers.qty, true], ['unitCost', t.table.headers.unitCost, true],
                                ['totalCost', t.table.headers.totalCost, true], ['chargeTo', t.table.headers.chargeTo]
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
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={12} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                                    {t.table.empty}
                                </td>
                            </tr>
                        )}
                        {filtered.map(r => (
                            <tr
                                key={r.id}
                                className="border-t hover:bg-blue-50/40 cursor-pointer transition-colors"
                                onClick={() => setSelectedWastage(r)}
                            >
                                <td className="p-2 whitespace-nowrap">{formatDMY(r.date)}</td>
                                <td className="p-2 whitespace-nowrap lowercase font-mono">{dow3(r.date)}</td>
                                <td className="p-2 whitespace-nowrap">{r.time}</td>
                                <td className="p-2 whitespace-nowrap">{r.branchName}</td>
                                <td className="p-2 whitespace-nowrap">
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.type === 'Dish' ? 'bg-orange-100 text-orange-800' :
                                        r.type === 'Material' ? 'bg-blue-100 text-blue-800' :
                                            'bg-purple-100 text-purple-800'
                                        }`}>
                                        {r.type}
                                    </span>
                                </td>
                                <td className="p-2 whitespace-nowrap max-w-[120px] truncate" title={r.categoryName || ''}>{r.categoryName}</td>
                                <td className="p-2 whitespace-nowrap max-w-[150px] truncate font-medium" title={r.itemName}>{r.itemName}</td>
                                <td className="p-2 whitespace-nowrap text-gray-500">{r.unit}</td>
                                <td className="p-2 whitespace-nowrap text-right tabular-nums">{r.qty}</td>
                                <td className="p-2 whitespace-nowrap text-right tabular-nums text-gray-500">{fmt(r.unitCost)}</td>
                                <td className="p-2 whitespace-nowrap text-right tabular-nums font-semibold">{fmt(r.totalCost)}</td>
                                <td className="p-2 whitespace-nowrap">
                                    <span className={`px-2 py-0.5 rounded text-xs ${r.chargeTo === 'Restaurant' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                        {r.chargeTo}
                                    </span>
                                </td>
                            </tr>
                        ))}
                        {filtered.length > 0 && (
                            <tr className="border-t bg-gray-50 font-semibold">
                                <td className="p-2" colSpan={10}>{t.table.totals}</td>
                                <td className="p-2 text-right">{fmt(stats.totalCost)}</td>
                                <td className="p-2"></td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {selectedWastage && (
                <WastageDetailModal
                    row={selectedWastage}
                    onClose={() => setSelectedWastage(null)}
                    language={language}
                    t={t}
                />
            )}
        </div>
    )
}

/* --- Modals --- */
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    useEffect(() => {
        const orig = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = orig
        }
    }, [])

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300" onClick={onClose} />
            <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-xl overflow-y-auto animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[95vh]">
                {children}
            </div>
        </div>
    )
}

function WastageDetailModal({
    row,
    onClose,
    language,
    t,
}: {
    row: WastageRow
    onClose: () => void
    language: string
    t: any
}) {
    return (
        <Overlay onClose={onClose}>
            <div className="flex flex-col text-gray-900 bg-white">
                {/* Header */}
                <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">
                            {language === 'vi' ? 'Chi tiết hao hụt' : 'Wastage Details'}
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {row.branchName || '-'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                        title={t.editor.close}
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* Content - Compact Document Style */}
                <div className="px-8 py-4 space-y-4">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                        {/* Colonna Sinistra: Articolo e Quantità */}
                        <div className="space-y-3">
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{t.editor.fields.item}</span>
                                <span className="text-sm font-bold text-slate-800 block mt-0.5">{row.itemName}</span>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{t.editor.fields.category}</span>
                                <span className="text-sm font-semibold text-slate-700 block mt-0.5">{row.categoryName || '-'}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{t.editor.fields.type}</span>
                                    <span className="block mt-0.5">
                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                                            row.type === 'Dish' ? 'bg-orange-50 text-orange-700 border border-orange-100' :
                                            row.type === 'Material' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                                            'bg-purple-50 text-purple-700 border border-purple-100'
                                        }`}>
                                            {row.type}
                                        </span>
                                    </span>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{t.editor.fields.unit}</span>
                                    <span className="text-sm text-slate-700 block mt-0.5">{row.unit || '-'}</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{t.editor.fields.qty}</span>
                                    <span className="text-sm font-bold text-slate-800 block mt-0.5">{row.qty}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{t.editor.fields.chargeTo}</span>
                                    <span className="block mt-0.5">
                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold ${
                                            row.chargeTo === 'Restaurant' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                                        }`}>
                                            {row.chargeTo}
                                        </span>
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Colonna Destra: Tracciamento, Costi e Responsabilità */}
                        <div className="space-y-3 border-l border-slate-100 pl-8">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{t.editor.fields.unitCost}</span>
                                    <span className="text-sm font-semibold text-slate-700 block mt-0.5 tabular-nums">{fmt(row.unitCost)} ₫</span>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{t.editor.fields.totalCost}</span>
                                    <span className="text-sm font-bold text-blue-600 block mt-0.5 tabular-nums">{fmt(row.totalCost)} ₫</span>
                                </div>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{language === 'vi' ? 'Thời gian ghi nhận' : 'Logged Date & Time'}</span>
                                <span className="text-sm font-semibold text-slate-700 block mt-0.5">{formatDMY(row.date)} - {row.time}</span>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{t.editor.fields.responsible}</span>
                                <span className="text-sm text-slate-700 block mt-0.5">{row.responsible || '-'}</span>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{t.editor.fields.enteredBy}</span>
                                <span className="text-sm text-slate-700 block mt-0.5">{row.enteredBy || '-'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Riga Bottom: Motivo se esistente */}
                    {row.reason && (
                        <div className="pt-3 border-t border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{t.editor.fields.reason}</span>
                            <span className="text-sm text-slate-600 block mt-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100/50 italic whitespace-pre-wrap">
                                "{row.reason}"
                            </span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-4 border-t border-slate-100 flex items-center justify-end bg-slate-50/30">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-blue-600/15 hover:bg-blue-600/25 text-blue-600 font-semibold rounded-lg transition-colors text-xs h-10 cursor-pointer"
                    >
                        {t.editor.close}
                    </button>
                </div>
            </div>
        </Overlay>
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
        let finalChecked = localChecked;
        if (filterSearch) {
            finalChecked = new Set([...localChecked].filter(x => filteredValues.includes(x)));
        }
        if (finalChecked.size >= values.length) onFilter(null); 
        else onFilter(finalChecked);
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
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${isActive && sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'}`}
                        >
                            <BarsArrowUpIcon className="w-4 h-4" />
                            {dict.sortAsc}
                        </button>
                        <button
                            onClick={() => onSort(colKey, false)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${isActive && !sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'}`}
                        >
                            <BarsArrowDownIcon className="w-4 h-4" />
                            {dict.sortDesc}
                        </button>
                    </div>
                    <div className="border-t border-gray-200" />
                    <div className="px-3 py-2">
                        <input type="text" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder={dict.filterPlaceholder} className="w-full mb-2 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        <button onClick={toggleAll} className="text-xs text-blue-600 hover:text-blue-800 mb-1 cursor-pointer">{allVisibleChecked ? dict.deselectAll : dict.selectAll}</button>
                        <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                            {filteredValues.map(v => (
                                <label key={v} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                                    <input type="checkbox" checked={localChecked.has(v)} onChange={() => toggleOne(v)} className="accent-blue-600 rounded" />
                                    <span className="truncate text-xs">{v}</span>
                                </label>
                            ))}
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
function dow3(isoDate: string) { return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(isoDate).getDay()] }
function sortValue(r: WastageRow, key: SortKey) {
    switch (key) {
        case 'date': return new Date(r.date).getTime()
        case 'dow': return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(dow3(r.date))
        case 'time': return Number(r.time.replace(':', ''))
        case 'branch': return r.branchName || ''
        case 'type': return r.type
        case 'category': return r.categoryName || ''
        case 'item': return r.itemName
        case 'unit': return r.unit || ''
        case 'qty': return r.qty
        case 'unitCost': return r.unitCost
        case 'totalCost': return r.totalCost
        case 'chargeTo': return r.chargeTo
        default: return 0
    }
}
function fmt(n: number) { return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function toMonthInputValue(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function fromMonthInputValue(val: string) { const [y, m] = val.split('-').map(Number); return new Date(y, m - 1, 1) }
function formatMonthLabel(d: Date) { return d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) }
