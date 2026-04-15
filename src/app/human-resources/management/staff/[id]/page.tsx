'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import {
    ArrowLeft, User, FileText, Activity, TrendingUp, Save, UploadCloud, ExternalLink,
    Calendar, Building2, Briefcase, Plus, Loader2, Trash2, BadgeCheck, Lock, Unlock
} from 'lucide-react'
import { HRStaffMember, HRDepartment, HRPosition, HRStaffRoleHistory, HRStaffPerformance, HRStaffSalaryHistory, EmploymentType, SalaryType, StaffStatus } from '@/types/human-resources'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'

// === HELPERS ===
const fmtVND = (n: number) => new Intl.NumberFormat('en-US').format(n || 0)
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB') : '-'

// === TABS CONFIG ===
const TABS = [
    { id: 'profile', label: 'Profile & Contract', icon: User, color: 'text-blue-600', activeBg: 'bg-blue-50 text-blue-700' },
    { id: 'documents', label: 'Documents', icon: FileText, color: 'text-indigo-600', activeBg: 'bg-indigo-50 text-indigo-700' },
    { id: 'timeline', label: 'Career Journey', icon: Activity, color: 'text-purple-600', activeBg: 'bg-purple-50 text-purple-700' },
    { id: 'performance', label: 'Performance', icon: TrendingUp, color: 'text-emerald-600', activeBg: 'bg-emerald-50 text-emerald-700' },
] as const;
type TabId = typeof TABS[number]['id'];

