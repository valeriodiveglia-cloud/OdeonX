// /src/app/api/staff-portal/setup-password/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  try {
    const { staffId, newPassword } = await req.json()

    if (!staffId || typeof staffId !== 'string') {
      return NextResponse.json({ error: 'Staff ID required' }, { status: 400 })
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // Find staff member
    const { data: staff, error } = await supabaseAdmin
      .from('hr_staff')
      .select('id, portal_password_hash, status')
      .eq('id', staffId)
      .maybeSingle()

    if (error || !staff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
    }

    if (staff.status !== 'active') {
      return NextResponse.json({ error: 'Staff account is not active' }, { status: 403 })
    }

    // Only allow setup if password is not yet set
    if (staff.portal_password_hash) {
      return NextResponse.json({ error: 'Password already set. Contact HR to reset.' }, { status: 400 })
    }

    // Hash and save password
    const hash = await bcrypt.hash(newPassword, 12)

    const { error: updateError } = await supabaseAdmin
      .from('hr_staff')
      .update({
        portal_password_hash: hash,
        failed_login_attempts: 0,
        locked_until: null
      })
      .eq('id', staff.id)

    if (updateError) {
      return NextResponse.json({ error: 'Error saving password' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      staffId: staff.id
    })
  } catch (err) {
    console.error('Staff portal setup-password exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
