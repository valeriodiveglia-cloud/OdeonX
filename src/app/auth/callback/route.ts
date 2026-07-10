// src/app/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const rawRedirect = url.searchParams.get('redirect') || '/dashboard'
  const redirect =
    rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
      ? rawRedirect
      : '/dashboard'

  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  // Se errore dal provider, torna a login mantenendo la destinazione
  if (error) {
    const to = new URL('/login', req.url)
    to.searchParams.set('error', error)
    to.searchParams.set('redirect', redirect)
    return NextResponse.redirect(to, 302)
  }

  // Caso PKCE/magic link: scambia il code sul server, aggiorna metadati e reindirizza
  if (code) {
    const cookieStore = await cookies()
    const response = NextResponse.redirect(new URL(redirect, req.url), 302)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return response.cookies.get(name)?.value || cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            try {
              cookieStore.set({ name, value, ...options })
              response.cookies.set({ name, value, ...options })
            } catch {
              // Fallback silenzioso
            }
          },
          remove(name: string, options: any) {
            try {
              cookieStore.set({ name, value: '', ...options, maxAge: 0 })
              response.cookies.set({ name, value: '', ...options, maxAge: 0 })
            } catch {
              // Fallback silenzioso
            }
          },
        },
      }
    )

    try {
      await supabase.auth.exchangeCodeForSession(code)

      // Utente corrente dalla sessione cookie
      const { data: ures } = await supabase.auth.getUser()
      const user = ures?.user
      const uid = user?.id || null
      const email = user?.email?.toLowerCase() || null

      // Metadati onboarding e linking app_accounts se stiamo andando a update-password
      try {
        if (uid) {
          if (redirect.startsWith('/auth/update-password')) {
            await supabaseAdmin.auth.admin.updateUserById(uid, {
              user_metadata: { needs_onboarding: true, is_onboarded: false },
            })
          }
          if (email) {
            await supabaseAdmin
              .from('app_accounts')
              .update({ user_id: uid })
              .is('user_id', null)
              .eq('email', email)
          }
        }
      } catch {
        // non bloccare
      }

      // Rigenera JWT nel cookie
      try {
        await supabase.auth.refreshSession()
      } catch {
        // non bloccare
      }

      return response
    } catch (err) {
      console.error('Error during exchangeCodeForSession:', err)
      const to = new URL('/login', req.url)
      to.searchParams.set('redirect', redirect)
      return NextResponse.redirect(to, 302)
    }
  }

  // Caso recovery/reset: il token è nel fragment (#access_token=...), il server non può leggerlo.
  // Rispondiamo con HTML che conserva l'hash e reindirizza alla pagina di destinazione.
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Redirecting</title></head>
<body>
<script>
(function(){
  var dest = ${JSON.stringify(redirect)};
  var hash = window.location.hash || '';
  window.location.replace(dest + hash);
})();
</script>
</body></html>`
  return new NextResponse(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