// === MAIN PAGE ===
export default function StaffDetailPage() {
    const { id } = useParams() as { id: string }
    const router = useRouter()

    const [activeTab, setActiveTab] = useState<TabId>('profile')
    const [loading, setLoading] = useState(true)
    
    // Data
    const [staff, setStaff] = useState<HRStaffMember | null>(null)
    const [departments, setDepartments] = useState<HRDepartment[]>([])
    const [positions, setPositions] = useState<HRPosition[]>([])
    const [roleHistory, setRoleHistory] = useState<HRStaffRoleHistory[]>([])
    const [salaryHistory, setSalaryHistory] = useState<HRStaffSalaryHistory[]>([])
    const [performances, setPerformances] = useState<HRStaffPerformance[]>([])
    const [providerBranches, setProviderBranches] = useState<{id: string, name: string}[]>([])

    const fetchAll = useCallback(async () => {
        if (!id) return;
        setLoading(true)
        try {
            const [staffRes, deptsRes, posRes, roleReq, salReq, perfReq, branchesReq] = await Promise.all([
                supabase.from('hr_staff').select('*, hr_departments(*), hr_positions(*), hr_staff_branches(*)').eq('id', id).single(),
                supabase.from('hr_departments').select('*').order('sort_order'),
                supabase.from('hr_positions').select('*').order('sort_order'),
                supabase.from('hr_staff_role_history').select('*, old_position:hr_positions!old_position_id(*), new_position:hr_positions!new_position_id(*)').eq('staff_id', id).order('effective_date', { ascending: false }),
                supabase.from('hr_staff_salary_history').select('*').eq('staff_id', id).order('effective_date', { ascending: false }),
                supabase.from('hr_staff_performance').select('*').eq('staff_id', id).order('review_date', { ascending: false }),
                supabase.from('provider_branches').select('id, name').order('name')
            ])
            if (staffRes.data) setStaff(staffRes.data as any)
            if (deptsRes.data) setDepartments(deptsRes.data)
            if (posRes.data) setPositions(posRes.data)
            if (roleReq.data) setRoleHistory(roleReq.data)
            if (salReq.data) setSalaryHistory(salReq.data)
            if (perfReq.data) setPerformances(perfReq.data)
            if (branchesReq.data) setProviderBranches(branchesReq.data)
        } catch (err) {
            console.error('Error fetching staff data', err)
        }
        setLoading(false)
    }, [id])

    useEffect(() => { fetchAll() }, [fetchAll])

    if (loading) {
        return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><CircularLoader /></div>
    }

    if (!staff) {
        return (
            <div className="min-h-screen bg-slate-900 p-8 text-center text-white">
                <p>Staff member not found.</p>
                <Link href="/human-resources/management/staff" className="mt-4 text-blue-400 hover:underline">Go back</Link>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-900 text-gray-100 flex flex-col">
            {/* Top Navigation & Header */}
            <div className="bg-slate-900 border-b border-white/10 sticky top-0 z-20">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center gap-4">
                        <Link href="/human-resources/management/staff" className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-lg font-bold shadow-lg shadow-blue-500/20 shrink-0">
                            {(staff.full_name || '').trim().split(/\s+/).filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">{staff.full_name}</h1>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md border border-white/5">
                                    <Briefcase className="w-3 h-3" />
                                    {staff.position || 'No Position'}
                                </span>
                                {(staff as any).hr_departments?.name && (
                                    <span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md border border-white/5">
                                        <Building2 className="w-3 h-3" />
                                        {(staff as any).hr_departments?.name}
                                    </span>
                                )}
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border
                                    ${staff.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                      staff.status === 'inactive' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                                      'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                                    {staff.status.toUpperCase()}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="mt-8 border-b border-white/10">
                        <nav className="-mb-px flex space-x-8 overflow-x-auto custom-scrollbar" aria-label="Tabs">
                            {TABS.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                                        flex items-center gap-2 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                                        ${activeTab === tab.id
                                            ? 'border-blue-500 text-blue-500'
                                            : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}
                                    `}
                                >
                                    <tab.icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>

                </div>
            </div>

            <div className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">

                {/* Tab Content Panel */}
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden text-gray-900 border border-gray-100">
                    <div className="p-6 sm:p-8">
                        {activeTab === 'profile' && <TabProfile staff={staff} departments={departments} positions={positions} branches={providerBranches} onUpdate={fetchAll} />}
                        {activeTab === 'documents' && <TabDocuments staff={staff} onUpdate={fetchAll} />}
                        {activeTab === 'timeline' && <TabTimeline staff={staff} roleHistory={roleHistory} salaryHistory={salaryHistory} positions={positions} onUpdate={fetchAll} />}
                        {activeTab === 'performance' && <TabPerformance staff={staff} performances={performances} onUpdate={fetchAll} />}
                    </div>
                </div>

            </div>
        </div>
    )
}

// ==========================================
// TAB: Profile & Contract
// ==========================================
function TabProfile({ staff, departments, positions, branches, onUpdate }: { staff: HRStaffMember, departments: HRDepartment[], positions: HRPosition[], branches: any[], onUpdate: () => void }) {
    const [formData, setFormData] = useState<Partial<HRStaffMember>>({})
    const [selectedBranches, setSelectedBranches] = useState<string[]>([])
    const [displaySalary, setDisplaySalary] = useState<string>('')
    const [saving, setSaving] = useState(false)
    const [unlockedFields, setUnlockedFields] = useState<Set<string>>(new Set())
    const [unlockPrompt, setUnlockPrompt] = useState<'position' | 'salary' | null>(null)

    const handleUnlock = (field: string) => {
        setUnlockPrompt(field as 'position' | 'salary')
    }

    useEffect(() => {
        setFormData({ ...staff })
        setSelectedBranches((staff as any).hr_staff_branches?.map((b: any) => b.branch_id) || [])
        
        if (staff.salary_amount) {
            setDisplaySalary(staff.salary_amount.toLocaleString('en-US', { maximumFractionDigits: 2 }))
        } else {
            setDisplaySalary('')
        }
    }, [staff])

    const handleChange = (field: keyof HRStaffMember | 'salary_amount', val: any) => setFormData(p => ({ ...p, [field]: val }))
    
    const handleSave = async () => {
        setSaving(true)
        try {
            const { hr_staff_branches, hr_departments, hr_positions, ...updateData } = formData as any;
            const { error } = await supabase.from('hr_staff').update(updateData).eq('id', staff.id)
            if (error) throw error

            await supabase.from('hr_staff_branches').delete().eq('staff_id', staff.id)
            if (selectedBranches.length > 0) {
                const rows = selectedBranches.map(branch_id => ({ staff_id: staff.id, branch_id }))
                await supabase.from('hr_staff_branches').insert(rows)
            }

            onUpdate()
        } catch (err) {
            console.error(err)
            alert('Failed to update details')
        }
        setSaving(false)
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div>
                <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-500">General Information</h2>
                <p className="text-sm text-gray-500 mt-1">Basic contact and position details.</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Full Name</label>
                    <input value={formData.full_name || ''} onChange={e => handleChange('full_name', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                     <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Status</label>
                     <select value={formData.status || 'active'} onChange={e => handleChange('status', e.target.value)}
                         className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                         <option value="active">Active</option>
                         <option value="inactive">Inactive</option>
                         <option value="terminated">Terminated</option>
                     </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phone</label>
                    <input value={formData.phone || ''} onChange={e => handleChange('phone', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email</label>
                    <input type="email" value={formData.email || ''} onChange={e => handleChange('email', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Department</label>
                    <select value={formData.department_id || ''} onChange={e => handleChange('department_id', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="">None</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Position</label>
                    <div className="relative">
                        <select disabled={!unlockedFields.has('position')} value={formData.position_id || ''} onChange={e => handleChange('position_id', e.target.value)}
                            className="w-full px-3 py-2 pr-10 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed">
                            <option value="">None</option>
                            {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button type="button" onClick={() => !unlockedFields.has('position') && handleUnlock('position')} className={`absolute right-8 top-1/2 -translate-y-1/2 transition-colors ${unlockedFields.has('position') ? 'text-blue-500' : 'text-gray-400 hover:text-amber-500'}`} title={unlockedFields.has('position') ? "Unlocked" : "Unlock to edit directly"}>
                            {unlockedFields.has('position') ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Employment Type</label>
                    <select value={formData.employment_type || 'full_time'} onChange={e => handleChange('employment_type', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="full_time">Full-time</option>
                        <option value="part_time">Part-time</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Salary Type</label>
                    <div className="relative">
                        <select disabled={!unlockedFields.has('salary')} value={formData.salary_type || 'fixed'} onChange={e => handleChange('salary_type', e.target.value)}
                            className="w-full px-3 py-2 pr-10 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed">
                            <option value="fixed">Fixed</option>
                            <option value="hourly">Hourly</option>
                        </select>
                        <button type="button" onClick={() => !unlockedFields.has('salary') && handleUnlock('salary')} className={`absolute right-8 top-1/2 -translate-y-1/2 transition-colors ${unlockedFields.has('salary') ? 'text-blue-500' : 'text-gray-400 hover:text-amber-500'}`} title={unlockedFields.has('salary') ? "Unlocked" : "Unlock to edit directly"}>
                            {unlockedFields.has('salary') ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Salary Amount</label>
                    <div className="relative">
                        <input type="text" disabled={!unlockedFields.has('salary')} value={displaySalary} 
                            onChange={e => {
                                let val = e.target.value.replace(/[^0-9.]/g, '');
                                const parts = val.split('.');
                                let wholeNumber = parts[0];
                                const decimal = parts.length > 1 ? '.' + parts[1] : '';
                                
                                if (wholeNumber) {
                                    wholeNumber = parseInt(wholeNumber, 10).toLocaleString('en-US');
                                }
                                
                                setDisplaySalary(wholeNumber + decimal);
                                
                                const rawFloat = parseFloat(val);
                                handleChange('salary_amount', isNaN(rawFloat) ? null : rawFloat);
                            }}
                            className="w-full pl-3 pr-10 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:bg-gray-100 disabled:cursor-not-allowed" />
                        <button type="button" onClick={() => !unlockedFields.has('salary') && handleUnlock('salary')} className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${unlockedFields.has('salary') ? 'text-blue-500' : 'text-gray-400 hover:text-amber-500'}`} title={unlockedFields.has('salary') ? "Unlocked" : "Unlock to edit directly"}>
                            {unlockedFields.has('salary') ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </div>

            <hr className="border-gray-100" />

            <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Assigned Branches</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {branches.map(branch => (
                        <label key={branch.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${selectedBranches.includes(branch.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                            <input type="checkbox" className="rounded text-blue-600 focus:ring-blue-500"
                                checked={selectedBranches.includes(branch.id)}
                                onChange={(e) => {
                                    if (e.target.checked) setSelectedBranches(p => [...p, branch.id])
                                    else setSelectedBranches(p => p.filter(id => id !== branch.id))
                                }}
                            />
                            <span className="text-sm text-gray-700">{branch.name}</span>
                        </label>
                    ))}
                    {branches.length === 0 && <span className="text-sm text-gray-400">No branches available in settings.</span>}
                </div>
            </div>

            <hr className="border-gray-100" />

            <div>
                <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-500">Contract & Dates</h2>
                <p className="text-sm text-gray-500 mt-1">Employment timeline and contract milestones.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Start Date</label>
                    <input type="date" value={formData.start_date || ''} onChange={e => handleChange('start_date', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Contract Signing Date</label>
                    <input type="date" value={formData.contract_signing_date || ''} onChange={e => handleChange('contract_signing_date', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Probation End Date</label>
                    <input type="date" value={formData.probation_end_date || ''} onChange={e => handleChange('probation_end_date', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Contract Expiration Date</label>
                    <input type="date" value={formData.contract_expiration_date || ''} onChange={e => handleChange('contract_expiration_date', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
            </div>

            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 mt-5">Notes</label>
                <textarea rows={3} value={formData.notes || ''} onChange={e => handleChange('notes', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Internal notes..."></textarea>
            </div>

            <div className="pt-4 flex justify-end">
                <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Changes
                </button>
            </div>

            {/* Custom Warning Modal for Unlocking Fields */}
            {unlockPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-amber-100">
                        <div className="bg-amber-50/80 p-5 border-b border-amber-100 flex items-start gap-4">
                            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                                <Lock className="w-5 h-5 text-amber-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-amber-900 leading-tight">Direct Modification Warning</h3>
                                <p className="text-sm text-amber-700 mt-1 leading-snug">
                                    Modifying this field here will override the current value without keeping a historical record.
                                </p>
                            </div>
                        </div>
                        <div className="p-5">
                            <p className="text-sm text-gray-600 leading-relaxed">
                                If you want to track a promotion, role transfer, or salary increase properly, please use the dedicated <strong className="font-semibold text-gray-900">Career Journey</strong> tab instead.
                            </p>
                            <p className="text-sm text-gray-900 font-medium mt-4">
                                Are you sure you want to unlock and edit {unlockPrompt === 'position' ? 'the position' : 'the salary amount'} directly?
                            </p>
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2.5">
                            <button type="button" onClick={() => setUnlockPrompt(null)} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors">
                                Cancel
                            </button>
                            <button type="button" onClick={() => {
                                setUnlockedFields(prev => new Set(prev).add(unlockPrompt));
                                setUnlockPrompt(null);
                            }} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 shadow-sm transition-colors">
                                Unlock Field
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ==========================================
// TAB: Documents
// ==========================================
function TabDocuments({ staff, onUpdate }: { staff: HRStaffMember, onUpdate: () => void }) {
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: 'cv_doc_url' | 'id_card_doc_url' | 'contract_doc_url') => {
        const file = e.target.files?.[0]
        if (!file) return;

        const fileExt = file.name.split('.').pop()
        const fileName = `${staff.id}/${fieldName}_${Date.now()}.${fileExt}`

        try {
            // Upload to storage
            const { error: uploadError } = await supabase.storage.from('hr-documents').upload(fileName, file)
            if (uploadError) throw uploadError

            // Get public URL
            const { data: publicUrlData } = supabase.storage.from('hr-documents').getPublicUrl(fileName)
            const publicUrl = publicUrlData.publicUrl

            // Update staff record
            const { error: updateError } = await supabase.from('hr_staff').update({ [fieldName]: publicUrl }).eq('id', staff.id)
            if (updateError) throw updateError

            onUpdate()
            alert('File uploaded successfully!')
        } catch (err) {
            console.error(err)
            alert('Failed to upload document')
        }
    }

    const DocumentCard = ({ title, fieldName, currentUrl }: { title: string, fieldName: any, currentUrl: string | null }) => (
        <div className="border border-gray-200 rounded-2xl p-5 flex flex-col items-center justify-center bg-gray-50/50 hover:bg-gray-50 transition-colors text-center relative overflow-hidden group">
            {currentUrl ? (
                <>
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3">
                        <BadgeCheck className="w-6 h-6" />
                    </div>
                    <h3 className="font-semibold text-gray-900">{title}</h3>
                    <p className="text-xs text-gray-500 mt-1">Uploaded and saved securely.</p>
                    <div className="mt-4 flex gap-2">
                        <a href={currentUrl} target="_blank" rel="noreferrer" className="inline-flex flex-1 justify-center items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition">
                            <ExternalLink className="w-3.5 h-3.5" /> View
                        </a>
                        <label className="inline-flex flex-1 justify-center items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition cursor-pointer">
                            <UploadCloud className="w-3.5 h-3.5" /> Update
                            <input type="file" className="hidden" onChange={e => handleUpload(e, fieldName)} />
                        </label>
                    </div>
                </>
            ) : (
                <>
                    <div className="w-12 h-12 bg-gray-200 text-gray-500 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <FileText className="w-6 h-6" />
                    </div>
                    <h3 className="font-semibold text-gray-900">{title}</h3>
                    <p className="text-xs text-gray-500 mt-1 mb-4">No document uploaded yet.</p>
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-xl text-sm font-medium hover:bg-indigo-100 transition cursor-pointer">
                        <UploadCloud className="w-4 h-4" />
                        Browse Files
                        <input type="file" className="hidden" onChange={e => handleUpload(e, fieldName)} />
                    </label>
                </>
            )}
        </div>
    )

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div>
                <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-500">Official Documents</h2>
                <p className="text-sm text-gray-500 mt-1">Manage physical files relevant to the employee's tenure.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <DocumentCard title="Curriculum Vitae (CV)" fieldName="cv_doc_url" currentUrl={staff.cv_doc_url} />
                <DocumentCard title="ID Verification" fieldName="id_card_doc_url" currentUrl={staff.id_card_doc_url} />
                <DocumentCard title="Signed Contract" fieldName="contract_doc_url" currentUrl={staff.contract_doc_url} />
            </div>
        </div>
    )
}

// ==========================================
// TAB: Career Journey (Timeline)
// ==========================================
function TabTimeline({ staff, roleHistory, salaryHistory, positions, onUpdate }: { staff: HRStaffMember, roleHistory: HRStaffRoleHistory[], salaryHistory: HRStaffSalaryHistory[], positions: HRPosition[], onUpdate: () => void }) {
    
    // Merge both histories into a unified timeline
    const timeline = useMemo(() => {
        const events: any[] = []
        roleHistory.forEach(r => events.push({ type: 'role', date: r.effective_date, data: r }))
        salaryHistory.forEach(s => events.push({ type: 'salary', date: s.effective_date, data: s }))
        // Add start date as first event
        if (staff.start_date) events.push({ type: 'start', date: staff.start_date, data: { text: 'Started employment' } })
        
        return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }, [roleHistory, salaryHistory, staff.start_date])

    const handleAddSalary = async () => {
        // very basic prompt for demo purposes, ideally a modal
        const amount = prompt('Enter new salary amount (VND):')
        if (!amount) return
        try {
            const { error } = await supabase.from('hr_staff_salary_history').insert({
                staff_id: staff.id,
                new_amount: parseInt(amount, 10),
                previous_amount: staff.salary_amount || 0,
                salary_type: staff.salary_type,
                effective_date: new Date().toISOString().split('T')[0]
            })
            if (error) throw error
            // Update current salary
            await supabase.from('hr_staff').update({ salary_amount: parseInt(amount, 10) }).eq('id', staff.id)
            onUpdate()
        } catch (err) {
            console.error(err); alert('failed to add salary change')
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-500">Career Journey</h2>
                    <p className="text-sm text-gray-500 mt-1">Timeline of salary increases and role promotions.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleAddSalary} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-semibold hover:bg-purple-100 transition">
                        <Plus className="w-3.5 h-3.5" /> Salary Update
                    </button>
                    {/* Add Promotion button could also go here */}
                </div>
            </div>

            <div className="relative pl-6 border-l-2 border-gray-100 space-y-8 mt-8">
                {timeline.length === 0 && <p className="text-sm text-gray-400">No events recorded.</p>}
                
                {timeline.map((event, i) => (
                    <div key={i} className="relative">
                        <div className={`absolute -left-[31px] w-4 h-4 rounded-full border-2 border-white flex items-center justify-center
                            ${event.type === 'start' ? 'bg-emerald-500' : event.type === 'salary' ? 'bg-purple-500' : 'bg-blue-500'}`} 
                        />
                        <div className="bg-white border border-gray-100 shadow-sm rounded-xl p-4">
                            <span className="text-xs font-semibold text-gray-400 bg-gray-50 px-2 py-1 rounded-md mb-2 inline-block">
                                {fmtDate(event.date)}
                            </span>
                            {event.type === 'start' && (
                                <p className="text-sm text-gray-900 font-medium">✨ Started employment at the company.</p>
                            )}
                            {event.type === 'salary' && (
                                <div>
                                    <p className="text-sm text-gray-900 font-medium tracking-tight">Salary Update <span className="text-gray-400 font-normal ml-1">({event.data.salary_type})</span></p>
                                    <div className="flex items-center gap-3 mt-1.5 font-mono text-sm">
                                        <span className="line-through text-gray-400">{fmtVND(event.data.previous_amount)}</span>
                                        <ArrowLeft className="w-3 h-3 text-gray-300 rotate-180" />
                                        <span className="text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-md">{fmtVND(event.data.new_amount)}</span>
                                    </div>
                                </div>
                            )}
                            {event.type === 'role' && (
                                <div>
                                    <p className="text-sm text-gray-900 font-medium tracking-tight">Role Promotion / Transfer</p>
                                    <p className="text-sm text-gray-600 mt-1">
                                        Moved from <strong>{event.data.old_position?.name || 'Unknown'}</strong> to <strong className="text-blue-600">{event.data.new_position?.name || 'Unknown'}</strong>
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ==========================================
// TAB: Performance
// ==========================================
function TabPerformance({ staff, performances, onUpdate }: { staff: HRStaffMember, performances: HRStaffPerformance[], onUpdate: () => void }) {
    
    // Setup chart data
    const chartData = useMemo(() => {
        return [...performances].reverse().map(p => ({
            date: fmtDate(p.review_date),
            rating: p.rating,
            rawDate: p.review_date
        }))
    }, [performances])

    const handleAddReview = async () => {
        const ratingStr = prompt('Enter an overall rating (1-5):')
        if (!ratingStr) return;
        const rating = parseInt(ratingStr, 10);
        if (rating < 1 || rating > 5) return alert('Rating must be between 1 and 5.')
        const notes = prompt('Enter review notes:')
        try {
            const { error } = await supabase.from('hr_staff_performance').insert({
                staff_id: staff.id,
                review_date: new Date().toISOString().split('T')[0],
                rating: rating,
                notes: notes,
                reviewer_name: 'Admin'
            })
            if (error) throw error
            onUpdate()
        } catch (err) {
            console.error(err); alert('Failed to add review')
        }
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-500">Performance Tracking</h2>
                    <p className="text-sm text-gray-500 mt-1">Monitor growth, past reviews and key goals.</p>
                </div>
                <button onClick={handleAddReview} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition">
                    <Plus className="w-3.5 h-3.5" /> Add Review
                </button>
            </div>

            {/* CHART */}
            {chartData.length > 0 ? (
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} dy={10} />
                            <YAxis domain={[0, 5]} ticks={[1,2,3,4,5]} tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                            <RechartsTooltip 
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                cursor={{ stroke: '#10B981', strokeWidth: 1, strokeDasharray: '4 4' }}
                            />
                            <Line 
                                type="monotone" 
                                dataKey="rating" 
                                stroke="#10B981" 
                                strokeWidth={3} 
                                dot={{ fill: '#10B981', strokeWidth: 2, r: 4, stroke: '#fff' }} 
                                activeDot={{ r: 6, strokeWidth: 0 }}
                                animationDuration={1000}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="bg-gray-50 border border-gray-100 border-dashed rounded-2xl p-8 text-center">
                    <p className="text-sm text-gray-400">Not enough data to display trend chart. Add a review!</p>
                </div>
            )}

            {/* REVIEW LIST */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {performances.map(p => (
                    <div key={p.id} className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition">
                        <div className="flex items-center justify-between mb-3 border-b border-gray-50 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">{p.rating}</div>
                                <div>
                                    <h4 className="text-sm font-bold text-gray-900">{fmtDate(p.review_date)}</h4>
                                    <p className="text-xs text-gray-500">By {p.reviewer_name || 'System'}</p>
                                </div>
                            </div>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed italic border-l-2 border-emerald-200 pl-3">
                            "{p.notes || 'No specific notes provided for this review segment.'}"
                        </p>
                    </div>
                ))}
            </div>
        </div>
    )
}
