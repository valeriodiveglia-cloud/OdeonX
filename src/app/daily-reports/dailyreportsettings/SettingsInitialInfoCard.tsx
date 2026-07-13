// app/daily-reports/dailyreportsettings/SettingsInitialInfoCard.tsx
'use client'

import { useEffect, useState } from 'react'
import { PlusIcon, TrashIcon, ClockIcon } from '@heroicons/react/24/outline'
import { GripVertical } from 'lucide-react'
import { DailyReportsDictionary } from '../_i18n'
import { useDailyReportSettingsContext } from '../_data/DailyReportSettingsContext'
import Button from '@/components/Button'
import { useSettings } from '@/contexts/SettingsContext'

type ShiftItem = {
  name: string
  start: string // "HH:MM" or '' if empty
  end: string   // "HH:MM" or '' if empty
}

type SettingsShape = {
  shifts: ShiftItem[]
}

const SECTION_KEY = 'initialinfo'

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

/* ===== Utils ===== */
const TIME_RE = /^\d{2}:\d{2}$/
const toTime = (v: string) => (TIME_RE.test((v ?? '').trim()) ? v.trim() : '')
const cleanStr = (v: string) => String(v ?? '').trim()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateShifts(raw: any): ShiftItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((it) => {
      if (typeof it === 'string') {
        return { name: cleanStr(it), start: '', end: '' }
      }
      const name = cleanStr(it?.name ?? '')
      const start = toTime(String(it?.start ?? ''))
      const end = toTime(String(it?.end ?? ''))
      return { name, start, end }
    })
    .filter((s: ShiftItem) => !!s.name)
}

function defaultSettings(): SettingsShape {
  return {
    shifts: [
      { name: 'Lunch', start: '', end: '' },
      { name: 'Dinner', start: '', end: '' },
      { name: 'All day', start: '', end: '' },
    ],
  }
}

