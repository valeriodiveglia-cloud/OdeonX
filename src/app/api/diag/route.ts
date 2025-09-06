import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

export async function GET() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options?: any) {
          cookieStore.set({
            name, value,
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            ...(options || {}),
          })
        },
        remove(name: string, options?: any) {
          cookieStore.set({
            name, value: '',
            path: '/',
            maxAge: 0,
            ...(options || {}),
          })
        },
      },
    }
  )

  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user ?? null

  let role: string | null = null
  if (user) {
    const { data } = await supabase
      .from('app_accounts')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
    role = (data as any)?.role ?? null
  }

  const cookieNames = cookieStore.getAll().map(c => c.name).sort()

  return NextResponse.json({
    cookieNames,
    userId: user?.id ?? null,
    email: user?.email ?? null,
    role,
  })
}
