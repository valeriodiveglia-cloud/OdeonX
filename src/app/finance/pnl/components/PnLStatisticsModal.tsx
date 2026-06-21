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
import type { FinChartOfAccount } from '@/types/finance'
import { computePnLData, PnLLine } from '../utils/pnlCalculator'
import { useSettings } from '@/contexts/SettingsContext'

interface PnLStatisticsModalProps {
    isOpen: boolean
    onClose: () => void
    currentMonth: string // 'YYYY-MM'
    branchFilter: string // id or 'All'
    branches: Array<{ id: string; name: string }>
    coa: FinChartOfAccount[]
    pnlViewMode: 'management' | 'statutory'
    language: string
}

function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0))
}

const getLineKey = (line: PnLLine) => line.accountId || (line.code + '_' + line.name)

function isExpenseLine(code: string, parentCode?: string): boolean {
    const targetCode = parentCode || code
    return ['02', '11', '25', '26', '27', '32', '34', '51'].includes(targetCode)
}

export default function PnLStatisticsModal({
    isOpen,
    onClose,
    currentMonth,
    branchFilter,
    branches,
    coa,
    pnlViewMode,
    language
}: PnLStatisticsModalProps) {
    const [activeTab, setActiveTab] = useState<'trend' | 'comparison'>('trend')
    const [loading, setLoading] = useState(true)
    const [months, setMonths] = useState<string[]>([])
    const [prevMonthOfOldest, setPrevMonthOfOldest] = useState<string>('')

    // Raw datasets stored in state to allow instant client-side branch recalculations
    const [rawClosings, setRawClosings] = useState<any[]>([])
    const [rawInvoices, setRawInvoices] = useState<any[]>([])
    const [rawCashouts, setRawCashouts] = useState<any[]>([])
    const [rawWastage, setRawWastage] = useState<any[]>([])
    const [rawAdjustments, setRawAdjustments] = useState<any[]>([])
    const [rawPOs, setRawPOs] = useState<any[]>([])
    const [rawBankFees, setRawBankFees] = useState<any[]>([])
    const [rawInventory, setRawInventory] = useState<any[]>([])
    const [rawAlloc, setRawAlloc] = useState<any>({ global_strategy: 'equal', exceptions: [], gross_up_accounts: [] })
    const [rawTaxes, setRawTaxes] = useState<any[]>([])
    const [rawCashoutMap, setRawCashoutMap] = useState<any[]>([])
    const [rawInvMap, setRawInvMap] = useState<any[]>([])
    const [rawMaterials, setRawMaterials] = useState<any[]>([])
    const [rawPreps, setRawPreps] = useState<any[]>([])
    const [rawFinals, setRawFinals] = useState<any[]>([])

    // Local filters for Statistics Dashboard
    const [trendBranchFilter, setTrendBranchFilter] = useState<string>(branchFilter)
    const [selectedLineKey, setSelectedLineKey] = useState<string>('01_Operating Revenue')
    const [trendPeriod, setTrendPeriod] = useState<number>(12)

    // Local filters for Comparison Dashboard
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

    // Set initial Month B to previous month when months list is loaded
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

    // Lookup table mappings
    const branchNameToId = useMemo(() => {
        const map: Record<string, string> = {}
        for (const b of branches) map[b.name] = b.id
        return map
    }, [branches])

    const branchIdToName = useMemo(() => {
        const map: Record<string, string> = {}
        for (const b of branches) map[b.id] = b.name
        return map
    }, [branches])

    const allBranchIds = useMemo(() => branches.map(b => b.id), [branches])

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

                // Month key for opening inventory of the oldest month in our list
                const oldestMonth = monthList[0]
                const [oy, om] = oldestMonth.split('-').map(Number)
                const prevD = new Date(oy, om - 2, 1)
                const oldestPrevMonth = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`
                setPrevMonthOfOldest(oldestPrevMonth)
                const inventoryMonthKeys = [oldestPrevMonth, ...monthList]

                // SQL date range filters
                const startDate = `${oldestMonth}-01`
                const [cy, cm] = currentMonth.split('-').map(Number)
                const endDate = cm === 12 ? `${cy + 1}-01-01` : `${cy}-${String(cm + 1).padStart(2, '0')}-01`

                // 2. Fetch all raw datasets across the date range in single calls
                const [
                    closingsRes,
                    invoicesRes,
                    cashoutRes,
                    wastageRes,
                    adjustmentsRes,
                    poRes,
                    bankFeesRes,
                    inventoryRecordsRes,
                    allocRes,
                    taxSettingsRes,
                    cashoutMappingRes,
                    invMappingRes,
                    materialsRes,
                    prepRes,
                    finalRes
                ] = await Promise.all([
                    supabase.from('cashier_closings').select('revenue_vnd, branch_name, report_date, shift, cashier_name, notes')
                        .gte('report_date', startDate).lt('report_date', endDate),
                    supabase.from('fin_invoices').select('account_id, gross_amount, net_amount, branch_ids, invoice_number, invoice_date, description, is_personal_deduction, custom_supplier_name, suppliers(name)')
                        .gte('invoice_date', startDate).lt('invoice_date', endDate)
                        .neq('status', 'Cancelled'),
                    supabase.from('cashout').select('category, amount, branch, date, description, supplier_name, suppliers(name)')
                        .gte('date', startDate).lt('date', endDate)
                        .eq('invoice', false),
                    supabase.from('wastage_entries').select('total_cost_vnd, branch_name, date, wtype, item_id, category_id, item_name')
                        .eq('charge_target', 'Staff')
                        .gte('date', startDate).lt('date', endDate),
                    supabase.from('fin_monthly_adjustments').select('*').in('month_key', monthList),
                    supabase.from('fin_payment_order_items').select('account_id, amount, branch_ids, invoice_id, requires_invoice, description, supplier_id, suppliers(name), fin_corporate_card_expenses(invoice_id, has_vat_invoice), fin_payment_orders!inner(order_date, order_number, status, bank_account_id)')
                        .gte('fin_payment_orders.order_date', startDate).lt('fin_payment_orders.order_date', endDate)
                        .eq('fin_payment_orders.status', 'Paid'),
                    supabase.from('fin_bank_transactions').select('amount, transaction_date, fin_bank_accounts!fin_bank_transactions_account_id_fkey(fee_account_id, branch_id)')
                        .gte('transaction_date', startDate).lt('transaction_date', endDate)
                        .eq('type', 'Outflow')
                        .ilike('category', '%Fee%'),
                    supabase.from('fin_inventory_records').select('item_type, item_id, total_value, branch_id, month_key').in('month_key', inventoryMonthKeys),
                    supabase.from('fin_pnl_allocation_settings').select('*').limit(1).single(),
                    supabase.from('fin_tax_settings').select('*').eq('is_active', true),
                    supabase.from('fin_cashout_category_mapping').select('*'),
                    supabase.from('fin_inventory_category_mapping').select('*'),
                    supabase.from('materials').select('id, category_id'),
                    supabase.from('prep_recipes').select('id, type'),
                    supabase.from('final_recipes').select('id, type')
                ])

                setRawClosings(closingsRes.data || [])
                setRawInvoices(invoicesRes.data || [])
                setRawCashouts(cashoutRes.data || [])
                setRawWastage(wastageRes.data || [])
                setRawAdjustments(adjustmentsRes.data || [])
                setRawPOs(poRes.data || [])
                setRawBankFees(bankFeesRes.data || [])
                setRawInventory(inventoryRecordsRes.data || [])
                setRawAlloc(allocRes.data || { global_strategy: 'equal', exceptions: [], gross_up_accounts: [] })
                setRawTaxes(taxSettingsRes.data || [])
                setRawCashoutMap(cashoutMappingRes.data || [])
                setRawInvMap(invMappingRes.data || [])
                setRawMaterials(materialsRes.data || [])
                setRawPreps(prepRes.data || [])
                setRawFinals(finalRes.data || [])

            } catch (err) {
                console.error('Error fetching P&L statistics:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchHistoricalData()
    }, [isOpen, currentMonth, branches, coa, pnlViewMode, language])

    // Core calculator function executed locally on-demand
    const computePnLForMonthAndBranch = useMemo(() => {
        const calculateForMonth = (m: string, branchF: string): { lines: any[], netProfit: number, revenue: number, netRevenue: number } => {
            if (months.length === 0 || !m) {
                return { lines: [], netProfit: 0, revenue: 0, netRevenue: 0 }
            }

            // Year aggregation support
            if (m.length === 4) {
                const yearMonths = months.filter(x => x.startsWith(`${m}-`))
                if (yearMonths.length === 0) {
                    return { lines: [], netProfit: 0, revenue: 0, netRevenue: 0 }
                }

                const firstMonthData = calculateForMonth(yearMonths[0], branchF)
                const sumLines = firstMonthData.lines.map(line => ({
                    ...line,
                    amount: 0
                }))

                let sumNetProfit = 0
                let sumRevenue = 0
                let sumNetRevenue = 0

                for (const ym of yearMonths) {
                    const mData = calculateForMonth(ym, branchF)
                    sumNetProfit += mData.netProfit
                    sumRevenue += mData.revenue
                    sumNetRevenue += mData.netRevenue

                    mData.lines.forEach(mLine => {
                        const key = mLine.accountId || (mLine.code + '_' + mLine.name)
                        const target = sumLines.find(x => (x.accountId || (x.code + '_' + x.name)) === key)
                        if (target) {
                            target.amount += mLine.amount
                        }
                    })
                }

                return {
                    lines: sumLines,
                    netProfit: sumNetProfit,
                    revenue: sumRevenue,
                    netRevenue: sumNetRevenue
                }
            }

            const idx = months.indexOf(m)
            const prevMonthKey = idx <= 0 ? prevMonthOfOldest : months[idx - 1]
            const selectedBranchName = branchF === 'All' ? null : branchIdToName[branchF] || null

            // Calculate branch revenues for allocation setting in this specific month
            const revenuePerBranchId: Record<string, number> = {}
            for (const b of branches) revenuePerBranchId[b.id] = 0

            const monthClosings = rawClosings.filter(c => c.report_date.startsWith(m))
            for (const r of monthClosings) {
                const bId = branchNameToId[r.branch_name]
                if (bId) {
                    revenuePerBranchId[bId] += Number(r.revenue_vnd || 0)
                }
            }

            // Allocation settings helper for this month
            const getAllocationFactor = (account_id: string | null, branch_ids: string[] | null, currentFilter: string) => {
                if (currentFilter === 'All') return 1
                if (!branch_ids || branch_ids.length === 0) return 1

                let strategy = rawAlloc.global_strategy || 'equal'
                if (account_id && rawAlloc.exceptions) {
                    const exc = rawAlloc.exceptions.find((e: any) => e.account_id === account_id)
                    if (exc) strategy = exc.strategy
                }

                if (strategy === 'revenue') {
                    let totalInvolvedRevenue = 0
                    for (const bId of branch_ids) {
                        totalInvolvedRevenue += (revenuePerBranchId[bId] || 0)
                    }
                    if (totalInvolvedRevenue > 0) {
                        const thisBranchRevenue = revenuePerBranchId[currentFilter] || 0
                        return thisBranchRevenue / totalInvolvedRevenue
                    }
                }

                return 1 / branch_ids.length
            }

            // Total Revenue
            let totalRev = 0
            for (const r of monthClosings) {
                if (!selectedBranchName || r.branch_name === selectedBranchName) {
                    totalRev += Number(r.revenue_vnd || 0)
                }
            }

            // Expenses mapping
            const byAccount: Record<string, number> = {}

            // Invoices
            const monthInvoices = rawInvoices.filter(inv => inv.invoice_date.startsWith(m))
            for (const inv of monthInvoices) {
                if (pnlViewMode === 'management' && inv.is_personal_deduction) continue

                if (branchF !== 'All') {
                    if (!inv.branch_ids || !inv.branch_ids.includes(branchF)) continue
                }
                const factor = getAllocationFactor(inv.account_id, inv.branch_ids, branchF)
                const amount = Number(inv.net_amount || inv.gross_amount || 0) * factor
                const key = inv.account_id || 'unassigned_invoice'
                byAccount[key] = (byAccount[key] || 0) + amount
            }

            // Cashouts
            const monthCashouts = rawCashouts.filter(c => c.date.startsWith(m))
            for (const c of monthCashouts) {
                if (selectedBranchName && c.branch !== selectedBranchName) continue

                const mapping = rawCashoutMap.find(map => map.branch_name === c.branch && map.category_name === c.category)
                let accountIdToUse = 'cashout_uncategorized'

                if (mapping && mapping.account_id) {
                    accountIdToUse = mapping.account_id
                } else {
                    const matchedAccount = coa.find(a =>
                        a.name.toLowerCase() === (c.category || '').toLowerCase() ||
                        (a.simplified_name && a.simplified_name.toLowerCase() === (c.category || '').toLowerCase())
                    )
                    if (matchedAccount) {
                        accountIdToUse = matchedAccount.id
                    }
                }

                const cashAmt = Number(c.amount || 0)
                byAccount[accountIdToUse] = (byAccount[accountIdToUse] || 0) + cashAmt
            }

            // Payment Orders
            const monthPOs = rawPOs.filter(po => {
                const poParent = Array.isArray(po.fin_payment_orders) ? po.fin_payment_orders[0] : po.fin_payment_orders
                return poParent?.order_date?.startsWith(m)
            })
            for (const po of monthPOs) {
                if (po.invoice_id) continue
                if (po.requires_invoice) continue

                const isFee = po.description === 'Online Payment / Bank Fee' || po.description?.startsWith('Bank Fee for ')
                if (isFee) {
                    const poParent = Array.isArray(po.fin_payment_orders) ? po.fin_payment_orders[0] : po.fin_payment_orders
                    if (poParent?.bank_account_id) continue
                    const key = po.account_id || 'unassigned_bank_fee'
                    const feeAmt = Number(po.amount || 0)
                    byAccount[key] = (byAccount[key] || 0) + feeAmt
                    continue
                }

                let cardLinkedToInvoice = false
                let cardExpectsInvoice = false
                if (po.fin_corporate_card_expenses) {
                    const cardExp = Array.isArray(po.fin_corporate_card_expenses) ? po.fin_corporate_card_expenses[0] : po.fin_corporate_card_expenses
                    if (cardExp && cardExp.invoice_id) cardLinkedToInvoice = true
                    if (cardExp && cardExp.has_vat_invoice) cardExpectsInvoice = true
                }
                if (cardLinkedToInvoice || cardExpectsInvoice) continue

                if (branchF !== 'All') {
                    if (!po.branch_ids || !po.branch_ids.includes(branchF)) continue
                }

                const factor = getAllocationFactor(po.account_id, po.branch_ids, branchF)
                const amount = Number(po.amount || 0) * factor
                const key = po.account_id || 'unassigned_po'
                byAccount[key] = (byAccount[key] || 0) + amount
            }

            // Bank Fees
            const monthBankFees = rawBankFees.filter(bf => bf.transaction_date.startsWith(m))
            for (const bf of monthBankFees) {
                const accData = bf.fin_bank_accounts as any
                if (branchF !== 'All') {
                    if (accData && accData.branch_id && accData.branch_id !== branchF) continue
                }
                const feeAccount = accData?.fee_account_id ? coa.find(a => a.id === accData.fee_account_id) : null
                const key = feeAccount ? feeAccount.id : 'unassigned_bank_fee'
                const bfAmt = Number(bf.amount || 0)
                byAccount[key] = (byAccount[key] || 0) + bfAmt
            }

            // Staff Wastage
            const tempStaffWastageByAccount: Record<string, number> = {}
            const monthWastage = rawWastage.filter(w => w.date.startsWith(m))
            for (const w of monthWastage) {
                if (selectedBranchName && w.branch_name !== selectedBranchName) continue

                let targetAccId: string | null = null
                const wTypeLower = (w.wtype || '').toLowerCase()

                if (wTypeLower === 'material') {
                    const mat = rawMaterials.find(x => x.id === w.item_id)
                    if (mat) {
                        const mapping = rawInvMap.find(x => x.category_id === mat.category_id)
                        if (mapping) targetAccId = mapping.account_id
                    }
                } else if (wTypeLower === 'prep') {
                    const prep = rawPreps.find(x => x.id === w.item_id)
                    if (prep) {
                        const mapping = rawInvMap.find(x => x.recipe_type === prep.type)
                        if (mapping) targetAccId = mapping.account_id
                    }
                } else if (wTypeLower === 'dish') {
                    const dish = rawFinals.find(x => x.id === w.item_id)
                    if (dish) {
                        const mapping = rawInvMap.find(x => x.recipe_type === dish.type)
                        if (mapping) targetAccId = mapping.account_id
                    }
                }

                if (!targetAccId) targetAccId = 'cogs_unassigned'
                const wAmt = Number(w.total_cost_vnd || 0)
                tempStaffWastageByAccount[targetAccId] = (tempStaffWastageByAccount[targetAccId] || 0) + wAmt
            }

            // Inventory Records
            const tempInvByAccount: Record<string, { opening: number; closing: number }> = {}
            const monthInvRecords = rawInventory.filter(r => r.month_key === m || r.month_key === prevMonthKey)
            for (const r of monthInvRecords) {
                if (branchF !== 'All' && r.branch_id !== branchF) continue

                let accId = null
                if (r.item_type === 'material') {
                    const mat = rawMaterials.find(x => x.id === r.item_id)
                    if (mat) {
                        const mapping = rawInvMap.find(x => x.category_id === mat.category_id)
                        if (mapping) accId = mapping.account_id
                    }
                } else if (r.item_type === 'prep_recipe') {
                    const prep = rawPreps.find(x => x.id === r.item_id)
                    if (prep) {
                        const mapping = rawInvMap.find(x => x.recipe_type === prep.type)
                        if (mapping) accId = mapping.account_id
                    }
                } else if (r.item_type === 'final_recipe') {
                    const dish = rawFinals.find(x => x.id === r.item_id)
                    if (dish) {
                        const mapping = rawInvMap.find(x => x.recipe_type === dish.type)
                        if (mapping) accId = mapping.account_id
                    }
                }

                if (accId) {
                    if (!tempInvByAccount[accId]) tempInvByAccount[accId] = { opening: 0, closing: 0 }
                    const factor = getAllocationFactor(accId, [r.branch_id], branchF)
                    const val = Number(r.total_value || 0) * factor

                    if (r.month_key === prevMonthKey) tempInvByAccount[accId].opening += val
                    else if (r.month_key === m) tempInvByAccount[accId].closing += val
                }
            }

            // Custom Adjustments
            const finalAdjustments: any[] = []
            const monthAdjustments = rawAdjustments.filter(row => row.month_key === m)
            for (const row of monthAdjustments) {
                if (branchF !== 'All' && row.branch_id !== branchF && row.branch_id !== 'All') continue

                if (row.custom_adjustments && Array.isArray(row.custom_adjustments)) {
                    for (const adj of row.custom_adjustments) {
                        let allocated = adj.allocated_branches
                        if (!allocated) {
                            allocated = row.branch_id === 'All' ? allBranchIds : [row.branch_id]
                        }
                        if (branchF !== 'All' && !allocated.includes(branchF)) continue

                        let amount = Number(adj.amount || 0)
                        const factor = getAllocationFactor(null, allocated, branchF)
                        amount = amount * factor
                        finalAdjustments.push({ ...adj, amount })
                    }
                }
            }

            return computePnLData({
                coa,
                expensesByAccount: byAccount,
                inventoryByAccount: tempInvByAccount,
                totalRevenue: totalRev,
                customAdjustments: finalAdjustments,
                taxSettings: rawTaxes,
                staffWastageByAccount: tempStaffWastageByAccount,
                language,
                grossUpAccounts: new Set<string>(rawAlloc.gross_up_accounts || [])
            })
        }

        return (m: string, branchF: string) => calculateForMonth(m, branchF)
    }, [
        months,
        prevMonthOfOldest,
        branches,
        rawClosings,
        rawInvoices,
        rawCashouts,
        rawWastage,
        rawAdjustments,
        rawPOs,
        rawBankFees,
        rawInventory,
        rawAlloc,
        rawTaxes,
        rawCashoutMap,
        rawInvMap,
        rawMaterials,
        rawPreps,
        rawFinals,
        coa,
        pnlViewMode,
        language,
        branchNameToId,
        branchIdToName,
        allBranchIds
    ])

    // Generate line item options for Trend Chart based on selected branch and current month
    const currentMonthPnLForTrend = useMemo(() => {
        return computePnLForMonthAndBranch(currentMonth, trendBranchFilter)
    }, [computePnLForMonthAndBranch, currentMonth, trendBranchFilter])

    const trendSelectableLines = useMemo(() => {
        if (!currentMonthPnLForTrend) return []
        return currentMonthPnLForTrend.lines.filter(l => !l.isMacro)
    }, [currentMonthPnLForTrend])

    const selectedLine = useMemo(() => {
        return trendSelectableLines.find(l => getLineKey(l) === selectedLineKey) || trendSelectableLines[0]
    }, [trendSelectableLines, selectedLineKey])

    // Prepare trend data for Recharts dynamically
    const trendChartData = useMemo(() => {
        if (months.length === 0 || !selectedLineKey) return []
        const numMonths = trendPeriod
        const subset = numMonths === 999 ? months : months.slice(-numMonths)

        const calculatedSubset = subset.map((mKey) => {
            const monthData = computePnLForMonthAndBranch(mKey, trendBranchFilter)
            const line = monthData?.lines.find(l => getLineKey(l) === selectedLineKey)
            const amt = line ? line.amount : 0
            return { mKey, amt }
        })

        return calculatedSubset.map(({ mKey, amt }, index) => {
            let momChangePct = 0
            if (index > 0) {
                const prevAmt = calculatedSubset[index - 1].amt
                if (prevAmt !== 0) {
                    momChangePct = ((amt - prevAmt) / prevAmt) * 100
                }
            }

            return {
                month: mKey,
                monthLabel: fmtMonth(mKey),
                amount: amt,
                mom: momChangePct
            }
        })
    }, [computePnLForMonthAndBranch, selectedLineKey, months, trendBranchFilter, trendPeriod])

    const trendTableData = useMemo(() => {
        return [...trendChartData].reverse()
    }, [trendChartData])

    // Generate P&L calculations for Subject A and Subject B dynamically
    const pnlA = useMemo(() => {
        return computePnLForMonthAndBranch(monthA, branchA)
    }, [computePnLForMonthAndBranch, monthA, branchA])

    const pnlB = useMemo(() => {
        return computePnLForMonthAndBranch(monthB, branchB)
    }, [computePnLForMonthAndBranch, monthB, branchB])

    // Unified lines list for Month A/Branch A vs Month B/Branch B side-by-side comparison
    const comparisonTableLines = useMemo(() => {
        if (!pnlA || !pnlB) return []

        const unified: Array<{
            key: string
            code: string
            name: string
            isMacro?: boolean
            isGroup?: boolean
            isResult?: boolean
            isItem?: boolean
            parentCode?: string
            amountA: number
            amountB: number
        }> = []

        const seenKeys = new Set<string>()

        // 1. Iterate over Subject A's P&L lines
        pnlA.lines.forEach(la => {
            const key = getLineKey(la)
            seenKeys.add(key)
            const lb = pnlB.lines.find(x => getLineKey(x) === key)
            unified.push({
                key,
                code: la.code,
                name: la.name,
                isMacro: la.isMacro,
                isGroup: la.isGroup,
                isResult: la.isResult,
                isItem: la.isItem,
                parentCode: la.parentCode,
                amountA: la.amount,
                amountB: lb ? lb.amount : 0
            })
        })

        // 2. Append lines that only exist in Subject B (e.g. adjustments unique to Branch B / Month B)
        pnlB.lines.forEach(lb => {
            const key = getLineKey(lb)
            if (!seenKeys.has(key)) {
                const parent = lb.parentCode
                let insertIdx = -1
                if (parent) {
                    for (let i = unified.length - 1; i >= 0; i--) {
                        if (unified[i].parentCode === parent || unified[i].code === parent) {
                            insertIdx = i + 1
                            break
                        }
                    }
                }

                const entry = {
                    key,
                    code: lb.code,
                    name: lb.name,
                    isMacro: lb.isMacro,
                    isGroup: lb.isGroup,
                    isResult: lb.isResult,
                    isItem: lb.isItem,
                    parentCode: lb.parentCode,
                    amountA: 0,
                    amountB: lb.amount
                }

                if (insertIdx !== -1) {
                    unified.splice(insertIdx, 0, entry)
                } else {
                    unified.push(entry)
                }
            }
        })

        return unified
    }, [pnlA, pnlB])

    if (!isOpen) return null

    // Determine Chart Theme based on line type
    const isExpense = selectedLine ? isExpenseLine(selectedLine.code, selectedLine.parentCode) : false
    const strokeColor = isExpense ? '#f43f5e' : '#3b82f6'
    const fillColor = isExpense ? 'url(#roseGradient)' : 'url(#blueGradient)'

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[90vh] max-h-[850px] border border-slate-200/50">
                
                {/* Header */}
                <div className="p-6 bg-white border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">
                            {language === 'vi' ? 'Thống kê & So sánh P&L' : 'P&L Statistics & Comparison'}
                        </h2>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full font-semibold ${pnlViewMode === 'management' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                                {pnlViewMode === 'management' ? t(language, 'FinPnLManagement') : t(language, 'FinPnLStatutory')}
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

                {/* Tabs Selection */}
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
                        {language === 'vi' ? 'Confronto Affiancato' : 'Side-by-Side Comparison'}
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto min-h-0 bg-slate-50">
                    {loading ? (
                        <div className="flex flex-col justify-center items-center h-full py-20 gap-3">
                            <CircularLoader />
                            <span className="text-sm font-medium text-slate-400">
                                {language === 'vi' ? 'Đang tải dữ liệu từ máy chủ...' : 'Retrieving historical database records...'}
                            </span>
                        </div>
                    ) : activeTab === 'trend' ? (
                        <div className="p-6 space-y-6">
                            
                            {/* Trend controls */}
                            <div className="bg-white p-5 rounded-2xl border border-slate-200/50 shadow-sm grid grid-cols-1 md:grid-cols-3 items-end gap-4">
                                <div className="w-full">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                        {language === 'vi' ? 'Chọn khoản mục P&L' : 'P&L Line Item'}
                                    </label>
                                    <select
                                        value={selectedLineKey}
                                        onChange={e => setSelectedLineKey(e.target.value)}
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold bg-slate-50 text-slate-800 shadow-inner focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    >
                                        {trendSelectableLines.map(line => {
                                            const key = getLineKey(line)
                                            const label = line.code && line.code !== '-' ? `${line.code} - ${line.name}` : line.name
                                            return (
                                                <option key={key} value={key} className={line.isGroup || line.isResult ? 'font-bold' : ''}>
                                                    {line.isItem ? `\u00A0\u00A0\u00A0\u00A0${label}` : label}
                                                </option>
                                            )
                                        })}
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
                                            className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-semibold bg-slate-50 text-slate-800 shadow-inner focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        >
                                            <option value="All">{t(language, 'FinPnLAllBranches')}</option>
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

                            {/* Chart Display Area */}
                            {selectedLine && (
                                <div className="bg-white p-5 rounded-2xl border border-slate-200/50 shadow-sm space-y-4">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                                                {selectedLine.name}
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
                                                    <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
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
                                                            return (
                                                                <div className="bg-slate-950 text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-800 text-sm">
                                                                    <div className="text-[10px] font-bold text-slate-400 mb-1">{data.monthLabel}</div>
                                                                    <div className="font-extrabold text-white">{currency} {fmt(data.amount)}</div>
                                                                    {data.mom !== 0 && (
                                                                        <div className={`text-xs mt-1.5 flex items-center gap-1 font-semibold ${
                                                                            (isExpense ? data.mom < 0 : data.mom > 0)
                                                                                ? 'text-emerald-400'
                                                                                : 'text-rose-400'
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
                                            const isImprovement = isExpense ? row.mom < 0 : row.mom > 0
                                            const isNeutral = row.mom === 0

                                            return (
                                                <tr key={row.month} className="hover:bg-slate-50 transition">
                                                    <td className="p-4 font-semibold text-slate-800">{row.monthLabel}</td>
                                                    <td className="p-4 text-right font-mono text-slate-800 tabular-nums font-semibold">{currency} {fmt(row.amount)}</td>
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
                            
                            {/* Dual Subject Comparison Controls */}
                            <div className="bg-white p-5 rounded-2xl border border-slate-200/50 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Subject A */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                        {language === 'vi' ? 'Đối tượng A (Cột Trái)' : 'Subject A (Left Column)'}
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                                            <select
                                                value={monthA}
                                                onChange={e => setMonthA(e.target.value)}
                                                className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold bg-slate-50 text-slate-800 shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                                                className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold bg-slate-50 text-slate-800 shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="All">{t(language, 'FinPnLAllBranches')}</option>
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
                                                className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold bg-slate-50 text-slate-800 shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                                                className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold bg-slate-50 text-slate-800 shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="All">{t(language, 'FinPnLAllBranches')}</option>
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
                                                <th className="p-4 text-left min-w-[200px]">{language === 'vi' ? 'Khoản mục P&L' : 'P&L Line'}</th>
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
                                                    variancePct = (variance / row.amountB) * 100
                                                }

                                                const isMacro = row.isMacro
                                                const isGroup = row.isGroup
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
                                                } else if (isGroup) {
                                                    rowClass = 'bg-slate-50/30 font-bold font-semibold'
                                                    cellClass = 'p-4 font-bold text-slate-800 font-semibold'
                                                    labelClass = 'font-bold font-semibold'
                                                } else if (isItem) {
                                                    cellClass = 'p-3.5 text-xs text-slate-600'
                                                    labelClass = 'pl-6 font-normal text-slate-500'
                                                }

                                                // Financial correctness variance formatting
                                                const isExp = isExpenseLine(row.code, row.parentCode)
                                                const isImprovement = isExp ? variance < 0 : variance > 0
                                                const isNeutral = variance === 0 || isMacro

                                                return (
                                                    <tr key={row.key} className={rowClass}>
                                                        <td className={`${cellClass} ${labelClass}`}>{row.name}</td>
                                                        <td className={`${cellClass} text-right font-mono tabular-nums`}>
                                                            {isMacro ? '' : `${currency} ${fmt(row.amountA)}`}
                                                        </td>
                                                        <td className={`${cellClass} text-right font-mono tabular-nums`}>
                                                            {isMacro ? '' : `${currency} ${fmt(row.amountB)}`}
                                                        </td>
                                                        <td className={`${cellClass} text-right font-mono tabular-nums font-bold ${
                                                            isNeutral ? 'text-slate-400' : isImprovement ? 'text-emerald-600' : 'text-rose-600'
                                                        }`}>
                                                            {isMacro ? '' : (
                                                                <>
                                                                    {variance > 0 ? '+' : ''}{fmt(variance)}
                                                                </>
                                                            )}
                                                        </td>
                                                        <td className={`${cellClass} text-right font-bold`}>
                                                            {isMacro ? '' : (
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
