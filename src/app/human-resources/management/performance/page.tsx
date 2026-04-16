'use client'

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffPerformance, HRStaffMember, HRRatingCategory, HRReviewPeriod } from '@/types/human-resources'

export type AppAccount = {
    id: string
    user_id?: string | null
    email: string
    phone: string | null
    name: string | null
    position: string | null
    role: 'owner' | 'admin' | 'staff'
    is_active: boolean
    created_at: string
}

import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'
import {
    Star, Plus, Search, X, Pencil, Trash2,
    TrendingUp, TrendingDown, User, ChevronLeft, ChevronRight
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════
   Rating categories are now loaded dynamically from
   hr_rating_categories table via Settings page.
   ═══════════════════════════════════════════════════════════ */

import PerformanceModal, { OVERALL_LABELS, RatingStars, computePeriodLabel, computeAverage } from '@/components/human-resources/PerformanceModal'

interface SelectStaffModalProps {
    open: boolean;
    onClose: () => void;
    onSelect: (staffId: string) => void;
    staffList: HRStaffMember[];
    title?: string;
    subtitle?: string;
}

function SelectStaffModal({ open, onClose, onSelect, staffList, title = "Select Staff", subtitle = "Search and select an active staff member to review." }: SelectStaffModalProps) {
    const [search, setSearch] = useState('')
    
    if (!open) return null

    const filtered = staffList.filter(s => {
        if (s.status !== 'active') return false
        const q = search.toLowerCase()
        return (
            (s.full_name || '').toLowerCase().includes(q) ||
            (s.position || '').toLowerCase().includes(q) ||
            (s.department || '').toLowerCase().includes(q)
        )
    })

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                        <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition self-start">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-4 border-b border-gray-100 bg-slate-50 shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input type="text" placeholder="Search by name, position or department..." 
                            value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" 
                        />
                    </div>
                </div>

                <div className="overflow-y-auto p-2 flex-1 space-y-1">
                    {filtered.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm">No staff found matching your search.</div>
                    ) : (
                        filtered.map(s => (
                            <button key={s.id} type="button" onClick={() => onSelect(s.id)}
                                className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 transition flex items-center justify-between group">
                                <div>
                                    <div className="font-medium text-gray-900">{s.full_name}</div>
                                    <div className="text-sm text-gray-500 mt-0.5 flex items-center gap-2">
                                        <span>{s.position}</span>
                                        {s.department && (
                                            <>
                                                <span className="w-1 h-1 rounded-full bg-gray-300" />
                                                <span>{s.department}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                    <User className="w-4 h-4" />
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}


interface SelectAccountModalProps {
    open: boolean;
    onClose: () => void;
    onSelect: (accountId: string, accountName: string) => void;
    accountList: AppAccount[];
    title?: string;
    subtitle?: string;
}

function SelectAccountModal({ open, onClose, onSelect, accountList, title = "Select Account", subtitle = "Search and select an active account." }: SelectAccountModalProps) {
    const [search, setSearch] = useState('')
    
    if (!open) return null

    const filtered = accountList.filter(a => {
        if (!a.is_active) return false
        const q = search.toLowerCase()
        return (
            (a.name || '').toLowerCase().includes(q) ||
            (a.email || '').toLowerCase().includes(q) ||
            (a.role || '').toLowerCase().includes(q)
        )
    })

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md transition-all">
            <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full flex flex-col max-h-[85vh] border border-white/50 overflow-hidden ring-1 ring-black/5">
                <div className="flex items-start justify-between p-6 border-b border-gray-200/50 shrink-0 bg-white/50">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 tracking-tight">{title}</h3>
                        <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{subtitle}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100/80 rounded-full transition-all self-start">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-5 border-b border-gray-200/50 bg-gray-50/50 shrink-0">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                        </div>
                        <input type="text" placeholder="Search by name, email or role..." 
                            value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full pl-11 pr-4 py-3.5 bg-white border border-gray-200/80 rounded-2xl text-sm text-gray-900 placeholder-gray-400 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all shadow-sm" 
                            autoFocus
                        />
                    </div>
                </div>

                <div className="overflow-y-auto p-3 flex-1">
                    {filtered.length === 0 ? (
                        <div className="text-center py-16 px-6">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                                <User className="w-8 h-8 text-gray-300" />
                            </div>
                            <h4 className="text-gray-900 text-base font-semibold mb-1">No accounts found</h4>
                            <p className="text-gray-500 text-sm">We couldn't find anyone matching "{search}".</p>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {filtered.map(acc => {
                                const initials = (acc.name || acc.email).substring(0, 2).toUpperCase()
                                const isOwner = acc.role === 'owner'
                                const isAdmin = acc.role === 'admin'
                                const isStaff = acc.role === 'staff'
                                
                                return (
                                    <button 
                                        key={acc.id} 
                                        type="button" 
                                        onClick={() => onSelect(acc.id, acc.name || acc.email)}
                                        className="w-full text-left p-3 rounded-2xl hover:bg-white focus:bg-white focus:ring-2 focus:ring-blue-500/20 active:scale-[0.98] transition-all flex items-center gap-4 group border border-transparent hover:border-gray-200/60 hover:shadow-sm"
                                    >
                                        <div className="relative shrink-0">
                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-inner tracking-wider">
                                                {initials}
                                            </div>
                                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100">
                                                <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-gray-900 truncate">{acc.name || acc.email}</span>
                                                {isOwner && <span className="px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-bold uppercase tracking-wider border border-purple-100/50 shrink-0">Owner</span>}
                                                {isAdmin && <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider border border-blue-100/50 shrink-0">Admin</span>}
                                                {isStaff && <span className="px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-700 text-[10px] font-bold uppercase tracking-wider border border-gray-200/50 shrink-0">Staff</span>}
                                            </div>
                                            <div className="text-sm text-gray-500 mt-0.5 truncate flex items-center gap-2">
                                                <span className="truncate">{acc.email}</span>
                                                {acc.position && (
                                                    <>
                                                        <span className="w-1 h-1 rounded-full bg-gray-300 shrink-0"></span>
                                                        <span className="truncate">{acc.position}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="w-8 h-8 rounded-full bg-blue-50/0 text-blue-600 flex items-center justify-center opacity-0 group-hover:opacity-100 group-hover:bg-blue-50 transition-all shrink-0">
                                            <svg className="w-4 h-4 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

 

/* ═══════════════════════════════════════════════════════
   Delete Confirm
   ═══════════════════════════════════════════════════════ */
function DeleteConfirm({ label, onConfirm, onCancel, deleting }: {
    label: string; onConfirm: () => void; onCancel: () => void; deleting: boolean
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Review</h3>
                <p className="text-sm text-gray-600 mb-6">
                    Are you sure you want to delete the review for <strong>{label}</strong>? This cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Cancel</button>
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

/* ═══════════════════════════════════════════════════════
   Expandable Row Detail – shows category breakdown
   ═══════════════════════════════════════════════════════ */
function CategoryBreakdown({ ratings }: { ratings: Record<string, number> }) {
    // Convert keys back to labels for display
    const keyToLabel = (key: string) => key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2 px-4 py-3 bg-gray-50/50">
            {Object.entries(ratings).map(([key, val]) => {
                if (val === 0) return null
                return (
                    <div key={key} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-500 truncate">{keyToLabel(key)}</span>
                        <div className="flex items-center gap-1 shrink-0">
                            <RatingStars rating={val} />
                            <span className="text-xs font-semibold text-gray-600 w-3 text-right">{val}</span>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

/* ═══════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════ */
export default function PerformancePage() {
    const { hrReviewFrequency, language } = useSettings()
    
    const [loading, setLoading]       = useState(true)
    const [reviews, setReviews]       = useState<(HRStaffPerformance & { hr_staff: HRStaffMember })[]>([])
    const [staffList, setStaffList]   = useState<HRStaffMember[]>([])
    const [accountList, setAccountList] = useState<AppAccount[]>([])
    const [allCategories, setAllCategories] = useState<HRRatingCategory[]>([])
    
    const [periodOffset, setPeriodOffset] = useState(0)
    const today = new Date().toISOString().slice(0, 10)
    const activePeriodLabel = useMemo(() => computePeriodLabel(hrReviewFrequency, today, periodOffset), [hrReviewFrequency, today, periodOffset])

    const [search, setSearch]         = useState('')
    const [filterRating, setFilterRating] = useState<'all' | string>('all')
    const [expandedId, setExpandedId]     = useState<string | null>(null)

    const [isStaffSelectOpen, setStaffSelectOpen] = useState(false)
    const [preselectedStaffForNew, setPreselectedStaffForNew] = useState<string | null>(null)
    const [modalOpen, setModalOpen]       = useState(false)
    const [editingReview, setEditingReview] = useState<HRStaffPerformance | null>(null)
    const [saving, setSaving]             = useState(false)

    const [isAssignSelectOpen, setAssignSelectOpen] = useState(false)
    const [assigningForId, setAssigningForId] = useState<string | null>(null)

    const [deletingId, setDeletingId]     = useState<string | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            const [staffRes, reviewRes, catRes, accRes] = await Promise.all([
                supabase.from('hr_staff').select('*').order('full_name'),
                supabase.from('hr_staff_performance').select('*, hr_staff(*)').order('review_date', { ascending: false }),
                supabase.from('hr_rating_categories').select('*').order('sort_order'),
                supabase.from('app_accounts').select('*').order('name'),
            ])
            if (staffRes.data) setStaffList(staffRes.data as HRStaffMember[])
            if (reviewRes.data) setReviews(reviewRes.data as any)
            if (catRes.data) setAllCategories(catRes.data as HRRatingCategory[])
            if (accRes.data) setAccountList(accRes.data as AppAccount[])
        } catch (err) { console.error(err) }
        setLoading(false)
    }, [])

    useEffect(() => { fetchAll() }, [fetchAll])

    const filteredStaff = useMemo(() => {
        return staffList.filter(s => {
            if (s.status !== 'active') return false
            if (search) {
                const q = search.toLowerCase()
                if (!s.full_name?.toLowerCase().includes(q) && !s.position?.toLowerCase().includes(q)) return false
            }
            if (filterRating !== 'all') {
                const review = reviews.find(r => r.staff_id === s.id && r.period === activePeriodLabel)
                if (!review || String(review.rating) !== filterRating) return false
            }
            return true
        })
    }, [staffList, search, filterRating, reviews, activePeriodLabel])

    /* Summary for selected tab */
    const reviewsInTab = useMemo(() => reviews.filter(r => r.period === activePeriodLabel), [reviews, activePeriodLabel])
    const avgRating = reviewsInTab.length > 0
        ? (reviewsInTab.reduce((s, r) => s + r.rating, 0) / reviewsInTab.length).toFixed(1)
        : '—'
    const completedCount = reviewsInTab.length
    const pendingCount = staffList.filter(s => s.status === 'active').length - completedCount

    const summaryCards = [
        { label: 'Completed Reviews',  value: completedCount,          icon: Star,         color: 'text-blue-600',    bg: 'bg-blue-50' },
        { label: 'Pending Reviews',    value: pendingCount,            icon: User,         color: 'text-orange-600',  bg: 'bg-orange-50' },
        { label: 'Avg Rating',         value: avgRating,               icon: TrendingUp,   color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: 'Total Active Staff', value: staffList.filter(s => s.status === 'active').length, icon: User, color: 'text-slate-600', bg: 'bg-slate-50' },
    ]

    const handleSave = async (data: any) => {
        setSaving(true)
        try {
            if (editingReview) {
                const { error } = await supabase.from('hr_staff_performance').update(data).eq('id', editingReview.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('hr_staff_performance').insert([data])
                if (error) throw error
            }
            setModalOpen(false); setEditingReview(null)
            await fetchAll()
        } catch (err) { console.error(err); alert('Failed to save review') }
        setSaving(false)
    }

    const handleDelete = async () => {
        if (!deletingId) return
        setDeleteLoading(true)
        try {
            const { error } = await supabase.from('hr_staff_performance').delete().eq('id', deletingId)
            if (error) throw error
            setDeletingId(null); await fetchAll()
        } catch (err) { console.error(err); alert('Failed to delete') }
        setDeleteLoading(false)
    }

    if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><CircularLoader /></div>

    return (
        <div className="min-h-screen bg-slate-900 text-gray-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Performance Reviews</h1>
                        <p className="text-sm text-slate-400 mt-1">Multi-category evaluations with overall average rating.</p>
                    </div>
                    <button onClick={() => { setEditingReview(null); setPreselectedStaffForNew(null); setStaffSelectOpen(true) }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition shadow hover:shadow-lg shrink-0">
                        <Plus className="w-4 h-4" />
                        New Review
                    </button>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    {summaryCards.map(c => (
                        <div key={c.label} className="rounded-xl bg-white shadow-sm p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className={`p-1.5 rounded-lg ${c.bg}`}><c.icon className={`w-4 h-4 ${c.color}`} /></div>
                                <span className="text-xs text-gray-500">{c.label}</span>
                            </div>
                            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                        </div>
                    ))}
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="text" placeholder="Search name, position…" value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none" />
                        {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10"><X className="w-3 h-3 text-slate-400" /></button>}
                    </div>
                    <select value={filterRating} onChange={e => setFilterRating(e.target.value)}
                        className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                        <option value="all">All Ratings</option>
                        {[5, 4, 3, 2, 1].map(r => <option key={r} value={String(r)}>{r} — {OVERALL_LABELS[r].label}</option>)}
                    </select>
                    <span className="text-xs text-slate-500 ml-auto">{filteredStaff.length} shown</span>
                </div>

                {/* Header Nav */}
                <div className="mt-3 mb-4 flex items-center justify-between text-sm text-blue-100">
                    <button type="button" onClick={() => setPeriodOffset(prev => prev - 1)} className="flex items-center gap-1 hover:text-white">
                        <ChevronLeft className="w-4 h-4" />
                        <span>Previous</span>
                    </button>

                    <div className="flex items-center gap-2 text-white">
                        <span className="text-base font-semibold">{activePeriodLabel}</span>
                    </div>

                    <button type="button" onClick={() => setPeriodOffset(prev => prev + 1)} className="flex items-center gap-1 hover:text-white">
                        <span>Next</span>
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                {/* Table */}
                <div className="rounded-2xl bg-white shadow-md overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Staff Member</th>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Review Date</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Status & Overall</th>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Reviewer</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStaff.map((staff, idx) => {
                                    const r = reviewsInTab.find(rev => rev.staff_id === staff.id)
                                    const avg = r ? computeAverage(r.category_ratings || {}) : 0
                                    const overallRounded = r ? (Math.round(avg) || r.rating) : 0
                                    const rl = overallRounded ? (OVERALL_LABELS[overallRounded] || OVERALL_LABELS[3]) : null
                                    const isExpanded = r && expandedId === r.id

                                    return (
                                        <Fragment key={staff.id}>
                                            <tr className={`border-t border-gray-100 transition-colors ${idx % 2 === 0 ? 'bg-gray-50/30' : ''} cursor-pointer hover:bg-gray-100`}
                                                onClick={() => {
                                                    if (r) {
                                                        setEditingReview(r)
                                                        setModalOpen(true)
                                                    } else {
                                                        setEditingReview(null)
                                                        setPreselectedStaffForNew(staff.id)
                                                        setModalOpen(true)
                                                    }
                                                }}>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                                            {(staff.full_name || '').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <span className="text-sm font-medium text-gray-900 block truncate">{staff.full_name}</span>
                                                            <span className="text-xs text-gray-400 block">{staff.position}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-600">
                                                    {r ? new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(r.review_date)) : <span className="text-slate-400">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {r ? (
                                                        <div className="flex flex-col items-center gap-1">
                                                            <RatingStars rating={avg > 0 ? avg : r.rating} />
                                                            <span className={`text-xs font-bold ${rl?.color}`}>
                                                                {avg > 0 ? avg.toFixed(1) : r.rating} — {rl?.label}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="px-2 py-1 bg-amber-50 text-amber-600 font-semibold text-[10px] uppercase rounded-full tracking-wider border border-amber-100">Pending</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-600">{r?.reviewer_name || '—'}</td>
                                                <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                                    {!r && (
                                                        <button 
                                                            onClick={(e) => { 
                                                                e.stopPropagation()
                                                                setAssigningForId(staff.id)
                                                                setAssignSelectOpen(true)
                                                            }}
                                                            className="px-3 py-1 text-xs font-medium bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 rounded-lg transition whitespace-nowrap">
                                                            Assign Review
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        </Fragment>
                                    )
                                })}
                                {filteredStaff.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-16 text-center">
                                            <User className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                            <p className="text-gray-500 text-sm font-medium">
                                                No results match your filters
                                            </p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <SelectStaffModal 
                open={isStaffSelectOpen} 
                onClose={() => setStaffSelectOpen(false)} 
                staffList={staffList} 
                onSelect={(id) => {
                    setPreselectedStaffForNew(id)
                    setStaffSelectOpen(false)
                    setModalOpen(true)
                }} 
            />

            <SelectAccountModal 
                open={isAssignSelectOpen} 
                onClose={() => setAssignSelectOpen(false)}
                title="Assign Review To"
                subtitle={`Select an app user to handle the review for ${staffList.find(s => s.id === assigningForId)?.full_name}.`}
                accountList={accountList}
                onSelect={(id, name) => {
                    alert(`Review assigned to ${name}!\nThis visual action works. Data-saving will be fully unlocked when Application Access Control is integrated later.`);
                    setAssignSelectOpen(false);
                }}
            />

            <PerformanceModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingReview(null) }}
                onSave={handleSave} review={editingReview} staffList={staffList} allCategories={allCategories} saving={saving} preselectedStaffId={preselectedStaffForNew} preselectedPeriod={activePeriodLabel} onDelete={(id) => setDeletingId(id)} />

            {deletingId && (
                <DeleteConfirm
                    label={reviews.find(r => r.id === deletingId)?.hr_staff?.full_name || ''}
                    onConfirm={handleDelete} onCancel={() => setDeletingId(null)} deleting={deleteLoading} />
            )}
        </div>
    )
}
