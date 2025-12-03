// app/daily-reports/dailyreportsettings/SettingsInitialInfoCard.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { PlusIcon, TrashIcon, ArrowsUpDownIcon } from '@heroicons/react/24/outline'
import { DailyReportsDictionary } from '../_i18n'
import { useDailyReportSettingsContext } from '../_data/DailyReportSettingsContext'

/**
 * SettingsInitialInfoCard
 * - Shifts with name + start/end time
 * - Third-party payment labels
 * - Persistence in localStorage
 * - Real-time broadcast after Save (same-tab + cross-tab)
 * - Save Bar events:
 *   - dailysettings:dirty { section: 'initialinfo', dirty }
 *   - dailysettings:save / :reload / :reset-to-defaults
 */

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
const LS_KEY = 'dailysettings.initialInfo.v1'
const MAX_THIRD_PARTIES = 6

/* ===== Card primitives ===== */
function Card(props: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow">{props.children}</div>
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
const TIME_RE = /^\d{2}:\d{2}$/
const toTime = (v: string) => (TIME_RE.test((v ?? '').trim()) ? v.trim() : '')
const cleanStr = (v: string) => String(v ?? '').trim()

function migrateShifts(raw: any): ShiftItem[] {
  // Accepts: ['Lunch','Dinner'] or [{ name, start, end }]
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

function loadFromLS(): SettingsShape | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const shifts = migrateShifts(parsed?.shifts)
    const thirdParties = Array.isArray(parsed?.thirdParties)
      ? parsed.thirdParties.map(cleanStr).filter(Boolean).slice(0, MAX_THIRD_PARTIES)
      : []
    return { shifts, thirdParties }
  } catch {
    return null
  }
}

function saveToLS(v: SettingsShape) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(v))
  } catch { }
}

