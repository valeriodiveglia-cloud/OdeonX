'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import {
    ArrowLeft, User, FileText, Activity, TrendingUp, Save, UploadCloud, ExternalLink,
    Calendar, Building2, Briefcase, Plus, Loader2, Trash2, BadgeCheck, Lock, Unlock,
    ChevronLeft, ChevronRight, Pencil, AlertTriangle, CalendarDays, X, CheckCircle, Clock, AlertCircle, Settings, NotebookPen, FileDown, Star, Package, ChevronDown, RefreshCw, Mail, Key, Flag, Award
} from 'lucide-react'
import { HRStaffMember, HRDepartment, HRPosition, HRStaffRoleHistory, HRStaffPerformance, HRStaffSalaryHistory, EmploymentType, SalaryType, StaffStatus, HRRatingCategory, HRStaffFine, HRDisciplinaryCatalog, HRStaffDocument, HRStaffContract, HRStaffAsset, HRStaffAssetStatus, HRStaffAssetHistory, HRAwardsCatalog, HRStaffAward, HRStaffWarning, WarningFlagType } from '@/types/human-resources'
import PerformanceModal, { computePeriodLabel, OVERALL_LABELS } from '@/components/human-resources/PerformanceModal'
import SalaryModal from '@/components/human-resources/SalaryModal'
import { saveAs } from 'file-saver'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'
import { useSettings } from '@/contexts/SettingsContext'
import { getVietnamBanks, VietnamBank } from '@/lib/vietnamBanks'

// === HELPERS ===
const fmtVND = (n: number) => new Intl.NumberFormat('en-US').format(n || 0)
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB') : '-'

const formatWarningReason = (reason: string, language: 'en' | 'vi') => {
    if (!reason) return ''
    const match = reason.match(/Automatic warning generated for accumulation of (\d+) yellow flags/i)
    if (match) {
        const count = match[1]
        return language === 'vi' 
            ? `Cảnh cáo tự động được tạo do tích lũy ${count} thẻ vàng`
            : `Automatic warning generated for accumulation of ${count} yellow flags`
    }
    const matchIt = reason.match(/Warning automatico generato per accumulo di (\d+) bandierine gialle/i)
    if (matchIt) {
        const count = matchIt[1]
        return language === 'vi'
            ? `Cảnh cáo tự động được tạo do tích lũy ${count} thẻ vàng`
            : `Automatic warning generated for accumulation of ${count} yellow flags`
    }
    return reason
}

