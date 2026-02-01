'use client'

import React, { useMemo, useState, useEffect } from 'react'
import {
    CalendarDaysIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    MagnifyingGlassIcon,
    ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import { useWastage, type WastageRow } from '../../daily-reports/_data/useWastage'
import { useSettings } from '@/contexts/SettingsContext'
import { getMonthlyReportsDictionary } from '../_i18n'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'


type SortKey = 'date' | 'dow' | 'time' | 'branch' | 'type' | 'category' | 'item' | 'unit' | 'qty' | 'unitCost' | 'totalCost' | 'chargeTo'

type Branch = { id: string; name: string }

export default function MonthlyWastageReportPage() {
    const { language } = useSettings()
    const dict = getMonthlyReportsDictionary(language)
    const t = dict.wastageReport

    const [qText, setQText] = useState('')
    const [sortKey, setSortKey] = useState<SortKey>('date')
    const [sortAsc, setSortAsc] = useState(false)

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

    function toggleSort(k: SortKey) {
        if (sortKey === k) setSortAsc(v => !v)
        else { setSortKey(k); setSortAsc(true) }
    }

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

    // KPI
    const stats = useMemo(() => {
        const count = filtered.length
        const totalCost = filtered.reduce((s, r) => s + (r.totalCost || 0), 0)
        const totalRestaurantCost = filtered.reduce((s, r) => s + (r.chargeTo === 'Restaurant' ? (r.totalCost || 0) : 0), 0)
        const totalStaffCost = filtered.reduce((s, r) => s + (r.chargeTo === 'Staff' ? (r.totalCost || 0) : 0), 0)
        return { count, totalCost, totalRestaurantCost, totalStaffCost }
    }, [filtered])

    function prevMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), -1)) }
    function nextMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), 1)) }
    function onPickMonth(val: string) {
        const d = fromMonthInputValue(val)
        if (d) setMonthCursor(d)
    }

    async function handleExport() {
        const ExcelJS = (await import('exceljs')).default
        const wb = new ExcelJS.Workbook()
        const ws = wb.addWorksheet('Wastage Report')

        ws.columns = [
            { header: t.table.headers.date, key: 'date', width: 12 },
            { header: t.table.headers.day, key: 'day', width: 8 },
            { header: t.table.headers.time, key: 'time', width: 8 },
            { header: 'Branch', key: 'branch', width: 15 },
            { header: t.table.headers.type, key: 'type', width: 10 },
            { header: t.table.headers.category, key: 'category', width: 20 },
            { header: t.table.headers.item, key: 'item', width: 30 },
            { header: t.table.headers.unit, key: 'unit', width: 10 },
            { header: t.table.headers.qty, key: 'qty', width: 10 },
            { header: t.table.headers.unitCost, key: 'unitCost', width: 15 },
            { header: t.table.headers.totalCost, key: 'totalCost', width: 15 },
            { header: t.table.headers.chargeTo, key: 'chargeTo', width: 15 },
        ]

        // Style header row
        ws.getRow(1).font = { bold: true }
        ws.getRow(1).alignment = { horizontal: 'center' }

        filtered.forEach(r => {
            const row = ws.addRow({
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
            })

            // Format numbers
            row.getCell('qty').numFmt = '0.00'
            row.getCell('unitCost').numFmt = '#,##0'
            row.getCell('totalCost').numFmt = '#,##0'
        })

        // Add borders
        ws.eachRow((row, rowNumber) => {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                }
            })
        })

        const buf = await wb.xlsx.writeBuffer()
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `wastage-${monthInputValue}.xlsx`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
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
                            aria-label={t.monthNav.pick}
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
                            <Th label={t.table.headers.date} active={sortKey === 'date'} asc={sortAsc} onClick={() => toggleSort('date')} />
                            <Th label={t.table.headers.day} active={sortKey === 'dow'} asc={sortAsc} onClick={() => toggleSort('dow')} />
                            <Th label={t.table.headers.time} active={sortKey === 'time'} asc={sortAsc} onClick={() => toggleSort('time')} />
                            <Th label="Branch" active={sortKey === 'branch'} asc={sortAsc} onClick={() => toggleSort('branch')} />
                            <Th label={t.table.headers.type} active={sortKey === 'type'} asc={sortAsc} onClick={() => toggleSort('type')} />
                            <Th label={t.table.headers.category} active={sortKey === 'category'} asc={sortAsc} onClick={() => toggleSort('category')} />
                            <Th label={t.table.headers.item} active={sortKey === 'item'} asc={sortAsc} onClick={() => toggleSort('item')} />
                            <Th label={t.table.headers.unit} active={sortKey === 'unit'} asc={sortAsc} onClick={() => toggleSort('unit')} />
                            <Th label={t.table.headers.qty} active={sortKey === 'qty'} asc={sortAsc} onClick={() => toggleSort('qty')} right />
                            <Th label={t.table.headers.unitCost} active={sortKey === 'unitCost'} asc={sortAsc} onClick={() => toggleSort('unitCost')} right />
                            <Th label={t.table.headers.totalCost} active={sortKey === 'totalCost'} asc={sortAsc} onClick={() => toggleSort('totalCost')} right />
                            <Th label={t.table.headers.chargeTo} active={sortKey === 'chargeTo'} asc={sortAsc} onClick={() => toggleSort('chargeTo')} />
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={12} className="text-center text-gray-500 py-6">
                                    {t.table.empty}
                                </td>
                            </tr>
                        )}
                        {filtered.map(r => (
                            <tr key={r.id} className="border-t hover:bg-blue-50/40">
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
        </div>
    )
}

/* --- Helpers UI --- */
function Th({ label, active, asc, onClick, right }: { label: string; active: boolean; asc: boolean; onClick: () => void; right?: boolean }) {
    return (
        <th className={`p-2 ${right ? 'text-right' : ''}`}>
            <button onClick={onClick} className={`w-full flex items-center gap-1 font-semibold cursor-pointer ${right ? 'justify-end' : ''}`}>
                {!right && <SortIcon active={active} asc={asc} />}
                <span>{label}</span>
                {right && <SortIcon active={active} asc={asc} />}
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
