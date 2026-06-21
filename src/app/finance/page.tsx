'use client'

import React, { useEffect, useState, useMemo } from 'react'
import {
    Landmark, FileText, CreditCard, TrendingUp, TrendingDown,
    AlertCircle, Clock, CheckCircle2, ArrowUpRight, ArrowDownRight,
    DollarSign, Receipt, BarChart3, ChevronRight, Wallet, ChevronDown, ChevronUp
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'
import Link from 'next/link'
import type { FinInvoice, FinBankAccount, FinPaymentOrder } from '@/types/finance'

function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }

const getQuarter = (dateStr: string) => {
    const parts = dateStr.split('-')
    const month = parseInt(parts[1], 10) // 1-12
    if (month >= 1 && month <= 3) return 0 // Q1
    if (month >= 4 && month <= 6) return 1 // Q2
    if (month >= 7 && month <= 9) return 2 // Q3
    return 3 // Q4
}

const getInvoiceQuarter = (dateStr: string) => {
    if (!dateStr) return 0
    const parts = dateStr.split('-')
    const month = parseInt(parts[1], 10)
    if (month >= 1 && month <= 3) return 0
    if (month >= 4 && month <= 6) return 1
    if (month >= 7 && month <= 9) return 2
    return 3
}

const getDaysDifference = (targetDateStr: string) => {
    const todayStr = new Date().toISOString().split('T')[0]
    const todayParts = todayStr.split('-').map(Number)
    const targetParts = targetDateStr.split('-').map(Number)
    
    const todayDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2])
    const targetDate = new Date(targetParts[0], targetParts[1] - 1, targetParts[2])
    
    const diffTime = targetDate.getTime() - todayDate.getTime()
    return Math.round(diffTime / (1000 * 60 * 60 * 24))
}

