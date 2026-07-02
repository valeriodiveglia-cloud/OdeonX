import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf-8')
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1]
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1]

const supabase = createClient(url, key)

async function run() {
    const { data: accs } = await supabase.from('fin_bank_accounts').select('id, account_name')
    console.log("Found accounts:", accs)

    const dalatAccs = accs.filter(a => a.account_name.includes('Da Lat'))
    if (dalatAccs.length > 1) {
        for (let i = 1; i < dalatAccs.length; i++) {
            await supabase.from('fin_bank_accounts').delete().eq('id', dalatAccs[i].id)
        }
    }
    if (dalatAccs.length > 0) {
        await supabase.from('fin_bank_accounts').update({ account_name: 'DL (Pasta Fresca Da Lat)' }).eq('id', dalatAccs[0].id)
    }
    console.log("Done")
}
run()
