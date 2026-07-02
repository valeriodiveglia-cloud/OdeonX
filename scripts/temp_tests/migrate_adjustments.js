const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL')).split('=')[1].trim();
const key = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')).split('=')[1].trim();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(url, key);

async function run() {
    const { data: rows, error } = await supabase.from('fin_monthly_adjustments').select('*');
    if (error) { console.error(error); return; }

    const groupedByMonth = {};
    for (const row of rows) {
        if (!groupedByMonth[row.month_key]) groupedByMonth[row.month_key] = [];
        groupedByMonth[row.month_key].push(row);
    }

    for (const [month_key, monthRows] of Object.entries(groupedByMonth)) {
        let mergedAdjustments = [];
        for (const row of monthRows) {
            if (row.custom_adjustments && Array.isArray(row.custom_adjustments)) {
                for (const adj of row.custom_adjustments) {
                    if (!adj.allocated_branches) {
                        adj.allocated_branches = [row.branch_id];
                    }
                    mergedAdjustments.push(adj);
                }
            }
        }

        // Upsert the merged array into branch_id = 'All'
        const { error: upsertError } = await supabase.from('fin_monthly_adjustments').upsert({
            month_key,
            branch_id: 'All',
            custom_adjustments: mergedAdjustments,
            updated_at: new Date().toISOString()
        }, { onConflict: 'month_key, branch_id' });

        if (upsertError) {
            console.error(`Error upserting for ${month_key}:`, upsertError);
            continue;
        }

        // Delete the other rows
        for (const row of monthRows) {
            if (row.branch_id !== 'All') {
                await supabase.from('fin_monthly_adjustments').delete().eq('id', row.id);
            }
        }
        console.log(`Migrated ${month_key}`);
    }
    console.log('Migration complete');
}

run();
