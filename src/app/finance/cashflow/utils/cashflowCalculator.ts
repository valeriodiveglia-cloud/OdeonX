import { t } from '@/lib/i18n'

export interface CashFlowTx {
    date: string
    amount: number
    type: 'Inflow' | 'Outflow'
    categoryLabel: string
    complianceCategory: string
    section: 'Operating' | 'Investing' | 'Financing' | 'Exclude'
    branchName?: string
    branchId?: string
    branchIds?: string[]
    branch_ids?: string[]
}

export interface CashFlowCalculatorInput {
    coa: any[]
    branches: any[]
    rawClosings: any[]
    rawCashouts: any[]
    rawCorpCards: any[]
    rawPOs: any[]
    rawCreditPay: any[]
    rawDepositPay: any[]
    rawAdjustments: any[]
    rawBalances: any[]
    rawAccounts: any[]
    channelMap: any[]
    cashoutMap: any[]
    language: string
    month: string // 'YYYY-MM'
    branchFilter: string // id or 'All'
    viewMode: 'management' | 'statutory'
}

const complianceTranslationKeys: Record<string, string> = {
    '1. Cash receipts from sales, services and other revenues': 'FinCFStat1',
    '2. Cash payments to suppliers of goods and services': 'FinCFStat2',
    '3. Cash payments to employees': 'FinCFStat3',
    '4. Interest paid': 'FinCFStat4',
    '5. Corporate income tax paid': 'FinCFStat5',
    '6. Other cash receipts from operating activities': 'FinCFStat6',
    '7. Other cash outlays for operating activities': 'FinCFStat7'
}

