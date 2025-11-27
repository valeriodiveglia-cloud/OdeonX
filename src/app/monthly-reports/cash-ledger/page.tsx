'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import { useCashLedger, CashLedgerRow } from './_data/useCashLedger'
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    CalendarDaysIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    BuildingLibraryIcon,
    ArrowUturnLeftIcon,
    ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import { exportToCsv } from '@/lib/exportUtils'

type Branch = {
    id: string
    name: string
}

type SortKey = 'date' | 'day' | 'branch' | 'amount' | 'status'

export default function CashLedgerPage() {
    const now = new Date()
    const [year, setYear] = useState(now.getFullYear())
    const [month, setMonth] = useState(now.getMonth()) // 0-11
    const [selectedBranch, setSelectedBranch] = useState<string>('') // '' = All
    const [branches, setBranches] = useState<Branch[]>([])
    const [branchesLoading, setBranchesLoading] = useState(true)

    const [sortKey, setSortKey] = useState<SortKey>('date')
    const [sortAsc, setSortAsc] = useState(false)

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
        const out = [...rows]
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
            }
            return sortAsc ? cmp : -cmp
        })
        return out
    }, [rows, sortKey, sortAsc])

    function toggleSort(k: SortKey) {
        if (sortKey === k) setSortAsc(v => !v)
        else { setSortKey(k); setSortAsc(true) }
    }

    function handleExport() {
        const headers = [
            'Date',
            'Day',
            'Branch',
            'Cash Revenues',
            'Status',
            'Deposit Date'
        ]
        const data = sortedRows.map(r => [
            formatDMY(r.date),
            formatDay(new Date(r.date)),
            r.branch,
            r.cash_to_take,
            r.deposited ? 'Deposited' : 'Pending',
            r.deposited && r.deposit_date ? formatDMY(r.deposit_date) : ''
        ])
        exportToCsv(`cash-ledger-${monthInputValue}.csv`, headers, data)
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
                                <Th label="Date" active={sortKey === 'date'} asc={sortAsc} onClick={() => toggleSort('date')} />
                                <Th label="Day" active={sortKey === 'day'} asc={sortAsc} onClick={() => toggleSort('day')} />
                                <Th label="Branch" active={sortKey === 'branch'} asc={sortAsc} onClick={() => toggleSort('branch')} />
                                <Th label="Cash Revenues" active={sortKey === 'amount'} asc={sortAsc} onClick={() => toggleSort('amount')} right />
                                <Th label="Status" active={sortKey === 'status'} asc={sortAsc} onClick={() => toggleSort('status')} center />
                                <th className="p-2 text-center font-semibold text-gray-700">Deposit Date</th>
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
                                            {row.deposited ? (
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

/* --- Helpers UI --- */
function Th({ label, active, asc, onClick, right, center }: { label: string; active: boolean; asc: boolean; onClick: () => void; right?: boolean; center?: boolean }) {
    return (
        <th className={`p-2 ${right ? 'text-right' : center ? 'text-center' : ''}`}>
            <button onClick={onClick} className={`w-full flex items-center gap-1 font-semibold text-gray-700 cursor-pointer ${right ? 'justify-end' : center ? 'justify-center' : ''}`}>
                {!right && !center && <SortIcon active={active} asc={asc} />}
                <span>{label}</span>
                {(right || center) && <SortIcon active={active} asc={asc} />}
            </button>
        </th>
    )
}

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
    if (!active) return <span className="inline-block w-4" />
    return asc ? <ChevronUpIcon className="w-4 h-4 text-gray-500" /> : <ChevronDownIcon className="w-4 h-4 text-gray-500" />
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
