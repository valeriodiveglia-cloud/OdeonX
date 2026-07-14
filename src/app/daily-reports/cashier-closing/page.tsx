// app/daily-reports/cashier-closing-v2/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ArrowLongUpIcon,
  ArrowLongDownIcon,
  CheckIcon,
  ChatBubbleOvalLeftEllipsisIcon,
} from '@heroicons/react/24/outline'
import CircularLoader from '@/components/CircularLoader'
import PageHeader from '@/components/PageHeader'
import Button from '@/components/Button'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useDRBranch } from '../_data/useDRBranch'
import { supabase } from '@/lib/supabase_shim'
import { useCashierLuke } from '../_data/useCashierLuke'
import { useSettings } from '@/contexts/SettingsContext'
import { getDailyReportsDictionary } from '../_i18n'
import { useDailyReportSettingsDB } from '../_data/useDailyReportSettingsDB'
import { useDailyReportSettings } from '../_data/useDailyReportSettings'
import { creditsBus } from '@/lib/creditsSync'
import { Users, Receipt, Utensils, ShoppingBag, ClipboardList } from 'lucide-react'

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
  posGuests?: number
  posDiningGuests?: number
  posDiningRevenue?: number
  posDeliveryTakeawayRevenue?: number
  posOrdersCount?: number
  posTakeawayCount?: number
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
    } else {
      for (const [legacyKey, legacyVal] of legacyMap.entries()) {
        if (key.includes(legacyKey) || legacyKey.includes(key)) {
          amount = legacyVal
          break
        }
      }
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
  const fallbackIcon = (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  )

  if (norm.includes('grab')) {
    return {
      bgIcon: 'bg-emerald-50 text-emerald-600',
      barColor: 'bg-emerald-500',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M23.129 10.863a2.927 2.927 0 00-2.079-.872c-.57 0-1.141.212-1.455.421-.651.434-1.186.904-2.149 2.148v.894c.817-1.064 1.59-1.903 2.177-2.364.386-.31.933-.501 1.427-.501 1.275 0 2.352 1.077 2.352 2.352v.538c0 .63-.247 1.223-.698 1.668a2.341 2.341 0 01-1.654.685c-1.048 0-1.97-.719-2.22-1.701l-.422.51c.307 1.03 1.417 1.789 2.642 1.789.778 0 1.516-.31 2.079-.872.562-.562.871-1.3.871-2.079v-.538c0-.778-.31-1.517-.871-2.078m-12.8-.274c.406 0 .757.087 1.074.266.149-.186.299-.337.411-.449-.335-.256-.903-.415-1.485-.415-.83 0-1.584.3-2.122.843-.534.54-.83 1.287-.83 2.107v3.489h.598V12.94c0-1.385.968-2.352 2.354-2.352m5.678 5.84v-3.488c0-1.072-.84-1.913-1.913-1.913-.5 0-.976.203-1.343.57a1.895 1.895 0 00-.57 1.343v.538c0 1.037.877 1.913 1.913 1.913.285 0 .671-.07.908-.264v-.631c-.232.187-.57.298-.908.298a1.302 1.302 0 01-1.315-1.316v-.538a1.3 1.3 0 011.315-1.314 1.3 1.3 0 011.316 1.314v3.489zM0 12.596v.193c0 1.036.393 2.003 1.107 2.722a3.759 3.759 0 002.689 1.112c.82 0 1.548-.186 2.162-.551.506-.302.73-.607.75-.635V12.22H3.65v.597H6.11v2.434l-.002.002c-.288.288-.972.77-2.312.77a3.165 3.165 0 01-2.279-.938 3.247 3.247 0 01-.92-2.297v-.193c0-.83.375-1.656 1.026-2.269a3.558 3.558 0 012.442-.967c.847 0 1.438.129 1.913.416v-.67c-.494-.21-1.085-.305-1.913-.305C1.862 8.8 0 10.538 0 12.595m10.329-.968c.226 0 .419.037.571.112.075-.186.151-.339.262-.525-.162-.116-.549-.186-.833-.186-1.09 0-1.913.823-1.913 1.913v3.489h.598V12.94c0-.774.54-1.314 1.315-1.314m-4.351-.702v-.707c-.541-.29-1.131-.419-1.913-.419-.799 0-1.555.293-2.132.824-.577.532-.895 1.233-.895 1.972v.193c0 1.542 1.237 2.796 2.758 2.796 1.237 0 1.745-.405 1.874-.533v-1.794H3.65v.598h1.46v.899l-.005.001c-.187.075-.578.231-1.31.231-.58 0-1.122-.225-1.528-.636a2.203 2.203 0 01-.632-1.562v-.193c0-1.192 1.113-2.198 2.43-2.198.91 0 1.45.147 1.913.528m14.105 1.126c.27-.27.623-.424.967-.424.737 0 1.315.577 1.315 1.314v.538c0 .738-.578 1.316-1.315 1.316-.357 0-.702-.196-.972-.55a2.151 2.151 0 01-.418-1.12l-.484.591c.095.452.33.885.665 1.19.344.313.774.486 1.209.486a1.915 1.915 0 001.913-1.913v-.538c0-.499-.202-.977-.57-1.343a1.896 1.896 0 00-1.343-.57c-.316 0-.818.114-1.417.652l-.002.002c-.16.16-.536.536-.765.804-.384.42-.943 1.054-1.42 1.688v.933c.529-.68.833-1.06 1.33-1.634.445-.519.996-1.15 1.307-1.422m-8.939 1.428c0 .779.31 1.517.872 2.08a2.93 2.93 0 002.078.87c.33 0 .669-.07.908-.188v-.597c-.28.117-.618.188-.908.188-1.274 0-2.352-1.077-2.352-2.353v-.538c0-1.275 1.078-2.352 2.352-2.352a2.34 2.34 0 012.353 2.353v3.488h.598v-3.604a2.979 2.979 0 00-.915-2.006 2.92 2.92 0 00-2.036-.83c-.778 0-1.516.31-2.078.873a2.926 2.926 0 00-.872 2.078zm6.918-2.313c.183-.22.372-.443.596-.631V7.378h-.596zm1.037-.876V7.378h.597V9.88a3.601 3.601 0 00-.597.41" />
        </svg>
      )
    }
  }
  if (norm.includes('shopee')) {
    return {
      bgIcon: 'bg-orange-50 text-orange-600',
      barColor: 'bg-orange-500',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M15.9414 17.9633c.229-1.879-.981-3.077-4.1758-4.0969-1.548-.528-2.277-1.22-2.26-2.1719.065-1.056 1.048-1.825 2.352-1.85a5.2898 5.2898 0 0 1 2.8838.89c.116.072.197.06.263-.039.09-.145.315-.494.39-.62.051-.081.061-.187-.068-.281-.185-.1369-.704-.4149-.983-.5319a6.4697 6.4697 0 0 0-2.5118-.514c-1.909.008-3.4129 1.215-3.5389 2.826-.082 1.1629.494 2.1078 1.73 2.8278.262.152 1.6799.716 2.2438.892 1.774.552 2.695 1.5419 2.478 2.6969-.197 1.047-1.299 1.7239-2.818 1.7439-1.2039-.046-2.2878-.537-3.1278-1.19l-.141-.11c-.104-.08-.218-.075-.287.03-.05.077-.376.547-.458.67-.077.108-.035.168.045.234.35.293.817.613 1.134.775a6.7097 6.7097 0 0 0 2.8289.727 4.9048 4.9048 0 0 0 2.0759-.354c1.095-.465 1.8029-1.394 1.9449-2.554zM11.9986 1.4009c-2.068 0-3.7539 1.95-3.8329 4.3899h7.6657c-.08-2.44-1.765-4.3899-3.8328-4.3899zm7.8516 22.5981-.08.001-15.7843-.002c-1.074-.04-1.863-.91-1.971-1.991l-.01-.195L1.298 6.2858a.459.459 0 0 1 .45-.494h4.9748C6.8448 2.568 9.1607 0 11.9996 0c2.8388 0 5.1537 2.5689 5.2757 5.7898h4.9678a.459 4.459 0 0 1 .458.483l-.773 15.5883-.007.131c-.094 1.094-.979 1.9769-2.0709 2.0059z" />
        </svg>
      )
    }
  }
  if (norm.includes('beamin')) {
    return {
      bgIcon: 'bg-cyan-50 text-cyan-600',
      barColor: 'bg-cyan-500',
      icon: fallbackIcon
    }
  }
  if (norm.includes('gofood') || norm.includes('gojek')) {
    return {
      bgIcon: 'bg-red-50 text-red-600',
      barColor: 'bg-red-500',
      icon: fallbackIcon
    }
  }
  if (norm.includes('loship')) {
    return {
      bgIcon: 'bg-rose-50 text-rose-600',
      barColor: 'bg-rose-500',
      icon: fallbackIcon
    }
  }
  return {
    bgIcon: 'bg-slate-50 text-slate-600',
    barColor: 'bg-slate-400',
    icon: fallbackIcon
  }
}

