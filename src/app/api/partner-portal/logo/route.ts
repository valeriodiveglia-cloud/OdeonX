// /src/app/api/partner-portal/logo/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  try {
    // Get logo_data from app_settings
    const { data: settings } = await supabaseAdmin
      .from('app_settings')
      .select('logo_data, logo_mime')
      .limit(1)
      .maybeSingle()

    if (!settings?.logo_data) {
      return NextResponse.json({ url: null })
    }

    const token = settings.logo_data
    if (token.startsWith('storage:')) {
      const path = token.replace('storage:', '')
      const { data } = await supabaseAdmin.storage
        .from('app-assets')
        .createSignedUrl(path, 3600) // 1 hour
      return NextResponse.json({ url: data?.signedUrl || null })
    }

    // Legacy base64
    if (token.startsWith('data:')) {
      return NextResponse.json({ url: token })
    }
    if (settings.logo_mime) {
      return NextResponse.json({ url: `data:${settings.logo_mime};base64,${token}` })
    }

    return NextResponse.json({ url: null })
  } catch {
    return NextResponse.json({ url: null })
  }
}
