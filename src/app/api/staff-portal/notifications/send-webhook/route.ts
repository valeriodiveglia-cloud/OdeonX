import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import webpush from 'web-push'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

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
    const body = await request.json()

    // Verify webhook payload format
    if (body.type !== 'INSERT' || body.table !== 'hr_staff_notifications' || !body.record) {
      return NextResponse.json({ message: 'Ignore non-insert or non-notification webhooks' })
    }

    const record = body.record
    const staffId = record.staff_id

    // 1. Fetch staff member details (name & email)
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from('hr_staff')
      .select('full_name, email')
      .eq('id', staffId)
      .single()

    if (staffErr || !staff) {
      console.error('Error fetching staff for webhook:', staffErr)
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
    }

    // 2. Fetch all registered push subscriptions for this staff member
    const { data: subs, error: subsErr } = await supabaseAdmin
      .from('hr_staff_push_subscriptions')
      .select('*')
      .eq('staff_id', staffId)

    if (subsErr) {
      console.error('Error fetching push subscriptions for webhook:', subsErr)
    }

    // 3. Send Web Push notifications (if subscriptions exist)
    if (subs && subs.length > 0 && publicKey && privateKey) {
      const pushPayload = JSON.stringify({
        title: `${record.title_en} / ${record.title_vi}`,
        body: `${record.body_en}\n${record.body_vi}`,
        url: '/staff-portal'
      })

      await Promise.allSettled(
        subs.map(async (sub) => {
          try {
            await webpush.sendNotification(sub.subscription, pushPayload)
          } catch (err: any) {
            // Delete subscription if expired
            if (err.statusCode === 410 || err.statusCode === 404) {
              console.log('Expired push subscription found on webhook trigger, removing:', sub.id)
              await supabaseAdmin
                .from('hr_staff_push_subscriptions')
                .delete()
                .eq('id', sub.id)
            }
          }
        })
      )
    }

    // 4. Send Email via Resend (if staff email exists)
    if (staff.email && process.env.RESEND_API_KEY) {
      try {
        const fromEmail = 'Pasta Fresca Staff <no-reply@updates.pastafrescasaigon.com>'
        const portalUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/staff-portal`
        
        // Differentiate between Roster Updates and General Notifications
        const isRoster = record.category === 'roster'
        
        const subject = isRoster
          ? `🚨 [Pasta Fresca Roster] ${record.title_vi} | ${record.title_en}`
          : `[Pasta Fresca Update] ${record.title_vi} | ${record.title_en}`
          
        const badgeText = isRoster ? 'Roster Update' : 'Notification'
        
        const badgeStyle = isRoster
          ? 'background-color:rgba(239, 68, 68, 0.08); border:1px solid rgba(239, 68, 68, 0.25); color:#dc2626;'
          : 'background-color:rgba(37,99,235,0.08); border:1px solid rgba(37,99,235,0.25); color:#1d4ed8;'
          
        const updateLabel = isRoster ? 'Roster Update' : 'Staff Update'
        const themeColor = isRoster ? '#dc2626' : '#2563eb'
        const textEnColor = '#2563eb'
        const textEnSubColor = '#3b82f6'
        const formattedDate = new Date(record.created_at || new Date()).toLocaleString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        })
        const refId = record.id ? record.id.substring(0, 8) : Math.random().toString(36).substring(2, 10).toUpperCase()

        await resend.emails.send({
          from: fromEmail,
          to: staff.email,
          subject: subject,
          html: `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OddsOff Staff Notification</title>
</head>

<body style="margin:0; padding:0; background-color:#f3f6fa; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing:antialiased;">

  <!-- Background -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; background-color:#f3f6fa; padding:40px 16px;">
    <tr>
      <td align="center">

        <!-- Main Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; max-width:600px; background-color:#ffffff; border-radius:26px; overflow:hidden; border:1px solid #dbe3ee; box-shadow:0 12px 32px rgba(15,23,42,0.07);">

          <!-- Top Brand Bar -->
          <tr>
            <td style="background-color:#eff6ff; padding:0; border-bottom:1.5px solid rgba(15,23,42,0.06);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:22px 28px; text-align:left; vertical-align:middle;">
                    <!-- Logo + Text alignment -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="display:inline-block; vertical-align:middle;">
                      <tr>
                        <td style="vertical-align:middle;">
                          <img 
                            src="https://vwzvwxrltlfjuqzdxnac.supabase.co/storage/v1/object/public/app-assets/logos/Logo_OddsOff_stroke.png" 
                            alt="OddsOff" 
                            style="display:block; height:48px; width:auto; border:0; outline:none;"
                          >
                        </td>
                        <td style="vertical-align:middle; padding-left:14px;">
                          <div style="height:20px; border-left:1.5px solid rgba(15,23,42,0.15); font-size:0; line-height:0;">&nbsp;</div>
                        </td>
                        <td style="vertical-align:middle; padding-left:14px;">
                          <span style="font-size:14px; font-weight:800; color:#1e293b; letter-spacing:1.5px; text-transform:uppercase;">
                            Staff
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="padding:22px 28px; text-align:right; vertical-align:middle;">
                    <span style="display:inline-block; padding:6px 12px; border-radius:999px; font-size:11px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; ${badgeStyle}">
                      ${badgeText}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>



          <!-- Body -->
          <tr>
            <td style="padding:38px 34px 42px 34px;">

              <!-- Logo Pasta Fresca -->
              <div style="text-align:center; margin-bottom:32px;">
                <img 
                  src="https://vwzvwxrltlfjuqzdxnac.supabase.co/storage/v1/object/public/app-assets/logos/company.png" 
                  alt="Pasta Fresca Saigon" 
                  style="display:inline-block; max-height:64px; height:auto; max-width:210px; border:0; outline:none; text-decoration:none;"
                >
              </div>

              <!-- Greeting Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:18px; padding:18px 20px;">
                    <p style="margin:0; font-size:15px; line-height:1.5; color:#475569; font-weight:500;">
                      Xin chào 
                      <strong style="color:#0f172a; font-weight:800;">${staff.full_name}</strong>
                    </p>
                    <p style="margin:3px 0 0 0; font-size:12.5px; line-height:1.5; color:${textEnSubColor};">
                      Hello ${staff.full_name}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Title -->
              <div style="margin-bottom:22px;">
                <p style="margin:0 0 8px 0; font-size:11px; line-height:1.3; color:${themeColor}; font-weight:800; letter-spacing:1.3px; text-transform:uppercase;">
                  ${updateLabel}
                </p>

                <h1 style="margin:0 0 7px 0; font-size:24px; line-height:1.25; font-weight:850; color:#0f172a; letter-spacing:-0.6px;">
                  ${record.title_vi}
                </h1>

                <h2 style="margin:0; font-size:15px; line-height:1.45; font-weight:600; color:${textEnColor};">
                  ${record.title_en}
                </h2>
              </div>

              <!-- Message Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:34px;">
                <tr>
                  <td style="border-left:4px solid ${themeColor}; background-color:#f8fafc; border-radius:0 16px 16px 0; padding:20px 22px;">
                    <p style="margin:0 0 14px 0; font-size:15px; line-height:1.65; color:#1e293b; font-weight:500;">
                      ${record.body_vi}
                    </p>

                    <p style="margin:0; font-size:13px; line-height:1.6; color:${textEnColor}; font-weight:400; font-style:italic;">
                      ${record.body_en}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding-top:4px;">
                    <a 
                      href="${portalUrl}" 
                      target="_blank" 
                      style="display:inline-block; background-color:#2563eb; color:#ffffff; text-decoration:none; border-radius:999px; padding:14px 34px; font-size:14px; line-height:1.2; font-weight:800; letter-spacing:0.1px; box-shadow:0 8px 18px rgba(37,99,235,0.22);"
                    >
                      Mở cổng nhân viên &nbsp;→
                    </a>

                    <p style="margin:10px 0 0 0; font-size:11.5px; line-height:1.4; color:${textEnSubColor};">
                      Open Staff Portal
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc; border-top:1px solid #e2e8f0; padding:24px 28px 28px 28px; text-align:center;">

              <p style="margin:0 0 7px 0; font-size:12px; line-height:1.4; color:#475569; font-weight:800;">
                OddsOff ERP · Integrated Restaurant Management Platform
              </p>

              <p style="margin:0; font-size:10.5px; line-height:1.55; color:#94a3b8;">
                Đây là thông báo tự động. Vui lòng không trả lời trực tiếp email này.<br>
                This is an automated notification. Please do not reply directly to this email.
              </p>

            </td>
          </tr>

        </table>

        <!-- Outer Footer -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; max-width:600px;">
          <tr>
            <td align="center" style="padding:18px 10px 0 10px;">
              <p style="margin:0; font-size:10.5px; line-height:1.5; color:#94a3b8;">
                Pasta Fresca Saigon · Internal Staff Communication
                <br>
                <span style="font-size:9.5px; color:#cbd5e1; font-weight:500;">Ref: #${refId} (Sent: ${formattedDate})</span>
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>
</html>
          `
        })
      } catch (emailErr) {
        console.error('Error sending email via Resend:', emailErr)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Send webhook API route error:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
