import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vwzvwxrltlfjuqzdxnac.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3enZ3eHJsdGxmanVxemR4bmFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2MzYwMTQsImV4cCI6MjA3MjIxMjAxNH0.VZ1-BlYpHVTUOmU01kNVPpXUfz4pNUjuP8bAEM10t2A'
const supabaseAdminKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3enZ3eHJsdGxmanVxemR4bmFjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYzNjAxNCwiZXhwIjoyMDcyMjEyMDE0fQ.2VTuq7pkaY3oUuUGQsgLAFA4ZHTSMnZd9FhqRErXY8s'

const adminSupabase = createClient(supabaseUrl, supabaseAdminKey)

async function test() {
  // get an owner and an accountant
  const { data: owners } = await adminSupabase.from('app_accounts').select('user_id').eq('role', 'owner').limit(1)
  const { data: accounts } = await adminSupabase.from('app_accounts').select('user_id').eq('role', 'accountant').limit(1)
  
  if (!owners?.length || !accounts?.length) {
    console.log("Could not find owner or accountant")
    return
  }
  
  const ownerId = owners[0].user_id
  const accountantId = accounts[0].user_id
  
  console.log("Owner ID:", ownerId)
  console.log("Accountant ID:", accountantId)
  
  // Fake JWTs to test RLS
  const jwt = require('jsonwebtoken')
  const JWT_SECRET = 'VZ1-BlYpHVTUOmU01kNVPpXUfz4pNUjuP8bAEM10t2A' // This is NOT the jwt secret, it's the anon key signature. We can't generate valid JWTs without the project's JWT secret!
}
test()
