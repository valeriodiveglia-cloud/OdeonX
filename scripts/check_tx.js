const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
async function run() {
    const { data: acc } = await supabase.from('fin_bank_accounts').select('id, current_balance, opening_balance').eq('account_name', 'Cash on Hand - Pasta Fresca Thao Dien').single()
    console.log("ACCOUNT:", acc)
    const { data: tx } = await supabase.from('fin_bank_transactions').select('*').eq('account_id', acc.id)
    console.log("TX:", tx)
}
run()
