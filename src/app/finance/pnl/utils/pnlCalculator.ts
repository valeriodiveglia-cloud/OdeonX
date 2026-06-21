import { t } from '@/lib/i18n';
import type { FinChartOfAccount } from '@/types/finance';

export interface PnLLine {
    code: string;
    name: string;
    amount: number;
    accountId?: string;
    isMacro?: boolean;
    isGroup?: boolean;
    isResult?: boolean;
    isItem?: boolean;
    parentCode?: string;
    isDeduction?: boolean;
    inventoryDetails?: { opening: number; purchases: number; closing: number; staffWastage?: number };
    grossUpAmount?: number;
}

export interface PnLInputData {
    coa: FinChartOfAccount[];
    expensesByAccount: Record<string, number>;
    inventoryByAccount: Record<string, { opening: number; closing: number }>;
    totalRevenue: number;
    customAdjustments: any[];
    taxSettings: any[];
    staffWastageByAccount: Record<string, number>;
    language: string;
    grossUpAccounts: Set<string>;
}

export const pnlStructure = [
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
];

export function computePnLData(input: PnLInputData): {
    lines: PnLLine[];
    netProfit: number;
    revenue: number;
    netRevenue: number;
} {
    const {
        coa,
        expensesByAccount,
        inventoryByAccount,
        totalRevenue,
        customAdjustments,
        taxSettings,
        staffWastageByAccount,
        language,
        grossUpAccounts
    } = input;

    const lines: PnLLine[] = [];
    const groupTotals: Record<string, number> = {};

    // Helper to evaluate formulas
    const getVal = (code: string) => groupTotals[code] || 0;
    const calcFormula = (formula: string) => {
        if (!formula) return 0;
        if (formula === 'tax') return Math.max(0, getVal('50') * 0.20);
        const terms = formula.match(/[+-]?\d+/g) || [];
        return terms.reduce((sum, t) => sum + getVal(t.replace(/[+-]/, '') || t) * (t.startsWith('-') ? -1 : 1), 0);
    };

    const localExpensesByAccount = { ...expensesByAccount };

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
        lines.push({ code: '', name: t(language, macroKey), amount: 0, isMacro: true });

        macroGroup.groups.forEach(g => {
            const groupKey = groupTranslationKeys[g.name] || g.name;
            if ('isFormula' in g && g.isFormula) {
                const amt = calcFormula(g.formula);
                groupTotals[g.code] = amt;
                lines.push({ code: g.code, name: t(language, groupKey), amount: amt, isResult: true });

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
                const children: PnLLine[] = [];
                let groupTotal = 0;

                if (g.code === '01') {
                    const productsRevenue = Math.max(0, totalRevenue);
                    const revAcc = coa.find(a => a.code === '5112');
                    children.push({ code: '5112', name: t(language, 'FinPnLSubProductSales'), amount: productsRevenue, isItem: true, parentCode: g.code, accountId: revAcc?.id });
                    groupTotal += productsRevenue;

                    // Find how much was extracted in total from 5112 to ANY destination globally
                    let globalExtractedFrom5112 = 0;
                    for (const adj of customAdjustments) {
                        if (adj.method === 'extract') {
                            globalExtractedFrom5112 += adj.amount;
                        }
                    }

                    // Also include any accounts mapped to 'Operating Revenue'
                    const relevantAccounts = coa.filter(a => g.types.includes(a.account_type) && !a.is_group && a.code !== '5112');
                    for (const acc of relevantAccounts) {
                        let amt = localExpensesByAccount[acc.id] || 0;
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

                        children.push({ code: acc.code, name: displayName, amount: displayAmt, isItem: true, parentCode: g.code, accountId: acc.id });
                        groupTotal += amt;
                    }

                    // Process legacy macro-group adjustments
                    for (const adj of customAdjustments) {
                        if (adj.target_group === g.code) {
                            if (adj.method === 'add') {
                                groupTotal += adj.amount;
                                children.push({ code: '-', name: adj.name, amount: Math.abs(adj.amount), isItem: true, parentCode: g.code });
                            } else if (adj.method === 'subtract') {
                                groupTotal -= adj.amount;
                                children.push({ code: '-', name: adj.name, amount: Math.abs(adj.amount), isItem: true, parentCode: g.code });
                            } else if (adj.method === 'extract') {
                                // Extract: custom line FROM 5112 TO this line
                                children.push({ code: '-', name: adj.name, amount: Math.abs(adj.amount), isItem: true, parentCode: g.code });
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
                                    children.push({ code: '-', name: adj.name, amount: adj.amount, isItem: true, parentCode: g.code });
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
                    const relevantAccounts = coa.filter(a => g.types.includes(a.account_type) && !a.is_group);
                    for (const acc of relevantAccounts) {
                        let purchases = localExpensesByAccount[acc.id] || 0;
                        const inv = inventoryByAccount[acc.id] || { opening: 0, closing: 0 };
                        const staffWastage = staffWastageByAccount[acc.id] || 0;

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
                        });
                        groupTotal += amt;
                    }

                    // Process legacy macro-group adjustments
                    for (const adj of customAdjustments) {
                        if (adj.target_group === g.code) {
                            if (adj.method === 'add') {
                                groupTotal += adj.amount;
                                children.push({ code: '-', name: adj.name, amount: adj.amount, isItem: true, parentCode: g.code });
                            } else if (adj.method === 'subtract') {
                                groupTotal -= adj.amount;
                                children.push({ code: '-', name: adj.name, amount: -adj.amount, isItem: true, parentCode: g.code });
                            } else if (adj.method === 'extract') {
                                groupTotal += adj.amount;
                                children.push({ code: '-', name: adj.name, amount: adj.amount, isItem: true, parentCode: g.code });
                            }
                        }
                    }

                    // Fallback unassigned logic
                    if (g.code === '11') {
                        if (localExpensesByAccount['unassigned_invoice']) {
                            children.push({ code: '-', name: t(language, 'FinPnLUncategorizedInvoice'), amount: localExpensesByAccount['unassigned_invoice'], isItem: true, parentCode: g.code });
                            groupTotal += localExpensesByAccount['unassigned_invoice'];
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
                            });
                            groupTotal -= unassignedStaffWastage;
                        }
                    }
                    if (g.code === '32') { // Financial expenses
                        if (localExpensesByAccount['unassigned_bank_fee']) {
                            children.push({ code: '-', name: t(language, 'FinPnLBankFeesUncategorized'), amount: localExpensesByAccount['unassigned_bank_fee'], isItem: true, parentCode: g.code });
                            groupTotal += localExpensesByAccount['unassigned_bank_fee'];
                        }
                    }
                    if (g.code === '34') { // Put uncategorized items in Other expenses
                        if (localExpensesByAccount['cashout_uncategorized']) {
                            children.push({ code: '-', name: t(language, 'FinPnLUncategorizedCashout'), amount: localExpensesByAccount['cashout_uncategorized'], isItem: true, parentCode: g.code });
                            groupTotal += localExpensesByAccount['cashout_uncategorized'];
                        }
                        if (localExpensesByAccount['unassigned_card']) {
                            children.push({ code: '-', name: t(language, 'FinPnLUncategorizedCardExpense'), amount: localExpensesByAccount['unassigned_card'], isItem: true, parentCode: g.code });
                            groupTotal += localExpensesByAccount['unassigned_card'];
                        }
                        if (localExpensesByAccount['unassigned_po']) {
                            children.push({ code: '-', name: t(language, 'FinPnLUncategorizedPO'), amount: localExpensesByAccount['unassigned_po'], isItem: true, parentCode: g.code });
                            groupTotal += localExpensesByAccount['unassigned_po'];
                        }
                    }
                }

                if (g.code === '02') {
                    children.forEach(c => c.amount = Math.abs(c.amount));
                    groupTotal = Math.abs(groupTotal);
                }

                groupTotals[g.code] = groupTotal;
                lines.push({ code: g.code, name: t(language, groupKey), amount: groupTotal, isGroup: true });
                lines.push(...children);

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
                        if (revItemLine) {
                            revItemLine.amount = (revItemLine.amount || 0) + discountGrossUp;
                            revItemLine.grossUpAmount = discountGrossUp;
                        }
                    }
                }
            }
        });
    });

    return {
        lines,
        netProfit: groupTotals['60'] || 0,
        revenue: groupTotals['01'] || 0,
        netRevenue: groupTotals['10'] || 0
    };
}
