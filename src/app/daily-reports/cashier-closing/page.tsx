// app/daily-reports/cashier-closing/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import CircularLoader from '@/components/CircularLoader'

import InitialInfoCard, { type Header as HeaderInfo, type PaymentBreakdown } from './_cards/InitialInfoCard'
import CashCountCard from './_cards/CashCountCard'
import SummaryCard from './_cards/SummaryCard'
import { useRouter, useSearchParams } from 'next/navigation'
import { useDRBranch } from '../_data/useDRBranch'
import { supabase } from '@/lib/supabase_shim'
import { useCashierLuke } from '../_data/useCashierLuke'
import { useSettings } from '@/contexts/SettingsContext'
import { getDailyReportsDictionary } from '../_i18n'
import { useDailyReportSettings } from '../_data/useDailyReportSettings'

// PDF libs
import html2canvas from 'html2canvas-pro'
import jsPDF from 'jspdf'

/* ---------- Small network retry helper ---------- */
function isNetworkError(err: any) {
  const msg = String(err?.message || err || '')
  return (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('The Internet connection appears to be offline')
  )
}

async function retryOnNetwork<T>(
  fn: () => Promise<T>,
  retries = 1,
  delayMs = 1200
): Promise<T> {
  let lastErr: any
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      if (!isNetworkError(err) || attempt === retries) {
        throw err
      }
      await new Promise(res => setTimeout(res, delayMs))
    }
  }
  throw lastErr
}

/* ---------- safe legacy bridge wrapper ---------- */
function useBridgeSafe() {
  try {
    // if legacy hook exists in future
    // @ts-ignore
    const b: any = typeof window !== 'undefined' && (window as any).useBridgeLegacyBranchRaw?.()
    if (b && typeof b.setName === 'function') return b
  } catch { }
  const [name, setNameState] = useState<string>(() => {
    try { return localStorage.getItem('DR_BRANCH_NAME') || '' } catch { return '' }
  })

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'DR_BRANCH_NAME') setNameState(e.newValue || '')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setName = useCallback((v: string) => {
    try {
      if (v) localStorage.setItem('DR_BRANCH_NAME', v)
      else localStorage.removeItem('DR_BRANCH_NAME')
      localStorage.setItem('dr_branch_last_emit_at', String(Date.now()))
      setNameState(v || '')
      window.dispatchEvent(new CustomEvent('dr:branch:changed', { detail: { name: v || '' } }))
      window.dispatchEvent(new CustomEvent('dailyreports:branch:changed', { detail: { name: v || '' } }))
      window.dispatchEvent(new CustomEvent('cashier:branch:changed', { detail: { name: v || '' } }))
    } catch { }
  }, [])

  return { name, setName }
}

/* VND denominations for counting */
const DENOMS = [
  { key: 'd500k', face: 500_000 },
  { key: 'd200k', face: 200_000 },
  { key: 'd100k', face: 100_000 },
  { key: 'd50k', face: 50_000 },
  { key: 'd20k', face: 20_000 },
  { key: 'd10k', face: 10_000 },
  { key: 'd5k', face: 5_000 },
  { key: 'd2k', face: 2_000 },
  { key: 'd1k', face: 1_000 },
] as const
type DenomKey = typeof DENOMS[number]['key']
type CashShape = Record<DenomKey, number>

/* Provider branch type for PDF header */
type ProviderBranch = {
  id: string
  name: string
  company_name?: string
  address?: string
  tax_code?: string
  phone?: string
  email?: string
}

/* ===== SaveBar helpers ===== */
const savedSigKey = (scope: string) => `cashier.savedSig:${scope}`
const lastSavedKey = (scope: string) => `cashier.lastSavedAt:${scope}`

function lastSavedLabel(
  ts: number | null,
  t: { savedAt: string; savedAtNoTime: string; never: string }
) {
  if (!ts) return t.never
  const d = new Date(ts)

  const pad2 = (n: number) => String(n).padStart(2, '0')
  const day = pad2(d.getDate())
  const month = pad2(d.getMonth() + 1)
  const year = d.getFullYear()

  let time = ''
  try {
    time = d.toLocaleTimeString()
  } catch { }

  const dateStr = `${day}/${month}/${year}`
  if (time) return t.savedAt.replace('{date}', dateStr).replace('{time}', time)
  return t.savedAtNoTime.replace('{date}', dateStr)
}

