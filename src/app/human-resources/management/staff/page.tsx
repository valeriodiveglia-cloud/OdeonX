'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffMember, EmploymentType, SalaryType, StaffStatus, HRDepartment, HRPosition } from '@/types/human-resources'
import CircularLoader from '@/components/CircularLoader'
import {
    Users, UserPlus, Search, X, Pencil, Trash2,
    Briefcase, Clock, Building2, ChevronDown, ChevronRight, Folders
} from 'lucide-react'
import { useRouter } from 'next/navigation'

/* ─── Helpers ─── */
const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)

const STATUS_COLORS: Record<StaffStatus, { bg: string; text: string; dot: string }> = {
    active:     { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500' },
    inactive:   { bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500' },
    terminated: { bg: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-500' },
}

const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
    full_time: 'Full-time',
    part_time: 'Part-time',
}

const SALARY_LABEL: Record<SalaryType, string> = {
    fixed: '/month',
    hourly: '/hour',
}

/* ─── Modal ─── */

interface StaffModalProps {
    open: boolean
    onClose: () => void
    onSave: (data: Partial<HRStaffMember>, branchIds: string[]) => Promise<void>
    staff: HRStaffMember | null
    branches: { id: string; name: string }[]
    departments: HRDepartment[]
    positions: HRPosition[]
    saving: boolean
}

function StaffModal({ open, onClose, onSave, staff, branches, departments, positions, saving }: StaffModalProps) {
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
            setDepartmentId(staff.department_id || '')
            setPositionId(staff.position_id || '')
            setPhone(staff.phone || '')
            setEmail(staff.email || '')
            setEmploymentType(staff.employment_type)
            setSalaryType(staff.salary_type)
            setSalaryAmount(staff.salary_amount ? new Intl.NumberFormat('en-US').format(staff.salary_amount) : '')
            setStartDate(staff.start_date || '')
            setStatus(staff.status)
            setNotes(staff.notes || '')
            const branchIds = staff.hr_staff_branches?.map(b => b.branch_id) || []
            setSelectedBranches(branchIds)
        } else {
            setLastName(''); setMiddleName(''); setFirstName('')
            setDepartmentId(''); setPositionId(''); setPhone(''); setEmail('')
            setEmploymentType('full_time'); setSalaryType('fixed'); setSalaryAmount('')
            setStartDate(''); setStatus('active'); setNotes('')
            setSelectedBranches([])
        }
    }, [staff, open])

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
        const buildFullName = [lastName.trim(), middleName.trim(), firstName.trim()]
            .filter(Boolean)
            .join(' ')
            
        const deptName = departments.find(d => d.id === departmentId)?.name || null
        const posName = positions.find(p => p.id === positionId)?.name || ''
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
                        {staff ? 'Edit Staff Member' : 'Add Staff Member'}
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

                    {/* Row 2: Department + Position + Status */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                            <select value={status} onChange={e => setStatus(e.target.value as StaffStatus)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                                <option value="terminated">Terminated</option>
                            </select>
                        </div>
                    </div>

                    {/* Row 3: Employment + Salary */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
                            <select value={employmentType} onChange={e => {
                                const val = e.target.value as EmploymentType;
                                setEmploymentType(val);
                                if (val === 'part_time') setSalaryType('hourly');
                                if (val === 'full_time') setSalaryType('fixed');
                            }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                <option value="full_time">Full-time</option>
                                <option value="part_time">Part-time</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Salary Type</label>
                            <select value={salaryType} onChange={e => setSalaryType(e.target.value as SalaryType)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                <option value="fixed">Fixed Monthly</option>
                                <option value="hourly">Hourly Rate</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Amount (VND) {salaryType === 'fixed' ? '/month' : '/hour'}
                            </label>
                            <input type="text" value={salaryAmount} onChange={e => {
                                const val = e.target.value.replace(/\D/g, '')
                                setSalaryAmount(val ? new Intl.NumberFormat('en-US').format(parseInt(val, 10)) : '')
                            }}
                                placeholder="0"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                    </div>

                    {/* Row 4: Phone + Email + Start Date */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                    </div>

                    {/* Branch Assignment */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Branch Assignment</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {branches.map(branch => {
                                const selected = selectedBranches.includes(branch.id)
                                return (
                                    <div key={branch.id}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition cursor-pointer
                                            ${selected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                                        onClick={() => toggleBranch(branch.id)}
                                    >
                                        <input type="checkbox" checked={selected} readOnly
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className={`text-sm flex-1 ${selected ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>
                                            {branch.name}
                                        </span>
                                    </div>
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
                            {staff ? 'Update' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

/* ─── Delete Confirm ─── */

function DeleteConfirm({ name, onConfirm, onCancel, deleting }: {
    name: string; onConfirm: () => void; onCancel: () => void; deleting: boolean
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Staff Member</h3>
                <p className="text-sm text-gray-600 mb-6">
                    Are you sure you want to delete <strong>{name}</strong>? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                        Cancel
                    </button>
                    <button onClick={onConfirm} disabled={deleting}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-2">
                        {deleting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        Delete
                    </button>
                </div>
            </div>
        </div>
    )
}

/* ─── Main Page ─── */

export default function StaffListPage() {
    const [loading, setLoading]       = useState(true)
    const [staff, setStaff]           = useState<HRStaffMember[]>([])
    const [branches, setBranches]     = useState<{ id: string; name: string }[]>([])
    const [branchMap, setBranchMap]   = useState<Record<string, string>>({})
    const [departments, setDepartments] = useState<HRDepartment[]>([])
    const [positions, setPositions]     = useState<HRPosition[]>([])
    const router = useRouter()

    // Filters
    const [search, setSearch]         = useState('')
    const [filterBranch, setFilterBranch]           = useState('all')
    const [filterEmployment, setFilterEmployment]   = useState<'all' | EmploymentType>('all')
    const [filterStatus, setFilterStatus]           = useState<'all' | StaffStatus>('all')

    // Modal
    const [modalOpen, setModalOpen]   = useState(false)
    const [editingStaff, setEditingStaff] = useState<HRStaffMember | null>(null)
    const [saving, setSaving]         = useState(false)

    // Delete
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            const [branchRes, staffRes, deptRes, posRes] = await Promise.all([
                supabase.from('provider_branches').select('id, name').order('name'),
                supabase.from('hr_staff').select('*, hr_staff_branches(*)').order('full_name'),
                supabase.from('hr_departments').select('*').order('sort_order'),
                supabase.from('hr_positions').select('*').order('sort_order'),
            ])

            if (branchRes.data) {
                setBranches(branchRes.data)
                const map: Record<string, string> = {}
                branchRes.data.forEach((b: any) => { map[b.id] = b.name })
                setBranchMap(map)
            }

            if (staffRes.data) setStaff(staffRes.data as HRStaffMember[])
            if (deptRes.data) setDepartments(deptRes.data as HRDepartment[])
            if (posRes.data) setPositions(posRes.data as HRPosition[])
        } catch (err) {
            console.error('Error fetching staff data:', err)
        }
        setLoading(false)
    }, [])

    useEffect(() => { fetchAll() }, [fetchAll])

    /* ─── Filtered list ─── */
    const filtered = useMemo(() => {
        return staff.filter(s => {
            if (search) {
                const q = search.toLowerCase()
                if (
                    !s.full_name.toLowerCase().includes(q) &&
                    !s.position.toLowerCase().includes(q) &&
                    !(s.department || '').toLowerCase().includes(q)
                ) return false
            }
            if (filterBranch !== 'all') {
                const branchIds = s.hr_staff_branches?.map(b => b.branch_id) || []
                if (!branchIds.includes(filterBranch)) return false
            }
            if (filterEmployment !== 'all' && s.employment_type !== filterEmployment) return false
            if (filterStatus !== 'all' && s.status !== filterStatus) return false
            return true
        })
    }, [staff, search, filterBranch, filterEmployment, filterStatus])

    /* ─── Summary cards ─── */
    const totalActive   = staff.filter(s => s.status === 'active').length
    const totalFT       = staff.filter(s => s.employment_type === 'full_time' && s.status === 'active').length
    const totalPT       = staff.filter(s => s.employment_type === 'part_time' && s.status === 'active').length

    const summaryCards = [
        { label: 'Total Staff',   value: staff.length,  icon: Users,     color: 'text-blue-600',    bg: 'bg-blue-50' },
        { label: 'Active',        value: totalActive,    icon: Users,     color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: 'Full-time',     value: totalFT,        icon: Briefcase, color: 'text-indigo-600',  bg: 'bg-indigo-50' },
        { label: 'Part-time',     value: totalPT,        icon: Clock,     color: 'text-amber-600',   bg: 'bg-amber-50' },
    ]

    /* ─── Save handler ─── */
    const handleSave = async (data: Partial<HRStaffMember>, branchIds: string[]) => {
        setSaving(true)
        try {
            if (editingStaff) {
                // Update
                const { error } = await supabase.from('hr_staff').update(data).eq('id', editingStaff.id)
                if (error) throw error

                // Rebuild branch assignments
                await supabase.from('hr_staff_branches').delete().eq('staff_id', editingStaff.id)
                if (branchIds.length > 0) {
                    const rows = branchIds.map(bid => ({
                        staff_id: editingStaff.id,
                        branch_id: bid,
                        is_primary: false,
                    }))
                    const { error: brErr } = await supabase.from('hr_staff_branches').insert(rows)
                    if (brErr) throw brErr
                }
            } else {
                // Create
                const { data: newStaff, error } = await supabase.from('hr_staff').insert([data]).select().single()
                if (error) throw error

                if (branchIds.length > 0 && newStaff) {
                    const rows = branchIds.map(bid => ({
                        staff_id: newStaff.id,
                        branch_id: bid,
                        is_primary: false,
                    }))
                    const { error: brErr } = await supabase.from('hr_staff_branches').insert(rows)
                    if (brErr) throw brErr
                }
            }

            setModalOpen(false)
            setEditingStaff(null)
            await fetchAll()
        } catch (err) {
            console.error('Error saving staff:', err)
            alert('Failed to save staff member')
        }
        setSaving(false)
    }

    /* ─── Delete handler ─── */
    const handleDelete = async () => {
        if (!deletingId) return
        setDeleteLoading(true)
        try {
            const { error } = await supabase.from('hr_staff').delete().eq('id', deletingId)
            if (error) throw error
            setDeletingId(null)
            await fetchAll()
        } catch (err) {
            console.error('Error deleting staff:', err)
            alert('Failed to delete staff member')
        }
        setDeleteLoading(false)
    }

    /* ─── Render ─── */
    if (loading) {
        return <div className="min-h-screen flex items-center justify-center"><CircularLoader /></div>
    }

    return (
        <div className="min-h-screen text-gray-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Staff Management</h1>
                        <p className="text-sm text-slate-400 mt-1">Manage staff members, positions, salaries and branch assignments.</p>
                    </div>
                    <button
                        onClick={() => { setEditingStaff(null); setModalOpen(true) }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition shadow hover:shadow-lg shrink-0"
                    >
                        <UserPlus className="w-4 h-4" />
                        Add Staff
                    </button>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    {summaryCards.map(c => (
                        <div key={c.label} className="rounded-xl bg-white shadow-sm p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className={`p-1.5 rounded-lg ${c.bg}`}>
                                    <c.icon className={`w-4 h-4 ${c.color}`} />
                                </div>
                                <span className="text-xs text-gray-500">{c.label}</span>
                            </div>
                            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                        </div>
                    ))}
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                    {/* Search */}
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search name, position…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10">
                                <X className="w-3 h-3 text-slate-400" />
                            </button>
                        )}
                    </div>

                    {/* Branch filter */}
                    <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
                        className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                        <option value="all">All Branches</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>

                    {/* Employment type filter */}
                    <select value={filterEmployment} onChange={e => setFilterEmployment(e.target.value as any)}
                        className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                        <option value="all">All Types</option>
                        <option value="full_time">Full-time</option>
                        <option value="part_time">Part-time</option>
                    </select>

                    {/* Status filter */}
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
                        className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="terminated">Terminated</option>
                    </select>

                    <span className="text-xs text-slate-500 ml-auto">{filtered.length} of {staff.length} shown</span>
                </div>

                {/* Table */}
                <div className="rounded-2xl bg-white shadow-md overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">#</th>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Name</th>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Position</th>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Branch(es)</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Type</th>
                                    <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Salary (VND)</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Status</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((s, idx) => {
                                    const sc = STATUS_COLORS[s.status]
                                    const branchNames = (s.hr_staff_branches || [])
                                        .map(b => branchMap[b.branch_id])
                                        .filter(Boolean)

                                    return (
                                        <tr 
                                            key={s.id} 
                                            onClick={() => router.push(`/human-resources/management/staff/${s.id}`)}
                                            className={`border-t border-gray-100 hover:bg-gray-50/80 transition-colors cursor-pointer ${idx % 2 === 0 ? 'bg-gray-50/30' : ''}`}
                                        >
                                            <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                                        {(s.full_name || '').trim().split(/\s+/).filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="text-sm font-medium text-gray-900 block truncate">{s.full_name}</span>
                                                        {s.department && <span className="text-xs text-gray-400 block">{s.department}</span>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600">{s.position}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-1">
                                                    {branchNames.length > 0 ? branchNames.map((name, i) => (
                                                        <span key={i}
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600"
                                                        >
                                                            <Building2 className="w-3 h-3" />
                                                            {name}
                                                        </span>
                                                    )) : <span className="text-xs text-gray-400 italic">Not assigned</span>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium
                                                    ${s.employment_type === 'full_time'
                                                        ? 'bg-indigo-50 text-indigo-700'
                                                        : 'bg-amber-50 text-amber-700'
                                                    }`}
                                                >
                                                    {EMPLOYMENT_LABEL[s.employment_type]}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm font-mono">
                                                <span className="text-gray-900 font-semibold">{fmt(s.salary_amount)}</span>
                                                <span className="text-gray-400 text-xs ml-1">{SALARY_LABEL[s.salary_type]}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${sc.bg} ${sc.text}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                                                    {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setDeletingId(s.id)
                                                        }}
                                                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition relative z-10"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-16 text-center">
                                            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                            <p className="text-gray-500 text-sm font-medium">
                                                {staff.length === 0 ? 'No staff members yet' : 'No results match your filters'}
                                            </p>
                                            {staff.length === 0 && (
                                                <button
                                                    onClick={() => { setEditingStaff(null); setModalOpen(true) }}
                                                    className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
                                                >
                                                    + Add your first staff member
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <StaffModal
                open={modalOpen}
                onClose={() => { setModalOpen(false); setEditingStaff(null) }}
                onSave={handleSave}
                staff={editingStaff}
                branches={branches}
                departments={departments}
                positions={positions}
                saving={saving}
            />

            {deletingId && (
                <DeleteConfirm
                    name={staff.find(s => s.id === deletingId)?.full_name || ''}
                    onConfirm={handleDelete}
                    onCancel={() => setDeletingId(null)}
                    deleting={deleteLoading}
                />
            )}
        </div>
    )
}
