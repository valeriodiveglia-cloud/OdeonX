// /src/app/api/partner-portal/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  try {
    const { identifier, password } = await req.json()

    if (!identifier || typeof identifier !== 'string') {
      return NextResponse.json({ error: 'Partner code or phone number required' }, { status: 400 })
    }

    // Find partner by code or phone
    const trimmed = identifier.trim()
    
    // Auto-detect: if it looks like a phone number search by phone, otherwise search by partner_code
    const isPhone = /^\+?\d[\d\s-]{5,}$/.test(trimmed)
    
    let partner = null
    
    if (isPhone) {
      const { data, error } = await supabaseAdmin
        .from('crm_partners')
        .select('id, name, partner_code, phone, partner_password_hash, failed_login_attempts, locked_until, status')
        .eq('phone', trimmed)
        .maybeSingle()
      console.log('[partner-portal/login] phone lookup:', { trimmed, data: !!data, error })
      partner = data
    } else {
      const code = trimmed.toUpperCase()
      console.log('[partner-portal/login] code lookup:', { input: trimmed, resolved: code })
      const { data, error } = await supabaseAdmin
        .from('crm_partners')
        .select('id, name, partner_code, phone, partner_password_hash, failed_login_attempts, locked_until, status')
        .eq('partner_code', code)
        .maybeSingle()
      console.log('[partner-portal/login] code result:', { found: !!data, error, dataName: data?.name })
      partner = data
    }

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
    }

    // Check if partner is active
    const allowedStatuses = ['Active', 'Negotiating', 'Waiting for Activation']
    if (!allowedStatuses.includes(partner.status)) {
      return NextResponse.json({ error: 'Partner account is not active' }, { status: 403 })
    }

    // Check rate limiting
    if (partner.locked_until && new Date(partner.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(partner.locked_until).getTime() - Date.now()) / 60000)
      return NextResponse.json({
        error: `Too many attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
        locked: true,
        minutesLeft
      }, { status: 429 })
    }

    // First access — password not set yet
    if (!partner.partner_password_hash) {
      return NextResponse.json({
        needsSetup: true,
        partnerCode: partner.partner_code,
        partnerName: partner.name
      })
    }

    // Verify password
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password required' }, { status: 400 })
    }

    const valid = await bcrypt.compare(password, partner.partner_password_hash)

    if (!valid) {
      // Increment failed attempts
      const attempts = (partner.failed_login_attempts || 0) + 1
      const updateData: Record<string, unknown> = { failed_login_attempts: attempts }

      if (attempts >= 5) {
        updateData.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString()
        updateData.failed_login_attempts = 0
      }

      await supabaseAdmin
        .from('crm_partners')
        .update(updateData)
        .eq('id', partner.id)

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

    // Login successful — reset attempts
    await supabaseAdmin
      .from('crm_partners')
      .update({ failed_login_attempts: 0, locked_until: null })
      .eq('id', partner.id)

    return NextResponse.json({
      success: true,
      partnerId: partner.id
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
