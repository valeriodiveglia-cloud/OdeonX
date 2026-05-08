'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { ArrowDownUp, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'

function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }

export default function CashFlowPage() {
    const { currency } = useSettings()
    const [loading, setLoading] = useState(true)
    const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
    const [branchFilter, setBranchFilter] = useState('All')
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([])

    // Raw data
    const [accounts, setAccounts] = useState<any[]>([])
    const [transactions, setTransactions] = useState<any[]>([])
    const [monthlyData, setMonthlyData] = useState<{ month: string; inflow: number; outflow: number; net: number }[]>([])

    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            const [yr, mo] = month.split('-').map(Number)
            const startDate = `${yr}-${String(mo).padStart(2, '0')}-01`
            const endDate = mo === 12 ? `${yr + 1}-01-01` : `${yr}-${String(mo + 1).padStart(2, '0')}-01`

            const [accRes, txRes, brRes, historicalTxRes] = await Promise.all([
                supabase.from('fin_bank_accounts').select('*').eq('is_active', true),
                supabase.from('fin_bank_transactions').select('*, fin_bank_accounts(branch_id)')
                    .gte('transaction_date', startDate).lt('transaction_date', endDate).order('transaction_date'),
                supabase.from('provider_branches').select('id, name').order('name'),
                // Last 6 months of transactions for trend
                supabase.from('fin_bank_transactions').select('transaction_date, type, amount')
                    .gte('transaction_date', new Date(yr, mo - 7, 1).toISOString().split('T')[0])
                    .lt('transaction_date', endDate),
            ])

            if (accRes.data) {
                setAccounts(branchFilter === 'All' ? accRes.data : accRes.data.filter(a => a.branch_id === branchFilter || !a.branch_id))
            }
            if (txRes.data) {
                setTransactions(txRes.data.filter((t: any) => branchFilter === 'All' || t.fin_bank_accounts?.branch_id === branchFilter || !t.fin_bank_accounts?.branch_id))
            }
            if (brRes.data) setBranches(brRes.data as any)

            // Build monthly trend
            if (historicalTxRes.data) {
                const monthly: Record<string, { inflow: number; outflow: number }> = {}
                for (const tx of historicalTxRes.data) {
                    const d = new Date(tx.transaction_date)
                    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                    if (!monthly[key]) monthly[key] = { inflow: 0, outflow: 0 }
                    if (tx.type === 'Inflow') monthly[key].inflow += Number(tx.amount || 0)
                    else if (tx.type === 'Outflow') monthly[key].outflow += Number(tx.amount || 0)
                }
                const sorted = Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b))
                setMonthlyData(sorted.map(([m, v]) => {
                    const [y2, mo2] = m.split('-').map(Number)
                    return {
                        month: new Date(y2, mo2 - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' }),
                        inflow: v.inflow, outflow: v.outflow, net: v.inflow - v.outflow,
                    }
                }))
            }

            setLoading(false)
        }
        fetchData()
    }, [month, branchFilter])

    // Current month summary
    const summary = useMemo(() => {
        let inflow = 0, outflow = 0
        for (const tx of transactions) {
            if (tx.type === 'Inflow') inflow += Number(tx.amount || 0)
            else if (tx.type === 'Outflow') outflow += Number(tx.amount || 0)
        }
        const totalBalance = accounts.reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0)
        return { inflow, outflow, net: inflow - outflow, totalBalance }
    }, [transactions, accounts])

    // Waterfall data
    const waterfallData = useMemo(() => {
        const openingBalance = summary.totalBalance - summary.net
        return [
            { name: 'Opening', value: openingBalance, fill: '#475569' },
            { name: 'Inflows', value: summary.inflow, fill: '#10b981' },
            { name: 'Outflows', value: -summary.outflow, fill: '#ef4444' },
            { name: 'Closing', value: summary.totalBalance, fill: '#3b82f6' },
        ]
    }, [summary])

    // By category
    const byCategory = useMemo(() => {
        const cats: Record<string, { inflow: number; outflow: number }> = {}
        for (const tx of transactions) {
            const cat = tx.category || 'Uncategorized'
            if (!cats[cat]) cats[cat] = { inflow: 0, outflow: 0 }
            if (tx.type === 'Inflow') cats[cat].inflow += Number(tx.amount || 0)
            else if (tx.type === 'Outflow') cats[cat].outflow += Number(tx.amount || 0)
        }
        return Object.entries(cats).sort(([, a], [, b]) => (b.inflow + b.outflow) - (a.inflow + a.outflow))
    }, [transactions])

    const monthOptions = useMemo(() => {
        const opts: string[] = []; const now = new Date()
        for (let i = 0; i < 12; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }
        return opts
    }, [])

    const fmtMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }) }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Cash Flow</h1>
                    <p className="text-slate-500 mt-1">Track money in and out of your business</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
                <select value={month} onChange={e => setMonth(e.target.value)} className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white text-slate-700 shadow-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    {monthOptions.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
                </select>
                <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    <option value="All">All Branches</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
            </div>

            {loading ? <div className="flex justify-center py-16"><CircularLoader /></div> : (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                            <div className="text-sm text-slate-500">Total Balance</div>
                            <div className="text-2xl font-black text-slate-900 tabular-nums mt-1">{currency} {fmt(summary.totalBalance)}</div>
                        </div>
                        <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-5 shadow-sm">
                            <div className="text-sm text-emerald-700 flex items-center gap-1"><TrendingUp className="w-4 h-4" /> Inflows</div>
                            <div className="text-2xl font-black text-emerald-700 tabular-nums mt-1">{currency} {fmt(summary.inflow)}</div>
                        </div>
                        <div className="bg-red-50 rounded-2xl border border-red-200 p-5 shadow-sm">
                            <div className="text-sm text-red-700 flex items-center gap-1"><TrendingDown className="w-4 h-4" /> Outflows</div>
                            <div className="text-2xl font-black text-red-700 tabular-nums mt-1">{currency} {fmt(summary.outflow)}</div>
                        </div>
                        <div className={`rounded-2xl border p-5 shadow-sm ${summary.net >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
                            <div className="text-sm text-slate-600 flex items-center gap-1"><Minus className="w-4 h-4" /> Net Flow</div>
                            <div className={`text-2xl font-black tabular-nums mt-1 ${summary.net >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                                {summary.net >= 0 ? '+' : ''}{currency} {fmt(summary.net)}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Waterfall Chart */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">Cash Flow Waterfall</h2>
                            <div className="h-[260px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={waterfallData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 13, fontWeight: 600 }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }}
                                            tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(v)} />
                                        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                                            formatter={(val: number) => [`${currency} ${fmt(Math.abs(val))}`, '']} />
                                        <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={60}>
                                            {waterfallData.map((entry, idx) => (
                                                <Cell key={idx} fill={entry.fill} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Monthly Trend */}
                        {monthlyData.length > 1 && (
                            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Monthly Trend</h2>
                                <div className="h-[240px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }}
                                                tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(v)} />
                                            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                                                formatter={(val: number, name: string) => [`${currency} ${fmt(val)}`, name === 'inflow' ? 'Inflows' : name === 'outflow' ? 'Outflows' : 'Net']} />
                                            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                                            <Bar dataKey="inflow" fill="#10b981" radius={[4, 4, 0, 0]} barSize={16} />
                                            <Bar dataKey="outflow" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={16} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex items-center gap-6 mt-3 justify-center text-xs">
                                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Inflows</span>
                                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Outflows</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Category Breakdown */}
                    {byCategory.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-5 border-b border-slate-100">
                                <h2 className="text-lg font-bold text-slate-900">By Category</h2>
                            </div>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-xs text-slate-500 uppercase">
                                        <th className="p-3 text-left">Category</th>
                                        <th className="p-3 text-right">Inflows</th>
                                        <th className="p-3 text-right">Outflows</th>
                                        <th className="p-3 text-right">Net</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {byCategory.map(([cat, vals]) => (
                                        <tr key={cat} className="hover:bg-slate-50">
                                            <td className="p-3 font-medium text-slate-800">{cat}</td>
                                            <td className="p-3 text-right tabular-nums text-emerald-600 font-medium">{vals.inflow > 0 ? `+${fmt(vals.inflow)}` : '—'}</td>
                                            <td className="p-3 text-right tabular-nums text-red-600 font-medium">{vals.outflow > 0 ? `−${fmt(vals.outflow)}` : '—'}</td>
                                            <td className={`p-3 text-right tabular-nums font-bold ${(vals.inflow - vals.outflow) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                                {fmt(vals.inflow - vals.outflow)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
