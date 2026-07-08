import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id || typeof id !== 'string' || id.length < 20) {
      return NextResponse.json({ error: 'Valid Staff ID is required' }, { status: 400 })
    }

    // Retrieve active staff member details
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from('hr_staff')
      .select('id, full_name, email, phone, status, portal_password_hash')
      .eq('id', id)
      .maybeSingle()

    if (staffErr || !staff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
    }

    if (staff.status !== 'active') {
      return NextResponse.json({ error: 'Staff member is not active' }, { status: 400 })
    }

    return NextResponse.json({
      id: staff.id,
      full_name: staff.full_name,
      email: staff.email,
      phone: staff.phone,
      hasPassword: !!staff.portal_password_hash
    })
  } catch (err: any) {
    console.error('Error in staff-portal enroll-info API:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
