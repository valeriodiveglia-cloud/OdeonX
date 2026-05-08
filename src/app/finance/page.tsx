'use client'

import React, { useEffect, useState, useMemo } from 'react'
import {
    Landmark, FileText, CreditCard, TrendingUp, TrendingDown,
    AlertCircle, Clock, CheckCircle2, ArrowUpRight, ArrowDownRight,
    DollarSign, Receipt, BarChart3, ChevronRight, Wallet
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'
import Link from 'next/link'
import type { FinInvoice, FinBankAccount, FinPaymentOrder } from '@/types/finance'

function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }

export default function FinanceDashboard() {
    const { currency } = useSettings()
    const [loading, setLoading] = useState(true)
    const [invoices, setInvoices] = useState<FinInvoice[]>([])
    const [accounts, setAccounts] = useState<FinBankAccount[]>([])
    const [paymentOrders, setPaymentOrders] = useState<FinPaymentOrder[]>([])
    const [revenueData, setRevenueData] = useState<{ month: string; revenue: number; expenses: number }[]>([])

    useEffect(() => {
        async function fetchData() {
            const [invRes, accRes, poRes, revRes] = await Promise.all([
                supabase.from('fin_invoices').select('*, fin_suppliers(name)').order('invoice_date', { ascending: false }),
                supabase.from('fin_bank_accounts').select('*').eq('is_active', true),
                supabase.from('fin_payment_orders').select('*').order('created_at', { ascending: false }).limit(20),
                // Revenue from cashier_closings - last 6 months
                supabase.from('cashier_closings').select('report_date, revenue_vnd, branch_id').gte(
                    'report_date',
                    new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1).toISOString().split('T')[0]
                ),
            ])

            if (invRes.data) setInvoices(invRes.data as any)
            if (accRes.data) setAccounts(accRes.data as any)
            if (poRes.data) setPaymentOrders(poRes.data as any)

            // Build monthly revenue vs expenses trend
            if (revRes.data) {
                const monthlyRev: Record<string, number> = {}
                for (const r of revRes.data) {
                    const d = new Date(r.report_date)
                    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                    monthlyRev[key] = (monthlyRev[key] || 0) + Number(r.revenue_vnd || 0)
                }

                // Monthly expenses from invoices
                const monthlyExp: Record<string, number> = {}
                if (invRes.data) {
                    for (const inv of invRes.data) {
                        const d = new Date(inv.invoice_date)
                        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                        monthlyExp[key] = (monthlyExp[key] || 0) + Number(inv.gross_amount || 0)
                    }
                }

                const allMonths = new Set([...Object.keys(monthlyRev), ...Object.keys(monthlyExp)])
                const sorted = Array.from(allMonths).sort()
                setRevenueData(sorted.map(m => {
                    const [y, mo] = m.split('-')
                    const d = new Date(Number(y), Number(mo) - 1, 1)
                    return {
                        month: d.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
                        revenue: monthlyRev[m] || 0,
                        expenses: monthlyExp[m] || 0,
                    }
                }))
            }

            setLoading(false)
        }
        fetchData()
    }, [])

    // Computed metrics
    const totalCashPosition = useMemo(() =>
        accounts.reduce((sum, a) => sum + Number(a.current_balance || 0), 0), [accounts])

    const pendingInvoices = useMemo(() =>
        invoices.filter(i => i.status === 'Pending' || i.status === 'Overdue'), [invoices])

    const outstandingPayables = useMemo(() =>
        pendingInvoices.reduce((sum, i) => sum + Number(i.gross_amount || 0), 0), [pendingInvoices])

    const overdueInvoices = useMemo(() => {
        const today = new Date().toISOString().split('T')[0]
        return invoices.filter(i => i.status === 'Pending' && i.due_date && i.due_date < today)
    }, [invoices])

    const overdueAmount = useMemo(() =>
        overdueInvoices.reduce((sum, i) => sum + Number(i.gross_amount || 0), 0), [overdueInvoices])

    const now = new Date()
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const thisMonthRevenue = useMemo(() => {
        const entry = revenueData.find((_, idx) => {
            // Last entry is current month
            return idx === revenueData.length - 1
        })
        return entry?.revenue || 0
    }, [revenueData])

    const thisMonthExpenses = useMemo(() =>
        invoices.filter(i => {
            const d = new Date(i.invoice_date)
            return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
        }).reduce((sum, i) => sum + Number(i.gross_amount || 0), 0), [invoices])

    const pendingPaymentOrders = useMemo(() =>
        paymentOrders.filter(po => po.status === 'Draft' || po.status === 'Pending Review'), [paymentOrders])

    const recentInvoices = useMemo(() => invoices.slice(0, 5), [invoices])

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <CircularLoader />
            </div>
        )
    }

    const METRICS = [
        {
            label: 'Cash Position',
            value: `${currency} ${fmt(totalCashPosition)}`,
            change: `${accounts.length} active account${accounts.length !== 1 ? 's' : ''}`,
            icon: Landmark,
            color: 'text-emerald-600',
            bg: 'bg-emerald-100',
        },
        {
            label: 'Outstanding Payables',
            value: `${currency} ${fmt(outstandingPayables)}`,
            change: `${pendingInvoices.length} pending invoice${pendingInvoices.length !== 1 ? 's' : ''}`,
            icon: Receipt,
            color: 'text-amber-600',
            bg: 'bg-amber-100',
        },
        {
            label: 'Overdue Invoices',
            value: `${currency} ${fmt(overdueAmount)}`,
            change: `${overdueInvoices.length} overdue`,
            icon: AlertCircle,
            color: overdueInvoices.length > 0 ? 'text-red-600' : 'text-slate-400',
            bg: overdueInvoices.length > 0 ? 'bg-red-100' : 'bg-slate-100',
        },
        {
            label: 'Revenue (MTD)',
            value: `${currency} ${fmt(thisMonthRevenue)}`,
            change: 'From cashier closings',
            icon: TrendingUp,
            color: 'text-blue-600',
            bg: 'bg-blue-100',
        },
        {
            label: 'Expenses (MTD)',
            value: `${currency} ${fmt(thisMonthExpenses)}`,
            change: 'Invoices this month',
            icon: TrendingDown,
            color: 'text-violet-600',
            bg: 'bg-violet-100',
        },
        {
            label: 'Net Profit (MTD)',
            value: `${currency} ${fmt(thisMonthRevenue - thisMonthExpenses)}`,
            change: thisMonthRevenue - thisMonthExpenses >= 0 ? 'Profitable' : 'Loss',
            icon: DollarSign,
            color: thisMonthRevenue - thisMonthExpenses >= 0 ? 'text-emerald-600' : 'text-red-600',
            bg: thisMonthRevenue - thisMonthExpenses >= 0 ? 'bg-emerald-100' : 'bg-red-100',
        },
    ]

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 flex flex-col">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Finance</h1>
                <p className="text-slate-500 mt-1">Overview of your restaurant&apos;s financial health</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {METRICS.map((item, i) => (
                    <div key={i} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col group hover:shadow-md transition">
                        <div className="flex items-center gap-4 mb-4">
                            <div className={`p-3 rounded-xl transition-transform group-hover:scale-110 ${item.bg}`}>
                                <item.icon className={`w-6 h-6 ${item.color}`} />
                            </div>
                            <h3 className="font-medium text-slate-600">{item.label}</h3>
                        </div>
                        <div className="text-3xl font-black text-slate-900 truncate" title={item.value}>{item.value}</div>
                        <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            {item.change}
                        </div>
                    </div>
                ))}
            </div>

            {/* Revenue vs Expenses Chart */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm shrink-0">
                <h2 className="text-lg font-bold text-slate-900 mb-6">Revenue vs Expenses</h2>
                <div className="h-[280px] w-full">
                    {revenueData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }}
                                    tickFormatter={(val) => val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                                    dx={-10}
                                />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    formatter={(val: number, name: string) => [`${currency} ${fmt(val)}`, name === 'revenue' ? 'Revenue' : 'Expenses']}
                                />
                                <Bar dataKey="revenue" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={28} />
                                <Bar dataKey="expenses" fill="#f43f5e" radius={[6, 6, 0, 0]} barSize={28} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-slate-400">No data available yet</div>
                    )}
                </div>
                <div className="flex items-center gap-6 mt-4 justify-center text-sm">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm bg-blue-500" />
                        <span className="text-slate-600 font-medium">Revenue</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm bg-rose-500" />
                        <span className="text-slate-600 font-medium">Expenses</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
                {/* Recent Invoices */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                        <h2 className="text-lg font-bold text-slate-900">Recent Invoices</h2>
                        <Link href="/finance/invoices" className="text-sm font-medium text-blue-600 hover:underline flex items-center gap-1">
                            View All <ChevronRight className="w-4 h-4" />
                        </Link>
                    </div>
                    <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
                        {recentInvoices.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">No invoices recorded yet</div>
                        ) : (
                            recentInvoices.map(inv => {
                                const statusStyles: Record<string, string> = {
                                    Pending: 'bg-amber-100 text-amber-700',
                                    'In Payment': 'bg-blue-100 text-blue-700',
                                    Paid: 'bg-emerald-100 text-emerald-700',
                                    Overdue: 'bg-red-100 text-red-700',
                                    Cancelled: 'bg-slate-100 text-slate-500',
                                }
                                return (
                                    <Link href="/finance/invoices" key={inv.id} className="block hover:bg-slate-50 transition">
                                        <div className="p-4 flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 uppercase shrink-0">
                                                    <FileText className="w-5 h-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-slate-900 truncate">
                                                        {inv.invoice_number} — {(inv as any).fin_suppliers?.name || 'Unknown'}
                                                    </div>
                                                    <div className="text-sm text-slate-500 truncate">
                                                        {new Date(inv.invoice_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                        {inv.description ? ` • ${inv.description}` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0 flex flex-col items-end gap-1">
                                                <div className="font-bold text-slate-900 tabular-nums">
                                                    {fmt(Number(inv.gross_amount))} {inv.currency || currency}
                                                </div>
                                                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold ${statusStyles[inv.status] || 'bg-slate-100 text-slate-500'}`}>
                                                    {inv.status}
                                                </span>
                                            </div>
                                        </div>
                                    </Link>
                                )
                            })
                        )}
                    </div>
                </div>

                {/* Action Center */}
                <div className="lg:col-span-1">
                    <div className="bg-gradient-to-br from-slate-900 to-blue-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden flex flex-col h-full min-h-[400px]">
                        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay pointer-events-none" />

                        <div className="relative z-10 flex-1 flex flex-col">
                            <div className="flex items-center gap-3 mb-2 shrink-0">
                                <AlertCircle className="w-6 h-6 text-amber-400" />
                                <h2 className="text-xl font-bold">Action Center</h2>
                            </div>
                            <p className="text-blue-200 text-sm mb-6 shrink-0">Items requiring attention</p>

                            <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                                {/* Overdue Invoices */}
                                {overdueInvoices.length > 0 && (
                                    <div className="p-4 bg-red-500/10 backdrop-blur rounded-xl border border-red-500/20">
                                        <div className="flex justify-between items-start gap-3">
                                            <div>
                                                <div className="font-semibold text-red-100 flex items-center gap-2">
                                                    <AlertCircle className="w-4 h-4 text-red-400" />
                                                    Overdue Invoices
                                                </div>
                                                <div className="text-sm text-red-200/70 mt-1 leading-relaxed">
                                                    {overdueInvoices.length} invoice{overdueInvoices.length !== 1 ? 's' : ''} past due date
                                                </div>
                                            </div>
                                            <Link href="/finance/invoices" className="px-3 py-1.5 bg-red-500 hover:bg-red-400 text-red-950 text-xs font-bold uppercase tracking-wider rounded-lg transition shrink-0 mt-1">
                                                Review
                                            </Link>
                                        </div>
                                    </div>
                                )}

                                {/* Pending Payment Orders */}
                                {pendingPaymentOrders.length > 0 && (
                                    <div className="p-4 bg-amber-500/10 backdrop-blur rounded-xl border border-amber-500/20">
                                        <div className="flex justify-between items-start gap-3">
                                            <div>
                                                <div className="font-semibold text-amber-100 flex items-center gap-2">
                                                    <CreditCard className="w-4 h-4 text-amber-400" />
                                                    Pending Payments
                                                </div>
                                                <div className="text-sm text-amber-200/70 mt-1 leading-relaxed">
                                                    {pendingPaymentOrders.length} payment order{pendingPaymentOrders.length !== 1 ? 's' : ''} awaiting review
                                                </div>
                                            </div>
                                            <Link href="/finance/payments" className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-amber-950 text-xs font-bold uppercase tracking-wider rounded-lg transition shrink-0 mt-1">
                                                Review
                                            </Link>
                                        </div>
                                    </div>
                                )}

                                {/* Bank Account Summary */}
                                <div className="p-4 bg-white/5 backdrop-blur rounded-xl border border-white/10">
                                    <div className="font-semibold text-white flex items-center gap-2 mb-3">
                                        <Wallet className="w-4 h-4 text-blue-300" />
                                        Bank Accounts
                                    </div>
                                    <div className="space-y-2">
                                        {accounts.length > 0 ? accounts.map(acc => (
                                            <div key={acc.id} className="flex justify-between items-center bg-white/5 p-2.5 rounded-lg">
                                                <div className="text-sm text-blue-50">{acc.account_name}</div>
                                                <div className="text-sm font-bold text-white tabular-nums">{fmt(Number(acc.current_balance))}</div>
                                            </div>
                                        )) : (
                                            <Link href="/finance/accounts" className="block text-center text-sm text-blue-200/60 hover:text-blue-100 transition py-2">
                                                + Add your first bank account
                                            </Link>
                                        )}
                                    </div>
                                </div>

                                {overdueInvoices.length === 0 && pendingPaymentOrders.length === 0 && (
                                    <div className="flex flex-col items-center justify-center p-8 text-center bg-white/5 rounded-xl border border-white/10 mt-4">
                                        <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-3 opacity-50" />
                                        <div className="text-emerald-100 font-medium">All caught up!</div>
                                        <div className="text-sm text-emerald-200/50 mt-1">No pending actions</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
