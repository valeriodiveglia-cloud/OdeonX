const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [k, v] = line.split('=');
  if (k) process.env[k] = v;
});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// We cannot query pg_catalog directly from client, but we can try to insert a fake record to see what fails
async function check() {
  const { error } = await supabase.from('hr_staff_salary_history').insert([{
    staff_id: '00000000-0000-0000-0000-000000000000', // Fake ID
    effective_date: '2026-05-01',
    record_type: 'dismissal',
    previous_amount: 0,
    new_amount: 0,
    salary_type: 'fixed'
  }]);
  console.log("Error for dismissal:", error);
}
check();
