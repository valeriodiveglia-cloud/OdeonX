// src/app/login/page.tsx
"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { t, type Lang } from "@/lib/i18n"
import { useSettings } from "@/contexts/SettingsContext"

export default function LoginPage() {
  const { language: lang, setLanguage } = useSettings()
  const [mounted, setMounted] = useState(false)

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const router = useRouter()

  // al mount: segna che siamo sul client
  useEffect(() => {
    setMounted(true)
  }, [])

  // se già loggato → dashboard
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/dashboard")
    })
  }, [router])

  const mapAuthError = useCallback(
    (raw?: string): string => {
      const m = (raw || "").toLowerCase()
      if (m.includes("invalid login credentials")) return t(lang, "ErrInvalidLogin")
      if (m.includes("email not confirmed")) return t(lang, "ErrEmailNotConfirmed")
      if (m.includes("rate limit")) return t(lang, "ErrRateLimited")
      if (m.includes("network")) return t(lang, "ErrNetwork")
      return raw ? raw : t(lang, "ErrUnknown")
    },
    [lang]
  )

  async function syncAccountForCurrentUser() {
    const { data: auth, error: authErr } = await supabase.auth.getUser()
    const user = auth?.user
    if (authErr || !user) return

    const { data: existing, error: selErr } = await supabase
      .from("app_accounts")
      .select("id, user_id, role")
      .eq("user_id", user.id)
      .maybeSingle()

    if (selErr) {
      console.error("select app_accounts error:", JSON.stringify(selErr, null, 2))
      setMessage(t(lang, "ErrProfileRead"))
      return
    }

    let defaultRole: "owner" | "admin" | "staff" = "staff"
    if (!existing) {
      const { count, error: cntErr } = await supabase
        .from("app_accounts")
        .select("id", { count: "exact", head: true })
      if (!cntErr && (count ?? 0) === 0) defaultRole = "owner"
    }

    const roleToSend: "owner" | "admin" | "staff" =
      (existing?.role as any) ?? defaultRole ?? "staff"

    const payload = {
      user_id: user.id,
      email: user.email ?? "",
      is_active: true,
      name: (user as any)?.user_metadata?.full_name ?? null,
      phone: (user as any)?.user_metadata?.phone ?? null,
      position: null as string | null,
      role: roleToSend,
    }

    const { error: upErr } = await supabase
      .from("app_accounts")
      .upsert(payload, { onConflict: "user_id" })
      .select()
      .single()

    if (upErr) {
      console.error("upsert app_accounts error:", JSON.stringify(upErr, null, 2))
      setMessage(t(lang, "ErrProfileSync"))
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (isSubmitting) return
    setMessage("")
    setIsSubmitting(true)

    const creds = { email: email.trim(), password }
    const { error } = await supabase.auth.signInWithPassword(creds)

    if (error) {
      setIsSubmitting(false)
      setMessage(mapAuthError(error.message))
      return
    }

    await syncAccountForCurrentUser()
    setMessage(t(lang, "LoggedInRedirect"))
    router.replace("/dashboard")
  }

  const LangButton = useMemo(
    () =>
      function LangButton({ code, label }: { code: Lang; label: string }) {
        const active = code === lang
        return (
          <button
            type="button"
            onClick={() => setLanguage(code)}
            className={`px-2 py-1 rounded-lg text-sm border ${
              active
                ? "bg-blue-600 text-white border-blue-700"
                : "bg-white text-blue-700 border-blue-300 hover:bg-blue-50"
            }`}
            aria-pressed={active}
          >
            {label}
          </button>
        )
      },
    [lang, setLanguage]
  )

  if (!mounted) return null

  return (
    <div className="flex items-center justify-center min-h-screen bg-blue-50">
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-10 w-full max-w-md">
        {/* language switch */}
        <div className="flex items-center justify-end gap-2 mb-4">
          <span className="text-xs text-slate-500 mr-1">{t(lang, "Language")}:</span>
          <LangButton code="en" label="EN" />
          <LangButton code="vi" label="VI" />
        </div>

        <h2 className="text-2xl font-bold mb-4 text-blue-700">{t(lang, "StaffLogin")}</h2>

        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder={t(lang, "Email")}
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="username"
            className="rounded-xl border border-blue-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />

          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              placeholder={t(lang, "Password")}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-xl border border-blue-200 px-4 py-2 pr-16 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              type="button"
              onClick={() => setShowPw(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-sm bg-blue-50 border border-blue-200 px-3 py-1 rounded-lg"
              aria-label={showPw ? t(lang, "Hide") : t(lang, "Show")}
              title={showPw ? t(lang, "Hide") : t(lang, "Show")}
            >
              {showPw ? t(lang, "Hide") : t(lang, "Show")}
            </button>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 disabled:opacity-70 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-xl shadow transition hover:bg-blue-700"
          >
            {isSubmitting ? t(lang, "LoggingIn") : t(lang, "Login")}
          </button>
        </form>

        {message && (
          <div className="mt-4 text-sm px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200">
            {message}
          </div>
        )}
      </div>
    </div>
  )
}
