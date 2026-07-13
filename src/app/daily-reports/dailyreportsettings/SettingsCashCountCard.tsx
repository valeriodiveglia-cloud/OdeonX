// app/daily-reports/dailyreportsettings/SettingsCashCountCard.tsx
'use client'

import { useEffect, useState } from 'react'
import { useDailyReportSettingsContext } from '../_data/DailyReportSettingsContext'
import { DailyReportsDictionary } from '../_i18n'
import Button from '@/components/Button'
import { BanknotesIcon } from '@heroicons/react/24/outline'
import { useSettings } from '@/contexts/SettingsContext'

const SECTION_KEY = 'cashcount'
const DEFAULT_FLOAT = 3_000_000

/* ===== Card primitives ===== */
function Card(props: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden text-slate-800">
      {props.children}
    </div>
  )
}

function CardHeader(props: { title: string; subtitle: string; icon: React.ComponentType<{ className?: string }>; right?: React.ReactNode }) {
  const Icon = props.icon
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4 bg-slate-50/50 flex-wrap">
      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
        <Icon className="w-5.5 h-5.5" />
      </div>
      <div className="flex-1 min-w-[200px]">
        <h2 className="text-base font-extrabold text-slate-800 tracking-tight leading-none">
          {props.title}
        </h2>
        <span className="text-[11px] text-slate-400 font-bold block mt-1.5 leading-none">
          {props.subtitle}
        </span>
      </div>
      {props.right && <div className="flex items-center gap-2">{props.right}</div>}
    </div>
  )
}

/* ===== Input Field coerente col design system del portale ===== */
function Field({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  suffix?: string
}) {
  return (
    <label className="flex flex-col">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="relative mt-1.5 w-full flex items-center">
        <input
          className="w-full border border-slate-200 rounded-xl px-3.5 h-11 text-slate-800 bg-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm font-bold outline-none shadow-sm pr-14 tabular-nums"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type="text"
          inputMode="numeric"
        />
        {suffix && (
          <span className="absolute right-4 text-xs font-extrabold text-slate-400 select-none pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </label>
  )
}

/* ===== Utils ===== */
function fmt(n: number) {
  try {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
      Math.round(n || 0),
    )
  } catch {
    return String(Math.round(n || 0))
  }
}
function parseDigits(s: string): number {
  const digits = s.replace(/[^\d]/g, '')
  const n = Number(digits || 0)
  return Number.isFinite(n) ? n : 0
}

/* ===== Main ===== */
export default function SettingsCashCountCard({ t }: { t: DailyReportsDictionary['dailyreportsettings']['cashCount'] }) {
  const { language } = useSettings()
  const {
    settings,
    loading,
    updateDraft,
    refresh,
    error,
  } = useDailyReportSettingsContext()

  const [rawVal, setRawVal] = useState<string>(fmt(DEFAULT_FLOAT))
  const serverFloatVND = settings?.cashCount?.cashFloatVND
  const [initialLoadDone, setInitialLoadDone] = useState(false)

  // Resetta initialLoadDone all'inizio del caricamento
  useEffect(() => {
    if (loading) {
      setInitialLoadDone(false)
    }
  }, [loading])

  useEffect(() => {
    if (loading) return
    const v = Number(serverFloatVND)
    const safe = Number.isFinite(v) && v > 0 ? Math.round(v) : DEFAULT_FLOAT
    if (!initialLoadDone) {
      setInitialLoadDone(true)
      setRawVal(fmt(safe))
    }
  }, [serverFloatVND, loading, initialLoadDone])

  useEffect(() => {
    async function onReload() {
      await refresh()
      setInitialLoadDone(false)
    }
    function onDefaults() {
      resetToDefault()
    }
    window.addEventListener('dailysettings:reload', onReload)
    window.addEventListener('dailysettings:reset-to-defaults', onDefaults)
    return () => {
      window.removeEventListener('dailysettings:reload', onReload)
      window.removeEventListener('dailysettings:reset-to-defaults', onDefaults)
    }
  }, [refresh])

  const handleRawChange = (valStr: string) => {
    const nextNum = parseDigits(valStr)
    setRawVal(fmt(nextNum))
    const val = Math.max(0, Math.round(nextNum))
    updateDraft('cashCount', { cashFloatVND: val })
    announceDirty(true)
  }

  const resetToDefault = () => {
    setRawVal(fmt(DEFAULT_FLOAT))
    updateDraft('cashCount', { cashFloatVND: DEFAULT_FLOAT })
    announceDirty(true)
  }

  const announceDirty = (dirty: boolean) => {
    try {
      window.dispatchEvent(
        new CustomEvent('dailysettings:dirty', {
          detail: { section: SECTION_KEY, dirty },
        }),
      )
    } catch { }
  }

  return (
    <Card>
      <CardHeader
        title={t.title}
        subtitle={language === 'vi' ? 'Cấu hình số tiền quỹ cassa mặc định hàng ngày' : 'Configure default daily cash float amount for cashier'}
        icon={BanknotesIcon}
      />

      <div className="p-6 bg-white space-y-6">
        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 text-red-800 px-3 py-2 text-sm font-medium">
            {error || 'Load Error'}
          </div>
        )}

        {/* Input principale allineato a sinistra con label superiore */}
        <div className="max-w-xs">
          <Field
            label={t.label}
            value={rawVal}
            onChange={handleRawChange}
            suffix="VND"
          />
        </div>

        {/* Footer con ripristino default pulito */}
        <div className="border-t border-slate-100 pt-5 flex justify-end">
          <Button
            variant="danger-light"
            size="sm"
            onClick={resetToDefault}
            title={t.buttons.defaultTitle}
            className="text-xs font-bold rounded-xl"
          >
            {language === 'vi' ? 'Mặc định' : 'Default'}
          </Button>
        </div>
      </div>
    </Card>
  )
}
