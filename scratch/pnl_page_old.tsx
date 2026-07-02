'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { ChevronDown, Download, Filter, Maximize2, Minimize2 } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import type { FinChartOfAccount } from '@/types/finance'

function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }

type PnLLine = {
    code: string;
    name: string;
    amount: number;
    isMacro?: boolean;
    isGroup?: boolean;
    isResult?: boolean;
    isItem?: boolean;
    parentCode?: string;
}

const pnlStructure = [
    {
        macro: '1. REVENUE', groups: [
            { code: '01', name: 'Operating Revenue', types: ['Operating Revenue'] },
            { code: '02', name: 'Revenue deductions', types: [] }, // Custom logic handles this
            { code: '10', name: 'Net revenue', isFormula: true, formula: '01-02' }
        ]
    },
    {
        macro: '2. COGS', groups: [
            { code: '11', name: 'Cost of goods sold', types: ['Cost of Goods Sold'] },
            { code: '20', name: 'Gross profit', isFormula: true, formula: '10-11' }
        ]
    },
    {
        macro: '3. OPEX', groups: [
            { code: '25', name: 'Selling expenses', types: ['Selling Expenses'] },
            { code: '26', name: 'General & administration expenses', types: ['General & Admin Expenses'] },
            { code: '27', name: 'Payroll', types: ['Payroll'] },
            { code: '30', name: 'Net operating profit/loss', isFormula: true, formula: '20-25-26-27' }
        ]
    },
    {
        macro: '4. FINANCIAL & OTHER', groups: [
            { code: '31', name: 'Financial income', types: ['Financial Income'] },
            { code: '32', name: 'Financial activities expenses', types: ['Financial Expenses'] },
            { code: '33', name: 'Other income', types: ['Other Income'] },
            { code: '34', name: 'Other expenses', types: ['Other Expenses'] },
            { code: '50', name: 'Total earning before tax', isFormula: true, formula: '30+31-32+33-34' },
            { code: '51', name: 'Business income tax charge', types: ['Tax Expenses'] },
            { code: '60', name: 'Earning after tax / Net Profit', isFormula: true, formula: '50-51' }
        ]
    }
]

