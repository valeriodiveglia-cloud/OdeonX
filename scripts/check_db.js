const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envVars = fs.readFileSync('.env.local', 'utf8').split('\n');
const supabaseUrl = envVars.find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')).split('=')[1].replace(/"/g, '');
const supabaseKey = envVars.find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')).split('=')[1].replace(/"/g, '');

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.rpc('fin_auto_generate_card_pos');
  console.log(data, error);
}

// Check tables
async function getTableInfo(tableName) {
  const { data, error } = await supabase.from(tableName).select('*').limit(1);
  if (error) {
    console.error(`Error querying ${tableName}:`, error);
  } else if (data.length > 0) {
    console.log(`Columns in ${tableName}:`, Object.keys(data[0]));
  } else {
    console.log(`${tableName} is empty.`);
  }
}

async function run() {
  await getTableInfo('fin_corporate_card_expenses');
  await getTableInfo('fin_payment_order_items');
}

run();
