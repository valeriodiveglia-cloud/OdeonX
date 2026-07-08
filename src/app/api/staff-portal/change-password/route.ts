import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import bcrypt from 'bcryptjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { staffId, currentPassword, newPassword } = await req.json()

    if (!staffId || typeof staffId !== 'string') {
      return NextResponse.json({ error: 'Staff ID required' }, { status: 400 })
    }

    if (!currentPassword || typeof currentPassword !== 'string') {
      return NextResponse.json({ error: 'Current password required' }, { status: 400 })
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 })
    }

    // Retrieve staff member details
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

    if (!staff.portal_password_hash) {
      return NextResponse.json({ error: 'No password set yet. Please set up password first.' }, { status: 400 })
    }

    // Verify current password
    const match = await bcrypt.compare(currentPassword, staff.portal_password_hash)
    if (!match) {
      return NextResponse.json({ error: 'Incorrect current password' }, { status: 400 })
    }

    // Hash and save new password
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
      return NextResponse.json({ error: 'Error saving new password' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Staff portal change-password exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
