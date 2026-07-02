import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// Manually parse .env.local
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

if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase credentials not found in env content!')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function inspect() {
    // 1. Find Google supplier
    const { data: sups, error: supErr } = await supabase
        .from('suppliers')
        .select('id, name')
        .ilike('name', '%google%')
    
    if (supErr) {
        console.error('Error fetching suppliers:', supErr)
        return
    }

    console.log('--- Google Suppliers Found ---')
    console.log(sups)

    if (sups.length === 0) {
        console.log('No Google supplier found!')
        return
    }

    // 2. Fetch invoices for these suppliers
    const supIds = sups.map(s => s.id)
    const { data: invoices, error: invErr } = await supabase
        .from('fin_invoices')
        .select('id, invoice_number, supplier_id, status, gross_amount, invoice_date')
        .in('supplier_id', supIds)

    if (invErr) {
        console.error('Error fetching invoices:', invErr)
        return
    }

    console.log('\n--- Invoices Linked to Google ---')
    console.log(invoices)
}

inspect()
