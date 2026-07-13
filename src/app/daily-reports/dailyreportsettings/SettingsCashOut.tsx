// app/daily-reports/dailyreportsettings/SettingsCashOut.tsx
'use client'

import { useEffect, useState } from 'react'
import { TagIcon } from '@heroicons/react/24/outline'
import { GripVertical } from 'lucide-react'
import { useDailyReportSettingsContext } from '../_data/DailyReportSettingsContext'
import { DailyReportsDictionary } from '../_i18n'
import Button from '@/components/Button'
import { useSettings } from '@/contexts/SettingsContext'

const SECTION_KEY = 'cashout'

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

const DEFAULT_CATEGORIES = ['Food', 'Drinks', 'Shipping', 'Laundry', 'Assets', 'Admin', 'Miscellaneous', 'Salary', 'VAT', 'Marketing', 'Packaging', 'Maintenance']

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

  // Resetta initialLoadDone all'inizio del caricamento
  useEffect(() => {
    if (loading) {
      setInitialLoadDone(false)
    }
  }, [loading])

  // Sync da server → stato locale
  useEffect(() => {
    if (loading) return

    const norm = serverCategories && serverCategories.length > 0
      ? uniqueCaseInsensitive(serverCategories)
      : uniqueCaseInsensitive(DEFAULT_CATEGORIES)

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

  const handleResetToDefault = () => {
    setData(uniqueCaseInsensitive(DEFAULT_CATEGORIES))
    syncToContext(DEFAULT_CATEGORIES)
  }

  // Save Bar listeners
  useEffect(() => {
    async function onReload() {
      await refresh()
      setInitialLoadDone(false)
    }

    function onDefaults() {
      handleResetToDefault()
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

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const delCategory = (i: number) => {
    const catName = data[i] || ''
    const msg = language === 'vi'
      ? `Bạn có chắc chắn muốn xóa danh mục chi "${catName}" không?`
      : `Are you sure you want to delete the cash out category "${catName}"?`
    if (!window.confirm(msg)) return

    const next = data.filter((_, idx) => idx !== i)
    setData(next)
    syncToContext(next)
  }

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    const next = [...data]
    const [moved] = next.splice(draggedIndex, 1)
    next.splice(index, 0, moved)
    setDraggedIndex(index)

    setData(next)
    syncToContext(next)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  return (
    <Card>
      <CardHeader
        title={t.title}
        subtitle={language === 'vi' ? 'Cấu hình các danh mục/lý do chi tiền mặt' : 'Configure categories and reasons for daily store cash out withdrawals'}
        icon={TagIcon}
        right={
          <span className="text-xs text-slate-550 font-bold bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1">
            {t.countLabel.replace('{count}', String(data.length))}
          </span>
        }
      />
      <div className="p-6 bg-white space-y-6">
        {/* Add Category Section */}
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
            className="border border-slate-200 rounded-xl px-3 h-10 flex-1 bg-white text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all text-sm font-semibold shadow-2xs hover:border-slate-350"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleAddCategory}
            disabled={!newCatName.trim()}
            className="h-10 px-4 font-bold text-xs shadow-2xs"
          >
            {t.common.add}
          </Button>
        </div>

        {/* Categories Tag Grid */}
        {data.length === 0 ? (
          <div className="text-sm text-slate-450 italic font-medium py-3 text-center bg-slate-50/30 rounded-lg border border-dashed border-slate-200">
            {t.empty}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.map((category, idx) => {
              const isDragged = draggedIndex === idx
              return (
                <span
                  key={`cashout-cat-${idx}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all select-none ${
                    isDragged
                      ? 'opacity-30 border-dashed border-blue-400 bg-blue-50/10 scale-[0.99] cursor-grabbing'
                      : 'border-slate-200 bg-slate-50/40 text-slate-800 text-xs font-bold cursor-grab active:cursor-grabbing hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <GripVertical className="w-3.5 h-3.5 text-slate-400 cursor-grab active:cursor-grabbing shrink-0" />
                  <span>{category}</span>
                  <button
                    type="button"
                    onClick={() => delCategory(idx)}
                    className="w-4 h-4 rounded-md inline-flex items-center justify-center text-slate-400 hover:text-red-650 hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                    title={t.common.remove}
                    onMouseDown={(e) => e.stopPropagation()}
                    onDragStart={(e) => e.stopPropagation()}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )
            })}
          </div>
        )}

        {/* Footer con ripristino default pulito */}
        <div className="border-t border-slate-100 pt-5 flex justify-end">
          <Button
            variant="danger-light"
            size="sm"
            onClick={handleResetToDefault}
            className="text-xs font-bold rounded-xl"
          >
            {language === 'vi' ? 'Mặc định' : 'Default'}
          </Button>
        </div>
      </div>
    </Card>
  )
}
