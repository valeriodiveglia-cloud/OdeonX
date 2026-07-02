const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
async function main() {
  const { data, error } = await supabase.rpc('exec_sql', { sql: 'ALTER TABLE hr_review_periods ADD COLUMN IF NOT EXISTS target_offset INT DEFAULT 0;' })
  console.log('Result:', data, error)
}
main()
