'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    ChevronUpIcon,
    ChevronDownIcon,
    CalendarDaysIcon,
    MagnifyingGlassIcon,
    ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import { useClosingList, type ClosingRow } from '../../daily-reports/_data/useClosingList'
import { useSettings } from '@/contexts/SettingsContext'
import { getMonthlyReportsDictionary } from '../_i18n'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import { exportToCsv } from '@/lib/exportUtils'

type SortKey = 'date' | 'dow' | 'time' | 'branch' | 'revenue' | 'unpaid' | 'cashout' | 'cashToTake'

type Branch = { id: string; name: string }

export default function MonthlyClosingListPage() {
    const router = useRouter()
    const { language } = useSettings()
    const dict = getMonthlyReportsDictionary(language)
    const t = dict.closingList

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
    const { rows, loading } = useClosingList({
        year: monthCursor.getFullYear(),
        month: monthCursor.getMonth(),
        branchName: selectedBranchName,
    })

    function toggleSort(k: SortKey) {
        if (sortKey === k) setSortAsc(v => !v)
        else { setSortKey(k); setSortAsc(true) }
    }

    // Search filter
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

    // KPI
    const stats = useMemo(() => {
        const count = filtered.length
        const sum = (fn: (r: ClosingRow) => number) => filtered.reduce((s, r) => s + (fn(r) || 0), 0)
        const totalRevenue = sum(r => r.revenue)
        const totalUnpaid = sum(r => r.unpaid)
        const totalCashout = sum(r => r.cashout)
        const totalToTake = sum(r => r.cashToTake)
        const avgRevenue = count ? Math.round(totalRevenue / count) : 0
        return { count, totalRevenue, totalUnpaid, totalCashout, totalToTake, avgRevenue }
    }, [filtered])

    function prevMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), -1)) }
    function nextMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), 1)) }
    function onPickMonth(val: string) {
        const d = fromMonthInputValue(val)
        if (d) setMonthCursor(d)
    }

    function handleExport() {
        const headers = [
            t.table.headers.date,
            t.table.headers.day,
            t.table.headers.time,
            t.table.headers.branch,
            t.table.headers.unpaid,
            t.table.headers.cashOut,
            t.table.headers.cashToTake,
            t.table.headers.revenue
        ]
        const data = filtered.map(r => [
            formatDMY(r.date),
            dow3(r.date),
            r.time,
            r.branch,
            r.unpaid,
            r.cashout,
            r.cashToTake,
            r.revenue
        ])
        exportToCsv(`closing-list-${monthInputValue}.csv`, headers, data)
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

            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mb-3">
                <StatPill label={t.kpi.closings} value={stats.count} />
                <StatPill label={t.kpi.totalUnpaid} value={stats.totalUnpaid} money />
                <StatPill label={t.kpi.totalCashOut} value={stats.totalCashout} money />
                <StatPill label={t.kpi.totalToTake} value={stats.totalToTake} money />
                <StatPill label={t.kpi.totalRevenue} value={stats.totalRevenue} money />
                <StatPill label={t.kpi.averageRevenue} value={stats.avgRevenue} money />
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow p-3">
                <table className="w-full table-auto text-sm text-gray-900">
                    <thead>
                        <tr>
                            <Th label={t.table.headers.date} active={sortKey === 'date'} asc={sortAsc} onClick={() => toggleSort('date')} />
                            <Th label={t.table.headers.day} active={sortKey === 'dow'} asc={sortAsc} onClick={() => toggleSort('dow')} />
                            <Th label={t.table.headers.time} active={sortKey === 'time'} asc={sortAsc} onClick={() => toggleSort('time')} />
                            <Th label={t.table.headers.branch} active={sortKey === 'branch'} asc={sortAsc} onClick={() => toggleSort('branch')} />
                            <Th label={t.table.headers.unpaid} active={sortKey === 'unpaid'} asc={sortAsc} onClick={() => toggleSort('unpaid')} right />
                            <Th label={t.table.headers.cashOut} active={sortKey === 'cashout'} asc={sortAsc} onClick={() => toggleSort('cashout')} right />
                            <Th label={t.table.headers.cashToTake} active={sortKey === 'cashToTake'} asc={sortAsc} onClick={() => toggleSort('cashToTake')} right />
                            <Th label={t.table.headers.revenue} active={sortKey === 'revenue'} asc={sortAsc} onClick={() => toggleSort('revenue')} right />
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={8} className="text-center text-gray-500 py-6">
                                    {t.table.noResults}
                                </td>
                            </tr>
                        )}
                        {filtered.map(r => (
                            <tr
                                key={r.id}
                                className="border-t hover:bg-blue-50/40"
                            >
                                <td className="p-2 whitespace-nowrap">{formatDMY(r.date)}</td>
                                <td className="p-2 whitespace-nowrap lowercase font-mono">{dow3(r.date)}</td>
                                <td className="p-2 whitespace-nowrap">{r.time}</td>
                                <td className="p-2 whitespace-nowrap">{r.branch}</td>
                                <td className="p-2 whitespace-nowrap text-right tabular-nums">{fmt(r.unpaid)}</td>
                                <td className="p-2 whitespace-nowrap text-right tabular-nums">{fmt(r.cashout)}</td>
                                <td className="p-2 whitespace-nowrap text-right tabular-nums">{fmt(r.cashToTake)}</td>
                                <td className="p-2 whitespace-nowrap text-right tabular-nums">{fmt(r.revenue)}</td>
                            </tr>
                        ))}
                        {filtered.length > 0 && (
                            <tr className="border-t bg-gray-50 font-semibold">
                                <td className="p-2" colSpan={4}>{t.table.totals}</td>
                                <td className="p-2 text-right">{fmt(stats.totalUnpaid)}</td>
                                <td className="p-2 text-right">{fmt(stats.totalCashout)}</td>
                                <td className="p-2 text-right">{fmt(stats.totalToTake)}</td>
                                <td className="p-2 text-right">{fmt(stats.totalRevenue)}</td>
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
            <button onClick={onClick} className="w-full flex items-center gap-1 font-semibold cursor-pointer">
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
        default: return 0
    }
}
function fmt(n: number) { return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function toMonthInputValue(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function fromMonthInputValue(val: string) { const [y, m] = val.split('-').map(Number); return new Date(y, m - 1, 1) }
function formatMonthLabel(d: Date) { return d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) }
