import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envContent = fs.readFileSync('.env.local', 'utf-8')
const env = {}
envContent.split('\n').forEach(line => {
    const parts = line.split('=')
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim()
    }
})

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function testQuery() {
    const res = await supabase.from('fin_invoices')
        .select('id, invoice_number, supplier_id, suppliers(name), gross_amount, invoice_date, branch_ids, account_id, status, fin_payment_order_items(id, amount, fin_payment_orders(status)), cashout(id, amount), fin_corporate_card_expenses(id, amount)')
        .order('invoice_date', { ascending: false })

    if (res.error) {
        console.error('--- QUERY ERROR ---')
        console.error(res.error)
    } else {
        console.log('--- QUERY SUCCESS ---')
        console.log(`Fetched ${res.data?.length} invoices.`)
        const googleInvs = res.data?.filter(i => i.supplier_id === '0a6adbec-45bf-4bbc-a43c-9136b82f6ee5')
        console.log('Google Invoices fetched:', googleInvs)
    }
}

testQuery()
