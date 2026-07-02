const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [k, v] = line.split('=');
  if (k) process.env[k] = v;
});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('hr_staff').select('id, full_name, status, probation_end_date, hr_staff_performance(id, period)').then(({data, error}) => {
  if (error) console.error("ERROR:", error);
  else console.log(JSON.stringify(data.filter(s => s.status === 'active' && s.probation_end_date && new Date(s.probation_end_date).getTime() > Date.now()), null, 2));
});
