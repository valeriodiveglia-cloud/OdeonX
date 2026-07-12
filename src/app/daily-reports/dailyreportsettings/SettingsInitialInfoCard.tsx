// app/daily-reports/dailyreportsettings/SettingsInitialInfoCard.tsx
'use client'

import { useEffect, useState } from 'react'
import { PlusIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon, ClockIcon, XMarkIcon } from '@heroicons/react/24/outline'
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
  thirdParties: string[]
}

const SECTION_KEY = 'initialinfo'
const MAX_THIRD_PARTIES = 6

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
    thirdParties: ['Gojek', 'Grab', 'Capichi'],
  }
}

function move<T>(arr: T[], from: number, to: number) {
  const a = [...arr]
  if (from < 0 || from >= a.length || to < 0 || to >= a.length) return a
  const [it] = a.splice(from, 1)
  a.splice(to, 0, it)
  return a
}

function uniqueCaseInsensitive(list: string[], max?: number) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const v = cleanStr(raw)
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
    if (typeof max === 'number' && out.length >= max) break
  }
  return out
}

/* ===== Shift Card Component ===== */
function RowShift(props: {
  value: ShiftItem
  onChange: (v: ShiftItem) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  t: DailyReportsDictionary['dailyreportsettings']['initialInfo']
}) {
  const { value, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown, t } = props
  return (
    <div className="border border-slate-200 rounded-xl bg-slate-50/10 p-4 relative group hover:border-blue-200 hover:shadow-2xs transition-all flex flex-col gap-3 shadow-3xs">
      {/* Header: Shift Name & Actions */}
      <div className="flex items-center justify-between gap-3">
        <input
          className="bg-transparent border-b border-transparent hover:border-slate-350 focus:border-blue-500 font-bold text-slate-800 text-sm focus:outline-none transition-all px-1 py-0.5 flex-1"
          placeholder={t.shifts.placeholderName}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
          {onMoveUp && (
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!canMoveUp}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              title={t.common.reorder}
            >
              <ArrowUpIcon className="w-3.5 h-3.5" />
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!canMoveDown}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              title={t.common.reorder}
            >
              <ArrowDownIcon className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 rounded-md text-red-500 hover:text-red-750 hover:bg-red-50 transition-colors cursor-pointer"
            title={t.common.remove}
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Time range grid */}
      <div className="grid grid-cols-2 gap-3 mt-1">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-slate-400 font-extrabold tracking-wider uppercase">{t.shifts.placeholderStart}</span>
          <input
            type="time"
            className="border border-slate-200 rounded-lg px-2 py-1.5 w-full bg-white text-slate-800 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all"
            value={value.start}
            onChange={(e) => onChange({ ...value, start: toTime(e.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-slate-400 font-extrabold tracking-wider uppercase">{t.shifts.placeholderEnd}</span>
          <input
            type="time"
            className="border border-slate-200 rounded-lg px-2 py-1.5 w-full bg-white text-slate-800 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all"
            value={value.end}
            onChange={(e) => onChange({ ...value, end: toTime(e.target.value) })}
          />
        </div>
      </div>
    </div>
  )
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
  const [newTPName, setNewTPName] = useState('')

  // Sync from server
  useEffect(() => {
    if (loading) return

    const s = serverInitialInfo
    const loaded: SettingsShape = {
      shifts: migrateShifts(s?.shifts),
      thirdParties: uniqueCaseInsensitive(s?.thirdParties ?? [], MAX_THIRD_PARTIES),
    }

    const final = s ? loaded : defaultSettings()

    if (!initialLoadDone) {
      setInitialLoadDone(true)
      setData(final)
      return
    }
  }, [serverInitialInfo, loading, initialLoadDone])

  const syncToContext = (newData: SettingsShape) => {
    const toSave: SettingsShape = {
      shifts: migrateShifts(
        newData.shifts.map((s) => ({
          name: cleanStr(s.name),
          start: toTime(s.start),
          end: toTime(s.end),
        })),
      ),
      thirdParties: uniqueCaseInsensitive(newData.thirdParties, MAX_THIRD_PARTIES),
    }
    updateDraft('initialInfo', toSave)
    announceDirty(true)
  }

  const announceDirty = (dirty: boolean) => {
    try {
      window.dispatchEvent(new CustomEvent('dailysettings:dirty', { detail: { section: SECTION_KEY, dirty } }))
    } catch { }
  }

  // Save Bar listeners
  useEffect(() => {
    async function onReload() {
      await refresh()
      setInitialLoadDone(false)
    }
    function onDefaults() {
      const snap = defaultSettings()
      setData(snap)
      syncToContext(snap)
    }

    window.addEventListener('dailysettings:reload', onReload)
    window.addEventListener('dailysettings:reset-to-defaults', onDefaults)
    return () => {
      window.removeEventListener('dailysettings:reload', onReload)
      window.removeEventListener('dailysettings:reset-to-defaults', onDefaults)
    }
  }, [refresh])

  const addShift = () => {
    const next = { ...data, shifts: [...data.shifts, { name: '', start: '', end: '' }] }
    setData(next)
    syncToContext(next)
  }

  const updShiftSafe = (i: number, v: ShiftItem) => {
    const nextShifts = [...data.shifts]
    nextShifts[i] = {
      name: v.name,
      start: toTime(v.start),
      end: toTime(v.end),
    }
    const next = { ...data, shifts: nextShifts }
    setData(next)
    syncToContext(next)
  }

  const delShift = (i: number) => {
    const next = { ...data, shifts: data.shifts.filter((_, idx) => idx !== i) }
    setData(next)
    syncToContext(next)
  }

  const moveShiftUp = (i: number) => {
    const next = { ...data, shifts: move(data.shifts, i, i - 1) }
    setData(next)
    syncToContext(next)
  }

  const moveShiftDown = (i: number) => {
    const next = { ...data, shifts: move(data.shifts, i, i + 1) }
    setData(next)
    syncToContext(next)
  }

  const handleAddTP = () => {
    const name = newTPName.trim()
    if (!name || data.thirdParties.length >= MAX_THIRD_PARTIES) return
    if (data.thirdParties.map(t => t.toLowerCase()).includes(name.toLowerCase())) {
      setNewTPName('')
      return
    }
    const next = [...data.thirdParties, name]
    const nextData = { ...data, thirdParties: next }
    setData(nextData)
    syncToContext(nextData)
    setNewTPName('')
  }

  const handleRemoveTP = (index: number) => {
    const next = data.thirdParties.filter((_, i) => i !== index)
    const nextData = { ...data, thirdParties: next }
    setData(nextData)
    syncToContext(nextData)
  }

  return (
    <Card>
      <CardHeader
        title={t.title}
        subtitle={language === 'vi' ? 'Cấu hình ca làm việc và cổng thanh toán bên thứ ba' : 'Configure shift hours and third-party payment provider labels'}
        icon={ClockIcon}
      />
      <div className="space-y-6">
        {/* Shifts */}
        <section className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50/20 shadow-3xs">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <h3 className="text-sm font-extrabold text-slate-700 tracking-tight leading-none">{t.shifts.title}</h3>
            <Button
              variant="outline"
              size="sm"
              icon={PlusIcon}
              onClick={addShift}
              title={t.shifts.addTitle}
              className="h-8 px-2.5 text-xs font-semibold"
            >
              {t.common.add}
            </Button>
          </div>
          <div className="p-4 bg-white">
            {data.shifts.length === 0 ? (
              <div className="text-sm text-slate-450 italic font-medium py-3 text-center bg-slate-50/30 rounded-lg border border-dashed border-slate-200">{t.shifts.empty}</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {data.shifts.map((s, i) => (
                  <RowShift
                    key={`shift-${i}`}
                    value={s}
                    onChange={(v) => updShiftSafe(i, v)}
                    onRemove={() => delShift(i)}
                    onMoveUp={() => moveShiftUp(i)}
                    onMoveDown={() => moveShiftDown(i)}
                    canMoveUp={i > 0}
                    canMoveDown={i < data.shifts.length - 1}
                    t={t}
                  />
                ))}
              </div>
            )}
            <div className="text-[11px] text-slate-400 font-semibold italic pt-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              {t.shifts.hint}
            </div>
          </div>
        </section>

        {/* Third party payments */}
        <section className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50/20 shadow-3xs">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <h3 className="text-sm font-extrabold text-slate-700 tracking-tight leading-none">{t.thirdParties.title}</h3>
            <span className="text-xs text-slate-500 font-bold">
              {t.thirdParties.countLabel
                .replace('{count}', String(data.thirdParties.length))
                .replace('{max}', String(MAX_THIRD_PARTIES))}
            </span>
          </div>
          <div className="p-4 bg-white space-y-4">
            <div className="flex items-center gap-2 max-w-sm">
              <input
                type="text"
                placeholder={t.thirdParties.placeholder}
                value={newTPName}
                onChange={(e) => setNewTPName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddTP()
                  }
                }}
                disabled={data.thirdParties.length >= MAX_THIRD_PARTIES}
                className="border border-slate-200 rounded-lg px-3 h-9 flex-1 bg-white text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all text-sm disabled:bg-slate-50 disabled:text-slate-400"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleAddTP}
                disabled={!newTPName.trim() || data.thirdParties.length >= MAX_THIRD_PARTIES}
                className="h-9 px-3"
              >
                {t.common.add}
              </Button>
            </div>

            {data.thirdParties.length === 0 ? (
              <div className="text-sm text-slate-450 italic font-medium py-3 text-center bg-slate-50/30 rounded-lg border border-dashed border-slate-200">{t.thirdParties.empty}</div>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {data.thirdParties.map((tp, idx) => (
                  <div
                    key={`tp-tag-${idx}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs font-extrabold transition-all hover:bg-blue-100"
                  >
                    <span>{tp}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTP(idx)}
                      className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-blue-200 text-blue-500 hover:text-blue-700 transition-colors cursor-pointer"
                      title={t.common.remove}
                    >
                      <XMarkIcon className="w-3 h-3" />
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
