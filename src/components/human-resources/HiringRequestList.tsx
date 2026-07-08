'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { HiringRequest, HiringRequestStatus, HiringRequestPriority } from '@/types/human-resources'
import { useSettings } from '@/contexts/SettingsContext'
import {
    Pencil,
    Users,
    Calendar,
    Briefcase,
    Plus,
    Archive,
    ArchiveRestore,
    ArrowUp,
    ArrowDown,
    Filter,
    MoreVertical
} from 'lucide-react'

interface HiringRequestListProps {
    requests: (HiringRequest & { candidates?: { id: string }[] })[]
    branchNames?: Record<string, string>
    activeSubTab?: 'active' | 'archived'
    onStatusChange?: (id: string, newStatus: string) => void
}

const statusColors: Record<HiringRequestStatus, string> = {
    draft: 'bg-slate-50 text-slate-700 border-slate-200',
    submitted: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
    waiting_manager: 'bg-orange-50 text-orange-700 border-orange-200',
    on_hold: 'bg-purple-50 text-purple-700 border-purple-200',
    closed: 'bg-green-50 text-green-700 border-green-200',
}

const priorityColors: Record<HiringRequestPriority, string> = {
    low: 'bg-slate-50 text-slate-600 border-slate-200',
    medium: 'bg-blue-50/50 text-blue-600 border-blue-100',
    high: 'bg-amber-50 text-amber-700 border-amber-200',
    urgent: 'bg-red-50 text-red-700 border-red-200 font-bold',
}

const statusLabels: Record<string, Record<HiringRequestStatus, string>> = {
    en: {
        draft: 'Draft',
        submitted: 'Submitted',
        in_progress: 'In Progress',
        waiting_manager: 'Waiting Manager',
        on_hold: 'On Hold',
        closed: 'Closed'
    },
    vi: {
        draft: 'Nháp',
        submitted: 'Đã nộp',
        in_progress: 'Đang thực hiện',
        waiting_manager: 'Chờ Quản lý',
        on_hold: 'Tạm dừng',
        closed: 'Đã đóng'
    }
}

const priorityLabels: Record<string, Record<HiringRequestPriority, string>> = {
    en: {
        low: 'Low',
        medium: 'Medium',
        high: 'High',
        urgent: 'Urgent'
    },
    vi: {
        low: 'Thấp',
        medium: 'Trung bình',
        high: 'Cao',
        urgent: 'Khẩn cấp'
    }
}

const dict = {
    en: {
        position: 'Position / Role',
        department: 'Department',
        branches: 'Branch(es)',
        headcount: 'Headcount',
        candidates: 'Candidates',
        priority: 'Priority',
        createdAt: 'Created At',
        status: 'Status',
        actions: 'Actions',
        noRequests: 'No hiring requests',
        noRequestsSub: 'Get started by creating a new hiring request.',
        newRequest: 'New Request',
        confirmDelete: 'Are you sure you want to delete this specific request?',
        noBranch: 'No Branch',
        people: 'people',
        person: 'person'
    },
    vi: {
        position: 'Vị trí / Vai trò',
        department: 'Bộ phận',
        branches: 'Chi nhánh',
        headcount: 'Số lượng tuyển',
        candidates: 'Ứng viên',
        priority: 'Độ ưu tiên',
        createdAt: 'Ngày tạo',
        status: 'Trạng thái',
        actions: 'Thao tác',
        noRequests: 'Không có yêu cầu tuyển dụng nào',
        noRequestsSub: 'Bắt đầu bằng cách tạo một yêu cầu tuyển dụng mới.',
        newRequest: 'Yêu cầu mới',
        confirmDelete: 'Bạn có chắc chắn muốn xóa yêu cầu tuyển dụng này?',
        noBranch: 'Không có chi nhánh',
        people: 'người',
        person: 'người'
    }
}

