const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

let supabaseUrl = '';
let supabaseKey = '';

try {
    const envContent = fs.readFileSync('./.env.local', 'utf8');
    const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+)/);
    const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*(.+)/);
    if (urlMatch) supabaseUrl = urlMatch[1].trim().replace(/['"]/g, '');
    if (keyMatch) supabaseKey = keyMatch[1].trim().replace(/['"]/g, '');
} catch (err) {
    console.error('Error reading .env.local:', err);
}

if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase credentials not found in env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase
        .from('fin_invoices')
        .select('invoice_number, status, is_personal_deduction, gross_amount, id')
        .order('invoice_date', { ascending: false });

    if (error) {
        console.error('Error fetching invoices:', error);
        return;
    }

    console.log(`Found ${data.length} invoices:`);
    for (const inv of data) {
        // Fetch paid items
        const { data: paidItems } = await supabase
            .from('fin_payment_order_items')
            .select('amount, fin_payment_orders(status)')
            .eq('invoice_id', inv.id);

        const { data: cashouts } = await supabase
            .from('cashout')
            .select('amount')
            .eq('invoice_id', inv.id);

        const { data: cards } = await supabase
            .from('fin_corporate_card_expenses')
            .select('amount')
            .eq('invoice_id', inv.id);

        const paidItemsFiltered = (paidItems || []).filter(i => 
            i.fin_payment_orders?.status === 'Paid' || i.fin_payment_orders?.status === 'Approved'
        );
        
        let paidAmount = paidItemsFiltered.reduce((sum, i) => sum + Number(i.amount), 0);
        paidAmount += (cashouts || []).reduce((sum, i) => sum + Number(i.amount), 0);
        paidAmount += (cards || []).reduce((sum, i) => sum + Number(i.amount), 0);

        const balanceDue = inv.is_personal_deduction ? 0 : Math.max(0, Number(inv.gross_amount) - paidAmount);
        
        console.log(`Invoice ${inv.invoice_number}:`);
        console.log(`  - DB Status: "${inv.status}"`);
        console.log(`  - Is Personal: ${inv.is_personal_deduction}`);
        console.log(`  - Gross: ${inv.gross_amount}`);
        console.log(`  - Paid Amount: ${paidAmount}`);
        console.log(`  - Balance Due: ${balanceDue}`);
        console.log(`  - Rendered Status: ${(inv.is_personal_deduction || balanceDue <= 0 || inv.status === 'Paid') ? 'Paid' : inv.status}`);
        console.log(`  - Will show actions: ${inv.status === 'Pending' || inv.is_personal_deduction}`);
    }
}

check();
