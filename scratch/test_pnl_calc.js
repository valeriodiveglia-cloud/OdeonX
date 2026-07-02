const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hgcxnkkvpnjhkpchgbuz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnY3hua2t2cG5qaGtwY2hnYnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzODM1NzgsImV4cCI6MjA2OTk1OTU3OH0.esRUchR0-URjQtlypymPhQxlPBxrPN7alzqxOoHbZuc';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const month = '2026-06';
const branchFilter = 'All';
const language = 'it'; // Or 'en'
const currency = 'VND';

function fmt(n) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }

const pnlStructure = [
    {
        macro: '1. REVENUE', groups: [
            { code: '01', name: 'Operating Revenue', types: ['Operating Revenue'] },
            { code: '02', name: 'Revenue deductions', types: ['Revenue Deduction'] },
            { code: '10', name: 'Net revenue', isFormula: true, formula: '01-02' }
        ]
    }
];

async function run() {
    const [yr, mo] = month.split('-').map(Number)
    const startDate = `${yr}-${String(mo).padStart(2, '0')}-01`
    const endDate = mo === 12 ? `${yr + 1}-01-01` : `${yr}-${String(mo + 1).padStart(2, '0')}-01`
    const prevD = new Date(yr, mo - 2, 1)
    const prevMonth = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`

    console.log(`Fetching data for ${month}...`);

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
    ]);

    const coaData = coaRes.data || [];
    const customAdjustments = adjRes.data || [];
    const taxSettings = taxSettingsRes.data || [];
    const brData = brRes.data || [];

    console.log(`Loaded ${coaData.length} accounts, ${brData.length} branches, ${revRes.data?.length} cashier closings.`);
    console.log(`Loaded custom adjustments:`, JSON.stringify(customAdjustments, null, 2));
    console.log(`Loaded tax settings:`, JSON.stringify(taxSettings, null, 2));

    const selectedBranchName = branchFilter !== 'All' ? brData.find(b => b.id === branchFilter)?.name : null;

    const byAccount = {};
    const details = {};

    const branchNameToId = {};
    const branchIdToName = {};
    for (const b of brData) {
        branchNameToId[b.name] = b.id;
        branchIdToName[b.id] = b.name;
    }

    const revenuePerBranchId = {};
    for (const b of brData) revenuePerBranchId[b.id] = 0;

    let revenueAcc = 0;
    const revAcc = coaData.find(a => a.code === '5112');
    const revAccId = revAcc?.id || '5112';

    if (revRes.data) {
        for (const r of revRes.data) {
            if (!selectedBranchName || r.branch_name === selectedBranchName) {
                const amount = Number(r.revenue_vnd || 0);
                revenueAcc += amount;

                if (amount !== 0) {
                    if (!details[revAccId]) details[revAccId] = [];
                    details[revAccId].push({
                        source: 'Closing',
                        amount,
                        branches: r.branch_name
                    });
                }
            }
            const bId = branchNameToId[r.branch_name];
            if (bId) {
                revenuePerBranchId[bId] += Number(r.revenue_vnd || 0);
            }
        }
    }
    const totalRevenue = revenueAcc;
    console.log("Total Revenue (Gross):", totalRevenue);

    const allocSettings = allocRes.data || { global_strategy: 'equal', exceptions: [] };
    const getAllocationFactor = (account_id, branch_ids, currentFilter) => {
        if (currentFilter === 'All') return 1;
        if (!branch_ids || branch_ids.length === 0) return 1;
        
        let strategy = allocSettings.global_strategy;
        if (account_id && allocSettings.exceptions) {
            const exc = allocSettings.exceptions.find(e => e.account_id === account_id);
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

    const grossUpAccounts = new Set(allocRes.data?.gross_up_accounts || []);
    console.log("Gross up accounts:", Array.from(grossUpAccounts));

    const allBranchIds = brData.map(b => b.id);
    let finalAdjustments = [];
    if (adjRes.data) {
        for (const row of adjRes.data) {
            if (branchFilter !== 'All' && row.branch_id !== branchFilter && row.branch_id !== 'All') continue;
            if (row.custom_adjustments && Array.isArray(row.custom_adjustments)) {
                for (const adj of row.custom_adjustments) {
                    let allocated = adj.allocated_branches;
                    if (!allocated) {
                        allocated = row.branch_id === 'All' ? allBranchIds : [row.branch_id];
                    }
                    if (branchFilter !== 'All' && !allocated.includes(branchFilter)) continue;

                    let amount = Number(adj.amount || 0);
                    const factor = getAllocationFactor(null, allocated, branchFilter);
                    amount = amount * factor;
                    finalAdjustments.push({ ...adj, amount });
                }
            }
        }
    }

    console.log("Final Adjustments processed:", finalAdjustments);

    const localExpensesByAccount = {};

    // 1. Dynamic Taxes for Revenue Deductions
    const grossRev = Math.max(0, totalRevenue);
    const revenueTaxes = taxSettings.filter(t => {
        const acc = coaData.find(a => a.id === t.account_id);
        return acc?.account_type === 'Revenue Deduction';
    });
    revenueTaxes.forEach(t => {
        const taxAmount = grossRev - (grossRev / (1 + Number(t.percentage) / 100));
        localExpensesByAccount[t.account_id] = (localExpensesByAccount[t.account_id] || 0) + taxAmount;
    });

    console.log("Local expenses after dynamic taxes:", localExpensesByAccount);

    const groupTotals = {};
    const lines = [];

    const getVal = (code) => groupTotals[code] || 0;
    const calcFormula = (formula) => {
        if (!formula) return 0;
        if (formula === 'tax') return Math.max(0, getVal('50') * 0.20);
        const terms = formula.match(/[+-]?\d+/g) || [];
        return terms.reduce((sum, t) => sum + getVal(t.replace(/[+-]/, '') || t) * (t.startsWith('-') ? -1 : 1), 0);
    }

    pnlStructure.forEach(macroGroup => {
        lines.push({ code: '', name: macroGroup.macro, amount: 0, isMacro: true });
        macroGroup.groups.forEach(g => {
            if (g.isFormula) {
                const amt = calcFormula(g.formula);
                groupTotals[g.code] = amt;
                lines.push({ code: g.code, name: g.name, amount: amt, isResult: true });
            } else if (g.types) {
                const children = [];
                let groupTotal = 0;

                if (g.code === '01') {
                    const productsRevenue = Math.max(0, totalRevenue);
                    const revAcc = coaData.find(a => a.code === '5112');
                    children.push({ code: '5112', name: 'Product Sales', amount: productsRevenue, isItem: true, parentCode: g.code, accountId: revAcc?.id });
                    groupTotal += productsRevenue;

                    let globalExtractedFrom5112 = 0;
                    for (const adj of finalAdjustments) {
                        if (adj.method === 'extract') {
                            globalExtractedFrom5112 += adj.amount;
                        }
                    }

                    const relevantAccounts = coaData.filter(a => g.types.includes(a.account_type) && !a.is_group && a.code !== '5112');
                    for (const acc of relevantAccounts) {
                        let amt = localExpensesByAccount[acc.id] || 0;
                        let isAdjusted = false;
                        for (const adj of finalAdjustments) {
                            if (adj.target_group === acc.id) {
                                if (adj.method === 'add') amt += adj.amount;
                                else if (adj.method === 'subtract') amt -= adj.amount;
                                else if (adj.method === 'extract') amt += adj.amount;
                                isAdjusted = true;
                            }
                        }
                        children.push({ code: acc.code, name: acc.name, amount: amt, isItem: true, parentCode: g.code, accountId: acc.id });
                        groupTotal += amt;
                    }

                    for (const adj of finalAdjustments) {
                        if (adj.target_group === g.code) {
                            if (adj.method === 'add') {
                                groupTotal += adj.amount;
                                children.push({ code: '-', name: adj.name, amount: adj.amount, isItem: true, parentCode: g.code });
                            } else if (adj.method === 'subtract') {
                                groupTotal -= adj.amount;
                                children.push({ code: '-', name: adj.name, amount: adj.amount, isItem: true, parentCode: g.code });
                            } else if (adj.method === 'extract') {
                                children.push({ code: '-', name: adj.name, amount: adj.amount, isItem: true, parentCode: g.code });
                            }
                        }
                    }

                    if (revAcc) {
                        let revAccTrueAmount = children.find(c => c.code === '5112')?.amount || 0;
                        revAccTrueAmount -= globalExtractedFrom5112;
                        groupTotal -= globalExtractedFrom5112;

                        for (const adj of finalAdjustments) {
                            if (adj.target_group === revAcc.id) {
                                if (adj.method === 'add') {
                                    revAccTrueAmount += adj.amount;
                                    groupTotal += adj.amount;
                                } else if (adj.method === 'subtract') {
                                    revAccTrueAmount -= adj.amount;
                                    groupTotal -= adj.amount;
                                } else if (adj.method === 'extract') {
                                    revAccTrueAmount -= adj.amount;
                                    children.push({ code: '-', name: adj.name, amount: adj.amount, isItem: true, parentCode: g.code });
                                }
                            }
                        }
                        const existing = children.find(c => c.code === '5112');
                        if (existing) {
                            existing.amount = Math.max(0, revAccTrueAmount);
                        }
                    }
                } else {
                    const relevantAccounts = coaData.filter(a => g.types.includes(a.account_type) && !a.is_group);
                    for (const acc of relevantAccounts) {
                        let amt = localExpensesByAccount[acc.id] || 0;
                        for (const adj of finalAdjustments) {
                            if (adj.target_group === acc.id) {
                                if (adj.method === 'add') amt += adj.amount;
                                else if (adj.method === 'subtract') amt -= adj.amount;
                                else if (adj.method === 'extract') amt += adj.amount;
                            }
                        }
                        children.push({ code: acc.code, name: acc.name, amount: amt, isItem: true, parentCode: g.code, accountId: acc.id });
                        groupTotal += amt;
                    }
                    for (const adj of finalAdjustments) {
                        if (adj.target_group === g.code) {
                            if (adj.method === 'add') {
                                groupTotal += adj.amount;
                                children.push({ code: '-', name: adj.name, amount: adj.amount, isItem: true, parentCode: g.code });
                            } else if (adj.method === 'subtract') {
                                groupTotal -= adj.amount;
                                children.push({ code: '-', name: adj.name, amount: adj.amount, isItem: true, parentCode: g.code });
                            } else if (adj.method === 'extract') {
                                groupTotal += adj.amount;
                                children.push({ code: '-', name: adj.name, amount: adj.amount, isItem: true, parentCode: g.code });
                            }
                        }
                    }
                }

                if (g.code === '02') {
                    children.forEach(c => c.amount = Math.abs(c.amount));
                    groupTotal = Math.abs(groupTotal);
                }

                groupTotals[g.code] = groupTotal;
                lines.push({ code: g.code, name: g.name, amount: groupTotal, isGroup: true });
                lines.push(...children);

                if (g.code === '02') {
                    let discountGrossUp = 0;
                    for (const adj of finalAdjustments) {
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
        });
    });

    console.log("\nResults computed:");
    lines.forEach(l => {
        if (l.isMacro) console.log(`\n=== ${l.name} ===`);
        else if (l.isGroup) console.log(`Group [${l.code}] ${l.name}: ${fmt(l.amount)}`);
        else if (l.isResult) console.log(`Result [${l.code}] ${l.name}: ${fmt(l.amount)}`);
        else if (l.isItem) console.log(`  Item [${l.code}] ${l.name}: ${fmt(l.amount)}`);
    });
}

run().catch(console.error);
