// src/app/auth/signout/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

async function doSignOut(): Promise<NextResponse> {
  const jar = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return jar.get(name)?.value
        },
        set(name: string, value: string, options?: any) {
          try { jar.set({ name, value, ...(options || {}) }) } catch {}
        },
        remove(name: string, options?: any) {
          try { jar.set({ name, value: '', ...(options || {}) }) } catch {}
        },
      },
    }
  ) as unknown as SupabaseClient

  await supabase.auth.signOut()
  const res = NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'))
  return res
}

export async function POST() { return doSignOut() }
export async function GET()  { return doSignOut() }
