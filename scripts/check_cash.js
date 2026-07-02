const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const DENOMS = [
    { key: 'd500k', face: 500_000 }, { key: 'd200k', face: 200_000 }, { key: 'd100k', face: 100_000 },
    { key: 'd50k', face: 50_000 }, { key: 'd20k', face: 20_000 }, { key: 'd10k', face: 10_000 },
    { key: 'd5k', face: 5_000 }, { key: 'd2k', face: 2_000 }, { key: 'd1k', face: 1_000 }
]

function cashFromJson(raw) {
    if (!raw) return 0
    let obj = null
    if (typeof raw === 'string') {
        try { obj = JSON.parse(raw) } catch (e) { obj = null }
    } else if (typeof raw === 'object') {
        obj = raw
    }
    if (!obj) return 0
    let sum = 0
    for (const d of DENOMS) {
        const pieces = Number(obj[d.key] || 0)
        if (Number.isFinite(pieces)) sum += pieces * d.face
    }
    return Math.round(sum)
}

async function run() {
    const { data: closings } = await supabase.from('cashier_closings')
        .select('report_date, branch_name, opening_float_vnd, cash_json, float_plan_json')
        .eq('branch_name', 'Pasta Fresca Thao Dien')
        .lt('report_date', '2026-05-13')

    const { data: deposits } = await supabase.from('cash_ledger_deposits')
        .select('date, branch, amount')
        .eq('branch', 'Pasta Fresca Thao Dien')
        .lt('date', '2026-05-13')

    let totalCashToTake = 0
    let pendingSumOld = 0

    const depositsMap = new Map()
    for (const d of deposits || []) {
        depositsMap.set(d.date, (depositsMap.get(d.date) || 0) + d.amount)
    }

    for (const c of closings || []) {
        const countedCash = cashFromJson(c.cash_json)
        const planTotal = cashFromJson(c.float_plan_json)
        const floatTarget = Number(c.opening_float_vnd) || 3000000
        const cashToTake = planTotal > 0 ? planTotal : Math.max(0, countedCash - floatTarget)
        totalCashToTake += cashToTake
        
        const dep = depositsMap.get(c.report_date) || 0
        if (dep < cashToTake) {
            pendingSumOld += cashToTake
        }
    }

    const totalDeposited = (deposits || []).reduce((sum, d) => sum + (Number(d.amount) || 0), 0)
    const pendingCash = Math.max(0, totalCashToTake - totalDeposited)

    console.log({
        totalCashToTake,
        totalDeposited,
        pendingCash,
        pendingSumOld
    })
}

run()
