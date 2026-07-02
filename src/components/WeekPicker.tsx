'use client'

import React, { useRef } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { t } from '@/lib/i18n'

interface WeekPickerProps {
  value: Date // Monday of the week
  onChange: (newDate: Date) => void
  language: string
  colorClass?: string // e.g. 'text-blue-600 hover:text-blue-800'
  labelColorClass?: string // e.g. 'text-slate-900' or 'text-white'
  iconColorClass?: string // e.g. 'text-slate-500 hover:text-slate-700'
  className?: string // extra container classes like mt-6 mb-1
}

export default function WeekPicker({
  value,
  onChange,
  language,
  colorClass = 'text-blue-600 hover:text-blue-800',
  labelColorClass = 'text-slate-900',
  iconColorClass = 'text-slate-500 hover:text-slate-700',
  className = 'mb-4',
}: WeekPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Local helper functions to keep WeekPicker self-contained
  const getMonday = (d: Date): Date => {
    const date = new Date(d)
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1)
    date.setDate(diff)
    date.setHours(0, 0, 0, 0)
    return date
  }

  const addDays = (d: Date, days: number): Date => {
    const result = new Date(d)
    result.setDate(result.getDate() + days)
    return result
  }

  const formatDateYmd = (d: Date): string => {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const formatWeekRange = (start: Date): string => {
    const end = addDays(start, 6)
    const sMonth = start.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'short' })
    const eMonth = end.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'short' })
    const year = end.getFullYear()
    if (sMonth === eMonth) {
      return `${start.getDate()} – ${end.getDate()} ${sMonth} ${year}`
    }
    return `${start.getDate()} ${sMonth} – ${end.getDate()} ${eMonth} ${year}`
  }

  const handlePrev = () => {
    onChange(addDays(value, -7))
  }

  const handleNext = () => {
    onChange(addDays(value, 7))
  }

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      onChange(getMonday(new Date(e.target.value)))
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

  const currentMonday = getMonday(value)

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
          {formatWeekRange(currentMonday)}
        </div>
        <button
          type="button"
          onClick={triggerPicker}
          className={`p-1 rounded-lg hover:bg-slate-100/10 transition ${iconColorClass}`}
          title="Seleziona data"
        >
          <Calendar className="w-4 h-4" />
        </button>
        <input
          ref={inputRef}
          type="date"
          value={formatDateYmd(currentMonday)}
          onChange={handleDateChange}
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
