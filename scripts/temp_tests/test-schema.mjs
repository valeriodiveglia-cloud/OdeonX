import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://vwzvwxrltlfjuqzdxnac.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3enZ3eHJsdGxmanVxemR4bmFjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYzNjAxNCwiZXhwIjoyMDcyMjEyMDE0fQ.2VTuq7pkaY3oUuUGQsgLAFA4ZHTSMnZd9FhqRErXY8s'
);

async function run() {
    // Get staff
    const { data: staff } = await supabase.from('hr_staff').select('id').limit(1);
    if (!staff || staff.length === 0) return console.log('No staff');
    
    const payload = {
        staff_id: staff[0].id,
        date: '2026-04-26',
        hours: 2,
        reason: 'test',
        compensation_type: 'salary',
        is_public_holiday: false
    };

    const { data, error } = await supabase.from('hr_staff_overtime').insert(payload).select().single();
    if (error) console.error('Error:', error);
    else console.log('Success:', data);
    
    // Cleanup
    if (data) await supabase.from('hr_staff_overtime').delete().eq('id', data.id);
}

run();
