// /src/app/api/partner-portal/setup-password/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  try {
    const { partnerCode, newPassword } = await req.json()

    if (!partnerCode || typeof partnerCode !== 'string') {
      return NextResponse.json({ error: 'Codice partner richiesto' }, { status: 400 })
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json({ error: 'La password deve avere almeno 6 caratteri' }, { status: 400 })
    }

    // Find partner by code
    const { data: partner, error } = await supabaseAdmin
      .from('crm_partners')
      .select('id, name, partner_password_hash, status')
      .eq('partner_code', partnerCode.trim())
      .maybeSingle()

    if (error || !partner) {
      return NextResponse.json({ error: 'Partner non trovato' }, { status: 404 })
    }

    // Only allow setup if password is not yet set
    if (partner.partner_password_hash) {
      return NextResponse.json({ error: 'Password già impostata. Contatta il ristorante per il reset.' }, { status: 400 })
    }

    // Check if partner is active
    if (partner.status !== 'Active' && partner.status !== 'Negotiating') {
      return NextResponse.json({ error: 'Account partner non attivo' }, { status: 403 })
    }

    // Hash and save password
    const hash = await bcrypt.hash(newPassword, 12)

    const { error: updateError } = await supabaseAdmin
      .from('crm_partners')
      .update({
        partner_password_hash: hash,
        failed_login_attempts: 0,
        locked_until: null
      })
      .eq('id', partner.id)

    if (updateError) {
      return NextResponse.json({ error: 'Errore nel salvataggio della password' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      partnerId: partner.id
    })
  } catch {
    return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 })
  }
}