// === TABS CONFIG ===
const TABS = [
    { id: 'profile', label: 'Profile', icon: User, color: 'text-blue-600', activeBg: 'bg-blue-50 text-blue-700' },
    { id: 'contract', label: 'Contract', icon: Briefcase, color: 'text-amber-600', activeBg: 'bg-amber-50 text-amber-700' },
    { id: 'documents', label: 'Documents', icon: FileText, color: 'text-indigo-600', activeBg: 'bg-indigo-50 text-indigo-700' },
    { id: 'assets', label: 'Assets', icon: Package, color: 'text-teal-600', activeBg: 'bg-teal-50 text-teal-700' },
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


    const [activeTab, setActiveTab] = useState<TabId>('profile')
    const [loading, setLoading] = useState(true)
    
    // Data
    const [staff, setStaff] = useState<HRStaffMember | null>(null)
    const [departments, setDepartments] = useState<HRDepartment[]>([])
    const [positions, setPositions] = useState<HRPosition[]>([])
    const [roleHistory, setRoleHistory] = useState<HRStaffRoleHistory[]>([])
    const [salaryHistory, setSalaryHistory] = useState<HRStaffSalaryHistory[]>([])
    const [performances, setPerformances] = useState<HRStaffPerformance[]>([])
    const [providerBranches, setProviderBranches] = useState<{id: string, name: string, city: string}[]>([])
    const [allCategories, setAllCategories] = useState<HRRatingCategory[]>([])
    const [documents, setDocuments] = useState<HRStaffDocument[]>([])
    const [assets, setAssets] = useState<HRStaffAsset[]>([])
    const [assetReturnModalOpen, setAssetReturnModalOpen] = useState(false)
    const [loggedUserName, setLoggedUserName] = useState<string>('')

    const [perfModalOpen, setPerfModalOpen] = useState(false)
    const [perfSaving, setPerfSaving] = useState(false)

    const [dismissalModalOpen, setDismissalModalOpen] = useState(false)
    const [dismissalSaving, setDismissalSaving] = useState(false)

    const [pendingResignation, setPendingResignation] = useState<{ staffId: string, effectiveDate: string, type: 'dismissal' | 'resignation' | 'rejection', reason: string, notes: string } | null>(null)
    const [exitReviewModalOpen, setExitReviewModalOpen] = useState(false)
    const [exitReviewSaving, setExitReviewSaving] = useState(false)

    const handleSavePerformance = async (data: any, decision?: 'confirm' | 'reject') => {
        setPerfSaving(true)
        try {
            const { error } = await supabase.from('hr_staff_performance').insert([data])
            if (error) throw error
            
            if (decision === 'reject') {
                setPerfModalOpen(false)
                setDismissalModalOpen(true)
            } else {
                setPerfModalOpen(false)
                await fetchAll()
            }
        } catch (err) {
            console.error(err)
            alert('Failed to save probation review')
        }
        setPerfSaving(false)
    }

    const [pendingResignData, setPendingResignData] = useState<{ staffId: string, effectiveDate: string, type: 'dismissal' | 'resignation' | 'rejection', reason: string, notes: string } | null>(null);

    const handleResign = async (data: { staffId: string, effectiveDate: string, type: 'dismissal' | 'resignation' | 'rejection', reason: string, notes: string }) => {
        // Verifica se lo staff ha degli asset assegnati o nel suo storico
        if (assets.length > 0) {
            setPendingResignData(data);
            setDismissalModalOpen(false);
            setAssetReturnModalOpen(true);
            return;
        }

        if (data.type === 'rejection') {
            setDismissalSaving(true)
            try {
                const { error: histErr } = await supabase.from('hr_staff_role_history').insert([{
                    staff_id: data.staffId,
                    effective_date: data.effectiveDate,
                    reason: `[REJECTION] ${data.reason}`,
                    notes: data.notes,
                    created_by: null
                }])
                if (histErr) throw histErr
                
                const { error: staffErr } = await supabase.from('hr_staff').update({ status: 'terminated' }).eq('id', data.staffId)
                if (staffErr) throw staffErr
                
                setDismissalModalOpen(false)
                router.push('/human-resources/management/staff')
            } catch (err: any) {
                console.error(err)
                alert('Failed to record rejection: ' + (err.message || JSON.stringify(err)))
            }
            setDismissalSaving(false)
            return
        }

        setPendingResignation(data)
        setDismissalModalOpen(false)
        setExitReviewModalOpen(true)
    }

    const confirmTerminationAfterAssets = async () => {
        if (!pendingResignData) return;
        
        const data = pendingResignData;
        setPendingResignData(null);
        setAssetReturnModalOpen(false);

        // Ricarica per allineare lo stato locale degli asset dopo il salvataggio
        await fetchAll();

        if (data.type === 'rejection') {
            setDismissalSaving(true)
            try {
                const { error: histErr } = await supabase.from('hr_staff_role_history').insert([{
                    staff_id: data.staffId,
                    effective_date: data.effectiveDate,
                    reason: `[REJECTION] ${data.reason}`,
                    notes: data.notes,
                    created_by: null
                }])
                if (histErr) throw histErr
                
                const { error: staffErr } = await supabase.from('hr_staff').update({ status: 'terminated' }).eq('id', data.staffId)
                if (staffErr) throw staffErr
                
                router.push('/human-resources/management/staff')
            } catch (err: any) {
                console.error(err)
                alert('Failed to record rejection: ' + (err.message || JSON.stringify(err)))
            }
            setDismissalSaving(false)
            return
        }

        setPendingResignation(data)
        setExitReviewModalOpen(true)
    }

    const handleExitReviewSave = async (reviewData: any) => {
        if (!pendingResignation) return
        setExitReviewSaving(true)
        try {
            // 1. Save performance review
            const reviewWithNote = { ...reviewData, notes: (reviewData.notes ? reviewData.notes + '\n\n' : '') + '[EXIT REVIEW]' };
            const { error: perfErr } = await supabase.from('hr_staff_performance').insert([reviewWithNote])
            if (perfErr) throw perfErr

            // 2. Save role history
            const { error: histErr } = await supabase.from('hr_staff_role_history').insert([{
                staff_id: pendingResignation.staffId,
                effective_date: pendingResignation.effectiveDate,
                reason: `[${pendingResignation.type.toUpperCase()}] ${pendingResignation.reason}`,
                notes: pendingResignation.notes,
                created_by: null
            }])
            if (histErr) throw histErr
            
            // 3. Update staff status
            const { error: staffErr } = await supabase.from('hr_staff').update({ status: 'terminated' }).eq('id', pendingResignation.staffId)
            if (staffErr) throw staffErr
            
            setExitReviewModalOpen(false)
            setPendingResignation(null)
            router.push('/human-resources/management/staff')
        } catch (err: any) {
            console.error(err)
            alert('Failed to record exit review & rejection: ' + (err.message || JSON.stringify(err)))
        }
        setExitReviewSaving(false)
    }

    const fetchAll = useCallback(async () => {
        if (!id) return;
        setLoading(true)
        try {
            const [staffRes, deptsRes, posRes, roleReq, salReq, perfReq, branchesReq, catReq, docsReq, assetsReq] = await Promise.all([
                supabase.from('hr_staff').select('*, hr_departments(*), hr_positions(*), hr_staff_branches(*), hr_staff_contracts(*)').eq('id', id).single(),
                supabase.from('hr_departments').select('*').order('sort_order'),
                supabase.from('hr_positions').select('*').order('sort_order'),
                supabase.from('hr_staff_role_history').select('*, old_position:hr_positions!old_position_id(*), new_position:hr_positions!new_position_id(*)').eq('staff_id', id).order('effective_date', { ascending: false }),
                supabase.from('hr_staff_salary_history').select(`
                    *,
                    previous_position:hr_positions!hr_staff_salary_history_previous_position_id_fkey(name),
                    new_position:hr_positions!hr_staff_salary_history_new_position_id_fkey(name)
                `).eq('staff_id', id).order('effective_date', { ascending: false }),
                supabase.from('hr_staff_performance').select('*').eq('staff_id', id).order('review_date', { ascending: false }),
                supabase.from('provider_branches').select('id, name, city').order('name'),
                supabase.from('hr_rating_categories').select('*').order('sort_order'),
                supabase.from('hr_staff_documents').select('*').eq('staff_id', id).order('uploaded_at', { ascending: false }),
                supabase.from('hr_staff_assets').select('*, hr_staff_asset_history(*)').eq('staff_id', id).order('created_at', { ascending: false })
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
            if (assetsReq.data) setAssets(assetsReq.data)
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
                <p>{language === 'vi' ? 'Không tìm thấy nhân viên.' : 'Staff member not found.'}</p>
                <Link href="/human-resources/management/staff" className="mt-4 text-blue-400 hover:underline">
                    {language === 'vi' ? 'Quay lại' : 'Go back'}
                </Link>
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
                                    {staff.position || (language === 'vi' ? 'Chưa có vị trí' : 'No Position')}
                                </span>
                                {(staff as any).hr_departments?.name && (
                                    <span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md border border-white/5">
                                        <Building2 className="w-3 h-3" />
                                        {(staff as any).hr_departments?.name}
                                    </span>
                                )}
                                {staff.status !== 'active' ? (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border
                                        ${staff.status === 'inactive' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                                          'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                                        {staff.status === 'inactive' ? (language === 'vi' ? 'NGỪNG HOẠT ĐỘNG' : 'INACTIVE') : (language === 'vi' ? 'ĐÃ THÔI VIỆC' : 'TERMINATED')}
                                    </span>
                                ) : staff.probation_end_date && new Date(staff.probation_end_date).getTime() > Date.now() ? (() => {
                                    const isConfirmed = performances.some(p => p.period === 'Probation Confirmed');
                                    return (
                                        <button 
                                            onClick={() => setPerfModalOpen(true)}
                                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                                                isConfirmed
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                                : 'bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20'
                                            }`}
                                        >
                                            {isConfirmed 
                                                ? (language === 'vi' ? 'ĐÃ XÁC NHẬN THỬ VIỆC' : 'PROBATION CONFIRMED') 
                                                : (language === 'vi' ? 'THỬ VIỆC' : 'PROBATION')}
                                        </button>
                                    )
                                })() : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                        {language === 'vi' ? 'ĐANG HOẠT ĐỘNG' : 'ACTIVE'}
                                    </span>
                                )}
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
                                    {language === 'vi' ? (
                                        tab.id === 'profile' ? 'Hồ sơ' :
                                        tab.id === 'contract' ? 'Hợp đồng' :
                                        tab.id === 'documents' ? 'Tài liệu' :
                                        tab.id === 'assets' ? 'Tài sản' :
                                        tab.id === 'timeline' ? 'Lịch sử công việc' :
                                        tab.id === 'performance' ? 'Hiệu suất' :
                                        'Kỷ luật & Thưởng'
                                    ) : tab.label}
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
                        {activeTab === 'contract' && <TabContract staff={staff} onUpdate={fetchAll} />}
                        {activeTab === 'documents' && <TabDocuments staff={staff} documents={documents} onUpdate={fetchAll} />}
                        {activeTab === 'timeline' && <TabTimeline staff={staff} roleHistory={roleHistory} salaryHistory={salaryHistory} positions={positions} departments={departments} loggedUserName={loggedUserName} onUpdate={fetchAll} onResign={handleResign} />}
                        {activeTab === 'performance' && <TabPerformance staff={staff} performances={performances} onUpdate={fetchAll} allCategories={allCategories} />}
                        {activeTab === 'disciplinary' && <TabDisciplinary staff={staff} />}
                        {activeTab === 'assets' && <TabAssets staff={staff} assets={assets} onUpdate={fetchAll} />}
                    </div>
                </div>

                <PerformanceModal 
                    open={perfModalOpen} 
                    onClose={() => setPerfModalOpen(false)}
                    onSave={handleSavePerformance} 
                    review={null} 
                    staffList={[staff]} 
                    allCategories={allCategories} 
                    saving={perfSaving} 
                    preselectedStaffId={staff.id} 
                    isProbation={true}
                />

                <PerformanceModal
                    open={exitReviewModalOpen}
                    onClose={() => { setExitReviewModalOpen(false); setPendingResignation(null); }}
                    onSave={handleExitReviewSave}
                    review={null}
                    staffList={[staff]}
                    allCategories={allCategories}
                    saving={exitReviewSaving}
                    preselectedStaffId={staff.id}
                    preselectedPeriod={computePeriodLabel('Quarterly', new Date().toISOString().slice(0, 10), 0)}
                    isExitReview={true}
                />

                <SalaryModal
                    open={dismissalModalOpen}
                    onClose={() => setDismissalModalOpen(false)}
                    onSave={async () => {}}
                    onResign={handleResign}
                    entry={null}
                    staffList={[staff]}
                    departments={departments}
                    positions={positions}
                    saving={dismissalSaving}
                    loggedUserName={loggedUserName}
                    preselectedStaffId={staff.id}
                    isProbationRejection={true}
                />

                {assetReturnModalOpen && (
                    <AssetReturnModal 
                        open={assetReturnModalOpen}
                        staff={staff}
                        assets={assets}
                        onClose={() => setAssetReturnModalOpen(false)}
                        onConfirm={confirmTerminationAfterAssets}
                    />
                )}
            </div>
        </div>
    )
}

// ==========================================
// TAB: Profile & Contract
// ==========================================
function TabProfile({ staff, departments, positions, branches, onUpdate }: { staff: HRStaffMember, departments: HRDepartment[], positions: HRPosition[], branches: any[], onUpdate: () => void }) {
    const { language } = useSettings()
    const [formData, setFormData] = useState<Partial<HRStaffMember>>({})
    const [selectedBranches, setSelectedBranches] = useState<string[]>([])
    const [displaySalary, setDisplaySalary] = useState<string>('')
    const [saving, setSaving] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [enrollLoading, setEnrollLoading] = useState(false)

    const handleEnroll = async (action: 'enroll' | 'reset') => {
        if (!staff.email) {
            alert(language === 'vi' ? 'Nhân viên không có địa chỉ email hợp lệ.' : 'Staff member does not have a valid email address.')
            return
        }
        setEnrollLoading(true)
        try {
            const res = await fetch('/api/staff-portal/enroll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ staffId: staff.id, action })
            })
            const json = await res.json()
            if (!res.ok) {
                throw new Error(json.error || 'Failed to process request')
            }
            alert(language === 'vi' 
                ? (action === 'enroll' ? 'Gửi email kích hoạt thành công!' : 'Gửi email đặt lại mật khẩu thành công!')
                : (action === 'enroll' ? 'Activation email sent successfully!' : 'Password reset email sent successfully!')
            )
            onUpdate()
        } catch (err: any) {
            console.error(err)
            alert(`Error: ${err.message}`)
        } finally {
            setEnrollLoading(false)
        }
    }
    
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [deleteLoading, setDeleteLoading]         = useState(false)
    const [vietnamBanks, setVietnamBanks] = useState<VietnamBank[]>([])
    const router = useRouter()

    const handleDelete = async () => {
        setDeleteLoading(true)
        try {
            const { error } = await supabase.from('hr_staff').delete().eq('id', staff.id)
            if (error) throw error
            router.push('/human-resources/management/staff')
        } catch (err) {
            console.error(err)
            alert('Failed to delete staff member')
        }
        setDeleteLoading(false)
    }

    useEffect(() => {
        getVietnamBanks().then(setVietnamBanks)
    }, [])

    useEffect(() => {
        setFormData({ ...staff })
        setSelectedBranches((staff as any).hr_staff_branches?.map((b: any) => b.branch_id) || [])
        
        if (staff.salary_amount) {
            setDisplaySalary(staff.salary_amount.toLocaleString('en-US', { maximumFractionDigits: 2 }))
        } else {
            setDisplaySalary('')
        }
    }, [staff])

    useEffect(() => {
        if (formData.bank_same_as_staff) {
            setFormData(p => {
                if (p.bank_account_name !== p.full_name) {
                    return { ...p, bank_account_name: p.full_name };
                }
                return p;
            });
        }
    }, [formData.full_name, formData.bank_same_as_staff])

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
            const phoneVal = (formData.phone || '').trim() || null;
            const emailVal = (formData.email || '').trim() || null;

            if (phoneVal || emailVal) {
                let query = supabase.from('hr_staff').select('id, full_name, status');
                
                if (phoneVal && emailVal) {
                    query = query.or(`phone.eq."${phoneVal}",email.eq."${emailVal}"`);
                } else if (phoneVal) {
                    query = query.eq('phone', phoneVal);
                } else if (emailVal) {
                    query = query.eq('email', emailVal);
                }

                query = query.neq('id', staff.id);

                const { data, error } = await query;
                if (!error && data && data.length > 0) {
                    const duplicate = data[0];
                    alert(`Cannot save: A staff member named "${duplicate.full_name}" (Status: ${duplicate.status}) already exists with this phone or email.`);
                    setSaving(false);
                    return;
                }
            }
            const { hr_staff_branches, hr_departments, hr_positions, hr_staff_contracts, contract_signing_date, contract_expiration_date, notes, ...updateData } = formData as any;
            
            // Sanitize empty strings to null for date and relation fields
            const nullifyIfEmpty = (field: string) => {
                if (updateData[field] === '') updateData[field] = null;
            }
            nullifyIfEmpty('start_date');
            nullifyIfEmpty('probation_end_date');
            nullifyIfEmpty('department_id');
            nullifyIfEmpty('position_id');
            nullifyIfEmpty('bank_name');
            nullifyIfEmpty('bank_account_number');
            nullifyIfEmpty('bank_account_name');
            nullifyIfEmpty('date_of_birth');
            nullifyIfEmpty('document_issue_date');
            nullifyIfEmpty('gender');
            nullifyIfEmpty('marital_status');
            nullifyIfEmpty('bank_branch');
            nullifyIfEmpty('emergency_contact_name');
            nullifyIfEmpty('emergency_contact_relationship');
            nullifyIfEmpty('emergency_contact_phone');
            nullifyIfEmpty('document_type');
            nullifyIfEmpty('document_number');
            nullifyIfEmpty('document_issue_place');
            nullifyIfEmpty('staff_code');

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
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-500">
                        {language === 'vi' ? 'Thông tin chung' : 'General Information'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {language === 'vi' ? 'Chi tiết liên hệ cơ bản và vị trí.' : 'Basic contact and position details.'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
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
                        className={`p-2 rounded-xl border transition-all ${isEditing ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                        title={isEditing ? (language === 'vi' ? 'Hủy chỉnh sửa' : 'Cancel Editing') : (language === 'vi' ? 'Chỉnh sửa' : 'Enable Editing')}
                    >
                        {isEditing ? <X className="w-5 h-5" /> : <Pencil className="w-5 h-5" />}
                    </button>

                </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Họ & Tên' : 'Full Name'}</label>
                    <input disabled={!isEditing} value={formData.full_name || ''} onChange={e => handleChange('full_name', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Số điện thoại' : 'Phone'}</label>
                    <input disabled={!isEditing} value={formData.phone || ''} onChange={e => handleChange('phone', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Email' : 'Email'}</label>
                    <input disabled={!isEditing} type="email" value={formData.email || ''} onChange={e => handleChange('email', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Thành phố' : 'City'}</label>
                    <select 
                        disabled={!isEditing} 
                        value={formData.city || ''} 
                        onChange={e => handleChange('city', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        <option value="">{language === 'vi' ? 'Không' : 'None'}</option>
                        {Array.from(new Set(branches.map(b => b.city).filter(Boolean))).sort().map((city: any) => (
                            <option key={city} value={city}>{city}</option>
                        ))}
                    </select>
                </div>
                <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Địa chỉ' : 'Address'}</label>
                    <input 
                        disabled={!isEditing} 
                        value={formData.address || ''} 
                        onChange={e => handleChange('address', e.target.value)}
                        autoComplete="one-time-code"
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" 
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Ngày sinh' : 'Date of Birth'}</label>
                    <input disabled={!isEditing} type="date" value={formData.date_of_birth || ''} onChange={e => handleChange('date_of_birth', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed h-10" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Giới tính' : 'Gender'}</label>
                    <select disabled={!isEditing} value={formData.gender || 'Nam'} onChange={e => handleChange('gender', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed h-10">
                        <option value="Nam">{language === 'vi' ? 'Nam' : 'Male'}</option>
                        <option value="Nữ">{language === 'vi' ? 'Nữ' : 'Female'}</option>
                        <option value="Khác">{language === 'vi' ? 'Khác' : 'Other'}</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Tình trạng hôn nhân' : 'Marital Status'}</label>
                    <select disabled={!isEditing} value={formData.marital_status || 'Độc thân'} onChange={e => handleChange('marital_status', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed h-10">
                        <option value="Độc thân">{language === 'vi' ? 'Độc thân' : 'Single'}</option>
                        <option value="Đã kết hôn">{language === 'vi' ? 'Đã kết hôn' : 'Married'}</option>
                        <option value="Ly hôn">{language === 'vi' ? 'Ly hôn' : 'Divorced'}</option>
                        <option value="Góa phụ">{language === 'vi' ? 'Góa phụ' : 'Widowed'}</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Mã NV (Tanca)' : 'Tanca Staff Code'}</label>
                    <input disabled={!isEditing} value={formData.staff_code || ''} onChange={e => handleChange('staff_code', e.target.value)}
                        placeholder={language === 'vi' ? 'Ví dụ: TC001' : 'e.g. TC001'}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed h-10" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Bộ phận' : 'Department'}</label>
                    <select disabled={!isEditing} value={formData.department_id || ''} onChange={e => handleChange('department_id', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed">
                        <option value="">{language === 'vi' ? 'Không' : 'None'}</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Vị trí' : 'Position'}</label>
                    <select disabled={!isEditing} value={formData.position_id || ''} onChange={e => handleChange('position_id', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed">
                        <option value="">{language === 'vi' ? 'Không' : 'None'}</option>
                        {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Ngày bắt đầu' : 'Start Date'}</label>
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
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Thời gian thử việc (Tháng)' : 'Probation Time (Months)'}</label>
                    <input disabled={!isEditing} type="number" min="0" max="3" value={formData.probation_months ?? ''} onChange={e => {
                        let m = parseInt(e.target.value);
                        if (m > 3) m = 3;
                        handleChange('probation_months', isNaN(m) ? 0 : m);
                        
                        // Update pcts
                        if (!isNaN(m) && m > 0) {
                            let newPcts = formData.probation_salary_pcts && Array.isArray(formData.probation_salary_pcts) ? [...formData.probation_salary_pcts] : [];
                            if (newPcts.length !== m) {
                                newPcts = Array(m).fill(100);
                                if (m >= 1) newPcts[0] = 85;
                                if (m >= 2) newPcts[1] = 100;
                                if (m >= 3) newPcts[2] = 100;
                            }
                            handleChange('probation_salary_pcts', newPcts);
                            handleChange('probation_salary_pct', newPcts[0] || 100);
                        } else {
                            handleChange('probation_salary_pcts', null);
                            handleChange('probation_salary_pct', 100);
                        }

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
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Ngày kết thúc thử việc' : 'Probation End Date'}</label>
                    <input disabled={!isEditing} type="date" value={formData.probation_end_date || ''} onChange={e => handleChange('probation_end_date', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Lương thử việc (%)' : 'Probation Salary (%)'}</label>
                    <div className="flex items-center gap-1.5 h-10">
                        {formData.probation_months && formData.probation_months > 1 ? (
                            Array.from({ length: formData.probation_months }).map((_, idx) => {
                                const currentPcts = formData.probation_salary_pcts && Array.isArray(formData.probation_salary_pcts) && formData.probation_salary_pcts.length > 0
                                    ? formData.probation_salary_pcts
                                    : Array(formData.probation_months).fill(formData.probation_salary_pct || 100);
                                const currentVal = currentPcts[idx] ?? 100;
                                return (
                                    <div key={idx} className={`flex-1 min-w-[70px] flex items-center border rounded-lg overflow-hidden h-10 ${
                                        isEditing 
                                            ? 'bg-white border-gray-200 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500' 
                                            : 'bg-gray-50 border-gray-200'
                                    }`}>
                                        <div className="flex items-center justify-center px-2.5 bg-gray-100 border-r border-gray-200 text-xs font-bold text-gray-500 h-full select-none">
                                            {language === 'vi' ? `T${idx + 1}` : `M${idx + 1}`}
                                        </div>
                                        <input disabled={!isEditing} type="number" min="0" max="100" value={currentVal}
                                            onChange={(e) => {
                                                const newPcts = [...currentPcts];
                                                newPcts[idx] = parseFloat(e.target.value) || 0;
                                                handleChange('probation_salary_pcts', newPcts);
                                                if (idx === 0) handleChange('probation_salary_pct', parseFloat(e.target.value) || 0);
                                            }}
                                            className="flex-1 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none h-full border-none focus:ring-0 disabled:opacity-70 disabled:cursor-not-allowed font-semibold text-left" />
                                        <span className="pr-3 text-sm text-gray-455 font-bold select-none">%</span>
                                    </div>
                                )
                            })
                        ) : formData.probation_months && formData.probation_months === 1 ? (
                            <div className="relative w-full">
                                <input
                                    key="probation-salary-active"
                                    disabled={!isEditing}
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={formData.probation_salary_pct ?? 100}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        handleChange('probation_salary_pct', val);
                                        handleChange('probation_salary_pcts', [val]);
                                    }}
                                    className="w-full px-3 py-2 pr-8 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed font-semibold h-10" />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-bold">%</span>
                            </div>
                        ) : (
                            <div className="relative w-full">
                                <input 
                                    key="probation-salary-disabled"
                                    disabled 
                                    type="number" 
                                    placeholder="100"
                                    className="w-full px-3 py-2 pr-8 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed font-semibold h-10" />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-bold">%</span>
                            </div>
                        )}
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Loại nhân viên' : 'Employment Type'}</label>
                    <select disabled={!isEditing} value={formData.employment_type || 'full_time'} onChange={e => handleChange('employment_type', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed">
                        <option value="full_time">{language === 'vi' ? 'Toàn thời gian' : 'Full-time'}</option>
                        <option value="part_time">{language === 'vi' ? 'Bán thời gian' : 'Part-time'}</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                        {language === 'vi' ? 'Lương gộp (VND)' : 'Gross Salary (VND)'} <span className="lowercase text-gray-400">{formData.employment_type === 'full_time' ? (language === 'vi' ? '/tháng' : '/month') : (language === 'vi' ? '/giờ' : '/hour')}</span>
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
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:bg-gray-100 disabled:cursor-not-allowed text-right font-medium text-slate-800" />
                </div>
            </div>

            <hr className="border-gray-100" />

            {/* Document Details */}
            <div>
                <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">
                        {language === 'vi' ? 'Giấy tờ tùy thân' : 'Identity Documents'}
                    </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            {language === 'vi' ? 'Loại giấy tờ' : 'Document Type'}
                        </label>
                        <select 
                            disabled={!isEditing} 
                            value={formData.document_type || 'id_card'} 
                            onChange={e => handleChange('document_type', e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed h-10"
                        >
                            <option value="id_card">{language === 'vi' ? 'Căn cước công dân (ID Card)' : 'ID Card'}</option>
                            <option value="passport">{language === 'vi' ? 'Hộ chiếu (Passport)' : 'Passport'}</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            {language === 'vi' ? 'Số giấy tờ' : 'Document Number'}
                        </label>
                        <input 
                            disabled={!isEditing} 
                            value={formData.document_number || ''} 
                            onChange={e => handleChange('document_number', e.target.value)}
                            placeholder={formData.document_type === 'passport' ? (language === 'vi' ? 'Nhập số hộ chiếu...' : 'Enter passport number...') : (language === 'vi' ? 'Nhập số CCCD...' : 'Enter ID number...')}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed h-10" 
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            {language === 'vi' ? 'Ngày cấp' : 'Document Issue Date'}
                        </label>
                        <input 
                            disabled={!isEditing} 
                            type="date"
                            value={formData.document_issue_date || ''} 
                            onChange={e => handleChange('document_issue_date', e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed h-10" 
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            {language === 'vi' ? 'Nơi cấp' : 'Document Place of Issue'}
                        </label>
                        <input 
                            disabled={!isEditing} 
                            value={formData.document_issue_place || ''} 
                            onChange={e => handleChange('document_issue_place', e.target.value)}
                            placeholder={language === 'vi' ? 'Ví dụ: Cục Cảnh sát QLHC về TTXH' : 'e.g. Police Department'}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed h-10" 
                        />
                    </div>
                </div>
            </div>

            <hr className="border-gray-100" />

            {/* Assigned Branches */}
            <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                    <h3 className="text-sm font-semibold text-gray-900">
                        {language === 'vi' ? 'Chi nhánh phân công' : 'Assigned Branches'}
                    </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                    {branches.filter(b => !formData.city || b.city === formData.city).map(branch => {
                        const isSelected = selectedBranches.includes(branch.id);
                        return (
                            <button
                                type="button"
                                key={branch.id}
                                disabled={!isEditing}
                                onClick={() => {
                                    if (isSelected) setSelectedBranches(p => p.filter(id => id !== branch.id))
                                    else setSelectedBranches(p => [...p, branch.id])
                                }}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                    isSelected 
                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                                } ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                                {branch.name}
                            </button>
                        )
                    })}
                    {branches.filter(b => !formData.city || b.city === formData.city).length === 0 && (
                        <span className="text-sm text-gray-400 italic">
                            {language === 'vi' ? 'Không có chi nhánh nào cho thành phố đã chọn.' : 'No branches available for the selected city.'}
                        </span>
                    )}
                </div>
            </div>

            <hr className="border-gray-100" />

            {/* Bank Details */}
            <div>
                <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">
                        {language === 'vi' ? 'Thông tin ngân hàng' : 'Bank Details'}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {language === 'vi' ? 'Cấu hình thanh toán và tài khoản ngân hàng của nhân viên.' : "Staff member's payment and bank account settings."}
                    </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                {language === 'vi' ? 'Tên chủ tài khoản' : 'Account Holder Name'}
                            </label>
                            {isEditing && (
                                <label className="flex items-center gap-1.5 text-xs text-blue-600 font-medium cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={formData.bank_same_as_staff || false} 
                                        onChange={e => handleChange('bank_same_as_staff', e.target.checked)}
                                        className="rounded text-blue-600 focus:ring-blue-500 border-gray-300 w-3.5 h-3.5" 
                                    />
                                    {language === 'vi' ? 'Trùng tên nhân viên' : 'Same as staff'}
                                </label>
                            )}
                        </div>
                        <input 
                            disabled={!isEditing || formData.bank_same_as_staff} 
                            value={formData.bank_account_name || ''} 
                            onChange={e => handleChange('bank_account_name', e.target.value)}
                            placeholder={language === 'vi' ? 'Ví dụ: NGUYEN VAN A' : 'e.g. NGUYEN VAN A'}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed uppercase" 
                        />
                    </div>
                    
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            {language === 'vi' ? 'Tên ngân hàng' : 'Bank Name'}
                        </label>
                        <input 
                            type="text"
                            list="detail-banks-list"
                            disabled={!isEditing} 
                            value={formData.bank_name || ''} 
                            onChange={e => handleChange('bank_name', e.target.value)}
                            placeholder={language === 'vi' ? 'Chọn hoặc nhập tên ngân hàng...' : 'Select or type bank name...'}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                        />
                        <datalist id="detail-banks-list">
                            {vietnamBanks.map(b => (
                                <option key={b.bin} value={b.shortName}>
                                    {b.name} ({b.code})
                                </option>
                            ))}
                        </datalist>
                    </div>

                    <div className="sm:col-span-1">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            {language === 'vi' ? 'Số tài khoản' : 'Bank Account Number'}
                        </label>
                        <input 
                            disabled={!isEditing} 
                            value={formData.bank_account_number || ''} 
                            onChange={e => handleChange('bank_account_number', e.target.value)}
                            placeholder={language === 'vi' ? 'Ví dụ: 1234567890' : 'e.g. 1234567890'}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" 
                        />
                    </div>

                    <div className="sm:col-span-1">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            {language === 'vi' ? 'Chi nhánh ngân hàng' : 'Bank Branch'}
                        </label>
                        <input 
                            disabled={!isEditing} 
                            value={formData.bank_branch || ''} 
                            onChange={e => handleChange('bank_branch', e.target.value)}
                            placeholder={language === 'vi' ? 'Ví dụ: Chi nhánh Bến Thành' : 'e.g. Ben Thanh Branch'}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" 
                        />
                    </div>
                </div>
            </div>

            <hr className="border-gray-100" />

            {/* Emergency Contact */}
            <div>
                <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">
                        {language === 'vi' ? 'Liên hệ khẩn cấp' : 'Emergency Contact'}
                    </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            {language === 'vi' ? 'Người liên hệ' : 'Contact Person'}
                        </label>
                        <input 
                            disabled={!isEditing} 
                            value={formData.emergency_contact_name || ''} 
                            onChange={e => handleChange('emergency_contact_name', e.target.value)}
                            placeholder={language === 'vi' ? 'Ví dụ: Nguyễn Văn A' : 'e.g. John Doe'}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed h-10" 
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            {language === 'vi' ? 'Quan hệ' : 'Relationship'}
                        </label>
                        <input 
                            disabled={!isEditing} 
                            value={formData.emergency_contact_relationship || ''} 
                            onChange={e => handleChange('emergency_contact_relationship', e.target.value)}
                            placeholder={language === 'vi' ? 'Ví dụ: Bố, Mẹ, Vợ, Chồng...' : 'e.g. Father, Mother, Spouse...'}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed h-10" 
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            {language === 'vi' ? 'Số điện thoại khẩn cấp' : 'Emergency Phone'}
                        </label>
                        <input 
                            disabled={!isEditing} 
                            value={formData.emergency_contact_phone || ''} 
                            onChange={e => handleChange('emergency_contact_phone', e.target.value)}
                            placeholder={language === 'vi' ? 'Ví dụ: 0912345678' : 'e.g. 0912345678'}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed h-10" 
                        />
                    </div>
                </div>
            </div>

            {/* Portal Access */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-4 mt-6">
                <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wider">
                    {language === 'vi' ? 'Quyền truy cập cổng thông tin' : 'Portal Access'}
                </h3>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <p className="text-sm text-gray-600">
                            {language === 'vi' 
                                ? 'Cổng nhân viên cho phép xem lịch làm việc, chấm công và phiếu lương.' 
                                : 'The staff portal allows employees to view their rosters, attendance, and payslips.'}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs font-semibold text-gray-500 uppercase">
                                {language === 'vi' ? 'Trạng thái:' : 'Status:'}
                            </span>
                            {staff.portal_password_hash ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                    {language === 'vi' ? 'Đang hoạt động' : 'Active'}
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                    {language === 'vi' ? 'Chưa cấu hình' : 'Not Configured'}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {enrollLoading ? (
                            <button disabled className="inline-flex items-center gap-2 bg-gray-100 text-gray-400 px-4 py-2 rounded-xl text-xs font-semibold border border-gray-200 cursor-not-allowed">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                {language === 'vi' ? 'Đang xử lý...' : 'Processing...'}
                            </button>
                        ) : !staff.portal_password_hash ? (
                            <button 
                                type="button"
                                onClick={() => handleEnroll('enroll')}
                                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-md shadow-blue-500/10 transition-all"
                            >
                                <Mail className="w-3.5 h-3.5" />
                                {language === 'vi' ? 'Đăng ký (Gửi email chào mừng)' : 'Enroll Staff (Welcome Email)'}
                            </button>
                        ) : (
                            <button 
                                type="button"
                                onClick={() => handleEnroll('reset')}
                                className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-xl text-xs font-semibold border border-gray-200 shadow-sm transition-all"
                            >
                                <Key className="w-3.5 h-3.5" />
                                {language === 'vi' ? 'Gửi liên kết đặt lại mật khẩu' : 'Send Password Reset Link'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {isEditing && (
                <div className="pt-4 flex justify-between items-center">
                    <button 
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)} 
                        className="inline-flex items-center gap-2 border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
                    >
                        <Trash2 className="w-4 h-4" />
                        {language === 'vi' ? 'Xóa nhân viên' : 'Delete staff'}
                    </button>

                    <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {language === 'vi' ? 'Lưu thay đổi' : 'Save Changes'}
                    </button>
                </div>
            )}
            {showDeleteConfirm && (
                <DeleteConfirm
                    name={staff.full_name || ''}
                    onConfirm={handleDelete}
                    onCancel={() => setShowDeleteConfirm(false)}
                    deleting={deleteLoading}
                />
            )}
        </div>
    )
}

// ==========================================
// TAB: Contract
// ==========================================
function TabContract({ staff, onUpdate }: { staff: HRStaffMember, onUpdate: () => void }) {
    const { language } = useSettings()
    const contracts = [...(staff.hr_staff_contracts || [])].sort((a, b) => a.version - b.version);
    
    const [selectedIdx, setSelectedIdx] = useState<number>(Math.max(0, contracts.length - 1));
    const [isAddingNew, setIsAddingNew] = useState(false);
    
    const [formData, setFormData] = useState<Partial<HRStaffContract>>({})
    const [displayValues, setDisplayValues] = useState<Record<string, string>>({})
    const [saving, setSaving] = useState(false)
    const [isEditing, setIsEditing] = useState(false)

    const breakdownFields = [
        { key: 'basic_salary', labelEn: 'Basic Salary', labelVi: 'Lương cơ bản' },
        { key: 'uniforms_allowance', labelEn: 'Uniforms Allowance', labelVi: 'Phụ cấp đồng phục' },
        { key: 'lunch_allowance', labelEn: 'Lunch Allowance', labelVi: 'Phụ cấp ăn trưa' },
        { key: 'phone_allowance', labelEn: 'Phone Allowance', labelVi: 'Phụ cấp điện thoại' },
        { key: 'fuel_allowance', labelEn: 'Fuel Allowance', labelVi: 'Phụ cấp xăng xe' },
        { key: 'home_support_allowance', labelEn: 'Home Support', labelVi: 'Hỗ trợ nhà ở' },
    ] as const;

    // When the selected tab changes, populate form
    useEffect(() => {
        let currentContract: Partial<HRStaffContract> = {};
        if (isAddingNew) {
            currentContract = { version: contracts.length > 0 ? contracts[contracts.length - 1].version + 1 : 1 };
            setIsEditing(true);
        } else if (contracts[selectedIdx]) {
            currentContract = { ...contracts[selectedIdx] };
            setIsEditing(false);
        }

        setFormData(currentContract);
        
        const initDisplay: Record<string, string> = {};
        breakdownFields.forEach(f => {
            const val = currentContract[f.key as keyof HRStaffContract];
            initDisplay[f.key] = val ? Number(val).toLocaleString('en-US') : '';
        });
        setDisplayValues(initDisplay);
    }, [staff, selectedIdx, isAddingNew]);

    const handleChange = (field: keyof HRStaffContract, val: any) => {
        setFormData(p => ({ ...p, [field]: val }))
    }

    const handleBreakdownChange = (key: string, rawValue: string) => {
        let val = rawValue.replace(/[^0-9]/g, '');
        let numVal = parseInt(val, 10);
        
        setDisplayValues(p => ({ ...p, [key]: isNaN(numVal) ? '' : numVal.toLocaleString('en-US') }));
        handleChange(key as any, isNaN(numVal) ? null : numVal);
    };
    
    const handleSave = async () => {
        if (formData.signing_date && formData.expiration_date) {
            const signDate = new Date(formData.signing_date).getTime();
            const expDate = new Date(formData.expiration_date).getTime();
            if (expDate < signDate) {
                alert(language === 'vi' ? "Ngày hết hạn hợp đồng không thể trước ngày ký hợp đồng." : "Contract Expiration Date cannot be before the Contract Signing Date.");
                return;
            }
        }

        setSaving(true)
        try {
            const payload = {
                staff_id: staff.id,
                version: formData.version || 1,
                signing_date: formData.signing_date === '' ? null : formData.signing_date,
                expiration_date: formData.expiration_date === '' ? null : formData.expiration_date,
                notes: formData.notes === '' ? null : formData.notes,
                basic_salary: formData.basic_salary || 0,
                uniforms_allowance: formData.uniforms_allowance || 0,
                lunch_allowance: formData.lunch_allowance || 0,
                phone_allowance: formData.phone_allowance || 0,
                fuel_allowance: formData.fuel_allowance || 0,
                home_support_allowance: formData.home_support_allowance || 0,
            }

            if (isAddingNew) {
                const { error } = await supabase.from('hr_staff_contracts').insert([payload])
                if (error) throw error
            } else if (contracts[selectedIdx]) {
                const { error } = await supabase.from('hr_staff_contracts').update(payload).eq('id', contracts[selectedIdx].id)
                if (error) throw error
            }

            setIsAddingNew(false)
            setIsEditing(false)
            onUpdate() // Refresh data
        } catch (err) {
            console.error(err)
            alert(language === 'vi' ? 'Không thể lưu hợp đồng' : 'Failed to save contract')
        }
        setSaving(false)
    }

    const grossSalary = staff.salary_amount || 0;
    const currentTotal = breakdownFields.reduce((sum, f) => sum + (Number(formData[f.key as keyof HRStaffContract]) || 0), 0);
    const difference = grossSalary - currentTotal;
    const isMatching = currentTotal === grossSalary;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-500">
                        {language === 'vi' ? 'Lịch sử hợp đồng' : 'Contract History'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {language === 'vi' ? 'Quản lý hợp đồng lao động và phân tích tiền lương.' : 'Manage employment contracts and salary breakdowns.'}
                    </p>
                </div>
                {!isAddingNew && (
                    <button 
                        onClick={() => setIsAddingNew(true)} 
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow hover:shadow-lg"
                    >
                        <Plus className="w-4 h-4" /> {language === 'vi' ? 'Gia hạn hợp đồng' : 'Renew Contract'}
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 flex flex-wrap gap-6 mb-6">
                {contracts.map((c, i) => (
                    <button 
                        key={c.id} 
                        onClick={() => { setIsAddingNew(false); setSelectedIdx(i); }}
                        className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                            !isAddingNew && selectedIdx === i 
                                ? 'border-blue-600 text-blue-600' 
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        {i === 0 ? (language === 'vi' ? 'Hợp đồng đầu tiên' : 'Initial Contract') : (language === 'vi' ? `Gia hạn #${i}` : `Renewal #${i}`)}
                    </button>
                ))}
                {isAddingNew && (
                    <div className="py-3 px-1 border-b-2 font-medium text-sm border-blue-600 text-blue-600">
                        {language === 'vi' ? 'Gia hạn mới' : 'New Renewal'}
                    </div>
                )}
            </div>

            <div className="border border-gray-200 rounded-2xl p-6 bg-white relative">
                {!isAddingNew && (
                    <button 
                        onClick={() => setIsEditing(!isEditing)} 
                        className={`absolute top-4 right-4 p-2 rounded-xl border transition-all ${isEditing ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                        title={isEditing ? (language === 'vi' ? 'Hủy chỉnh sửa' : 'Cancel Editing') : (language === 'vi' ? 'Chỉnh sửa' : 'Enable Editing')}
                    >
                        {isEditing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                    </button>
                )}

                <h3 className="text-lg font-semibold text-gray-900 mb-5">
                    {isAddingNew 
                        ? (language === 'vi' ? 'Soạn hợp đồng mới' : 'Drafting New Contract') 
                        : (selectedIdx === 0 
                            ? (language === 'vi' ? 'Chi tiết hợp đồng đầu tiên' : 'Initial Contract Details') 
                            : (language === 'vi' ? `Chi tiết gia hạn #${selectedIdx}` : `Renewal #${selectedIdx} Details`))}
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Ngày ký hợp đồng' : 'Contract Signing Date'}</label>
                        <input disabled={!isEditing} type="date" value={formData.signing_date || ''} onChange={e => handleChange('signing_date', e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Ngày hết hạn hợp đồng' : 'Contract Expiration Date'}</label>
                        <input disabled={!isEditing} type="date" value={formData.expiration_date || ''} onChange={e => handleChange('expiration_date', e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" />
                    </div>
                </div>

                <div className="mt-5">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{language === 'vi' ? 'Ghi chú' : 'Notes'}</label>
                    <textarea disabled={!isEditing} rows={2} value={formData.notes || ''} onChange={e => handleChange('notes', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed" placeholder={language === 'vi' ? 'Ghi chú nội bộ...' : 'Internal notes...'}></textarea>
                </div>

                <hr className="border-gray-100 my-6" />

                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-900">{language === 'vi' ? 'Phân tích tiền lương' : 'Salary Breakdown'}</h3>
                        <div className="text-sm">
                            <span className="text-gray-500">{language === 'vi' ? 'Lương gộp (từ Hồ sơ): ' : 'Gross Salary (from Profile): '}</span>
                            <span className="font-bold text-gray-900">{fmtVND(grossSalary)}</span>
                        </div>
                    </div>
                    
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 sm:p-6 space-y-4">
                        {breakdownFields.map(field => {
                            const val = Number(formData[field.key as keyof HRStaffContract]) || 0;
                            const pct = grossSalary > 0 ? ((val / grossSalary) * 100).toFixed(1) : '0.0';
                            return (
                                <div key={field.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                                    <label className="w-full sm:w-48 text-sm font-medium text-gray-700">{language === 'vi' ? field.labelVi : field.labelEn}</label>
                                    <div className="flex-1 relative">
                                        <input 
                                            disabled={!isEditing} 
                                            type="text" 
                                            value={displayValues[field.key] || ''} 
                                            onChange={e => handleBreakdownChange(field.key, e.target.value)}
                                            className="w-full px-3 py-2 pr-16 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70 disabled:bg-gray-100 disabled:cursor-not-allowed text-right font-mono" 
                                            placeholder="0"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                            {pct}%
                                        </span>
                                    </div>
                                </div>
                            )
                        })}

                        <div className={`pt-4 mt-4 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-medium text-sm ${!isMatching ? 'text-red-600' : 'text-emerald-600'}`}>
                            <span>{language === 'vi' ? 'Tổng phân tích: ' : 'Total Breakdown: '}{fmtVND(currentTotal)}</span>
                            {!isMatching ? (
                                <span className="flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {language === 'vi' ? 'Chênh lệch: ' : 'Difference: '}{fmtVND(Math.abs(difference))}</span>
                            ) : (
                                <span className="flex items-center gap-1"><CheckCircle className="w-4 h-4" /> {language === 'vi' ? 'Khớp với lương gộp' : 'Matches Gross Salary'}</span>
                            )}
                        </div>
                    </div>
                </div>

                {isEditing && (
                    <div className="pt-6 flex justify-end gap-3">
                        {isAddingNew && (
                            <button onClick={() => setIsAddingNew(false)} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition">
                                {language === 'vi' ? 'Hủy' : 'Cancel'}
                            </button>
                        )}
                        <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {isAddingNew 
                                ? (language === 'vi' ? 'Lưu hợp đồng mới' : 'Save New Contract') 
                                : (language === 'vi' ? 'Cập nhật hợp đồng' : 'Update Contract')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

// ==========================================
// TAB: Documents
// ==========================================
import DocumentUploadModal from '@/components/human-resources/DocumentUploadModal'

function TabDocuments({ staff, documents, onUpdate }: { staff: HRStaffMember, documents: HRStaffDocument[], onUpdate: () => void }) {
    const { language } = useSettings()
    const [uploadModalOpen, setUploadModalOpen] = useState(false)

    const handleDelete = async (docId: string, fileUrl: string) => {
        if (!confirm(language === 'vi' ? 'Bạn có chắc chắn muốn xóa tài liệu này không? Hành động này không thể hoàn tác.' : 'Are you sure you want to delete this document? This action cannot be undone.')) return
        
        try {
            // Delete from storage
            const urlPath = new URL(fileUrl).pathname
            const segments = urlPath.split('/')
            // The file path is everything after hr-documents bucket name
            const bucketIndex = segments.indexOf('hr-documents')
            if (bucketIndex !== -1) {
                const filePath = segments.slice(bucketIndex + 1).join('/')
                await supabase.storage.from('hr-documents').remove([filePath])
            }

            // Delete from DB
            const { error } = await supabase.from('hr_staff_documents').delete().eq('id', docId)
            if (error) throw error
            
            onUpdate()
        } catch (err) {
            console.error('Error deleting document', err)
            alert(language === 'vi' ? 'Không thể xóa tài liệu' : 'Failed to delete document')
        }
    }

    const getCategoryLabel = (category: string) => {
        const labels: Record<string, string> = {
            'CV': 'CV',
            'ID Card': language === 'vi' ? 'CCCD / CMND' : 'ID Card',
            'Contract': language === 'vi' ? 'Hợp đồng' : 'Contract',
            'Medical': language === 'vi' ? 'Y tế' : 'Medical',
            'Certification': language === 'vi' ? 'Chứng chỉ' : 'Certification',
            'Other': language === 'vi' ? 'Khác' : 'Other',
        }
        return labels[category] || category
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
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-500">
                        {language === 'vi' ? 'Tài liệu chính thức' : 'Official Documents'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {language === 'vi' ? 'Quản lý các tệp tài liệu liên quan đến quá trình làm việc của nhân viên.' : "Manage physical files relevant to the employee's tenure."}
                    </p>
                </div>
                <button onClick={() => setUploadModalOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow hover:shadow-lg">
                    <Plus className="w-4 h-4" /> {language === 'vi' ? 'Thêm tài liệu' : 'Add Document'}
                </button>
            </div>
            
            {documents.length === 0 ? (
                <div className="border border-dashed border-gray-200 rounded-2xl p-12 text-center bg-gray-50/50">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <FileText className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-gray-900 font-medium text-lg">{language === 'vi' ? 'Không tìm thấy tài liệu nào' : 'No documents found'}</h3>
                    <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
                        {language === 'vi' ? 'Tải lên hợp đồng, thẻ căn cước, giấy khám sức khỏe và các tài liệu quan trọng khác tại đây.' : 'Upload contracts, ID cards, medical checkups, and other important files here.'}
                    </p>
                    <button onClick={() => setUploadModalOpen(true)} className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                        <UploadCloud className="w-4 h-4" /> {language === 'vi' ? 'Tải lên tài liệu đầu tiên' : 'Upload First Document'}
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
                                        {getCategoryLabel(doc.document_category)}
                                    </span>
                                </div>
                            </div>
                            
                            <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between">
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {fmtDate(doc.uploaded_at)}
                                </span>
                                <a href={doc.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-medium transition">
                                    <ExternalLink className="w-3.5 h-3.5" /> {language === 'vi' ? 'Xem' : 'View'}
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
function TabTimeline({ staff, roleHistory, salaryHistory, positions, departments, loggedUserName, onUpdate, onResign }: { staff: HRStaffMember, roleHistory: HRStaffRoleHistory[], salaryHistory: HRStaffSalaryHistory[], positions: HRPosition[], departments: HRDepartment[], loggedUserName: string, onUpdate: () => void, onResign: (data: any) => Promise<void> }) {
    const { language } = useSettings()
    const [modalOpen, setModalOpen] = useState(false)
    const [saving, setSaving] = useState(false)

    // Dynamic translator for timeline DB values
    const formatTimelineText = (text: string | null | undefined): string => {
        if (!text) return '';
        if (language !== 'vi') return text;
        
        const lower = text.trim().toLowerCase();
        
        const exactTranslations: Record<string, string> = {
            're-hired with new contract': 'Được tuyển dụng lại với hợp đồng mới',
            'rehired with new contract': 'Được tuyển dụng lại với hợp đồng mới',
            'personal reasons (during probation)': 'Lý do cá nhân trong thời gian thử việc',
            'personal reasons during probation': 'Lý do cá nhân trong thời gian thử việc',
            'personal reason during probation': 'Lý do cá nhân trong thời gian thử việc',
            'personal reason': 'Lý do cá nhân',
            'personal reasons': 'Lý do cá nhân',
            'better opportunity': 'Cơ hội tốt hơn',
            'health issues': 'Vấn đề sức khỏe',
            'relocation': 'Chuyển nơi ở',
            'end of contract': 'Hết hạn hợp đồng',
            'performance issues': 'Vấn đề hiệu suất',
            'policy violation': 'Vi phạm chính sách',
            'attendance issues': 'Vấn đề chuyên cần',
            'started employment': 'Bắt đầu làm việc',
            'started employment at the company.': 'Bắt đầu làm việc tại công ty.',
            'promotion': 'Thăng chức',
            'gross salary change': 'Thay đổi lương gộp',
            'promotion logged via salary/role change': 'Thăng chức được ghi nhận qua thay đổi Lương/Vai trò'
        };

        if (exactTranslations[lower]) {
            return exactTranslations[lower];
        }
        
        // 1. Re-hired as [type] [position]
        // Example: "Re-hired as Outsourced - Waiter/ress" -> "Tuyển dụng lại với tư cách là Waitress thuê ngoài"
        const rehireMatch = text.match(/Re-?hired\s+as\s*(outsourced|full-time|part-time|full_time|part_time)?\s*[-\s]*\s*(.*)/i);
        if (rehireMatch) {
            const type = (rehireMatch[1] || '').toLowerCase().replace('_', '-');
            let pos = (rehireMatch[2] || '').trim();
            // Rimuove eventuali trattini o spazi superflui all'inizio
            if (pos.startsWith('-')) {
                pos = pos.substring(1).trim();
            }
            
            let typeVi = 'toàn thời gian';
            if (type === 'part-time') typeVi = 'bán thời gian';
            else if (type === 'outsourced') typeVi = 'thuê ngoài';
            
            return `Tuyển dụng lại với tư cách là ${pos} ${typeVi}`;
        }
        
        // 2. Rehired with basic salary [amount] VND
        const salaryRehireMatch = text.match(/Re-?hired\s+with\s+basic\s+salary\s+(.*)\s+VND/i);
        if (salaryRehireMatch) {
            const amt = salaryRehireMatch[1];
            return `Được tuyển dụng lại với mức lương cơ bản là ${amt} VND`;
        }

        return text;
    }

    // Merge both histories into a unified timeline
    const timeline = useMemo(() => {
        const events: any[] = []
        const mergedSalaryIds = new Set<string>()

        roleHistory.forEach(r => {
            const isRehire = r.reason?.toUpperCase().startsWith('[RE-HIRED]')
            const isResignation = r.reason?.toUpperCase().startsWith('[RESIGNATION]')
            const isDismissal = r.reason?.toUpperCase().startsWith('[DISMISSAL]')
            const isRejection = r.reason?.toUpperCase().startsWith('[REJECTION]')

            // A resignation, dismissal, or rejection role event does NOT have a matching salary event
            if (isResignation || isDismissal || isRejection) {
                events.push({
                    type: 'role',
                    date: r.effective_date,
                    created_at: r.created_at,
                    data: r
                })
                return
            }

            // Find a salary event on the same effective_date
            const matchingSalary = salaryHistory.find(s => 
                s.effective_date === r.effective_date && 
                !mergedSalaryIds.has(s.id)
            )

            if (matchingSalary) {
                mergedSalaryIds.add(matchingSalary.id)
                if (isRehire) {
                    events.push({
                        type: 're-hired',
                        date: r.effective_date,
                        created_at: r.created_at,
                        data: {
                            role: r,
                            salary: matchingSalary
                        }
                    })
                } else {
                    events.push({
                        type: 'promotion',
                        date: r.effective_date,
                        created_at: r.created_at,
                        data: {
                            role: r,
                            salary: matchingSalary
                        }
                    })
                }
            } else {
                events.push({
                    type: 'role',
                    date: r.effective_date,
                    created_at: r.created_at,
                    data: r
                })
            }
        })

        salaryHistory.forEach(s => {
            if (!mergedSalaryIds.has(s.id)) {
                events.push({
                    type: 'salary',
                    date: s.effective_date,
                    created_at: s.created_at,
                    data: s
                })
            }
        })

        // Add start date as first event
        if (staff.start_date) {
            const hasOverlappingStart = events.some(e => e.date === staff.start_date && (e.type === 're-hired' || e.type === 'start'))
            if (!hasOverlappingStart) {
                events.push({ type: 'start', date: staff.start_date, created_at: staff.start_date, data: { text: 'Started employment' } })
            }
        }

        // Stable sort: by date descending, then by created_at descending
        return events.sort((a, b) => {
            const dateA = new Date(a.date).getTime()
            const dateB = new Date(b.date).getTime()
            if (dateA !== dateB) return dateB - dateA

            const timeA = a.created_at ? new Date(a.created_at).getTime() : 0
            const timeB = b.created_at ? new Date(b.created_at).getTime() : 0
            return timeB - timeA
        })
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
            if (payload.employment_type) {
                staffUpdates.employment_type = payload.employment_type
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
            alert(language === 'vi' ? 'Không thể lưu bản ghi.' : 'Failed to save record.')
        } finally {
            setSaving(false)
        }
    }

    const getEmploymentTypeLabel = (type: string) => {
        if (type === 'full_time') return language === 'vi' ? 'Toàn thời gian' : 'Full-Time';
        if (type === 'part_time') return language === 'vi' ? 'Bán thời gian' : 'Part-Time';
        return language === 'vi' ? 'Thuê ngoài' : 'Outsourced';
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-500">
                        {language === 'vi' ? 'Lịch sử công việc' : 'Career Journey'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {language === 'vi' ? 'Dòng thời gian tăng lương gộp và thăng chức vị trí.' : 'Timeline of gross salary increases and role promotions.'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setModalOpen(true)} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all whitespace-nowrap">
                        <Plus className="w-4 h-4" /> {language === 'vi' ? 'Ghi nhận thay đổi' : 'Record Change'}
                    </button>
                </div>
            </div>

            <SalaryModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSave={handleSaveSalary}
                onResign={onResign}
                entry={null}
                staffList={[staff]}
                departments={departments}
                positions={positions}
                saving={saving}
                loggedUserName={loggedUserName}
                preselectedStaffId={staff.id}
            />

            <div className="relative pl-6 border-l-2 border-gray-100 space-y-8 mt-8">
                {timeline.length === 0 && <p className="text-sm text-gray-400">{language === 'vi' ? 'Chưa ghi nhận sự kiện nào.' : 'No events recorded.'}</p>}
                
                {timeline.map((event, i) => {
                    let dotColor = 'bg-blue-500';
                    if (event.type === 'start') dotColor = 'bg-emerald-500';
                    else if (event.type === 're-hired') dotColor = 'bg-emerald-500';
                    else if (event.type === 'promotion') dotColor = 'bg-indigo-500';

                    return (
                        <div key={i} className="relative">
                            <div className={`absolute -left-[31px] w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${dotColor}`} />
                            <div className="bg-white border border-gray-100 shadow-sm rounded-xl p-4">
                                <span className="text-xs font-semibold text-gray-400 bg-gray-50 px-2 py-1 rounded-md mb-2 inline-block">
                                    {fmtDate(event.date)}
                                </span>

                                {event.type === 'start' && (
                                    <p className="text-sm text-gray-900 font-medium">
                                        ✨ {language === 'vi' ? 'Bắt đầu làm việc tại công ty.' : 'Started employment at the company.'}
                                    </p>
                                )}

                                {event.type === 're-hired' && (() => {
                                    const match = event.data.role.reason?.match(/^\[(RE-HIRED)\]\s*(.*)/i);
                                    const text = match ? match[2] : event.data.role.reason;
                                    return (
                                        <div>
                                            <p className="text-sm text-gray-900 font-medium tracking-tight flex items-center gap-2">
                                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700">
                                                    {language === 'vi' ? 'Tuyển dụng lại' : 'Re-Hired'}
                                                </span>
                                            </p>
                                            {text && <p className="text-sm text-gray-600 mt-2">{formatTimelineText(text)}</p>}
                                            {event.data.role.notes && <p className="text-xs text-gray-500 mt-1 italic">"{formatTimelineText(event.data.role.notes)}"</p>}
                                            
                                            {event.data.salary && (
                                                <div className="flex items-center gap-2 mt-3 font-mono text-sm pt-2 border-t border-gray-100">
                                                    <span className="text-xs text-gray-400 font-sans mr-1">{language === 'vi' ? 'Lương:' : 'Salary:'}</span>
                                                    <span className="text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-md">{fmtVND(event.data.salary.new_amount)}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {event.type === 'promotion' && (
                                    <div>
                                        <p className="text-sm text-gray-900 font-medium tracking-tight">
                                            {language === 'vi' ? 'Thăng chức & Thay đổi lương gộp' : 'Promotion & Gross Salary Change'}
                                        </p>
                                        {(event.data.role.old_position || event.data.role.new_position) && (
                                            <p className="text-xs text-blue-600 mt-1.5 mb-2.5 flex items-center gap-1.5 font-medium bg-blue-50 w-fit px-2.5 py-1 rounded-md border border-blue-100">
                                                {event.data.role.old_position?.name || (language === 'vi' ? 'Không rõ' : 'Unknown')} 
                                                <ArrowLeft className="w-3 h-3 rotate-180" />
                                                {event.data.role.new_position?.name || (language === 'vi' ? 'Không rõ' : 'Unknown')}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-3 mt-1.5 font-mono text-sm">
                                            <span className="line-through text-gray-400">{fmtVND(event.data.salary.previous_amount)}</span>
                                            <ArrowLeft className="w-3 h-3 text-gray-300 rotate-180" />
                                            <span className="text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-md">{fmtVND(event.data.salary.new_amount)}</span>
                                            {event.data.salary.increase_type === 'percentage' && event.data.salary.increase_value && (
                                                <span className="text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded">+{event.data.salary.increase_value}%</span>
                                            )}
                                        </div>
                                        {event.data.role.reason && <p className="text-xs text-gray-500 mt-2 italic">"{formatTimelineText(event.data.role.reason)}"</p>}
                                    </div>
                                )}

                                {event.type === 'salary' && (
                                    <div>
                                        <p className="text-sm text-gray-900 font-medium tracking-tight">
                                            {event.data.record_type === 'promotion' 
                                                ? (language === 'vi' ? 'Thăng chức & Thay đổi lương gộp' : 'Promotion & Gross Salary Change') 
                                                : (language === 'vi' ? 'Thay đổi lương gộp' : 'Gross Salary Change')}
                                            <span className="text-gray-400 font-normal ml-1">
                                                ({event.data.previous_employment_type && event.data.previous_employment_type !== event.data.employment_type 
                                                    ? `${getEmploymentTypeLabel(event.data.previous_employment_type)} → ${getEmploymentTypeLabel(event.data.employment_type)}` 
                                                    : (event.data.employment_type 
                                                        ? getEmploymentTypeLabel(event.data.employment_type)
                                                        : (event.data.salary_type === 'fixed' ? (language === 'vi' ? 'Toàn thời gian' : 'Full-Time') : (language === 'vi' ? 'Bán thời gian' : 'Part-Time')))}
                                                )
                                            </span>
                                        </p>
                                        {event.data.record_type === 'promotion' && (event.data.previous_position || event.data.new_position) && (
                                            <p className="text-xs text-blue-600 mt-1.5 mb-2.5 flex items-center gap-1.5 font-medium bg-blue-50 w-fit px-2.5 py-1 rounded-md border border-blue-100">
                                                {event.data.previous_position?.name || (language === 'vi' ? 'Không rõ' : 'Unknown')} 
                                                <ArrowLeft className="w-3 h-3 rotate-180" />
                                                {event.data.new_position?.name || (language === 'vi' ? 'Không rõ' : 'Unknown')}
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
                                                <span className="text-xs font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                                                    {language === 'vi' ? 'Thay đổi hình thức' : 'Type Changed'}
                                                </span>
                                            )}
                                        </div>
                                        {event.data.reason && <p className="text-xs text-gray-500 mt-2 italic">"{formatTimelineText(event.data.reason)}"</p>}
                                    </div>
                                )}

                                {event.type === 'role' && (() => {
                                    const match = event.data.reason?.match(/^\[(RESIGNATION|DISMISSAL|REJECTION|RE-HIRED|ACTIVE)\]\s*(.*)/i);
                                    if (match) {
                                        const actionType = match[1].toUpperCase();
                                        const text = match[2];
                                        let badgeClass = "bg-gray-100 text-gray-700";
                                        let label = "Status Change";
                                        
                                        if (actionType === 'REJECTION') { 
                                            badgeClass = "bg-purple-100 text-purple-700"; 
                                            label = language === 'vi' ? 'Từ chối thử việc' : 'Probation Rejected'; 
                                        } else if (actionType === 'DISMISSAL') { 
                                            badgeClass = "bg-red-100 text-red-700"; 
                                            label = language === 'vi' ? 'Đã sa thải' : 'Dismissed'; 
                                        } else if (actionType === 'RESIGNATION') { 
                                            badgeClass = "bg-orange-100 text-orange-700"; 
                                            label = language === 'vi' ? 'Đã thôi việc' : 'Resigned'; 
                                        } else if (actionType === 'RE-HIRED') { 
                                            badgeClass = "bg-emerald-100 text-emerald-700"; 
                                            label = language === 'vi' ? 'Tuyển dụng lại' : 'Re-Hired'; 
                                        } else if (actionType === 'ACTIVE') { 
                                            badgeClass = "bg-blue-100 text-blue-700"; 
                                            label = language === 'vi' ? 'Trạng thái hoạt động' : 'Status Active'; 
                                        } else {
                                            label = language === 'vi' ? 'Thay đổi trạng thái' : 'Status Change';
                                        }

                                        return (
                                            <div>
                                                <p className="text-sm text-gray-900 font-medium tracking-tight flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${badgeClass}`}>{label}</span>
                                                </p>
                                                {text && <p className="text-sm text-gray-600 mt-2">{formatTimelineText(text)}</p>}
                                                {event.data.notes && <p className="text-xs text-gray-500 mt-1 italic">"{formatTimelineText(event.data.notes)}"</p>}
                                            </div>
                                        )
                                    }

                                    return (
                                        <div>
                                            <p className="text-sm text-gray-900 font-medium tracking-tight">
                                                {language === 'vi' ? 'Điều chuyển vị trí' : 'Role Transfer'}
                                            </p>
                                            <p className="text-sm text-gray-600 mt-1">
                                                {language === 'vi' ? (
                                                    <>Điều chuyển từ <strong>{event.data.old_position?.name || 'Không rõ'}</strong> sang <strong className="text-blue-600">{event.data.new_position?.name || 'Không rõ'}</strong></>
                                                ) : (
                                                    <>Moved from <strong>{event.data.old_position?.name || 'Unknown'}</strong> to <strong className="text-blue-600">{event.data.new_position?.name || 'Unknown'}</strong></>
                                                )}
                                            </p>
                                            {event.data.reason && <p className="text-xs text-gray-500 mt-2 italic">"{formatTimelineText(event.data.reason)}"</p>}
                                        </div>
                                    )
                                })()}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    )
}

// ==========================================
// TAB: Performance
// ==========================================
function TabPerformance({ staff, performances, onUpdate, allCategories }: { staff: HRStaffMember, performances: HRStaffPerformance[], onUpdate: () => void, allCategories: HRRatingCategory[] }) {
    const { language } = useSettings()
    const [modalOpen, setModalOpen] = useState(false);
    const [editingReview, setEditingReview] = useState<HRStaffPerformance | null>(null);
    const [saving, setSaving] = useState(false);
    const [exportingId, setExportingId] = useState<string | null>(null);

    const previousGoals = useMemo(() => {
        if (!editingReview) {
            return performances.length > 0 ? performances[0].goals || undefined : undefined;
        }
        const idx = performances.findIndex(p => p.id === editingReview.id);
        if (idx >= 0 && idx + 1 < performances.length) {
            return performances[idx + 1].goals || undefined;
        }
        return undefined;
    }, [editingReview, performances]);

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
            alert(language === 'vi' ? 'Không thể lưu bản đánh giá' : 'Failed to save review');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteReview = async (id: string) => {
        if (!confirm(language === 'vi' ? 'Bạn có chắc chắn muốn xóa bản đánh giá hiệu suất này không?' : 'Are you sure you want to delete this performance review?')) return;
        try {
            const { error } = await supabase.from('hr_staff_performance').delete().eq('id', id);
            if (error) throw error;
            onUpdate();
            setModalOpen(false);
        } catch (err) {
            console.error(err);
            alert(language === 'vi' ? 'Không thể xóa bản đánh giá' : 'Failed to delete review');
        }
    };

    const handleSkillLevelChange = async (level: number) => {
        try {
            const { error } = await supabase.from('hr_staff').update({ skill_level: level }).eq('id', staff.id);
            if (error) throw error;
            onUpdate();
        } catch (err: any) {
            console.error(err);
            alert(language === 'vi' ? `Không thể cập nhật trình độ kỹ năng: ${err.message || JSON.stringify(err)}` : `Failed to update skill level: ${err.message || JSON.stringify(err)}`);
        }
    };

    const handleExportReview = async (e: React.MouseEvent, p: HRStaffPerformance) => {
        e.stopPropagation();
        setExportingId(p.id);
        try {
            const ExcelJS = (await import('exceljs')).default;
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Review');

            sheet.getColumn(1).width = 30;
            sheet.getColumn(2).width = 70;

            const titleRow = sheet.addRow(['PERFORMANCE REVIEW', '']);
            sheet.mergeCells('A1:B1');
            titleRow.height = 30;
            titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
            titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
            titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

            sheet.addRow([]);

            const addDataRow = (label: string, value: string | number, isHighlight = false) => {
                const r = sheet.addRow([label, value]);
                r.getCell(1).font = { bold: true, color: { argb: 'FF374151' } };
                r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
                r.getCell(1).alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
                r.getCell(1).border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
                
                r.getCell(2).font = { bold: isHighlight, color: isHighlight ? { argb: 'FF1D4ED8' } : { argb: 'FF111827' } };
                r.getCell(2).alignment = { vertical: 'top', horizontal: 'left', indent: 1, wrapText: true };
                r.getCell(2).border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
                return r;
            };

            const headerGeneralRow = sheet.addRow(['General Information', '']);
            sheet.mergeCells(`A${sheet.lastRow!.number}:B${sheet.lastRow!.number}`);
            headerGeneralRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
            headerGeneralRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
            headerGeneralRow.getCell(1).alignment = { vertical: 'middle', indent: 1 };
            
            addDataRow('Staff Member', staff.full_name || 'Unknown Staff');
            addDataRow('Period', p.period || '-');
            addDataRow('Date', fmtDate(p.review_date));
            addDataRow('Reviewer', p.reviewer_name || 'System');
            
            const catsObj = p.category_ratings || {};
            const vals = Object.values(catsObj);
            const avg = vals.length ? vals.reduce((a:any, b:any) => a + b, 0) / vals.length : 0;
            const overallRounded = Math.round(avg) || p.rating || 0;
            const ratingLabel = OVERALL_LABELS[overallRounded]?.label || '';
            addDataRow('Overall Rating', `${avg.toFixed(1)} / 5 - ${ratingLabel}`, true);
            
            sheet.addRow([]);

            const headerCatsRow = sheet.addRow(['Category Ratings', '']);
            sheet.mergeCells(`A${sheet.lastRow!.number}:B${sheet.lastRow!.number}`);
            headerCatsRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
            headerCatsRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
            headerCatsRow.getCell(1).alignment = { vertical: 'middle', indent: 1 };
            
            for (const [key, val] of Object.entries(catsObj)) {
                if (val === 0) continue;
                const dbCat = allCategories.find(c => c.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '') === key);
                let keyLabel = '';
                if (dbCat) {
                    keyLabel = language === 'vi' 
                        ? (dbCat.label_vi || (dbCat.label.toLowerCase().trim() === 'quality of work' ? 'Chất lượng công việc' : dbCat.label)) 
                        : dbCat.label; // fallback rapido per evitare import dinamici pesanti se non necessari, oppure copriamo i più comuni
                } else {
                    keyLabel = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                }
                addDataRow(keyLabel, `${val} / 5`);
            }

            sheet.addRow([]);

            const headerTextRow = sheet.addRow(['Comments & Goals', '']);
            sheet.mergeCells(`A${sheet.lastRow!.number}:B${sheet.lastRow!.number}`);
            headerTextRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
            headerTextRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B5CF6' } };
            headerTextRow.getCell(1).alignment = { vertical: 'middle', indent: 1 };

            addDataRow('Comments', p.notes || 'No comments provided.');
            addDataRow('Goals', p.goals || 'No goals set.');

            const buffer = await workbook.xlsx.writeBuffer();
            const safeName = (staff.full_name || 'Staff').replace(/[^a-z0-9]/gi, '_');
            const safePeriod = (p.period || 'Unknown').replace(/[^a-z0-9]/gi, '_');
            
            saveAs(new Blob([buffer]), `Review_${safeName}_${safePeriod}.xlsx`);
        } catch (err) {
            console.error('Export error', err);
            alert(language === 'vi' ? 'Không thể xuất bản đánh giá' : 'Failed to export review');
        }
        setExportingId(null);
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* BASE SKILLS LEVEL SECTION */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <BadgeCheck className="w-5 h-5 text-indigo-600" />
                            {language === 'vi' ? 'Trình độ kỹ năng vận hành' : 'Operational Skill Level'}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                            {language === 'vi' ? 'Thiết lập mức năng lực cơ bản cho các yêu cầu tự động sắp xếp lịch làm việc.' : 'Set the base capability level for auto-scheduling requirements.'}
                        </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map(level => (
                            <button
                                key={level}
                                onClick={() => handleSkillLevelChange(level)}
                                className={`p-1 transition-all rounded-lg hover:scale-110 ${
                                    (staff.skill_level || 1) >= level 
                                    ? 'text-indigo-600' 
                                    : 'text-gray-200 hover:text-indigo-300'
                                }`}
                                title={language === 'vi' ? `Cấp độ ${level}` : `Level ${level}`}
                            >
                                <Star className={`w-8 h-8 ${ (staff.skill_level || 1) >= level ? 'fill-indigo-600' : ''}`} />
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-500">
                        {language === 'vi' ? 'Theo dõi hiệu suất' : 'Performance Tracking'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {language === 'vi' ? 'Giám sát sự phát triển, các đánh giá trước đây và các mục tiêu chính.' : 'Monitor growth, past reviews and key goals.'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => { setEditingReview(null); setModalOpen(true); }} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all whitespace-nowrap">
                        <Plus className="w-4 h-4" /> {language === 'vi' ? 'Thêm đánh giá' : 'Add Review'}
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
                readOnly={!!editingReview}
                onDelete={handleDeleteReview}
                previousGoals={previousGoals}
            />

            {/* CHART */}
            {chartData.length > 0 ? (
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart 
                            data={chartData} 
                            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                            onClick={(state: any) => {
                                if (state && state.activePayload && state.activePayload.length > 0) {
                                    const rawDate = state.activePayload[0].payload.rawDate;
                                    const p = performances.find(p => p.review_date === rawDate);
                                    if (p) {
                                        setEditingReview(p);
                                        setModalOpen(true);
                                    }
                                }
                            }}
                            style={{ cursor: 'pointer' }}
                        >
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
                    <p className="text-sm text-gray-400">
                        {language === 'vi' ? 'Không có đủ dữ liệu để hiển thị biểu đồ xu hướng. Hãy thêm đánh giá!' : 'Not enough data to display trend chart. Add a review!'}
                    </p>
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
                                    <p className="text-xs text-gray-500">{language === 'vi' ? 'Bởi' : 'By'} {p.reviewer_name || 'System'}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={(e) => handleExportReview(e, p)}
                                    disabled={exportingId === p.id}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title={language === 'vi' ? 'Xuất đánh giá sang Excel' : 'Export Review as Excel'}
                                >
                                    {exportingId === p.id ? <div className="w-4 h-4 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" /> : <FileDown className="w-4 h-4" />}
                                </button>
                                <Pencil className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 transition-colors" />
                            </div>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed italic border-l-2 border-emerald-200 pl-3">
                            "{p.notes || (language === 'vi' ? 'Không có ghi chú cụ thể cho phần đánh giá này.' : 'No specific notes provided for this review segment.')}"
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
    const { language } = useSettings()
    const [activeTab, setActiveTab] = useState<'fines' | 'warnings' | 'awards'>('fines')
    
    // States for Fines
    const [fines, setFines] = useState<HRStaffFine[]>([])
    const [catalog, setCatalog] = useState<HRDisciplinaryCatalog[]>([])
    
    // States for Warnings
    const [warnings, setWarnings] = useState<HRStaffWarning[]>([])
    
    // States for Awards
    const [awards, setAwards] = useState<HRStaffAward[]>([])
    const [awardsCatalog, setAwardsCatalog] = useState<HRAwardsCatalog[]>([])

    const [loading, setLoading] = useState(false)
    const [modalOpen, setModalOpen] = useState(false)
    
    // Editing Node States
    const [editingFine, setEditingFine] = useState<HRStaffFine | null>(null)
    const [editingWarning, setEditingWarning] = useState<HRStaffWarning | null>(null)
    const [editingAward, setEditingAward] = useState<HRStaffAward | null>(null)
    
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

    const monthLabel = new Date(year, month).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' })
    const monthInputValue = `${year}-${String(month + 1).padStart(2, '0')}`

    const fetchAll = useCallback(async () => {
        setLoading(true)
        const endDate = new Date(year, month + 1, 0) // last day
        
        try {
            const [finesRes, catRes, warningsRes, awardsRes, awardsCatRes] = await Promise.all([
                supabase.from('hr_staff_fines')
                    .select('*')
                    .eq('staff_id', staff.id)
                    .neq('deduction_source', 'cash')
                    .gte('date', `${year}-${String(month + 1).padStart(2, '0')}-01`)
                    .lte('date', `${year}-${String(month + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`)
                    .order('date', { ascending: false }),
                supabase.from('hr_disciplinary_catalog')
                    .select('*')
                    .order('infraction_name', { ascending: true }),
                supabase.from('hr_staff_warnings')
                    .select('*')
                    .eq('staff_id', staff.id)
                    .gte('date', `${year}-${String(month + 1).padStart(2, '0')}-01`)
                    .lte('date', `${year}-${String(month + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`)
                    .order('date', { ascending: false }),
                supabase.from('hr_staff_awards')
                    .select('*')
                    .eq('staff_id', staff.id)
                    .neq('deduction_source', 'cash')
                    .gte('date', `${year}-${String(month + 1).padStart(2, '0')}-01`)
                    .lte('date', `${year}-${String(month + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`)
                    .order('date', { ascending: false }),
                supabase.from('hr_awards_catalog')
                    .select('*')
                    .order('award_name', { ascending: true })
            ])
                
            if (finesRes.error) throw finesRes.error
            if (catRes.error) throw catRes.error
            if (warningsRes.error) throw warningsRes.error
            if (awardsRes.error) throw awardsRes.error
            if (awardsCatRes.error) throw awardsCatRes.error
            
            setFines(finesRes.data || [])
            setWarnings(warningsRes.data || [])
            setAwards(awardsRes.data || [])
            
            // Filter catalog based on applicability
            const allCatalog = (catRes.data as HRDisciplinaryCatalog[]) || []
            const filteredCatalog = allCatalog.filter(c => {
                if (!c.applicability_type || c.applicability_type === 'global') return true;
                if (c.applicability_type === 'department' && c.target_id === staff.department_id) return true;
                if (c.applicability_type === 'position' && c.target_id === staff.position_id) return true;
                return false;
            })
            setCatalog(filteredCatalog)

            // Filter awards catalog
            const allAwardsCatalog = (awardsCatRes.data as HRAwardsCatalog[]) || []
            const filteredAwardsCatalog = allAwardsCatalog.filter(c => {
                if (!c.applicability_type || c.applicability_type === 'global') return true;
                if (c.applicability_type === 'department' && c.target_id === staff.department_id) return true;
                if (c.applicability_type === 'position' && c.target_id === staff.position_id) return true;
                return false;
            })
            setAwardsCatalog(filteredAwardsCatalog)
        } catch (err) {
            console.error('Error fetching data', err)
        } finally {
            setLoading(false)
        }
    }, [staff.id, staff.department_id, staff.position_id, year, month])

    useEffect(() => {
        fetchAll()
    }, [fetchAll])

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

    // SAVING LOGIC
    async function handleSaveFine(formData: Partial<HRStaffFine>) {
        try {
            if (editingFine) {
                const { error } = await supabase.from('hr_staff_fines').update(formData).eq('id', editingFine.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('hr_staff_fines').insert([{
                    ...formData,
                    staff_id: staff.id
                }])
                if (error) throw error
            }
            fetchAll()
            setModalOpen(false)
        } catch (err) {
            console.error(err)
            alert(language === 'vi' ? 'Không thể lưu quyết định kỷ luật' : 'Failed to save fine')
            throw err
        }
    }

    async function handleSaveWarning(formData: Partial<HRStaffWarning>) {
        try {
            if (editingWarning) {
                const { error } = await supabase.from('hr_staff_warnings').update(formData).eq('id', editingWarning.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('hr_staff_warnings').insert([{
                    ...formData,
                    staff_id: staff.id
                }])
                if (error) throw error
            }
            fetchAll()
            setModalOpen(false)
        } catch (err) {
            console.error(err)
            alert(language === 'vi' ? 'Không thể lưu cảnh cáo' : 'Failed to save flag')
            throw err
        }
    }

    async function handleSaveAward(formData: Partial<HRStaffAward>) {
        try {
            if (editingAward) {
                const { error } = await supabase.from('hr_staff_awards').update(formData).eq('id', editingAward.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('hr_staff_awards').insert([{
                    ...formData,
                    staff_id: staff.id
                }])
                if (error) throw error
            }
            fetchAll()
            setModalOpen(false)
        } catch (err) {
            console.error(err)
            alert(language === 'vi' ? 'Không thể lưu khen thưởng' : 'Failed to save award')
            throw err
        }
    }
    
    // DELETION LOGIC
    async function handleDeleteFine(id: string) {
        if (!window.confirm(language === 'vi' ? 'Bạn có chắc chắn muốn xóa tiền phạt này không?' : 'Are you sure you want to delete this fine?')) return
        try {
            const { error } = await supabase.from('hr_staff_fines').delete().eq('id', id)
            if (error) throw error
            fetchAll()
        } catch (err) {
            console.error(err)
            alert(language === 'vi' ? 'Không thể xóa tiền phạt' : 'Failed to delete fine')
        }
    }

    async function handleDeleteWarning(id: string) {
        if (!window.confirm(language === 'vi' ? 'Bạn có chắc chắn muốn xóa cảnh cáo này không?' : 'Are you sure you want to delete this flag?')) return
        try {
            const { error } = await supabase.from('hr_staff_warnings').delete().eq('id', id)
            if (error) throw error
            fetchAll()
        } catch (err) {
            console.error(err)
            alert(language === 'vi' ? 'Không thể xóa cảnh cáo' : 'Failed to delete flag')
        }
    }

    async function handleDeleteAward(id: string) {
        if (!window.confirm(language === 'vi' ? 'Bạn có chắc chắn muốn xóa khen thưởng này không?' : 'Are you sure you want to delete this award?')) return
        try {
            const { error } = await supabase.from('hr_staff_awards').delete().eq('id', id)
            if (error) throw error
            fetchAll()
        } catch (err) {
            console.error(err)
            alert(language === 'vi' ? 'Không thể xóa khen thưởng' : 'Failed to delete award')
        }
    }

    // STATUS CHANGES
    async function handleFineStatusChange(id: string, newStatus: string) {
        try {
            setFines(prev => prev.map(f => f.id === id ? { ...f, status: newStatus as any } : f))
            const { error } = await supabase.from('hr_staff_fines').update({ status: newStatus }).eq('id', id)
            if (error) throw error
        } catch(err) {
            console.error(err)
            alert(language === 'vi' ? 'Không thể cập nhật trạng thái' : 'Failed to update status')
            fetchAll()
        }
    }

    async function handleAwardStatusChange(id: string, newStatus: string) {
        try {
            setAwards(prev => prev.map(a => a.id === id ? { ...a, status: newStatus as any } : a))
            const { error } = await supabase.from('hr_staff_awards').update({ status: newStatus }).eq('id', id)
            if (error) throw error
        } catch(err) {
            console.error(err)
            alert(language === 'vi' ? 'Không thể cập nhật trạng thái' : 'Failed to update status')
            fetchAll()
        }
    }

    const totalFinesAmount = fines.reduce((sum, f) => sum + Number(f.amount || 0), 0)
    const totalAwardsAmount = awards.reduce((sum, a) => sum + Number(a.amount || 0), 0)

    const baseBtn = 'flex items-center gap-1 text-gray-500 hover:text-gray-900 transition'

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-500">
                        {language === 'vi' ? 'Kỷ Luật, Cảnh Báo & Thưởng' : 'Disciplinary Actions, Warnings & Awards'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {language === 'vi' ? 'Hồ sơ kỷ luật, cảnh cáo và khen thưởng của nhân viên.' : 'Record infractions, warning flags and awards for this staff.'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => { 
                            setEditingFine(null); 
                            setEditingWarning(null); 
                            setEditingAward(null);
                            setModalOpen(true); 
                        }} 
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all whitespace-nowrap"
                    >
                        <Plus className="w-4 h-4" /> 
                        {activeTab === 'fines' ? (language === 'vi' ? 'Thêm Kỷ Luật' : 'Add Fine') :
                         activeTab === 'warnings' ? (language === 'vi' ? 'Thêm Cảnh Cáo' : 'Add Flag') :
                         (language === 'vi' ? 'Thêm Khen Thưởng' : 'Add Award')}
                    </button>
                </div>
            </div>

            {/* TAB MINIMALISTE */}
            <div className="flex border-b border-gray-200 mb-6 gap-6 px-2">
                <button 
                    onClick={() => setActiveTab('fines')}
                    className={`pb-3 text-sm font-bold border-b-2 transition-all ${activeTab === 'fines' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                >
                    {language === 'vi' ? 'Tiền Phạt' : 'Fines'}
                </button>
                <button 
                    onClick={() => setActiveTab('warnings')}
                    className={`pb-3 text-sm font-bold border-b-2 transition-all ${activeTab === 'warnings' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                >
                    {language === 'vi' ? 'Cảnh Cáo & Thẻ' : 'Warnings & Flags'}
                </button>
                <button 
                    onClick={() => setActiveTab('awards')}
                    className={`pb-3 text-sm font-bold border-b-2 transition-all ${activeTab === 'awards' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                >
                    {language === 'vi' ? 'Khen Thưởng' : 'Awards'}
                </button>
            </div>

            {/* Month Nav */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between">
                <button type="button" onClick={prevMonth} className={baseBtn}>
                    <ChevronLeft className="w-4 h-4" /> <span>{language === 'vi' ? 'Trước' : 'Previous'}</span>
                </button>
                <div className="flex items-center gap-2 font-semibold text-gray-900">
                    <span>{monthLabel}</span>
                    <div className="relative w-5 h-5 group">
                        <CalendarDays className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors cursor-pointer" />
                        <input type="month" value={monthInputValue} onChange={e => onPickMonth(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                    </div>
                </div>
                <button type="button" onClick={nextMonth} className={baseBtn}>
                    <span>{language === 'vi' ? 'Sau' : 'Next'}</span> <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Tables */}
            <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm">
                <div className="overflow-x-auto">
                    
                    {/* TAB 1: FINES */}
                    {activeTab === 'fines' && (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs font-semibold uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3 border-r border-gray-100">{language === 'vi' ? 'Ngày' : 'Date'}</th>
                                    <th className="px-4 py-3 border-r border-gray-100">{language === 'vi' ? 'Vi Phạm' : 'Infraction'}</th>
                                    <th className="px-4 py-3 border-r border-gray-100">{language === 'vi' ? 'Người Báo Cáo' : 'Notified By'}</th>
                                    <th className="px-4 py-3 border-r border-gray-100">{language === 'vi' ? 'Nguồn' : 'Source'}</th>
                                    <th className="px-4 py-3 border-r border-gray-100 text-center">{language === 'vi' ? 'Trạng Thái' : 'Status'}</th>
                                    <th className="px-4 py-3 border-r border-gray-100 text-right">{language === 'vi' ? 'Số Tiền (VND)' : 'Amount (VND)'}</th>
                                    <th className="px-4 py-3 text-center">{language === 'vi' ? 'Hành Động' : 'Actions'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr><td colSpan={7} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500 mx-auto" /></td></tr>
                                ) : fines.length === 0 ? (
                                    <tr><td colSpan={7} className="text-center py-8 text-gray-400">{language === 'vi' ? 'Không có tiền phạt nào được ghi nhận cho tháng này.' : 'No fines recorded for this month.'}</td></tr>
                                ) : (
                                    fines.map(f => (
                                        <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-900 font-medium">{fmtDate(f.date)}</td>
                                            <td className="px-4 py-3 border-r border-gray-100 max-w-xs truncate" title={f.infraction}>{f.infraction}</td>
                                            <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-700">{f.notified_by || '-'}</td>
                                            <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-700">
                                                {f.deduction_source === 'salary' ? (language === 'vi' ? 'Khấu trừ lương gộp' : 'Gross salary deduction') :
                                                 f.deduction_source === 'service_charge' ? (language === 'vi' ? 'Khấu trừ phí phục vụ' : 'Service charge deduction') :
                                                 f.deduction_source === 'cash' ? (language === 'vi' ? 'Tiền mặt/Chuyển khoản' : 'Direct cash/transfer') :
                                                 (f.deduction_source || '-').replace('_', ' ')}
                                            </td>
                                            <td className="px-4 py-3 border-r border-gray-100 text-center">
                                                <select 
                                                    value={f.status} 
                                                    onChange={(e) => handleFineStatusChange(f.id, e.target.value)}
                                                    className={`text-[10px] font-bold tracking-wider uppercase cursor-pointer rounded-full border px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-transparent hover:bg-white
                                                        ${f.status === 'paid' ? 'text-emerald-600 border-emerald-200' : 
                                                          f.status === 'waived' ? 'text-gray-600 border-gray-200' :
                                                          f.status === 'disputed' ? 'text-red-600 border-red-200' :
                                                          'text-amber-600 border-amber-200'}
                                                    `}
                                                >
                                                    <option value="pending">{language === 'vi' ? 'CHỜ XỬ LÝ' : 'PENDING'}</option>
                                                    <option value="paid">{language === 'vi' ? 'ĐÃ NỘP' : 'PAID'}</option>
                                                    <option value="waived">{language === 'vi' ? 'ĐƯỢC MIỄN' : 'WAIVED'}</option>
                                                    <option value="disputed">{language === 'vi' ? 'ĐANG TRANH CHẤP' : 'DISPUTED'}</option>
                                                </select>
                                            </td>
                                            <td className="px-4 py-3 border-r border-gray-100 text-right font-mono font-medium text-red-600">
                                                -{fmtVND(f.amount)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button onClick={() => { setEditingFine(f); setModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title={language === 'vi' ? 'Chỉnh sửa' : 'Edit'}><Pencil className="w-4 h-4" /></button>
                                                    <button onClick={() => handleDeleteFine(f.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={language === 'vi' ? 'Xóa' : 'Delete'}><Trash2 className="w-4 h-4" /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {!loading && fines.length > 0 && (
                                <tfoot className="bg-gray-50 border-t border-gray-200 text-sm font-bold text-gray-900">
                                    <tr>
                                        <td colSpan={5} className="px-4 py-3 text-right">{language === 'vi' ? 'Tổng Tiền Phạt' : 'Total Fines'}</td>
                                        <td className="px-4 py-3 text-right text-red-600 font-mono">-{fmtVND(totalFinesAmount)}</td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    )}

                    {/* TAB 2: WARNINGS */}
                    {activeTab === 'warnings' && (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs font-semibold uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3 border-r border-gray-100">{language === 'vi' ? 'Ngày' : 'Date'}</th>
                                    <th className="px-4 py-3 border-r border-gray-100 text-center w-36">{language === 'vi' ? 'Mức Cảnh Báo' : 'Flag Type'}</th>
                                    <th className="px-4 py-3 border-r border-gray-100">{language === 'vi' ? 'Lý Do' : 'Reason'}</th>
                                    <th className="px-4 py-3 border-r border-gray-100">{language === 'vi' ? 'Người Báo Cáo' : 'Notified By'}</th>
                                    <th className="px-4 py-3 text-center">{language === 'vi' ? 'Hành Động' : 'Actions'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr><td colSpan={5} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500 mx-auto" /></td></tr>
                                ) : warnings.length === 0 ? (
                                    <tr><td colSpan={5} className="text-center py-8 text-gray-400">{language === 'vi' ? 'Không có cảnh cáo nào được ghi nhận cho tháng này.' : 'No flags recorded for this month.'}</td></tr>
                                ) : (
                                    warnings.map(w => (
                                        <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-900 font-medium">{fmtDate(w.date)}</td>
                                            <td className="px-4 py-3 border-r border-gray-100 text-center whitespace-nowrap">
                                                {w.flag_type === 'green' ? (
                                                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full text-xs font-semibold">
                                                        <Flag className="w-3 h-3 fill-emerald-500 text-emerald-500" />
                                                        {language === 'vi' ? 'Ghi chú tích cực' : 'Positive Note'}
                                                    </span>
                                                ) : w.flag_type === 'yellow' ? (
                                                    <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full text-xs font-semibold">
                                                        <Flag className="w-3 h-3 fill-amber-500 text-amber-500" />
                                                        {language === 'vi' ? 'Nhắc nhở' : 'Caution'}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-full text-xs font-semibold">
                                                        <Flag className="w-3 h-3 fill-red-500 text-red-500" />
                                                        {language === 'vi' ? 'Cảnh cáo' : 'Warning'}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 border-r border-gray-100 text-gray-700 max-w-sm truncate" title={formatWarningReason(w.reason, language)}>{formatWarningReason(w.reason, language)}</td>
                                            <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-700">{w.notified_by || '-'}</td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button onClick={() => { setEditingWarning(w); setModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title={language === 'vi' ? 'Chỉnh sửa' : 'Edit'}><Pencil className="w-4 h-4" /></button>
                                                    <button onClick={() => handleDeleteWarning(w.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={language === 'vi' ? 'Xóa' : 'Delete'}><Trash2 className="w-4 h-4" /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}

                    {/* TAB 3: AWARDS */}
                    {activeTab === 'awards' && (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs font-semibold uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3 border-r border-gray-100">{language === 'vi' ? 'Ngày' : 'Date'}</th>
                                    <th className="px-4 py-3 border-r border-gray-100">{language === 'vi' ? 'Khen Thưởng' : 'Award'}</th>
                                    <th className="px-4 py-3 border-r border-gray-100">{language === 'vi' ? 'Người Báo Cáo' : 'Notified By'}</th>
                                    <th className="px-4 py-3 border-r border-gray-100">{language === 'vi' ? 'Nguồn' : 'Source'}</th>
                                    <th className="px-4 py-3 border-r border-gray-100 text-center">{language === 'vi' ? 'Trạng Thái' : 'Status'}</th>
                                    <th className="px-4 py-3 border-r border-gray-100 text-right">{language === 'vi' ? 'Số Tiền (VND)' : 'Amount (VND)'}</th>
                                    <th className="px-4 py-3 text-center">{language === 'vi' ? 'Hành Động' : 'Actions'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr><td colSpan={7} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500 mx-auto" /></td></tr>
                                ) : awards.length === 0 ? (
                                    <tr><td colSpan={7} className="text-center py-8 text-gray-400">{language === 'vi' ? 'Không có khen thưởng nào được ghi nhận cho tháng này.' : 'No awards recorded for this month.'}</td></tr>
                                ) : (
                                    awards.map(a => (
                                        <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-900 font-medium">{fmtDate(a.date)}</td>
                                            <td className="px-4 py-3 border-r border-gray-100 max-w-xs truncate" title={a.award_name}>{a.award_name}</td>
                                            <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-700">{a.notified_by || '-'}</td>
                                            <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-700">
                                                {a.deduction_source === 'salary' ? (language === 'vi' ? 'Cộng vào lương gộp' : 'Gross salary credit') :
                                                 a.deduction_source === 'cash' ? (language === 'vi' ? 'Tiền mặt/Chuyển khoản trực tiếp' : 'Direct cash/transfer') :
                                                 (a.deduction_source || '-').replace('_', ' ')}
                                            </td>
                                            <td className="px-4 py-3 border-r border-gray-100 text-center">
                                                <select 
                                                    value={a.status} 
                                                    onChange={(e) => handleAwardStatusChange(a.id, e.target.value)}
                                                    className={`text-[10px] font-bold tracking-wider uppercase cursor-pointer rounded-full border px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-transparent hover:bg-white
                                                        ${a.status === 'paid' ? 'text-emerald-600 border-emerald-200' : 
                                                          a.status === 'waived' ? 'text-gray-600 border-gray-200' :
                                                          a.status === 'disputed' ? 'text-red-600 border-red-200' :
                                                          'text-amber-600 border-amber-200'}
                                                    `}
                                                >
                                                    <option value="pending">{language === 'vi' ? 'CHỜ XỬ LÝ' : 'PENDING'}</option>
                                                    <option value="paid">{language === 'vi' ? 'ĐÃ PHÁT' : 'PAID'}</option>
                                                    <option value="waived">{language === 'vi' ? 'ĐƯỢC MIỄN' : 'WAIVED'}</option>
                                                    <option value="disputed">{language === 'vi' ? 'ĐANG TRANH CHẤP' : 'DISPUTED'}</option>
                                                </select>
                                            </td>
                                            <td className="px-4 py-3 border-r border-gray-100 text-right font-mono font-medium text-emerald-600">
                                                +{fmtVND(a.amount)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button onClick={() => { setEditingAward(a); setModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title={language === 'vi' ? 'Chỉnh sửa' : 'Edit'}><Pencil className="w-4 h-4" /></button>
                                                    <button onClick={() => handleDeleteAward(a.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={language === 'vi' ? 'Xóa' : 'Delete'}><Trash2 className="w-4 h-4" /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {!loading && awards.length > 0 && (
                                <tfoot className="bg-gray-50 border-t border-gray-200 text-sm font-bold text-gray-900">
                                    <tr>
                                        <td colSpan={5} className="px-4 py-3 text-right">{language === 'vi' ? 'Tổng Tiền Thưởng' : 'Total Awards'}</td>
                                        <td className="px-4 py-3 text-right text-emerald-600 font-mono">+{fmtVND(totalAwardsAmount)}</td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    )}

                </div>
            </div>

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
                            <h3 className="text-lg font-bold text-gray-900">
                                {activeTab === 'fines' ? (
                                    editingFine ? (language === 'vi' ? 'Chỉnh Sửa Tiền Phạt' : 'Edit Fine') : (language === 'vi' ? 'Thêm Tiền Phạt' : 'Add Fine')
                                ) : activeTab === 'warnings' ? (
                                    editingWarning ? (language === 'vi' ? 'Chỉnh Sửa Cảnh Cáo' : 'Edit Flag') : (language === 'vi' ? 'Thêm Cảnh Cáo' : 'Add Flag')
                                ) : (
                                    editingAward ? (language === 'vi' ? 'Chỉnh Sửa Khen Thưởng' : 'Edit Award') : (language === 'vi' ? 'Thêm Khen Thưởng' : 'Add Award')
                                )}
                            </h3>
                            <button onClick={() => setModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            {activeTab === 'fines' && (
                                <FormFine 
                                    initialData={editingFine} 
                                    catalog={catalog}
                                    loggedUserName={loggedUserName} 
                                    onSave={handleSaveFine} 
                                    onCancel={() => setModalOpen(false)} 
                                />
                            )}
                            {activeTab === 'warnings' && (
                                <FormWarning 
                                    initialData={editingWarning} 
                                    loggedUserName={loggedUserName} 
                                    onSave={handleSaveWarning} 
                                    onCancel={() => setModalOpen(false)} 
                                />
                            )}
                            {activeTab === 'awards' && (
                                <FormAward 
                                    initialData={editingAward} 
                                    catalog={awardsCatalog}
                                    loggedUserName={loggedUserName} 
                                    onSave={handleSaveAward} 
                                    onCancel={() => setModalOpen(false)} 
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// FORM 1: FINE
function FormFine({ initialData, catalog, loggedUserName, onSave, onCancel }: { initialData: HRStaffFine | null, catalog: HRDisciplinaryCatalog[], loggedUserName: string, onSave: (d: Partial<HRStaffFine>) => void, onCancel: () => void }) {
    const { language } = useSettings() // Recupera la lingua corrente dal context settings
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

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!infraction || amount < 0 || !date) return
        setSubmitting(true)
        try {
            await onSave({
                date,
                infraction,
                amount,
                notified_by: notifiedBy,
                deduction_source: deductionSource,
                status: initialData ? initialData.status : 'pending'
            })
        } catch (err) {
            setSubmitting(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Ngày' : 'Date'} <span className="text-red-500">*</span></label>
                    <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Nguồn Khấu Trừ' : 'Deduction Source'}</label>
                    <select value={deductionSource} onChange={e => setDeductionSource(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="salary">{language === 'vi' ? 'Khấu Trừ Lương Gộp' : 'Gross Salary Deduction'}</option>
                        <option value="service_charge">{language === 'vi' ? 'Khấu Trừ Phí Phục Vụ' : 'Service Charge Deduction'}</option>
                        <option value="cash">{language === 'vi' ? 'Tiền Mặt/Chuyển Khoản Trực Tiếp' : 'Direct Cash/Transfer'}</option>
                    </select>
                </div>
            </div>

            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Vi Phạm' : 'Infraction'} <span className="text-red-500">*</span></label>
                <select required value={infraction} onChange={handleCatalogSelect} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="" disabled>{language === 'vi' ? 'Chọn hành vi vi phạm...' : 'Select an infraction...'}</option>
                    {catalog.map(c => (
                        <option key={c.id} value={c.infraction_name}>{c.infraction_name}</option>
                    ))}
                    {initialData && !catalog.find(c => c.infraction_name === initialData.infraction) && (
                        <option value={initialData.infraction}>{initialData.infraction} {language === 'vi' ? '(Cũ/Thủ công)' : '(Legacy/Manual)'}</option>
                    )}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">{language === 'vi' ? 'Chọn vi phạm sẽ tự động điền số tiền phạt mặc định.' : 'Selecting an infraction automatically sets the default fine amount.'}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Số Tiền (VND)' : 'Amount (VND)'} <span className="text-red-500">*</span></label>
                    <input type="text" required value={displayAmount} 
                        onChange={e => {
                            let val = e.target.value.replace(/[^0-9]/g, '');
                            if (val) {
                                setDisplayAmount(parseInt(val, 10).toLocaleString('en-US'))
                                setAmount(parseInt(val, 10))
                            } else { setDisplayAmount(''); setAmount(0); }
                        }}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Người Báo Cáo' : 'Notified By'}</label>
                    <input type="text" value={notifiedBy || ''} onChange={e => setNotifiedBy(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
            </div>
            {!notifiedBy && loggedUserName && (
                <div className="flex justify-end">
                    <button type="button" onClick={() => setNotifiedBy(loggedUserName)} className="px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-md text-xs font-medium hover:bg-blue-100 transition whitespace-nowrap">{language === 'vi' ? 'Điền tên tôi' : 'Fill my name'}</button>
                </div>
            )}

            <div className="pt-4 flex justify-end gap-2 border-t border-gray-100 mt-6">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition">{language === 'vi' ? 'Hủy' : 'Cancel'}</button>
                <button type="submit" disabled={submitting || !infraction || amount < 0} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {submitting ? '...' : (language === 'vi' ? 'Lưu' : 'Save Fine')}
                </button>
            </div>
        </form>
    )
}

// FORM 2: WARNING
function FormWarning({ initialData, loggedUserName, onSave, onCancel }: { initialData: HRStaffWarning | null, loggedUserName: string, onSave: (d: Partial<HRStaffWarning>) => void, onCancel: () => void }) {
    const { language } = useSettings()
    const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0])
    const [flagType, setFlagType] = useState<WarningFlagType>(initialData?.flag_type || 'yellow')
    const [reason, setReason] = useState(initialData?.reason || '')
    const [notifiedBy, setNotifiedBy] = useState(initialData?.notified_by || loggedUserName)
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        if (!initialData && !notifiedBy && loggedUserName) {
            setNotifiedBy(loggedUserName)
        }
    }, [loggedUserName, initialData, notifiedBy])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!reason || !date) return
        setSubmitting(true)
        try {
            await onSave({
                date,
                flag_type: flagType,
                reason,
                notified_by: notifiedBy
            })
        } catch (err) {
            setSubmitting(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Ngày' : 'Date'} <span className="text-red-500">*</span></label>
                    <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Người Báo Cáo' : 'Notified By'}</label>
                    <input type="text" value={notifiedBy || ''} onChange={e => setNotifiedBy(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
            </div>

            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">{language === 'vi' ? 'Mức Cảnh Báo' : 'Flag Level'} <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => setFlagType('green')} className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${flagType === 'green' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm font-semibold' : 'bg-transparent border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
                        <Flag className="w-4 h-4 fill-emerald-500 text-emerald-500" /> {language === 'vi' ? 'Tích cực' : 'Positive'}
                    </button>
                    <button type="button" onClick={() => setFlagType('yellow')} className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${flagType === 'yellow' ? 'bg-amber-50 border-amber-300 text-amber-700 shadow-sm font-semibold' : 'bg-transparent border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
                        <Flag className="w-4 h-4 fill-amber-500 text-amber-500" /> {language === 'vi' ? 'Nhắc nhở' : 'Caution'}
                    </button>
                    <button type="button" onClick={() => setFlagType('red')} className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${flagType === 'red' ? 'bg-red-50 border-red-300 text-red-700 shadow-sm font-semibold' : 'bg-transparent border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
                        <Flag className="w-4 h-4 fill-red-500 text-red-500" /> {language === 'vi' ? 'Cảnh cáo' : 'Warning'}
                    </button>
                </div>
            </div>

            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Lý Do' : 'Reason'} <span className="text-red-500">*</span></label>
                <textarea required value={reason} onChange={e => setReason(e.target.value)} rows={3} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder={language === 'vi' ? 'Nhập lý do...' : 'Enter reason...'} />
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t border-gray-100 mt-6">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition">{language === 'vi' ? 'Hủy' : 'Cancel'}</button>
                <button type="submit" disabled={submitting || !reason} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {submitting ? '...' : (language === 'vi' ? 'Lưu' : 'Save Warning')}
                </button>
            </div>
        </form>
    )
}

// FORM 3: AWARD
function FormAward({ initialData, catalog, loggedUserName, onSave, onCancel }: { initialData: HRStaffAward | null, catalog: HRAwardsCatalog[], loggedUserName: string, onSave: (d: Partial<HRStaffAward>) => void, onCancel: () => void }) {
    const { language } = useSettings()
    const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0])
    const [awardName, setAwardName] = useState(initialData?.award_name || '')
    const [amount, setAmount] = useState(initialData?.amount || 0)
    const [notifiedBy, setNotifiedBy] = useState(initialData?.notified_by || loggedUserName)
    const [deductionSource, setDeductionSource] = useState(initialData?.deduction_source || 'salary') // credit source
    const [displayAmount, setDisplayAmount] = useState(initialData?.amount ? initialData.amount.toLocaleString('en-US') : '')
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        if (!initialData && !notifiedBy && loggedUserName) {
            setNotifiedBy(loggedUserName)
        }
    }, [loggedUserName, initialData, notifiedBy])

    function handleCatalogSelect(e: React.ChangeEvent<HTMLSelectElement>) {
        const val = e.target.value
        setAwardName(val)
        if (val) {
            const catItem = catalog.find(c => c.award_name === val)
            if (catItem) {
                setAmount(Number(catItem.default_amount))
                setDisplayAmount(Number(catItem.default_amount).toLocaleString('en-US'))
            }
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!awardName || amount < 0 || !date) return
        setSubmitting(true)
        try {
            await onSave({
                date,
                award_name: awardName,
                amount,
                notified_by: notifiedBy,
                deduction_source: deductionSource,
                status: initialData ? initialData.status : 'pending'
            })
        } catch (err) {
            setSubmitting(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Ngày' : 'Date'} <span className="text-red-500">*</span></label>
                    <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Nguồn Nhận Thưởng' : 'Credit Source'}</label>
                    <select value={deductionSource} onChange={e => setDeductionSource(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="salary">{language === 'vi' ? 'Cộng Vào Lương Gộp' : 'Gross Salary Credit'}</option>
                        <option value="cash">{language === 'vi' ? 'Tiền Mặt/Chuyển Khoản Trực Tiếp' : 'Direct Cash/Transfer'}</option>
                    </select>
                </div>
            </div>

            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Khen Thưởng' : 'Award'} <span className="text-red-500">*</span></label>
                <select required value={awardName} onChange={handleCatalogSelect} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="" disabled>{language === 'vi' ? 'Chọn loại thưởng...' : 'Select an award...'}</option>
                    {catalog.map(c => (
                        <option key={c.id} value={c.award_name}>{c.award_name}</option>
                    ))}
                    {initialData && !catalog.find(c => c.award_name === initialData.award_name) && (
                        <option value={initialData.award_name}>{initialData.award_name} {language === 'vi' ? '(Cũ/Thủ công)' : '(Legacy/Manual)'}</option>
                    )}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">{language === 'vi' ? 'Chọn loại thưởng sẽ tự động điền số tiền thưởng mặc định.' : 'Selecting an award automatically sets the default award amount.'}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Số Tiền Thưởng (VND)' : 'Amount (VND)'} <span className="text-red-500">*</span></label>
                    <input type="text" required value={displayAmount} 
                        onChange={e => {
                            let val = e.target.value.replace(/[^0-9]/g, '');
                            if (val) {
                                setDisplayAmount(parseInt(val, 10).toLocaleString('en-US'))
                                setAmount(parseInt(val, 10))
                            } else { setDisplayAmount(''); setAmount(0); }
                        }}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Người Báo Cáo' : 'Notified By'}</label>
                    <input type="text" value={notifiedBy || ''} onChange={e => setNotifiedBy(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
            </div>
            {!notifiedBy && loggedUserName && (
                <div className="flex justify-end">
                    <button type="button" onClick={() => setNotifiedBy(loggedUserName)} className="px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-md text-xs font-medium hover:bg-blue-100 transition whitespace-nowrap">{language === 'vi' ? 'Điền tên tôi' : 'Fill my name'}</button>
                </div>
            )}

            <div className="pt-4 flex justify-end gap-2 border-t border-gray-100 mt-6">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition">{language === 'vi' ? 'Hủy' : 'Cancel'}</button>
                <button type="submit" disabled={submitting || !awardName || amount < 0} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {submitting ? '...' : (language === 'vi' ? 'Lưu' : 'Save Award')}
                </button>
            </div>
        </form>
    )
}

// ==========================================
// TAB: Assets
// ==========================================

function TabAssets({ staff, assets, onUpdate }: { staff: HRStaffMember, assets: HRStaffAsset[], onUpdate: () => Promise<void> }) {
    const { language } = useSettings()
    
    const condLabel = (cond: string | null | undefined) => {
        if (!cond) return '';
        const m: Record<string, Record<string, string>> = {
            good: { en: 'Good', vi: 'Tốt' },
            fair: { en: 'Fair', vi: 'Trung bình' },
            poor: { en: 'Poor', vi: 'Kém' }
        };
        return m[cond]?.[language === 'vi' ? 'vi' : 'en'] || cond;
    };

    const [modalOpen, setModalOpen] = useState(false)
    const [editingAsset, setEditingAsset] = useState<HRStaffAsset | null>(null)
    const [expandedAssetIds, setExpandedAssetIds] = useState<string[]>([])

    const t = {
        en: {
            title: 'Assigned Assets',
            subtitle: 'Manage company property assigned to this staff member (e.g. uniforms, phones, laptops).',
            assignAsset: 'Assign Asset',
            editAsset: 'Edit Asset',
            assetName: 'Asset Name',
            category: 'Category',
            serialNumber: 'Serial Number',
            qty: 'Qty',
            quantity: 'Quantity',
            assignedDate: 'Assigned Date',
            returnDate: 'Return Date',
            status: 'Status',
            notes: 'Notes',
            save: 'Save Asset',
            saving: 'Saving...',
            cancel: 'Cancel',
            actions: 'Actions',
            noAssets: 'No assets assigned to this staff member yet.',
            assigned: 'Assigned',
            returned: 'Returned',
            damaged: 'Damaged',
            lost: 'Lost',
            confirmDelete: 'Are you sure you want to remove this asset assignment?',
            deleteError: 'Failed to delete asset assignment',
            saveError: 'Failed to save asset assignment',
            placeholderName: 'e.g. iPhone 13, Chef Apron M',
            placeholderSerial: 'e.g. SN123456789 (optional)',
            placeholderNotes: 'Add any specific notes about condition, size, etc.',
            categoryUniform: 'Uniform',
            categoryDevice: 'Device',
            categoryTool: 'Tool',
            categoryOther: 'Other',
            historyTitle: 'Asset Status History',
            stateChangedTo: 'State changed to',
            onDate: 'on',
            registerStateChange: 'Register State Change',
            newState: 'New State',
            changeDate: 'Event Date',
            placeholderChangeNotes: 'e.g. Returned clean, or size mistake',
            stateChangeError: 'Could not log status change',
            confirmAndContinue: 'Confirm & Continue',
            assignedCondition: 'Initial Condition',
            returnCondition: 'Return Condition',
            conditionGood: 'Good',
            conditionFair: 'Fair',
            conditionPoor: 'Poor',
            condition: 'Condition'
        },
        vi: {
            title: 'Tài sản được bàn giao',
            subtitle: 'Quản lý tài sản công ty được bàn giao cho nhân viên này (ví dụ: đồng phục, điện thoại, máy tính xách tay).',
            assignAsset: 'Bàn giao tài sản',
            editAsset: 'Sửa tài sản bàn giao',
            assetName: 'Tên tài sản',
            category: 'Danh mục',
            serialNumber: 'Số seri',
            qty: 'SL',
            quantity: 'Số lượng',
            assignedDate: 'Ngày bàn giao',
            returnDate: 'Ngày thu hồi',
            status: 'Trạng thái',
            notes: 'Ghi chú',
            save: 'Lưu tài sản',
            saving: 'Đang lưu...',
            cancel: 'Hủy',
            actions: 'Thao tác',
            noAssets: 'Chưa có tài sản nào được bàn giao cho nhân viên này.',
            assigned: 'Đang sử dụng',
            returned: 'Đã thu hồi',
            damaged: 'Hỏng hóc',
            lost: 'Thất lạc',
            confirmDelete: 'Bạn có chắc chắn muốn xóa bàn giao tài sản này không?',
            deleteError: 'Không thể xóa bàn giao tài sản',
            saveError: 'Không thể lưu bàn giao tài sản',
            placeholderName: 'Ví dụ: iPhone 13, Grembiule taglia M',
            placeholderSerial: 'Ví dụ: SN123456789 (không bắt buộc)',
            placeholderNotes: 'Thêm ghi chú cụ thể về tình trạng, kích thước, v.v.',
            categoryUniform: 'Đồng phục',
            categoryDevice: 'Thiết bị',
            categoryTool: 'Công cụ',
            categoryOther: 'Khác',
            historyTitle: 'Lịch sử trạng thái tài sản',
            stateChangedTo: 'Trạng thái chuyển sang',
            onDate: 'vào ngày',
            registerStateChange: 'Ghi nhận thay đổi trạng thái',
            newState: 'Trạng thái mới',
            changeDate: 'Ngày sự kiện',
            placeholderChangeNotes: 'Ví dụ: Đã trả sạch sẽ, hoặc lỗi kích cỡ',
            stateChangeError: 'Không thể ghi nhận thay đổi trạng thái',
            confirmAndContinue: 'Xác nhận & Tiếp tục',
            assignedCondition: 'Tình trạng bàn giao',
            returnCondition: 'Tình trạng thu hồi',
            conditionGood: 'Tốt',
            conditionFair: 'Trung bình',
            conditionPoor: 'Kém',
            condition: 'Tình trạng'
        }
    }[language === 'vi' ? 'vi' : 'en']

    const [stateChangeAsset, setStateChangeAsset] = useState<HRStaffAsset | null>(null)
    const [stateChangeModalOpen, setStateChangeModalOpen] = useState<boolean>(false)

    const [editingHistoryLog, setEditingHistoryLog] = useState<HRStaffAssetHistory | null>(null)
    const [historySaving, setHistorySaving] = useState<boolean>(false)

    async function handleDeleteHistoryLog(historyLogId: string) {
        if (!window.confirm(language === 'vi' ? 'Bạn có chắc chắn muốn xóa bản ghi lịch sử này?' : 'Are you sure you want to delete this history log?')) return
        try {
            const { error } = await supabase.from('hr_staff_asset_history').delete().eq('id', historyLogId)
            if (error) throw error
            await onUpdate()
        } catch (err) {
            console.error(err)
            alert(language === 'vi' ? 'Không thể xóa bản ghi lịch sử' : 'Could not delete history log')
        }
    }

    async function handleSaveHistoryLog(updatedData: Partial<HRStaffAssetHistory>) {
        if (!editingHistoryLog) return
        setHistorySaving(true)
        try {
            const { error } = await supabase.from('hr_staff_asset_history').update(updatedData).eq('id', editingHistoryLog.id)
            if (error) throw error
            await onUpdate()
            setEditingHistoryLog(null)
        } catch (err) {
            console.error(err)
            alert(language === 'vi' ? 'Không thể lưu bản ghi lịch sử' : 'Could not save history log')
        } finally {
            setHistorySaving(false)
        }
    }

    const toggleExpand = (id: string) => {
        setExpandedAssetIds(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    }

    async function handleStateChangeSubmit(assetId: string, status: HRStaffAssetStatus, date: string, notes: string, qtyToChange: number) {
        if (!stateChangeAsset) return

        const backupAsset = { ...stateChangeAsset };
        let newAssetId: string | null = null;

        try {
            const isReturned = status === 'returned' || status === 'damaged';
            const returnCondition = status === 'returned' ? 'good' : status === 'damaged' ? 'poor' : null;
            const returnDate = (status === 'returned' || status === 'damaged' || status === 'lost') ? date : null;

            if (qtyToChange === stateChangeAsset.quantity) {
                // Aggiorniamo direttamente l'asset esistente
                const updateData = {
                    status,
                    return_condition: returnCondition,
                    return_date: returnDate,
                    notes: notes || null
                };

                const { error } = await supabase.from('hr_staff_assets').update(updateData).eq('id', assetId);
                if (error) throw error;
            } else {
                // Scissione dell'asset
                // 1. Riduciamo la quantità dell'asset originale
                const newQty = stateChangeAsset.quantity - qtyToChange;
                const updateOriginalRes = await supabase.from('hr_staff_assets').update({ quantity: newQty }).eq('id', assetId);
                if (updateOriginalRes.error) throw updateOriginalRes.error;

                // 2. Creiamo il nuovo asset con la quantità scissa e lo stato aggiornato
                const insertData = {
                    staff_id: stateChangeAsset.staff_id,
                    asset_name: stateChangeAsset.asset_name,
                    category: stateChangeAsset.category,
                    serial_number: stateChangeAsset.serial_number,
                    assigned_date: stateChangeAsset.assigned_date,
                    initial_condition: stateChangeAsset.initial_condition,
                    quantity: qtyToChange,
                    status,
                    return_condition: returnCondition,
                    return_date: returnDate,
                    notes: notes || null
                };

                const insertRes = await supabase.from('hr_staff_assets').insert([insertData]).select();
                if (insertRes.error) throw insertRes.error;
                if (insertRes.data && insertRes.data.length > 0) {
                    newAssetId = insertRes.data[0].id;
                }
            }

            await onUpdate()
        } catch (err) {
            console.error('Error in handleStateChangeSubmit:', err);

            // ROLLBACK MANUAL
            try {
                // Se abbiamo inserito un nuovo record, lo eliminiamo
                if (newAssetId) {
                    await supabase.from('hr_staff_assets').delete().eq('id', newAssetId);
                }
                // Ripristiniamo la quantità e lo stato originali
                await supabase.from('hr_staff_assets').update({
                    quantity: backupAsset.quantity,
                    status: backupAsset.status,
                    return_condition: backupAsset.return_condition,
                    return_date: backupAsset.return_date,
                    notes: backupAsset.notes
                }).eq('id', assetId);
            } catch (rollbackErr) {
                console.error('Error during rollback in handleStateChangeSubmit:', rollbackErr);
            }

            alert(t.stateChangeError)
            throw err
        }
    }

    async function handleSave(formData: Partial<HRStaffAsset>) {
        try {
            if (editingAsset) {
                const { error } = await supabase.from('hr_staff_assets').update(formData).eq('id', editingAsset.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('hr_staff_assets').insert([{
                    ...formData,
                    staff_id: staff.id
                }])
                if (error) throw error
            }
            await onUpdate()
            setModalOpen(false)
        } catch (err) {
            console.error(err)
            alert(t.saveError)
        }
    }

    async function handleDelete(id: string) {
        if (!window.confirm(t.confirmDelete)) return
        try {
            const { error } = await supabase.from('hr_staff_assets').delete().eq('id', id)
            if (error) throw error
            await onUpdate()
        } catch (err) {
            console.error(err)
            alert(t.deleteError)
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-500">
                        {t.title}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {t.subtitle}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => { setEditingAsset(null); setModalOpen(true); }} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all whitespace-nowrap">
                        <Plus className="w-4 h-4" /> {t.assignAsset}
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs font-semibold uppercase tracking-wider">
                            <tr>
                                <th className="w-10 px-4 py-3 text-center"></th>
                                <th className="px-4 py-3 border-r border-gray-100">{t.assignedDate}</th>
                                <th className="px-4 py-3 border-r border-gray-100">{t.assetName}</th>
                                <th className="px-4 py-3 border-r border-gray-100 text-center">{t.qty}</th>
                                <th className="px-4 py-3 border-r border-gray-100">{t.category}</th>
                                <th className="px-4 py-3 border-r border-gray-100">{t.serialNumber}</th>
                                <th className="px-4 py-3 border-r border-gray-100">{t.returnDate}</th>
                                <th className="px-4 py-3 border-r border-gray-100">{t.condition}</th>
                                <th className="px-4 py-3 border-r border-gray-100 text-center">{t.status}</th>
                                <th className="px-4 py-3 text-center">{t.actions}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {assets.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="text-center py-8 text-gray-400">
                                        {t.noAssets}
                                    </td>
                                </tr>
                            ) : (
                                assets.map(asset => {
                                    const isExpanded = expandedAssetIds.includes(asset.id);
                                    const historyLogs = asset.hr_staff_asset_history || [];

                                    const statusBadgeColor = 
                                        asset.status === 'assigned' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                        asset.status === 'returned' ? 'bg-gray-50 text-gray-600 border-gray-200' :
                                        asset.status === 'damaged' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                        'bg-red-50 text-red-700 border-red-200';

                                    const localizedStatus = 
                                        asset.status === 'assigned' ? t.assigned :
                                        asset.status === 'returned' ? t.returned :
                                        asset.status === 'damaged' ? t.damaged :
                                        t.lost;

                                    const localizedCategory = 
                                        asset.category === 'Uniform' ? t.categoryUniform :
                                        asset.category === 'Device' ? t.categoryDevice :
                                        asset.category === 'Tool' ? t.categoryTool :
                                        asset.category === 'Other' ? t.categoryOther :
                                        asset.category || '-';

                                    return (
                                        <React.Fragment key={asset.id}>
                                            <tr className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => toggleExpand(asset.id)}>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-gray-400 hover:text-gray-600 transition">
                                                        {isExpanded ? <ChevronDown className="w-4 h-4 mx-auto" /> : <ChevronRight className="w-4 h-4 mx-auto" />}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-900 font-medium">
                                                    {fmtDate(asset.assigned_date)}
                                                </td>
                                                <td className="px-4 py-3 border-r border-gray-100 font-semibold text-gray-900">
                                                    {asset.asset_name}
                                                </td>
                                                <td className="px-4 py-3 border-r border-gray-100 text-gray-850 font-bold text-center">
                                                    {asset.quantity}
                                                </td>
                                                <td className="px-4 py-3 border-r border-gray-100 text-gray-600">
                                                    {localizedCategory}
                                                </td>
                                                <td className="px-4 py-3 border-r border-gray-100 font-mono text-xs text-gray-500">
                                                    {asset.serial_number || '-'}
                                                </td>
                                                <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-600">
                                                    {asset.return_date ? fmtDate(asset.return_date) : '-'}
                                                </td>
                                                <td className="px-4 py-3 border-r border-gray-100 text-gray-700 whitespace-nowrap text-xs font-semibold">
                                                    {asset.initial_condition ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <span>{condLabel(asset.initial_condition)}</span>
                                                            {asset.return_date && asset.return_condition && (
                                                                <>
                                                                    <span className="text-gray-400">→</span>
                                                                    <span className={asset.return_condition === 'poor' ? 'text-red-600 font-bold' : 'text-slate-900 font-semibold'}>
                                                                        {condLabel(asset.return_condition)}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        '-'
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 border-r border-gray-100 text-center">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusBadgeColor}`}>
                                                        {localizedStatus}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button 
                                                            onClick={() => { 
                                                                setStateChangeAsset(asset);
                                                                setStateChangeModalOpen(true);
                                                            }} 
                                                            className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors" 
                                                            title={t.registerStateChange}
                                                        >
                                                            <RefreshCw className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr className="bg-slate-50/40">
                                                    <td colSpan={10} className="px-8 py-5 border-t border-b border-slate-100">
                                                        <div className="w-full space-y-4 text-left">
                                                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-semibold">
                                                                <Activity className="w-3.5 h-3.5 text-slate-500" />
                                                                {t.historyTitle}
                                                            </h4>
                                                            {historyLogs.length === 0 ? (
                                                                <p className="text-xs text-slate-400 italic bg-white border border-slate-100 px-3 py-2 rounded-xl">
                                                                    No history logged.
                                                                </p>
                                                            ) : (
                                                                <div className="relative pl-4 border-l-2 border-slate-200 space-y-3 py-1 ml-2">
                                                                    {historyLogs.map((log, idx) => {
                                                                        const logStatusBadge = 
                                                                            log.status === 'assigned' ? 'bg-blue-500' :
                                                                            log.status === 'returned' ? 'bg-gray-500' :
                                                                            log.status === 'damaged' ? 'bg-yellow-500' :
                                                                            'bg-red-500';
                                                                        const logLocalizedStatus = 
                                                                            log.status === 'assigned' ? t.assigned :
                                                                            log.status === 'returned' ? t.returned :
                                                                            log.status === 'damaged' ? t.damaged :
                                                                            t.lost;

                                                                        return (
                                                                            <div key={log.id || idx} className="group relative flex items-center justify-between gap-4 text-xs py-1 hover:bg-white px-2.5 rounded-lg border border-transparent hover:border-slate-150 hover:shadow-sm transition-all duration-200">
                                                                                <div className="flex flex-wrap items-center gap-2">
                                                                                    <div className={`absolute -left-[21px] w-2.5 h-2.5 rounded-full ring-4 ring-white ${logStatusBadge}`} />
                                                                                    <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                                                                                        {t.stateChangedTo} 
                                                                                        <span className="font-bold underline uppercase text-slate-900">{logLocalizedStatus}</span>
                                                                                    </div>
                                                                                    <div className="text-slate-400 font-medium">
                                                                                        {t.onDate} {fmtDate(log.changed_at)}
                                                                                    </div>
                                                                                    {log.notes && (
                                                                                        <div className="text-slate-500 italic bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md sm:ml-2">
                                                                                            "{log.notes}"
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                
                                                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" onClick={e => e.stopPropagation()}>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setEditingHistoryLog(log)}
                                                                                        className="p-1 text-blue-600 hover:bg-blue-50 rounded transition"
                                                                                        title={language === 'vi' ? 'Sửa' : 'Edit state log'}
                                                                                    >
                                                                                        <Pencil className="w-3.5 h-3.5" />
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => handleDeleteHistoryLog(log.id)}
                                                                                        className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                                                                                        title={language === 'vi' ? 'Xóa' : 'Delete state log'}
                                                                                    >
                                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}

                                                            {/* Pulsante Delete Asset Globale */}
                                                            <div className="pt-3 border-t border-slate-100/50 mt-3 flex justify-end items-center">
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => handleDelete(asset.id)}
                                                                    className="text-xs font-bold text-red-600 hover:text-red-800 transition"
                                                                >
                                                                    {language === 'vi' ? 'Xóa' : 'Delete'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
                            <h3 className="text-lg font-bold text-gray-900">
                                {editingAsset ? t.editAsset : t.assignAsset}
                            </h3>
                            <button onClick={() => setModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-900 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            <FormAsset 
                                initialData={editingAsset}
                                onSave={handleSave}
                                onCancel={() => setModalOpen(false)}
                                t={t}
                                language={language}
                            />
                        </div>
                    </div>
                </div>
            )}

            {editingHistoryLog && (
                <HistoryEditModal 
                    historyLog={editingHistoryLog}
                    onSave={handleSaveHistoryLog}
                    onCancel={() => setEditingHistoryLog(null)}
                    saving={historySaving}
                    t={t}
                    language={language}
                />
            )}

            {stateChangeModalOpen && stateChangeAsset && (
                <StateChangeModal 
                    open={stateChangeModalOpen}
                    asset={stateChangeAsset}
                    onClose={() => {
                        setStateChangeModalOpen(false);
                        setStateChangeAsset(null);
                    }}
                    onSave={handleStateChangeSubmit}
                    t={t}
                    language={language}
                />
            )}
        </div>
    );
}

interface FormAssetProps {
    initialData: HRStaffAsset | null;
    onSave: (d: Partial<HRStaffAsset>) => void;
    onCancel: () => void;
    t: any;
    language: string;
}

function FormAsset({ initialData, onSave, onCancel, t, language }: FormAssetProps) {
    const [assetName, setAssetName] = useState(initialData?.asset_name || '')
    const [category, setCategory] = useState(initialData?.category || 'Uniform')
    const [serialNumber, setSerialNumber] = useState(initialData?.serial_number || '')
    const [quantity, setQuantity] = useState(initialData?.quantity || 1)
    const [assignedDate, setAssignedDate] = useState(initialData?.assigned_date || new Date().toISOString().split('T')[0])
    const [initialCondition, setInitialCondition] = useState(initialData?.initial_condition || 'good')
    const [notes, setNotes] = useState(initialData?.notes || '')
    const [submitting, setSubmitting] = useState(false)

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!assetName || !assignedDate) return
        setSubmitting(true)
        
        onSave({
            asset_name: assetName,
            category,
            serial_number: serialNumber || null,
            quantity,
            assigned_date: assignedDate,
            initial_condition: initialCondition,
            notes: notes || null
        })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    {t.assetName} <span className="text-red-500">*</span>
                </label>
                <input 
                    type="text" 
                    required 
                    value={assetName} 
                    onChange={e => setAssetName(e.target.value)} 
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                    placeholder={t.placeholderName}
                />
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                        {t.quantity} <span className="text-red-500">*</span>
                    </label>
                    <input 
                        type="number" 
                        required 
                        min={1}
                        value={quantity} 
                        onChange={e => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))} 
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                    />
                </div>
                <div className="col-span-1">
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                        {t.category}
                    </label>
                    <select 
                        value={category} 
                        onChange={e => setCategory(e.target.value)} 
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-semibold"
                    >
                        <option value="Uniform">{t.categoryUniform}</option>
                        <option value="Device">{t.categoryDevice}</option>
                        <option value="Tool">{t.categoryTool}</option>
                        <option value="Other">{t.categoryOther}</option>
                    </select>
                </div>
                <div className="col-span-1">
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                        {t.serialNumber}
                    </label>
                    <input 
                        type="text" 
                        value={serialNumber} 
                        onChange={e => setSerialNumber(e.target.value)} 
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                        placeholder={t.placeholderSerial}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                        {t.assignedDate} <span className="text-red-500">*</span>
                    </label>
                    <input 
                        type="date" 
                        required 
                        value={assignedDate} 
                        onChange={e => setAssignedDate(e.target.value)} 
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                        {t.assignedCondition}
                    </label>
                    <select 
                        value={initialCondition} 
                        onChange={e => setInitialCondition(e.target.value)} 
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-semibold"
                    >
                        <option value="good">{t.conditionGood}</option>
                        <option value="fair">{t.conditionFair}</option>
                        <option value="poor">{t.conditionPoor}</option>
                    </select>
                </div>
            </div>

            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    {t.notes}
                </label>
                <textarea 
                    rows={3}
                    value={notes} 
                    onChange={e => setNotes(e.target.value)} 
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                    placeholder={t.placeholderNotes}
                />
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t border-gray-100 mt-6">
                <button 
                    type="button" 
                    onClick={onCancel} 
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition"
                >
                    {t.cancel}
                </button>
                <button 
                    type="submit" 
                    disabled={submitting || !assetName || !assignedDate} 
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {submitting ? t.saving : t.save}
                </button>
            </div>
        </form>
    );
}

// ==========================================
// MODAL: AssetReturnModal
// ==========================================

interface AssetReturnModalProps {
    open: boolean;
    staff: HRStaffMember | null;
    assets: HRStaffAsset[];
    onClose: () => void;
    onConfirm: () => Promise<void>;
}

function AssetReturnModal({ open, staff, assets, onClose, onConfirm }: AssetReturnModalProps) {
    const { language } = useSettings()
    const [submitting, setSubmitting] = useState(false)
    const [localAssets, setLocalAssets] = useState<Array<{
        id: string;
        originalAsset: HRStaffAsset;
        index: number;
        name: string;
        quantity: number;
        status: HRStaffAssetStatus;
        assigned_date: string;
        initial_condition: string;
        return_condition: string;
        return_date: string;
        notes: string;
    }>>([])

    useEffect(() => {
        if (open && assets) {
            const expandedRows: any[] = [];
            assets.forEach(a => {
                const qty = a.quantity || 1;
                for (let i = 0; i < qty; i++) {
                    const returnCondition = a.return_condition || (a.status === 'returned' ? 'good' : a.status === 'damaged' ? 'poor' : '');
                    expandedRows.push({
                        id: `${a.id}_${i}`,
                        originalAsset: a,
                        index: i,
                        name: a.asset_name,
                        quantity: 1,
                        status: a.status || 'assigned',
                        assigned_date: a.assigned_date || '',
                        initial_condition: a.initial_condition || 'good',
                        return_condition: returnCondition,
                        return_date: a.return_date || (a.status === 'assigned' ? '' : new Date().toISOString().split('T')[0]),
                        notes: a.notes || ''
                    });
                }
            });
            setLocalAssets(expandedRows);
        }
    }, [open, assets])

    const t = {
        en: {
            title: 'Company Assets Check',
            subtitle: "Please review the status of the staff member's company assets before proceeding to the Exit Review.",
            assetName: 'Asset Name',
            qty: 'Qty',
            returnedLabel: 'Returned?',
            condition: 'Condition / Status',
            returnDate: 'Return Date',
            notes: 'Notes',
            cancel: 'Cancel',
            confirmAndContinue: 'Confirm & Continue',
            assigned: 'Still Assigned',
            returned: 'Intact / Good',
            damaged: 'Returned Damaged',
            lost: 'Lost',
            error: 'Failed to update asset status',
            yes: 'Yes',
            no: 'No',
            assignedCondition: 'Assigned State',
            returnCondition: 'Return State',
            conditionGood: 'Good',
            conditionFair: 'Fair',
            conditionPoor: 'Poor / Damaged',
            stillAssigned: 'Still Assigned',
            assignedDate: 'Assigned Date'
        },
        vi: {
            title: 'Kiểm tra tài sản công ty',
            subtitle: 'Vui lòng kiểm tra trạng thái tài sản công ty của nhân viên trước khi chuyển sang Đánh giá nghỉ việc.',
            assetName: 'Tên tài sản',
            qty: 'SL',
            returnedLabel: 'Đã trả?',
            condition: 'Tình trạng / Chi tiết',
            returnDate: 'Ngày thu hồi',
            notes: 'Ghi chú',
            cancel: 'Hủy',
            confirmAndContinue: 'Xác nhận & Tiếp tục',
            assigned: 'Chưa trả',
            returned: 'Nguyên vẹn / Tốt',
            damaged: 'Trả mà hỏng',
            lost: 'Thất lạc',
            error: 'Không thể cập nhật trạng thái tài sản',
            yes: 'Có',
            no: 'Không',
            assignedCondition: 'Trạng thái bàn giao',
            returnCondition: 'Trạng thái thu hồi',
            conditionGood: 'Tốt',
            conditionFair: 'Trung bình',
            conditionPoor: 'Kém / Hỏng hóc',
            stillAssigned: 'Chưa trả',
            assignedDate: 'Ngày bàn giao'
        }
    }[language === 'vi' ? 'vi' : 'en']

    const condLabel = (cond: string | null | undefined) => {
        if (!cond) return '';
        const m: Record<string, Record<string, string>> = {
            good: { en: 'Good', vi: 'Tốt' },
            fair: { en: 'Fair', vi: 'Trung bình' },
            poor: { en: 'Poor', vi: 'Kém' }
        };
        return m[cond]?.[language === 'vi' ? 'vi' : 'en'] || cond;
    };

    const handleToggleReturn = (id: string, isReturned: boolean) => {
        setLocalAssets(prev => prev.map(item => {
            if (item.id === id) {
                const nextStatus: HRStaffAssetStatus = isReturned ? 'returned' : 'assigned';
                return {
                    ...item,
                    status: nextStatus,
                    return_condition: isReturned ? 'good' : '',
                    return_date: isReturned ? item.return_date || new Date().toISOString().split('T')[0] : ''
                };
            }
            return item;
        }));
    };

    const handleReturnConditionChange = (id: string, val: string) => {
        setLocalAssets(prev => prev.map(item => {
            if (item.id === id) {
                let nextStatus: HRStaffAssetStatus = item.status;
                if (val === 'good' || val === 'fair') {
                    nextStatus = 'returned';
                } else if (val === 'poor') {
                    nextStatus = 'damaged';
                } else if (val === 'assigned') {
                    nextStatus = 'assigned';
                } else if (val === 'lost') {
                    nextStatus = 'lost';
                }
                return {
                    ...item,
                    status: nextStatus,
                    return_condition: (val === 'assigned' || val === 'lost') ? '' : val,
                    return_date: (val === 'assigned' || val === 'lost') ? '' : item.return_date || new Date().toISOString().split('T')[0]
                }
            }
            return item;
        }))
    }

    const handleDateChange = (id: string, val: string) => {
        setLocalAssets(prev => prev.map(item => item.id === id ? { ...item, return_date: val } : item))
    }

    const handleNotesChange = (id: string, val: string) => {
        setLocalAssets(prev => prev.map(item => item.id === id ? { ...item, notes: val } : item))
    }

    const handleSaveAll = async () => {
        setSubmitting(true)

        // Backup per eventuale rollback manuale in caso di errore
        const backupAssets = [...assets];
        const createdAssetIds: string[] = [];
        const updatedAssetIds: string[] = [];

        try {
            // Raggruppiamo i localAssets sdoppiati per l'ID dell'asset originale
            const groupedByOriginalId: Record<string, typeof localAssets> = {};
            localAssets.forEach(la => {
                const oId = la.originalAsset.id;
                if (!groupedByOriginalId[oId]) {
                    groupedByOriginalId[oId] = [];
                }
                groupedByOriginalId[oId].push(la);
            });

            // Per ciascun asset originale
            for (const originalId of Object.keys(groupedByOriginalId)) {
                const originalAsset = backupAssets.find(a => a.id === originalId);
                if (!originalAsset) continue;

                const rows = groupedByOriginalId[originalId];

                // Raggruppiamo le righe in base allo stato finale (status, return_condition, return_date, notes)
                const stateGroups: Record<string, typeof localAssets> = {};
                rows.forEach(r => {
                    const key = `${r.status}|${r.return_condition || ''}|${r.return_date || ''}|${r.notes || ''}`;
                    if (!stateGroups[key]) {
                        stateGroups[key] = [];
                    }
                    stateGroups[key].push(r);
                });

                const groups = Object.values(stateGroups);

                // 1. Primo gruppo: aggiorna il record esistente
                const firstGroup = groups[0];
                const sample1 = firstGroup[0];
                const isReturned1 = sample1.status === 'returned' || sample1.status === 'damaged';
                const updateData = {
                    quantity: firstGroup.length,
                    status: sample1.status,
                    return_condition: isReturned1 ? sample1.return_condition || 'good' : null,
                    return_date: isReturned1 ? sample1.return_date || new Date().toISOString().split('T')[0] : null,
                    notes: sample1.notes || null
                };

                const updateRes = await supabase.from('hr_staff_assets').update(updateData).eq('id', originalId).select();
                if (updateRes.error) throw updateRes.error;
                updatedAssetIds.push(originalId);

                // 2. Gruppi successivi: inserisce nuovi record
                if (groups.length > 1) {
                    const insertData = [];
                    for (let g = 1; g < groups.length; g++) {
                        const currentGroup = groups[g];
                        const sampleG = currentGroup[0];
                        const isReturnedG = sampleG.status === 'returned' || sampleG.status === 'damaged';
                        insertData.push({
                            staff_id: originalAsset.staff_id,
                            asset_name: originalAsset.asset_name,
                            category: originalAsset.category,
                            serial_number: originalAsset.serial_number,
                            assigned_date: originalAsset.assigned_date,
                            initial_condition: originalAsset.initial_condition,
                            quantity: currentGroup.length,
                            status: sampleG.status,
                            return_condition: isReturnedG ? sampleG.return_condition || 'good' : null,
                            return_date: isReturnedG ? sampleG.return_date || new Date().toISOString().split('T')[0] : null,
                            notes: sampleG.notes || null
                        });
                    }

                    const insertRes = await supabase.from('hr_staff_assets').insert(insertData).select();
                    if (insertRes.error) throw insertRes.error;
                    if (insertRes.data) {
                        insertRes.data.forEach((newAsset: any) => createdAssetIds.push(newAsset.id));
                    }
                }
            }

            await onConfirm();
        } catch (err) {
            console.error('Error during asset check save:', err);
            
            // ROLLBACK MANUAL
            // 1. Elimina i record appena creati
            if (createdAssetIds.length > 0) {
                await supabase.from('hr_staff_assets').delete().in('id', createdAssetIds);
            }
            // 2. Ripristina i record originari modificati
            if (updatedAssetIds.length > 0) {
                await Promise.all(
                    updatedAssetIds.map(async (uId) => {
                        const originalAsset = backupAssets.find(a => a.id === uId);
                        if (originalAsset) {
                            const restoreData = {
                                quantity: originalAsset.quantity,
                                status: originalAsset.status,
                                return_condition: originalAsset.return_condition,
                                return_date: originalAsset.return_date,
                                notes: originalAsset.notes
                            };
                            await supabase.from('hr_staff_assets').update(restoreData).eq('id', uId);
                        }
                    })
                );
            }

            alert(t.error);
        } finally {
            setSubmitting(false)
        }
    }

    const batches = assets.map(originalAsset => {
        const items = localAssets.filter(la => la.originalAsset.id === originalAsset.id);
        return {
            originalAsset,
            items
        };
    }).filter(batch => batch.items.length > 0);    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in duration-200">
                <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
                    <div className="flex items-center gap-2 text-teal-600">
                        <Package className="w-5 h-5" />
                        <h3 className="text-lg font-bold text-gray-900">
                            {t.title}
                        </h3>
                    </div>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto space-y-4 text-left">
                    <p className="text-sm text-slate-700 font-medium">
                        {t.subtitle}
                    </p>

                    <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1 bg-slate-50/30 p-3 rounded-xl border border-slate-100">
                        {batches.map(batch => {
                            const oa = batch.originalAsset;
                            return (
                                <div key={oa.id} className="bg-white border border-slate-100 rounded-xl p-4 shadow-[0_2px_12px_-4px_rgba(148,163,184,0.12)] hover:shadow-[0_4px_16px_-4px_rgba(148,163,184,0.18)] transition-all duration-200 space-y-3">
                                    {/* Intestazione del Batch genitore */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-900 text-sm sm:text-base">{oa.asset_name}</span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold">
                                                <div className="text-left">
                                                    <span className="text-slate-600 font-bold uppercase text-[9px] tracking-wider block mb-0.5">{t.qty}</span>
                                                    <span className="text-slate-900 font-bold">{oa.quantity}</span>
                                                </div>
                                                <div className="w-px h-5 bg-slate-250" />
                                                <div className="text-left">
                                                    <span className="text-slate-600 font-bold uppercase text-[9px] tracking-wider block mb-0.5">{t.assignedDate}</span>
                                                    <span className="text-slate-900 font-semibold">{fmtDate(oa.assigned_date)}</span>
                                                </div>
                                                <div className="w-px h-5 bg-slate-250" />
                                                <div className="text-left">
                                                    <span className="text-slate-600 font-bold uppercase text-[9px] tracking-wider block mb-0.5">{t.assignedCondition}</span>
                                                    <span className="text-slate-900 font-semibold">{condLabel(oa.initial_condition)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sotto-elementi (i singoli pezzi) */}
                                    <div className="space-y-3 divide-y divide-slate-100">
                                        {batch.items.map((la, index) => {
                                            const isReturned = la.status === 'returned' || la.status === 'damaged';
                                            const itemLabel = oa.quantity > 1 
                                                ? `${language === 'vi' ? 'Phần' : 'Item'} #${la.index + 1}`
                                                : '';

                                            return (
                                                <div key={la.id} className="pt-3 first:pt-0 space-y-3">
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                        {/* Label del singolo pezzo se quantity > 1 */}
                                                        {itemLabel && (
                                                            <div className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 self-start sm:self-auto">
                                                                {itemLabel}
                                                            </div>
                                                        )}

                                                        {/* Controls */}
                                                        <div className="flex flex-wrap items-center gap-3 sm:justify-end flex-1 justify-between sm:flex-initial">
                                                            {/* Returned Toggle */}
                                                            <div className="flex flex-col gap-1 text-left">
                                                                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">{t.returnedLabel}</label>
                                                                <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-250">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleToggleReturn(la.id, true)}
                                                                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1 border border-transparent
                                                                            ${isReturned 
                                                                                ? 'bg-emerald-50 text-emerald-900 border-emerald-300 shadow-sm' 
                                                                                : 'text-slate-600 hover:text-slate-850'}`}
                                                                    >
                                                                        <CheckCircle className="w-3.5 h-3.5" />
                                                                        {t.yes}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleToggleReturn(la.id, false)}
                                                                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1 border border-transparent
                                                                            ${!isReturned 
                                                                                ? 'bg-rose-50 text-rose-950 border-rose-350 shadow-sm' 
                                                                                : 'text-slate-650 hover:text-slate-855'}`}
                                                                    >
                                                                        <X className="w-3.5 h-3.5" />
                                                                        {t.no}
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Condition Dropdown */}
                                                            <div className="flex flex-col gap-1 text-left">
                                                                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">{t.condition}</label>
                                                                {isReturned ? (
                                                                    <select
                                                                        value={la.return_condition || 'good'}
                                                                        onChange={e => handleReturnConditionChange(la.id, e.target.value)}
                                                                        className="px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-none transition w-40 text-slate-800"
                                                                    >
                                                                        <option value="good">{t.conditionGood}</option>
                                                                        <option value="fair">{t.conditionFair}</option>
                                                                        <option value="poor">{t.conditionPoor}</option>
                                                                    </select>
                                                                ) : (
                                                                    <select
                                                                        value={la.status}
                                                                        onChange={e => handleReturnConditionChange(la.id, e.target.value)}
                                                                        className="px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-none transition w-40 text-slate-800"
                                                                    >
                                                                        <option value="assigned">{t.assigned}</option>
                                                                        <option value="lost">{t.lost}</option>
                                                                    </select>
                                                                )}
                                                            </div>

                                                            {/* Date Picker */}
                                                            <div className="flex flex-col gap-1 text-left">
                                                                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">{t.returnDate}</label>
                                                                <input 
                                                                    type="date"
                                                                    value={la.return_date}
                                                                    disabled={!isReturned}
                                                                    onChange={e => handleDateChange(la.id, e.target.value)}
                                                                    className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs disabled:opacity-50 transition w-36 font-semibold text-slate-800"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Notes input */}
                                                    <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">{t.notes}:</span>
                                                        <input 
                                                            type="text"
                                                            value={la.notes}
                                                            placeholder={language === 'vi' ? 'Ghi chú thêm...' : 'Add details...'}
                                                            onChange={e => handleNotesChange(la.id, e.target.value)}
                                                            className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none transition text-slate-800 placeholder-slate-400 font-medium"
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-2">
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition"
                    >
                        {t.cancel}
                    </button>
                    <button 
                        type="button" 
                        onClick={handleSaveAll}
                        disabled={submitting}
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all disabled:opacity-75"
                    >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        {t.confirmAndContinue}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ==========================================
// MODAL: HistoryEditModal
// ==========================================

interface HistoryEditModalProps {
    historyLog: HRStaffAssetHistory;
    onSave: (d: Partial<HRStaffAssetHistory>) => Promise<void>;
    onCancel: () => void;
    saving: boolean;
    t: any;
    language: string;
}

function HistoryEditModal({ historyLog, onSave, onCancel, saving, t, language }: HistoryEditModalProps) {
    const [status, setStatus] = useState<HRStaffAssetStatus>(historyLog.status as HRStaffAssetStatus)
    const [changedAt, setChangedAt] = useState<string>(
        historyLog.changed_at ? new Date(historyLog.changed_at).toISOString().split('T')[0] : ''
    )
    const [notes, setNotes] = useState<string>(historyLog.notes || '')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        await onSave({
            status,
            changed_at: changedAt,
            notes: notes || null
        })
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
                    <h3 className="text-base font-bold text-gray-900">
                        {language === 'vi' ? 'Sửa lịch sử trạng thái' : 'Edit Status History'}
                    </h3>
                    <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-900 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4 text-left overflow-y-auto flex-1">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                            {t.status}
                        </label>
                        <select 
                            value={status} 
                            onChange={e => setStatus(e.target.value as HRStaffAssetStatus)} 
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                        >
                            <option value="assigned">{t.assigned}</option>
                            <option value="returned">{t.returned}</option>
                            <option value="damaged">{t.damaged}</option>
                            <option value="lost">{t.lost}</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                            {t.changeDate}
                        </label>
                        <input 
                            type="date"
                            required
                            value={changedAt} 
                            onChange={e => setChangedAt(e.target.value)} 
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium" 
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                            {t.notes}
                        </label>
                        <textarea 
                            rows={3}
                            value={notes} 
                            onChange={e => setNotes(e.target.value)} 
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium" 
                            placeholder={t.placeholderChangeNotes}
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-2 border-t border-gray-100">
                        <button 
                            type="button" 
                            onClick={onCancel} 
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition"
                        >
                            {t.cancel}
                        </button>
                        <button 
                            type="submit" 
                            disabled={saving || !changedAt} 
                            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                            {saving ? t.saving : t.save}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ==========================================
// MODAL: StateChangeModal
// ==========================================

interface StateChangeModalProps {
    open: boolean;
    asset: HRStaffAsset | null;
    onClose: () => void;
    onSave: (assetId: string, status: HRStaffAssetStatus, date: string, notes: string, qtyToChange: number) => Promise<void>;
    t: any;
    language: string;
}

function StateChangeModal({ open, asset, onClose, onSave, t, language }: StateChangeModalProps) {
    const [status, setStatus] = useState<HRStaffAssetStatus>('returned')
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0])
    const [notes, setNotes] = useState<string>('')
    const [qtyToChange, setQtyToChange] = useState<number>(1)
    const [saving, setSaving] = useState<boolean>(false)

    useEffect(() => {
        if (open && asset) {
            const nextStatus: HRStaffAssetStatus = asset.status === 'assigned' ? 'returned' : 'assigned';
            setStatus(nextStatus);
            setDate(new Date().toISOString().split('T')[0]);
            setNotes('');
            setQtyToChange(asset.quantity || 1);
        }
    }, [open, asset])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!status || !date || !asset) return
        setSaving(true)
        try {
            await onSave(asset.id, status, date, notes, qtyToChange)
            onClose()
        } catch (err) {
            console.error(err)
        } finally {
            setSaving(false)
        }
    }

    if (!open || !asset) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
                    <h3 className="text-base font-bold text-gray-900">
                        {t.registerStateChange}
                    </h3>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4 text-left overflow-y-auto flex-1">
                    <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl mb-2 flex items-center justify-between">
                        <div>
                            <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">{t.assetName}</div>
                            <div className="text-sm font-bold text-slate-800">{asset.asset_name}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">{t.qty}</div>
                            <div className="text-sm font-bold text-slate-800">{asset.quantity}</div>
                        </div>
                    </div>

                    {asset.quantity > 1 && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                {language === 'vi' ? 'Số lượng cập nhật' : 'Quantity to Update'}
                            </label>
                            <select 
                                value={qtyToChange} 
                                onChange={e => setQtyToChange(Number(e.target.value))} 
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                            >
                                {Array.from({ length: asset.quantity }, (_, i) => i + 1).map(n => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                            {t.newState}
                        </label>
                        <select 
                            value={status} 
                            onChange={e => setStatus(e.target.value as HRStaffAssetStatus)} 
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                        >
                            <option value="assigned">{t.assigned}</option>
                            <option value="returned">{t.returned}</option>
                            <option value="damaged">{t.damaged}</option>
                            <option value="lost">{t.lost}</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                            {t.changeDate}
                        </label>
                        <input 
                            type="date"
                            required
                            value={date} 
                            onChange={e => setDate(e.target.value)} 
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium" 
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                            {t.notes}
                        </label>
                        <textarea 
                            rows={3}
                            value={notes} 
                            onChange={e => setNotes(e.target.value)} 
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium" 
                            placeholder={t.placeholderChangeNotes}
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-2 border-t border-gray-100">
                        <button 
                            type="button" 
                            onClick={onClose} 
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition"
                        >
                            {t.cancel}
                        </button>
                        <button 
                            type="submit" 
                            disabled={saving || !date} 
                            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                            {saving ? t.saving : t.save}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

function DeleteConfirm({ name, onConfirm, onCancel, deleting }: {
    name: string; onConfirm: () => void; onCancel: () => void; deleting: boolean
}) {
    const { language } = useSettings()
    const [typedConfirm, setTypedConfirm] = React.useState('')
    const isConfirmed = typedConfirm.toLowerCase() === 'delete'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
            <div className="bg-white rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] max-w-sm w-full p-6 text-left border border-slate-100/80">
                {/* Warning Icon Banner */}
                <div className="flex items-center gap-3.5 mb-4 pb-4 border-b border-slate-100">
                    <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-5 h-5 text-red-650 stroke-[1.75]" />
                    </div>
                    <div>
                        <h3 className="text-[14px] font-extrabold text-slate-900 leading-tight">
                            {language === 'vi' ? 'Xóa nhân viên' : 'Delete Staff Member'}
                        </h3>
                        <p className="text-[9px] text-red-600 font-extrabold uppercase tracking-wider mt-0.5">
                            {language === 'vi' ? 'Hành động nguy hiểm' : 'Destructive Action'}
                        </p>
                    </div>
                </div>

                {/* Warning Description */}
                <p className="text-[11px] text-slate-500 font-medium leading-relaxed mb-5">
                    {language === 'vi' ? (
                        <>Bạn đang thực hiện xóa tài khoản của <strong>{name}</strong>. Hành động này là vĩnh viễn, không thể khôi phục và sẽ xóa toàn bộ dữ liệu lịch sử liên quan (hợp đồng, turn ca, lương, phép, v.v.).</>
                    ) : (
                        <>You are deleting the profile for <strong>{name}</strong>. This is permanent, cannot be undone, and will erase all related historical records (contracts, rosters, salary, leaves, etc.).</>
                    )}
                </p>
                
                {/* Security Confirm Input */}
                <div className="mb-5 bg-slate-50/60 border border-slate-100 rounded-2xl p-3.5">
                    <label className="block text-[9px] font-extrabold text-slate-450 uppercase tracking-widest mb-1.5">
                        {language === 'vi' ? 'Nhập chữ "delete" để xác nhận:' : 'Type "delete" to confirm:'}
                    </label>
                    <input 
                        type="text"
                        value={typedConfirm}
                        onChange={(e) => setTypedConfirm(e.target.value)}
                        placeholder="delete"
                        className="w-full px-3 py-2 text-[13px] bg-white border border-slate-200 rounded-xl focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none transition-all placeholder:text-slate-350 font-medium text-slate-800"
                    />
                </div>

                <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-4">
                    <button 
                        onClick={onCancel} 
                        className="px-4.5 py-2.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition cursor-pointer"
                    >
                        {language === 'vi' ? 'Hủy' : 'Cancel'}
                    </button>
                    <button 
                        onClick={onConfirm} 
                        disabled={deleting || !isConfirmed}
                        className="px-4.5 py-2.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200/60 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer shadow-sm shadow-red-100/10"
                    >
                        {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" /> : null}
                        {language === 'vi' ? 'Xóa' : 'Delete'}
                    </button>
                </div>
            </div>
        </div>
    )
}

