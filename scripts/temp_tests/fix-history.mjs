import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://vwzvwxrltlfjuqzdxnac.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3enZ3eHJsdGxmanVxemR4bmFjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYzNjAxNCwiZXhwIjoyMDcyMjEyMDE0fQ.2VTuq7pkaY3oUuUGQsgLAFA4ZHTSMnZd9FhqRErXY8s'
);

async function run() {
    const { data: staff, error } = await supabase.from('hr_staff').select('*').ilike('full_name', '%ABC%').limit(1);
    if (error || !staff || staff.length === 0) {
        console.log('Staff ABC not found', error);
        return;
    }
    
    console.log('Found staff:', staff[0].full_name, staff[0].salary_amount, staff[0].id);
    
    // Check if history already exists
    const { data: history } = await supabase.from('hr_staff_salary_history').select('*').eq('staff_id', staff[0].id);
    console.log('Existing history:', history);
    
    // Insert history
    const payload = {
        staff_id: staff[0].id,
        effective_date: new Date().toISOString().split('T')[0], // Today, or maybe updated_at?
        previous_amount: 12000000,
        new_amount: 13860000,
        salary_type: staff[0].salary_type || 'monthly',
        reason: 'Manual historical fix',
        record_type: 'salary_increase',
        increase_type: 'fixed',
        increase_value: 1860000,
        previous_salary_type: staff[0].salary_type || 'monthly'
    };
    
    // We will not insert yet, just prepare.
    console.log('Payload:', payload);
}

run();
