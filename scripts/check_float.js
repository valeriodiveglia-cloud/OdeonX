const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function run() {
    const { data: closings } = await supabase.from('cashier_closings')
        .select('report_date, branch_name, opening_float_vnd')
        .eq('branch_name', 'Pasta Fresca Thao Dien')
        .lt('report_date', '2026-05-13')
        .order('report_date', { ascending: false })
        .limit(1)

    console.log(closings)
}
run()
