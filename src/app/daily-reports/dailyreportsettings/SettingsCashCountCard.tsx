'use client'

import { useEffect, useRef, useState } from 'react'
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {props.children}
    </div>
  )
}
function CardHeader(props: { title: string; subtitle: string; icon: React.ComponentType<{ className?: string }>; right?: React.ReactNode }) {
  const Icon = props.icon
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 pb-3.5 mb-5 flex-wrap">
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

/* ===== Money input con formattazione live ===== */
function MoneyInput(props: {
  value: number
  onChange: (v: number) => void
  className?: string
  min?: number
}) {
  const { value, onChange, className = '', min = 0 } = props
  const [raw, setRaw] = useState<string>(fmt(value))
  const lastValueRef = useRef<number>(value)

  useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value
      setRaw(fmt(value))
    }
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextNum = parseDigits(e.target.value)
    setRaw(fmt(nextNum))
    onChange(Math.max(min, nextNum))
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    const el = e.currentTarget
    requestAnimationFrame(() => {
      try {
        el?.select()
      } catch { }
    })
  }

  function preventWheel(e: React.WheelEvent<HTMLInputElement>) {
    if (document.activeElement === e.currentTarget) e.currentTarget.blur()
  }
  function preventArrow(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault()
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={raw}
      onChange={handleChange}
      onFocus={handleFocus}
      onWheel={preventWheel}
      onKeyDown={preventArrow}
      className={`border-b-2 border-slate-200 focus:border-blue-500 bg-transparent text-slate-800 text-center font-black text-2xl h-12 w-64 focus:outline-none focus:ring-0 transition-all tabular-nums ${className}`}
      placeholder="0"
    />
  )
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
    isDirty,
  } = useDailyReportSettingsContext()

  const [data, setData] = useState<number>(DEFAULT_FLOAT)
  const serverFloatVND = settings?.cashCount?.cashFloatVND
  const [initialLoadDone, setInitialLoadDone] = useState(false)

  useEffect(() => {
    if (loading) return
    const v = Number(serverFloatVND)
    const safe = Number.isFinite(v) && v > 0 ? Math.round(v) : DEFAULT_FLOAT
    if (!initialLoadDone) {
      setInitialLoadDone(true)
      setData(safe)
    }
  }, [serverFloatVND, loading, initialLoadDone])

  useEffect(() => {
    async function onReload() {
      await refresh()
      setInitialLoadDone(false)
    }
    function onDefaults() {
      const snap = DEFAULT_FLOAT
      setData(snap)
      updateDraft('cashCount', { cashFloatVND: snap })
      announceDirty(true)
    }
    window.addEventListener('dailysettings:reload', onReload)
    window.addEventListener('dailysettings:reset-to-defaults', onDefaults)
    return () => {
      window.removeEventListener('dailysettings:reload', onReload)
      window.removeEventListener('dailysettings:reset-to-defaults', onDefaults)
    }
  }, [refresh])

  const setFloat = (v: number) => {
    const val = Math.max(0, Math.round(v))
    setData(val)
    updateDraft('cashCount', { cashFloatVND: val })
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
        right={
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold transition-all ${loading
              ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
              : isDirty
                ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-200 animate-pulse'
                : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
              }`}
          >
            {loading ? t.status.loading : t.status.clean}
          </span>
        }
      />

      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 text-red-800 px-3 py-2 text-sm font-medium">
            {error || 'Load Error'}
          </div>
        )}

        <section className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50/20 shadow-3xs">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50">
            <h3 className="text-sm font-extrabold text-slate-700 tracking-tight leading-none">{t.sectionTitle}</h3>
          </div>

          <div className="p-6 bg-white flex flex-col items-center justify-center gap-5">
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs text-slate-400 font-extrabold tracking-wider uppercase">{t.label}</span>
              <div className="flex items-center gap-2">
                <MoneyInput value={data} onChange={setFloat} />
                <span className="text-sm font-extrabold text-slate-400 self-end mb-1">VND</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 mt-2 max-w-lg w-full border-t border-slate-100 pt-4">
              <div className="flex flex-col gap-2 items-center">
                <span className="text-[10px] text-slate-400 font-extrabold tracking-wider uppercase">
                  {language === 'vi' ? 'Giảm' : 'Decrease'}
                </span>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFloat(data - 100_000)}
                    title={t.buttons.minus100k}
                    className="h-8 px-2.5 text-[10px] font-semibold"
                  >
                    -100K
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFloat(data - 500_000)}
                    title={t.buttons.minus500k}
                    className="h-8 px-2.5 text-[10px] font-semibold"
                  >
                    -500K
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFloat(data - 1_000_000)}
                    title={t.buttons.minus1m}
                    className="h-8 px-2.5 text-[10px] font-semibold"
                  >
                    -1M
                  </Button>
                </div>
              </div>

              <div className="hidden sm:block w-px h-10 bg-slate-200 self-end mb-1" />

              <div className="flex flex-col gap-2 items-center">
                <span className="text-[10px] text-slate-400 font-extrabold tracking-wider uppercase">
                  {language === 'vi' ? 'Tăng' : 'Increase'}
                </span>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFloat(data + 100_000)}
                    title={t.buttons.plus100k}
                    className="h-8 px-2.5 text-[10px] font-semibold"
                  >
                    +100K
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFloat(data + 500_000)}
                    title={t.buttons.plus500k}
                    className="h-8 px-2.5 text-[10px] font-semibold"
                  >
                    +500K
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFloat(data + 1_000_000)}
                    title={t.buttons.plus1m}
                    className="h-8 px-2.5 text-[10px] font-semibold"
                  >
                    +1M
                  </Button>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 w-full my-1" />

            <Button
              variant="outline"
              size="sm"
              onClick={() => setFloat(DEFAULT_FLOAT)}
              title={t.buttons.defaultTitle}
              className="text-xs text-blue-600 hover:text-blue-750 bg-white hover:bg-slate-50 border-slate-200 h-9 px-4 font-bold"
            >
              {language === 'vi' ? 'Đặt về mặc định (3,000,000 VND)' : 'Reset to default (3,000,000 VND)'}
            </Button>
          </div>
        </section>
      </div>
    </Card>
  )
}
