require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
async function run() {
  const { data, error } = await supabase.from('crm_payouts').select('id, partner_referrals:crm_referrals!payout_id(id), advisor_referrals:crm_referrals!advisor_payout_id(id)').limit(1)
  console.log(JSON.stringify({data, error}, null, 2))
}
run()
