import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function test() {
    const startDate = '2026-05-01';
    const endDate = '2026-06-01';
    const [cashoutRes, mapRes, bankRes] = await Promise.all([
        supabase.from('cashout').select('category, amount, branch').gte('date', startDate).lt('date', endDate).eq('invoice', false),
        supabase.from('fin_cashout_category_mapping').select('*'),
        supabase.from('fin_bank_transactions').select('category, amount, type, fin_bank_accounts(fee_account_id, branch_id)')
            .gte('transaction_date', startDate).lt('transaction_date', endDate)
            .eq('type', 'Outflow')
            .ilike('category', '%Fee%')
    ]);
    console.log("Cashouts:", cashoutRes.data);
    console.log("Mappings:", mapRes.data);
    console.log("Bank Fees:", bankRes.data);
}

test().catch(console.error);