/* ===== Main card ===== */
export default function SettingsInitialInfoCard({ t }: { t: DailyReportsDictionary['dailyreportsettings']['initialInfo'] }) {
  const { language } = useSettings()
  const {
    settings,
    loading,
    updateDraft,
    refresh,
  } = useDailyReportSettingsContext()

  const serverInitialInfo = settings?.initialInfo

  const [data, setData] = useState<SettingsShape>(defaultSettings())
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  // Resetta initialLoadDone all'inizio del caricamento
  useEffect(() => {
    if (loading) {
      setInitialLoadDone(false)
    }
  }, [loading])

  // Sync from server
  useEffect(() => {
    if (loading) return

    const s = serverInitialInfo
    const loaded: SettingsShape = {
      shifts: migrateShifts(s?.shifts),
    }

    const final = s ? loaded : defaultSettings()

    if (!initialLoadDone) {
      setInitialLoadDone(true)
      setData(final)
      return
    }
  }, [serverInitialInfo, loading, initialLoadDone])

  const syncToContext = (newData: SettingsShape) => {
    const toSave = {
      ...settings?.initialInfo,
      shifts: migrateShifts(
        newData.shifts.map((s) => ({
          name: cleanStr(s.name),
          start: toTime(s.start),
          end: toTime(s.end),
        })),
      ),
    }
    updateDraft('initialInfo', toSave)
    announceDirty(true)
  }

  const announceDirty = (dirty: boolean) => {
    try {
      window.dispatchEvent(new CustomEvent('dailysettings:dirty', { detail: { section: SECTION_KEY, dirty } }))
    } catch { }
  }

  const handleResetToDefault = () => {
    const snap = defaultSettings()
    setData(snap)
    syncToContext(snap)
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

  // Handlers
  const addShift = () => {
    const next = { ...data, shifts: [...data.shifts, { name: '', start: '', end: '' }] }
    setData(next)
    syncToContext(next)
  }

  const updShiftSafe = (i: number, v: ShiftItem) => {
    const nextShifts = [...data.shifts]
    nextShifts[i] = {
      name: cleanStr(v.name),
      start: toTime(v.start),
      end: toTime(v.end),
    }
    const next = { ...data, shifts: nextShifts }
    setData(next)
    syncToContext(next)
  }

  const delShift = (i: number) => {
    const shiftName = data.shifts[i]?.name || ''
    const msg = language === 'vi'
      ? `Bạn có chắc chắn muốn xóa ca làm việc "${shiftName || 'chưa đặt tên'}" không?`
      : `Are you sure you want to delete the shift "${shiftName || 'unnamed'}"?`
    if (!window.confirm(msg)) return

    const next = { ...data, shifts: data.shifts.filter((_, idx) => idx !== i) }
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

    const nextShifts = [...data.shifts]
    const [moved] = nextShifts.splice(draggedIndex, 1)
    nextShifts.splice(index, 0, moved)
    setDraggedIndex(index)

    const next = { ...data, shifts: nextShifts }
    setData(next)
    syncToContext(next)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  return (
    <Card>
      <CardHeader
        title={t.shifts.title}
        subtitle={language === 'vi' ? 'Cấu hình thời gian bắt đầu và kết thúc cho các ca làm việc' : 'Configure starting and ending times for restaurant shifts'}
        icon={ClockIcon}
        right={
          <Button
            variant="primary"
            size="sm"
            icon={PlusIcon}
            onClick={addShift}
            title={t.shifts.addTitle}
            className="h-8 px-2.5 text-xs font-semibold animate-none"
          >
            {t.common.add}
          </Button>
        }
      />
      <div className="p-6 bg-white space-y-6">
        {data.shifts.length === 0 ? (
          <div className="text-sm text-slate-450 italic font-medium py-3 text-center bg-slate-50/30 rounded-lg border border-dashed border-slate-200">
            {t.shifts.empty}
          </div>
        ) : (
          <div className="space-y-2.5">
            {data.shifts.map((s, i) => {
              const isDragged = draggedIndex === i
              return (
                <div
                  key={`shift-${i}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDragEnd={handleDragEnd}
                  className={`flex flex-wrap sm:flex-nowrap items-center gap-3 p-3.5 border transition-all rounded-2xl ${
                    isDragged
                      ? 'opacity-30 border-dashed border-blue-400 bg-blue-50/10 shadow-inner scale-[0.99] select-none cursor-grabbing'
                      : 'border-slate-100 bg-white hover:bg-slate-50 cursor-grab active:cursor-grabbing shadow-xs hover:shadow-sm'
                  }`}
                >
                  {/* Drag handle */}
                  <div className="cursor-grab active:cursor-grabbing p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
                    <GripVertical className="w-4.5 h-4.5" />
                  </div>

                  {/* Shift Name */}
                  <div className="flex-1 min-w-[150px]">
                    <input
                      className="border border-slate-200 rounded-xl px-3 h-10 w-full bg-white text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all text-sm font-semibold shadow-2xs hover:border-slate-350"
                      placeholder={t.shifts.placeholderName}
                      value={s.name}
                      onChange={(e) => updShiftSafe(i, { ...s, name: e.target.value })}
                      onMouseDown={(e) => e.stopPropagation()}
                      onDragStart={(e) => e.stopPropagation()}
                    />
                  </div>

                  {/* Time Range */}
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">{t.shifts.placeholderStart}</span>
                      <input
                        type="time"
                        className="border border-slate-200 rounded-xl px-3 h-10 bg-white text-slate-800 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all shadow-2xs hover:border-slate-350"
                        value={s.start}
                        onChange={(e) => updShiftSafe(i, { ...s, start: toTime(e.target.value) })}
                        onMouseDown={(e) => e.stopPropagation()}
                        onDragStart={(e) => e.stopPropagation()}
                      />
                    </div>
                    <span className="text-slate-400 text-xs self-end mb-2.5 font-bold">{t.shifts.to}</span>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">{t.shifts.placeholderEnd}</span>
                      <input
                        type="time"
                        className="border border-slate-200 rounded-xl px-3 h-10 bg-white text-slate-800 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all shadow-2xs hover:border-slate-350"
                        value={s.end}
                        onChange={(e) => updShiftSafe(i, { ...s, end: toTime(e.target.value) })}
                        onMouseDown={(e) => e.stopPropagation()}
                        onDragStart={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>

                  {/* Remove Action */}
                  <button
                    type="button"
                    onClick={() => delShift(i)}
                    className="p-2.5 rounded-xl text-red-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors cursor-pointer ml-auto"
                    title={t.common.remove}
                  >
                    <TrashIcon className="w-4.5 h-4.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <div className="text-[11px] text-slate-400 font-semibold italic pt-2 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          {t.shifts.hint}
        </div>

        {/* Footer with clean Reset to default */}
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
