const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
async function run() {
    const { data: deposits } = await supabase.from('cash_ledger_deposits').select('*').eq('branch', 'Pasta Fresca Thao Dien').eq('date', '2025-11-13')
    console.log(deposits)
}
run()
