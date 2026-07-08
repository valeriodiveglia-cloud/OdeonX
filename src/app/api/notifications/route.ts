// src/app/api/notifications/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/notifications - Recupera le notifiche destinate all'utente
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
    const useBearer = /^Bearer\s+/.test(authHeader)
    const cookieStore = await cookies()
    const supabase = useBearer
      ? createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: authHeader } } }
        )
      : createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            cookies: {
              getAll() {
                return cookieStore.getAll()
              },
              setAll(cookiesToSet) {
                try {
                  cookiesToSet.forEach(({ name, value, options }) =>
                    cookieStore.set(name, value, options)
                  )
                } catch {
                  // Catch runtime headers updates error in GET
                }
              },
            },
          }
        )

    const { data: auth, error: authErr } = await supabase.auth.getUser()
    if (authErr || !auth?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Esegue il controllo e la generazione automatica delle notifiche per contratti in scadenza
    const { error: cronErr } = await supabase.rpc('fn_check_contract_expirations')
    if (cronErr) {
      console.error('Error running fn_check_contract_expirations rpc:', cronErr)
    }

    // Effettua la select delle notifiche unendo la tabella di lettura app_notification_reads.
    // Grazie alla RLS di app_notification_reads, l'unione conterrà record
    // solo se la notifica è stata letta dall'utente corrente.
    const { data: notifications, error: dbErr } = await supabase
      .from('app_notifications')
      .select(`
        id,
        created_at,
        module,
        title_en,
        title_vi,
        message_en,
        message_vi,
        app_notification_reads (
          read_at
        )
      `)
      .order('created_at', { ascending: false })

    if (dbErr) {
      console.error('Error fetching notifications:', dbErr)
      return NextResponse.json({ error: dbErr.message }, { status: 500 })
    }

    // Formatta la risposta per semplificare il controllo "isRead" lato client
    const formatted = (notifications || []).map((item: any) => {
      const isRead = Array.isArray(item.app_notification_reads) 
        ? item.app_notification_reads.length > 0
        : !!item.app_notification_reads
      
      return {
        id: item.id,
        created_at: item.created_at,
        module: item.module,
        title_en: item.title_en,
        title_vi: item.title_vi,
        message_en: item.message_en,
        message_vi: item.message_vi,
        isRead
      }
    })

    // Filtra le notifiche:
    // 1. Mostra sempre le notifiche non lette (isRead === false)
    // 2. Per le notifiche già lette, mostra solo quelle create negli ultimi 7 giorni
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const filtered = formatted.filter((item: any) => {
      if (!item.isRead) return true
      const createdAtDate = new Date(item.created_at)
      return createdAtDate >= sevenDaysAgo
    })

    return NextResponse.json({ notifications: filtered })
  } catch (err: any) {
    console.error('Unexpected error in GET notifications:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}

// POST /api/notifications - Segna come lette le notifiche specificate
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
    const useBearer = /^Bearer\s+/.test(authHeader)
    const cookieStore = await cookies()
    const supabase = useBearer
      ? createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: authHeader } } }
        )
      : createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            cookies: {
              getAll() {
                return cookieStore.getAll()
              },
              setAll(cookiesToSet) {
                try {
                  cookiesToSet.forEach(({ name, value, options }) =>
                    cookieStore.set(name, value, options)
                  )
                } catch {
                  // Catch runtime headers updates error
                }
              },
            },
          }
        )

    const { data: auth, error: authErr } = await supabase.auth.getUser()
    if (authErr || !auth?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { notificationIds } = body
    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return NextResponse.json({ error: 'Missing or empty notificationIds array' }, { status: 400 })
    }

    // Prepara i record di join da inserire in app_notification_reads
    const records = notificationIds.map((id: string) => ({
      notification_id: id,
      user_id: auth.user.id
    }))

    // Inserisce i record ignorando eventuali duplicati (onConflict)
    const { error: insertErr } = await supabase
      .from('app_notification_reads')
      .upsert(records, { onConflict: 'notification_id,user_id' })

    if (insertErr) {
      console.error('Error inserting notification reads:', insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Unexpected error in POST notifications:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
