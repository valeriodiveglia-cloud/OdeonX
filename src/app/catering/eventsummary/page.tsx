// src/app/catering/eventsummary/page.tsx
'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeftIcon,
  PencilSquareIcon,
  DocumentArrowDownIcon,
  PlusIcon,
  XMarkIcon,
  ChevronLeftIcon,
} from '@heroicons/react/24/outline'

import { useEventCalc } from '@/app/catering/_state/EventCalcProvider'
import { useSettings } from '@/contexts/SettingsContext'

// i18n
import { useECT } from '@/app/catering/_i18n'

// Event Info
import { useEventHeader } from '@/app/catering/_data/useEventHeader'

// Bundles & Menu
import { useEventBundles } from '@/app/catering/_data/useEventBundles'
import useFinalDishes from '@/app/catering/_data/useFinalDishes'
import useMaterials from '@/app/catering/_data/useMaterials'
import { type BundleConfig } from '@/app/catering/_settings/bundleConfig'

// Equipment
import useEventEquipmentRows from '@/app/catering/_data/useEventEquipmentRows'
import useEquipment from '@/app/catering/_data/useEventEquipment'

// Company assets + Extra fee
import { useEventCompanyAssetRows } from '@/app/catering/_data/useEventCompanyAssetRows'
import { useEventExtraFeeRows } from '@/app/catering/_data/useEventExtraFeeRows'

// Staff
import useStaffRows from '@/app/catering/_data/useEventStaffRows'
import useEventStaffSettings from '@/app/catering/_data/useEventStaffSettings'

// Transport
import useEventTransportRows from '@/app/catering/_data/useEventTransportRows'
import { useTransportSettings } from '@/app/catering/_data/useEventTransportSettings'

// Discounts
import useEventDiscountRows from '@/app/catering/_data/useEventDiscountRows'

// Supabase
import { supabase } from '@/lib/supabase_shim'

/* ──────────────────────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────────────────────── */
const LS_BUNDLE_SETTINGS_KEY = 'eventcalc.bundleSettings'
const LS_DISCOUNT_META_KEY = 'eventcalc.discounts.pctmeta'

// === Extra fee CHIP meta (same source as the chip) ===
const LS_EXTRAFEE_META_KEY = 'eventcalc.extrafee.pctmeta'
type ExtraFeePctBase =
  | 'bundles'
  | 'equipment'
  | 'staff'
  | 'transport'
  | 'assets'
  | 'total_excl_extrafee'
  | 'total_incl_extrafee'
type ExtraFeeMeta = {
  advMode: 'cost' | 'percentage'
  pctValue: string
  pctBase: ExtraFeePctBase
}
type ExtraFeeMetaMap = Record<string, ExtraFeeMeta>
function loadExtraFeeMeta(): ExtraFeeMetaMap {
  try {
    const raw =
      typeof window !== 'undefined'
        ? localStorage.getItem(LS_EXTRAFEE_META_KEY)
        : null
    return raw ? (JSON.parse(raw) as ExtraFeeMetaMap) : {}
  } catch {
    return {}
  }
}
function scopeLabelExtraLS(scope?: ExtraFeePctBase) {
  switch (scope) {
    case 'bundles':
      return 'BUNDLES'
    case 'equipment':
      return 'EQUIPMENT'
    case 'staff':
      return 'STAFF'
    case 'transport':
      return 'TRANSPORT'
    case 'assets':
      return 'COMPANY ASSETS'
    case 'total_excl_extrafee':
      return 'TOTALS (excl. fees)'
    case 'total_incl_extrafee':
      return 'TOTALS (incl. fees)'
    default:
      return 'TOTALS'
  }
}

