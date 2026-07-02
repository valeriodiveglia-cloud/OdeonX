import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import webpush from 'web-push'

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const privateKey = process.env.VAPID_PRIVATE_KEY

if (publicKey && privateKey) {
  webpush.setVapidDetails(
    'mailto:support@pastafrescasaigon.com',
    publicKey,
    privateKey
  )
}

export async function POST(request: Request) {
  try {
    const { staffId } = await request.json()

    if (!staffId) {
      return NextResponse.json({ error: 'Missing staffId' }, { status: 400 })
    }

    if (!publicKey || !privateKey) {
      return NextResponse.json({ error: 'VAPID keys not configured on server' }, { status: 500 })
    }

    // Get all subscriptions for this staff member
    const { data: subs, error } = await supabaseAdmin
      .from('hr_staff_push_subscriptions')
      .select('*')
      .eq('staff_id', staffId)

    if (error) {
      console.error('Error fetching subscriptions:', error)
      return NextResponse.json({ error: 'Database fetch error' }, { status: 500 })
    }

    if (!subs || subs.length === 0) {
      return NextResponse.json({ error: 'No registered push subscriptions found for this user' }, { status: 404 })
    }

    const payload = JSON.stringify({
      title: 'OddsOff Test Notification',
      body: 'This is a test notification to verify your device works properly.',
      url: '/staff-portal'
    })

    const results = await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(sub.subscription, payload)
        } catch (err: any) {
          // If the subscription is no longer active (410 Gone / 404 Not Found), delete it
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.log('Push subscription expired or deleted by user, removing from DB:', sub.id)
            await supabaseAdmin
              .from('hr_staff_push_subscriptions')
              .delete()
              .eq('id', sub.id)
          }
          throw err
        }
      })
    )

    return NextResponse.json({ success: true, resultsCount: results.length })
  } catch (err: any) {
    console.error('Test push route error:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
