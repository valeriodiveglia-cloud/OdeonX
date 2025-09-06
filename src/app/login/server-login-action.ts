'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'

type Result = { ok: false; error: string }

export async function loginAction(formData: FormData): Promise<Result | void> {
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  const redirectTo = String(formData.get('redirect') || '/dashboard')
  if (!email || !password) return { ok: false, error: 'Missing credentials' }

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
            name,
            value,
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            ...(options || {}),
          })
        },
        remove(name: string, options?: any) {
          cookieStore.set({
            name,
            value: '',
            path: '/',
            maxAge: 0,
            ...(options || {}),
          })
        },
      },
    }
  )

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: error.message }

  redirect(redirectTo)
}
