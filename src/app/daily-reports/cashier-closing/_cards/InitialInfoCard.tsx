// app/daily-reports/cashier-closing/_cards/InitialInfoCard.tsx
'use client'

import { ReactNode, useMemo, useRef, useState, useEffect } from 'react'
import { useDRBranch } from '../../_data/useDRBranch'
import { supabase } from '@/lib/supabase_shim'
import { useDailyReportSettingsDB } from '../../_data/useDailyReportSettingsDB'
import { creditsBus } from '@/lib/creditsSync'
import { ChatBubbleOvalLeftEllipsisIcon } from '@heroicons/react/24/outline'
import { useSettings } from '@/contexts/SettingsContext'
import { getDailyReportsDictionary } from '../../_i18n'

/* ---------- safe legacy bridge wrapper (reads DR_BRANCH_NAME) ---------- */
function useBridgeSafe() {
  try {
    // @ts-ignore
    const b: any =
      typeof window !== 'undefined' && (window as any).useBridgeLegacyBranchRaw?.()
    if (b && typeof b.setName === 'function') return b
  } catch { }
  const [name, setNameState] = useState<string>(() => {
    try {
      return localStorage.getItem('DR_BRANCH_NAME') || ''
    } catch {
      return ''
    }
  })
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'DR_BRANCH_NAME') setNameState(e.newValue || '')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const setName = (v: string) => {
    try {
      if (v) localStorage.setItem('DR_BRANCH_NAME', v)
      else localStorage.removeItem('DR_BRANCH_NAME')
      localStorage.setItem('dr_branch_last_emit_at', String(Date.now()))
      setNameState(v || '')
      window.dispatchEvent(
        new CustomEvent('dr:branch:changed', { detail: { name: v || '' } }),
      )
      window.dispatchEvent(
        new CustomEvent('dailyreports:branch:changed', { detail: { name: v || '' } }),
      )
      window.dispatchEvent(
        new CustomEvent('cashier:branch:changed', { detail: { name: v || '' } }),
      )
    } catch { }
  }
  return { name, setName }
}

/* Card primitives */
function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow">
      {children}
    </div>
  )
}
function CardHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  )
}

/* Formatter helpers */
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const clampInt = (n: number) => (Number.isFinite(n) ? Math.round(n) : 0)
const digitsOnly = (s: string) => s.replace(/[^\d]/g, '')
const toNum = (s: string) => clampInt(Number(digitsOnly(s)))
const fmt = (n: number) => {
  try {
    return nf.format(clampInt(n))
  } catch {
    return String(clampInt(n))
  }
}

/* === Third-party channels helpers (dynamic, up to 6) === */
const TP_MAX = 6

type ThirdPartyAmount = { label: string; amount: number }

function tpCleanStr(v: string) {
  return String(v ?? '').trim()
}

function tpUnique(list: string[], max: number) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const v = tpCleanStr(raw)
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
    if (out.length >= max) break
  }
  return out
}

/* Input numerico con migliaia LIVE */
function NumFmt({
  value,
  onChange,
  className = '',
  disabled = false,
  placeholder,
}: {
  value: number
  onChange: (v: number) => void
  className?: string
  disabled?: boolean
  placeholder?: string
}) {
  const [text, setText] = useState<string>(fmt(value))
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!focused) setText(fmt(value))
  }, [value, focused])

  function applyFormatAndMoveCaret(raw: string) {
    const n = toNum(raw)
    const f = fmt(n)
    setText(f)
    onChange(n)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) {
        const L = f.length
        el.setSelectionRange(L, L)
      }
    })
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    applyFormatAndMoveCaret(e.target.value)
  }
  function onFocus() {
    setFocused(true)
    if (toNum(text) === 0) setText('')
  }
  function onBlur() {
    setFocused(false)
    setText(fmt(toNum(text)))
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={text}
      onChange={onInput}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={`border rounded-lg px-2 w-full h-9 text-right ${disabled ? 'bg-gray-50 text-gray-600' : 'bg-white'
        } ${className}`}
    />
  )
}

