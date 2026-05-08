'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { BarChart3, ChevronDown, Download, Eye, EyeOff, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import type { FinChartOfAccount } from '@/types/finance'

function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }

type PnLLine = { code: string; name: string; simplifiedName: string; type: string; group: string; amount: number; isGroup: boolean }

export default function PnLReportPage() {
    const { currency } = useSettings()
    const [loading, setLoading] = useState(true)
    const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
    const [branchFilter, setBranchFilter] = useState('All')
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
    const [simplified, setSimplified] = useState(false)
    const [coa, setCoa] = useState<FinChartOfAccount[]>([])

    // Data
    const [revenue, setRevenue] = useState(0)
    const [expensesByAccount, setExpensesByAccount] = useState<Record<string, number>>({})

    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            const [yr, mo] = month.split('-').map(Number)
            const startDate = `${yr}-${String(mo).padStart(2, '0')}-01`
            const endDate = mo === 12 ? `${yr + 1}-01-01` : `${yr}-${String(mo + 1).padStart(2, '0')}-01`

            const [coaRes, brRes, revRes, invRes, cashoutRes] = await Promise.all([
                supabase.from('fin_chart_of_accounts').select('*').eq('is_active', true).order('sort_order'),
                supabase.from('provider_branches').select('id, name').order('name'),
                // Revenue from cashier_closings (uses branch_name)
                supabase.from('cashier_closings').select('revenue_vnd, branch_name')
                    .gte('report_date', startDate).lt('report_date', endDate),
                // Expenses from invoices (all statuses except Cancelled)
                supabase.from('fin_invoices').select('account_id, gross_amount, branch_id')
                    .gte('invoice_date', startDate).lt('invoice_date', endDate)
                    .neq('status', 'Cancelled'),
                // Expenses from cashouts that do NOT have a VAT invoice
                supabase.from('cashout').select('category, amount, branch')
                    .gte('date', startDate).lt('date', endDate)
                    .eq('invoice', false),
            ])

            let coaData: FinChartOfAccount[] = []
            if (coaRes.data) {
                coaData = coaRes.data as any
                setCoa(coaData)
            }
            if (brRes.data) setBranches(brRes.data as any)

            // Resolve branch name for filtering revenue & cashout
            const selectedBranchName = branchFilter !== 'All' 
                ? brRes.data?.find(b => b.id === branchFilter)?.name 
                : null

            // Calculate revenue
            let totalRev = 0
            if (revRes.data) {
                for (const r of revRes.data) {
                    if (selectedBranchName && r.branch_name !== selectedBranchName) continue
                    totalRev += Number(r.revenue_vnd || 0)
                }
            }
            setRevenue(totalRev)

            // Calculate expenses by account
            const byAccount: Record<string, number> = {}
            if (invRes.data) {
                for (const inv of invRes.data) {
                    if (branchFilter !== 'All' && inv.branch_id !== branchFilter) continue
                    const key = inv.account_id || 'unassigned'
                    byAccount[key] = (byAccount[key] || 0) + Number(inv.gross_amount || 0)
                }
            }

            // Calculate expenses from cashout
            if (cashoutRes.data) {
                for (const c of cashoutRes.data) {
                    if (selectedBranchName && c.branch !== selectedBranchName) continue
                    
                    const amount = Number(c.amount || 0)
                    const categoryName = c.category || ''
                    
                    // Try to map category to an existing Chart of Account
                    const matchedAccount = coaData.find(a => 
                        a.name.toLowerCase() === categoryName.toLowerCase() || 
                        (a.simplified_name && a.simplified_name.toLowerCase() === categoryName.toLowerCase())
                    )

                    if (matchedAccount) {
                        byAccount[matchedAccount.id] = (byAccount[matchedAccount.id] || 0) + amount
                    } else {
                        // If no match, put in a special 'cashout_uncategorized' bucket
                        byAccount['cashout_uncategorized'] = (byAccount['cashout_uncategorized'] || 0) + amount
                    }
                }
            }

            setExpensesByAccount(byAccount)
            setLoading(false)
        }
        fetchData()
    }, [month, branchFilter])

    // Build P&L lines
    const pnlData = useMemo(() => {
        const groups = simplified
            ? ['Revenue', 'Food Cost', 'Staff Cost', 'Operating Costs', 'Other']
            : ['Revenue', 'COGS', 'Salary', 'OPEX', 'Tax', 'Depreciation', 'Other Expense']

        const lines: PnLLine[] = []
        let totalExpenses = 0

        // Revenue section
        lines.push({ code: '', name: 'Revenue', simplifiedName: 'Revenue', type: 'Revenue', group: 'Revenue', amount: revenue, isGroup: true })

        // Expense sections
        const accountTypes = simplified
            ? { 'Food Cost': ['COGS'], 'Staff Cost': ['Salary'], 'Operating Costs': ['OPEX'], 'Other': ['Tax', 'Depreciation', 'Other Expense'] }
            : { 'COGS': ['COGS'], 'Salary': ['Salary'], 'OPEX': ['OPEX'], 'Tax': ['Tax'], 'Depreciation': ['Depreciation'], 'Other Expense': ['Other Expense'] }

        for (const [groupLabel, types] of Object.entries(accountTypes)) {
            const relevantAccounts = coa.filter(a => types.includes(a.account_type) && !a.is_group)
            let groupTotal = 0

            const children: PnLLine[] = []
            for (const acc of relevantAccounts) {
                const amount = expensesByAccount[acc.id] || 0
                if (amount === 0 && simplified) continue
                groupTotal += amount
                children.push({
                    code: acc.code, name: acc.name, simplifiedName: acc.simplified_name || acc.name,
                    type: acc.account_type, group: groupLabel, amount, isGroup: false,
                })
            }

            // Add unassigned to first expense group
            if (groupLabel === (simplified ? 'Food Cost' : 'COGS') && expensesByAccount['unassigned']) {
                groupTotal += expensesByAccount['unassigned']
                children.push({
                    code: '—', name: 'Uncategorized Invoice', simplifiedName: 'Uncategorized Invoice',
                    type: 'COGS', group: groupLabel, amount: expensesByAccount['unassigned'], isGroup: false,
                })
            }

            // Add uncategorized cashout to the 'Other' expense group
            if (groupLabel === (simplified ? 'Other' : 'Other Expense') && expensesByAccount['cashout_uncategorized']) {
                groupTotal += expensesByAccount['cashout_uncategorized']
                children.push({
                    code: '—', name: 'Uncategorized Cashout', simplifiedName: 'Uncategorized Cashout',
                    type: 'Other Expense', group: groupLabel, amount: expensesByAccount['cashout_uncategorized'], isGroup: false,
                })
            }

            totalExpenses += groupTotal
            lines.push({ code: '', name: groupLabel, simplifiedName: groupLabel, type: 'group', group: groupLabel, amount: groupTotal, isGroup: true })
            lines.push(...children)
        }

        // Net Profit
        lines.push({ code: '', name: 'Net Profit', simplifiedName: 'Net Profit', type: 'result', group: '', amount: revenue - totalExpenses, isGroup: true })

        return { lines, totalExpenses, netProfit: revenue - totalExpenses }
    }, [coa, expensesByAccount, revenue, simplified])

    // Month options (last 12 months)
    const monthOptions = useMemo(() => {
        const opts: string[] = []
        const now = new Date()
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
            opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
        }
        return opts
    }, [])

    const fmtMonth = (m: string) => {
        const [y, mo] = m.split('-').map(Number)
        return new Date(y, mo - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
    }

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Profit & Loss</h1>
                    <p className="text-slate-500 mt-1">Monthly income statement</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setSimplified(!simplified)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition ${simplified ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-200'}`}>
                        {simplified ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        {simplified ? 'Simplified' : 'Full View'}
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
                <select value={month} onChange={e => setMonth(e.target.value)}
                    className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white text-slate-700 shadow-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    {monthOptions.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
                </select>
                <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                    className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    <option value="All">All Branches</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
            </div>

            {loading ? <div className="flex justify-center py-16"><CircularLoader /></div> : (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                            <div className="text-sm text-slate-500 font-medium">Revenue</div>
                            <div className="text-2xl font-black text-slate-900 tabular-nums mt-1">{currency} {fmt(revenue)}</div>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                            <div className="text-sm text-slate-500 font-medium">Total Expenses</div>
                            <div className="text-2xl font-black text-red-600 tabular-nums mt-1">{currency} {fmt(pnlData.totalExpenses)}</div>
                        </div>
                        <div className={`rounded-2xl border p-5 shadow-sm ${pnlData.netProfit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                            <div className="text-sm text-slate-500 font-medium">Net Profit</div>
                            <div className={`text-2xl font-black tabular-nums mt-1 ${pnlData.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                {currency} {fmt(pnlData.netProfit)}
                            </div>
                            {revenue > 0 && (
                                <div className="text-xs text-slate-500 mt-1">{((pnlData.netProfit / revenue) * 100).toFixed(1)}% margin</div>
                            )}
                        </div>
                    </div>

                    {/* P&L Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    {!simplified && <th className="p-3 text-left text-xs font-semibold text-slate-400 uppercase w-20">Code</th>}
                                    <th className="p-3 text-left text-xs font-semibold text-slate-400 uppercase">Account</th>
                                    <th className="p-3 text-right text-xs font-semibold text-slate-400 uppercase w-48">Amount ({currency})</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pnlData.lines.map((line, i) => {
                                    const isResult = line.type === 'result'
                                    const isGroupHeader = line.isGroup && !isResult
                                    return (
                                        <tr key={i} className={`
                                            ${isResult ? 'bg-slate-900 text-white font-black' : ''}
                                            ${isGroupHeader ? 'bg-slate-50 border-t-2 border-slate-200' : ''}
                                            ${!isGroupHeader && !isResult ? 'border-t border-slate-100' : ''}
                                        `}>
                                            {!simplified && (
                                                <td className={`p-3 text-xs ${isResult ? 'text-white/60' : 'text-slate-400'} tabular-nums`}>
                                                    {line.code}
                                                </td>
                                            )}
                                            <td className={`p-3 ${isGroupHeader || isResult ? 'font-bold' : 'pl-8'} ${isResult ? 'text-lg' : ''} ${isGroupHeader ? 'text-slate-800 text-sm uppercase tracking-wider' : ''}`}>
                                                {simplified ? line.simplifiedName : line.name}
                                            </td>
                                            <td className={`p-3 text-right tabular-nums ${isGroupHeader ? 'font-bold text-slate-800' : ''} ${isResult ? 'text-lg font-black' : ''} ${!isGroupHeader && !isResult && line.amount === 0 ? 'text-slate-300' : ''}`}>
                                                {isResult ? (
                                                    <span className={line.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                                        {fmt(line.amount)}
                                                    </span>
                                                ) : fmt(line.amount)}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    )
}
