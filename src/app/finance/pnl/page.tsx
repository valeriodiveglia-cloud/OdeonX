'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Download, Filter, Maximize2, Minimize2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'
import CircularLoader from '@/components/CircularLoader'
import type { FinChartOfAccount } from '@/types/finance'

function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }

type DetailItem = { source: string; description: string; amount: number; date?: string; supplier?: string; reference?: string; branches?: string }

type PnLLine = {
    code: string;
    name: string;
    amount: number;
    accountId?: string;
    isMacro?: boolean;
    isGroup?: boolean;
    isResult?: boolean;
    isItem?: boolean;
    parentCode?: string; isDeduction?: boolean;
    inventoryDetails?: { opening: number, purchases: number, closing: number, staffWastage?: number };
}

const pnlStructure = [
    {
        macro: '1. REVENUE', groups: [
            { code: '01', name: 'Operating Revenue', types: ['Operating Revenue'] },
            { code: '02', name: 'Revenue deductions', types: ['Revenue Deduction'] },
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
    const { currency, language } = useSettings()
    const [loading, setLoading] = useState(true)
    const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
    const [branchFilter, setBranchFilter] = useState('All')
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
    const [coa, setCoa] = useState<FinChartOfAccount[]>([])
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

    // Data
    const [pnlViewMode, setPnlViewMode] = useState<'management' | 'statutory'>('management')
    const [expensesByAccount, setExpensesByAccount] = useState<Record<string, number>>({})
    const [inventoryByAccount, setInventoryByAccount] = useState<Record<string, { opening: number, closing: number }>>({})
    const [totalRevenue, setTotalRevenue] = useState(0)
    const [totalPersonalExpenses, setTotalPersonalExpenses] = useState(0)
    const [customAdjustments, setCustomAdjustments] = useState<any[]>([])
    const [grossUpAccounts, setGrossUpAccounts] = useState<Set<string>>(new Set())
    const [taxSettings, setTaxSettings] = useState<any[]>([])
    const [detailsByAccount, setDetailsByAccount] = useState<Record<string, DetailItem[]>>({})
    const [staffWastageByAccount, setStaffWastageByAccount] = useState<Record<string, number>>({})
    const [drillAccount, setDrillAccount] = useState<{ id: string; name: string } | null>(null)

    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            const [yr, mo] = month.split('-').map(Number)
            const startDate = `${yr}-${String(mo).padStart(2, '0')}-01`
            const endDate = mo === 12 ? `${yr + 1}-01-01` : `${yr}-${String(mo + 1).padStart(2, '0')}-01`
            const prevD = new Date(yr, mo - 2, 1)
            const prevMonth = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`

            const [coaRes, brRes, revRes, invRes, cashoutRes, wastageRes, adjRes, poRes, mapRes, bankFeesRes, allocRes, invRecordsRes, invMappingRes, materialsRes, prepRes, finalRes, taxSettingsRes] = await Promise.all([
                supabase.from('fin_chart_of_accounts').select('*').eq('is_active', true).order('sort_order'),
                supabase.from('provider_branches').select('id, name').order('name'),
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
                supabase.from('fin_monthly_adjustments').select('*').eq('month_key', month),
                supabase.from('fin_payment_order_items').select('account_id, amount, branch_ids, invoice_id, requires_invoice, description, supplier_id, suppliers(name), fin_corporate_card_expenses(invoice_id, has_vat_invoice), fin_payment_orders!inner(order_date, order_number, status, bank_account_id)')
                    .gte('fin_payment_orders.order_date', startDate).lt('fin_payment_orders.order_date', endDate)
                    .eq('fin_payment_orders.status', 'Paid'),
                supabase.from('fin_cashout_category_mapping').select('*'),
                supabase.from('fin_bank_transactions').select('amount, transaction_date, fin_bank_accounts!fin_bank_transactions_account_id_fkey(fee_account_id, branch_id)')
                    .gte('transaction_date', startDate).lt('transaction_date', endDate)
                    .eq('type', 'Outflow')
                    .ilike('category', '%Fee%'),
                supabase.from('fin_pnl_allocation_settings').select('*').limit(1).single(),
                supabase.from('fin_inventory_records').select('item_type, item_id, total_value, branch_id, month_key').in('month_key', [month, prevMonth]),
                supabase.from('fin_inventory_category_mapping').select('*'),
                supabase.from('materials').select('id, category_id'),
                supabase.from('prep_recipes').select('id, type'),
                supabase.from('final_recipes').select('id, type'),
                supabase.from('fin_tax_settings').select('*').eq('is_active', true)
            ])

            let coaData: FinChartOfAccount[] = []
            if (coaRes.data) {
                coaData = coaRes.data as any
                setCoa(coaData)
            }
            if (adjRes.data) setCustomAdjustments(adjRes.data)
            if (taxSettingsRes.data) setTaxSettings(taxSettingsRes.data)
            if (brRes.data) setBranches(brRes.data as any)

            const selectedBranchName = branchFilter !== 'All' ? brRes.data?.find(b => b.id === branchFilter)?.name : null

            // Initialize detail trackers early so they can be populated by revenue and adjustments
            const byAccount: Record<string, number> = {}
            const details: Record<string, DetailItem[]> = {}



            // Revenue per branch calculations for allocation
            const branchNameToId: Record<string, string> = {}
            const branchIdToName: Record<string, string> = {}
            if (brRes.data) {
                for (const b of brRes.data as any) { branchNameToId[b.name] = b.id; branchIdToName[b.id] = b.name; }
            }

            const revenuePerBranchId: Record<string, number> = {}
            if (brRes.data) {
                for (const b of brRes.data as any) revenuePerBranchId[b.id] = 0
            }

            // Revenue
            let revenueAcc = 0
            const revAcc = coaData.find(a => a.code === '5112')
            const revAccId = revAcc?.id || '5112'

            if (revRes.data) {
                for (const r of revRes.data) {
                    // Accumulate for total revenue UI
                    if (!selectedBranchName || r.branch_name === selectedBranchName) {
                        const amount = Number(r.revenue_vnd || 0)
                        revenueAcc += amount

                        if (amount !== 0) {
                            if (!details[revAccId]) details[revAccId] = []
                            
                            let descParts = []
                            if (r.shift) descParts.push(`Shift: ${r.shift}`)
                            if (r.cashier_name) descParts.push(`Cashier: ${r.cashier_name}`)
                            if (r.notes) descParts.push(`Notes: ${r.notes}`)
                            const description = descParts.join(' | ') || 'Cashier Closing Revenue'

                            details[revAccId].push({
                                source: 'Closing',
                                description,
                                amount,
                                date: r.report_date,
                                branches: r.branch_name
                            })
                        }
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

            // Read global Gross-Up configuration
            const grossUpAccounts = new Set<string>(allocRes.data?.gross_up_accounts || [])
            setGrossUpAccounts(grossUpAccounts)

            // Adjustments Processing (using allocation factor for global adjustments)
            const allBranchIds = brRes.data ? (brRes.data as any).map((b:any) => b.id) : []
            let finalAdjustments: any[] = []
            
            if (adjRes.data) {
                for (const row of adjRes.data) {
                    if (branchFilter !== 'All' && row.branch_id !== branchFilter && row.branch_id !== 'All') continue;
                    
                    if (row.custom_adjustments && Array.isArray(row.custom_adjustments)) {
                        for (const adj of row.custom_adjustments) {
                            let allocated = adj.allocated_branches;
                            if (!allocated) {
                                // Fallback for legacy format
                                allocated = row.branch_id === 'All' ? allBranchIds : [row.branch_id];
                            }
                            
                            // Skip if filtering by a specific branch and this adjustment is not allocated to it
                            if (branchFilter !== 'All' && !allocated.includes(branchFilter)) continue;

                            let amount = Number(adj.amount || 0)
                            const factor = getAllocationFactor(null, allocated, branchFilter)
                            amount = amount * factor
                            
                            finalAdjustments.push({ ...adj, amount })
                        }
                    }
                }
            }
            setCustomAdjustments(finalAdjustments)

            // Process custom adjustments into detailsByAccount
            for (const adj of finalAdjustments) {
                const adjBranches = adj.allocated_branches?.map((id: string) => branchIdToName[id] || id).join(', ')
                if (adj.method === 'extract') {
                    // 1. Negative entry on source account (Product Sales - 5112)
                    if (!details[revAccId]) details[revAccId] = []
                    details[revAccId].push({
                        source: 'Adjustment',
                        description: `${adj.name} (Storno / Extract)`,
                        amount: -adj.amount,
                        date: startDate,
                        branches: adjBranches
                    })

                    // 2. Positive entry on destination account (target_group)
                    const destKey = adj.target_group
                    if (destKey) {
                        if (!details[destKey]) details[destKey] = []
                        details[destKey].push({
                            source: 'Adjustment',
                            description: `${adj.name} (Received from storno)`,
                            amount: adj.amount,
                            date: startDate,
                            branches: adjBranches
                        })
                    }
                } else {
                    // add or subtract
                    const targetKey = adj.target_group
                    if (targetKey) {
                        if (!details[targetKey]) details[targetKey] = []
                        const amt = adj.method === 'subtract' ? -adj.amount : adj.amount
                        details[targetKey].push({
                            source: 'Adjustment',
                            description: adj.name,
                            amount: amt,
                            date: startDate,
                            branches: adjBranches
                        })
                    }
                }

                // If this adjustment is part of the Gross-Up configuration, also append it to Sub Product Sales (5112) details
                if (grossUpAccounts.has(adj.target_group) && (adj.method === 'add' || adj.method === 'extract')) {
                    if (!details[revAccId]) details[revAccId] = []
                    details[revAccId].push({
                        source: 'Adjustment',
                        description: `${adj.name} (Gross-Up)`,
                        amount: adj.amount,
                        date: startDate,
                        branches: adjBranches
                    })
                }
            }

            // Process dynamic VAT / Revenue Deduction taxes into detailsByAccount
            if (taxSettingsRes.data) {
                const revenueTaxes = taxSettingsRes.data.filter(t => {
                    const acc = coaData.find(a => a.id === t.account_id);
                    return acc?.account_type === 'Revenue Deduction';
                });
                
                for (const t of revenueTaxes) {
                    const taxAccId = t.account_id;
                    if (taxAccId) {
                        if (!details[taxAccId]) details[taxAccId] = [];

                        if (revRes.data) {
                            for (const r of revRes.data) {
                                if (!selectedBranchName || r.branch_name === selectedBranchName) {
                                    const rev = Number(r.revenue_vnd || 0);
                                    if (rev !== 0) {
                                        const taxAmount = rev - (rev / (1 + Number(t.percentage) / 100));
                                        
                                        let descParts = [];
                                        if (r.shift) descParts.push(`Shift: ${r.shift}`);
                                        if (r.cashier_name) descParts.push(`Cashier: ${r.cashier_name}`);
                                        const description = `${descParts.join(' | ') || 'Cashier Closing'} (VAT ${t.percentage}%)`;

                                        details[taxAccId].push({
                                            source: 'Closing',
                                            description,
                                            amount: taxAmount,
                                            date: r.report_date,
                                            branches: r.branch_name
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Expenses by Account (using account ID)
            let personalExpensesAcc = 0
            if (invRes.data) {
                for (const inv of invRes.data) {
                    if (inv.is_personal_deduction) {
                        if (branchFilter !== 'All') {
                            if (!inv.branch_ids || !inv.branch_ids.includes(branchFilter)) continue;
                        }
                        const factor = getAllocationFactor(inv.account_id, inv.branch_ids, branchFilter);
                        personalExpensesAcc += Number(inv.net_amount || inv.gross_amount || 0) * factor;
                    }

                    // Filter based on view mode (Management vs Statutory)
                    if (pnlViewMode === 'management' && inv.is_personal_deduction) continue;

                    if (branchFilter !== 'All') {
                        if (!inv.branch_ids || !inv.branch_ids.includes(branchFilter)) continue;
                    }
                    const factor = getAllocationFactor(inv.account_id, inv.branch_ids, branchFilter);
                    const amount = Number(inv.net_amount || inv.gross_amount || 0) * factor;
                    
                    const key = inv.account_id || 'unassigned_invoice'
                    byAccount[key] = (byAccount[key] || 0) + amount
                    if (!details[key]) details[key] = [];
                    details[key].push({ 
                        source: 'Invoice', 
                        reference: inv.invoice_number || '—',
                        supplier: inv.is_personal_deduction ? (inv.custom_supplier_name || 'Personal') : ((inv as any).suppliers?.name || undefined),
                        description: inv.description || '',
                        amount, 
                        date: inv.invoice_date,
                        branches: inv.branch_ids?.map((id: string) => branchIdToName[id] || id).join(', ')
                    })
                }
            }
            setTotalPersonalExpenses(personalExpensesAcc)
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
                    
                    const cashAmt = Number(c.amount || 0);
                    byAccount[accountIdToUse] = (byAccount[accountIdToUse] || 0) + cashAmt
                    if (!details[accountIdToUse]) details[accountIdToUse] = [];
                    details[accountIdToUse].push({ 
                        source: 'Cashout', 
                        supplier: (c as any).suppliers?.name || c.supplier_name || undefined,
                        description: c.description || c.category || '—',
                        amount: cashAmt, 
                        date: c.date,
                        branches: c.branch
                    })
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
                        const feeAmt = Number(po.amount || 0);
                        byAccount[key] = (byAccount[key] || 0) + feeAmt;
                        if (!details[key]) details[key] = [];
                        details[key].push({ source: 'Bank Fee', reference: poParent?.order_number, description: po.description || 'Bank Fee', amount: feeAmt, date: poParent?.order_date });
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
                    if (!details[key]) details[key] = [];
                    const poParentObj = Array.isArray(po.fin_payment_orders) ? po.fin_payment_orders[0] : po.fin_payment_orders;
                    details[key].push({ 
                        source: 'Payment', 
                        reference: poParentObj?.order_number || '',
                        supplier: (po as any).suppliers?.name || undefined,
                        description: po.description || '',
                        amount, 
                        date: poParentObj?.order_date,
                        branches: po.branch_ids?.map((id: string) => branchIdToName[id] || id).join(', ')
                    })
                }
            }
            const tempStaffWastageByAccount: Record<string, number> = {}
            if (wastageRes.data) {
                const mats = materialsRes.data || []
                const preps = prepRes.data || []
                const finals = finalRes.data || []
                const invMappings = invMappingRes.data || []

                for (const w of wastageRes.data) {
                    if (selectedBranchName && w.branch_name !== selectedBranchName) continue
                    
                    let targetAccId: string | null = null;
                    const wTypeLower = (w.wtype || '').toLowerCase();
                    
                    if (wTypeLower === 'material') {
                        const m = mats.find(x => x.id === w.item_id);
                        if (m) {
                            const mapping = invMappings.find(x => x.category_id === m.category_id);
                            if (mapping) targetAccId = mapping.account_id;
                        }
                    } else if (wTypeLower === 'prep') {
                        const p = preps.find(x => x.id === w.item_id);
                        if (p) {
                            const mapping = invMappings.find(x => x.recipe_type === p.type);
                            if (mapping) targetAccId = mapping.account_id;
                        }
                    } else if (wTypeLower === 'dish') {
                        const f = finals.find(x => x.id === w.item_id);
                        if (f) {
                            const mapping = invMappings.find(x => x.recipe_type === f.type);
                            if (mapping) targetAccId = mapping.account_id;
                        }
                    }
                    
                    if (!targetAccId) {
                        targetAccId = 'cogs_unassigned';
                    }

                    const wAmt = Number(w.total_cost_vnd || 0);
                    tempStaffWastageByAccount[targetAccId] = (tempStaffWastageByAccount[targetAccId] || 0) + wAmt;

                    if (!details[targetAccId]) details[targetAccId] = [];
                    details[targetAccId].push({
                        source: 'Wastage',
                        description: `Staff Wastage: ${w.item_name || 'Item'} (${w.wtype || 'Unknown'})`,
                        amount: -wAmt,
                        date: w.date,
                        branches: w.branch_name
                    });
                }
            }
            setStaffWastageByAccount(tempStaffWastageByAccount)
            if (bankFeesRes.data) {
                for (const bf of bankFeesRes.data) {
                    const accData = bf.fin_bank_accounts as any;
                    if (branchFilter !== 'All') {
                        if (accData && accData.branch_id && accData.branch_id !== branchFilter) continue;
                    }
                    const feeAccount = accData?.fee_account_id ? coaData.find(a => a.id === accData.fee_account_id) : null;
                    const key = feeAccount ? feeAccount.id : 'unassigned_bank_fee';
                    const bfAmt = Number(bf.amount || 0);
                    byAccount[key] = (byAccount[key] || 0) + bfAmt;
                    if (!details[key]) details[key] = [];
                    details[key].push({ source: 'Bank Fee', description: 'Bank Transaction Fee', amount: bfAmt, date: bf.transaction_date, branches: accData?.branch_id ? branchIdToName[accData.branch_id] : undefined })
                }
            }
            setExpensesByAccount(byAccount)
            setDetailsByAccount(details)

            const tempInvByAccount: Record<string, { opening: number, closing: number }> = {}
            if (invRecordsRes.data) {
                const mats = materialsRes.data || []
                const preps = prepRes.data || []
                const finals = finalRes.data || []
                const invMappings = invMappingRes.data || []

                for (const r of invRecordsRes.data) {
                    if (branchFilter !== 'All' && r.branch_id !== branchFilter) continue;

                    let accId = null;
                    if (r.item_type === 'material') {
                        const m = mats.find(x => x.id === r.item_id);
                        if (m) {
                            const mapping = invMappings.find(x => x.category_id === m.category_id);
                            if (mapping) accId = mapping.account_id;
                        }
                    } else if (r.item_type === 'prep_recipe') {
                        const p = preps.find(x => x.id === r.item_id);
                        if (p) {
                            const mapping = invMappings.find(x => x.recipe_type === p.type);
                            if (mapping) accId = mapping.account_id;
                        }
                    } else if (r.item_type === 'final_recipe') {
                        const f = finals.find(x => x.id === r.item_id);
                        if (f) {
                            const mapping = invMappings.find(x => x.recipe_type === f.type);
                            if (mapping) accId = mapping.account_id;
                        }
                    }

                    if (accId) {
                        if (!tempInvByAccount[accId]) tempInvByAccount[accId] = { opening: 0, closing: 0 };
                        
                        const factor = getAllocationFactor(accId, [r.branch_id], branchFilter);
                        const val = Number(r.total_value || 0) * factor;

                        if (r.month_key === prevMonth) tempInvByAccount[accId].opening += val;
                        else if (r.month_key === month) tempInvByAccount[accId].closing += val;
                    }
                }
            }
            setInventoryByAccount(tempInvByAccount)

            setLoading(false)
        }
        fetchData()
    }, [month, branchFilter, pnlViewMode])

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

        const localExpensesByAccount = { ...expensesByAccount }
        
        // 1. Dynamic Taxes for Revenue Deductions
        const grossRev = Math.max(0, totalRevenue);
        const revenueTaxes = taxSettings.filter(t => {
            const acc = coa.find(a => a.id === t.account_id);
            return acc?.account_type === 'Revenue Deduction';
        });
        revenueTaxes.forEach(t => {
            // Scorporo: Gross - (Gross / (1 + percentage/100))
            const taxAmount = grossRev - (grossRev / (1 + Number(t.percentage) / 100));
            localExpensesByAccount[t.account_id] = (localExpensesByAccount[t.account_id] || 0) + taxAmount;
        });

        const macroTranslationKeys: Record<string, string> = {
            '1. REVENUE': 'FinPnLMacroRevenue',
            '2. COGS': 'FinPnLMacroCOGS',
            '3. OPEX': 'FinPnLMacroOPEX',
            '4. FINANCIAL & OTHER': 'FinPnLMacroFinancial'
        };

        const groupTranslationKeys: Record<string, string> = {
            'Operating Revenue': 'FinPnLGroupOperatingRevenue',
            'Revenue deductions': 'FinPnLGroupRevenueDeductions',
            'Net revenue': 'FinPnLGroupNetRevenue',
            'Cost of goods sold': 'FinPnLGroupCOGS',
            'Gross profit': 'FinPnLGroupGrossProfit',
            'Selling expenses': 'FinPnLGroupSellingExpenses',
            'General & administration expenses': 'FinPnLGroupGnAExpenses',
            'Payroll': 'FinPnLGroupPayroll',
            'Net operating profit/loss': 'FinPnLGroupNetOpProfit',
            'Financial income': 'FinPnLGroupFinancialIncome',
            'Financial activities expenses': 'FinPnLGroupFinancialExpenses',
            'Other income': 'FinPnLGroupOtherIncome',
            'Other expenses': 'FinPnLGroupOtherExpenses',
            'Total earning before tax': 'FinPnLGroupEBT',
            'Business income tax charge': 'FinPnLGroupTax',
            'Earning after tax / Net Profit': 'FinPnLGroupEAT'
        };

        pnlStructure.forEach(macroGroup => {
            const macroKey = macroTranslationKeys[macroGroup.macro] || macroGroup.macro;
            lines.push({ code: '', name: t(language, macroKey), amount: 0, isMacro: true })
            
            macroGroup.groups.forEach(g => {
                const groupKey = groupTranslationKeys[g.name] || g.name;
                if ('isFormula' in g && g.isFormula) {
                    const amt = calcFormula(g.formula)
                    groupTotals[g.code] = amt
                    lines.push({ code: g.code, name: t(language, groupKey), amount: amt, isResult: true })
                    
                    // 2. If we just calculated EBT (code '50'), let's compute Tax Expenses dynamically
                    if (g.code === '50') {
                        const ebt = Math.max(0, amt); // EBT
                        const ebtTaxes = taxSettings.filter(t => {
                            const acc = coa.find(a => a.id === t.account_id);
                            return acc?.account_type === 'Tax Expenses';
                        });
                        ebtTaxes.forEach(t => {
                            // Direct percentage: EBT * (percentage/100)
                            const taxAmount = ebt * (Number(t.percentage) / 100);
                            localExpensesByAccount[t.account_id] = (localExpensesByAccount[t.account_id] || 0) + taxAmount;
                        });
                    }
                } else if ('types' in g && g.types) {
                    const children: PnLLine[] = []
                    let groupTotal = 0

                    if (g.code === '01') {
                        const productsRevenue = Math.max(0, totalRevenue)
                        const revAcc = coa.find(a => a.code === '5112')
                        children.push({ code: '5112', name: t(language, 'FinPnLSubProductSales'), amount: productsRevenue, isItem: true, parentCode: g.code, accountId: revAcc?.id })
                        groupTotal += productsRevenue

                        // Find how much was extracted in total from 5112 to ANY destination globally
                        let globalExtractedFrom5112 = 0;
                        for (const adj of customAdjustments) {
                            if (adj.method === 'extract') {
                                globalExtractedFrom5112 += adj.amount;
                            }
                        }

                        // Also include any accounts mapped to 'Operating Revenue'
                        const relevantAccounts = coa.filter(a => g.types.includes(a.account_type) && !a.is_group && a.code !== '5112')
                        for (const acc of relevantAccounts) {
                            let amt = localExpensesByAccount[acc.id] || 0
                            let isAdjusted = false;
                            
                            for (const adj of customAdjustments) {
                                if (adj.target_group === acc.id) {
                                    if (adj.method === 'add') amt += adj.amount;
                                    else if (adj.method === 'subtract') amt -= adj.amount;
                                    else if (adj.method === 'extract') {
                                        amt += adj.amount; // Extract FROM 5112 TO this account
                                    }
                                    isAdjusted = true;
                                }
                            }
                            
                            const displayName = language === 'vi' ? (acc.simplified_name || acc.name) : acc.name;
                            const displayAmt = isAdjusted ? Math.abs(amt) : amt;
                            
                            children.push({ code: acc.code, name: displayName, amount: displayAmt, isItem: true, parentCode: g.code, accountId: acc.id })
                            groupTotal += amt
                        }
                        
                        // Process legacy macro-group adjustments
                        for (const adj of customAdjustments) {
                            if (adj.target_group === g.code) {
                                if (adj.method === 'add') {
                                    groupTotal += adj.amount;
                                    children.push({ code: '-', name: adj.name, amount: Math.abs(adj.amount), isItem: true, parentCode: g.code })
                                } else if (adj.method === 'subtract') {
                                    groupTotal -= adj.amount;
                                    children.push({ code: '-', name: adj.name, amount: Math.abs(adj.amount), isItem: true, parentCode: g.code })
                                } else if (adj.method === 'extract') {
                                    // Extract: custom line FROM 5112 TO this line
                                    children.push({ code: '-', name: adj.name, amount: Math.abs(adj.amount), isItem: true, parentCode: g.code })
                                }
                            }
                        }
                        
                        // Check if 5112 had adjustments since we processed it manually
                        if (revAcc) {
                            let revAccTrueAmount = children.find(c => c.code === '5112')?.amount || 0;
                            
                            // Apply all extractions globally
                            revAccTrueAmount -= globalExtractedFrom5112;
                            // Reduce the total revenue of group 01 by the extracted amount
                            groupTotal -= globalExtractedFrom5112;

                            let revIsAdjusted = false;
                            for (const adj of customAdjustments) {
                                if (adj.target_group === revAcc.id) {
                                    revIsAdjusted = true;
                                    if (adj.method === 'add') {
                                        revAccTrueAmount += adj.amount;
                                        groupTotal += adj.amount;
                                    } else if (adj.method === 'subtract') {
                                        revAccTrueAmount -= adj.amount;
                                        groupTotal -= adj.amount;
                                    } else if (adj.method === 'extract') {
                                        revAccTrueAmount -= adj.amount;
                                        // DON'T subtract from groupTotal — it's a reclassification to a new line
                                        children.push({ code: '-', name: adj.name, amount: adj.amount, isItem: true, parentCode: g.code })
                                    }
                                }
                            }
                            
                            // Update the 5112 line
                            const existing = children.find(c => c.code === '5112');
                            if (existing) {
                                existing.amount = Math.max(0, revAccTrueAmount);
                            }
                        }

                    } else {
                        // Find matching accounts
                        const relevantAccounts = coa.filter(a => g.types.includes(a.account_type) && !a.is_group)
                        for (const acc of relevantAccounts) {
                            let purchases = localExpensesByAccount[acc.id] || 0
                            const inv = inventoryByAccount[acc.id] || { opening: 0, closing: 0 }
                            const staffWastage = staffWastageByAccount[acc.id] || 0
                            
                            let amt = inv.opening + purchases - inv.closing - staffWastage;

                            for (const adj of customAdjustments) {
                                if (adj.target_group === acc.id) {
                                    if (adj.method === 'add') amt += adj.amount;
                                    else if (adj.method === 'subtract') amt -= adj.amount;
                                    else if (adj.method === 'extract') {
                                        amt += adj.amount;
                                    }
                                }
                            }
                            const displayName = language === 'vi' ? (acc.simplified_name || acc.name) : acc.name;
                            children.push({ 
                                code: acc.code, 
                                name: displayName, 
                                amount: amt, 
                                isItem: true, 
                                parentCode: g.code,
                                accountId: acc.id,
                                inventoryDetails: (inv.opening !== 0 || inv.closing !== 0 || staffWastage !== 0) 
                                    ? { opening: inv.opening, purchases, closing: inv.closing, staffWastage } 
                                    : undefined
                            })
                            groupTotal += amt
                        }
                        
                        // Process legacy macro-group adjustments
                        for (const adj of customAdjustments) {
                            if (adj.target_group === g.code) {
                                if (adj.method === 'add') {
                                    groupTotal += adj.amount;
                                    children.push({ code: '-', name: adj.name, amount: adj.amount, isItem: true, parentCode: g.code })
                                } else if (adj.method === 'subtract') {
                                    groupTotal -= adj.amount;
                                    children.push({ code: '-', name: adj.name, amount: -adj.amount, isItem: true, parentCode: g.code })
                                } else if (adj.method === 'extract') {
                                    groupTotal += adj.amount;
                                    children.push({ code: '-', name: adj.name, amount: adj.amount, isItem: true, parentCode: g.code })
                                }
                            }
                        }
                        
                        // Fallback unassigned logic
                        if (g.code === '11') {
                            if (localExpensesByAccount['unassigned_invoice']) {
                                children.push({ code: '-', name: t(language, 'FinPnLUncategorizedInvoice'), amount: localExpensesByAccount['unassigned_invoice'], isItem: true, parentCode: g.code })
                                groupTotal += localExpensesByAccount['unassigned_invoice']
                            }
                            const unassignedStaffWastage = staffWastageByAccount['cogs_unassigned'] || 0;
                            if (unassignedStaffWastage > 0) {
                                children.push({ 
                                    code: '-', 
                                    name: t(language, 'FinPnLUnassignedStaffWastage'), 
                                    amount: -unassignedStaffWastage, 
                                    isItem: true, 
                                    parentCode: g.code,
                                    accountId: 'cogs_unassigned'
                                })
                                groupTotal -= unassignedStaffWastage
                            }
                        }
                        if (g.code === '32') { // Financial expenses
                            if (localExpensesByAccount['unassigned_bank_fee']) {
                                children.push({ code: '-', name: t(language, 'FinPnLBankFeesUncategorized'), amount: localExpensesByAccount['unassigned_bank_fee'], isItem: true, parentCode: g.code })
                                groupTotal += localExpensesByAccount['unassigned_bank_fee']
                            }
                        }
                        if (g.code === '34') { // Put uncategorized items in Other expenses
                            if (localExpensesByAccount['cashout_uncategorized']) {
                                children.push({ code: '-', name: t(language, 'FinPnLUncategorizedCashout'), amount: localExpensesByAccount['cashout_uncategorized'], isItem: true, parentCode: g.code })
                                groupTotal += localExpensesByAccount['cashout_uncategorized']
                            }
                            if (localExpensesByAccount['unassigned_card']) {
                                children.push({ code: '-', name: t(language, 'FinPnLUncategorizedCardExpense'), amount: localExpensesByAccount['unassigned_card'], isItem: true, parentCode: g.code })
                                groupTotal += localExpensesByAccount['unassigned_card']
                            }
                            if (localExpensesByAccount['unassigned_po']) {
                                children.push({ code: '-', name: t(language, 'FinPnLUncategorizedPO'), amount: localExpensesByAccount['unassigned_po'], isItem: true, parentCode: g.code })
                                groupTotal += localExpensesByAccount['unassigned_po']
                            }
                        }
                    }

                    if (g.code === '02') {
                        children.forEach(c => c.amount = Math.abs(c.amount));
                        groupTotal = Math.abs(groupTotal);
                    }

                    groupTotals[g.code] = groupTotal
                    lines.push({ code: g.code, name: t(language, groupKey), amount: groupTotal, isGroup: true })
                    lines.push(...children)

                    // After group 02 is calculated, gross-up group 01 to reconstruct Gross Revenue
                    // ONLY gross-up by custom adjustments that the user explicitly configured in Monthly Adjustments
                    if (g.code === '02') {
                        let discountGrossUp = 0;
                        
                        for (const adj of customAdjustments) {
                            if (grossUpAccounts.has(adj.target_group)) {
                                if (adj.method === 'add' || adj.method === 'extract') {
                                    discountGrossUp += Number(adj.amount || 0);
                                }
                            }
                        }

                        if (discountGrossUp > 0) {
                            groupTotals['01'] = (groupTotals['01'] || 0) + discountGrossUp;
                            const revGroupLine = lines.find(l => l.code === '01' && l.isGroup);
                            if (revGroupLine) revGroupLine.amount = groupTotals['01'];
                            
                            const revItemLine = lines.find(l => l.code === '5112' && l.isItem);
                            if (revItemLine) revItemLine.amount = (revItemLine.amount || 0) + discountGrossUp;
                        }
                    }
                }
            })
        })

        return { lines, netProfit: groupTotals['60'] || 0, revenue: groupTotals['01'] || 0, netRevenue: groupTotals['10'] || 0 }
    }, [coa, expensesByAccount, inventoryByAccount, totalRevenue, customAdjustments, taxSettings, staffWastageByAccount, language])

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
    const fmtMonth = (m: string) => new Date(Number(m.split('-')[0]), Number(m.split('-')[1]) - 1, 1).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' })

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
                    <h1 className="text-3xl font-bold text-slate-900">{t(language, 'FinPnLTitle')}</h1>
                    <p className="text-slate-500 mt-1">{t(language, 'FinPnLSubtitle')}</p>
                </div>
                {/* Controls Row (Filters) */}
                <div className="flex flex-wrap items-center justify-end gap-3 w-full sm:w-auto">
                    <button 
                        onClick={toggleAll}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl shadow-sm hover:bg-blue-700 shadow-blue-600/20 transition"
                    >
                        {expandedGroups.size > 0 ? (
                            <><Minimize2 className="w-4 h-4" /> {t(language, 'FinPnLCollapseAll')}</>
                        ) : (
                            <><Maximize2 className="w-4 h-4" /> {t(language, 'FinPnLExpandAll')}</>
                        )}
                    </button>

                    <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                        className="border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium bg-white text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="All">{t(language, 'FinPnLAllBranches')}</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </div>
            </div>

            {/* View Mode Tabs (Minimalist border-bottom style) */}
            <div className="flex items-center gap-6 border-b border-slate-200 mb-6">
                <button
                    type="button"
                    onClick={() => setPnlViewMode('management')}
                    className={`pb-3 px-1 text-sm font-bold transition-all border-b-2 ${
                        pnlViewMode === 'management' 
                            ? 'border-blue-600 text-blue-700' 
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    {t(language, 'FinPnLManagement')}
                </button>
                <button
                    type="button"
                    onClick={() => setPnlViewMode('statutory')}
                    className={`pb-3 px-1 text-sm font-bold transition-all border-b-2 ${
                        pnlViewMode === 'statutory' 
                            ? 'border-amber-500 text-amber-700' 
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    {t(language, 'FinPnLStatutory')}
                </button>
            </div>


            {loading ? <div className="flex justify-center py-16"><CircularLoader /></div> : (
                <>
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                            <div className="text-sm text-slate-500 font-medium">{t(language, 'FinPnLGrossRevenue')}</div>
                            <div className="text-2xl font-black text-slate-900 tabular-nums mt-1">{currency} {fmt(pnlData.revenue)}</div>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                            <div className="text-sm text-slate-500 font-medium">{t(language, 'FinPnLPersonalDeductions')}</div>
                            <div className="text-2xl font-black text-amber-600 tabular-nums mt-1">{currency} {fmt(totalPersonalExpenses)}</div>
                            <div className="text-xs text-slate-500 mt-1">{t(language, 'FinPnLStatutoryDesc')}</div>
                        </div>
                        <div className={`rounded-2xl border p-5 shadow-sm ${pnlData.netProfit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                            <div className="text-sm text-slate-500 font-medium">{t(language, 'FinPnLNetProfit')}</div>
                            <div className={`text-2xl font-black tabular-nums mt-1 ${pnlData.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                {currency} {fmt(pnlData.netProfit)}
                            </div>
                            {pnlData.netRevenue > 0 && (
                                <div className="text-xs text-slate-500 mt-1">{t(language, 'FinPnLMarginOnNet').replace('{pct}', ((pnlData.netProfit / pnlData.netRevenue) * 100).toFixed(1))}</div>
                            )}
                        </div>
                    </div>


                    {/* Month Navigation */}
                    <div className="grid grid-cols-3 items-center mb-4">
                        <button onClick={() => {
                            const [y, m] = month.split('-').map(Number);
                            const d = new Date(y, m - 2, 1);
                            setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                        }} className="justify-self-start text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline transition flex items-center gap-1">
                            <ChevronLeft className="w-4 h-4" /> {t(language, 'FinCFPrevious')}
                        </button>
                        <div className="justify-self-center text-lg font-bold text-slate-900">
                            {fmtMonth(month)}
                        </div>
                        <button onClick={() => {
                            const [y, m] = month.split('-').map(Number);
                            const d = new Date(y, m, 1);
                            setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                        }} className="justify-self-end text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline transition flex items-center gap-1">
                            {t(language, 'FinCFNext')} <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-16">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="p-3 text-left text-xs font-semibold text-slate-400 uppercase w-20">{t(language, 'FinPnLCode')}</th>
                                    <th className="p-3 text-left text-xs font-semibold text-slate-400 uppercase">{t(language, 'FinPnLItem')}</th>
                                    <th className="p-3 text-right text-xs font-semibold text-slate-400 uppercase w-40">{t(language, 'FinPnLAmountCurrency').replace('{currency}', currency)}</th>
                                    <th className="p-3 text-right text-xs font-semibold text-slate-400 uppercase w-24">{t(language, 'FinPnLPctNetRev')}</th>
                                    <th className="p-3 text-right text-xs font-semibold text-slate-400 uppercase w-24">{t(language, 'FinPnLPctGroup')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pnlData.lines.map((line, i) => {
                                    const pctNetRev = pnlData.netRevenue > 0 ? ((line.amount / pnlData.netRevenue) * 100).toFixed(1) + '%' : '-'
                                    
                                    let pctGroup = '-';
                                    if (line.isItem && line.parentCode) {
                                        const parentGroup = pnlData.lines.find(l => l.code === line.parentCode && l.isGroup);
                                        if (parentGroup && parentGroup.amount > 0) {
                                            pctGroup = ((line.amount / parentGroup.amount) * 100).toFixed(1) + '%';
                                        }
                                    }

                                    if (line.isMacro) {
                                        return (
                                            <tr key={i} className="bg-slate-800 text-white">
                                                <td colSpan={5} className="p-3 text-xs font-bold tracking-wider uppercase">
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
                                                <td className="p-3 text-right text-xs font-bold text-slate-600 tabular-nums">{pctNetRev}</td>
                                                <td className="p-3 text-right text-xs font-bold text-slate-600 tabular-nums">-</td>
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
                                                <td className="p-3 text-right text-xs font-bold text-slate-500 tabular-nums">{pctNetRev}</td>
                                                <td className="p-3 text-right text-xs font-bold text-slate-500 tabular-nums">100.0%</td>
                                            </tr>
                                        )
                                    }
                                    
                                    if (!expandedGroups.has(line.parentCode!)) return null;

                                    if (line.isItem) {
                                        return (
                                            <tr key={i} className="hover:bg-slate-100 transition border-b border-slate-50 bg-slate-50/50">
                                                <td className="p-3 text-[11px] font-medium text-slate-400 pl-6 tabular-nums">{line.code}</td>
                                                <td className="p-3 pl-8">
                                                    <div className="text-sm font-medium text-slate-600 flex items-center gap-2">
                                                        <div className="w-1 h-1 rounded-full bg-slate-300 flex-shrink-0" />
                                                        {line.accountId && (detailsByAccount[line.accountId]?.length || 0) > 0 ? (
                                                            <button onClick={() => setDrillAccount({ id: line.accountId!, name: line.name })} className="text-left hover:text-blue-600 hover:underline underline-offset-2 transition cursor-pointer">{line.name}</button>
                                                        ) : line.name}
                                                    </div>
                                                    {line.inventoryDetails && (
                                                        <div className="text-[11px] text-slate-400 mt-0.5 font-medium ml-3">
                                                            ({t(language, 'FinPnLOpening')}: {fmt(line.inventoryDetails.opening)} + {t(language, 'FinPnLPurchases')}: {fmt(line.inventoryDetails.purchases)} - {t(language, 'FinPnLClosing')}: {fmt(line.inventoryDetails.closing)}{line.inventoryDetails.staffWastage ? ` - ${t(language, 'FinPnLStaffWastage')}: ${fmt(line.inventoryDetails.staffWastage)}` : ''})
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-3 text-right text-sm font-medium text-slate-600 tabular-nums pr-10">{fmt(line.amount)}</td>
                                                <td className="p-3 text-right text-xs text-slate-400 tabular-nums">{pctNetRev}</td>
                                                <td className="p-3 text-right text-xs text-slate-400 tabular-nums">{pctGroup}</td>
                                            </tr>
                                        )
                                    }

                                    return (
                                        <tr key={i} className="bg-white">
                                            <td className="p-2 pl-4 text-xs text-slate-400 tabular-nums">{line.code}</td>
                                            <td className="p-2 pl-8 text-sm text-slate-500">{line.name}</td>
                                            <td className="p-2 text-right text-slate-500 tabular-nums">{fmt(line.amount)}</td>
                                            <td className="p-2 text-right text-xs text-slate-400 tabular-nums">{pctNetRev}</td>
                                            <td className="p-2 text-right text-xs text-slate-400 tabular-nums">-</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
            {/* Drill-down Modal */}
            {drillAccount && (() => {
                const items = detailsByAccount[drillAccount.id] || [];
                const sorted = [...items].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
                const total = sorted.reduce((s, d) => s + d.amount, 0);
                return (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden">
                            <div className="flex items-center justify-between p-5 border-b border-slate-100">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900">{drillAccount.name}</h2>
                                    <p className="text-sm text-slate-500 mt-0.5">{sorted.length} {sorted.length === 1 ? t(language, 'FinPnLDrilldownTransactions') : t(language, 'FinPnLDrilldownTransactionsPlural')} • {t(language, 'FinPnLDrilldownTotal')}: {currency} {fmt(total)}</p>
                                </div>
                                <button onClick={() => setDrillAccount(null)} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
                            </div>
                            <div className="max-h-[60vh] overflow-y-auto">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-slate-50 z-10">
                                        <tr className="text-xs text-slate-500 uppercase border-b border-slate-200">
                                            <th className="p-3 text-left">{t(language, 'FinPnLDrilldownSource')}</th>
                                            <th className="p-3 text-left">{t(language, 'FinPnLDrilldownSupplier')}</th>
                                            <th className="p-3 text-left">{t(language, 'FinPnLDrilldownDetails')}</th>
                                            <th className="p-3 text-left">{t(language, 'FinPnLDrilldownBranch')}</th>
                                            <th className="p-3 text-left">{t(language, 'FinPnLDrilldownDate')}</th>
                                            <th className="p-3 text-right">{t(language, 'FinPnLDrilldownAmount').replace('{currency}', currency)}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {sorted.map((d, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 transition">
                                                <td className="p-3 align-top">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${
                                                        d.source === 'Invoice' ? 'bg-blue-50 text-blue-700' :
                                                        d.source === 'Payment' ? 'bg-emerald-50 text-emerald-700' :
                                                        d.source === 'Cashout' ? 'bg-amber-50 text-amber-700' :
                                                        d.source === 'Bank Fee' ? 'bg-red-50 text-red-700' :
                                                        d.source === 'Wastage' ? 'bg-purple-50 text-purple-700' :
                                                        d.source === 'Closing' ? 'bg-cyan-50 text-cyan-700' :
                                                        d.source === 'Adjustment' ? 'bg-pink-50 text-pink-700' :
                                                        'bg-slate-100 text-slate-600'
                                                    }`}>{
                                                        d.source === 'Invoice' ? t(language, 'FinInvTitle').replace(/s$/, '') :
                                                        d.source === 'Payment' ? t(language, 'FinPayTitle').replace(/s$/, '') :
                                                        d.source === 'Cashout' ? t(language, 'FinPnLDrilldownSourceCashout') :
                                                        d.source === 'Bank Fee' ? t(language, 'FinPnLDrilldownSourceBankFee') :
                                                        d.source === 'Wastage' ? t(language, 'FinPnLDrilldownSourceWastage') :
                                                        d.source === 'Closing' ? t(language, 'FinPnLDrilldownSourceClosing') :
                                                        d.source === 'Adjustment' ? t(language, 'FinPnLDrilldownSourceAdjustment') :
                                                        d.source
                                                    }</span>
                                                </td>
                                                <td className="p-3 align-top text-sm font-semibold text-slate-800 whitespace-nowrap">{d.supplier || <span className="text-slate-300 font-normal">—</span>}</td>
                                                <td className="p-3 align-top">
                                                    <div className="space-y-0.5">
                                                        {d.reference && <div className="text-xs text-slate-500 font-mono">{d.reference}</div>}
                                                        {d.description && <div className="text-xs text-slate-500">{d.description}</div>}
                                                        {!d.reference && !d.description && <div className="text-slate-400 italic text-xs">—</div>}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-xs text-slate-500 align-top whitespace-nowrap">{d.branches || '—'}</td>
                                                <td className="p-3 text-xs text-slate-500 tabular-nums align-top whitespace-nowrap">{d.date ? new Date(d.date).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-GB') : '—'}</td>
                                                <td className="p-3 text-right tabular-nums font-semibold text-slate-800 align-top">{fmt(d.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-slate-50">
                                <span className="text-sm font-semibold text-slate-600">{t(language, 'FinPnLDrilldownTotal')}</span>
                                <span className="text-lg font-black text-slate-900 tabular-nums">{currency} {fmt(total)}</span>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    )
}
