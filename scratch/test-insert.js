import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://vwzvwxrltlfjuqzdxnac.supabase.co',
  process.env.SUPABASE_ANON_KEY
);

async function run() {
  const { data, error: authError } = await supabase.auth.signInWithPassword({
    email: 'bar185sw@gmail.com',
    password: 'password123'
  });
  if (authError) {
    console.error("Auth error:", authError);
    return;
  }
  
  const user = data.user;
  
  const payload = {
    name: 'Test Partner JS',
    type: null,
    contact_name: null,
    email: null,
    phone: null,
    location: null,
    status: 'Leads',
    pipeline_stage: 'Leads',
    priority: 'Medium',
    notes: null,
    owner_id: user.id,
    created_by: user.id
  };
  
  console.log("Inserting:", payload);
  const { data: res, error } = await supabase.from('crm_partners').insert([payload]);
  
  if (error) {
    console.log("INSERT ERROR:");
    console.log(JSON.stringify(error, null, 2));
    console.log(error);
  } else {
    console.log("INSERT SUCCESS");
  }
}
run();
