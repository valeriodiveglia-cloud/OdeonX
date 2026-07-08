'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { Candidate, HiringRequest } from '@/types/human-resources'
import { 
    UserIcon, 
    PhoneIcon, 
    PaperClipIcon, 
    CalendarIcon, 
    MapPinIcon,
    PencilSquareIcon,
    TrashIcon
} from '@heroicons/react/24/outline'
import { ArrowUp, ArrowDown, Filter, MoreVertical } from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'
import { CandidateWorkflowModal } from './CandidateWorkflowModal'
import { AddCandidateModal } from './AddCandidateModal'

interface CandidateListProps {
    hiringRequestId: string
    hiringRequest?: HiringRequest
    onRefreshRequest?: () => void
    onCandidateHired?: () => void
}

export function CandidateList({ hiringRequestId, hiringRequest, onRefreshRequest, onCandidateHired }: CandidateListProps) {
    const { language } = useSettings()
    const isVI = language === 'vi'
    const [candidates, setCandidates] = useState<Candidate[]>([])
    const formatDateTime = (dateStr: string | Date | null | undefined): string => {
        if (!dateStr) return '—'
        const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
        if (isNaN(date.getTime())) return '—'
        const dd = String(date.getDate()).padStart(2, '0')
        const mm = String(date.getMonth() + 1).padStart(2, '0')
        const yyyy = date.getFullYear()
        const hh = String(date.getHours()).padStart(2, '0')
        const min = String(date.getMinutes()).padStart(2, '0')
        return `${dd}/${mm}/${yyyy} ${hh}:${min}`
    }
    const [loading, setLoading] = useState(true)
    const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
    const [candidateToEdit, setCandidateToEdit] = useState<Candidate | null>(null)
    const [platformConfig, setPlatformConfig] = useState<Record<string, { icon: string; color: string }>>({})
    const [activeSubTab, setActiveSubTab] = useState<'active' | 'archived' | 'hired'>('active')

    // Column sort & filter states
    const [sortKey, setSortKey] = useState<string>('name')
    const [sortAsc, setSortAsc] = useState<boolean>(true)
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

    const displayValue = useCallback((c: Candidate, key: string): string => {
        switch (key) {
            case 'name': return c.full_name || '';
            case 'source': return c.source || '';
            case 'stage': {
                const stageTranslations: Record<string, { en: string; vi: string }> = {
                    new: { en: 'New', vi: 'Mới' },
                    screened: { en: 'Screened', vi: 'Đã lọc' },
                    interview_scheduled: { en: 'Scheduled', vi: 'Lịch phỏng vấn' },
                    interviewed: { en: 'Interviewed', vi: 'Đã phỏng vấn' },
                    trial_shift: { en: 'Onboarding', vi: 'Chờ nhận việc' },
                    offer_sent: { en: 'Offer Sent', vi: 'Gửi Offer' },
                    hired: { en: 'Hired', vi: 'Đã nhận' },
                    withdrawn: { en: 'Withdrawn', vi: 'Rút lui' },
                    rejected: { en: 'Rejected', vi: 'Từ chối' }
                }
                const info = stageTranslations[c.stage]
                return info ? (isVI ? info.vi : info.en) : c.stage;
            }
            case 'phone': return c.phone || '';
            case 'email': return c.email || '';
            case 'rejection_reason': return getRejectionReasonText(c) || '';
            default: return '';
        }
    }, [isVI])

    const getStageBadgeInfo = (candidate: Candidate) => {
        if (candidate.stage === 'hired' && !candidate.related_staff_id) {
            return {
                label: isVI ? 'Đã xóa' : 'Deleted',
                color: 'bg-rose-50 text-rose-700 border-rose-150'
            }
        }
        if (candidate.stage === 'rejected') {
            if (candidate.rejection_reason) {
                if (candidate.rejection_reason.includes('No Show')) {
                    return {
                        label: isVI ? 'Không đến nhận việc' : 'No Show',
                        color: 'bg-amber-50 text-amber-700 border-amber-200'
                    }
                }
                return {
                    label: isVI ? 'Từ chối Offer' : 'Offer Rejected',
                    color: 'bg-red-50 text-red-700 border-red-200'
                }
            }
            if (candidate.interview_feedback) {
                return {
                    label: isVI ? 'Không đạt Phỏng vấn' : 'Failed Interview',
                    color: 'bg-orange-50 text-orange-700 border-orange-200'
                }
            }
            return {
                label: isVI ? 'Không đạt Vòng lọc' : 'Failed Screening',
                color: 'bg-rose-50 text-rose-700 border-rose-200'
            }
        }
        
        const stageTranslations: Record<string, { en: string; vi: string; color: string }> = {
            new: { en: 'New', vi: 'Mới', color: 'bg-blue-55 text-blue-700 border-blue-150' },
            screened: { en: 'Screened', vi: 'Đã lọc', color: 'bg-indigo-55 text-indigo-700 border-indigo-150' },
            interview_scheduled: { en: 'Scheduled', vi: 'Lịch phỏng vấn', color: 'bg-amber-55 text-amber-700 border-amber-150' },
            interviewed: { en: 'Interviewed', vi: 'Đã phỏng vấn', color: 'bg-purple-55 text-purple-700 border-purple-150' },
            trial_shift: { en: 'Onboarding', vi: 'Chờ nhận việc', color: 'bg-orange-55 text-orange-700 border-orange-150' },
            offer_sent: { en: 'Offer Sent', vi: 'Gửi Offer', color: 'bg-pink-55 text-pink-700 border-pink-150' },
            hired: { en: 'Hired', vi: 'Đã nhận', color: 'bg-green-55 text-green-700 border-green-150' },
            withdrawn: { en: 'Withdrawn', vi: 'Rút lui', color: 'bg-slate-100 text-slate-600 border-slate-200' }
        }
        const info = stageTranslations[candidate.stage] || { en: candidate.stage, vi: candidate.stage, color: 'bg-slate-100 text-slate-750 border-slate-200' }
        return {
            label: isVI ? info.vi : info.en,
            color: info.color
        }
    }

    const getRejectionReasonText = (c: Candidate) => {
        let text = null
        if (c.rejection_reason) text = c.rejection_reason
        else if (c.interview_feedback && c.stage === 'rejected') text = c.interview_feedback
        else if (c.screening_notes && c.stage === 'rejected') text = c.screening_notes
        
        if (text) {
            const parts = text.split(' / ')
            return parts.length === 2 ? (isVI ? parts[1] : parts[0]) : text
        }
        return null
    }

    const columnValues = useMemo(() => {
        const map: Record<string, string[]> = {}
        const keys = ['name', 'source', 'stage', 'phone', 'email', 'rejection_reason']
        const tabCandidates = candidates.filter(candidate => {
            if (activeSubTab === 'hired') {
                return candidate.stage === 'hired'
            } else if (activeSubTab === 'archived') {
                return candidate.stage === 'rejected' || candidate.stage === 'withdrawn'
            } else {
                return candidate.stage !== 'hired' && candidate.stage !== 'rejected' && candidate.stage !== 'withdrawn'
            }
        })
        keys.forEach(k => {
            const set = new Set<string>()
            tabCandidates.forEach(c => {
                const v = displayValue(c, k)
                set.add(v)
            })
            map[k] = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        })
        return map
    }, [candidates, activeSubTab, displayValue])

    const filteredCandidates = useMemo(() => {
        let out = candidates.filter(candidate => {
            if (activeSubTab === 'hired') {
                if (candidate.stage !== 'hired') return false
            } else if (activeSubTab === 'archived') {
                if (candidate.stage !== 'rejected' && candidate.stage !== 'withdrawn') return false
            } else {
                if (candidate.stage === 'hired' || candidate.stage === 'rejected' || candidate.stage === 'withdrawn') return false
            }
            return true
        })

        // Apply column filters
        for (const [col, allowed] of Object.entries(columnFilters)) {
            if (!allowed) continue
            out = out.filter(c => {
                const v = displayValue(c, col)
                return allowed.has(v)
            })
        }

        // Apply sorting
        out.sort((a, b) => {
            const av = displayValue(a, sortKey)
            const bv = displayValue(b, sortKey)
            const cmp = av.localeCompare(bv, undefined, { numeric: true })
            return sortAsc ? cmp : -cmp
        })

        return out
    }, [candidates, activeSubTab, columnFilters, sortKey, sortAsc, displayValue])

    useEffect(() => {
        fetchCandidates()
        fetchPlatformConfig()
    }, [hiringRequestId])

    const fetchCandidates = async () => {
        try {
            const { data, error } = await supabase
                .from('candidates')
                .select('*')
                .eq('hiring_request_id', hiringRequestId)
                .order('created_at', { ascending: false })

            if (error) throw error
            setCandidates(data as Candidate[])
        } catch (error) {
            console.error('Error fetching candidates:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchPlatformConfig = async () => {
        try {
            const { data, error } = await supabase
                .from('recruitment_platforms')
                .select('value, icon, color_bg, color_text')

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

    const handleDeleteCandidate = async (candidate: Candidate) => {
        const confirmDelete = window.confirm(
            isVI
                ? `Bạn có chắc chắn muốn xóa ứng viên "${candidate.full_name}" không? Thao tác này không thể hoàn tác.`
                : `Are you sure you want to delete candidate "${candidate.full_name}"? This action cannot be undone.`
        )
        if (!confirmDelete) return

        try {
            // Delete candidate
            const { error } = await supabase
                .from('candidates')
                .delete()
                .eq('id', candidate.id)

            if (error) throw error

            // Log activity
            const activityMessage = `Deleted candidate ${candidate.full_name} / Đã xóa ứng viên ${candidate.full_name}`
            await supabase.from('hr_activity_log').insert([{
                hiring_request_id: hiringRequestId,
                action_type: 'candidate_deleted',
                message: activityMessage
            }])

            // Refresh candidate list and notify parent
            fetchCandidates()
            if (onRefreshRequest) {
                onRefreshRequest()
            }
        } catch (err: any) {
            console.error('Error deleting candidate:', err)
            alert(err.message || 'Failed to delete candidate')
        }
    }

    if (loading) return <div className="p-4 text-center text-sm font-semibold text-slate-500">{isVI ? 'Đang tải danh sách...' : 'Loading candidates...'}</div>

    return (
        <div className="space-y-6">
            {/* Sub-tabs for filtering candidates on page background */}
            <div className="flex border-b border-slate-800/80 mb-6 gap-6 px-2">
                {(['active', 'archived', 'hired'] as const).map(tab => {
                    const isActive = activeSubTab === tab
                    const count = candidates.filter(c => {
                        if (tab === 'hired') return c.stage === 'hired'
                        if (tab === 'archived') return c.stage === 'rejected' || c.stage === 'withdrawn'
                        return c.stage !== 'hired' && c.stage !== 'rejected' && c.stage !== 'withdrawn'
                    }).length

                    const label = tab === 'active' 
                        ? (isVI ? `Đang hoạt động (${count})` : `Active (${count})`)
                        : tab === 'archived'
                        ? (isVI ? `Đã lưu trữ (${count})` : `Archived (${count})`)
                        : (isVI ? `Đã nhận việc (${count})` : `Hired (${count})`)

                    return (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => {
                                setActiveSubTab(tab)
                                setColumnFilters({})
                                setOpenMenu(null)
                            }}
                            className={`pb-3 text-sm font-semibold border-b-2 transition-all cursor-pointer outline-none ${
                                isActive 
                                    ? 'border-blue-500 text-white font-extrabold' 
                                    : 'border-transparent text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            {label}
                        </button>
                    )
                })}
            </div>

            <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="bg-gray-50/75 border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                {([
                                    ['name', isVI ? 'Họ và tên' : 'Candidate Name'],
                                    ['source', isVI ? 'Nguồn tuyển dụng' : 'Source'],
                                    ['stage', isVI ? 'Trạng thái' : 'Stage', true],
                                    ['phone', isVI ? 'Số điện thoại' : 'Phone'],
                                    ['email', isVI ? 'Email' : 'Email']
                                ] as [string, string, boolean?][]).map(([k, lbl, center]) => (
                                    <ColumnHeader
                                        key={k} colKey={k} label={lbl}
                                        sortKey={sortKey} sortAsc={sortAsc} onSort={applySort}
                                        values={columnValues[k] || []} activeFilter={columnFilters[k] || null}
                                        onFilter={(s) => applyColumnFilter(k, s)} onClear={() => clearColumnFilter(k)}
                                        open={openMenu === k} onToggle={() => setOpenMenu(openMenu === k ? null : k)} onClose={() => setOpenMenu(null)}
                                        dict={isVI ? {
                                            sortAsc: 'Sắp xếp tăng dần',
                                            sortDesc: 'Sắp xếp giảm dần',
                                            selectAll: 'Chọn tất cả',
                                            deselectAll: 'Bỏ chọn tất cả',
                                            filterPlaceholder: 'Lọc...',
                                            clearFilters: 'Xóa bộ lọc'
                                        } : {
                                            sortAsc: 'Sort Ascending',
                                            sortDesc: 'Sort Descending',
                                            selectAll: 'Select All',
                                            deselectAll: 'Deselect All',
                                            filterPlaceholder: 'Filter...',
                                            clearFilters: 'Clear Filters'
                                        }}
                                        center={center} className="px-6 py-4"
                                    />
                                ))}
                                <th className="px-6 py-4 text-left">{isVI ? 'Lịch phỏng vấn' : 'Interview Info'}</th>
                                {activeSubTab === 'archived' && (
                                    <ColumnHeader
                                        colKey="rejection_reason" label={isVI ? 'Lý do từ chối' : 'Rejection Reason'}
                                        sortKey={sortKey} sortAsc={sortAsc} onSort={applySort}
                                        values={columnValues['rejection_reason'] || []} activeFilter={columnFilters['rejection_reason'] || null}
                                        onFilter={(s) => applyColumnFilter('rejection_reason', s)} onClear={() => clearColumnFilter('rejection_reason')}
                                        open={openMenu === 'rejection_reason'} onToggle={() => setOpenMenu(openMenu === 'rejection_reason' ? null : 'rejection_reason')} onClose={() => setOpenMenu(null)}
                                        dict={isVI ? {
                                            sortAsc: 'Sắp xếp tăng dần',
                                            sortDesc: 'Sắp xếp giảm dần',
                                            selectAll: 'Chọn tất cả',
                                            deselectAll: 'Bỏ chọn tất cả',
                                            filterPlaceholder: 'Lọc...',
                                            clearFilters: 'Xóa bộ lọc'
                                        } : {
                                            sortAsc: 'Sort Ascending',
                                            sortDesc: 'Sort Descending',
                                            selectAll: 'Select All',
                                            deselectAll: 'Deselect All',
                                            filterPlaceholder: 'Filter...',
                                            clearFilters: 'Clear Filters'
                                        }}
                                        className="px-6 py-4"
                                    />
                                )}
                                <th className="px-6 py-4 text-center">{isVI ? 'Hồ sơ' : 'CV'}</th>
                                <th className="px-6 py-4 text-center">{isVI ? 'Thao tác' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm text-slate-700">
                            {filteredCandidates.length === 0 ? (
                                <tr>
                                    <td colSpan={activeSubTab === 'archived' ? 9 : 8} className="text-center py-12 text-slate-400 font-semibold text-xs bg-white italic">
                                        {isVI ? 'Không có ứng viên nào trong danh mục này.' : 'No candidates in this category.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredCandidates.map((candidate) => (
                                    <tr 
                                        key={candidate.id}
                                        onClick={() => setSelectedCandidateId(candidate.id)}
                                        className="group hover:bg-slate-50/80 transition-colors duration-150 cursor-pointer"
                                    >
                                        {/* Candidate Name */}
                                        <td className="px-6 py-4 align-middle">
                                            <div className="font-bold text-slate-900 group-hover:text-blue-750 transition-colors text-sm">
                                                {candidate.full_name}
                                            </div>
                                        </td>

                                        {/* Source */}
                                        <td className="px-6 py-4 align-middle">
                                            {candidate.source ? (
                                                (() => {
                                                    const sourceVal = candidate.source
                                                    let colorClass = 'bg-gray-100 text-gray-800 border-gray-200'
                                                    if (sourceVal === 'Referral') {
                                                        colorClass = 'bg-blue-55 text-blue-700 border-blue-150'
                                                    } else if (sourceVal === 'Walk-in') {
                                                        colorClass = 'bg-green-55 text-green-700 border-green-150'
                                                    } else if (sourceVal === 'Other') {
                                                        colorClass = 'bg-slate-100 text-slate-700 border-slate-250'
                                                    } else if (platformConfig[sourceVal]) {
                                                        colorClass = platformConfig[sourceVal].color
                                                    }
                                                    return (
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${colorClass}`}>
                                                            {sourceVal}
                                                        </span>
                                                    )
                                                })()
                                            ) : (
                                                <span className="text-slate-400 italic">—</span>
                                            )}
                                        </td>

                                        {/* Stage */}
                                        <td className="px-6 py-4 text-center align-middle">
                                            {(() => {
                                                const badge = getStageBadgeInfo(candidate)
                                                return (
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${badge.color}`}>
                                                        {badge.label}
                                                    </span>
                                                )
                                            })()}
                                        </td>

                                        {/* Phone */}
                                        <td className="px-6 py-4 text-sm text-slate-655 whitespace-nowrap align-middle">
                                            {candidate.phone || <span className="text-slate-400 italic">—</span>}
                                        </td>

                                        {/* Email */}
                                        <td className="px-6 py-4 text-sm text-slate-655 whitespace-nowrap align-middle">
                                            {candidate.email || <span className="text-slate-400 italic">—</span>}
                                        </td>

                                        {/* Interview Info */}
                                        <td className="px-6 py-4 text-sm text-slate-600 align-middle">
                                            {candidate.interview_scheduled_at ? (
                                                <div>
                                                    <div className="font-semibold text-slate-750">
                                                        {formatDateTime(candidate.interview_scheduled_at)}
                                                    </div>
                                                    {candidate.interview_location && (
                                                        <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[180px]" title={candidate.interview_location}>
                                                            {candidate.interview_location}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-slate-400 italic">—</span>
                                            )}
                                        </td>

                                        {/* Rejection Reason Column */}
                                        {activeSubTab === 'archived' && (
                                            <td className="px-6 py-4 text-xs font-semibold text-slate-600 align-middle max-w-[200px] truncate" title={getRejectionReasonText(candidate) || ''}>
                                                {getRejectionReasonText(candidate) || <span className="text-slate-400 italic">—</span>}
                                            </td>
                                        )}

                                        {/* CV file view */}
                                        <td className="px-6 py-4 text-center align-middle" onClick={e => e.stopPropagation()}>
                                            {candidate.cv_url ? (
                                                <a 
                                                    href={candidate.cv_url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 hover:border-blue-200 hover:bg-blue-50/50 text-slate-400 hover:text-blue-655 transition cursor-pointer"
                                                    title={isVI ? 'Xem CV' : 'View CV'}
                                                >
                                                    <PaperClipIcon className="h-4.5 w-4.5" aria-hidden="true" />
                                                </a>
                                            ) : (
                                                <span className="text-slate-400 italic">—</span>
                                            )}
                                        </td>

                                        {/* Actions (Edit Info & Delete) */}
                                        <td className="px-6 py-4 text-center align-middle" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center justify-center gap-1.5">
                                                <button 
                                                    onClick={() => setCandidateToEdit(candidate)}
                                                    className="p-1 text-slate-400 hover:text-blue-655 hover:bg-slate-100 rounded-lg transition border border-transparent cursor-pointer"
                                                    title={isVI ? 'Sửa thông tin' : 'Edit Candidate'}
                                                >
                                                    <PencilSquareIcon className="h-4.5 w-4.5" />
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteCandidate(candidate)}
                                                    className="p-1 text-slate-400 hover:text-red-655 hover:bg-slate-100 rounded-lg transition border border-transparent cursor-pointer"
                                                    title={isVI ? 'Xóa ứng viên' : 'Delete Candidate'}
                                                >
                                                    <TrashIcon className="h-4.5 w-4.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedCandidateId && (
                <CandidateWorkflowModal
                    candidateId={selectedCandidateId}
                    onClose={() => setSelectedCandidateId(null)}
                    onSuccess={(action) => {
                        fetchCandidates()
                        if (onRefreshRequest) onRefreshRequest()
                        if (action === 'onboard' && onCandidateHired) onCandidateHired()
                    }}
                />
            )}

            {candidateToEdit && hiringRequest && (
                <AddCandidateModal
                    hiringRequest={hiringRequest}
                    candidateToEdit={candidateToEdit}
                    onClose={() => setCandidateToEdit(null)}
                    onSuccess={() => {
                        fetchCandidates()
                        if (onRefreshRequest) onRefreshRequest()
                        setCandidateToEdit(null)
                    }}
                />
            )}
        </div>
    )
}

/* --- Column Header Component --- */
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
                <span className="select-none">{label}</span>
                {isActive && (
                    sortAsc
                        ? <ArrowUp className="w-3.5 h-3.5 text-blue-655 flex-shrink-0" />
                        : <ArrowDown className="w-3.5 h-3.5 text-blue-655 flex-shrink-0" />
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
