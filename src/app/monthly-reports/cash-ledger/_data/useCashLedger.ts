import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

export type CashLedgerRow = {
    date: string
    branch: string
    opening_float: number
    counted_cash: number
    cash_to_take: number
    deposited: boolean
    deposit_id?: string
    deposit_amount?: number
    deposit_date?: string | null
    batch_id?: string | null
}

const DEFAULT_FLOAT = 3_000_000

// Helpers for Cash to Take calculation (duplicated from fetchers.ts for now, could be shared)
const DENOMS = [
    { key: 'd500k', face: 500_000 },
    { key: 'd200k', face: 200_000 },
    { key: 'd100k', face: 100_000 },
    { key: 'd50k', face: 50_000 },
    { key: 'd20k', face: 20_000 },
    { key: 'd10k', face: 10_000 },
    { key: 'd5k', face: 5_000 },
    { key: 'd2k', face: 2_000 },
    { key: 'd1k', face: 1_000 },
] as const

type DenomKey = typeof DENOMS[number]['key']

function cashFromJson(raw: any): number {
    if (!raw) return 0
    let obj: Partial<Record<DenomKey, number>> | null = null

    if (typeof raw === 'string') {
        try {
            obj = JSON.parse(raw)
        } catch {
            obj = null
        }
    } else if (typeof raw === 'object') {
        obj = raw as any
    }

    if (!obj) return 0

    let sum = 0
    for (const d of DENOMS) {
        const pieces = Number((obj as any)[d.key] || 0)
        if (!Number.isFinite(pieces)) continue
        sum += pieces * d.face
    }
    return Math.round(sum)
}

