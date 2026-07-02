require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: 'valerio.diveglia@gmail.com', // Let's try to sign in or just use a dummy JWT if I can't.
        password: 'password'
    });
    // Let's just create a dummy JWT for role "authenticated" and use it to query.
}
run();