function safeParseJSON<T = any>(s: string | null): T | null {
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

function useFormatters() {
  const { language, currency } = useSettings()
  const loc = language === 'vi' ? 'vi-VN' : 'en-US'
  const num = useMemo(() => new Intl.NumberFormat(loc), [loc])
  const cur = useMemo(
    () => new Intl.NumberFormat(loc, { style: 'currency', currency }),
    [loc, currency]
  )
  const fmtN = (n: number | null | undefined) =>
    n == null || Number.isNaN(n) ? '-' : num.format(Math.round(n))
  const fmtC = (n: number | null | undefined) =>
    n == null || Number.isNaN(n) ? '-' : cur.format(Math.round(n))
  return { fmtN, fmtC }
}

function onlyHHmm(v?: string | null): string {
  if (!v) return '—'
  const s = String(v)
  const m = s.match(/(\d{1,2}):(\d{2})/)
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`
  const t = Date.parse(s)
  if (Number.isFinite(t)) {
    const d = new Date(t)
    return `${String(d.getHours()).padStart(2, '0')}:${String(
      d.getMinutes()
    ).padStart(2, '0')}`
  }
  return '—'
}

function formatDateDMY(v?: string | Date | null): string {
  if (!v) return '—'

  if (typeof v === 'string') {
    const s = v.trim()
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
    if (m) {
      const d = m[1].padStart(2, '0')
      const mo = m[2].padStart(2, '0')
      let y = m[3]
      if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y
      return `${d}/${mo}/${y}`
    }
  }

  const t = new Date(v as any)
  if (Number.isNaN(t.getTime())) return String(v) || '—'
  const d = String(t.getDate()).padStart(2, '0')
  const mo = String(t.getMonth() + 1).padStart(2, '0')
  const y = t.getFullYear()
  return `${d}/${mo}/${y}`
}

function round2(x: number) {
  return Math.round(x * 100) / 100
}
function hoursBetweenISO(sa?: string | null, ea?: string | null) {
  if (!sa || !ea) return 0
  const s = new Date(sa).getTime()
  const e = new Date(ea).getTime()
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0
  let h = (e - s) / 3_600_000
  if (h < 0) h += 24
  return round2(Math.max(0, h))
}

/* percent helpers — DB-first */
function readPct(raw: any): number | null {
  const pnorm = typeof raw?.percentNorm === 'number' ? raw.percentNorm : null
  if (pnorm != null && Number.isFinite(pnorm))
    return Math.max(0, Math.min(0.9999, pnorm))
  let p: any = raw?.percent ?? raw?.percentage ?? raw?.rate ?? null
  if (p == null) return null
  const n = Number(p)
  if (!Number.isFinite(n)) return null
  if (n <= 1) return n >= 0 ? n : null
  if (n < 1000) return n / 100
  return null
}
function readPctStr(s?: string | null): number | null {
  if (s == null) return null
  const t = String(s).replace(',', '.').replace(/[^\d.\-]/g, '').trim()
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  if (n <= 1) return n >= 0 ? n : null
  if (n < 1000) return n / 100
  return null
}
function normScope(
  raw: any
):
  | 'total'
  | 'total_incl'
  | 'total_excl'
  | 'bundles'
  | 'equipment'
  | 'staff'
  | 'transport'
  | 'assets' {
  const k = String(raw ?? '').toLowerCase()
  const map: Record<string, any> = {
    total: 'total',
    grand: 'total',
    grand_total: 'total',
    price: 'total',
    total_incl: 'total_incl',
    total_excl: 'total_excl',
    bundles: 'bundles',
    bundle: 'bundles',
    equipment: 'equipment',
    staff: 'staff',
    transport: 'transport',
    assets: 'assets',
    asset: 'assets',
  }
  return map[k] ?? 'total'
}

/* META LS (only Discounts) */
type PctScopeLS =
  | 'bundles_all'
  | `bundle:${string}`
  | 'equipment'
  | 'staff'
  | 'transport'
  | 'assets'
  | 'total_excl_extrafee'
  | 'total_incl_extrafee'
type PctMeta = { enabled: boolean; pctValue: string; scope: PctScopeLS }
type PctMetaMap = Record<string, PctMeta>

function loadPctMeta(key: string): PctMetaMap {
  try {
    const raw =
      typeof window !== 'undefined' ? localStorage.getItem(key) : null
    if (!raw) return {}
    const obj = JSON.parse(raw) as Record<string, any>
    const map: PctMetaMap = {}
    for (const [id, m] of Object.entries(obj)) {
      map[id] = {
        enabled: !!(m as any).enabled,
        pctValue:
          typeof (m as any).pctValue === 'string'
            ? (m as any).pctValue
            : '0',
        scope:
          ((m as any).scope as PctScopeLS) || 'total_incl_extrafee',
      }
    }
    return map
  } catch {
    return {}
  }
}
function loadPctMetaAny(keys: string[]): PctMetaMap {
  return keys.reduce(
    (acc, k) => ({ ...acc, ...loadPctMeta(k) }),
    {} as PctMetaMap
  )
}
function scopeLabelLS(scope?: PctScopeLS) {
  switch (scope) {
    case 'bundles_all':
      return 'TOTALS (bundles)'
    case 'equipment':
      return 'EQUIPMENT'
    case 'staff':
      return 'STAFF'
    case 'transport':
      return 'TRANSPORT'
    case 'assets':
      return 'COMPANY ASSETS'
    case 'total_excl_extrafee':
      return 'TOTALS (excl. extra fees)'
    case 'total_incl_extrafee':
      return 'TOTALS (incl. fees)'
    default:
      if (typeof scope === 'string' && scope.startsWith('bundle:'))
        return 'BUNDLE'
      return 'TOTALS'
  }
}
function scopeLabelDB(scope: any) {
  switch (scope) {
    case 'total':
    case 'total_incl':
      return 'TOTALS (incl. fees)'
    case 'total_excl':
      return 'TOTALS (excl. extra fees)'
    case 'bundles':
      return 'BUNDLES'
    case 'equipment':
      return 'EQUIPMENT'
    case 'staff':
      return 'STAFF'
    case 'transport':
      return 'TRANSPORT'
    case 'assets':
      return 'COMPANY ASSETS'
    default:
      return 'TOTALS'
  }
}
function fmtPctRaw(v: string | number): string {
  const t = String(v ?? '')
    .replace(',', '.')
    .replace(/[^\d.\-]/g, '')
    .trim()
  if (!t) return '0'
  const n = Number(t)
  if (!Number.isFinite(n)) return t
  return String(n).replace(/\.0+$/, '')
}

/* ▼▼ Payment utils ▼▼ */
function pickFirst<T = any>(...vals: T[]): T | null {
  for (const v of vals) {
    if (v !== undefined && v !== null && (typeof v === 'string' ? v.trim() !== '' : true)) return v
  }
  return null
}
function pctFromAny(v: any): number | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'number') return readPct({ percent: v })
  return readPctStr(String(v))
}
/* ▲▲ end utils ▲▲ */

/* 🔹 Payment: leggi meta runtime da LocalStorage (preciso) */
function usePaymentLS(eventId: string | null) {
  const [meta, setMeta] = React.useState<any | null>(null)

  useEffect(() => {
    if (!eventId) { setMeta(null); return }
    const key = `eventcalc.payment:${eventId}`

    const read = () => {
      try {
        const raw = localStorage.getItem(key)
        setMeta(raw ? JSON.parse(raw) : null)
      } catch { setMeta(null) }
    }

    read()

    const onStorage = (e: StorageEvent) => { if (e.key === key) read() }
    const onPayment = () => read()

    window.addEventListener('storage', onStorage)
    window.addEventListener('payment:changed', onPayment as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('payment:changed', onPayment as EventListener)
    }
  }, [eventId])

  return meta
}

/* >>> Paris Summary publisher (for Contract) <<< */
function publishParisSummary(eventId: string | null, payload: any) {
  if (!eventId) return
  try {
    localStorage.setItem(`paris:summary:${eventId}`, JSON.stringify(payload))
  } catch {}
  try {
    window.dispatchEvent(
      new CustomEvent('paris:summary', { detail: { eventId, payload } })
    )
  } catch {}
}

/* ──────────────────────────────────────────────────────────────────────────────
   Totals HTML + Label map + Placeholder (i18n-ready)
   ────────────────────────────────────────────────────────────────────────────── */

type LabelMap = Record<string, string>
const LS_TOTALS_LABEL_MAP = 'eventcalc.totalsLabelMap'

// Default EN labels (compat DOCX; la UI può rimapparli via LS)
const DEFAULT_TOTALS_LABEL_MAP: LabelMap = {
  Bundles: 'Bundles',
  Equipment: 'Equipment',
  Staff: 'Staff',
  Transport: 'Transport',
  'Company assets': 'Company assets',
  'Extra fee': 'Extra fee',
}

/**
 * Legge SOLO gli override dell’utente da LS.
 * Niente default qui: i default vengono applicati in i18nDefaultTotalsLabelMap.
 */
function loadTotalsLabelMap(): LabelMap {
  try {
    const raw =
      typeof window !== 'undefined'
        ? localStorage.getItem(LS_TOTALS_LABEL_MAP)
        : null
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as LabelMap) : {}
  } catch {
    return {}
  }
}

/** Default per lingua (base su cui applicare eventuali override) */
function i18nDefaultTotalsLabelMap(lang: string): LabelMap {
  if (lang === 'vi') {
    return {
      Bundles: 'Gói',
      Equipment: 'Thiết bị',
      Staff: 'Nhân sự',
      Transport: 'Vận chuyển',
      'Company assets': 'Tài sản công ty',
      'Extra fee': 'Phí bổ sung',
    }
  }
  return { ...DEFAULT_TOTALS_LABEL_MAP }
}

/**
 * Combina i default i18n con gli override utente.
 * Ignora gli override “banali” che replicano i default inglesi (migrazione soft di mappe vecchie).
 */
function loadTotalsLabelMapWithLang(lang: string): LabelMap {
  const saved = loadTotalsLabelMap()

  // pulizia: se un override === label EN di default, non ha senso sovrascrivere il VI
  const cleaned: LabelMap = {}
  for (const [k, v] of Object.entries(saved)) {
    if (typeof v === 'string' && v.trim() !== '' && v !== DEFAULT_TOTALS_LABEL_MAP[k]) {
      cleaned[k] = v
    }
  }

  // base = i18n; overlay = soli override “reali”
  return { ...i18nDefaultTotalsLabelMap(lang), ...cleaned }
}

function escHtml(s: any): string {
  const t = String(s ?? '')
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function round0(n: number | null | undefined): number {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v)) return 0
  return Math.round(v)
}

/** i18n: permettiamo di passare etichette tradotte dal chiamante */
type TotalsI18nLabels = {
  section: string
  cost: string
  price: string
  totals: string
  discounts: string
  totalAfter: string
  noSections: string
}

function renderTotalsHTML(opts: {
  sections: Array<{ label: string; cost: number; price: number }>;
  grandCost: number;
  grandPrice: number;
  discountsTotal: number;
  priceAfterDiscounts: number;
  fmtC: (n: number | null | undefined) => string;
  showCosts: boolean;
  labelMap?: LabelMap;
  labels?: Partial<TotalsI18nLabels>;
}): string {
  const {
    sections,
    grandCost,
    grandPrice,
    discountsTotal,
    priceAfterDiscounts,
    fmtC,
    showCosts,
    labelMap = {},
    labels = {},
  } = opts

  const L: TotalsI18nLabels = {
    section: labels.section ?? 'Section',
    cost: labels.cost ?? 'Cost',
    price: labels.price ?? 'Price',
    totals: labels.totals ?? 'Totals',
    discounts: labels.discounts ?? 'Discounts',
    totalAfter: labels.totalAfter ?? 'Total after discounts',
    noSections: labels.noSections ?? 'No sections > 0.',
  }

  const filtered = sections.filter(s =>
    showCosts ? (s.cost > 0 || s.price > 0) : s.price > 0
  )

  const tableStyle =
    'width:100%;border-collapse:collapse;table-layout:auto;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;'
  const thStyle =
    'text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb;background:#f9fafb;'
  const tdStyle = 'padding:6px 8px;border-top:1px solid #e5e7eb;'
  const tdNum = tdStyle + 'text-align:right;white-space:nowrap;'
  const footTd = 'padding:8px 8px;border-top:1px solid #e5e7eb;background:#f9fafb;font-weight:600;'

  const costHeader = showCosts ? `<th style="${thStyle} text-align:right;width:200px;">${escHtml(L.cost)}</th>` : ''
  const rowsHtml = filtered
    .map(s => {
      const label = escHtml(labelMap[s.label] ?? s.label)
      const costCell = showCosts
        ? `<td style="${tdNum}">${escHtml(fmtC(round0(s.cost)))}</td>`
        : ''
      return `
        <tr>
          <td style="${tdStyle}">${label}</td>
          ${costCell}
          <td style="${tdNum}">${escHtml(fmtC(round0(s.price)))}</td>
        </tr>`
    })
    .join('')

  const totalsCostCell = showCosts
    ? `<td style="${footTd} text-align:right;">${escHtml(fmtC(round0(grandCost)))}</td>`
    : '<td style="padding:8px 8px;border-top:1px solid #e5e7eb;background:#f9fafb;color:#9ca3af;text-align:right;">-</td>'

  const html = `
<table style="${tableStyle}">
  <thead>
    <tr>
      <th style="${thStyle}">${escHtml(L.section)}</th>
      ${costHeader}
      <th style="${thStyle} text-align:right;width:160px;">${escHtml(L.price)}</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml || `
      <tr>
        <td style="${tdStyle} color:#6b7280;" colspan="${showCosts ? 3 : 2}">${escHtml(L.noSections)}</td>
      </tr>`}
  </tbody>
  <tfoot>
    <tr>
      <td style="${footTd} text-align:right;">${escHtml(L.totals)}</td>
      ${totalsCostCell}
      <td style="${footTd} text-align:right;">${escHtml(fmtC(round0(grandPrice)))}</td>
    </tr>
    <tr>
      <td style="padding:6px 8px;border-top:1px solid #f3f4f6;text-align:right;color:#374151;">${escHtml(L.discounts)}</td>
      ${showCosts ? '<td style="padding:6px 8px;border-top:1px solid #f3f4f6;text-align:right;color:#9ca3af;">-</td>' : ''}
      <td style="padding:6px 8px;border-top:1px solid #f3f4f6;text-align:right;font-weight:600;color:#b91c1c;">− ${escHtml(fmtC(round0(discountsTotal)))}</td>
    </tr>
    <tr>
      <td style="${footTd} text-align:right;">${escHtml(L.totalAfter)}</td>
      ${showCosts
        ? `<td style="${footTd} text-align:right;">${escHtml(fmtC(round0(grandCost)))}</td>`
        : '<td style="padding:8px 8px;border-top:1px solid #e5e7eb;background:#f9fafb;color:#9ca3af;text-align:right;">-</td>'}
      <td style="${footTd} text-align:right;">${escHtml(fmtC(round0(priceAfterDiscounts)))}</td>
    </tr>
  </tfoot>
</table>`.trim()

  return html
}

/* Publisher for DOCX placeholder (unchanged) */
function publishDocxTotals(
  eventId: string | null,
  htmlFull: string,
  htmlNoCosts: string
) {
  if (!eventId) return
  try {
    localStorage.setItem(`paris:docxTotals:${eventId}:full`, htmlFull)
    localStorage.setItem(`paris:docxTotals:${eventId}:noCosts`, htmlNoCosts)
  } catch {}
  try {
    window.dispatchEvent(
      new CustomEvent('paris:docxTotals', {
        detail: { eventId, htmlFull, htmlNoCosts },
      })
    )
  } catch {}
}

/* ──────────────────────────────────────────────────────────────────────────────
   Payment computation (centralized, reused for placeholders + UI)
   ────────────────────────────────────────────────────────────────────────────── */
type ComputedPayment = {
  isFull: boolean
  depositAmount: number
  balanceAmount: number
  depositPercent: number | null // 0..100
  balancePercent: number | null // 0..100
  depositDueDateStr: string
  balanceDueDateStr: string
}

function computePaymentPlan(args: {
  header: any
  paymentLS: any
  totalAfterDiscounts: number
}): ComputedPayment {
  const { header, paymentLS, totalAfterDiscounts } = args

  const depositAmountExplicit = Number(
    pickFirst(
      header?.deposit_amount_vnd,
      header?.deposit_amount,
      header?.amount_deposit_vnd,
      header?.amount_deposit
    ) ?? NaN
  )
  const hasExplicitDeposit =
    Number.isFinite(depositAmountExplicit) && depositAmountExplicit > 0

  const planRaw = String(pickFirst(paymentLS?.plan, header?.payment_plan) || '').toLowerCase()
  const isFull =
    planRaw === 'full' ||
    header?.is_full_payment === true

  const depPctNorm = (() => {
    const fromLS = pctFromAny(paymentLS?.deposit_percent)
    if (fromLS != null) return fromLS
    const raw = pickFirst(
      header?.deposit_percent,
      header?.deposit_percentage,
      header?.deposit_pct,
      header?.deposit_rate
    )
    return readPct({ percent: raw })
  })()

  const balPctNorm = (() => {
    const fromLS = pctFromAny(paymentLS?.balance_percent)
    if (fromLS != null) return fromLS
    const raw = pickFirst(
      header?.balance_percent,
      header?.balance_percentage,
      header?.balance_pct,
      header?.balance_rate
    )
    return readPct({ percent: raw })
  })()

  const depositDue =
    pickFirst(
      header?.deposit_due_at,
      header?.deposit_due_date,
      header?.deposit_due_on,
      header?.due_deposit
    ) ?? '—'
  const balanceDue =
    pickFirst(
      header?.balance_due_at,
      header?.balance_due_date,
      header?.balance_due_on,
      header?.due_balance
    ) ?? '—'

  // Amounts
  let depositAmount = 0
  let balanceAmount = 0

  if (isFull) {
    depositAmount = Math.max(0, Math.round(totalAfterDiscounts))
    balanceAmount = 0
  } else if (hasExplicitDeposit) {
    depositAmount = Math.max(0, Math.round(depositAmountExplicit))
    balanceAmount = Math.max(0, Math.round(totalAfterDiscounts - depositAmount))
  } else if (depPctNorm != null) {
    depositAmount = Math.round(totalAfterDiscounts * Math.max(0, Math.min(depPctNorm, 0.999999)))
    balanceAmount = Math.max(0, Math.round(totalAfterDiscounts - depositAmount))
  } else if (balPctNorm != null) {
    balanceAmount = Math.round(totalAfterDiscounts * Math.max(0, Math.min(balPctNorm, 0.999999)))
    depositAmount = Math.max(0, Math.round(totalAfterDiscounts - balanceAmount))
  } else {
    depositAmount = 0
    balanceAmount = Math.max(0, Math.round(totalAfterDiscounts))
  }

  const pctFromAmount = (amt: number, total: number) =>
    total > 0 ? Math.round((Math.max(0, Math.min(amt, total)) / total) * 100) : 0

  const depositPercent =
    isFull
      ? 100
      : hasExplicitDeposit || depPctNorm != null || balPctNorm != null
      ? pctFromAmount(depositAmount, Math.max(0, totalAfterDiscounts))
      : null

  const balancePercent =
    isFull
      ? 0
      : hasExplicitDeposit || depPctNorm != null || balPctNorm != null
      ? Math.max(0, 100 - (depositPercent ?? 0))
      : null

  return {
    isFull,
    depositAmount,
    balanceAmount,
    depositPercent,
    balancePercent,
    depositDueDateStr: formatDateDMY(depositDue as any),
    balanceDueDateStr: formatDateDMY(balanceDue as any),
  }
}
/* ──────────────────────────────────────────────────────────────────────────────
   PAGE
   ────────────────────────────────────────────────────────────────────────────── */
export default function EventSummaryPage() {
  const { fmtN, fmtC } = useFormatters()
  const ec = useEventCalc()
  const router = useRouter()
  const search = useSearchParams()

  // i18n helper allowing provisional keys
  const _t = useECT() as unknown as (k: string, fb?: string) => string
  const t = useCallback((k: string, fb?: string) => _t(k, fb), [_t])

  const eidFromQS = search?.get('eventId') || search?.get('id') || null

  const getIdFromLS = () => {
    if (typeof window !== 'undefined') return (
      localStorage.getItem('event_current_id') ||
      localStorage.getItem('eventId') ||
      localStorage.getItem('eventcalc.draftEventId') ||
      null
    )
    return null
  }

  const [resolvedEventId, setResolvedEventId] = useState<string | null>(null)
  useEffect(() => {
    const next = (ec as any)?.eventId || eidFromQS || getIdFromLS()
    setResolvedEventId(next ?? null)
  }, [ec, (ec as any)?.eventId, eidFromQS])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return
      if (['event_current_id', 'eventId', 'eventcalc.draftEventId'].includes(e.key)) {
        setResolvedEventId((ec as any)?.eventId || eidFromQS || getIdFromLS())
      }
    }
    const onEventChanged = () => {
      setResolvedEventId((ec as any)?.eventId || eidFromQS || getIdFromLS())
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('event:changed', onEventChanged as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('event:changed', onEventChanged as EventListener)
    }
  }, [ec, (ec as any)?.eventId, eidFromQS])

  const [printing, setPrinting] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  function hardNavigate(url: string) {
    if (typeof window !== 'undefined') {
      window.location.assign(url)
    } else {
      router.push(url)
    }
  }
  const onBack = () => {
    const id = resolvedEventId
    const url = id
      ? `/catering/event-calculator?eventId=${encodeURIComponent(id)}`
      : `/catering/event-calculator`
    hardNavigate(url)
  }
  const onEdit = () => {
    if (!resolvedEventId) return
    const url = `/catering/event-calculator?eventId=${encodeURIComponent(resolvedEventId)}`
    hardNavigate(url)
  }
  const onNewCatering = () => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    try {
      localStorage.setItem('eventcalc.draftEventId', id)
      localStorage.setItem('event_current_id', id)
      localStorage.setItem('eventId', id)
    } catch {}
    hardNavigate(`/catering/event-calculator?eventId=${encodeURIComponent(id)}`)
  }

  const { header, loading: headerLoading, refresh: refreshHeader } =
    useEventHeader(resolvedEventId || '')

  const [headerFallback, setHeaderFallback] = useState<any | null>(null)
  useEffect(() => {
    (async () => {
      if (!resolvedEventId) return
      if (!header) {
        const { data, error } = await supabase
          .from('event_headers')
          .select('*')
          .eq('event_id', resolvedEventId)
          .maybeSingle()
        if (!error && data) setHeaderFallback(data)
      } else {
        setHeaderFallback(null)
      }
    })()
  }, [resolvedEventId, header])

  const headerEff = header || headerFallback

  const doExport = useCallback(
    async (mode: import('@/app/catering/_utils/exportPdf').ExportMode) => {
      if (mode === 'contract') {
        setExportOpen(false)
        const id = resolvedEventId
        if (!id) return
        hardNavigate(`/catering/contract?eventId=${encodeURIComponent(id)}`)
        return
      }
      const mod = await import('@/app/catering/_utils/exportPdf')
      await mod.exportSummaryPdf({
        header: headerEff,
        mode,
        onBeforePrint: () => setPrinting(true),
        onAfterPrint: () => setPrinting(false),
      })
      setExportOpen(false)
    },
    [headerEff, resolvedEventId]
  )

  const btnSecondaryBlue =
    'inline-flex items-center gap-2 px-3 h-9 rounded-lg ' +
    'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 ' +
    'border border-blue-400/30'
  const btnPrimaryBlue =
    'inline-flex items-center gap-2 px-3 h-9 rounded-lg ' +
    'bg-blue-600 text-white hover:opacity-90'

  const { bundles, loading: bundlesLoading, refetch: refreshBundles } =
    useEventBundles(resolvedEventId || '')
  const { dishes } = useFinalDishes()
  const { materials } = useMaterials()

  const eqRows = useEventEquipmentRows(resolvedEventId || '')
  const eqCatalog = useEquipment()

  const companyAssets = useEventCompanyAssetRows(resolvedEventId || '')
  const extraFee = useEventExtraFeeRows(resolvedEventId || '')

  const staffHook = useStaffRows(resolvedEventId || '')
  const staffSettings = useEventStaffSettings(resolvedEventId || '')
  const staffMarkup = Number(staffSettings.settings?.markup_x ?? 1) || 1

  const transport = useEventTransportRows(resolvedEventId || '')
  const transportSettings = useTransportSettings(resolvedEventId || '')

  const discountsHook = useEventDiscountRows(resolvedEventId || '')

  const [discountMeta, setDiscountMeta] = useState<PctMetaMap>(() =>
    loadPctMetaAny([LS_DISCOUNT_META_KEY, 'eventcalc.discount.pctmeta'])
  )
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return
      if (
        e.key === LS_DISCOUNT_META_KEY ||
        e.key === 'eventcalc.discount.pctmeta'
      ) {
        setDiscountMeta(
          loadPctMetaAny([LS_DISCOUNT_META_KEY, 'eventcalc.discount.pctmeta'])
        )
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const [extraFeeMeta, setExtraFeeMeta] = useState<ExtraFeeMetaMap>(() =>
    loadExtraFeeMeta()
  )
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_EXTRAFEE_META_KEY) setExtraFeeMeta(loadExtraFeeMeta())
    }
    const onEventChanged = () => setExtraFeeMeta(loadExtraFeeMeta())
    window.addEventListener('storage', onStorage)
    window.addEventListener('event:changed', onEventChanged as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('event:changed', onEventChanged as EventListener)
    }
  }, [])

  const settingsFromCtx = (ec as any)
    ?.bundleSettings as Record<string, BundleConfig> | undefined
  const [bundleSettings, setBundleSettings] = useState<
    Record<string, BundleConfig>
  >({})
  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      if (settingsFromCtx && Object.keys(settingsFromCtx).length) {
        if (!cancelled) setBundleSettings(settingsFromCtx)
        return
      }
      const fromLS =
        safeParseJSON<Record<string, BundleConfig>>(
          typeof window !== 'undefined'
            ? localStorage.getItem(LS_BUNDLE_SETTINGS_KEY)
            : null
        )
      if (fromLS && Object.keys(fromLS).length) {
        if (!cancelled) setBundleSettings(fromLS)
        return
      }
      const { data } = await supabase
        .from('bundle_types')
        .select('*')
        .order('key', { ascending: true })
      const map: Record<string, BundleConfig> = {}
      for (const row of (data || [])) {
        map[row.key as string] = {
          label: row.label ?? '',
          maxModifiers: row.max_modifiers ?? 0,
          dishCategories: Array.isArray(row.dish_categories)
            ? row.dish_categories
            : [],
          modifierSlots: Array.isArray(row.modifier_slots)
            ? row.modifier_slots
            : [],
          markupX: Number(row.markup_x) > 0 ? Number(row.markup_x) : 1,
        }
      }
      if (!cancelled && Object.keys(map).length) {
        setBundleSettings(map)
        try {
          localStorage.setItem(LS_BUNDLE_SETTINGS_KEY, JSON.stringify(map))
        } catch {}
      }
    }
    hydrate()
    return () => {
      cancelled = true
    }
  }, [settingsFromCtx])

  const nameOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of dishes || [])
      m.set(
        String((d as any).id),
        String((d as any).name ?? (d as any).label ?? '')
      )
    for (const t of materials || [])
      m.set(String((t as any).id), String((t as any).name ?? ''))
    return (id?: string | null) => (id ? m.get(String(id)) || String(id) : '–')
  }, [dishes, materials])

  const itemsMap = useMemo(() => {
    const map = new Map<string, { unit_cost: number | null }>()
    for (const d of dishes || [])
      map.set(String((d as any).id), {
        unit_cost: Number((d as any).unit_cost ?? 0),
      })
    for (const m of materials || [])
      map.set(String((m as any).id), {
        unit_cost: Number((m as any).unit_cost ?? 0),
      })
    return map
  }, [dishes, materials])

  const { bundlesTotals } = useMemo(() => {
    if (!bundles?.length) return { bundlesTotals: { cost: 0, price: 0 } }

    let cost = 0
    let price = 0

    for (const b of bundles) {
      const cfg = bundleSettings?.[b.type_key]
      const limit = Math.max(
        0,
        cfg?.maxModifiers ??
          (Array.isArray(cfg?.modifierSlots) ? cfg!.modifierSlots.length : 0)
      )
      const markup = Number(cfg?.markupX ?? 1) > 0 ? Number(cfg?.markupX) : 1

      let subCost = 0
      let subPrice = 0

      for (const r of b.rows || []) {
        const q = Math.max(0, Number(r.qty ?? 0))
        let rowCost = 0
        let rowPrice = 0

        if (r.dish_id) {
          const baseCost =
            Number(itemsMap.get(String(r.dish_id))?.unit_cost ?? 0) || 0
          rowCost += baseCost
          rowPrice += baseCost * markup
        }

        const mods: string[] = Array.isArray(r.modifiers)
          ? r.modifiers.slice(0, limit)
          : []
        for (const mid of mods) {
          if (!mid) continue
          const mCost =
            Number(itemsMap.get(String(mid))?.unit_cost ?? 0) || 0
          rowCost += mCost
          rowPrice += mCost * markup
        }

        subCost += rowCost * q
        subPrice += rowPrice * q
      }

      cost += subCost
      price += subPrice
    }

    return { bundlesTotals: { cost, price } }
  }, [bundles, bundleSettings, itemsMap])

  const equipmentTotals = useMemo(() => {
    const rows = eqRows.rows || []
    if (!rows.length) return { cost: 0, price: 0 }
    const catalog = eqCatalog.equipment || []
    const index = new Map(catalog.map((e: any) => [e.id, e]))
    let cost = 0,
      price = 0
    for (const r of rows) {
      const qty = Number(r.qty ?? 0) || 0
      const base = index.get(r.equipment_id || '')
      const unitCostOverride =
        r.unit_cost_override != null ? Number(r.unit_cost_override) : null
      const unitCost =
        unitCostOverride != null
          ? Number.isFinite(unitCostOverride)
            ? unitCostOverride!
            : 0
          : Number(base?.cost ?? 0) || 0
      const markupX =
        r.markup_x_override != null ? Number(r.markup_x_override) || 1 : null
      const unitPrice =
        markupX != null
          ? unitCost * markupX
          : Number(base?.final_price ?? 0) || unitCost
      cost += qty * unitCost
      price += qty * unitPrice
    }
    return { cost, price }
  }, [eqRows.rows, eqCatalog.equipment])

  const assetsPrice = useMemo(() => {
    const rows = companyAssets.rows || []
    let tSum = 0
    for (const r of rows) {
      if (!r.include_price) continue
      const qty = Number(r.qty ?? 0) || 0
      const unit = Number(r.unit_price_vnd ?? 0) || 0
      tSum += qty * unit
    }
    return tSum
  }, [companyAssets.rows])

  const staffCost = useMemo(
    () =>
      (staffHook.rows || []).reduce(
        (a: number, r: any) =>
          a + Number(r.cost_per_hour || 0) * Number(r.hours || 0),
        0
      ),
    [staffHook.rows]
  )
  const staffTotals = useMemo(() => {
    const cost = staffCost
    const price = Math.round(cost * staffMarkup)
    return { cost, price }
  }, [staffCost, staffMarkup])

  const transportTotals = useMemo(() => {
    const rows = transport.rows || []
    const vt = transportSettings.vehicleTypes || []
    const globalMarkup = Number(transportSettings.settings?.markup_x ?? 1) || 1
    const lookupCostPerKm = (vehicle_key: string | null) => {
      if (!vehicle_key) return null
      const byId = vt.find(
        (v: any) => v.id === vehicle_key || String(v.id) === String(vehicle_key)
      )
      if (byId) return Number(byId.cost_per_km ?? 0) || 0
      const byName = vt.find((v: any) => v.name === vehicle_key)
      if (byName) return Number(byName.cost_per_km ?? 0) || 0
      return null
    }
    let cost = 0,
      price = 0
    for (const r of rows) {
      const dist = Number(r.distance_km ?? 0) || 0
      const trips = r.round_trip ? 2 : 1
      const kmEff = dist * trips
      const cpk =
        (r.cost_per_km ?? lookupCostPerKm(r.vehicle_key) ?? 0) as number
      const mx = Number(r.markup_x ?? globalMarkup) || 1
      const rowCost = kmEff * cpk
      cost += rowCost
      price += rowCost * mx
    }
    return { cost, price }
  }, [
    transport.rows,
    transportSettings.settings?.markup_x,
    transportSettings.vehicleTypes,
  ])

  const basePriceForPercent = useMemo(
    () =>
      bundlesTotals.price +
      equipmentTotals.price +
      staffTotals.price +
      transportTotals.price +
      assetsPrice,
    [
      bundlesTotals.price,
      equipmentTotals.price,
      staffTotals.price,
      transportTotals.price,
      assetsPrice,
    ]
  )

  const { extraFeeTotals, extraFeePriceByRow } = useMemo(() => {
    const rows: any[] = Array.isArray(extraFee.rows) ? extraFee.rows : []
    let N = 0
    let costSum = 0
    const weights: { id: string; w: number }[] = []

    const resolvePct = (
      r: any
    ): {
      kind: 'incl' | 'excl' | 'section' | 'none'
      p?: number
      sectionKey?: 'bundles' | 'equipment' | 'staff' | 'transport' | 'assets'
    } => {
      const m = extraFeeMeta?.[r.id]
      if (m && m.advMode === 'percentage') {
        const p0 = readPctStr(m.pctValue)
        const p = p0 == null ? null : Math.max(0, Math.min(p0, 0.99))
        if (p == null) return { kind: 'none' }
        if (m.pctBase === 'total_incl_extrafee') return { kind: 'incl', p }
        if (m.pctBase === 'total_excl_extrafee') return { kind: 'excl', p }
        return { kind: 'section', p, sectionKey: m.pctBase as any }
      }
      const pct = readPct(r)
      if (pct != null) {
        const s =
          (typeof r.scopeNorm === 'string' ? r.scopeNorm : null) ||
          normScope(r?.base ?? r?.apply_on ?? r?.scope ?? 'total')
        if (s === 'total' || s === 'total_incl')
          return { kind: 'incl', p: Math.max(0, Math.min(pct, 0.99)) }
        if (s === 'total_excl')
          return { kind: 'excl', p: Math.max(0, Math.min(pct, 0.99)) }
        return {
          kind: 'section',
          p: Math.max(0, Math.min(pct, 0.99)),
          sectionKey: s as any,
        }
      }
      return { kind: 'none' }
    }

    for (const r of rows) {
      const qty = Number(r.qty ?? 1) || 1
      const res = resolvePct(r)

      if (res.kind === 'incl' && res.p != null) {
        const w = qty * (res.p / (1 + res.p))
        if (w > 0) weights.push({ id: r.id, w })
        continue
      }

      if (res.kind === 'excl' && res.p != null) {
        N += qty * (res.p * basePriceForPercent)
        continue
      }

      if (res.kind === 'section' && res.p != null) {
        const byScope: Record<string, number> = {
          bundles: bundlesTotals.price,
          equipment: equipmentTotals.price,
          staff: staffTotals.price,
          transport: transportTotals.price,
          assets: assetsPrice,
        }
        const base = byScope[res.sectionKey || ''] ?? basePriceForPercent
        N += qty * (res.p * base)
        continue
      }

      if (!!r.calc_mode) {
        const c = Number(r.cost || 0) || 0
        const mx = Number(r.markup_x || 1) || 1
        if (c > 0) {
          costSum += qty * c
          N += qty * c * mx
        } else {
          N += qty * (Number(r.amount || 0) || 0)
        }
      } else {
        const unit = r.unit_price == null ? null : Number(r.unit_price || 0)
        N += qty * (unit || 0)
      }
    }

    const K = weights.reduce((a, x) => a + x.w, 0)
    const T = K > 0 ? (N + K * basePriceForPercent) / (1 - K) : N
    const X = Math.max(0, T - N)

    const priceByRow = new Map<string, number>()

    for (const r of rows) {
      const qty = Number(r.qty ?? 1) || 1
      const res = resolvePct(r)

      if (res.kind === 'excl' && res.p != null) {
        priceByRow.set(r.id, qty * (res.p * basePriceForPercent))
        continue
      }
      if (res.kind === 'section' && res.p != null) {
        const byScope: Record<string, number> = {
          bundles: bundlesTotals.price,
          equipment: equipmentTotals.price,
          staff: staffTotals.price,
          transport: transportTotals.price,
          assets: assetsPrice,
        }
        const base = byScope[res.sectionKey || ''] ?? basePriceForPercent
        priceByRow.set(r.id, qty * (res.p * base))
        continue
      }
      if (!!r.calc_mode) {
        const c = Number(r.cost || 0) || 0
        const mx = Number(r.markup_x || 1) || 1
        if (c > 0) priceByRow.set(r.id, qty * c * mx)
        else priceByRow.set(r.id, qty * (Number(r.amount || 0) || 0))
        continue
      }
      if (r.unit_price != null) {
        priceByRow.set(r.id, qty * (Number(r.unit_price || 0) || 0))
      }
    }

    const Wsum = weights.reduce((a, x) => a + x.w, 0)
    if (Wsum > 0 && X > 0) {
      for (const { id, w } of weights) {
        const share = X * (w / Wsum)
        priceByRow.set(id, (priceByRow.get(id) || 0) + share)
      }
    }

    return {
      extraFeeTotals: { cost: costSum, price: T },
      extraFeePriceByRow: priceByRow,
    }
  }, [
    extraFee.rows,
    extraFeeMeta,
    basePriceForPercent,
    bundlesTotals.price,
    equipmentTotals.price,
    staffTotals.price,
    transportTotals.price,
    assetsPrice,
  ])

  const computeExtraFeePrice = useCallback(
    (r: any) => extraFeePriceByRow.get(r.id) ?? 0,
    [extraFeePriceByRow]
  )

  const discountsTotal = Number(discountsHook.totalAmount ?? 0) || 0

  const grandCost =
    bundlesTotals.cost +
    equipmentTotals.cost +
    staffTotals.cost +
    transportTotals.cost +
    extraFeeTotals.cost

  const grandPrice =
    bundlesTotals.price +
    equipmentTotals.price +
    staffTotals.price +
    transportTotals.price +
    assetsPrice +
    extraFeeTotals.price

  const priceAfterDiscounts = grandPrice - discountsTotal
  const costPctAfter =
    priceAfterDiscounts > 0 ? (grandCost / priceAfterDiscounts) * 100 : 0
  const marginAfter = priceAfterDiscounts - grandCost
  const marginAfterPct =
    priceAfterDiscounts > 0 ? (marginAfter / priceAfterDiscounts) * 100 : 0

  const { language } = useSettings()

// prima era: useMemo(() => loadTotalsLabelMap(), [])
const totalsLabelMap = useMemo(
  () => loadTotalsLabelMapWithLang(language),
  [language]
)
  const labelUi = useCallback(
    (raw: string) =>
      totalsLabelMap[raw] ??
      // fallback i18n sui label canonici
      ({
        Bundles: t('Bundles', 'Bundles'),
        Equipment: t('Equipment', 'Equipment'),
        Staff: t('Staff', 'Staff'),
        Transport: t('Transport', 'Transport'),
        'Company assets': t('Company assets', 'Company assets'),
        'Extra fee': t('Extra fee', 'Extra fee'),
      } as Record<string, string>)[raw] ??
      raw,
    [totalsLabelMap, t]
  )

  const totalsSections = useMemo(
    () => [
      { label: 'Bundles',        cost: bundlesTotals.cost,   price: bundlesTotals.price },
      { label: 'Equipment',      cost: equipmentTotals.cost, price: equipmentTotals.price },
      { label: 'Staff',          cost: staffTotals.cost,     price: staffTotals.price },
      { label: 'Transport',      cost: transportTotals.cost, price: transportTotals.price },
      { label: 'Company assets', cost: 0,                    price: assetsPrice },
      { label: 'Extra fee',      cost: extraFeeTotals.cost,  price: extraFeeTotals.price },
    ],
    [bundlesTotals, equipmentTotals, staffTotals, transportTotals, assetsPrice, extraFeeTotals]
  )

  const totalsSectionsUi = useMemo(
    () => totalsSections.map(s => ({ ...s, label: labelUi(s.label) })),
    [totalsSections, labelUi]
  )

  const docxTotalsFull = useMemo(
    () =>
      renderTotalsHTML({
        sections: totalsSections,
        grandCost,
        grandPrice,
        discountsTotal,
        priceAfterDiscounts,
        fmtC,
        showCosts: true,
        labelMap: totalsLabelMap,
        labels: {
          section: t('Section', 'Section'),
          cost: t('Cost', 'Cost'),
          price: t('Price', 'Price'),
          totals: t('Totals', 'Totals'),
          discounts: t('Discounts', 'Discounts'),
          totalAfter: t('Total after discounts', 'Total after discounts'),
          noSections: t('No sections > 0.', 'No sections > 0.'),
        },
      }),
    [totalsSections, grandCost, grandPrice, discountsTotal, priceAfterDiscounts, fmtC, totalsLabelMap, t]
  )
  const docxTotalsNoCosts = useMemo(
    () =>
      renderTotalsHTML({
        sections: totalsSections,
        grandCost,
        grandPrice,
        discountsTotal,
        priceAfterDiscounts,
        fmtC,
        showCosts: false,
        labelMap: totalsLabelMap,
        labels: {
          section: t('Section', 'Section'),
          price: t('Price', 'Price'),
          totals: t('Totals', 'Totals'),
          discounts: t('Discounts', 'Discounts'),
          totalAfter: t('Total after discounts', 'Total after discounts'),
          noSections: t('No sections > 0.', 'No sections > 0.'),
        },
      }),
    [totalsSections, grandCost, grandPrice, discountsTotal, priceAfterDiscounts, fmtC, totalsLabelMap, t]
  )

  // Pubblica anche in chiavi "docxTotals:*" (compat vecchi consumer)
  useEffect(() => {
    publishDocxTotals(resolvedEventId, docxTotalsFull, docxTotalsNoCosts)
  }, [resolvedEventId, docxTotalsFull, docxTotalsNoCosts])

  // Payment (LS-first) + publish in paris:summary
  const paymentLS = usePaymentLS(resolvedEventId)
  const computedPayment = useMemo(
    () => computePaymentPlan({
      header: headerEff,
      paymentLS,
      totalAfterDiscounts: Math.max(0, Math.round(priceAfterDiscounts)),
    }),
    [headerEff, paymentLS, priceAfterDiscounts]
  )

  // Pubblica *tutto* ciò che serve al contratto in un colpo solo
  useEffect(() => {
    if (!resolvedEventId) return
    const payload = {
      pricing: {
        totalAfterDiscount: Math.round(priceAfterDiscounts),
      },
      totals: {
        afterDiscounts: Math.round(priceAfterDiscounts),
        grandPrice: Math.round(grandPrice),
        discountsTotal: Math.round(discountsTotal),
      },
      docx_totals: {
        full_html: docxTotalsFull,
        no_costs_html: docxTotalsNoCosts,
      },
      payment: {
        deposit: {
          amount_vnd: computedPayment.depositAmount,
          percent: computedPayment.depositPercent, // 0..100 o null
          due_date: computedPayment.depositDueDateStr,
        },
        balance: {
          amount_vnd: computedPayment.balanceAmount,
          percent: computedPayment.balancePercent, // 0..100 o null
          due_date: computedPayment.balanceDueDateStr,
        },
        is_full_payment: computedPayment.isFull,
      },
      updatedAt: Date.now(),
    }
    publishParisSummary(resolvedEventId, payload)
  }, [
    resolvedEventId,
    priceAfterDiscounts,
    grandPrice,
    discountsTotal,
    docxTotalsFull,
    docxTotalsNoCosts,
    computedPayment.depositAmount,
    computedPayment.balanceAmount,
    computedPayment.depositPercent,
    computedPayment.balancePercent,
    computedPayment.depositDueDateStr,
    computedPayment.balanceDueDateStr,
    computedPayment.isFull,
  ])

  const doRefreshAll = useCallback(() => {
    refreshHeader?.()
    refreshBundles?.()
    eqRows.refresh?.()
    eqCatalog.refresh?.()
    companyAssets.refresh?.()
    extraFee.refresh?.()
    transport.refresh?.()
    transportSettings.refresh?.()
    discountsHook.refresh?.()
    staffSettings.refresh?.()
    ;(staffHook as any).refresh?.()
  }, [
    refreshHeader,
    refreshBundles,
    eqRows.refresh,
    eqCatalog.refresh,
    companyAssets.refresh,
    extraFee.refresh,
    transport.refresh,
    transportSettings.refresh,
    discountsHook.refresh,
    staffSettings.refresh,
    staffHook,
  ])

  // 🔔 rinfresca anche su 'payment:changed' (emesso da EventInfoCard)
  useEffect(() => {
    const onPing = () => doRefreshAll()
    const names = ['eventcalc:save', 'eventcalc:saved', 'event:changed', 'eventcalc.settings.bump', 'payment:changed']
    for (const n of names) window.addEventListener(n as any, onPing)
    return () => { for (const n of names) window.removeEventListener(n as any, onPing) }
  }, [doRefreshAll])

  // 🔔 bump locale quando LS cambia 'eventcalc.payment:*' (stessa tab)
  const [, setLsPaymentBump] = useState(0)
  useEffect(() => {
    const onPaymentChanged = () => setLsPaymentBump(x => x + 1)
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('eventcalc.payment')) setLsPaymentBump(x => x + 1)
    }
    window.addEventListener('payment:changed', onPaymentChanged as EventListener)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('payment:changed', onPaymentChanged as EventListener)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useEffect(() => {
    let raf: number | null = null
    const schedule = () => {
      if (raf != null) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => doRefreshAll())
    }
    const onCalcTick = () => schedule()
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'eventcalc.tick') schedule()
    }
    window.addEventListener('calc:tick', onCalcTick as EventListener)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('calc:tick', onCalcTick as EventListener)
      window.removeEventListener('storage', onStorage)
      if (raf != null) cancelAnimationFrame(raf)
    }
  }, [doRefreshAll])

  const anyLoading =
    !resolvedEventId ||
    headerLoading ||
    bundlesLoading ||
    !!eqRows.loading ||
    !!eqCatalog.loading ||
    !!companyAssets.loading ||
    !!extraFee.loading ||
    !!transport.loading ||
    !!transportSettings.loading ||
    !!(discountsHook as any)?.loading ||
    !!staffSettings.loading

  return (
    <div className="max-w-6xl mx-auto p-4">
      {/* Action bar */}
      <div className="mb-3 flex items-center justify-between no-print">
        <button
          type="button"
          onClick={onBack}
          className={btnSecondaryBlue}
          title={t('Back', 'Back')}
          aria-label={t('Back', 'Back')}
        >
          <ArrowLeftIcon className="w-5 h-5" />
          {t('Back', 'Back')}
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className={btnSecondaryBlue}
            title={t('Export PDF', 'Export PDF')}
          >
            <DocumentArrowDownIcon className="w-5 h-5" />
            {t('Export PDF', 'Export PDF')}
          </button>

          <button
            type="button"
            onClick={onEdit}
            className={btnSecondaryBlue}
            title={t('Edit', 'Edit')}
            aria-label={t('Edit', 'Edit')}
          >
            <PencilSquareIcon className="w-5 h-5" />
            {t('Edit', 'Edit')}
          </button>

          <button
            type="button"
            onClick={onNewCatering}
            className={btnPrimaryBlue}
            title={t('New event', 'New event')}
            aria-label={t('New event', 'New event')}
          >
            <PlusIcon className="w-5 h-5" />
            {t('New event', 'New event')}
          </button>
        </div>
      </div>

      {/* Export Modal (two-step) */}
      {exportOpen && (
        <ExportModal onClose={() => setExportOpen(false)} onPick={doExport} />
      )}

      <div
        id="event-summary-root"
        className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow print-container"
        style={{ fontFamily: 'Arial, Helvetica, sans-serif', letterSpacing: 0 }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h1 className="text-lg font-semibold">{t('Event Summary', 'Event Summary')}</h1>
          {anyLoading && <span className="text-xs text-gray-500">{t('Loading…', 'Loading…')}</span>}
        </div>

        <div className="p-4 space-y-10">
          {/* Event Info */}
          <Section title={t('Event Info', 'Event Info')} defaultOpen forceOpen={printing}>
            <div id="event-info-print-block">
              <EventInfoDoc header={headerEff} fmtN={fmtN} fmtC={fmtC} paymentPlan={computedPayment} />
            </div>
          </Section>

          {/* Bundles & Menu */}
          <Section title={t('Bundles & Menu', 'Bundles & Menu')} defaultOpen forceOpen={printing}>
            <BundlesBlock
              bundles={bundles || []}
              settings={bundleSettings}
              itemsMap={itemsMap}
              nameOf={nameOf}
              fmtN={fmtN}
              fmtC={fmtC}
            />
            <div className="print-hide-when-menu">
              <TotalsRow
                label={labelUi('Bundles')}
                cost={bundlesTotals.cost}
                price={bundlesTotals.price}
                fmtC={fmtC}
              />
            </div>
          </Section>

          {/* Equipment */}
          <Section
            title={t('Equipment', 'Equipment')}
            defaultOpen
            forceOpen={printing}
            className="print-hide-when-menu"
          >
            <EquipmentBlock
              rows={eqRows.rows || []}
              catalog={eqCatalog.equipment || []}
              fmtN={fmtN}
              fmtC={fmtC}
            />
            <TotalsRow
              label={labelUi('Equipment')}
              cost={equipmentTotals.cost}
              price={equipmentTotals.price}
              fmtC={fmtC}
            />
          </Section>

          {/* Staff */}
          <Section
            title={t('Staff', 'Staff')}
            defaultOpen
            forceOpen={printing}
            className="print-hide-when-menu"
          >
            <StaffBlock
              rows={staffHook.rows || []}
              markupMul={staffMarkup}
              fmtN={fmtN}
              fmtC={fmtC}
            />
            <TotalsRow
              label={`${labelUi('Staff')} (×${staffMarkup.toFixed(2)})`}
              cost={staffTotals.cost}
              price={staffTotals.price}
              fmtC={fmtC}
            />
          </Section>

          {/* Transport */}
          <Section
            title={t('Transport', 'Transport')}
            defaultOpen
            forceOpen={printing}
            className="print-hide-when-menu"
          >
            <TransportBlock
              rows={transport.rows || []}
              settings={transportSettings}
              fmtN={fmtN}
              fmtC={fmtC}
            />
            <TotalsRow
              label={`${labelUi('Transport')} (×${Number(
                transportSettings.settings?.markup_x ?? 1
              ).toFixed(2)})`}
              cost={transportTotals.cost}
              price={transportTotals.price}
              fmtC={fmtC}
            />
          </Section>

          {/* Company assets */}
          <Section
            title={t('Company assets', 'Company assets')}
            defaultOpen
            forceOpen={printing}
            className="print-hide-when-menu"
          >
            <AssetsBlock rows={companyAssets.rows || []} fmtN={fmtN} fmtC={fmtC} />
            <TotalsRow
              label={labelUi('Company assets')}
              cost={0}
              price={assetsPrice}
              fmtC={fmtC}
            />
          </Section>

          {/* Extra fee */}
          <Section
            title={t('Extra fee', 'Extra fee')}
            defaultOpen
            forceOpen={printing}
            className="print-hide-when-menu"
          >
            <ExtraFeeBlock
              rows={extraFee.rows || []}
              fmtN={fmtN}
              fmtC={fmtC}
              basePriceForPercent={basePriceForPercent}
              sectionPrices={{
                bundles: bundlesTotals.price,
                equipment: equipmentTotals.price,
                staff: staffTotals.price,
                transport: transportTotals.price,
                assets: assetsPrice,
              }}
              computePrice={computeExtraFeePrice}
              lsMeta={extraFeeMeta}
            />
            <TotalsRow
              label={labelUi('Extra fee')}
              cost={extraFeeTotals.cost}
              price={extraFeeTotals.price}
              fmtC={fmtC}
            />
          </Section>

          {/* Discounts */}
          <Section
            title={t('Discounts', 'Discounts')}
            defaultOpen
            forceOpen={printing}
            className="print-hide-when-menu"
          >
            <DiscountsBlock
              rows={discountsHook.rows || []}
              fmtN={fmtN}
              fmtC={fmtC}
              totalFromHook={Number(discountsHook.totalAmount ?? 0) || 0}
              discountMeta={discountMeta}
              bundles={bundles || []}
              bundleSettings={bundleSettings}
            />
          </Section>

          {/* Totals */}
          <Section
            title={t('Totals', 'Totals')}
            defaultOpen
            forceOpen={printing}
            className="print-hide-when-menu"
          >
            <div id="totals-print-block">
              <TotalsTable
                fmtC={fmtC}
                sections={totalsSectionsUi}
                grandCost={grandCost}
                grandPrice={grandPrice}
                discountsTotal={discountsTotal}
                priceAfterDiscounts={priceAfterDiscounts}
                costPctAfter={costPctAfter}
              />

              {/* Payment amounts — ora arriva dal calcolo centralizzato */}
              <PaymentAmountsRow
                computed={computedPayment}
                fmtC={fmtC}
              />

              {/* KPI */}
              <Kpis
                fmtN={fmtN}
                fmtC={fmtC}
                marginAfter={marginAfter}
                marginAfterPct={marginAfterPct}
                costPctAfter={costPctAfter}
                peopleCount={Number(headerEff?.people_count || 0)}
                serviceHours={hoursBetweenISO(headerEff?.start_at, headerEff?.end_at)}
                budgetTotal={Number(headerEff?.budget_total_vnd || 0)}
                budgetPerPerson={Number(headerEff?.budget_per_person_vnd || 0)}
                priceAfterDiscounts={priceAfterDiscounts}
              />
            </div>
          </Section>
        </div>
      </div>

      {/* PRINT CSS (global) */}
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 12mm; }

          html, body {
            background: #fff !important;
            zoom: 1 !important;
            transform: none !important;
          }

          .no-print { display: none !important; }
          .export-modal { display: none !important; }

          .print-container {
            box-shadow: none !important;
            border: none !important;
            font-family: Arial, Helvetica, sans-serif !important;
            letter-spacing: normal !important;
            -webkit-text-size-adjust: 100% !important;
            font-variant-ligatures: none !important;
            font-kerning: normal !important;
          }

          .print-container, .print-container * { line-height: 1.35 !important; }
          .print-container .text-sm { line-height: 1.35 !important; }
          .print-container .text-base { line-height: 1.45 !important; }
          .print-container .text-lg { line-height: 1.25 !important; }

          .print-container .grid { display: block !important; }
          .print-container .flex { display: block !important; }
          .print-container .space-y-4 > * + * { margin-top: 12px !important; }
          .print-container .space-y-6 > * + * { margin-top: 16px !important; }
          .print-container .space-y-10 > * + * { margin-top: 24px !important; }

          .print-container table { border-collapse: collapse !important; table-layout: auto !important; width: 100% !important; }
          .print-container th, .print-container td {
            vertical-align: top !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }

          .bg-gray-50 { background: transparent !important; }
          .shadow, .shadow-sm, .shadow-md, .shadow-lg { box-shadow: none !important; }

          .print-container .px-3.py-2 { padding-top: 6px !important; padding-bottom: 6px !important; }
          .print-container .px-4.py-3 { padding-top: 8px !important; padding-bottom: 8px !important; }

          a[href]::after { content: none !important; }
          .print-section > button span:last-child { display: none !important; }

          .kpi-grid, .kpi-card, .totals-table, .print-keep, .print-section .p-4 {
            break-inside: avoid-page; page-break-inside: avoid;
          }
          .print-container p, .print-container li, .print-container tr { orphans: 3; widows: 3; }

          .print-container .break-words,
          .print-container .whitespace-pre-line {
            word-break: normal !important;
            overflow-wrap: anywhere !important;
            hyphens: none !important;
          }

          *[style*="transform"], *[style*="zoom"] { transform: none !important; zoom: 1 !important; }
          [class*="scale-"] { transform: none !important; }
        }

        /* Modal (screen) */
        .export-modal .backdrop { background: rgba(2, 6, 23, 0.55); }
        .export-modal .panel { max-width: 28rem; width: 100%; }
        .export-option {
          transition: background 120ms ease, border-color 120ms ease;
          color: #1f2937; font-weight: 600;
        }
        .export-option:hover {
          background: rgba(37, 99, 235, 0.06);
          border-color: rgba(37, 99, 235, 0.35);
        }

        body[data-print-mode='quote_no_costs'] .print-hide-costs { display: none !important; }
        body[data-print-mode='quote_no_costs'] .markup-flag { display: none !important; }
        body[data-print-mode='quote_no_costs'] .kpi-grid { display: none !important; }
        body[data-print-mode='quote_no_costs'] .price-col { width: 160px !important; text-align: right !important; }

        body[data-print-mode='menu_only'] .print-hide-when-menu { display: none !important; }
        body[data-print-mode='menu_only'] .print-hide-menu-money { display: none !important; }
        body[data-print-mode='menu_only'] .markup-flag { display: none !important; }
        body[data-print-mode='menu_only'] .bundles-subtotal-row { display: none !important; }

        body[data-print-mode='contract'] .print-hide-when-contract { display: none !important; }
        body[data-print-mode='payment_note'] .print-hide-when-payment { display: none !important; }
        body[data-print-mode='liquidation'] .print-hide-when-liquidation { display: none !important; }
      `}</style>
    </div>
  )
}
/* ──────────────────────────────────────────────────────────────────────────────
   Subcomponents
   ────────────────────────────────────────────────────────────────────────────── */