/* Tipi delle props */
export type PaymentBreakdown = {
  revenue?: number
  gojek?: number
  grab?: number
  mpos?: number
  unpaid?: number
  // totali per algoritmo Net / Expected
  repaymentsCashCard?: number      // totale cash + card (per Net)
  repaymentsCashOnly?: number      // solo cash (per Expected cash)
  // split dettagliato per SummaryCard
  repaymentCash?: number
  repaymentCard?: number
  capichi?: number
  bankTransferEwallet?: number
  cashOut?: number
  // split dettagliato dei depositi per SummaryCard
  depositCash?: number
  depositCard?: number
  // nuovo campo dinamico: fino a 6 canali terzi
  thirdPartyAmounts?: ThirdPartyAmount[]
}

export type Header = {
  dateStr: string
  branch?: string
  shift: string
  cashier: string
  notes?: string
}



/* Helper: ricava display name utente corrente da Supabase (fallback) */
async function fetchCurrentUserNameFromDB(): Promise<string> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const user = auth?.user || null
    if (!user) return ''
    const userId = String(user.id)
    const email = String(user.email || '')
    const { data, error } = await supabase
      .from('app_accounts')
      .select('name,email')
      .eq('user_id', userId)
      .limit(1)
      .single()
    if (error) return user.user_metadata?.full_name || user.user_metadata?.name || email
    const dbName = String(data?.name || '').trim()
    if (dbName) return dbName
    const metaName = user.user_metadata?.full_name || user.user_metadata?.name
    if (metaName) return metaName
    const dbEmail = String(data?.email || '').trim()
    return dbEmail || email
  } catch {
    return ''
  }
}

/* Utility: range giorno locale */
function dayRange(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0)
  return { startISO: start.toISOString(), endISO: end.toISOString() }
}

/* Normalizza metodo dal campo note di credit_payments / deposit_payments */
function parseMethodFromNote(
  note: string | null | undefined,
): 'cash' | 'card' | 'bank' | 'other' | null {
  const s = String(note || '').trim().toLowerCase()
  if (!s) return null
  if (s === 'cash' || s.startsWith('cash')) return 'cash'
  if (s === 'card' || s.startsWith('card')) return 'card'
  if (s.includes('bank')) return 'bank'
  return 'other'
}

/* Normalizza thirdPartyAmounts combinando labels da settings + eventuali legacy */
function buildThirdPartyAmounts(
  labels: string[],
  payments: PaymentBreakdown,
): ThirdPartyAmount[] {
  const cleanLabels = tpUnique(labels, TP_MAX)
  const out: ThirdPartyAmount[] = []

  // mappa esistente da payments.thirdPartyAmounts (case-insensitive)
  const src = Array.isArray(payments.thirdPartyAmounts)
    ? payments.thirdPartyAmounts
    : []
  const byKey = new Map<string, number>()
  for (const item of src) {
    const lbl = tpCleanStr(item?.label || '')
    if (!lbl) continue
    const key = lbl.toLowerCase()
    if (!byKey.has(key)) {
      byKey.set(key, clampInt(Number(item?.amount || 0)))
    }
  }

  // legacy fallback: gojek / grab / capichi
  const legacy = [
    clampInt(Number(payments.gojek || 0)),
    clampInt(Number(payments.grab || 0)),
    clampInt(Number(payments.capichi || 0)),
  ]

  cleanLabels.forEach((label, idx) => {
    const key = label.toLowerCase()
    let amount: number
    if (byKey.has(key)) {
      amount = byKey.get(key) || 0
    } else if (idx < legacy.length) {
      amount = legacy[idx]
    } else {
      amount = 0
    }
    out.push({ label, amount })
  })

  return out
}

