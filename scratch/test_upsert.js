import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const envConfig = dotenv.parse(fs.readFileSync('.env.local'))
for (const k in envConfig) {
  process.env[k] = envConfig[k]
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

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
