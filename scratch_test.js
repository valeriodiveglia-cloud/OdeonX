const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local manually
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value.trim();
  }
});

const supabaseAdmin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Querying hr_staff_assets with supabaseAdmin...');
  const { data: assets, error: assetsErr } = await supabaseAdmin
    .from('hr_staff_assets')
    .select('*, hr_staff_asset_history(*)')
    .order('created_at', { ascending: false });

  if (assetsErr) {
    console.error('supabaseAdmin error:', assetsErr);
  } else {
    console.log('supabaseAdmin successful. Assets count:', assets ? assets.length : 0);
    if (assets && assets.length > 0) {
      console.log('Sample asset:', assets[0]);
    }
  }
}
run();
