const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const DENOMS = [
    { key: 'd500k', face: 500_000 }, { key: 'd200k', face: 200_000 }, { key: 'd100k', face: 100_000 },
    { key: 'd50k', face: 50_000 }, { key: 'd20k', face: 20_000 }, { key: 'd10k', face: 10_000 },
    { key: 'd5k', face: 5_000 }, { key: 'd2k', face: 2_000 }, { key: 'd1k', face: 1_000 }
]
function cashFromJson(raw) {
    if (!raw) return 0
    let obj = null
    if (typeof raw === 'string') { try { obj = JSON.parse(raw) } catch (e) { obj = null } } else if (typeof raw === 'object') { obj = raw }
    if (!obj) return 0
    let sum = 0
    for (const d of DENOMS) {
        const pieces = Number(obj[d.key] || 0)
        if (Number.isFinite(pieces)) sum += pieces * d.face
    }
    return Math.round(sum)
}
async function run() {
    const branchName = 'Pasta Fresca Thanh My Loi'
    
    // All closings before May 13
    const { data: closings } = await supabase.from('cashier_closings')
        .select('report_date, branch_name, opening_float_vnd, cash_json, float_plan_json')
        .eq('branch_name', branchName)
        .lt('report_date', '2026-05-13')
        .order('report_date', { ascending: true })

    // All deposits before May 13
    const { data: deposits } = await supabase.from('cash_ledger_deposits')
        .select('date, branch, amount, deposit_date')
        .eq('branch', branchName)
        .lt('date', '2026-05-13')
        .order('date', { ascending: true })

    console.log("=== CLOSINGS for TML before May 13 ===")
    for (const c of closings || []) {
        const countedCash = cashFromJson(c.cash_json)
        const planTotal = cashFromJson(c.float_plan_json)
        const floatTarget = Number(c.opening_float_vnd) || 3000000
        const cashToTake = planTotal > 0 ? planTotal : Math.max(0, countedCash - floatTarget)
        console.log(`  ${c.report_date} | Float: ${floatTarget.toLocaleString()} | Counted: ${countedCash.toLocaleString()} | Plan: ${planTotal.toLocaleString()} | Cash To Take: ${cashToTake.toLocaleString()}`)
    }

    console.log("\n=== DEPOSITS for TML before May 13 ===")
    for (const d of deposits || []) {
        console.log(`  ${d.date} | Amount: ${Number(d.amount).toLocaleString()} | Deposit Date: ${d.deposit_date}`)
    }

    // Now calculate pending with row-by-row logic
    const depositsMap = new Map()
    for (const d of deposits || []) {
        const dDate = String(d.date).split('T')[0]
        depositsMap.set(dDate, (depositsMap.get(dDate) || 0) + (Number(d.amount) || 0))
    }

    let pendingCash = 0
    console.log("\n=== PENDING ROWS ===")
    for (const c of closings || []) {
        const cDate = String(c.report_date).split('T')[0]
        const countedCash = cashFromJson(c.cash_json)
        const planTotal = cashFromJson(c.float_plan_json)
        const floatTarget = Number(c.opening_float_vnd) || 3000000
        const cashToTake = planTotal > 0 ? planTotal : Math.max(0, countedCash - floatTarget)
        
        if (cashToTake > 0) {
            const deposited = depositsMap.get(cDate) || 0
            const isPending = deposited < cashToTake
            if (isPending) {
                pendingCash += cashToTake
                console.log(`  PENDING: ${cDate} | CashToTake: ${cashToTake.toLocaleString()} | Deposited: ${deposited.toLocaleString()}`)
            }
        }
    }

    // Latest float
    const sorted = [...(closings || [])].sort((a, b) => new Date(b.report_date).getTime() - new Date(a.report_date).getTime())
    const latestFloat = sorted.length > 0 ? (Number(sorted[0].opening_float_vnd) || 3000000) : 3000000

    console.log("\n=== SUMMARY ===")
    console.log(`  Pending Cash (row-by-row): ${pendingCash.toLocaleString()}`)
    console.log(`  Latest Float: ${latestFloat.toLocaleString()}`)
    console.log(`  Opening Balance = Pending + Float = ${(pendingCash + latestFloat).toLocaleString()}`)
    
    // Also show current account status
    const { data: acc } = await supabase.from('fin_bank_accounts').select('*').eq('account_name', 'Cash on Hand - ' + branchName).single()
    if (acc) {
        console.log(`\n=== CURRENT ACCOUNT ===`)
        console.log(`  Opening Balance: ${Number(acc.opening_balance).toLocaleString()}`)
        console.log(`  Current Balance: ${Number(acc.current_balance).toLocaleString()}`)
    }
    
    // Show transactions
    if (acc) {
        const { data: txs } = await supabase.from('fin_bank_transactions').select('*').eq('account_id', acc.id).order('transaction_date', { ascending: true })
        console.log(`\n=== TRANSACTIONS ===`)
        for (const tx of txs || []) {
            console.log(`  ${tx.transaction_date} | ${tx.type} | ${Number(tx.amount).toLocaleString()} | ${tx.description} | ref: ${tx.reference_type}`)
        }
    }
}
run()
