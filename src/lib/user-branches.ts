import { supabase } from '@/lib/supabase_shim'

export interface UserPermissions {
  role: string | null
  userBranches: string[]
  isAdminOrOwner: boolean
}

let cachedPermissions: UserPermissions | null = null

export async function getCurrentUserPermissions(forceRefresh = false): Promise<UserPermissions> {
  if (cachedPermissions && !forceRefresh) {
    return cachedPermissions
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { role: null, userBranches: [], isAdminOrOwner: false }
    }

    const { data, error } = await supabase
      .from('app_accounts')
      .select('role, branches')
      .eq('user_id', user.id)
      .single()

    if (error) {
      console.error('Error loading app_account for user permissions:', error)
      return { role: null, userBranches: [], isAdminOrOwner: false }
    }

    const role = data?.role || null
    const userBranches = data?.branches || []
    const isAdminOrOwner = role === 'admin' || role === 'owner'

    cachedPermissions = {
      role,
      userBranches,
      isAdminOrOwner,
    }

    return cachedPermissions
  } catch (error) {
    console.error('Failed to get current user permissions:', error)
    return { role: null, userBranches: [], isAdminOrOwner: false }
  }
}
