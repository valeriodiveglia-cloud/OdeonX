// src/app/daily-reports/banktransfers/page.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
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
} from '@heroicons/react/24/outline'

import { useDRBranch } from '../_data/useDRBranch'
import { useBridgeLegacyBranch as useBridgeLegacyBranchRaw } from '../_data/branchLegacyBridge'
import {
  useBankTransfers,
  type BankTransferRow as DbBankTransferRow,
} from '../_data/useBankTransfers'
import { useSettings } from '@/contexts/SettingsContext'
import { getDailyReportsDictionary } from '../_i18n'

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

/* ---------- UI primitives ---------- */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow">
      {children}
    </div>
  )
}

function PageHeader({
  title,
  left,
  after,
  right,
}: {
  title: string
  left?: React.ReactNode
  after?: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {left}
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {after}
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  )
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
  const baseBtn = 'flex items-center gap-1 text-blue-100 hover:text-white transition'

  return (
    <div className="mt-3 mb-4 flex items-center justify-between text-sm text-blue-100">
      <button type="button" onClick={prevMonth} className={baseBtn} title={t.prevTitle}>
        <ChevronLeftIcon className="w-4 h-4" />
        <span>{t.previous}</span>
      </button>

      <div className="flex items-center gap-2 text-white">
        <span className="text-base font-semibold">{monthLabel}</span>
        <div className="relative w-6 h-6">
          <CalendarDaysIcon className="w-6 h-6 text-blue-200" />
          <input
            type="month"
            value={monthInputValue}
            onChange={e => onPickMonth(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label={t.pick}
            title={t.pick}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={guardDisabled ? undefined : nextMonth}
        disabled={guardDisabled}
        aria-disabled={guardDisabled}
        className={`${baseBtn} ${guardDisabled ? 'cursor-default' : ''}`}
        title={t.nextTitle}
      >
        <span>{t.next}</span>
        <ChevronRightIcon className="w-4 h-4" />
      </button>
    </div>
  )
}

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return <ArrowsUpDownIcon className="w-4 h-4 text-gray-400" />
  return asc ? (
    <ChevronUpIcon className="w-4 h-4 text-gray-700" />
  ) : (
    <ChevronDownIcon className="w-4 h-4 text-gray-700" />
  )
}

function Th({
  label,
  active,
  asc,
  onClick,
  right,
}: {
  label: string
  active: boolean
  asc: boolean
  onClick: () => void
  right?: boolean
}) {
  return (
    <th className={`p-2 ${right ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={onClick} className="w-full cursor-pointer">
        <div className={`flex items-center gap-1 font-semibold ${right ? 'justify-end' : ''}`}>
          {right ? null : <SortIcon active={active} asc={asc} />}
          <span>{label}</span>
          {right ? <SortIcon active={active} asc={asc} /> : null}
        </div>
      </button>
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
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-3xl h-full bg-white shadow-xl overflow-y-auto">{children}</div>
    </div>
  )
}

/* ---------- Types locali ---------- */
type BankRow = {
  id: string
  date: string
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
  amount: number
  note: string
  branch: string | null
}

function BankTransferModal({
  mode,
  row,
  branch,
  onClose,
  onSave,
  onSaveAndAddNew,
  onDelete,
  t,
}: {
  mode: ModalMode
  row?: BankRow
  branch: string | null
  onClose: () => void
  onSave: (draft: UpsertDraft) => void
  onSaveAndAddNew?: (draft: UpsertDraft) => void
  onDelete?: (id: string) => void
  t: ReturnType<typeof getDailyReportsDictionary>['banktransfers']['modal']
}) {
  const [viewMode, setViewMode] = useState<boolean>(mode === 'edit')

  const [date, setDate] = useState<string>(() => {
    if (row?.date) {
      const dstr = row.date
      if (/T/.test(dstr)) return dstr.slice(0, 10)
      if (dstr.length >= 10) return dstr.slice(0, 10)
    }
    return todayISO()
  })
  const [amount, setAmount] = useState<number>(() => (row ? Math.round(row.amount || 0) : 0))
  const [note, setNote] = useState<string>(() => row?.note || '')

  const amountError =
    !Number.isFinite(amount) || amount <= 0 ? t.errors.amount : null
  const dateError = !date ? t.errors.date : null
  const hasError = Boolean(amountError || dateError)

  function buildDraft(): UpsertDraft {
    return {
      id: row?.id ?? uuid(),
      date,
      amount: Math.round(amount || 0),
      note: note.trim(),
      branch: (row?.branch ?? branch) || null,
    }
  }

  function handleSave(addNew: boolean) {
    if (viewMode || hasError) return
    const draft = buildDraft()

    if (addNew && onSaveAndAddNew) {
      onSaveAndAddNew(draft)
      setAmount(0)
      setNote('')
      return
    }

    onSave(draft)
    onClose()
  }

  function handleDelete() {
    if (viewMode || !row?.id || !onDelete) return
    if (!window.confirm(t.errors.delete)) return
    onDelete(row.id)
  }

  const disabled = viewMode

  const isCreate = mode === 'create'

  return (
    <Overlay onClose={onClose}>
      <div className="h-full flex flex-col text-gray-900">
        <div className="px-4 md:px-6 pt-4 pb-3 flex items-center justify-between border-b">
          <div className="text-xl font-bold">
            {isCreate ? t.newTitle : t.editTitle}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>

        <div className="px-4 md:px-6 py-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-800">{t.date}</label>
              <input
                type="date"
                className={inputBase}
                value={date}
                disabled={disabled}
                onChange={e => setDate(e.target.value)}
              />
              {!viewMode && dateError && (
                <div className="mt-1 text-xs text-red-600">{dateError}</div>
              )}
            </div>
            <div>
              <label className="text-sm text-gray-800">{t.amount}</label>
              <MoneyInput
                value={amount}
                onChange={setAmount}
                className="h-11"
                disabled={disabled}
              />
              {/* niente messaggi di errore: i pulsanti restano disabilitati */}
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-800">{t.notes}</label>
            <input
              className={inputBase}
              value={note}
              disabled={disabled}
              onChange={e => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="px-4 md:px-6 py-4 border-t flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isCreate ? null : viewMode ? (
              <button
                onClick={() => setViewMode(false)}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80"
              >
                {t.buttons.edit}
              </button>
            ) : row?.id ? (
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg border text-red-600 hover:bg-red-50"
              >
                {t.buttons.delete}
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border hover:opacity-80"
            >
              {t.buttons.close}
            </button>
            {!viewMode && (
              <>
                <button
                  onClick={() => handleSave(false)}
                  disabled={hasError}
                  className={`px-4 py-2 rounded-lg text-white hover:opacity-80 ${hasError ? 'bg-blue-400' : 'bg-blue-600'
                    }`}
                >
                  {t.buttons.save}
                </button>
                {isCreate && onSaveAndAddNew && (
                  <button
                    onClick={() => handleSave(true)}
                    disabled={hasError}
                    className={`px-4 py-2 rounded-lg text-white hover:opacity-80 ${hasError ? 'bg-blue-300' : 'bg-blue-500'
                      }`}
                  >
                    {t.buttons.saveAdd}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  )
}

/* ---------- Page ---------- */
type SortKey = 'date' | 'amount' | 'note'

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

  // hook collegato al DB
  const {
    rows: dbRows,
    loading,
    error,
    createTransfer,
    updateTransfer,
    deleteTransfers,
  } = useBankTransfers()

  // adattiamo le righe DB al tipo locale (e ci portiamo dietro il branch)
  const baseRows: BankRow[] = useMemo(
    () =>
      (dbRows || []).map((r: DbBankTransferRow) => ({
        id: r.id,
        date: r.date,
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

  const now = new Date()
  const [year, setYear] = useState<number>(now.getFullYear())
  const [month, setMonth] = useState<number>(now.getMonth())
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
  const [sortAsc, setSortAsc] = useState<boolean>(true)

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc(v => !v)
    else {
      setSortKey(k)
      setSortAsc(true)
    }
  }

  const [search, setSearch] = useState<string>('')

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return monthRows
    return monthRows.filter(r => {
      const dmy = fmtDateDMY(r.date).toLowerCase()
      const iso = String(r.date || '').toLowerCase()
      const amt = String(Math.round(r.amount || 0))
      const note = (r.note || '').toLowerCase()
      return dmy.includes(q) || iso.includes(q) || amt.includes(q) || note.includes(q)
    })
  }, [monthRows, search])

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

  /* ---------- Selezione e bulk delete (kebab) ---------- */
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const selectedKeys = useMemo(
    () => Object.keys(selected).filter(k => selected[k]),
    [selected],
  )
  const headerCbRef = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const allSelected =
    sortedRows.length > 0 && sortedRows.every(r => !!selected[rowKey(r)])
  const someSelected =
    sortedRows.some(r => !!selected[rowKey(r)]) && !allSelected

  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = someSelected
  }, [someSelected, allSelected])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  async function bulkDelete() {
    if (!selectedKeys.length) return
    const ok = window.confirm(t.menu.bulkConfirm.replace('{count}', String(selectedKeys.length)))
    if (!ok) return
    const okDb = await deleteTransfers(selectedKeys)
    if (!okDb) {
      alert(t.modal.deleteFailed)
      return
    }
    setSelected({})
  }

  /* ---------- Modal state ---------- */
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [editingRow, setEditingRow] = useState<BankRow | null>(null)

  return (
    <div className="max-w-none mx-auto p-4 text-gray-100">
      <PageHeader
        title={t.title}
        left={
          <>
            {selectMode && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(v => !v)}
                  aria-label={t.menu.moreActions}
                  className="p-0 h-auto w-auto bg-transparent border-0 outline-none text-blue-200 hover:text-white focus:outline-none"
                  title={t.menu.moreActions}
                >
                  <EllipsisVerticalIcon className="h-6 w-6" />
                </button>
                {menuOpen && (
                  <div className="absolute z-10 mt-2 min-w-[12rem] rounded-xl border bg-white text-gray-800 shadow-lg py-1">
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 hover:bg-blue-200 hover:text-red-700 disabled:opacity-50"
                      onClick={() => {
                        setMenuOpen(false)
                        if (selectedKeys.length) bulkDelete()
                      }}
                      disabled={selectedKeys.length === 0}
                    >
                      <TrashIcon className="h-4 w-4" />
                      <span>{t.menu.delete}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        }
        after={
          <div
            className="ml-2 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-600/15 px-3 py-1 text-xs text-blue-100"
            title={t.branchPill.tooltip}
          >
            <span className="h-2 w-2 rounded-full bg-green-400" />
            <span className="font-medium">
              {activeBranch || t.branchPill.none}
            </span>
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-2.5 h-5 w-5 text-blue-200" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t.search.placeholder}
                className="pl-9 pr-8 h-9 rounded-lg border border-blue-400/30 bg-blue-600/15 text-blue-50 placeholder-blue-200
                           focus:outline-none focus:ring-2 focus:ring-blue-400/40"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-2 h-5 w-5 text-blue-200 hover:text-white"
                  aria-label={t.search.clear}
                  title={t.search.clear}
                >
                  ×
                </button>
              )}
            </div>

            <button
              onClick={() => void handleExport(sortedRows, t)}
              className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border border-blue-400/30"
              title={t.export.title}
            >
              <ArrowUpTrayIcon className="w-5 h-5" /> {t.export.label}
            </button>

            <button
              onClick={() => {
                setSelectMode(s => !s)
                setMenuOpen(false)
                if (!selectMode) setSelected({})
              }}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border ${selectMode
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border-blue-400/30'
                }`}
              title={selectMode ? t.select.exitTitle : t.select.enterTitle}
            >
              <CheckCircleIcon className="w-5 h-5" />
              {selectMode ? t.select.active : t.select.inactive}
            </button>

            <button
              onClick={() => {
                setModalMode('create')
                setEditingRow(null)
                setShowModal(true)
              }}
              className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-80"
              title={t.modal.newTitle}
            >
              <PlusIcon className="w-5 h-5" />
              {t.modal.newTitle}
            </button>
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

      <Card>
        <div className="p-3 overflow-x-auto">
          {loading && (
            <div className="text-sm text-gray-500 py-2">{t.table.loading}</div>
          )}
          {error && !loading && (
            <div className="text-sm text-red-600 py-2">{t.table.error}: {error}</div>
          )}

          <table className="w-full table-auto text-sm text-gray-900">
            <thead>
              <tr>
                <th className="p-2 w-7">
                  {selectMode ? (
                    <input
                      ref={headerCbRef}
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => {
                        if (sortedRows.length === 0) return
                        if (allSelected) setSelected({})
                        else {
                          const next: Record<string, boolean> = {}
                          sortedRows.forEach(r => {
                            next[rowKey(r)] = true
                          })
                          setSelected(next)
                        }
                      }}
                      className="h-4 w-4"
                      title={t.table.selectAll}
                    />
                  ) : null}
                </th>
                <Th
                  label={t.table.headers.date}
                  active={sortKey === 'date'}
                  asc={sortAsc}
                  onClick={() => toggleSort('date')}
                />
                <Th
                  label={t.table.headers.amount}
                  active={sortKey === 'amount'}
                  asc={sortAsc}
                  onClick={() => toggleSort('amount')}
                  right
                />
                <Th
                  label={t.table.headers.note}
                  active={sortKey === 'note'}
                  asc={sortAsc}
                  onClick={() => toggleSort('note')}
                />
              </tr>
            </thead>
            <tbody>
              {!loading && sortedRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-gray-500 py-6">
                    {t.table.noRows}
                  </td>
                </tr>
              )}
              {sortedRows.map(r => {
                const key = rowKey(r)
                return (
                  <tr
                    key={key}
                    className={
                      'border-t ' +
                      (!selectMode ? 'hover:bg-blue-50/40 cursor-pointer' : '')
                    }
                    onClick={() => {
                      if (selectMode) return
                      setModalMode('edit')
                      setEditingRow(r)
                      setShowModal(true)
                    }}
                  >
                    <td className="p-2 w-7">
                      {selectMode ? (
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={!!selected[key]}
                          onChange={e =>
                            setSelected(prev => ({
                              ...prev,
                              [key]: e.target.checked,
                            }))
                          }
                          title={t.table.selectRow}
                        />
                      ) : null}
                    </td>
                    <td className="p-2 whitespace-nowrap">{fmtDateDMY(r.date)}</td>
                    <td className="p-2 text-right tabular-nums">{fmtInt(r.amount)}</td>
                    <td className="p-2">{r.note}</td>
                  </tr>
                )
              })}
            </tbody>
            {sortedRows.length > 0 && (
              <tfoot>
                <tr className="border-t bg-blue-50/30">
                  <td className="p-2 w-7" />
                  <td className="p-2 text-right font-semibold">{t.table.totals}</td>
                  <td className="p-2 text-right font-semibold tabular-nums">
                    {fmtInt(totalAmount)}
                  </td>
                  <td className="p-2" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {showModal && (
        <BankTransferModal
          mode={modalMode}
          row={editingRow || undefined}
          branch={branchName || null}
          onClose={() => setShowModal(false)}
          onSave={draft => {
            if (modalMode === 'create') {
              void createTransfer({
                date: draft.date,
                amount: draft.amount,
                note: draft.note || null,
              })
            } else {
              void updateTransfer({
                id: draft.id,
                date: draft.date,
                amount: draft.amount,
                note: draft.note || null,
              })
            }
          }}
          onSaveAndAddNew={
            modalMode === 'create'
              ? draft => {
                void createTransfer({
                  date: draft.date,
                  amount: draft.amount,
                  note: draft.note || null,
                })
              }
              : undefined
          }
          onDelete={
            modalMode === 'edit'
              ? id => {
                void deleteTransfers([id])
                setShowModal(false)
              }
              : undefined
          }
          t={t.modal}
        />
      )}
    </div>
  )
}

/* ---------- Export ---------- */
async function handleExport(rows: BankRow[], t: ReturnType<typeof getDailyReportsDictionary>['banktransfers']) {
  if (!rows.length) {
    alert(t.export.empty)
    return
  }
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(t.export.sheetName)

  ws.columns = [
    { header: t.export.columns.date, key: 'date', width: 12 },
    { header: t.export.columns.amount, key: 'amount', width: 14 },
    { header: t.export.columns.notes, key: 'notes', width: 40 },
  ]

  rows.forEach(r => {
    ws.addRow({
      date: fmtDateDMY(r.date),
      amount: Math.round(r.amount || 0),
      notes: r.note || '',
    })
  })

  const totalAmount = rows.reduce((s, r) => s + Math.round(r.amount || 0), 0)
  ws.addRow({
    date: '',
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
