import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  if (line.includes('=')) {
    const [k, v] = line.split('=');
    env[k.trim()] = v.trim();
  }
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data: staff } = await supabase.from('hr_staff').select('id').limit(1);
  if (!staff || !staff.length) return console.log('no staff');
  
  const staffId = staff[0].id;
  const h = 10;
  const selectedYear = 2024;
  
  const { data, error } = await supabase
    .from('hr_part_time_hours')
    .upsert({ 
        staff_id: staffId, 
        year: selectedYear, 
        total_hours: h 
    }, { onConflict: 'staff_id,year' })
    .select();
    
  console.log('Error:', error);
  console.log('Data:', data);
}
test();
