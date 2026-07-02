import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: NextRequest) {
  try {
    const { staffId, notificationId, all } = await req.json()

    if (!staffId || typeof staffId !== 'string') {
      return NextResponse.json({ error: 'Staff ID required' }, { status: 400 })
    }

    if (all) {
      const { error } = await supabaseAdmin
        .from('hr_staff_notifications')
        .update({ is_read: true })
        .eq('staff_id', staffId)
        .eq('is_read', false)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else if (notificationId) {
      const { error } = await supabaseAdmin
        .from('hr_staff_notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('staff_id', staffId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      return NextResponse.json({ error: 'Notification ID or all flag required' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Error marking notifications as read:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
