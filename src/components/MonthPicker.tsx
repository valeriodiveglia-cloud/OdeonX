'use client'

import React, { useRef } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { t } from '@/lib/i18n'

interface MonthPickerProps {
  value: string // format YYYY-MM
  onChange: (newMonth: string) => void
  language: string
  colorClass?: string // e.g. 'text-blue-600 hover:text-blue-800'
  labelColorClass?: string // e.g. 'text-slate-900' or 'text-white'
  iconColorClass?: string // e.g. 'text-slate-500 hover:text-slate-700'
  className?: string // extra container classes like mt-6 mb-1
}

export default function MonthPicker({
  value,
  onChange,
  language,
  colorClass = 'text-blue-600 hover:text-blue-800',
  labelColorClass = 'text-slate-900',
  iconColorClass = 'text-slate-500 hover:text-slate-700',
  className = 'mb-4',
}: MonthPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handlePrev = () => {
    const [y, m] = value.split('-').map(Number)
    if (m === 1) {
      onChange(`${y - 1}-12`)
    } else {
      onChange(`${y}-${String(m - 1).padStart(2, '0')}`)
    }
  }

  const handleNext = () => {
    const [y, m] = value.split('-').map(Number)
    if (m === 12) {
      onChange(`${y + 1}-01`)
    } else {
      onChange(`${y}-${String(m + 1).padStart(2, '0')}`)
    }
  }

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      onChange(e.target.value)
    }
  }

  const triggerPicker = () => {
    if (inputRef.current) {
      try {
        inputRef.current.showPicker()
      } catch (err) {
        inputRef.current.click()
      }
    }
  }

  const fmtMonth = (m: string) => {
    const [y, mo] = m.split('-').map(Number)
    const date = new Date(y, mo - 1, 1)
    return date.toLocaleString(
      language === 'vi' ? 'vi-VN' : 'en-US',
      { month: 'long', year: 'numeric' }
    )
  }

  return (
    <div className={`grid grid-cols-3 items-center ${className}`}>
      <button
        type="button"
        onClick={handlePrev}
        className={`justify-self-start text-sm font-semibold hover:underline transition flex items-center gap-1 ${colorClass}`}
      >
        <ChevronLeft className="w-4 h-4" />
        <span>{t(language, 'FinCFPrevious')}</span>
      </button>
      <div className="justify-self-center flex items-center gap-2">
        <div className={`text-lg font-bold capitalize ${labelColorClass}`}>
          {fmtMonth(value)}
        </div>
        <button
          type="button"
          onClick={triggerPicker}
          className={`p-1 rounded-lg hover:bg-slate-100 transition ${iconColorClass}`}
          title="Seleziona mese"
        >
          <Calendar className="w-4 h-4" />
        </button>
        <input
          ref={inputRef}
          type="month"
          value={value}
          onChange={handleMonthChange}
          className="absolute w-0 h-0 opacity-0 pointer-events-none"
        />
      </div>
      <button
        type="button"
        onClick={handleNext}
        className={`justify-self-end text-sm font-semibold hover:underline transition flex items-center gap-1 ${colorClass}`}
      >
        <span>{t(language, 'FinCFNext')}</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
