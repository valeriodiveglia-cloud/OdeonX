'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDailyReportSettings } from '../_data/useDailyReportSettings'
import { DailyReportsDictionary } from '../_i18n'

const SECTION_KEY = 'cashcount'
const DEFAULT_FLOAT = 3_000_000
const FLOAT_CACHE_KEY = 'dr.settings.cashFloatByBranch'

/* ===== Card primitives ===== */
function Card(props: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow">
      {props.children}
    </div>
  )
}
function CardHeader(props: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">{props.title}</h2>
      </div>
      <div className="flex items-center gap-2">{props.right}</div>
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

  // Sync esterno verso interno
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
      } catch {}
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
      className={`border rounded-lg px-2 w-full h-9 text-right bg-white tabular-nums ${className}`}
      placeholder="0"
    />
  )
}

/* ===== Main ===== */
export default function SettingsCashCountCard({ t }: { t: DailyReportsDictionary['dailyreportsettings']['cashCount'] }) {
  const {
    branchName,
    cashFloatVND: serverFloatVND,
    loading,
    error,
    saveCashFloatVND,
    refresh,
  } = useDailyReportSettings()

  // Stato locale di editing
  const [data, setData] = useState<number>(DEFAULT_FLOAT)
  const [dbSnap, setDbSnap] = useState<number>(DEFAULT_FLOAT)

  // Flags per gestione sync
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [userEdited, setUserEdited] = useState(false)

  // Sincronizza dai dati del server:
  // - Primo load: UI segue sempre il DB
  // - Dopo: aggiorna solo se l'utente non ha modificato
  useEffect(() => {
    if (loading) return

    const v = Number(serverFloatVND)
    const safe = Number.isFinite(v) && v > 0 ? Math.round(v) : DEFAULT_FLOAT

    if (!initialLoadDone) {
      setInitialLoadDone(true)
      setUserEdited(false)
      setDbSnap(safe)
      setData(safe)
      return
    }

    setDbSnap(safe)
    if (!userEdited) {
      setData(safe)
    }
  }, [serverFloatVND, loading, initialLoadDone, userEdited])

  const isDirty = useMemo(
    () => Math.round(dbSnap) !== Math.round(data),
    [dbSnap, data],
  )

  const announceDirty = (dirty: boolean) => {
    try {
      window.dispatchEvent(
        new CustomEvent('dailysettings:dirty', {
          detail: { section: SECTION_KEY, dirty },
        }),
      )
    } catch {}
  }

  useEffect(() => {
    announceDirty(isDirty)
  }, [isDirty])

  // Broadcast immediato verso CashCount del closing, per branch
  function broadcastCashFloat(value: number | null) {
    const cleanBranch = (branchName || '').trim()
    if (!cleanBranch) return

    try {
      const raw = localStorage.getItem(FLOAT_CACHE_KEY) || ''
      let obj: Record<string, number | null> = {}
      if (raw) {
        try {
          obj = JSON.parse(raw) || {}
        } catch {
          obj = {}
        }
      }
      obj[cleanBranch] = value ?? null
      localStorage.setItem(FLOAT_CACHE_KEY, JSON.stringify(obj))
      localStorage.setItem('dr.settings.bump', String(Date.now()))
    } catch {}

    try {
      window.dispatchEvent(
        new CustomEvent('dr:settings:cashFloatVND', {
          detail: { branch: cleanBranch, value },
        }),
      )
    } catch {}

    try {
      const bc = new BroadcastChannel('dr-settings')
      bc.postMessage({ type: 'cashFloatVND', branch: cleanBranch, value })
      bc.close()
    } catch {}
  }

  // Save Bar listeners
  useEffect(() => {
    async function onSave() {
      const toSave = Math.max(0, Math.round(data))

      // Aggiorna subito cache locale per questo branch
      broadcastCashFloat(toSave)

      try {
        await saveCashFloatVND(toSave)
        setDbSnap(toSave)
        setUserEdited(false)
        announceDirty(false)
        window.dispatchEvent(
          new CustomEvent('dailysettings:saved', {
            detail: { section: SECTION_KEY, ok: true },
          }),
        )
      } catch {
        window.dispatchEvent(
          new CustomEvent('dailysettings:saved', {
            detail: { section: SECTION_KEY, ok: false },
          }),
        )
      }
    }

    async function onReload() {
      await refresh()
      setInitialLoadDone(false)
      setUserEdited(false)
    }

    function onDefaults() {
      const snap = DEFAULT_FLOAT
      setUserEdited(true)
      setData(snap)
      announceDirty(true)
    }

    window.addEventListener('dailysettings:save', onSave)
    window.addEventListener('dailysettings:reload', onReload)
    window.addEventListener('dailysettings:reset-to-defaults', onDefaults)
    return () => {
      window.removeEventListener('dailysettings:save', onSave)
      window.removeEventListener('dailysettings:reload', onReload)
      window.removeEventListener('dailysettings:reset-to-defaults', onDefaults)
    }
  }, [data, saveCashFloatVND, refresh, branchName])

  const setFloat = (v: number) => {
    setUserEdited(true)
    setData(Math.max(0, Math.round(v)))
  }

  return (
    <Card>
      <CardHeader
        title={t.title}
        right={
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              loading
                ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
                : isDirty
                ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
                : 'bg-gray-100 text-gray-700 ring-1 ring-gray-200'
            }`}
          >
            {loading ? t.status.loading : isDirty ? t.status.dirty : t.status.clean}
          </span>
        }
      />

      <div className="p-3 space-y-4">
        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 text-red-800 px-3 py-2 text-sm">
            {t.errors.loadFailed}
          </div>
        )}

        <section className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200">
            <h3 className="text-sm font-semibold">{t.sectionTitle}</h3>
          </div>

          <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            <label className="flex flex-col gap-1 md:col-span-1">
              <span className="text-xs text-gray-600">{t.label}</span>
              <MoneyInput value={data} onChange={setFloat} />
            </label>

            <div className="flex flex-wrap gap-2 md:justify-end">
              {/* Negativi */}
              <button
                type="button"
                className="px-3 h-9 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                onClick={() => setFloat(data - 100_000)}
                title={t.buttons.minus100k}
              >
                -100k
              </button>
              <button
                type="button"
                className="px-3 h-9 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                onClick={() => setFloat(data - 500_000)}
                title={t.buttons.minus500k}
              >
                -500k
              </button>
              <button
                type="button"
                className="px-3 h-9 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                onClick={() => setFloat(data - 1_000_000)}
                title={t.buttons.minus1m}
              >
                -1M
              </button>

              {/* Positivi */}
              <button
                type="button"
                className="px-3 h-9 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                onClick={() => setFloat(data + 100_000)}
                title={t.buttons.plus100k}
              >
                +100k
              </button>
              <button
                type="button"
                className="px-3 h-9 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                onClick={() => setFloat(data + 500_000)}
                title={t.buttons.plus500k}
              >
                +500k
              </button>
              <button
                type="button"
                className="px-3 h-9 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                onClick={() => setFloat(data + 1_000_000)}
                title={t.buttons.plus1m}
              >
                +1M
              </button>

              <button
                type="button"
                className="px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-90"
                onClick={() => setFloat(DEFAULT_FLOAT)}
                title={t.buttons.defaultTitle}
              >
                {t.buttons.defaultLabel}
              </button>
            </div>
          </div>
        </section>
      </div>
    </Card>
  )
}
