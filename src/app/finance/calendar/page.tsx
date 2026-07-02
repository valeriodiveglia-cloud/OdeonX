'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, FileText, CreditCard, X, ArrowRight, Plus, Bell, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import { FinInvoice, FinCorporateCardExpense } from '@/types/finance'
import { t } from '@/lib/i18n'

type DayEvent = {
    id: string
    type: 'invoice' | 'card' | 'reminder'
    label: string
    amount: number
    currency: string
    status?: string
    sublabel?: string
}

type FinCalendarReminder = {
    id: string
    title: string
    description: string | null
    estimated_amount: number | null
    currency: string
    start_date: string
    is_recurring: boolean
    frequency: string | null
}

export default function PaymentsCalendarPage() {
    const { currency, language } = useSettings()
    function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }
    const [loading, setLoading] = useState(true)
    const [invoices, setInvoices] = useState<FinInvoice[]>([])
    const [cardExpenses, setCardExpenses] = useState<FinCorporateCardExpense[]>([])
    const [reminders, setReminders] = useState<FinCalendarReminder[]>([])
    const [dismissals, setDismissals] = useState<any[]>([])

    // Calendar state
    const [currentDate, setCurrentDate] = useState(new Date())
    const [selectedDate, setSelectedDate] = useState<string | null>(null)
    const [showReminderModal, setShowReminderModal] = useState(false)
    const [viewMode, setViewMode] = useState<'Annual' | 'Quarter' | 'Monthly' | 'Weekly'>('Monthly')

    const fetchData = async () => {
        setLoading(true)
        const [invRes, recRes, remRes, dismRes] = await Promise.all([
            supabase.from('fin_invoices').select('*, suppliers(name)').in('status', ['Pending', 'Overdue', 'In Payment', 'Paid']),
            supabase.from('fin_corporate_card_expenses').select('*, fin_bank_accounts(account_name)').neq('frequency', 'One-Time'),
            supabase.from('fin_calendar_reminders').select('*'),
            supabase.from('fin_reminder_dismissals').select('*')
        ])
        setInvoices(invRes.data || [])
        setCardExpenses(recRes.data || [])
        setReminders(remRes.data || [])
        setDismissals(dismRes.data || [])
        setLoading(false)
    }

    useEffect(() => {
        fetchData()
    }, [])

    const dismissReminder = async (reminderId: string, dateStr: string) => {
        if (!confirm(t(language, 'FinCalConfirmDismiss'))) return
        const { error } = await supabase.from('fin_reminder_dismissals').insert({ reminder_id: reminderId, dismissed_date: dateStr })
        if (!error) {
            fetchData()
        } else {
            alert(t(language, 'FinCalAlertDismissError'))
        }
    }

    const prevTime = () => {
        const d = new Date(currentDate)
        if (viewMode === 'Annual') d.setFullYear(d.getFullYear() - 1)
        else if (viewMode === 'Quarter') d.setMonth(d.getMonth() - 3)
        else if (viewMode === 'Monthly') d.setMonth(d.getMonth() - 1)
        else if (viewMode === 'Weekly') d.setDate(d.getDate() - 7)
        setCurrentDate(d)
        setSelectedDate(null)
    }

    const nextTime = () => {
        const d = new Date(currentDate)
        if (viewMode === 'Annual') d.setFullYear(d.getFullYear() + 1)
        else if (viewMode === 'Quarter') d.setMonth(d.getMonth() + 3)
        else if (viewMode === 'Monthly') d.setMonth(d.getMonth() + 1)
        else if (viewMode === 'Weekly') d.setDate(d.getDate() + 7)
        setCurrentDate(d)
        setSelectedDate(null)
    }

    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()

    const viewStart = useMemo(() => {
        if (viewMode === 'Annual') return new Date(year, 0, 1)
        if (viewMode === 'Quarter') return new Date(year, Math.floor(month / 3) * 3, 1)
        if (viewMode === 'Monthly') return new Date(year, month, 1)
        if (viewMode === 'Weekly') {
            const d = new Date(currentDate)
            const day = d.getDay()
            const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Start on Monday
            return new Date(d.setDate(diff))
        }
        return new Date()
    }, [viewMode, currentDate])

    const viewEnd = useMemo(() => {
        if (viewMode === 'Annual') return new Date(year, 11, 31)
        if (viewMode === 'Quarter') return new Date(year, Math.floor(month / 3) * 3 + 3, 0)
        if (viewMode === 'Monthly') return new Date(year, month + 1, 0)
        if (viewMode === 'Weekly') {
            const d = new Date(viewStart)
            d.setDate(d.getDate() + 6)
            return d
        }
        return new Date()
    }, [viewMode, viewStart])

    const navText = useMemo(() => {
        if (viewMode === 'Annual') return year.toString()
        if (viewMode === 'Quarter') {
            const q = Math.floor(viewStart.getMonth() / 3) + 1
            return `Q${q} ${year}`
        }
        if (viewMode === 'Monthly') return currentDate.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' })
        if (viewMode === 'Weekly') {
            const end = new Date(viewStart)
            end.setDate(end.getDate() + 6)
            return `${viewStart.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        }
    }, [viewMode, currentDate, year, viewStart, language])

    const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
    const getFirstDayOfMonth = (y: number, m: number) => {
        let day = new Date(y, m, 1).getDay()
        return day === 0 ? 6 : day - 1
    }

    const todayStr = new Date().toISOString().split('T')[0]

    // Build events map by date string
    const eventsMap = useMemo(() => {
        const map: Record<string, DayEvent[]> = {}
        invoices.forEach(inv => {
            const dateStr = inv.due_date
            if (!dateStr) return
            if (!map[dateStr]) map[dateStr] = []
            map[dateStr].push({
                id: inv.id,
                type: 'invoice',
                label: inv.is_personal_deduction ? (inv.custom_supplier_name || 'Personal') : ((inv as any).suppliers?.name || inv.custom_supplier_name || 'Unknown Supplier'),
                amount: Number(inv.gross_amount),
                currency: inv.currency || currency,
                status: inv.status,
                sublabel: inv.invoice_number || undefined
            })
        })
        cardExpenses.forEach(rec => {
            const dateStr = rec.expense_date
            if (!dateStr) return
            if (!map[dateStr]) map[dateStr] = []
            map[dateStr].push({
                id: rec.id,
                type: 'card',
                label: rec.description || 'Card Expense',
                amount: Number(rec.amount),
                currency: rec.currency || currency,
                sublabel: (rec as any).fin_bank_accounts?.account_name || undefined
            })
        })

        // Generate reminder occurrences up to viewEnd
        reminders.forEach(rem => {
            const start = new Date(rem.start_date)
            let curr = new Date(start)
            
            while (curr <= viewEnd) {
                // If curr falls within view boundaries (or at least same month for flexibility)
                if (curr >= viewStart || (curr.getFullYear() === viewStart.getFullYear() && curr.getMonth() === viewStart.getMonth())) {
                    const dateStr = curr.toISOString().split('T')[0]
                    const isDismissed = dismissals.some(d => d.reminder_id === rem.id && d.dismissed_date === dateStr)
                    if (!isDismissed) {
                        if (!map[dateStr]) map[dateStr] = []
                        map[dateStr].push({
                            id: rem.id,
                            type: 'reminder',
                            label: rem.title,
                            amount: Number(rem.estimated_amount || 0),
                            currency: rem.currency || currency,
                            sublabel: rem.description || undefined
                        })
                    }
                }
                
                if (!rem.is_recurring) break

                if (rem.frequency === 'Monthly') curr.setMonth(curr.getMonth() + 1)
                else if (rem.frequency === 'Bi-Monthly') curr.setMonth(curr.getMonth() + 2)
                else if (rem.frequency === 'Quarterly') curr.setMonth(curr.getMonth() + 3)
                else if (rem.frequency === 'Semi-Annually') curr.setMonth(curr.getMonth() + 6)
                else if (rem.frequency === 'Annually') curr.setFullYear(curr.getFullYear() + 1)
                else break
            }
        })

        return map
    }, [invoices, cardExpenses, reminders, dismissals, currency, viewStart, viewEnd])

    const selectedEvents = selectedDate ? (eventsMap[selectedDate] || []) : []
    const selectedDateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : null

    const renderAnnual = () => {
        return (
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto pr-2 pb-4">
                {Array.from({ length: 12 }).map((_, mIndex) => {
                    const firstDay = getFirstDayOfMonth(year, mIndex)
                    const daysInM = getDaysInMonth(year, mIndex)
                    
                    const mDays = []
                    for (let i = 0; i < firstDay; i++) mDays.push(null)
                    for (let i = 1; i <= daysInM; i++) mDays.push(new Date(year, mIndex, i))
                    // Always pad to 42 cells (6 weeks) so the height is consistent across all months
                    while (mDays.length < 42) mDays.push(null)

                    const monthName = new Date(year, mIndex, 1).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long' })

                    return (
                        <div key={mIndex} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm h-fit">
                            <h3 className="font-bold text-slate-900 mb-3">{monthName}</h3>
                            <div className="grid grid-cols-7 gap-1">
                                {[
                                    t(language, 'FinCalMon'),
                                    t(language, 'FinCalTue'),
                                    t(language, 'FinCalWed'),
                                    t(language, 'FinCalThu'),
                                    t(language, 'FinCalFri'),
                                    t(language, 'FinCalSat'),
                                    t(language, 'FinCalSun')
                                ].map((d, i) => <div key={i} className="text-center text-[10px] font-bold text-slate-400 mb-1">{language === 'vi' ? d : d.charAt(0)}</div>)}
                                {mDays.map((d, i) => {
                                    if (!d) return <div key={i} className="aspect-square" />
                                    const dateStr = d.toISOString().split('T')[0]
                                    const evs = eventsMap[dateStr] || []
                                    const isSelected = selectedDate === dateStr
                                    const isToday = dateStr === todayStr
                                    
                                    const hasEvents = evs.length > 0

                                    return (
                                        <div key={i} 
                                            onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                                            className={`aspect-square flex items-center justify-center rounded-lg cursor-pointer transition
                                                ${isSelected 
                                                    ? 'bg-blue-600 text-white shadow-md font-bold ring-2 ring-blue-300 ring-offset-1' 
                                                    : isToday 
                                                        ? 'bg-slate-800 text-white font-bold' 
                                                        : hasEvents 
                                                            ? 'bg-blue-100 text-blue-800 font-bold hover:bg-blue-200' 
                                                            : 'hover:bg-slate-100 text-slate-700 text-xs'}
                                            `}>
                                            <span>{d.getDate()}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>
        )
    }

    const renderQuarter = () => {
        const qMonths = [viewStart.getMonth(), viewStart.getMonth() + 1, viewStart.getMonth() + 2]
        
        return (
            <div className="flex-1 overflow-y-auto pr-2 pb-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
                {qMonths.map(mIndex => {
                    const monthName = new Date(year, mIndex, 1).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' })
                    
                    const daysInM = getDaysInMonth(year, mIndex)
                    const mEvents: { date: string, events: DayEvent[] }[] = []
                    for (let i = 1; i <= daysInM; i++) {
                        const d = new Date(year, mIndex, i)
                        const dateStr = d.toISOString().split('T')[0]
                        if (eventsMap[dateStr] && eventsMap[dateStr].length > 0) {
                            mEvents.push({ date: dateStr, events: eventsMap[dateStr] })
                        }
                    }

                    return (
                        <div key={mIndex} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="bg-slate-50 px-5 py-3 border-b border-slate-100">
                                <h3 className="font-black text-slate-900 text-lg">{monthName}</h3>
                            </div>
                            <div className="p-0">
                                {mEvents.length === 0 ? (
                                    <div className="p-5 text-slate-500 text-sm italic">{t(language, 'FinCalNoPaymentsMonth')}</div>
                                ) : (
                                    <div className="divide-y divide-slate-100">
                                        {mEvents.map(me => (
                                            <div key={me.date} className={`p-3 transition cursor-pointer hover:bg-slate-50 ${selectedDate === me.date ? 'bg-blue-50/50' : ''}`} onClick={() => setSelectedDate(selectedDate === me.date ? null : me.date)}>
                                                <div className="flex items-baseline gap-1.5 mb-2 px-1">
                                                    <span className={`text-lg font-black ${me.date === todayStr ? 'text-blue-600' : 'text-slate-800'}`}>{new Date(me.date).getDate()}</span>
                                                    <span className="text-xs font-bold text-slate-400 uppercase">{new Date(me.date).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { weekday: 'short' })}</span>
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    {me.events.map(ev => (
                                                        <div key={ev.id} className={`p-2 rounded-lg border ${ev.type === 'invoice' ? (ev.status === 'Paid' ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-200') : ev.type === 'card' ? 'bg-emerald-50 border-emerald-200' : 'bg-purple-50 border-purple-200'}`}>
                                                            <div className="flex justify-between items-center gap-2">
                                                                <div className="min-w-0">
                                                                    <div className={`font-bold text-xs truncate ${ev.status === 'Paid' ? 'line-through text-slate-500' : 'text-slate-900'}`}>{ev.label}</div>
                                                                    {ev.sublabel && <div className="text-[10px] text-slate-500 truncate">{ev.sublabel}</div>}
                                                                </div>
                                                                <div className={`font-black text-xs tabular-nums ${ev.status === 'Paid' ? 'text-slate-500' : 'text-slate-900'}`}>
                                                                    {fmt(ev.amount)} <span className="text-[9px]">{ev.currency}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        )
    }

    const renderMonthlyOrWeekly = () => {
        let gridDays: (Date | null)[] = []
        if (viewMode === 'Monthly') {
            const firstDay = getFirstDayOfMonth(year, month)
            const daysInMonth = getDaysInMonth(year, month)
            for (let i = 0; i < firstDay; i++) gridDays.push(null)
            for (let i = 1; i <= daysInMonth; i++) gridDays.push(new Date(year, month, i))
            while (gridDays.length % 7 !== 0) gridDays.push(null)
        } else {
            for (let i = 0; i < 7; i++) {
                const d = new Date(viewStart)
                d.setDate(d.getDate() + i)
                gridDays.push(d)
            }
        }

        return (
            <div className={`flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden transition-all duration-300 ${selectedDate ? 'rounded-r-none border-r-0' : ''}`}>
                <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 shrink-0">
                    {[
                        t(language, 'FinCalMon'),
                        t(language, 'FinCalTue'),
                        t(language, 'FinCalWed'),
                        t(language, 'FinCalThu'),
                        t(language, 'FinCalFri'),
                        t(language, 'FinCalSat'),
                        t(language, 'FinCalSun')
                    ].map(day => (
                        <div key={day} className="py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">{day}</div>
                    ))}
                </div>

                <div className={`flex-1 grid grid-cols-7 ${viewMode === 'Weekly' ? 'auto-rows-[1fr]' : 'auto-rows-fr'}`}>
                    {gridDays.map((date, idx) => {
                        if (!date) return <div key={`empty-${idx}`} className="border-r border-b border-slate-100 bg-slate-50/30" />

                        const dateStr = date.toISOString().split('T')[0]
                        const isToday = dateStr === todayStr
                        const isSelected = dateStr === selectedDate
                        const dayEvents = eventsMap[dateStr] || []
                        const visibleEvents = viewMode === 'Weekly' ? dayEvents : dayEvents.slice(0, 2)
                        const extraCount = viewMode === 'Weekly' ? 0 : Math.max(0, dayEvents.length - 2)

                        const dayTotal = dayEvents.reduce((s, e) => s + e.amount, 0)
                        const hasInvoices = dayEvents.some(e => e.type === 'invoice')
                        const hasCards = dayEvents.some(e => e.type === 'card')
                        const hasReminders = dayEvents.some(e => e.type === 'reminder')

                        return (
                            <div
                                key={dateStr}
                                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                                className={`border-r border-b border-slate-100 p-1.5 transition cursor-pointer group relative flex flex-col
                                    ${isToday ? 'bg-blue-50/40' : ''}
                                    ${isSelected ? 'bg-blue-50 ring-2 ring-blue-500 ring-inset z-10' : 'hover:bg-slate-50'}
                                `}
                            >
                                <div className="flex items-center justify-between mb-1 shrink-0">
                                    <div className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full
                                        ${isToday ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600'}
                                    `}>
                                        {date.getDate()}
                                    </div>
                                    {dayEvents.length > 0 && viewMode !== 'Weekly' && (
                                        <div className="flex items-center gap-0.5">
                                            {hasInvoices && <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                                            {hasCards && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                                            {hasReminders && <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />}
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 flex flex-col gap-0.5 min-h-0 overflow-y-auto pr-1">
                                    {visibleEvents.map(ev => (
                                        <div
                                            key={ev.id}
                                            className={`text-[10px] leading-tight px-1.5 py-1 rounded font-semibold break-words
                                                ${ev.type === 'invoice'
                                                    ? (ev.status === 'Paid' ? 'bg-slate-100 text-slate-500 line-through' : 'bg-amber-100 text-amber-800')
                                                    : ev.type === 'card' ? 'bg-emerald-100 text-emerald-800'
                                                    : 'bg-purple-100 text-purple-800'
                                                }
                                            `}
                                            title={`${ev.label} — ${fmt(ev.amount)} ${ev.currency}`}
                                        >
                                            {ev.label}
                                            {viewMode === 'Weekly' && <div className="text-[9px] opacity-70 tabular-nums">{fmt(ev.amount)} {ev.currency}</div>}
                                        </div>
                                    ))}
                                    {extraCount > 0 && (
                                        <div className="text-[10px] font-bold text-blue-600 px-1.5 shrink-0 mt-0.5">
                                            {t(language, 'FinCalMoreCount').replace('{count}', String(extraCount))}
                                        </div>
                                    )}
                                </div>

                                {dayEvents.length > 0 && (
                                    <div className="text-[10px] font-black text-slate-500 tabular-nums text-right mt-auto pt-0.5 border-t border-slate-100 shrink-0">
                                        {fmt(dayTotal)}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-[1400px] mx-auto h-screen flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t(language, 'FinCalTitle')}</h1>
                    <p className="text-slate-500 mt-1">{t(language, 'FinCalSubtitle')}</p>
                </div>
                <button onClick={() => setShowReminderModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-sm hover:bg-blue-700 transition shrink-0">
                    <Plus className="w-4 h-4" /> {t(language, 'FinCalNewReminderButton')}
                </button>
            </div>

            {/* View Mode Tabs (Minimalist border-bottom style) */}
            <div className="flex items-center gap-6 border-b border-slate-200 mb-6 shrink-0">
                {(['Annual', 'Quarter', 'Monthly', 'Weekly'] as const).map(m => (
                    <button
                        key={m}
                        type="button"
                        onClick={() => {
                            if (viewMode !== m) {
                                setViewMode(m)
                                setSelectedDate(null)
                            }
                        }}
                        className={`pb-3 px-1 text-sm font-bold transition-all border-b-2 ${
                            viewMode === m 
                                ? 'border-blue-600 text-blue-700' 
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                        }`}
                    >
                        {m === 'Annual' ? t(language, 'FinCalAnnual') : m === 'Quarter' ? t(language, 'FinCalQuarter') : m === 'Monthly' ? t(language, 'FinCalMonthly') : t(language, 'FinCalWeekly')}
                    </button>
                ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between mb-4 shrink-0 px-2">
                <button onClick={prevTime} className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline transition flex items-center gap-1">
                    <ChevronLeft className="w-4 h-4" /> {t(language, 'FinCalPrevious')}
                </button>
                <div className="text-lg font-bold text-slate-900">
                    {navText}
                </div>
                <button onClick={nextTime} className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline transition flex items-center gap-1">
                    {t(language, 'FinCalNext')} <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 flex gap-0 overflow-hidden min-h-0">
                {viewMode === 'Annual' ? renderAnnual() : viewMode === 'Quarter' ? renderQuarter() : renderMonthlyOrWeekly()}

                {/* Detail Side Panel */}
                <div className={`bg-white border border-slate-200 border-l-slate-100 shadow-sm rounded-r-2xl flex flex-col overflow-hidden transition-all duration-300 shrink-0 ${selectedDate ? 'w-[340px] opacity-100' : 'w-0 opacity-0 border-0'}`}>
                    {selectedDate && (
                        <>
                            <div className="bg-slate-50 p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                                <div>
                                    <div className="text-sm font-bold text-slate-500 uppercase tracking-wider">{selectedDateObj?.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { weekday: 'long' })}</div>
                                    <div className="text-xl font-black text-slate-900">
                                        {selectedDateObj?.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                    </div>
                                </div>
                                <button onClick={() => setSelectedDate(null)} className="p-1 hover:bg-slate-200 text-slate-400 rounded transition">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4">
                                {selectedEvents.length === 0 ? (
                                    <div className="text-center text-slate-400 mt-10">{t(language, 'FinCalNoPaymentsScheduled')}</div>
                                ) : (
                                    <>
                                        <div className="mb-6">
                                            <div className="text-3xl font-black text-slate-900 tabular-nums">
                                                {fmt(selectedEvents.reduce((s, e) => s + e.amount, 0))} <span className="text-lg text-slate-400 font-bold">{currency}</span>
                                            </div>
                                            <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mt-1">{t(language, 'FinCalTotalDue')}</div>
                                        </div>

                                        {/* Invoices section */}
                                        {selectedEvents.filter(e => e.type === 'invoice').length > 0 && (
                                            <div className="mb-6">
                                                <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                                    <FileText className="w-3 h-3" /> {t(language, 'FinCalInvoicesSection')}
                                                </div>
                                                <div className="space-y-1.5">
                                                    {selectedEvents.filter(e => e.type === 'invoice').map(ev => (
                                                        <div key={ev.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0 flex-1">
                                                                    <div className={`font-bold text-sm truncate ${ev.status === 'Paid' ? 'text-slate-500 line-through' : 'text-amber-900'}`}>{ev.label}</div>
                                                                    {ev.sublabel && <div className={`text-xs mt-0.5 ${ev.status === 'Paid' ? 'text-slate-400' : 'text-amber-600'}`}>{ev.sublabel}</div>}
                                                                </div>
                                                                <div className={`text-sm font-black tabular-nums whitespace-nowrap ${ev.status === 'Paid' ? 'text-slate-500' : 'text-amber-900'}`}>
                                                                    {fmt(ev.amount)} <span className={`text-xs font-semibold ${ev.status === 'Paid' ? 'text-slate-400' : 'text-amber-600'}`}>{ev.currency}</span>
                                                                </div>
                                                            </div>
                                                            {ev.status && (
                                                                <div className="mt-2">
                                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider
                                                                        ${ev.status === 'Overdue' ? 'bg-red-100 text-red-700' : ev.status === 'In Payment' ? 'bg-blue-100 text-blue-700' : ev.status === 'Paid' ? 'bg-slate-200 text-slate-500' : 'bg-slate-100 text-slate-600'}
                                                                    `}>{ev.status}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Card Expenses section */}
                                        {selectedEvents.filter(e => e.type === 'card').length > 0 && (
                                            <div className="mb-6">
                                                <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                                    <CreditCard className="w-3 h-3" /> {t(language, 'FinCalCorporateCardSection')}
                                                </div>
                                                <div className="space-y-1.5">
                                                    {selectedEvents.filter(e => e.type === 'card').map(ev => (
                                                        <div key={ev.id} className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="font-bold text-sm text-emerald-900 truncate">{ev.label}</div>
                                                                    {ev.sublabel && <div className="text-xs text-emerald-600 mt-0.5">{ev.sublabel}</div>}
                                                                </div>
                                                                <div className="text-sm font-black text-emerald-900 tabular-nums whitespace-nowrap">
                                                                    {fmt(ev.amount)} <span className="text-xs font-semibold text-emerald-600">{ev.currency}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Reminders section */}
                                        {selectedEvents.filter(e => e.type === 'reminder').length > 0 && (
                                            <div>
                                                <div className="text-[10px] font-bold text-purple-700 uppercase tracking-wider mb-1.5 flex items-center gap-1 mt-3">
                                                    <Bell className="w-3 h-3" /> {t(language, 'FinCalRemindersSection')}
                                                </div>
                                                <div className="space-y-1.5">
                                                    {selectedEvents.filter(e => e.type === 'reminder').map(ev => (
                                                        <div key={ev.id} className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="font-bold text-sm text-purple-900 truncate">{ev.label}</div>
                                                                    {ev.sublabel && <div className="text-xs text-purple-600 mt-0.5">{ev.sublabel}</div>}
                                                                </div>
                                                                <div className="text-sm font-black text-purple-900 tabular-nums whitespace-nowrap">
                                                                    {fmt(ev.amount)} <span className="text-xs font-semibold text-purple-600">{ev.currency}</span>
                                                                </div>
                                                            </div>
                                                            <div className="mt-3 flex justify-end">
                                                                <button
                                                                    onClick={() => dismissReminder(ev.id, selectedDate!)}
                                                                    className="flex items-center gap-1 px-3 py-1 bg-white border border-purple-200 hover:bg-purple-100 text-purple-700 text-[10px] font-bold uppercase tracking-wider rounded-lg transition"
                                                                >
                                                                    <CheckCircle className="w-3 h-3" /> {t(language, 'FinCalMarkAsResolved')}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Reminder Modal */}
            {showReminderModal && (
                <ReminderModal
                    language={language}
                    onClose={() => setShowReminderModal(false)}
                    onSave={() => {
                        setShowReminderModal(false)
                        fetchData()
                    }}
                />
            )}
        </div>
    )
}

function ReminderModal({ language, onClose, onSave }: { language: string, onClose: () => void, onSave: () => void }) {
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [amount, setAmount] = useState('')
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
    const [isRecurring, setIsRecurring] = useState(false)
    const [frequency, setFrequency] = useState('Monthly')
    const [saving, setSaving] = useState(false)

    const handleSubmit = async () => {
        if (!title || !startDate) return alert(t(language, 'FinCalAlertRequiredFields'))
        setSaving(true)
        const { error } = await supabase.from('fin_calendar_reminders').insert({
            title,
            description: description || null,
            estimated_amount: amount ? Number(amount) : null,
            start_date: startDate,
            is_recurring: isRecurring,
            frequency: isRecurring ? frequency : null
        })
        if (error) {
            alert(t(language, 'FinCalAlertSaveFailed') + error.message)
            setSaving(false)
        } else {
            onSave()
        }
    }

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Bell className="w-5 h-5 text-blue-600" /> {t(language, 'FinCalModalTitle')}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                            {t(language, 'FinCalModalTitleLabel')} <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 bg-slate-50 hover:border-slate-300 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all shadow-sm"
                            placeholder={t(language, 'FinCalModalTitlePlaceholder')}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                            {t(language, 'FinCalModalDescription')}
                        </label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 bg-slate-50 hover:border-slate-300 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all shadow-sm"
                            rows={2}
                            placeholder={t(language, 'FinCalModalNotesPlaceholder')}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                {t(language, 'FinCalModalStartDate')} <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 bg-slate-50 hover:border-slate-300 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all shadow-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                {t(language, 'FinCalModalEstAmount')}
                            </label>
                            <input
                                type="number"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 bg-slate-50 hover:border-slate-300 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all shadow-sm"
                                placeholder="0"
                            />
                        </div>
                    </div>
                    
                    <div className="col-span-2">
                        <div className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer transition-colors ${isRecurring ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}
                            onClick={() => { setIsRecurring(!isRecurring); if (!isRecurring) setFrequency('Monthly') }}>
                            <span className="font-semibold text-slate-700 text-sm">
                                {isRecurring ? t(language, 'FinCalModalRecurring') : t(language, 'FinCalModalOneTime')}
                            </span>
                            <div className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${isRecurring ? 'bg-blue-600' : 'bg-slate-300'}`}>
                                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${isRecurring ? 'translate-x-4' : ''}`} />
                            </div>
                        </div>
                    </div>

                    {isRecurring && (
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                                {t(language, 'FinCalModalFrequency')}
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                {['Monthly', 'Bi-Monthly', 'Quarterly', 'Semi-Annually', 'Annually'].map(f => {
                                    let labelKey = 'FinCalFreqMonthly'
                                    if (f === 'Bi-Monthly') labelKey = 'FinCalFreqBiMonthly'
                                    if (f === 'Quarterly') labelKey = 'FinCalFreqQuarterly'
                                    if (f === 'Semi-Annually') labelKey = 'FinCalFreqSemiAnnually'
                                    if (f === 'Annually') labelKey = 'FinCalFreqAnnually'
                                    return (
                                        <button key={f} type="button" onClick={() => setFrequency(f)}
                                            className={`py-2 px-2 rounded-xl text-xs font-bold border transition-colors text-center ${frequency === f ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}>
                                            {t(language, labelKey)}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 font-semibold text-sm hover:text-slate-900 transition">
                        {t(language, 'Cancel')}
                    </button>
                    <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition shadow-sm disabled:opacity-50">
                        {saving ? t(language, 'Saving') : t(language, 'FinCalModalSaveButton')}
                    </button>
                </div>
            </div>
        </div>
    )
}
