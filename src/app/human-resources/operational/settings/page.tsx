'use client'

import { useState, useEffect, Fragment } from 'react'
import { ShiftType, getShiftTypes, saveShiftTypes, DEFAULT_SHIFT_TYPES, getOvertimeSettings, saveOvertimeSettings, AutoScheduleTimeSlot, getAutoScheduleTimeSlots, saveAutoScheduleTimeSlots } from '@/lib/hr-operational-data'
import { getCurrentUserPermissions } from '@/lib/user-branches'
import { supabase } from '@/lib/supabase_shim'
import { Plus, Pencil, Trash2, X, RotateCcw, GitBranch, Globe, Briefcase, Clock, Target, Wand2 } from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'

const PRESET_COLORS = [
    '#3B82F6', '#F59E0B', '#8B5CF6', '#10B981', '#06B6D4',
    '#6B7280', '#EAB308', '#EF4444', '#EC4899', '#F97316',
    '#14B8A6', '#6366F1', '#84CC16', '#A855F7', '#0EA5E9',
]

const emptyShift = (): Omit<ShiftType, 'id'> => ({
    name: '', code: '', startTime: '', endTime: '',
    color: '#3B82F6', type: 'work', hours: 0,
    allowParallel: true, globalAcrossBranches: false,
})

export default function HROperationalSettingsPage() {
    const { language } = useSettings()
    const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([])
    const [editing, setEditing] = useState<ShiftType | null>(null)
    const [isNew, setIsNew] = useState(false)
    const [activeTab, setActiveTab] = useState<'shifts' | 'overtime' | 'auto-schedule'>('shifts')
    const [overtimeSettings, setOvertimeSettings] = useState({ overtime_multiplier_salary: 1.5, public_holiday_multiplier_salary: 2.0, overtime_multiplier_leave: 1.0, public_holiday_multiplier_leave: 1.0 })
    
    // Auto-Schedule Targets State
    const [autoScheduleTimeSlots, setAutoScheduleTimeSlots] = useState<AutoScheduleTimeSlot[]>([])
    const [providerBranches, setProviderBranches] = useState<{id: string, name: string}[]>([])
    const [selectedBranchId, setSelectedBranchId] = useState<string>('')
    const [departments, setDepartments] = useState<string[]>([])

    // Permissions states
    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
    const [currentUserBranches, setCurrentUserBranches] = useState<string[] | null>(null)

    useEffect(() => { 
        setShiftTypes(getShiftTypes()) 
        setOvertimeSettings(getOvertimeSettings())
        setAutoScheduleTimeSlots(getAutoScheduleTimeSlots())

        const fetchBranchesAndDepts = async () => {
            const perms = await getCurrentUserPermissions()
            const userRole = perms.role
            const userBranches = perms.branches
            setCurrentUserRole(userRole)
            setCurrentUserBranches(userBranches)

            const { data: branchData } = await supabase.from('provider_branches').select('id, name').order('name')
            if (branchData) {
                let filteredBranches = branchData
                if (userRole && !['owner', 'admin'].includes(userRole) && userBranches) {
                    filteredBranches = branchData.filter(b => userBranches.includes(b.id))
                }
                setProviderBranches(filteredBranches)
                if (filteredBranches.length > 0) setSelectedBranchId(filteredBranches[0].id)
            }
            
            const { data: deptData } = await supabase.from('hr_departments').select('name').order('name')
            if (deptData) {
                setDepartments(deptData.map(d => d.name))
            }
        }
        
        fetchBranchesAndDepts()
    }, [])

    const openNew = () => {
        const newShift: ShiftType = { id: `st-${Date.now()}`, ...emptyShift() }
        setEditing(newShift)
        setIsNew(true)
    }

    const openEdit = (st: ShiftType) => {
        setEditing({ ...st })
        setIsNew(false)
    }

    const save = () => {
        if (!editing) return
        if (!editing.name || !editing.code) return alert(language === 'vi' ? 'Tên và Mã là bắt buộc.' : 'Name and Code are required.')

        let updated: ShiftType[]
        if (isNew) {
            updated = [...shiftTypes, editing]
        } else {
            updated = shiftTypes.map(s => s.id === editing.id ? editing : s)
        }
        setShiftTypes(updated)
        saveShiftTypes(updated)
        setEditing(null)
    }

    const remove = (id: string) => {
        if (!confirm(language === 'vi' ? 'Xóa loại ca làm việc này?' : 'Delete this shift type?')) return
        const updated = shiftTypes.filter(s => s.id !== id)
        setShiftTypes(updated)
        saveShiftTypes(updated)
    }

    const resetDefaults = () => {
        if (!confirm(language === 'vi' ? 'Đặt lại về các loại ca mặc định? Thao tác này sẽ ghi đè lên các tùy chỉnh của bạn.' : 'Reset to default shift types? This will overwrite your customizations.')) return
        setShiftTypes(DEFAULT_SHIFT_TYPES)
        saveShiftTypes(DEFAULT_SHIFT_TYPES)
    }

    const updateField = (field: keyof ShiftType, value: string | number | boolean) => {
        if (!editing) return
        const updated = { ...editing, [field]: value } as ShiftType
        // Auto-calculate hours for work shifts
        if (['startTime', 'endTime', 'startTime2', 'endTime2'].includes(field as string) && updated.type === 'work') {
            const calcDiff = (start?: string, end?: string) => {
                if (!start || !end) return 0
                const [sh, sm] = start.split(':').map(Number)
                const [eh, em] = end.split(':').map(Number)
                let diff = (eh * 60 + em) - (sh * 60 + sm)
                if (diff < 0) diff += 24 * 60 // overnight shift
                return diff
            }
            const diff1 = calcDiff(updated.startTime, updated.endTime)
            const diff2 = calcDiff(updated.startTime2, updated.endTime2)
            updated.hours = Math.round((diff1 + diff2) / 60 * 10) / 10
        }
        if (field === 'type' && value === 'leave') {
            updated.startTime = ''
            updated.endTime = ''
            updated.startTime2 = ''
            updated.endTime2 = ''
            updated.hours = 0
            updated.globalAcrossBranches = true
            updated.allowParallel = false
        }
        if (field === 'type' && value === 'work') {
            updated.globalAcrossBranches = false
            updated.allowParallel = true
        }
        setEditing(updated)
    }

    const removeSplitSlot = () => {
        if (!editing) return
        const updated = { ...editing }
        delete updated.startTime2
        delete updated.endTime2
        
        if (updated.type === 'work') {
            const calcDiff = (start?: string, end?: string) => {
                if (!start || !end) return 0
                const [sh, sm] = start.split(':').map(Number)
                const [eh, em] = end.split(':').map(Number)
                let diff = (eh * 60 + em) - (sh * 60 + sm)
                if (diff < 0) diff += 24 * 60
                return diff
            }
            updated.hours = Math.round(calcDiff(updated.startTime, updated.endTime) / 60 * 10) / 10
        }
        
        setEditing(updated)
    }

    const handleSaveOvertime = (newSettings: any) => {
        setOvertimeSettings(newSettings)
        saveOvertimeSettings(newSettings)
    }

    const updateAutoScheduleTarget = (slotId: string, dept: string, dayOfWeek: number, minPoints: number) => {
        const newSlots = [...autoScheduleTimeSlots]
        const idx = newSlots.findIndex(s => s.id === slotId)
        if (idx >= 0) {
            const currentTargets = newSlots[idx].targets || {}
            const deptTargets = currentTargets[dept] || {}
            newSlots[idx].targets = { 
                ...currentTargets, 
                [dept]: { ...deptTargets, [dayOfWeek]: minPoints } 
            }
            setAutoScheduleTimeSlots(newSlots)
            saveAutoScheduleTimeSlots(newSlots)
        }
    }

    const addTimeSlot = () => {
        if (!selectedBranchId) return
        const newSlot: AutoScheduleTimeSlot = {
            id: `ts-${Date.now()}`,
            branchId: selectedBranchId,
            name: language === 'vi' ? 'Khung giờ mới' : 'New Time Slot',
            startTime: '12:00',
            endTime: '15:00',
            targets: {}
        }
        const newSlots = [...autoScheduleTimeSlots, newSlot]
        setAutoScheduleTimeSlots(newSlots)
        saveAutoScheduleTimeSlots(newSlots)
    }

    const getTargetPoints = (slotId: string, dept: string, dayIndex: number): number => {
        const slot = autoScheduleTimeSlots.find(s => s.id === slotId)
        if (!slot || !slot.targets || !slot.targets[dept]) return 0;
        return slot.targets[dept][dayIndex] || 0;
    }

    const removeTimeSlot = (slotId: string) => {
        if (!confirm(language === 'vi' ? 'Xóa khung giờ này?' : 'Remove this time slot?')) return
        const newSlots = autoScheduleTimeSlots.filter(s => s.id !== slotId)
        setAutoScheduleTimeSlots(newSlots)
        saveAutoScheduleTimeSlots(newSlots)
    }

    const updateTimeSlotField = (slotId: string, field: keyof AutoScheduleTimeSlot, value: string) => {
        const newSlots = [...autoScheduleTimeSlots]
        const idx = newSlots.findIndex(s => s.id === slotId)
        if (idx >= 0) {
            newSlots[idx] = { ...newSlots[idx], [field]: value }
            setAutoScheduleTimeSlots(newSlots)
            saveAutoScheduleTimeSlots(newSlots)
        }
    }


    const DAYS = [
        { label: 'Mon', index: 0 }, { label: 'Tue', index: 1 }, { label: 'Wed', index: 2 },
        { label: 'Thu', index: 3 }, { label: 'Fri', index: 4 }, { label: 'Sat', index: 5 }, { label: 'Sun', index: 6 }
    ]

    return (
        <div className="min-h-screen bg-\[#0b1530\] text-gray-100 p-6 animate-in fade-in duration-300">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                            {language === 'vi' ? 'Cài đặt Vận hành' : 'Operational Settings'}
                        </h1>
                        <p className="text-sm text-slate-400 mt-1">
                            {language === 'vi' ? 'Cấu hình các loại ca làm việc, tham số lập lịch, và các hệ số tăng ca.' : 'Configure shift types, scheduling parameters, and overtime factors.'}
                        </p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="border-b border-white/10 mb-6">
                    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        <button onClick={() => setActiveTab('shifts')}
                            className={`
                                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-all cursor-pointer
                                ${activeTab === 'shifts'
                                    ? 'border-blue-500 text-blue-500'
                                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}
                            `}
                        >
                            {language === 'vi' ? 'Ca làm việc' : 'Shifts'}
                        </button>
                        <button onClick={() => setActiveTab('overtime')}
                            className={`
                                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-all cursor-pointer
                                ${activeTab === 'overtime'
                                    ? 'border-blue-500 text-blue-500'
                                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}
                            `}
                        >
                            {language === 'vi' ? 'Tăng ca' : 'Overtime'}
                        </button>
                        <button onClick={() => setActiveTab('auto-schedule')}
                            className={`
                                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-all cursor-pointer
                                ${activeTab === 'auto-schedule'
                                    ? 'border-blue-500 text-blue-500'
                                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}
                            `}
                        >
                            {language === 'vi' ? 'Mục tiêu Tự động Sắp ca' : 'Auto-Schedule Targets'}
                        </button>
                    </nav>
                </div>

                {activeTab === 'shifts' && (
                    <>
                        <div className="flex justify-end gap-2 mb-4">
                        <button
                            onClick={resetDefaults}
                            className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-white/10 text-slate-400 hover:bg-white/5 transition"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            {language === 'vi' ? 'Đặt lại Mặc định' : 'Reset Defaults'}
                        </button>
                        <button
                            onClick={openNew}
                            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition shadow"
                        >
                            <Plus className="w-4 h-4" />
                            {language === 'vi' ? 'Thêm Loại Ca' : 'Add Shift Type'}
                        </button>
                    </div>

                {/* Shift Types Table */}
                <div className="rounded-2xl bg-white shadow-md overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Màu sắc' : 'Color'}</th>
                                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Tên' : 'Name'}</th>
                                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Mã' : 'Code'}</th>
                                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Thời gian' : 'Time'}</th>
                                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Số giờ' : 'Hours'}</th>
                                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Loại' : 'Type'}</th>
                                <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500" title={language === 'vi' ? 'Cho phép ca song song ở chi nhánh khác' : 'Allow parallel shift in another branch'}>{language === 'vi' ? 'Liên Chi nhánh' : 'Cross-Branch'}</th>
                                <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Hành động' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shiftTypes.map((st, idx) => (
                                <tr key={st.id} className={`border-t border-gray-100 ${idx % 2 === 0 ? 'bg-gray-50/50' : ''} hover:bg-gray-50 transition`}>
                                    <td className="px-4 py-3">
                                        <div className="w-6 h-6 rounded-lg shadow-inner" style={{ backgroundColor: st.color }} />
                                    </td>
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{st.name}</td>
                                    <td className="px-4 py-3">
                                        <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-bold" style={{ backgroundColor: st.color + '20', color: st.color }}>
                                            {st.code}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">
                                        <div className="flex flex-col gap-0.5">
                                            <span>{st.startTime ? `${st.startTime} – ${st.endTime}` : '—'}</span>
                                            {st.startTime2 && st.endTime2 && (
                                                <span>
                                                    {st.startTime2} – {st.endTime2}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{st.hours > 0 ? `${st.hours}h` : '—'}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.type === 'work' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {st.type === 'work' ? (language === 'vi' ? 'Làm việc' : 'work') : (language === 'vi' ? 'Nghỉ phép' : 'leave')}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            {st.globalAcrossBranches && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700" title={language === 'vi' ? 'Xuất hiện ở tất cả chi nhánh' : 'Appears in all branches'}>
                                                    <Globe className="w-3 h-3" />{language === 'vi' ? 'Toàn cục' : 'Global'}
                                                </span>
                                            )}
                                            {st.allowParallel && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-100 text-sky-700" title={language === 'vi' ? 'Có thể làm cùng khung giờ ở chi nhánh khác' : 'Can work same slot in another branch'}>
                                                    <GitBranch className="w-3 h-3" />{language === 'vi' ? 'Song song' : 'Parallel'}
                                                </span>
                                            )}
                                            {!st.globalAcrossBranches && !st.allowParallel && (
                                                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-400">{language === 'vi' ? 'Độc quyền' : 'Exclusive'}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={() => openEdit(st)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => remove(st.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {shiftTypes.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                                        {language === 'vi' ? 'Chưa cấu hình loại ca làm việc nào. Hãy thêm mới hoặc đặt lại về mặc định.' : 'No shift types configured. Add one or reset to defaults.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                </>
                )}

                {activeTab === 'overtime' && (
                    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 text-gray-900 w-full max-w-4xl">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-blue-50 rounded-lg">
                                <Clock className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">{language === 'vi' ? 'Hệ số Tăng ca' : 'Overtime Multipliers'}</h2>
                                <p className="text-sm text-gray-500">{language === 'vi' ? 'Cấu hình hệ số đền bù tăng ca qua Lương hoặc Nghỉ phép năm.' : 'Configure multipliers for overtime compensation via Salary or Annual Leave.'}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Salary Card */}
                            <div className="p-5 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                                <label className="block text-base font-semibold text-gray-800 mb-1">{language === 'vi' ? 'Thanh toán qua Lương' : 'Paid via Salary'}</label>
                                <p className="text-xs text-gray-500 mb-5 h-8">
                                    {language === 'vi' ? 'Các hệ số được áp dụng khi số giờ tăng ca được chi trả qua bảng lương thông thường.' : 'Multipliers applied when overtime hours are paid through the normal payroll.'}
                                </p>
                                
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center justify-between">
                                            <span>{language === 'vi' ? 'Tăng ca thông thường' : 'Standard Overtime'}</span>
                                        </label>
                                        <div className="relative">
                                            <input 
                                                type="number" step="0.5" min="1"
                                                value={overtimeSettings.overtime_multiplier_salary}
                                                onChange={e => handleSaveOvertime({ ...overtimeSettings, overtime_multiplier_salary: Number(e.target.value) })}
                                                className="w-full pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 font-medium transition-shadow hover:border-gray-300 outline-none"
                                            />
                                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400 text-sm font-medium">x</div>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center justify-between">
                                            <span>{language === 'vi' ? 'Tăng ca ngày Lễ' : 'Public Holiday Overtime'}</span>
                                        </label>
                                        <div className="relative">
                                            <input 
                                                type="number" step="0.5" min="1"
                                                value={overtimeSettings.public_holiday_multiplier_salary}
                                                onChange={e => handleSaveOvertime({ ...overtimeSettings, public_holiday_multiplier_salary: Number(e.target.value) })}
                                                className="w-full pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 font-medium transition-shadow hover:border-gray-300 outline-none"
                                            />
                                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400 text-sm font-medium">x</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Annual Leave Card */}
                            <div className="p-5 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                                <label className="block text-base font-semibold text-gray-800 mb-1">{language === 'vi' ? 'Đền bù qua Nghỉ phép năm' : 'Compensated via Annual Leave'}</label>
                                <p className="text-xs text-gray-500 mb-5 h-8">
                                    {language === 'vi' ? 'Các hệ số được áp dụng khi thời gian tăng ca được quy đổi thành ngày nghỉ (ROL / Ngày lễ).' : 'Multipliers applied when overtime is converted into time off (ROL / Holidays).'}
                                </p>
                                
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center justify-between">
                                            <span>{language === 'vi' ? 'Tăng ca thông thường' : 'Standard Overtime'}</span>
                                        </label>
                                        <div className="relative">
                                            <input 
                                                type="number" step="0.5" min="1"
                                                value={overtimeSettings.overtime_multiplier_leave}
                                                onChange={e => handleSaveOvertime({ ...overtimeSettings, overtime_multiplier_leave: Number(e.target.value) })}
                                                className="w-full pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 font-medium transition-shadow hover:border-gray-300 outline-none"
                                            />
                                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400 text-sm font-medium">x</div>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center justify-between">
                                            <span>{language === 'vi' ? 'Tăng ca ngày Lễ' : 'Public Holiday Overtime'}</span>
                                        </label>
                                        <div className="relative">
                                            <input 
                                                type="number" step="0.5" min="1"
                                                value={overtimeSettings.public_holiday_multiplier_leave}
                                                onChange={e => handleSaveOvertime({ ...overtimeSettings, public_holiday_multiplier_leave: Number(e.target.value) })}
                                                className="w-full pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 font-medium transition-shadow hover:border-gray-300 outline-none"
                                            />
                                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400 text-sm font-medium">x</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'auto-schedule' && (
                    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 text-gray-900 w-full max-w-4xl">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 rounded-lg">
                                    <Target className="w-5 h-5 text-indigo-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">{language === 'vi' ? 'Mục tiêu Tự động Sắp ca' : 'Auto-Schedule Targets'}</h2>
                                    <p className="text-sm text-gray-500">{language === 'vi' ? 'Thiết lập số điểm kỹ năng tối thiểu yêu cầu cho mỗi ca để tự động lập lịch.' : 'Set minimum required skill points per shift for automatic scheduling.'}</p>
                                </div>
                            </div>

                            {/* Branch Selector */}
                            <div className="min-w-[200px]">
                                <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'vi' ? 'Chọn chi nhánh' : 'Select Branch'}</label>
                                <select 
                                    className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block px-3 py-2 outline-none"
                                    value={selectedBranchId}
                                    onChange={(e) => setSelectedBranchId(e.target.value)}
                                >
                                    {providerBranches.map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                    {providerBranches.length === 0 && <option value="">{language === 'vi' ? 'Đang tải chi nhánh...' : 'Loading branches...'}</option>}
                                </select>
                            </div>
                        </div>

                        {selectedBranchId ? (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-sm font-semibold text-gray-700">{language === 'vi' ? 'Khung giờ cho mục tiêu' : 'Time Slots for Targets'}</h3>
                                    <button 
                                        onClick={addTimeSlot}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg transition-colors"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        {language === 'vi' ? 'Thêm khung giờ' : 'Add Time Slot'}
                                    </button>
                                </div>
                                <div className="overflow-x-auto rounded-xl border border-gray-200">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-600 font-medium">
                                            <tr>
                                                <th className="px-4 py-3 border-b border-gray-200 min-w-[250px]">{language === 'vi' ? 'Cấu hình Khung giờ' : 'Time Slot Configuration'}</th>
                                                {DAYS.map(d => (
                                                    <th key={d.index} className="px-3 py-3 border-b border-gray-200 text-center w-[90px]">
                                                        {language === 'vi' ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][d.index] : d.label}
                                                    </th>
                                                ))}
                                                <th className="px-3 py-3 border-b border-gray-200 w-[50px]"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {autoScheduleTimeSlots.filter(s => s.branchId === selectedBranchId).map(slot => (
                                                <Fragment key={slot.id}>
                                                    {/* Header row for the slot */}
                                                    <tr className="bg-indigo-50/50 border-t border-indigo-100">
                                                        <td colSpan={9} className="px-4 py-2">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-3">
                                                                    <input 
                                                                        type="text" 
                                                                        value={slot.name}
                                                                        onChange={(e) => updateTimeSlotField(slot.id, 'name', e.target.value)}
                                                                        placeholder={language === 'vi' ? 'Tên khung giờ (ví dụ: Ăn trưa)' : 'Slot Name (e.g. Lunch)'}
                                                                        className="text-sm font-bold text-indigo-900 bg-transparent border-b border-dashed border-indigo-300 focus:border-indigo-500 outline-none pb-0.5 min-w-[150px]"
                                                                    />
                                                                    <div className="flex items-center gap-2 text-xs text-indigo-700">
                                                                        <Clock className="w-3.5 h-3.5" />
                                                                        <input 
                                                                            type="time" 
                                                                            value={slot.startTime}
                                                                            onChange={(e) => updateTimeSlotField(slot.id, 'startTime', e.target.value)}
                                                                            className="bg-white/60 border border-indigo-200 rounded px-1.5 py-1 outline-none focus:border-indigo-500"
                                                                        />
                                                                        <span>{language === 'vi' ? 'đến' : 'to'}</span>
                                                                        <input 
                                                                            type="time" 
                                                                            value={slot.endTime}
                                                                            onChange={(e) => updateTimeSlotField(slot.id, 'endTime', e.target.value)}
                                                                            className="bg-white/60 border border-indigo-200 rounded px-1.5 py-1 outline-none focus:border-indigo-500"
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <button 
                                                                    onClick={() => removeTimeSlot(slot.id)}
                                                                    className="p-1.5 text-indigo-400 hover:text-red-500 hover:bg-white rounded-md transition-colors"
                                                                    title={language === 'vi' ? 'Xóa Khung giờ' : 'Delete Time Slot'}
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {/* Department rows */}
                                                    {departments.map(dept => (
                                                        <tr key={`${slot.id}-${dept}`} className="hover:bg-gray-50/50 border-b border-gray-50 last:border-0">
                                                            <td className="px-4 py-2 pl-8 text-xs font-medium text-gray-600">
                                                                {dept}
                                                            </td>
                                                            {DAYS.map(d => (
                                                                <td key={d.index} className="px-3 py-1.5 text-center">
                                                                    <input 
                                                                        type="number"
                                                                        min="0"
                                                                        step="1"
                                                                        value={getTargetPoints(slot.id, dept, d.index)}
                                                                        onChange={(e) => updateAutoScheduleTarget(slot.id, dept, d.index, parseInt(e.target.value) || 0)}
                                                                        className="w-full text-center bg-white border border-gray-200 rounded-md py-1 focus:ring-2 focus:ring-indigo-500 outline-none hover:border-indigo-300 transition-colors text-xs"
                                                                    />
                                                                </td>
                                                            ))}
                                                            <td className="px-3 py-1.5"></td>
                                                        </tr>
                                                    ))}
                                                </Fragment>
                                            ))}
                                            {autoScheduleTimeSlots.filter(s => s.branchId === selectedBranchId).length === 0 && (
                                                <tr>
                                                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                                                        {language === 'vi' ? 'Chưa định nghĩa khung giờ nào cho chi nhánh này. Bấm "Thêm khung giờ" để bắt đầu.' : 'No time slots defined for this branch. Click "Add Time Slot" to begin.'}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500">
                                {language === 'vi' ? 'Vui lòng chọn một chi nhánh để cấu hình mục tiêu tự động sắp ca.' : 'Please select a branch to configure auto-schedule targets.'}
                            </div>
                        )}
                    </div>
                )}

                {/* Edit/New Modal */}
                {editing && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditing(null)}>
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-gray-900">
                                    {isNew ? (language === 'vi' ? 'Loại ca làm việc mới' : 'New Shift Type') : (language === 'vi' ? 'Sửa Loại ca làm việc' : 'Edit Shift Type')}
                                </h3>
                                <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                {/* Row 1: Type, Name, Code */}
                                <div className="grid grid-cols-[auto_1fr_80px] gap-3 items-end">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'vi' ? 'Loại' : 'Type'}</label>
                                        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                                            {(['work', 'leave'] as const).map(t => (
                                                <button
                                                    key={t}
                                                    onClick={() => updateField('type', t)}
                                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition
                                                        ${editing.type === t
                                                            ? 'bg-white text-gray-900 shadow-sm'
                                                            : 'text-gray-500 hover:text-gray-700'}`}
                                                >
                                                    {t === 'work' ? (language === 'vi' ? '💼 Làm việc' : '💼 Work') : (language === 'vi' ? '🌿 Nghỉ phép' : '🌿 Leave')}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'vi' ? 'Tên *' : 'Name *'}</label>
                                        <input
                                            value={editing.name}
                                            onChange={e => updateField('name', e.target.value)}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                                            placeholder={language === 'vi' ? 'ví dụ: Buổi sáng' : 'e.g. Morning'}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'vi' ? 'Mã *' : 'Code *'}</label>
                                        <input
                                            value={editing.code}
                                            onChange={e => updateField('code', e.target.value.toUpperCase())}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow text-center font-semibold"
                                            placeholder={language === 'vi' ? 'ví dụ: S' : 'e.g. M'}
                                            maxLength={4}
                                        />
                                    </div>
                                </div>

                                {/* Time (only for work) */}
                                {editing.type === 'work' && (
                                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                                        <div className="grid grid-cols-[1fr_1fr_80px] gap-3 items-end">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'vi' ? 'Giờ bắt đầu' : 'Start Time'}</label>
                                                <input
                                                    type="time"
                                                    value={editing.startTime}
                                                    onChange={e => updateField('startTime', e.target.value)}
                                                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'vi' ? 'Giờ kết thúc' : 'End Time'}</label>
                                                <input
                                                    type="time"
                                                    value={editing.endTime}
                                                    onChange={e => updateField('endTime', e.target.value)}
                                                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'vi' ? 'Tổng số giờ' : 'Total'}</label>
                                                <input
                                                    type="number"
                                                    value={editing.hours}
                                                    onChange={e => updateField('hours', Number(e.target.value))}
                                                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none text-center"
                                                    step="0.5"
                                                    min="0"
                                                />
                                            </div>
                                        </div>

                                        {editing.startTime2 !== undefined || editing.endTime2 !== undefined ? (
                                            <div className="grid grid-cols-[1fr_1fr_80px] gap-3 items-end relative pt-3 border-t border-gray-200 mt-2">
                                                <button 
                                                    onClick={removeSplitSlot}
                                                    className="absolute -right-2 -top-3 bg-white text-gray-400 hover:text-red-500 p-1 rounded-full border border-gray-200 shadow-sm transition-colors"
                                                    title={language === 'vi' ? 'Xóa ca gãy' : 'Remove split shift'}
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'vi' ? 'Bắt đầu ca gãy' : 'Split Start'}</label>
                                                    <input
                                                        type="time"
                                                        value={editing.startTime2 || ''}
                                                        onChange={e => updateField('startTime2', e.target.value)}
                                                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'vi' ? 'Kết thúc ca gãy' : 'Split End'}</label>
                                                    <input
                                                        type="time"
                                                        value={editing.endTime2 || ''}
                                                        onChange={e => updateField('endTime2', e.target.value)}
                                                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                                    />
                                                </div>
                                                <div /> {/* Empty column for alignment */}
                                            </div>
                                        ) : (
                                            <div className="pt-1">
                                                <button
                                                    onClick={() => {
                                                        updateField('startTime2', '')
                                                        updateField('endTime2', '')
                                                    }}
                                                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium py-1 px-2 -ml-2 rounded-md hover:bg-blue-50 transition-colors"
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    {language === 'vi' ? 'Thêm Khung Giờ' : 'Add Time Slot'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Cross-branch behavior */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-2">{language === 'vi' ? 'Hành vi Liên chi nhánh' : 'Cross-Branch Behavior'}</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {/* Allow Parallel toggle */}
                                        <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition">
                                            <div className="pt-0.5">
                                                <div
                                                    onClick={() => updateField('allowParallel', !editing.allowParallel)}
                                                    className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${
                                                        editing.allowParallel ? 'bg-sky-500' : 'bg-gray-300'
                                                    }`}
                                                >
                                                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                                                        editing.allowParallel ? 'translate-x-4.5' : 'translate-x-0.5'
                                                    }`} />
                                                </div>
                                            </div>
                                            <div className="flex-1" onClick={() => updateField('allowParallel', !editing.allowParallel)}>
                                                <div className="flex items-center gap-1.5">
                                                    <GitBranch className="w-3.5 h-3.5 text-sky-500" />
                                                    <span className="text-[13px] font-semibold text-gray-800">{language === 'vi' ? 'Cho phép Song song' : 'Allow Parallel'}</span>
                                                </div>
                                                <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{language === 'vi' ? 'Có thể được phân vào cùng khung giờ ở chi nhánh khác' : 'Can be assigned same slot in another branch'}</p>
                                            </div>
                                        </label>

                                        {/* Global across branches toggle */}
                                        <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition">
                                            <div className="pt-0.5">
                                                <div
                                                    onClick={() => updateField('globalAcrossBranches', !editing.globalAcrossBranches)}
                                                    className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${
                                                        editing.globalAcrossBranches ? 'bg-purple-500' : 'bg-gray-300'
                                                    }`}
                                                >
                                                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                                                        editing.globalAcrossBranches ? 'translate-x-4.5' : 'translate-x-0.5'
                                                    }`} />
                                                </div>
                                            </div>
                                            <div className="flex-1" onClick={() => updateField('globalAcrossBranches', !editing.globalAcrossBranches)}>
                                                <div className="flex items-center gap-1.5">
                                                    <Globe className="w-3.5 h-3.5 text-purple-500" />
                                                    <span className="text-[13px] font-semibold text-gray-800">{language === 'vi' ? 'Ca Toàn cục' : 'Global Shift'}</span>
                                                </div>
                                                <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{language === 'vi' ? 'Áp dụng cho tất cả chi nhánh (ví dụ: Ngày nghỉ)' : 'Applies to all branches (e.g. Day Off)'}</p>
                                            </div>
                                        </label>

                                        {/* Auto Schedulable toggle */}
                                        {editing.type === 'leave' && (
                                            <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition col-span-1 sm:col-span-2 md:col-span-1">
                                                <div className="pt-0.5">
                                                    <div
                                                        onClick={() => updateField('isAutoSchedulable', !editing.isAutoSchedulable)}
                                                        className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${
                                                            editing.isAutoSchedulable ? 'bg-emerald-500' : 'bg-gray-300'
                                                        }`}
                                                    >
                                                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                                                            editing.isAutoSchedulable ? 'translate-x-4.5' : 'translate-x-0.5'
                                                        }`} />
                                                    </div>
                                                </div>
                                                <div className="flex-1" onClick={() => updateField('isAutoSchedulable', !editing.isAutoSchedulable)}>
                                                    <div className="flex items-center gap-1.5">
                                                        <Wand2 className="w-3.5 h-3.5 text-emerald-500" />
                                                        <span className="text-[13px] font-semibold text-gray-800">{language === 'vi' ? 'Tự động Sắp xếp' : 'Auto Schedulable'}</span>
                                                    </div>
                                                    <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{language === 'vi' ? 'Có thể được sắp xếp tự động (ví dụ: Ngày nghỉ)' : 'Can be assigned automatically (e.g. Day Off)'}</p>
                                                </div>
                                            </label>
                                        )}
                                    </div>
                                </div>

                                {/* Color picker & Preview Row */}
                                <div className="grid grid-cols-[1fr_auto] gap-4 items-center pt-3 border-t border-gray-100">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-2">{language === 'vi' ? 'Màu sắc' : 'Color'}</label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {PRESET_COLORS.map(c => (
                                                <button
                                                    key={c}
                                                    onClick={() => updateField('color', c)}
                                                    className={`w-6 h-6 rounded-md transition-transform ${editing.color === c ? 'ring-2 ring-gray-900 ring-offset-1 scale-110' : 'hover:scale-105'}`}
                                                    style={{ backgroundColor: c }}
                                                />
                                            ))}
                                            <input
                                                type="color"
                                                value={editing.color}
                                                onChange={e => updateField('color', e.target.value)}
                                                className="w-6 h-6 rounded-md cursor-pointer border-0 p-0"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-2 text-center">{language === 'vi' ? 'Xem trước' : 'Preview'}</label>
                                        <div
                                            className="inline-flex flex-col items-center rounded-lg px-3 py-1.5 shadow-sm"
                                            style={{ backgroundColor: editing.color + '15', border: `1px solid ${editing.color}30` }}
                                        >
                                            <span className="text-[13px] font-bold" style={{ color: editing.color }}>
                                                {editing.code || '??'}
                                            </span>
                                            {editing.type === 'work' && editing.startTime && (
                                                <span className="text-[9px] text-gray-500 mt-0.5 leading-none">{editing.startTime}–{editing.endTime}</span>
                                            )}
                                            {editing.type === 'work' && editing.startTime2 && editing.endTime2 && (
                                                <span className="text-[9px] text-gray-500 mt-0.5 leading-none">{editing.startTime2}–{editing.endTime2}</span>
                                            )}
                                            {editing.type === 'leave' && (
                                                <span className="text-[9px] mt-0.5 font-medium" style={{ color: editing.color }}>{editing.name || (language === 'vi' ? 'Nghỉ phép' : 'Leave')}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-2 mt-6">
                                <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">
                                    {language === 'vi' ? 'Hủy' : 'Cancel'}
                                </button>
                                <button onClick={save} className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition shadow-md">
                                    {isNew ? (language === 'vi' ? 'Tạo Ca' : 'Create Shift') : (language === 'vi' ? 'Lưu Thay đổi' : 'Save Changes')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
