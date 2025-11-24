// src/app/auth/signout/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

async function doSignOut(request: NextRequest): Promise<NextResponse> {
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
          try { jar.set({ name, value, ...(options || {}) }) } catch { }
        },
        remove(name: string, options?: any) {
          try { jar.set({ name, value: '', ...(options || {}) }) } catch { }
        },
      },
    }
  ) as unknown as SupabaseClient

  await supabase.auth.signOut()

  // Use request.url to ensure we redirect to the correct origin (e.g. localhost:3000, localhost:3001, production domain)
  return NextResponse.redirect(new URL('/login', request.url))
}

export async function POST(request: NextRequest) { return doSignOut(request) }
export async function GET(request: NextRequest) { return doSignOut(request) }
