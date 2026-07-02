const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
async function run() {
    const { data } = await supabase.from('cashier_closings').select('report_date, branch_name, opening_float_vnd, cash_json, float_plan_json').gte('report_date', '2026-05-13')
    console.log("CLOSINGS >= 13 May:", data)
    
    const { data: outs } = await supabase.from('cashout').select('*').gte('date', '2026-05-13')
    console.log("CASHOUTS >= 13 May:", outs)
}
run()
