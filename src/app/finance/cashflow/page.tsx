'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, Briefcase, Landmark, CircleDollarSign, BarChart3 } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'
import CircularLoader from '@/components/CircularLoader'
import { computeCashFlowData } from './utils/cashflowCalculator'
import CashFlowStatisticsModal from './components/CashFlowStatisticsModal'

function fmt(n: number) { 
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) 
}

export default function CashFlowPage() {
    const { currency, language } = useSettings()
    const [loading, setLoading] = useState(true)
    const [month, setMonth] = useState(() => { 
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` 
    })
    const [viewMode, setViewMode] = useState<'management' | 'statutory'>('management')
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
    const [branchFilter, setBranchFilter] = useState<string>('All')
    const [isStatsOpen, setIsStatsOpen] = useState(false)

    // Expanded sections in the drill-down table
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        Operating: true,
        Investing: true,
        Financing: true
    })

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
    }

    // Raw datasets stored in state to supply the calculator
    const [coa, setCoa] = useState<any[]>([])
    const [channelMap, setChannelMap] = useState<any[]>([])
    const [cashoutMap, setCashoutMap] = useState<any[]>([])
    const [rawAccounts, setRawAccounts] = useState<any[]>([])
    const [rawClosings, setRawClosings] = useState<any[]>([])
    const [rawCashouts, setRawCashouts] = useState<any[]>([])
    const [rawCorpCards, setRawCorpCards] = useState<any[]>([])
    const [rawPOs, setRawPOs] = useState<any[]>([])
    const [rawCreditPay, setRawCreditPay] = useState<any[]>([])
    const [rawDepositPay, setRawDepositPay] = useState<any[]>([])
    const [rawAdjustments, setRawAdjustments] = useState<any[]>([])
    const [rawBalances, setRawBalances] = useState<any[]>([])

    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            const [yr, mo] = month.split('-').map(Number)
            const startDate = `${yr}-${String(mo).padStart(2, '0')}-01`
            const endDate = mo === 12 ? `${yr + 1}-01-01` : `${yr}-${String(mo + 1).padStart(2, '0')}-01`
            const prevMonthKey = mo === 1 ? `${yr - 1}-12` : `${yr}-${String(mo - 1).padStart(2, '0')}`
            const currentMonthKey = `${yr}-${String(mo).padStart(2, '0')}`

            const [
                accRes,
                closingsRes,
                cashoutRes,
                corpCardRes,
                poItemsRes,
                creditPayRes,
                depositPayRes,
                coaRes,
                cashoutMapRes,
                adjRes,
                balancesRes,
                channelMapRes,
                brRes
            ] = await Promise.all([
                supabase.from('fin_bank_accounts').select('*').eq('is_active', true),
                supabase.from('cashier_closings').select('report_date, branch_name, revenue_vnd, mpos_vnd, bank_transfer_ewallet_vnd, unpaid_vnd, third_party_amounts_json, deposits_vnd, set_off_debt_vnd, cash_out_vnd, payouts_vnd, repayments_cash_card_vnd')
                    .gte('report_date', startDate).lt('report_date', endDate),
                supabase.from('cashout').select('date, category, amount, branch')
                    .gte('date', startDate).lt('date', endDate),
                supabase.from('fin_corporate_card_expenses').select('expense_date, description, final_amount_vnd, is_paid, account_id, branch_ids')
                    .gte('expense_date', startDate).lt('expense_date', endDate).eq('is_paid', true),
                supabase.from('fin_payment_order_items').select('amount, account_id, branch_ids, fin_payment_orders!inner(order_date, status)')
                    .gte('fin_payment_orders.order_date', startDate).lt('fin_payment_orders.order_date', endDate)
                    .eq('fin_payment_orders.status', 'Paid'),
                supabase.from('credit_payments').select('date, amount, credits(branch)')
                    .gte('date', startDate).lt('date', endDate),
                supabase.from('deposit_payments').select('date, amount, deposits(branch)')
                    .gte('date', startDate).lt('date', endDate),
                supabase.from('fin_chart_of_accounts').select('id, name, simplified_name, cashflow_section, account_type'),
                supabase.from('fin_cashout_category_mapping').select('*'),
                supabase.from('fin_monthly_adjustments').select('*').eq('month_key', currentMonthKey),
                supabase.from('fin_monthly_balances').select('*').in('month_key', [currentMonthKey, prevMonthKey]),
                supabase.from('fin_revenue_channel_mapping').select('*'),
                supabase.from('provider_branches').select('id, name').order('name')
            ])

            if (accRes.data) setRawAccounts(accRes.data)
            if (brRes.data) setBranches(brRes.data as any)
            if (closingsRes.data) setRawClosings(closingsRes.data)
            if (cashoutRes.data) setRawCashouts(cashoutRes.data)
            if (corpCardRes.data) setRawCorpCards(corpCardRes.data)
            if (poItemsRes.data) setRawPOs(poItemsRes.data)
            if (creditPayRes.data) setRawCreditPay(creditPayRes.data)
            if (depositPayRes.data) setRawDepositPay(depositPayRes.data)
            if (coaRes.data) setCoa(coaRes.data)
            if (cashoutMapRes.data) setCashoutMap(cashoutMapRes.data)
            if (adjRes.data) setRawAdjustments(adjRes.data)
            if (balancesRes.data) setRawBalances(balancesRes.data)
            if (channelMapRes.data) setChannelMap(channelMapRes.data)
            
            setLoading(false)
        }
        fetchData()
    }, [month])

    // Calculate Cash Flow dynamically inside useMemo
    const cashFlowData = useMemo(() => {
        if (loading || coa.length === 0) {
            return {
                summary: { opNet: 0, invNet: 0, finNet: 0, netChange: 0, openingBalance: 0, closingBalance: 0, breakdown: [] },
                drilldown: { Operating: [], Investing: [], Financing: [] },
                normalizedTxs: [],
                filteredTxs: [],
                filteredAccounts: []
            }
        }
        return computeCashFlowData({
            coa,
            branches,
            rawClosings,
            rawCashouts,
            rawCorpCards,
            rawPOs,
            rawCreditPay,
            rawDepositPay,
            rawAdjustments,
            rawBalances,
            rawAccounts,
            channelMap,
            cashoutMap,
            language,
            month,
            branchFilter,
            viewMode
        })
    }, [
        loading,
        coa,
        branches,
        rawClosings,
        rawCashouts,
        rawCorpCards,
        rawPOs,
        rawCreditPay,
        rawDepositPay,
        rawAdjustments,
        rawBalances,
        rawAccounts,
        channelMap,
        cashoutMap,
        language,
        month,
        branchFilter,
        viewMode
    ])

    const { summary, drilldown } = cashFlowData

    // Navigation functions
    const prevMonth = () => {
        const [y, m] = month.split('-').map(Number)
        if (m === 1) setMonth(`${y - 1}-12`)
        else setMonth(`${y}-${String(m - 1).padStart(2, '0')}`)
    }

    const nextMonth = () => {
        const [y, m] = month.split('-').map(Number)
        if (m === 12) setMonth(`${y + 1}-01`)
        else setMonth(`${y}-${String(m + 1).padStart(2, '0')}`)
    }

    const fmtMonth = (m: string) => { 
        const [y, mo] = m.split('-').map(Number)
        return new Date(y, mo - 1, 1).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' }) 
    }

    const renderSectionHeader = (title: string, sectionKey: 'Operating' | 'Investing' | 'Financing', net: number) => {
        const expanded = expandedSections[sectionKey]
        const count = drilldown[sectionKey].length
        
        return (
            <div 
                onClick={() => toggleSection(sectionKey)}
                className="flex items-center justify-between p-4 bg-slate-50 border-b border-slate-100 cursor-pointer hover:bg-slate-100 transition select-none"
            >
                <div className="flex items-center gap-3">
                    <div className="text-slate-400">
                        {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRightIcon className="w-5 h-5" />}
                    </div>
                    <div className="font-bold text-slate-800">{title}</div>
                    <div className="text-xs font-medium text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                        {t(language, 'FinCFCategoriesCount').replace('{n}', String(count))}
                    </div>
                </div>
                <div className={`font-bold tabular-nums ${net >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                    {net >= 0 ? '+' : ''}{fmt(net)}
                </div>
            </div>
        )
    }

    const renderSectionRows = (sectionKey: 'Operating' | 'Investing' | 'Financing') => {
        if (!expandedSections[sectionKey]) return null
        const rows = drilldown[sectionKey]

        if (rows.length === 0) {
            return (
                <div className="p-4 text-sm text-slate-500 italic bg-white border-b border-slate-100 text-center">
                    {t(language, 'FinCFNoTransactions')}
                </div>
            )
        }

        return (
            <div className="bg-white border-b border-slate-100">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-100 bg-white text-xs text-slate-400 uppercase tracking-wider">
                            <th className="px-4 py-2 text-left font-medium">{t(language, 'FinCFTableCategory')}</th>
                            <th className="px-4 py-2 text-right font-medium">{t(language, 'FinCFTableInflows')}</th>
                            <th className="px-4 py-2 text-right font-medium">{t(language, 'FinCFTableOutflows')}</th>
                            <th className="px-4 py-2 text-right font-medium">{t(language, 'FinCFTableNet')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {rows.map((row, idx) => {
                            const net = row.inflow - row.outflow
                            return (
                                <tr key={`${row.category}-${idx}`} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-700">{row.category}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600">
                                        {row.inflow > 0 ? `+${fmt(row.inflow)}` : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-red-600">
                                        {row.outflow > 0 ? `−${fmt(row.outflow)}` : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className={`px-4 py-3 text-right tabular-nums font-bold ${net >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                                        {fmt(net)}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            
            {/* Header & Navigation */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t(language, 'FinCFTitle')}</h1>
                    <p className="text-slate-500 mt-1">{t(language, 'FinCFSubtitle')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                    <button 
                        onClick={() => setIsStatsOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition"
                    >
                        <BarChart3 className="w-4 h-4 text-slate-500" />
                        {language === 'vi' ? 'Thống kê' : 'Statistics'}
                    </button>

                    {/* Branch Filter */}
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t(language, 'FinCFBranch')}</span>
                        <select
                            value={branchFilter}
                            onChange={(e) => setBranchFilter(e.target.value)}
                            className="bg-transparent border-0 text-sm font-bold text-slate-700 focus:ring-0 cursor-pointer outline-none"
                        >
                            <option value="All">{t(language, 'FinCFAllBranches')}</option>
                            {branches.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* View Mode Tabs (Minimalist border-bottom style) */}
            <div className="flex items-center gap-6 border-b border-slate-200 mb-6">
                <button
                    type="button"
                    onClick={() => setViewMode('management')}
                    className={`pb-3 px-1 text-sm font-bold transition-all border-b-2 ${
                        viewMode === 'management' 
                            ? 'border-blue-600 text-blue-700' 
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    {t(language, 'FinCFManagement')}
                </button>
                <button
                    type="button"
                    onClick={() => setViewMode('statutory')}
                    className={`pb-3 px-1 text-sm font-bold transition-all border-b-2 ${
                        viewMode === 'statutory' 
                            ? 'border-amber-500 text-amber-700' 
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    {t(language, 'FinCFStatutory')}
                </button>
            </div>

            {loading ? <div className="flex justify-center py-20"><CircularLoader /></div> : (
                <div className="space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Opening Balance */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
                            <div>
                                <div className="text-sm font-bold text-slate-500 mb-1">{t(language, 'FinCFOpeningBalance')}</div>
                                <div className="text-xl sm:text-2xl font-black tabular-nums text-slate-900 mb-3">
                                    <span className="text-xs sm:text-sm font-semibold text-slate-400 mr-1">{currency}</span>
                                    {fmt(summary.openingBalance)}
                                </div>
                            </div>
                            <div className="space-y-1.5 border-t border-slate-100 pt-3">
                                {summary.breakdown.filter(b => b.opening !== 0).map((b, i) => (
                                    <div key={i} className="flex justify-between items-center text-xs">
                                        <div className="flex items-center gap-1.5 truncate text-slate-600">
                                            {b.type === 'Cash' ? <CircleDollarSign className="w-3.5 h-3.5 text-amber-500" /> : <Landmark className="w-3.5 h-3.5 text-emerald-500" />}
                                            <span className="truncate max-w-[140px]">{b.name}</span>
                                        </div>
                                        <div className="font-semibold tabular-nums text-slate-700">{fmt(b.opening)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Operating Cash Flow */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm relative overflow-hidden group flex flex-col justify-between min-h-[160px]">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition">
                                <Briefcase className="w-16 h-16 text-emerald-600" />
                            </div>
                            <div>
                                <div className="text-sm font-bold text-emerald-600 mb-1">{t(language, 'FinCFOperatingCashFlow')}</div>
                                <div className={`text-xl sm:text-2xl font-black tabular-nums mb-3 ${summary.opNet >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                                    {summary.opNet < 0 && <span className="mr-0.5">−</span>}
                                    {summary.opNet >= 0 && <span className="mr-0.5">+</span>}
                                    <span className="text-xs sm:text-sm font-semibold text-slate-400 mr-1">{currency}</span>
                                    {fmt(Math.abs(summary.opNet))}
                                </div>
                            </div>
                            <div className="text-xs text-slate-500 mt-4 border-t border-slate-100 pt-3">
                                {t(language, 'FinCFCoreBusinessFlow')}
                            </div>
                        </div>

                        {/* Closing Balance */}
                        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-sm text-white flex flex-col justify-between">
                            <div>
                                <div className="text-sm font-bold text-slate-400 mb-1">{t(language, 'FinCFClosingBalance')}</div>
                                <div className="text-xl sm:text-2xl font-black tabular-nums mb-3">
                                    <span className="text-xs sm:text-sm font-semibold text-slate-500 mr-1">{currency}</span>
                                    {fmt(summary.closingBalance)}
                                </div>
                            </div>
                            <div className="space-y-1.5 border-t border-slate-800 pt-3">
                                {summary.breakdown.filter(b => b.closing !== 0).map((b, i) => (
                                    <div key={i} className="flex justify-between items-center text-xs">
                                        <div className="flex items-center gap-1.5 truncate text-slate-300">
                                            {b.type === 'Cash' ? <CircleDollarSign className="w-3.5 h-3.5 text-amber-400" /> : <Landmark className="w-3.5 h-3.5 text-emerald-400" />}
                                            <span className="truncate max-w-[140px]">{b.name}</span>
                                        </div>
                                        <div className="font-semibold tabular-nums text-white">{fmt(b.closing)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Month Navigation for Table */}
                    <div className="grid grid-cols-3 items-center mb-1 mt-6">
                        <button onClick={prevMonth} className="justify-self-start text-sm font-semibold text-emerald-600 hover:text-emerald-800 hover:underline transition flex items-center gap-1">
                            <ChevronLeft className="w-4 h-4" /> {t(language, 'FinCFPrevious')}
                        </button>
                        <div className="justify-self-center text-lg font-bold text-slate-900">
                            {fmtMonth(month)}
                        </div>
                        <button onClick={nextMonth} className="justify-self-end text-sm font-semibold text-emerald-600 hover:text-emerald-800 hover:underline transition flex items-center gap-1">
                            {t(language, 'FinCFNext')} <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Drill-down Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-slate-900">{t(language, 'FinCFDrilldownTitle')}</h2>
                        </div>
                        
                        <div className="flex flex-col">
                            {renderSectionHeader(language === 'vi' ? '1. Dòng tiền từ hoạt động kinh doanh' : '1. Cash flows from Operating Activities', 'Operating', summary.opNet)}
                            {renderSectionRows('Operating')}

                            {renderSectionHeader(language === 'vi' ? '2. Dòng tiền từ hoạt động đầu tư' : '2. Cash flows from Investing Activities', 'Investing', summary.invNet)}
                            {renderSectionRows('Investing')}

                            {renderSectionHeader(language === 'vi' ? '3. Dòng tiền từ hoạt động tài chính' : '3. Cash flows from Financing Activities', 'Financing', summary.finNet)}
                            {renderSectionRows('Financing')}
                            
                            {/* Summary row */}
                            <div className="p-5 bg-slate-50 flex items-center justify-between border-t border-slate-200">
                                <div className="font-black text-slate-800 uppercase tracking-wider text-sm">{t(language, 'FinCFNetChangeInCash')}</div>
                                <div className={`font-black text-lg ${summary.netChange >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                                    {summary.netChange >= 0 ? '+' : ''}{currency} {fmt(summary.netChange)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <CashFlowStatisticsModal
                isOpen={isStatsOpen}
                onClose={() => setIsStatsOpen(false)}
                currentMonth={month}
                branchFilter={branchFilter}
                branches={branches}
                coa={coa}
                viewMode={viewMode}
                language={language}
            />
        </div>
    )
}
