// app/daily-reports/cashier-closing-v2/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ArrowLongUpIcon,
  ArrowLongDownIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import CircularLoader from '@/components/CircularLoader'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useDRBranch } from '../_data/useDRBranch'
import { supabase } from '@/lib/supabase_shim'
import { useCashierLuke } from '../_data/useCashierLuke'
import { useSettings } from '@/contexts/SettingsContext'
import { getDailyReportsDictionary } from '../_i18n'
import { useDailyReportSettingsDB } from '../_data/useDailyReportSettingsDB'
import { useDailyReportSettings } from '../_data/useDailyReportSettings'
import { creditsBus } from '@/lib/creditsSync'

// PDF libs
import html2canvas from 'html2canvas-pro'
import jsPDF from 'jspdf'

/* ---------- Denominations ---------- */
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

/* ---------- Types for Page State ---------- */
export type PaymentBreakdown = {
  revenue?: number
  gojek?: number
  grab?: number
  mpos?: number
  unpaid?: number
  grossRevenue?: number
  discount?: number
  posUnpaid?: number
  repaymentsCashCard?: number
  repaymentsCashOnly?: number
  repaymentCash?: number
  repaymentCard?: number
  capichi?: number
  bankTransferEwallet?: number
  cashOut?: number
  depositCash?: number
  depositCard?: number
  thirdPartyAmounts?: Array<{ label: string; amount: number }>
}

export type HeaderInfo = {
  dateStr: string
  branch?: string
  shift: string
  cashier: string
  notes?: string
}

type ProviderBranch = {
  id: string
  name: string
  company_name?: string
  address?: string
  tax_code?: string
  phone?: string
  email?: string
}

/* ---------- Network retry helpers ---------- */
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

/* ---------- LocalStorage & Bridge helpers ---------- */
const savedSigKey = (scope: string) => `cashier.savedSig:${scope}`
const lastSavedKey = (scope: string) => `cashier.lastSavedAt:${scope}`

function useBridgeSafe() {
  try {
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
    0, // legacy setOffDebt
    Math.round(p.capichi || 0),
    Math.round(p.bankTransferEwallet || 0),
    Math.round(p.cashOut || 0),
  ].join('|'))
  lines.push(`A|${Math.round(payouts || 0)}|${Math.round(deposits || 0)}`)
  lines.push('C|' + DENOMS.map(d => `${d.key}:${Math.round(cash[d.key] || 0)}`).join(','))
  lines.push('T|' + DENOMS.map(d => `${d.key}:${Math.round(floatPlan[d.key] || 0)}`).join(','))
  return lines.join('||')
}

function tpUnique(list: string[], max: number) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const v = String(raw ?? '').trim()
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
    if (out.length >= max) break
  }
  return out
}

function buildThirdPartyAmounts(
  labels: string[],
  payments: PaymentBreakdown,
): Array<{ label: string; amount: number }> {
  const cleanLabels = tpUnique(labels, 6)
  const out: Array<{ label: string; amount: number }> = []

  const src = Array.isArray(payments.thirdPartyAmounts) ? payments.thirdPartyAmounts : []
  const byKey = new Map<string, number>()
  for (const item of src) {
    const lbl = String(item?.label || '').trim()
    if (!lbl) continue
    const key = lbl.toLowerCase()
    if (!byKey.has(key)) {
      byKey.set(key, Math.round(Number(item?.amount || 0)))
    }
  }

  // Legacy fallback mapping by key name
  const legacyMap = new Map<string, number>([
    ['gojek', Math.round(Number(payments.gojek || 0))],
    ['grab', Math.round(Number(payments.grab || 0))],
    ['capichi', Math.round(Number(payments.capichi || 0))],
  ])

  cleanLabels.forEach((label) => {
    const key = label.toLowerCase()
    let amount = 0
    if (byKey.has(key)) {
      amount = byKey.get(key) || 0
    } else if (legacyMap.has(key)) {
      amount = legacyMap.get(key) || 0
    }
    out.push({ label, amount })
  })

  return out
}

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

function dayRange(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0)
  return { startISO: start.toISOString(), endISO: end.toISOString() }
}

function getYesterdayDateStr(dateStr: string): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() - 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/* ---------- Formatter Helpers for Live Inputs ---------- */
const nfLive = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const clampIntLive = (n: number) => (Number.isFinite(n) ? Math.round(n) : 0)
const digitsOnlyLive = (s: string) => s.replace(/[^\d]/g, '')
const toNumLive = (s: string) => clampIntLive(Number(digitsOnlyLive(s)))
const fmtLive = (n: number) => {
  try {
    return nfLive.format(clampIntLive(n))
  } catch {
    return String(clampIntLive(n))
  }
}

function NumFmt({
  value,
  onChange,
  className = '',
  disabled = false,
  placeholder = '0',
}: {
  value: number
  onChange: (v: number) => void
  className?: string
  disabled?: boolean
  placeholder?: string
}) {
  const [text, setText] = useState<string>(fmtLive(value))
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!focused) setText(fmtLive(value))
  }, [value, focused])

  function applyFormatAndMoveCaret(raw: string) {
    const n = toNumLive(raw)
    const f = fmtLive(n)
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

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={text}
      onChange={e => applyFormatAndMoveCaret(e.target.value)}
      onFocus={() => {
        setFocused(true)
        if (toNumLive(text) === 0) setText('')
      }}
      onBlur={() => {
        setFocused(false)
        setText(fmtLive(toNumLive(text)))
      }}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full text-right focus:outline-none disabled:text-slate-400 bg-transparent ${className}`}
    />
  )
}

function ListEditMoney(props: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
  color?: string
}) {
  const { label, value, onChange, disabled, color } = props

  if (disabled) {
    return (
      <ListReadOnlyMoney
        label={label}
        value={value}
        color={color}
      />
    )
  }

  return (
    <div className="flex items-center justify-between py-1 border-b border-slate-100 text-xs min-h-[38px] w-full overflow-hidden">
      <div className="flex items-center gap-1.5 min-w-0 flex-grow">
        {color && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
        <span 
          className="font-bold text-slate-700 whitespace-nowrap" 
          title={label}
        >
          {label}
        </span>
      </div>
      <NumFmt
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-24 px-1.5 text-right font-extrabold text-slate-900 border border-transparent bg-transparent hover:border-slate-200 hover:bg-slate-50/50 rounded-md py-0.5 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-none hover:shadow-2xs flex-shrink-0"
      />
    </div>
  )
}

function ListReadOnlyMoney(props: {
  label: string
  value: number
  color?: string
  emphasis?: 'neutral' | 'positive' | 'negative'
  strong?: boolean
}) {
  const { label, value, color, emphasis = 'neutral', strong } = props
  const cls =
    emphasis === 'neutral'
      ? 'text-slate-950'
      : emphasis === 'positive'
        ? 'text-emerald-700 font-extrabold'
        : 'text-red-600 font-extrabold'
  return (
    <div className="flex items-center justify-between py-1 border-b border-slate-100 text-xs min-h-[38px] w-full overflow-hidden">
      <div className="flex items-center gap-1.5 min-w-0 flex-grow">
        {color && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
        <span 
          className="font-bold text-slate-700 whitespace-nowrap" 
          title={label}
        >
          {label}
        </span>
      </div>
      <span className={`w-28 px-1.5 text-right font-extrabold tabular-nums flex-shrink-0 ${strong ? 'text-blue-755 font-black text-[13px]' : ''} ${cls}`}>
        {fmtLive(value)} ₫
      </span>
    </div>
  )
}

function getChannelBrandDetails(label: string) {
  const norm = label.toLowerCase()
  const icon = (
    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  )

  if (norm.includes('grab')) {
    return {
      bgIcon: 'bg-emerald-600 text-white',
      icon
    }
  }
  if (norm.includes('shopee')) {
    return {
      bgIcon: 'bg-orange-500 text-white',
      icon
    }
  }
  if (norm.includes('beamin')) {
    return {
      bgIcon: 'bg-cyan-500 text-white',
      icon
    }
  }
  if (norm.includes('gofood') || norm.includes('gojek')) {
    return {
      bgIcon: 'bg-red-600 text-white',
      icon
    }
  }
  if (norm.includes('loship')) {
    return {
      bgIcon: 'bg-rose-500 text-white',
      icon
    }
  }
  return {
    bgIcon: 'bg-slate-400 text-white',
    icon
  }
}

function PaymentRow(props: {
  icon: React.ReactNode
  bgIcon: string
  label: string
  subtitle?: string
  value: number
  percent: number
  roundedFull?: boolean
}) {
  const { icon, bgIcon, label, subtitle, value, percent, roundedFull } = props
  const shapeClass = roundedFull ? 'rounded-full' : 'rounded-xl'
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 w-full min-h-[54px]">
      <div className="flex items-center gap-3 min-w-0 flex-grow">
        <div className={`w-8 h-8 ${shapeClass} flex items-center justify-center flex-shrink-0 ${bgIcon}`}>
          {icon}
        </div>
        <div className="min-w-0 flex flex-col justify-center">
          <span className="text-xs font-bold text-slate-800 leading-tight">{label}</span>
          {subtitle && (
            <span className="text-[10px] text-slate-400 font-semibold mt-0.5 leading-tight">
              {subtitle}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end flex-shrink-0 pl-3 justify-center">
        <span className="text-xs font-bold text-slate-800 tabular-nums leading-tight">{fmtLive(value)} ₫</span>
        <span className="text-[10px] font-semibold text-blue-600 mt-0.5 leading-tight">{percent.toFixed(1)}%</span>
      </div>
    </div>
  )
}

function AdjustmentRow(props: {
  icon: React.ReactNode
  bgIcon: string
  label: string
  subtitle?: string
  value: number
  textClass: string
}) {
  const { icon, bgIcon, label, subtitle, value, textClass } = props
  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white shadow-2xs hover:shadow-sm transition-all w-full min-h-[54px]">
      <div className="flex items-center gap-2.5 min-w-0 flex-grow">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${bgIcon}`}>
          {icon}
        </div>
        <div className="min-w-0 flex flex-col justify-center">
          <span className="text-[11px] font-bold text-slate-800 leading-tight" title={label}>
            {label}
          </span>
          {subtitle && (
            <span className="text-[9px] text-slate-450 text-slate-500 font-semibold mt-0.5 leading-tight">
              {subtitle}
            </span>
          )}
        </div>
      </div>
      <span className={`text-[11px] font-bold tabular-nums pl-2 flex-shrink-0 ${textClass}`}>
        {fmtLive(value)} ₫
      </span>
    </div>
  )
}

