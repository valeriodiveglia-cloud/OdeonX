// /src/app/api/staff-portal/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

// Simple public supabase client to verify standard Supabase Auth passwords
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  try {
    const { identifier, password } = await req.json()

    if (!identifier || typeof identifier !== 'string') {
      return NextResponse.json({ error: 'Email or phone number required' }, { status: 400 })
    }

    const trimmed = identifier.trim()
    
    // Find staff member by email or phone (case-insensitive)
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from('hr_staff')
      .select('id, full_name, email, phone, portal_password_hash, failed_login_attempts, locked_until, status')
      .or(`email.ilike.${trimmed},phone.eq.${trimmed}`)
      .maybeSingle()

    if (staffErr || !staff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
    }

    // Only active staff can access the portal
    if (staff.status !== 'active') {
      return NextResponse.json({ error: 'Staff account is not active' }, { status: 403 })
    }

    // Rate limiting check
    if (staff.locked_until && new Date(staff.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(staff.locked_until).getTime() - Date.now()) / 60000)
      return NextResponse.json({
        error: `Too many attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
        locked: true,
        minutesLeft
      }, { status: 429 })
    }

    // If portal password is set, verify using bcrypt
    if (staff.portal_password_hash) {
      if (!password || typeof password !== 'string') {
        return NextResponse.json({ error: 'Password required' }, { status: 400 })
      }

      const valid = await bcrypt.compare(password, staff.portal_password_hash)
      if (valid) {
        // Reset failed login attempts
        await supabaseAdmin
          .from('hr_staff')
          .update({ failed_login_attempts: 0, locked_until: null })
          .eq('id', staff.id)

        return NextResponse.json({
          success: true,
          staffId: staff.id,
          staffName: staff.full_name
        })
      } else {
        return await handleFailedAttempt(staff)
      }
    }

    // If portal password is NOT set, try logging in with standard Supabase Auth if email is available
    if (staff.email && password) {
      try {
        const { data: authData, error: authError } = await supabaseAnon.auth.signInWithPassword({
          email: staff.email.trim(),
          password
        })

        if (!authError && authData?.user) {
          // Success standard login -> reset portal login attempts
          await supabaseAdmin
            .from('hr_staff')
            .update({ failed_login_attempts: 0, locked_until: null })
            .eq('id', staff.id)

          return NextResponse.json({
            success: true,
            staffId: staff.id,
            staffName: staff.full_name
          })
        }
      } catch (e) {
        console.error('Error verifying against Supabase Auth:', e)
      }
    }

    // If it reaches here, no portal password is set AND standard auth failed/was not provided
    // This is treated as "First access setup"
    return NextResponse.json({
      needsSetup: true,
      staffId: staff.id,
      staffName: staff.full_name,
      email: staff.email,
      phone: staff.phone
    })

  } catch (err) {
    console.error('Staff portal login exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleFailedAttempt(staff: any) {
  const attempts = (staff.failed_login_attempts || 0) + 1
  const updateData: Record<string, any> = { failed_login_attempts: attempts }

  if (attempts >= 5) {
    updateData.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    updateData.failed_login_attempts = 0
  }

  await supabaseAdmin
    .from('hr_staff')
    .update(updateData)
    .eq('id', staff.id)

  if (attempts >= 5) {
    return NextResponse.json({
      error: 'Too many attempts. Account locked for 15 minutes.',
      locked: true,
      minutesLeft: 15
    }, { status: 429 })
  }

  return NextResponse.json({
    error: 'Incorrect password',
    attemptsLeft: 5 - attempts
  }, { status: 401 })
}
