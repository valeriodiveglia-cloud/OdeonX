'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffMember, HRServiceCharge, HRServiceChargeStaff } from '@/types/human-resources'
import { ChevronLeft, ChevronRight, Save, Receipt, Loader2, Coins } from 'lucide-react'
import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'

export default function ServiceChargeMonthlyPage() {
    const { currency } = useSettings()
    const [currentDate, setCurrentDate] = useState(() => new Date())
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Data
    const [staffList, setStaffList] = useState<HRStaffMember[]>([])
    const [serviceCharge, setServiceCharge] = useState<HRServiceCharge | null>(null)
    const [staffRecords, setStaffRecords] = useState<Record<string, HRServiceChargeStaff>>({})
    
    // UI State for edits
    const [totalAmountInput, setTotalAmountInput] = useState<string>('0')
    const [hoursInput, setHoursInput] = useState<Record<string, string>>({})

    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const monthId = `${monthStart.getFullYear()}-${(monthStart.getMonth() + 1).toString().padStart(2, '0')}`
    const displayMonth = currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            // Fetch active staff
            const { data: staffRes, error: staffErr } = await supabase
                .from('hr_staff')
                .select('*')
                .eq('status', 'active')
                .order('full_name')
            if (staffErr) throw staffErr

            // Fetch Service charge info
            const { data: scRes, error: scErr } = await supabase
                .from('hr_service_charges')
                .select('*')
                .eq('month_id', monthId)
                .maybeSingle()
            if (scErr && scErr.code !== 'PGRST116') throw scErr

            // Fetch SC staff records
            const { data: recRes, error: recErr } = await supabase
                .from('hr_service_charge_staff')
                .select('*')
                .eq('month_id', monthId)
            if (recErr) throw recErr

            setStaffList((staffRes as HRStaffMember[]) || [])
            setServiceCharge(scRes || null)
            if (scRes && scRes.total_amount != null) {
                const parts = scRes.total_amount.toString().split('.')
                parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                setTotalAmountInput(parts.join('.'))
            } else {
                setTotalAmountInput('')
            }

            const recMap: Record<string, HRServiceChargeStaff> = {}
            const hoursMap: Record<string, string> = {}
            if (recRes) {
                recRes.forEach((r: HRServiceChargeStaff) => {
                    recMap[r.staff_id] = r
                    hoursMap[r.staff_id] = r.hours_worked.toString()
                })
            }
            // Populate defaults for staff that don't have records yet
            staffRes?.forEach(s => {
                if (!hoursMap[s.id]) {
                    hoursMap[s.id] = '0'
                }
            })

            setStaffRecords(recMap)
            setHoursInput(hoursMap)
        } catch (err) {
            console.error('Error fetching service charge data:', err)
        }
        setLoading(false)
    }, [monthId])

    useEffect(() => { fetchAll() }, [fetchAll])

    const handlePrevious = () => {
        const prev = new Date(currentDate)
        prev.setMonth(prev.getMonth() - 1)
        setCurrentDate(prev)
    }

    const handleNext = () => {
        const next = new Date(currentDate)
        next.setMonth(next.getMonth() + 1)
        setCurrentDate(next)
    }

    // Calculations
    const totalSC = Number(totalAmountInput.replace(/,/g, '')) || 0
    const totalHours = useMemo(() => {
        return Object.values(hoursInput).reduce((sum, h) => sum + (Number(h) || 0), 0)
    }, [hoursInput])
    
    const hourlyRate = totalHours > 0 ? (totalSC / totalHours) : 0

    const handleSave = async () => {
        setSaving(true)
        try {
            // Upsert main SC
            const { error: scErr } = await supabase
                .from('hr_service_charges')
                .upsert({ month_id: monthId, total_amount: totalSC })
            if (scErr) throw scErr

            // Upsert staff hours
            const upsertArray = staffList.map(st => {
                const existing = staffRecords[st.id]
                return {
                    ...(existing ? { id: existing.id } : {}),
                    month_id: monthId,
                    staff_id: st.id,
                    hours_worked: Number(hoursInput[st.id]) || 0
                }
            })

            if (upsertArray.length > 0) {
                const { error: staffErr } = await supabase
                    .from('hr_service_charge_staff')
                    .upsert(upsertArray, { onConflict: 'month_id,staff_id' })
                if (staffErr) throw staffErr
            }
            
            await fetchAll()
            alert('Saved successfully!')
        } catch (err) {
            console.error(err)
            alert('Error saving data')
        } finally {
            setSaving(false)
        }
    }

    if (loading && staffList.length === 0) {
        return <div className="min-h-screen bg-\[#0b1530\] flex items-center justify-center"><CircularLoader /></div>
    }

    const currencySymbol = (() => {
        try {
            const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(1);
            const symbolPart = parts.find(p => p.type === 'currency');
            return symbolPart ? symbolPart.value : currency;
        } catch { return currency }
    })()

    return (
        <div className="min-h-screen bg-\[#0b1530\] text-gray-100 p-6 animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto">
                <div className="mb-6 ml-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                            Service Charge
                        </h1>
                        <p className="text-sm text-slate-400 mt-1">
                            Equitably distribute monthly service charge pools based on working hours.
                        </p>
                    </div>
                    <button 
                        onClick={handleSave} 
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 transition-all shadow hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 
                        Save Changes
                    </button>
                </div>

                {/* Header Nav matching Performance/Attendance exactly */}
                <div className="mt-3 mb-4 flex items-center justify-between text-sm text-blue-100 px-2">
                    <button type="button" onClick={handlePrevious} className="flex items-center gap-1 hover:text-white transition-colors">
                        <ChevronLeft className="w-4 h-4" />
                        <span>Previous</span>
                    </button>

                    <div className="flex items-center gap-2 text-white">
                        <span className="text-lg font-bold capitalize">{displayMonth}</span>
                    </div>

                    <button type="button" onClick={handleNext} className="flex items-center gap-1 hover:text-white transition-colors">
                        <span>Next</span>
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                {/* Simple SC Input Bar */}
                <div className="mb-6 flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm border border-gray-100/50 relative overflow-hidden">
                    <div className="flex items-center gap-3 text-gray-800 relative z-10">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center border border-gray-200">
                            <Receipt className="w-5 h-5 text-gray-600" />
                        </div>
                        <div>
                            <span className="font-bold block text-sm">Monthly Service Charge Pool</span>
                            <span className="text-xs text-gray-500 font-medium">Auto-distributes across total {totalHours.toFixed(1)} hours</span>
                        </div>
                    </div>
                    <div className="flex items-center relative z-10">
                        <span className="text-gray-500 font-semibold mr-2">{currency}</span>
                        <input 
                            type="text" 
                            value={totalAmountInput}
                            onChange={(e) => {
                                let val = e.target.value.replace(/[^0-9.]/g, '')
                                // Fix leading zero persistence if it's not a decimal
                                if (val.startsWith('0') && !val.startsWith('0.')) {
                                    val = val.replace(/^0+/, '')
                                }
                                
                                // Live commas format
                                const parts = val.split('.')
                                if (parts.length > 2) parts.pop() // Prevent multiple dots
                                parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                                setTotalAmountInput(parts.join('.'))
                            }}
                            className="w-32 px-3 py-2 text-right bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all outline-none"
                            placeholder="0"
                        />
                    </div>
                </div>

                {/* Table Area */}
                <div className="rounded-2xl bg-white shadow-xl overflow-hidden border border-gray-100">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="px-5 py-4 text-left font-semibold text-gray-500 uppercase tracking-widest text-xs">Staff Member</th>
                                    <th className="px-5 py-4 text-left font-semibold text-gray-500 uppercase tracking-widest text-xs">Position</th>
                                    <th className="px-5 py-4 text-center font-semibold text-gray-500 uppercase tracking-widest text-xs border-l border-gray-100 w-48">Hours Worked</th>
                                    <th className="px-5 py-4 text-center font-semibold text-gray-500 uppercase tracking-widest text-xs border-l border-gray-100">Share %</th>
                                    <th className="px-5 py-4 text-right font-semibold text-gray-500 uppercase tracking-widest text-xs border-l border-gray-100 w-48">Calculated Portion</th>
                                </tr>
                            </thead>
                            <tbody>
                                {staffList.map((s, idx) => {
                                    const hStr = hoursInput[s.id]
                                    const h = Number(hStr) || 0
                                    const sharePct = totalHours > 0 ? (h / totalHours) * 100 : 0
                                    const portion = h * hourlyRate

                                    return (
                                        <tr 
                                            key={s.id} 
                                            className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                                        >
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-indigo-800 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm">
                                                        {(s.full_name || '').split(/\s+/).filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <span className="text-sm font-semibold text-gray-900 block">{s.full_name}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-gray-500 text-sm">
                                                {s.position}
                                            </td>
                                            <td className="px-5 py-3 text-center border-l border-gray-100">
                                                <div className="flex items-center justify-center">
                                                    <input 
                                                        type="number" min="0" step="0.5"
                                                        value={hStr === '0' ? '' : hStr}
                                                        placeholder="0"
                                                        onChange={e => setHoursInput(p => ({...p, [s.id]: e.target.value }))}
                                                        className="w-24 px-3 py-2 text-center border mr-2 border-gray-200 rounded-lg text-sm text-gray-900 font-bold focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all outline-none bg-white"
                                                    />
                                                    <span className="text-gray-400 font-medium text-xs">h</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-center border-l border-gray-100">
                                                <div className="flex flex-col items-center">
                                                    <span className={`font-bold ${sharePct > 0 ? 'text-gray-700' : 'text-gray-300'}`}>{sharePct.toFixed(1)}%</span>
                                                    <div className="w-20 h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                                                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(sharePct, 100)}%` }} />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-right border-l border-gray-100">
                                                <span className={`text-sm font-semibold ${portion > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                                                    {new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(portion)}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })}
                                {staffList.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-16 text-center">
                                            <Coins className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                            <p className="text-gray-500 text-sm font-medium">No active staff members found.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