function Section({
  title,
  children,
  defaultOpen = true,
  forceOpen = false,
  className = '',
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  forceOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const isOpen = forceOpen || open

  // i18n
  const _t = useECT() as unknown as (k: string, fb?: string) => string
  const t = useCallback((k: string, fb?: string) => _t(k, fb), [_t])

  return (
    <div className={`border border-gray-200 rounded-xl overflow-hidden print-section ${className}`}>
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={isOpen}
        aria-label={isOpen ? t('Hide section', 'Hide section') : t('Show section', 'Show section')}
        title={isOpen ? t('Hide', 'Hide') : t('Show', 'Show')}
      >
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-gray-500 text-xs">
          {isOpen ? t('Hide', 'Hide') : t('Show', 'Show')}
        </span>
      </button>
      {isOpen && <div className="p-4">{children}</div>}
    </div>
  )
}

/* Export Modal (two-step for Quotation) */
function ExportModal({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (mode: import('@/app/catering/_utils/exportPdf').ExportMode) => void
}) {
  const [step, setStep] = useState<'root' | 'quote'>('root')

  // i18n
  const _t = useECT() as unknown as (k: string, fb?: string) => string
  const t = useCallback((k: string, fb?: string) => _t(k, fb), [_t])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const Choice = ({
    label,
    onClick,
    disabled = false,
    icon,
  }: {
    label: string
    onClick?: () => void
    disabled?: boolean
    icon?: React.ReactNode
  }) => (
    <button
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={`export-option w-full text-left px-3 py-2 rounded-lg border border-gray-200 ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-300'}`}
      aria-disabled={disabled}
    >
      <div className="flex items-center gap-2">
        {icon ?? null}
        <div className="text-sm">{label}</div>
      </div>
    </button>
  )

  return (
    <div className="export-modal fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="backdrop absolute inset-0" onClick={onClose} aria-label={t('Close', 'Close')} />
      <div className="panel relative bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="text-base font-semibold text-gray-800">
            {step === 'root'
              ? t('Export', 'Export')
              : `${t('Export', 'Export')} → ${t('Quotation', 'Quotation')}`}
          </div>
          <div className="flex items-center gap-1">
            {step === 'quote' && (
              <button
                onClick={() => setStep('root')}
                className="p-1 rounded hover:bg-gray-100"
                aria-label={t('Back', 'Back')}
                title={t('Back', 'Back')}
              >
                <ChevronLeftIcon className="w-5 h-5 text-gray-700" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-100"
              aria-label={t('Close', 'Close')}
              title={t('Close', 'Close')}
            >
              <XMarkIcon className="w-5 h-5 text-gray-700" />
            </button>
          </div>
        </div>

        {step === 'root' ? (
          <div className="space-y-2">
            <Choice label={t('Report', 'Report')} onClick={() => onPick('summary_full')} />
            <Choice label={t('Quotation', 'Quotation')} onClick={() => setStep('quote')} />
            <Choice label={t('Menu', 'Menu')} onClick={() => onPick('menu_only')} />
            <Choice label={t('Contract', 'Contract')} onClick={() => onPick('contract')} />
            <Choice label={t('Note of payment', 'Note of payment')} onClick={() => onPick('payment_note')} />
            <Choice label={t('Liquidation', 'Liquidation')} disabled />
          </div>
        ) : (
          <div className="space-y-2">
            <Choice
              label={t('Quotation (Detailed)', 'Quotation (Detailed)')}
              onClick={() => onPick('quote_no_costs')}
            />
            <Choice
              label={t('Quotation (Summary)', 'Quotation (Summary)')}
              onClick={() => onPick('quote_summary')}
            />
          </div>
        )}
      </div>
    </div>
  )
}
/* Event Info */
function EventInfoDoc({
  header,
  fmtN,
  fmtC,
  paymentPlan = null,
}: {
  header: any | null
  fmtN: (n: number | null | undefined) => string
  fmtC: (n: number | null | undefined) => string
  paymentPlan?: ComputedPayment | null
}) {
  // i18n
  const _t = useECT() as unknown as (k: string, fb?: string) => string
  const t = useCallback((k: string, fb?: string) => _t(k, fb), [_t])

  const people = Number(header?.people_count ?? 0) || 0
  const bpp = Number(header?.budget_per_person_vnd ?? 0) || 0
  const btot =
    header?.budget_total_vnd != null
      ? Number(header.budget_total_vnd)
      : people * bpp
  const startHHmm = onlyHHmm(header?.start_at)
  const endHHmm = onlyHHmm(header?.end_at)
  const serviceH = hoursBetweenISO(header?.start_at, header?.end_at)
  const eventDateStr = formatDateDMY(
    (header?.event_date ?? header?.date ?? header?.eventDate ?? null) as any
  )

  // Payment term da DB (fallback)
  const paymentTermDb = pickFirst(
    header?.payment_term,
    header?.payment_terms,
    header?.payment_policy,
    header?.payment_condition
  )

  // Payment term calcolato (preferito)
  const paymentTermFromComputed = React.useMemo(() => {
    const p = paymentPlan
    if (!p) return null
    if (p.isFull) return t('eventinfo.payment.full', 'Full')
    const d = p.depositPercent
    const b = p.balancePercent
    if (d != null && b != null) return `${d}% - ${b}%`
    if (d != null) return `${d}% ${t('Deposit', 'Deposit')}`
    if (b != null) return `${b}% ${t('Balance', 'Balance')}`
    return null
  }, [paymentPlan, t])

  const paymentTerm =
    paymentTermFromComputed ?? (paymentTermDb ? String(paymentTermDb) : '—')

  const [branchProviderName, setBranchProviderName] = React.useState<string>('—')
  const looksLikeId = (s: string) =>
    /^[0-9]+$/.test(s) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)

  const extractNameFromObj = (o: any): string | null => {
    if (!o || typeof o !== 'object') return null
    return (
      o.name ?? o.label ?? o.title ?? o.display_name ??
      (typeof o.branch_name === 'string' ? o.branch_name : null) ?? null
    )
  }

  useEffect(() => {
    let cancelled = false

    const localName =
      extractNameFromObj(header?.branch_provider) ??
      pickFirst(
        header?.branch_provider_name,
        header?.provider_branch_name,
        header?.branch_name
      )

    if (typeof localName === 'string' && localName.trim() && !looksLikeId(localName.trim())) {
      setBranchProviderName(localName.trim())
      return
    }

    const idLike =
      pickFirst(
        (typeof header?.branch_provider === 'string' ? header?.branch_provider : null),
        header?.branch_provider_id,
        header?.provider_branch_id,
        header?.branch_id,
        header?.provider_id
      ) ?? null

    async function resolveFromDb(id: string) {
      const tables = [
        'branches','branch_providers','provider_branches','company_branches','providers','locations',
      ]
      for (const tname of tables) {
        try {
          const { data, error } = await supabase.from(tname).select('*').eq('id', id).maybeSingle()
          if (cancelled) return
          if (!error && data) {
            const name =
              data.name ?? data.label ?? data.title ?? data.display_name ?? data.branch_name ?? null
            if (typeof name === 'string' && name.trim()) {
              setBranchProviderName(name.trim())
              return
            }
          }
        } catch {}
      }
      setBranchProviderName('—')
    }

    if (idLike && typeof idLike === 'string' && idLike.trim()) {
      resolveFromDb(idLike.trim())
    } else {
      setBranchProviderName('—')
    }

    return () => { cancelled = true }
  }, [header])

  // ▼ Customer type: normalizza e traduce
  const customerTypeLabel = React.useMemo(() => {
    const flag = (header as any)?.customer_is_company
    if (flag === true || flag === 1 || flag === '1') {
      return t('eventinfo.customer.company', 'Company')
    }
    if (flag === false || flag === 0 || flag === '0') {
      return t('eventinfo.customer.private', 'Private')
    }

    const raw = String(
      (header as any)?.customer_type ??
      (header as any)?.customerType ??
      ''
    ).trim().toLowerCase()

    if (!raw) return '—'

    const COMPANY_SYNONYMS = [
      'company','enterprise','business','firm','firma','società',
      'cong ty','công ty','cty','doanh nghiệp'
    ]
    const PRIVATE_SYNONYMS = [
      'private','individual','personal','privato',
      'ca nhan','cá nhân','canhan'
    ]

    if (COMPANY_SYNONYMS.includes(raw)) {
      return t('eventinfo.customer.company', 'Company')
    }
    if (PRIVATE_SYNONYMS.includes(raw)) {
      return t('eventinfo.customer.private', 'Private')
    }

    // fallback: mostra come arriva (magari già tradotto da DB)
    return (header as any)?.customer_type || '—'
  }, [header, t])

  const Item = ({
    label,
    value,
    noWrap = false,
  }: {
    label: string
    value: React.ReactNode
    noWrap?: boolean
  }) => (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] font-medium text-gray-500">{label}</div>
      <div className={`text-sm text-gray-900 ${noWrap ? 'break-normal whitespace-normal' : 'break-words'}`}>
        {value ?? '—'}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Item label={t('Title', 'Title')} value={header?.title || header?.event_name || '—'} />
        <Item label={t('Date', 'Date')} value={eventDateStr} />
        <Item
          label={t('Time', 'Time')}
          value={
            startHHmm !== '—' || endHHmm !== '—'
              ? `${startHHmm} → ${endHHmm}${serviceH ? ` (${serviceH} ${t('hours', 'hours')})` : ''}`
              : '—'
          }
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Item label={t('Location', 'Location')} value={header?.location || '—'} />
        <Item label={t('Host / POC', 'Host / POC')} value={header?.contact_name || header?.host_name || '—'} />
        <Item label={t('Customer type', 'Customer type')} value={customerTypeLabel} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Item label={t('Phone', 'Phone')} value={header?.contact_phone || '—'} noWrap />
        <Item label={t('Email', 'Email')} value={header?.contact_email || '—'} noWrap />
        <Item label={t('Preferred contact', 'Preferred contact')} value={header?.preferred_contact || '—'} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Item label={t('Company', 'Company')} value={header?.company || '—'} />
        <Item label={t('Company director', 'Company director')} value={header?.company_director || '—'} />
        <Item label={t('Company tax code', 'Company tax code')} value={header?.company_tax_code || '—'} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Item label={t('Company address', 'Company address')} value={header?.company_address || '—'} />
        <Item label={t('Company city', 'Company city')} value={header?.company_city || '—'} />
        <Item label={t('Billing email', 'Billing email')} value={header?.billing_email || '—'} noWrap />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Item label={t('People', 'People')} value={people ? fmtN(people) : '—'} />
        <Item label={t('Budget / person', 'Budget / person')} value={bpp ? fmtC(bpp) : '—'} />
        <Item label={t('Budget (total)', 'Budget (total)')} value={btot ? fmtC(btot) : '—'} />
      </div>

      {/* Payment row (sintetico) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Item label={t('Payment term', 'Payment term')} value={paymentTerm} />
        <Item
          label={t('Due by (deposit/balance)', 'Due by (deposit/balance)')}
          value={`${t('Deposit', 'Deposit')}: ${formatDateDMY(
            (header?.deposit_due_at ??
              header?.deposit_due_date ??
              header?.deposit_due_on ??
              header?.due_deposit) as any
          )} — ${t('Balance', 'Balance')}: ${formatDateDMY(
            (header?.balance_due_at ??
              header?.balance_due_date ??
              header?.balance_due_on ??
              header?.due_balance) as any
          )}`}
        />
        <Item label={t('Branch provider', 'Branch provider')} value={branchProviderName} />
      </div>

      <div className="grid grid-cols-1">
        <div className="text-[11px] font-medium text-gray-500">{t('Notes', 'Notes')}</div>
        <div className="text-sm text-gray-900 whitespace-pre-line">
          {header?.notes || '—'}
        </div>
      </div>
    </div>
  )
}

/* Bundles (only qty > 0) */
function BundlesBlock({
  bundles,
  settings,
  itemsMap,
  nameOf,
  fmtN,
  fmtC,
}: {
  bundles: Array<{ id: string; type_key: string; label: string; rows?: any[] }>
  settings: Record<string, BundleConfig>
  itemsMap: Map<string, { unit_cost: number | null }>
  nameOf: (id?: string | null) => string
  fmtN: (n: number | null | undefined) => string
  fmtC: (n: number | null | undefined) => string
}) {
  // i18n
  const _t = useECT() as unknown as (k: string, fb?: string) => string
  const t = useCallback((k: string, fb?: string) => _t(k, fb), [_t])

  if (!bundles?.length)
    return <div className="text-sm text-gray-600">{t('No bundles.', 'No bundles.')}</div>

  return (
    <div className="space-y-6">
      {bundles.map((b) => {
        const cfg = settings?.[b.type_key]
        const limit = Math.max(
          0,
          cfg?.maxModifiers ??
            (Array.isArray(cfg?.modifierSlots) ? cfg!.modifierSlots.length : 0)
        )
        const markup = Number(cfg?.markupX ?? 1) > 0 ? Number(cfg?.markupX) : 1
        let subCost = 0, subPrice = 0

        const visibleRows = (b.rows || []).filter((r) => Number(r?.qty ?? 0) > 0)

        return (
          <div key={b.id} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 text-sm font-semibold flex items-center justify-between">
              <span>{b.label || cfg?.label || b.type_key}</span>
              <span className="text-gray-500 markup-flag">
                {t('Markup ×', 'Markup ×')}{markup.toFixed(2)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-700">
                    <th className="text-left px-3 py-2">{t('Dish / Item', 'Dish / Item')}</th>
                    <th className="text-left px-3 py-2">{t('Modifiers', 'Modifiers')}</th>
                    <th className="text-right px-3 py-2 w-[100px]">{t('Qty', 'Qty')}</th>
                    <th className="text-right px-3 py-2 w-[120px] print-hide-costs print-hide-menu-money">
                      {t('Unit cost', 'Unit cost')}
                    </th>
                    <th className="price-col text-right px-3 py-2 w-[120px] print-hide-menu-money">
                      {t('Unit price', 'Unit price')}
                    </th>
                    <th className="text-right px-3 py-2 w-[140px] print-hide-costs print-hide-menu-money">
                      {t('Subtotal cost', 'Subtotal cost')}
                    </th>
                    <th className="price-col text-right px-3 py-2 w-[140px] print-hide-menu-money">
                      {t('Subtotal price', 'Subtotal price')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleRows.map((r) => {
                    const q = Math.max(0, Number(r.qty ?? 0))
                    let rowCost = 0, rowPrice = 0
                    const mods: string[] = Array.isArray(r.modifiers) ? r.modifiers.slice(0, limit) : []

                    if (r.dish_id) {
                      const baseCost =
                        Number(itemsMap.get(String(r.dish_id))?.unit_cost ?? 0) || 0
                      rowCost += baseCost
                      rowPrice += baseCost * markup
                    }
                    for (const mid of mods) {
                      if (!mid) continue
                      const mCost = Number(itemsMap.get(String(mid))?.unit_cost ?? 0) || 0
                      rowCost += mCost
                      rowPrice += mCost * markup
                    }

                    const subC = rowCost * q
                    const subP = rowPrice * q
                    subCost += subC
                    subPrice += subP

                    return (
                      <tr key={r.id ?? `${r.dish_id}-${mods.join('-')}`}>
                        <td className="px-3 py-2">{nameOf(r.dish_id)}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {mods.length ? mods.map(nameOf).join(', ') : '–'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtN(q)}</td>
                        <td className="px-3 py-2 text-right tabular-nums print-hide-costs print-hide-menu-money">{fmtC(rowCost || 0)}</td>
                        <td className="price-col px-3 py-2 text-right tabular-nums print-hide-menu-money">{fmtC(rowPrice || 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums print-hide-costs print-hide-menu-money">{fmtC(subC)}</td>
                        <td className="price-col px-3 py-2 text-right tabular-nums print-hide-menu-money">{fmtC(subP)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50 bundles-subtotal-row">
                    <td colSpan={5} className="px-3 py-2 text-right font-semibold">
                      {t('Subtotal', 'Subtotal')}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums print-hide-costs print-hide-menu-money">
                      {fmtC(subCost)}
                    </td>
                    <td className="price-col px-3 py-2 text-right font-semibold tabular-nums print-hide-menu-money">
                      {fmtC(subPrice)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* Equipment (qty > 0) */
function EquipmentBlock({
  rows,
  catalog,
  fmtN,
  fmtC,
}: {
  rows: any[]
  catalog: any[]
  fmtN: (n: number | null | undefined) => string
  fmtC: (n: number | null | undefined) => string
}) {
  // i18n
  const _t = useECT() as unknown as (k: string, fb?: string) => string
  const t = useCallback((k: string, fb?: string) => _t(k, fb), [_t])

  const rowsPos = (rows || []).filter((r) => Number(r?.qty ?? 0) > 0)
  if (!rowsPos.length) return <div className="text-sm text-gray-600">{t('No equipment.', 'No equipment.')}</div>
  const index = new Map(catalog.map((e) => [e.id, e]))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-700">
            <th className="text-left px-3 py-2">{t('Name', 'Name')}</th>
            <th className="text-left px-3 py-2">{t('Category', 'Category')}</th>
            <th className="text-right px-3 py-2 w-[100px]">{t('Qty', 'Qty')}</th>
            <th className="text-right px-3 py-2 w-[120px] print-hide-costs">{t('Unit cost', 'Unit cost')}</th>
            <th className="price-col text-right px-3 py-2 w-[120px]">{t('Unit price', 'Unit price')}</th>
            <th className="text-right px-3 py-2 w-[140px] print-hide-costs">{t('Subtotal cost', 'Subtotal cost')}</th>
            <th className="price-col text-right px-3 py-2 w-[140px]">{t('Subtotal price', 'Subtotal price')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rowsPos.map((r: any) => {
            const base = index.get(r.equipment_id || '')
            const qty = Number(r.qty ?? 0) || 0
            const unitCostOverride =
              r.unit_cost_override != null ? Number(r.unit_cost_override) : null
            const unitCost =
              unitCostOverride != null
                ? Number.isFinite(unitCostOverride)
                  ? unitCostOverride!
                  : 0
                : Number(base?.cost ?? 0) || 0
            const markupX =
              r.markup_x_override != null ? Number(r.markup_x_override) || 1 : null
            const unitPrice =
              markupX != null
                ? unitCost * markupX
                : Number(base?.final_price ?? 0) || unitCost
            const subC = qty * unitCost
            const subP = qty * unitPrice
            return (
              <tr key={r.id}>
                <td className="px-3 py-2">{base?.name ?? '—'}</td>
                <td className="px-3 py-2">{base?.category_name ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtN(qty)}</td>
                <td className="px-3 py-2 text-right tabular-nums print-hide-costs">{fmtC(unitCost)}</td>
                <td className="price-col px-3 py-2 text-right tabular-nums">{fmtC(unitPrice)}</td>
                <td className="px-3 py-2 text-right tabular-nums print-hide-costs">{fmtC(subC)}</td>
                <td className="price-col px-3 py-2 text-right tabular-nums">{fmtC(subP)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* Staff (hours > 0) */
function StaffBlock({
  rows,
  markupMul,
  fmtN,
  fmtC,
}: {
  rows: any[]
  markupMul: number
  fmtN: (n: number | null | undefined) => string
  fmtC: (n: number | null | undefined) => string
}) {
  // i18n
  const _t = useECT() as unknown as (k: string, fb?: string) => string
  const t = useCallback((k: string, fb?: string) => _t(k, fb), [_t])

  const rowsPos = (rows || []).filter((r) => Number(r?.hours ?? 0) > 0)
  if (!rowsPos.length) return <div className="text-sm text-gray-600">{t('No staff.', 'No staff.')}</div>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-700">
            <th className="text-left px-3 py-2">{t('Name', 'Name')}</th>
            <th className="text-left px-3 py-2">{t('Role', 'Role')}</th>
            <th className="text-right px-3 py-2 w-[120px] print-hide-costs">{t('Cost / hour', 'Cost / hour')}</th>
            <th className="text-right px-3 py-2 w-[100px]">{t('Hours', 'Hours')}</th>
            <th className="text-right px-3 py-2 w-[140px] print-hide-costs">{t('Subtotal cost', 'Subtotal cost')}</th>
            <th className="price-col text-right px-3 py-2 w-[140px]">{t('Subtotal price', 'Subtotal price')}</th>
            <th className="text-left px-3 py-2">{t('Notes', 'Notes')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rowsPos.map((r: any) => {
            const unit = Number(r.cost_per_hour || 0) || 0
            const hours = Number(r.hours || 0) || 0
            const subC = unit * hours
            const subP = subC * (Number(markupMul || 1) || 1)
            return (
              <tr key={r.id}>
                <td className="px-3 py-2">{r.name || '—'}</td>
                <td className="px-3 py-2">{r.role || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums print-hide-costs">{fmtC(unit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtN(hours)}</td>
                <td className="px-3 py-2 text-right tabular-nums print-hide-costs">{fmtC(subC)}</td>
                <td className="price-col px-3 py-2 text-right tabular-nums">{fmtC(subP)}</td>
                <td className="px-3 py-2 text-gray-600 whitespace-pre-line">
                  {r.notes ?? '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
/* Transport (only rows with price > 0) */
function TransportBlock({
  rows,
  settings,
  fmtN,
  fmtC,
}: {
  rows: any[]
  settings: { settings: { markup_x: number | null } | null; vehicleTypes: any[] }
  fmtN: (n: number | null | undefined) => string
  fmtC: (n: number | null | undefined) => string
}) {
  // i18n
  const _t = useECT() as unknown as (k: string, fb?: string) => string
  const t = useCallback((k: string, fb?: string) => _t(k, fb), [_t])

  const vt = settings.vehicleTypes || []
  const globalMarkup = Number(settings.settings?.markup_x ?? 1) || 1
  const lookupCostPerKm = (vehicle_key: string | null) => {
    if (!vehicle_key) return null
    const byId = vt.find(
      (v: any) => v.id === vehicle_key || String(v.id) === String(vehicle_key)
    )
    if (byId) return Number(byId.cost_per_km ?? 0) || 0
    const byName = vt.find((v: any) => v.name === vehicle_key)
    if (byName) return Number(byName.cost_per_km ?? 0) || 0
    return null
  }
  const lookupName = (vehicle_key: string | null) => {
    if (!vehicle_key) return '—'
    const byId = vt.find(
      (v: any) => v.id === vehicle_key || String(v.id) === String(vehicle_key)
    )
    if (byId) return byId.name || String(vehicle_key)
    const byName = vt.find((v: any) => v.name === vehicle_key)
    if (byName) return byName.name || String(vehicle_key)
    return String(vehicle_key)
  }

  const rowsPos = (rows || []).filter((r: any) => {
    const dist = Number(r.distance_km ?? 0) || 0
    const trips = r.round_trip ? 2 : 1
    const kmEff = dist * trips
    const cpk = (r.cost_per_km ?? lookupCostPerKm(r.vehicle_key) ?? 0) as number
    const mx = Number(r.markup_x ?? globalMarkup) || 1
    const rowCost = kmEff * cpk
    const rowPrice = rowCost * mx
    return rowPrice > 0
  })

  if (!rowsPos.length)
    return <div className="text-sm text-gray-600">{t('No transport routes.', 'No transport routes.')}</div>

  return (
    <div className="">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-700">
            <th className="text-left px-3 py-2">{t('From → To', 'From → To')}</th>
            <th className="text-left px-3 py-2">{t('Vehicle', 'Vehicle')}</th>
            <th className="text-right px-3 py-2 w-[110px]">{t('Distance (km)', 'Distance (km)')}</th>
            <th className="text-right px-3 py-2 w-[90px]">{t('Trips', 'Trips')}</th>
            <th className="text-right px-3 py-2 w-[120px] print-hide-costs">{t('Cost / km', 'Cost / km')}</th>
            <th className="text-right px-3 py-2 w-[90px]">{t('ETA (min)', 'ETA (min)')}</th>
            <th className="text-right px-3 py-2 w-[120px] print-hide-costs">{t('Markup ×', 'Markup ×')}</th>
            <th className="text-right px-3 py-2 w-[140px] print-hide-costs">{t('Subtotal cost', 'Subtotal cost')}</th>
            <th className="price-col text-right px-3 py-2 w-[140px]">{t('Subtotal price', 'Subtotal price')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rowsPos.map((r: any, idx: number) => {
            const rowKey =
              (r?.id && String(r.id)) ||
              ['t', r.vehicle_key ?? '', r.from_text ?? '', r.to_text ?? '', idx].join('|')

            const dist = Number(r.distance_km ?? 0) || 0
            const trips = r.round_trip ? 2 : 1
            const kmEff = dist * trips
            const cpk = (r.cost_per_km ?? lookupCostPerKm(r.vehicle_key) ?? 0) as number
            const mx = Number(r.markup_x ?? globalMarkup) || 1
            const rowCost = kmEff * cpk
            const rowPrice = rowCost * mx
            return (
              <React.Fragment key={rowKey}>
                <tr className="align-top">
                  <td className="px-3 py-2">
                    <div className="min-w-[220px]">
                      {(r.from_text || '—') + ' → ' + (r.to_text || '—')}
                    </div>
                  </td>
                  <td className="px-3 py-2">{lookupName(r.vehicle_key)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtN(dist)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtN(trips)}</td>
                  <td className="px-3 py-2 text-right tabular-nums print-hide-costs">{fmtC(cpk)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtN(Number(r.eta_minutes || 0))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums print-hide-costs">
                    {mx.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums print-hide-costs">{fmtC(rowCost)}</td>
                  <td className="price-col px-3 py-2 text-right tabular-nums">{fmtC(rowPrice)}</td>
                </tr>
                {r.notes ? (
                  <tr>
                    <td colSpan={9} className="px-3 pt-0 pb-3 text-gray-600 whitespace-pre-line">
                      <div className="rounded-md bg-gray-50 border border-gray-100 px-3 py-2">
                        {r.notes}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* Company assets (subtotal > 0) */
function AssetsBlock({
  rows,
  fmtN,
  fmtC,
}: {
  rows: any[]
  fmtN: (n: number | null | undefined) => string
  fmtC: (n: number | null | undefined) => string
}) {
  // i18n
  const _t = useECT() as unknown as (k: string, fb?: string) => string
  const t = useCallback((k: string, fb?: string) => _t(k, fb), [_t])

  const rowsPos = (rows || []).filter((r: any) => {
    const qty = Number(r.qty ?? 0) || 0
    const unit = Number(r.unit_price_vnd ?? 0) || 0
    const sub = r.include_price ? qty * unit : 0
    return sub > 0
  })
  if (!rowsPos.length)
    return <div className="text-sm text-gray-600">{t('No company assets.', 'No company assets.')}</div>
  return (
    <div className="">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-700">
            <th className="text-left px-3 py-2">{t('Asset', 'Asset')}</th>
            <th className="text-right px-3 py-2 w-[100px]">{t('Qty', 'Qty')}</th>
            <th className="price-col text-right px-3 py-2 w-[140px]">{t('Unit price', 'Unit price')}</th>
            <th className="price-col text-right px-3 py-2 w-[160px]">{t('Subtotal price', 'Subtotal price')}</th>
            <th className="text-left px-3 py-2">{t('Notes', 'Notes')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rowsPos.map((r: any) => {
            const qty = Number(r.qty ?? 0) || 0
            const unit = Number(r.unit_price_vnd ?? 0) || 0
            const sub = r.include_price ? qty * unit : 0
            return (
              <tr key={r.id}>
                <td className="px-3 py-2">{r.asset_name || r.asset_id || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtN(qty)}</td>
                <td className="price-col px-3 py-2 text-right tabular-nums">
                  {r.include_price ? fmtC(unit) : '—'}
                </td>
                <td className="price-col px-3 py-2 text-right tabular-nums">
                  {r.include_price ? fmtC(sub) : '—'}
                </td>
                <td className="px-3 py-2 text-gray-600 whitespace-pre-line">
                  {r.notes ?? '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* Extra fee (only rows with price > 0) */
function ExtraFeeBlock({
  rows,
  fmtN,
  fmtC,
  basePriceForPercent,
  sectionPrices,
  computePrice,
  lsMeta,
}: {
  rows: any[]
  fmtN: (n: number | null | undefined) => string
  fmtC: (n: number | null | undefined) => string
  basePriceForPercent: number
  sectionPrices: Record<'bundles' | 'equipment' | 'staff' | 'transport' | 'assets', number>
  computePrice: (r: any) => number
  lsMeta: ExtraFeeMetaMap
}) {
  // i18n
  const _t = useECT() as unknown as (k: string, fb?: string) => string
  const t = useCallback((k: string, fb?: string) => _t(k, fb), [_t])

  const visible = (rows || []).filter((r) => computePrice(r) > 0)
  if (!visible.length) return <div className="text-sm text-gray-600">{t('No extra fee rows.', 'No extra fee rows.')}</div>

  // 🔤 label i18n per scope (LS → modal avanzata)
  const labelFromExtraLS = (base?: ExtraFeePctBase) => {
    switch (base) {
      case 'bundles': return t('extrafee.scope.bundles', 'BUNDLES')
      case 'equipment': return t('extrafee.scope.equipment', 'EQUIPMENT')
      case 'staff': return t('extrafee.scope.staff', 'STAFF')
      case 'transport': return t('extrafee.scope.transport', 'TRANSPORT')
      case 'assets': return t('extrafee.scope.assets', 'COMPANY ASSETS')
      case 'total_excl_extrafee': return t('extrafee.scope.total_excl_extrafee', 'TOTALS (excl. fees)')
      case 'total_incl_extrafee': return t('extrafee.scope.total_incl_extrafee', 'TOTALS (incl. fees)')
      default: return t('Totals', 'Totals')
    }
  }

  // 🔤 label i18n per scope (DB)
  const labelFromDB = (scope: any) => {
    switch (scope) {
      case 'total':
      case 'total_incl':
        return t('extrafee.scope.total_incl_extrafee', 'TOTALS (incl. fees)')
      case 'total_excl':
        return t('extrafee.scope.total_excl_extrafee', 'TOTALS (excl. fees)')
      case 'bundles': return t('extrafee.scope.bundles', 'BUNDLES')
      case 'equipment': return t('extrafee.scope.equipment', 'EQUIPMENT')
      case 'staff': return t('extrafee.scope.staff', 'STAFF')
      case 'transport': return t('extrafee.scope.transport', 'TRANSPORT')
      case 'assets': return t('extrafee.scope.assets', 'COMPANY ASSETS')
      default: return t('Totals', 'Totals')
    }
  }

  const detailsFrom = (r: any): string => {
    // 1) meta locale (LS) in modalità percentuale
    const m = lsMeta?.[r.id]
    if (m && m.advMode === 'percentage' && String(m.pctValue || '').trim() !== '') {
      const p = fmtPctRaw(m.pctValue)
      return `${p}% ${labelFromExtraLS(m.pctBase)}`
    }

    // 2) percentuale dal DB
    const pctDB = readPct(r)
    if (pctDB != null) {
      const base =
        (typeof r.scopeNorm === 'string' ? r.scopeNorm : null) ||
        normScope(r?.base ?? r?.apply_on ?? r?.scope ?? 'total')
      const pctStr = (pctDB * 100)
        .toFixed(6)
        .replace(/\.0+$/, '')
        .replace(/(\.\d*[1-9])0+$/, '$1')
      return `${pctStr}% ${labelFromDB(base)}`
    }

    // 3) modalità “costo × markup” o “unit”
    return !!r.calc_mode
      ? t('calc (cost × markup)', 'calc (cost × markup)')
      : t('unit', 'unit')
  }

  const unitFrom = (r: any): number | null => {
    if (!r.calc_mode) return r.unit_price == null ? null : Number(r.unit_price || 0)
    return null
  }
  const costFrom = (r: any): number | null => {
    const isPctDB = readPct(r) != null
    if (!!r.calc_mode && !isPctDB) {
      return Number(r.cost || 0) || 0
    }
    return null
  }
  const markupFrom = (r: any): number | null => {
    const isPctDB = readPct(r) != null
    if (!!r.calc_mode && !isPctDB) {
      return Number(r.markup_x || 1) || 1
    }
    return null
  }

  return (
    <div className="">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-700">
            <th className="text-left px-3 py-2">{t('Label', 'Label')}</th>
            <th className="text-right px-3 py-2 w-[80px]">{t('Qty', 'Qty')}</th>
            <th className="text-left px-3 py-2">{t('Details', 'Details')}</th>
            <th className="price-col text-right px-3 py-2 w-[120px]">{t('Unit price', 'Unit price')}</th>
            <th className="text-right px-3 py-2 w-[120px] print-hide-costs">{t('Cost', 'Cost')}</th>
            <th className="text-right px-3 py-2 w-[100px] print-hide-costs">{t('Markup ×', 'Markup ×')}</th>
            <th className="price-col text-right px-3 py-2 w-[140px]">{t('Subtotal price', 'Subtotal price')}</th>
            <th className="text-left px-3 py-2">{t('Notes', 'Notes')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {visible.map((r: any) => {
            const qty = Number(r.qty ?? 1) || 1
            const price = computePrice(r)
            const unitPrice = unitFrom(r)
            const baseCost = costFrom(r)
            const markupX = markupFrom(r)
            return (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-2">{r.label || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtN(qty)}</td>
                <td className="px-3 py-2">{detailsFrom(r)}</td>
                <td className="price-col px-3 py-2 text-right tabular-nums">
                  {unitPrice != null ? fmtC(unitPrice) : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums print-hide-costs">
                  {baseCost != null ? fmtC(baseCost) : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums print-hide-costs">
                  {markupX != null ? markupX.toFixed(2) : '—'}
                </td>
                <td className="price-col px-3 py-2 text-right tabular-nums">{fmtC(price)}</td>
                <td className="px-3 py-2 text-gray-600 whitespace-pre-line">
                  {r.notes ?? '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="hidden" aria-hidden="true">
        Base={fmtC(basePriceForPercent)} Sections B:{fmtC(sectionPrices.bundles)} E:{fmtC(sectionPrices.equipment)} S:{fmtC(sectionPrices.staff)} T:{fmtC(sectionPrices.transport)} A:{fmtC(sectionPrices.assets)}
      </div>
    </div>
  )
}

/* Discounts (amount > 0) */
function DiscountsBlock({
  rows,
  fmtN,
  fmtC,
  totalFromHook,
  discountMeta,
  bundles,
  bundleSettings,
}: {
  rows: any[]
  fmtN: (n: number | null | undefined) => string
  fmtC: (n: number | null | undefined) => string
  totalFromHook?: number
  discountMeta: PctMetaMap
  bundles: Array<{ id: string; type_key: string; label: string }>
  bundleSettings: Record<string, BundleConfig>
}) {
  // i18n
  const _t = useECT() as unknown as (k: string, fb?: string) => string
  const t = useCallback((k: string, fb?: string) => _t(k, fb), [_t])

  const rowsPos = (rows || []).filter((r) => Number(r?.amount ?? 0) > 0)
  const total = Number.isFinite(totalFromHook as number)
    ? (totalFromHook as number)
    : rowsPos.reduce((acc, r) => acc + (Number(r.amount || 0) || 0), 0)
  if (!rowsPos.length)
    return <div className="text-sm text-gray-600">{t('No discounts.', 'No discounts.')}</div>

  const findBundleName = (token: string): string => {
    const tkn = String(token || '').trim()
    if (!tkn) return ''
    const tLower = tkn.toLowerCase()

    const byId = bundles.find((b) => String(b.id) === tkn)
    if (byId) return byId.label || bundleSettings?.[byId.type_key]?.label || byId.type_key

    const byKey = bundles.find((b) => String(b.type_key) === tkn)
    if (byKey) return byKey.label || bundleSettings?.[byKey.type_key]?.label || byKey.type_key

    const byLabel = bundles.find((b) => (b.label || '').toLowerCase() === tLower)
    if (byLabel) return byLabel.label || bundleSettings?.[byLabel.type_key]?.label || byLabel.type_key

    const fromCfg = bundleSettings?.[tkn]
    if (fromCfg?.label) return fromCfg.label

    return tkn
  }

  // 🔤 etichette i18n per scope letti da LocalStorage (meta percentuale)
  const labelFromLS = (scope?: PctScopeLS) => {
    switch (scope) {
      case 'bundles_all': return t('discounts.scope.bundles_all', 'BUNDLES (all)')
      case 'equipment':  return t('discounts.scope.equipment', 'EQUIPMENT')
      case 'staff':      return t('discounts.scope.staff', 'STAFF')
      case 'transport':  return t('discounts.scope.transport', 'TRANSPORT')
      case 'assets':     return t('discounts.scope.assets', 'COMPANY ASSETS')
      case 'total_excl_extrafee':
        return t('discounts.scope.total_excl_extrafee', 'TOTALS (exclude extra fees)')
      case 'total_incl_extrafee':
        return t('discounts.scope.total_incl_extrafee', 'TOTALS (include extra fees)')
      default:
        if (typeof scope === 'string' && scope.startsWith('bundle:'))
          return t('discounts.scope.bundle', 'BUNDLE')
        return t('Totals', 'Totals')
    }
  }

  // 🔤 etichette i18n per scope provenienti dal DB
  const labelFromDB = (scope: any) => {
    switch (scope) {
      case 'total':
      case 'total_incl':
        return t('discounts.scope.total_incl_extrafee', 'TOTALS (include extra fees)')
      case 'total_excl':
        return t('discounts.scope.total_excl_extrafee', 'TOTALS (exclude extra fees)')
      case 'bundles':   return t('discounts.scope.bundles_all', 'BUNDLES (all)')
      case 'equipment': return t('discounts.scope.equipment', 'EQUIPMENT')
      case 'staff':     return t('discounts.scope.staff', 'STAFF')
      case 'transport': return t('discounts.scope.transport', 'TRANSPORT')
      case 'assets':    return t('discounts.scope.assets', 'COMPANY ASSETS')
      default:          return t('Totals', 'Totals')
    }
  }

  const details = (r: any) => {
    // 1) percentuale salvata lato client (LS)
    const m = discountMeta[r.id]
    if (m && String(m.pctValue ?? '').trim() !== '') {
      const p = fmtPctRaw(m.pctValue)
      if (m.scope === 'bundles_all') return `${p}% ${t('discounts.scope.bundles_all', 'BUNDLES (all)')}`
      if (typeof m.scope === 'string' && m.scope.startsWith('bundle:')) {
        const token = m.scope.slice('bundle:'.length)
        const resolved = findBundleName(token)
        return `${p}% ${t('discounts.scope.bundle', 'BUNDLE')} (${resolved})`
      }
      return `${p}% ${labelFromLS(m.scope)}`
    }

    // 2) percentuale dal DB
    const pct = readPct(r)
    if (pct != null) {
      const base =
        (typeof r.scopeNorm === 'string' ? r.scopeNorm : null) ||
        normScope(r?.base ?? r?.apply_on ?? r?.scope ?? 'total')
      const pctStr = (pct * 100)
        .toFixed(6)
        .replace(/\.0+$/, '')
        .replace(/(\.\d*[1-9])0+$/, '$1')
      return `${pctStr}% ${labelFromDB(base)}`
    }

    // 3) non percentuale
    return '—'
  }

  return (
    <div className="">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-700">
            <th className="text-left px-3 py-2">{t('Label', 'Label')}</th>
            <th className="text-left px-3 py-2">{t('Details', 'Details')}</th>
            <th className="price-col text-right px-3 py-2 w-[140px]">{t('Amount', 'Amount')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rowsPos.map((r: any) => (
            <tr key={r.id}>
              <td className="px-3 py-2">{r.label || '—'}</td>
              <td className="px-3 py-2">{details(r)}</td>
              <td className="price-col px-3 py-2 text-right tabular-nums">− {fmtC(Number(r.amount || 0))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 bg-gray-50">
            <td className="px-3 py-2 text-right font-semibold" colSpan={2}>
              {t('Total discounts', 'Total discounts')}
            </td>
            <td className="price-col px-3 py-2 text-right font-semibold tabular-nums">
              − {fmtC(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function TotalsRow({
  label,
  cost,
  price,
  fmtC,
}: {
  label: string
  cost: number
  price: number
  fmtC: (n: number | null | undefined) => string
}) {
  const pct = price > 0 ? (cost / price) * 100 : NaN
  return (
    <div className="mt-3">
      <table className="w-full text-sm">
        <tbody>
          <tr className="border-t border-gray-200">
            <td className="px-3 py-2 text-right font-medium">{label}</td>
            <td className="px-3 py-2 text-right w-[200px] tabular-nums print-hide-costs">
              {fmtC(cost)}{' '}
              {price > 0 && (
                <span className="text-gray-500 text-xs ml-2 print-hide-costs">
                  ({pct.toFixed(1)}%)
                </span>
              )}
            </td>
            <td className="price-col px-3 py-2 text-right w-[160px] tabular-nums">
              {fmtC(price)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function TotalsTable({
  sections,
  grandCost,
  grandPrice,
  discountsTotal,
  priceAfterDiscounts,
  costPctAfter,
  fmtC,
}: {
  sections: Array<{ label: string; cost: number; price: number }>
  grandCost: number
  grandPrice: number
  discountsTotal: number
  priceAfterDiscounts: number
  costPctAfter: number
  fmtC: (n: number | null | undefined) => string
}) {
  // i18n
  const _t = useECT() as unknown as (k: string, fb?: string) => string
  const t = useCallback((k: string, fb?: string) => _t(k, fb), [_t])

  return (
    <div className="">
      <table className="w-full text-sm totals-table">
        <thead>
          <tr className="bg-gray-50 text-gray-700">
            <th className="text-left px-3 py-2">{t('Section', 'Section')}</th>
            <th className="text-right px-3 py-2 w-[200px] print-hide-costs">{t('Cost', 'Cost')}</th>
            <th className="price-col text-right px-3 py-2 w-[160px]">{t('Price', 'Price')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sections.map((s) => (
            <tr key={s.label}>
              <td className="px-3 py-2">{s.label}</td>
              <td className="px-3 py-2 text-right tabular-nums print-hide-costs">
                {fmtC(s.cost)}
                {s.price > 0 && (
                  <span className="text-gray-500 text-xs ml-2 print-hide-costs">
                    ({((s.cost / s.price) * 100).toFixed(1)}%)
                  </span>
                )}
              </td>
              <td className="price-col px-3 py-2 text-right tabular-nums">
                {fmtC(s.price)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 bg-gray-50">
            <td className="px-3 py-3 text-right font-semibold">{t('Totals', 'Totals')}</td>
            <td className="px-3 py-3 text-right font-semibold tabular-nums print-hide-costs">
              {fmtC(grandCost)}{' '}
              {grandPrice > 0 && (
                <span className="text-gray-500 text-xs ml-2 print-hide-costs">
                  ({((grandCost / grandPrice) * 100).toFixed(1)}%)
                </span>
              )}
            </td>
            <td className="price-col px-3 py-3 text-right font-semibold tabular-nums">
              {fmtC(grandPrice)}
            </td>
          </tr>
          <tr className="border-t border-gray-100">
            <td className="px-3 py-2 text-right text-gray-700">{t('Discounts', 'Discounts')}</td>
            <td className="px-3 py-2 text-right text-gray-400 print-hide-costs">-</td>
            <td className="price-col px-3 py-2 text-right font-semibold text-red-700 tabular-nums">
              − {fmtC(discountsTotal)}
            </td>
          </tr>
          <tr className="border-t border-gray-200 bg-gray-50">
            <td className="px-3 py-3 text-right font-semibold">
              {t('Total after discounts', 'Total after discounts')}
            </td>
            <td className="px-3 py-3 text-right font-semibold tabular-nums print-hide-costs">
              {fmtC(grandCost)}{' '}
              <span className="text-gray-500 text-xs ml-2 print-hide-costs">
                ({costPctAfter.toFixed(1)}%)
              </span>
            </td>
            <td className="price-col px-3 py-3 text-right font-semibold tabular-nums">
              {fmtC(priceAfterDiscounts)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function PaymentDueRow({
  fmtC,
  computed,
}: {
  fmtC: (n: number | null | undefined) => string
  computed: ComputedPayment
}) {
  // i18n
  const _t = useECT() as unknown as (k: string, fb?: string) => string
  const t = useCallback((k: string, fb?: string) => _t(k, fb), [_t])

  const { depositAmount, balanceAmount } = computed
  return (
    <div className="mt-2">
      <table className="w-full text-sm">
        <tbody>
          <tr className="border-t border-gray-200 bg-gray-50">
            <td className="px-3 py-2 text-right font-semibold">{t('Payment due', 'Payment due')}</td>
            <td className="px-3 py-2 text-right text-gray-400 print-hide-costs">-</td>
            <td className="price-col px-3 py-2 text-right font-semibold tabular-nums">
              <div className="flex items-center justify-end gap-6">
                <span>{t('Deposit', 'Deposit')}: {fmtC(depositAmount)}</span>
                <span>{t('Balance', 'Balance')}: {fmtC(balanceAmount)}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function PaymentAmountsRow({
  computed,
  fmtC,
}: {
  computed: ComputedPayment
  fmtC: (n: number | null | undefined) => string
}) {
  return <PaymentDueRow computed={computed} fmtC={fmtC} />
}

function Kpis({
  fmtN,
  fmtC,
  marginAfter,
  marginAfterPct,
  costPctAfter,
  peopleCount,
  serviceHours,
  budgetTotal,
  budgetPerPerson,
  priceAfterDiscounts,
}: {
  fmtN: (n: number | null | undefined) => string
  fmtC: (n: number | null | undefined) => string
  marginAfter: number
  marginAfterPct: number
  costPctAfter: number
  peopleCount: number
  serviceHours: number
  budgetTotal: number
  budgetPerPerson: number
  priceAfterDiscounts: number
}) {
  // i18n
  const _t = useECT() as unknown as (k: string, fb?: string) => string
  const t = useCallback((k: string, fb?: string) => _t(k, fb), [_t])

  return (
    <div className="kpi-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 mt-3">
      <KPI label={t('Margin %', 'Margin %')} value={`${marginAfterPct.toFixed(1)}%`} />
      <KPI label={t('Margin', 'Margin')} value={fmtC(marginAfter)} />
      <KPI
        label={t('Cost %', 'Cost %')}
        value={`${costPctAfter.toFixed(1)}%`}
        wrapperClassName="print-hide-costs"
      />
      <KPI label={t('People', 'People')} value={peopleCount > 0 ? fmtN(peopleCount) : '-'} />
      <KPI label={t('Service hours', 'Service hours')} value={serviceHours > 0 ? String(serviceHours) : '-'} />
      <KPI
        wrapperClassName="kpi-budget"
        label={t('Budget (total)', 'Budget (total)')}
        value={budgetTotal > 0 ? fmtC(budgetTotal) : '-'}
        sub={
          peopleCount > 0 && budgetPerPerson > 0
            ? `~ ${fmtC(budgetPerPerson)}/${t('person', 'person')}`
            : undefined
        }
      />
      <KPI
        label={t('Δ vs budget', 'Δ vs budget')}
        valueClassName={
          !budgetTotal || budgetTotal <= 0
            ? 'text-gray-800'
            : priceAfterDiscounts - (budgetTotal || 0) > 0
            ? 'text-red-700'
            : priceAfterDiscounts - (budgetTotal || 0) < 0
            ? 'text-green-700'
            : 'text-gray-800'
        }
        value={
          budgetTotal && budgetTotal > 0
            ? `${priceAfterDiscounts - budgetTotal > 0 ? '+' : ''}${fmtC(
                priceAfterDiscounts - budgetTotal
              )}`
            : '-'
        }
        sub={
          budgetTotal && budgetTotal > 0
            ? (() => {
                const pct = ((priceAfterDiscounts - budgetTotal) / budgetTotal) * 100
                return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`
              })()
            : undefined
        }
      />
    </div>
  )
}

function KPI({
  label,
  value,
  sub,
  valueClassName = '',
  wrapperClassName = '',
}: {
  label: string
  value: string
  sub?: string
  valueClassName?: string
  wrapperClassName?: string
}) {
  return (
    <div className={`kpi-card border border-gray-200 rounded-xl p-3 bg-white shadow-sm ${wrapperClassName}`}>
      <div className="text-xs text-gray-600">{label}</div>
      <div className={`kpi-value text-base font-semibold tabular-nums ${valueClassName}`}>{value}</div>
      {sub && <div className="kpi-sub text-[11px] text-gray-500 tabular-nums">{sub}</div>}
    </div>
  )
}