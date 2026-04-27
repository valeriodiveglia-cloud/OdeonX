'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import {
    ArrowLeft, User, FileText, Activity, TrendingUp, Save, UploadCloud, ExternalLink,
    Calendar, Building2, Briefcase, Plus, Loader2, Trash2, BadgeCheck, Lock, Unlock,
    ChevronLeft, ChevronRight, Pencil, AlertTriangle, CalendarDays, X, CheckCircle, Clock, AlertCircle, Settings, NotebookPen
} from 'lucide-react'
import { HRStaffMember, HRDepartment, HRPosition, HRStaffRoleHistory, HRStaffPerformance, HRStaffSalaryHistory, EmploymentType, SalaryType, StaffStatus, HRRatingCategory, HRStaffFine, HRDisciplinaryCatalog, HRStaffDocument } from '@/types/human-resources'
import PerformanceModal, { computePeriodLabel } from '@/components/human-resources/PerformanceModal'
import SalaryModal from '@/components/human-resources/SalaryModal'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'
import { useSettings } from '@/contexts/SettingsContext'

// === HELPERS ===
const fmtVND = (n: number) => new Intl.NumberFormat('en-US').format(n || 0)
// Removed static fmtDate, will define inside component

// === TABS CONFIG ===
const TABS = [
    { id: 'profile', label: 'Profile & Contract', icon: User, color: 'text-blue-600', activeBg: 'bg-blue-50 text-blue-700' },
    { id: 'documents', label: 'Documents', icon: FileText, color: 'text-indigo-600', activeBg: 'bg-indigo-50 text-indigo-700' },
    { id: 'timeline', label: 'Career Journey', icon: Activity, color: 'text-purple-600', activeBg: 'bg-purple-50 text-purple-700' },
    { id: 'performance', label: 'Performance', icon: TrendingUp, color: 'text-emerald-600', activeBg: 'bg-emerald-50 text-emerald-700' },
    { id: 'disciplinary', label: 'Disciplinary', icon: NotebookPen, color: 'text-orange-600', activeBg: 'bg-orange-50 text-orange-700' },
] as const;
type TabId = typeof TABS[number]['id'];