function defaultSettings(): SettingsShape {
  // Empty times are valid; user can set them later
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

/* ===== Real-time broadcast helper ===== */
function broadcastInitialInfo(value: SettingsShape) {
  // cache for same-tab quick reads
  try {
    const cache = JSON.parse(localStorage.getItem('dr.settings.cache') || '{}')
    localStorage.setItem('dr.settings.cache', JSON.stringify({ ...cache, initialInfo: value }))
    localStorage.setItem('dr.settings.bump', String(Date.now()))
  } catch { }
  // same-tab
  try {
    window.dispatchEvent(new CustomEvent('dr:settings:initialInfo', { detail: { value } }))
  } catch { }
  // cross-tab
  try {
    const bc = new BroadcastChannel('dr-settings')
    bc.postMessage({ type: 'initialInfo', value })
    bc.close()
  } catch { }
}

/* ===== Input rows ===== */
function RowInput(props: {
  value: string
  placeholder?: string
  onChange: (v: string) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  t?: DailyReportsDictionary['dailyreportsettings']['initialInfo']
}) {
  const { value, placeholder, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown, t } = props
  return (
    <div className="flex items-center gap-2">
      <input
        className="border rounded-lg px-2 h-9 flex-1 bg-white"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {(onMoveUp || onMoveDown) && (
        <div className="flex items-center">
          <button
            type="button"
            title={t?.common.reorder}
            className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
            onClick={() => {
              if (canMoveUp && onMoveUp) onMoveUp()
              else if (canMoveDown && onMoveDown) onMoveDown()
            }}
          >
            <ArrowsUpDownIcon className="w-4 h-4" />
          </button>
        </div>
      )}
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
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
      <input
        className="border rounded-lg px-2 h-9 flex-1 bg-white min-w-[12rem]"
        placeholder={t.shifts.placeholderName}
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
      />
      <div className="flex items-center gap-2">
        <input
          type="time"
          className="border rounded-lg px-2 h-9 bg-white"
          placeholder={t.shifts.placeholderStart}
          value={value.start}
          onChange={(e) => onChange({ ...value, start: toTime(e.target.value) })}
        />
        <span className="text-gray-500 text-sm">{t.shifts.to}</span>
        <input
          type="time"
          className="border rounded-lg px-2 h-9 bg-white"
          placeholder={t.shifts.placeholderEnd}
          value={value.end}
          onChange={(e) => onChange({ ...value, end: toTime(e.target.value) })}
        />
      </div>

      <div className="flex items-center gap-2">
        {(onMoveUp || onMoveDown) && (
          <button
            type="button"
            title={t.common.reorder}
            className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
            onClick={() => {
              if (canMoveUp && onMoveUp) onMoveUp()
              else if (canMoveDown && onMoveDown) onMoveDown()
            }}
          >
            <ArrowsUpDownIcon className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          className="p-2 rounded-lg text-red-600 hover:text-red-500 hover:bg-red-50"
          title={t.common.remove}
          onClick={onRemove}
        >
          <TrashIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}

/* ===== Main card ===== */
export default function SettingsInitialInfoCard({ t }: { t: DailyReportsDictionary['dailyreportsettings']['initialInfo'] }) {
  const {
    settings,
    loading,
    updateDraft,
    refresh,
  } = useDailyReportSettingsContext()

  const serverInitialInfo = settings?.initialInfo

  const [data, setData] = useState<SettingsShape>(defaultSettings())
  const [initialLoadDone, setInitialLoadDone] = useState(false)

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

    // If we wanted to sync external updates while editing, we'd need more complex logic.
    // For now, we assume context is the source of truth and we write to it.
    // But if we are typing, we don't want to be overwritten by our own updates coming back.
    // The context 'settings' is the draft, so it should reflect what we just wrote.

    // Actually, if we updateDraft, 'settings' changes. 
    // We should probably just rely on 'settings' if we want controlled component, 
    // but for performance we might keep local state and debounce sync?
    // For simplicity, let's update context immediately and rely on local state for UI, 
    // syncing from context only on initial load or reload.

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

  const isDirty = useMemo(() => {
    // We can't easily know if it's dirty compared to DB without original settings.
    // But the page handles the "Save All" button state based on context.isDirty.
    // The local "Dirty" badge might be inaccurate if we don't have original.
    // Let's rely on the page's save button.
    return true // Placeholder
  }, [])

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
    // We don't need onSave anymore because the page calls context.saveAll()
    // But we might want to listen to 'dailysettings:saved' to reset dirty flags if we had them.

    window.addEventListener('dailysettings:reload', onReload)
    window.addEventListener('dailysettings:reset-to-defaults', onDefaults)
    return () => {
      window.removeEventListener('dailysettings:reload', onReload)
      window.removeEventListener('dailysettings:reset-to-defaults', onDefaults)
    }
  }, [refresh])

  // Handlers - live normalization
  const addShift = () => {
    const next = { ...data, shifts: [...data.shifts, { name: '', start: '', end: '' }] }
    setData(next)
    syncToContext(next)
  }

  const updShiftSafe = (i: number, v: ShiftItem) => {
    const nextShifts = [...data.shifts]
    nextShifts[i] = {
      name: v.name, // Allow empty while typing
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

  const addTP = () => {
    if (data.thirdParties.length >= MAX_THIRD_PARTIES) return
    const next = { ...data, thirdParties: [...data.thirdParties, ''] }
    setData(next)
    syncToContext(next)
  }

  const updTP = (i: number, v: string) => {
    const nextTP = data.thirdParties.map((s, idx) => (idx === i ? v : s))
    const next = { ...data, thirdParties: nextTP }
    setData(next)
    syncToContext(next)
  }

  const delTP = (i: number) => {
    const next = { ...data, thirdParties: data.thirdParties.filter((_, idx) => idx !== i) }
    setData(next)
    syncToContext(next)
  }

  return (
    <Card>
      <CardHeader
        title={t.title}
      // Removed local dirty indicator for simplicity as we rely on global save button
      />
      <div className="p-3 space-y-4">
        {/* Shifts */}
        <section className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t.shifts.title}</h3>
            <button
              type="button"
              onClick={addShift}
              className="inline-flex items-center gap-2 px-3 h-8 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
              title={t.shifts.addTitle}
            >
              <PlusIcon className="w-4 h-4" />
              {t.common.add}
            </button>
          </div>
          <div className="p-3 space-y-3">
            {data.shifts.length === 0 && (
              <div className="text-sm text-gray-500">{t.shifts.empty}</div>
            )}
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
            <div className="text-xs text-gray-500">
              {t.shifts.hint}
            </div>
          </div>
        </section>

        {/* Third party payments */}
        <section className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t.thirdParties.title}</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">
                {t.thirdParties.countLabel
                  .replace('{count}', String(data.thirdParties.length))
                  .replace('{max}', String(MAX_THIRD_PARTIES))}
              </span>
              <button
                type="button"
                onClick={addTP}
                disabled={data.thirdParties.length >= MAX_THIRD_PARTIES}
                className="inline-flex items-center gap-2 px-3 h-8 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
                title={t.thirdParties.addTitle}
              >
                <PlusIcon className="w-4 h-4" />
                {t.common.add}
              </button>
            </div>
          </div>
          <div className="p-3 space-y-2">
            {data.thirdParties.length === 0 && (
              <div className="text-sm text-gray-500">{t.thirdParties.empty}</div>
            )}
            {data.thirdParties.map((s, i) => (
              <RowInput
                key={`tp-${i}`}
                value={s}
                placeholder={t.thirdParties.placeholder}
                onChange={(v) => updTP(i, v)}
                onRemove={() => delTP(i)}
                t={t}
              />
            ))}
          </div>
        </section>
      </div>
    </Card>
  )
}
