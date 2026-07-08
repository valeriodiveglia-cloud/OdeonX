'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffMember, HRStaffAttendanceMonthly } from '@/types/human-resources'
import { Users, X, Save, ChevronDown } from 'lucide-react'
import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'
import MonthPicker from '@/components/MonthPicker'
import { getCurrentUserPermissions } from '@/lib/user-branches'

function toMonthInputValue(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function fromMonthInputValue(val: string) { const [y, m] = val.split('-').map(Number); return new Date(y, m - 1, 1) }

export default function AttendanceMonthlyPage() {
    const { language } = useSettings()
    const [currentDate, setCurrentDate] = useState(() => new Date())
    const [loading, setLoading] = useState(true)
    const [selectedCity, setSelectedCity] = useState<'Ho Chi Minh' | 'Da Lat'>('Ho Chi Minh')
    const [allowedCities, setAllowedCities] = useState<('Ho Chi Minh' | 'Da Lat')[]>(['Ho Chi Minh', 'Da Lat'])
    const [cityDropdownOpen, setCityDropdownOpen] = useState(false)

    // Permissions State
    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
    const [currentUserBranches, setCurrentUserBranches] = useState<string[] | null>(null)

    // Data
    const [staffList, setStaffList] = useState<HRStaffMember[]>([])
    const [attendanceDict, setAttendanceDict] = useState<Record<string, HRStaffAttendanceMonthly>>({})

    const monthId = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`
    
    // Formatting display
    const displayMonth = currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            let userRole = currentUserRole
            let userBranches = currentUserBranches
            if (!userRole) {
                const perms = await getCurrentUserPermissions()
                userRole = perms.role
                userBranches = perms.branches
                setCurrentUserRole(userRole)
                setCurrentUserBranches(userBranches)
            }

            // Carica tutti i branch per mappare le città autorizzate
            const { data: bData } = await supabase.from('provider_branches').select('id, name, city')
            let cities: ('Ho Chi Minh' | 'Da Lat')[] = ['Ho Chi Minh', 'Da Lat']
            if (userRole && !['owner', 'admin'].includes(userRole) && userBranches && bData) {
                const mappedCities = bData
                    .filter((b: any) => userBranches.includes(b.id))
                    .map((b: any) => b.city as 'Ho Chi Minh' | 'Da Lat')
                    .filter(Boolean)
                cities = Array.from(new Set(mappedCities))
                setAllowedCities(cities)
                if (cities.length > 0 && !cities.includes(selectedCity)) {
                    setSelectedCity(cities[0])
                }
            } else {
                setAllowedCities(['Ho Chi Minh', 'Da Lat'])
            }

            // Fetch all active staff (excluding outsourced) with branch info
            const { data: staffRes, error: staffErr } = await supabase
                .from('hr_staff')
                .select('id, full_name, position, department, city, employment_type, hr_staff_branches(branch_id)')
                .eq('status', 'active')
                .neq('employment_type', 'outsourced')
                .order('full_name')
            if (staffErr) throw staffErr

            // Fetch attendance for the month
            const { data: attRes, error: attErr } = await supabase
                .from('hr_staff_attendance_monthly')
                .select('*')
                .eq('month_id', monthId)
            if (attErr) throw attErr

            let filteredStaff = (staffRes as any[] || [])
            if (userRole && !['owner', 'admin'].includes(userRole) && userBranches) {
                filteredStaff = filteredStaff.filter(s =>
                    (s.hr_staff_branches || []).some((sb: any) => userBranches.includes(sb.branch_id))
                )
            }

            setStaffList(filteredStaff as HRStaffMember[])
            
            const dict: Record<string, HRStaffAttendanceMonthly> = {}
            if (attRes) {
                attRes.forEach((r: any) => { 
                    if (!userRole || ['owner', 'admin'].includes(userRole) || !userBranches || filteredStaff.some(s => s.id === r.staff_id)) {
                        dict[r.staff_id] = r 
                    }
                })
            }
            setAttendanceDict(dict)
        } catch (err) {
            console.error('Error fetching attendance data:', err)
        }
        setLoading(false)
    }, [monthId, currentUserRole, currentUserBranches])

    useEffect(() => { fetchAll() }, [fetchAll])

    // Filter staff by city
    const filteredStaff = useMemo(() => {
        return staffList.filter(s => {
            if (selectedCity === 'Ho Chi Minh') {
                return s.city === 'Ho Chi Minh' || !s.city
            }
            return s.city === selectedCity
        })
    }, [staffList, selectedCity])

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
            const errMsg = language === 'vi' ? 'Đã xảy ra lỗi kết nối mạng khi lưu.' : 'A network error occurred while saving.'
            alert(errMsg)
        } finally {
            setSaving(false)
        }
    }

    if (loading && staffList.length === 0) {
        return <div className="min-h-screen bg-[#0b1530] flex items-center justify-center"><CircularLoader /></div>
    }

    return (
        <div className="min-h-screen bg-[#0b1530] text-gray-100 p-6 animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto">
                <div className="mb-6 ml-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                            {language === 'vi' ? 'Theo Dõi Chuyên Cần Hàng Tháng' : 'Monthly Attendance Tracker'}
                        </h1>
                        <p className="text-sm text-slate-400 mt-1">
                            {language === 'vi' 
                                ? 'Theo dõi số lần trễ và số ngày nghỉ phép gộp theo tháng cho nhân sự.' 
                                : 'Track lates, and leaves aggregated by month for your active staff.'}
                        </p>
                    </div>
                </div>

                {/* 1. City Selection Dropdown (White Theme) - Compresso (w-36) e con angoli rounded-lg */}
                <div className="mb-8 px-2 flex items-center gap-3 relative z-20">
                    <span className="text-sm font-semibold text-slate-400">{language === 'vi' ? 'Thành phố:' : 'City:'}</span>
                    <div className="relative inline-block text-left">
                        <button
                            type="button"
                            onClick={() => allowedCities.length > 1 && setCityDropdownOpen(!cityDropdownOpen)}
                            className={`inline-flex justify-between items-center gap-2 w-36 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900 transition-all outline-none ${
                                allowedCities.length > 1 ? 'hover:bg-gray-50 focus:ring-2 focus:ring-blue-500/50' : 'cursor-default opacity-85'
                            }`}
                        >
                            <span className="truncate">{selectedCity}</span>
                            {allowedCities.length > 1 && <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />}
                        </button>

                        {cityDropdownOpen && allowedCities.length > 1 && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setCityDropdownOpen(false)} />
                                <div className="absolute left-0 mt-2 w-36 rounded-lg bg-white border border-gray-200 shadow-xl z-20 focus:outline-none overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100">
                                    <div className="py-1">
                                        {allowedCities.includes('Ho Chi Minh') && (
                                            <button
                                                onClick={() => {
                                                    setSelectedCity('Ho Chi Minh')
                                                    setCityDropdownOpen(false)
                                                }}
                                                className={`w-full text-left px-3 py-2 text-sm font-semibold transition-colors ${
                                                    selectedCity === 'Ho Chi Minh'
                                                        ? 'bg-blue-600 text-white'
                                                        : 'text-gray-700 hover:bg-gray-100'
                                                }`}
                                            >
                                                Ho Chi Minh
                                            </button>
                                        )}
                                        {allowedCities.includes('Da Lat') && (
                                            <button
                                                onClick={() => {
                                                    setSelectedCity('Da Lat')
                                                    setCityDropdownOpen(false)
                                                }}
                                                className={`w-full text-left px-3 py-2 text-sm font-semibold transition-colors ${
                                                    selectedCity === 'Da Lat'
                                                        ? 'bg-blue-600 text-white'
                                                        : 'text-gray-700 hover:bg-gray-100'
                                                }`}
                                            >
                                                Da Lat
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* 2. MonthPicker a larghezza intera / posizionato da solo sotto il dropdown con spaziature aumentate */}
                <MonthPicker
                    value={toMonthInputValue(currentDate)}
                    onChange={(val) => {
                        const d = fromMonthInputValue(val)
                        if (d) setCurrentDate(d)
                    }}
                    language={language}
                    colorClass="text-blue-100 hover:text-white"
                    labelColorClass="text-white"
                    iconColorClass="text-blue-200 hover:text-white"
                    className="mt-6 mb-8 px-2"
                />

                {/* Table Area - rounded-lg */}
                <div className="rounded-lg bg-white shadow-xl overflow-hidden border border-gray-100">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="px-5 py-4 text-left font-semibold text-gray-500 uppercase tracking-widest text-xs" rowSpan={2}>
                                        {language === 'vi' ? 'Nhân viên' : 'Staff Member'}
                                    </th>
                                    <th className="px-5 py-4 text-left font-semibold text-gray-500 uppercase tracking-widest text-xs" rowSpan={2}>
                                        {language === 'vi' ? 'Chức vụ' : 'Position'}
                                    </th>
                                    <th className="px-5 py-4 text-center font-semibold text-gray-500 uppercase tracking-widest text-xs border-x border-gray-100" colSpan={3}>
                                        {language === 'vi' ? 'Đi Muộn' : 'Tardiness'}
                                    </th>
                                    <th className="px-5 py-4 text-center font-semibold text-gray-500 uppercase tracking-widest text-xs" colSpan={4}>
                                        {language === 'vi' ? 'Nghỉ Phép (Ngày)' : 'Leaves (Days)'}
                                    </th>
                                </tr>
                                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                                    {/* Tardiness */}
                                    <th className="px-3 py-2 text-center border-l border-gray-100 font-semibold">{language === 'vi' ? 'Số lần trễ' : 'Lates'}</th>
                                    <th className="px-3 py-2 text-center font-semibold">{language === 'vi' ? 'Số phút trễ' : 'Lates (Mins)'}</th>
                                    <th className="px-3 py-2 text-center font-semibold text-blue-600 bg-blue-50/50 border-r border-gray-100">{language === 'vi' ? 'Tỉ lệ TB' : 'Avg Rate'}</th>
                                    {/* Leaves */}
                                    <th className="px-3 py-2 text-center font-semibold">{language === 'vi' ? 'Phép năm' : 'Annual'}</th>
                                    <th className="px-3 py-2 text-center font-semibold">{language === 'vi' ? 'Bệnh' : 'Sick'}</th>
                                    <th className="px-3 py-2 text-center font-semibold">{language === 'vi' ? 'Không lương' : 'Unpaid'}</th>
                                    <th className="px-3 py-2 text-center font-semibold">{language === 'vi' ? 'Khác' : 'Other'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStaff.map((s, idx) => {
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
                                            className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
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
                                            {/* Tardiness */}
                                            <td className="px-3 py-4 text-center border-l border-gray-100 text-gray-900 font-semibold">
                                                {rec.lates_count}
                                            </td>
                                            <td className="px-3 py-4 text-center text-gray-900 font-semibold">
                                                {rec.lates_minutes}
                                            </td>
                                            <td className="px-3 py-4 text-center text-blue-700 font-bold bg-blue-50/20 border-r border-gray-100">
                                                {rate > 0 ? `${rate}m` : '-'}
                                            </td>
                                            {/* Leaves */}
                                            <td className="px-3 py-4 text-center text-gray-900 font-semibold">{rec.annual_leaves}</td>
                                            <td className="px-3 py-4 text-center text-gray-900 font-semibold">{rec.sick_leaves}</td>
                                            <td className="px-3 py-4 text-center text-gray-900 font-semibold">{rec.unpaid_leaves}</td>
                                            <td className="px-3 py-4 text-center text-gray-900 font-semibold">{rec.other_leaves}</td>
                                        </tr>
                                    )
                                })}
                                {filteredStaff.length === 0 && (
                                    <tr>
                                        <td colSpan={10} className="px-4 py-16 text-center">
                                            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                            <p className="text-gray-500 text-sm font-medium">
                                                {language === 'vi' 
                                                    ? `Không tìm thấy nhân sự đang hoạt động tại ${selectedCity}.` 
                                                    : `No active staff members found for ${selectedCity}.`}
                                            </p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal - Allineato a rounded-lg per input e pulsanti */}
            {modalOpen && selectedStaff && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={closeModal} />
                    
                    <div className="relative w-full max-w-lg bg-white rounded-lg shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
                        {saving && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
                                <CircularLoader />
                            </div>
                        )}
                        
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">
                                    {language === 'vi' ? 'Chỉnh Sửa Chuyên Cần' : 'Edit Attendance'}
                                </h3>
                                <p className="text-sm text-gray-500">{selectedStaff.full_name} &bull; <span className="capitalize">{displayMonth}</span></p>
                            </div>
                            <button onClick={closeModal} className="p-2 text-gray-400 hover:text-gray-650 hover:bg-gray-100 rounded-full transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-6">
                            {/* Tardiness Group */}
                            <div>
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                                    {language === 'vi' ? 'Đi Muộn' : 'Tardiness'}
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                                            {language === 'vi' ? 'Số lần trễ (Lần)' : 'Lates (Instances)'}
                                        </label>
                                        <input 
                                            type="number" min="0" step="1"
                                            value={formData.lates_count || ''}
                                            onChange={(e) => setFormData(p => ({ ...p, lates_count: e.target.value === '' ? 0 : Number(e.target.value) }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm font-semibold outline-none bg-gray-50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                                            {language === 'vi' ? 'Số phút trễ (Tổng số)' : 'Lates (Total Mins)'}
                                        </label>
                                        <input 
                                            type="number" min="0" step="1"
                                            value={formData.lates_minutes || ''}
                                            onChange={(e) => setFormData(p => ({ ...p, lates_minutes: e.target.value === '' ? 0 : Number(e.target.value) }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm font-semibold outline-none bg-gray-50"
                                        />
                                    </div>
                                </div>
                            </div>

                            <hr className="border-gray-100" />

                            {/* Leaves Group */}
                            <div>
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                                    {language === 'vi' ? 'Nghỉ Phép & Vắng Mặt' : 'Leaves & Absences'}
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                                            {language === 'vi' ? 'Nghỉ phép năm (Ngày)' : 'Annual Leaves (Days)'}
                                        </label>
                                        <input 
                                            type="number" min="0" step="0.5"
                                            value={formData.annual_leaves || ''}
                                            onChange={(e) => setFormData(p => ({ ...p, annual_leaves: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm font-semibold outline-none bg-gray-50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                                            {language === 'vi' ? 'Nghỉ bệnh (Ngày)' : 'Sick Leaves (Days)'}
                                        </label>
                                        <input 
                                            type="number" min="0" step="0.5"
                                            value={formData.sick_leaves || ''}
                                            onChange={(e) => setFormData(p => ({ ...p, sick_leaves: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm font-semibold outline-none bg-gray-50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                                            {language === 'vi' ? 'Nghỉ không lương (Ngày)' : 'Unpaid Leaves (Days)'}
                                        </label>
                                        <input 
                                            type="number" min="0" step="0.5"
                                            value={formData.unpaid_leaves || ''}
                                            onChange={(e) => setFormData(p => ({ ...p, unpaid_leaves: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm font-semibold outline-none bg-gray-50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                                            {language === 'vi' ? 'Nghỉ khác (Ngày)' : 'Other Leaves (Days)'}
                                        </label>
                                        <input 
                                            type="number" min="0" step="0.5"
                                            value={formData.other_leaves || ''}
                                            onChange={(e) => setFormData(p => ({ ...p, other_leaves: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm font-semibold outline-none bg-gray-50"
                                        />
                                    </div>
                                </div>
                            </div>

                            <hr className="border-gray-100" />

                            {/* Notes Group */}
                            <div>
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                                    {language === 'vi' ? 'Ghi chú' : 'Notes'}
                                </h4>
                                <textarea 
                                    rows={2}
                                    value={formData.notes}
                                    onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 resize-none text-sm font-medium outline-none bg-gray-50"
                                    placeholder={language === 'vi' ? "Thêm ghi chú cụ thể về chuyên cần tháng này..." : "Add any specific comments about this month's attendance..."}
                                />
                            </div>
                        </div>

                        {/* Actions - Allineati a rounded-lg */}
                        <div className="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-4">
                            <button
                                onClick={closeModal}
                                className="px-4 py-2 text-gray-700 font-semibold hover:bg-gray-100 rounded-lg transition text-sm"
                            >
                                {language === 'vi' ? 'Hủy' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleSave}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition shadow-sm shadow-blue-500/20 text-sm"
                            >
                                <Save className="w-4 h-4" /> {language === 'vi' ? 'Lưu' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
