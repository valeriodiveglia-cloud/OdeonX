'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffMember, HRStaffOvertime } from '@/types/human-resources'
import { ChevronLeft, ChevronRight, Users, Watch, X, Loader2, Save, Trash2, CalendarDays, Plus } from 'lucide-react'
import CircularLoader from '@/components/CircularLoader'
import { getOvertimeSettings, OvertimeSettings } from '@/lib/hr-operational-data'
import { useSettings } from '@/contexts/SettingsContext'

export default function OvertimeMonthlyPage() {
    const { currency } = useSettings()
    const [currentDate, setCurrentDate] = useState(() => new Date())
    const [loading, setLoading] = useState(true)
    const [settings, setSettings] = useState<OvertimeSettings>({ 
        overtime_multiplier_salary: 1.5,
        overtime_multiplier_leave: 1.0,
        public_holiday_multiplier_salary: 2.0,
        public_holiday_multiplier_leave: 1.5 
    })

    // Data
    const [staffList, setStaffList] = useState<HRStaffMember[]>([])
    const [overtimeRecords, setOvertimeRecords] = useState<Record<string, HRStaffOvertime[]>>({})
    const [showSelectStaff, setShowSelectStaff] = useState(false)
    const [searchStaff, setSearchStaff] = useState('')

    const staffWithOvertime = useMemo(() => staffList.filter(s => overtimeRecords[s.id] && overtimeRecords[s.id].length > 0), [staffList, overtimeRecords])

    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)

    const dateStartStr = `${monthStart.getFullYear()}-${(monthStart.getMonth() + 1).toString().padStart(2, '0')}-01`
    const dateEndStr = `${monthEnd.getFullYear()}-${(monthEnd.getMonth() + 1).toString().padStart(2, '0')}-${monthEnd.getDate().toString().padStart(2, '0')}`

    const displayMonth = currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            // Fetch active staff with salary info
            const { data: staffRes, error: staffErr } = await supabase
                .from('hr_staff')
                .select('id, full_name, position, department, salary_amount, salary_type')
                .eq('status', 'active')
                .order('full_name')
            if (staffErr) throw staffErr

            // Fetch overtime for this month
            const { data: otRes, error: otErr } = await supabase
                .from('hr_staff_overtime')
                .select('*')
                .gte('date', dateStartStr)
                .lte('date', dateEndStr)
                .order('date', { ascending: true })
            if (otErr) throw otErr

            setStaffList((staffRes as HRStaffMember[]) || [])
            
            const grouped: Record<string, HRStaffOvertime[]> = {}
            if (otRes) {
                otRes.forEach((r: any) => {
                    if (!grouped[r.staff_id]) grouped[r.staff_id] = []
                    grouped[r.staff_id].push(r)
                })
            }
            setOvertimeRecords(grouped)
        } catch (err) {
            console.error('Error fetching overtime data:', err)
        }
        setLoading(false)
    }, [dateStartStr, dateEndStr])

    useEffect(() => { 
        fetchAll()
        setSettings(getOvertimeSettings())
    }, [fetchAll])

    const getHourlyRate = (staff: HRStaffMember) => {
        if (!staff.salary_amount) return 0;
        if (staff.salary_type === 'hourly') return staff.salary_amount;
        
        // Fixed monthly salary: divide by days in month, then by 8 hours
        const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
        return (staff.salary_amount / daysInMonth) / 8;
    }

    const calculateCost = (r: HRStaffOvertime, staff: HRStaffMember) => {
        let multiplier = 1;
        if (r.is_public_holiday) {
            multiplier = r.compensation_type === 'salary' ? settings.public_holiday_multiplier_salary : settings.public_holiday_multiplier_leave;
        } else {
            multiplier = r.compensation_type === 'salary' ? settings.overtime_multiplier_salary : settings.overtime_multiplier_leave;
        }
        
        const eqHours = r.hours * multiplier;
        
        if (r.compensation_type === 'annual_leave') {
            return eqHours / 8; // 8 hours = 1 leave day
        } else {
            const hourlyRate = getHourlyRate(staff);
            return eqHours * hourlyRate; // Monetary cost
        }
    }

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

    // Modal State
    const [modalOpen, setModalOpen] = useState(false)
    const [selectedStaff, setSelectedStaff] = useState<HRStaffMember | null>(null)
    const [saving, setSaving] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const [formData, setFormData] = useState({
        date: '', // default empty, required yyyy-mm-dd
        hours: 0,
        reason: '',
        compensation_type: 'salary' as 'salary' | 'annual_leave',
        is_public_holiday: false
    })

    const openModal = (staff: HRStaffMember) => {
        setSelectedStaff(staff)
        setFormData({
            date: '',
            hours: 0,
            reason: '',
            compensation_type: 'salary',
            is_public_holiday: false
        })
        setModalOpen(true)
    }

    const closeModal = () => {
        setModalOpen(false)
        setSelectedStaff(null)
    }

    const handleSaveNew = async () => {
        if (!selectedStaff || !formData.date || formData.hours <= 0 || !formData.reason) {
            alert('Please fill out all fields correctly (hours must be > 0).')
            return
        }
        
        // Ensure date falls within current selected month
        const inputDate = new Date(formData.date)
        if (inputDate.getFullYear() !== currentDate.getFullYear() || inputDate.getMonth() !== currentDate.getMonth()) {
            alert(`The date must belong to the selected month: ${displayMonth}.`)
            return
        }

        setSaving(true)
        try {
            const payload = {
                staff_id: selectedStaff.id,
                date: formData.date,
                hours: Number(formData.hours),
                reason: formData.reason,
                compensation_type: formData.compensation_type,
                is_public_holiday: formData.is_public_holiday
            }

            const { data, error } = await supabase
                .from('hr_staff_overtime')
                .insert(payload)
                .select()
                .single()

            if (error) throw error
            if (data) {
                setOvertimeRecords(prev => {
                    const existing = prev[selectedStaff.id] || []
                    const updated = [...existing, data as HRStaffOvertime].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    return { ...prev, [selectedStaff.id]: updated }
                })
                
                // Reset form to allow fast consecutive inserts
                setFormData({
                    date: '',
                    hours: 0,
                    reason: '',
                    compensation_type: 'salary',
                    is_public_holiday: false
                })
            }
        } catch (err) {
            console.error('Error saving new overtime:', err)
            alert('A network error occurred while saving.')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (otId: string) => {
        if (!selectedStaff) return
        if (!confirm('Are you sure you want to delete this overtime record?')) return
        
        setDeletingId(otId)
        try {
            const { error } = await supabase
                .from('hr_staff_overtime')
                .delete()
                .eq('id', otId)

            if (error) throw error

            setOvertimeRecords(prev => {
                const existing = prev[selectedStaff.id] || []
                return { ...prev, [selectedStaff.id]: existing.filter(r => r.id !== otId) }
            })
        } catch (err) {
            console.error('Error deleting overtime:', err)
            alert('A network error occurred while deleting.')
        } finally {
            setDeletingId(null)
        }
    }

    if (loading && staffList.length === 0) {
        return <div className="min-h-screen flex items-center justify-center"><CircularLoader /></div>
    }

    return (
        <div className="min-h-screen text-gray-100 p-6 animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto">
                <div className="mb-6 ml-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                            Overtime Tracker
                        </h1>
                        <p className="text-sm text-slate-400 mt-1">
                            Track monthly overtime breakdown, hours, and compensations.
                        </p>
                    </div>
                    <button 
                        type="button" 
                        onClick={() => setShowSelectStaff(true)} 
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition shadow hover:shadow-lg shrink-0"
                    >
                        <Plus className="w-4 h-4" /> Add Overtime
                    </button>
                </div>

                {/* Header Nav matching Performance/Attendance exactly */}
                <div className="mt-3 mb-4 flex items-center justify-between text-sm text-blue-100 px-2">
                    <button type="button" onClick={handlePrevious} className="flex items-center gap-1 hover:text-white">
                        <ChevronLeft className="w-4 h-4" />
                        <span>Previous</span>
                    </button>

                    <div className="flex items-center gap-2 text-white">
                        <span className="text-base font-semibold capitalize">{displayMonth}</span>
                    </div>

                    <button type="button" onClick={handleNext} className="flex items-center gap-1 hover:text-white">
                        <span>Next</span>
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                {/* Table Area */}
                <div className="rounded-2xl bg-white shadow-xl overflow-hidden border border-gray-100">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="px-5 py-4 text-left font-semibold text-gray-500 uppercase tracking-widest text-xs">Staff Member</th>
                                    <th className="px-5 py-4 text-left font-semibold text-gray-500 uppercase tracking-widest text-xs">Position</th>
                                    <th className="px-5 py-4 text-center font-semibold text-gray-500 uppercase tracking-widest text-xs border-l border-gray-100">Total Entries</th>
                                    <th className="px-5 py-4 text-center font-semibold text-gray-500 uppercase tracking-widest text-xs">Total Hours</th>
                                    <th className="px-5 py-4 text-center font-semibold text-gray-500 uppercase tracking-widest text-xs border-l border-gray-100">Total Cost</th>
                                    <th className="px-5 py-4 text-center font-semibold text-gray-500 uppercase tracking-widest text-xs">Total AL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {staffWithOvertime.map((s, idx) => {
                                    const records = overtimeRecords[s.id] || []
                                    const totalHours = records.reduce((sum, r) => sum + r.hours, 0)
                                    const salaryEq = records.filter(r => r.compensation_type === 'salary').reduce((sum, r) => sum + calculateCost(r, s), 0)
                                    const leaveEq = records.filter(r => r.compensation_type === 'annual_leave').reduce((sum, r) => sum + calculateCost(r, s), 0)

                                    return (
                                        <tr 
                                            key={s.id} 
                                            onClick={() => openModal(s)}
                                            className={`border-b border-gray-100 hover:bg-slate-50 transition-colors cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
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
                                            <td className="px-5 py-4 text-center border-l border-gray-100 text-gray-900 font-medium">
                                                {records.length > 0 ? records.length : <span className="text-gray-300">-</span>}
                                            </td>
                                            <td className="px-5 py-4 text-center text-blue-700 font-semibold bg-blue-50/20">
                                                {totalHours > 0 ? `${totalHours}h` : <span className="text-gray-300">-</span>}
                                            </td>
                                            <td className="px-5 py-4 text-center text-emerald-700 font-semibold bg-emerald-50/30 border-l border-gray-100 whitespace-nowrap">
                                                {salaryEq > 0 ? new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(salaryEq) : <span className="text-gray-300">-</span>}
                                            </td>
                                            <td className="px-5 py-4 text-center text-purple-700 font-semibold bg-purple-50/30 border-r border-gray-100 whitespace-nowrap">
                                                {leaveEq > 0 ? parseFloat(leaveEq.toFixed(3)) : <span className="text-gray-300">-</span>}
                                            </td>
                                        </tr>
                                    )
                                })}
                                {(staffWithOvertime).length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-16 text-center">
                                            <Watch className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                            <p className="text-gray-500 text-sm font-medium">No overtime records for this month.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal */}
            {modalOpen && selectedStaff && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-all" onClick={closeModal} />
                    
                    <div className="relative w-full max-w-4xl bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white/50 ring-1 ring-black/5 flex flex-col max-h-[85vh]">
                        {saving && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
                                <CircularLoader />
                            </div>
                        )}
                        
                        <div className="flex items-start justify-between p-6 border-b border-gray-200/50 bg-white/50 shrink-0">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 tracking-tight">Overtime Details</h3>
                                <p className="text-sm text-gray-500 mt-1 leading-relaxed">{selectedStaff.full_name} &bull; <span className="capitalize">{displayMonth}</span></p>
                            </div>
                            <button onClick={closeModal} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100/80 rounded-full transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body: Two columns layout */}
                        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                            
                            {/* Insert New Block - left column */}
                            <div className="p-6 md:w-[320px] bg-slate-50/50 border-b md:border-b-0 md:border-r border-gray-100 shrink-0 overflow-y-auto">
                                <h4 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <Plus className="w-4 h-4 text-blue-500" /> Add Overtime
                                </h4>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Date</label>
                                        <input 
                                            type="date" 
                                            min={dateStartStr}
                                            max={dateEndStr}
                                            value={formData.date}
                                            onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))}
                                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-gray-900 shadow-sm"
                                        />
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1">
                                            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Hours</label>
                                            <input 
                                                type="number" min="0" step="0.5"
                                                value={formData.hours || ''}
                                                onChange={(e) => setFormData(p => ({ ...p, hours: e.target.value === '' ? 0 : Number(e.target.value) }))}
                                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-gray-900 shadow-sm"
                                            />
                                        </div>
                                        <div className="flex-1 flex flex-col justify-end h-[68px]">
                                            <label className="block text-xs font-semibold text-gray-500 mb-2">Rate Type</label>
                                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                                <input 
                                                    type="checkbox" 
                                                    className="sr-only peer" 
                                                    checked={formData.is_public_holiday} 
                                                    onChange={e => setFormData(p => ({ ...p, is_public_holiday: e.target.checked }))} 
                                                />
                                                <div className="relative w-11 h-6 rounded-full shrink-0 transition-colors bg-gray-200 peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:border after:transition-transform peer-checked:after:translate-x-5 shadow-sm" />
                                                <span className="text-xs font-medium text-gray-700">{formData.is_public_holiday ? 'Holiday' : 'Normal'}</span>
                                            </label>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Reason</label>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. late closing"
                                            value={formData.reason}
                                            onChange={(e) => setFormData(p => ({ ...p, reason: e.target.value }))}
                                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-gray-900 shadow-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Paid via</label>
                                        <select 
                                            value={formData.compensation_type}
                                            onChange={(e) => setFormData(p => ({ ...p, compensation_type: e.target.value as any }))}
                                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-gray-900 shadow-sm"
                                        >
                                            <option value="salary">Salary</option>
                                            <option value="annual_leave">Annual Leave</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="mt-6">
                                    <button
                                        onClick={handleSaveNew}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white text-sm font-bold tracking-wide rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-all shadow-sm hover:shadow"
                                    >
                                        <Save className="w-4.5 h-4.5" /> ADD RECORD
                                    </button>
                                </div>
                            </div>

                            {/* History List - right column */}
                            <div className="flex-1 p-6 overflow-y-auto bg-white/50 relative">
                                <div className="flex flex-col h-full">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                            <CalendarDays className="w-4 h-4 text-slate-400" /> Recorded Overtime
                                        </h4>
                                        <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold border border-blue-100/50 shadow-sm">
                                             Total: {(overtimeRecords[selectedStaff.id] || []).reduce((sum, r) => sum + r.hours, 0)}h
                                        </div>
                                    </div>
                                    
                                    {(!overtimeRecords[selectedStaff.id] || overtimeRecords[selectedStaff.id].length === 0) ? (
                                        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 mb-3 shadow-inner">
                                                <Watch className="w-8 h-8 text-gray-300" />
                                            </div>
                                            <h4 className="text-gray-900 font-semibold mb-1">No Records Yet</h4>
                                            <p className="text-gray-500 text-sm">Add a new overtime entry using the form.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {overtimeRecords[selectedStaff.id].map(record => (
                                                <div key={record.id} className="group flex items-center gap-4 bg-white p-3.5 rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all relative">
                                                    {deletingId === record.id && (
                                                        <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">
                                                            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                                                        </div>
                                                    )}
                                                    
                                                    <div className="w-12 h-12 bg-slate-50 border border-gray-100 rounded-xl flex flex-col items-center justify-center shrink-0 shadow-inner">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{new Date(record.date).toLocaleDateString('en-GB', { month: 'short' })}</span>
                                                        <span className="text-sm font-black text-slate-700 leading-none mt-0.5">{new Date(record.date).toLocaleDateString('en-GB', { day: 'numeric' })}</span>
                                                    </div>
                                                    
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm font-semibold text-gray-900 truncate">{record.reason}</p>
                                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border shrink-0 ${record.compensation_type === 'salary' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-purple-50 text-purple-600 border-purple-100'}`}>
                                                                {record.compensation_type === 'salary' ? 'Salary' : 'Annual Leave'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="text-right shrink-0 flex flex-col justify-center items-end min-w-[70px]">
                                                        <span className="text-base font-black text-gray-800 leading-none">{record.hours}h</span>
                                                        <span className={`text-[11px] font-bold mt-1 ${record.compensation_type === 'salary' ? 'text-emerald-600' : 'text-purple-600'}`}>
                                                            {record.compensation_type === 'salary'
                                                                ? new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(calculateCost(record, selectedStaff))
                                                                : parseFloat(calculateCost(record, selectedStaff).toFixed(3))}
                                                        </span>
                                                    </div>
                                                    
                                                    <button 
                                                        onClick={() => handleDelete(record.id)}
                                                        className="ml-2 w-8 h-8 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                                                        title="Delete record"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Select Staff Modal */}
            {showSelectStaff && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowSelectStaff(false)} />
                    <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold text-gray-900">Select Staff</h3>
                            <button onClick={() => setShowSelectStaff(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <input
                            type="text"
                            placeholder="Search staff by name..."
                            className="w-full px-4 py-2 border border-gray-300 rounded-xl mb-4 text-sm focus:ring-2 focus:ring-blue-500 text-gray-900"
                            value={searchStaff}
                            onChange={(e) => setSearchStaff(e.target.value)}
                        />
                        <div className="max-h-[50vh] overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-100">
                            {staffList.filter(s => s.full_name.toLowerCase().includes(searchStaff.toLowerCase())).map(s => (
                                <button
                                    key={s.id}
                                    className="w-full flex items-center gap-3 p-3 hover:bg-blue-50 transition text-left"
                                    onClick={() => {
                                        setShowSelectStaff(false);
                                        setSearchStaff('');
                                        openModal(s);
                                    }}
                                >
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-indigo-800 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm">
                                        {(s.full_name || '').split(/\s+/).filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-gray-900">{s.full_name}</div>
                                        <div className="text-xs text-gray-500">{s.position}</div>
                                    </div>
                                </button>
                            ))}
                            {staffList.filter(s => s.full_name.toLowerCase().includes(searchStaff.toLowerCase())).length === 0 && (
                                <div className="p-4 text-center text-gray-500 text-sm">No staff member found.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
