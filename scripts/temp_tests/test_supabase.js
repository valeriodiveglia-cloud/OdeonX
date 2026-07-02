require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function test() {
    const { data, error } = await supabase.from('app_accounts').select('user_id, name, email, role').or('role.in.(sale advisor,manager,admin,owner),is_sale_advisor.eq.true');
    console.log(error);
}
test();
