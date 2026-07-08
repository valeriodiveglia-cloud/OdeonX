'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffMember, HRStaffOvertime, HRStaffSalaryHistory } from '@/types/human-resources'
import { Users, Watch, X, Loader2, Save, Trash2, CalendarDays, Plus, ChevronDown } from 'lucide-react'
import CircularLoader from '@/components/CircularLoader'
import { getOvertimeSettings, OvertimeSettings } from '@/lib/hr-operational-data'
import { useSettings } from '@/contexts/SettingsContext'
import MonthPicker from '@/components/MonthPicker'
import { getCurrentUserPermissions } from '@/lib/user-branches'

function toMonthInputValue(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function fromMonthInputValue(val: string) { const [y, m] = val.split('-').map(Number); return new Date(y, m - 1, 1) }

export default function OvertimeMonthlyPage() {
    const { currency, language } = useSettings()
    const [currentDate, setCurrentDate] = useState(() => new Date())
    const [loading, setLoading] = useState(true)
    const [selectedCity, setSelectedCity] = useState<'Ho Chi Minh' | 'Da Lat'>('Ho Chi Minh')
    const [cityDropdownOpen, setCityDropdownOpen] = useState(false)
    const [settings, setSettings] = useState<OvertimeSettings>({ 
        overtime_multiplier_salary: 1.5,
        overtime_multiplier_leave: 1.0,
        public_holiday_multiplier_salary: 2.0,
        public_holiday_multiplier_leave: 1.5,
        public_holiday_work_multiplier: 4.0,
        public_holiday_off_multiplier: 1.0
    })

    // Permissions State
    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
    const [currentUserBranches, setCurrentUserBranches] = useState<string[] | null>(null)

    // Data
    const [staffList, setStaffList] = useState<HRStaffMember[]>([])
    const [overtimeRecords, setOvertimeRecords] = useState<Record<string, HRStaffOvertime[]>>({})
    const [salaryHistory, setSalaryHistory] = useState<HRStaffSalaryHistory[]>([])
    const [showSelectStaff, setShowSelectStaff] = useState(false)
    const [searchStaff, setSearchStaff] = useState('')

    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)

    const dateStartStr = `${monthStart.getFullYear()}-${(monthStart.getMonth() + 1).toString().padStart(2, '0')}-01`
    const dateEndStr = `${monthEnd.getFullYear()}-${(monthEnd.getMonth() + 1).toString().padStart(2, '0')}-${monthEnd.getDate().toString().padStart(2, '0')}`

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

            // Fetch active staff with salary info and city (excluding outsourced) with branch info
            const { data: staffRes, error: staffErr } = await supabase
                .from('hr_staff')
                .select('id, full_name, position, department, salary_amount, salary_type, employment_type, city, hr_staff_branches(branch_id)')
                .eq('status', 'active')
                .neq('employment_type', 'outsourced')
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

            let filteredStaff = (staffRes as any[] || [])
            if (userRole && !['owner', 'admin'].includes(userRole) && userBranches) {
                filteredStaff = filteredStaff.filter(s =>
                    (s.hr_staff_branches || []).some((sb: any) => userBranches.includes(sb.branch_id))
                )
            }
            setStaffList(filteredStaff as HRStaffMember[])
            
            const allowedStaffIds = new Set(filteredStaff.map(s => s.id))

            // Fetch salary history to determine past salaries
            const { data: historyRes } = await supabase
                .from('hr_staff_salary_history')
                .select('*')
                .order('effective_date', { ascending: false })
            if (historyRes) {
                let filteredHistory = historyRes as HRStaffSalaryHistory[]
                if (userRole && !['owner', 'admin'].includes(userRole) && userBranches) {
                    filteredHistory = filteredHistory.filter(h => allowedStaffIds.has(h.staff_id))
                }
                setSalaryHistory(filteredHistory)
            }

            const grouped: Record<string, HRStaffOvertime[]> = {}
            if (otRes) {
                otRes.forEach((r: any) => {
                    if (!userRole || ['owner', 'admin'].includes(userRole) || !userBranches || allowedStaffIds.has(r.staff_id)) {
                        if (!grouped[r.staff_id]) grouped[r.staff_id] = []
                        grouped[r.staff_id].push(r)
                    }
                })
            }
            setOvertimeRecords(grouped)
        } catch (err) {
            console.error('Error fetching overtime data:', err)
        }
        setLoading(false)
    }, [dateStartStr, dateEndStr, currentUserRole, currentUserBranches])

    useEffect(() => { 
        fetchAll()
        setSettings(getOvertimeSettings())
    }, [fetchAll])

    // Filter staff by city
    const filteredStaff = useMemo(() => {
        return staffList.filter(s => {
            if (selectedCity === 'Ho Chi Minh') {
                return s.city === 'Ho Chi Minh' || !s.city
            }
            return s.city === selectedCity
        })
    }, [staffList, selectedCity])

    // Filter staff who have overtime records for this month and belong to the selected city
    const staffWithOvertime = useMemo(() => {
        return filteredStaff.filter(s => overtimeRecords[s.id] && overtimeRecords[s.id].length > 0)
    }, [filteredStaff, overtimeRecords])

    const getHourlyRate = (staff: HRStaffMember, date: string) => {
        let applicableSalary = staff.salary_amount;
        
        // Find if there were any salary changes AFTER this date
        const futureChanges = salaryHistory.filter(h => h.staff_id === staff.id && new Date(h.effective_date) > new Date(date));
        
        if (futureChanges.length > 0) {
            const sortedFuture = [...futureChanges].sort((a, b) => new Date(a.effective_date).getTime() - new Date(b.effective_date).getTime());
            applicableSalary = sortedFuture[0].previous_amount;
        }

        if (!applicableSalary) return 0;
        if (staff.salary_type === 'hourly') return applicableSalary;
        
        const recordDate = new Date(date);
        const daysInMonth = new Date(recordDate.getFullYear(), recordDate.getMonth() + 1, 0).getDate();
        const workingDays = Math.max(1, daysInMonth - 4); 
        return (applicableSalary / workingDays) / 8;
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
            return eqHours / 8; 
        } else {
            const hourlyRate = getHourlyRate(staff, r.date);
            return eqHours * hourlyRate; 
        }
    }

    // Modal State
    const [modalOpen, setModalOpen] = useState(false)
    const [selectedStaff, setSelectedStaff] = useState<HRStaffMember | null>(null)
    const [saving, setSaving] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const [formData, setFormData] = useState({
        date: '', 
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
            const errMsg = language === 'vi' 
                ? 'Vui lòng điền đầy đủ các trường (số giờ phải lớn hơn 0).'
                : 'Please fill out all fields correctly (hours must be > 0).'
            alert(errMsg)
            return
        }
        
        const inputDate = new Date(formData.date)
        if (inputDate.getFullYear() !== currentDate.getFullYear() || inputDate.getMonth() !== currentDate.getMonth()) {
            const errMsg = language === 'vi'
                ? `Ngày phải thuộc tháng đã chọn: ${displayMonth}.`
                : `The date must belong to the selected month: ${displayMonth}.`
            alert(errMsg)
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
                
                setFormData({
                    date: '',
                    hours: 0,
                    reason: '',
                    compensation_type: 'salary',
                    is_public_holiday: false
                })
            }
        } catch (err: any) {
            console.error('Error saving new overtime:', err)
            const errMsg = language === 'vi'
                ? `Lỗi khi lưu tăng ca: ${err?.message || 'Đã xảy ra lỗi mạng.'}`
                : `Error saving overtime: ${err?.message || 'A network error occurred.'}`
            alert(errMsg)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (otId: string) => {
        if (!selectedStaff) return
        const confirmMsg = language === 'vi'
            ? 'Bạn có chắc chắn muốn xóa ghi nhận tăng ca này?'
            : 'Are you sure you want to delete this overtime record?'
        if (!confirm(confirmMsg)) return
        
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
            const errMsg = language === 'vi' ? 'Đã xảy ra lỗi mạng khi xóa.' : 'A network error occurred while deleting.'
            alert(errMsg)
        } finally {
            setDeletingId(null)
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
                            {language === 'vi' ? 'Theo Dõi Tăng Ca' : 'Overtime Tracker'}
                        </h1>
                        <p className="text-sm text-slate-400 mt-1">
                            {language === 'vi'
                                ? 'Theo dõi chi tiết tăng ca, giờ làm thêm và các khoản bồi hoàn hàng tháng.'
                                : 'Track monthly overtime breakdown, hours, and compensations.'}
                        </p>
                    </div>
                    <button 
                        type="button" 
                        onClick={() => setShowSelectStaff(true)} 
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition shadow hover:shadow-lg shrink-0"
                    >
                        <Plus className="w-4 h-4" /> {language === 'vi' ? 'Thêm tăng ca' : 'Add Overtime'}
                    </button>
                </div>

                {/* 1. City Selection Dropdown (White Theme) - Compresso (w-36) e con angoli rounded-lg */}
                <div className="mb-8 px-2 flex items-center gap-3 relative z-20">
                    <span className="text-sm font-semibold text-slate-400">{language === 'vi' ? 'Thành phố:' : 'City:'}</span>
                    <div className="relative inline-block text-left">
                        <button
                            type="button"
                            onClick={() => setCityDropdownOpen(!cityDropdownOpen)}
                            className="inline-flex justify-between items-center gap-2 w-36 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900 hover:bg-gray-50 transition-all focus:ring-2 focus:ring-blue-500/50 outline-none"
                        >
                            <span className="truncate">{selectedCity}</span>
                            <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                        </button>

                        {cityDropdownOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setCityDropdownOpen(false)} />
                                <div className="absolute left-0 mt-2 w-36 rounded-lg bg-white border border-gray-200 shadow-xl z-20 focus:outline-none overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100">
                                    <div className="py-1">
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
                                    <th className="px-5 py-4 text-left font-semibold text-gray-500 uppercase tracking-widest text-xs">
                                        {language === 'vi' ? 'Nhân viên' : 'Staff Member'}
                                    </th>
                                    <th className="px-5 py-4 text-left font-semibold text-gray-500 uppercase tracking-widest text-xs">
                                        {language === 'vi' ? 'Chức vụ' : 'Position'}
                                    </th>
                                    <th className="px-5 py-4 text-center font-semibold text-gray-500 uppercase tracking-widest text-xs border-l border-gray-100">
                                        {language === 'vi' ? 'Tổng số lượt' : 'Total Entries'}
                                    </th>
                                    <th className="px-5 py-4 text-center font-semibold text-gray-500 uppercase tracking-widest text-xs">
                                        {language === 'vi' ? 'Tổng số giờ' : 'Total Hours'}
                                    </th>
                                    <th className="px-5 py-4 text-center font-semibold text-gray-500 uppercase tracking-widest text-xs border-l border-gray-100">
                                        {language === 'vi' ? 'Tổng chi phí' : 'Total Cost'}
                                    </th>
                                    <th className="px-5 py-4 text-center font-semibold text-gray-500 uppercase tracking-widest text-xs">
                                        {language === 'vi' ? 'Tổng phép bù' : 'Total AL'}
                                    </th>
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
                                            <td className="px-5 py-4 text-center border-l border-gray-100 text-gray-900 font-semibold">
                                                {records.length > 0 ? records.length : <span className="text-gray-300">-</span>}
                                            </td>
                                            <td className="px-5 py-4 text-center text-blue-700 font-bold bg-blue-50/20">
                                                {totalHours > 0 ? `${totalHours}h` : <span className="text-gray-300">-</span>}
                                            </td>
                                            <td className="px-5 py-4 text-center text-emerald-700 font-bold bg-emerald-50/30 border-l border-gray-100 whitespace-nowrap">
                                                {salaryEq > 0 ? new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(salaryEq) : <span className="text-gray-300">-</span>}
                                            </td>
                                            <td className="px-5 py-4 text-center text-purple-700 font-bold bg-purple-50/30 border-r border-gray-100 whitespace-nowrap">
                                                {leaveEq > 0 ? `${parseFloat(leaveEq.toFixed(3))} d` : <span className="text-gray-300">-</span>}
                                            </td>
                                        </tr>
                                    )
                                })}
                                {staffWithOvertime.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-16 text-center">
                                            <Watch className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                            <p className="text-gray-500 text-sm font-medium">
                                                {language === 'vi'
                                                    ? `Không có ghi nhận tăng ca nào tại ${selectedCity} trong tháng này.`
                                                    : `No overtime records for ${selectedCity} this month.`}
                                            </p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal - rounded-lg per stili */}
            {modalOpen && selectedStaff && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-all" onClick={closeModal} />
                    
                    <div className="relative w-full max-w-4xl bg-white rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 flex flex-col max-h-[85vh]">
                        {saving && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
                                <CircularLoader />
                            </div>
                        )}
                        
                        <div className="flex items-start justify-between p-6 border-b border-gray-200 bg-white shrink-0">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 tracking-tight">
                                    {language === 'vi' ? 'Chi Tiết Tăng Ca' : 'Overtime Details'}
                                </h3>
                                <p className="text-sm text-gray-500 mt-1 leading-relaxed">{selectedStaff.full_name} &bull; <span className="capitalize">{displayMonth}</span></p>
                            </div>
                            <button onClick={closeModal} className="p-2 text-gray-400 hover:text-gray-650 hover:bg-gray-100 rounded-full transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body: Two columns layout */}
                        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                            
                            {/* Insert New Block - left column */}
                            <div className="p-6 md:w-[320px] bg-slate-50 border-b md:border-b-0 md:border-r border-gray-100 shrink-0 overflow-y-auto">
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Plus className="w-4 h-4 text-blue-500" /> {language === 'vi' ? 'Thêm tăng ca' : 'Add Overtime'}
                                </h4>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">{language === 'vi' ? 'Ngày' : 'Date'}</label>
                                        <input 
                                            type="date" 
                                            min={dateStartStr}
                                            max={dateEndStr}
                                            value={formData.date}
                                            onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900 outline-none"
                                        />
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1">
                                            <label className="block text-xs font-semibold text-gray-500 mb-1.5">{language === 'vi' ? 'Số giờ' : 'Hours'}</label>
                                            <input 
                                                type="number" min="0" step="0.5"
                                                value={formData.hours || ''}
                                                onChange={(e) => setFormData(p => ({ ...p, hours: e.target.value === '' ? 0 : Number(e.target.value) }))}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900 outline-none"
                                            />
                                        </div>
                                        <div className="flex-1 flex flex-col justify-end h-[68px]">
                                            <label className="block text-xs font-semibold text-gray-500 mb-2">{language === 'vi' ? 'Loại ngày' : 'Rate Type'}</label>
                                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                                <input 
                                                    type="checkbox" 
                                                    className="sr-only peer" 
                                                    checked={formData.is_public_holiday} 
                                                    onChange={e => setFormData(p => ({ ...p, is_public_holiday: e.target.checked }))} 
                                                />
                                                <div className="relative w-11 h-6 rounded-full shrink-0 transition-colors bg-gray-200 peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:border after:transition-transform peer-checked:after:translate-x-5 shadow-sm" />
                                                <span className="text-xs font-semibold text-gray-700">{formData.is_public_holiday ? (language === 'vi' ? 'Lễ' : 'Holiday') : (language === 'vi' ? 'Thường' : 'Normal')}</span>
                                            </label>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">{language === 'vi' ? 'Lý do' : 'Reason'}</label>
                                        <input 
                                            type="text" 
                                            placeholder={language === 'vi' ? 'ví dụ: đóng cửa trễ' : 'e.g. late closing'}
                                            value={formData.reason}
                                            onChange={(e) => setFormData(p => ({ ...p, reason: e.target.value }))}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">{language === 'vi' ? 'Hình thức trả' : 'Paid via'}</label>
                                        <select 
                                            value={formData.compensation_type}
                                            onChange={(e) => setFormData(p => ({ ...p, compensation_type: e.target.value as any }))}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900 outline-none"
                                        >
                                            <option value="salary">{language === 'vi' ? 'Trả lương (tiền)' : 'Salary'}</option>
                                            <option value="annual_leave">{language === 'vi' ? 'Ngày phép bù' : 'Annual Leave'}</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="mt-6">
                                    <button
                                        onClick={handleSaveNew}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-all shadow"
                                    >
                                        <Save className="w-4 h-4" /> {language === 'vi' ? 'Thêm ghi nhận' : 'Add Record'}
                                    </button>
                                </div>
                            </div>

                            {/* History List - right column */}
                            <div className="flex-1 p-6 overflow-y-auto bg-white relative">
                                <div className="flex flex-col h-full">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                            <CalendarDays className="w-4 h-4 text-slate-450" /> {language === 'vi' ? 'Lịch Sử Tăng Ca' : 'Recorded Overtime'}
                                        </h4>
                                        <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold border border-blue-100 shadow-sm">
                                             {language === 'vi' ? 'Tổng cộng:' : 'Total:'} {(overtimeRecords[selectedStaff.id] || []).reduce((sum, r) => sum + r.hours, 0)}h
                                        </div>
                                    </div>
                                    
                                    {(!overtimeRecords[selectedStaff.id] || overtimeRecords[selectedStaff.id].length === 0) ? (
                                        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 mb-3 shadow-inner">
                                                <Watch className="w-8 h-8 text-gray-300" />
                                            </div>
                                            <h4 className="text-gray-900 font-semibold mb-1">{language === 'vi' ? 'Chưa Có Ghi Nhận Nào' : 'No Records Yet'}</h4>
                                            <p className="text-gray-500 text-sm">{language === 'vi' ? 'Thêm tăng ca mới bằng biểu mẫu bên cạnh.' : 'Add a new overtime entry using the form.'}</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {overtimeRecords[selectedStaff.id].map(record => (
                                                <div key={record.id} className="group flex items-center gap-4 bg-white p-3.5 rounded-lg border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all relative">
                                                    {deletingId === record.id && (
                                                        <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                                                            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                                                        </div>
                                                    )}
                                                    
                                                    <div className="w-12 h-12 bg-slate-50 border border-gray-100 rounded-lg flex flex-col items-center justify-center shrink-0 shadow-inner">
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{new Date(record.date).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-GB', { month: 'short' })}</span>
                                                        <span className="text-sm font-black text-slate-700 leading-none mt-0.5">{new Date(record.date).toLocaleDateString('en-GB', { day: 'numeric' })}</span>
                                                    </div>
                                                    
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm font-semibold text-gray-900 truncate">{record.reason}</p>
                                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border shrink-0 ${record.compensation_type === 'salary' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-purple-50 text-purple-600 border-purple-100'}`}>
                                                                {record.compensation_type === 'salary' ? (language === 'vi' ? 'Trả lương' : 'Salary') : (language === 'vi' ? 'Phép bù' : 'Annual Leave')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="text-right shrink-0 flex flex-col justify-center items-end min-w-[70px]">
                                                        <span className="text-base font-black text-gray-800 leading-none">{record.hours}h</span>
                                                        <span className={`text-[11px] font-bold mt-1 ${record.compensation_type === 'salary' ? 'text-emerald-600' : 'text-purple-600'}`}>
                                                            {record.compensation_type === 'salary'
                                                                ? new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(calculateCost(record, selectedStaff))
                                                                : `${parseFloat(calculateCost(record, selectedStaff).toFixed(3))} d`}
                                                        </span>
                                                    </div>
                                                    
                                                    <button 
                                                        onClick={() => handleDelete(record.id)}
                                                        className="ml-2 w-8 h-8 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-55 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                                                        title={language === 'vi' ? 'Xóa ghi nhận' : 'Delete record'}
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

            {/* Select Staff Modal - rounded-lg */}
            {showSelectStaff && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowSelectStaff(false)} />
                    <div className="relative w-full max-w-lg bg-white rounded-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 p-6 border border-gray-150">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold text-gray-900">{language === 'vi' ? 'Chọn Nhân Viên' : 'Select Staff'}</h3>
                            <button onClick={() => setShowSelectStaff(false)} className="p-2 text-gray-400 hover:text-gray-650 hover:bg-gray-100 rounded-full transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <input
                            type="text"
                            placeholder={language === 'vi' ? 'Tìm nhân viên theo tên...' : 'Search staff by name...'}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg mb-4 text-sm font-semibold focus:ring-2 focus:ring-blue-500 text-gray-900 outline-none bg-gray-50"
                            value={searchStaff}
                            onChange={(e) => setSearchStaff(e.target.value)}
                        />
                        <div className="max-h-[50vh] overflow-y-auto border border-gray-150 rounded-lg divide-y divide-gray-100">
                            {filteredStaff.filter(s => s.full_name.toLowerCase().includes(searchStaff.toLowerCase())).map(s => (
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
                                        <div className="text-xs text-gray-505">{s.position}</div>
                                    </div>
                                </button>
                            ))}
                            {filteredStaff.filter(s => s.full_name.toLowerCase().includes(searchStaff.toLowerCase())).length === 0 && (
                                <div className="p-4 text-center text-gray-550 text-sm">
                                    {language === 'vi' ? 'Không tìm thấy nhân viên nào.' : 'No staff member found.'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
