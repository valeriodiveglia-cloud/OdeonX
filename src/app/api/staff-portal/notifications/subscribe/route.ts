import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request) {
  try {
    const { staffId, subscription } = await request.json()

    if (!staffId || !subscription || !subscription.endpoint) {
      return NextResponse.json({ error: 'Missing staffId or subscription object' }, { status: 400 })
    }

    // Check if subscription already exists for this staff member and endpoint
    const { data: existing, error: selectErr } = await supabaseAdmin
      .from('hr_staff_push_subscriptions')
      .select('id')
      .eq('staff_id', staffId)
      .eq('subscription->>endpoint', subscription.endpoint)
      .maybeSingle()

    if (selectErr) {
      console.error('Error selecting push subscription:', selectErr)
      return NextResponse.json({ error: 'Database selection error' }, { status: 500 })
    }

    if (existing) {
      // Update subscription keys just in case they refreshed
      const { error: updateErr } = await supabaseAdmin
        .from('hr_staff_push_subscriptions')
        .update({ subscription })
        .eq('id', existing.id)

      if (updateErr) {
        console.error('Error updating push subscription:', updateErr)
        return NextResponse.json({ error: 'Database update error' }, { status: 500 })
      }
    } else {
      // Insert new subscription
      const { error: insertErr } = await supabaseAdmin
        .from('hr_staff_push_subscriptions')
        .insert({
          staff_id: staffId,
          subscription
        })

      if (insertErr) {
        console.error('Error inserting push subscription:', insertErr)
        return NextResponse.json({ error: 'Database insertion error' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Subscribe endpoint error:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
