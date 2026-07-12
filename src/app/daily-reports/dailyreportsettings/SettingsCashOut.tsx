// app/daily-reports/dailyreportsettings/SettingsCashOut.tsx
'use client'

import { useEffect, useState } from 'react'
import { TrashIcon, TagIcon } from '@heroicons/react/24/outline'
import { useDailyReportSettingsContext } from '../_data/DailyReportSettingsContext'
import { DailyReportsDictionary } from '../_i18n'
import Button from '@/components/Button'
import { useSettings } from '@/contexts/SettingsContext'

const SECTION_KEY = 'cashout'

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

/* ===== Main card ===== */
export default function SettingsCashOutCard({ t }: { t: DailyReportsDictionary['dailyreportsettings']['cashOut'] }) {
  const { language } = useSettings()
  const {
    settings,
    loading,
    updateDraft,
    refresh,
  } = useDailyReportSettingsContext()

  const serverCategories = settings?.cashOut?.categories

  const [data, setData] = useState<string[]>([])
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [newCatName, setNewCatName] = useState('')

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

  const handleAddCategory = () => {
    const name = newCatName.trim()
    if (!name) return
    if (data.map(c => c.toLowerCase()).includes(name.toLowerCase())) {
      setNewCatName('')
      return
    }
    const next = [...data, name]
    setData(next)
    syncToContext(next)
    setNewCatName('')
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
        subtitle={language === 'vi' ? 'Cấu hình các danh mục/lý do chi tiền mặt' : 'Configure categories and reasons for daily store cash out withdrawals'}
        icon={TagIcon}
      />
      <div className="space-y-4">
        <section className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50/20 shadow-3xs">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <h3 className="text-sm font-extrabold text-slate-700 tracking-tight leading-none">{t.sectionTitle}</h3>
          </div>

          <div className="p-4 bg-white space-y-4">
            {/* Add Category Section */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 max-w-sm w-full">
                <input
                  type="text"
                  placeholder={t.placeholder}
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddCategory()
                    }
                  }}
                  className="border border-slate-200 rounded-lg px-3 h-9 flex-1 bg-white text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all text-sm"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAddCategory}
                  disabled={!newCatName.trim()}
                  className="h-9 px-3"
                >
                  {t.common.add}
                </Button>
              </div>
              <span className="text-xs text-slate-500 font-extrabold">
                {t.countLabel.replace('{count}', String(data.length))}
              </span>
            </div>

            {/* Categories Tag Grid */}
            {data.length === 0 ? (
              <div className="text-sm text-slate-450 italic font-medium py-3 text-center bg-slate-50/30 rounded-lg border border-dashed border-slate-200">{t.empty}</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {data.map((category, idx) => (
                  <div
                    key={`cashout-cat-${idx}`}
                    className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50/10 hover:border-blue-200 hover:shadow-2xs transition-all shadow-3xs group"
                  >
                    <input
                      type="text"
                      value={category}
                      onChange={(e) => updCategory(idx, e.target.value)}
                      placeholder={t.placeholder}
                      className="bg-transparent font-bold text-slate-800 text-xs focus:outline-none transition-all flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => delCategory(idx)}
                      className="p-1 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors opacity-60 group-hover:opacity-100 cursor-pointer"
                      title={t.common.remove}
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </Card>
  )
}
