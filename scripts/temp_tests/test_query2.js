const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) env[parts[0]] = parts.slice(1).join('=').trim().replace(/['\"]/g, '');
});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.rpc('query_schema', { query_text: "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'hr_staff';" });
  if (error) console.log(error);
  else console.log(data);
}
check();