export function computeCashFlowData(input: CashFlowCalculatorInput) {
    const {
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
    } = input

    const getCoaInfo = (accountId: string | null, fallbackLabel: string, type: 'Inflow' | 'Outflow' = 'Outflow') => {
        let section: 'Operating' | 'Investing' | 'Financing' | 'Exclude' = 'Operating'
        let label = fallbackLabel
        let isCreditBalance = false
        let compCatEnglish = type === 'Inflow' ? '6. Other cash receipts from operating activities' : '2. Cash payments to suppliers of goods and services'

        const account = coa.find(a => a.id === accountId)
        if (account) {
            label = language === 'vi' ? (account.simplified_name || account.name) : account.name
            isCreditBalance = ['Liability', 'Equity', 'Operating Revenue', 'Financial Income', 'Other Income'].includes(account.account_type || '')
            section = (account.cashflow_section || 'Operating') as 'Operating' | 'Investing' | 'Financing' | 'Exclude'

            if (type === 'Outflow') {
                if (account.account_type === 'Payroll') compCatEnglish = '3. Cash payments to employees'
                else if (account.account_type === 'Financial Expenses' && account.name?.toLowerCase().includes('interest')) compCatEnglish = '4. Interest paid'
                else if (account.account_type === 'Tax Expenses' && account.name?.toLowerCase().includes('income tax')) compCatEnglish = '5. Corporate income tax paid'
                else if (account.account_type === 'Other Expenses' || account.account_type === 'Tax Expenses') compCatEnglish = '7. Other cash outlays for operating activities'
            } else {
                if (['Operating Revenue', 'Financial Income', 'Other Income'].includes(account.account_type || '')) compCatEnglish = '6. Other cash receipts from operating activities'
            }
        }

        const key = complianceTranslationKeys[compCatEnglish] || compCatEnglish
        const complianceCategory = t(language, key)

        return { section, label, isCreditBalance, complianceCategory }
    }

    const txs: CashFlowTx[] = []

    // 1. Cashier Closings (Inflows)
    for (const row of rawClosings) {
        const date = row.report_date

        // Third party
        let tpSum = 0
        if (row.third_party_amounts_json && Array.isArray(row.third_party_amounts_json)) {
            for (const tp of row.third_party_amounts_json) {
                const amt = Number(tp.amount || 0)
                if (amt > 0) {
                    tpSum += amt
                    const mapInfo = channelMap.find(m => m.channel_type === 'third_party' && m.channel_label === tp.label && m.is_active)
                    const tpFallback = language === 'vi' ? `Đối tác giao hàng — ${tp.label}` : `Third-Party — ${tp.label}`
                    const { section, label, complianceCategory } = getCoaInfo(mapInfo?.cashflow_coa_account_id, tpFallback, 'Inflow')
                    txs.push({ date, amount: amt, type: 'Inflow', categoryLabel: label, complianceCategory, section, branchName: row.branch_name })
                }
            }
        }

        // Deposits (Customer advances = Inflow)
        const deposits = Number(row.deposits_vnd || 0)
        if (deposits > 0) {
            txs.push({
                date, amount: deposits, type: 'Inflow',
                categoryLabel: t(language, 'FinCFDefaultCustomerDeposits'),
                complianceCategory: t(language, 'FinCFStat1'),
                section: 'Operating',
                branchName: row.branch_name
            })
        }

        // Repayments (Staff repaying advance = Inflow)
        const repayments = Number(row.repayments_cash_card_vnd || 0)
        if (repayments > 0) {
            txs.push({
                date, amount: repayments, type: 'Inflow',
                categoryLabel: t(language, 'FinCFDefaultStaffRepayments'),
                complianceCategory: t(language, 'FinCFStat6'),
                section: 'Operating',
                branchName: row.branch_name
            })
        }

        // Payouts (Daily cash outlays = Outflow)
        const payouts = Number(row.payouts_vnd || 0)
        if (payouts > 0) {
            txs.push({
                date, amount: payouts, type: 'Outflow',
                categoryLabel: t(language, 'FinCFDefaultDailyPayouts'),
                complianceCategory: t(language, 'FinCFStat7'),
                section: 'Operating',
                branchName: row.branch_name
            })
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
            const mposFallback = language === 'vi' ? 'Thanh toán thẻ (MPOS)' : 'Card Payments (MPOS)'
            const { section, label, complianceCategory } = getCoaInfo(mposMap?.cashflow_coa_account_id, mposFallback, 'Inflow')
            txs.push({ date, amount: mpos, type: 'Inflow', categoryLabel: label, complianceCategory, section, branchName: row.branch_name })
        }
        if (bt > 0) txs.push({ date, amount: bt, type: 'Inflow', categoryLabel: t(language, 'FinCFDefaultDigitalPayments'), complianceCategory: t(language, 'FinCFStat1'), section: 'Operating', branchName: row.branch_name })
    }

    // 2. Cashout (Outflows)
    for (const row of rawCashouts) {
        const amt = Number(row.amount || 0)
        if (amt <= 0) continue

        const mapping = cashoutMap.find(m => m.branch_name === row.branch && m.category_name === row.category)
        let accountIdToUse: string | null = null

        if (mapping && mapping.account_id) {
            accountIdToUse = mapping.account_id
        } else {
            const matchedAccount = coa.find(a =>
                a.name.toLowerCase() === (row.category || '').toLowerCase() ||
                (a.simplified_name && a.simplified_name.toLowerCase() === (row.category || '').toLowerCase())
            )
            if (matchedAccount) {
                accountIdToUse = matchedAccount.id
            }
        }

        const uncategorizedFallback = language === 'vi' ? 'Rút tiền chưa phân loại' : 'Uncategorized Cashout'
        const { section, label, complianceCategory } = getCoaInfo(accountIdToUse, row.category || uncategorizedFallback, 'Outflow')
        txs.push({ date: row.date, amount: amt, type: 'Outflow', categoryLabel: label, complianceCategory, section, branchName: row.branch })
    }

    // 3. Corporate Card (Outflows)
    for (const row of rawCorpCards) {
        const amt = Number(row.final_amount_vnd || 0)
        if (amt <= 0) continue
        const ccFallback = language === 'vi' ? 'Chi phí thẻ doanh nghiệp' : 'Corporate Card Expense'
        const { section, label, complianceCategory } = getCoaInfo(row.account_id, ccFallback, 'Outflow')
        txs.push({ date: row.expense_date, amount: amt, type: 'Outflow', categoryLabel: label, complianceCategory, section, branchIds: row.branch_ids })
    }

    // 4. Payment Orders (Outflows)
    for (const row of rawPOs) {
        const amt = Number(row.amount || 0)
        if (amt <= 0) continue
        const poFallback = language === 'vi' ? 'Thanh toán nhà cung cấp' : 'Supplier Payment'
        const { section, label, complianceCategory } = getCoaInfo(row.account_id, poFallback, 'Outflow')
        const poParent = Array.isArray(row.fin_payment_orders) ? row.fin_payment_orders[0] : row.fin_payment_orders
        txs.push({ date: poParent?.order_date, amount: amt, type: 'Outflow', categoryLabel: label, complianceCategory, section, branchIds: row.branch_ids })
    }

    // 5. Credit Payments (Inflows)
    for (const row of rawCreditPay) {
        const amt = Number(row.amount || 0)
        if (amt > 0) txs.push({ date: row.date.split('T')[0], amount: amt, type: 'Inflow', categoryLabel: t(language, 'FinCFDefaultCollections'), complianceCategory: t(language, 'FinCFStat6'), section: 'Operating', branchName: row.credits?.branch })
    }

    // 6. Deposit Payments (Inflows)
    for (const row of rawDepositPay) {
        const amt = Number(row.amount || 0)
        if (amt > 0) txs.push({ date: row.date.split('T')[0], amount: amt, type: 'Inflow', categoryLabel: t(language, 'FinCFDefaultCustomerDepositsInflow'), complianceCategory: t(language, 'FinCFStat1'), section: 'Operating', branchName: row.deposits?.branch })
    }

    // 7. Monthly Adjustments (Outflows/Inflows)
    for (const row of rawAdjustments) {
        if (row.custom_adjustments && Array.isArray(row.custom_adjustments)) {
            const [y, m] = row.month_key.split('-')
            const adjDate = `${y}-${m}-28`

            for (const adj of row.custom_adjustments) {
                const amt = Number(adj.amount || 0)
                if (amt <= 0) continue

                const inCF = adj.include_in_cashflow ?? (adj.method !== 'extract')
                if (!inCF) continue

                const adjFallback = language === 'vi' ? 'Điều chỉnh hàng tháng' : 'Monthly Adjustment'
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

    // Normalize branch references for each transaction to use branch UUID array
    const normalizedTxs = txs.map(tx => {
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

    // Filter transactions based on branch selection
    const filteredTxs = branchFilter === 'All'
        ? normalizedTxs
        : normalizedTxs.filter(tx => tx.branch_ids && tx.branch_ids.includes(branchFilter))

    // Filter bank accounts by branch selection
    const filteredAccounts = branchFilter === 'All'
        ? rawAccounts
        : rawAccounts.filter(a => a.branch_id === branchFilter)

    // Current month summary & categories details
    let operatingIn = 0, operatingOut = 0
    let investingIn = 0, investingOut = 0
    let financingIn = 0, financingOut = 0

    const categories: Record<string, { section: string; category: string; inflow: number; outflow: number }> = {}
    const currentMonthPrefix = month

    for (const tx of filteredTxs) {
        if (!tx.date || !tx.date.startsWith(currentMonthPrefix)) continue
        if (tx.section === 'Exclude') continue

        const amt = tx.amount
        const isOut = tx.type === 'Outflow'

        if (tx.section === 'Operating') {
            if (isOut) operatingOut += amt; else operatingIn += amt
        } else if (tx.section === 'Investing') {
            if (isOut) investingOut += amt; else investingIn += amt
        } else if (tx.section === 'Financing') {
            if (isOut) financingOut += amt; else financingIn += amt
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
    const now = new Date()
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const breakdown: Record<string, { name: string; opening: number; closing: number; type: string }> = {}

    filteredAccounts.forEach(a => {
        breakdown[a.id] = { name: a.account_name, opening: 0, closing: 0, type: a.account_type }
    })

    // Opening Balance calculation
    const prevBalances = rawBalances.filter(b => b.month_key === prevMonthKey)
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

    // Closing Balance calculation
    if (month === currentMonthKey) {
        closingBalance = filteredAccounts.reduce((s, a) => s + Number(a.current_balance || 0), 0)
        filteredAccounts.forEach(a => {
            breakdown[a.id].closing = Number(a.current_balance || 0)
        })
    } else {
        const closingBalances = rawBalances.filter(b => b.month_key === month)
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
        drilldown: sectionedCategories,
        normalizedTxs,
        filteredTxs,
        filteredAccounts
    }
}