export default function FinanceDashboard() {
    const { currency, vatRate, language, financeStartDate } = useSettings()
    const [loading, setLoading] = useState(true)
    const selectedYear = new Date().getFullYear()
    const [dashboardViewMode, setDashboardViewMode] = useState<'management' | 'statutory'>('management')
    const [isVatModalOpen, setIsVatModalOpen] = useState(false)
    const [invoices, setInvoices] = useState<FinInvoice[]>([])
    const [accounts, setAccounts] = useState<FinBankAccount[]>([])
    const [paymentOrders, setPaymentOrders] = useState<FinPaymentOrder[]>([])
    const [revenueClosings, setRevenueClosings] = useState<any[]>([])
    const [taxSettings, setTaxSettings] = useState<any[]>([])
    const [coa, setCoa] = useState<any[]>([])
    const [pendingVatItems, setPendingVatItems] = useState<any[]>([])

    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            
            let manQuery = supabase.from('fin_payment_order_items')
                .select('id, amount, description, fin_payment_orders!inner(order_number, order_date, status)')
                .eq('item_type', 'manual')
                .is('invoice_id', null)
                .eq('requires_invoice', true)
                .neq('fin_payment_orders.status', 'Cancelled')
                
            let cashoutQuery = supabase.from('cashout')
                .select('id, date, amount, description')
                .eq('invoice', true)
                .is('invoice_id', null)

            if (financeStartDate) {
                manQuery = manQuery.gte('fin_payment_orders.order_date', financeStartDate)
                cashoutQuery = cashoutQuery.gte('date', financeStartDate)
            }

            const [invRes, accRes, poRes, revRes, taxRes, coaRes, manRes, cashoutRes] = await Promise.all([
                supabase.from('fin_invoices').select('*, suppliers(name)').order('invoice_date', { ascending: false }),
                supabase.from('fin_bank_accounts').select('*').eq('is_active', true),
                supabase.from('fin_payment_orders').select('*').order('created_at', { ascending: false }).limit(20),
                supabase.from('cashier_closings').select('report_date, revenue_vnd, branch_id').gte(
                    'report_date',
                    `${selectedYear}-01-01`
                ).lte(
                    'report_date',
                    `${selectedYear}-12-31`
                ),
                supabase.from('fin_tax_settings').select('*').eq('is_active', true),
                supabase.from('fin_chart_of_accounts').select('id, account_type'),
                manQuery,
                cashoutQuery
            ])

            if (invRes.data) setInvoices(invRes.data as any)
            if (accRes.data) setAccounts(accRes.data as any)
            if (poRes.data) setPaymentOrders(poRes.data as any)
            if (revRes.data) setRevenueClosings(revRes.data as any)
            if (taxRes.data) setTaxSettings(taxRes.data)
            if (coaRes.data) setCoa(coaRes.data)

            const manItems = (manRes.data || [])
                .filter((item: any) => item.fin_payment_orders)
                .map((item: any) => ({
                id: item.id,
                date: item.fin_payment_orders?.order_date || '',
                description: item.description || '',
                amount: Number(item.amount),
                type: 'Payment Order',
                ref: item.fin_payment_orders?.order_number
            }))

            const cashoutItems = (cashoutRes.data || []).map((item: any) => ({
                id: item.id,
                date: item.date || '',
                description: item.description || '',
                amount: Number(item.amount),
                type: 'Cash Out',
                ref: 'Cash Out'
            }))

            const combined = [...manItems, ...cashoutItems]
                .filter(item => item.date)
                .sort((a, b) => b.date.localeCompare(a.date))
            setPendingVatItems(combined)
            setLoading(false)
        }
        fetchData()
    }, [selectedYear, financeStartDate])

    // Filtered Invoices based on view mode (Operational vs Fiscal)
    const filteredInvoices = useMemo(() => {
        if (dashboardViewMode === 'management') {
            return invoices.filter(i => !i.is_personal_deduction)
        }
        return invoices
    }, [invoices, dashboardViewMode])

    const flatRate = useMemo(() => {
        const flatTaxSetting = taxSettings.find(t => {
            const acc = coa.find(a => a.id === t.account_id)
            return acc?.account_type === 'Revenue Deduction'
        })
        return flatTaxSetting ? Number(flatTaxSetting.percentage) : 3.5
    }, [taxSettings, coa])

    // Build monthly revenue vs expenses trend for all 12 months of the selected year
    const revenueData = useMemo(() => {
        const monthsData = Array.from({ length: 12 }, (_, i) => {
            const d = new Date(selectedYear, i, 1)
            return {
                monthLabel: d.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', year: '2-digit' }),
                revenue: 0,
                expenses: 0,
            }
        })

        // Aggregate revenue
        for (const r of revenueClosings) {
            const parts = r.report_date.split('-')
            const yr = parseInt(parts[0], 10)
            const mo = parseInt(parts[1], 10) - 1
            if (yr === selectedYear && mo >= 0 && mo < 12) {
                monthsData[mo].revenue += Number(r.revenue_vnd || 0)
            }
        }

        // Aggregate expenses
        for (const inv of filteredInvoices) {
            if (!inv.invoice_date) continue
            const parts = inv.invoice_date.split('-')
            const yr = parseInt(parts[0], 10)
            const mo = parseInt(parts[1], 10) - 1
            if (yr === selectedYear && mo >= 0 && mo < 12) {
                monthsData[mo].expenses += Number(inv.gross_amount || 0)
            }
        }

        return monthsData.map(m => ({
            month: m.monthLabel,
            revenue: m.revenue,
            expenses: m.expenses,
        }))
    }, [revenueClosings, filteredInvoices, selectedYear, language])

    const totalCashPosition = useMemo(() =>
        accounts.reduce((sum, a) => sum + Number(a.current_balance || 0), 0), [accounts])

    const pendingInvoices = useMemo(() =>
        filteredInvoices.filter(i => i.status === 'Pending' || i.status === 'Overdue'), [filteredInvoices])

    const overdueInvoices = useMemo(() => {
        const today = new Date().toISOString().split('T')[0]
        return filteredInvoices.filter(i => i.status === 'Pending' && i.due_date && i.due_date < today)
    }, [filteredInvoices])

    const overdueAmount = useMemo(() =>
        overdueInvoices.reduce((sum, i) => sum + Number(i.gross_amount || 0), 0), [overdueInvoices])

    const thisMonthRevenue = useMemo(() => {
        const currentYear = new Date().getFullYear()
        const currentMonth = new Date().getMonth()
        const targetYear = selectedYear
        const targetMonth = targetYear === currentYear ? currentMonth : 11 // Dec
        
        let sum = 0
        for (const r of revenueClosings) {
            const parts = r.report_date.split('-')
            const yr = parseInt(parts[0], 10)
            const mo = parseInt(parts[1], 10) - 1
            if (yr === targetYear && mo === targetMonth) {
                sum += Number(r.revenue_vnd || 0)
            }
        }
        return sum
    }, [revenueClosings, selectedYear])

    const thisMonthExpenses = useMemo(() => {
        const currentYear = new Date().getFullYear()
        const currentMonth = new Date().getMonth()
        const targetYear = selectedYear
        const targetMonth = targetYear === currentYear ? currentMonth : 11 // Dec

        return filteredInvoices.filter(i => {
            if (!i.invoice_date) return false
            const parts = i.invoice_date.split('-')
            const yr = parseInt(parts[0], 10)
            const mo = parseInt(parts[1], 10) - 1
            return yr === targetYear && mo === targetMonth
        }).reduce((sum, i) => sum + Number(i.gross_amount || 0), 0)
    }, [filteredInvoices, selectedYear])

    const pendingPaymentOrders = useMemo(() =>
        paymentOrders.filter(po => po.status === 'Draft' || po.status === 'Pending Review'), [paymentOrders])

    const upcomingDeadlines = useMemo(() => {
        const todayStr = new Date().toISOString().split('T')[0]
        return filteredInvoices
            .filter(i => i.status === 'Pending' && i.due_date && i.due_date >= todayStr)
            .sort((a, b) => a.due_date!.localeCompare(b.due_date!))
            .slice(0, 5)
    }, [filteredInvoices])

    const periodLabel = useMemo(() => {
        const currentYear = new Date().getFullYear()
        if (selectedYear === currentYear) {
            return t(language, 'MTD')
        }
        const d = new Date(selectedYear, 11, 1)
        return d.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', year: '2-digit' })
    }, [selectedYear, language])

    const vatSimData = useMemo(() => {
        const quarters = Array.from({ length: 4 }, (_, i) => ({
            period: `Q${i + 1}`,
            revenue: 0,
            vatInput: 0,
        }))

        for (const closing of revenueClosings) {
            const dateStr = closing.report_date
            if (!dateStr) continue
            const yr = parseInt(dateStr.split('-')[0], 10)
            if (yr === selectedYear) {
                const qIdx = getQuarter(dateStr)
                quarters[qIdx].revenue += Number(closing.revenue_vnd || 0)
            }
        }

        const businessInvoices = invoices.filter(i => !i.is_personal_deduction && i.status !== 'Cancelled')
        for (const inv of businessInvoices) {
            const dateStr = inv.invoice_date
            if (!dateStr) continue
            const yr = parseInt(dateStr.split('-')[0], 10)
            if (yr === selectedYear) {
                const qIdx = getInvoiceQuarter(dateStr)
                quarters[qIdx].vatInput += Number(inv.vat_amount || 0)
            }
        }

        const rows = quarters.map(q => {
            const vatOutput = q.revenue - (q.revenue / (1 + vatRate / 100))
            const directVat = q.revenue - (q.revenue / (1 + flatRate / 100))
            const traditionalVat = Math.max(0, vatOutput - q.vatInput)
            
            const isDirectCheaper = directVat < traditionalVat
            const savings = Math.abs(traditionalVat - directVat)

            return {
                period: q.period,
                revenue: q.revenue,
                vatInput: q.vatInput,
                vatOutput,
                directVat,
                traditionalVat,
                isDirectCheaper,
                savings,
            }
        })

        const yearlyRevenue = rows.reduce((sum, r) => sum + r.revenue, 0)
        const yearlyVatInput = rows.reduce((sum, r) => sum + r.vatInput, 0)
        const yearlyVatOutput = yearlyRevenue - (yearlyRevenue / (1 + vatRate / 100))
        const yearlyDirectVat = yearlyRevenue - (yearlyRevenue / (1 + flatRate / 100))
        const yearlyTraditionalVat = Math.max(0, yearlyVatOutput - yearlyVatInput)
        
        const isYearlyDirectCheaper = yearlyDirectVat < yearlyTraditionalVat
        const yearlySavings = Math.abs(yearlyTraditionalVat - yearlyDirectVat)

        return {
            quarters: rows,
            yearly: {
                period: 'Yearly',
                revenue: yearlyRevenue,
                vatInput: yearlyVatInput,
                vatOutput: yearlyVatOutput,
                directVat: yearlyDirectVat,
                traditionalVat: yearlyTraditionalVat,
                isDirectCheaper: isYearlyDirectCheaper,
                savings: yearlySavings,
            }
        }
    }, [revenueClosings, invoices, selectedYear, vatRate, flatRate])

    const METRICS = [
        {
            label: t(language, 'TreasuryPosition'),
            value: totalCashPosition,
            change: `${accounts.filter(a => a.account_type !== 'Cash').length} ${t(language, 'FinDsbBank')} • ${accounts.filter(a => a.account_type === 'Cash').length} ${t(language, 'FinDsbCash')}`,
            icon: Landmark,
            color: 'text-emerald-600',
            bg: 'bg-emerald-100',
        },
        {
            label: `${t(language, 'Revenue')} (${periodLabel})`,
            value: thisMonthRevenue,
            change: t(language, 'FromCashierClosings'),
            icon: TrendingUp,
            color: 'text-blue-600',
            bg: 'bg-blue-100',
        },
        {
            label: `${t(language, 'Expenses')} (${periodLabel})`,
            value: thisMonthExpenses,
            change: t(language, 'InvoicesThisMonth'),
            icon: TrendingDown,
            color: 'text-violet-600',
            bg: 'bg-violet-100',
        },
        {
            label: `${t(language, 'NetProfit')} (${periodLabel})`,
            value: thisMonthRevenue - thisMonthExpenses,
            change: thisMonthRevenue - thisMonthExpenses >= 0 ? t(language, 'Profitable') : t(language, 'Loss'),
            icon: DollarSign,
            color: thisMonthRevenue - thisMonthExpenses >= 0 ? 'text-emerald-600' : 'text-red-600',
            bg: thisMonthRevenue - thisMonthExpenses >= 0 ? 'bg-emerald-100' : 'bg-red-100',
        },
    ]

    if (loading) {
        return (
            <div className="p-8 flex justify-center items-center min-h-[500px]">
                <CircularLoader />
            </div>
        )
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 flex flex-col text-slate-900">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">{t(language, 'FinanceDashboardTitle')}</h1>
                        <p className="text-slate-500 mt-1">{t(language, 'FinanceSubtitle')}</p>
                    </div>
                    {/* Actions Toolbar */}
                    <div className="flex items-center gap-3 self-stretch sm:self-auto justify-end">
                        {dashboardViewMode === 'statutory' && (
                            <button
                                type="button"
                                onClick={() => setIsVatModalOpen(true)}
                                className="flex items-center gap-1.5 text-sm font-bold text-blue-600 hover:text-blue-700 hover:underline transition-colors py-1.5"
                            >
                                <Receipt className="w-4 h-4 text-blue-600" />
                                <span>{t(language, 'VATSimulator')}</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* View Mode Tabs (Minimalist border-bottom style) */}
                <div className="flex items-center gap-6 border-b border-slate-200">
                    <button
                        type="button"
                        onClick={() => setDashboardViewMode('management')}
                        className={`pb-3 px-1 text-sm font-bold transition-all border-b-2 ${
                            dashboardViewMode === 'management' 
                                ? 'border-blue-600 text-blue-700' 
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                        }`}
                    >
                        {t(language, 'Management')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setDashboardViewMode('statutory')}
                        className={`pb-3 px-1 text-sm font-bold transition-all border-b-2 ${
                            dashboardViewMode === 'statutory' 
                                ? 'border-amber-500 text-amber-700' 
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                        }`}
                    >
                        {t(language, 'Statutory')}
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {METRICS.map((item, i) => (
                    <div key={i} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between group hover:shadow-md transition min-h-[145px]">
                        <div>
                            <div className="flex items-center gap-3 mb-4">
                                <div className={`p-2.5 rounded-xl transition-transform group-hover:scale-110 ${item.bg}`}>
                                    <item.icon className={`w-5 h-5 ${item.color}`} />
                                </div>
                                <h3 className="text-sm font-semibold text-slate-600 truncate">{item.label}</h3>
                            </div>
                            <div className="flex items-baseline gap-1.5 text-slate-900" title={`${currency} ${fmt(item.value)}`}>
                                <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">{currency}</span>
                                <span className="text-xl sm:text-2xl font-bold tracking-tight">{fmt(item.value)}</span>
                            </div>
                        </div>
                        <div className="mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                            <ArrowUpRight className="w-3 h-3 text-slate-400" />
                            <span className="truncate">{item.change}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Revenue vs Expenses Chart */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm shrink-0">
                <h2 className="text-lg font-bold text-slate-900 mb-6">{t(language, 'RevenueVsExpenses')}</h2>
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
                                    formatter={(val: number, name: string) => [`${currency} ${fmt(val)}`, name === 'revenue' ? t(language, 'Revenue') : t(language, 'Expenses')]}
                                />
                                <Bar dataKey="revenue" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={28} />
                                <Bar dataKey="expenses" fill="#f43f5e" radius={[6, 6, 0, 0]} barSize={28} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-slate-400">{t(language, 'NoDataAvailable')}</div>
                    )}
                </div>
                <div className="flex items-center gap-6 mt-4 justify-center text-sm">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm bg-blue-500" />
                        <span className="text-slate-600 font-medium">{t(language, 'Revenue')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm bg-rose-500" />
                        <span className="text-slate-600 font-medium">{t(language, 'Expenses')}</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
                {/* Pending VAT Invoices */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                        <h2 className="text-lg font-bold text-slate-900">{t(language, 'PaymentsAwaitingInvoice')}</h2>
                        <Link href="/finance/invoices?tab=awaiting" className="text-sm font-medium text-blue-600 hover:underline flex items-center gap-1">
                            {t(language, 'ViewAll')} <ChevronRight className="w-4 h-4" />
                        </Link>
                    </div>
                    <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
                        {pendingVatItems.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">{t(language, 'NoPaymentsAwaitingInvoice')}</div>
                        ) : (
                            pendingVatItems.slice(0, 10).map(item => (
                                <Link href={`/finance/invoices?tab=awaiting&action=create&linkId=${item.id}&linkType=${encodeURIComponent(item.type)}`} key={item.id} className="block hover:bg-slate-50 transition">
                                    <div className="p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-4 min-w-0 flex-1">
                                            <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center font-bold shrink-0">
                                                <Receipt className="w-5 h-5" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="font-semibold text-slate-900 truncate">
                                                    {item.description || t(language, 'NoDescription')}
                                                </div>
                                                <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                                                    <span>{new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                                                    <span>•</span>
                                                    <span className="font-medium text-slate-600">
                                                        {item.ref === 'Cash Out' ? t(language, 'CashOut') : item.ref}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0 flex flex-col items-end gap-1.5 ml-4">
                                            <div className="font-bold text-slate-900 tabular-nums">
                                                {fmt(item.amount)} {currency}
                                            </div>
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                                                item.type === 'Payment Order' 
                                                    ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                                    : 'bg-orange-50 text-orange-700 border-orange-200'
                                            }`}>
                                                {item.type === 'Payment Order' ? t(language, 'FinDsbPaymentOrder') : t(language, 'CashOut')}
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            ))
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
                                <h2 className="text-xl font-bold">{t(language, 'FinanceActionCenter')}</h2>
                            </div>
                            <p className="text-blue-200 text-sm mb-6 shrink-0">{t(language, 'FinanceItemsRequiringAttention')}</p>

                            <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                                {/* Overdue Invoices */}
                                {overdueInvoices.length > 0 && (
                                    <div className="p-4 bg-red-500/10 backdrop-blur rounded-xl border border-red-500/20">
                                        <div className="flex justify-between items-start gap-3">
                                            <div>
                                                <div className="font-semibold text-red-100 flex items-center gap-2">
                                                    <AlertCircle className="w-4 h-4 text-red-400" />
                                                    {t(language, 'OverdueInvoices')}
                                                </div>
                                                <div className="text-sm text-red-200/70 mt-1 leading-relaxed">
                                                    {t(language, 'FinDsbOverdueDesc').replace('{n}', String(overdueInvoices.length))}
                                                </div>
                                            </div>
                                            <Link href="/finance/invoices" className="px-3 py-1.5 bg-red-500 hover:bg-red-400 text-red-950 text-xs font-bold uppercase tracking-wider rounded-lg transition shrink-0 mt-1">
                                                {t(language, 'FinanceReview')}
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
                                                    {t(language, 'PendingPayments')}
                                                </div>
                                                <div className="text-sm text-amber-200/70 mt-1 leading-relaxed">
                                                    {t(language, 'FinDsbPendingDesc').replace('{n}', String(pendingPaymentOrders.length))}
                                                </div>
                                            </div>
                                            <Link href="/finance/payments" className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-amber-950 text-xs font-bold uppercase tracking-wider rounded-lg transition shrink-0 mt-1">
                                                {t(language, 'FinanceReview')}
                                            </Link>
                                        </div>
                                    </div>
                                )}

                                {/* Upcoming Deadlines */}
                                <div className="p-4 bg-white/5 backdrop-blur rounded-xl border border-white/10">
                                    <div className="font-semibold text-white flex items-center gap-2 mb-3">
                                        <Clock className="w-4 h-4 text-blue-300" />
                                        {t(language, 'UpcomingDeadlines')}
                                    </div>
                                    <div className="space-y-2">
                                        {upcomingDeadlines.length > 0 ? (
                                            upcomingDeadlines.map(inv => {
                                                const daysDiff = getDaysDifference(inv.due_date!)
                                                let countdownText = ''
                                                let badgeColor = 'bg-white/10 text-slate-200'
                                                if (daysDiff === 0) {
                                                    countdownText = t(language, 'FinDsbDueToday')
                                                    badgeColor = 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                } else if (daysDiff === 1) {
                                                    countdownText = t(language, 'FinDsbDueTomorrow')
                                                    badgeColor = 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                                } else {
                                                    countdownText = t(language, 'FinDsbDueInDays').replace('{n}', String(daysDiff))
                                                    badgeColor = 'bg-white/10 text-blue-200 border border-white/10'
                                                }

                                                const supplierName = inv.is_personal_deduction 
                                                    ? (inv.custom_supplier_name || t(language, 'FinDsbPersonal')) 
                                                    : ((inv as any).suppliers?.name || t(language, 'FinDsbUnknown'))

                                                return (
                                                    <Link 
                                                        href="/finance/invoices" 
                                                        key={inv.id} 
                                                        className="block bg-white/5 hover:bg-white/10 p-3 rounded-lg border border-white/5 transition duration-150"
                                                    >
                                                        <div className="flex justify-between items-start gap-2 mb-1.5">
                                                            <span className="text-xs font-semibold text-white truncate max-w-[140px]">
                                                                {supplierName}
                                                            </span>
                                                            <span className="text-xs font-bold text-blue-300 tabular-nums">
                                                                {fmt(Number(inv.gross_amount))} {inv.currency || currency}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center gap-2">
                                                            <span className="text-[10px] text-blue-200/60 font-medium">
                                                                {new Date(inv.due_date!).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                            </span>
                                                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${badgeColor}`}>
                                                                {countdownText}
                                                            </span>
                                                        </div>
                                                    </Link>
                                                )
                                            })
                                        ) : (
                                            <div className="text-center text-sm text-blue-200/60 py-3">
                                                {t(language, 'NoUpcomingDeadlines')}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {overdueInvoices.length === 0 && pendingPaymentOrders.length === 0 && (
                                    <div className="flex flex-col items-center justify-center p-8 text-center bg-white/5 rounded-xl border border-white/10 mt-4">
                                        <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-3 opacity-50" />
                                        <div className="text-emerald-100 font-medium">{t(language, 'FinanceAllCaughtUp')}</div>
                                        <div className="text-sm text-emerald-200/50 mt-1">{t(language, 'FinanceNoPendingActions')}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* VAT Simulator Modal */}
            {isVatModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div 
                        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
                        onClick={() => setIsVatModalOpen(false)}
                    />
                    
                    {/* Modal Content */}
                    <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-10">
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                                    <Receipt className="w-5 h-5 text-amber-500" />
                                    <span>{t(language, 'VATRegimeSimulator')} ({selectedYear})</span>
                                </h2>
                                <p className="text-slate-500 text-xs mt-1">
                                    {t(language, 'VATRegimeSimulatorDesc')
                                        .replace('{vatRate}', `${vatRate}%`)
                                        .replace('{flatRate}', `${flatRate}%`)}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsVatModalOpen(false)}
                                className="p-2 rounded-xl text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                            >
                                <span className="sr-only">{t(language, 'Close')}</span>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 overflow-y-auto space-y-6">
                            {/* Summary Banner */}
                            {vatSimData.yearly.revenue === 0 && vatSimData.yearly.vatInput === 0 ? (
                                <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <div>
                                        <h3 className="text-sm font-semibold uppercase tracking-wider opacity-75">
                                            {t(language, 'RegimeVerdictFor').replace('{year}', String(selectedYear))}
                                        </h3>
                                        <p className="text-2xl font-black mt-1">{t(language, 'NoFinancialActivity')}</p>
                                    </div>
                                    <div className="text-left sm:text-right shrink-0">
                                        <span className="text-xs font-semibold uppercase tracking-wider opacity-75">{t(language, 'EstimatedSavings')}</span>
                                        <p className="text-3xl font-black tabular-nums mt-0.5">
                                            —
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className={`p-5 rounded-2xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${
                                    vatSimData.yearly.isDirectCheaper 
                                        ? 'bg-blue-50/70 border-blue-200/80 text-blue-900' 
                                        : 'bg-emerald-50/70 border-emerald-200/80 text-emerald-900'
                                }`}>
                                    <div>
                                        <h3 className="text-sm font-semibold uppercase tracking-wider opacity-75">
                                            {t(language, 'RegimeVerdictFor').replace('{year}', String(selectedYear))}
                                        </h3>
                                        <p className="text-2xl font-black mt-1">
                                            {vatSimData.yearly.isDirectCheaper ? t(language, 'VerdictDirectCheaper') : t(language, 'VerdictTraditionalCheaper')}
                                        </p>
                                    </div>
                                    <div className="text-left sm:text-right shrink-0">
                                        <span className="text-xs font-semibold uppercase tracking-wider opacity-75">{t(language, 'EstimatedSavings')}</span>
                                        <p className="text-3xl font-black tabular-nums mt-0.5">
                                            {fmt(vatSimData.yearly.savings)} <span className="text-lg font-bold">{currency}</span>
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Comparison Details Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t(language, 'TraditionalMethod')}</span>
                                    <div className="mt-2 space-y-2">
                                        <div className="flex justify-between text-sm text-slate-600">
                                            <span>{t(language, 'SimulatedVatOutput')}</span>
                                            <span className="font-semibold tabular-nums text-slate-900">{fmt(vatSimData.yearly.vatOutput)} {currency}</span>
                                        </div>
                                        <div className="flex justify-between text-sm text-slate-600">
                                            <span>{t(language, 'ActualVatInput')}</span>
                                            <span className="font-semibold tabular-nums text-slate-900">-{fmt(vatSimData.yearly.vatInput)} {currency}</span>
                                        </div>
                                        <div className="border-t border-slate-200 pt-2 flex justify-between text-base font-bold text-slate-900">
                                            <span>{t(language, 'NetVATLiability')}:</span>
                                            <span className="tabular-nums text-emerald-600 font-extrabold">{fmt(vatSimData.yearly.traditionalVat)} {currency}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t(language, 'FlatRateMethod')}</span>
                                    <div className="mt-2 space-y-2">
                                        <div className="flex justify-between text-sm text-slate-600">
                                            <span>{t(language, 'GrossRevenue')}</span>
                                            <span className="font-semibold tabular-nums text-slate-900">{fmt(vatSimData.yearly.revenue)} {currency}</span>
                                        </div>
                                        <div className="flex justify-between text-sm text-slate-600">
                                            <span>{t(language, 'FlatTaxRate')}</span>
                                            <span className="font-semibold text-slate-900">{flatRate}%</span>
                                        </div>
                                        <div className="border-t border-slate-200 pt-2 flex justify-between text-base font-bold text-slate-900">
                                            <span>{t(language, 'FlatTaxLiability')}:</span>
                                            <span className="tabular-nums text-blue-600 font-extrabold">{fmt(vatSimData.yearly.directVat)} {currency}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Detailed Table */}
                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
                                    <h4 className="font-bold text-slate-800 text-sm">{t(language, 'QuarterlyAnnualBreakdown')}</h4>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="border-b border-slate-200 bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                <th className="py-3 px-4">{t(language, 'Period')}</th>
                                                <th className="py-3 text-right">{t(language, 'Revenue')}</th>
                                                <th className="py-3 text-right">{t(language, 'VatInputCredit')}</th>
                                                <th className="py-3 text-right">{t(language, 'VatOutputSimulated')}</th>
                                                <th className="py-3 text-right">{t(language, 'TraditionalNet')}</th>
                                                <th className="py-3 text-right">{t(language, 'FlatRateLabel').replace('{rate}', String(flatRate))}</th>
                                                <th className="py-3 pr-4 text-right">{t(language, 'CheaperRegime')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 tabular-nums">
                                            {vatSimData.quarters.map((row) => (
                                                <tr key={row.period} className="hover:bg-slate-50 transition">
                                                    <td className="py-3 px-4 font-bold text-slate-800">{row.period}</td>
                                                    <td className="py-3 text-right text-slate-600">{fmt(row.revenue)}</td>
                                                    <td className="py-3 text-right text-slate-600">{fmt(row.vatInput)}</td>
                                                    <td className="py-3 text-right text-slate-600">{fmt(row.vatOutput)}</td>
                                                    <td className="py-3 text-right font-medium text-slate-900">{fmt(row.traditionalVat)}</td>
                                                    <td className="py-3 text-right font-medium text-slate-900">{fmt(row.directVat)}</td>
                                                    <td className="py-3 pr-4 text-right font-bold">
                                                        {row.revenue === 0 && row.vatInput === 0 ? (
                                                            <span className="text-slate-400 font-normal">—</span>
                                                        ) : (
                                                            <span className={`px-2 py-0.5 rounded text-[10px] ${
                                                                row.isDirectCheaper 
                                                                    ? 'bg-blue-50 text-blue-700' 
                                                                    : 'bg-emerald-50 text-emerald-700'
                                                            }`}>
                                                                {row.isDirectCheaper ? t(language, 'Flat') : t(language, 'Traditional')}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr className="bg-slate-50/80 font-bold border-t border-slate-200 text-slate-900">
                                                <td className="py-3 px-4 text-sm font-black">{t(language, 'Yearly')}</td>
                                                <td className="py-3 text-right">{fmt(vatSimData.yearly.revenue)}</td>
                                                <td className="py-3 text-right">{fmt(vatSimData.yearly.vatInput)}</td>
                                                <td className="py-3 text-right">{fmt(vatSimData.yearly.vatOutput)}</td>
                                                <td className="py-3 text-right text-slate-950 font-black">{fmt(vatSimData.yearly.traditionalVat)}</td>
                                                <td className="py-3 text-right text-slate-950 font-black">{fmt(vatSimData.yearly.directVat)}</td>
                                                <td className="py-3 pr-4 text-right text-sm font-black">
                                                    {vatSimData.yearly.revenue === 0 && vatSimData.yearly.vatInput === 0 ? (
                                                        <span className="text-slate-400 font-normal">—</span>
                                                    ) : (
                                                        <span className={`px-2 py-0.5 rounded ${
                                                            vatSimData.yearly.isDirectCheaper 
                                                                ? 'bg-blue-100 text-blue-800' 
                                                                : 'bg-emerald-100 text-emerald-800'
                                                        }`}>
                                                            {vatSimData.yearly.isDirectCheaper ? t(language, 'Flat') : t(language, 'Traditional')}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsVatModalOpen(false)}
                                className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm transition"
                            >
                                {t(language, 'Close')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
