import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://vwzvwxrltlfjuqzdxnac.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3enZ3eHJsdGxmanVxemR4bmFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2MzYwMTQsImV4cCI6MjA3MjIxMjAxNH0.VZ1-BlYpHVTUOmU01kNVPpXUfz4pNUjuP8bAEM10t2A'
);

async function check() {
  const { data, error } = await supabase.from('hr_part_time_hours').select('*').limit(1);
  console.log("Error object:", error);
}

check();
