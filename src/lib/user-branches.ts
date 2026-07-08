// src/lib/user-branches.ts
import { supabase } from './supabase_shim'

export interface UserPermissions {
  role: string | null
  branches: string[] | null
}

export async function getCurrentUserPermissions(): Promise<UserPermissions> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { role: null, branches: null }

    const { data: acc } = await supabase
      .from('app_accounts')
      .select('role, branches')
      .eq('user_id', user.id)
      .single()

    if (!acc) return { role: null, branches: null }
    return {
      role: acc.role || null,
      branches: acc.branches || null
    }
  } catch (err) {
    console.error('Error fetching user permissions:', err)
    return { role: null, branches: null }
  }
}
