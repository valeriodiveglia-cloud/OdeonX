import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://vwzvwxrltlfjuqzdxnac.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3enZ3eHJsdGxmanVxemR4bmFjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYzNjAxNCwiZXhwIjoyMDcyMjEyMDE0fQ.2VTuq7pkaY3oUuUGQsgLAFA4ZHTSMnZd9FhqRErXY8s'
);

async function run() {
    const { data: cols, error: colsErr } = await supabase.rpc('get_columns_for_table', { table_name: 'hr_staff_overtime' }).catch(() => ({}));
    console.log('Columns:', cols, colsErr);
    
    // alternative to get columns
    const { data, error } = await supabase.from('hr_staff_overtime').select('*').limit(1);
    console.log('Sample Data:', data);
    console.log('Error:', error);
}

run();
