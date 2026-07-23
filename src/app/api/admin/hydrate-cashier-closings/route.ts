import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authOr401 } from '@/lib/routeAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getCukCukBranchId(name: string): string | null {
  const norm = (name || '').toLowerCase().trim()
  if (norm.includes('thao dien') || norm.includes('garden')) {
    return '994c6fe5-da83-441b-a0e8-57a6fed98fb2' // Pasta Fresca Garden
  }
  if (norm.includes('thanh my loi') || norm.includes('thạnh mỹ lợi')) {
    return '771337d9-e174-4cff-ae0f-b71ec74ad69a' // Pasta Fresca Thanh My Loi
  }
  if (norm.includes('da lat') || norm.includes('đà lạt')) {
    return 'b08a50fc-ae36-4aeb-bc3a-a0a1b19bcc62' // Pasta Fresca Đà Lạt
  }
  return null
}

async function getCukCukHeaders() {
  const APP_ID = process.env.CUKCUK_APP_ID
  const PASS_CODE = process.env.CUKCUK_PASS_CODE
  const DOMAIN = process.env.CUKCUK_DOMAIN

  if (!APP_ID || !PASS_CODE || !DOMAIN) {
    throw new Error('CukCuk credentials missing in environment')
  }

  const loginTime = new Date().toISOString().split('.')[0] + 'Z'
  const loginPayload = { AppID: APP_ID, Domain: DOMAIN, LoginTime: loginTime }
  const signature = crypto.createHmac('sha256', PASS_CODE).update(JSON.stringify(loginPayload)).digest('hex')

  const loginRes = await fetch('https://graphapi.cukcuk.vn/api/Account/Login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...loginPayload, SignatureInfo: signature }),
    cache: 'no-store'
  })

  const loginData = await loginRes.json()
  if (!loginData.Success || !loginData.Data) {
    throw new Error(`CukCuk login failed: ${JSON.stringify(loginData)}`)
  }

  const { AccessToken, CompanyCode } = loginData.Data
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${AccessToken}`,
    'CompanyCode': CompanyCode
  }
}

async function fetchCukCukTotalsForBranchAndDate(headers: Record<string, string>, branchName: string, dateStr: string) {
  const cukcukBranchId = getCukCukBranchId(branchName)
  if (!cukcukBranchId) {
    return null
  }

  const fromDateStr = `${dateStr}T00:00:00`
  const toDateStr = `${dateStr}T23:59:59`

  const initialRes = await fetch('https://graphapi.cukcuk.vn/api/v1/sainvoices/paging', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      Page: 1,
      Limit: 1,
      BranchId: cukcukBranchId,
      FromDate: fromDateStr,
      ToDate: toDateStr,
      RefDateFrom: fromDateStr,
      RefDateTo: toDateStr
    }),
    cache: 'no-store'
  })
  const initialData = await initialRes.json()
  if (!initialData.Success) {
    return null
  }

  const total = initialData.Total || 0
  const limit = 100
  const lastPage = Math.ceil(total / limit) || 1

  const allInvoices: any[] = []
  for (let page = lastPage; page >= 1; page--) {
    try {
      const pageRes = await fetch('https://graphapi.cukcuk.vn/api/v1/sainvoices/paging', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          Page: page,
          Limit: limit,
          BranchId: cukcukBranchId,
          FromDate: fromDateStr,
          ToDate: toDateStr,
          RefDateFrom: fromDateStr,
          RefDateTo: toDateStr
        }),
        cache: 'no-store'
      })
      const pageData = await pageRes.json()
      if (pageData.Success && Array.isArray(pageData.Data)) {
        const items = pageData.Data
        allInvoices.push(...items)
      }
    } catch (err) {
      console.error(`[Hydrate] Error fetching page ${page}:`, err)
    }
  }

  const dayInvoices = allInvoices.filter(inv =>
    inv.PaymentStatus !== 4 &&
    inv.PaymentStatus !== 1 &&
    inv.RefDate &&
    inv.RefDate.startsWith(dateStr)
  )

  let posGrossRevenue = 0
  let posDiscount = 0
  let posServiceCharge = 0

  dayInvoices.forEach(inv => {
    const grossAmt = Math.round(inv.Amount || inv.TotalItemAmount || 0)
    posGrossRevenue += grossAmt
    posDiscount += Math.round((inv.DiscountAmount || 0) + (inv.PromotionAmount || 0))

    const isDineIn = inv.TableName && inv.TableName.trim() !== ''
    if (isDineIn) {
      posServiceCharge += Math.round(grossAmt * 0.05)
    }
  })

  return {
    posGrossRevenue,
    posDiscount,
    posServiceCharge,
    invoicesCount: dayInvoices.length
  }
}

export async function GET(req: Request) {
  try {
    const auth = await authOr401()
    if (!auth.ok) {
      return auth.response
    }

    const urlObj = new URL(req.url)
    const mode = urlObj.searchParams.get('mode') || 'test' // 'test' (1 record) or 'full' (all affected)
    const targetId = urlObj.searchParams.get('id')
    const targetDate = urlObj.searchParams.get('date')

    // Query cashier_closings
    let query = supabaseAdmin
      .from('cashier_closings')
      .select('id, report_date, branch_name, revenue_vnd, gross_revenue_vnd, service_charge_vnd, discount_vnd, updated_at, updated_by, created_at, created_by, cashier_name')
      .order('report_date', { ascending: false })

    if (targetId) {
      query = query.eq('id', targetId)
    } else if (targetDate) {
      query = query.eq('report_date', targetDate)
    }

    if (mode === 'test' && !targetId && !targetDate) {
      query = query.limit(1)
    }

    const { data: closings, error: fetchErr } = await query
    if (fetchErr) {
      return NextResponse.json({ error: `DB query error: ${fetchErr.message}` }, { status: 500 })
    }

    if (!closings || closings.length === 0) {
      return NextResponse.json({ success: true, message: 'No closings found matching criteria', processedCount: 0 })
    }

    let cukcukHeaders: Record<string, string> | null = null
    try {
      cukcukHeaders = await getCukCukHeaders()
    } catch (err: any) {
      return NextResponse.json({ error: `CukCuk Auth Error: ${err.message}` }, { status: 502 })
    }

    const results: any[] = []

    for (const closing of closings) {
      const dateStr = closing.report_date
      const branchName = closing.branch_name

      if (!dateStr || !branchName) {
        continue
      }

      const totals = await fetchCukCukTotalsForBranchAndDate(cukcukHeaders, branchName, dateStr)
      if (!totals) {
        results.push({
          id: closing.id,
          report_date: dateStr,
          branch_name: branchName,
          status: 'skipped_no_cukcuk_data'
        })
        continue
      }

      const newServiceCharge = totals.posServiceCharge
      const newGrossRevenue = totals.posGrossRevenue > 0 ? totals.posGrossRevenue : Number(closing.gross_revenue_vnd || closing.revenue_vnd || 0)
      const discountVnd = Number(closing.discount_vnd || totals.posDiscount || 0)
      const newRevenue = newGrossRevenue + newServiceCharge - discountVnd

      const origUpdatedAt = closing.updated_at
      const origUpdatedBy = closing.updated_by

      const { error: updateErr } = await supabaseAdmin
        .from('cashier_closings')
        .update({
          service_charge_vnd: newServiceCharge,
          gross_revenue_vnd: newGrossRevenue,
          revenue_vnd: newRevenue,
          updated_at: origUpdatedAt,
          updated_by: origUpdatedBy
        })
        .eq('id', closing.id)

      if (updateErr) {
        results.push({
          id: closing.id,
          report_date: dateStr,
          branch_name: branchName,
          status: 'error',
          error: updateErr.message
        })
      } else {
        // Verification fetch to confirm updated_at/updated_by remained untouched
        const { data: updatedRow } = await supabaseAdmin
          .from('cashier_closings')
          .select('updated_at, updated_by, service_charge_vnd, gross_revenue_vnd, revenue_vnd')
          .eq('id', closing.id)
          .single()

        results.push({
          id: closing.id,
          report_date: dateStr,
          branch_name: branchName,
          status: 'success',
          before: {
            service_charge_vnd: closing.service_charge_vnd,
            gross_revenue_vnd: closing.gross_revenue_vnd,
            revenue_vnd: closing.revenue_vnd,
            updated_at: origUpdatedAt,
            updated_by: origUpdatedBy
          },
          after: {
            service_charge_vnd: updatedRow?.service_charge_vnd,
            gross_revenue_vnd: updatedRow?.gross_revenue_vnd,
            revenue_vnd: updatedRow?.revenue_vnd,
            updated_at: updatedRow?.updated_at,
            updated_by: updatedRow?.updated_by
          },
          preserved: {
            updated_at: updatedRow?.updated_at === origUpdatedAt,
            updated_by: updatedRow?.updated_by === origUpdatedBy
          }
        })
      }
    }

    return NextResponse.json({
      success: true,
      mode,
      processedCount: results.length,
      results
    })

  } catch (err: any) {
    console.error('[Hydrate] Execution error:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
