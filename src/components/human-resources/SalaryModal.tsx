import React, { useState, useEffect } from 'react'
import { TrendingUp, Briefcase, X, ArrowUpRight, TrendingDown } from 'lucide-react'
import { HRStaffSalaryHistory, HRStaffMember, SalaryType, HRDepartment, HRPosition, EmploymentType } from '@/types/human-resources'
import { useSettings } from '@/contexts/SettingsContext'

const fmt = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n))

export interface SalaryModalProps {
    open: boolean
    onClose: () => void
    onSave: (data: Partial<HRStaffSalaryHistory>) => Promise<void>
    onResign?: (data: { staffId: string, effectiveDate: string, type: 'dismissal' | 'resignation' | 'rejection', reason: string, notes: string }) => Promise<void>
    entry: HRStaffSalaryHistory | null
    staffList: HRStaffMember[]
    departments: HRDepartment[]
    positions: HRPosition[]
    saving: boolean
    loggedUserName: string
    preselectedStaffId?: string
    isProbationRejection?: boolean
}

export default function SalaryModal({ open, onClose, onSave, onResign, entry, staffList, departments, positions, saving, loggedUserName, preselectedStaffId, isProbationRejection }: SalaryModalProps) {
    const { language } = useSettings()
    const [staffId, setStaffId]           = useState(preselectedStaffId || '')
    const [effectiveDate, setEffectiveDate] = useState('')
    const [activeTab, setActiveTab]       = useState<'status' | 'resignation'>('status')
    const [leavingType, setLeavingType]   = useState<'dismissal' | 'resignation' | 'rejection' | ''>('')
    const [leavingReason, setLeavingReason] = useState('')
    
    // Position/Dept tracking
    const [prevDepartmentId, setPrevDepartmentId] = useState<string | null>(null)
    const [prevPositionId, setPrevPositionId]     = useState<string | null>(null)
    const [newDepartmentId, setNewDepartmentId]   = useState<string>('')
    const [newPositionId, setNewPositionId]       = useState<string>('')
    
    const [prevAmount, setPrevAmount]         = useState('')
    const [prevSalaryType, setPrevSalaryType] = useState<SalaryType>('fixed')
    const [newAmount, setNewAmount]           = useState('')
    const [salaryType, setSalaryType]         = useState<SalaryType>('fixed')
    const [prevEmploymentType, setPrevEmploymentType] = useState<EmploymentType | null>(null)
    const [employmentType, setEmploymentType]         = useState<EmploymentType>('full_time')
    
    const [increaseType, setIncreaseType] = useState<'percentage' | 'fixed' | 'none'>('percentage')
    const [increaseValue, setIncreaseValue] = useState('')

    const [approvedBy, setApprovedBy]     = useState('')
    const [notes, setNotes]               = useState('')

    // Auto-fill from staff selection
    useEffect(() => {
        if (!entry && staffId) {
            const staff = staffList.find(s => s.id === staffId)
            if (staff) {
                setPrevAmount(staff.salary_amount ? new Intl.NumberFormat('en-US').format(staff.salary_amount) : '0')
                setPrevSalaryType(staff.salary_type || 'fixed')
                setSalaryType(staff.salary_type || 'fixed')
                setPrevDepartmentId(staff.department_id)
                setPrevPositionId(staff.position_id)
                setNewDepartmentId(staff.department_id || '')
                setNewPositionId(staff.position_id || '')
                setPrevEmploymentType(staff.employment_type || null)
                setEmploymentType(staff.employment_type || 'full_time')
            }
        }
    }, [staffId, entry, staffList])

    // Load existing entry or reset
    useEffect(() => {
        if (entry) {
            setActiveTab('status')
            setStaffId(entry.staff_id)
            setEffectiveDate(entry.effective_date || '')
            
            setPrevDepartmentId(entry.previous_department_id)
            setPrevPositionId(entry.previous_position_id)
            setNewDepartmentId(entry.new_department_id || '')
            setNewPositionId(entry.new_position_id || '')
            
            setPrevAmount(entry.previous_amount ? new Intl.NumberFormat('en-US').format(entry.previous_amount) : '0')
            setPrevSalaryType(entry.previous_salary_type || 'fixed')
            setNewAmount(entry.new_amount ? new Intl.NumberFormat('en-US').format(entry.new_amount) : '0')
            setSalaryType(entry.salary_type as SalaryType)
            setPrevEmploymentType(entry.previous_employment_type || null)
            setEmploymentType(entry.employment_type || 'full_time')
            
            setIncreaseType(entry.increase_type || 'none')
            setIncreaseValue(entry.increase_value ? String(entry.increase_value) : '')
            
            setApprovedBy(entry.approved_by || '')
            setNotes(entry.notes || '')
        } else {
            setActiveTab(isProbationRejection ? 'resignation' : 'status')
            setLeavingType(isProbationRejection ? 'rejection' : '')
            setLeavingReason('')
            const initialStaffId = preselectedStaffId || '';
            setStaffId(initialStaffId); 
            setEffectiveDate(new Date().toISOString().slice(0, 10))
            
            const staff = initialStaffId ? staffList.find(s => s.id === initialStaffId) : null;
            if (staff) {
                setPrevAmount(staff.salary_amount ? new Intl.NumberFormat('en-US').format(staff.salary_amount) : '0')
                setPrevSalaryType(staff.salary_type || 'fixed')
                setSalaryType(staff.salary_type || 'fixed')
                setPrevDepartmentId(staff.department_id)
                setPrevPositionId(staff.position_id)
                setNewDepartmentId(staff.department_id || '')
                setNewPositionId(staff.position_id || '')
                setPrevEmploymentType(staff.employment_type || null)
                setEmploymentType(staff.employment_type || 'full_time')
            } else {
                setPrevDepartmentId(null); setPrevPositionId(null);
                setNewDepartmentId(''); setNewPositionId('');
                setPrevAmount(''); setPrevSalaryType('fixed')
                setNewAmount(''); setSalaryType('fixed')
                setPrevEmploymentType(null); setEmploymentType('full_time')
            }

            setIncreaseType('percentage'); setIncreaseValue('')
            setApprovedBy(loggedUserName); setNotes('')
        }
    }, [entry, open, loggedUserName, preselectedStaffId, staffList, isProbationRejection])

    // Auto-calculate new amount based on increase type & value (only if salary type matches)
    useEffect(() => {
        if (!prevAmount || prevSalaryType !== salaryType || increaseType === 'none') return
        const pAmt = Number(prevAmount.replace(/,/g, ''))
        const iVal = Number(increaseValue) || 0
        
        if (increaseType === 'percentage') {
            const calculated = pAmt * (1 + (iVal / 100))
            setNewAmount(new Intl.NumberFormat('en-US').format(Math.round(calculated)))
        } else if (increaseType === 'fixed') {
            const calculated = pAmt + iVal
            setNewAmount(new Intl.NumberFormat('en-US').format(Math.round(calculated)))
        }
    }, [increaseType, increaseValue, prevAmount, prevSalaryType, salaryType])
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        
        if (activeTab === 'resignation') {
            if (onResign) {
                await onResign({ staffId, effectiveDate, type: leavingType as any, reason: leavingReason, notes })
            }
            return
        }
        
        const typeChanged = prevSalaryType !== salaryType
        const isPromotion = prevDepartmentId !== newDepartmentId || prevPositionId !== newPositionId
        const finalRecordType = isPromotion ? 'promotion' : 'salary_increase'
        
        const payload: Partial<HRStaffSalaryHistory> = {
            staff_id: staffId,
            effective_date: effectiveDate,
            record_type: finalRecordType,
            previous_amount: Number(prevAmount.replace(/,/g, '')) || 0,
            previous_salary_type: prevSalaryType,
            new_amount: Number(newAmount.replace(/,/g, '')) || 0,
            salary_type: salaryType,
            increase_type: typeChanged ? 'none' : increaseType,
            increase_value: (typeChanged || increaseType === 'none') ? null : (Number(increaseValue) || 0),
            reason: finalRecordType === 'promotion' ? 'Promotion' : 'Gross Salary Change',
            approved_by: approvedBy.trim() || null,
            notes: notes.trim() || null,
            previous_employment_type: prevEmploymentType,
            employment_type: employmentType,
        }
        
        if (isPromotion) {
            payload.previous_department_id = prevDepartmentId
            payload.previous_position_id = prevPositionId
            payload.new_department_id = newDepartmentId || null
            payload.new_position_id = newPositionId || null
        } else {
            // Nullify promotion fields if just a salary increase
            payload.previous_department_id = null
            payload.previous_position_id = null
            payload.new_department_id = null
            payload.new_position_id = null
        }
        
        await onSave(payload)
    }

    const typeChanged = prevSalaryType !== salaryType
    const changePreview = prevAmount && newAmount && !typeChanged && Number(prevAmount.replace(/,/g, '')) > 0 && Number(newAmount.replace(/,/g, '')) > 0
        ? (((Number(newAmount.replace(/,/g, '')) - Number(prevAmount.replace(/,/g, ''))) / Number(prevAmount.replace(/,/g, ''))) * 100).toFixed(1)
        : null

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {language === 'vi' ? 'Ghi nhận thay đổi nhân sự' : 'Record Staff Change'}
                    </h2>
                    <button onClick={onClose} type="button" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {!entry && !isProbationRejection && (
                    <div className="flex items-center border-b border-gray-200 px-6 pt-2">
                        <button type="button" onClick={() => setActiveTab('status')}
                            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'status' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                            {language === 'vi' ? 'Lương gộp / Thay đổi chức vụ' : 'Gross Salary / Position Change'}
                        </button>
                        <button type="button" onClick={() => setActiveTab('resignation')}
                            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'resignation' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                            {language === 'vi' ? 'Sa thải / Thôi việc' : 'Dismissal / Resignation'}
                        </button>
                    </div>
                )}
                {!entry && isProbationRejection && (
                    <div className="flex items-center border-b border-gray-200 px-6 pt-2">
                        <div className="px-4 py-3 text-sm font-medium border-b-2 border-red-600 text-red-600">
                            {language === 'vi' ? 'Từ chối thử việc' : 'Probation Rejection'}
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="p-6 space-y-6">

                    {/* Staff + Date */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {language === 'vi' ? 'Thành viên nhân sự *' : 'Staff Member *'}
                            </label>
                            <select required value={staffId} onChange={e => setStaffId(e.target.value)} disabled={!!entry || !!preselectedStaffId}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white disabled:bg-gray-50">
                                <option value="">{language === 'vi' ? 'Chọn nhân viên...' : 'Select staff…'}</option>
                                {staffList.filter(s => entry || preselectedStaffId ? true : s.status === 'active').map(s => (
                                    <option key={s.id} value={s.id}>{s.full_name}</option>
                                )) }
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {language === 'vi' ? 'Ngày hiệu lực *' : 'Effective Date *'}
                            </label>
                            <input type="date" required value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} disabled={!staffId}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50" />
                        </div>
                    </div>
                    
                    {activeTab === 'status' ? (
                        <>
                            {/* Role Details */}
                            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-4">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-2 flex items-center gap-2">
                                    <Briefcase className="w-3.5 h-3.5" /> {language === 'vi' ? 'Vai trò / Chức vụ / Loại hình' : 'Role / Position / Employment Type'}
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-blue-900 mb-1">
                                            {language === 'vi' ? 'Bộ phận *' : 'Department *'}
                                        </label>
                                        <select required value={newDepartmentId} onChange={e => setNewDepartmentId(e.target.value)} disabled={!staffId}
                                            className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white disabled:bg-blue-50/50">
                                            <option value="" disabled>{language === 'vi' ? 'Chọn bộ phận...' : 'Select Department…'}</option>
                                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-blue-900 mb-1">
                                            {language === 'vi' ? 'Chức vụ *' : 'Position *'}
                                        </label>
                                        <select required value={newPositionId} onChange={e => setNewPositionId(e.target.value)} disabled={!staffId}
                                            className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white disabled:bg-blue-50/50">
                                            <option value="" disabled>{language === 'vi' ? 'Chọn chức vụ...' : 'Select Position…'}</option>
                                            {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-blue-900 mb-1">
                                            {language === 'vi' ? 'Loại hình mới *' : 'New Employment Type *'}
                                        </label>
                                        <select value={employmentType} disabled={!staffId} onChange={e => {
                                            const val = e.target.value as EmploymentType
                                            setEmploymentType(val)
                                            if (val === 'part_time') setSalaryType('hourly')
                                            else if (val === 'full_time') setSalaryType('fixed')
                                        }}
                                            className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white disabled:bg-blue-50/50">
                                            <option value="full_time">{language === 'vi' ? 'Toàn thời gian' : 'Full-Time'}</option>
                                            <option value="part_time">{language === 'vi' ? 'Bán thời gian' : 'Part-Time'}</option>
                                            <option value="outsourced">{language === 'vi' ? 'Outsource' : 'Outsourced'}</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-gray-100 pt-6 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    {/* Current Base */}
                                    <div className="space-y-4">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                                            {language === 'vi' ? 'Thông tin hiện tại' : 'Current Base'}
                                        </h4>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                {language === 'vi' ? 'Mức lương cũ (VND)' : 'Previous Amount (VND)'}
                                            </label>
                                            <input type="text" readOnly value={prevAmount}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 bg-gray-50 outline-none cursor-not-allowed" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                {language === 'vi' ? 'Loại lương cũ' : 'Previous Type'}
                                            </label>
                                            <input type="text" readOnly value={prevSalaryType === 'hourly' ? (language === 'vi' ? 'Theo giờ' : 'Hourly') : (language === 'vi' ? 'Cố định / Tháng' : 'Fixed / Month')}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 bg-gray-50 outline-none cursor-not-allowed" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                {language === 'vi' ? 'Loại hình làm việc cũ' : 'Previous Employment Type'}
                                            </label>
                                            <input type="text" readOnly value={prevEmploymentType === 'part_time' ? (language === 'vi' ? 'Bán thời gian' : 'Part-Time') : prevEmploymentType === 'outsourced' ? (language === 'vi' ? 'Outsource' : 'Outsourced') : (language === 'vi' ? 'Toàn thời gian' : 'Full-Time')}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 bg-gray-50 outline-none cursor-not-allowed" />
                                        </div>
                                    </div>

                                    {/* New Salary */}
                                    <div className="space-y-4">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                                            {language === 'vi' ? 'Chi tiết lương gộp mới' : 'New Gross Salary Details'}
                                        </h4>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                {language === 'vi' ? 'Mức lương mới (VND) *' : 'New Amount (VND) *'}
                                            </label>
                                            <input type="text" required value={newAmount} disabled={!staffId} onChange={e => {
                                                if (increaseType !== 'none') setIncreaseType('none')
                                                const val = e.target.value.replace(/\D/g, '')
                                                setNewAmount(val ? new Intl.NumberFormat('en-US').format(parseInt(val, 10)) : '')
                                            }}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold text-emerald-700 bg-emerald-50 focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-gray-50" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                {language === 'vi' ? 'Loại lương mới *' : 'New Type *'}
                                            </label>
                                            <select value={salaryType} disabled={!staffId} onChange={e => {
                                                setSalaryType(e.target.value as SalaryType)
                                                if (e.target.value !== prevSalaryType) setIncreaseType('none')
                                            }}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50">
                                                <option value="fixed">{language === 'vi' ? 'Cố định / Tháng' : 'Fixed / Month'}</option>
                                                <option value="hourly">{language === 'vi' ? 'Theo giờ' : 'Hourly'}</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                {language === 'vi' ? 'Loại hình làm việc mới' : 'New Employment Type'}
                                            </label>
                                            <input type="text" readOnly value={employmentType === 'part_time' ? (language === 'vi' ? 'Bán thời gian' : 'Part-Time') : employmentType === 'outsourced' ? (language === 'vi' ? 'Outsource' : 'Outsourced') : (language === 'vi' ? 'Toàn thời gian' : 'Full-Time')}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 bg-gray-50 outline-none cursor-not-allowed" />
                                        </div>
                                    </div>
                                </div>

                                {/* Calculation Helper (Only if types match) */}
                                {!typeChanged && (
                                    <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
                                        {/* Left side: Toggle */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1 opacity-0 hidden sm:block">
                                                {language === 'vi' ? 'Tính toán' : 'Calculate'}
                                            </label>
                                            <div className="flex bg-gray-100 p-1 rounded-lg w-full">
                                                <button type="button" onClick={() => setIncreaseType('percentage')}
                                                    disabled={!staffId}
                                                    className={`flex-1 px-4 py-2 text-xs font-semibold rounded-md transition-all ${increaseType === 'percentage' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'} disabled:opacity-50`}>
                                                    {language === 'vi' ? '% Phần trăm' : '% Percentage'}
                                                </button>
                                                <button type="button" onClick={() => setIncreaseType('fixed')}
                                                    disabled={!staffId}
                                                    className={`flex-1 px-4 py-2 text-xs font-semibold rounded-md transition-all ${increaseType === 'fixed' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'} disabled:opacity-50`}>
                                                    {language === 'vi' ? '$ Số tiền cố định' : '$ Fixed Amount'}
                                                </button>
                                            </div>
                                        </div>
                                        
                                        {/* Right side: Input */}
                                        <div>
                                            {increaseType !== 'none' ? (
                                                <>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1 opacity-0 hidden sm:block">Value</label>
                                                    <div className="relative w-full">
                                                        <input type="number" step="any" value={increaseValue} onChange={e => setIncreaseValue(e.target.value)}
                                                            disabled={!staffId}
                                                            className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50" 
                                                            placeholder={increaseType === 'percentage' ? (language === 'vi' ? "Ví dụ: 5" : "e.g. 5") : (language === 'vi' ? "Ví dụ: 500000" : "e.g. 500000")} />
                                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">
                                                            {increaseType === 'percentage' ? '%' : 'VND'}
                                                        </span>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="hidden sm:block pt-6"></div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                
                                {typeChanged && (
                                    <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 text-sm text-amber-800 flex items-start gap-2">
                                        <TrendingDown className="w-4 h-4 shrink-0 mt-0.5" />
                                        <div>
                                            {language === 'vi' ? (
                                                <><strong>Đã thay đổi loại lương gộp.</strong> Tự động tính toán bị tắt do bạn đang thay đổi giữa lương Theo giờ và Cố định. Vui lòng nhập trực tiếp mức lương mới.</>
                                            ) : (
                                                <><strong>Gross Salary Type Changed.</strong> Auto-calculation is disabled because you are changing between Hourly and Fixed tracking. Please input the new amount directly.</>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Change Preview */}
                            {changePreview && Number(changePreview) !== 0 && (
                                <div className={`flex items-center gap-2 p-3 rounded-lg ${Number(changePreview) > 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                                    <ArrowUpRight className={`w-4 h-4 ${Number(changePreview) > 0 ? 'text-emerald-600' : 'text-red-600 rotate-180'}`} />
                                    <span className={`text-sm font-medium ${Number(changePreview) > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {Number(changePreview) > 0 ? '+' : ''}{changePreview}% {language === 'vi' ? 'thay đổi' : 'change'} ({fmt(Number(newAmount.replace(/,/g, '')) - Number(prevAmount.replace(/,/g, '')))} VND)
                                    </span>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="space-y-4 pt-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        {language === 'vi' ? 'Hình thức thôi việc *' : 'Type of Leaving *'}
                                    </label>
                                    <select required value={leavingType} onChange={e => { setLeavingType(e.target.value as any); setLeavingReason(''); }} disabled={!staffId || isProbationRejection}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white disabled:bg-gray-50">
                                        <option value="" disabled>{language === 'vi' ? 'Chọn hình thức...' : 'Select type…'}</option>
                                        {!isProbationRejection && <option value="resignation">{language === 'vi' ? 'Thôi việc' : 'Resignation'}</option>}
                                        {!isProbationRejection && <option value="dismissal">{language === 'vi' ? 'Sa thải' : 'Dismissal'}</option>}
                                        {isProbationRejection && <option value="rejection">{language === 'vi' ? 'Từ chối' : 'Rejection'}</option>}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        {language === 'vi' ? 'Lý do *' : 'Reason *'}
                                    </label>
                                    <select required value={leavingReason} onChange={e => setLeavingReason(e.target.value)} disabled={!staffId || !leavingType}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white disabled:bg-gray-50">
                                        <option value="" disabled>{language === 'vi' ? 'Chọn lý do...' : 'Select reason…'}</option>
                                        {leavingType === 'resignation' && (
                                            <>
                                                <option value="Personal Reasons">{language === 'vi' ? 'Lý do cá nhân' : 'Personal Reasons'}</option>
                                                <option value="Career Change / Better Opportunity">{language === 'vi' ? 'Thay đổi công việc / Cơ hội tốt hơn' : 'Career Change / Better Opportunity'}</option>
                                                <option value="Relocation">{language === 'vi' ? 'Chuyển địa điểm sinh sống' : 'Relocation'}</option>
                                                <option value="Health Issues">{language === 'vi' ? 'Vấn đề sức khỏe' : 'Health Issues'}</option>
                                                <option value="Other">{language === 'vi' ? 'Khác' : 'Other'}</option>
                                            </>
                                        )}
                                        {leavingType === 'dismissal' && (
                                            <>
                                                <option value="Underperforming">{language === 'vi' ? 'Không đạt hiệu suất' : 'Underperforming'}</option>
                                                <option value="Behavioral Issues">{language === 'vi' ? 'Vấn đề hành vi' : 'Behavioral Issues'}</option>
                                                <option value="Attendance / Tardiness">{language === 'vi' ? 'Chuyên cần / Đi muộn' : 'Attendance / Tardiness'}</option>
                                                <option value="Policy Violation">{language === 'vi' ? 'Vi phạm chính sách' : 'Policy Violation'}</option>
                                                <option value="Redundancy / Layoff">{language === 'vi' ? 'Cắt giảm nhân sự / Định biên' : 'Redundancy / Layoff'}</option>
                                                <option value="Other">{language === 'vi' ? 'Khác' : 'Other'}</option>
                                            </>
                                        )}
                                        {leavingType === 'rejection' && (
                                            <>
                                                <option value="Underperforming">{language === 'vi' ? 'Không đạt hiệu suất' : 'Underperforming'}</option>
                                                <option value="Not suitable">{language === 'vi' ? 'Không phù hợp' : 'Not suitable'}</option>
                                                <option value="Refused position">{language === 'vi' ? 'Từ chối nhận việc' : 'Refused position'}</option>
                                                <option value="Other">{language === 'vi' ? 'Khác' : 'Other'}</option>
                                            </>
                                        )}
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Additional Details */}
                    <div className="border-t border-gray-100 pt-6">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {language === 'vi' ? 'Ghi chú' : 'Notes'}
                        </label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} disabled={!staffId}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none resize-none disabled:bg-gray-50" />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100">
                        <div className="text-xs font-medium text-gray-400">
                            {approvedBy && <span>{language === 'vi' ? 'Người duyệt: ' : 'Approved by: '}<span className="text-gray-500">{approvedBy}</span></span>}
                        </div>
                        <div className="flex items-center gap-3">
                            <button type="button" onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                                {language === 'vi' ? 'Hủy' : 'Cancel'}
                            </button>
                            <button type="submit" disabled={
                                saving || !staffId || !effectiveDate || 
                                (activeTab === 'status' && (!newAmount || !newPositionId || !newDepartmentId)) ||
                                (activeTab === 'resignation' && (!leavingType || !leavingReason))
                            }
                                className={`px-5 py-2 text-sm font-medium text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 bg-blue-600 hover:bg-blue-700`}>
                                {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                {activeTab === 'resignation' 
                                    ? (isProbationRejection 
                                        ? (language === 'vi' ? 'Từ chối' : 'Reject') 
                                        : (language === 'vi' ? 'Tiếp tục' : 'Next')) 
                                    : (entry 
                                        ? (language === 'vi' ? 'Cập nhật' : 'Update') 
                                        : (language === 'vi' ? 'Ghi nhận thay đổi' : 'Record Change'))}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}