/* ---------- Main Component ---------- */
export default function CashierClosingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const initialIdFromUrl = searchParams.get('id')
  const { language } = useSettings()
  
  const dict = getDailyReportsDictionary(language).cashierClosing
  const t = dict

  const { branch, validating, invalid } = useDRBranch({ validate: true })
  const bridge = useBridgeSafe()

  const officialName = branch?.name || ''
  const bridgeName = bridge?.name || ''
  const setBridgeName: (v: string) => void = bridge?.setName || (() => { })

  const _contextBranchName = officialName || bridgeName

  useEffect(() => {
    if (!officialName) return
    if (bridgeName === officialName) return
    setBridgeName(officialName)
  }, [officialName, bridgeName, setBridgeName])

  const {
    id: lukeId,
    load: lukeLoad,
    save: lukeSave,
    loading: lukeLoading,
    saving: lukeSaving,
  } = useCashierLuke(initialIdFromUrl)

  const [header, setHeader] = useState<HeaderInfo>({
    dateStr: todayISO(),
    shift: '',
    cashier: '',
    notes: '',
  })

  const activeBranchName = useMemo(() => {
    if (initialIdFromUrl && header.branch) return header.branch
    return _contextBranchName
  }, [initialIdFromUrl, header.branch, _contextBranchName])

  const [floatTarget, setFloatTarget] = useState<number>(0)

  const [payments, setPayments] = useState<PaymentBreakdown>({
    revenue: 0,
    gojek: 0,
    grab: 0,
    mpos: 0,
    unpaid: 0,
    capichi: 0,
    bankTransferEwallet: 0,
    cashOut: 0,
    repaymentsCashCard: 0,
    repaymentsCashOnly: 0,
    repaymentCash: 0,
    repaymentCard: 0,
    depositCash: 0,
    depositCard: 0,
    thirdPartyAmounts: [],
  })

  const [payouts, setPayouts] = useState<number>(0)
  const [deposits, setDeposits] = useState<number>(0)
  const [depositsCash, setDepositsCash] = useState<number>(0)

  const [cash, setCash] = useState<CashShape>({
    d500k: 0, d200k: 0, d100k: 0, d50k: 0, d20k: 0,
    d10k: 0, d5k: 0, d2k: 0, d1k: 0,
  })

  const [floatPlan, setFloatPlan] = useState<CashShape>({
    d500k: 0, d200k: 0, d100k: 0, d50k: 0, d20k: 0,
    d10k: 0, d5k: 0, d2k: 0, d1k: 0,
  })

  const readOnlyParam = searchParams.get('mode') === 'readonly'
  const isReadOnly = initialIdFromUrl ? readOnlyParam : false
  const [liveMode, setLiveMode] = useState<boolean>(() => !initialIdFromUrl && !isReadOnly)

  function handleSavedClick() {
    if (initialIdFromUrl && liveMode && handleReloadSaved) {
      handleReloadSaved()
    }
    setLiveMode(false)
  }

  function handleLiveClick() {
    setLiveMode(true)
  }

  const [lastEditorName, setLastEditorName] = useState<string>('')
  const [currentUserName, setCurrentUserName] = useState<string>('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Fetch current user account details
  useEffect(() => {
    let alive = true
    async function loadUser() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !alive) return
        setCurrentUserId(user.id)

        const { data: acc } = await supabase
          .from('app_accounts')
          .select('name')
          .eq('user_id', user.id)
          .maybeSingle()

        if (acc?.name && alive) {
          setCurrentUserName(acc.name)
          if (!header.cashier) {
            setHeader(h => ({ ...h, cashier: acc.name }))
          }
          return
        }

        const metaName = user.user_metadata?.full_name || user.user_metadata?.name || user.email || ''
        if (alive) {
          setCurrentUserName(metaName)
          if (!header.cashier) {
            setHeader(h => ({ ...h, cashier: metaName }))
          }
        }
      } catch { }
    }
    loadUser()
    return () => { alive = false }
  }, [header.cashier])

  // Sync active branch to header
  useEffect(() => {
    if (isReadOnly) return
    if (initialIdFromUrl && !liveMode) return
    if (activeBranchName && header.branch !== activeBranchName) {
      setHeader(h => ({ ...h, branch: activeBranchName }))
    }
  }, [activeBranchName, isReadOnly, initialIdFromUrl, liveMode, header.branch])

  // Fetch settings for branch
  const { settings: dbSettings } = useDailyReportSettingsDB(activeBranchName)
  const { settings: floatSettings } = useDailyReportSettings()

  const dbFloat = useMemo(() => {
    const s: any = floatSettings || {}
    const n = Number(
      s?.cashFloatVND ??
      s?.cash_count_vnd ??
      s?.cashCount?.cashFloatVND ??
      s?.cash_count?.cashFloatVND
    )
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }, [floatSettings])

  const targetFloat = useMemo(() => {
    if (dbFloat != null) return dbFloat
    return 3_000_000 // default fallback
  }, [dbFloat])

  useEffect(() => {
    if (targetFloat !== floatTarget) {
      setFloatTarget(targetFloat)
    }
  }, [targetFloat, floatTarget])

  const thirdPartyLabels = useMemo(() => {
    const list = dbSettings?.initialInfo?.thirdParties
    if (Array.isArray(list) && list.length > 0) {
      const filtered = list.map(label => String(label ?? '').trim()).filter(label => {
        const l = label.toLowerCase()
        return l !== 'gojek' && l !== 'capichi'
      })
      return tpUnique(filtered, 6)
    }
    return ['Grab', 'Shopee Food']
  }, [dbSettings])

  const shouldAutoSync = !initialIdFromUrl || liveMode

  const thirdPartyAmounts = useMemo(() => {
    if (shouldAutoSync) {
      return buildThirdPartyAmounts(thirdPartyLabels, payments)
    }
    const src = Array.isArray(payments.thirdPartyAmounts) ? payments.thirdPartyAmounts : []
    if (src.length > 0) {
      return src.map(it => ({
        label: String(it.label || '').trim(),
        amount: round(it.amount),
      }))
    }
    return buildThirdPartyAmounts(['Gojek', 'Grab', 'Capichi'], payments)
  }, [shouldAutoSync, thirdPartyLabels, payments])

  useEffect(() => {
    if (!shouldAutoSync) return
    const src = Array.isArray(payments.thirdPartyAmounts) ? payments.thirdPartyAmounts : []
    const same = src.length === thirdPartyAmounts.length && src.every((it, idx) =>
      String(it.label).trim() === String(thirdPartyAmounts[idx]?.label).trim() &&
      round(it.amount) === round(thirdPartyAmounts[idx]?.amount)
    )
    if (!same) {
      setPayments(p => ({ ...p, thirdPartyAmounts }))
    }
  }, [shouldAutoSync, thirdPartyAmounts, payments.thirdPartyAmounts])

  // Hydration from Luke
  useEffect(() => {
    if (!lukeId) return
    let cancelled = false
    ;(async () => {
      const res = await lukeLoad(lukeId)
      if (!res || cancelled) return
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
    })()
    return () => { cancelled = true }
  }, [lukeId, lukeLoad])

  // Track dirty state
  const isDirtyRef = useRef(false)

  const handleReloadSaved = useCallback(async (force = false) => {
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

  useEffect(() => {
    if (!liveMode) {
      handleReloadSaved(true)
    }
  }, [liveMode, handleReloadSaved])

  /* ---------- Real-time fetch triggers & subscriptions ---------- */
  const queryKey = `${header.dateStr}@@${activeBranchName}`
  const [bump, setBump] = useState(0)
  const [syncingPos, setSyncingPos] = useState(false)

  // Realtime channel
  useEffect(() => {
    if (!activeBranchName) return
    const ch = supabase
      .channel('cashier-closing-v2-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credit_payments' }, () => setBump(x => x + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credits' }, () => setBump(x => x + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cashout' }, () => setBump(x => x + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_report_bank_transfers' }, () => setBump(x => x + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposit_payments' }, () => setBump(x => x + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposits' }, () => setBump(x => x + 1))
      .subscribe()
    return () => {
      try { supabase.removeChannel(ch) } catch { }
    }
  }, [activeBranchName])

  // Cross-tab triggers
  useEffect(() => {
    const bus = creditsBus()
    const off = bus.onBump(() => setBump(x => x + 1))
    return () => { off() }
  }, [])

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

  useEffect(() => {
    const onLocalPayments = () => setBump(x => x + 1)
    const onVisible = () => { if (document.visibilityState === 'visible') setBump(x => x + 1) }
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

  // 1) Fetch Cash Out
  useEffect(() => {
    let cancelled = false
    async function fetchCashOut() {
      if (!header?.dateStr || !activeBranchName || !shouldAutoSync) return
      const r1 = await supabase
        .from('cashout')
        .select('amount')
        .eq('date', header.dateStr)
        .eq('branch', activeBranchName)

      let total = 0
      if (!r1.error && Array.isArray(r1.data) && r1.data.length > 0) {
        total = r1.data.reduce((s, r: any) => s + Math.round(Number(r?.amount || 0)), 0)
      } else {
        const q3 = await supabase
          .from('cashout')
          .select('amount')
          .ilike('branch', activeBranchName)
          .eq('date', header.dateStr)
        if (!q3.error && Array.isArray(q3.data) && q3.data.length > 0) {
          total = q3.data.reduce((s, r: any) => s + Math.round(Number(r?.amount || 0)), 0)
        }
      }

      if (!cancelled) {
        setPayments(p => ({ ...p, cashOut: total }))
      }
    }
    fetchCashOut()
    return () => { cancelled = true }
  }, [queryKey, bump, shouldAutoSync])

  // 2) Fetch Bank Transfer & POS Sync on mount/change
  const paymentsRef = useRef(payments)
  useEffect(() => { paymentsRef.current = payments }, [payments])

  useEffect(() => {
    let cancelled = false
    async function fetchBankTransfers() {
      if (!header?.dateStr || !activeBranchName || !shouldAutoSync) return

      if (header.dateStr >= '2026-07-09') {
        try {
          const res = await fetch(
            `/api/pos/sync?branch=${encodeURIComponent(activeBranchName)}&date=${header.dateStr}&t=${Date.now()}`,
            { cache: 'no-store' }
          )
          if (res.ok && !cancelled) {
            const resData = await res.json()
            if (resData.success) {
              const total = resData.totalAmount || 0
              const posUnpaid = typeof resData.posUnpaidAmount === 'number' ? resData.posUnpaidAmount : 0
              
              const currentPayments = paymentsRef.current
              const nextThirdParty = Array.isArray(currentPayments.thirdPartyAmounts) ? [...currentPayments.thirdPartyAmounts] : []
              
              let grabIdx = nextThirdParty.findIndex(tp => (tp.label || '').toLowerCase() === 'grab')
              if (grabIdx !== -1) {
                nextThirdParty[grabIdx] = { ...nextThirdParty[grabIdx], amount: resData.posGrab || 0 }
              } else if (typeof resData.posGrab === 'number' && resData.posGrab > 0) {
                nextThirdParty.push({ label: 'Grab', amount: resData.posGrab })
              }

              let shopeeIdx = nextThirdParty.findIndex(tp => (tp.label || '').toLowerCase().includes('shopee'))
              if (shopeeIdx !== -1) {
                nextThirdParty[shopeeIdx] = { ...nextThirdParty[shopeeIdx], amount: resData.posShopeeFood || 0 }
              } else if (typeof resData.posShopeeFood === 'number' && resData.posShopeeFood > 0) {
                nextThirdParty.push({ label: 'Shopee Food', amount: resData.posShopeeFood })
              }

              setPayments(p => ({
                ...p,
                bankTransferEwallet: total,
                mpos: typeof resData.posMpos === 'number' ? resData.posMpos : p.mpos,
                grab: typeof resData.posGrab === 'number' ? resData.posGrab : p.grab,
                thirdPartyAmounts: nextThirdParty,
                grossRevenue: typeof resData.posGrossRevenue === 'number' ? resData.posGrossRevenue : p.grossRevenue,
                discount: typeof resData.posDiscount === 'number' ? resData.posDiscount : p.discount,
                posUnpaid: posUnpaid,
                revenue: typeof resData.posGrossRevenue === 'number' ? (resData.posGrossRevenue - (resData.posDiscount || 0)) : p.revenue
              }))
            }
          }
        } catch (err) {
          console.error('Failed to trigger POS sync on mount:', err)
        }
      } else {
        const { data, error } = await supabase
          .from('daily_report_bank_transfers')
          .select('amount')
          .eq('branch', activeBranchName)
          .eq('date', header.dateStr)

        let total = 0
        if (!error && Array.isArray(data)) {
          total = data.reduce((s, r: any) => s + Math.round(Number(r?.amount || 0)), 0)
        }
        if (!cancelled) {
          setPayments(p => ({ ...p, bankTransferEwallet: total }))
        }
      }
    }
    fetchBankTransfers()
    return () => { cancelled = true }
  }, [queryKey, bump, shouldAutoSync])

  // 3) Fetch Unpaid
  useEffect(() => {
    let cancelled = false
    async function fetchUnpaid() {
      if (!header?.dateStr || !activeBranchName || !shouldAutoSync) return
      const { data: credits, error: errCredits } = await supabase
        .from('credits')
        .select('id')
        .eq('branch', activeBranchName)
        .eq('date', header.dateStr)

      if (errCredits) return
      const ids = (credits || []).map(r => String(r.id))
      if (ids.length === 0) {
        if (!cancelled) setPayments(p => ({ ...p, unpaid: 0 }))
        return
      }

      const { data: totals, error: errTotals } = await supabase
        .from('credits_with_totals_vw')
        .select('id, remaining')
        .in('id', ids)

      if (!cancelled) {
        if (errTotals) return
        const sumRemaining = (totals || []).reduce((s, r: any) => s + Math.round(Number(r?.remaining || 0)), 0)
        setPayments(p => ({ ...p, unpaid: sumRemaining }))
      }
    }
    fetchUnpaid()
    return () => { cancelled = true }
  }, [queryKey, bump, shouldAutoSync])

  // 4) Fetch Repayments
  useEffect(() => {
    let cancelled = false
    async function fetchRepayments() {
      if (!header?.dateStr || !activeBranchName) return
      const { data: credits, error: errCredits } = await supabase
        .from('credits')
        .select('id')
        .eq('branch', activeBranchName)

      if (errCredits) return
      const ids = (credits || []).map(r => String(r.id))
      if (ids.length === 0) {
        if (!cancelled) {
          setPayments(p => ({
            ...p,
            repaymentsCashCard: 0,
            repaymentsCashOnly: 0,
            repaymentCash: 0,
            repaymentCard: 0,
          }))
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
        if (error) return
        let totalAll = 0
        let totalCash = 0
        let totalCard = 0

        if (Array.isArray(data)) {
          for (const r of data as any[]) {
            const method = parseMethodFromNote(r?.note)
            const amount = Math.round(Number(r?.amount || 0))
            if (method === 'cash' || method === 'card') totalAll += amount
            if (method === 'cash') totalCash += amount
            if (method === 'card') totalCard += amount
          }
        }

        setPayments(p => ({
          ...p,
          repaymentsCashCard: totalAll,
          repaymentsCashOnly: totalCash,
          repaymentCash: totalCash,
          repaymentCard: totalCard,
        }))
      }
    }
    fetchRepayments()
    return () => { cancelled = true }
  }, [queryKey, bump])

  // 5) Fetch Deposits
  useEffect(() => {
    let cancelled = false
    async function fetchDeposits() {
      if (!header?.dateStr || !activeBranchName) return
      const { data: deps, error: errDeps } = await supabase
        .from('deposits')
        .select('id')
        .eq('branch', activeBranchName)

      if (errDeps) return
      const ids = (deps || []).map(r => String(r.id))
      if (ids.length === 0) {
        if (!cancelled) {
          setDeposits(0)
          setDepositsCash(0)
          setPayments(p => ({ ...p, depositCash: 0, depositCard: 0 }))
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
        if (error) return
        let totalAll = 0
        let totalCash = 0
        let totalCard = 0

        if (Array.isArray(data)) {
          for (const r of data as any[]) {
            const method = parseMethodFromNote(r?.note)
            const amount = Math.round(Number(r?.amount || 0))
            if (method === 'cash' || method === 'card') totalAll += amount
            if (method === 'cash') totalCash += amount
            if (method === 'card') totalCard += amount
          }
        }

        setDeposits(totalAll)
        setDepositsCash(totalCash)
        setPayments(p => ({
          ...p,
          depositCash: totalCash,
          depositCard: totalCard,
        }))
      }
    }
    fetchDeposits()
    return () => { cancelled = true }
  }, [queryKey, bump])

  // 6) Fetch Yesterday's closing for Overview delta comparison
  const [yesterdayClosing, setYesterdayClosing] = useState<{
    revenue: number
    discount: number
    netRevenue: number
    cashCollected: number
  } | null>(null)

  useEffect(() => {
    let alive = true
    async function loadYesterday() {
      if (!header.dateStr || !activeBranchName) return
      const yesterdayStr = getYesterdayDateStr(header.dateStr)
      try {
        const { data, error } = await supabase
          .from('cashier_closings')
          .select('revenue_vnd, discount_vnd, opening_float_vnd, deposits_vnd, cash_out_vnd, unpaid_vnd, repayments_cash_card_vnd, mpos_vnd, bank_transfer_ewallet_vnd, third_party_amounts_json, cash_json')
          .eq('report_date', yesterdayStr)
          .eq('branch_name', activeBranchName)
          .maybeSingle()

        if (error || !data || !alive) {
          setYesterdayClosing(null)
          return
        }

        const rev = round(data.revenue_vnd)
        const disc = round(data.discount_vnd)
        const netRev = rev - disc

        // Actual counted cash collected yesterday
        let yesCountedCash = 0
        const yesCash: CashShape = parseCashShape(data.cash_json) as CashShape
        for (const { key, face } of DENOMS) {
          yesCountedCash += (yesCash[key] || 0) * face
        }

        setYesterdayClosing({
          revenue: rev,
          discount: disc,
          netRevenue: netRev,
          cashCollected: yesCountedCash,
        })
      } catch {
        setYesterdayClosing(null)
      }
    }
    loadYesterday()
    return () => { alive = false }
  }, [header.dateStr, activeBranchName])

  function parseCashShape(value: any): CashShape | {} {
    if (!value) return {}
    if (typeof value === 'string') {
      try { return JSON.parse(value) } catch { return {} }
    }
    return value
  }

  /* ---------- Derived Totals ---------- */
  const countedCash = useMemo(() => {
    let sum = 0
    for (const { key, face } of DENOMS) sum += (cash[key] || 0) * face
    return round(Math.max(0, sum))
  }, [cash])

  const netCash = useMemo(() => {
    const vnum = (n: number | undefined) => Number.isFinite(Number(n)) ? Number(n) : 0
    const thirdPartyTotal = thirdPartyAmounts.reduce((sum, item) => sum + vnum(item.amount), 0)
    const nonCash = thirdPartyTotal + vnum(payments.mpos) + vnum(payments.bankTransferEwallet)

    const net =
      vnum(payments.revenue) -
      nonCash -
      vnum(payments.unpaid) -
      vnum(payments.cashOut) +
      vnum(payments.repaymentsCashCard) +
      vnum(deposits)

    return round(net)
  }, [payments, deposits, thirdPartyAmounts])

  const expectedDrawerCash = useMemo(() => {
    return round(netCash + floatTarget)
  }, [netCash, floatTarget])

  const cashDiff = useMemo(
    () => round(countedCash - expectedDrawerCash),
    [countedCash, expectedDrawerCash]
  )

  const providerBranchId = useMemo(() => {
    return branch?.id || null
  }, [branch])

  const [providerBranch, setProviderBranch] = useState<ProviderBranch | null>(null)

  useEffect(() => {
    let ignore = false
    async function loadProviderBranch() {
      const id = providerBranchId
      const name = header.branch
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
  }, [providerBranchId, header.branch])

  /* ---------- Cash Count Logic Helpers ---------- */
  const emptyBag = (): CashShape =>
    DENOMS.reduce((m, d) => { (m as any)[d.key] = 0; return m }, {} as CashShape)

  const sumValue = (bag: CashShape) =>
    DENOMS.reduce((acc, d) => acc + (bag[d.key] || 0) * d.face, 0)

  const [planActive, setPlanActive] = useState(false)
  const [edited, setEdited] = useState<Record<DenomKey, boolean>>({} as Record<DenomKey, boolean>)

  const computePlan = useCallback((
    currentCash: CashShape,
    targetFloat: number,
    currentEdits: Partial<CashShape>,
    activeEdits: Record<DenomKey, boolean>
  ): CashShape => {
    const total = sumValue(currentCash)
    const target = Math.max(0, Math.min(targetFloat, total))
    const remainToTakeTotal = total - target
    
    const plan = emptyBag()
    let editedTotal = 0

    for (const d of DENOMS) {
      if (activeEdits[d.key]) {
        const have = currentCash[d.key] || 0
        const chosen = Math.min(have, currentEdits[d.key] || 0)
        plan[d.key] = chosen
        editedTotal += chosen * d.face
      }
    }

    let remainForSuggest = Math.max(0, remainToTakeTotal - editedTotal)

    for (const d of DENOMS) {
      if (activeEdits[d.key]) continue
      const have = currentCash[d.key] || 0
      const suggest = Math.min(have, Math.floor(remainForSuggest / d.face))
      plan[d.key] = suggest
      remainForSuggest -= suggest * d.face
    }

    if (remainForSuggest > 0) {
      for (let i = DENOMS.length - 1; i >= 0 && remainForSuggest > 0; i--) {
        const { key: ki, face: fi } = DENOMS[i]
        if (activeEdits[ki]) continue
        const room = Math.max(0, (currentCash[ki] || 0) - plan[ki])
        if (room > 0) {
          const add = Math.min(room, Math.ceil(remainForSuggest / fi))
          plan[ki] += add
          remainForSuggest -= add * fi
        }
      }
    }
    return plan
  }, [])

  // Auto-activate plan if loaded values are present
  useEffect(() => {
    const hasValues = DENOMS.some(d => (floatPlan[d.key] || 0) > 0)
    if (hasValues) {
      setPlanActive(true)
      setEdited(prev => {
        if (Object.keys(prev).length === 0) {
          const loadedEdits = {} as Record<DenomKey, boolean>
          for (const d of DENOMS) {
            if ((floatPlan[d.key] || 0) > 0) loadedEdits[d.key] = true
          }
          return loadedEdits
        }
        return prev
      })
    }
  }, [floatPlan])

  const effectivePlan = useMemo(() => {
    if (!planActive) return emptyBag()
    return computePlan(cash, floatTarget, floatPlan, edited)
  }, [planActive, cash, floatTarget, floatPlan, edited, computePlan])

  const totalToTake = useMemo(() => sumValue(effectivePlan), [effectivePlan])

  const totalRemain = useMemo(() => {
    const keep = emptyBag()
    for (const d of DENOMS) keep[d.key] = Math.max(0, (cash[d.key] || 0) - (effectivePlan[d.key] || 0))
    return sumValue(keep)
  }, [cash, effectivePlan])

  const changeCash = (key: DenomKey, qty: number) => {
    const safeVal = Number.isFinite(qty) ? qty : (cash[key] || 0)
    const nextCash = { ...cash, [key]: safeVal }
    setCash(nextCash)
    if (planActive) {
      const fullPlan = computePlan(nextCash, floatTarget, floatPlan, edited)
      setFloatPlan(fullPlan)
    }
  }

  const changeTake = (key: DenomKey, raw: number) => {
    setPlanActive(true)
    const safe = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0
    const nextEdited = { ...edited, [key]: true }
    setEdited(nextEdited)
    
    const nextEdits = { ...floatPlan, [key]: safe }
    const fullPlan = computePlan(cash, floatTarget, nextEdits, nextEdited)
    setFloatPlan(fullPlan)
  }

  const doSuggest = () => {
    const total = sumValue(cash)
    const target = Math.max(0, Math.min(floatTarget, total))
    const needToTake = total - target
    if (needToTake <= 0) {
      setFloatPlan(emptyBag())
      setEdited({} as Record<DenomKey, boolean>)
      setPlanActive(true)
      return
    }

    let remainToTake = needToTake
    const plan = emptyBag()

    for (const d of DENOMS) {
      if (remainToTake <= 0) break
      const have = cash[d.key] || 0
      const can = Math.min(have, Math.floor(remainToTake / d.face))
      if (can > 0) {
        plan[d.key] = can
        remainToTake -= can * d.face
      }
    }
    if (remainToTake > 0) {
      for (let i = DENOMS.length - 1; i >= 0 && remainToTake > 0; i--) {
        const ki = DENOMS[i].key
        const fi = DENOMS[i].face
        const room = (cash[ki] || 0) - (plan[ki] || 0)
        if (room <= 0) continue
        const add = Math.min(room, Math.ceil(remainToTake / fi))
        if (add > 0) {
          plan[ki] = (plan[ki] || 0) + add
          remainToTake -= add * fi
        }
      }
    }

    setFloatPlan(plan)
    setEdited({} as Record<DenomKey, boolean>)
    setPlanActive(true)
  }

  /* ---------- Payment Channels Chart Data & SVG ---------- */
  const grabVal = useMemo(() => thirdPartyAmounts.find(tp => tp.label.toLowerCase() === 'grab')?.amount || 0, [thirdPartyAmounts])
  const shopeeVal = useMemo(() => thirdPartyAmounts.find(tp => tp.label.toLowerCase().includes('shopee'))?.amount || 0, [thirdPartyAmounts])
  const otherTpVal = useMemo(() => thirdPartyAmounts
    .filter(tp => tp.label.toLowerCase() !== 'grab' && !tp.label.toLowerCase().includes('shopee'))
    .reduce((sum, tp) => sum + tp.amount, 0), [thirdPartyAmounts])

  const cardVal = useMemo(() => round(payments.mpos), [payments.mpos])
  const bankVal = useMemo(() => round(payments.bankTransferEwallet), [payments.bankTransferEwallet])
  const unpaidVal = useMemo(() => round(payments.unpaid), [payments.unpaid])
  const repayVal = useMemo(() => round(payments.repaymentsCashOnly), [payments.repaymentsCashOnly])
  const depositVal = useMemo(() => round(payments.depositCash), [payments.depositCash])

  const totalCollectedChart = useMemo(() => {
    return cardVal + bankVal + thirdPartyAmounts.reduce((sum, item) => sum + item.amount, 0)
  }, [cardVal, bankVal, thirdPartyAmounts])

  const thirdPartyTotal = useMemo(
    () => thirdPartyAmounts.reduce((sum, item) => sum + round(item.amount), 0),
    [thirdPartyAmounts]
  )

  const nonCash = useMemo(
    () => thirdPartyTotal + round(payments.mpos) + round(payments.bankTransferEwallet),
    [thirdPartyTotal, payments.mpos, payments.bankTransferEwallet]
  )

  const netVal = useMemo(
    () =>
      round(payments.revenue) -
      nonCash -
      round(payments.unpaid) -
      round(payments.cashOut) +
      round(payments.repaymentsCashCard) +
      round(deposits),
    [payments, nonCash, deposits]
  )

  /* ---------- Summary Accounting Data ---------- */
  const nonCashTotal = useMemo(() => {
    const grabVal = thirdPartyAmounts.find(tp => tp.label.toLowerCase() === 'grab')?.amount || 0
    const shopeeVal = thirdPartyAmounts.find(tp => tp.label.toLowerCase().includes('shopee'))?.amount || 0
    const otherTpVal = thirdPartyAmounts
      .filter(tp => tp.label.toLowerCase() !== 'grab' && !tp.label.toLowerCase().includes('shopee'))
      .reduce((sum, tp) => sum + tp.amount, 0)

    const repayCard = Math.max(0, round(payments.repaymentsCashCard) - round(payments.repaymentsCashOnly))
    const depositCard = Math.max(0, round(deposits) - round(depositsCash))

    return (
      grabVal + shopeeVal + otherTpVal +
      round(payments.mpos) +
      round(payments.bankTransferEwallet) +
      repayCard +
      depositCard
    )
  }, [thirdPartyAmounts, payments, deposits, depositsCash])

  const totalCashCollected = useMemo(() => {
    return round(payments.revenue) - nonCashTotal
  }, [payments.revenue, nonCashTotal])

  const adjustmentsTotal = useMemo(() => {
    return (
      round(payments.unpaid) +
      round(payments.cashOut) +
      round(payments.repaymentsCashOnly) +
      round(depositsCash)
    )
  }, [payments.unpaid, payments.cashOut, payments.repaymentsCashOnly, depositsCash])

  /* ---------- Page Actions ---------- */
  function clearCounts() {
    setCash({ d500k: 0, d200k: 0, d100k: 0, d50k: 0, d20k: 0, d10k: 0, d5k: 0, d2k: 0, d1k: 0 })
    setFloatPlan({ d500k: 0, d200k: 0, d100k: 0, d50k: 0, d20k: 0, d10k: 0, d5k: 0, d2k: 0, d1k: 0 })
  }

  function resetAll() {
    try {
      localStorage.removeItem(savedSigKey(scope))
      localStorage.removeItem(lastSavedKey(scope))
    } catch { }

    setHeader(prev => ({
      ...prev,
      notes: '',
      cashier: prev.cashier || currentUserName
    }))

    setPayouts(0)
    setDeposits(0)
    setDepositsCash(0)
    clearCounts()
    setLiveMode(true)

    setLastSavedAtUI(null)
    setServerSigOverride(null)
    sigServerRawRef.current = ''
    setLastEditorName('')
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
          const buttons = root.querySelectorAll('button, [data-hide-in-pdf="1"], .no-print')
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

  /* ---------- Save bar triggers ---------- */
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
    const saved = typeof window !== 'undefined' ? localStorage.getItem(savedSigKey(scope)) : null
    sigServerRawRef.current = saved || ''
  }, [scope])

  const sigServer = serverSigOverride ?? sigServerRawRef.current
  const [coldStartSilence, setColdStartSilence] = useState(true)
  const [isValidated, setIsValidated] = useState(false)

  // Resetta lo stato validato se l'utente cambia manualmente i campi chiave
  const sigDraftWithoutPOS = useMemo(() => {
    const { 
      bankTransferEwallet, 
      revenue, 
      grossRevenue, 
      discount, 
      posUnpaid, 
      mpos,
      grab,
      thirdPartyAmounts,
      ...otherPayments 
    } = payments
    return signatureOfState({
      header,
      floatTarget,
      payments: otherPayments,
      payouts,
      deposits,
      cash,
      floatPlan,
    })
  }, [header, floatTarget, payments, payouts, deposits, cash, floatPlan])

  useEffect(() => {
    setIsValidated(false)
  }, [sigDraftWithoutPOS])

  const handleValidatePOS = useCallback(async () => {
    const branchNameForClosing = activeBranchName || header.branch || ''
    if (!branchNameForClosing || !header.dateStr) return

    setSyncingPos(true)
    try {
      let total = 0
      let fetchedFromApi = false

      if (header.dateStr >= '2026-07-09') {
        const res = await fetch(
          `/api/pos/sync?branch=${encodeURIComponent(branchNameForClosing)}&date=${header.dateStr}&t=${Date.now()}`,
          { cache: 'no-store' }
        )
        if (res.ok) {
          const resData = await res.json()
          if (resData.success) {
            total = resData.totalAmount || 0
            const posUnpaid = typeof resData.posUnpaidAmount === 'number' ? resData.posUnpaidAmount : 0
            const currentUnpaid = payments.unpaid || 0

            if (posUnpaid !== currentUnpaid) {
              const diff = posUnpaid - currentUnpaid
              const msg = language === 'vi'
                ? `Cảnh báo: Số tiền chưa thanh toán (Unpaid) trên CukCuk POS (${formatVND(posUnpaid)} VND) không khớp với số tiền trên OddsOff (${formatVND(currentUnpaid)} VND).\nChênh lệch: ${formatVND(diff)} VND.`
                : `Warning: Unpaid amount on CukCuk POS (${formatVND(posUnpaid)} VND) does not match the amount on OddsOff (${formatVND(currentUnpaid)} VND).\nDifference: ${formatVND(diff)} VND.`
              alert(msg)
            }

            setPayments(p => {
              const nextThirdParty = Array.isArray(p.thirdPartyAmounts) ? [...p.thirdPartyAmounts] : []
              
              let grabIdx = nextThirdParty.findIndex(tp => (tp.label || '').toLowerCase() === 'grab')
              if (grabIdx !== -1) {
                nextThirdParty[grabIdx] = { ...nextThirdParty[grabIdx], amount: resData.posGrab || 0 }
              } else if (typeof resData.posGrab === 'number' && resData.posGrab > 0) {
                nextThirdParty.push({ label: 'Grab', amount: resData.posGrab })
              }

              let shopeeIdx = nextThirdParty.findIndex(tp => (tp.label || '').toLowerCase().includes('shopee'))
              if (shopeeIdx !== -1) {
                nextThirdParty[shopeeIdx] = { ...nextThirdParty[shopeeIdx], amount: resData.posShopeeFood || 0 }
              } else if (typeof resData.posShopeeFood === 'number' && resData.posShopeeFood > 0) {
                nextThirdParty.push({ label: 'Shopee Food', amount: resData.posShopeeFood })
              }

              return {
                ...p,
                bankTransferEwallet: total,
                mpos: typeof resData.posMpos === 'number' ? resData.posMpos : p.mpos,
                grab: typeof resData.posGrab === 'number' ? resData.posGrab : p.grab,
                thirdPartyAmounts: nextThirdParty,
                grossRevenue: typeof resData.posGrossRevenue === 'number' ? resData.posGrossRevenue : p.grossRevenue,
                discount: typeof resData.posDiscount === 'number' ? resData.posDiscount : p.discount,
                posUnpaid: posUnpaid,
                revenue: typeof resData.posGrossRevenue === 'number' ? (resData.posGrossRevenue - (resData.posDiscount || 0)) : p.revenue
              }
            })
            fetchedFromApi = true
          } else {
            alert(`POS Sync Error: ${resData.error || resData.message || 'Unknown error'}`)
          }
        } else {
          const errText = await res.text()
          alert(`POS HTTP Error ${res.status}: ${errText}`)
        }
      }

      if (!fetchedFromApi) {
        const { data, error } = await supabase
          .from('daily_report_bank_transfers')
          .select('amount')
          .eq('branch', branchNameForClosing)
          .eq('date', header.dateStr)

        if (!error && Array.isArray(data)) {
          total = data.reduce((s, r: any) => s + Math.round(Number(r?.amount || 0)), 0)
        }

        setPayments(p => ({
          ...p,
          bankTransferEwallet: total,
          grossRevenue: 0,
          discount: 0,
          posUnpaid: 0
        }))
      }

      setIsValidated(true)
    } catch (err) {
      console.error('Validation sync failed:', err)
      alert(language === 'vi' ? 'Sincronizzazione di verifica fallita' : 'Verification sync failed')
    } finally {
      setSyncingPos(false)
    }
  }, [activeBranchName, header.dateStr, header.branch, language, payments.unpaid])

  useEffect(() => {
    const id = setTimeout(() => setColdStartSilence(false), 900)
    return () => clearTimeout(id)
  }, [])

  const [suppressingDirty, setSuppressingDirty] = useState(false)
  const displayDirty = !coldStartSilence && !suppressingDirty && sigDraft !== sigServer
  const disableSave = !displayDirty || lukeSaving || !isValidated
  const disableValidate = lukeSaving || syncingPos

  useEffect(() => {
    isDirtyRef.current = displayDirty
  }, [displayDirty])

  useEffect(() => {
    if (suppressingDirty || coldStartSilence) return
    try {
      window.dispatchEvent(new CustomEvent('cashier:dirty', { detail: { dirty: sigDraft !== sigServer } }))
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
        header: {
          ...header,
          branch: branchNameForClosing,
        },
        floatTarget,
        payments,
        payouts,
        deposits,
        cash,
        floatPlan,
        branchId: providerBranch?.id ? String(providerBranch.id) : null,
        userId: currentUserId,
      }

      const newId = await lukeSave(payload)
      if (!newId) return

      try {
        const params = new URLSearchParams(window.location.search)
        params.set('id', newId)
        router.replace(`${pathname}?${params.toString()}`)
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
    scope,
    sigDraft,
    lukeSave,
    router,
    pathname,
    activeBranchName,
    liveMode,
    providerBranch,
    currentUserId,
    currentUserName,
    t.alerts,
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
  }, [onSaveAll, isReadOnly])

  if (lukeLoading) return <CircularLoader />

  if (!activeBranchName && !validating) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
          <p className="mt-2 text-gray-500">{t.branch.allSet}</p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="h-10 px-4 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              {t.branch.goDashboard}
            </button>
          </div>
          <p className="mt-3 text-xs text-gray-400">{t.branch.hint}</p>
        </div>
      </div>
    )
  }

  /* ---------- Metric delta calculation helpers ---------- */
  const deltaGross = yesterdayClosing && yesterdayClosing.revenue
    ? ((round(payments.grossRevenue) - yesterdayClosing.revenue) / yesterdayClosing.revenue) * 100
    : 0

  const deltaDiscount = yesterdayClosing && yesterdayClosing.discount
    ? ((round(payments.discount) - yesterdayClosing.discount) / yesterdayClosing.discount) * 100
    : 0

  const deltaNet = yesterdayClosing && yesterdayClosing.netRevenue
    ? ((round(payments.revenue) - yesterdayClosing.netRevenue) / yesterdayClosing.netRevenue) * 100
    : 0

  const deltaCash = yesterdayClosing && yesterdayClosing.cashCollected
    ? ((countedCash - yesterdayClosing.cashCollected) / yesterdayClosing.cashCollected) * 100
    : 0

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-6 pb-28" data-cashier-pdf-root="1">
      
      {/* Header come in Versione 1 (in stile chiaro) */}
      <div className="mb-6 flex items-center justify-between no-print border-b border-slate-800/60 pb-4">
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

          {lukeLoading && <span className="text-xs text-slate-300 font-medium">{t.header.loading}</span>}
        </div>

        <div className="flex items-center gap-2">
          {!!initialIdFromUrl && (
            <div className="inline-flex items-center rounded-lg border border-slate-350 bg-white text-xs overflow-hidden shadow-xs">
              <button
                type="button"
                className={`px-3 py-1.5 font-bold transition-colors ${!liveMode
                  ? 'bg-blue-650 text-white bg-blue-600'
                  : 'text-slate-700 hover:bg-slate-50'
                  }`}
                onClick={handleSavedClick}
              >
                {t.initialInfo.saved}
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 font-bold border-l border-slate-300 transition-colors ${liveMode
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-700 hover:bg-slate-50'
                  }`}
                onClick={handleLiveClick}
              >
                {t.initialInfo.live}
              </button>
            </div>
          )}

          {!isReadOnly && header.dateStr >= '2026-07-09' && (
            <button
              type="button"
              onClick={handleValidatePOS}
              disabled={syncingPos}
              className="inline-flex items-center justify-center h-9 px-3 rounded-lg border border-slate-350 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 shadow-xs"
            >
              <ArrowPathIcon className={`w-4 h-4 mr-1.5 ${syncingPos ? 'animate-spin' : ''}`} />
              {language === 'vi' ? 'Đồng bộ POS' : 'Sync POS'}
            </button>
          )}

          <button
            type="button"
            onClick={exportPDF}
            className="inline-flex items-center justify-center h-9 px-3 rounded-lg bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 shadow-sm"
          >
            <ArrowDownTrayIcon className="w-4 h-4 mr-1.5" />
            {language === 'vi' ? 'Xuất Báo Cáo' : 'Export Report'}
          </button>
        </div>
      </div>

      {/* ─── Riga Sessione / Top Info Row ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Date Selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            {t.initialInfo.date}
          </label>
          <input
            type="date"
            value={header.dateStr}
            onChange={e => setHeader(h => ({ ...h, dateStr: e.target.value }))}
            disabled={isReadOnly}
            className="h-10 px-3 text-sm font-semibold text-slate-800 border border-slate-300 hover:border-slate-400 rounded-lg bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400 transition-all shadow-xs"
          />
        </div>

        {/* Branch (read only) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            {t.initialInfo.branch}
          </label>
          <input
            type="text"
            value={activeBranchName}
            readOnly
            className="w-full h-10 px-3 text-sm font-semibold text-slate-500 border border-slate-300 bg-slate-50 rounded-lg focus:outline-none shadow-xs"
          />
        </div>

        {/* Created by (read only) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            {language === 'vi' ? 'Người tạo' : 'Created by'}
          </label>
          <input
            type="text"
            value={header.cashier || 'N/A'}
            readOnly
            className="w-full h-10 px-3 text-sm font-semibold text-slate-500 border border-slate-300 bg-slate-50 rounded-lg focus:outline-none shadow-xs"
          />
        </div>
      </div>

      {/* ─── Sezione 1: Revenue Overview ─── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-6">
        <h2 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
          {t.initialInfo.revenueTitle}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          <div className="flex flex-col justify-center">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              {language === 'vi' ? 'Doanh thu gộp (POS)' : 'Gross Revenue (POS)'}
            </span>
            <span className="text-lg font-black text-slate-800 tabular-nums mt-1">
              {fmtLive(round(payments.grossRevenue))} ₫
            </span>
          </div>

          <div className="flex flex-col justify-center md:pl-6 pt-3 md:pt-0">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              {language === 'vi' ? 'Chiết khấu (POS)' : 'Discount (POS)'}
            </span>
            <span className="text-lg font-black text-red-650 text-red-600 tabular-nums mt-1">
              -{fmtLive(round(payments.discount))} ₫
            </span>
          </div>

          <div className="flex flex-col justify-center md:pl-6 pt-3 md:pt-0">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              {language === 'vi' ? 'Doanh thu ròng (POS)' : 'Net Revenue (POS)'}
            </span>
            {header.dateStr >= '2026-07-09' ? (
              <span className="text-lg font-black text-slate-900 tabular-nums mt-1">
                {fmtLive(round(payments.revenue))} ₫
              </span>
            ) : (
              <div className="mt-1">
                <NumFmt
                  value={round(payments.revenue)}
                  onChange={x => setPayments(p => ({ ...p, revenue: x }))}
                  disabled={isReadOnly}
                  className="w-32 font-black text-slate-900 border border-slate-200/80 hover:border-slate-355 focus:border-blue-500 focus:bg-white rounded-md px-2 py-0.5 bg-slate-50/50 disabled:bg-transparent disabled:border-transparent disabled:text-slate-950 disabled:shadow-none transition-all text-right focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Sezione 1b: Payment Channels & Drawer Adjustments ─── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm mb-6">
        {/* Header Block */}
        <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-800 tracking-tight leading-none">
              {language === 'vi' ? 'Kênh Thanh Toán & Điều Chỉnh Cassa' : 'Payment Channels & Drawer Adjustments'}
            </h2>
            <span className="text-[11px] text-slate-400 font-bold block mt-1.5 leading-none">
              {language === 'vi' ? 'Tổng quan về thu chi và các điều chỉnh két' : 'Overview of collections and drawer movements'}
            </span>
          </div>
        </div>

        {/* Two Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Column 1: Digital Channels & Delivery */}
          <div className="flex flex-col h-full justify-between gap-4">
            <div className="flex-shrink-0">
              <h3 className="text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-2">
                {language === 'vi' ? 'KÊNH THANH TOÁN (KHÔNG TIỀN MẶT)' : 'PAYMENT CHANNELS (NON-CASH)'}
              </h3>

              <PaymentRow
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                }
                bgIcon="bg-blue-600 text-white"
                label={t.initialInfo.cardPayments}
                value={cardVal}
                percent={totalCollectedChart > 0 ? (cardVal / totalCollectedChart) * 100 : 0}
              />

              <PaymentRow
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                }
                bgIcon="bg-indigo-600 text-white"
                label={t.initialInfo.bankTransfer}
                value={bankVal}
                percent={totalCollectedChart > 0 ? (bankVal / totalCollectedChart) * 100 : 0}
              />
            </div>

            <div className="flex-grow flex flex-col min-h-0">
              <div className="flex items-center mb-2 flex-shrink-0">
                <h3 className="text-[10px] font-bold text-slate-700 uppercase tracking-widest">
                  {language === 'vi' ? 'ĐỐI TÁC GIAO HÀNG (THIRD-PARTY)' : 'THIRD-PARTY DELIVERY'}
                </h3>
              </div>
              {/* Scrollable list for third parties */}
              <div className="flex-grow overflow-y-auto pr-1 custom-scrollbar min-h-0 border-b border-slate-100">
                {thirdPartyAmounts.map((item, idx) => {
                  const brand = getChannelBrandDetails(item.label)
                  return (
                    <PaymentRow
                      key={`tp-${idx}`}
                      icon={brand.icon}
                      bgIcon={brand.bgIcon}
                      label={item.label || t.initialInfo.thirdPartyFallback.replace('{n}', String(idx + 1))}
                      value={item.amount}
                      percent={totalCollectedChart > 0 ? (item.amount / totalCollectedChart) * 100 : 0}
                      roundedFull={true}
                    />
                  )
                })}
              </div>
            </div>
          </div>

          {/* Column 2: Cash Out & Drawer Adjustments */}
          <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-1">
              {language === 'vi' ? 'CHI PHÍ & ĐIỀU CHỈNH' : 'CASH OUT & DRAWER ADJUSTMENTS'}
            </h3>

            <AdjustmentRow
              icon={
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              }
              bgIcon="bg-slate-100 text-slate-600"
              label={t.initialInfo.cashOut}
              value={round(payments.cashOut)}
              textClass="text-slate-800"
            />

            {header.dateStr >= '2026-07-09' && typeof payments.posUnpaid === 'number' && payments.posUnpaid !== round(payments.unpaid) ? (
              <div className="flex items-center justify-between p-3 rounded-xl border border-amber-200 bg-amber-50/50 shadow-2xs w-full min-h-[54px]">
                <div className="flex items-center gap-2.5 min-w-0 flex-grow">
                  <div className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex flex-col justify-center">
                    <span className="text-[11px] font-bold text-slate-800 leading-tight" title={t.initialInfo.unpaid}>
                      {t.initialInfo.unpaid}
                    </span>
                    <span className="text-[9px] text-amber-600 font-semibold truncate mt-0.5 leading-tight">
                      POS: {fmtLive(payments.posUnpaid)}
                    </span>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-red-650 text-red-600 tabular-nums pl-2 flex-shrink-0">
                  {fmtLive(round(payments.unpaid))} ₫
                </span>
              </div>
            ) : (
              <AdjustmentRow
                icon={
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                }
                bgIcon="bg-red-50 text-red-500"
                label={t.initialInfo.unpaid}
                value={round(payments.unpaid)}
                textClass="text-red-600 font-bold"
              />
            )}

            <AdjustmentRow
              icon={
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              bgIcon="bg-pink-50 text-pink-500"
              label={t.initialInfo.repaymentsLabel.replace(/\s*\(.*?\)\s*/g, '')}
              subtitle={language === 'vi' ? '(tiền mặt/thẻ)' : '(cash/card)'}
              value={round(payments.repaymentsCashCard)}
              textClass="text-pink-600 font-bold"
            />

            <AdjustmentRow
              icon={
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              bgIcon="bg-amber-50 text-amber-500"
              label={t.initialInfo.depositsLabel.replace(/\s*\(.*?\)\s*/g, '')}
              subtitle={language === 'vi' ? '(tiền mặt/thẻ)' : '(cash/card)'}
              value={round(deposits)}
              textClass="text-amber-500 font-bold"
            />

            {/* expected net cash drawer box (bottom right) */}
            <div className="mt-4 p-4 rounded-2xl bg-blue-50/45 border border-blue-100 flex items-center justify-between shadow-3xs">
              <div className="flex flex-col">
                <span className="text-[10px] font-extrabold text-blue-600 uppercase tracking-widest">
                  {language === 'vi' ? 'TIỀN MẶT THỰC THU (NET CASH)' : 'NET CASH'}
                </span>
                <span className="text-2xl font-black text-blue-700 mt-1.5 tabular-nums">
                  {fmtLive(netVal)} ₫
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-100/50 border border-blue-200 flex items-center justify-center text-blue-600 flex-shrink-0">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7H4M20 7a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2m16 0V5a2 2 0 00-2-2H6a2 2 0 00-2 2v2m11 5h-4" />
                </svg>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ─── Sezione 2: Cash Count ─── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between gap-3 mb-4 border-b border-slate-100 pb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                {language === 'vi' ? 'Kiểm Kê Tiền Mặt' : 'Cash Count'}
              </h2>
              <span className="text-[11px] text-slate-400 font-medium block mt-0.5">
                {language === 'vi' ? 'Kiểm kê số tiền mặt có trong két' : 'Count the cash in drawer'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2.5 no-print">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
              {language === 'vi' ? 'Tiêu chuẩn két' : 'Target'}: {formatVND(floatTarget)} ₫
            </span>
            <button
              type="button"
              onClick={doSuggest}
              disabled={isReadOnly}
              className="h-8 px-3 rounded-lg border border-slate-350 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 transition-colors shadow-xs disabled:opacity-50"
            >
              {language === 'vi' ? 'Gợi ý chia két' : 'Suggest plan'}
            </button>
            <button
              type="button"
              onClick={clearCounts}
              disabled={isReadOnly}
              className="h-8 px-3 rounded-lg border border-slate-350 bg-white hover:bg-red-50 hover:text-red-600 text-[11px] font-bold text-slate-500 transition-colors shadow-xs disabled:opacity-50"
            >
              {language === 'vi' ? 'Xóa bảng' : 'Clear'}
            </button>
          </div>
        </div>

        {/* Bill table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                <th className="text-left px-4 py-2 w-[25%]">{language === 'vi' ? 'Mệnh giá' : 'Denomination'}</th>
                <th className="text-right px-3 py-2 w-[18%]">{language === 'vi' ? 'Trong két' : 'In Drawer'}</th>
                <th className="text-right px-3 py-2 w-[18%]">{language === 'vi' ? 'Rút ra' : 'To Take'}</th>
                <th className="text-right px-3 py-2 w-[18%]">{language === 'vi' ? 'Còn lại' : 'Remain'}</th>
                <th className="text-right px-4 py-2 w-[21%]">{language === 'vi' ? 'Thành tiền' : 'Subtotal'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {DENOMS.map(({ key, face }) => {
                const have = cash[key] || 0
                const keep = Math.max(0, have - (effectivePlan[key] || 0))
                const parentTake = planActive ? (floatPlan[key] || 0) : 0
                const showPlaceholder = planActive && !edited[key] && parentTake === (effectivePlan[key] || 0)
                const placeholder = planActive ? String(effectivePlan[key] || 0) : undefined

                return (
                  <tr key={key} className="hover:bg-slate-50/20 transition-colors">
                    {/* Denom */}
                    <td className="px-4 py-2 flex items-center gap-2">
                      <span className="w-5 h-3.5 border border-slate-300 rounded bg-slate-100 flex-shrink-0 flex items-center justify-center text-[7px] text-slate-500 font-bold uppercase select-none">
                        VND
                      </span>
                      <span className="text-xs font-bold text-slate-700">{t.cashCount.denoms[key]}</span>
                      {have > 0 && (
                        <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1 py-0.5 rounded">
                          {have}x
                        </span>
                      )}
                    </td>

                    {/* In Drawer Quantity */}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={have === 0 ? '' : have}
                        onChange={e => {
                          const val = e.target.value === '' ? 0 : Math.max(0, Math.floor(Number(e.target.value)))
                          changeCash(key, val)
                        }}
                        disabled={isReadOnly}
                        className="h-8 w-full border border-slate-300 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 rounded-lg px-2 text-right text-xs font-bold text-slate-800 transition-all bg-white disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200"
                        placeholder="0"
                      />
                    </td>

                    {/* To Take Quantity */}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={showPlaceholder ? '' : (planActive ? parentTake : '')}
                        placeholder={placeholder || '0'}
                        onChange={e => {
                          const val = e.target.value === '' ? 0 : Math.max(0, Math.floor(Number(e.target.value)))
                          changeTake(key, val)
                        }}
                        disabled={isReadOnly}
                        className="h-8 w-full border border-slate-300 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 rounded-lg px-2 text-right text-xs font-bold text-slate-800 transition-all bg-white disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200"
                      />
                    </td>

                    {/* Remain Quantity (In Drawer - To Take) */}
                    <td className="px-3 py-2">
                      <div className="h-8 border border-slate-200 bg-slate-50 text-slate-600 rounded-lg px-2 flex items-center justify-end text-xs font-bold tabular-nums">
                        {keep}
                      </div>
                    </td>

                    {/* Subtotal (Remain * Face) */}
                    <td className="text-right px-4 py-2 text-xs font-bold text-slate-800 tabular-nums">
                      {formatVND(keep * face)} ₫
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr className="bg-slate-50/50 border-t border-slate-200 text-xs font-bold text-slate-800">
                <td className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Total</td>
                <td className="text-right px-3 py-2.5 tabular-nums">{formatVND(sumValue(cash))} ₫</td>
                <td className="text-right px-3 py-2.5 text-blue-600 tabular-nums">{formatVND(totalToTake)} ₫</td>
                <td className="text-right px-3 py-2.5 tabular-nums">{formatVND(sumValue(cash) - totalToTake)} ₫</td>
                <td className="text-right px-4 py-2.5 tabular-nums">{formatVND(totalRemain)} ₫</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Float Setup Mismatch warning */}
        {Math.abs(totalRemain - floatTarget) > 999 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 mb-4 animate-fade-in">
            <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-xs text-amber-800 leading-snug">
              <strong className="font-bold block mb-0.5">{t.cashCount.floatMismatchTitle}</strong>
              <span className="opacity-90">{t.cashCount.floatMismatchDesc}</span>
            </div>
          </div>
        )}

        {/* 5 metrics below the table */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          {[
            { label: language === 'vi' ? 'Tiền mặt dự kiến' : 'Expected in drawer', value: formatVND(expectedDrawerCash) + ' ₫' },
            { label: language === 'vi' ? 'Thực tế đếm' : 'Counted', value: formatVND(countedCash) + ' ₫' },
            { 
              label: language === 'vi' ? 'Chênh lệch' : 'Difference', 
              value: formatVND(cashDiff) + ' ₫',
              color: cashDiff === 0 ? 'text-slate-800' : cashDiff > 0 ? 'text-emerald-600' : 'text-red-600' 
            },
            { label: language === 'vi' ? 'Rút ra' : 'To take', value: formatVND(totalToTake) + ' ₫' },
            { label: language === 'vi' ? 'Mục tiêu két' : 'Target float', value: formatVND(floatTarget) + ' ₫' },
          ].map((m, i) => (
            <div key={i} className="bg-slate-50/30 rounded-xl border border-slate-200 p-3 flex flex-col justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{m.label}</span>
              <span className={`text-sm font-bold tabular-nums block mt-2 ${m.color || 'text-slate-700'}`}>{m.value}</span>
            </div>
          ))}
        </div>
      </div>



      {/* ─── Sezione 4: Summary ─── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-6">
        <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            {language === 'vi' ? 'Bản Tóm Tắt' : 'Summary'}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* Financial summary (Left) */}
          <div className="bg-slate-50/20 border border-slate-200 rounded-xl p-4.5 space-y-3.5">
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="font-semibold text-slate-500">{t.summary.labels.revenue}</span>
              <span className="font-bold text-slate-800 tabular-nums">{formatVND(payments.grossRevenue ?? 0)} ₫</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="font-semibold text-slate-500">{language === 'vi' ? 'Chiết khấu' : 'Discounts'}</span>
              <span className="font-bold text-red-500 tabular-nums">-{formatVND(payments.discount ?? 0)} ₫</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-100 font-bold">
              <span className="text-blue-750">Net Revenue</span>
              <span className="text-blue-750 tabular-nums">{formatVND(payments.revenue ?? 0)} ₫</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="font-semibold text-slate-500">{t.summary.labels.expectedDrawer}</span>
              <span className="font-bold text-slate-800 tabular-nums">{formatVND(expectedDrawerCash)} ₫</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="font-semibold text-slate-500">{language === 'vi' ? 'Tiền mặt thực tế đếm' : 'Cash counted'}</span>
              <span className="font-bold text-slate-800 tabular-nums">{formatVND(countedCash)} ₫</span>
            </div>
            <div className="flex items-center justify-between py-1.5 font-bold">
              <span className="text-slate-800">{t.summary.labels.variance}</span>
              <span className={`tabular-nums ${cashDiff === 0 ? 'text-slate-800' : cashDiff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {formatVND(cashDiff)} ₫
              </span>
            </div>
          </div>

          {/* Breakdown and adjustments (Right) */}
          <div className="bg-slate-50/20 border border-slate-200 rounded-xl p-4.5 space-y-3.5">
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="font-semibold text-slate-500">{t.summary.labels.nonCashTotal}</span>
              <span className="font-bold text-slate-800 tabular-nums">{formatVND(nonCashTotal)} ₫</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="font-semibold text-slate-500">{language === 'vi' ? 'Tiền mặt doanh thu' : 'Total cash'}</span>
              <span className="font-bold text-slate-800 tabular-nums">{formatVND(totalCashCollected)} ₫</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="font-semibold text-slate-500">{t.summary.labels.adjustmentsTotal}</span>
              <span className="font-bold text-slate-800 tabular-nums">{formatVND(adjustmentsTotal)} ₫</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="font-semibold text-slate-500">{language === 'vi' ? 'Tiêu chuẩn két' : 'Float target'}</span>
              <span className="font-bold text-slate-700 tabular-nums">{formatVND(floatTarget)} ₫</span>
            </div>
            <div className="flex items-center justify-between py-1 font-bold">
              <span className="text-slate-800">To take</span>
              <span className="text-blue-600 tabular-nums">{formatVND(totalToTake)} ₫</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Sezione 5: Comment/Notes ─── */}
      {!isReadOnly && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-6 no-print">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {language === 'vi' ? 'Ý kiến đóng góp' : 'Comments & Notes'}
            </label>
          </div>
          <textarea
            value={header.notes || ''}
            onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))}
            className="w-full border border-slate-300 hover:border-slate-400 rounded-xl px-3.5 py-2.5 min-h-[72px] bg-white text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 resize-none transition-all"
            placeholder={t.initialInfo.commentPlaceholder}
          />
        </div>
      )}

      {/* ─── Sezione 6: Report Info ─── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-4">
        <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            {language === 'vi' ? 'Thông Tin Ca' : 'Report Info'}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-slate-50/20 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Date</span>
            <span className="font-bold text-slate-800 mt-2 block">{formatDateFull(header.dateStr, language)}</span>
          </div>
          <div className="bg-slate-50/20 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Branch</span>
            <span className="font-bold text-slate-800 mt-2 block">{activeBranchName || 'N/A'}</span>
          </div>
          <div className="bg-slate-50/20 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Closed by</span>
            <span className="font-bold text-slate-800 mt-2 block">{header.cashier || 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* ─── Bottom Actions ─── */}
      <div className="flex items-center justify-between mt-8 border-t border-slate-200 pt-5 no-print">
        <button
          type="button"
          onClick={resetAll}
          className="h-10 px-5 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-bold text-slate-600 transition-colors shadow-xs"
        >
          {language === 'vi' ? 'Hủy bỏ' : 'Cancel'}
        </button>

        {!isReadOnly && (
          <div className="flex items-center gap-2">
            {!isValidated ? (
              <button
                className="h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-755 text-white font-bold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap shadow-sm"
                onClick={handleValidatePOS}
                disabled={disableValidate}
              >
                {syncingPos && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
                {language === 'vi' ? 'Xác nhận POS' : 'Verify & Validate'}
              </button>
            ) : (
              <button
                className="h-10 px-6 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors disabled:opacity-50 whitespace-nowrap shadow-sm flex items-center gap-1.5"
                onClick={onSaveAll}
                disabled={disableSave}
              >
                <CheckIcon className="w-4 h-4" />
                {language === 'vi' ? 'XÁC NHẬN & ĐÓNG CA' : 'Verify & Close'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── Floating Save Bar (Full Width) ─── */}
      {displayDirty && !isReadOnly && (
        <div className="no-print fixed bottom-4 left-0 right-0 pointer-events-none z-[70] flex justify-center animate-fade-in">
          <div
            className="pointer-events-auto bg-white border border-slate-300 shadow-2xl rounded-xl px-5 py-3 flex items-center justify-between gap-4"
            style={{
              width: 'min(72rem, calc(100vw - 2rem))',
              maxWidth: 'calc(100vw - (var(--leftnav-w, 56px) * 2) - 2rem)',
            }}
          >
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800">{t.saveBar.dirty}</span>
                <span className="text-[10px] text-slate-500 font-semibold">{t.saveBar.shortcut}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={resetAll}
                className="h-9 px-3.5 rounded-lg border border-slate-350 hover:bg-slate-50 text-xs font-bold text-slate-700 transition-colors"
              >
                {t.header.reset}
              </button>
              {!isValidated ? (
                <button
                  className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap shadow-sm"
                  onClick={handleValidatePOS}
                  disabled={disableValidate}
                >
                  {syncingPos && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
                  {language === 'vi' ? 'Xác nhận POS' : 'Verify & Validate'}
                </button>
              ) : (
                <button
                  className="h-9 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors disabled:opacity-50 whitespace-nowrap shadow-sm flex items-center gap-1.5"
                  onClick={onSaveAll}
                  disabled={disableSave}
                >
                  <CheckIcon className="w-4 h-4" />
                  {language === 'vi' ? 'XÁC NHẬN & ĐÓNG CA' : 'Verify & Close'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Date ISO Helpers ─── */
function todayISO() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function round(n: number | undefined) {
  return Math.round(Number.isFinite(n) ? (n || 0) : 0)
}

function formatVND(n: number) {
  try {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0))
  } catch {
    return `${Math.round(n || 0)}`
  }
}

function formatDateShort(dateStr: string) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return dateStr
}

function formatDateFull(dateStr?: string, lang?: string): string {
  if (!dateStr) return 'N/A'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return 'N/A'
  const daysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const daysVi = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
  const dayName = lang === 'vi' ? daysVi[d.getDay()] : daysEn[d.getDay()]
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dayName}, ${dd}/${mm}/${yyyy}`
}
