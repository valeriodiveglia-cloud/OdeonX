'use client'

import React, { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, FileText, RefreshCw, Landmark } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import { FinInvoice } from '@/types/finance'
import { FinRecurringPayment } from '@/types/finance'

export default function PaymentsCalendarPage() {
    const { currency } = useSettings()
    function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }
    const [loading, setLoading] = useState(true)
    const [invoices, setInvoices] = useState<FinInvoice[]>([])
    const [recurring, setRecurring] = useState<FinRecurringPayment[]>([])

    // Calendar state
    const [currentDate, setCurrentDate] = useState(new Date())

    const fetchData = async () => {
        setLoading(true)
        const [invRes, recRes] = await Promise.all([
            supabase.from('fin_invoices').select('*, fin_suppliers(name)').in('status', ['Pending', 'Overdue', 'In Payment']),
            supabase.from('fin_recurring_payments').select('*, fin_bank_accounts(account_name)').eq('is_active', true)
        ])
        setInvoices(invRes.data || [])
        setRecurring(recRes.data || [])
        setLoading(false)
    }

    useEffect(() => {
        fetchData()
    }, [])

    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
    const today = () => setCurrentDate(new Date())

    // Generate calendar grid
    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
    const getFirstDayOfMonth = (year: number, month: number) => {
        let day = new Date(year, month, 1).getDay()
        // Make Monday = 0, Sunday = 6
        return day === 0 ? 6 : day - 1
    }

    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const daysInMonth = getDaysInMonth(year, month)
    const firstDay = getFirstDayOfMonth(year, month)

    const days = []
    for (let i = 0; i < firstDay; i++) {
        days.push(null)
    }
    for (let i = 1; i <= daysInMonth; i++) {
        days.push(new Date(year, month, i))
    }

    const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })
    const todayStr = new Date().toISOString().split('T')[0]

    return (
        <div className="p-6 max-w-7xl mx-auto h-screen flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 shrink-0">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <CalendarIcon className="w-6 h-6 text-blue-600" /> Payments Calendar
                    </h1>
                    <p className="text-slate-500 mt-1">Upcoming invoices and recurring payments.</p>
                </div>
                <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
                    <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition"><ChevronLeft className="w-5 h-5" /></button>
                    <button onClick={today} className="px-4 py-1.5 font-bold text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition">Today</button>
                    <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition"><ChevronRight className="w-5 h-5" /></button>
                </div>
            </div>

            <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 shrink-0">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                        <div key={day} className="py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">{day}</div>
                    ))}
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="flex-1 flex items-center justify-center"><CircularLoader /></div>
                ) : (
                    <div className="flex-1 grid grid-cols-7 grid-rows-5 overflow-y-auto">
                        {days.map((date, idx) => {
                            if (!date) return <div key={`empty-${idx}`} className="border-r border-b border-slate-100 bg-slate-50/50 min-h-[120px]" />

                            const dateStr = date.toISOString().split('T')[0]
                            const isToday = dateStr === todayStr

                            // Filter events
                            const dayInvoices = invoices.filter(i => i.due_date === dateStr)
                            const dayRecurring = recurring.filter(r => r.next_due_date === dateStr)

                            return (
                                <div key={dateStr} className={`border-r border-b border-slate-100 min-h-[120px] p-2 transition hover:bg-slate-50 ${isToday ? 'bg-blue-50/30' : ''}`}>
                                    <div className={`text-xs font-bold w-7 h-7 flex items-center justify-center rounded-full mb-2 ${isToday ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600'}`}>
                                        {date.getDate()}
                                    </div>
                                    <div className="space-y-1.5 overflow-y-auto max-h-[calc(100%-2rem)]">
                                        {dayInvoices.map(inv => (
                                            <div key={inv.id} className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded p-1.5 shadow-sm leading-tight group relative">
                                                <div className="flex items-start gap-1">
                                                    <FileText className="w-3 h-3 mt-0.5 shrink-0" />
                                                    <div>
                                                        <div className="font-bold truncate" title={(inv as any).fin_suppliers?.name}>{(inv as any).fin_suppliers?.name || 'Unknown'}</div>
                                                        <div className="font-black tabular-nums">{fmt(Number(inv.gross_amount))} {inv.currency || currency}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {dayRecurring.map(rec => (
                                            <div key={rec.id} className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded p-1.5 shadow-sm leading-tight group relative">
                                                <div className="flex items-start gap-1">
                                                    <RefreshCw className="w-3 h-3 mt-0.5 shrink-0" />
                                                    <div>
                                                        <div className="font-bold truncate" title={rec.description}>{rec.description}</div>
                                                        <div className="font-black tabular-nums">{fmt(Number(rec.amount))} {rec.currency}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