// === MAIN PAGE ===
export default function StaffDetailPage() {
    const { id } = useParams() as { id: string }
    const router = useRouter()

    const { currency, language } = useSettings()
    const fmtDate = useCallback((d: string | null) => d ? new Date(d).toLocaleDateString('en-GB') : '-', [])

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
    const [allCategories, setAllCategories] = useState<HRRatingCategory[]>([])
    const [documents, setDocuments] = useState<HRStaffDocument[]>([])
    const [loggedUserName, setLoggedUserName] = useState<string>('')

    const fetchAll = useCallback(async () => {
        if (!id) return;
        setLoading(true)
        try {
            const [staffRes, deptsRes, posRes, roleReq, salReq, perfReq, branchesReq, catReq, docsReq] = await Promise.all([
                supabase.from('hr_staff').select('*, hr_departments(*), hr_positions(*), hr_staff_branches(*)').eq('id', id).single(),
                supabase.from('hr_departments').select('*').order('sort_order'),
                supabase.from('hr_positions').select('*').order('sort_order'),
                supabase.from('hr_staff_role_history').select('*, old_position:hr_positions!old_position_id(*), new_position:hr_positions!new_position_id(*)').eq('staff_id', id).order('effective_date', { ascending: false }),
                supabase.from('hr_staff_salary_history').select(`
                    *,
                    previous_position:hr_positions!hr_staff_salary_history_previous_position_id_fkey(name),
                    new_position:hr_positions!hr_staff_salary_history_new_position_id_fkey(name)
                `).eq('staff_id', id).order('effective_date', { ascending: false }),
                supabase.from('hr_staff_performance').select('*').eq('staff_id', id).order('review_date', { ascending: false }),
                supabase.from('provider_branches').select('id, name').order('name'),
                supabase.from('hr_rating_categories').select('*').order('sort_order'),
                supabase.from('hr_staff_documents').select('*').eq('staff_id', id).order('uploaded_at', { ascending: false })
            ])
            if (staffRes.data) setStaff(staffRes.data as any)
            if (deptsRes.data) setDepartments(deptsRes.data)
            if (posRes.data) setPositions(posRes.data)
            if (roleReq.data) setRoleHistory(roleReq.data)
            if (salReq.data) setSalaryHistory(salReq.data)
            if (perfReq.data) setPerformances(perfReq.data)
            if (branchesReq.data) setProviderBranches(branchesReq.data)
            if (catReq.data) setAllCategories(catReq.data)
            if (docsReq.data) setDocuments(docsReq.data)
        } catch (err) {
            console.error('Error fetching staff data', err)
        }
        setLoading(false)
    }, [id])

    useEffect(() => {
        let isMounted = true
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user && isMounted) {
                supabase.from('app_accounts').select('name').eq('user_id', data.user.id).single()
                    .then(res => {
                        if (isMounted) setLoggedUserName(res.data?.name || data.user.user_metadata?.full_name || '')
                    })
            }
        })
        return () => { isMounted = false }
    }, [])

    useEffect(() => { fetchAll() }, [fetchAll])

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center"><CircularLoader /></div>
    }

    if (!staff) {
        return (
            <div className="min-h-screen p-8 text-center text-white">
                <p>Staff member not found.</p>
                <Link href="/human-resources/management/staff" className="mt-4 text-blue-400 hover:underline">Go back</Link>
            </div>
        )
    }

    return (
        <div className="min-h-screen text-gray-100 flex flex-col">
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
                        {activeTab === 'documents' && <TabDocuments staff={staff} documents={documents} onUpdate={fetchAll} />}
                        {activeTab === 'timeline' && <TabTimeline staff={staff} roleHistory={roleHistory} salaryHistory={salaryHistory} positions={positions} departments={departments} loggedUserName={loggedUserName} onUpdate={fetchAll} />}
                        {activeTab === 'performance' && <TabPerformance staff={staff} performances={performances} onUpdate={fetchAll} allCategories={allCategories} />}
                        {activeTab === 'disciplinary' && <TabDisciplinary staff={staff} />}
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
    const [isEditing, setIsEditing] = useState(false)

    useEffect(() => {
        setFormData({ ...staff })
        setSelectedBranches((staff as any).hr_staff_branches?.map((b: any) => b.branch_id) || [])
        
        if (staff.salary_amount) {
            setDisplaySalary(staff.salary_amount.toLocaleString('en-US', { maximumFractionDigits: 2 }))
        } else {
            setDisplaySalary('')
        }
    }, [staff])

    const handleChange = (field: keyof HRStaffMember | 'salary_amount', val: any) => {
        setFormData(p => {
            const newData = { ...p, [field]: val };
            if (field === 'employment_type') {
                if (val === 'part_time') newData.salary_type = 'hourly';
                if (val === 'full_time') newData.salary_type = 'fixed';
            }
            return newData;
        })
    }
    
    const handleSave = async () => {
        setSaving(true)
        try {
            const { hr_staff_branches, hr_departments, hr_positions, ...updateData } = formData as any;
            
            // Sanitize empty strings to null for date and relation fields
            const nullifyIfEmpty = (field: string) => {
                if (updateData[field] === '') updateData[field] = null;
            }
            nullifyIfEmpty('start_date');
            nullifyIfEmpty('contract_signing_date');
            nullifyIfEmpty('contract_expiration_date');
            nullifyIfEmpty('probation_end_date');
            nullifyIfEmpty('department_id');
            nullifyIfEmpty('position_id');

            const { error } = await supabase.from('hr_staff').update(updateData).eq('id', staff.id)
            if (error) throw error

            await supabase.from('hr_staff_branches').delete().eq('staff_id', staff.id)
            if (selectedBranches.length > 0) {
                const rows = selectedBranches.map(branch_id => ({ staff_id: staff.id, branch_id }))
                await supabase.from('hr_staff_branches').insert(rows)
            }

            onUpdate()
            setIsEditing(false)
        } catch (err) {
            console.error(err)
            alert('Failed to update details')
        }
        setSaving(false)
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-500">General Information</h2>
                    <p className="text-sm text-gray-500 mt-1">Basic contact and position details.</p>
                </div>
                <button 
                    onClick={() => {
                        if (isEditing) {
                            // Reset changes if cancelling
                            setFormData({ ...staff })
                            setSelectedBranches((staff as any).hr_staff_branches?.map((b: any) => b.branch_id) || [])
                            if (staff.salary_amount) setDisplaySalary(staff.salary_amount.toLocaleString('en-US', { maximumFractionDigits: 2 }))
                            else setDisplaySalary('')
                        }
                        setIsEditing(!isEditing)
                    }} 
                    className={`p-2 rounded-xl border transition-all ${isEditing ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                    title={isEditing ? "Cancel Editing" : "Enable Editing"}
                >
                    <Pencil className="w-5 h-5" />
                </button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Full Name</label>
                    <input disabled={!isEditing} value={formData.full_name || ''} onChange={e => handleChange('full_name', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" />
                </div>
                <div>
                     <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Status</label>
                     <select disabled={!isEditing} value={formData.status || 'active'} onChange={e => handleChange('status', e.target.value)}
                         className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed">
                         <option value="active">Active</option>
                         <option value="inactive">Inactive</option>
                         <option value="terminated">Terminated</option>
                     </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phone</label>
                    <input disabled={!isEditing} value={formData.phone || ''} onChange={e => handleChange('phone', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email</label>
                    <input disabled={!isEditing} type="email" value={formData.email || ''} onChange={e => handleChange('email', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Department</label>
                    <select disabled={!isEditing} value={formData.department_id || ''} onChange={e => handleChange('department_id', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed">
                        <option value="">None</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Position</label>
                    <select disabled={!isEditing} value={formData.position_id || ''} onChange={e => handleChange('position_id', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed">
                        <option value="">None</option>
                        {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Start Date</label>
                    <input disabled={!isEditing} type="date" value={formData.start_date || ''} onChange={e => {
                        const newDate = e.target.value;
                        handleChange('start_date', newDate);
                        if (newDate && formData.probation_months && formData.probation_months > 0) {
                            const d = new Date(newDate);
                            d.setMonth(d.getMonth() + formData.probation_months);
                            d.setDate(d.getDate() - 1);
                            handleChange('probation_end_date', d.toISOString().split('T')[0]);
                        }
                    }}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Probation Time (Months)</label>
                    <input disabled={!isEditing} type="number" min="0" value={formData.probation_months ?? ''} onChange={e => {
                        const m = parseInt(e.target.value);
                        handleChange('probation_months', isNaN(m) ? 0 : m);
                        if (formData.start_date && !isNaN(m) && m > 0) {
                            const d = new Date(formData.start_date);
                            d.setMonth(d.getMonth() + m);
                            d.setDate(d.getDate() - 1);
                            handleChange('probation_end_date', d.toISOString().split('T')[0]);
                        }
                    }}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Probation End Date</label>
                    <input disabled={!isEditing} type="date" value={formData.probation_end_date || ''} onChange={e => handleChange('probation_end_date', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Probation Salary (%)</label>
                    <div className="relative">
                        <input disabled={!isEditing} type="number" min="0" max="100" value={formData.probation_salary_pct ?? ''} onChange={e => handleChange('probation_salary_pct', parseFloat(e.target.value) || 100)}
                            className="w-full px-3 py-2 pr-8 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Employment Type</label>
                    <select disabled={!isEditing} value={formData.employment_type || 'full_time'} onChange={e => handleChange('employment_type', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed">
                        <option value="full_time">Full-time</option>
                        <option value="part_time">Part-time</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                        Gross Salary (VND) <span className="lowercase text-gray-400">{formData.employment_type === 'full_time' ? '/month' : '/hour'}</span>
                    </label>
                    <input type="text" disabled={!isEditing} value={displaySalary} 
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
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:bg-gray-100 disabled:cursor-not-allowed" />
                </div>
            </div>

            <hr className="border-gray-100" />

            <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Assigned Branches</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {branches.map(branch => (
                        <label key={branch.id} className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${selectedBranches.includes(branch.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200'} ${isEditing ? 'cursor-pointer hover:bg-gray-50' : 'opacity-70 cursor-not-allowed'}`}>
                            <input type="checkbox" disabled={!isEditing} className="rounded text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Contract Signing Date</label>
                    <input disabled={!isEditing} type="date" value={formData.contract_signing_date || ''} onChange={e => handleChange('contract_signing_date', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Contract Expiration Date</label>
                    <input disabled={!isEditing} type="date" value={formData.contract_expiration_date || ''} onChange={e => handleChange('contract_expiration_date', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" />
                </div>
            </div>

            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 mt-5">Notes</label>
                <textarea disabled={!isEditing} rows={3} value={formData.notes || ''} onChange={e => handleChange('notes', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" placeholder="Internal notes..."></textarea>
            </div>

            {isEditing && (
                <div className="pt-4 flex justify-end">
                    <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                    </button>
                </div>
            )}
        </div>
    )
}

// ==========================================
// TAB: Documents
// ==========================================
import DocumentUploadModal from '@/components/human-resources/DocumentUploadModal'

function TabDocuments({ staff, documents, onUpdate }: { staff: HRStaffMember, documents: HRStaffDocument[], onUpdate: () => void }) {
    const [uploadModalOpen, setUploadModalOpen] = useState(false)

    const handleDelete = async (docId: string, fileUrl: string) => {
        if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) return
        
        try {
            // Delete from storage
            const urlPath = new URL(fileUrl).pathname
            const segments = urlPath.split('/')
            // The file path is everything after hr_documents bucket name
            const bucketIndex = segments.indexOf('hr_documents')
            if (bucketIndex !== -1) {
                const filePath = segments.slice(bucketIndex + 1).join('/')
                await supabase.storage.from('hr_documents').remove([filePath])
            }

            // Delete from DB
            const { error } = await supabase.from('hr_staff_documents').delete().eq('id', docId)
            if (error) throw error
            
            onUpdate()
        } catch (err) {
            console.error('Error deleting document', err)
            alert('Failed to delete document')
        }
    }

    const getCategoryColor = (category: string) => {
        const colors: Record<string, string> = {
            'CV': 'bg-blue-100 text-blue-700 border-blue-200',
            'ID Card': 'bg-emerald-100 text-emerald-700 border-emerald-200',
            'Contract': 'bg-purple-100 text-purple-700 border-purple-200',
            'Medical': 'bg-rose-100 text-rose-700 border-rose-200',
            'Certification': 'bg-amber-100 text-amber-700 border-amber-200',
            'Other': 'bg-gray-100 text-gray-700 border-gray-200',
        }
        return colors[category] || colors['Other']
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-500">Official Documents</h2>
                    <p className="text-sm text-gray-500 mt-1">Manage physical files relevant to the employee's tenure.</p>
                </div>
                <button onClick={() => setUploadModalOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow hover:shadow-lg">
                    <Plus className="w-4 h-4" /> Add Document
                </button>
            </div>
            
            {documents.length === 0 ? (
                <div className="border border-dashed border-gray-200 rounded-2xl p-12 text-center bg-gray-50/50">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <FileText className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-gray-900 font-medium text-lg">No documents found</h3>
                    <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">Upload contracts, ID cards, medical checkups, and other important files here.</p>
                    <button onClick={() => setUploadModalOpen(true)} className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                        <UploadCloud className="w-4 h-4" /> Upload First Document
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {documents.map(doc => (
                        <div key={doc.id} className="border border-gray-200 rounded-2xl p-5 flex flex-col bg-white shadow-sm hover:shadow-md transition-shadow relative group">
                            <button onClick={() => handleDelete(doc.id, doc.file_url)} className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                                <Trash2 className="w-4 h-4" />
                            </button>
                            
                            <div className="flex items-start gap-4 mb-4">
                                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 leading-tight pr-6 line-clamp-2">{doc.document_name}</h3>
                                    <span className={`inline-flex mt-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getCategoryColor(doc.document_category)}`}>
                                        {doc.document_category}
                                    </span>
                                </div>
                            </div>
                            
                            <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between">
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {fmtDate(doc.uploaded_at)}
                                </span>
                                <a href={doc.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-medium transition">
                                    <ExternalLink className="w-3.5 h-3.5" /> View
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <DocumentUploadModal 
                open={uploadModalOpen} 
                onClose={() => setUploadModalOpen(false)} 
                staffId={staff.id} 
                onSuccess={onUpdate} 
            />
        </div>
    )
}

// ==========================================
// TAB: Career Journey (Timeline)
// ==========================================
function TabTimeline({ staff, roleHistory, salaryHistory, positions, departments, loggedUserName, onUpdate }: { staff: HRStaffMember, roleHistory: HRStaffRoleHistory[], salaryHistory: HRStaffSalaryHistory[], positions: HRPosition[], departments: HRDepartment[], loggedUserName: string, onUpdate: () => void }) {
    
    const [modalOpen, setModalOpen] = useState(false)
    const [saving, setSaving] = useState(false)

    // Merge both histories into a unified timeline
    const timeline = useMemo(() => {
        const events: any[] = []
        roleHistory.forEach(r => events.push({ type: 'role', date: r.effective_date, data: r }))
        salaryHistory.forEach(s => events.push({ type: 'salary', date: s.effective_date, data: s }))
        // Add start date as first event
        if (staff.start_date) events.push({ type: 'start', date: staff.start_date, data: { text: 'Started employment' } })
        
        return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }, [roleHistory, salaryHistory, staff.start_date])

    const handleSaveSalary = async (payload: Partial<HRStaffSalaryHistory>) => {
        setSaving(true)
        try {
            const { error } = await supabase.from('hr_staff_salary_history').insert([payload])
            if (error) throw error

            // Update hr_staff main record
            const staffUpdates: Partial<HRStaffMember> = {
                salary_amount: payload.new_amount,
                salary_type: payload.salary_type
            }
            if (payload.new_department_id) staffUpdates.department_id = payload.new_department_id
            if (payload.new_position_id) {
                staffUpdates.position_id = payload.new_position_id
                const newPos = positions.find(p => p.id === payload.new_position_id)
                if (newPos) staffUpdates.position = newPos.name
            }
            
            await supabase.from('hr_staff').update(staffUpdates).eq('id', payload.staff_id)
            
            // Also add role history if changed
            if (payload.new_position_id || payload.new_department_id) {
                await supabase.from('hr_staff_role_history').insert({
                    staff_id: payload.staff_id,
                    effective_date: payload.effective_date,
                    old_department_id: payload.previous_department_id,
                    old_position_id: payload.previous_position_id,
                    new_department_id: payload.new_department_id,
                    new_position_id: payload.new_position_id,
                    reason: 'Promotion logged via Salary/Role change'
                })
            }

            setModalOpen(false)
            onUpdate()
        } catch (err) {
            console.error('Error saving salary record:', err)
            alert('Failed to save record.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-500">Career Journey</h2>
                    <p className="text-sm text-gray-500 mt-1">Timeline of gross salary increases and role promotions.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setModalOpen(true)} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all whitespace-nowrap">
                        <Plus className="w-4 h-4" /> Record Change
                    </button>
                </div>
            </div>

            <SalaryModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSave={handleSaveSalary}
                entry={null}
                staffList={[staff]}
                departments={departments}
                positions={positions}
                saving={saving}
                loggedUserName={loggedUserName}
                preselectedStaffId={staff.id}
            />

            <div className="relative pl-6 border-l-2 border-gray-100 space-y-8 mt-8">
                {timeline.length === 0 && <p className="text-sm text-gray-400">No events recorded.</p>}
                
                {timeline.map((event, i) => (
                    <div key={i} className="relative">
                        <div className={`absolute -left-[31px] w-4 h-4 rounded-full border-2 border-white flex items-center justify-center
                            ${event.type === 'start' ? 'bg-emerald-500' : event.type === 'salary' ? 'bg-blue-500' : 'bg-blue-500'}`} 
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
                                    <p className="text-sm text-gray-900 font-medium tracking-tight">
                                        {event.data.record_type === 'promotion' ? 'Promotion & Gross Salary Change' : 'Gross Salary Change'}
                                        <span className="text-gray-400 font-normal ml-1">
                                            ({event.data.previous_salary_type && event.data.previous_salary_type !== event.data.salary_type 
                                                ? `${event.data.previous_salary_type === 'fixed' ? 'Full-Time' : 'Part-Time'} → ${event.data.salary_type === 'fixed' ? 'Full-Time' : 'Part-Time'}` 
                                                : (event.data.salary_type === 'fixed' ? 'Full-Time' : 'Part-Time')})
                                        </span>
                                    </p>
                                    {event.data.record_type === 'promotion' && (
                                        <p className="text-xs text-blue-600 mt-1.5 mb-2.5 flex items-center gap-1.5 font-medium bg-blue-50 w-fit px-2.5 py-1 rounded-md border border-blue-100">
                                            {event.data.previous_position?.name || 'Unknown'} 
                                            <ArrowLeft className="w-3 h-3 rotate-180" />
                                            {event.data.new_position?.name || 'Unknown'}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-3 mt-1.5 font-mono text-sm">
                                        <span className="line-through text-gray-400">{fmtVND(event.data.previous_amount)}</span>
                                        <ArrowLeft className="w-3 h-3 text-gray-300 rotate-180" />
                                        <span className="text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-md">{fmtVND(event.data.new_amount)}</span>
                                        {event.data.increase_type === 'percentage' && event.data.increase_value && (
                                            <span className="text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded">+{event.data.increase_value}%</span>
                                        )}
                                        {event.data.previous_salary_type && event.data.previous_salary_type !== event.data.salary_type && (
                                            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Type Changed</span>
                                        )}
                                    </div>
                                    {event.data.reason && <p className="text-xs text-gray-500 mt-2 italic">"{event.data.reason}"</p>}
                                </div>
                            )}
                            {event.type === 'role' && (
                                <div>
                                    <p className="text-sm text-gray-900 font-medium tracking-tight">Role Transfer (Legacy)</p>
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
function TabPerformance({ staff, performances, onUpdate, allCategories }: { staff: HRStaffMember, performances: HRStaffPerformance[], onUpdate: () => void, allCategories: HRRatingCategory[] }) {
    const [modalOpen, setModalOpen] = useState(false);
    const [editingReview, setEditingReview] = useState<HRStaffPerformance | null>(null);
    const [saving, setSaving] = useState(false);

    // Setup chart data
    const chartData = useMemo(() => {
        return [...performances].reverse().map(p => ({
            date: fmtDate(p.review_date),
            rating: p.rating,
            rawDate: p.review_date
        }))
    }, [performances])

    const handleSaveReview = async (data: any) => {
        setSaving(true);
        try {
            if (editingReview) {
                const { error } = await supabase.from('hr_staff_performance').update(data).eq('id', editingReview.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('hr_staff_performance').insert([data]);
                if (error) throw error;
            }
            onUpdate();
            setModalOpen(false);
        } catch (err) {
            console.error(err);
            alert('Failed to save review');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-500">Performance Tracking</h2>
                    <p className="text-sm text-gray-500 mt-1">Monitor growth, past reviews and key goals.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => { setEditingReview(null); setModalOpen(true); }} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all whitespace-nowrap">
                        <Plus className="w-4 h-4" /> Add Review
                    </button>
                </div>
            </div>
            
            <PerformanceModal 
                open={modalOpen} 
                onClose={() => setModalOpen(false)} 
                onSave={handleSaveReview}
                review={editingReview}
                staffList={[staff]}
                allCategories={allCategories}
                saving={saving}
                preselectedStaffId={staff.id}
            />

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
                    <div key={p.id} onClick={() => { setEditingReview(p); setModalOpen(true); }} className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition cursor-pointer hover:border-emerald-200 group">
                        <div className="flex items-center justify-between mb-3 border-b border-gray-50 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">{p.rating}</div>
                                <div>
                                    <h4 className="text-sm font-bold text-gray-900 group-hover:text-emerald-700 transition-colors">
                                        {fmtDate(p.review_date)} <span className="text-xs font-normal text-gray-400 ml-1">({p.period})</span>
                                    </h4>
                                    <p className="text-xs text-gray-500">By {p.reviewer_name || 'System'}</p>
                                </div>
                            </div>
                            <Pencil className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 transition-colors" />
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

// ==========================================
// TAB: Disciplinary / Fines
// ==========================================

function TabDisciplinary({ staff }: { staff: HRStaffMember }) {
    const [fines, setFines] = useState<HRStaffFine[]>([])
    const [catalog, setCatalog] = useState<HRDisciplinaryCatalog[]>([])
    const [loading, setLoading] = useState(false)
    const [modalOpen, setModalOpen] = useState(false)
    const [editingNode, setEditingNode] = useState<HRStaffFine | null>(null)
    
    const now = new Date()
    const [year, setYear] = useState<number>(now.getFullYear())
    const [month, setMonth] = useState<number>(now.getMonth())

    // Logged in user info for 'notified_by'
    const [loggedUserName, setLoggedUserName] = useState<string>('')

    useEffect(() => {
        let isMounted = true
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user && isMounted) {
                supabase.from('app_accounts').select('name').eq('user_id', data.user.id).single()
                    .then(res => {
                        if (isMounted) setLoggedUserName(res.data?.name || data.user.user_metadata?.full_name || '')
                    })
            }
        })
        return () => { isMounted = false }
    }, [])

    const monthLabel = new Date(year, month).toLocaleString('en-US', { month: 'long', year: 'numeric' })
    const monthInputValue = `${year}-${String(month + 1).padStart(2, '0')}`

    const fetchFines = useCallback(async () => {
        setLoading(true)
        const endDate = new Date(year, month + 1, 0) // last day
        
        try {
            const [finesRes, catRes] = await Promise.all([
                supabase.from('hr_staff_fines')
                    .select('*')
                    .eq('staff_id', staff.id)
                    .gte('date', `${year}-${String(month + 1).padStart(2, '0')}-01`)
                    .lte('date', `${year}-${String(month + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`)
                    .order('date', { ascending: false }),
                supabase.from('hr_disciplinary_catalog')
                    .select('*')
                    .order('infraction_name', { ascending: true })
            ])
                
            if (finesRes.error) throw finesRes.error
            if (catRes.error) throw catRes.error
            setFines(finesRes.data || [])
            
            // Filter catalog based on applicability
            const allCatalog = (catRes.data as HRDisciplinaryCatalog[]) || []
            const filteredCatalog = allCatalog.filter(c => {
                if (!c.applicability_type || c.applicability_type === 'global') return true;
                if (c.applicability_type === 'department' && c.target_id === staff.department_id) return true;
                if (c.applicability_type === 'position' && c.target_id === staff.position_id) return true;
                return false;
            })
            
            setCatalog(filteredCatalog)
        } catch (err) {
            console.error('Error fetching fines/catalog', err)
        } finally {
            setLoading(false)
        }
    }, [staff.id, year, month])

    useEffect(() => {
        fetchFines()
    }, [fetchFines])

    function prevMonth() {
        setMonth(m => {
            if (m === 0) { setYear(y => y - 1); return 11 }
            return m - 1
        })
    }
    function nextMonth() {
        setMonth(m => {
            if (m === 11) { setYear(y => y + 1); return 0 }
            return m + 1
        })
    }
    function onPickMonth(val: string) {
        const [y, m] = val.split('-').map(Number)
        if (Number.isInteger(y) && Number.isInteger(m)) {
            setYear(y); setMonth(m - 1);
        }
    }

    async function handleSave(formData: Partial<HRStaffFine>) {
        try {
            if (editingNode) {
                const { error } = await supabase.from('hr_staff_fines').update(formData).eq('id', editingNode.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('hr_staff_fines').insert([{
                    ...formData,
                    staff_id: staff.id
                }])
                if (error) throw error
            }
            fetchFines()
            setModalOpen(false)
        } catch (err) {
            console.error(err)
            alert('Failed to save fine')
        }
    }
    
    async function handleDelete(id: string) {
        if (!window.confirm('Are you sure you want to delete this fine?')) return
        try {
            const { error } = await supabase.from('hr_staff_fines').delete().eq('id', id)
            if (error) throw error
            fetchFines()
        } catch (err) {
            console.error(err)
            alert('Failed to delete fine')
        }
    }

    async function handleStatusChange(id: string, newStatus: string) {
        try {
            setFines(prev => prev.map(f => f.id === id ? { ...f, status: newStatus as any } : f))
            const { error } = await supabase.from('hr_staff_fines').update({ status: newStatus }).eq('id', id)
            if (error) throw error
        } catch(err) {
            console.error(err)
            alert('Failed to update status')
            fetchFines()
        }
    }

    const totalAmount = fines.reduce((sum, f) => sum + Number(f.amount || 0), 0)

    const baseBtn = 'flex items-center gap-1 text-gray-500 hover:text-gray-900 transition'

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-500">Disciplinary Actions & Fines</h2>
                    <p className="text-sm text-gray-500 mt-1">Record infractions and associated deductions.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => { setEditingNode(null); setModalOpen(true); }} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all whitespace-nowrap">
                        <Plus className="w-4 h-4" /> Add Disciplinary Action
                    </button>
                </div>
            </div>

            {/* Month Nav */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between">
                <button type="button" onClick={prevMonth} className={baseBtn}>
                    <ChevronLeft className="w-4 h-4" /> <span>Previous</span>
                </button>
                <div className="flex items-center gap-2 font-semibold text-gray-900">
                    <span>{monthLabel}</span>
                    <div className="relative w-5 h-5 group">
                        <CalendarDays className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors cursor-pointer" />
                        <input type="month" value={monthInputValue} onChange={e => onPickMonth(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                    </div>
                </div>
                <button type="button" onClick={nextMonth} className={baseBtn}>
                    <span>Next</span> <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Table */}
            <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs font-semibold uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-3 border-r border-gray-100">Date</th>
                                <th className="px-4 py-3 border-r border-gray-100">Infraction</th>
                                <th className="px-4 py-3 border-r border-gray-100">Notified By</th>
                                <th className="px-4 py-3 border-r border-gray-100">Source</th>
                                <th className="px-4 py-3 border-r border-gray-100 text-center">Status</th>
                                <th className="px-4 py-3 border-r border-gray-100 text-right">Amount (VND)</th>
                                <th className="px-4 py-3 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={7} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500 mx-auto" /></td></tr>
                            ) : fines.length === 0 ? (
                                <tr><td colSpan={7} className="text-center py-8 text-gray-400">No disciplinary actions recorded for this month.</td></tr>
                            ) : (
                                fines.map(f => (
                                    <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-900 font-medium">{fmtDate(f.date)}</td>
                                        <td className="px-4 py-3 border-r border-gray-100 max-w-xs truncate" title={f.infraction}>{f.infraction}</td>
                                        <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-600">{f.notified_by || '-'}</td>
                                        <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-600 capitalize">{(f.deduction_source || '-').replace('_', ' ')}</td>
                                        <td className="px-4 py-3 border-r border-gray-100 text-center">
                                            <select 
                                                value={f.status} 
                                                onChange={(e) => handleStatusChange(f.id, e.target.value)}
                                                className={`text-[10px] font-bold tracking-wider uppercase cursor-pointer rounded-full border px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-transparent hover:bg-white
                                                    ${f.status === 'paid' ? 'text-emerald-600 border-emerald-200' : 
                                                      f.status === 'waived' ? 'text-gray-600 border-gray-200' :
                                                      f.status === 'disputed' ? 'text-red-600 border-red-200' :
                                                      'text-amber-600 border-amber-200'}
                                                `}
                                            >
                                                <option value="pending">PENDING</option>
                                                <option value="paid">PAID</option>
                                                <option value="waived">WAIVED</option>
                                                <option value="disputed">DISPUTED</option>
                                            </select>
                                        </td>
                                        <td className="px-4 py-3 border-r border-gray-100 text-right font-mono font-medium text-orange-600">
                                            {fmtVND(f.amount)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button onClick={() => { setEditingNode(f); setModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit"><Pencil className="w-4 h-4" /></button>
                                                <button onClick={() => handleDelete(f.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {!loading && fines.length > 0 && (
                            <tfoot className="bg-gray-50 border-t border-gray-200 text-sm font-bold text-gray-900">
                                <tr>
                                    <td colSpan={5} className="px-4 py-3 text-right">Total Fines</td>
                                    <td className="px-4 py-3 text-right text-orange-600 font-mono">{fmtVND(totalAmount)}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
                            <h3 className="text-lg font-bold text-gray-900">{editingNode ? 'Edit Disciplinary Action' : 'Add Disciplinary Action'}</h3>
                            <button onClick={() => setModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            <FormFine 
                                initialData={editingNode} 
                                catalog={catalog}
                                loggedUserName={loggedUserName} 
                                onSave={handleSave} 
                                onCancel={() => setModalOpen(false)} 
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function FormFine({ initialData, catalog, loggedUserName, onSave, onCancel }: { initialData: HRStaffFine | null, catalog: HRDisciplinaryCatalog[], loggedUserName: string, onSave: (d: Partial<HRStaffFine>) => void, onCancel: () => void }) {
    const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0])
    const [infraction, setInfraction] = useState(initialData?.infraction || '')
    const [amount, setAmount] = useState(initialData?.amount || 0)
    const [notifiedBy, setNotifiedBy] = useState(initialData?.notified_by || loggedUserName)
    const [deductionSource, setDeductionSource] = useState(initialData?.deduction_source || 'salary')
    const [displayAmount, setDisplayAmount] = useState(initialData?.amount ? initialData.amount.toLocaleString('en-US') : '')
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        if (!initialData && !notifiedBy && loggedUserName) {
            setNotifiedBy(loggedUserName)
        }
    }, [loggedUserName, initialData, notifiedBy])

    function handleCatalogSelect(e: React.ChangeEvent<HTMLSelectElement>) {
        const val = e.target.value
        setInfraction(val)
        if (val) {
            const catItem = catalog.find(c => c.infraction_name === val)
            if (catItem) {
                setAmount(Number(catItem.default_amount))
                setDisplayAmount(Number(catItem.default_amount).toLocaleString('en-US'))
            }
        }
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!infraction || amount < 0 || !date) return
        setSubmitting(true)
        onSave({
            date,
            infraction,
            amount,
            notified_by: notifiedBy,
            deduction_source: deductionSource,
            // Only force 'pending' on new inserts. On edit, keep existing status so it isn't overwritten.
            status: initialData ? initialData.status : 'pending'
        })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Date <span className="text-red-500">*</span></label>
                    <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Deduction Source</label>
                    <select value={deductionSource} onChange={e => setDeductionSource(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="salary">Gross Salary Deduction</option>
                        <option value="service_charge">Service Charge Deduction</option>
                        <option value="cash">Direct Cash/Transfer</option>
                    </select>
                </div>
            </div>

            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Infraction <span className="text-red-500">*</span></label>
                <select required value={infraction} onChange={handleCatalogSelect} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="" disabled>Select an infraction...</option>
                    {catalog.map(c => (
                        <option key={c.id} value={c.infraction_name}>{c.infraction_name}</option>
                    ))}
                    {initialData && !catalog.find(c => c.infraction_name === initialData.infraction) && (
                        <option value={initialData.infraction}>{initialData.infraction} (Legacy/Manual)</option>
                    )}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">Selecting an infraction automatically sets the default fine amount.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Amount (VND) <span className="text-red-500">*</span></label>
                    <input type="text" required value={displayAmount} 
                        onChange={e => {
                            let val = e.target.value.replace(/[^0-9]/g, '');
                            if (val) {
                                setDisplayAmount(parseInt(val, 10).toLocaleString('en-US'))
                                setAmount(parseInt(val, 10))
                            } else {
                                setDisplayAmount('')
                                setAmount(0)
                            }
                        }}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Notified By</label>
                    <div className="flex items-center gap-2">
                        <input type="text" value={notifiedBy || ''} onChange={e => setNotifiedBy(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Name of person enforcing the fine" />
                    </div>
                </div>
            </div>
            {!notifiedBy && loggedUserName && (
                <div className="flex justify-end">
                    <button type="button" onClick={() => setNotifiedBy(loggedUserName)} className="px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-md text-xs font-medium hover:bg-blue-100 transition whitespace-nowrap">
                        Fill my name
                    </button>
                </div>
            )}

            <div className="pt-4 flex justify-end gap-2 border-t border-gray-100 mt-6">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition">Cancel</button>
                <button type="submit" disabled={submitting || !infraction || amount < 0} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {submitting ? 'Saving...' : 'Save Fine'}
                </button>
            </div>
        </form>
    )
}

