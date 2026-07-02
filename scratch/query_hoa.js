import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read URL and KEY from .env.local
const envFile = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

if (urlMatch && keyMatch) {
  const supabase = createClient(urlMatch[1], keyMatch[1]);
  async function run() {
    const { data: staff } = await supabase.from('hr_operational_staff').select('name, branch_ids').ilike('name', '%Ngo Thi Hoa%');
    console.log("STAFF:", staff);
    
    const { data: branches } = await supabase.from('hr_operational_branches').select('id, name');
    console.log("BRANCHES:", branches);
  }
  run();
}
