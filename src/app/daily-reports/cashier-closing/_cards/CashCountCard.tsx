// app/daily-reports/cashier-closing/_cards/CashCountCard.tsx
'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import { useDailyReportSettings } from '../../_data/useDailyReportSettings'
import { useSettings } from '@/contexts/SettingsContext'
import { getDailyReportsDictionary } from '../../_i18n'

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow">{children}</div>
}
function CardHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 gap-3 flex-wrap">
      <div className="flex items-center gap-2"><h2 className="text-base font-semibold">{title}</h2></div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  )
}

function Num({
  value, onChange, min = 0, step = 1, className = '', placeholder, disabled
}: {
  value: number | ''
  onChange: (v: number) => void
  min?: number
  step?: number
  className?: string
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={min}
      step={step}
      value={value === '' || value === 0 ? '' : Number.isFinite(value) ? value : ''}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '') { onChange(NaN); return }
        onChange(Math.max(min, Math.floor(Number(raw || 0))))
      }}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault()
          const grid = e.currentTarget.closest('.cash-count-grid')
          if (!grid) return
          const inputs = Array.from(grid.querySelectorAll('input[type="number"]:not(:disabled)')) as HTMLInputElement[]
          const index = inputs.indexOf(e.currentTarget)
          if (index === -1) return

          let nextIndex = index
          if (e.key === 'ArrowRight') nextIndex = index + 1
          if (e.key === 'ArrowLeft') nextIndex = index - 1
          if (e.key === 'ArrowDown') nextIndex = index + 2
          if (e.key === 'ArrowUp') nextIndex = index - 2

          if (nextIndex >= 0 && nextIndex < inputs.length) {
            inputs[nextIndex].focus()
            // The browser's focus() might not select all in some cases, so we call it explicitly
            inputs[nextIndex].select()
          }
        }
      }}
      placeholder={placeholder || '0'}
      className={`border rounded-lg px-2 w-full ${className} ${disabled ? 'bg-gray-50 text-gray-500' : ''}`}
      disabled={disabled}
    />
  )
}

const DENOMS = [
  { key: 'd500k', face: 500_000 },
  { key: 'd200k', face: 200_000 },
  { key: 'd100k', face: 100_000 },
  { key: 'd50k', face: 50_000 },
  { key: 'd20k', face: 20_000 },
  { key: 'd10k', face: 10_000 },
  { key: 'd5k', face: 5_000 },
  { key: 'd2k', face: 2_000 },
  { key: 'd1k', face: 1_000 },
] as const
const TAKE_ORDER = [...DENOMS]
type DenomKey = typeof DENOMS[number]['key']
type CashShape = Record<DenomKey, number>

function formatVND(n: number) {
  try { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }
  catch { return `${Math.round(n || 0)}` }
}
const emptyBag = (): CashShape =>
  DENOMS.reduce((m, d) => { (m as any)[d.key] = 0; return m }, {} as CashShape)
const sumValue = (bag: CashShape) =>
  DENOMS.reduce((acc, d) => acc + (bag[d.key] || 0) * d.face, 0)

function suggestToTake(available: CashShape, floatTarget: number): CashShape {
  const total = sumValue(available)
  const target = Math.max(0, Math.min(floatTarget, total))
  const needToTake = total - target
  if (needToTake <= 0) return emptyBag()

  let remainToTake = needToTake
  const plan = emptyBag()

  for (const d of TAKE_ORDER) {
    if (remainToTake <= 0) break
    const have = available[d.key] || 0
    const can = Math.min(have, Math.floor(remainToTake / d.face))
    if (can > 0) {
      plan[d.key] = can
      remainToTake -= can * d.face
    }
  }
  if (remainToTake > 0) {
    for (let i = TAKE_ORDER.length - 1; i >= 0 && remainToTake > 0; i--) {
      const ki = TAKE_ORDER[i].key
      const fi = TAKE_ORDER[i].face
      const room = (available[ki] || 0) - (plan[ki] || 0)
      if (room <= 0) continue
      const add = Math.min(room, Math.ceil(remainToTake / fi))
      if (add > 0) {
        plan[ki] = (plan[ki] || 0) + add
        remainToTake -= add * fi
      }
    }
  }
  return plan
}

const DEFAULT_FLOAT = 3_000_000

