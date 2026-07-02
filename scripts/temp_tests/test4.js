const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [k, v] = line.split('=');
  if (k) process.env[k] = v;
});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('hr_staff').select('id, full_name, status, probation_end_date, hr_staff_performance(id, period)').eq('status', 'active');
  if (error) {
    console.error(error);
    return;
  }
  const inProbation = data.filter(s => s.probation_end_date && new Date(s.probation_end_date).getTime() > Date.now());
  console.log(JSON.stringify(inProbation, null, 2));
}
check();
