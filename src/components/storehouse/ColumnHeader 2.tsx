'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  EllipsisVerticalIcon,
  BarsArrowUpIcon,
  BarsArrowDownIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline'

interface ColumnHeaderProps {
  colKey: string
  label: string
  sortCol: string
  sortAsc: boolean
  onSort: (key: any, asc: boolean) => void
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
  valueLabels?: Record<string, string>
}

export default function ColumnHeader({
  colKey,
  label,
  sortCol,
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
  valueLabels,
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

  const isActive = sortCol === colKey
  const hasFilter = !!activeFilter
  const dropdownStyle = useMemo(() => {
    if (!open || !ref.current) return undefined
    const rect = ref.current.getBoundingClientRect()
    return { top: rect.bottom + window.scrollY + 4, left: right ? Math.max(0, rect.right - 220) : rect.left }
  }, [open, right])

  const filteredValues = filterSearch
    ? values.filter(v => (v || '').toLowerCase().includes(filterSearch.toLowerCase()))
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
    <th className={`p-2 ${right ? 'text-right' : ''} ${className} relative`} ref={ref}>
      <div className={`flex items-center gap-1 font-semibold ${center ? 'justify-center' : right ? 'justify-end' : 'justify-start'}`}>
        <span className="select-none text-xs text-slate-500 uppercase tracking-wider">{label}</span>
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
          className="absolute z-50 w-56 rounded-xl border border-slate-100 bg-white p-3 shadow-xl focus:outline-none"
          style={dropdownStyle}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex flex-col gap-2">
            {/* Ordina */}
            <button
              onClick={() => {
                onSort(colKey, true)
                onClose()
              }}
              className="flex w-full items-center px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 rounded-lg text-left"
            >
              {dict.sortAsc}
            </button>
            <button
              onClick={() => {
                onSort(colKey, false)
                onClose()
              }}
              className="flex w-full items-center px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 rounded-lg text-left"
            >
              {dict.sortDesc}
            </button>

            <hr className="border-slate-100" />

            {/* Filtra */}
            <input
              type="text"
              placeholder={dict.filterPlaceholder}
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />

            <div className="max-h-36 overflow-y-auto py-1">
              <button
                onClick={toggleAll}
                className="flex w-full items-center px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded font-medium text-left"
              >
                {allVisibleChecked ? dict.deselectAll : dict.selectAll}
              </button>
              {filteredValues.map(v => (
                <label key={v} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localChecked.has(v)}
                    onChange={() => toggleOne(v)}
                    className="rounded border-slate-350 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700 truncate">
                    {valueLabels && valueLabels[v] !== undefined ? valueLabels[v] : (v || (dict.filterPlaceholder.includes('Tìm') ? '(trống)' : '(empty)'))}
                  </span>
                </label>
              ))}
            </div>

            <div className="flex justify-between gap-2 border-t border-slate-100 pt-2">
              <button
                onClick={() => {
                  onClear()
                  onClose()
                }}
                className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 font-medium"
              >
                {dict.clearFilters}
              </button>
              <button
                onClick={() => {
                  handleApply()
                  onClose()
                }}
                className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </th>
  )
}
