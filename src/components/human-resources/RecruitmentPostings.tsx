'use client'

import { useState, useEffect, Fragment, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { RecruitmentPosting, RecruitmentPlatform, RecruitmentPlatformPackage } from '@/types/human-resources'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { 
    Globe, 
    Plus, 
    ExternalLink, 
    Package,
    Calendar,
    X,
    Pencil,
    Trash2,
    Archive,
    ArchiveRestore,
    ArrowUp,
    ArrowDown,
    Filter,
    MoreVertical
} from 'lucide-react'
import { AddPostingModal } from './AddPostingModal'
import { PackageManagerModal } from './PackageManagerModal'
import { useSettings } from '@/contexts/SettingsContext'

const FALLBACK_PLATFORM = { icon: '📌', color: 'bg-gray-100 text-gray-800' }

const formatDate = (dateString?: string | null) => {
    if (!dateString) return '—'
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return '—'
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
}

interface RecruitmentPostingsProps {
    hiringRequestId: string
    positionTitle: string
    onActivityUpdate?: () => void
}

export function RecruitmentPostings({ hiringRequestId, positionTitle, onActivityUpdate }: RecruitmentPostingsProps) {
    const { language } = useSettings()
    const isVI = language === 'vi'

    const [postings, setPostings] = useState<RecruitmentPosting[]>([])
    const [candidates, setCandidates] = useState<{ id: string; recruitment_posting_id?: string | null; stage: string }[]>([])
    const [loading, setLoading] = useState(true)
    const [showAddModal, setShowAddModal] = useState(false)
    const [postingToEdit, setPostingToEdit] = useState<RecruitmentPosting | null>(null)
    const [selectedPostingForDetail, setSelectedPostingForDetail] = useState<(RecruitmentPosting & { computed_leads: number; computed_hired: number }) | null>(null)
    const [activeTab, setActiveTab] = useState<'active' | 'expired'>('active')
    
    const [platformConfig, setPlatformConfig] = useState<Record<string, { icon: string; color: string }>>({})
    const [packageData, setPackageData] = useState<Record<string, { name: string; total_cost: number; postings_count: number; end_date?: string | null }>>({})
    const [userRole, setUserRole] = useState<string | null>(null)
    const [selectedPlatformForPackages, setSelectedPlatformForPackages] = useState<{ value: string; label: string } | null>(null)

    // Column sort & filter states
    const [sortKey, setSortKey] = useState<string>('posted_at')
    const [sortAsc, setSortAsc] = useState<boolean>(false)
    const [columnFilters, setColumnFilters] = useState<Record<string, Set<string> | null>>({})
    const [openMenu, setOpenMenu] = useState<string | null>(null)

    const applySort = (k: string, asc: boolean) => {
        setSortKey(k); setSortAsc(asc); setOpenMenu(null)
    }
    const applyColumnFilter = (col: string, vals: Set<string> | null) => {
        setColumnFilters(prev => ({ ...prev, [col]: vals })); setOpenMenu(null)
    }
    const clearColumnFilter = (col: string) => {
        setColumnFilters(prev => { const n = { ...prev }; delete n[col]; return n }); setOpenMenu(null)
    }

    const formatCurrency = useCallback((amount: number) => {
        if (amount === 0) return 'Free'
        return new Intl.NumberFormat(isVI ? 'vi-VN' : 'en-US', {
            style: 'currency',
            currency: 'VND',
            maximumFractionDigits: 0
        }).format(amount)
    }, [isVI])

    const getEffectiveCost = useCallback((posting: RecruitmentPosting) => {
        if (posting.package_id && packageData[posting.package_id]) {
            const pkg = packageData[posting.package_id]
            return pkg.postings_count > 0 ? pkg.total_cost / pkg.postings_count : pkg.total_cost
        }
        return posting.direct_cost || 0
    }, [packageData])

    const displayValue = useCallback((p: any, key: string): string => {
        switch (key) {
            case 'platform': return p.platform || '';
            case 'package': return p.package_name || (p.package_id ? 'Package' : '');
            case 'effectiveCost': return formatCurrency(p.effectiveCost);
            case 'computed_leads': return String(p.computed_leads);
            case 'computed_hired': return String(p.computed_hired);
            case 'costPerLead': return p.costPerLead > 0 ? formatCurrency(p.costPerLead) : '—';
            case 'costPerHire': return p.costPerHire > 0 ? formatCurrency(p.costPerHire) : '—';
            case 'posted_at': return formatDate(p.posted_at);
            case 'expires_at': return formatDate(p.expires_at);
            default: return '';
        }
    }, [isVI, formatCurrency])

    const enrichedPostings = useMemo(() => {
        return postings.map(p => {
            const matchingCandidates = candidates.filter(c => c.recruitment_posting_id === p.id)
            const computed_leads = matchingCandidates.length
            const computed_hired = matchingCandidates.filter(c => c.stage === 'hired').length
            const effectiveCost = getEffectiveCost(p)
            const costPerLead = computed_leads > 0 ? effectiveCost / computed_leads : 0
            const costPerHire = computed_hired > 0 ? effectiveCost / computed_hired : 0
            return {
                ...p,
                computed_leads,
                computed_hired,
                effectiveCost,
                costPerLead,
                costPerHire
            }
        })
    }, [postings, candidates, packageData, getEffectiveCost])

    const isPostingActive = useCallback((p: RecruitmentPosting) => {
        const isStatusActive = p.status === 'active'
        if (!isStatusActive) return false
        
        // 1. Check if posting expires_at date has passed
        if (p.expires_at && new Date(p.expires_at) <= new Date()) {
            return false
        }
        
        // 2. Check if linked package end_date has passed
        if (p.package_id && packageData[p.package_id]) {
            const pkg = packageData[p.package_id]
            const todayStr = new Date().toISOString().substring(0, 10)
            if (pkg.end_date && pkg.end_date < todayStr) {
                return false
            }
        }
        
        return true
    }, [packageData])

    const finalFilteredPostings = useMemo(() => {
        let out = enrichedPostings.filter(p => {
            const active = isPostingActive(p)
            return activeTab === 'active' ? active : !active
        })

        // Apply column filters
        for (const [col, allowed] of Object.entries(columnFilters)) {
            if (!allowed) continue
            out = out.filter(p => {
                const v = displayValue(p, col)
                return allowed.has(v)
            })
        }

        // Apply sorting
        out.sort((a, b) => {
            if (sortKey === 'effectiveCost' || sortKey === 'computed_leads' || sortKey === 'computed_hired' || sortKey === 'costPerLead' || sortKey === 'costPerHire') {
                const an = Number(a[sortKey as keyof typeof a]) || 0
                const bn = Number(b[sortKey as keyof typeof b]) || 0
                return sortAsc ? an - bn : bn - an
            }

            const av = String(a[sortKey as keyof typeof a] || '')
            const bv = String(b[sortKey as keyof typeof b] || '')
            const cmp = av.localeCompare(bv, undefined, { numeric: true })
            return sortAsc ? cmp : -cmp
        })

        return out
    }, [enrichedPostings, activeTab, columnFilters, sortKey, sortAsc, displayValue, isPostingActive])

    const columnValues = useMemo(() => {
        const map: Record<string, string[]> = {}
        const keys = ['platform', 'package', 'effectiveCost', 'computed_leads', 'computed_hired', 'posted_at', 'expires_at']
        const tabPostings = enrichedPostings.filter(p => {
            const active = isPostingActive(p)
            return activeTab === 'active' ? active : !active
        })
        keys.forEach(k => {
            const set = new Set<string>()
            tabPostings.forEach(p => {
                const v = displayValue(p, k)
                set.add(v)
            })
            map[k] = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        })
        return map
    }, [enrichedPostings, activeTab, displayValue, isPostingActive])

    useEffect(() => {
        loadData()
    }, [hiringRequestId])

    const loadData = async () => {
        setLoading(true)
        await fetchUserRole()
        await Promise.all([fetchPostings(), fetchCandidates(), fetchPlatformConfig(), fetchPackagesInfo()])
        setLoading(false)
    }

    const fetchUserRole = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data } = await supabase
                    .from('app_accounts')
                    .select('role')
                    .eq('user_id', user.id)
                    .single()
                if (data) {
                    setUserRole(data.role)
                }
            }
        } catch (error) {
            console.error('Error fetching user role in postings:', error)
        }
    }

    const fetchPostings = async () => {
        try {
            const { data, error } = await supabase
                .from('recruitment_postings')
                .select('*, poster:app_accounts!recruitment_postings_posted_by_fkey(name)')
                .eq('hiring_request_id', hiringRequestId)
                .order('posted_at', { ascending: false })

            if (error) throw error
            setPostings(data as RecruitmentPosting[])
        } catch (error) {
            console.error('Error fetching postings:', error)
        }
    }

    const fetchCandidates = async () => {
        try {
            const { data, error } = await supabase
                .from('candidates')
                .select('id, recruitment_posting_id, stage')
                .eq('hiring_request_id', hiringRequestId)

            if (error) throw error
            setCandidates(data as any[])
        } catch (error) {
            console.error('Error fetching candidates in postings component:', error)
        }
    }

    const fetchPlatformConfig = async () => {
        try {
            const { data, error } = await supabase
                .from('recruitment_platforms')
                .select('value, icon, color_bg, color_text')
                .order('sort_order', { ascending: true })

            if (error) throw error
            const config: Record<string, { icon: string; color: string }> = {}
            ;(data || []).forEach((p: any) => {
                config[p.value] = { icon: p.icon, color: `${p.color_bg} ${p.color_text}` }
            })
            setPlatformConfig(config)
        } catch (error) {
            console.error('Error fetching platform config:', error)
        }
    }

    const fetchPackagesInfo = async () => {
        try {
            const { data: pkgs, error: pkgError } = await supabase
                .from('recruitment_platform_packages')
                .select('id, name, total_cost, end_date')

            if (pkgError) throw pkgError

            const { data: posts, error: postError } = await supabase
                .from('recruitment_postings')
                .select('package_id')
                .not('package_id', 'is', null)

            if (postError) throw postError

            const counts: Record<string, number> = {}
            if (posts) {
                posts.forEach((p: any) => {
                    counts[p.package_id] = (counts[p.package_id] || 0) + 1
                })
            }

            const info: Record<string, { name: string; total_cost: number; postings_count: number; end_date?: string | null }> = {}
            if (pkgs) {
                pkgs.forEach((p: any) => {
                    info[p.id] = {
                        name: p.name,
                        total_cost: p.total_cost,
                        end_date: p.end_date,
                        postings_count: counts[p.id] || 0
                    }
                })
            }
            setPackageData(info)
        } catch (error) {
            console.error('Error fetching packages info:', error)
        }
    }

    const deletePosting = async (postingId: string) => {
        try {
            const { error } = await supabase
                .from('recruitment_postings')
                .delete()
                .eq('id', postingId)

            if (error) throw error

            setPostings(prev => prev.filter(p => p.id !== postingId))
            fetchPackagesInfo() // Refresh package posting counts
            if (onActivityUpdate) onActivityUpdate()
        } catch (error) {
            console.error('Error deleting posting log:', error)
            alert(isVI ? 'Không thể xóa dòng nhật ký' : 'Failed to delete log entry')
        }
    }

    const archivePosting = async (postingId: string, newStatus: 'active' | 'archived') => {
        try {
            const { error } = await supabase
                .from('recruitment_postings')
                .update({ status: newStatus })
                .eq('id', postingId)

            if (error) throw error

            setPostings(prev => prev.map(p => p.id === postingId ? { ...p, status: newStatus } : p))
            if (onActivityUpdate) onActivityUpdate()
        } catch (error) {
            console.error('Error updating posting status:', error)
            alert(isVI ? 'Không thể cập nhật trạng thái bài đăng' : 'Failed to update posting status')
        }
    }

    // Totals calculations
    const totalCost = finalFilteredPostings.reduce((sum, p) => sum + p.effectiveCost, 0)
    const totalLeads = finalFilteredPostings.reduce((sum, p) => sum + p.computed_leads, 0)
    const totalHired = finalFilteredPostings.reduce((sum, p) => sum + p.computed_hired, 0)

    // Calculate averages based only on paid postings to prevent free/organic hires from skewing the cost metrics
    const paidPostingsForAvg = finalFilteredPostings.filter(p => p.effectiveCost > 0)
    const totalPaidCost = paidPostingsForAvg.reduce((sum, p) => sum + p.effectiveCost, 0)
    const totalPaidLeads = paidPostingsForAvg.reduce((sum, p) => sum + p.computed_leads, 0)
    const totalPaidHired = paidPostingsForAvg.reduce((sum, p) => sum + p.computed_hired, 0)

    const avgCostPerLead = totalPaidLeads > 0 ? totalPaidCost / totalPaidLeads : 0
    const avgCostPerHire = totalPaidHired > 0 ? totalPaidCost / totalPaidHired : 0

    const totalColSpan = userRole === 'manager' ? 6 : 9

    const dict = {
        sortAsc: isVI ? 'Sắp xếp tăng dần' : 'Sort Ascending',
        sortDesc: isVI ? 'Sắp xếp giảm dần' : 'Sort Descending',
        selectAll: isVI ? 'Chọn tất cả' : 'Select All',
        deselectAll: isVI ? 'Bỏ chọn tất cả' : 'Deselect All',
        filterPlaceholder: isVI ? 'Tìm kiếm...' : 'Search...',
        clearFilters: isVI ? 'Xóa lọc' : 'Clear Filters'
    }

    if (loading) {
        return (
            <div className="p-6 text-center text-slate-500 text-sm">
                {isVI ? 'Đang tải nhật ký...' : 'Loading posting logs...'}
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <Globe className="h-5 w-5 text-blue-650" />
                        {isVI ? 'Nhật ký đăng tuyển' : 'Posting Log'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {isVI ? 'Theo dõi các tin tuyển dụng đã đăng' : 'Track and manage your job postings'}
                    </p>
                </div>
                
                <div>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 transition shadow-sm cursor-pointer h-9"
                    >
                        <Plus className="h-4 w-4" />
                        {isVI ? 'Ghi nhận bài đăng' : 'Log Posting'}
                    </button>
                </div>
            </div>

            {/* Minimalist Tabs */}
            <div className="flex border-b border-gray-200/80">
                <button
                    type="button"
                    onClick={() => setActiveTab('active')}
                    className={`pb-3 text-sm font-semibold transition-all px-4 cursor-pointer hover:text-blue-600 ${
                        activeTab === 'active' 
                            ? 'border-b-2 border-blue-500 text-blue-600' 
                            : 'border-b-2 border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                >
                    {isVI ? 'Bài đăng hoạt động' : 'Active Postings'}
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('expired')}
                    className={`pb-3 text-sm font-semibold transition-all px-4 cursor-pointer hover:text-blue-600 ${
                        activeTab === 'expired' 
                            ? 'border-b-2 border-blue-500 text-blue-600' 
                            : 'border-b-2 border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                >
                    {isVI ? 'Hết hạn & Lưu trữ' : 'Expired & Archived'}
                </button>
            </div>

            {/* List Table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-700 table-auto">
                        <thead>
                            <tr className="bg-slate-50 border-b border-gray-200">
                                <ColumnHeader
                                    colKey="platform"
                                    label={isVI ? 'Nền tảng' : 'Platform'}
                                    sortKey={sortKey}
                                    sortAsc={sortAsc}
                                    onSort={applySort}
                                    values={columnValues['platform'] || []}
                                    activeFilter={columnFilters['platform'] || null}
                                    onFilter={(v) => applyColumnFilter('platform', v)}
                                    onClear={() => clearColumnFilter('platform')}
                                    open={openMenu === 'platform'}
                                    onToggle={() => setOpenMenu(openMenu === 'platform' ? null : 'platform')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={dict}
                                />
                                <ColumnHeader
                                    colKey="package"
                                    label={isVI ? 'Package' : 'Package'}
                                    sortKey={sortKey}
                                    sortAsc={sortAsc}
                                    onSort={applySort}
                                    values={columnValues['package'] || []}
                                    activeFilter={columnFilters['package'] || null}
                                    onFilter={(v) => applyColumnFilter('package', v)}
                                    onClear={() => clearColumnFilter('package')}
                                    open={openMenu === 'package'}
                                    onToggle={() => setOpenMenu(openMenu === 'package' ? null : 'package')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={dict}
                                />
                                {userRole !== 'manager' && (
                                    <ColumnHeader
                                        colKey="effectiveCost"
                                        label={isVI ? 'Costo Effettivo' : 'Effective Cost'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['effectiveCost'] || []}
                                        activeFilter={columnFilters['effectiveCost'] || null}
                                        onFilter={(v) => applyColumnFilter('effectiveCost', v)}
                                        onClear={() => clearColumnFilter('effectiveCost')}
                                        open={openMenu === 'effectiveCost'}
                                        onToggle={() => setOpenMenu(openMenu === 'effectiveCost' ? null : 'effectiveCost')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                    />
                                )}
                                <ColumnHeader
                                    colKey="computed_leads"
                                    label={isVI ? 'Candidati' : 'Leads'}
                                    sortKey={sortKey}
                                    sortAsc={sortAsc}
                                    onSort={applySort}
                                    values={columnValues['computed_leads'] || []}
                                    activeFilter={columnFilters['computed_leads'] || null}
                                    onFilter={(v) => applyColumnFilter('computed_leads', v)}
                                    onClear={() => clearColumnFilter('computed_leads')}
                                    open={openMenu === 'computed_leads'}
                                    onToggle={() => setOpenMenu(openMenu === 'computed_leads' ? null : 'computed_leads')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={dict}
                                />
                                <ColumnHeader
                                    colKey="computed_hired"
                                    label={isVI ? 'Assunti' : 'Hired'}
                                    sortKey={sortKey}
                                    sortAsc={sortAsc}
                                    onSort={applySort}
                                    values={columnValues['computed_hired'] || []}
                                    activeFilter={columnFilters['computed_hired'] || null}
                                    onFilter={(v) => applyColumnFilter('computed_hired', v)}
                                    onClear={() => clearColumnFilter('computed_hired')}
                                    open={openMenu === 'computed_hired'}
                                    onToggle={() => setOpenMenu(openMenu === 'computed_hired' ? null : 'computed_hired')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={dict}
                                />
                                {userRole !== 'manager' && (
                                    <ColumnHeader
                                        colKey="costPerLead"
                                        label="Cost/Lead"
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['costPerLead'] || []}
                                        activeFilter={columnFilters['costPerLead'] || null}
                                        onFilter={(v) => applyColumnFilter('costPerLead', v)}
                                        onClear={() => clearColumnFilter('costPerLead')}
                                        open={openMenu === 'costPerLead'}
                                        onToggle={() => setOpenMenu(openMenu === 'costPerLead' ? null : 'costPerLead')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                    />
                                )}
                                {userRole !== 'manager' && (
                                    <ColumnHeader
                                        colKey="costPerHire"
                                        label="Cost/Hire"
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['costPerHire'] || []}
                                        activeFilter={columnFilters['costPerHire'] || null}
                                        onFilter={(v) => applyColumnFilter('costPerHire', v)}
                                        onClear={() => clearColumnFilter('costPerHire')}
                                        open={openMenu === 'costPerHire'}
                                        onToggle={() => setOpenMenu(openMenu === 'costPerHire' ? null : 'costPerHire')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                    />
                                )}
                                <ColumnHeader
                                    colKey="posted_at"
                                    label={isVI ? 'Ngày đăng' : 'Posted Date'}
                                    sortKey={sortKey}
                                    sortAsc={sortAsc}
                                    onSort={applySort}
                                    values={columnValues['posted_at'] || []}
                                    activeFilter={columnFilters['posted_at'] || null}
                                    onFilter={(v) => applyColumnFilter('posted_at', v)}
                                    onClear={() => clearColumnFilter('posted_at')}
                                    open={openMenu === 'posted_at'}
                                    onToggle={() => setOpenMenu(openMenu === 'posted_at' ? null : 'posted_at')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={dict}
                                />
                                <ColumnHeader
                                    colKey="expires_at"
                                    label={isVI ? 'Ngày hết hạn' : 'Expiration Date'}
                                    sortKey={sortKey}
                                    sortAsc={sortAsc}
                                    onSort={applySort}
                                    values={columnValues['expires_at'] || []}
                                    activeFilter={columnFilters['expires_at'] || null}
                                    onFilter={(v) => applyColumnFilter('expires_at', v)}
                                    onClear={() => clearColumnFilter('expires_at')}
                                    open={openMenu === 'expires_at'}
                                    onToggle={() => setOpenMenu(openMenu === 'expires_at' ? null : 'expires_at')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={dict}
                                />
                            </tr>
                        </thead>
                        <tbody>
                            {finalFilteredPostings.length === 0 ? (
                                <tr>
                                    <td colSpan={totalColSpan} className="text-center py-10 text-slate-400 text-xs italic font-semibold bg-gray-50/5">
                                        {isVI ? 'Không có bài đăng nào' : 'No postings available'}
                                    </td>
                                </tr>
                            ) : (
                                finalFilteredPostings.map((posting) => {
                                    const platformInfo = platformConfig[posting.platform] || FALLBACK_PLATFORM
                                    return (
                                        <tr 
                                            key={posting.id} 
                                            onClick={() => setSelectedPostingForDetail(posting)}
                                            className="border-t border-gray-100 hover:bg-slate-50/50 transition cursor-pointer"
                                        >
                                            {/* Platform */}
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className={`inline-flex items-center self-start px-2.5 py-0.5 rounded-full text-xs font-semibold ${platformInfo.color}`}>
                                                        {posting.platform}
                                                    </span>
                                                    {posting.poster?.name && (
                                                        <span className="text-[10px] text-slate-400 font-semibold ml-1">
                                                            {isVI ? 'Đăng bởi: ' : 'Posted by: '}
                                                            {posting.poster.name}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Package Name */}
                                            <td className="px-4 py-3 text-xs text-slate-600">
                                                {posting.package_id ? (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setSelectedPlatformForPackages({
                                                                value: posting.platform,
                                                                label: posting.platform
                                                            })
                                                        }}
                                                        title={isVI ? 'Quản lý gói dịch vụ' : 'Manage Packages'}
                                                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline font-semibold bg-transparent border-0 p-0 cursor-pointer text-left"
                                                    >
                                                        <Package className="w-3.5 h-3.5 text-blue-500" />
                                                        {posting.package_name || (isVI ? 'Gói' : 'Package')}
                                                    </button>
                                                ) : posting.package_name ? (
                                                    <span className="text-slate-600 font-semibold">{posting.package_name}</span>
                                                ) : (
                                                    <span className="text-slate-400 italic">—</span>
                                                )}
                                            </td>

                                            {/* Cost */}
                                            {userRole !== 'manager' && (
                                                <td className="px-4 py-3 text-xs font-bold text-slate-800">
                                                    {formatCurrency(posting.effectiveCost)}
                                                </td>
                                            )}

                                            {/* Leads Count */}
                                            <td className="px-4 py-3 text-xs font-bold text-slate-700">
                                                {posting.computed_leads}
                                            </td>

                                            {/* Hired Count */}
                                            <td className="px-4 py-3 text-xs font-bold text-slate-700">
                                                {posting.computed_hired}
                                            </td>

                                            {/* Cost per Lead */}
                                            {userRole !== 'manager' && (
                                                <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                                                    {posting.costPerLead > 0 ? formatCurrency(posting.costPerLead) : '—'}
                                                </td>
                                            )}

                                            {/* Cost per Hire */}
                                            {userRole !== 'manager' && (
                                                <td className="px-4 py-3 text-xs font-bold text-slate-700">
                                                    {posting.costPerHire > 0 ? formatCurrency(posting.costPerHire) : '—'}
                                                </td>
                                            )}

                                            {/* Posted Date */}
                                            <td className="px-4 py-3 text-xs text-slate-500 font-medium">
                                                {formatDate(posting.posted_at)}
                                            </td>

                                            {/* Expiration Date */}
                                            <td className="px-4 py-3 text-xs text-slate-500 font-medium">
                                                {formatDate(posting.expires_at)}
                                            </td>
                                        </tr>
                                    )
                                })
                            )}

                            {finalFilteredPostings.length > 0 && (
                                <tr className="bg-blue-50/30 border-t border-gray-300 font-bold text-slate-800">
                                    <td className="px-4 py-3 text-xs uppercase tracking-wider font-extrabold">
                                        Total
                                    </td>
                                    <td className="px-4 py-3"></td>
                                    {userRole !== 'manager' && (
                                        <td className="px-4 py-3 text-xs font-extrabold text-blue-900">
                                            {formatCurrency(totalCost)}
                                        </td>
                                    )}
                                    <td className="px-4 py-3 text-xs">
                                        {totalLeads}
                                    </td>
                                    <td className="px-4 py-3 text-xs">
                                        {totalHired}
                                    </td>
                                    {userRole !== 'manager' && (
                                        <td className="px-4 py-3 text-xs text-slate-700">
                                            {avgCostPerLead > 0 ? formatCurrency(avgCostPerLead) : '—'}
                                        </td>
                                    )}
                                    {userRole !== 'manager' && (
                                        <td className="px-4 py-3 text-xs text-blue-900">
                                            {avgCostPerHire > 0 ? formatCurrency(avgCostPerHire) : '—'}
                                        </td>
                                    )}
                                    <td className="px-4 py-3" colSpan={2}></td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detail Modal */}
            <Transition appear show={!!selectedPostingForDetail} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setSelectedPostingForDetail(null)}>
                    <TransitionChild
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" />
                    </TransitionChild>

                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4 text-center">
                            <TransitionChild
                                as={Fragment}
                                enter="ease-out duration-300"
                                enterFrom="opacity-0 scale-95"
                                enterTo="opacity-100 scale-100"
                                leave="ease-in duration-200"
                                leaveFrom="opacity-100 scale-100"
                                leaveTo="opacity-0 scale-95"
                            >
                                <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl border border-gray-100 transition-all text-gray-900">
                                    {selectedPostingForDetail && (
                                        <>
                                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                                                <DialogTitle as="h3" className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                                    <Globe className="h-5 w-5 text-blue-650" />
                                                    {isVI ? 'Chi tiết bài đăng tuyển' : 'Posting Details'}
                                                </DialogTitle>
                                                <button 
                                                    onClick={() => setSelectedPostingForDetail(null)} 
                                                    className="p-1 rounded-full hover:bg-slate-100 transition cursor-pointer"
                                                >
                                                    <X className="h-5 w-5 text-slate-400" />
                                                </button>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">{isVI ? 'Nền tảng' : 'Platform'}</span>
                                                        <span className="text-sm font-semibold text-slate-800">{selectedPostingForDetail.platform}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Package</span>
                                                        <span className="text-sm font-semibold text-slate-800">{selectedPostingForDetail.package_name || '—'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">{isVI ? 'Ngày đăng' : 'Posted Date'}</span>
                                                        <span className="text-sm font-semibold text-slate-800">
                                                            {formatDate(selectedPostingForDetail.posted_at)}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">{isVI ? 'Ngày hết hạn' : 'Expiration Date'}</span>
                                                        <span className="text-sm font-semibold text-slate-800">
                                                            {formatDate(selectedPostingForDetail.expires_at)}
                                                        </span>
                                                    </div>
                                                    {userRole !== 'manager' && (
                                                        <div>
                                                            <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">{isVI ? 'Costo Effettivo' : 'Effective Cost'}</span>
                                                            <span className="text-sm font-bold text-slate-850">{formatCurrency(getEffectiveCost(selectedPostingForDetail))}</span>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Status</span>
                                                        <div className="mt-0.5">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                                isPostingActive(selectedPostingForDetail) ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                                                            }`}>
                                                                {isPostingActive(selectedPostingForDetail) ? (isVI ? 'Hoạt động' : 'Active') : (isVI ? 'Hết hạn/Lưu trữ' : 'Expired/Archived')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">{isVI ? 'Candidati' : 'Leads'}</span>
                                                        <span className="text-sm font-bold text-slate-805">{selectedPostingForDetail.computed_leads}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">{isVI ? 'Assunti' : 'Hired'}</span>
                                                        <span className="text-sm font-bold text-slate-805">{selectedPostingForDetail.computed_hired}</span>
                                                    </div>
                                                </div>

                                                <div>
                                                    <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Link</span>
                                                    {selectedPostingForDetail.platform_url ? (
                                                        <a href={selectedPostingForDetail.platform_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1 font-semibold break-all mt-0.5 block">
                                                            {selectedPostingForDetail.platform_url} <ExternalLink className="w-3.5 h-3.5" />
                                                        </a>
                                                    ) : (
                                                        <span className="text-sm text-slate-400 italic mt-0.5 block">—</span>
                                                    )}
                                                </div>

                                                <div>
                                                    <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">{isVI ? 'Ghi chú' : 'Notes'}</span>
                                                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed mt-1 font-medium bg-slate-50 p-3 rounded-xl border border-slate-200">{selectedPostingForDetail.notes || '—'}</p>
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-center pt-4 mt-5 border-t border-gray-100">
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setPostingToEdit(selectedPostingForDetail);
                                                            setSelectedPostingForDetail(null);
                                                        }}
                                                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100 cursor-pointer"
                                                        title={isVI ? 'Sửa' : 'Edit'}
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    {isPostingActive(selectedPostingForDetail) ? (
                                                        <button
                                                            onClick={async () => {
                                                                await archivePosting(selectedPostingForDetail.id, 'archived');
                                                                setSelectedPostingForDetail(null);
                                                            }}
                                                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors border border-transparent hover:border-amber-100 cursor-pointer"
                                                            title={isVI ? 'Lưu trữ' : 'Archive'}
                                                        >
                                                            <Archive className="w-4 h-4" />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={async () => {
                                                                await archivePosting(selectedPostingForDetail.id, 'active');
                                                                setSelectedPostingForDetail(null);
                                                            }}
                                                            className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-transparent hover:border-green-100 cursor-pointer"
                                                            title={isVI ? 'Khôi phục hoạt động' : 'Activate / Unarchive'}
                                                        >
                                                            <ArchiveRestore className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            const confirmMsg = isVI 
                                                                ? 'Bạn có chắc chắn muốn xóa dòng nhật ký đăng tuyển này?' 
                                                                : 'Are you sure you want to delete this posting log entry?'
                                                            if (confirm(confirmMsg)) {
                                                                deletePosting(selectedPostingForDetail.id);
                                                                setSelectedPostingForDetail(null);
                                                            }
                                                        }}
                                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100 cursor-pointer"
                                                        title={isVI ? 'Xóa' : 'Delete'}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                
                                                <button
                                                    onClick={() => setSelectedPostingForDetail(null)}
                                                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white shadow-sm hover:shadow-md transition-all cursor-pointer h-9 flex items-center justify-center"
                                                >
                                                    {isVI ? 'Đóng' : 'Close'}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </DialogPanel>
                            </TransitionChild>
                        </div>
                    </div>
                </Dialog>
            </Transition>

            {/* Add/Edit Posting Modal */}
            {(showAddModal || postingToEdit) && (
                <AddPostingModal
                    hiringRequestId={hiringRequestId}
                    positionTitle={positionTitle}
                    postingToEdit={postingToEdit}
                    onClose={() => {
                        setShowAddModal(false)
                        setPostingToEdit(null)
                    }}
                    onSuccess={() => {
                        loadData()
                        if (onActivityUpdate) onActivityUpdate()
                    }}
                />
            )}

            {/* Package Manager Modal */}
            {selectedPlatformForPackages && (
                <PackageManagerModal
                    platformValue={selectedPlatformForPackages.value}
                    platformLabel={selectedPlatformForPackages.label}
                    onClose={() => {
                        setSelectedPlatformForPackages(null)
                        fetchPackagesInfo()
                    }}
                    onSuccess={fetchPackagesInfo}
                />
            )}
        </div>
    )
}

type ColumnHeaderProps = {
    colKey: string
    label: string
    sortKey: string
    sortAsc: boolean
    onSort: (k: any, asc: boolean) => void
    values: string[]
    activeFilter: Set<string> | null
    onFilter: (s: Set<string> | null) => void
    onClear: () => void
    open: boolean
    onToggle: () => void
    onClose: () => void
    dict: { sortAsc: string; sortDesc: string; selectAll: string; deselectAll: string; filterPlaceholder: string; clearFilters: string }
    right?: boolean
    center?: boolean
    className?: string
}

function ColumnHeader({ colKey, label, sortKey, sortAsc, onSort, values, activeFilter, onFilter, onClear, open, onToggle, onClose, dict, right, center, className = '' }: ColumnHeaderProps) {
    const ref = useRef<HTMLDivElement>(null)
    const [filterSearch, setFilterSearch] = useState('')
    const [localChecked, setLocalChecked] = useState<Set<string>>(new Set(values))

    useEffect(() => {
        if (open) {
            setLocalChecked(activeFilter ? new Set(activeFilter) : new Set(values))
            setFilterSearch('')
        }
    }, [open, values, activeFilter])

    useEffect(() => {
        if (!open) return
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose()
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [open, onClose])

    const isActive = sortKey === colKey
    const hasFilter = !!activeFilter
    const dropdownStyle = useMemo(() => {
        if (!open || !ref.current) return undefined
        const rect = ref.current.getBoundingClientRect()
        return { top: rect.bottom + 4, left: right ? Math.max(0, rect.right - 220) : rect.left }
    }, [open, right])

    const filteredValues = filterSearch
        ? values.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase()))
        : values

    const allVisibleChecked = filteredValues.length > 0 && filteredValues.every(v => localChecked.has(v))

    function toggleAll() {
        const next = new Set(localChecked)
        if (allVisibleChecked) { filteredValues.forEach(v => next.delete(v)) }
        else { filteredValues.forEach(v => next.add(v)) }
        setLocalChecked(next)
    }

    function toggleOne(v: string) {
        const next = new Set(localChecked)
        if (next.has(v)) next.delete(v); else next.add(v)
        setLocalChecked(next)
    }

    function handleApply() {
        let finalChecked = localChecked;
        if (filterSearch) {
            finalChecked = new Set([...localChecked].filter(x => filteredValues.includes(x)));
        }
        if (finalChecked.size >= values.length) onFilter(null); 
        else onFilter(finalChecked);
    }

    return (
        <th className={`px-4 py-3 ${right ? 'text-right' : ''} ${className} relative`} ref={ref as any}>
            <div className={`flex items-center gap-1 font-semibold ${center ? 'justify-center' : right ? 'justify-end' : 'justify-start'}`}>
                <span className="select-none text-xs text-slate-450 uppercase tracking-wider">{label}</span>
                {isActive && (
                    sortAsc
                        ? <ArrowUp className="w-3.5 h-3.5 text-blue-650 flex-shrink-0" />
                        : <ArrowDown className="w-3.5 h-3.5 text-blue-650 flex-shrink-0" />
                )}
                {hasFilter && <Filter className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />}
                <button
                    onClick={(e) => { e.stopPropagation(); onToggle() }}
                    className="ml-0.5 p-0.5 rounded hover:bg-gray-200 transition-colors flex-shrink-0 cursor-pointer"
                    aria-label={`Menu ${label}`}
                >
                    <MoreVertical className="w-4 h-4 text-gray-500" />
                </button>
            </div>

            {open && dropdownStyle && (
                <div
                    className="fixed bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] min-w-[220px] text-left text-sm text-gray-700 normal-case"
                    style={dropdownStyle}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="px-3 py-2 space-y-1">
                        <button
                            onClick={() => onSort(colKey, true)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${isActive && sortAsc ? 'bg-blue-50 text-blue-755 font-semibold' : 'hover:bg-gray-100'}`}
                        >
                            <ArrowUp className="w-4 h-4" />
                            {dict.sortAsc}
                        </button>
                        <button
                            onClick={() => onSort(colKey, false)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${isActive && !sortAsc ? 'bg-blue-50 text-blue-755 font-semibold' : 'hover:bg-gray-100'}`}
                        >
                            <ArrowDown className="w-4 h-4" />
                            {dict.sortDesc}
                        </button>
                    </div>

                    <div className="border-t border-gray-200" />

                    <div className="px-3 py-2">
                        <input
                            type="text"
                            value={filterSearch}
                            onChange={e => setFilterSearch(e.target.value)}
                            placeholder={dict.filterPlaceholder}
                            className="w-full mb-2 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-gray-900"
                        />
                        <button
                            onClick={toggleAll}
                            className="text-xs text-blue-650 hover:text-blue-800 mb-1 cursor-pointer font-medium"
                        >
                            {allVisibleChecked ? dict.deselectAll : dict.selectAll}
                        </button>
                        <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                            {filteredValues.map(v => (
                                <label key={v} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={localChecked.has(v)}
                                        onChange={() => toggleOne(v)}
                                        className="accent-blue-600 rounded"
                                    />
                                    <span className="truncate text-xs">{v || '(Empty)'}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-gray-200" />

                    <div className="px-3 py-2 flex items-center justify-between gap-2">
                        <button
                            onClick={onClear}
                            className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-xs font-semibold cursor-pointer"
                        >
                            {dict.clearFilters}
                        </button>
                        <button
                            onClick={handleApply}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-750 text-white transition-colors text-xs font-semibold cursor-pointer"
                        >
                            Apply
                        </button>
                    </div>
                </div>
            )}
        </th>
    )
}
