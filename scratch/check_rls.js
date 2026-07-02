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

async function checkRLS() {
    const { data, error } = await supabase.rpc('execute_sql', {
        sql_query: "SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE tablename = 'fin_invoices'"
    })

    if (error) {
        // Fallback if rpc execute_sql is not available
        console.log('Execute SQL RPC not available. Trying manual select if possible...')
        // Let's run a raw query through supabase.rpc if execute_sql doesn't work.
        const res = await supabase.from('fin_invoices').select('id').limit(1)
        console.log('Test select:', res)
    } else {
        console.log('--- RLS Policies on fin_invoices ---')
        console.log(data)
    }
}

checkRLS()
