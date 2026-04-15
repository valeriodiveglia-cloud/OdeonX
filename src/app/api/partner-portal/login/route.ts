// /src/app/api/partner-portal/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  try {
    const { identifier, password } = await req.json()

    if (!identifier || typeof identifier !== 'string') {
      return NextResponse.json({ error: 'Codice partner o numero di telefono richiesto' }, { status: 400 })
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
      // Auto-prepend PT- if missing
      const code = trimmed.toUpperCase().startsWith('PT-') ? trimmed.toUpperCase() : `PT-${trimmed.toUpperCase()}`
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
      return NextResponse.json({ error: 'Partner non trovato' }, { status: 404 })
    }

    // Check if partner is active
    if (partner.status !== 'Active' && partner.status !== 'Negotiating') {
      return NextResponse.json({ error: 'Account partner non attivo' }, { status: 403 })
    }

    // Check rate limiting
    if (partner.locked_until && new Date(partner.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(partner.locked_until).getTime() - Date.now()) / 60000)
      return NextResponse.json({
        error: `Troppi tentativi. Riprova tra ${minutesLeft} minut${minutesLeft === 1 ? 'o' : 'i'}.`,
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
      return NextResponse.json({ error: 'Password richiesta' }, { status: 400 })
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
          error: 'Troppi tentativi. Account bloccato per 15 minuti.',
          locked: true,
          minutesLeft: 15
        }, { status: 429 })
      }

      return NextResponse.json({
        error: 'Password errata',
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
    return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 })
  }
}
