import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://vwzvwxrltlfjuqzdxnac.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3enZ3eHJsdGxmanVxemR4bmFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2MzYwMTQsImV4cCI6MjA3MjIxMjAxNH0.VZ1-BlYpHVTUOmU01kNVPpXUfz4pNUjuP8bAEM10t2A'
)

async function test() {
  const startStr = '2026-05-01'
  const endStr = '2026-05-31'

  console.log('Running query with range:', startStr, 'to', endStr)

  const res = await supabase.from('fin_payment_orders')
    .select('*, app_accounts!fin_payment_orders_created_by_fkey(name), fin_bank_accounts!fin_payment_orders_bank_account_id_fkey(account_name, bank_name), destination_bank_account:fin_bank_accounts!fin_payment_orders_destination_account_id_fkey(account_name, bank_name), fin_payment_order_items(*, fin_invoices(invoice_number, gross_amount, description, suppliers(name)), fin_chart_of_accounts(code, name))')
    .gte('order_date', startStr)
    .lte('order_date', endStr)
    .order('order_date', { ascending: false })

  if (res.error) {
    console.error('Query Error:', res.error)
  } else {
    console.log('Query succeeded! Number of rows:', res.data.length)
    console.log('First row keys:', Object.keys(res.data[0]))
    console.log('First row details:', JSON.stringify(res.data[0], null, 2))
  }
}

test()
