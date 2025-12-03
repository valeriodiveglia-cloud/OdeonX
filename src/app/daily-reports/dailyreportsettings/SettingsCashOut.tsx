// app/daily-reports/dailyreportsettings/SettingsCashOut.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useDailyReportSettingsContext } from '../_data/DailyReportSettingsContext'
import { DailyReportsDictionary } from '../_i18n'

const SECTION_KEY = 'cashout'

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

const cleanStr = (v: string) => String(v ?? '').trim()
function uniqueCaseInsensitive(list: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const v = cleanStr(raw)
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

/* ===== Broadcast helper (verso pagina cashout) ===== */
function broadcastCashOutCategories(value: string[]) {
  try {
    const cache = JSON.parse(localStorage.getItem('dr.settings.cache') || '{}')
    localStorage.setItem(
      'dr.settings.cache',
      JSON.stringify({ ...cache, cashOutCategories: value }),
    )
    localStorage.setItem('dr.settings.bump', String(Date.now()))
  } catch { }

  try {
    window.dispatchEvent(
      new CustomEvent('dr:settings:cashOutCategories', { detail: { value } }),
    )
  } catch { }

  try {
    const bc = new BroadcastChannel('dr-settings')
    bc.postMessage({ type: 'cashOutCategories', value })
    bc.close()
  } catch { }
}

/* ===== Input row ===== */
function RowInput(props: {
  value: string
  placeholder?: string
  onChange: (v: string) => void
  onRemove: () => void
  t?: DailyReportsDictionary['dailyreportsettings']['cashOut']
}) {
  const { value, placeholder, onChange, onRemove, t } = props
  return (
    <div className="flex items-center gap-2">
      <input
        className="border rounded-lg px-2 h-9 flex-1 bg-white"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      <button
        type="button"
        className="p-2 rounded-lg text-red-600 hover:text-red-500 hover:bg-red-50"
        title={t?.common.remove}
        onClick={onRemove}
      >
        <TrashIcon className="w-5 h-5" />
      </button>
    </div>
  )
}

/* ===== Main card ===== */
export default function SettingsCashOutCard({ t }: { t: DailyReportsDictionary['dailyreportsettings']['cashOut'] }) {
  const {
    settings,
    loading,
    updateDraft,
    refresh,
  } = useDailyReportSettingsContext()

  const serverCategories = settings?.cashOut?.categories

  const [data, setData] = useState<string[]>([])
  const [initialLoadDone, setInitialLoadDone] = useState(false)

  // Sync da server → stato locale
  useEffect(() => {
    if (loading) return

    const norm = uniqueCaseInsensitive(serverCategories ?? [])

    if (!initialLoadDone) {
      setInitialLoadDone(true)
      setData(norm)
      return
    }
  }, [serverCategories, loading, initialLoadDone])

  const syncToContext = (newData: string[]) => {
    const toSave = uniqueCaseInsensitive(newData)
    updateDraft('cashOut', { categories: toSave })
    announceDirty(true)
  }

  const isDirty = useMemo(() => {
    return true // Placeholder, relying on global save button
  }, [])

  const announceDirty = (dirty: boolean) => {
    try {
      window.dispatchEvent(
        new CustomEvent('dailysettings:dirty', {
          detail: { section: SECTION_KEY, dirty },
        }),
      )
    } catch { }
  }

  // Save Bar listeners
  useEffect(() => {
    async function onReload() {
      await refresh()
      setInitialLoadDone(false)
    }

    function onDefaults() {
      const snap = ['Food', 'Drink', 'Shipping']
      setData(uniqueCaseInsensitive(snap))
      syncToContext(snap)
    }

    window.addEventListener('dailysettings:reload', onReload)
    window.addEventListener('dailysettings:reset-to-defaults', onDefaults)
    return () => {
      window.removeEventListener('dailysettings:reload', onReload)
      window.removeEventListener('dailysettings:reset-to-defaults', onDefaults)
    }
  }, [refresh])

  const addCategory = () => {
    const next = [...data, '']
    setData(next)
    syncToContext(next)
  }

  const updCategory = (i: number, v: string) => {
    const next = data.map((c, idx) => (idx === i ? v : c))
    setData(next)
    syncToContext(next)
  }

  const delCategory = (i: number) => {
    const next = data.filter((_, idx) => idx !== i)
    setData(next)
    syncToContext(next)
  }

  return (
    <Card>
      <CardHeader
        title={t.title}
      // Removed local dirty indicator
      />
      <div className="p-3 space-y-4">
        {/* Removed local error display as page handles it */}

        <section className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t.sectionTitle}</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">
                {t.countLabel.replace('{count}', String(data.length))}
              </span>
              <button
                type="button"
                onClick={addCategory}
                className="inline-flex items-center gap-2 px-3 h-8 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                title={t.addTitle}
              >
                <PlusIcon className="w-4 h-4" />
                {t.common.add}
              </button>
            </div>
          </div>

          <div className="p-3">
            {/* Max altezza per circa 3–4 righe, poi scroll interno */}
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {data.length === 0 && (
                <div className="text-sm text-gray-500">
                  {t.empty}
                </div>
              )}
              {data.map((c, i) => (
                <RowInput
                  key={`cashout-${i}`}
                  value={c}
                  placeholder={t.placeholder}
                  onChange={v => updCategory(i, v)}
                  onRemove={() => delCategory(i)}
                  t={t}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </Card>
  )
}
