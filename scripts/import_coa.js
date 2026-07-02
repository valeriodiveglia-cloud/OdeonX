const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://vwzvwxrltlfjuqzdxnac.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3enZ3eHJsdGxmanVxemR4bmFjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYzNjAxNCwiZXhwIjoyMDcyMjEyMDE0fQ.2VTuq7pkaY3oUuUGQsgLAFA4ZHTSMnZd9FhqRErXY8s'
const supabase = createClient(supabaseUrl, supabaseKey)

const markdownPath = '/Users/valerio/Desktop/pasta_fresca_chart_of_accounts.md'

async function run() {
  const content = fs.readFileSync(markdownPath, 'utf8')
  const lines = content.split('\n')
  
  const accounts = []
  
  // parse markdown tables
  for (const line of lines) {
    if (line.startsWith('| `')) {
      // row format: | `111` | Cash in hand | Tiền mặt | Debit balance |  | In use |
      const cols = line.split('|').map(c => c.trim())
      if (cols.length >= 7) {
        const codeMatch = cols[1].match(/`([^`]+)`/)
        if (!codeMatch) continue
        const code = codeMatch[1]
        const nameEn = cols[2]
        const nameVi = cols[3]
        const type = cols[4]
        const description = cols[5] || null
        const status = cols[6]
        
        let account_type = 'Asset'
        if (code.startsWith('1') || code.startsWith('2')) account_type = 'Asset'
        else if (code.startsWith('3')) {
            if (code.startsWith('333')) account_type = 'Tax'
            else if (code.startsWith('334')) account_type = 'Salary'
            else account_type = 'Liability'
        }
        else if (code.startsWith('4')) account_type = 'Equity'
        else if (code.startsWith('5')) account_type = 'Revenue'
        else if (code.startsWith('6')) {
            if (code.startsWith('61') || code.startsWith('62') || code.startsWith('63')) account_type = 'COGS'
            else account_type = 'OPEX'
        }
        else if (code.startsWith('7')) account_type = 'Other Income'
        else if (code.startsWith('8')) account_type = 'Other Expense'
        else if (code.startsWith('9')) account_type = 'Other Income' // or Equity
        
        accounts.push({
          id: require('crypto').randomUUID(),
          code,
          name: nameEn,
          simplified_name: nameVi,
          account_type,
          parent_id: null, // We'll compute this next
          is_group: false, // We'll compute this
          sort_order: accounts.length + 1,
          is_active: status === 'In use',
          description: description
        })
      }
    }
  }

  console.log(`Parsed ${accounts.length} accounts.`)

  // Compute parents and is_group
  // 1111 is child of 111
  // We can sort by code length and assign parents by finding the longest prefix.
  // Wait, in Vietnam COA, 1111 is child of 111, 11111 is child of 1111, 11211-808 is child of 1121...
  for (const acc of accounts) {
    let parent = null
    // find the closest parent by checking all other accounts
    // e.g. for "1111", the parent should be "111".
    // for "11211-808", parent could be "11211" or "1121"
    let maxPrefixLength = 0
    for (const p of accounts) {
      if (p.code !== acc.code && acc.code.startsWith(p.code) && p.code.length > maxPrefixLength) {
        parent = p
        maxPrefixLength = p.code.length
      }
    }
    if (parent) {
      acc.parent_id = parent.id
      parent.is_group = true
    }
  }

  // Check if we can just truncate
  console.log('Truncating tables...')
  // We cannot use cascade via supabase standard api. We can execute an rpc or run a manual query, or just delete all items in dependent tables first.
  
  await supabase.from('fin_payment_order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('fin_invoices').update({ account_id: null }).neq('id', '00000000-0000-0000-0000-000000000000')
  const { error: delErr } = await supabase.from('fin_chart_of_accounts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (delErr) {
    console.error('Error deleting existing COA:', delErr)
  }

  const { error: insErr } = await supabase.from('fin_chart_of_accounts').insert(accounts)
  if (insErr) {
    console.error('Error inserting new COA:', insErr)
  } else {
    console.log('Migration successful!')
  }
}

run()
