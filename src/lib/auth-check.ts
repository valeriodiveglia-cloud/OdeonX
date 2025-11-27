import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function requireAuth() {
    const cookieStore = await cookies()

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    return user
}

export async function requireRole(allowedRoles: string[]) {
    const user = await requireAuth()

    // Check role in app_accounts
    const { supaService } = await import('@/lib/server/auth')

    const { data: account } = await supaService
        .from('app_accounts')
        .select('role')
        .eq('user_id', user.id)
        .single()

    const role = account?.role || 'staff'

    if (!allowedRoles.includes(role)) {
        redirect('/dashboard')
    }

    return { user, role }
}
