import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authOr401 } from '@/lib/routeAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Data limite di sicurezza (Activation Date)
const ACTIVATION_DATE = '2026-07-12'

function getCukCukBranchId(name: string): string | null {
  const norm = name.toLowerCase().trim()
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

export async function GET(req: Request) {
  const APP_ID = process.env.CUKCUK_APP_ID
  const PASS_CODE = process.env.CUKCUK_PASS_CODE
  const DOMAIN = process.env.CUKCUK_DOMAIN

  try {
    // 1. Autenticazione utente tramite helper di progetto
    const auth = await authOr401()
    if (!auth.ok) {
      return auth.response
    }
    const { supabase, session } = auth

    // 2. Lettura parametri
    const urlObj = new URL(req.url)
    const branchName = urlObj.searchParams.get('branch')
    const dateStr = urlObj.searchParams.get('date') // yyyy-mm-dd

    if (!branchName || !dateStr) {
      return NextResponse.json({ error: 'Missing branch or date parameter' }, { status: 400 })
    }

    // 2b. Verifica autorizzazione filiale (Security Check)
    const { data: userAccount, error: userError } = await supabase
      .from('app_accounts')
      .select('role, branches')
      .eq('user_id', session.user.id)
      .single()

    if (userError || !userAccount) {
      console.error('Error fetching user account details:', userError)
      return NextResponse.json({ error: 'Forbidden: Account details not found' }, { status: 403 })
    }

    const { role, branches } = userAccount

    // L'owner e l'admin hanno accesso totale.
    // Gli altri ruoli (staff, manager, ecc.) devono avere la filiale specificata nell'elenco delle loro filiali abilitate.
    if (role !== 'owner' && role !== 'admin') {
      const { data: dbBranch, error: dbBranchErr } = await supabase
        .from('provider_branches')
        .select('id')
        .eq('name', branchName)
        .single()

      if (dbBranchErr || !dbBranch) {
        console.error('Error matching branch name to ID:', dbBranchErr)
        return NextResponse.json({ error: `Invalid branch name: ${branchName}` }, { status: 400 })
      }

      const allowedBranches = Array.isArray(branches) ? branches : []
      if (!allowedBranches.includes(dbBranch.id)) {
        return NextResponse.json({ error: 'Forbidden: You do not have access to this branch' }, { status: 403 })
      }
    }

    // 3. Soglia di sicurezza: non toccare dati prima del 9 Luglio 2026
    if (dateStr < ACTIVATION_DATE) {
      return NextResponse.json({ success: true, reason: 'historical_date_skipped' })
    }

    // 4. Mappatura branch
    const cukcukBranchId = getCukCukBranchId(branchName)
    if (!cukcukBranchId) {
      return NextResponse.json({ error: `No CukCuk mapping found for branch: ${branchName}` }, { status: 400 })
    }

    if (!APP_ID || !PASS_CODE || !DOMAIN) {
      const missing = []
      if (!APP_ID) missing.push('CUKCUK_APP_ID')
      if (!PASS_CODE) missing.push('CUKCUK_PASS_CODE')
      if (!DOMAIN) missing.push('CUKCUK_DOMAIN')
      return NextResponse.json({ error: `CukCuk integration environment variables are not configured. Missing: ${missing.join(', ')}` }, { status: 500 })
    }

    // 5. Login CukCuk Open Platform
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
      console.error('CukCuk login failed:', loginData)
      return NextResponse.json({ error: 'CukCuk POS API authentication failed' }, { status: 502 })
    }

    const { AccessToken, CompanyCode } = loginData.Data
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AccessToken}`,
      'CompanyCode': CompanyCode
    }

    // 6. Calcolo dinamico ultima pagina degli scontrini per questo branch
    const initialRes = await fetch('https://graphapi.cukcuk.vn/api/v1/sainvoices/paging', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        Page: 1,
        Limit: 1,
        BranchId: cukcukBranchId
      }),
      cache: 'no-store'
    })
    const initialData = await initialRes.json()
    if (!initialData.Success) {
      return NextResponse.json({ error: 'Failed to retrieve total invoices from CukCuk' }, { status: 502 })
    }

    const total = initialData.Total || 0
    const limit = 100
    const lastPage = Math.ceil(total / limit)

    // 7. Scansione delle ultime 3 pagine per trovare gli scontrini del giorno selezionato
    const allInvoices: any[] = []
    const scanPages = [lastPage - 2, lastPage - 1, lastPage]
    
    await Promise.all(scanPages.map(async (page) => {
      if (page < 1) return
      try {
        const pageRes = await fetch('https://graphapi.cukcuk.vn/api/v1/sainvoices/paging', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            Page: page,
            Limit: limit,
            BranchId: cukcukBranchId
          }),
          cache: 'no-store'
        })
        const pageData = await pageRes.json()
        if (pageData.Success && Array.isArray(pageData.Data)) {
          allInvoices.push(...pageData.Data)
        }
      } catch (err) {
        console.error(`Error fetching page ${page}:`, err)
      }
    }))

    // 8. Filtraggio degli scontrini validi per la data richiesta e calcolo dei totali POS
    // Escludiamo sia i cancellati (4) sia i non pagati/in corso (1) per allineare la chiusura di cassa
    // solo con le transazioni effettivamente chiuse e pagate.
    const dayInvoices = allInvoices.filter(inv => 
      inv.PaymentStatus !== 4 && 
      inv.PaymentStatus !== 1 &&
      inv.RefDate && 
      inv.RefDate.startsWith(dateStr)
    )

    let posTotalRevenue = 0
    let posDiscount = 0
    let posUnpaidAmount = 0
    let posGrab = 0
    let posMpos = 0
    let posShopeeFood = 0
    let posGuests = 0
    let posDiningGuests = 0
    const deliveryInvoiceIds = new Set<string>()

    dayInvoices.forEach(inv => {
      const netAmt = Math.round(inv.TotalAmount || 0)
      posTotalRevenue += netAmt
      posDiscount += Math.round((inv.DiscountAmount || 0) + (inv.PromotionAmount || 0))
      const guests = Math.round(inv.NumberOfPeople || 0)
      posGuests += guests
      
      const isTakeaway = !inv.TableName || inv.TableName.trim() === ''
      if (!isTakeaway) {
        posDiningGuests += guests
      }
    })

    const posGrossRevenue = posTotalRevenue + posDiscount

    // 9. Recupero dei dettagli di pagamento in batch (su tutti gli scontrini per estrarre Grab, mPOS, Shopee e i bonifici)
    const syncedTransfers: Array<{
      pos_ref_id: string
      date: string
      time: string | null
      info: string | null
      amount: number
      branch: string
    }> = []

    const batchSize = 10
    for (let i = 0; i < dayInvoices.length; i += batchSize) {
      const batch = dayInvoices.slice(i, i + batchSize)
      await Promise.all(batch.map(async (inv) => {
        try {
          let isDeliveryOrTakeaway = 
            inv.OrderType !== 0 || 
            (typeof inv.DeliveryAmount === 'number' && inv.DeliveryAmount > 0) ||
            !inv.TableName || 
            inv.TableName.trim() === ''

          const detailRes = await fetch(`https://graphapi.cukcuk.vn/api/v1/sainvoices/detail/${inv.RefId}`, {
            method: 'GET',
            headers,
            cache: 'no-store'
          })
          const detailData = await detailRes.json()
          if (detailData.Success && detailData.Data && Array.isArray(detailData.Data.SAInvoicePayments)) {
            detailData.Data.SAInvoicePayments.forEach((pm: any, idx: number) => {
              const pmName = (pm.PaymentName || '').toLowerCase()
              
              if (pmName.includes('grab') || pmName.includes('gojek') || pmName.includes('shopee') || pmName.includes('delivery') || pmName.includes('takeaway') || pmName.includes('giao hàng')) {
                isDeliveryOrTakeaway = true
              }

              // 1. Bonifici bancari / Bank transfer
              const isBankTransfer = pmName === 'bank transfer' || pmName === 'chuyển khoản'
              if (isBankTransfer) {
                const time = inv.RefDate.split('T')[1]?.substring(0, 5) || null
                const custName = inv.CustomerName ? inv.CustomerName.trim() : ''
                const info = `Bill: ${inv.RefNo} - Table: ${inv.TableName || 'Takeaway / Delivery'}${custName ? ` - ${custName}` : ''}`
                
                syncedTransfers.push({
                  pos_ref_id: `${inv.RefId}-${idx}`,
                  date: dateStr,
                  time,
                  info,
                  amount: Math.round(pm.Amount || 0),
                  branch: branchName
                })
              }

              // 2. Grab payments
              if (pmName.includes('grab')) {
                posGrab += Math.round(pm.Amount || 0)
              }

              // 3. mPOS / Card payments
              if (pmName.includes('mpos') || pmName.includes('card') || pmName.includes('carte') || pmName.includes('m-pos')) {
                posMpos += Math.round(pm.Amount || 0)
              }

              // 4. Shopee Food
              if (pmName.includes('shopee')) {
                posShopeeFood += Math.round(pm.Amount || 0)
              }

              // 5. Unpaid / Debiti reali del giorno
              if (pmName.includes('unpaid') || pmName.includes('nợ') || pmName.includes('debt') || pmName.includes('chưa thanh toán')) {
                posUnpaidAmount += Math.round(pm.Amount || 0)
              }
            })
          }

          if (isDeliveryOrTakeaway) {
            deliveryInvoiceIds.add(inv.RefId)
          }
        } catch (err) {
          console.error(`Failed to fetch details for invoice ${inv.RefNo}:`, err)
        }
      }))
    }

    // Calcolo dining vs delivery/takeaway basato sugli ID tracciati
    let posDiningRevenue = 0
    let posDeliveryTakeawayRevenue = 0

    dayInvoices.forEach(inv => {
      const netAmt = Math.round(inv.TotalAmount || 0)
      if (deliveryInvoiceIds.has(inv.RefId)) {
        posDeliveryTakeawayRevenue += netAmt
      } else {
        posDiningRevenue += netAmt
      }
    })

    // 10. Salvataggio / Upsert nel database Supabase ed eliminazione dei bonifici rimossi
    // Definiamo i possibili alias del nome filiale per coprire discrepanze storiche (Thao Dien / Garden)
    const targetBranches = [branchName]
    const normBranch = branchName.toLowerCase()
    if (normBranch.includes('thao dien') || normBranch.includes('garden')) {
      targetBranches.push('Pasta Fresca Garden', 'Pasta Fresca Thao Dien')
    }

    // Carichiamo prima i record esistenti con pos_ref_id per quella data e le varianti di questa filiale
    const { data: dbExisting } = await supabaseAdmin
      .from('daily_report_bank_transfers')
      .select('id, pos_ref_id, note')
      .in('branch', targetBranches)
      .eq('date', dateStr)
      .not('pos_ref_id', 'is', null)

    const existingMap = new Map<string, any>()
    if (dbExisting) {
      dbExisting.forEach(r => existingMap.set(r.pos_ref_id, r))
    }

    // Eseguiamo gli inserimenti e gli aggiornamenti in blocchi separati per evitare che PostgREST
    // applichi il padding di NULL sul campo 'id' degli elementi nuovi.
    if (syncedTransfers.length > 0) {
      const inserts: any[] = []
      const updates: any[] = []

      syncedTransfers.forEach(st => {
        const match = existingMap.get(st.pos_ref_id)
        if (match?.id) {
          updates.push({
            id: match.id,
            pos_ref_id: st.pos_ref_id,
            date: st.date,
            time: st.time,
            info: st.info,
            amount: st.amount,
            branch: st.branch,
            note: match.note || null
          })
        } else {
          inserts.push({
            pos_ref_id: st.pos_ref_id,
            date: st.date,
            time: st.time,
            info: st.info,
            amount: st.amount,
            branch: st.branch,
            note: null
          })
        }
      })

      if (inserts.length > 0) {
        const { error: insErr } = await supabaseAdmin
          .from('daily_report_bank_transfers')
          .insert(inserts)

        if (insErr) {
          console.error('Error inserting bank transfers:', insErr)
          return NextResponse.json({ error: 'Failed to insert to database' }, { status: 500 })
        }
      }

      if (updates.length > 0) {
        const { error: updErr } = await supabaseAdmin
          .from('daily_report_bank_transfers')
          .upsert(updates, { onConflict: 'pos_ref_id' })

        if (updErr) {
          console.error('Error updating bank transfers:', updErr)
          return NextResponse.json({ error: 'Failed to update database' }, { status: 500 })
        }
      }
    }

    // Rimuoviamo i bonifici precedentemente registrati che non sono più nell'API
    const syncedRefIds = new Set(syncedTransfers.map(st => st.pos_ref_id))
    const idsToDelete: string[] = []
    
    existingMap.forEach((row, posRefId) => {
      if (!syncedRefIds.has(posRefId)) {
        idsToDelete.push(row.id)
      }
    })

    if (idsToDelete.length > 0) {
      const { error: delErr } = await supabaseAdmin
        .from('daily_report_bank_transfers')
        .delete()
        .in('id', idsToDelete)

      if (delErr) {
        console.error('Error deleting stale bank transfers:', delErr)
      }
    }

    // Calcoliamo il totale dei bonifici per questa data e branch utilizzando il client admin (bypassa RLS)
    const { data: sumData, error: sumError } = await supabaseAdmin
      .from('daily_report_bank_transfers')
      .select('amount')
      .eq('branch', branchName)
      .eq('date', dateStr)

    if (sumError) {
      console.error('Error fetching total amount of bank transfers:', sumError)
    }

    const totalAmount = (sumData || []).reduce((sum, item: any) => sum + (item.amount || 0), 0)

    return NextResponse.json({
      success: true,
      count: syncedTransfers.length,
      totalAmount,
      posGrossRevenue,
      posDiscount,
      posUnpaidAmount,
      posGrab,
      posMpos,
      posShopeeFood,
      posGuests,
      posDiningGuests,
      posDiningRevenue,
      posDeliveryTakeawayRevenue,
      posOrdersCount: dayInvoices.length,
      posTakeawayCount: deliveryInvoiceIds.size
    })

  } catch (error: any) {
    console.error('Sync process crashed:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
