import fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf-8')
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1]
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1]

async function run() {
    const res = await fetch(`${url}/rest/v1/provider_branches?select=id,name,city`, {
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`
        }
    })
    const data = await res.json()
    console.log("Response:", res.status, data)
}
run()
