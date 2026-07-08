// src/lib/user-branches.ts
import { supabase } from './supabase'

export interface UserPermissions {
  role: string | null
  branches: string[]
  userBranches: string[]
  isAdminOrOwner: boolean
}

export async function getCurrentUserPermissions(): Promise<UserPermissions> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { role: null, branches: [], userBranches: [], isAdminOrOwner: false }

    const { data: acc } = await supabase
      .from('app_accounts')
      .select('role, branches')
      .eq('user_id', user.id)
      .single()

    if (!acc) return { role: null, branches: [], userBranches: [], isAdminOrOwner: false }
    const role = acc.role || null
    const branches = acc.branches || []
    const isAdminOrOwner = ['admin', 'owner'].includes(role || '')
    return {
      role,
      branches,
      userBranches: branches,
      isAdminOrOwner
    }
  } catch (err) {
    console.error('Error fetching user permissions:', err)
    return { role: null, branches: [], userBranches: [], isAdminOrOwner: false }
  }
}