function signatureOfState(state: {
  header: HeaderInfo
  floatTarget: number
  payments: PaymentBreakdown
  payouts: number
  deposits: number
  cash: CashShape
  floatPlan: CashShape
}) {
  const { header, floatTarget, payments, payouts, deposits, cash, floatPlan } = state
  const lines: string[] = []
  lines.push(`H|${header.dateStr}|${header.branch || ''}|${header.cashier || ''}`)
  lines.push(`F|${Math.round(floatTarget)}`)
  const p = payments || {}
  lines.push([
    'P',
    Math.round(p.revenue || 0),
    Math.round(p.gojek || 0),
    Math.round(p.grab || 0),
    Math.round(p.mpos || 0),
    Math.round(p.unpaid || 0),
    Math.round((p as any).setOffDebt || 0),
    Math.round(p.capichi || 0),
    Math.round(p.bankTransferEwallet || 0),
    Math.round(p.cashOut || 0),
  ].join('|'))
  lines.push(`A|${Math.round(payouts || 0)}|${Math.round(deposits || 0)}`)
  lines.push('C|' + DENOMS.map(d => `${d.key}:${Math.round(cash[d.key] || 0)}`).join(','))
  lines.push('T|' + DENOMS.map(d => `${d.key}:${Math.round(floatPlan[d.key] || 0)}`).join(','))
  return lines.join('||')
}

