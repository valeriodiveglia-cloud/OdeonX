import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://vwzvwxrltlfjuqzdxnac.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3enZ3eHJsdGxmanVxemR4bmFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2MzYwMTQsImV4cCI6MjA3MjIxMjAxNH0.VZ1-BlYpHVTUOmU01kNVPpXUfz4pNUjuP8bAEM10t2A'
)

async function test() {
  const { data: cashoutData, error: cashoutErr } = await supabase.from('cashout')
    .select('id, date, amount, description')
    .eq('invoice', true)
    .is('invoice_id', null)
  console.log('Cashout Error:', cashoutErr)
  console.log('Cashout Data:', cashoutData?.length)

  const { data: manData, error: manErr } = await supabase.from('fin_payment_order_items')
    .select('id, amount, description, fin_payment_orders!inner(order_number, order_date, status)')
    .eq('item_type', 'manual')
    .is('invoice_id', null)
    .eq('requires_invoice', true)
    .neq('fin_payment_orders.status', 'Cancelled')
  console.log('Man Error:', manErr)
  console.log('Man Data:', manData?.length)
}

test()