function PaymentRow(props: {
  icon: React.ReactNode
  bgIcon: string
  label: string
  subtitle?: string
  value: number
  percent: number
  barColor?: string
}) {
  const { icon, bgIcon, label, subtitle, value, percent, barColor } = props
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 w-full min-h-[54px]">
      <div className="flex items-center gap-3 min-w-0 flex-grow">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${bgIcon}`}>
          {icon}
        </div>
        <div className="min-w-0 flex flex-col justify-center">
          <span className="text-sm font-semibold text-slate-800 leading-tight">{label}</span>
          {subtitle && (
            <span className="text-[10px] text-slate-400 font-semibold mt-0.5 leading-tight">
              {subtitle}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end flex-shrink-0 pl-3">
        <span className="text-sm font-bold text-slate-900 tabular-nums leading-tight">
          {fmtLive(value)} ₫
        </span>
        <div className="flex items-center gap-2 mt-1">
          {/* Progress Bar */}
          <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${barColor || 'bg-slate-300'}`} 
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[10px] font-semibold text-slate-400 min-w-[28px] text-right leading-none">
            {percent.toFixed(1)}%
          </span>
        </div>
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

function SummaryRow(props: {
  icon: React.ReactNode
  bgIcon: string
  label: string
  value: number
  textClass?: string
  isLast?: boolean
  rowClass?: string
  labelClass?: string
}) {
  const {
    icon,
    bgIcon,
    label,
    value,
    textClass = "text-slate-800",
    isLast,
    rowClass = "",
    labelClass = "text-slate-600"
  } = props
  return (
    <div className={`flex items-center justify-between py-2.5 ${!isLast ? 'border-b border-slate-100' : ''} ${rowClass}`}>
      <div className="flex items-center gap-2 min-w-0 flex-grow">
        <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 text-[10px] ${bgIcon}`}>
          {icon}
        </div>
        <span className={`text-xs font-semibold truncate ${labelClass}`} title={label}>
          {label}
        </span>
      </div>
      <span className={`text-xs font-bold tabular-nums pl-2 flex-shrink-0 ${textClass}`}>
        {formatVND(value)} ₫
      </span>
    </div>
  )
}


function getVNDBillLabel(key: string) {
  switch (key) {
    case 'd500k': return '500k'
    case 'd200k': return '200k'
    case 'd100k': return '100k'
    case 'd50k':  return '50k'
    case 'd20k':  return '20k'
    case 'd10k':  return '10k'
    case 'd5k':   return '5k'
    case 'd2k':   return '2k'
    case 'd1k':   return '1k'
    default:      return 'VND'
  }
}

function BanknoteIcon({ denomKey }: { denomKey: string }) {
  let bgClass = ''
  let borderClass = ''
  let textClass = ''
  let valueText = ''
  let isPolymer = true
  let accentColor = ''

  switch (denomKey) {
    case 'd500k':
      bgClass = 'bg-cyan-100'
      borderClass = 'border-cyan-200'
      textClass = 'text-cyan-800'
      valueText = '500'
      accentColor = 'bg-cyan-200/50'
      break
    case 'd200k':
      bgClass = 'bg-orange-100'
      borderClass = 'border-orange-200'
      textClass = 'text-orange-800'
      valueText = '200'
      accentColor = 'bg-orange-200/50'
      break
    case 'd100k':
      bgClass = 'bg-emerald-100'
      borderClass = 'border-emerald-200'
      textClass = 'text-emerald-800'
      valueText = '100'
      accentColor = 'bg-emerald-200/50'
      break
    case 'd50k':
      bgClass = 'bg-rose-100'
      borderClass = 'border-rose-200'
      textClass = 'text-rose-800'
      valueText = '50'
      accentColor = 'bg-rose-200/50'
      break
    case 'd20k':
      bgClass = 'bg-blue-100'
      borderClass = 'border-blue-200'
      textClass = 'text-blue-800'
      valueText = '20'
      accentColor = 'bg-blue-200/50'
      break
    case 'd10k':
      bgClass = 'bg-amber-100'
      borderClass = 'border-amber-200'
      textClass = 'text-amber-900'
      valueText = '10'
      accentColor = 'bg-amber-200/50'
      break
    case 'd5k':
      bgClass = 'bg-sky-100'
      borderClass = 'border-sky-200'
      textClass = 'text-sky-700'
      valueText = '5'
      isPolymer = false
      accentColor = 'bg-sky-200/30'
      break
    case 'd2k':
      bgClass = 'bg-stone-100'
      borderClass = 'border-stone-200'
      textClass = 'text-stone-700'
      valueText = '2'
      isPolymer = false
      accentColor = 'bg-stone-200/30'
      break
    case 'd1k':
      bgClass = 'bg-slate-100'
      borderClass = 'border-slate-200'
      textClass = 'text-slate-700'
      valueText = '1'
      isPolymer = false
      accentColor = 'bg-slate-200/30'
      break
    default:
      bgClass = 'bg-slate-100'
      borderClass = 'border-slate-200'
      textClass = 'text-slate-700'
      valueText = ''
      isPolymer = false
      accentColor = 'bg-slate-200/30'
  }

  return (
    <div 
      className={`w-9 h-5 border rounded-[3px] flex items-center justify-between px-1 relative overflow-hidden select-none flex-shrink-0 ${bgClass} ${borderClass}`}
      title={`VND ${getVNDBillLabel(denomKey)}`}
    >
      <div className="absolute top-0 bottom-0 left-[6px] w-[1px] bg-current/15" />
      <div className={`absolute right-1 w-2.5 h-2.5 rounded-full ${isPolymer ? 'bg-current/15 border border-current/10' : accentColor}`} />
      <span className={`text-[8px] font-black tracking-tight leading-none z-10 ${textClass}`}>
        {valueText}
      </span>
      <div className="absolute left-[1px] bottom-[2px] w-[3px] h-[3px] rounded-full bg-current/10" />
    </div>
  )
}




function StepperInput(props: {
  value: number
  onChange: (val: number) => void
  disabled?: boolean
  placeholder?: string
}) {
  const { value, onChange, disabled, placeholder } = props

  if (disabled) {
    return (
      <div className="h-9 w-full flex items-center justify-end pr-3">
        <span className="text-xs font-extrabold text-slate-950 tabular-nums">
          {value === 0 ? placeholder || '0' : value}
        </span>
      </div>
    )
  }

  return (
    <div className="h-9 w-full flex items-center border border-slate-200 hover:border-slate-300 focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500 rounded-lg overflow-hidden bg-white shadow-3xs transition-all">
      {/* Minus Button */}
      <button
        type="button"
        tabIndex={-1}
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-7 h-full flex items-center justify-center bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200 border-r border-slate-200/80 transition-colors select-none"
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" />
        </svg>
      </button>

      {/* Input Field */}
      <input
        type="text"
        inputMode="numeric"
        value={value === 0 ? '' : value}
        onChange={e => {
          const raw = e.target.value.replace(/[^0-9]/g, '')
          const val = raw === '' ? 0 : Math.max(0, Math.floor(Number(raw)))
          onChange(val)
        }}
        onFocus={e => e.target.select()}
        onKeyDown={e => {
          if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault()
            const table = e.currentTarget.closest('table')
            if (!table) return
            const inputs = Array.from(table.querySelectorAll('input[type="text"]:not(:disabled)')) as HTMLInputElement[]
            const index = inputs.indexOf(e.currentTarget)
            if (index === -1) return

            let nextIndex = index
            if (e.key === 'ArrowRight') nextIndex = index + 1
            if (e.key === 'ArrowLeft') nextIndex = index - 1
            if (e.key === 'ArrowDown') nextIndex = index + 2
            if (e.key === 'ArrowUp') nextIndex = index - 2

            if (nextIndex >= 0 && nextIndex < inputs.length) {
              inputs[nextIndex].focus()
              inputs[nextIndex].select()
            }
          }
        }}
        placeholder={placeholder || '0'}
        className="w-full h-full bg-transparent border-0 text-center text-xs font-extrabold text-slate-900 focus:ring-0 focus:outline-none p-0"
      />

      {/* Plus Button */}
      <button
        type="button"
        tabIndex={-1}
        onClick={() => onChange(value + 1)}
        className="w-7 h-full flex items-center justify-center bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200 border-l border-slate-200/80 transition-colors select-none"
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  )
}



/* ---------- Feature Toggle for Revenue Statistics Box ---------- */
const SHOW_REVENUE_STATS_BOX = true

function getSameDayLastWeekStr(dateStr: string): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() - 7)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function getWeekRangeStr(dateStr: string) {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  
  const monday = new Date(d)
  monday.setDate(d.getDate() + diffToMonday)
  
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  
  return {
    mondayStr: fmt(monday),
    sundayStr: fmt(sunday)
  }
}

const ordinal = (n: number) => {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
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

  const [showNotes, setShowNotes] = useState<boolean>(false)

  useEffect(() => {
    if (header.notes && header.notes.trim()) {
      setShowNotes(true)
    }
  }, [header.notes])


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
    posGuests: 0,
    posDiningGuests: 0,
    posDiningRevenue: 0,
    posDeliveryTakeawayRevenue: 0,
    posOrdersCount: 0,
    posTakeawayCount: 0
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
  const [isHydrating, setIsHydrating] = useState<boolean>(false)
  const dateInputRef = useRef<HTMLInputElement>(null)

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
      setIsHydrating(true)
      const res = await lukeLoad(lukeId)
      if (!res || cancelled) {
        setIsHydrating(false)
        return
      }
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

      setTimeout(() => {
        if (!cancelled) {
          setIsHydrating(false)
        }
      }, 500)
    })()
    return () => { cancelled = true }
  }, [lukeId, lukeLoad])

  // Track dirty state
  const isDirtyRef = useRef(false)
  const justClickedValidateRef = useRef(false)

  const handleReloadSaved = useCallback(async (force = false) => {
    if (!force && isDirtyRef.current) return
    if (!lukeId) return
    setIsHydrating(true)
    const res = await lukeLoad(lukeId)
    if (!res) {
      setIsHydrating(false)
      return
    }
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

    setTimeout(() => {
      setIsHydrating(false)
    }, 500)
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

      if (header.dateStr >= '2026-07-12') {
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
              
              let grabIdx = nextThirdParty.findIndex(tp => (tp.label || '').toLowerCase().includes('grab'))
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
                revenue: typeof resData.posGrossRevenue === 'number' ? (resData.posGrossRevenue - (resData.posDiscount || 0)) : p.revenue,
                posGuests: typeof resData.posGuests === 'number' ? resData.posGuests : 0,
                posDiningGuests: typeof resData.posDiningGuests === 'number' ? resData.posDiningGuests : 0,
                posDiningRevenue: typeof resData.posDiningRevenue === 'number' ? resData.posDiningRevenue : 0,
                posDeliveryTakeawayRevenue: typeof resData.posDeliveryTakeawayRevenue === 'number' ? resData.posDeliveryTakeawayRevenue : 0,
                posOrdersCount: typeof resData.posOrdersCount === 'number' ? resData.posOrdersCount : 0,
                posTakeawayCount: typeof resData.posTakeawayCount === 'number' ? resData.posTakeawayCount : 0
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

  // Fetch stats for Revenue Overview panel
  const [revenueStats, setRevenueStats] = useState<{
    sameDayLastWeekNet: number | null
    weekClosings: { date: string; net: number }[]
    storeClosings: { branch: string; net: number }[]
    activeBranches: { name: string }[]
  } | null>(null)

  useEffect(() => {
    let alive = true
    async function loadStats() {
      if (!header.dateStr || !activeBranchName) return
      
      const lastWeekStr = getSameDayLastWeekStr(header.dateStr)
      const { mondayStr, sundayStr } = getWeekRangeStr(header.dateStr)

      try {
        const [lastWeekRes, weekRes, storeRes, activeBranchesRes] = await Promise.all([
          // 1. Same day last week
          supabase
            .from('cashier_closings')
            .select('revenue_vnd, discount_vnd')
            .eq('report_date', lastWeekStr)
            .eq('branch_name', activeBranchName)
            .maybeSingle(),

          // 2. Week closings
          supabase
            .from('cashier_closings')
            .select('report_date, revenue_vnd, discount_vnd')
            .eq('branch_name', activeBranchName)
            .gte('report_date', mondayStr)
            .lte('report_date', sundayStr),

          // 3. Store closings for this date
          supabase
            .from('cashier_closings')
            .select('branch_name, revenue_vnd, discount_vnd')
            .eq('report_date', header.dateStr),

          // 4. Active branches in the system
          supabase
            .from('provider_branches')
            .select('name')
            .eq('is_active', true)
        ])

        if (!alive) return

        let sameDayLastWeekNet = null
        if (lastWeekRes.data) {
          sameDayLastWeekNet = round(lastWeekRes.data.revenue_vnd) - round(lastWeekRes.data.discount_vnd)
        }

        const weekClosings = (weekRes.data || []).map((row: any) => ({
          date: row.report_date,
          net: round(row.revenue_vnd) - round(row.discount_vnd)
        }))

        const storeClosings = (storeRes.data || []).map((row: any) => ({
          branch: row.branch_name,
          net: round(row.revenue_vnd) - round(row.discount_vnd)
        }))

        const activeBranches = (activeBranchesRes.data || []).map((row: any) => ({
          name: row.name || ''
        }))

        setRevenueStats({
          sameDayLastWeekNet,
          weekClosings,
          storeClosings,
          activeBranches
        })
      } catch (err) {
        console.error('Failed to load revenue statistics:', err)
        setRevenueStats(null)
      }
    }
    
    loadStats()
    return () => { alive = false }
  }, [header.dateStr, activeBranchName])

  // Calculated rank values for statistics box
  const weeklyRankInfo = useMemo(() => {
    if (!revenueStats || !header.dateStr) return null
    const list = revenueStats.weekClosings
      .filter(c => c.date !== header.dateStr)
      .concat({ date: header.dateStr, net: round(payments.revenue) })
    list.sort((a, b) => b.net - a.net)
    const rank = list.findIndex(c => c.date === header.dateStr) + 1
    const total = list.length
    return { rank, total }
  }, [revenueStats, header.dateStr, payments.revenue])

  const storeRankInfo = useMemo(() => {
    if (!revenueStats || !activeBranchName) return null
    
    // Lista di tutte le filiali attive note
    const allBranches = revenueStats.activeBranches.map(b => b.name).filter(Boolean)
    if (!allBranches.includes(activeBranchName)) {
      allBranches.push(activeBranchName)
    }

    // Mappa dei fatturati già inviati nel DB
    const submittedMap = new Map(revenueStats.storeClosings.map(c => [c.branch, c.net]))
    // Aggiungi o sovrascrivi con il valore live corrente
    submittedMap.set(activeBranchName, round(payments.revenue))

    // Costruisci la lista completa per il ranking
    const list = allBranches.map(name => {
      const net = submittedMap.get(name)
      return { branch: name, net: net ?? null }
    })

    // Ordina: chi ha dati (net !== null) decrescente, poi chi non ha dati (net === null) in fondo
    list.sort((a, b) => {
      if (a.net === null && b.net === null) return 0
      if (a.net === null) return 1
      if (b.net === null) return -1
      return b.net - a.net
    })

    const rank = list.findIndex(c => c.branch === activeBranchName) + 1
    const total = list.length
    const closedCount = list.filter(c => c.net !== null).length

    return { rank, total, closedCount }
  }, [revenueStats, activeBranchName, payments.revenue])

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
  const grabVal = useMemo(() => thirdPartyAmounts.find(tp => tp.label.toLowerCase().includes('grab'))?.amount || 0, [thirdPartyAmounts])
  const shopeeVal = useMemo(() => thirdPartyAmounts.find(tp => tp.label.toLowerCase().includes('shopee'))?.amount || 0, [thirdPartyAmounts])
  const otherTpVal = useMemo(() => thirdPartyAmounts
    .filter(tp => !tp.label.toLowerCase().includes('grab') && !tp.label.toLowerCase().includes('shopee'))
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
    const grabVal = thirdPartyAmounts.find(tp => tp.label.toLowerCase().includes('grab'))?.amount || 0
    const shopeeVal = thirdPartyAmounts.find(tp => tp.label.toLowerCase().includes('shopee'))?.amount || 0
    const otherTpVal = thirdPartyAmounts
      .filter(tp => !tp.label.toLowerCase().includes('grab') && !tp.label.toLowerCase().includes('shopee'))
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
      let rightY = margin

      // 1. Colonna Sinistra: Info Azienda (Left Aligned)
      if (providerBranch) {
        const mainLine = providerBranch.company_name || providerBranch.name
        const branchLine = providerBranch.company_name ? providerBranch.name : ''
        pdf.setFont("helvetica", "bold")
        pdf.setFontSize(10.5)
        pdf.setTextColor(30, 41, 59) // slate-800
        if (mainLine) { pdf.text(mainLine, margin, headerY); headerY += 4.5 }
        
        pdf.setFont("helvetica", "normal")
        pdf.setFontSize(8.5)
        pdf.setTextColor(100, 116, 139) // slate-500
        if (branchLine) {
          pdf.text(branchLine, margin, headerY)
          headerY += 4
        }
        if (providerBranch.address) {
          pdf.text(providerBranch.address, margin, headerY)
          headerY += 4
        }
        const parts = []
        if (providerBranch.tax_code) parts.push(`${language === 'vi' ? 'Mã số thuế' : 'Tax code'}: ${providerBranch.tax_code}`)
        if (providerBranch.phone) parts.push(`${language === 'vi' ? 'SĐT' : 'Phone'}: ${providerBranch.phone}`)
        if (providerBranch.email) parts.push(`Email: ${providerBranch.email}`)
        if (parts.length > 0) {
          pdf.text(parts.join('   •   '), margin, headerY)
          headerY += 4.5
        }
      }

      // 2. Colonna Destra: Titolo e Dati Sessione (Right Aligned)
      pdf.setFont("helvetica", "bold")
      pdf.setFontSize(12.5)
      pdf.setTextColor(30, 41, 59) // slate-800
      const docTitle = language === 'vi' ? 'BÁO CÁO CHỐT CA HÀNG NGÀY' : 'CASHIER CLOSING REPORT'
      pdf.text(docTitle, pageWidth - margin, rightY, { align: 'right' })
      rightY += 5.5

      pdf.setFont("helvetica", "normal")
      pdf.setFontSize(8.5)
      pdf.setTextColor(100, 116, 139) // slate-500

      let formattedDate = header.dateStr
      if (header.dateStr && /^\d{4}-\d{2}-\d{2}$/.test(header.dateStr)) {
        const [y, m, d] = header.dateStr.split('-')
        formattedDate = `${d}/${m}/${y}`
      }

      pdf.text(`${t.initialInfo.date}: ${formattedDate}`, pageWidth - margin, rightY, { align: 'right' })
      rightY += 4.2

      pdf.text(`${t.initialInfo.cashier}: ${lastEditorName || header.cashier || '-'}`, pageWidth - margin, rightY, { align: 'right' })
      rightY += 4.2

      // 3. Linea separatrice orizzontale
      const separatorY = Math.max(headerY, rightY) + 2.5
      pdf.setDrawColor(226, 232, 240) // slate-200
      pdf.setLineWidth(0.3)
      pdf.line(margin, separatorY, pageWidth - margin, separatorY)

      // Ripristina il colore del testo e aggiorna headerY
      pdf.setTextColor(0, 0, 0)
      headerY = separatorY + 6.5

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
  const [validationPopup, setValidationPopup] = useState<{
    type: 'success' | 'warning' | 'info-orange' | 'error-red'
    title: string
    message: string
  } | null>(null)

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

  const handleValidatePOS = useCallback(async (showFeedback = false) => {
    const branchNameForClosing = activeBranchName || header.branch || ''
    if (!branchNameForClosing || !header.dateStr) return

    if (showFeedback) {
      justClickedValidateRef.current = true
    } else {
      justClickedValidateRef.current = false
    }
    setSyncingPos(true)
    try {
      let total = 0
      let fetchedFromApi = false

      if (header.dateStr >= '2026-07-12') {
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
              
              let grabIdx = nextThirdParty.findIndex(tp => (tp.label || '').toLowerCase().includes('grab'))
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
                revenue: typeof resData.posGrossRevenue === 'number' ? (resData.posGrossRevenue - (resData.posDiscount || 0)) : p.revenue,
                posGuests: typeof resData.posGuests === 'number' ? resData.posGuests : 0,
                posDiningGuests: typeof resData.posDiningGuests === 'number' ? resData.posDiningGuests : 0,
                posDiningRevenue: typeof resData.posDiningRevenue === 'number' ? resData.posDiningRevenue : 0,
                posDeliveryTakeawayRevenue: typeof resData.posDeliveryTakeawayRevenue === 'number' ? resData.posDeliveryTakeawayRevenue : 0,
                posOrdersCount: typeof resData.posOrdersCount === 'number' ? resData.posOrdersCount : 0,
                posTakeawayCount: typeof resData.posTakeawayCount === 'number' ? resData.posTakeawayCount : 0
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
  const displayDirty = !coldStartSilence && !suppressingDirty && !isHydrating && sigDraft !== sigServer
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
    if (displayDirty && !liveMode && !coldStartSilence) {
      setLiveMode(true)
    }
  }, [displayDirty, liveMode, coldStartSilence])

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

  const onSaveAll = useCallback(async (updatedPayments?: typeof payments) => {
    try {
      const branchNameForClosing = activeBranchName || header.branch || ''
      if (!branchNameForClosing) {
        alert(t.alerts.selectBranch)
        return false
      }

      // Salva direttamente senza conferme intrusive in quanto il processo è interamente automatizzato

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
          return false
        }
      } catch { }

      const finalPayments = updatedPayments || payments

      const payload = {
        id: lukeId || null,
        header: {
          ...header,
          branch: branchNameForClosing,
        },
        floatTarget,
        payments: finalPayments,
        payouts,
        deposits,
        cash,
        floatPlan: effectivePlan,
        branchId: providerBranch?.id ? String(providerBranch.id) : null,
        userId: currentUserId,
      }

      const newId = await lukeSave(payload)
      if (!newId) return false

      try {
        const params = new URLSearchParams(window.location.search)
        params.set('id', newId)
        router.replace(`${pathname}?${params.toString()}`)
      } catch { }

      const finalSigDraft = signatureOfState({
        header,
        floatTarget,
        payments: finalPayments,
        payouts,
        deposits,
        cash,
        floatPlan: effectivePlan,
      })

      const now = Date.now()
      localStorage.setItem(savedSigKey(scope), finalSigDraft)
      localStorage.setItem(lastSavedKey(scope), String(now))
      setServerSigOverride(finalSigDraft)
      setLastSavedAtUI(now)
      if (currentUserName) setLastEditorName(currentUserName)
      window.dispatchEvent(new CustomEvent('cashier:saved'))
      setLiveMode(false)
      return true
    } catch (e: any) {
      console.error('[cashier] save error', e)
      alert(t.alerts.saveFailed)
      return false
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

  const handleSaveWorkflow = useCallback(async () => {
    const branchNameForClosing = activeBranchName || header.branch || ''
    if (!branchNameForClosing) {
      alert(t.alerts.selectBranch)
      return
    }

    setSyncingPos(true)
    try {
      let total = 0
      let fetchedFromApi = false
      let posUnpaid = 0
      let resData: any = null

      if (header.dateStr >= '2026-07-12') {
        const res = await fetch(
          `/api/pos/sync?branch=${encodeURIComponent(branchNameForClosing)}&date=${header.dateStr}&t=${Date.now()}`,
          { cache: 'no-store' }
        )
        if (res.ok) {
          const parsed = await res.json()
          if (parsed.success) {
            resData = parsed
            total = resData.totalAmount || 0
            posUnpaid = typeof resData.posUnpaidAmount === 'number' ? resData.posUnpaidAmount : 0
            fetchedFromApi = true
          }
        }
      }

      let freshPayments = { ...payments }
      if (fetchedFromApi && resData) {
        const nextThirdParty = Array.isArray(payments.thirdPartyAmounts) ? [...payments.thirdPartyAmounts] : []
        const posGrab = typeof resData.posGrab === 'number' ? resData.posGrab : (payments.grab || 0)
        const posMpos = typeof resData.posMpos === 'number' ? resData.posMpos : (payments.mpos || 0)
        const posGross = typeof resData.posGrossRevenue === 'number' ? resData.posGrossRevenue : (payments.grossRevenue || 0)
        const posDisc = typeof resData.posDiscount === 'number' ? resData.posDiscount : (payments.discount || 0)

        let grabIdx = nextThirdParty.findIndex(tp => (tp.label || '').toLowerCase().includes('grab'))
        if (grabIdx !== -1) {
          nextThirdParty[grabIdx] = { ...nextThirdParty[grabIdx], amount: posGrab }
        } else if (posGrab > 0) {
          nextThirdParty.push({ label: 'Grab', amount: posGrab })
        }

        let shopeeIdx = nextThirdParty.findIndex(tp => (tp.label || '').toLowerCase().includes('shopee'))
        const posShopee = typeof resData.posShopeeFood === 'number' ? resData.posShopeeFood : 0
        if (shopeeIdx !== -1) {
          nextThirdParty[shopeeIdx] = { ...nextThirdParty[shopeeIdx], amount: posShopee }
        } else if (posShopee > 0) {
          nextThirdParty.push({ label: 'Shopee Food', amount: posShopee })
        }

        freshPayments = {
          ...payments,
          bankTransferEwallet: total,
          mpos: posMpos,
          grab: posGrab,
          thirdPartyAmounts: nextThirdParty,
          grossRevenue: posGross,
          discount: posDisc,
          posUnpaid: posUnpaid,
          revenue: posGross - posDisc
        }
      } else {
        const { data, error } = await supabase
          .from('daily_report_bank_transfers')
          .select('amount')
          .eq('branch', branchNameForClosing)
          .eq('date', header.dateStr)

        if (!error && Array.isArray(data)) {
          total = data.reduce((s, r: any) => s + Math.round(Number(r?.amount || 0)), 0)
        }

        freshPayments = {
          ...payments,
          bankTransferEwallet: total,
          grossRevenue: 0,
          discount: 0,
          posUnpaid: 0
        }
      }

      setPayments(freshPayments)
      setIsValidated(true)

      // Calculate fresh cash difference
      const getCashDiffForPayments = (p: typeof payments) => {
        const vnum = (n: number | undefined) => Number.isFinite(Number(n)) ? Number(n) : 0
        const nextThirdParty = Array.isArray(p.thirdPartyAmounts) ? p.thirdPartyAmounts : []
        const thirdPartyTotal = nextThirdParty.reduce((sum, item) => sum + vnum(item.amount), 0)
        const nonCash = thirdPartyTotal + vnum(p.mpos) + vnum(p.bankTransferEwallet)

        const net =
          vnum(p.revenue) -
          nonCash -
          vnum(p.unpaid) -
          vnum(p.cashOut) +
          vnum(p.repaymentsCashCard) +
          vnum(deposits)

        const expected = round(net + floatTarget)
        return round(countedCash - expected)
      }

      const freshCashDiff = getCashDiffForPayments(freshPayments)
      const isDiscrepancy = freshCashDiff < -500 || freshCashDiff > 1000
      const saveSucceeded = await onSaveAll(freshPayments)
      if (!saveSucceeded) return

      const hasCashToTakeSurplus = (countedCash - floatTarget) > 0
      const isMissingToTake = hasCashToTakeSurplus && totalToTake === 0
      const isFloatMismatch = Math.abs(totalRemain - floatTarget) > 999

      if (isMissingToTake) {
        setValidationPopup({
          type: 'info-orange',
          title: language === 'vi' ? 'Đừng quên rút tiền mặt!' : "Don't forget to get cash!",
          message: language === 'vi'
            ? 'Có tiền mặt dư trong két so với tiêu chuẩn, vui lòng kiểm tra và điền số tiền cần rút khỏi két.'
            : 'Counted cash exceeds target float. Please remember to record the cash to take from the drawer.'
        })
      } else if (isFloatMismatch) {
        setValidationPopup({
          type: 'error-red',
          title: language === 'vi' ? 'Đã lưu (Lệch tiền bàn giao)' : 'Saved (Float Mismatch)',
          message: language === 'vi'
            ? `Báo cáo đã được lưu thành công nhưng số tiền còn lại trong két (${formatVND(totalRemain)} ₫) không khớp với tiêu chuẩn ca (${formatVND(floatTarget)} ₫). Vui lòng kiểm tra lại.`
            : `The report was saved successfully but the remaining cash in drawer (${formatVND(totalRemain)} ₫) does not match the target float (${formatVND(floatTarget)} ₫). Please review.`
        })
      } else if (isDiscrepancy) {
        setValidationPopup({
          type: 'warning',
          title: language === 'vi' ? 'Đã lưu (Cần kiểm tra lại)' : 'Saved (Check required)',
          message: language === 'vi'
            ? `Báo cáo đã được lưu thành công mà có sự chênh lệch tiền mặt là ${formatVND(freshCashDiff)} ₫. Vui lòng kiểm tra lại.`
            : `The report was saved successfully but there is a cash discrepancy of ${formatVND(freshCashDiff)} ₫. Please review.`
        })
      } else {
        setValidationPopup({
          type: 'success',
          title: language === 'vi' ? 'Đã Chốt & Xác Nhận' : 'Validated and Confirmed',
          message: language === 'vi'
            ? 'Xác thực thành công. Báo cáo ca làm việc đã được lưu.'
            : 'Validation successful. The cashier closing has been saved.'
        })
        setTimeout(() => {
          setValidationPopup(null)
        }, 1500)
      }

    } catch (err) {
      console.error('Validation and save failed:', err)
      alert(language === 'vi' ? 'Lưu thất bại. Vui lòng thử lại.' : 'Save failed. Please try again.')
    } finally {
      setSyncingPos(false)
    }
  }, [
    activeBranchName,
    header.branch,
    header.dateStr,
    payments,
    deposits,
    countedCash,
    floatTarget,
    totalToTake,
    totalRemain,
    effectivePlan,
    language,
    onSaveAll,
  ])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase()
      if (isReadOnly) return
      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault()
        if (!syncingPos) {
          handleSaveWorkflow()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    handleSaveWorkflow,
    syncingPos,
    isReadOnly
  ])

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
      
      <PageHeader
        title={t.title}
        subtitle={language === 'vi'
          ? 'Chốt ca thu ngân hàng ngày, đối chiếu POS và kiểm kê tiền mặt.'
          : 'Daily cashier closing report, POS reconciliation, and cash count.'}
        badgeText={!validating && !(invalid && !officialName) ? activeBranchName : (invalid && !officialName ? t.branch.local : undefined)}
        badgeLoading={validating}
        lukeLoading={lukeLoading}
        lukeLoadingText={t.header.loading}
        actions={
          <>
            {!isReadOnly && (
              <Button
                variant={showNotes ? 'primary' : 'secondary-dark'}
                size="md"
                icon={ChatBubbleOvalLeftEllipsisIcon}
                onClick={() => setShowNotes(x => !x)}
                className="relative p-0 w-10 h-10 rounded-lg flex items-center justify-center"
                title={language === 'vi' ? 'Ý kiến đóng góp' : 'Comments & Notes'}
              >
                {!!(header.notes && header.notes.trim()) && (
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-blue-600 border-2 border-white" />
                )}
              </Button>
            )}

            <Button
              variant={isReadOnly ? 'primary' : 'secondary-dark'}
              size="md"
              icon={ArrowDownTrayIcon}
              onClick={exportPDF}
              className="rounded-lg font-medium"
            >
              {language === 'vi' ? 'Xuất' : 'Export'}
            </Button>

            {!isReadOnly && header.dateStr >= '2026-07-12' && (
              <Button
                variant="primary"
                size="md"
                icon={ArrowPathIcon}
                onClick={() => handleValidatePOS(false)}
                disabled={syncingPos}
                loading={syncingPos}
                className="rounded-lg font-medium"
              >
                {language === 'vi' ? 'Đồng bộ POS' : 'Sync POS'}
              </Button>
            )}
          </>
        }
      />

      {/* ─── Riga Sessione / Top Info Row ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3 pb-3 border-b border-slate-800/40 no-print">
        {/* Sinistra: Date, Branch, Created By compattati */}
        <div className="flex flex-wrap items-center gap-6 md:gap-8 min-w-0">
          {/* Date Selector */}
          <div
            onClick={() => {
              if (!isReadOnly && dateInputRef.current) {
                try {
                  dateInputRef.current.showPicker();
                } catch {}
              }
            }}
            className="flex items-center gap-3 min-w-0 relative cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-slate-800/40 border border-slate-700/50 flex items-center justify-center text-slate-300 flex-shrink-0 group-hover:bg-slate-700/60 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                {language === 'vi' ? 'NGÀY' : 'DATE'}
              </span>
              <span className="text-sm font-semibold text-white tracking-wide mt-1.5 leading-none flex items-center gap-1">
                {formatDateShort(header.dateStr) || 'N/A'}
                {!isReadOnly && (
                  <svg className="w-3 h-3 text-slate-400 group-hover:text-slate-200 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </span>
            </div>
            {!isReadOnly && (
              <input
                ref={dateInputRef}
                type="date"
                value={header.dateStr}
                onChange={e => setHeader(h => ({ ...h, dateStr: e.target.value }))}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer pointer-events-none"
              />
            )}
          </div>

          {/* Branch */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-800/40 border border-slate-700/50 flex items-center justify-center text-slate-300 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                {language === 'vi' ? 'CHI NHÁNH' : 'BRANCH'}
              </span>
              <span className="text-sm font-semibold text-white tracking-wide mt-1.5 leading-none truncate">
                {activeBranchName}
              </span>
            </div>
          </div>

          {/* Created By */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-800/40 border border-slate-700/50 flex items-center justify-center text-slate-300 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                {language === 'vi' ? 'NGƯỜI TẠO' : 'CREATED BY'}
              </span>
              <span className="text-sm font-semibold text-white tracking-wide mt-1.5 leading-none truncate">
                {header.cashier || 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Destra: Toggle Saved/Live */}
        {!!initialIdFromUrl && !pathname.includes('/monthly-reports') && (
          <div className="inline-flex items-center rounded-lg bg-slate-800 border border-white/10 p-1 text-xs h-10 flex-shrink-0">
            <button
              type="button"
              className={`px-3 h-full font-semibold rounded-md transition-all ${!liveMode
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-350 hover:text-white hover:bg-slate-700/50'
                }`}
              onClick={handleSavedClick}
            >
              {t.initialInfo.saved}
            </button>
            <button
              type="button"
              className={`px-3 h-full font-semibold rounded-md transition-all ${liveMode
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-350 hover:text-white hover:bg-slate-700/50'
                }`}
              onClick={handleLiveClick}
            >
              {t.initialInfo.live}
            </button>
          </div>
        )}
      </div>

      {/* ─── Sezione 1: Revenue Overview ─── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-5">
        {/* Header Block */}
        <div className="flex items-center gap-3 mb-5 border-b border-slate-100 pb-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
            <svg className="w-5.5 h-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-800 tracking-tight leading-none">
              {language === 'vi' ? 'Doanh Thu' : 'Revenue'}
            </h2>
            <span className="text-[11px] text-slate-400 font-bold block mt-1.5 leading-none">
              {language === 'vi' ? 'Tổng doanh thu ròng ghi nhận từ hệ thống POS' : 'Total net revenue recorded from the POS system'}
            </span>
          </div>
        </div>
        
        {!SHOW_REVENUE_STATS_BOX ? (
          <div className="flex flex-col items-center justify-center text-center py-1">
            {/* Net Revenue (POS) */}
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              {language === 'vi' ? 'DOANH THU RÒNG' : 'NET REVENUE'}
            </span>
            {header.dateStr >= '2026-07-12' ? (
              <span className="text-3xl font-black text-emerald-800 tabular-nums mt-0.5">
                {fmtLive(round(payments.revenue))} ₫
              </span>
            ) : (
              <div className="mt-1 flex justify-center">
                <NumFmt
                  value={round(payments.revenue)}
                  onChange={x => setPayments(p => ({ ...p, revenue: x }))}
                  disabled={isReadOnly}
                  className="w-40 font-black text-3xl text-emerald-800 border border-slate-200/80 hover:border-slate-355 focus:border-blue-500 focus:bg-white rounded-md px-2 py-0.5 bg-slate-50/50 disabled:bg-transparent disabled:border-transparent disabled:text-emerald-850 disabled:shadow-none transition-all text-center focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                />
              </div>
            )}

            {/* Divider Line */}
            <div className="w-full max-w-[200px] border-t border-slate-200/60 my-2.5" />

            {/* Gross Revenue & Discount */}
            <div className="flex items-center justify-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-slate-400 font-medium">
                  {language === 'vi' ? 'Doanh thu gộp:' : 'Gross Revenue:'}
                </span>
                <span className="font-bold text-slate-700 tabular-nums">
                  {fmtLive(round(payments.grossRevenue))} ₫
                </span>
              </div>

              <span className="text-slate-300 font-bold select-none">•</span>

              <div className="flex items-center gap-1">
                <span className="text-slate-400 font-medium">
                  {language === 'vi' ? 'Chiết khấu:' : 'Discounts:'}
                </span>
                <span className="font-bold text-red-600 tabular-nums">
                  -{fmtLive(round(payments.discount))} ₫
                </span>
              </div>
            </div>
          </div>
        ) : (
          (() => {
            const yesNet = yesterdayClosing ? yesterdayClosing.netRevenue : 0
            const netDiffVal = round(payments.revenue) - yesNet
            const netDiffPct = yesNet > 0 ? (netDiffVal / yesNet) * 100 : 0

            const lastWeekNet = revenueStats ? revenueStats.sameDayLastWeekNet : null
            const lastWeekDiffVal = lastWeekNet !== null ? round(payments.revenue) - lastWeekNet : null
            const lastWeekDiffPct = lastWeekNet && lastWeekNet > 0 ? (lastWeekDiffVal! / lastWeekNet) * 100 : null

            return (
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-6 items-center">
                {/* Left side: Net Revenue, Gross, Discount */}
                <div className="flex flex-col text-left py-1 pl-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                    {language === 'vi' ? 'DOANH THU RÒNG' : 'NET REVENUE'}
                  </span>
                  {header.dateStr >= '2026-07-12' ? (
                    <span className="text-[32px] font-black text-emerald-800 tabular-nums mt-1 leading-none">
                      {fmtLive(round(payments.revenue))} ₫
                    </span>
                  ) : (
                    <div className="mt-1">
                      <NumFmt
                        value={round(payments.revenue)}
                        onChange={x => setPayments(p => ({ ...p, revenue: x }))}
                        disabled={isReadOnly}
                        className="w-40 font-black text-[32px] text-emerald-800 border border-slate-200/80 hover:border-slate-355 focus:border-blue-500 focus:bg-white rounded-md px-2 py-0.5 bg-slate-50/50 disabled:bg-transparent disabled:border-transparent disabled:text-emerald-850 disabled:shadow-none transition-all focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs text-left"
                      />
                    </div>
                  )}
                  
                  <div className="flex flex-col gap-1.5 mt-3.5 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 font-medium">
                        {language === 'vi' ? 'Doanh thu gộp:' : 'Gross Revenue:'}
                      </span>
                      <span className="font-bold text-slate-700 tabular-nums">
                        {fmtLive(round(payments.grossRevenue))} ₫
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 font-medium">
                        {language === 'vi' ? 'Chiết khấu:' : 'Discounts:'}
                      </span>
                      <span className="font-bold text-rose-600 tabular-nums">
                        -{fmtLive(round(payments.discount))} ₫
                      </span>
                    </div>
                  </div>
                </div>

                {/* Vertical Divider */}
                <div className="hidden md:block w-px bg-slate-100 self-stretch my-1" />

                {/* Right side: Statistics Box (Explicit List Layout) */}
                <div className="flex flex-col gap-2.5 text-xs text-slate-600 w-full pl-0 md:pl-2 bg-slate-50/50 rounded-xl p-3.5 border border-slate-100/60 shadow-3xs">
                  <div className="flex items-center gap-1.5 mb-0.5 border-b border-slate-200/50 pb-1.5">
                    {/* Trending up/Chart icon */}
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                      {language === 'vi' ? 'THỐNG KÊ DOANH THU' : 'REVENUE STATISTICS'}
                    </span>
                  </div>
                  
                  {/* 1. Delta Yesterday */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">{language === 'vi' ? 'So với hôm qua:' : 'vs. Yesterday:'}</span>
                    {yesterdayClosing ? (
                      <span className={`font-bold tabular-nums flex items-center gap-1 ${netDiffVal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {netDiffVal >= 0 ? '▲' : '▼'} {netDiffPct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-slate-355 italic">{language === 'vi' ? 'Không có dữ liệu' : 'No data'}</span>
                    )}
                  </div>

                  {/* 2. Delta Same Day Last Week */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">{language === 'vi' ? 'So So với tuần trước:' : 'vs. Same day last week:'}</span>
                    {revenueStats && lastWeekNet !== null && lastWeekDiffVal !== null && lastWeekDiffPct !== null ? (
                      <span className={`font-bold tabular-nums flex items-center gap-1 ${lastWeekDiffVal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {lastWeekDiffVal >= 0 ? '▲' : '▼'} {lastWeekDiffPct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-slate-355 italic">{language === 'vi' ? 'Không có dữ liệu' : 'No data'}</span>
                    )}
                  </div>

                  {/* 3. Weekly Rank */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">{language === 'vi' ? 'Xếp hạng tuần:' : 'Weekly rank:'}</span>
                    {weeklyRankInfo ? (
                      <span className="font-bold text-slate-700">
                        {language === 'vi' 
                          ? `Hạng ${weeklyRankInfo.rank} / ${weeklyRankInfo.total}` 
                          : `${ordinal(weeklyRankInfo.rank)} of ${weeklyRankInfo.total}`}
                      </span>
                    ) : (
                      <span className="text-slate-355 italic">{language === 'vi' ? 'Đang tính...' : 'Calculating...'}</span>
                    )}
                  </div>

                  {/* 4. Store Rank */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">{language === 'vi' ? 'Hạng chi nhánh trong ngày:' : 'Store rank of the day:'}</span>
                    {storeRankInfo ? (
                      <span className="font-bold text-slate-700">
                        {language === 'vi' 
                          ? `Hạng ${storeRankInfo.rank} / ${storeRankInfo.total}` 
                          : `${ordinal(storeRankInfo.rank)} of ${storeRankInfo.total}`}
                      </span>
                    ) : (
                      <span className="text-slate-355 italic">{language === 'vi' ? 'Đang tính...' : 'Calculating...'}</span>
                    )}
                  </div>
                </div>

                {/* Division Line */}
                <div className="col-span-full border-t border-slate-100 mt-1 mb-0.5" />

                {/* Bottom section: Revenue Breakdown & Guest stats (Ordered & sized logically) */}
                <div className="col-span-full flex flex-row flex-wrap gap-2 justify-between items-stretch">
                  
                  {/* 1. Guests (Count, small min-w) */}
                  <div className="flex-1 min-w-[70px] bg-slate-50/25 border border-slate-100 rounded-lg py-1 px-1.5 flex items-center gap-1">
                    <Users className="w-3 h-3 text-blue-500/80 flex-shrink-0" />
                    <div>
                      <span className="text-[7.5px] font-semibold text-slate-400 block uppercase tracking-wider leading-none">
                        {language === 'vi' ? 'KHÁCH' : 'GUESTS'}
                      </span>
                      <span className="text-[11px] font-bold text-slate-600 tabular-nums mt-0.5 block leading-none">
                        {payments.posDiningGuests || 0}
                      </span>
                    </div>
                  </div>

                  {/* 2. Avg Dining (Revenue/Average, large min-w) */}
                  <div className="flex-1 min-w-[120px] bg-slate-50/40 border border-slate-100/80 rounded-xl py-1.5 px-2 flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                    <div>
                      <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-wider leading-none">
                        {language === 'vi' ? 'TB DINING' : 'AVG DINING'}
                      </span>
                      <span className="text-xs font-bold text-slate-700 tabular-nums mt-0.5 block leading-none">
                        {fmtLive(payments.posDiningGuests ? round((payments.posDiningRevenue || 0) / payments.posDiningGuests) : 0)} ₫
                      </span>
                    </div>
                  </div>

                  {/* 3. Dining Revenue (Revenue, large min-w) */}
                  <div className="flex-1 min-w-[120px] bg-slate-50/40 border border-slate-100/80 rounded-xl py-1.5 px-2 flex items-center gap-1.5">
                    <Utensils className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <div>
                      <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-wider leading-none">
                        {language === 'vi' ? 'DT TẠI CHỖ' : 'DINING REV'}
                      </span>
                      <span className="text-xs font-bold text-slate-700 tabular-nums mt-0.5 block leading-none">
                        {fmtLive(round(payments.posDiningRevenue || 0))} ₫
                      </span>
                    </div>
                  </div>

                  {/* 4. Total Orders (Count, small min-w) */}
                  <div className="flex-1 min-w-[70px] bg-slate-50/25 border border-slate-100 rounded-lg py-1 px-1.5 flex items-center gap-1">
                    <ClipboardList className="w-3 h-3 text-indigo-500/80 flex-shrink-0" />
                    <div>
                      <span className="text-[7.5px] font-semibold text-slate-400 block uppercase tracking-wider leading-none">
                        {language === 'vi' ? 'TỔNG ĐƠN' : 'ORDERS'}
                      </span>
                      <span className="text-[11px] font-bold text-slate-600 tabular-nums mt-0.5 block leading-none">
                        {payments.posOrdersCount || 0}
                      </span>
                    </div>
                  </div>

                  {/* 5. To-Go Orders (Count, small min-w) */}
                  <div className="flex-1 min-w-[70px] bg-slate-50/25 border border-slate-100 rounded-lg py-1 px-1.5 flex items-center gap-1">
                    <ShoppingBag className="w-3 h-3 text-orange-500/80 flex-shrink-0" />
                    <div>
                      <span className="text-[7.5px] font-semibold text-slate-400 block uppercase tracking-wider leading-none">
                        {language === 'vi' ? 'MANG VỀ' : 'TO-GO'}
                      </span>
                      <span className="text-[11px] font-bold text-slate-600 tabular-nums mt-0.5 block leading-none">
                        {payments.posTakeawayCount || 0}
                      </span>
                    </div>
                  </div>

                  {/* 6. To-Go Revenue (Revenue, large min-w) */}
                  <div className="flex-1 min-w-[120px] bg-slate-50/40 border border-slate-100/80 rounded-xl py-1.5 px-2 flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                    <div>
                      <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-wider leading-none">
                        {language === 'vi' ? 'DT MANG VỀ' : 'TO-GO REV'}
                      </span>
                      <span className="text-xs font-bold text-slate-700 tabular-nums mt-0.5 block leading-none">
                        {fmtLive(round(payments.posDeliveryTakeawayRevenue || 0))} ₫
                      </span>
                    </div>
                  </div>

                  {/* 7. Avg Order (Revenue/Average, large min-w) */}
                  <div className="flex-1 min-w-[120px] bg-slate-50/40 border border-slate-100/80 rounded-xl py-1.5 px-2 flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                    <div>
                      <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-wider leading-none">
                        {language === 'vi' ? 'TB ĐƠN' : 'AVG ORDER'}
                      </span>
                      <span className="text-xs font-bold text-slate-700 tabular-nums mt-0.5 block leading-none">
                        {fmtLive(payments.posOrdersCount ? round(payments.revenue! / payments.posOrdersCount) : 0)} ₫
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()
        )}
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
              {language === 'vi' ? 'Tổng quan Thanh toán' : 'Payment Overview'}
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
                barColor="bg-blue-600"
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
                barColor="bg-indigo-600"
                percent={totalCollectedChart > 0 ? (bankVal / totalCollectedChart) * 100 : 0}
              />
            </div>

            <div className="flex-grow flex flex-col min-h-0">
              <div className="flex items-center mb-2 flex-shrink-0">
                <h3 className="text-[10px] font-bold text-slate-700 uppercase tracking-widest">
                  {language === 'vi' ? 'ĐỐI TÁC GIAO HÀNG' : 'THIRD-PARTY DELIVERY'}
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
                      barColor={brand.barColor}
                      percent={totalCollectedChart > 0 ? (item.amount / totalCollectedChart) * 100 : 0}
                    />
                  )
                })}
              </div>
            </div>
          </div>

          {/* Column 2: Cash Out & Drawer Adjustments */}
          <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-1">
              {language === 'vi' ? 'ĐIỀU CHỈNH THU NGÂN' : 'CASHIER ADJUSTMENTS'}
            </h3>

            <AdjustmentRow
              icon={
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              }
              bgIcon="bg-red-50 text-red-500"
              label={t.initialInfo.cashOut}
              value={round(payments.cashOut)}
              textClass="text-slate-800"
            />

            {header.dateStr >= '2026-07-12' && typeof payments.posUnpaid === 'number' && payments.posUnpaid !== round(payments.unpaid) ? (
              <div className="flex items-center justify-between p-3 rounded-xl border border-amber-200 bg-amber-50/50 shadow-2xs w-full min-h-[54px]">
                <div className="flex items-center gap-2.5 min-w-0 flex-grow">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center flex-shrink-0">
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
                <span className="text-[11px] font-bold text-amber-600 tabular-nums pl-2 flex-shrink-0">
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
                bgIcon="bg-amber-50 text-amber-500"
                label={t.initialInfo.unpaid}
                value={round(payments.unpaid)}
                textClass="text-amber-600 font-bold"
              />
            )}

            <AdjustmentRow
              icon={
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              bgIcon="bg-emerald-50 text-emerald-500"
              label={language === 'vi' ? 'Hoàn trả tín dụng' : 'Repayments credits'}
              subtitle={language === 'vi' ? '(tiền mặt/thẻ)' : '(cash/card)'}
              value={round(payments.repaymentsCashCard)}
              textClass="text-emerald-600 font-bold"
            />

            <AdjustmentRow
              icon={
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              bgIcon="bg-amber-50 text-amber-500"
              label={language === 'vi' ? 'Tiền gửi/Số dư' : 'Deposits/Balances'}
              subtitle={language === 'vi' ? '(tiền mặt/thẻ)' : '(cash/card)'}
              value={round(deposits)}
              textClass="text-amber-600 font-bold"
            />

            {/* expected net cash drawer box (bottom right) */}
            <div className="mt-4 p-4 rounded-2xl bg-white border border-slate-200 flex items-center justify-between shadow-2xs">
              <div className="flex flex-col">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                  {language === 'vi' ? 'TIỀN MẶT THỰC THU' : 'NET CASH'}
                </span>
                <span className="text-2xl font-black text-slate-900 mt-1.5 tabular-nums">
                  {fmtLive(netVal)} ₫
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white flex-shrink-0 shadow-xs">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7H4M20 7a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2m16 0V5a2 2 0 00-2-2H6a2 2 0 00-2 2v2m11 5h-4" />
                </svg>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Comments & Notes block (only visible if showNotes is true) */}
      {showNotes && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm mb-6 no-print">
          <div className="flex items-center gap-2 mb-3">
            <ChatBubbleOvalLeftEllipsisIcon className="w-5 h-5 text-blue-600" />
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {language === 'vi' ? 'Ý kiến đóng góp' : 'Comments & Notes'}
            </label>
          </div>
          <textarea
            value={header.notes || ''}
            onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))}
            disabled={isReadOnly}
            className="w-full border border-slate-200 hover:border-slate-350 rounded-xl px-4 py-3 min-h-[80px] bg-slate-50/30 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 resize-none transition-all shadow-2xs"
            placeholder={t.initialInfo.commentPlaceholder}
          />
        </div>
      )}

      {/* ─── Sezione 2: Cash Count ─── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm mb-6">
        <div className="flex items-center justify-between gap-3 mb-6 border-b border-slate-100 pb-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {/* Back banknote */}
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2" />
                {/* Front banknote */}
                <rect x="7" y="9" width="14" height="10" rx="2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                {/* Inner circle of front banknote */}
                <circle cx="14" cy="14" r="2" strokeWidth={2} />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800 tracking-tight leading-none">
                {language === 'vi' ? 'Kiểm Kê Tiền Mặt' : 'Cash Count'}
              </h2>
              <span className="text-[11px] text-slate-400 font-bold block mt-1.5 leading-none">
                {language === 'vi' ? 'Kiểm kê số tiền mặt có trong két' : 'Count the cash in drawer'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2.5 no-print">
            <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-50/60 text-blue-700 border border-blue-100/80 flex items-center gap-1.5 shadow-3xs">
              {language === 'vi' ? 'Tiêu chuẩn két' : 'Target'}: {formatVND(floatTarget)} ₫
            </span>
            {!isReadOnly && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearCounts}
                  className="text-[11px] font-bold text-slate-500 hover:bg-red-50 hover:text-red-650 hover:border-red-200 transition-colors"
                >
                  {language === 'vi' ? 'Xóa bảng' : 'Clear'}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={doSuggest}
                  className="text-[11px] font-bold"
                >
                  {language === 'vi' ? 'Gợi ý chia ca' : 'Suggest plan'}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Bill table */}
        <div className="border border-slate-200/80 rounded-xl overflow-hidden shadow-2xs mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <th className="text-left px-4 py-3 w-[25%]">{language === 'vi' ? 'Mệnh giá' : 'Denomination'}</th>
                <th className="text-right px-3 py-3 w-[18%]">{language === 'vi' ? 'Trong két' : 'In Drawer'}</th>
                <th className="text-right px-3 py-3 w-[18%]">{language === 'vi' ? 'Rút ra' : 'To Take'}</th>
                <th className="text-right px-3 py-3 w-[18%]">{language === 'vi' ? 'Còn lại' : 'Remain'}</th>
                <th className="text-right px-4 py-3 w-[21%]">{language === 'vi' ? 'Thành tiền' : 'Subtotal'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {DENOMS.map(({ key, face }, idx) => {
                const have = cash[key] || 0
                const keep = Math.max(0, have - (effectivePlan[key] || 0))
                const parentTake = planActive ? (floatPlan[key] || 0) : 0
                const showPlaceholder = planActive && !edited[key] && parentTake === (effectivePlan[key] || 0)
                const placeholder = planActive ? String(effectivePlan[key] || 0) : undefined

                return (
                  <tr 
                    key={key} 
                    className={`transition-colors ${idx % 2 === 1 ? 'bg-slate-50/80 hover:bg-slate-100/70' : 'bg-white hover:bg-slate-50/80'}`}
                  >
                    {/* Denom */}
                    <td className="px-4 py-3 flex items-center gap-2.5">
                      <BanknoteIcon denomKey={key} />
                      <span className="text-xs font-bold text-slate-800">{t.cashCount.denoms[key]}</span>
                    </td>

                    {/* In Drawer Quantity */}
                    <td className="px-3 py-2">
                      <StepperInput
                        value={have}
                        onChange={val => changeCash(key, val)}
                        disabled={isReadOnly}
                        placeholder="0"
                      />
                    </td>

                    {/* To Take Quantity */}
                    <td className="px-3 py-2">
                      <StepperInput
                        value={showPlaceholder ? 0 : (planActive ? parentTake : 0)}
                        onChange={val => changeTake(key, val)}
                        disabled={isReadOnly}
                        placeholder={placeholder || '0'}
                      />
                    </td>

                    {/* Remain Quantity (In Drawer - To Take) */}
                    <td className="px-3 py-2">
                      <div className="h-9 border border-slate-100 bg-slate-50/30 text-slate-700 rounded-lg px-3 flex items-center justify-end text-xs font-bold tabular-nums">
                        {keep}
                      </div>
                    </td>

                    {/* Subtotal (Remain * Face) */}
                    <td className="text-right px-4 py-3 text-xs font-black text-slate-900 tabular-nums">
                      {formatVND(keep * face)} ₫
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200 text-xs font-bold text-slate-900">
                <td className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {language === 'vi' ? 'Tổng cộng' : 'Total'}
                </td>
                <td className="text-right px-3 py-3.5 tabular-nums">{formatVND(sumValue(cash))} ₫</td>
                <td className="text-right px-3 py-3.5 text-blue-600 tabular-nums">{formatVND(totalToTake)} ₫</td>
                <td className="text-right px-3 py-3.5 tabular-nums">{formatVND(sumValue(cash) - totalToTake)} ₫</td>
                <td className="text-right px-4 py-3.5 tabular-nums font-black">{formatVND(totalRemain)} ₫</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Float Setup Mismatch warning */}
        {Math.abs(totalRemain - floatTarget) > 999 && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start gap-3 mb-6 shadow-2xs animate-fade-in">
            <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-xs text-amber-800 leading-relaxed">
              <strong className="font-bold text-amber-900 block mb-0.5">{t.cashCount.floatMismatchTitle}</strong>
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
              color: cashDiff === 0 ? 'text-slate-800 font-black' : cashDiff > 0 ? 'text-emerald-700 font-black' : 'text-red-600 font-black' 
            },
            { label: language === 'vi' ? 'Rút ra' : 'To take', value: formatVND(totalToTake) + ' ₫' },
            { label: language === 'vi' ? 'Mục tiêu két' : 'Target float', value: formatVND(floatTarget) + ' ₫' },
          ].map((m, i) => (
            <div key={i} className="bg-white border border-slate-200/80 p-3.5 rounded-xl shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between min-h-[72px]">
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 leading-tight">{m.label}</span>
              <span className={`text-sm font-bold tabular-nums block mt-2 leading-none ${m.color || 'text-slate-700'}`}>{m.value}</span>
            </div>
          ))}
        </div>
      </div>



      {/* ─── Sezione 4: Summary ─── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm mb-6">
        {/* Header Block */}
        <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
            <svg className="w-5.5 h-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-800 tracking-tight leading-none">
              {language === 'vi' ? 'Bản Tóm Tắt' : 'Summary'}
            </h2>
            <span className="text-[11px] text-slate-400 font-bold block mt-1.5 leading-none">
              {language === 'vi' ? 'Báo cáo tài chính và đối chiếu cuối cùng' : 'Financial report and final reconciliation'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 text-xs">
          {/* Financial summary (Left) */}
          <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-1">
              {language === 'vi' ? 'DOANH THU & ĐỐI CHIẾU' : 'REVENUE & DRAWER EXPECTED'}
            </h3>

            <div className="bg-slate-50/40 border border-slate-200/60 rounded-xl px-4 py-1.5 space-y-0.5 shadow-2xs">
              <SummaryRow
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                bgIcon="bg-emerald-50 text-emerald-600"
                label={t.summary.labels.revenue}
                value={payments.grossRevenue ?? 0}
              />

              <SummaryRow
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                }
                bgIcon="bg-red-50 text-red-500"
                label={language === 'vi' ? 'Chiết khấu' : 'Discounts'}
                value={-(payments.discount ?? 0)}
                textClass="text-red-600 font-bold"
              />

              <SummaryRow
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                bgIcon="bg-emerald-100 text-emerald-700"
                label={language === 'vi' ? 'Doanh thu thuần' : 'Net Revenue'}
                value={payments.revenue ?? 0}
                textClass="text-emerald-800 font-black text-sm"
                labelClass="text-slate-900 font-extrabold"
                rowClass="bg-emerald-50/65 -mx-4 px-4 py-3 rounded-lg border border-emerald-100/50 my-1 shadow-3xs"
              />

              <SummaryRow
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                }
                bgIcon="bg-sky-50 text-sky-600"
                label={t.summary.labels.expectedDrawer}
                value={expectedDrawerCash}
              />

              <SummaryRow
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                bgIcon="bg-slate-50 text-slate-600"
                label={language === 'vi' ? 'Tiền mặt thực tế đếm' : 'Cash counted'}
                value={countedCash}
              />

              <SummaryRow
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                }
                bgIcon="bg-stone-50 text-stone-600"
                label={t.summary.labels.variance}
                value={cashDiff}
                textClass={cashDiff === 0 ? 'text-slate-800' : cashDiff > 0 ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}
                isLast={true}
              />
            </div>
          </div>

          {/* Breakdown and adjustments (Right) */}
          <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-1">
              {language === 'vi' ? 'ĐIỀU CHỈNH KÉT & BỔ SUNG' : 'BREAKDOWN & ADJUSTMENTS'}
            </h3>

            <div className="bg-slate-50/40 border border-slate-200/60 rounded-xl px-4 py-1.5 space-y-0.5 shadow-2xs">
              <SummaryRow
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                }
                bgIcon="bg-violet-50 text-violet-600"
                label={t.summary.labels.nonCashTotal}
                value={nonCashTotal}
              />

              <SummaryRow
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                }
                bgIcon="bg-teal-50 text-teal-600"
                label={language === 'vi' ? 'Tiền mặt doanh thu' : 'Total cash'}
                value={totalCashCollected}
              />

              <SummaryRow
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                  </svg>
                }
                bgIcon="bg-amber-50 text-amber-500"
                label={t.summary.labels.adjustmentsTotal}
                value={adjustmentsTotal}
              />

              <SummaryRow
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                }
                bgIcon="bg-stone-50 text-stone-600"
                label={language === 'vi' ? 'Tiêu chuẩn két' : 'Float target'}
                value={floatTarget}
                textClass="text-slate-700"
              />

              <SummaryRow
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                }
                bgIcon="bg-indigo-50 text-indigo-600"
                label={language === 'vi' ? 'Tiền cần lấy' : 'To take'}
                value={totalToTake}
                textClass="text-blue-600 font-bold"
                isLast={true}
              />
            </div>
          </div>
        </div>

        {/* Report Info Footer inside Summary Card */}
        <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="bg-slate-50/40 border border-slate-200/60 rounded-xl p-3 flex flex-col justify-between shadow-2xs">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{language === 'vi' ? 'Ngày' : 'Date'}</span>
            <span className="font-bold text-slate-700 mt-1 block">{formatDateFull(header.dateStr, language)}</span>
          </div>
          <div className="bg-slate-50/40 border border-slate-200/60 rounded-xl p-3 flex flex-col justify-between shadow-2xs">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{language === 'vi' ? 'Chi nhánh' : 'Branch'}</span>
            <span className="font-bold text-slate-700 mt-1 block">{activeBranchName || 'N/A'}</span>
          </div>
          <div className="bg-slate-50/40 border border-slate-200/60 rounded-xl p-3 flex flex-col justify-between shadow-2xs">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{language === 'vi' ? 'Người chốt' : 'Closed by'}</span>
            <span className="font-bold text-slate-700 mt-1 block truncate">
              {lastEditorName
                ? `${lastEditorName}${lastSavedAtUI ? ` - ${new Date(lastSavedAtUI).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`
                : '—'}
            </span>
          </div>
        </div>
      </div>


      {/* ─── Floating Save Bar (Full Width) ─── */}
      {displayDirty && !isReadOnly && (
        <div className="no-print fixed bottom-4 left-0 right-0 pointer-events-none z-[70] flex justify-center animate-fade-in">
          <div
            className="pointer-events-auto bg-white/80 backdrop-blur-md border border-slate-200/80 shadow-2xl rounded-2xl px-6 py-3.5 flex items-center justify-between gap-4 transition-all duration-300"
            style={{
              width: 'min(72rem, calc(100vw - 2rem))',
              maxWidth: 'calc(100vw - (var(--leftnav-w, 56px) * 2) - 2rem)',
            }}
          >
            <div className="flex items-center gap-3">
              {displayDirty ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-800">{t.saveBar.dirty}</span>
                    <span className="text-[10px] text-slate-500 font-semibold">{t.saveBar.shortcut}</span>
                  </div>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-800">
                      {language === 'vi' ? 'Đã lưu tất cả thay đổi' : 'All changes saved'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold">
                      {lastSavedAtUI 
                        ? (language === 'vi' 
                            ? `Đã chốt lúc ${new Date(lastSavedAtUI).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` 
                            : `Saved at ${new Date(lastSavedAtUI).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`) 
                        : (language === 'vi' ? 'Đã đồng bộ' : 'Synced')}
                    </span>
                  </div>
                </>
              )}
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="primary"
                size="md"
                icon={CheckIcon}
                onClick={handleSaveWorkflow}
                disabled={syncingPos || lukeSaving || !displayDirty}
                loading={syncingPos || lukeSaving}
                className="rounded-lg font-bold"
              >
                {language === 'vi' ? 'Lưu' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Custom Validation Feedback Popup (Modal) ─── */}
      {validationPopup && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-[100] no-print animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 max-w-sm w-full mx-4 flex flex-col items-center text-center">
            {validationPopup.type === 'success' ? (
              <>
                {/* Green Check Icon with Ripple */}
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 relative">
                  <div className="absolute inset-0 rounded-full bg-emerald-100/50 animate-ping" />
                  <svg className="w-8 h-8 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-base font-black text-slate-800 tracking-tight">
                  {validationPopup.title}
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
                  {validationPopup.message}
                </p>
              </>
            ) : validationPopup.type === 'info-orange' ? (
              <>
                {/* Yellow/Orange Exclamation Icon */}
                <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-4 relative">
                  <div className="absolute inset-0 rounded-full bg-amber-100/50 animate-pulse" />
                  <svg className="w-8 h-8 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-base font-black text-slate-800 tracking-tight">
                  {validationPopup.title}
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
                  {validationPopup.message}
                </p>
                <button
                  type="button"
                  onClick={() => setValidationPopup(null)}
                  className="mt-5 w-full h-9 rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold transition-colors shadow-sm focus:outline-none"
                >
                  {language === 'vi' ? 'Đóng' : 'Close'}
                </button>
              </>
            ) : (
              <>
                {/* Red X Icon */}
                <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-4 relative">
                  <div className="absolute inset-0 rounded-full bg-rose-100/50 animate-pulse" />
                  <svg className="w-8 h-8 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h3 className="text-base font-black text-slate-800 tracking-tight">
                  {validationPopup.title}
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
                  {validationPopup.message}
                </p>
                <button
                  type="button"
                  onClick={() => setValidationPopup(null)}
                  className="mt-5 w-full h-9 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold transition-colors shadow-sm focus:outline-none"
                >
                  {language === 'vi' ? 'Đóng' : 'Close'}
                </button>
              </>
            )}
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
