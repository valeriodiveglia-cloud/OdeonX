const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
async function run() {
    const { data } = await supabase.from('fin_bank_accounts').select('*').like('account_name', '%Thao Dien%')
    console.log(data)
}
run()
