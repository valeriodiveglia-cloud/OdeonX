'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffMember, HRStaffAttendanceMonthly } from '@/types/human-resources'
import { ChevronLeft, ChevronRight, Users, CalendarHeart, X, Loader2, Save } from 'lucide-react'
import CircularLoader from '@/components/CircularLoader'

export default function AttendanceMonthlyPage() {
    const [currentDate, setCurrentDate] = useState(() => new Date())
    const [loading, setLoading] = useState(true)

    // Data
    const [staffList, setStaffList] = useState<HRStaffMember[]>([])
    const [attendanceDict, setAttendanceDict] = useState<Record<string, HRStaffAttendanceMonthly>>({})

    const monthId = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`
    
    // Formatting display
    const displayMonth = currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            // Fetch all active staff
            const { data: staffRes, error: staffErr } = await supabase
                .from('hr_staff')
                .select('id, full_name, position, department')
                .eq('status', 'active')
                .order('full_name')
            if (staffErr) throw staffErr

            // Fetch attendance for the month
            const { data: attRes, error: attErr } = await supabase
                .from('hr_staff_attendance_monthly')
                .select('*')
                .eq('month_id', monthId)
            if (attErr) throw attErr

            setStaffList(staffRes as HRStaffMember[] || [])
            
            const dict: Record<string, HRStaffAttendanceMonthly> = {}
            if (attRes) {
                attRes.forEach((r: any) => { dict[r.staff_id] = r })
            }
            setAttendanceDict(dict)
        } catch (err) {
            console.error('Error fetching attendance data:', err)
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

    const handleSelectToday = () => {
        setCurrentDate(new Date())
    }

    // Modal State
    const [modalOpen, setModalOpen] = useState(false)
    const [selectedStaff, setSelectedStaff] = useState<HRStaffMember | null>(null)
    const [formData, setFormData] = useState({
        lates_count: 0,
        lates_minutes: 0,
        no_shows_count: 0,
        annual_leaves: 0,
        sick_leaves: 0,
        unpaid_leaves: 0,
        other_leaves: 0,
        notes: ''
    })
    const [saving, setSaving] = useState(false)

    const openModal = (staff: HRStaffMember) => {
        setSelectedStaff(staff)
        const rec = attendanceDict[staff.id]
        if (rec) {
            setFormData({
                lates_count: rec.lates_count || 0,
                lates_minutes: rec.lates_minutes || 0,
                no_shows_count: rec.no_shows_count || 0,
                annual_leaves: rec.annual_leaves || 0,
                sick_leaves: rec.sick_leaves || 0,
                unpaid_leaves: rec.unpaid_leaves || 0,
                other_leaves: rec.other_leaves || 0,
                notes: rec.notes || ''
            })
        } else {
            setFormData({
                lates_count: 0,
                lates_minutes: 0,
                no_shows_count: 0,
                annual_leaves: 0,
                sick_leaves: 0,
                unpaid_leaves: 0,
                other_leaves: 0,
                notes: ''
            })
        }
        setModalOpen(true)
    }

    const closeModal = () => {
        setModalOpen(false)
        setSelectedStaff(null)
    }

    const handleSave = async () => {
        if (!selectedStaff) return
        setSaving(true)
        try {
            const payload = {
                staff_id: selectedStaff.id,
                month_id: monthId,
                lates_count: Number(formData.lates_count),
                lates_minutes: Number(formData.lates_minutes),
                no_shows_count: Number(formData.no_shows_count),
                annual_leaves: Number(formData.annual_leaves),
                sick_leaves: Number(formData.sick_leaves),
                unpaid_leaves: Number(formData.unpaid_leaves),
                other_leaves: Number(formData.other_leaves),
                notes: formData.notes,
            }

            const { data, error } = await supabase
                .from('hr_staff_attendance_monthly')
                .upsert(payload, { onConflict: 'staff_id, month_id' })
                .select()
                .single()

            if (error) throw error
            if (data) {
                setAttendanceDict(prev => ({
                    ...prev,
                    [selectedStaff.id]: data as HRStaffAttendanceMonthly
                }))
            }
            closeModal()
        } catch (err) {
            console.error('Error saving attendance:', err)
            alert('A network error occurred while saving.')
        } finally {
            setSaving(false)
        }
    }

    if (loading && staffList.length === 0) {
        return <div className="min-h-screen bg-\[#0b1530\] flex items-center justify-center"><CircularLoader /></div>
    }

    return (
        <div className="min-h-screen bg-\[#0b1530\] text-gray-100 p-6 animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                        Monthly Attendance Tracker
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">
                        Track lates, and leaves aggregated by month for your active staff.
                    </p>
                </div>

                {/* Header Nav */}
                <div className="mt-3 mb-4 flex items-center justify-between text-sm text-blue-100">
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
                                    <th className="px-4 py-3 text-left font-semibold text-gray-500" rowSpan={2}>Staff Member</th>
                                    <th className="px-4 py-3 text-left font-semibold text-gray-500" rowSpan={2}>Position</th>
                                    <th className="px-4 py-3 text-center font-semibold text-gray-500 border-x border-gray-100" colSpan={3}>Tardiness</th>
                                    <th className="px-4 py-3 text-center font-semibold text-gray-500" colSpan={4}>Leaves (Days)</th>
                                </tr>
                                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                                    {/* Tardiness */}
                                    <th className="px-3 py-2 text-center border-l border-gray-100 font-medium">Lates</th>
                                    <th className="px-3 py-2 text-center font-medium">Lates (Mins)</th>
                                    <th className="px-3 py-2 text-center font-medium text-blue-600 bg-blue-50/50 border-r border-gray-100">Avg Rate</th>
                                    {/* Leaves */}
                                    <th className="px-3 py-2 text-center font-medium">Annual</th>
                                    <th className="px-3 py-2 text-center font-medium">Sick</th>
                                    <th className="px-3 py-2 text-center font-medium">Unpaid</th>
                                    <th className="px-3 py-2 text-center font-medium">Other</th>
                                </tr>
                            </thead>
                            <tbody>
                                {staffList.map((s, idx) => {
                                    const rec = attendanceDict[s.id] || {
                                        lates_count: 0,
                                        lates_minutes: 0,
                                        no_shows_count: 0,
                                        annual_leaves: 0,
                                        sick_leaves: 0,
                                        unpaid_leaves: 0,
                                        other_leaves: 0
                                    }

                                    const rate = rec.lates_count > 0 ? Math.round(rec.lates_minutes / rec.lates_count) : 0

                                    return (
                                        <tr 
                                            key={s.id} 
                                            onClick={() => openModal(s)}
                                            className={`border-b border-gray-100 hover:bg-slate-50 transition-colors cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                                        >
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-sm">
                                                        {(s.full_name || '').split(/\s+/).filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <span className="text-sm font-semibold text-gray-900 block">{s.full_name}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-sm">
                                                {s.position}
                                            </td>
                                            {/* Tardiness */}
                                            <td className="px-3 py-3 text-center border-l border-gray-100 text-gray-900 font-medium">
                                                {rec.lates_count}
                                            </td>
                                            <td className="px-3 py-3 text-center text-gray-900 font-medium">
                                                {rec.lates_minutes}
                                            </td>
                                            <td className="px-3 py-3 text-center text-blue-700 font-semibold bg-blue-50/20 border-r border-gray-100">
                                                {rate > 0 ? rate : '-'}
                                            </td>
                                            {/* Leaves */}
                                            <td className="px-3 py-3 text-center text-gray-900 font-medium">{rec.annual_leaves}</td>
                                            <td className="px-3 py-3 text-center text-gray-900 font-medium">{rec.sick_leaves}</td>
                                            <td className="px-3 py-3 text-center text-gray-900 font-medium">{rec.unpaid_leaves}</td>
                                            <td className="px-3 py-3 text-center text-gray-900 font-medium">{rec.other_leaves}</td>
                                        </tr>
                                    )
                                })}
                                {staffList.length === 0 && (
                                    <tr>
                                        <td colSpan={10} className="px-4 py-16 text-center">
                                            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                            <p className="text-gray-500 text-sm font-medium">No active staff members found.</p>
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
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={closeModal} />
                    
                    <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-200">
                        {saving && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
                                <CircularLoader />
                            </div>
                        )}
                        
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Edit Attendance</h3>
                                <p className="text-sm text-gray-500">{selectedStaff.full_name} &bull; <span className="capitalize">{displayMonth}</span></p>
                            </div>
                            <button onClick={closeModal} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-6">
                            {/* Tardiness Group */}
                            <div>
                                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Tardiness</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Lates (Instances)</label>
                                        <input 
                                            type="number" min="0" step="1"
                                            value={formData.lates_count || ''}
                                            onChange={(e) => setFormData(p => ({ ...p, lates_count: e.target.value === '' ? 0 : Number(e.target.value) }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Lates (Total Mins)</label>
                                        <input 
                                            type="number" min="0" step="1"
                                            value={formData.lates_minutes || ''}
                                            onChange={(e) => setFormData(p => ({ ...p, lates_minutes: e.target.value === '' ? 0 : Number(e.target.value) }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                                        />
                                    </div>
                                </div>
                            </div>

                            <hr className="border-gray-100" />

                            {/* Leaves Group */}
                            <div>
                                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Leaves & Absences</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Annual Leaves (Days)</label>
                                        <input 
                                            type="number" min="0" step="0.5"
                                            value={formData.annual_leaves || ''}
                                            onChange={(e) => setFormData(p => ({ ...p, annual_leaves: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Sick Leaves (Days)</label>
                                        <input 
                                            type="number" min="0" step="0.5"
                                            value={formData.sick_leaves || ''}
                                            onChange={(e) => setFormData(p => ({ ...p, sick_leaves: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Unpaid Leaves (Days)</label>
                                        <input 
                                            type="number" min="0" step="0.5"
                                            value={formData.unpaid_leaves || ''}
                                            onChange={(e) => setFormData(p => ({ ...p, unpaid_leaves: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Other Leaves (Days)</label>
                                        <input 
                                            type="number" min="0" step="0.5"
                                            value={formData.other_leaves || ''}
                                            onChange={(e) => setFormData(p => ({ ...p, other_leaves: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                                        />
                                    </div>
                                </div>
                            </div>

                            <hr className="border-gray-100" />

                            {/* Notes Group */}
                            <div>
                                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Notes</h4>
                                <textarea 
                                    rows={2}
                                    value={formData.notes}
                                    onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 resize-none text-sm"
                                    placeholder="Add any specific comments about this month's attendance..."
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-8 flex justify-end gap-3">
                            <button
                                onClick={closeModal}
                                className="px-5 py-2.5 text-gray-700 font-semibold hover:bg-gray-100 rounded-xl transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition shadow-sm shadow-blue-500/20"
                            >
                                <Save className="w-4 h-4" /> Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
