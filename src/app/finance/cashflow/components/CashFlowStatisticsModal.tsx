'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { X, TrendingUp, Columns, ArrowUpRight, ArrowDownRight, Calendar, Filter } from 'lucide-react'
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip
} from 'recharts'
import { supabase } from '@/lib/supabase_shim'
import { t } from '@/lib/i18n'
import CircularLoader from '@/components/CircularLoader'
import { computeCashFlowData } from '../utils/cashflowCalculator'
import { useSettings } from '@/contexts/SettingsContext'

interface CashFlowStatisticsModalProps {
    isOpen: boolean
    onClose: () => void
    currentMonth: string // 'YYYY-MM'
    branchFilter: string // id or 'All'
    branches: Array<{ id: string; name: string }>
    coa: any[]
    viewMode: 'management' | 'statutory'
    language: string
}

function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0))
}

interface ComparisonRow {
    key: string
    name: string
    isMacro?: boolean
    isResult?: boolean
    isItem?: boolean
    section?: 'Operating' | 'Investing' | 'Financing'
    amountA: number
    amountB: number
}

export default function CashFlowStatisticsModal({
    isOpen,
    onClose,
    currentMonth,
    branchFilter,
    branches,
    coa,
    viewMode,
    language
}: CashFlowStatisticsModalProps) {
    const [activeTab, setActiveTab] = useState<'trend' | 'comparison'>('trend')
    const [loading, setLoading] = useState(true)
    const [months, setMonths] = useState<string[]>([])
    const [prevMonthOfOldest, setPrevMonthOfOldest] = useState<string>('')

    // Raw datasets for calculations
    const [rawClosings, setRawClosings] = useState<any[]>([])
    const [rawCashouts, setRawCashouts] = useState<any[]>([])
    const [rawCorpCards, setRawCorpCards] = useState<any[]>([])
    const [rawPOs, setRawPOs] = useState<any[]>([])
    const [rawCreditPay, setRawCreditPay] = useState<any[]>([])
    const [rawDepositPay, setRawDepositPay] = useState<any[]>([])
    const [rawAdjustments, setRawAdjustments] = useState<any[]>([])
    const [rawBalances, setRawBalances] = useState<any[]>([])
    const [rawAccounts, setRawAccounts] = useState<any[]>([])
    const [channelMap, setChannelMap] = useState<any[]>([])
    const [cashoutMap, setCashoutMap] = useState<any[]>([])

    // Local filters for Trend Tab
    const [trendBranchFilter, setTrendBranchFilter] = useState<string>(branchFilter)
    const [selectedItemKey, setSelectedItemKey] = useState<string>('section_Operating')
    const [trendPeriod, setTrendPeriod] = useState<number>(12)

    // Local filters for Comparison Tab
    const [monthA, setMonthA] = useState<string>(currentMonth)
    const [branchA, setBranchA] = useState<string>(branchFilter)
    const [monthB, setMonthB] = useState<string>('')
    const [branchB, setBranchB] = useState<string>(branchFilter)

    const years = useMemo(() => {
        const uniqueYears = new Set<string>()
        months.forEach(m => {
            if (m.length === 7) {
                uniqueYears.add(m.substring(0, 4))
            }
        })
        return Array.from(uniqueYears).sort((a, b) => b.localeCompare(a))
    }, [months])

    // Sync modal filters with main page filters when modal is opened
    useEffect(() => {
        if (isOpen) {
            setTrendBranchFilter(branchFilter)
            setBranchA(branchFilter)
            setBranchB(branchFilter)
            setMonthA(currentMonth)
        }
    }, [isOpen, branchFilter, currentMonth])

    // Set initial Month B when months list is loaded
    useEffect(() => {
        if (months.length > 1) {
            const currentIdx = months.indexOf(currentMonth)
            if (currentIdx > 0) {
                setMonthB(months[currentIdx - 1])
            } else if (months.length > 0) {
                setMonthB(months[0])
            }
        }
    }, [months, currentMonth])

    const { currency } = useSettings()

    const fmtMonth = (m: string) => {
        if (!m) return ''
        if (m.length === 4) {
            return language === 'vi' ? `Năm ${m}` : `Year ${m}`
        }
        const [yr, mo] = m.split('-').map(Number)
        return new Date(yr, mo - 1, 1).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', {
            month: 'short',
            year: 'numeric'
        })
    }

    const fmtMonthLong = (m: string) => {
        if (!m) return ''
        if (m.length === 4) {
            return language === 'vi' ? `Cả năm ${m}` : `Full Year ${m}`
        }
        const [yr, mo] = m.split('-').map(Number)
        return new Date(yr, mo - 1, 1).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', {
            month: 'long',
            year: 'numeric'
        })
    }

    const branchIdToName = useMemo(() => {
        const map: Record<string, string> = {}
        for (const b of branches) map[b.id] = b.name
        return map
    }, [branches])

    // Fetch all historical raw data on mount/open
    useEffect(() => {
        if (!isOpen) return

        async function fetchHistoricalData() {
            setLoading(true)
            try {
                // 1. Generate month list dynamically from database oldest record
                let startMonth = '2025-01'
                try {
                    const { data: oldestCc } = await supabase.from('cashier_closings')
                        .select('report_date')
                        .order('report_date', { ascending: true })
                        .limit(1)
                    if (oldestCc && oldestCc.length > 0 && oldestCc[0].report_date) {
                        startMonth = oldestCc[0].report_date.substring(0, 7)
                    }
                } catch (e) {
                    console.error('Error fetching oldest cashier closing date:', e)
                }

                const monthList: string[] = []
                const [startYr, startMo] = startMonth.split('-').map(Number)
                const [curYr, curMo] = currentMonth.split('-').map(Number)

                let tempYr = startYr
                let tempMo = startMo

                while (tempYr < curYr || (tempYr === curYr && tempMo <= curMo)) {
                    const mKey = `${tempYr}-${String(tempMo).padStart(2, '0')}`
                    monthList.push(mKey)
                    tempMo++
                    if (tempMo > 12) {
                        tempMo = 1
                        tempYr++
                    }
                }

                if (monthList.length === 0) {
                    const [yr, mo] = currentMonth.split('-').map(Number)
                    for (let i = 12; i >= 0; i--) {
                        const d = new Date(yr, mo - 1 - i, 1)
                        const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                        monthList.push(mKey)
                    }
                }
                setMonths(monthList)

                // Month key for opening balances of the oldest month in our list
                const oldestMonth = monthList[0]
                const [oy, om] = oldestMonth.split('-').map(Number)
                const prevD = new Date(oy, om - 2, 1)
                const oldestPrevMonth = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`
                setPrevMonthOfOldest(oldestPrevMonth)
                const balanceMonthKeys = [oldestPrevMonth, ...monthList]

                // SQL date range filters
                const startDate = `${oldestMonth}-01`
                const [cy, cm] = currentMonth.split('-').map(Number)
                const endDate = cm === 12 ? `${cy + 1}-01-01` : `${cy}-${String(cm + 1).padStart(2, '0')}-01`

                const [
                    accRes,
                    closingsRes,
                    cashoutRes,
                    corpCardRes,
                    poItemsRes,
                    creditPayRes,
                    depositPayRes,
                    channelMapRes,
                    cashoutMapRes,
                    adjRes,
                    balancesRes
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
                    supabase.from('fin_revenue_channel_mapping').select('*'),
                    supabase.from('fin_cashout_category_mapping').select('*'),
                    supabase.from('fin_monthly_adjustments').select('*').in('month_key', monthList),
                    supabase.from('fin_monthly_balances').select('*').in('month_key', balanceMonthKeys)
                ])

                if (accRes.data) setRawAccounts(accRes.data)
                if (closingsRes.data) setRawClosings(closingsRes.data)
                if (cashoutRes.data) setRawCashouts(cashoutRes.data)
                if (corpCardRes.data) setRawCorpCards(corpCardRes.data)
                if (poItemsRes.data) setRawPOs(poItemsRes.data)
                if (creditPayRes.data) setRawCreditPay(creditPayRes.data)
                if (depositPayRes.data) setRawDepositPay(depositPayRes.data)
                if (channelMapRes.data) setChannelMap(channelMapRes.data)
                if (cashoutMapRes.data) setCashoutMap(cashoutMapRes.data)
                if (adjRes.data) setRawAdjustments(adjRes.data)
                if (balancesRes.data) setRawBalances(balancesRes.data)

            } catch (err) {
                console.error('Error fetching Cash Flow statistics:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchHistoricalData()
    }, [isOpen, currentMonth])

    // Cash flow data calculator in-memory
    const computeCashFlowForMonthAndBranch = useMemo(() => {
        const calculateForMonth = (m: string, branchF: string): any => {
            if (months.length === 0 || !m) {
                return {
                    summary: { opNet: 0, invNet: 0, finNet: 0, netChange: 0, openingBalance: 0, closingBalance: 0, breakdown: [] },
                    drilldown: { Operating: [], Investing: [], Financing: [] }
                }
            }

            // Year aggregation support
            if (m.length === 4) {
                const yearMonths = months.filter(x => x.startsWith(`${m}-`))
                if (yearMonths.length === 0) {
                    return {
                        summary: { opNet: 0, invNet: 0, finNet: 0, netChange: 0, openingBalance: 0, closingBalance: 0, breakdown: [] },
                        drilldown: { Operating: [], Investing: [], Financing: [] }
                    }
                }

                const firstMonthData = calculateForMonth(yearMonths[0], branchF)
                const lastMonthData = calculateForMonth(yearMonths[yearMonths.length - 1], branchF)

                let opNet = 0
                let invNet = 0
                let finNet = 0
                let netChange = 0

                const catAccumulator: Record<string, { category: string; inflow: number; outflow: number }> = {}

                for (const ym of yearMonths) {
                    const mData = calculateForMonth(ym, branchF)
                    opNet += mData.summary.opNet
                    invNet += mData.summary.invNet
                    finNet += mData.summary.finNet
                    netChange += mData.summary.netChange

                    for (const sec of ['Operating', 'Investing', 'Financing'] as const) {
                        for (const row of mData.drilldown[sec] || []) {
                            const key = `${sec}_${row.category}`
                            if (!catAccumulator[key]) {
                                catAccumulator[key] = { category: row.category, inflow: 0, outflow: 0 }
                            }
                            catAccumulator[key].inflow += row.inflow
                            catAccumulator[key].outflow += row.outflow
                        }
                    }
                }

                const drilldown = {
                    Operating: Object.values(catAccumulator).filter(c => catAccumulator[`Operating_${c.category}`]).sort((a, b) => (b.inflow + b.outflow) - (a.inflow + a.outflow)),
                    Investing: Object.values(catAccumulator).filter(c => catAccumulator[`Investing_${c.category}`]).sort((a, b) => (b.inflow + b.outflow) - (a.inflow + a.outflow)),
                    Financing: Object.values(catAccumulator).filter(c => catAccumulator[`Financing_${c.category}`]).sort((a, b) => (b.inflow + b.outflow) - (a.inflow + a.outflow)),
                }

                return {
                    summary: {
                        opNet,
                        invNet,
                        finNet,
                        netChange,
                        openingBalance: firstMonthData.summary.openingBalance,
                        closingBalance: lastMonthData.summary.closingBalance,
                        breakdown: []
                    },
                    drilldown
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
                month: m,
                branchFilter: branchF,
                viewMode
            })
        }

        return (m: string, branchF: string) => calculateForMonth(m, branchF)
    }, [
        months,
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
        viewMode
    ])

    // Generate Selectable items for Trend chart (unique list of all categories + sections across 13 months)
    const trendSelectableItems = useMemo(() => {
        if (months.length === 0) return []

        const sectionItems = [
            { key: 'section_Operating', label: language === 'vi' ? '1. Hoạt động kinh doanh' : '1. Operating Activities', isSection: true },
            { key: 'section_Investing', label: language === 'vi' ? '2. Hoạt động đầu tư' : '2. Investing Activities', isSection: true },
            { key: 'section_Financing', label: language === 'vi' ? '3. Hoạt động tài chính' : '3. Financing Activities', isSection: true },
            { key: 'section_NetChange', label: language === 'vi' ? 'Thay đổi dòng tiền thuần' : 'Net Change in Cash', isSection: true },
            { key: 'section_OpeningBalance', label: language === 'vi' ? 'Số dư đầu kỳ' : 'Opening Balance', isSection: true },
            { key: 'section_ClosingBalance', label: language === 'vi' ? 'Số dư cuối kỳ' : 'Closing Balance', isSection: true },
        ]

        const categoriesSet = new Set<string>()
        const categoryToSection: Record<string, 'Operating' | 'Investing' | 'Financing'> = {}

        for (const mKey of months) {
            const data = computeCashFlowForMonthAndBranch(mKey, trendBranchFilter)
            if (data?.drilldown) {
                for (const sec of ['Operating', 'Investing', 'Financing'] as const) {
                    for (const row of data.drilldown[sec] || []) {
                        categoriesSet.add(row.category)
                        categoryToSection[row.category] = sec
                    }
                }
            }
        }

        const sortedCategories = Array.from(categoriesSet).sort()

        const categoryItems = sortedCategories.map(cat => {
            const sec = categoryToSection[cat]
            let sectionPrefix = ''
            if (sec === 'Operating') sectionPrefix = language === 'vi' ? 'Kinh doanh' : 'Operating'
            else if (sec === 'Investing') sectionPrefix = language === 'vi' ? 'Đầu tư' : 'Investing'
            else if (sec === 'Financing') sectionPrefix = language === 'vi' ? 'Tài chính' : 'Financing'

            return {
                key: `category_${sec}_${cat}`,
                label: `${cat} (${sectionPrefix})`,
                isSection: false
            }
        })

        return [...sectionItems, ...categoryItems]
    }, [computeCashFlowForMonthAndBranch, months, trendBranchFilter, language])

    // Find currently selected trend item object
    const selectedItem = useMemo(() => {
        return trendSelectableItems.find(item => item.key === selectedItemKey) || trendSelectableItems[0]
    }, [trendSelectableItems, selectedItemKey])

    // Compute Trend Chart Data
    const trendChartData = useMemo(() => {
        if (months.length === 0 || !selectedItemKey) return []
        const numMonths = trendPeriod
        const subset = numMonths === 999 ? months : months.slice(-numMonths)

        const calculatedSubset = subset.map((mKey) => {
            const data = computeCashFlowForMonthAndBranch(mKey, trendBranchFilter)
            let amt = 0

            if (selectedItemKey.startsWith('section_')) {
                const sec = selectedItemKey.replace('section_', '')
                if (sec === 'Operating') amt = data.summary.opNet
                else if (sec === 'Investing') amt = data.summary.invNet
                else if (sec === 'Financing') amt = data.summary.finNet
                else if (sec === 'NetChange') amt = data.summary.netChange
                else if (sec === 'OpeningBalance') amt = data.summary.openingBalance
                else if (sec === 'ClosingBalance') amt = data.summary.closingBalance
            } else if (selectedItemKey.startsWith('category_')) {
                const parts = selectedItemKey.split('_')
                const sec = parts[1] as 'Operating' | 'Investing' | 'Financing'
                const catName = parts.slice(2).join('_')
                const matched = data.drilldown[sec]?.find((r: any) => r.category === catName)
                if (matched) {
                    amt = matched.inflow - matched.outflow
                }
            }

            return { mKey, amt }
        })

        return calculatedSubset.map(({ mKey, amt }, index) => {
            let momChangePct = 0
            if (index > 0) {
                const prevAmt = calculatedSubset[index - 1].amt
                if (prevAmt !== 0) {
                    momChangePct = ((amt - prevAmt) / Math.abs(prevAmt)) * 100
                }
            }

            return {
                month: mKey,
                monthLabel: fmtMonth(mKey),
                amount: amt,
                mom: momChangePct
            }
        })
    }, [computeCashFlowForMonthAndBranch, selectedItemKey, months, trendBranchFilter, trendPeriod])

    const trendTableData = useMemo(() => {
        return [...trendChartData].reverse()
    }, [trendChartData])

    // Comparison datasets
    const dataA = useMemo(() => {
        return computeCashFlowForMonthAndBranch(monthA, branchA)
    }, [computeCashFlowForMonthAndBranch, monthA, branchA])

    const dataB = useMemo(() => {
        return computeCashFlowForMonthAndBranch(monthB, branchB)
    }, [computeCashFlowForMonthAndBranch, monthB, branchB])

    // Generate comparison lines
    const comparisonTableLines = useMemo(() => {
        if (!dataA || !dataB) return []

        const rows: ComparisonRow[] = []

        // 1. Opening Balance
        rows.push({
            key: 'opening_balance',
            name: language === 'vi' ? 'Số dư đầu kỳ' : 'Opening Balance',
            isMacro: true,
            amountA: dataA.summary.openingBalance,
            amountB: dataB.summary.openingBalance
        })

        // 2. Operating Activities
        rows.push({
            key: 'section_operating_header',
            name: language === 'vi' ? '1. DÒNG TIỀN TỪ HOẠT ĐỘNG KINH DOANH' : '1. CASH FLOWS FROM OPERATING ACTIVITIES',
            isResult: true,
            amountA: dataA.summary.opNet,
            amountB: dataB.summary.opNet
        })

        const opCats = new Set<string>()
        dataA.drilldown.Operating?.forEach((r: any) => opCats.add(r.category))
        dataB.drilldown.Operating?.forEach((r: any) => opCats.add(r.category))
        Array.from(opCats).sort().forEach(cat => {
            const itemA = dataA.drilldown.Operating?.find((r: any) => r.category === cat)
            const itemB = dataB.drilldown.Operating?.find((r: any) => r.category === cat)
            rows.push({
                key: `op_cat_${cat}`,
                name: cat,
                isItem: true,
                section: 'Operating',
                amountA: itemA ? itemA.inflow - itemA.outflow : 0,
                amountB: itemB ? itemB.inflow - itemB.outflow : 0
            })
        })

        // 3. Investing Activities
        rows.push({
            key: 'section_investing_header',
            name: language === 'vi' ? '2. DÒNG TIỀN TỪ HOẠT ĐỘNG ĐẦU TƯ' : '2. CASH FLOWS FROM INVESTING ACTIVITIES',
            isResult: true,
            amountA: dataA.summary.invNet,
            amountB: dataB.summary.invNet
        })

        const invCats = new Set<string>()
        dataA.drilldown.Investing?.forEach((r: any) => invCats.add(r.category))
        dataB.drilldown.Investing?.forEach((r: any) => invCats.add(r.category))
        Array.from(invCats).sort().forEach(cat => {
            const itemA = dataA.drilldown.Investing?.find((r: any) => r.category === cat)
            const itemB = dataB.drilldown.Investing?.find((r: any) => r.category === cat)
            rows.push({
                key: `inv_cat_${cat}`,
                name: cat,
                isItem: true,
                section: 'Investing',
                amountA: itemA ? itemA.inflow - itemA.outflow : 0,
                amountB: itemB ? itemB.inflow - itemB.outflow : 0
            })
        })

        // 4. Financing Activities
        rows.push({
            key: 'section_financing_header',
            name: language === 'vi' ? '3. DÒNG TIỀN TỪ HOẠT ĐỘNG TÀI CHÍNH' : '3. CASH FLOWS FROM FINANCING ACTIVITIES',
            isResult: true,
            amountA: dataA.summary.finNet,
            amountB: dataB.summary.finNet
        })

        const finCats = new Set<string>()
        dataA.drilldown.Financing?.forEach((r: any) => finCats.add(r.category))
        dataB.drilldown.Financing?.forEach((r: any) => finCats.add(r.category))
        Array.from(finCats).sort().forEach(cat => {
            const itemA = dataA.drilldown.Financing?.find((r: any) => r.category === cat)
            const itemB = dataB.drilldown.Financing?.find((r: any) => r.category === cat)
            rows.push({
                key: `fin_cat_${cat}`,
                name: cat,
                isItem: true,
                section: 'Financing',
                amountA: itemA ? itemA.inflow - itemA.outflow : 0,
                amountB: itemB ? itemB.inflow - itemB.outflow : 0
            })
        })

        // 5. Net Change in Cash
        rows.push({
            key: 'net_change_in_cash',
            name: language === 'vi' ? 'TỔNG TĂNG/GIẢM TIỀN THUẦN TRONG KỲ' : 'NET CHANGE IN CASH FOR THE PERIOD',
            isResult: true,
            amountA: dataA.summary.netChange,
            amountB: dataB.summary.netChange
        })

        // 6. Closing Balance
        rows.push({
            key: 'closing_balance',
            name: language === 'vi' ? 'Số dư cuối kỳ' : 'Closing Balance',
            isMacro: true,
            amountA: dataA.summary.closingBalance,
            amountB: dataB.summary.closingBalance
        })

        return rows
    }, [dataA, dataB, language])

    if (!isOpen) return null

    // Determine Chart theme based on selected item amount
    const isNegative = trendChartData[trendChartData.length - 1]?.amount < 0
    const strokeColor = isNegative ? '#f43f5e' : '#10b981'
    const fillColor = isNegative ? 'url(#roseGradient)' : 'url(#emeraldGradient)'

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[90vh] max-h-[850px] border border-slate-200/50">
                
                {/* Header */}
                <div className="p-6 bg-white border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">
                            {language === 'vi' ? 'Thống kê & So sánh Dòng tiền' : 'Cash Flow Statistics & Comparison'}
                        </h2>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full font-semibold ${viewMode === 'management' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                                {viewMode === 'management' ? t(language, 'FinCFManagement') : t(language, 'FinCFStatutory')}
                            </span>
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-xl transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="px-6 py-3 bg-white border-b border-slate-100 flex gap-4">
                    <button
                        onClick={() => setActiveTab('trend')}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition ${
                            activeTab === 'trend'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        <TrendingUp className="w-4 h-4" />
                        {language === 'vi' ? 'Biểu đồ Xu hướng' : 'Trend Charts'}
                    </button>
                    <button
                        onClick={() => setActiveTab('comparison')}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition ${
                            activeTab === 'comparison'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        <Columns className="w-4 h-4" />
                        {language === 'vi' ? 'So sánh song song' : 'Side-by-Side Comparison'}
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto min-h-0 bg-slate-50">
                    {loading ? (
                        <div className="flex flex-col justify-center items-center h-full py-20 gap-3">
                            <CircularLoader />
                            <span className="text-sm font-medium text-slate-400">
                                {language === 'vi' ? 'Đang tải dữ liệu lịch sử...' : 'Retrieving historical database records...'}
                            </span>
                        </div>
                    ) : activeTab === 'trend' ? (
                        <div className="p-6 space-y-6">
                            
                            {/* Trend controls */}
                            <div className="bg-white p-5 rounded-2xl border border-slate-200/50 shadow-sm grid grid-cols-1 md:grid-cols-3 items-end gap-4">
                                <div className="w-full">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                        {language === 'vi' ? 'Khoản mục Dòng tiền' : 'Cash Flow Item'}
                                    </label>
                                    <select
                                        value={selectedItemKey}
                                        onChange={e => setSelectedItemKey(e.target.value)}
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold bg-slate-50 text-slate-800 shadow-inner focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                    >
                                        {trendSelectableItems.map(item => (
                                            <option key={item.key} value={item.key} className={item.isSection ? 'font-bold' : ''}>
                                                {item.isSection ? item.label : `\u00A0\u00A0\u00A0\u00A0${item.label}`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div className="w-full">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                        {language === 'vi' ? 'Chi nhánh' : 'Branch Filter'}
                                    </label>
                                    <div className="relative">
                                        <Filter className="absolute left-3.5 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                                        <select
                                            value={trendBranchFilter}
                                            onChange={e => setTrendBranchFilter(e.target.value)}
                                            className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-semibold bg-slate-50 text-slate-800 shadow-inner focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                        >
                                            <option value="All">{t(language, 'FinCFAllBranches')}</option>
                                            {branches.map(b => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="flex flex-col md:items-end">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                        {language === 'vi' ? 'Khoảng thời gian' : 'Timeframe'}
                                    </label>
                                    <div className="inline-flex rounded-xl bg-slate-100 p-1 w-full md:w-auto">
                                        <button
                                            onClick={() => setTrendPeriod(3)}
                                            className={`flex-1 md:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                                                trendPeriod === 3 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                            }`}
                                        >
                                            {language === 'vi' ? '3 tháng' : '3 Months'}
                                        </button>
                                        <button
                                            onClick={() => setTrendPeriod(6)}
                                            className={`flex-1 md:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                                                trendPeriod === 6 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                            }`}
                                        >
                                            {language === 'vi' ? '6 tháng' : '6 Months'}
                                        </button>
                                        <button
                                            onClick={() => setTrendPeriod(12)}
                                            className={`flex-1 md:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                                                trendPeriod === 12 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                            }`}
                                        >
                                            {language === 'vi' ? '12 tháng' : '12 Months'}
                                        </button>
                                        <button
                                            onClick={() => setTrendPeriod(999)}
                                            className={`flex-1 md:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                                                trendPeriod === 999 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                            }`}
                                        >
                                            {language === 'vi' ? 'Tất cả' : 'All'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Chart Display */}
                            {selectedItem && (
                                <div className="bg-white p-5 rounded-2xl border border-slate-200/50 shadow-sm space-y-4">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                                                {selectedItem.label}
                                            </h3>
                                            <p className="text-2xl font-black text-slate-900 mt-1">
                                                {currency} {fmt(trendChartData[trendChartData.length - 1]?.amount || 0)}
                                                <span className="text-xs font-normal text-slate-400 ml-2">
                                                    {language === 'vi' ? 'tháng hiện tại' : 'current month'}
                                                </span>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="h-64 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={trendChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                                                    </linearGradient>
                                                    <linearGradient id="roseGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                                                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis
                                                    dataKey="monthLabel"
                                                    tickLine={false}
                                                    axisLine={false}
                                                    dy={10}
                                                    style={{ fontSize: '11px', fontWeight: 600, fill: '#64748b' }}
                                                />
                                                <YAxis
                                                    tickLine={false}
                                                    axisLine={false}
                                                    tickFormatter={val => `${fmt(val / 1000000)}M`}
                                                    dx={-10}
                                                    style={{ fontSize: '10px', fontWeight: 500, fill: '#94a3b8' }}
                                                />
                                                <Tooltip
                                                    content={({ active, payload }) => {
                                                        if (active && payload && payload.length) {
                                                            const data = payload[0].payload
                                                            const isMomImprovement = data.mom > 0
                                                            return (
                                                                <div className="bg-slate-950 text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-800 text-sm">
                                                                    <div className="text-[10px] font-bold text-slate-400 mb-1">{data.monthLabel}</div>
                                                                    <div className="font-extrabold text-white">{currency} {fmt(data.amount)}</div>
                                                                    {data.mom !== 0 && (
                                                                        <div className={`text-xs mt-1.5 flex items-center gap-1 font-semibold ${
                                                                            isMomImprovement ? 'text-emerald-400' : 'text-rose-400'
                                                                        }`}>
                                                                            {data.mom > 0 ? '+' : ''}{data.mom.toFixed(1)}% MoM
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )
                                                        }
                                                        return null
                                                    }}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="amount"
                                                    stroke={strokeColor}
                                                    strokeWidth={2.5}
                                                    fill={fillColor}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            {/* Details Table */}
                            <div className="bg-white rounded-2xl border border-slate-200/50 shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100">
                                    <h4 className="text-sm font-bold text-slate-800">
                                        {language === 'vi' ? 'Bảng chi tiết hàng tháng' : 'Monthly Breakdown'}
                                    </h4>
                                </div>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 text-xs uppercase font-semibold">
                                            <th className="p-4 text-left">{language === 'vi' ? 'Tháng' : 'Month'}</th>
                                            <th className="p-4 text-right">{language === 'vi' ? 'Giá trị' : 'Value'}</th>
                                            <th className="p-4 text-right">{language === 'vi' ? 'Thay đổi MoM' : 'MoM Change'}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {trendTableData.map((row) => {
                                            const isImprovement = row.mom > 0
                                            const isNeutral = row.mom === 0

                                            return (
                                                <tr key={row.month} className="hover:bg-slate-50 transition">
                                                    <td className="p-4 font-semibold text-slate-800">{row.monthLabel}</td>
                                                    <td className="p-4 text-right font-mono text-slate-800 tabular-nums font-semibold">
                                                        {row.amount >= 0 ? '+' : ''}{currency} {fmt(row.amount)}
                                                    </td>
                                                    <td className="p-4 text-right align-middle">
                                                        {isNeutral ? (
                                                            <span className="text-slate-400 font-mono">—</span>
                                                        ) : (
                                                            <span className={`inline-flex items-center gap-1 font-bold text-xs px-2.5 py-1 rounded-full ${
                                                                isImprovement ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                                                            }`}>
                                                                {row.mom > 0 ? '+' : ''}{row.mom.toFixed(1)}%
                                                                {isImprovement ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="p-6 space-y-6">
                            
                            {/* Side-by-Side comparison controls */}
                            <div className="bg-white p-5 rounded-2xl border border-slate-200/50 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Subject A */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                        {language === 'vi' ? 'Đối tượng A (Cột Trái)' : 'Subject A (Left Column)'}
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                                            <select
                                                value={monthA}
                                                onChange={e => setMonthA(e.target.value)}
                                                className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold bg-slate-50 text-slate-800 shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                            >
                                                <optgroup label={language === 'vi' ? 'Năm' : 'Years'}>
                                                    {years.map(y => (
                                                        <option key={y} value={y}>
                                                            {language === 'vi' ? `Năm ${y}` : `Year ${y}`}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                                <optgroup label={language === 'vi' ? 'Tháng' : 'Months'}>
                                                    {months.map(m => (
                                                        <option key={m} value={m}>{fmtMonthLong(m)}</option>
                                                    ))}
                                                </optgroup>
                                            </select>
                                        </div>
                                        <div className="relative">
                                            <Filter className="absolute left-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                                            <select
                                                value={branchA}
                                                onChange={e => setBranchA(e.target.value)}
                                                className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold bg-slate-50 text-slate-800 shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                            >
                                                <option value="All">{t(language, 'FinCFAllBranches')}</option>
                                                {branches.map(b => (
                                                    <option key={b.id} value={b.id}>{b.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Subject B */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                                        {language === 'vi' ? 'Đối tượng B (Cột Phải)' : 'Subject B (Right Column)'}
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                                            <select
                                                value={monthB}
                                                onChange={e => setMonthB(e.target.value)}
                                                className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold bg-slate-50 text-slate-800 shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                            >
                                                <optgroup label={language === 'vi' ? 'Năm' : 'Years'}>
                                                    {years.map(y => (
                                                        <option key={y} value={y}>
                                                            {language === 'vi' ? `Năm ${y}` : `Year ${y}`}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                                <optgroup label={language === 'vi' ? 'Tháng' : 'Months'}>
                                                    {months.map(m => (
                                                        <option key={m} value={m}>{fmtMonthLong(m)}</option>
                                                    ))}
                                                </optgroup>
                                            </select>
                                        </div>
                                        <div className="relative">
                                            <Filter className="absolute left-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                                            <select
                                                value={branchB}
                                                onChange={e => setBranchB(e.target.value)}
                                                className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold bg-slate-50 text-slate-800 shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                            >
                                                <option value="All">{t(language, 'FinCFAllBranches')}</option>
                                                {branches.map(b => (
                                                    <option key={b.id} value={b.id}>{b.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Comparison Side-by-side Table */}
                            <div className="bg-white rounded-3xl border border-slate-200/50 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 text-xs uppercase font-semibold">
                                                <th className="p-4 text-left min-w-[200px]">{language === 'vi' ? 'Khoản mục Dòng tiền' : 'Cash Flow Line'}</th>
                                                <th className="p-4 text-right whitespace-nowrap min-w-[130px]">
                                                    <div className="font-bold">{fmtMonth(monthA)}</div>
                                                    <div className="text-[10px] text-slate-400 normal-case mt-0.5">
                                                        {branchA === 'All' ? (language === 'vi' ? 'Tất cả' : 'All Branches') : branchIdToName[branchA]}
                                                    </div>
                                                </th>
                                                <th className="p-4 text-right whitespace-nowrap min-w-[130px]">
                                                    <div className="font-bold">{fmtMonth(monthB)}</div>
                                                    <div className="text-[10px] text-slate-400 normal-case mt-0.5">
                                                        {branchB === 'All' ? (language === 'vi' ? 'Tất cả' : 'All Branches') : branchIdToName[branchB]}
                                                    </div>
                                                </th>
                                                <th className="p-4 text-right min-w-[120px]">{language === 'vi' ? 'Chênh lệch' : 'Variance'}</th>
                                                <th className="p-4 text-right min-w-[80px]">%</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {comparisonTableLines.map((row) => {
                                                const variance = row.amountA - row.amountB
                                                let variancePct = 0
                                                if (row.amountB !== 0) {
                                                    variancePct = (variance / Math.abs(row.amountB)) * 100
                                                }

                                                const isMacro = row.isMacro
                                                const isResult = row.isResult
                                                const isItem = row.isItem

                                                let rowClass = 'hover:bg-slate-50 transition'
                                                let cellClass = 'p-4 text-slate-800'
                                                let labelClass = 'font-medium'

                                                if (isMacro) {
                                                    rowClass = 'bg-slate-100/70 border-t border-b border-slate-200'
                                                    cellClass = 'p-3 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider'
                                                    labelClass = 'font-black'
                                                } else if (isResult) {
                                                    rowClass = 'bg-slate-50 border-t-2 border-b-2 border-slate-200/65'
                                                    cellClass = 'p-4 text-slate-900 font-extrabold font-black'
                                                    labelClass = 'font-black text-slate-900 font-extrabold font-black'
                                                } else if (isItem) {
                                                    cellClass = 'p-3.5 text-xs text-slate-600'
                                                    labelClass = 'pl-6 font-normal text-slate-500'
                                                }

                                                const isImprovement = variance > 0
                                                const isNeutral = variance === 0

                                                return (
                                                    <tr key={row.key} className={rowClass}>
                                                        <td className={`${cellClass} ${labelClass}`}>{row.name}</td>
                                                        <td className={`${cellClass} text-right font-mono tabular-nums`}>
                                                            {row.amountA >= 0 ? '+' : ''}{currency} {fmt(row.amountA)}
                                                        </td>
                                                        <td className={`${cellClass} text-right font-mono tabular-nums`}>
                                                            {row.amountB >= 0 ? '+' : ''}{currency} {fmt(row.amountB)}
                                                        </td>
                                                        <td className={`${cellClass} text-right font-mono tabular-nums font-bold ${
                                                            isNeutral ? 'text-slate-400' : isImprovement ? 'text-emerald-600' : 'text-rose-600'
                                                        }`}>
                                                            {isNeutral ? '' : `${variance > 0 ? '+' : ''}${fmt(variance)}`}
                                                        </td>
                                                        <td className={`${cellClass} text-right font-bold`}>
                                                            {isNeutral ? '—' : (
                                                                <div className={`inline-flex items-center gap-1 justify-end w-full ${
                                                                    isNeutral ? 'text-slate-400' : isImprovement ? 'text-emerald-600' : 'text-rose-600'
                                                                }`}>
                                                                    <span>
                                                                        {row.amountB === 0 ? (
                                                                            variance === 0 ? '—' : 'New'
                                                                        ) : (
                                                                            `${variancePct > 0 ? '+' : ''}${variancePct.toFixed(1)}%`
                                                                        )}
                                                                    </span>
                                                                    {!isNeutral && (
                                                                        isImprovement 
                                                                            ? <ArrowUpRight className="w-3.5 h-3.5 stroke-[3]" /> 
                                                                            : <ArrowDownRight className="w-3.5 h-3.5 stroke-[3]" />
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