export default function PnLReportPage() {
    const { currency } = useSettings()
    const [loading, setLoading] = useState(true)
    const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
    const [branchFilter, setBranchFilter] = useState('All')
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
    const [coa, setCoa] = useState<FinChartOfAccount[]>([])
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

    // Data
    const [expensesByAccount, setExpensesByAccount] = useState<Record<string, number>>({})
    const [totalRevenue, setTotalRevenue] = useState(0)
    const [adjustments, setAdjustments] = useState({ discounts: 0, catering: 0, inventory: 0 })

    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            const [yr, mo] = month.split('-').map(Number)
            const startDate = `${yr}-${String(mo).padStart(2, '0')}-01`
            const endDate = mo === 12 ? `${yr + 1}-01-01` : `${yr}-${String(mo + 1).padStart(2, '0')}-01`

            const [coaRes, brRes, revRes, invRes, cashoutRes, wastageRes, adjRes, poRes, mapRes, bankFeesRes, allocRes] = await Promise.all([
                supabase.from('fin_chart_of_accounts').select('*').eq('is_active', true).order('sort_order'),
                supabase.from('provider_branches').select('id, name').order('name'),
                supabase.from('cashier_closings').select('revenue_vnd, branch_name')
                    .gte('report_date', startDate).lt('report_date', endDate),
                supabase.from('fin_invoices').select('account_id, gross_amount, branch_ids')
                    .gte('invoice_date', startDate).lt('invoice_date', endDate)
                    .neq('status', 'Cancelled'),
                supabase.from('cashout').select('category, amount, branch')
                    .gte('date', startDate).lt('date', endDate)
                    .eq('invoice', false),
                supabase.from('wastage_entries').select('total_cost_vnd, branch_name')
                    .eq('charge_target', 'Restaurant')
                    .gte('date', startDate).lt('date', endDate),
                supabase.from('fin_monthly_adjustments').select('*').eq('month_key', month),
                supabase.from('fin_payment_order_items').select('account_id, amount, branch_ids, invoice_id, requires_invoice, description, fin_corporate_card_expenses(invoice_id, has_vat_invoice), fin_payment_orders!inner(order_date, status, bank_account_id)')
                    .gte('fin_payment_orders.order_date', startDate).lt('fin_payment_orders.order_date', endDate)
                    .eq('fin_payment_orders.status', 'Paid'),
                supabase.from('fin_cashout_category_mapping').select('*'),
                supabase.from('fin_bank_transactions').select('amount, fin_bank_accounts!fin_bank_transactions_account_id_fkey(fee_account_id, branch_id)')
                    .gte('transaction_date', startDate).lt('transaction_date', endDate)
                    .eq('type', 'Outflow')
                    .ilike('category', '%Fee%'),
                supabase.from('fin_pnl_allocation_settings').select('*').limit(1).single()
            ])

            let coaData: FinChartOfAccount[] = []
            if (coaRes.data) {
                coaData = coaRes.data as any
                setCoa(coaData)
            }
            if (brRes.data) setBranches(brRes.data as any)

            const selectedBranchName = branchFilter !== 'All' ? brRes.data?.find(b => b.id === branchFilter)?.name : null

            // Adjustments
            let discounts = 0, catering = 0, inventory = 0
            if (adjRes.data) {
                for (const a of adjRes.data) {
                    if (branchFilter !== 'All' && a.branch_id !== branchFilter && a.branch_id !== 'All') continue
                    discounts += Number(a.discounts_vnd || 0)
                    catering += Number(a.catering_revenue_vnd || 0)
                    inventory += Number(a.ending_inventory_vnd || 0)
                }
            }
            setAdjustments({ discounts, catering, inventory })

            // Revenue per branch calculations for allocation
            const branchNameToId: Record<string, string> = {}
            if (brRes.data) {
                for (const b of brRes.data as any) branchNameToId[b.name] = b.id
            }

            const revenuePerBranchId: Record<string, number> = {}
            if (brRes.data) {
                for (const b of brRes.data as any) revenuePerBranchId[b.id] = 0
            }

            // Revenue
            let revenueAcc = 0
            if (revRes.data) {
                for (const r of revRes.data) {
                    // Accumulate for total revenue UI
                    if (!selectedBranchName || r.branch_name === selectedBranchName) {
                        revenueAcc += Number(r.revenue_vnd || 0)
                    }
                    
                    // Accumulate for branch-specific revenue percentages
                    const bId = branchNameToId[r.branch_name]
                    if (bId) {
                        revenuePerBranchId[bId] += Number(r.revenue_vnd || 0)
                    }
                }
            }
            setTotalRevenue(revenueAcc)

            // Allocation Settings Helper
            const allocSettings = allocRes.data || { global_strategy: 'equal', exceptions: [] }
            const getAllocationFactor = (account_id: string | null, branch_ids: string[] | null, currentFilter: string) => {
                if (currentFilter === 'All') return 1;
                if (!branch_ids || branch_ids.length === 0) return 1;
                
                let strategy = allocSettings.global_strategy;
                if (account_id && allocSettings.exceptions) {
                    const exc = allocSettings.exceptions.find((e: any) => e.account_id === account_id);
                    if (exc) strategy = exc.strategy;
                }
                
                if (strategy === 'revenue') {
                    let totalInvolvedRevenue = 0;
                    for (const bId of branch_ids) {
                        totalInvolvedRevenue += (revenuePerBranchId[bId] || 0);
                    }
                    if (totalInvolvedRevenue > 0) {
                        const thisBranchRevenue = revenuePerBranchId[currentFilter] || 0;
                        return thisBranchRevenue / totalInvolvedRevenue;
                    }
                }
                
                return 1 / branch_ids.length;
            }

            // Expenses by Account (using account ID)
            const byAccount: Record<string, number> = {}
            if (invRes.data) {
                for (const inv of invRes.data) {
                    if (branchFilter !== 'All') {
                        if (!inv.branch_ids || !inv.branch_ids.includes(branchFilter)) continue;
                    }
                    const factor = getAllocationFactor(inv.account_id, inv.branch_ids, branchFilter);
                    const amount = Number(inv.gross_amount || 0) * factor;
                    
                    const key = inv.account_id || 'unassigned_invoice'
                    byAccount[key] = (byAccount[key] || 0) + amount
                }
            }
            if (cashoutRes.data) {
                const mappings = (mapRes.data || []) as any[];
                for (const c of cashoutRes.data) {
                    if (selectedBranchName && c.branch !== selectedBranchName) continue
                    
                    // Look up mapping for this branch and category
                    const mapping = mappings.find(m => m.branch_name === c.branch && m.category_name === c.category)
                    let accountIdToUse = 'cashout_uncategorized';
                    
                    if (mapping && mapping.account_id) {
                        accountIdToUse = mapping.account_id;
                    } else {
                        // fallback to string matching
                        const matchedAccount = coaData.find(a => 
                            a.name.toLowerCase() === (c.category || '').toLowerCase() || 
                            (a.simplified_name && a.simplified_name.toLowerCase() === (c.category || '').toLowerCase())
                        )
                        if (matchedAccount) {
                            accountIdToUse = matchedAccount.id;
                        }
                    }
                    
                    byAccount[accountIdToUse] = (byAccount[accountIdToUse] || 0) + Number(c.amount || 0)
                }
            }
            if (poRes.data) {
                for (const po of poRes.data) {
                    // Skip if linked directly to an invoice
                    if (po.invoice_id) continue;
                    
                    // Skip if it EXPECTS an invoice (will be added to P&L when invoice arrives)
                    if (po.requires_invoice) continue;

                    // Handle bank fees specifically
                    const isFee = po.description === 'Online Payment / Bank Fee' || po.description?.startsWith('Bank Fee for ');
                    if (isFee) {
                        // If it has a bank_account_id, the fee is handled by bankFeesRes (fin_bank_transactions)
                        const poParent = Array.isArray(po.fin_payment_orders) ? po.fin_payment_orders[0] : po.fin_payment_orders;
                        if (poParent?.bank_account_id) continue;
                        
                        // Otherwise (paid without bank account), use its assigned category or fallback to unassigned
                        const key = po.account_id || 'unassigned_bank_fee';
                        byAccount[key] = (byAccount[key] || 0) + Number(po.amount || 0);
                        continue;
                    }

                    // Skip if linked via Corporate Card to an invoice or if it expects one
                    let cardLinkedToInvoice = false;
                    let cardExpectsInvoice = false;
                    if (po.fin_corporate_card_expenses) {
                        const cardExp = Array.isArray(po.fin_corporate_card_expenses) ? po.fin_corporate_card_expenses[0] : po.fin_corporate_card_expenses;
                        if (cardExp && cardExp.invoice_id) {
                            cardLinkedToInvoice = true;
                        }
                        if (cardExp && cardExp.has_vat_invoice) {
                            cardExpectsInvoice = true;
                        }
                    }
                    if (cardLinkedToInvoice || cardExpectsInvoice) continue;

                    if (branchFilter !== 'All') {
                        if (!po.branch_ids || !po.branch_ids.includes(branchFilter)) continue;
                    }
                    
                    const factor = getAllocationFactor(po.account_id, po.branch_ids, branchFilter);
                    const amount = Number(po.amount || 0) * factor;

                    const key = po.account_id || 'unassigned_po'
                    byAccount[key] = (byAccount[key] || 0) + amount
                }
            }
            if (wastageRes.data) {
                for (const w of wastageRes.data) {
                    if (selectedBranchName && w.branch_name !== selectedBranchName) continue
                    byAccount['wastage'] = (byAccount['wastage'] || 0) + Number(w.total_cost_vnd || 0)
                }
            }
            if (bankFeesRes.data) {
                for (const bf of bankFeesRes.data) {
                    const accData = bf.fin_bank_accounts as any;
                    if (branchFilter !== 'All') {
                        if (accData && accData.branch_id && accData.branch_id !== branchFilter) continue;
                    }
                    const feeAccount = accData?.fee_account_id ? coaData.find(a => a.id === accData.fee_account_id) : null;
                    const key = feeAccount ? feeAccount.id : 'unassigned_bank_fee';
                    byAccount[key] = (byAccount[key] || 0) + Number(bf.amount || 0);
                }
            }
            setExpensesByAccount(byAccount)
            setLoading(false)
        }
        fetchData()
    }, [month, branchFilter])

    const pnlData = useMemo(() => {
        const lines: PnLLine[] = []
        const groupTotals: Record<string, number> = {}

        // Helper to evaluate formulas
        const getVal = (code: string) => groupTotals[code] || 0
        const calcFormula = (formula: string) => {
            if (!formula) return 0;
            if (formula === 'tax') return Math.max(0, getVal('50') * 0.20)
            const terms = formula.match(/[+-]?\d+/g) || []
            return terms.reduce((sum, t) => sum + getVal(t.replace(/[+-]/, '') || t) * (t.startsWith('-') ? -1 : 1), 0)
        }

        pnlStructure.forEach(macroGroup => {
            lines.push({ code: '', name: macroGroup.macro, amount: 0, isMacro: true })
            
            macroGroup.groups.forEach(g => {
                if ('isFormula' in g && g.isFormula) {
                    const amt = calcFormula(g.formula)
                    groupTotals[g.code] = amt
                    lines.push({ code: g.code, name: g.name, amount: amt, isResult: true })
                } else if ('types' in g && g.types) {
                    const children: PnLLine[] = []
                    let groupTotal = 0

                    if (g.code === '01') {
                        const productsRevenue = Math.max(0, totalRevenue - adjustments.catering)
                        children.push({ code: '5112', name: 'Revenue from sales of products', amount: productsRevenue, isItem: true, parentCode: g.code })
                        groupTotal += productsRevenue
                        
                        children.push({ code: '51132', name: 'Event service fee revenue', amount: adjustments.catering, isItem: true, parentCode: g.code })
                        groupTotal += adjustments.catering

                        // Also include any accounts mapped to 'Operating Revenue'
                        const relevantAccounts = coa.filter(a => g.types.includes(a.account_type) && !a.is_group)
                        for (const acc of relevantAccounts) {
                            const amt = expensesByAccount[acc.id] || 0
                            children.push({ code: acc.code, name: acc.name, amount: amt, isItem: true, parentCode: g.code })
                            groupTotal += amt
                        }
                    } else if (g.code === '02') {
                        children.push({ code: '5211', name: 'Sales discount', amount: adjustments.discounts, isItem: true, parentCode: g.code })
                        groupTotal += adjustments.discounts
                    } else {
                        // Find matching accounts
                        const relevantAccounts = coa.filter(a => g.types.includes(a.account_type) && !a.is_group)
                        for (const acc of relevantAccounts) {
                            const amt = expensesByAccount[acc.id] || 0
                            children.push({ code: acc.code, name: acc.name, amount: amt, isItem: true, parentCode: g.code })
                            groupTotal += amt
                        }
                        // Fallback unassigned logic
                        if (g.code === '11') {
                            if (expensesByAccount['unassigned_invoice']) {
                                children.push({ code: '-', name: 'Uncategorized Invoice', amount: expensesByAccount['unassigned_invoice'], isItem: true, parentCode: g.code })
                                groupTotal += expensesByAccount['unassigned_invoice']
                            }
                            if (expensesByAccount['wastage']) {
                                children.push({ code: '-', name: 'Wastage (Restaurant)', amount: expensesByAccount['wastage'], isItem: true, parentCode: g.code })
                                groupTotal += expensesByAccount['wastage']
                            }
                        }
                        if (g.code === '32') { // Financial expenses
                            if (expensesByAccount['unassigned_bank_fee']) {
                                children.push({ code: '-', name: 'Bank Fees (Uncategorized)', amount: expensesByAccount['unassigned_bank_fee'], isItem: true, parentCode: g.code })
                                groupTotal += expensesByAccount['unassigned_bank_fee']
                            }
                        }
                        if (g.code === '34') { // Put uncategorized items in Other expenses
                            if (expensesByAccount['cashout_uncategorized']) {
                                children.push({ code: '-', name: 'Uncategorized Cashout', amount: expensesByAccount['cashout_uncategorized'], isItem: true, parentCode: g.code })
                                groupTotal += expensesByAccount['cashout_uncategorized']
                            }
                            if (expensesByAccount['unassigned_card']) {
                                children.push({ code: '-', name: 'Uncategorized Card Expense', amount: expensesByAccount['unassigned_card'], isItem: true, parentCode: g.code })
                                groupTotal += expensesByAccount['unassigned_card']
                            }
                            if (expensesByAccount['unassigned_po']) {
                                children.push({ code: '-', name: 'Uncategorized Payment Order', amount: expensesByAccount['unassigned_po'], isItem: true, parentCode: g.code })
                                groupTotal += expensesByAccount['unassigned_po']
                            }
                        }
                    }

                    groupTotals[g.code] = groupTotal
                    lines.push({ code: g.code, name: g.name, amount: groupTotal, isGroup: true })
                    lines.push(...children)
                }
            })
        })

        return { lines, netProfit: groupTotals['60'] || 0, revenue: groupTotals['01'] || 0, netRevenue: groupTotals['10'] || 0 }
    }, [coa, expensesByAccount, totalRevenue, adjustments])

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
    const fmtMonth = (m: string) => new Date(Number(m.split('-')[0]), Number(m.split('-')[1]) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })

    const toggleGroup = (code: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev)
            if (next.has(code)) next.delete(code)
            else next.add(code)
            return next
        })
    }

    const toggleAll = () => {
        if (expandedGroups.size > 0) {
            setExpandedGroups(new Set())
        } else {
            const allGroups = new Set<string>()
            pnlStructure.forEach(m => m.groups.forEach(g => allGroups.add(g.code)))
            setExpandedGroups(allGroups)
        }
    }

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Profit & Loss (VAS)</h1>
                    <p className="text-slate-500 mt-1">Vietnamese Accounting Standards format</p>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div className="flex flex-wrap gap-3">
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
                
                <button 
                    onClick={toggleAll}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition"
                >
                    {expandedGroups.size > 0 ? (
                        <><Minimize2 className="w-4 h-4" /> Collapse All</>
                    ) : (
                        <><Maximize2 className="w-4 h-4" /> Expand All</>
                    )}
                </button>
            </div>

            {loading ? <div className="flex justify-center py-16"><CircularLoader /></div> : (
                <>
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                            <div className="text-sm text-slate-500 font-medium">Gross Revenue</div>
                            <div className="text-2xl font-black text-slate-900 tabular-nums mt-1">{currency} {fmt(pnlData.revenue)}</div>
                        </div>
                        <div className={`rounded-2xl border p-5 shadow-sm ${pnlData.netProfit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                            <div className="text-sm text-slate-500 font-medium">Net Profit (EAT)</div>
                            <div className={`text-2xl font-black tabular-nums mt-1 ${pnlData.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                {currency} {fmt(pnlData.netProfit)}
                            </div>
                            {pnlData.netRevenue > 0 && (
                                <div className="text-xs text-slate-500 mt-1">{((pnlData.netProfit / pnlData.netRevenue) * 100).toFixed(1)}% margin (on Net Rev)</div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-16">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="p-3 text-left text-xs font-semibold text-slate-400 uppercase w-20">Code</th>
                                    <th className="p-3 text-left text-xs font-semibold text-slate-400 uppercase">Item</th>
                                    <th className="p-3 text-right text-xs font-semibold text-slate-400 uppercase w-40">Amount ({currency})</th>
                                    <th className="p-3 text-right text-xs font-semibold text-slate-400 uppercase w-24">% Rev</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pnlData.lines.map((line, i) => {
                                    const pct = pnlData.netRevenue > 0 ? ((line.amount / pnlData.netRevenue) * 100).toFixed(1) + '%' : '-'

                                    if (line.isMacro) {
                                        return (
                                            <tr key={i} className="bg-slate-800 text-white">
                                                <td colSpan={4} className="p-3 text-xs font-bold tracking-wider uppercase">
                                                    {line.name}
                                                </td>
                                            </tr>
                                        )
                                    }
                                    if (line.isResult) {
                                        return (
                                            <tr key={i} className="bg-slate-50 border-t-2 border-slate-200 border-b-2">
                                                <td className="p-3 text-xs font-bold text-slate-900 tabular-nums">{line.code}</td>
                                                <td className="p-3 text-sm font-bold text-slate-900 uppercase tracking-wide">{line.name}</td>
                                                <td className={`p-3 text-right text-base font-black tabular-nums ${line.amount < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                                                    {fmt(line.amount)}
                                                </td>
                                                <td className="p-3 text-right text-xs font-bold text-slate-600 tabular-nums">{pct}</td>
                                            </tr>
                                        )
                                    }
                                    if (line.isGroup) {
                                        const isExpanded = expandedGroups.has(line.code);
                                        return (
                                            <tr key={i} className="bg-white border-t border-slate-100 cursor-pointer hover:bg-slate-50 transition" onClick={() => toggleGroup(line.code)}>
                                                <td className="p-3 text-xs font-semibold text-slate-600 tabular-nums">{line.code}</td>
                                                <td className="p-3 text-sm font-semibold text-slate-800 flex items-center gap-2">
                                                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                                                    {line.name}
                                                </td>
                                                <td className="p-3 text-right font-bold text-slate-800 tabular-nums">{fmt(line.amount)}</td>
                                                <td className="p-3 text-right text-xs font-bold text-slate-500 tabular-nums">{pct}</td>
                                            </tr>
                                        )
                                    }
                                    
                                    if (!expandedGroups.has(line.parentCode!)) return null;

                                    return (
                                        <tr key={i} className="bg-white">
                                            <td className="p-2 pl-4 text-xs text-slate-400 tabular-nums">{line.code}</td>
                                            <td className="p-2 pl-8 text-sm text-slate-500">{line.name}</td>
                                            <td className="p-2 text-right text-slate-500 tabular-nums">{fmt(line.amount)}</td>
                                            <td className="p-2 text-right text-xs text-slate-400 tabular-nums">{pct}</td>
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
