const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data, error } = await supabase.from('fin_invoices').select('*, suppliers(name, tax_id), fin_chart_of_accounts(code, name, simplified_name), fin_payment_order_items(id, amount, fin_payment_orders(status)), cashout(id, amount), fin_corporate_card_expenses(id, amount)').order('invoice_date', { ascending: false }).limit(5);
    console.log("Error:", error);
    console.log("Data length:", data ? data.length : 0);
}
run();
