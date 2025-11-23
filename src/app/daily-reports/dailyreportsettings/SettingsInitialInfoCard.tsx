// app/daily-reports/dailyreportsettings/SettingsInitialInfoCard.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { PlusIcon, TrashIcon, ArrowsUpDownIcon } from '@heroicons/react/24/outline'
import { DailyReportsDictionary } from '../_i18n'

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
  } catch {}
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
  } catch {}
  // same-tab
  try {
    window.dispatchEvent(new CustomEvent('dr:settings:initialInfo', { detail: { value } }))
  } catch {}
  // cross-tab
  try {
    const bc = new BroadcastChannel('dr-settings')
    bc.postMessage({ type: 'initialInfo', value })
    bc.close()
  } catch {}
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
  const [data, setData] = useState<SettingsShape>(() => {
    const s = loadFromLS() ?? defaultSettings()
    return {
      shifts: migrateShifts(s.shifts),
      thirdParties: uniqueCaseInsensitive(s.thirdParties, MAX_THIRD_PARTIES),
    }
  })
  const [dbSnap, setDbSnap] = useState<SettingsShape | null>(() => loadFromLS() ?? defaultSettings())

  const isDirty = useMemo(() => {
    const A = data
    const B = dbSnap
    const eqStrArr = (x?: string[], y?: string[]) =>
      JSON.stringify(uniqueCaseInsensitive(x ?? [])) === JSON.stringify(uniqueCaseInsensitive(y ?? []))
    const normShifts = (arr?: ShiftItem[]) =>
      JSON.stringify(
        (arr ?? []).map((s) => ({
          name: cleanStr(s.name).toLowerCase(),
          start: toTime(s.start),
          end: toTime(s.end),
        })),
      )
    return (
      !B ||
      normShifts(A.shifts) !== normShifts(B.shifts) ||
      !eqStrArr(A.thirdParties, B.thirdParties)
    )
  }, [data, dbSnap])

  const announceDirty = (dirty: boolean) => {
    try {
      window.dispatchEvent(new CustomEvent('dailysettings:dirty', { detail: { section: SECTION_KEY, dirty } }))
    } catch {}
  }
  useEffect(() => {
    announceDirty(isDirty)
  }, [isDirty])

  // Save Bar listeners
  useEffect(() => {
    function onSave() {
      const toSave: SettingsShape = {
        shifts: migrateShifts(
          data.shifts.map((s) => ({
            name: cleanStr(s.name),
            start: toTime(s.start),
            end: toTime(s.end),
          })),
        ),
        thirdParties: uniqueCaseInsensitive(data.thirdParties, MAX_THIRD_PARTIES),
      }
      try {
        saveToLS(toSave)
        setDbSnap(toSave)
        announceDirty(false)
        // real-time broadcast for consumers
        broadcastInitialInfo(toSave)
        window.dispatchEvent(
          new CustomEvent('dailysettings:saved', { detail: { section: SECTION_KEY, ok: true } }),
        )
      } catch {
        window.dispatchEvent(
          new CustomEvent('dailysettings:saved', { detail: { section: SECTION_KEY, ok: false } }),
        )
      }
    }
    function onReload() {
      const snap = loadFromLS() ?? defaultSettings()
      setData({
        shifts: migrateShifts(snap.shifts),
        thirdParties: uniqueCaseInsensitive(snap.thirdParties, MAX_THIRD_PARTIES),
      })
      setDbSnap(snap)
      announceDirty(false)
    }
    function onDefaults() {
      const snap = defaultSettings()
      setData({
        shifts: migrateShifts(snap.shifts),
        thirdParties: uniqueCaseInsensitive(snap.thirdParties, MAX_THIRD_PARTIES),
      })
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
  }, [data])

  // Handlers - live normalization
  const addShift = () =>
    setData((d) => ({ ...d, shifts: [...d.shifts, { name: '', start: '', end: '' }] }))
  const updShift = (i: number, v: ShiftItem) =>
    setData((d) => {
      const next = [...d.shifts]
      next[i] = {
        name: cleanStr(v.name),
        start: toTime(v.start),
        end: toTime(v.end),
      }
      return { ...d, shifts: next.filter((s) => s.name) }
    })
  const delShift = (i: number) =>
    setData((d) => ({ ...d, shifts: d.shifts.filter((_, idx) => idx !== i) }))
  const moveShiftUp = (i: number) =>
    setData((d) => ({ ...d, shifts: move(d.shifts, i, i - 1) }))
  const moveShiftDown = (i: number) =>
    setData((d) => ({ ...d, shifts: move(d.shifts, i, i + 1) }))

  const addTP = () =>
    setData((d) =>
      d.thirdParties.length >= MAX_THIRD_PARTIES ? d : { ...d, thirdParties: [...d.thirdParties, ''] },
    )
  const updTP = (i: number, v: string) =>
    setData((d) => ({
      ...d,
      thirdParties: uniqueCaseInsensitive(
        d.thirdParties.map((s, idx) => (idx === i ? v : s)),
        MAX_THIRD_PARTIES,
      ),
    }))
  const delTP = (i: number) =>
    setData((d) => ({ ...d, thirdParties: d.thirdParties.filter((_, idx) => idx !== i) }))

  return (
    <Card>
      <CardHeader
        title={t.title}
        right={
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              isDirty
                ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
                : 'bg-gray-100 text-gray-700 ring-1 ring-gray-200'
            }`}
          >
            {isDirty ? t.status.dirty : t.status.clean}
          </span>
        }
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
                onChange={(v) => updShift(i, v)}
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
