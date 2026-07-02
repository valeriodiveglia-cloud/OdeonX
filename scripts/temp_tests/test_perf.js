const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [k, v] = line.split('=');
  if (k) process.env[k] = v.replace(/['"]/g, '');
});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('hr_staff_performance').select('id, staff_id, period, review_date, rating, hr_staff(full_name)');
  if (error) {
    console.log("Error:", error.message);
  } else {
    console.log("Performances:", JSON.stringify(data, null, 2));
  }
}
check();