export function useCashLedger(params: { year: number; month: number; branchName: string | null }) {
    const [rows, setRows] = useState<CashLedgerRow[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [totalPending, setTotalPending] = useState<number>(0)

    const refresh = useCallback(async (silent = false) => {
        if (!silent) setLoading(true)
        setError(null)

        try {
            const start = new Date(params.year, params.month, 1)
            const end = new Date(params.year, params.month + 1, 1)
            const p = (n: number) => String(n).padStart(2, '0')
            const startISO = `${start.getFullYear()}-${p(start.getMonth() + 1)}-${p(start.getDate())}`
            const endISO = `${end.getFullYear()}-${p(end.getMonth() + 1)}-${p(end.getDate())}`

            // 1. Fetch Cashier Closings (Current Month)
            let qClosings = supabase
                .from('cashier_closings')
                .select('report_date, opening_float_vnd, cash_json, float_plan_json, branch_name')
                .gte('report_date', startISO)
                .lt('report_date', endISO)

            // 2. Fetch Cash Ledger Deposits (Current Month)
            let qDeposits = supabase
                .from('cash_ledger_deposits')
                .select('id, date, amount, branch, deposit_date, batch_id')
                .gte('date', startISO)
                .lt('date', endISO)

            // 3. Fetch ALL time stats for Total Pending
            let qAllClosings = supabase
                .from('cashier_closings')
                .select('report_date, branch_name, opening_float_vnd, cash_json, float_plan_json')

            let qAllDeposits = supabase
                .from('cash_ledger_deposits')
                .select('date, branch, amount')

            if (params.branchName) {
                qClosings = qClosings.eq('branch_name', params.branchName)
                qDeposits = qDeposits.eq('branch', params.branchName)
                qAllClosings = qAllClosings.eq('branch_name', params.branchName)
                qAllDeposits = qAllDeposits.eq('branch', params.branchName)
            }

            const [resClosings, resDeposits, resAllClosings, resAllDeposits] = await Promise.all([
                qClosings,
                qDeposits,
                qAllClosings,
                qAllDeposits
            ])

            if (resClosings.error) throw resClosings.error
            if (resDeposits.error) throw resDeposits.error
            if (resAllClosings.error) throw resAllClosings.error
            if (resAllDeposits.error) throw resAllDeposits.error

            const deposits = resDeposits.data || []

            // Map deposits by "date|branch" -> list of deposits
            const depositsMap = new Map<string, typeof deposits>()
            deposits.forEach((t: any) => {
                const key = `${t.date}|${t.branch}`
                const list = depositsMap.get(key) || []
                list.push(t)
                depositsMap.set(key, list)
            })

            const newRows: CashLedgerRow[] = (resClosings.data || []).map((r: any) => {
                const date = String(r.report_date).split('T')[0]
                const branch = r.branch_name
                const floatTarget = Number(r.opening_float_vnd) || DEFAULT_FLOAT
                const countedCash = cashFromJson(r.cash_json)
                const planTotal = cashFromJson(r.float_plan_json)

                const cashToTake = planTotal > 0
                    ? planTotal
                    : Math.max(0, countedCash - floatTarget)

                // Check if deposited
                const key = `${date}|${branch}`
                const relatedDeposits = depositsMap.get(key) || []

                const totalDeposited = relatedDeposits.reduce((sum: number, t: any) => sum + (t.amount || 0), 0)
                const isDeposited = totalDeposited >= cashToTake && cashToTake > 0
                const depositDate = relatedDeposits[0]?.deposit_date || null

                return {
                    date,
                    branch,
                    opening_float: floatTarget,
                    counted_cash: countedCash,
                    cash_to_take: cashToTake,
                    deposited: isDeposited,
                    deposit_id: relatedDeposits[0]?.id,
                    deposit_amount: totalDeposited,
                    deposit_date: depositDate,
                    batch_id: relatedDeposits[0]?.batch_id
                }
            })

            // Sort by date desc
            newRows.sort((a, b) => b.date.localeCompare(a.date))

            setRows(newRows)

            // Calculate Total Pending (All Time) - Row based
            const allClosings = resAllClosings.data || []
            const allDeposits = resAllDeposits.data || []

            // Map all deposits
            const allDepositsMap = new Map<string, any[]>()
            allDeposits.forEach((t: any) => {
                const key = `${t.date}|${t.branch}`
                const list = allDepositsMap.get(key) || []
                list.push(t)
                allDepositsMap.set(key, list)
            })

            let pendingSum = 0
            for (const r of allClosings) {
                const date = String(r.report_date).split('T')[0]
                const branch = r.branch_name
                const floatTarget = Number(r.opening_float_vnd) || DEFAULT_FLOAT
                const countedCash = cashFromJson(r.cash_json)
                const planTotal = cashFromJson(r.float_plan_json)

                const cashToTake = planTotal > 0
                    ? planTotal
                    : Math.max(0, countedCash - floatTarget)

                if (cashToTake > 0) {
                    const key = `${date}|${branch}`
                    const related = allDepositsMap.get(key) || []
                    const deposited = related.reduce((sum: number, t: any) => sum + (t.amount || 0), 0)

                    if (deposited < cashToTake) {
                        pendingSum += cashToTake
                    }
                }
            }
            setTotalPending(pendingSum)

        } catch (err: any) {
            console.error('Error fetching cash ledger:', err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [params.year, params.month, params.branchName])

    useEffect(() => {
        refresh()
    }, [refresh])

    const depositBulk = async (rows: CashLedgerRow[], accountId: string, depositDate?: string) => {
        if (rows.length === 0) return

        try {
            const finalDate = depositDate || new Date().toISOString().split('T')[0];
            const batchId = crypto.randomUUID();
            
            // Assume all rows belong to the same branch for simplicity
            const branchName = rows[0].branch;

            // 1. Find Branch ID
            const { data: branchData } = await supabase.from('provider_branches').select('id').eq('name', branchName).single();
            if (!branchData) throw new Error("Branch non trovato");

            // 2. Find the selected Bank Account
            const { data: accountData } = await supabase.from('fin_bank_accounts')
                .select('id, current_balance')
                .eq('id', accountId)
                .single();
            if (!accountData) throw new Error("Conto bancario non trovato");

            let totalAmount = 0;
            const insertPayload = rows.map(r => {
                totalAmount += r.cash_to_take;
                return {
                    date: r.date,
                    branch: r.branch,
                    amount: r.cash_to_take,
                    notes: 'Bulk deposit from Cash Ledger',
                    deposit_date: finalDate,
                    batch_id: batchId
                };
            });

            // 3. Create Deposits in cash_ledger_deposits
            const { error } = await supabase.from('cash_ledger_deposits').insert(insertPayload);
            if (error) throw error;

            // Date Range Description
            const dates = rows.map(r => r.date).sort();
            const minDate = dates[0];
            const maxDate = dates[dates.length - 1];
            const desc = minDate === maxDate ? `Cash Revenue for ${minDate}` : `Cash Revenue from ${minDate} to ${maxDate}`;

            // 4. Create Bank Transaction Inflow (To selected bank account)
            const { error: txError } = await supabase.from('fin_bank_transactions').insert({
                account_id: accountData.id,
                type: 'Inflow',
                category: 'Cash Deposit',
                description: desc,
                amount: totalAmount,
                reference_id: batchId,
                reference_type: 'cash_ledger_batch',
                branch_id: branchData.id,
                transaction_date: finalDate
            });
            if (txError) throw txError;

            // 5. Update Bank Account Balance
            const { error: balError } = await supabase.from('fin_bank_accounts')
                .update({ current_balance: Number(accountData.current_balance) + totalAmount })
                .eq('id', accountData.id);
            if (balError) throw balError;

            // --- NEW: Cash on Hand Outflow Logic ---
            // Check Go-Live Date
            const { data: settingsData } = await supabase.from('app_settings').select('finance_start_date').limit(1).single();
            const goLiveStr = settingsData?.finance_start_date;
            
            if (goLiveStr && finalDate >= goLiveStr) {
                // Find Cash on Hand account
                const { data: cashAcc } = await supabase.from('fin_bank_accounts')
                    .select('id, current_balance')
                    .eq('account_type', 'Cash')
                    .like('account_name', `Cash on Hand - ${branchName}%`)
                    .limit(1).single();
                
                if (cashAcc) {
                    // Create Outflow transaction
                    const { error: outTxError } = await supabase.from('fin_bank_transactions').insert({
                        account_id: cashAcc.id,
                        type: 'Outflow',
                        category: 'Cash Deposit',
                        description: `Bank Deposit: ${desc}`,
                        amount: totalAmount,
                        reference_id: batchId,
                        reference_type: 'cash_ledger_batch_outflow',
                        branch_id: branchData.id,
                        transaction_date: finalDate
                    });
                    if (outTxError) throw outTxError;

                    // Update Cash on Hand balance
                    const { error: cashBalError } = await supabase.from('fin_bank_accounts')
                        .update({ current_balance: Number(cashAcc.current_balance) - totalAmount })
                        .eq('id', cashAcc.id);
                    if (cashBalError) throw cashBalError;
                }
            }
            // ---------------------------------------

            await refresh(true)
        } catch (err: any) {
            console.error('Error in bulk deposit:', err)
            alert('Failed to deposit: ' + err.message)
        }
    }

    const deposit = async (row: CashLedgerRow, accountId: string, depositDate?: string) => {
        return depositBulk([row], accountId, depositDate);
    }

    const undeposit = async (row: CashLedgerRow) => {
        if (!row.deposited) return

        try {
            if (row.batch_id) {
                // Bulk Undo
                const { data: txData } = await supabase.from('fin_bank_transactions')
                    .select('id, account_id, amount')
                    .eq('reference_id', row.batch_id)
                    .eq('reference_type', 'cash_ledger_batch')
                    .single();
                
                if (txData) {
                    const { data: accData } = await supabase.from('fin_bank_accounts')
                        .select('current_balance').eq('id', txData.account_id).single();
                    if (accData) {
                        await supabase.from('fin_bank_accounts')
                            .update({ current_balance: Number(accData.current_balance) - Number(txData.amount) })
                            .eq('id', txData.account_id);
                    }
                    await supabase.from('fin_bank_transactions').delete().eq('id', txData.id);
                }

                // --- NEW: Revert Cash on Hand Outflow ---
                const { data: outTxData } = await supabase.from('fin_bank_transactions')
                    .select('id, account_id, amount')
                    .eq('reference_id', row.batch_id)
                    .eq('reference_type', 'cash_ledger_batch_outflow')
                    .single();
                
                if (outTxData) {
                    const { data: accData } = await supabase.from('fin_bank_accounts')
                        .select('current_balance').eq('id', outTxData.account_id).single();
                    if (accData) {
                        await supabase.from('fin_bank_accounts')
                            .update({ current_balance: Number(accData.current_balance) + Number(outTxData.amount) })
                            .eq('id', outTxData.account_id);
                    }
                    await supabase.from('fin_bank_transactions').delete().eq('id', outTxData.id);
                }
                // ----------------------------------------

                const { error } = await supabase.from('cash_ledger_deposits').delete().eq('batch_id', row.batch_id)
                if (error) throw error

            } else if (row.deposit_id) {
                // Single Undo (Legacy)
                const { data: txData } = await supabase.from('fin_bank_transactions')
                    .select('id, account_id, amount')
                    .eq('reference_id', row.deposit_id)
                    .eq('reference_type', 'cash_ledger_deposit')
                    .single();
                
                if (txData) {
                    const { data: accData } = await supabase.from('fin_bank_accounts')
                        .select('current_balance').eq('id', txData.account_id).single();
                    if (accData) {
                        await supabase.from('fin_bank_accounts')
                            .update({ current_balance: Number(accData.current_balance) - Number(txData.amount) })
                            .eq('id', txData.account_id);
                    }
                    await supabase.from('fin_bank_transactions').delete().eq('id', txData.id);
                }

                const { error } = await supabase.from('cash_ledger_deposits').delete().eq('id', row.deposit_id)
                if (error) throw error
            }
            
            await refresh(true)
        } catch (err: any) {
            console.error('Error undepositing:', err)
            alert('Failed to undo deposit: ' + err.message)
        }
    }

    const updateDepositDate = async (row: CashLedgerRow, newDate: string) => {
        if (!row.deposit_id) return

        try {
            const { error } = await supabase
                .from('cash_ledger_deposits')
                .update({ deposit_date: newDate })
                .eq('id', row.deposit_id)

            if (error) throw error

            // Update bank transaction date
            await supabase.from('fin_bank_transactions')
                .update({ transaction_date: newDate })
                .eq('reference_id', row.deposit_id)
                .eq('reference_type', 'cash_ledger_deposit');

            await refresh(true)
        } catch (err: any) {
            console.error('Error updating deposit date:', err)
            alert('Failed to update deposit date: ' + err.message)
        }
    }

    return { rows, loading, error, refresh, deposit, depositBulk, undeposit, updateDepositDate, totalPending }
}