export function HiringRequestList({ requests, branchNames = {}, activeSubTab, onStatusChange }: HiringRequestListProps) {
    const { language } = useSettings()
    const router = useRouter()
    const lang = language === 'vi' ? 'vi' : 'en'
    const isVI = language === 'vi'

    const t = (key: keyof typeof dict['en']) => {
        return dict[lang][key] || dict['en'][key] || key
    }

    const formatDate = (dateString?: string | null) => {
        if (!dateString) return '—'
        const date = new Date(dateString)
        if (isNaN(date.getTime())) return '—'
        const day = String(date.getDate()).padStart(2, '0')
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const year = date.getFullYear()
        return `${day}/${month}/${year}`
    }

    const [sortKey, setSortKey] = useState<string>('createdAt')
    const [sortAsc, setSortAsc] = useState<boolean>(false)
    const [columnFilters, setColumnFilters] = useState<Record<string, Set<string> | null>>({})
    const [openMenu, setOpenMenu] = useState<string | null>(null)

    function applySort(k: string, asc: boolean) {
        setSortKey(k); setSortAsc(asc); setOpenMenu(null)
    }
    function applyColumnFilter(col: string, vals: Set<string> | null) {
        setColumnFilters(prev => ({ ...prev, [col]: vals })); setOpenMenu(null)
    }
    function clearColumnFilter(col: string) {
        setColumnFilters(prev => { const n = { ...prev }; delete n[col]; return n }); setOpenMenu(null)
    }

    const departmentsList = useMemo(() => {
        const set = new Set<string>()
        requests.forEach(r => { if (r.department) set.add(r.department) })
        return Array.from(set).sort()
    }, [requests])

    const branchesList = useMemo(() => {
        const set = new Set<string>()
        requests.forEach(r => {
            if (r.branch_ids) {
                r.branch_ids.forEach(id => {
                    const name = branchNames[id] || id
                    if (name) set.add(name)
                })
            }
        })
        return Array.from(set).sort()
    }, [requests, branchNames])

    const prioritiesList = useMemo(() => {
        const set = new Set<string>()
        requests.forEach(r => { if (r.priority) set.add(r.priority) })
        return Array.from(set).sort()
    }, [requests])

    const statusList = useMemo(() => {
        const set = new Set<string>()
        requests.forEach(r => { if (r.status) set.add(r.status) })
        return Array.from(set).sort()
    }, [requests])

    const filteredAndSortedRequests = useMemo(() => {
        let result = [...requests]

        // Apply filters
        Object.entries(columnFilters).forEach(([col, filterSet]) => {
            if (!filterSet) return
            if (col === 'department') {
                result = result.filter(r => filterSet.has(r.department || ''))
            } else if (col === 'priority') {
                result = result.filter(r => filterSet.has(r.priority || ''))
            } else if (col === 'status') {
                result = result.filter(r => filterSet.has(r.status || ''))
            } else if (col === 'branches') {
                result = result.filter(r => {
                    const brs = (r.branch_ids || []).map(id => branchNames[id] || id)
                    return brs.some(b => filterSet.has(b))
                })
            }
        })

        // Apply sort
        result.sort((a, b) => {
            let valA: any = ''
            let valB: any = ''

            if (sortKey === 'position') {
                valA = a.position_title || ''
                valB = b.position_title || ''
            } else if (sortKey === 'department') {
                valA = a.department || ''
                valB = b.department || ''
            } else if (sortKey === 'headcount') {
                valA = a.headcount || 0
                valB = b.headcount || 0
            } else if (sortKey === 'candidates') {
                valA = a.candidates?.length || 0
                valB = b.candidates?.length || 0
            } else if (sortKey === 'priority') {
                valA = a.priority || ''
                valB = b.priority || ''
            } else if (sortKey === 'createdAt') {
                valA = a.created_at || ''
                valB = b.created_at || ''
            } else if (sortKey === 'closedAt') {
                valA = activeSubTab === 'archived' ? (a.closed_at || '') : (a.created_at || '')
                valB = activeSubTab === 'archived' ? (b.closed_at || '') : (b.created_at || '')
            } else if (sortKey === 'status') {
                valA = a.status || ''
                valB = b.status || ''
            }

            if (typeof valA === 'string') {
                return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA)
            } else {
                return sortAsc ? valA - valB : valB - valA
            }
        })

        return result
    }, [requests, sortKey, sortAsc, columnFilters, branchNames, activeSubTab])

    const headerDict = isVI ? {
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
    }

    return (
        <div className="rounded-2xl bg-white shadow-md border border-gray-200/80 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                    <thead>
                        <tr className="bg-gray-50/75 border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            <ColumnHeader
                                colKey="position" label={t('position')}
                                sortKey={sortKey} sortAsc={sortAsc} onSort={applySort}
                                values={[]} activeFilter={null}
                                onFilter={() => {}} onClear={() => {}}
                                open={openMenu === 'position'} onToggle={() => setOpenMenu(openMenu === 'position' ? null : 'position')} onClose={() => setOpenMenu(null)}
                                dict={headerDict}
                                className="px-6 py-4"
                            />
                            <ColumnHeader
                                colKey="department" label={t('department')}
                                sortKey={sortKey} sortAsc={sortAsc} onSort={applySort}
                                values={departmentsList} activeFilter={columnFilters['department'] || null}
                                onFilter={(s) => applyColumnFilter('department', s)} onClear={() => clearColumnFilter('department')}
                                open={openMenu === 'department'} onToggle={() => setOpenMenu(openMenu === 'department' ? null : 'department')} onClose={() => setOpenMenu(null)}
                                dict={headerDict}
                                className="px-6 py-4"
                            />
                            <ColumnHeader
                                colKey="branches" label={t('branches')}
                                sortKey={sortKey} sortAsc={sortAsc} onSort={applySort}
                                values={branchesList} activeFilter={columnFilters['branches'] || null}
                                onFilter={(s) => applyColumnFilter('branches', s)} onClear={() => clearColumnFilter('branches')}
                                open={openMenu === 'branches'} onToggle={() => setOpenMenu(openMenu === 'branches' ? null : 'branches')} onClose={() => setOpenMenu(null)}
                                dict={headerDict}
                                className="px-6 py-4"
                            />
                            <ColumnHeader
                                colKey="headcount" label={t('headcount')}
                                sortKey={sortKey} sortAsc={sortAsc} onSort={applySort}
                                values={[]} activeFilter={null}
                                onFilter={() => {}} onClear={() => {}}
                                open={openMenu === 'headcount'} onToggle={() => setOpenMenu(openMenu === 'headcount' ? null : 'headcount')} onClose={() => setOpenMenu(null)}
                                dict={headerDict}
                                center
                                className="px-6 py-4"
                            />
                            <ColumnHeader
                                colKey="candidates" label={t('candidates')}
                                sortKey={sortKey} sortAsc={sortAsc} onSort={applySort}
                                values={[]} activeFilter={null}
                                onFilter={() => {}} onClear={() => {}}
                                open={openMenu === 'candidates'} onToggle={() => setOpenMenu(openMenu === 'candidates' ? null : 'candidates')} onClose={() => setOpenMenu(null)}
                                dict={headerDict}
                                center
                                className="px-6 py-4"
                            />
                            <ColumnHeader
                                colKey="priority" label={t('priority')}
                                sortKey={sortKey} sortAsc={sortAsc} onSort={applySort}
                                values={prioritiesList} activeFilter={columnFilters['priority'] || null}
                                onFilter={(s) => applyColumnFilter('priority', s)} onClear={() => clearColumnFilter('priority')}
                                open={openMenu === 'priority'} onToggle={() => setOpenMenu(openMenu === 'priority' ? null : 'priority')} onClose={() => setOpenMenu(null)}
                                dict={headerDict}
                                center
                                className="px-6 py-4"
                            />
                            <ColumnHeader
                                colKey={activeSubTab === 'archived' ? 'closedAt' : 'createdAt'}
                                label={activeSubTab === 'archived' ? (language === 'vi' ? 'Ngày đóng' : 'Closed At') : t('createdAt')}
                                sortKey={sortKey} sortAsc={sortAsc} onSort={applySort}
                                values={[]} activeFilter={null}
                                onFilter={() => {}} onClear={() => {}}
                                open={openMenu === 'date'} onToggle={() => setOpenMenu(openMenu === 'date' ? null : 'date')} onClose={() => setOpenMenu(null)}
                                dict={headerDict}
                                className="px-6 py-4"
                            />
                            <ColumnHeader
                                colKey="status" label={t('status')}
                                sortKey={sortKey} sortAsc={sortAsc} onSort={applySort}
                                values={statusList} activeFilter={columnFilters['status'] || null}
                                onFilter={(s) => applyColumnFilter('status', s)} onClear={() => clearColumnFilter('status')}
                                open={openMenu === 'status'} onToggle={() => setOpenMenu(openMenu === 'status' ? null : 'status')} onClose={() => setOpenMenu(null)}
                                dict={headerDict}
                                center
                                className="px-6 py-4"
                            />
                            <th className="px-6 py-4 text-center font-bold">{t('actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredAndSortedRequests.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="px-6 py-12 text-center text-slate-400 text-xs italic font-semibold bg-white">
                                    {language === 'vi' ? 'Không tìm thấy yêu cầu tuyển dụng nào phù hợp.' : 'No matching hiring requests found.'}
                                </td>
                            </tr>
                        ) : (
                            filteredAndSortedRequests.map((request) => {
                                const branches = request.branch_ids && request.branch_ids.length > 0
                                    ? request.branch_ids.map(id => branchNames[id] || id)
                                    : []

                                return (
                                    <tr 
                                        key={request.id}
                                        onClick={() => router.push(`/human-resources/recruitment/${request.id}`)}
                                        className="group hover:bg-slate-50/80 transition-colors duration-150 cursor-pointer"
                                    >
                                        {/* Position / Role */}
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors text-sm">
                                                {request.position_title}
                                            </div>
                                            <div className="text-xs text-slate-400 mt-0.5">
                                                {request.employment_type === 'part_time' 
                                                    ? (language === 'vi' ? 'Bán thời gian' : 'Part-time')
                                                    : (language === 'vi' ? 'Toàn thời gian' : 'Full-time')
                                                }
                                            </div>
                                        </td>

                                        {/* Department */}
                                        <td className="px-6 py-4">
                                            <span className="text-sm text-slate-600">
                                                {request.department}
                                            </span>
                                        </td>

                                        {/* Branches */}
                                        <td className="px-6 py-4">
                                            {branches.length > 0 ? (
                                                <div className="flex flex-wrap gap-1.5 max-w-md">
                                                    {branches.map((b) => (
                                                        <span 
                                                            key={b}
                                                            className="inline-flex items-center px-2 py-0.5 rounded-md-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap"
                                                        >
                                                            {b}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-sm text-slate-400 italic">
                                                    {t('noBranch')}
                                                </span>
                                            )}
                                        </td>

                                        {/* Headcount */}
                                        <td className="px-6 py-4 text-center whitespace-nowrap">
                                            <div className="inline-flex items-center gap-1.5 bg-blue-50/40 text-blue-700 border border-blue-100/60 px-2.5 py-1 rounded-lg text-sm font-semibold">
                                                <Users className="w-3.5 h-3.5" />
                                                <span>
                                                    {request.headcount}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Candidates Count */}
                                        <td className="px-6 py-4 text-center whitespace-nowrap">
                                            <div className="inline-flex items-center gap-1.5 bg-slate-50 text-slate-700 border border-gray-200 px-2.5 py-1 rounded-lg text-sm font-semibold">
                                                <Users className="w-3.5 h-3.5 text-slate-400" />
                                                <span>
                                                    {request.candidates?.length || 0}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Priority */}
                                        <td className="px-6 py-4 text-center whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${priorityColors[request.priority] || ''}`}>
                                                {priorityLabels[lang][request.priority] || request.priority.toUpperCase()}
                                            </span>
                                        </td>

                                        {/* Date (Created At / Closed At) */}
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                            <div className="flex items-center gap-1.5">
                                                <Calendar className="w-4 h-4 text-slate-400" />
                                                <span>
                                                    {formatDate(activeSubTab === 'archived' && request.closed_at ? request.closed_at : request.created_at)}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Status */}
                                        <td className="px-6 py-4 text-center whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusColors[request.status] || ''}`}>
                                                {statusLabels[lang][request.status] || request.status.toUpperCase()}
                                            </span>
                                        </td>

                                        {/* Actions */}
                                        <td className="px-6 py-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-center space-x-1">
                                                <Link
                                                    href={`/human-resources/recruitment/${request.id}/edit`}
                                                    className="p-1.5 text-slate-400 hover:text-blue-650 hover:bg-blue-50/50 rounded-lg transition border border-transparent hover:border-blue-100 cursor-pointer"
                                                    title={language === 'vi' ? 'Sửa yêu cầu' : 'Edit Request'}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Link>
                                                {request.status !== 'closed' ? (
                                                    <button
                                                        onClick={() => {
                                                            const confirmMsg = language === 'vi'
                                                                ? 'Bạn có chắc chắn muốn đóng/lưu trữ yêu cầu tuyển dụng này?'
                                                                : 'Are you sure you want to close/archive this hiring request?'
                                                            if (confirm(confirmMsg)) {
                                                                if (onStatusChange) onStatusChange(request.id, 'closed')
                                                            }
                                                        }}
                                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition border border-transparent hover:border-red-100 cursor-pointer"
                                                        title={language === 'vi' ? 'Đóng yêu cầu' : 'Close Request'}
                                                    >
                                                        <Archive className="h-4 w-4" />
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            const confirmMsg = language === 'vi'
                                                                ? 'Bạn có chắc chắn muốn mở lại yêu cầu tuyển dụng này?'
                                                                : 'Are you sure you want to reopen this hiring request?'
                                                            if (confirm(confirmMsg)) {
                                                                if (onStatusChange) onStatusChange(request.id, 'in_progress')
                                                            }
                                                        }}
                                                        className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition border border-transparent hover:border-green-100 cursor-pointer"
                                                        title={language === 'vi' ? 'Mở lại yêu cầu' : 'Reopen Request'}
                                                    >
                                                        <ArchiveRestore className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>
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

    const hasFilterOptions = values && values.length > 0
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
        <th className={`px-6 py-4 ${right ? 'text-right' : ''} ${className} relative`} ref={ref as any}>
            <div className={`flex items-center gap-1 font-semibold ${center ? 'justify-center' : right ? 'justify-end' : 'justify-start'}`}>
                <span className="select-none text-slate-500 uppercase tracking-wider text-xs">{label}</span>
                {isActive && (
                    sortAsc
                        ? <ArrowUp className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                        : <ArrowDown className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
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
                    className="fixed bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] min-w-[220px] text-left text-sm text-gray-700 normal-case font-normal"
                    style={dropdownStyle}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="px-3 py-2 space-y-1">
                        <button
                            onClick={() => onSort(colKey, true)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer text-xs font-semibold ${isActive && sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100 text-gray-700'}`}
                        >
                            <ArrowUp className="w-4 h-4" />
                            {dict.sortAsc}
                        </button>
                        <button
                            onClick={() => onSort(colKey, false)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer text-xs font-semibold ${isActive && !sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100 text-gray-700'}`}
                        >
                            <ArrowDown className="w-4 h-4" />
                            {dict.sortDesc}
                        </button>
                    </div>

                    {hasFilterOptions && (
                        <>
                            <div className="border-t border-gray-200" />
                            <div className="px-3 py-2">
                                <input
                                    type="text"
                                    value={filterSearch}
                                    onChange={e => setFilterSearch(e.target.value)}
                                    placeholder={dict.filterPlaceholder}
                                    className="w-full mb-2 px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-800"
                                />
                                <button
                                    onClick={toggleAll}
                                    className="text-[10px] text-blue-600 hover:text-blue-800 mb-1 cursor-pointer font-bold block"
                                >
                                    {allVisibleChecked ? dict.deselectAll : dict.selectAll}
                                </button>

                                <div className="max-h-[160px] overflow-y-auto space-y-1.5 mt-1 border-t border-gray-100 pt-2">
                                    {filteredValues.map(v => (
                                        <label key={v} className="flex items-center gap-2 text-xs text-gray-600 hover:bg-gray-50 px-1 py-0.5 rounded cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={localChecked.has(v)}
                                                onChange={() => toggleOne(v)}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                                            />
                                            <span className="truncate">{v}</span>
                                        </label>
                                    ))}
                                </div>

                                <div className="flex justify-between items-center gap-2 mt-3 pt-2 border-t border-gray-100">
                                    <button
                                        onClick={onClear}
                                        className="text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer font-bold"
                                    >
                                        {dict.clearFilters}
                                    </button>
                                    <button
                                        onClick={handleApply}
                                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </th>
    )
}
