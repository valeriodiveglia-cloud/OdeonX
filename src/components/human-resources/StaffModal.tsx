import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { HRStaffMember, HRDepartment, HRPosition, EmploymentType, SalaryType, StaffStatus } from '@/types/human-resources'
import { supabase } from '@/lib/supabase'

export interface StaffModalProps {
    open: boolean
    onClose: () => void
    onSave: (data: Partial<HRStaffMember>, branchIds: string[]) => Promise<void>
    staff: HRStaffMember | null
    branches: { id: string; name: string }[]
    departments: HRDepartment[]
    positions: HRPosition[]
    saving: boolean
    isRehire?: boolean
}

export function StaffModal({ open, onClose, onSave, staff, branches, departments, positions, saving, isRehire }: StaffModalProps) {
    const [lastName, setLastName]             = useState('')
    const [middleName, setMiddleName]         = useState('')
    const [firstName, setFirstName]           = useState('')
    const [departmentId, setDepartmentId]     = useState('')
    const [positionId, setPositionId]         = useState('')
    const [phone, setPhone]                   = useState('')
    const [email, setEmail]                   = useState('')
    const [employmentType, setEmploymentType] = useState<EmploymentType>('full_time')
    const [salaryType, setSalaryType]         = useState<SalaryType>('fixed')
    const [salaryAmount, setSalaryAmount]     = useState('')
    const [startDate, setStartDate]           = useState('')
    const [probationMonths, setProbationMonths] = useState('')
    const [probationSalaryPct, setProbationSalaryPct] = useState('100')
    const [status, setStatus]                 = useState<StaffStatus>('active')
    const [notes, setNotes]                   = useState('')
    const [selectedBranches, setSelectedBranches] = useState<string[]>([])

    // Filter positions by selected department
    const filteredPositions = departmentId
        ? positions.filter(p => !p.department_id || p.department_id === departmentId)
        : positions

    useEffect(() => {
        if (staff) {
            const parts = (staff.full_name || '').split(' ').filter(Boolean)
            if (parts.length === 1) {
                setLastName(parts[0])
                setMiddleName('')
                setFirstName('')
            } else if (parts.length === 2) {
                setLastName(parts[0])
                setMiddleName('')
                setFirstName(parts[1])
            } else if (parts.length > 2) {
                setLastName(parts[0])
                setFirstName(parts[parts.length - 1])
                setMiddleName(parts.slice(1, parts.length - 1).join(' '))
            } else {
                setLastName('')
                setMiddleName('')
                setFirstName('')
            }
            
            setPhone(staff.phone || '')
            setEmail(staff.email || '')
            
            if (isRehire) {
                // Clear employment data for re-hire
                setDepartmentId('')
                setPositionId('')
                setEmploymentType('full_time')
                setSalaryType('fixed')
                setSalaryAmount('')
                setStartDate('')
                setProbationMonths('')
                setProbationSalaryPct('100')
                setStatus('active')
                setNotes('')
                setSelectedBranches([])
            } else {
                setDepartmentId(staff.department_id || '')
                setPositionId(staff.position_id || '')
                setEmploymentType(staff.employment_type)
                setSalaryType(staff.salary_type)
                setSalaryAmount(staff.salary_amount ? new Intl.NumberFormat('en-US').format(staff.salary_amount) : '')
                setStartDate(staff.start_date || '')
                setProbationMonths(staff.probation_months ? staff.probation_months.toString() : '')
                setProbationSalaryPct(staff.probation_salary_pct ? staff.probation_salary_pct.toString() : '100')
                setStatus(staff.status)
                setNotes(staff.notes || '')
                const branchIds = staff.hr_staff_branches?.map(b => b.branch_id) || []
                setSelectedBranches(branchIds)
            }
        } else {
            setLastName(''); setMiddleName(''); setFirstName('')
            setDepartmentId(''); setPositionId(''); setPhone(''); setEmail('')
            setEmploymentType('full_time'); setSalaryType('fixed'); setSalaryAmount('')
            setStartDate(''); setProbationMonths(''); setProbationSalaryPct('100'); setStatus('active'); setNotes('')
            setSelectedBranches([])
        }
    }, [staff, open, isRehire])

    const toggleBranch = (id: string) => {
        setSelectedBranches(prev => {
            if (prev.includes(id)) {
                return prev.filter(b => b !== id)
            }
            return [...prev, id]
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const phoneVal = phone.trim() || null;
        const emailVal = email.trim() || null;

        // Check for duplicates in the database (active or archived)
        if (phoneVal || emailVal) {
            let query = supabase.from('hr_staff').select('id, full_name, status');
            
            if (phoneVal && emailVal) {
                query = query.or(`phone.eq."${phoneVal}",email.eq."${emailVal}"`);
            } else if (phoneVal) {
                query = query.eq('phone', phoneVal);
            } else if (emailVal) {
                query = query.eq('email', emailVal);
            }

            if (staff) {
                query = query.neq('id', staff.id);
            }

            const { data, error } = await query;
            if (!error && data && data.length > 0) {
                const duplicate = data[0];
                alert(`Cannot save: A staff member named "${duplicate.full_name}" (Status: ${duplicate.status}) already exists with this phone or email.`);
                return; // Stop submission
            }
        }

        const buildFullName = [lastName.trim(), middleName.trim(), firstName.trim()]
            .filter(Boolean)
            .join(' ')
            
        const deptName = departments.find(d => d.id === departmentId)?.name || null
        const posName = positions.find(p => p.id === positionId)?.name || ''
        
        let probationEndDate = null;
        const probMonths = parseInt(probationMonths, 10);
        if (startDate && !isNaN(probMonths) && probMonths > 0) {
            const dateObj = new Date(startDate);
            dateObj.setMonth(dateObj.getMonth() + probMonths);
            dateObj.setDate(dateObj.getDate() - 1);
            probationEndDate = dateObj.toISOString().split('T')[0];
        }

        await onSave(
            {
                full_name: buildFullName,
                position: posName,
                department: deptName,
                department_id: departmentId || null,
                position_id: positionId || null,
                phone: phone.trim() || null,
                email: email.trim() || null,
                employment_type: employmentType,
                salary_type: salaryType,
                salary_amount: parseFloat(salaryAmount.replace(/,/g, '')) || 0,
                start_date: startDate || null,
                probation_months: isNaN(probMonths) ? 0 : probMonths,
                probation_salary_pct: parseFloat(probationSalaryPct) || 100,
                probation_end_date: probationEndDate,
                status,
                notes: notes.trim() || null,
            },
            selectedBranches
        )
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {isRehire ? 'Re-hire Staff Member' : (staff ? 'Edit Staff Member' : 'Add Staff Member')}
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Row 1: Name Parts */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                            <input required value={lastName} onChange={e => setLastName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Middle Name</label>
                            <input value={middleName} onChange={e => setMiddleName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                            <input required value={firstName} onChange={e => setFirstName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                    </div>

                    {/* Row 2: Phone + Email */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                            <input value={phone} onChange={e => setPhone(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                    </div>

                    {/* Row 3: Department + Position + (Status if editing/not rehire) */}
                    <div className={`grid grid-cols-1 gap-4 ${(staff && !isRehire) ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                            <select value={departmentId} onChange={e => { setDepartmentId(e.target.value); setPositionId('') }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                <option value="">Select department…</option>
                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Position *</label>
                            <select required value={positionId} onChange={e => setPositionId(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                <option value="">Select position…</option>
                                {filteredPositions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                        {(staff && !isRehire) && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                <select value={status} onChange={e => setStatus(e.target.value as StaffStatus)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                    <option value="terminated">Terminated</option>
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Row 4: Employment + Salary */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
                            <select value={employmentType} onChange={e => {
                                const val = e.target.value as EmploymentType;
                                setEmploymentType(val);
                                if (val === 'part_time') setSalaryType('hourly');
                                if (val === 'full_time') setSalaryType('fixed');
                                if (val === 'outsourced') {
                                    setSalaryType('hourly');
                                    setProbationMonths('');
                                    setProbationSalaryPct('100');
                                }
                            }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                <option value="full_time">Full-time</option>
                                <option value="part_time">Part-time</option>
                                <option value="outsourced">Outsourced</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Amount (VND) {employmentType === 'full_time' ? '/month' : '/hour'}
                            </label>
                            <input type="text" value={salaryAmount} onChange={e => {
                                const val = e.target.value.replace(/\D/g, '')
                                setSalaryAmount(val ? new Intl.NumberFormat('en-US').format(parseInt(val, 10)) : '')
                            }}
                                placeholder="0"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                    </div>

                    {/* Row 5: Start Date + Probation */}
                    {employmentType !== 'outsourced' && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Probation Time (Months)</label>
                                <input type="number" min="0" step="1" value={probationMonths} onChange={e => setProbationMonths(e.target.value)}
                                    placeholder="e.g. 2"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Probation Salary (%)</label>
                                <div className="relative">
                                    <input type="number" min="0" max="100" step="1" value={probationSalaryPct} onChange={e => setProbationSalaryPct(e.target.value)}
                                        placeholder="100"
                                        className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Branch Assignment */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Branch Assignment</label>
                        <div className="flex flex-wrap gap-2">
                            {branches.map(branch => {
                                const isSelected = selectedBranches.includes(branch.id)
                                return (
                                    <button
                                        type="button"
                                        key={branch.id}
                                        onClick={() => toggleBranch(branch.id)}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                                            isSelected 
                                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                                            : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        {branch.name}
                                    </button>
                                )
                            })}
                        </div>
                        {branches.length === 0 && (
                            <p className="text-xs text-gray-400 mt-1">No branches found. Add branches in General Settings first.</p>
                        )}
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none" />
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                        <button type="button" onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving || !lastName.trim() || !firstName.trim() || !positionId}
                            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                            {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            {isRehire ? 'Re-hire Staff' : (staff ? 'Update' : 'Create')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
