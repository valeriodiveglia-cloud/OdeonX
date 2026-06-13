require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('hr_staff').select('id, full_name, hr_staff_performance(period)').eq('status', 'active');
  console.log(JSON.stringify(data, null, 2));
}
run();
