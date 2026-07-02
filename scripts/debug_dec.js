const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
    // Check ALL closings on Dec 1 for any branch
    const { data: closings } = await supabase.from('cashier_closings')
        .select('report_date, branch_name, opening_float_vnd, cash_json, float_plan_json')
        .eq('report_date', '2025-12-01')
    console.log("=== ALL closings on 2025-12-01 ===")
    console.log(closings)

    // Check TML closings in Nov/Dec 2025
    const { data: tmlClosings } = await supabase.from('cashier_closings')
        .select('report_date, branch_name, opening_float_vnd, cash_json, float_plan_json')
        .eq('branch_name', 'Pasta Fresca Thanh My Loi')
        .gte('report_date', '2025-11-01')
        .lt('report_date', '2026-02-01')
        .order('report_date', { ascending: true })
    console.log("\n=== TML closings Nov 2025 - Jan 2026 ===")
    console.log(tmlClosings)

    // Check if user sees Cash Ledger rows - check deposits table for Dec
    const { data: deposits } = await supabase.from('cash_ledger_deposits')
        .select('*')
        .gte('date', '2025-12-01')
        .lt('date', '2026-01-01')
    console.log("\n=== ALL deposits in Dec 2025 ===")
    console.log(deposits)
}
run()
