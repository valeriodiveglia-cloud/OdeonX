'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, Briefcase, Building, Landmark, CircleDollarSign } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'
import CircularLoader from '@/components/CircularLoader'

function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }

const SECTION_COLORS = {
    Operating: '#10b981', // emerald-500
    Investing: '#3b82f6', // blue-500
    Financing: '#8b5cf6', // violet-500
}

type CashFlowTx = {
    date: string;
    amount: number;
    type: 'Inflow' | 'Outflow';
    categoryLabel: string;
    complianceCategory: string;
    section: 'Operating' | 'Investing' | 'Financing' | 'Exclude';
    branchName?: string | null;
    branchIds?: string[] | null;
    branchId?: string | null;
    branch_ids?: string[];
}

export default function CashFlowPage() {
    const { currency, language } = useSettings()
    const [loading, setLoading] = useState(true)
    const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
    const [viewMode, setViewMode] = useState<'management' | 'statutory'>('management')
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
    const [branchFilter, setBranchFilter] = useState<string>('All')

    // Expanded sections in the drill-down table
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        Operating: true,
        Investing: true,
        Financing: true
    })

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
    }

    // Raw data
    const [accounts, setAccounts] = useState<any[]>([])
    const [allTxs, setAllTxs] = useState<CashFlowTx[]>([])
    const [monthlyBalances, setMonthlyBalances] = useState<any[]>([])

    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            const [yr, mo] = month.split('-').map(Number)
            
            // We fetch the current month AND the previous 6 months for the trend chart
            const trendStartDate = new Date(yr, mo - 6, 1).toISOString().split('T')[0]
            const endDate = mo === 12 ? `${yr + 1}-01-01` : `${yr}-${String(mo + 1).padStart(2, '0')}-01`

            const trendStartMonthKey = `${new Date(yr, mo - 7, 1).getFullYear()}-${String(new Date(yr, mo - 7, 1).getMonth() + 1).padStart(2, '0')}`
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
                    .gte('report_date', trendStartDate).lt('report_date', endDate),
                supabase.from('cashout').select('date, category, amount, branch')
                    .gte('date', trendStartDate).lt('date', endDate),
                supabase.from('fin_corporate_card_expenses').select('expense_date, description, final_amount_vnd, is_paid, account_id, branch_ids')
                    .gte('expense_date', trendStartDate).lt('expense_date', endDate).eq('is_paid', true),
                supabase.from('fin_payment_order_items').select('amount, account_id, branch_ids, fin_payment_orders!inner(order_date, status)')
                    .gte('fin_payment_orders.order_date', trendStartDate).lt('fin_payment_orders.order_date', endDate)
                    .eq('fin_payment_orders.status', 'Paid'),
                supabase.from('credit_payments').select('date, amount, credits(branch)')
                    .gte('date', trendStartDate).lt('date', endDate),
                supabase.from('deposit_payments').select('date, amount, deposits(branch)')
                    .gte('date', trendStartDate).lt('date', endDate),
                supabase.from('fin_chart_of_accounts').select('id, name, simplified_name, cashflow_section, account_type'),
                supabase.from('fin_cashout_category_mapping').select('*'),
                supabase.from('fin_monthly_adjustments').select('*')
                    .gte('month_key', trendStartMonthKey)
                    .lte('month_key', currentMonthKey),
                supabase.from('fin_monthly_balances').select('*')
                    .gte('month_key', trendStartMonthKey)
                    .lte('month_key', currentMonthKey),
                supabase.from('fin_revenue_channel_mapping').select('*'),
                supabase.from('provider_branches').select('id, name').order('name')
            ])

            if (accRes.data) setAccounts(accRes.data)
            if (brRes.data) setBranches(brRes.data as any)

            const coaData = coaRes.data || []
            const cashoutMap = cashoutMapRes.data || []
            const channelMap = channelMapRes.data || []

            const complianceTranslationKeys: Record<string, string> = {
                '1. Cash receipts from sales, services and other revenues': 'FinCFStat1',
                '2. Cash payments to suppliers of goods and services': 'FinCFStat2',
                '3. Cash payments to employees': 'FinCFStat3',
                '4. Interest paid': 'FinCFStat4',
                '5. Corporate income tax paid': 'FinCFStat5',
                '6. Other cash receipts from operating activities': 'FinCFStat6',
                '7. Other cash outlays for operating activities': 'FinCFStat7'
            };

            const getCoaInfo = (accountId: string | null, fallbackLabel: string, type: 'Inflow'|'Outflow' = 'Outflow') => {
                let section: 'Operating'|'Investing'|'Financing'|'Exclude' = 'Operating'
                let label = fallbackLabel
                let isCreditBalance = false
                let compCatEnglish = type === 'Inflow' ? '6. Other cash receipts from operating activities' : '2. Cash payments to suppliers of goods and services'

                const account = coaData.find(a => a.id === accountId)
                if (account) {
                    label = language === 'vi' ? (account.simplified_name || account.name) : account.name;
                    isCreditBalance = ['Liability', 'Equity', 'Operating Revenue', 'Financial Income', 'Other Income'].includes(account.account_type || '')
                    section = (account.cashflow_section || 'Operating') as 'Operating'|'Investing'|'Financing'|'Exclude'

                    if (type === 'Outflow') {
                        if (account.account_type === 'Payroll') compCatEnglish = '3. Cash payments to employees'
                        else if (account.account_type === 'Financial Expenses' && account.name?.toLowerCase().includes('interest')) compCatEnglish = '4. Interest paid'
                        else if (account.account_type === 'Tax Expenses' && account.name?.toLowerCase().includes('income tax')) compCatEnglish = '5. Corporate income tax paid'
                        else if (account.account_type === 'Other Expenses' || account.account_type === 'Tax Expenses') compCatEnglish = '7. Other cash outlays for operating activities'
                    } else {
                        if (['Operating Revenue', 'Financial Income', 'Other Income'].includes(account.account_type || '')) compCatEnglish = '6. Other cash receipts from operating activities'
                    }
                }

                const key = complianceTranslationKeys[compCatEnglish] || compCatEnglish;
                const complianceCategory = t(language, key);

                return { section, label, isCreditBalance, complianceCategory }
            }

            const txs: CashFlowTx[] = []

            // 1. Cashier Closings (Inflows)
            if (closingsRes.data) {
                for (const row of closingsRes.data) {
                    const date = row.report_date

                    // Third party
                    let tpSum = 0
                    if (row.third_party_amounts_json && Array.isArray(row.third_party_amounts_json)) {
                        for (const tp of row.third_party_amounts_json) {
                            const amt = Number(tp.amount || 0)
                            if (amt > 0) {
                                tpSum += amt
                                const mapInfo = channelMap.find(m => m.channel_type === 'third_party' && m.channel_label === tp.label && m.is_active)
                                const tpFallback = language === 'vi' ? `Đối tác giao hàng — ${tp.label}` : `Third-Party — ${tp.label}`;
                                const { section, label, complianceCategory } = getCoaInfo(mapInfo?.cashflow_coa_account_id, tpFallback, 'Inflow')
                                txs.push({ date, amount: amt, type: 'Inflow', categoryLabel: label, complianceCategory, section, branchName: row.branch_name })
                            }
                        }
                    }

                    // Deposits (Customer advances = Inflow)
                    const deposits = Number(row.deposits_vnd || 0)
                    if (deposits > 0) {
                        txs.push({ date, amount: deposits, type: 'Inflow', 
                            categoryLabel: t(language, 'FinCFDefaultCustomerDeposits'),
                            complianceCategory: t(language, 'FinCFStat1'), 
                            section: 'Operating',
                            branchName: row.branch_name })
                    }

                    // Repayments (Staff repaying advance = Inflow)
                    const repayments = Number(row.repayments_cash_card_vnd || 0)
                    if (repayments > 0) {
                        txs.push({ date, amount: repayments, type: 'Inflow',
                            categoryLabel: t(language, 'FinCFDefaultStaffRepayments'),
                            complianceCategory: t(language, 'FinCFStat6'),
                            section: 'Operating',
                            branchName: row.branch_name })
                    }

                    // Payouts (Daily cash outlays = Outflow)
                    const payouts = Number(row.payouts_vnd || 0)
                    if (payouts > 0) {
                        txs.push({ date, amount: payouts, type: 'Outflow',
                            categoryLabel: t(language, 'FinCFDefaultDailyPayouts'),
                            complianceCategory: t(language, 'FinCFStat7'),
                            section: 'Operating',
                            branchName: row.branch_name })
                    }

                    // Cash Sales = revenue - mpos - bank_transfer - unpaid - third_party - set_off_debt
                    const revenue = Number(row.revenue_vnd || 0)
                    const mpos = Number(row.mpos_vnd || 0)
                    const bt = Number(row.bank_transfer_ewallet_vnd || 0)
                    const unpaid = Number(row.unpaid_vnd || 0)
                    const setOffDebt = Number(row.set_off_debt_vnd || 0)
                    
                    const cashSales = revenue - mpos - bt - unpaid - tpSum - setOffDebt
                    if (cashSales > 0) {
                        txs.push({ date, amount: cashSales, type: 'Inflow', categoryLabel: t(language, 'FinCFDefaultCashSales'), complianceCategory: t(language, 'FinCFStat1'), section: 'Operating', branchName: row.branch_name })
                    }

                    if (mpos > 0) {
                        const mposMap = channelMap.find(m => m.channel_type === 'mpos' && m.is_active)
                        const mposFallback = language === 'vi' ? 'Thanh toán thẻ (MPOS)' : 'Card Payments (MPOS)';
                        const { section, label, complianceCategory } = getCoaInfo(mposMap?.cashflow_coa_account_id, mposFallback, 'Inflow')
                        txs.push({ date, amount: mpos, type: 'Inflow', categoryLabel: label, complianceCategory, section, branchName: row.branch_name })
                    }
                    if (bt > 0) txs.push({ date, amount: bt, type: 'Inflow', categoryLabel: t(language, 'FinCFDefaultDigitalPayments'), complianceCategory: t(language, 'FinCFStat1'), section: 'Operating', branchName: row.branch_name })
                }
            }

            // 2. Cashout (Outflows)
            if (cashoutRes.data) {
                for (const row of cashoutRes.data) {
                    const amt = Number(row.amount || 0)
                    if (amt <= 0) continue

                    // Resolve mapping
                    const mapping = cashoutMap.find(m => m.branch_name === row.branch && m.category_name === row.category)
                    let accountIdToUse: string | null = null
                    
                    if (mapping && mapping.account_id) {
                        accountIdToUse = mapping.account_id
                    } else {
                        // fallback to string matching
                        const matchedAccount = coaData.find(a => 
                            a.name.toLowerCase() === (row.category || '').toLowerCase() || 
                            (a.simplified_name && a.simplified_name.toLowerCase() === (row.category || '').toLowerCase())
                        )
                        if (matchedAccount) {
                            accountIdToUse = matchedAccount.id
                        }
                    }

                    const uncategorizedFallback = language === 'vi' ? 'Rút tiền chưa phân loại' : 'Uncategorized Cashout';
                    const { section, label, complianceCategory } = getCoaInfo(accountIdToUse, row.category || uncategorizedFallback, 'Outflow')
                    txs.push({ date: row.date, amount: amt, type: 'Outflow', categoryLabel: label, complianceCategory, section, branchName: row.branch })
                }
            }

            // 3. Corporate Card (Outflows)
            if (corpCardRes.data) {
                for (const row of corpCardRes.data) {
                    const amt = Number(row.final_amount_vnd || 0)
                    if (amt <= 0) continue
                    const ccFallback = language === 'vi' ? 'Chi phí thẻ doanh nghiệp' : 'Corporate Card Expense';
                    const { section, label, complianceCategory } = getCoaInfo(row.account_id, ccFallback, 'Outflow')
                    txs.push({ date: row.expense_date, amount: amt, type: 'Outflow', categoryLabel: label, complianceCategory, section, branchIds: row.branch_ids })
                }
            }

            // 4. Payment Orders (Outflows)
            if (poItemsRes.data) {
                for (const row of poItemsRes.data as any[]) {
                    const amt = Number(row.amount || 0)
                    if (amt <= 0) continue
                    const poFallback = language === 'vi' ? 'Thanh toán nhà cung cấp' : 'Supplier Payment';
                    const { section, label, complianceCategory } = getCoaInfo(row.account_id, poFallback, 'Outflow')
                    txs.push({ date: row.fin_payment_orders.order_date, amount: amt, type: 'Outflow', categoryLabel: label, complianceCategory, section, branchIds: row.branch_ids })
                }
            }

            // 5. Credit Payments (Inflows)
            if (creditPayRes.data) {
                for (const row of creditPayRes.data) {
                    const amt = Number(row.amount || 0)
                    if (amt > 0) txs.push({ date: row.date.split('T')[0], amount: amt, type: 'Inflow', categoryLabel: t(language, 'FinCFDefaultCollections'), complianceCategory: t(language, 'FinCFStat6'), section: 'Operating', branchName: (row.credits as any)?.branch })
                }
            }

            // 6. Deposit Payments (Inflows)
            if (depositPayRes.data) {
                for (const row of depositPayRes.data) {
                    const amt = Number(row.amount || 0)
                    if (amt > 0) txs.push({ date: row.date.split('T')[0], amount: amt, type: 'Inflow', categoryLabel: t(language, 'FinCFDefaultCustomerDepositsInflow'), complianceCategory: t(language, 'FinCFStat1'), section: 'Operating', branchName: (row.deposits as any)?.branch })
                }
            }

            // 7. Monthly Adjustments (Outflows/Inflows)
            if (adjRes.data) {
                for (const row of adjRes.data) {
                    if (row.custom_adjustments && Array.isArray(row.custom_adjustments)) {
                        // Use the end of the month for the adjustment date
                        const [y, m] = row.month_key.split('-')
                        const adjDate = `${y}-${m}-28`

                        for (const adj of row.custom_adjustments) {
                            const amt = Number(adj.amount || 0)
                            if (amt <= 0) continue

                            // Respect include_in_cashflow flag.
                            // Fallback: extract is always excluded; add/subtract included by default.
                            const inCF = adj.include_in_cashflow ?? (adj.method !== 'extract')
                            if (!inCF) continue

                            const adjFallback = language === 'vi' ? 'Điều chỉnh hàng tháng' : 'Monthly Adjustment';
                            const { section, label, isCreditBalance } = getCoaInfo(adj.target_group, adj.name || adjFallback)
                            
                            let type: 'Inflow' | 'Outflow' = 'Outflow'
                            
                            if (adj.method === 'add') {
                                type = isCreditBalance ? 'Inflow' : 'Outflow'
                            } else if (adj.method === 'subtract' || adj.method === 'extract') {
                                type = isCreditBalance ? 'Outflow' : 'Inflow'
                            }

                            const { complianceCategory } = getCoaInfo(adj.target_group, adj.name || adjFallback, type)

                            txs.push({ date: adjDate, amount: amt, type, categoryLabel: label, complianceCategory, section, branchId: row.branch_id })
                        }
                    }
                }
            }

            if (balancesRes.data) setMonthlyBalances(balancesRes.data)
            setAllTxs(txs)
            setLoading(false)
        }
        fetchData()
    }, [month])
    // Normalize branch references for each transaction to use branch UUID array
    const normalizedTxs = useMemo(() => {
        return allTxs.map(tx => {
            let resolvedIds: string[] = []
            if (tx.branchIds && tx.branchIds.length > 0) {
                resolvedIds = tx.branchIds
            } else if (tx.branchId) {
                resolvedIds = [tx.branchId]
            } else if (tx.branchName) {
                const matched = branches.find(b => b.name.toLowerCase() === tx.branchName!.toLowerCase())
                if (matched) resolvedIds = [matched.id]
            }
            return {
                ...tx,
                branch_ids: resolvedIds
            }
        })
    }, [allTxs, branches])

    // Filter transactions based on branch selection
    const filteredTxs = useMemo(() => {
        if (branchFilter === 'All') return normalizedTxs
        return normalizedTxs.filter(tx => tx.branch_ids && tx.branch_ids.includes(branchFilter))
    }, [normalizedTxs, branchFilter])

    // Filter bank accounts by branch selection
    const filteredAccounts = useMemo(() => {
        if (branchFilter === 'All') return accounts
        return accounts.filter(a => a.branch_id === branchFilter)
    }, [accounts, branchFilter])

    // Current month summary & drill-down
    const { summary, drilldown } = useMemo(() => {
        let operatingIn = 0, operatingOut = 0
        let investingIn = 0, investingOut = 0
        let financingIn = 0, financingOut = 0

        const categories: Record<string, { section: string; category: string; inflow: number; outflow: number }> = {}

        const currentMonthPrefix = month

        for (const tx of filteredTxs) {
            if (!tx.date.startsWith(currentMonthPrefix)) continue
            if (tx.section === 'Exclude') continue

            const amt = tx.amount
            const isOut = tx.type === 'Outflow'
            
            if (tx.section === 'Operating') {
                if (isOut) operatingOut += amt; else operatingIn += amt;
            } else if (tx.section === 'Investing') {
                if (isOut) investingOut += amt; else investingIn += amt;
            } else if (tx.section === 'Financing') {
                if (isOut) financingOut += amt; else financingIn += amt;
            }

            const catName = viewMode === 'statutory' && tx.section === 'Operating' ? tx.complianceCategory : tx.categoryLabel
            if (!categories[catName]) categories[catName] = { section: tx.section, category: catName, inflow: 0, outflow: 0 }
            if (isOut) categories[catName].outflow += amt
            else categories[catName].inflow += amt
        }

        const opNet = operatingIn - operatingOut
        const invNet = investingIn - investingOut
        const finNet = financingIn - financingOut
        const netChange = opNet + invNet + finNet

        const [yr, mo] = month.split('-').map(Number)
        const prevMonthKey = mo === 1 ? `${yr - 1}-12` : `${yr}-${String(mo - 1).padStart(2, '0')}`

        let openingBalance = 0
        let closingBalance = 0
        const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
        const breakdown: Record<string, { name: string; opening: number; closing: number; type: string }> = {}

        filteredAccounts.forEach(a => {
            breakdown[a.id] = { name: a.account_name, opening: 0, closing: 0, type: a.account_type }
        })

        // Opening Balance
        const prevBalances = monthlyBalances.filter(b => b.month_key === prevMonthKey)
        if (prevBalances.length > 0) {
            const filteredAccountIds = new Set(filteredAccounts.map(a => a.id))
            openingBalance = prevBalances
                .filter(b => filteredAccountIds.has(b.account_id))
                .reduce((s, b) => s + Number(b.closing_balance), 0)
            prevBalances.forEach(b => {
                if (breakdown[b.account_id]) breakdown[b.account_id].opening = Number(b.closing_balance)
            })
        } else {
            openingBalance = filteredAccounts.reduce((s, a) => s + Number(a.opening_balance || 0), 0)
            filteredAccounts.forEach(a => {
                breakdown[a.id].opening = Number(a.opening_balance || 0)
            })
        }

        // Closing Balance
        if (month === currentMonthKey) {
            closingBalance = filteredAccounts.reduce((s, a) => s + Number(a.current_balance || 0), 0)
            filteredAccounts.forEach(a => {
                breakdown[a.id].closing = Number(a.current_balance || 0)
            })
        } else {
            const closingBalances = monthlyBalances.filter(b => b.month_key === month)
            if (closingBalances.length > 0) {
                const filteredAccountIds = new Set(filteredAccounts.map(a => a.id))
                closingBalance = closingBalances
                    .filter(b => filteredAccountIds.has(b.account_id))
                    .reduce((s, b) => s + Number(b.closing_balance), 0)
                closingBalances.forEach(b => {
                    if (breakdown[b.account_id]) breakdown[b.account_id].closing = Number(b.closing_balance)
                })
            } else {
                closingBalance = openingBalance + netChange
                // Best effort breakdown if missing
                filteredAccounts.forEach(a => {
                    breakdown[a.id].closing = breakdown[a.id].opening
                })
            }
        }

        // Group categories by section
        const sectionedCategories = {
            Operating: Object.values(categories).filter(c => c.section === 'Operating').sort((a, b) => (b.inflow + b.outflow) - (a.inflow + a.outflow)),
            Investing: Object.values(categories).filter(c => c.section === 'Investing').sort((a, b) => (b.inflow + b.outflow) - (a.inflow + a.outflow)),
            Financing: Object.values(categories).filter(c => c.section === 'Financing').sort((a, b) => (b.inflow + b.outflow) - (a.inflow + a.outflow)),
        }

        return {
            summary: { opNet, invNet, finNet, netChange, openingBalance, closingBalance, breakdown: Object.values(breakdown) },
            drilldown: sectionedCategories
        }
    }, [filteredTxs, filteredAccounts, month, viewMode, monthlyBalances])

    // Waterfall data
    const waterfallData = useMemo(() => {
        let current = summary.openingBalance
        const data = [
            { name: t(language, 'FinPnLOpening'), value: summary.openingBalance, fill: '#475569' }
        ]

        if (summary.opNet !== 0) {
            data.push({ name: t(language, 'FinCFOperating'), value: summary.opNet, fill: summary.opNet >= 0 ? SECTION_COLORS.Operating : '#f87171' })
            current += summary.opNet
        }
        if (summary.invNet !== 0) {
            data.push({ name: t(language, 'FinCFInvesting'), value: summary.invNet, fill: summary.invNet >= 0 ? SECTION_COLORS.Investing : '#93c5fd' })
            current += summary.invNet
        }
        if (summary.finNet !== 0) {
            data.push({ name: t(language, 'FinCFFinancing'), value: summary.finNet, fill: summary.finNet >= 0 ? SECTION_COLORS.Financing : '#c4b5fd' })
            current += summary.finNet
        }

        data.push({ name: t(language, 'FinPnLClosing'), value: summary.closingBalance, fill: '#334155' })

        return data
    }, [summary, language])

    // Monthly Trend
    const monthlyData = useMemo(() => {
        const monthly: Record<string, { opNet: number; invNet: number; finNet: number }> = {}
        for (const tx of filteredTxs) {
            if (tx.section === 'Exclude') continue

            const key = tx.date.substring(0, 7) // YYYY-MM
            if (!monthly[key]) monthly[key] = { opNet: 0, invNet: 0, finNet: 0 }
            
            const amt = tx.amount
            const netAmt = tx.type === 'Outflow' ? -amt : amt

            if (tx.section === 'Operating') monthly[key].opNet += netAmt
            else if (tx.section === 'Investing') monthly[key].invNet += netAmt
            else if (tx.section === 'Financing') monthly[key].finNet += netAmt
        }
        
        const sorted = Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b))
        return sorted.map(([m, v]) => {
            const [y2, mo2] = m.split('-').map(Number)
            return {
                month: new Date(y2, mo2 - 1, 1).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', year: '2-digit' }),
                Operating: v.opNet,
                Investing: v.invNet,
                Financing: v.finNet,
            }
        })
    }, [filteredTxs, language])

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
        const [y, mo] = m.split('-').map(Number); 
        return new Date(y, mo - 1, 1).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' }) 
    }

    const renderSectionHeader = (title: string, sectionKey: 'Operating'|'Investing'|'Financing', net: number) => {
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

    const renderSectionRows = (sectionKey: 'Operating'|'Investing'|'Financing') => {
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
                                <div className="text-2xl font-black tabular-nums text-slate-900 mb-3">{currency} {fmt(summary.openingBalance)}</div>
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
                                <div className={`text-3xl font-black tabular-nums ${summary.opNet >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                                    {summary.opNet >= 0 ? '+' : ''}{currency} {fmt(summary.opNet)}
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
                                <div className="text-2xl font-black tabular-nums mb-3">{currency} {fmt(summary.closingBalance)}</div>
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

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Waterfall Chart */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
                            <h2 className="text-lg font-bold text-slate-900 mb-6">{t(language, 'FinCFWaterfallTitle')}</h2>
                            <div className="flex-1 min-h-[260px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={waterfallData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 13, fontWeight: 500 }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }}
                                            tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(v)} />
                                        <Tooltip 
                                            cursor={{fill: '#f8fafc'}}
                                            contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            formatter={(val: number) => [`${currency} {fmt(Math.abs(val))}`, t(language, 'FinCFTableNet')]} 
                                        />
                                        <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={50}>
                                            {waterfallData.map((entry, idx) => (
                                                <Cell key={idx} fill={entry.fill} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Monthly Trend */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
                            <h2 className="text-lg font-bold text-slate-900 mb-6">{t(language, 'FinCFTrendTitle')}</h2>
                            <div className="flex-1 min-h-[260px]">
                                {monthlyData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={monthlyData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }}
                                                tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(v)} />
                                            <Tooltip 
                                                cursor={{fill: '#f8fafc'}}
                                                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                formatter={(val: number) => [`${currency} ${fmt(val)}`, '']} 
                                            />
                                            <ReferenceLine y={0} stroke="#cbd5e1" />
                                            <Bar dataKey="Operating" fill={SECTION_COLORS.Operating} radius={[4, 4, 0, 0]} barSize={12} />
                                            <Bar dataKey="Investing" fill={SECTION_COLORS.Investing} radius={[4, 4, 0, 0]} barSize={12} />
                                            <Bar dataKey="Financing" fill={SECTION_COLORS.Financing} radius={[4, 4, 0, 0]} barSize={12} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-400 italic text-sm">
                                        {t(language, 'FinCFNotEnoughData')}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-5 mt-4 justify-center text-xs font-medium text-slate-600">
                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> {t(language, 'FinCFOperating')}</span>
                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> {t(language, 'FinCFInvesting')}</span>
                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500" /> {t(language, 'FinCFFinancing')}</span>
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
        </div>
    )
}