export default function InitialInfoCard(props: {
  header: Header
  openingFloat: number
  payments: PaymentBreakdown
  payouts: number
  deposits: number                // totale cash + card (per Net)
  depositsCash?: number           // solo cash (per Expected cash)
  grossTakings: number
  onChangeHeader: (patch: Partial<Header>) => void
  onChangeOpeningFloat: (v: number) => void
  onChangePayments: (patch: Partial<PaymentBreakdown>) => void
  onChangePayouts: (v: number) => void
  onChangeDeposits: (v: number) => void
  onChangeDepositsCash?: (v: number) => void
  differenceVND?: number
  branchId?: string
  recordId?: string | null
  onReloadSaved?: () => void
  liveMode: boolean
  onChangeLiveMode: (v: boolean) => void
}) {
  const {
    header,
    payments,
    deposits,
    onChangeHeader,
    onChangePayments,
    onChangeDeposits,
    onChangeDepositsCash,
    recordId,
    onReloadSaved,
    liveMode,
    onChangeLiveMode,
  } = props
  const { language } = useSettings()
  const t = getDailyReportsDictionary(language).cashierClosing.initialInfo

  const isExisting = !!recordId

  const [showNotes, setShowNotes] = useState<boolean>(() => {
    return !!(header.notes && header.notes.trim())
  })

  // Se il record ha già note (es. quando riapri un closing), apri automaticamente il blocco commento
  useEffect(() => {
    if (header.notes && header.notes.trim()) {
      setShowNotes(true)
    }
  }, [header.notes])

  // Nuovi closing: auto sync sempre. Vecchi: sync solo in Live.
  const shouldAutoSync = !isExisting || liveMode

  // Official hook
  const { branch, validating } = useDRBranch({ validate: false })
  const officialName = branch?.name || ''

  // Legacy/local bridge
  const bridge = useBridgeSafe()
  const bridgeName = bridge?.name || ''

  // Active name used for UI + queries (official first, then legacy)
  const activeBranchName = (officialName || bridgeName).trim()

  // Inietta il branch attivo nell'header, se manca o cambia
  useEffect(() => {
    if (activeBranchName && header.branch !== activeBranchName) {
      onChangeHeader({ branch: activeBranchName })
    }
  }, [activeBranchName]) // eslint-disable-line react-hooks/exhaustive-deps

  // Closed by: fetch fresh from DB if new record
  useEffect(() => {
    if (isExisting) return

    let alive = true
      ; (async () => {
        const name = await fetchCurrentUserNameFromDB()
        if (!alive) return
        if (name && header.cashier !== name) {
          onChangeHeader({ cashier: name })
        }
      })()
    return () => {
      alive = false
    }
  }, [isExisting]) // eslint-disable-line react-hooks/exhaustive-deps

  const v = (n: number | undefined) =>
    Number.isFinite(Number(n)) ? Number(n) : 0

  /* === Third-party labels from settings (DB) === */
  const { settings } = useDailyReportSettingsDB(activeBranchName)
  const thirdPartyLabels = useMemo(() => {
    const list = settings?.initialInfo?.thirdParties
    if (Array.isArray(list) && list.length > 0) {
      return tpUnique(list.map(tpCleanStr), TP_MAX)
    }
    return ['Gojek', 'Grab', 'Capichi']
  }, [settings])

  // Third-party amounts effettivi:
  // - se shouldAutoSync: dinamici dai settings
  // - se Saved su record esistente: congelati da payments.thirdPartyAmounts o fallback legacy
  const thirdPartyAmounts = useMemo<ThirdPartyAmount[]>(() => {
    // Live o nuovo: usa labels dinamici
    if (shouldAutoSync) {
      return buildThirdPartyAmounts(thirdPartyLabels, payments)
    }

    // Saved su record esistente: freeze
    const src = Array.isArray(payments.thirdPartyAmounts)
      ? payments.thirdPartyAmounts
      : []

    if (src.length > 0) {
      return src.map((it) => ({
        label: tpCleanStr(it.label || ''),
        amount: v(it.amount),
      }))
    }

    // Vecchi record senza thirdPartyAmounts: fallback fisso legacy
    const legacyLabels = ['Gojek', 'Grab', 'Capichi']
    return buildThirdPartyAmounts(legacyLabels, payments)
  }, [shouldAutoSync, thirdPartyLabels, payments])

  // Sync verso payments.thirdPartyAmounts solo quando è Live o nuovo
  useEffect(() => {
    if (!shouldAutoSync) return

    const src = Array.isArray(payments.thirdPartyAmounts)
      ? payments.thirdPartyAmounts
      : []

    const same =
      src.length === thirdPartyAmounts.length &&
      src.every((it, idx) =>
        tpCleanStr(it.label) === tpCleanStr(thirdPartyAmounts[idx]?.label) &&
        v(it.amount) === v(thirdPartyAmounts[idx]?.amount),
      )

    if (!same) {
      onChangePayments({ thirdPartyAmounts })
    }
  }, [shouldAutoSync, thirdPartyAmounts, payments.thirdPartyAmounts]) // onChangePayments è stabile in props

  const thirdPartyTotal = useMemo(
    () => thirdPartyAmounts.reduce((sum, item) => sum + v(item.amount), 0),
    [thirdPartyAmounts],
  )

  const nonCash = useMemo(
    () =>
      thirdPartyTotal +
      v(payments.mpos) +
      v(payments.bankTransferEwallet),
    [thirdPartyTotal, payments.mpos, payments.bankTransferEwallet],
  )

  const netVal = useMemo(
    () =>
      v(payments.revenue) -
      nonCash -
      v(payments.unpaid) -
      v(payments.cashOut) +
      v(payments.repaymentsCashCard) + // totale cash + card
      v(deposits),                     // totale cash + card
    [payments, nonCash, deposits],
  )

  /* ---------- Chiave base + bump locale/cross-tab ---------- */
  const queryKey = `${header.dateStr}@@${activeBranchName}`
  const [bump, setBump] = useState(0)

  /* Central bus: segnali da qualsiasi pagina/tab (credits, payments, branch, deposits) */
  useEffect(() => {
    const bus = creditsBus()
    const off = bus.onBump(() => setBump(x => x + 1))
    return () => { off() }
  }, [])

  /* Cross-tab via localStorage signal lanciato da altre pagine */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return
      if (
        e.key === 'credits_payments_last_emit_at' ||
        e.key === 'credits_last_emit_at' ||
        e.key === 'dr_branch_last_emit_at' ||
        e.key === 'deposits_payments_last_emit_at' ||
        e.key === 'deposits_last_emit_at'
      ) {
        setBump(x => x + 1)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /* Listener locale custom event */
  useEffect(() => {
    const onLocalPayments = () => setBump(x => x + 1)
    const onVisible = () => {
      if (document.visibilityState === 'visible') setBump(x => x + 1)
    }
    window.addEventListener('credits:payments:changed', onLocalPayments as any)
    window.addEventListener('credits:credits:changed', onLocalPayments as any)
    window.addEventListener('deposits:payments:changed', onLocalPayments as any)
    window.addEventListener('deposits:changed', onLocalPayments as any)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('credits:payments:changed', onLocalPayments as any)
      window.removeEventListener('credits:credits:changed', onLocalPayments as any)
      window.removeEventListener('deposits:payments:changed', onLocalPayments as any)
      window.removeEventListener('deposits:changed', onLocalPayments as any)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  /* Supabase Realtime: credit_payments, credits, cashout, bank transfers, deposits */
  useEffect(() => {
    if (!activeBranchName) return
    const ch = supabase
      .channel('cashier-closing-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'credit_payments' },
        () => setBump(x => x + 1),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'credits' },
        () => setBump(x => x + 1),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cashout' },
        () => setBump(x => x + 1),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_report_bank_transfers',
        },
        () => setBump(x => x + 1),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deposit_payments',
        },
        () => setBump(x => x + 1),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deposits',
        },
        () => setBump(x => x + 1),
      )
      .subscribe()
    return () => {
      try {
        supabase.removeChannel(ch)
      } catch { }
    }
  }, [activeBranchName])

  /* ---------- CASH OUT ---------- */
  const [cashOutLoading, setCashOutLoading] = useState(false)
  useEffect(() => {
    let cancelled = false
    async function fetchCashOut() {
      if (!header?.dateStr || !activeBranchName) return
      if (!shouldAutoSync) return
      setCashOutLoading(true)

      const r1 = await supabase
        .from('cashout')
        .select('amount')
        .eq('date', header.dateStr)
        .eq('branch', activeBranchName)

      let total = 0

      if (!r1.error && Array.isArray(r1.data) && r1.data.length > 0) {
        total = r1.data.reduce(
          (s, r: any) => s + Math.round(Number(r?.amount || 0)),
          0,
        )
      } else {
        const q3 = await supabase
          .from('cashout')
          .select('amount')
          .ilike('branch', activeBranchName)
          .eq('date', header.dateStr)
        if (!q3.error && Array.isArray(q3.data) && q3.data.length > 0) {
          total = q3.data.reduce(
            (s, r: any) => s + Math.round(Number(r?.amount || 0)),
            0,
          )
        }
      }

      if (!cancelled) {
        setCashOutLoading(false)
        onChangePayments({ cashOut: total })
      }
    }
    fetchCashOut()
    return () => {
      cancelled = true
    }
  }, [queryKey, bump, shouldAutoSync]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- BANK TRANSFER / E-WALLET ---------- */
  const [bankTransferLoading, setBankTransferLoading] = useState(false)
  useEffect(() => {
    let cancelled = false
    async function fetchBankTransfers() {
      if (!header?.dateStr || !activeBranchName) return
      if (!shouldAutoSync) return
      setBankTransferLoading(true)

      const { data, error } = await supabase
        .from('daily_report_bank_transfers')
        .select('amount')
        .eq('branch', activeBranchName)
        .eq('date', header.dateStr)

      let total = 0
      if (!error && Array.isArray(data)) {
        total = data.reduce(
          (s, r: any) => s + Math.round(Number(r?.amount || 0)),
          0,
        )
      }

      if (!cancelled) {
        setBankTransferLoading(false)
        onChangePayments({ bankTransferEwallet: total })
      }
    }
    fetchBankTransfers()
    return () => {
      cancelled = true
    }
  }, [queryKey, bump, shouldAutoSync]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- UNPAID ---------- */
  const [unpaidLoading, setUnpaidLoading] = useState(false)
  useEffect(() => {
    let cancelled = false
    async function fetchUnpaid() {
      if (!header?.dateStr || !activeBranchName) return
      if (!shouldAutoSync) return
      setUnpaidLoading(true)

      const { data: credits, error: errCredits } = await supabase
        .from('credits')
        .select('id')
        .eq('branch', activeBranchName)
        .eq('date', header.dateStr)

      if (errCredits) {
        console.error('[cashier-closing] unpaid credits fetch error', errCredits)
        setUnpaidLoading(false)
        return
      }
      const ids = (credits || []).map(r => String(r.id))
      if (ids.length === 0) {
        if (!cancelled) {
          onChangePayments({ unpaid: 0 })
          setUnpaidLoading(false)
        }
        return
      }

      const { data: totals, error: errTotals } = await supabase
        .from('credits_with_totals_vw')
        .select('id, remaining')
        .in('id', ids)

      if (!cancelled) {
        setUnpaidLoading(false)
        if (errTotals) {
          console.error(
            '[cashier-closing] unpaid totals fetch error',
            errTotals,
          )
          return
        }
        const sumRemaining = (totals || []).reduce(
          (s, r: any) => s + Math.round(Number(r?.remaining || 0)),
          0,
        )
        onChangePayments({ unpaid: sumRemaining })
      }
    }
    fetchUnpaid()
    return () => {
      cancelled = true
    }
  }, [queryKey, bump, shouldAutoSync]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- REPAYMENTS CASH/CARD (totale) + solo CASH + split -------- */
  const [repayLoading, setRepayLoading] = useState(false)
  useEffect(() => {
    let cancelled = false
    async function fetchRepaymentsCashCard() {
      if (!header?.dateStr || !activeBranchName) return
      if (!shouldAutoSync) return
      setRepayLoading(true)

      const { data: credits, error: errCredits } = await supabase
        .from('credits')
        .select('id')
        .eq('branch', activeBranchName)

      if (errCredits) {
        console.error(
          '[cashier-closing] repayments credits fetch error',
          errCredits,
        )
        setRepayLoading(false)
        return
      }
      const ids = (credits || []).map(r => String(r.id))
      if (ids.length === 0) {
        if (!cancelled) {
          onChangePayments({
            repaymentsCashCard: 0,
            repaymentsCashOnly: 0,
            repaymentCash: 0,
            repaymentCard: 0,
          })
          setRepayLoading(false)
        }
        return
      }

      const { startISO, endISO } = dayRange(header.dateStr)

      const { data, error } = await supabase
        .from('credit_payments')
        .select('amount, note, date, credit_id')
        .in('credit_id', ids)
        .gte('date', startISO)
        .lt('date', endISO)

      if (!cancelled) {
        setRepayLoading(false)
        if (error) {
          console.error('[cashier-closing] repayments fetch error', error)
          return
        }

        let totalAll = 0
        let totalCash = 0
        let totalCard = 0

        if (Array.isArray(data)) {
          for (const r of data as any[]) {
            const method = parseMethodFromNote(r?.note)
            const amount = Math.round(Number(r?.amount || 0))
            if (method === 'cash' || method === 'card') {
              totalAll += amount
            }
            if (method === 'cash') {
              totalCash += amount
            }
            if (method === 'card') {
              totalCard += amount
            }
          }
        }

        onChangePayments({
          repaymentsCashCard: totalAll,   // per Net
          repaymentsCashOnly: totalCash,  // per Expected cash
          repaymentCash: totalCash,       // dettaglio per SummaryCard
          repaymentCard: totalCard,
        })
      }
    }
    fetchRepaymentsCashCard()
    return () => {
      cancelled = true
    }
  }, [queryKey, bump, shouldAutoSync]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- DEPOSITS (totale cash/card + solo cash + split) ---------- */
  const [depositsLoading, setDepositsLoading] = useState(false)
  useEffect(() => {
    let cancelled = false
    async function fetchDeposits() {
      if (!header?.dateStr || !activeBranchName) return
      if (!shouldAutoSync) return
      setDepositsLoading(true)

      const { data: deps, error: errDeps } = await supabase
        .from('deposits')
        .select('id')
        .eq('branch', activeBranchName)

      if (errDeps) {
        console.error('[cashier-closing] deposits fetch error (deposits)', errDeps)
        setDepositsLoading(false)
        return
      }

      const ids = (deps || []).map(r => String(r.id))
      if (ids.length === 0) {
        if (!cancelled) {
          onChangeDeposits(0)
          onChangeDepositsCash?.(0)
          onChangePayments({ depositCash: 0, depositCard: 0 })
          setDepositsLoading(false)
        }
        return
      }

      const { startISO, endISO } = dayRange(header.dateStr)

      const { data, error } = await supabase
        .from('deposit_payments')
        .select('amount, date, deposit_id, note')
        .in('deposit_id', ids)
        .gte('date', startISO)
        .lt('date', endISO)

      if (!cancelled) {
        setDepositsLoading(false)
        if (error) {
          console.error('[cashier-closing] deposits fetch error (payments)', error)
          return
        }

        let totalAll = 0
        let totalCash = 0
        let totalCard = 0

        if (Array.isArray(data)) {
          for (const r of data as any[]) {
            const method = parseMethodFromNote(r?.note)
            const amount = Math.round(Number(r?.amount || 0))
            if (method === 'cash' || method === 'card') {
              totalAll += amount
            }
            if (method === 'cash') {
              totalCash += amount
            }
            if (method === 'card') {
              totalCard += amount
            }
          }
        }

        onChangeDeposits(totalAll)          // per Net
        onChangeDepositsCash?.(totalCash)   // per Expected cash
        onChangePayments({
          depositCash: totalCash,
          depositCard: totalCard,
        })
      }
    }
    fetchDeposits()
    return () => {
      cancelled = true
    }
  }, [queryKey, bump, shouldAutoSync]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasNotes = !!(header.notes && header.notes.trim())

  function handleSavedClick() {
    if (liveMode && onReloadSaved) {
      onReloadSaved()
    }
    onChangeLiveMode(false)
  }

  function handleLiveClick() {
    onChangeLiveMode(true)
  }

  const tpCount = thirdPartyAmounts.length

  function tpColSpanClass(idx: number): string {
    // mobile: una per riga. layout speciale solo da md in su
    if (tpCount <= 3) {
      return 'md:col-span-1'
    }
    if (tpCount === 4) {
      // 0 1 2 normali, 3 wide
      return idx < 3 ? 'md:col-span-1' : 'md:col-span-3'
    }
    if (tpCount === 5) {
      // 0 1 2 normali, 3 col-span-2, 4 col-span-1
      if (idx < 3) return 'md:col-span-1'
      if (idx === 3) return 'md:col-span-2'
      return 'md:col-span-1'
    }
    // 6: 3 + 3 normali
    return 'md:col-span-1'
  }

  return (
    <Card>
      <CardHeader
        title={t.title}
        right={
          <div className="flex items-center gap-2">
            {isExisting && (
              <div className="inline-flex items-center rounded-lg border border-gray-300 bg-white text-xs overflow-hidden">
                <button
                  type="button"
                  className={`px-3 py-1 ${!liveMode
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  onClick={handleSavedClick}
                >
                  {t.saved}
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 border-l border-gray-300 ${liveMode
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  onClick={handleLiveClick}
                >
                  {t.live}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowNotes(x => !x)}
              className="relative inline-flex items-center justify-center h-8 w-8 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
              title={t.addComment}
            >
              <ChatBubbleOvalLeftEllipsisIcon className="w-4 h-4" />
              {hasNotes && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-blue-500" />
              )}
            </button>
          </div>
        }
      />
      <div className="p-3 space-y-4">
        {/* Header: Date / Branch (read-only) / Closed by (read-only) */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-600">{t.date}</span>
            <input
              type="date"
              value={header.dateStr}
              onChange={e => onChangeHeader({ dateStr: e.target.value })}
              className="border rounded-lg px-2 h-9 bg-white"
            />
          </label>

          <div className="flex flex-col gap-1 md:col-span-2">
            <span className="text-xs text-gray-600">{t.branch}</span>
            <div
              title={t.branchTooltip}
              className="h-9 px-3 rounded-lg border bg-gray-50 text-gray-800 flex items-center justify-between"
            >
              <div className="truncate">
                {validating ? t.branchLoading : activeBranchName || t.branchNone}
              </div>
              <span className="text-[11px] text-gray-500">{t.readOnly}</span>
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-600">{t.cashier}</span>
            <input
              type="text"
              value={header.cashier}
              readOnly
              className="border rounded-lg px-3 h-9 bg-gray-50 text-gray-800"
              title={t.cashierTooltip}
            />
          </label>
        </section>

        {/* Revenue + Cash out sulla stessa riga */}
        <section className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t.revenueTitle}</h3>
            {depositsLoading && (
              <span className="text-[11px] text-gray-500">{t.depositsLoading}</span>
            )}
          </div>

          <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-xs text-gray-600">{t.revenue}</span>
              <NumFmt
                value={v(payments.revenue)}
                onChange={x => onChangePayments({ revenue: x })}
                placeholder="0"
              />
            </label>

            <ReadOnlyMoney
              label={cashOutLoading ? t.cashOutLoading : t.cashOut}
              value={v(payments.cashOut)}
            />
          </div>

          {/* Payment channels */}
          <div className="px-3 pb-3 space-y-3">
            {/* Riga: Third-party payments dinamici o frozen */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {thirdPartyAmounts.length === 0 && (
                <div className="text-sm text-gray-500 md:col-span-3">
                  {t.thirdPartyEmpty}
                </div>
              )}
              {thirdPartyAmounts.map((item, idx) => (
                <EditMoney
                  key={`tp-${idx}`}
                  label={t.thirdPartyPayment.replace(
                    '{label}',
                    item.label || t.thirdPartyFallback.replace('{n}', String(idx + 1))
                  )}
                  value={item.amount}
                  onChange={x => {
                    const next = thirdPartyAmounts.map((it, i) =>
                      i === idx ? { ...it, amount: x } : it,
                    )
                    onChangePayments({ thirdPartyAmounts: next })
                  }}
                  className={`col-span-1 ${tpColSpanClass(idx)}`}
                />
              ))}
            </div>

            {/* Riga: Card / Unpaid / Bank transfer */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <EditMoney
                label={t.cardPayments}
                value={v(payments.mpos)}
                onChange={x => onChangePayments({ mpos: x })}
              />
              <ReadOnlyMoney
                label={unpaidLoading ? t.unpaidLoading : t.unpaid}
                value={v(payments.unpaid)}
              />
              <ReadOnlyMoney
                label={
                  bankTransferLoading
                    ? t.bankTransferLoading
                    : t.bankTransfer
                }
                value={v(payments.bankTransferEwallet)}
              />
            </div>

            {/* Riga finale: Repayments credits / Deposits / Net, con divisorio */}
            <div className="mt-1 pt-3 border-t border-dashed border-gray-200 bg-gray-50/60 rounded-lg grid grid-cols-1 md:grid-cols-3 gap-3 px-2 py-3">
              <ReadOnlyMoney
                label={
                  repayLoading
                    ? t.repaymentsLoading
                    : t.repaymentsLabel
                }
                value={v(payments.repaymentsCashCard)}
                emphasis="positive"
              />
              <ReadOnlyMoney
                label={
                  depositsLoading
                    ? t.depositsLoading
                    : t.depositsLabel
                }
                value={v(deposits)}
              />
              <ReadOnlyMoney label={t.netCash} value={netVal} strong />
            </div>
          </div>
        </section>

        {/* Comment area, sotto il blocco Revenue */}
        {showNotes && (
          <section className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600">{t.comment}</span>
              <textarea
                value={header.notes || ''}
                onChange={e => onChangeHeader({ notes: e.target.value })}
                className="border rounded-lg px-3 py-2 min-h-[80px] bg-white text-sm"
                placeholder={t.commentPlaceholder}
              />
            </label>
          </section>
        )}
      </div>
    </Card>
  )
}

/* Subcomponenti */
function EditMoney(props: {
  label: string
  value: number
  onChange: (v: number) => void
  className?: string
}) {
  const { label, value, onChange, className = '' } = props
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs text-gray-600">{label}</span>
      <NumFmt value={value} onChange={onChange} />
    </label>
  )
}

function ReadOnlyMoney(props: {
  label: string
  value: number
  strong?: boolean
  emphasis?: 'neutral' | 'positive' | 'negative'
}) {
  const { label, value, strong, emphasis = 'neutral' } = props
  const cls =
    emphasis === 'neutral'
      ? 'text-gray-900'
      : emphasis === 'positive'
        ? 'text-emerald-700'
        : 'text-red-700'
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-600">{label}</span>
      <div
        className={`border rounded-lg px-2 h-9 bg-gray-50 flex items-center justify-end tabular-nums ${strong ? 'font-semibold' : ''
          } ${cls}`}
      >
        {fmt(value)}
      </div>
    </label>
  )
}
