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
    const { data: allClosings } = await supabase.from('cashier_closings').select('report_date, branch_name, opening_float_vnd, cash_json, float_plan_json').eq('branch_name', branchName).gte('report_date', '2026-05-01')
    
    let sum = 0
    for (const r of allClosings || []) {
        const floatTarget = Number(r.opening_float_vnd) || 3000000
        const countedCash = cashFromJson(r.cash_json)
        const planTotal = cashFromJson(r.float_plan_json)

        const cashToTake = planTotal > 0
            ? planTotal
            : Math.max(0, countedCash - floatTarget)
        console.log(`May ${r.report_date} -> ${cashToTake}`)
        sum += cashToTake
    }
    console.log("May cash to take for Thanh My Loi:", sum)
}
run()
