// /src/app/api/partner-portal/data/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  try {
    const { partnerId } = await req.json()

    if (!partnerId || typeof partnerId !== 'string') {
      return NextResponse.json({ error: 'Partner ID richiesto' }, { status: 400 })
    }

    // Fetch partner info
    const { data: partner, error: partnerError } = await supabaseAdmin
      .from('crm_partners')
      .select('id, name, type, contact_name, email, phone, partner_code, status')
      .eq('id', partnerId)
      .single()

    if (partnerError || !partner) {
      return NextResponse.json({ error: 'Partner non trovato' }, { status: 404 })
    }

    // Fetch active agreement
    const { data: agreement } = await supabaseAdmin
      .from('crm_agreements')
      .select('commission_type, commission_value, client_discount_type, client_discount_value, status, valid_until')
      .eq('partner_id', partnerId)
      .eq('status', 'Active')
      .maybeSingle()

    // Fetch all referrals
    const { data: referrals } = await supabaseAdmin
      .from('crm_referrals')
      .select('id, guest_name, arrival_date, party_size, status, revenue_generated, commission_value, created_at')
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false })

    // Fetch all payouts
    const { data: payouts } = await supabaseAdmin
      .from('crm_payouts')
      .select('id, period, amount, status, payment_date, reference_number, created_at')
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false })

    // Calculate totals
    const allReferrals = referrals || []
    const allPayouts = payouts || []
    
    const totalCommissions = allReferrals.reduce((sum, r) => sum + (r.commission_value || 0), 0)
    const paidCommissions = allPayouts
      .filter(p => p.status === 'Paid')
      .reduce((sum, p) => sum + (p.amount || 0), 0)
    const pendingCommissions = totalCommissions - paidCommissions

    const totalReferrals = allReferrals.length
    const validatedReferrals = allReferrals.filter(r => r.status === 'Validated').length
    const pendingReferrals = allReferrals.filter(r => r.status === 'Pending').length

    return NextResponse.json({
      partner,
      agreement,
      referrals: allReferrals,
      payouts: allPayouts,
      summary: {
        totalCommissions,
        paidCommissions,
        pendingCommissions,
        totalReferrals,
        validatedReferrals,
        pendingReferrals
      }
    })
  } catch {
    return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 })
  }
}