export default function CashCountCard(props: {
  cash: CashShape
  onChangeCash: (next: CashShape) => void
  floatPlan: CashShape
  onChangeFloatPlan: (next: CashShape) => void
  countedCash: number
  expectedCash: number        // qui lo usiamo come NetCash (solo cash, senza float)
  cashDiff: number            // mantenuto per compatibilità, ma non usato nel calcolo locale
  onClear: () => void
  rightActions?: ReactNode
  readOnly?: boolean
}) {
  const {
    cash, onChangeCash, floatPlan, onChangeFloatPlan,
    countedCash, expectedCash, cashDiff: _ignoredCashDiff, onClear, rightActions, readOnly
  } = props
  const { language } = useSettings()
  const t = getDailyReportsDictionary(language).cashierClosing.cashCount

  const { settings, loading, branchName } = useDailyReportSettings()

  /* Override live logic removed (redundant with useDailyReportSettings broadcast support) */

  /* Valore dal DB (supporta shape piatta o nidificata) */
  const dbFloat = useMemo(() => {
    const s: any = settings || {}
    const n = Number(
      s?.cashFloatVND ??
      s?.cash_count_vnd ??
      s?.cashCount?.cashFloatVND ??
      s?.cash_count?.cashFloatVND
    )
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }, [settings])

  /* Composizione finale del float */
  const floatTarget = useMemo(() => {
    if (dbFloat != null) return dbFloat
    return DEFAULT_FLOAT
  }, [dbFloat])

  /* Plan logica */
  const [planActive, setPlanActive] = useState(false)

  // Auto-activate plan if we receive non-empty floatPlan from parent (e.g. loaded from DB)
  useEffect(() => {
    const hasValues = DENOMS.some(d => (floatPlan[d.key] || 0) > 0)
    if (hasValues) {
      setPlanActive(true)
    }
  }, [floatPlan])

  const [edited, setEdited] = useState<Record<DenomKey, boolean>>({} as Record<DenomKey, boolean>)

  const effectivePlan = useMemo(() => {
    if (!planActive) return emptyBag()
    const total = sumValue(cash)
    const target = Math.max(0, Math.min(floatTarget, total))
    let remainToTake = total - target
    const plan = emptyBag()

    for (let i = 0; i < TAKE_ORDER.length; i++) {
      const { key, face } = TAKE_ORDER[i]
      const have = cash[key] || 0
      if (edited[key]) {
        const chosen = Math.max(0, Math.min((floatPlan[key] || 0), have, Math.floor(Math.max(0, remainToTake) / face)))
        plan[key] = chosen
        remainToTake -= chosen * face
      } else {
        const suggest = Math.min(have, Math.floor(Math.max(0, remainToTake) / face))
        plan[key] = suggest
        remainToTake -= suggest * face
      }
    }
    return plan
  }, [planActive, cash, floatTarget, floatPlan, edited])

  const totalToTake = useMemo(() => sumValue(effectivePlan), [effectivePlan])

  const totalRemain = useMemo(() => {
    const keep = emptyBag()
    for (const d of DENOMS) keep[d.key] = Math.max(0, (cash[d.key] || 0) - (effectivePlan[d.key] || 0))
    return sumValue(keep)
  }, [cash, effectivePlan])

  /* Expected cash in drawer:
     - expectedCash prop viene interpretato come NetCash (solo cash, senza float)
     - expectedDrawerCash = NetCash + floatTarget
  */
  const netCash = useMemo(
    () => {
      const n = Number(expectedCash)
      return Number.isFinite(n) ? n : 0
    },
    [expectedCash],
  )

  const expectedDrawerCash = useMemo(
    () => netCash + floatTarget,
    [netCash, floatTarget],
  )

  const localCashDiff = useMemo(
    () => countedCash - expectedDrawerCash,
    [countedCash, expectedDrawerCash],
  )

  const diffCls =
    localCashDiff === 0 ? 'text-gray-700'
      : localCashDiff > 0 ? 'text-emerald-700'
        : 'text-red-700'

  const diffPillCls =
    localCashDiff === 0 ? 'bg-gray-100 text-gray-800 ring-1 ring-gray-200'
      : localCashDiff > 0 ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
        : 'bg-red-100 text-red-800 ring-1 ring-red-200'

  const changeCash = (key: DenomKey, qty: number) => {
    onChangeCash({ ...cash, [key]: Number.isFinite(qty) ? qty : (cash[key] || 0) })
  }

  const changeTake = (key: DenomKey, raw: number) => {
    setPlanActive(true)
    const idx = TAKE_ORDER.findIndex(d => d.key === key)
    if (idx < 0) return

    const safe = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0
    const nextEdited = { ...edited, [key]: true }

    const total = sumValue(cash)
    const target = Math.max(0, Math.min(floatTarget, total))
    let remainToTake = total - target
    const nextPlan = emptyBag()

    for (let i = 0; i < TAKE_ORDER.length; i++) {
      const { key: k, face } = TAKE_ORDER[i]
      const have = cash[k] || 0

      if (i < idx) {
        if (nextEdited[k]) {
          const chosen = Math.max(0, Math.min((floatPlan[k] || 0), have, Math.floor(Math.max(0, remainToTake) / face)))
          nextPlan[k] = chosen
          remainToTake -= chosen * face
        } else {
          const suggest = Math.min(have, Math.floor(Math.max(0, remainToTake) / face))
          nextPlan[k] = suggest
          remainToTake -= suggest * face
        }
      } else if (i === idx) {
        const capped = Math.min(have, Math.floor(Math.max(0, remainToTake) / face), safe)
        nextPlan[k] = capped
        remainToTake -= capped * face
      } else {
        const suggest = Math.min(have, Math.floor(Math.max(0, remainToTake) / face))
        nextPlan[k] = suggest
        remainToTake -= suggest * face
      }
    }

    setEdited(nextEdited)
    onChangeFloatPlan(nextPlan)
  }

  const doSuggest = () => {
    const plan = suggestToTake(cash, floatTarget)
    onChangeFloatPlan(plan)
    setEdited({} as Record<DenomKey, boolean>)
    setPlanActive(true)
  }

  return (
    <Card>
      <CardHeader
        title={t.title}
        right={
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${loading
                ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
                : 'bg-gray-100 text-gray-700 ring-1 ring-gray-200'
                }`}
              title={t.floatTargetTitle}
            >
              {t.floatTargetPrefix} {formatVND(floatTarget)} VND
            </span>
            <button
              type="button"
              onClick={doSuggest}
              className={`px-3 h-9 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={t.suggestTitle}
              disabled={readOnly}
            >
              {t.suggest}
            </button>
            <button
              type="button"
              onClick={onClear}
              className={`px-3 h-9 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={t.clearTitle}
              disabled={readOnly}
            >
              {t.clear}
            </button>
          </div>
        }
      />

      <div className="p-3">
        <div className="border rounded-xl overflow-hidden">
          <div className="grid grid-cols-5 gap-2 px-3 py-2 text-xs text-gray-600 bg-gray-50">
            <div>{t.headers.denom}</div>
            <div className="text-right">{t.headers.inDrawer}</div>
            <div className="text-right">{t.headers.toTake}</div>
            <div className="text-right">{t.headers.remain}</div>
            <div className="text-right">{t.headers.subtotal}</div>
          </div>

          <div className="divide-y cash-count-grid">
            {DENOMS.map(({ key, face }) => {
              const have = cash[key] || 0
              const keep = Math.max(0, have - (effectivePlan[key] || 0))

              const parentTake = planActive ? (floatPlan[key] || 0) : 0
              const showPlaceholder = planActive && !edited[key] && parentTake === (effectivePlan[key] || 0)
              const placeholder = planActive ? String(effectivePlan[key] || 0) : undefined

              return (
                <div key={String(key)} className="grid grid-cols-5 items-center gap-2 px-3 py-2">
                  <div className="text-sm">{t.denoms[key] || formatVND(face)}</div>

                  <div>
                    <Num
                      value={have}
                      onChange={(v) => changeCash(key, v)}
                      min={0}
                      step={1}
                      className="h-9 text-right"
                      disabled={readOnly}
                    />
                  </div>

                  <div>
                    <Num
                      value={showPlaceholder ? '' : (planActive ? parentTake : 0)}
                      placeholder={placeholder}
                      onChange={(v) => changeTake(key, v)}
                      min={0}
                      step={1}
                      className="h-9 text-right"
                      disabled={readOnly}
                    />
                  </div>

                  <div>
                    <div className="h-9 border rounded-lg bg-gray-50 px-2 flex items-center justify-end text-sm font-medium">
                      {keep}
                    </div>
                  </div>

                  <div className="text-right text-sm font-medium">{formatVND(keep * face)}</div>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-5 items-center gap-2 px-3 py-2 bg-gray-50 border-t">
            <div className="text-xs text-gray-600">{t.headers.totals}</div>
            <div className="text-right text-sm font-semibold">{formatVND(sumValue(cash))}</div>
            <div className="text-right text-sm font-semibold">{formatVND(totalToTake)}</div>
            <div />
            <div className="text-right text-sm font-semibold">{formatVND(totalRemain)}</div>
          </div>
        </div>

        <div className="pt-3 grid grid-cols-5 gap-3">
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <div className="text-xs text-gray-600">{t.expectedDrawer}</div>
            <div className="font-semibold tabular-nums">{formatVND(expectedDrawerCash)}</div>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <div className="text-xs text-gray-600">{t.counted}</div>
            <div className="font-semibold tabular-nums">{formatVND(countedCash)}</div>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <div className="text-xs text-gray-600">{t.difference}</div>
            <div className={`font-semibold tabular-nums ${diffCls}`}>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-sm ${diffPillCls}`}>
                {formatVND(localCashDiff)}
              </span>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <div className="text-xs text-gray-600">{t.totalToTake}</div>
            <div className="font-semibold tabular-nums">{formatVND(totalToTake)}</div>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <div className="text-xs text-gray-600">{t.targetFloat}</div>
            <div className="font-semibold tabular-nums">{formatVND(floatTarget)}</div>
          </div>
        </div>
      </div>
    </Card>
  )
}
