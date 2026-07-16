// src/app/daily-reports/banktransfers/page.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowsUpDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  EllipsisVerticalIcon,
  ArrowUpTrayIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
  BarsArrowUpIcon,
  BarsArrowDownIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline'

import { useDRBranch } from '../_data/useDRBranch'
import { useBridgeLegacyBranch as useBridgeLegacyBranchRaw } from '../_data/branchLegacyBridge'
import {
  useBankTransfers,
  type BankTransferRow as DbBankTransferRow,
} from '../_data/useBankTransfers'
import { useSettings } from '@/contexts/SettingsContext'
import { getDailyReportsDictionary } from '../_i18n'
import MonthPicker from '@/components/MonthPicker'
import Button from '@/components/Button'
import PageHeader from '@/components/PageHeader'
import { TableContainer, Table, TableHead, TableHeadRow, TableBody, TableRow, TableCell } from '@/components/Table'
import { supabase } from '@/lib/supabase_shim'

/* ---------- Bridge (solo per nome branch, come Credits) ---------- */
function useBridgeSafe() {
  try {
    const b: any =
      typeof useBridgeLegacyBranchRaw === 'function' ? useBridgeLegacyBranchRaw() : null
    if (b && typeof b.setName === 'function') return b
  } catch { }
  const [name, setNameState] = useState<string>(() => {
    try {
      return localStorage.getItem('DR_BRANCH_NAME') || ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'DR_BRANCH_NAME') setNameState(e.newValue || '')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setName = (v: string) => {
    try {
      if (v) localStorage.setItem('DR_BRANCH_NAME', v)
      else localStorage.removeItem('DR_BRANCH_NAME')
      localStorage.setItem('dr_branch_last_emit_at', String(Date.now()))
      setNameState(v || '')
      window.dispatchEvent(
        new CustomEvent('dr:branch:changed', { detail: { name: v || '' } }),
      )
      window.dispatchEvent(
        new CustomEvent('dailyreports:branch:changed', { detail: { name: v || '' } }),
      )
      window.dispatchEvent(
        new CustomEvent('credits:branch:changed', { detail: { name: v || '' } }),
      )
    } catch { }
  }

  return { name, setName }
}

/* ---------- Helpers ---------- */
function pad2(n: number) {
  return String(n).padStart(2, '0')
}
function fmtDateDMY(iso: string) {
  if (!iso) return ''
  const d = /T/.test(iso) ? new Date(iso) : new Date(`${iso}T00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
}
function fmtInt(n: number) {
  try {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
      Math.round(n || 0),
    )
  } catch {
    return String(Math.round(n || 0))
  }
}
function parseDigits(s: string) {
  const digits = String(s ?? '').replace(/[^\d]+/g, '')
  const n = Number(digits || 0)
  return Number.isFinite(n) ? n : 0
}
function monthName(m: number) {
  return [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ][m]
}
function aheadIsFutureGuard(y: number, m: number) {
  const now = new Date()
  const ny = now.getFullYear()
  const nm = now.getMonth()
  return y > ny || (y === ny && m >= nm)
}
function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function uuid() {
  return typeof crypto !== 'undefined' && (crypto as any).randomUUID
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}



function MonthNav({
  monthLabel,
  monthInputValue,
  onPickMonth,
  prevMonth,
  nextMonth,
  guardDisabled,
  t,
}: {
  monthLabel: string
  monthInputValue: string
  onPickMonth: (v: string) => void
  prevMonth: () => void
  nextMonth: () => void
  guardDisabled: boolean
  t: ReturnType<typeof getDailyReportsDictionary>['banktransfers']['monthNav']
}) {
  const { language } = useSettings()

  const handleMonthChange = (newVal: string) => {
    if (newVal > monthInputValue && guardDisabled) {
      return
    }
    onPickMonth(newVal)
  }

  return (
    <MonthPicker
      value={monthInputValue}
      onChange={handleMonthChange}
      language={language}
      colorClass="text-blue-100 hover:text-white"
      labelColorClass="text-white"
      iconColorClass="text-blue-200 hover:text-white"
      className="mt-3 mb-4"
    />
  )
}

type SortKey = 'date' | 'time' | 'info' | 'amount' | 'note'

interface ColumnHeaderProps {
  colKey: SortKey
  label: string
  sortKey: SortKey
  sortAsc: boolean
  onSort: (key: SortKey, asc: boolean) => void
  values: string[]
  activeFilter: Set<string> | null
  onFilter: (vals: Set<string> | null) => void
  onClear: () => void
  open: boolean
  onToggle: () => void
  onClose: () => void
  dict: {
    sortAsc: string
    sortDesc: string
    selectAll: string
    deselectAll: string
    filterPlaceholder: string
    clearFilters: string
  }
  right?: boolean
  center?: boolean
  className?: string
}

function ColumnHeader({
  colKey,
  label,
  sortKey,
  sortAsc,
  onSort,
  values,
  activeFilter,
  onFilter,
  onClear,
  open,
  onToggle,
  onClose,
  dict,
  right,
  center,
  className = '',
}: ColumnHeaderProps) {
  const ref = useRef<HTMLTableCellElement>(null)
  const [filterSearch, setFilterSearch] = useState('')
  const [localChecked, setLocalChecked] = useState<Set<string>>(new Set(values))

  useEffect(() => {
    if (open) {
      setLocalChecked(activeFilter ? new Set(activeFilter) : new Set(values))
      setFilterSearch('')
    }
  }, [open, values, activeFilter])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onClose])

  const isActive = sortKey === colKey
  const hasFilter = !!activeFilter
  const dropdownStyle = useMemo(() => {
    if (!open || !ref.current) return undefined
    const rect = ref.current.getBoundingClientRect()
    return { top: rect.bottom + window.scrollY + 4, left: right ? Math.max(0, rect.right - 220) : rect.left }
  }, [open, right])

  const filteredValues = filterSearch
    ? values.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase()))
    : values

  const allVisibleChecked = filteredValues.length > 0 && filteredValues.every(v => localChecked.has(v))

  function toggleAll() {
    const next = new Set(localChecked)
    if (allVisibleChecked) {
      filteredValues.forEach(v => next.delete(v))
    } else {
      filteredValues.forEach(v => next.add(v))
    }
    setLocalChecked(next)
  }

  function toggleOne(v: string) {
    const next = new Set(localChecked)
    if (next.has(v)) next.delete(v); else next.add(v)
    setLocalChecked(next)
  }

  function handleApply() {
    let finalChecked = localChecked
    if (filterSearch) {
      finalChecked = new Set([...localChecked].filter(x => filteredValues.includes(x)))
    }
    if (finalChecked.size >= values.length) onFilter(null); else onFilter(finalChecked)
  }

  return (
    <th className={`px-6 py-4 ${right ? 'text-right' : ''} ${className} relative`} ref={ref}>
      <div className={`flex items-center gap-1 font-semibold ${center ? 'justify-center' : right ? 'justify-end' : 'justify-start'}`}>
        <span className="select-none text-slate-500 uppercase tracking-wider text-xs">{label}</span>
        {isActive && (
          sortAsc ? (
            <BarsArrowUpIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
          ) : (
            <BarsArrowDownIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
          )
        )}
        {hasFilter && <FunnelIcon className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />}
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            onToggle()
          }}
          className="ml-0.5 p-0.5 rounded hover:bg-gray-200 transition-colors flex-shrink-0 cursor-pointer"
          aria-label={`Menu ${label}`}
        >
          <EllipsisVerticalIcon className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>

      {open && dropdownStyle && (
        <div
          className="fixed bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] min-w-[220px] text-left text-sm text-gray-700 normal-case font-normal"
          style={dropdownStyle}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-2 space-y-1">
            <button
              type="button"
              onClick={() => onSort(colKey, true)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${
                isActive && sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'
              }`}
            >
              <BarsArrowUpIcon className="w-4 h-4" />
              {dict.sortAsc}
            </button>
            <button
              type="button"
              onClick={() => onSort(colKey, false)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${
                isActive && !sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'
              }`}
            >
              <BarsArrowDownIcon className="w-4 h-4" />
              {dict.sortDesc}
            </button>
          </div>

          <div className="border-t border-gray-200" />

          <div className="px-3 py-2">
            <input
              type="text"
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              placeholder={dict.filterPlaceholder}
              className="w-full mb-2 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-blue-600 hover:text-blue-800 mb-1 cursor-pointer font-medium text-left"
            >
              {allVisibleChecked ? dict.deselectAll : dict.selectAll}
            </button>
            <div className="max-h-[200px] overflow-y-auto space-y-0.5">
              {filteredValues.map(v => (
                <label key={v} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localChecked.has(v)}
                    onChange={() => toggleOne(v)}
                    className="accent-blue-600 rounded"
                  />
                  <span className="truncate text-xs">{v || '(Empty)'}</span>
                </label>
              ))}
              {filteredValues.length === 0 && (
                <div className="text-xs text-gray-400 py-1 text-center">—</div>
              )}
            </div>
          </div>

          <div className="border-t border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer font-medium"
            >
              {dict.clearFilters}
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-3 py-1 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer font-medium"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </th>
  )
}

/* ---------- Inputs ---------- */
const inputBase =
  'mt-1 w-full h-11 rounded-lg border border-gray-400 bg-white text-gray-900 placeholder-gray-500 px-3 focus:outline-none focus:ring-2 focus:ring-blue-700/30 focus:border-blue-700 transition-colors'

function MoneyInput({
  value,
  onChange,
  className = '',
  disabled = false,
}: {
  value: number
  onChange: (v: number) => void
  className?: string
  disabled?: boolean
}) {
  const [raw, setRaw] = useState<string>(fmtInt(value))
  const lastRef = useRef<number>(value)
  useEffect(() => {
    if (value !== lastRef.current) {
      lastRef.current = value
      setRaw(fmtInt(value))
    }
  }, [value])
  return (
    <input
      type="text"
      inputMode="numeric"
      value={raw}
      disabled={disabled}
      onChange={e => {
        if (disabled) return
        const n = parseDigits(e.target.value)
        setRaw(fmtInt(n))
        onChange(n)
      }}
      onFocus={() => {
        if (disabled) return
        if (parseDigits(raw) === 0) setRaw('')
      }}
      onBlur={() => {
        if (disabled) return
        if (!raw || parseDigits(raw) === 0) {
          setRaw('0'
          )
          onChange(0)
        }
      }}
      placeholder="0"
      className={`${inputBase} text-right tabular-nums ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''
        } ${className}`}
    />
  )
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-y-auto flex flex-col max-h-[90vh] z-10 animate-in fade-in zoom-in-95 duration-200">
        {children}
      </div>
    </div>
  )
}

/* ---------- local i18n for time & info ---------- */
const localI18n = {
  en: {
    time: 'Time',
    info: 'Info (Bill / Table)',
    timePlaceholder: 'hh:mm',
    infoPlaceholder: 'e.g., Bill 2685006561 - Table 5',
  },
  vi: {
    time: 'Giờ',
    info: 'Thông tin (Hóa đơn / Bàn)',
    timePlaceholder: 'hh:mm',
    infoPlaceholder: 'vd: Hóa đơn 2685006561 - Bàn 5',
  }
}

/* ---------- Types locali ---------- */
type BankRow = {
  id: string
  date: string
  time?: string | null
  info?: string | null
  amount: number
  note: string
  branch?: string | null
}

/* helper chiave per React / selezione */
function rowKey(r: BankRow) {
  return r.id
}

/* ---------- Modal: nuovo / edit bank transfer (solo manual) ---------- */
type ModalMode = 'create' | 'edit'

type UpsertDraft = {
  id?: string
  date: string
  time?: string | null
  info?: string | null
  amount: number
  note: string
  branch: string | null
}

function BankTransferModal({
  row,
  branch,
  onClose,
  onSave,
  t,
}: {
  mode?: ModalMode
  row?: BankRow
  branch: string | null
  onClose: () => void
  onSave: (draft: UpsertDraft) => void
  t: ReturnType<typeof getDailyReportsDictionary>['banktransfers']['modal']
}) {
  const [date, setDate] = useState<string>(() => {
    if (row?.date) {
      const dstr = row.date
      if (/T/.test(dstr)) return dstr.slice(0, 10)
      if (dstr.length >= 10) return dstr.slice(0, 10)
    }
    return todayISO()
  })
  const [time, setTime] = useState<string>(() => row?.time || '')
  const [info, setInfo] = useState<string>(() => row?.info || '')
  const [amount, setAmount] = useState<number>(() => (row ? Math.round(row.amount || 0) : 0))
  const [note, setNote] = useState<string>(() => row?.note || '')

  function buildDraft(): UpsertDraft {
    return {
      id: row?.id ?? uuid(),
      date,
      time: time.trim() || null,
      info: info.trim() || null,
      amount: Math.round(amount || 0),
      note: note.trim(),
      branch: (row?.branch ?? branch) || null,
    }
  }

  function handleSave() {
    const draft = buildDraft()
    onSave(draft)
    onClose()
  }

  const { language } = useSettings()
  const localT = language === 'vi' ? localI18n.vi : localI18n.en

  return (
    <Overlay onClose={onClose}>
      <div className="flex flex-col text-slate-900 bg-white p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
          <div className="text-lg font-bold text-slate-800">
            {t.editTitle}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-655 hover:bg-slate-100 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      
        {/* Content & Form */}
        <div className="mt-5 space-y-5 flex-1 overflow-y-auto pr-1">
          {/* Branch display */}
          <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{language === 'vi' ? 'CHI NHÁNH' : 'BRANCH'}</span>
            <div className="h-3 w-px bg-slate-200" />
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
              {branch || '-'}
            </span>
          </div>

          {/* Date, Time, Amount (3 columns) - Locked since they are synced from POS */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.date}</label>
              <input
                type="date"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold disabled:bg-slate-50 disabled:cursor-not-allowed"
                value={date}
                disabled={true}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{localT.time}</label>
              <input
                type="text"
                placeholder={localT.timePlaceholder}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold disabled:bg-slate-50 disabled:cursor-not-allowed"
                value={time}
                disabled={true}
                onChange={e => setTime(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.amount}</label>
              <MoneyInput
                value={amount}
                onChange={setAmount}
                className="h-10 border border-slate-200 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 rounded-xl"
                disabled={true}
              />
            </div>
          </div>

          {/* Info - Locked since synced from POS */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{localT.info}</label>
            <input
              type="text"
              placeholder={localT.infoPlaceholder}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold disabled:bg-slate-50 disabled:cursor-not-allowed"
              value={info}
              disabled={true}
              onChange={e => setInfo(e.target.value)}
            />
          </div>

          {/* Note - Always Editable */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{t.notes}</label>
            <input
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm focus:outline-none h-10 text-slate-900 font-semibold disabled:bg-slate-50 disabled:cursor-not-allowed"
              value={note}
              disabled={false}
              onChange={e => setNote(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="px-4 py-2 h-10 text-xs font-semibold"
          >
            {t.buttons.close}
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            className="px-4 py-2 h-10 text-xs font-semibold"
          >
            {t.buttons.save}
          </Button>
        </div>
      </div>
    </Overlay>
  )
}

/* ---------- Page ---------- */

export default function BankTransfersPage() {
  const { language } = useSettings()
  const t = getDailyReportsDictionary(language).banktransfers
  // branch ufficiale (come le altre pagine DR)
  const { branch } = useDRBranch({ validate: false })
  const officialName = branch?.name || ''

  // bridge legacy per tenere in sync con vecchio modal DR
  const bridge = useBridgeSafe()
  const bridgeName = bridge?.name || ''
  const setBridgeName: (v: string) => void = bridge?.setName || (() => { })

  const activeBranch = bridgeName || officialName
  const branchName = (activeBranch || '').trim()

  useEffect(() => {
    if (officialName && setBridgeName) setBridgeName(officialName)
  }, [officialName, setBridgeName])

  const now = new Date()
  const [year, setYear] = useState<number>(now.getFullYear())
  const [month, setMonth] = useState<number>(now.getMonth())

  // hook collegato al DB
  const {
    rows: dbRows,
    loading,
    error,
    refresh,
    createTransfer,
    updateTransfer,
    deleteTransfers,
  } = useBankTransfers({ year, month })

  // Sincronizzazione automatica da CukCuk POS API per oggi e ieri (dal 9 Luglio 2026 in poi) per TUTTE le filiali
  useEffect(() => {
    const d = new Date()
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    
    const yest = new Date(d.getTime() - 86400000)
    const yesterdayStr = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`

    async function runPosSync() {
      try {
        const { data: branchesData } = await supabase.from('provider_branches').select('name')
        if (!branchesData || branchesData.length === 0) return

        const calls: Promise<any>[] = []
        branchesData.forEach(b => {
          const bName = b.name
          if (todayStr >= '2026-07-12') {
            calls.push(fetch(`/api/pos/sync?branch=${encodeURIComponent(bName)}&date=${todayStr}`).catch(e => console.error(e)))
          }
          if (yesterdayStr >= '2026-07-12') {
            calls.push(fetch(`/api/pos/sync?branch=${encodeURIComponent(bName)}&date=${yesterdayStr}`).catch(e => console.error(e)))
          }
        })

        if (calls.length > 0) {
          await Promise.all(calls)
          refresh()
        }
      } catch (err) {
        console.error('Error running batch POS sync:', err)
      }
    }

    runPosSync()
  }, [year, month, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  // adattiamo le righe DB al tipo locale (e ci portiamo dietro il branch)
  const baseRows: BankRow[] = useMemo(
    () =>
      (dbRows || []).map((r: DbBankTransferRow) => ({
        id: r.id,
        date: r.date,
        time: r.time,
        info: r.info,
        amount: r.amount,
        note: r.note || '',
        branch: r.branch ?? null,
      })),
    [dbRows],
  )

  // filtro per branch attivo
  const branchRows = useMemo(() => {
    if (!branchName) return baseRows
    return baseRows.filter(r => (r.branch || '') === branchName)
  }, [baseRows, branchName])


  const monthInputValue = useMemo(
    () => `${year}-${String(month + 1).padStart(2, '0')}`,
    [year, month],
  )
  const monthLabel = `${monthName(month)} ${year}`
  const monthStart = useMemo(() => new Date(year, month, 1), [year, month])
  const monthEnd = useMemo(() => new Date(year, month + 1, 1), [year, month])

  function prevMonth() {
    setMonth(m => {
      if (m === 0) {
        setYear(y => y - 1)
        return 11
      }
      return m - 1
    })
  }
  function nextMonth() {
    setMonth(m => {
      if (m === 11) {
        setYear(y => y + 1)
        return 0
      }
      return m + 1
    })
  }
  function onPickMonth(val: string) {
    const [y, m] = val.split('-').map(Number)
    if (Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12) {
      setYear(y)
      setMonth(m - 1)
    }
  }

  // Filtra per mese
  const monthRows = useMemo(() => {
    return branchRows.filter(r => {
      const dstr = r.date || ''
      const d = /T/.test(dstr) ? new Date(dstr) : new Date(`${dstr}T00:00`)
      if (Number.isNaN(d.getTime())) return false
      return d >= monthStart && d < monthEnd
    })
  }, [branchRows, monthStart, monthEnd])

  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortAsc, setSortAsc] = useState<boolean>(false)
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string> | null>>({})
  const [openMenu, setOpenMenu] = useState<SortKey | null>(null)

  function applySort(k: SortKey, asc: boolean) {
    setSortKey(k)
    setSortAsc(asc)
    setOpenMenu(null)
  }
  function applyColumnFilter(col: SortKey, vals: Set<string> | null) {
    setColumnFilters(prev => ({ ...prev, [col]: vals }))
    setOpenMenu(null)
  }
  function clearColumnFilter(col: SortKey) {
    setColumnFilters(prev => {
      const n = { ...prev }
      delete n[col]
      return n
    })
    setOpenMenu(null)
  }

  const displayValue = useCallback((r: BankRow, key: SortKey): string => {
    switch (key) {
      case 'date':
        return fmtDateDMY(r.date)
      case 'time':
        return r.time || ''
      case 'info':
        return r.info || ''
      case 'amount':
        return fmtInt(r.amount)
      case 'note':
        return r.note || ''
      default:
        return ''
    }
  }, [])

  const columnValues = useMemo(() => {
    const map: Record<string, string[]> = {}
    const keys: SortKey[] = ['date', 'time', 'info', 'amount', 'note']
    keys.forEach(k => {
      const s = new Set<string>()
      monthRows.forEach(r => {
        const v = displayValue(r, k)
        if (v) s.add(v)
      })
      map[k] = Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    })
    return map
  }, [monthRows, displayValue])

  const visibleRows = useMemo(() => {
    let out = monthRows
    for (const [col, allowed] of Object.entries(columnFilters)) {
      if (!allowed) continue
      out = out.filter(r => allowed.has(displayValue(r, col as SortKey)))
    }
    return out
  }, [monthRows, columnFilters, displayValue])

  const sortedRows = useMemo(() => {
    const arr = [...visibleRows]
    arr.sort((a, b) => {
      let av: any
      let bv: any
      switch (sortKey) {
        case 'date':
          av = new Date(a.date).getTime()
          bv = new Date(b.date).getTime()
          break
        case 'time':
          av = a.time || ''
          bv = b.time || ''
          break
        case 'info':
          av = a.info || ''
          bv = b.info || ''
          break
        case 'amount':
          av = a.amount
          bv = b.amount
          break
        case 'note':
          av = a.note || ''
          bv = b.note || ''
          break
        default:
          av = 0
          bv = 0
      }
      let cmp: number
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortAsc ? cmp : -cmp
    })
    return arr
  }, [visibleRows, sortKey, sortAsc])

  const totalAmount = useMemo(
    () => sortedRows.reduce((s, r) => s + Math.round(r.amount || 0), 0),
    [sortedRows],
  )



  /* ---------- Modal state ---------- */
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [editingRow, setEditingRow] = useState<BankRow | null>(null)

  const columnMenuDict = useMemo(() => {
    return language === 'vi' ? {
      sortAsc: 'Sắp xếp tăng dần',
      sortDesc: 'Sắp xếp giảm dần',
      selectAll: 'Chọn tất cả',
      deselectAll: 'Bỏ chọn tất cả',
      filterPlaceholder: 'Tìm kiếm...',
      clearFilters: 'Xóa bộ lọc',
    } : {
      sortAsc: 'Sort Ascending',
      sortDesc: 'Sort Descending',
      selectAll: 'Select All',
      deselectAll: 'Deselect All',
      filterPlaceholder: 'Search...',
      clearFilters: 'Clear Filters',
    }
  }, [language])

  return (
    <div className="max-w-none mx-auto p-4 text-gray-100">
      <PageHeader
        title={t.title}
        subtitle={language === 'vi'
          ? 'Xem và quản lý chuyển khoản ngân hàng hàng ngày.'
          : 'View and manage daily bank transfers.'}
        badgeText={branchName || (language === 'vi' ? 'Tất cả chi nhánh' : 'All branches')}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="primary"
              onClick={() => void handleExport(sortedRows, t, language)}
              className="h-9 px-3 text-xs font-semibold"
              title={t.export.title}
            >
              <ArrowUpTrayIcon className="w-5 h-5 mr-1.5 inline-block" />
              {t.export.label}
            </Button>
          </div>
        }
      />

      <div className="mt-3 border-t border-white/15" />

      <MonthNav
        monthLabel={monthLabel}
        monthInputValue={monthInputValue}
        onPickMonth={onPickMonth}
        prevMonth={prevMonth}
        nextMonth={nextMonth}
        guardDisabled={aheadIsFutureGuard(year, month)}
        t={t.monthNav}
      />

      <TableContainer>
        {loading && sortedRows.length === 0 && (
          <div className="text-sm text-gray-500 p-4">{t.table.loading}</div>
        )}
        {error && !loading && (
          <div className="text-sm text-red-650 p-4">{t.table.error}: {error}</div>
        )}

        <Table>
          <TableHead>
            <TableHeadRow>
              <ColumnHeader
                colKey="date"
                label={t.table.headers.date}
                sortKey={sortKey}
                sortAsc={sortAsc}
                onSort={applySort}
                values={columnValues.date || []}
                activeFilter={columnFilters.date || null}
                onFilter={s => applyColumnFilter('date', s)}
                onClear={() => clearColumnFilter('date')}
                open={openMenu === 'date'}
                onToggle={() => setOpenMenu(openMenu === 'date' ? null : 'date')}
                onClose={() => setOpenMenu(null)}
                dict={columnMenuDict}
                className="w-[120px]"
              />
              <ColumnHeader
                colKey="time"
                label={language === 'vi' ? localI18n.vi.time : localI18n.en.time}
                sortKey={sortKey}
                sortAsc={sortAsc}
                onSort={applySort}
                values={columnValues.time || []}
                activeFilter={columnFilters.time || null}
                onFilter={s => applyColumnFilter('time', s)}
                onClear={() => clearColumnFilter('time')}
                open={openMenu === 'time'}
                onToggle={() => setOpenMenu(openMenu === 'time' ? null : 'time')}
                onClose={() => setOpenMenu(null)}
                dict={columnMenuDict}
                className="w-[90px]"
              />
              <ColumnHeader
                colKey="info"
                label={language === 'vi' ? localI18n.vi.info : localI18n.en.info}
                sortKey={sortKey}
                sortAsc={sortAsc}
                onSort={applySort}
                values={columnValues.info || []}
                activeFilter={columnFilters.info || null}
                onFilter={s => applyColumnFilter('info', s)}
                onClear={() => clearColumnFilter('info')}
                open={openMenu === 'info'}
                onToggle={() => setOpenMenu(openMenu === 'info' ? null : 'info')}
                onClose={() => setOpenMenu(null)}
                dict={columnMenuDict}
                className="w-[300px]"
              />
              <ColumnHeader
                colKey="amount"
                label={t.table.headers.amount}
                sortKey={sortKey}
                sortAsc={sortAsc}
                onSort={applySort}
                values={columnValues.amount || []}
                activeFilter={columnFilters.amount || null}
                onFilter={s => applyColumnFilter('amount', s)}
                onClear={() => clearColumnFilter('amount')}
                open={openMenu === 'amount'}
                onToggle={() => setOpenMenu(openMenu === 'amount' ? null : 'amount')}
                onClose={() => setOpenMenu(null)}
                dict={columnMenuDict}
                right
                className="w-[150px]"
              />
              <ColumnHeader
                colKey="note"
                label={t.table.headers.note}
                sortKey={sortKey}
                sortAsc={sortAsc}
                onSort={applySort}
                values={columnValues.note || []}
                activeFilter={columnFilters.note || null}
                onFilter={s => applyColumnFilter('note', s)}
                onClear={() => clearColumnFilter('note')}
                open={openMenu === 'note'}
                onToggle={() => setOpenMenu(openMenu === 'note' ? null : 'note')}
                onClose={() => setOpenMenu(null)}
                dict={columnMenuDict}
                className="w-[300px]"
              />
            </TableHeadRow>
          </TableHead>
          <TableBody>
            {!loading && sortedRows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                  {t.table.noRows}
                </td>
              </tr>
            )}
            {sortedRows.map(r => {
              const key = rowKey(r)
              return (
                <TableRow
                  key={key}
                  onClick={() => {
                    setModalMode('edit')
                    setEditingRow(r)
                    setShowModal(true)
                  }}
                >
                  <TableCell className="whitespace-nowrap">{fmtDateDMY(r.date)}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.time || ''}</TableCell>
                  <TableCell className="w-[300px] whitespace-nowrap truncate max-w-[300px]" title={r.info || ''}>
                    {r.info || ''}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-slate-800 font-semibold">{fmtInt(r.amount)}</TableCell>
                  <TableCell className="w-[300px] whitespace-nowrap truncate max-w-[300px]" title={r.note || ''}>{r.note}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          {sortedRows.length > 0 && (
            <TableBody>
              <TableRow className="bg-slate-50/50 font-semibold">
                <TableCell>{t.table.totals}</TableCell>
                <TableCell>{null}</TableCell>
                <TableCell>{null}</TableCell>
                <TableCell className="text-right tabular-nums text-slate-800">{fmtInt(totalAmount)}</TableCell>
                <TableCell>{null}</TableCell>
              </TableRow>
            </TableBody>
          )}
        </Table>
      </TableContainer>

      {showModal && (
        <BankTransferModal
          mode={modalMode}
          row={editingRow || undefined}
          branch={branchName || null}
          onClose={() => setShowModal(false)}
          onSave={draft => {
            void updateTransfer({
              id: draft.id,
              date: draft.date,
              time: draft.time || null,
              info: draft.info || null,
              amount: draft.amount,
              note: draft.note || null,
            })
          }}
          t={t.modal}
        />
      )}
    </div>
  )
}

/* ---------- Export ---------- */
async function handleExport(rows: BankRow[], t: ReturnType<typeof getDailyReportsDictionary>['banktransfers'], language: 'en' | 'vi') {
  if (!rows.length) {
    alert(t.export.empty)
    return
  }
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(t.export.sheetName)

  const localT = language === 'vi' ? localI18n.vi : localI18n.en

  ws.columns = [
    { header: t.export.columns.date, key: 'date', width: 12 },
    { header: localT.time, key: 'time', width: 10 },
    { header: localT.info, key: 'info', width: 35 },
    { header: t.export.columns.amount, key: 'amount', width: 14 },
    { header: t.export.columns.notes, key: 'notes', width: 40 },
  ]

  rows.forEach(r => {
    ws.addRow({
      date: fmtDateDMY(r.date),
      time: r.time || '',
      info: r.info || '',
      amount: Math.round(r.amount || 0),
      notes: r.note || '',
    })
  })

  const totalAmount = rows.reduce((s, r) => s + Math.round(r.amount || 0), 0)
  ws.addRow({
    date: '',
    time: '',
    info: '',
    amount: totalAmount,
    notes: t.export.totalLabel,
  })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const dateStr = new Date().toISOString().slice(0, 10)
  a.download = t.export.fileName.replace('{date}', dateStr)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
