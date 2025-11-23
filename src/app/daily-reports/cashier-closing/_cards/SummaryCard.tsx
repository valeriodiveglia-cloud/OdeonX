// app/daily-reports/cashier-closing/_cards/SummaryCard.tsx
'use client'

import type { HTMLAttributes, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { useDRBranch } from '../../_data/useDRBranch'
import { useDailyReportSettings } from '../../_data/useDailyReportSettings'
import html2canvas from 'html2canvas-pro'
import jsPDF from 'jspdf'
import { useSettings } from '@/contexts/SettingsContext'
import { getDailyReportsDictionary } from '../../_i18n'

/* Primitives */
function Card(
  { children, className = '', ...rest }:
  { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>
) {
  return (
    <div
      {...rest}
      className={`rounded-2xl border border-gray-200 bg-white text-gray-900 shadow ${className}`}
    >
      {children}
    </div>
  )
}

function CardHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 gap-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  )
}

/* Formatters */
function formatVND(n: number) {
  try {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(Math.round(n || 0))
  } catch {
    return `${Math.round(n || 0)} ₫`
  }
}

function formatDateFull(dateStr?: string): string {
  if (!dateStr) return 'N/A'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return 'N/A'
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dayName = days[d.getDay()]
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dayName}, ${dd}/${mm}/${yyyy}`
}

const v = (x: number | undefined) => (Number.isFinite(Number(x)) ? Number(x) : 0)

const DEFAULT_FLOAT = 3_000_000
const TP_MAX = 6

type ThirdPartyAmount = { label: string; amount: number }

/* Helpers third-party dinamici (retro compat con gojek/grab/capichi) */
function tpCleanStr(v: string) {
  return String(v ?? '').trim()
}

function tpBuildThirdPartyAmounts(payments: PaymentBreakdown): ThirdPartyAmount[] {
  const out: ThirdPartyAmount[] = []

  // 1) prova a usare payments.thirdPartyAmounts se presenti
  const src = Array.isArray(payments.thirdPartyAmounts)
    ? payments.thirdPartyAmounts
    : []
  const seen = new Set<string>()

  for (const item of src) {
    const label = tpCleanStr(item?.label || '')
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ label, amount: v(item.amount) })
    if (out.length >= TP_MAX) return out
  }

  // 2) fallback legacy: gojek / grab / capichi
  if (out.length === 0) {
    const legacyPairs = [
      { label: 'Gojek', amount: v(payments.gojek) },
      { label: 'Grab', amount: v(payments.grab) },
      { label: 'Capichi', amount: v(payments.capichi) },
    ]
    for (const p of legacyPairs) {
      if (!p.label) continue
      const key = p.label.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ label: p.label, amount: p.amount })
      if (out.length >= TP_MAX) break
    }
  }

  return out
}

/* Types */
export type PaymentBreakdown = {
  revenue?: number
  gojek?: number
  grab?: number
  mpos?: number
  unpaid?: number
  setOffDebt?: number
  capichi?: number
  bankTransferEwallet?: number
  cashOut?: number

  repaymentsCashCard?: number
  repaymentsCashOnly?: number

  // questi campi NON arrivano dallo state, li calcoliamo noi
  repaymentCash?: number
  repaymentCard?: number
  depositCash?: number
  depositCard?: number

  // nuovo campo dinamico (opzione B)
  thirdPartyAmounts?: ThirdPartyAmount[]
}

export type Header = {
  dateStr: string
  branch?: string
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

export default function SummaryCard(props: {
  header: Header
  openingFloat: number              // opening float dallo state del modulo (può essere 0)
  payments: PaymentBreakdown
  payouts: number                   // al momento non usato nei totali, tenuto per estensioni future
  deposits: number                  // totale deposits (cash + card)
  depositsCash?: number             // solo cash, opzionale
  countedCash: number
  expectedCash: number              // Net cash (solo cash, senza float), usato come base
  cashDiff: number                  // deprecated, non usato
  onExport?: () => void             // mantenuto per compat, ma non usato
  branchId?: string | null          // opzionale, per lookup provider_branches
}) {
  const {
    header,
    openingFloat,
    payments,
    countedCash,
    expectedCash,
    deposits,
    depositsCash,
  } = props
  const { language } = useSettings()
  const dict = getDailyReportsDictionary(language).cashierClosing
  const t = dict.summary
  const tBranch = dict.initialInfo

  /* === Float effettivo: replica della logica del CashCountCard === */

  const { settings } = useDailyReportSettings()

  // Override live (stessa logica di CashCountCard)
  const [liveFloat, setLiveFloat] = useState<number | null>(null)

  // 0) all mount: leggi cache locale scritta dai Settings (navigazioni stessa tab)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('dr.settings.cache') || ''
      if (!raw) return
      const parsed = JSON.parse(raw || '{}')
      const vNum = Number(parsed?.cashFloatVND)
      if (Number.isFinite(vNum) && vNum > 0) setLiveFloat(Math.round(vNum))
    } catch {}
  }, [])

  // 1) stessa tab: CustomEvent
  useEffect(() => {
    function onLocal(e: Event) {
      const ce = e as CustomEvent<any>
      const vNum = Number(ce?.detail?.value)
      if (Number.isFinite(vNum) && vNum > 0) setLiveFloat(Math.round(vNum))
    }
    window.addEventListener('dr:settings:cashFloatVND', onLocal as EventListener)
    return () => window.removeEventListener('dr:settings:cashFloatVND', onLocal as EventListener)
  }, [])

  // 2) cross-tab: storage bump
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== 'dr.settings.bump') return
      try {
        const raw = localStorage.getItem('dr.settings.cache') || ''
        const parsed = JSON.parse(raw || '{}')
        const vNum = Number(parsed?.cashFloatVND)
        if (Number.isFinite(vNum) && vNum > 0) setLiveFloat(Math.round(vNum))
      } catch {}
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // 3) cross-tab: BroadcastChannel
  useEffect(() => {
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel('dr-settings')
      bc.onmessage = (msg) => {
        const d = msg?.data
        if (d?.type === 'cashFloatVND') {
          const vNum = Number(d?.value)
          if (Number.isFinite(vNum) && vNum > 0) setLiveFloat(Math.round(vNum))
        }
      }
    } catch {}
    return () => {
      try { bc?.close() } catch {}
    }
  }, [])

  // Valore dal DB (stessa shape di CashCountCard)
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

  // Pulizia dell opening float passato dal modulo
  const cleanedOpeningFloat = useMemo(
    () => (Number.isFinite(openingFloat) && openingFloat > 0 ? Math.round(openingFloat) : 0),
    [openingFloat],
  )

  // Composizione finale del float:
  // 1) live override dai settings (uguale a CashCountCard)
  // 2) DB
  // 3) openingFloat del record
  // 4) default 3M
  const effectiveOpeningFloat = useMemo(() => {
    if (liveFloat != null) return liveFloat
    if (dbFloat != null) return dbFloat
    if (cleanedOpeningFloat > 0) return cleanedOpeningFloat
    return DEFAULT_FLOAT
  }, [liveFloat, dbFloat, cleanedOpeningFloat])

  /* === Derived totals === */

  // third-party dinamici (con fallback legacy)
  const thirdPartyAmounts = useMemo(
    () => tpBuildThirdPartyAmounts(payments),
    [payments],
  )
  const thirdPartyTotal = useMemo(
    () => thirdPartyAmounts.reduce((sum, item) => sum + v(item.amount), 0),
    [thirdPartyAmounts],
  )

  // breakdown repayments (cash / card) partendo dai campi reali
  const repaymentTotalAll = v(payments.repaymentsCashCard)
  const repaymentCash = v(payments.repaymentsCashOnly)
  const repaymentCard = Math.max(0, repaymentTotalAll - repaymentCash)

  // breakdown deposits (cash / card) partendo dal totale + cash opzionale
  const depositsAll = v(deposits)
  const depositsCashSafe = v(depositsCash)
  const depositsCard = Math.max(0, depositsAll - depositsCashSafe)

  // gross takings
  const grossTakings = useMemo(() => v(payments.revenue), [payments.revenue])

  // expectedCash prop = Net cash (solo cash, senza float)
  const netCash = useMemo(
    () => (Number.isFinite(expectedCash) ? Number(expectedCash) : 0),
    [expectedCash],
  )

  // expectedDrawerCash = NetCash + effectiveOpeningFloat
  const expectedDrawerCash = useMemo(
    () => netCash + effectiveOpeningFloat,
    [netCash, effectiveOpeningFloat],
  )

  // Variance = countedCash - expectedDrawerCash
  const variance = useMemo(
    () => countedCash - expectedDrawerCash,
    [countedCash, expectedDrawerCash],
  )

  const varianceCls =
    variance === 0 ? 'text-gray-900'
      : variance > 0 ? 'text-emerald-700'
      : 'text-red-700'

  // Non-cash total = third-party + card + bank transfer + card repayments + card deposits
  const nonCashTotal = useMemo(
    () =>
      thirdPartyTotal +
      v(payments.mpos) +
      v(payments.bankTransferEwallet) +
      repaymentCard +
      depositsCard,
    [thirdPartyTotal, payments.mpos, payments.bankTransferEwallet, repaymentCard, depositsCard],
  )

  // Adjustments totali: solo componenti che impattano la cassa (cash)
  const adjustmentsTotal =
    v(payments.unpaid) +
    v(payments.cashOut) +
    repaymentCash +
    depositsCashSafe

  /* Branch basic info (from daily reports selection) */
  const { branch, validating } = useDRBranch({ validate: false })
  const branchLabel = header.branch?.trim() || (validating ? tBranch.branchLoading : (branch?.name || tBranch.branchNone))

  /* Provider branch details (from provider_branches table) used only in PDF */
  const [providerBranch, setProviderBranch] = useState<ProviderBranch | null>(null)

  useEffect(() => {
    let ignore = false

    async function loadProviderBranch() {
      const fallbackId = (branch as any)?.id as string | undefined
      const id = (props.branchId as string | null | undefined) || fallbackId
      const name = (branch as any)?.name as string | undefined || header.branch

      if (!id && !name) {
        if (!ignore) setProviderBranch(null)
        return
      }

      try {
        let query = supabase.from('provider_branches').select('*').limit(1)

        if (id) {
          query = query.eq('id', id)
        } else if (name) {
          query = query.eq('name', name)
        }

        const { data, error } = await query
        if (error) throw error

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
      } catch {
        if (!ignore) setProviderBranch(null)
      }
    }

    loadProviderBranch()
    return () => { ignore = true }
  }, [branch, header.branch, props.branchId])

  async function handleExportClick() {
    let toHide: NodeListOf<Element> | null = null

    try {
      const el = document.querySelector('[data-cashier-summary-root="1"]') as HTMLElement | null
      if (!el) return

      // Nascondi elementi no-print (anche il bottone stesso)
      toHide = document.querySelectorAll('.no-print')
      toHide.forEach(node => node.classList.add('hidden'))

      const canvas = await html2canvas(el, { scale: 2 })
      const imgData = canvas.toDataURL('image/png')

      const pdf = new jsPDF({
        orientation: 'l',
        unit: 'mm',
        format: 'a4',
      })

      const margin = 10
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()

      let headerY = margin

      // Header provider branch solo in PDF
      if (providerBranch) {
        const mainLine = providerBranch.company_name || providerBranch.name
        const branchLine = providerBranch.company_name ? providerBranch.name : ''

        pdf.setFontSize(11)
        if (mainLine) {
          pdf.text(mainLine, margin, headerY)
          headerY += 5
        }

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

        const contactParts: string[] = []
        if (providerBranch.tax_code) contactParts.push(`Tax code: ${providerBranch.tax_code}`)
        if (providerBranch.phone) contactParts.push(`Phone: ${providerBranch.phone}`)
        if (providerBranch.email) contactParts.push(`Email: ${providerBranch.email}`)

        if (contactParts.length > 0) {
          pdf.setFontSize(9)
          pdf.text(contactParts.join('    '), margin, headerY)
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
      const fileName = `cashier-report_${safeDate}.pdf`
      pdf.save(fileName)
    } catch (err) {
      console.error('Failed to export cashier summary pdf', err)
    } finally {
      if (toHide) {
        toHide.forEach(node => node.classList.remove('hidden'))
      }
    }
  }

  return (
    <Card data-cashier-summary-root="1">
      <CardHeader
        title={t.title}
        right={
          <div className="flex items-center gap-2">
            <div
              className="hidden md:flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-50 text-blue-800 ring-1 ring-blue-200"
              title={t.branchTooltip}
            >
              <span className="text-sm font-semibold">{branchLabel}</span>
            </div>
            <button
              type="button"
              onClick={handleExportClick}
              className="no-print inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-80"
              title={t.exportTitle}
            >
              {t.export}
            </button>
          </div>
        }
      />

      {/* Body */}
      <div className="p-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Totals */}
        <section className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200">
            <h3 className="text-sm font-semibold">{t.totals}</h3>
          </div>
          <DlGrid>
            <StatRow label={t.labels.revenue} value={grossTakings} strong />
            <StatRow label={t.labels.openingFloat} value={effectiveOpeningFloat} />
            <StatRow label={t.labels.expectedDrawer} value={expectedDrawerCash} strong />
            <StatRow label={t.labels.countedCash} value={countedCash} />
            <StatRow label={t.labels.nonCashTotal} value={nonCashTotal} />
            <StatRow label={t.labels.adjustmentsTotal} value={adjustmentsTotal} />
            <StatRow label={t.labels.variance} value={variance} className={varianceCls} strong />
          </DlGrid>
        </section>

        {/* Breakdown */}
        <section className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200">
            <h3 className="text-sm font-semibold">{t.breakdown}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="border-b md:border-b-0 md:border-r border-gray-200">
              <div className="px-3 py-2 text-xs text-gray-500">{t.nonCash}</div>
              <DlGrid tight>
                {thirdPartyAmounts.map((item, idx) => (
                  <StatRow
                    key={`tp-${idx}`}
                    label={t.labels.thirdPartyPayment.replace(
                      '{label}',
                      item.label || t.labels.thirdPartyFallback.replace('{n}', String(idx + 1))
                    )}
                    value={item.amount}
                  />
                ))}
                <StatRow label={t.labels.cardPayments} value={v(payments.mpos)} />
                <StatRow label={t.labels.bankTransfer} value={v(payments.bankTransferEwallet)} />
                <StatRow label={t.labels.repayCard} value={repaymentCard} />
                <StatRow label={t.labels.depositCard} value={depositsCard} />
              </DlGrid>
            </div>
            <div>
              <div className="px-3 py-2 text-xs text-gray-500">{t.adjustments}</div>
              <DlGrid tight>
                <StatRow label={t.labels.unpaid} value={v(payments.unpaid)} />
                <StatRow label={t.labels.cashOut} value={v(payments.cashOut)} />
                <StatRow label={t.labels.repayCash} value={repaymentCash} />
                <StatRow label={t.labels.depositCash} value={depositsCashSafe} />
              </DlGrid>
            </div>
          </div>
        </section>
      </div>

      {/* Report info */}
      <div className="px-3 pb-3">
        <section className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200">
            <h3 className="text-sm font-semibold">{t.reportInfo}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3">
            <Meta label={t.labels.date} value={formatDateFull(header.dateStr)} />
            <Meta label={t.labels.closedBy} value={header.cashier || 'N/A'} />
          </div>
        </section>
      </div>
    </Card>
  )
}

/* Subcomponents */
function DlGrid({ children, tight = false }: { children: ReactNode; tight?: boolean }) {
  return (
    <dl
      className={[
        'grid grid-cols-[1fr_auto] px-3 py-3 gap-x-3',
        tight ? 'gap-y-1.5' : 'gap-y-2',
      ].join(' ')}
    >
      {children}
    </dl>
  )
}

function StatRow(props: { label: string; value: number; strong?: boolean; className?: string }) {
  const { label, value, strong = false, className = '' } = props
  return (
    <>
      <dt className="text-sm text-gray-700">{label}</dt>
      <dd className={`text-sm tabular-nums text-right ${strong ? 'font-semibold' : ''} ${className}`}>
        {formatVND(value)}
      </dd>
    </>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
      <div className="text-xs text-gray-600">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  )
}
