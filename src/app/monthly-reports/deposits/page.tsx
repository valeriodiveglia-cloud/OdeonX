'use client'

import React, { useMemo, useState, useEffect } from 'react'
import {
    CalendarDaysIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    MagnifyingGlassIcon,
    ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import { useDeposits, type DepositRow, type Totals } from '../../daily-reports/_data/useDeposits'
import { useSettings } from '@/contexts/SettingsContext'
import { getMonthlyReportsDictionary } from '../_i18n'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import { exportToCsv } from '@/lib/exportUtils'

type SortKey = 'date' | 'event_date' | 'customer' | 'amount' | 'paid' | 'remaining' | 'status' | 'branch' | 'reference'

type Branch = { id: string; name: string }

export default function MonthlyDepositsPage() {
    const { language } = useSettings()
    const dict = getMonthlyReportsDictionary(language)
    const t = dict.deposits || {
        title: 'Deposits',
        table: {
            headers: { date: 'Date', eventDate: 'Event Date', customer: 'Customer', amount: 'Amount', paid: 'Paid', remaining: 'Remaining', status: 'Status', branch: 'Branch', reference: 'Reference' },
            noRows: 'No deposits found.',
            totals: 'Totals'
        }
    }

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
    const { rows, totalsMap, loading } = useDeposits({
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
                (r.customer_name || '').toLowerCase().includes(s) ||
                (r.reference || '').toLowerCase().includes(s) ||
                (r.branch || '').toLowerCase().includes(s) ||
                formatDMY(r.date).includes(s)
            )
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
    }, [rows, qText, sortKey, sortAsc, totalsMap])

    // KPI
    const stats = useMemo(() => {
        const count = filtered.length
        const totalAmount = filtered.reduce((s, r) => s + (r.amount || 0), 0)
        const totalPaid = filtered.reduce((s, r) => s + (totalsMap[r.id]?.paid || 0), 0)
        const totalRemaining = filtered.reduce((s, r) => s + (totalsMap[r.id]?.remaining || 0), 0)
        return { count, totalAmount, totalPaid, totalRemaining }
    }, [filtered, totalsMap])

    function prevMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), -1)) }
    function nextMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), 1)) }
    function onPickMonth(val: string) {
        const d = fromMonthInputValue(val)
        if (d) setMonthCursor(d)
    }

    function handleExport() {
        const headers = [
            t.table?.headers?.date || 'Date',
            t.table?.headers?.eventDate || 'Event Date',
            t.table?.headers?.customer || 'Customer',
            t.table?.headers?.amount || 'Amount',
            t.table?.headers?.paid || 'Paid',
            t.table?.headers?.remaining || 'Remaining',
            t.table?.headers?.status || 'Status',
            t.table?.headers?.branch || 'Branch',
            t.table?.headers?.reference || 'Reference'
        ]
        const data = filtered.map(r => {
            const tot = totalsMap[r.id]
            return [
                formatDMY(r.date),
                r.event_date ? formatDMY(r.event_date) : '',
                r.customer_name,
                r.amount,
                tot?.paid || 0,
                tot?.remaining || 0,
                tot?.status || '',
                r.branch,
                r.reference
            ]
        })
        exportToCsv(`deposits-${monthInputValue}.csv`, headers, data)
    }

    if (loading && branches.length === 0) return <CircularLoader />

    return (
        <div className="max-w-none mx-auto p-4 text-gray-100">
            {/* Header */}
            <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-white">{t.title || 'Deposits'}</h1>
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
                            placeholder="Search..."
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <StatPill label="Total Deposits" value={stats.count} />
                <StatPill label="Total Amount" value={stats.totalAmount} money />
                <StatPill label="Total Paid" value={stats.totalPaid} money />
                <StatPill label="Total Remaining" value={stats.totalRemaining} money />
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow p-3 overflow-x-auto">
                <table className="w-full table-auto text-sm text-gray-900">
                    <thead>
                        <tr>
                            <Th label={t.table?.headers?.date || 'Date'} active={sortKey === 'date'} asc={sortAsc} onClick={() => toggleSort('date')} />
                            <Th label={t.table?.headers?.eventDate || 'Event Date'} active={sortKey === 'event_date'} asc={sortAsc} onClick={() => toggleSort('event_date')} />
                            <Th label={t.table?.headers?.customer || 'Customer'} active={sortKey === 'customer'} asc={sortAsc} onClick={() => toggleSort('customer')} />
                            <Th label={t.table?.headers?.amount || 'Amount'} active={sortKey === 'amount'} asc={sortAsc} onClick={() => toggleSort('amount')} right />
                            <Th label={t.table?.headers?.paid || 'Paid'} active={sortKey === 'paid'} asc={sortAsc} onClick={() => toggleSort('paid')} right />
                            <Th label={t.table?.headers?.remaining || 'Remaining'} active={sortKey === 'remaining'} asc={sortAsc} onClick={() => toggleSort('remaining')} right />
                            <Th label={t.table?.headers?.status || 'Status'} active={sortKey === 'status'} asc={sortAsc} onClick={() => toggleSort('status')} />
                            <Th label={t.table?.headers?.branch || 'Branch'} active={sortKey === 'branch'} asc={sortAsc} onClick={() => toggleSort('branch')} />
                            <Th label={t.table?.headers?.reference || 'Reference'} active={sortKey === 'reference'} asc={sortAsc} onClick={() => toggleSort('reference')} />
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={9} className="text-center text-gray-500 py-6">
                                    {t.table?.noRows || 'No deposits found.'}
                                </td>
                            </tr>
                        )}
                        {filtered.map(r => {
                            const tot = totalsMap[r.id]
                            return (
                                <tr key={r.id} className="border-t hover:bg-blue-50/40">
                                    <td className="p-2 whitespace-nowrap">{formatDMY(r.date)}</td>
                                    <td className="p-2 whitespace-nowrap">{r.event_date ? formatDMY(r.event_date) : '-'}</td>
                                    <td className="p-2 whitespace-nowrap font-medium">{r.customer_name}</td>
                                    <td className="p-2 whitespace-nowrap text-right tabular-nums font-semibold">{fmt(r.amount)}</td>
                                    <td className="p-2 whitespace-nowrap text-right tabular-nums text-gray-600">{fmt(tot?.paid)}</td>
                                    <td className="p-2 whitespace-nowrap text-right tabular-nums font-semibold">{fmt(tot?.remaining)}</td>
                                    <td className="p-2 whitespace-nowrap">
                                        <span className={`px-2 py-0.5 rounded text-xs ${tot?.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {tot?.status}
                                        </span>
                                    </td>
                                    <td className="p-2 whitespace-nowrap text-gray-600">{r.branch}</td>
                                    <td className="p-2 whitespace-nowrap text-gray-500">{r.reference}</td>
                                </tr>
                            )
                        })}
                        {filtered.length > 0 && (
                            <tr className="border-t bg-gray-50 font-semibold">
                                <td className="p-2" colSpan={3}>{t.table?.totals || 'Totals'}</td>
                                <td className="p-2 text-right">{fmt(stats.totalAmount)}</td>
                                <td className="p-2 text-right">{fmt(stats.totalPaid)}</td>
                                <td className="p-2 text-right">{fmt(stats.totalRemaining)}</td>
                                <td className="p-2" colSpan={3}></td>
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
function sortValue(r: DepositRow, key: SortKey, totals: Record<string, Totals>) {
    const t = totals[r.id]
    switch (key) {
        case 'date': return new Date(r.date).getTime()
        case 'event_date': return r.event_date ? new Date(r.event_date).getTime() : 0
        case 'customer': return r.customer_name || ''
        case 'amount': return r.amount
        case 'paid': return t?.paid || 0
        case 'remaining': return t?.remaining || 0
        case 'status': return t?.status || ''
        case 'branch': return r.branch || ''
        case 'reference': return r.reference || ''
        default: return 0
    }
}
function fmt(n: number | undefined) { return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function toMonthInputValue(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function fromMonthInputValue(val: string) { const [y, m] = val.split('-').map(Number); return new Date(y, m - 1, 1) }
function formatMonthLabel(d: Date) { return d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) }
