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
    const { data: allClosings } = await supabase.from('cashier_closings').select('report_date, branch_name, opening_float_vnd, cash_json, float_plan_json').eq('branch_name', branchName).lt('report_date', '2026-05-13')
    const { data: allDeposits } = await supabase.from('cash_ledger_deposits').select('date, branch, amount').eq('branch', branchName).lt('date', '2026-05-13')
    
    const depositsMap = new Map()
    for (const d of allDeposits || []) {
        const dDate = String(d.date).split('T')[0]
        depositsMap.set(dDate, (depositsMap.get(dDate) || 0) + (Number(d.amount) || 0))
    }

    let pendingSum = 0
    for (const r of allClosings || []) {
        const date = String(r.report_date).split('T')[0]
        const floatTarget = Number(r.opening_float_vnd) || 3000000
        const countedCash = cashFromJson(r.cash_json)
        const planTotal = cashFromJson(r.float_plan_json)

        const cashToTake = planTotal > 0
            ? planTotal
            : Math.max(0, countedCash - floatTarget)

        if (cashToTake > 0) {
            const deposited = depositsMap.get(date) || 0
            if (deposited < cashToTake) {
                pendingSum += cashToTake
            }
        }
    }
    console.log("Pending sum for Thanh My Loi:", pendingSum)

    let oldLogicPendingSum = 0;
    let oldLogicTotalToTake = 0;
    for (const r of allClosings || []) {
        const floatTarget = Number(r.opening_float_vnd) || 3000000
        const countedCash = cashFromJson(r.cash_json)
        const planTotal = cashFromJson(r.float_plan_json)
        const cashToTake = planTotal > 0 ? planTotal : Math.max(0, countedCash - floatTarget)
        oldLogicTotalToTake += cashToTake
    }
    const totalDep = (allDeposits || []).reduce((s, d) => s + (Number(d.amount)||0), 0)
    console.log("Old logic pending:", Math.max(0, oldLogicTotalToTake - totalDep))
}
run()
