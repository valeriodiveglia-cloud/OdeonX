import { NextRequest, NextResponse } from 'next/server'
import { authOr401 } from '@/lib/routeAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { Resend } from 'resend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder')

export async function POST(req: NextRequest) {
  try {
    const authResult = await authOr401()
    if (!authResult.ok) {
      return authResult.response
    }
    const { supabase } = authResult

    const { data: isOwner } = await supabase.rpc('app_is_owner')
    const { data: isAdmin } = await supabase.rpc('app_is_admin')
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { staffId, action } = await req.json()

    if (!staffId || typeof staffId !== 'string') {
      return NextResponse.json({ error: 'Staff ID is required' }, { status: 400 })
    }

    if (action !== 'enroll' && action !== 'reset') {
      return NextResponse.json({ error: 'Invalid action. Must be enroll or reset' }, { status: 400 })
    }

    // Retrieve staff member
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from('hr_staff')
      .select('id, full_name, email, status, portal_password_hash')
      .eq('id', staffId)
      .maybeSingle()

    if (staffErr || !staff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
    }

    if (staff.status !== 'active') {
      return NextResponse.json({ error: 'Staff member is not active' }, { status: 400 })
    }

    if (!staff.email || !staff.email.includes('@')) {
      return NextResponse.json({ error: 'Staff member does not have a valid email address' }, { status: 400 })
    }

    if (action === 'enroll' && staff.portal_password_hash) {
      return NextResponse.json({ error: 'Staff portal account is already active. Use reset instead.' }, { status: 400 })
    }

    // Base URL
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const activationLink = `${siteUrl}/staff-portal?enroll=${staff.id}`

    // Subject lines
    const subject = action === 'enroll'
      ? `👋 Chào mừng bạn gia nhập Pasta Fresca Team! / Welcome to the Pasta Fresca Team!`
      : `🔑 [Pasta Fresca Portal] Khôi phục mật khẩu cổng thông tin / Reset your portal password`

    // Configuration values based on action
    const fromEmail = action === 'enroll'
      ? 'Pasta Fresca Onboarding <no-reply@updates.pastafrescasaigon.com>'
      : 'Pasta Fresca Security <no-reply@updates.pastafrescasaigon.com>'

    const badgeText = action === 'enroll' ? 'Onboarding' : 'Security'
    const badgeStyle = 'background-color:rgba(37,99,235,0.08); border:1px solid rgba(37,99,235,0.25); color:#1d4ed8;'
    const updateLabel = action === 'enroll' ? 'Welcome Aboard' : 'Password Recovery'
    const themeColor = '#2563eb'
    const textEnColor = '#2563eb'
    const textEnSubColor = '#3b82f6'

    const titleVi = action === 'enroll' ? 'Chào Mừng Bạn Đến Với Pasta Fresca!' : 'Khôi Phục Mật Khẩu'
    const titleEn = action === 'enroll' ? 'Welcome to the Pasta Fresca Team!' : 'Reset Portal Password'
    
    const bodyVi = action === 'enroll'
      ? 'Chào mừng bạn gia nhập đội ngũ của chúng tôi! Đây là liên kết truy cập vào cổng thông tin nhân viên của bạn. Từ cổng thông tin này, bạn có thể xem lịch làm việc (roster) cũng như xem và quản lý các thông tin cá nhân của mình.'
      : 'Chúng tôi nhận được yêu cầu khôi phục mật khẩu cho tài khoản cổng thông tin nhân viên của bạn. Vui lòng nhấp vào liên kết bên dưới để thiết lập mật khẩu mới cho tài khoản của mình.'

    const bodyEn = action === 'enroll'
      ? 'Welcome aboard! This is the link to access your staff portal. From this portal, you will be able to view your roster, as well as check and manage your personal details.'
      : 'We received a request to reset your staff portal password. Please click the link below to set a new password for your account.'

    const ctaTextVi = action === 'enroll' ? 'Kích hoạt tài khoản &nbsp;→' : 'Đặt lại mật khẩu &nbsp;→'
    const ctaTextEn = action === 'enroll' ? 'Activate Account' : 'Reset Password'

    // Formatted date and Ref ID for tracking
    const formattedDate = new Date().toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
    const refId = staff.id.substring(0, 8).toUpperCase()

    // Email HTML template matching Roster updates style exactly
    const emailHtml = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
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
                  ${titleVi}
                </h1>

                <h2 style="margin:0; font-size:15px; line-height:1.45; font-weight:600; color:${textEnColor};">
                  ${titleEn}
                </h2>
              </div>

              <!-- Message Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:34px;">
                <tr>
                  <td style="border-left:4px solid ${themeColor}; background-color:#f8fafc; border-radius:0 16px 16px 0; padding:20px 22px;">
                    <p style="margin:0 0 14px 0; font-size:15px; line-height:1.65; color:#1e293b; font-weight:500;">
                      ${bodyVi}
                    </p>

                    <p style="margin:0; font-size:13px; line-height:1.6; color:${textEnColor}; font-weight:400; font-style:italic;">
                      ${bodyEn}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding-top:4px;">
                    <a 
                      href="${activationLink}" 
                      target="_blank" 
                      style="display:inline-block; background-color:#2563eb; color:#ffffff; text-decoration:none; border-radius:999px; padding:14px 34px; font-size:14px; line-height:1.2; font-weight:800; letter-spacing:0.1px; box-shadow:0 8px 18px rgba(37,99,235,0.22);"
                    >
                      ${ctaTextVi}
                    </a>

                    <p style="margin:10px 0 0 0; font-size:11.5px; line-height:1.4; color:${textEnSubColor};">
                      ${ctaTextEn}
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

    if (process.env.RESEND_API_KEY) {
      const emailRes = await resend.emails.send({
        from: fromEmail,
        to: staff.email,
        subject: subject,
        html: emailHtml
      })

      if (emailRes.error) {
        throw new Error(emailRes.error.message)
      }
    } else {
      console.warn('RESEND_API_KEY is not configured, printing mail activation link:', activationLink)
    }

    // If reset, we also clear the current portal_password_hash to force setup mode
    if (action === 'reset') {
      const { error: resetErr } = await supabaseAdmin
        .from('hr_staff')
        .update({ portal_password_hash: null })
        .eq('id', staff.id)

      if (resetErr) throw resetErr
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Error in staff-portal enroll API:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