export default function CashierClosingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialIdFromUrl = searchParams.get('id')
  const { language } = useSettings()
  const dict = getDailyReportsDictionary(language).cashierClosing
  const t = dict

  // Official branch (can be null if dashboard did not set it via hook)
  const { branch, validating, invalid } = useDRBranch({ validate: true })

  // Legacy/local bridge (reads DR_BRANCH_NAME)
  const bridge = useBridgeSafe()
  const officialName = branch?.name || ''
  const bridgeName = bridge?.name || ''
  const setBridgeName: (v: string) => void = bridge?.setName || (() => { })

  // Prima il nome ufficiale, poi il fallback legacy
  const activeBranchName = officialName || bridgeName

  // Sincronizza officialName verso bridgeName solo se diverso, evitando loop
  useEffect(() => {
    if (!officialName) return
    if (bridgeName === officialName) return
    setBridgeName(officialName)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officialName, bridgeName])

  // Luke (DB layer)
  const {
    id: lukeId,
    load: lukeLoad,
    save: lukeSave,
    loading: lukeLoading,
    saving: lukeSaving,
  } = useCashierLuke(initialIdFromUrl)

  // Header
  const [header, setHeader] = useState<HeaderInfo>({
    dateStr: todayISO(),
    shift: '',
    cashier: '',
    notes: '',
  })

  // Float target (State managed here)
  const [floatTarget, setFloatTarget] = useState<number>(0)



  // Payments
  const [payments, setPayments] = useState<PaymentBreakdown>({
    revenue: 0,
    gojek: 0,
    grab: 0,
    mpos: 0,
    unpaid: 0,
    // setOffDebt rimane per compat in signatureOfState
    capichi: 0,
    bankTransferEwallet: 0,
    cashOut: 0,
    // usati da InitialInfoCard per Net/Expected
    repaymentsCashCard: 0,
    repaymentsCashOnly: 0,
  } as PaymentBreakdown)

  // Adjustments
  const [payouts, setPayouts] = useState<number>(0)
  const [deposits, setDeposits] = useState<number>(0)
  const [depositsCash, setDepositsCash] = useState<number>(0)

  // Cash in drawer
  const [cash, setCash] = useState<CashShape>({
    d500k: 0, d200k: 0, d100k: 0, d50k: 0, d20k: 0,
    d10k: 0, d5k: 0, d2k: 0, d1k: 0,
  })

  // Float plan (to take)
  const [floatPlan, setFloatPlan] = useState<CashShape>({
    d500k: 0, d200k: 0, d100k: 0, d50k: 0, d20k: 0,
    d10k: 0, d5k: 0, d2k: 0, d1k: 0,
  })

  // Read read-only mode from URL
  const readOnlyParam = searchParams.get('mode') === 'readonly'
  const isReadOnly = initialIdFromUrl ? readOnlyParam : false // Only force readonly if not a new record

  // Live / Saved mode
  // If readonly, we are definitely NOT live.
  const [liveMode, setLiveMode] = useState<boolean>(() => !initialIdFromUrl && !isReadOnly)

  // -- Float Target Resolution Logic --
  const { settings } = useDailyReportSettings()
  const DEFAULT_FLOAT = 3_000_000

  /* Override live */
  const [liveFloat, setLiveFloat] = useState<number | null>(null)

  /* 0) all mount: leggi cache locale scritta dai Settings per navigazioni stessa tab */
  useEffect(() => {
    try {
      const raw = localStorage.getItem('dr.settings.cache') || ''
      if (!raw) return
      const parsed = JSON.parse(raw || '{}')
      const v = Number(parsed?.cashFloatVND)
      if (Number.isFinite(v) && v > 0) setLiveFloat(Math.round(v))
    } catch { }
  }, [])

  /* 1) stessa tab: CustomEvent */
  useEffect(() => {
    function onLocal(e: Event) {
      const ce = e as CustomEvent<any>
      const v = Number(ce?.detail?.value)
      if (Number.isFinite(v) && v > 0) setLiveFloat(Math.round(v))
    }
    window.addEventListener('dr:settings:cashFloatVND', onLocal as EventListener)
    return () => window.removeEventListener('dr:settings:cashFloatVND', onLocal as EventListener)
  }, [])

  /* 2) cross-tab: storage bump */
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== 'dr.settings.bump') return
      try {
        const raw = localStorage.getItem('dr.settings.cache') || ''
        const parsed = JSON.parse(raw || '{}')
        const v = Number(parsed?.cashFloatVND)
        if (Number.isFinite(v) && v > 0) setLiveFloat(Math.round(v))
      } catch { }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /* 3) cross-tab: BroadcastChannel */
  useEffect(() => {
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel('dr-settings')
      bc.onmessage = (msg) => {
        const d = msg?.data
        if (d?.type === 'cashFloatVND') {
          const v = Number(d?.value)
          if (Number.isFinite(v) && v > 0) setLiveFloat(Math.round(v))
        }
      }
    } catch { }
    return () => { try { bc?.close() } catch { } }
  }, [])

  /* Valore dal DB (supporta shape piatta o nidificata) */
  const dbFloat = useMemo(() => {
    const s: any = settings || {}
    const n = Number(
      s?.cashFloatVND ??
      s?.cash_count_vnd ??
      s?.cashCount?.cashFloatVND ??
      s?.cash_count?.cashFloatVND
    )
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }, [settings])

  /* Composizione finale del float */
  const resolvedFloatTarget = useMemo(() => {
    if (liveFloat != null) return liveFloat
    if (dbFloat != null) return dbFloat
    return DEFAULT_FLOAT
  }, [liveFloat, dbFloat])

  /* Se DB ha raggiunto l override, pulisci l override */
  useEffect(() => {
    if (liveFloat != null && dbFloat != null && liveFloat === dbFloat) {
      setLiveFloat(null)
    }
  }, [liveFloat, dbFloat])

  // Sync resolved float target to state ONLY IF we are in live mode (new record)
  // If we loaded a record (lukeId exists), we trust the loaded floatTarget.
  useEffect(() => {
    if (liveMode) {
      setFloatTarget(resolvedFloatTarget)
    }
  }, [liveMode, resolvedFloatTarget])

  const [lastEditorName, setLastEditorName] = useState<string>('')
  const [currentUserName, setCurrentUserName] = useState<string>('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    async function loadUser() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !alive) return

        setCurrentUserId(user.id)

        // Try app_accounts first
        const { data: acc } = await supabase
          .from('app_accounts')
          .select('name')
          .eq('user_id', user.id)
          .maybeSingle()

        if (acc?.name && alive) {
          setCurrentUserName(acc.name)
          return
        }

        // Fallback to metadata
        const metaName = user.user_metadata?.full_name || user.user_metadata?.name || user.email || ''
        if (alive) setCurrentUserName(metaName)
      } catch { }
    }
    loadUser()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (initialIdFromUrl) setLiveMode(false)
  }, [initialIdFromUrl])

  // Hydration from Luke
  useEffect(() => {
    if (!lukeId) return
    let cancelled = false
      ; (async () => {
        const res = await lukeLoad(lukeId)
        if (!res || cancelled) return
        setHeader(res.header)
        setFloatTarget(res.floatTarget)
        setPayments(res.payments)
        setPayouts(res.payouts)
        setDeposits(res.deposits)
        setDepositsCash(0) // verrà ricalcolato live da InitialInfoCard
        setCash(res.cash as CashShape)
        setFloatPlan(res.floatPlan as CashShape)
        setLastEditorName(res.lastEditorName || '')
        if (res.updatedAt) {
          const ts = new Date(res.updatedAt).getTime()
          if (!Number.isNaN(ts) && ts > 0) setLastSavedAtUI(ts)
        }

        const loadedSig = signatureOfState({
          header: res.header,
          floatTarget: res.floatTarget,
          payments: res.payments,
          payouts: res.payouts,
          deposits: res.deposits,
          cash: res.cash as CashShape,
          floatPlan: res.floatPlan as CashShape,
        })
        setServerSigOverride(loadedSig)
      })()
    return () => { cancelled = true }
  }, [lukeId, lukeLoad])

  // Track dirty state for reload protection
  const isDirtyRef = useRef(false)

  const handleReloadSaved = useCallback(async (force = false) => {
    // If form is dirty (unsaved changes) AND NOT FORCED, do NOT reload from server
    if (!force && isDirtyRef.current) return

    if (!lukeId) return
    const res = await lukeLoad(lukeId)
    if (!res) return
    setHeader(res.header)
    setFloatTarget(res.floatTarget)
    setPayments(res.payments)
    setPayouts(res.payouts)
    setDeposits(res.deposits)
    setDepositsCash(0)
    setCash(res.cash as CashShape)
    setFloatPlan(res.floatPlan as CashShape)
    setLastEditorName(res.lastEditorName || '')
    if (res.updatedAt) {
      const ts = new Date(res.updatedAt).getTime()
      if (!Number.isNaN(ts) && ts > 0) setLastSavedAtUI(ts)
    }

    const loadedSig = signatureOfState({
      header: res.header,
      floatTarget: res.floatTarget,
      payments: res.payments,
      payouts: res.payouts,
      deposits: res.deposits,
      cash: res.cash as CashShape,
      floatPlan: res.floatPlan as CashShape,
    })
    setServerSigOverride(loadedSig)
  }, [lukeId, lukeLoad])

  useEffect(() => {
    const onFocus = () => {
      // Only reload if visible AND in Saved mode (not Live)
      if (document.visibilityState === 'visible' && !liveMode) {
        handleReloadSaved()
      }
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [handleReloadSaved, liveMode])

  // When switching from Live -> Saved, force reload to restore snapshot
  useEffect(() => {
    if (!liveMode) {
      handleReloadSaved(true) // Force reload
    }
  }, [liveMode, handleReloadSaved])

  /* ============================
      DERIVED TOTALS
     ============================ */

  // Counted cash
  const countedCash = useMemo(() => {
    let sum = 0
    for (const { key, face } of DENOMS) sum += (cash[key] || 0) * face
    return round(Math.max(0, sum))
  }, [cash])

  /* 1) Net Cash (uguale a InitialInfoCard) */
  const netCash = useMemo(() => {
    const vnum = (n: number | undefined) => Number.isFinite(Number(n)) ? Number(n) : 0

    const thirdPartyTotal = (payments.thirdPartyAmounts || []).reduce((sum, item) => sum + vnum(item.amount), 0)

    const nonCash =
      thirdPartyTotal +
      vnum(payments.mpos) +
      vnum(payments.bankTransferEwallet)
    // Note: gojek, grab, capichi are now included in thirdPartyAmounts by InitialInfoCard logic
    // BUT we must be careful. If InitialInfoCard merges them, we shouldn't add them separately.
    // Let's check InitialInfoCard logic. It seems it merges legacy fields into thirdPartyAmounts for display.
    // However, the 'payments' object here comes from useCashierLuke -> InitialInfoCard -> onChangePayments.
    // If InitialInfoCard updates 'payments.thirdPartyAmounts' to include everything, then we just need thirdPartyTotal.
    // If it keeps them separate in 'payments' state, we need to sum them.
    //
    // Looking at InitialInfoCard (step 1085), it calculates `thirdPartyTotal` from `thirdPartyAmounts` state.
    // And `nonCash` includes `thirdPartyTotal` + `mpos` + `bankTransfer`.
    // It does NOT add `gojek` etc separately in `nonCash`.
    // So assuming `payments.thirdPartyAmounts` is fully populated by InitialInfoCard, we should trust it.
    //
    // However, `payments` state in `page.tsx` might be initialized with legacy fields separate from thirdPartyAmounts array.
    // If `InitialInfoCard` syncs them, then `payments.thirdPartyAmounts` should be the source of truth.
    //
    // Let's look at `InitialInfoCard` again. It has `useEffect` that calls `onChangePayments({ thirdPartyAmounts })`.
    // So `page.tsx` state *should* have the full list.
    //
    // SAFE FIX: Use the same logic as InitialInfoCard:
    // nonCash = thirdPartyTotal + mpos + bankTransferEwallet.
    // (Assuming gojek/grab/capichi are inside thirdPartyAmounts).

    const net =
      vnum(payments.revenue) -
      nonCash -
      vnum(payments.unpaid) -
      vnum(payments.cashOut) +
      vnum(payments.repaymentsCashCard) +
      vnum(deposits)

    return round(net)
  }, [payments, deposits])

  /* 2) Expected Drawer Cash (Net + Float) */
  const expectedDrawerCash = useMemo(() => {
    return round(netCash + floatTarget)
  }, [netCash, floatTarget])

  // Difference
  const cashDiff = useMemo(
    () => round(countedCash - expectedDrawerCash),
    [countedCash, expectedDrawerCash]
  )

  /* Provider branch info for PDF */
  const [providerBranch, setProviderBranch] = useState<ProviderBranch | null>(null)

  useEffect(() => {
    let ignore = false

    async function loadProviderBranch() {
      const id = (branch as any)?.id as string | undefined
      const name = (branch as any)?.name as string | undefined || header.branch

      if (!id && !name) {
        if (!ignore) setProviderBranch(null)
        return
      }

      try {
        let query = supabase.from('provider_branches').select('*').limit(1)
        if (id) query = query.eq('id', id)
        else if (name) query = query.eq('name', name)

        const { data } = await retryOnNetwork(async () => {
          const { data, error } = await query
          if (error) throw error
          return { data }
        })

        if (!ignore) {
          const row = data?.[0]
          if (row) {
            setProviderBranch({
              id: String(row.id),
              name: row.name ?? '',
              company_name: row.company_name ?? '',
              address: row.address ?? '',
              tax_code: row.tax_code ?? '',
              phone: row.phone ?? '',
              email: row.email ?? '',
            })
          } else {
            setProviderBranch(null)
          }
        }
      } catch (err) {
        if (!ignore) {
          console.warn('[cashier] provider branch load failed', err)
          setProviderBranch(null)
        }
      }
    }

    loadProviderBranch()
    return () => { ignore = true }
  }, [branch, header.branch])

  // Actions
  function clearCounts() {
    setCash({ d500k: 0, d200k: 0, d100k: 0, d50k: 0, d20k: 0, d10k: 0, d5k: 0, d2k: 0, d1k: 0 })
    setFloatPlan({ d500k: 0, d200k: 0, d100k: 0, d50k: 0, d20k: 0, d10k: 0, d5k: 0, d2k: 0, d1k: 0 })
  }

  function resetAll() {
    setHeader({ dateStr: todayISO(), shift: '', cashier: '', notes: '' })
    setFloatTarget(0)
    setPayments({
      revenue: 0,
      gojek: 0,
      grab: 0,
      mpos: 0,
      unpaid: 0,
      setOffDebt: 0,
      capichi: 0,
      bankTransferEwallet: 0,
      cashOut: 0,
      repaymentsCashCard: 0,
      repaymentsCashOnly: 0,
    } as PaymentBreakdown)
    setPayouts(0)
    setDeposits(0)
    setDepositsCash(0)
    clearCounts()
    setLiveMode(true)
  }

  async function exportPDF() {
    try {
      const el = document.querySelector('[data-cashier-pdf-root="1"]') as HTMLElement | null
      if (!el) return

      const canvas = await html2canvas(el, {
        scale: 2,
        onclone: (clonedDoc: Document) => {
          const root = clonedDoc.querySelector('[data-cashier-pdf-root="1"]') as HTMLElement | null
          if (!root) return
          const buttons = root.querySelectorAll('button, [data-hide-in-pdf="1"]')
          buttons.forEach(node => { (node as HTMLElement).style.display = 'none' })

          const fields = root.querySelectorAll('input, textarea, select')
          fields.forEach(node => {
            const anyField = node as any
            const win = clonedDoc.defaultView
            const cs = win ? win.getComputedStyle(node) : null
            let text = ''

            if (node instanceof HTMLInputElement) {
              if (node.type === 'date') {
                const raw = node.value || ''
                if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                  const [y, m, d] = raw.split('-')
                  text = `${d}/${m}/${y}`
                } else text = raw || node.placeholder || ''
              } else {
                text = anyField.value || node.placeholder || ''
              }
            } else if (node instanceof HTMLTextAreaElement) {
              text = anyField.value || node.textContent || ''
            } else if (node instanceof HTMLSelectElement) {
              const opt = node.options[node.selectedIndex]
              text = opt ? opt.textContent || '' : ''
            } else text = (node as HTMLElement).textContent || ''

            const span = clonedDoc.createElement('div')
            span.textContent = text
            span.style.display = 'flex'
            span.style.alignItems = 'center'
            span.style.justifyContent = 'flex-start'

            if (cs) {
              span.style.fontFamily = cs.fontFamily
              span.style.fontSize = cs.fontSize
              span.style.fontWeight = cs.fontWeight
              span.style.color = cs.color
              span.style.border = cs.border
              span.style.borderRadius = cs.borderRadius
              span.style.paddingTop = cs.paddingTop
              span.style.paddingRight = cs.paddingRight
              span.style.paddingBottom = cs.paddingBottom
              span.style.paddingLeft = cs.paddingLeft
              span.style.height = cs.height
              span.style.boxSizing = cs.boxSizing
              span.style.backgroundColor = cs.backgroundColor
            }

            if (node.parentNode) node.parentNode.replaceChild(span, node)
          })
        },
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })

      const margin = 10
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()

      let headerY = margin

      if (providerBranch) {
        const mainLine = providerBranch.company_name || providerBranch.name
        const branchLine = providerBranch.company_name ? providerBranch.name : ''
        pdf.setFontSize(11)
        if (mainLine) { pdf.text(mainLine, margin, headerY); headerY += 5 }
        if (branchLine) {
          pdf.setFontSize(10)
          pdf.text(branchLine, margin, headerY)
          headerY += 5
        }
        if (providerBranch.address) {
          pdf.setFontSize(9)
          pdf.text(providerBranch.address, margin, headerY)
          headerY += 5
        }
        const parts = []
        if (providerBranch.tax_code) parts.push(`Tax code: ${providerBranch.tax_code}`)
        if (providerBranch.phone) parts.push(`Phone: ${providerBranch.phone}`)
        if (providerBranch.email) parts.push(`Email: ${providerBranch.email}`)
        if (parts.length > 0) {
          pdf.setFontSize(9)
          pdf.text(parts.join('    '), margin, headerY)
          headerY += 6
        }
        headerY += 2
      }

      const availableWidth = pageWidth - margin * 2
      const availableHeight = pageHeight - headerY - margin

      const imgAspect = canvas.width / canvas.height
      const areaAspect = availableWidth / availableHeight

      let renderWidth: number
      let renderHeight: number

      if (imgAspect > areaAspect) {
        renderWidth = availableWidth
        renderHeight = renderWidth / imgAspect
      } else {
        renderHeight = availableHeight
        renderWidth = renderHeight * imgAspect
      }

      const x = margin + (availableWidth - renderWidth) / 2
      const y = headerY + (availableHeight - renderHeight) / 2

      pdf.addImage(imgData, 'PNG', x, y, renderWidth, renderHeight)

      const safeDate = header.dateStr || 'report'
      const safeBranch = (activeBranchName || 'branch').replace(/\s+/g, '_')
      const fileName = `cashier-closing_${safeBranch}_${safeDate}.pdf`
      pdf.save(fileName)

    } catch (err) {
      console.error('Failed to export cashier closing pdf', err)
    }
  }

  /* ===== SaveBar state ===== */

  const scope = `${header.dateStr}@@${activeBranchName}`

  const [lastSavedAtUI, setLastSavedAtUI] = useState<number | null>(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(lastSavedKey(scope)) : null
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  })

  useEffect(() => {
    try {
      const raw = localStorage.getItem(lastSavedKey(scope))
      const n = raw ? Number(raw) : NaN
      setLastSavedAtUI(Number.isFinite(n) && n > 0 ? n : null)
    } catch { }
  }, [scope])

  const sigDraft = useMemo(() => signatureOfState({
    header, floatTarget, payments, payouts, deposits, cash, floatPlan,
  }), [header, floatTarget, payments, payouts, deposits, cash, floatPlan])

  const [serverSigOverride, setServerSigOverride] = useState<string | null>(null)
  const sigServerRawRef = useRef<string>('')

  useEffect(() => {
    const saved = typeof window !== 'undefined'
      ? localStorage.getItem(savedSigKey(scope))
      : null
    sigServerRawRef.current = saved || ''
  }, [scope])

  const sigServer = serverSigOverride ?? sigServerRawRef.current
  const [coldStartSilence, setColdStartSilence] = useState(true)

  useEffect(() => {
    const id = setTimeout(() => setColdStartSilence(false), 900)
    return () => clearTimeout(id)
  }, [])

  const [suppressingDirty, setSuppressingDirty] = useState(false)
  const displayDirty = !coldStartSilence && !suppressingDirty && sigDraft !== sigServer
  const disableSave = !displayDirty || lukeSaving

  // Keep ref in sync for handleReloadSaved
  useEffect(() => {
    isDirtyRef.current = displayDirty
  }, [displayDirty])

  useEffect(() => {
    if (suppressingDirty || coldStartSilence) return
    try {
      window.dispatchEvent(
        new CustomEvent('cashier:dirty', { detail: { dirty: sigDraft !== sigServer } })
      )
    } catch { }
  }, [sigDraft, sigServer, suppressingDirty, coldStartSilence])

  useEffect(() => {
    const onSaved = () => {
      const now = Date.now()
      setLastSavedAtUI(now)
      try { localStorage.setItem(lastSavedKey(scope), String(now)) } catch { }
      setSuppressingDirty(true)
      setTimeout(() => setSuppressingDirty(false), 1200)
    }
    window.addEventListener('cashier:saved', onSaved as EventListener)
    return () => window.removeEventListener('cashier:saved', onSaved as EventListener)
  }, [scope])

  const onSaveAll = useCallback(async () => {
    try {
      const branchNameForClosing = activeBranchName || header.branch || ''

      if (!branchNameForClosing) {
        alert(t.alerts.selectBranch)
        return
      }

      if (lukeId && liveMode) {
        const ok = window.confirm(t.alerts.liveOverwrite)
        if (!ok) return
      }

      try {
        const { data: existing } = await retryOnNetwork(async () => {
          const { data, error } = await supabase
            .from('cashier_closings')
            .select('id')
            .eq('report_date', header.dateStr)
            .eq('branch_name', branchNameForClosing)
            .maybeSingle()
          if (error) throw error
          return { data }
        })

        if (existing && (existing as any).id && (existing as any).id !== lukeId) {
          alert(t.alerts.duplicate)
          return
        }
      } catch { }

      const payload = {
        id: lukeId || null,
        header,
        floatTarget,
        payments,
        payouts,
        deposits,
        cash,
        floatPlan,
        // usare l'UUID reale della provider_branches
        branchId: providerBranch?.id ? String(providerBranch.id) : null,
        userId: currentUserId,
      }

      const newId = await lukeSave(payload)
      if (!newId) return

      try {
        const params = new URLSearchParams(window.location.search)
        params.set('id', newId)
        router.replace(`/daily-reports/cashier-closing?${params.toString()}`)
      } catch { }

      const now = Date.now()
      localStorage.setItem(savedSigKey(scope), sigDraft)
      localStorage.setItem(lastSavedKey(scope), String(now))
      setServerSigOverride(sigDraft)
      setLastSavedAtUI(now)
      if (currentUserName) setLastEditorName(currentUserName)
      window.dispatchEvent(new CustomEvent('cashier:saved'))

    } catch (e: any) {
      console.error('[cashier] save error', e)
      alert(t.alerts.saveFailed)
    }
  }, [
    lukeId,
    header,
    floatTarget,
    payments,
    payouts,
    deposits,
    cash,
    floatPlan,
    branch,
    scope,
    sigDraft,
    lukeSave,
    router,
    activeBranchName,
    liveMode,
    providerBranch,
    currentUserId,
    t.alerts.selectBranch,
    t.alerts.liveOverwrite,
    t.alerts.duplicate,
    t.alerts.saveFailed,
  ])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase()
      if (isReadOnly) return
      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault()
        onSaveAll()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onSaveAll])

  if (lukeLoading) return <CircularLoader />

  if (!activeBranchName && !validating) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-gray-100">
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
          <h1 className="text-2xl font-bold text-white">{t.title}</h1>
          <p className="mt-2 text-slate-300">{t.branch.allSet}</p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="h-10 px-4 rounded-xl bg-blue-600 text-white hover:opacity-90"
            >
              {t.branch.goDashboard}
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-400">{t.branch.hint}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-4 text-gray-100 pb-28">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{t.title}</h1>

          <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-600/15 px-3 py-1 text-xs text-blue-100">
            {validating ? (
              <span>{t.branch.checking}</span>
            ) : invalid && !officialName ? (
              <span>{t.branch.local}</span>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-green-400" />
                <span className="font-medium">{activeBranchName}</span>
              </>
            )}
          </div>

          {lukeLoading && <span className="text-xs text-slate-300">{t.header.loading}</span>}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border border-blue-400/30"
            title={t.header.resetTitle}
          >
            <ArrowPathIcon className="w-5 h-5" />
            {t.header.reset}
          </button>

          <button
            type="button"
            onClick={exportPDF}
            className="no-print inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-80"
            title={t.header.exportTitle}
          >
            <ArrowDownTrayIcon className="w-5 h-5" />
            {t.header.export}
          </button>
        </div>
      </div>

      {/* SaveBar */}
      {!isReadOnly && (
        <div className="no-print fixed bottom-4 left-0 right-0 pointer-events-none z-[70] flex justify-center">
          <div
            className="pointer-events-auto bg-white/95 border border-gray-200 shadow-lg rounded-xl px-3 py-2 flex items-center justify-between gap-3"
            style={{
              width: 'min(80rem, calc(100vw - 2rem))',
              maxWidth: 'calc(100vw - (var(--leftnav-w, 56px) * 2) - 2rem)',
            }}
          >
            <div className="text-sm text-gray-700">
              {lukeSaving
                ? t.saveBar.saving
                : displayDirty
                  ? t.saveBar.dirty
                  : lastSavedLabel(lastSavedAtUI, t.saveBar) + (lastEditorName ? ` • ${lastEditorName}` : '')}
            </div>

            <div className="flex items-center gap-2">
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-xs border rounded bg-gray-50 text-gray-600">
                {t.saveBar.shortcut}
              </kbd>
              <button
                className="h-9 px-3 rounded bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 disabled:hover:bg-blue-600"
                onClick={onSaveAll}
                disabled={disableSave}
              >
                {t.saveBar.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main cards */}
      <div className="space-y-3" data-cashier-pdf-root="1">
        <InitialInfoCard
          header={header}
          openingFloat={floatTarget}
          payments={payments}
          payouts={payouts}
          deposits={deposits}
          depositsCash={depositsCash}
          grossTakings={0}
          onChangeHeader={(patch) => setHeader(h => ({ ...h, ...patch }))}
          onChangeOpeningFloat={setFloatTarget}
          onChangePayments={(patch) => setPayments(p => ({ ...p, ...patch }))}
          onChangePayouts={setPayouts}
          onChangeDeposits={setDeposits}
          onChangeDepositsCash={setDepositsCash}

          branchId={branch?.id}
          recordId={lukeId}
          onReloadSaved={handleReloadSaved}
          liveMode={liveMode}
          onChangeLiveMode={setLiveMode}
          readOnly={isReadOnly}
        />

        <CashCountCard
          cash={cash}
          onChangeCash={setCash}
          floatPlan={floatPlan}
          onChangeFloatPlan={setFloatPlan}
          countedCash={countedCash}
          expectedCash={netCash}   // Net cash, il float effettivo viene calcolato dentro CashCountCard
          cashDiff={cashDiff}
          onClear={clearCounts}
          readOnly={isReadOnly}
          floatTarget={floatTarget}
        />

        <SummaryCard
          header={header}
          openingFloat={floatTarget}
          payments={payments}
          payouts={payouts}
          deposits={deposits}
          depositsCash={depositsCash}
          countedCash={countedCash}
          expectedCash={netCash} // Net cash, SummaryCard aggiunge il float effettivo
          cashDiff={cashDiff}
          onExport={exportPDF}
          branchId={branch?.id}
        />
      </div>
    </div>
  )
}

/* Utils */
function todayISO() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function round(n: number) {
  return Math.round(Number.isFinite(n) ? n : 0)
}
