import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hgcxnkkvpnjhkpchgbuz.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnY3hua2t2cG5qaGtwY2hnYnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzODM1NzgsImV4cCI6MjA2OTk1OTU3OH0.esRUchR0-URjQtlypymPhQxlPBxrPN7alzqxOoHbZuc'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
