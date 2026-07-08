'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffSalaryHistory, HRStaffMember, SalaryType, HRDepartment, HRPosition } from '@/types/human-resources'
import { useSettings } from '@/contexts/SettingsContext'
import { getCurrentUserPermissions } from '@/lib/user-branches'
import CircularLoader from '@/components/CircularLoader'
import SalaryModal from '@/components/human-resources/SalaryModal'
import {
    TrendingUp, Plus, Search, X, Pencil, Trash2,
    ArrowUpRight, DollarSign, Calendar, Users, Briefcase, TrendingDown, FileDown,
    ArrowUp, ArrowDown, Filter, MoreVertical
} from 'lucide-react'
import { saveAs } from 'file-saver'

/* ─── Helpers ─── */
const fmt = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n))

const fmtDate = (dStr: string | null | undefined) => {
    if (!dStr) return '—'
    const d = new Date(dStr)
    if (isNaN(d.getTime())) return dStr
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}/${month}/${year}`
}

const getLocalizedReason = (reason: string | null | undefined, lang: string) => {
    if (!reason) return '—'
    if (lang !== 'vi') return reason
    const mapping: Record<string, string> = {
        'Promotion': 'Thăng chức',
        'Gross Salary Change': 'Đổi lương gộp',
        'Personal Reasons': 'Lý do cá nhân',
        'Career Change / Better Opportunity': 'Thay đổi công việc / Cơ hội tốt hơn',
        'Relocation': 'Chuyển địa điểm sinh sống',
        'Health Issues': 'Vấn đề sức khỏe',
        'Underperforming': 'Không đạt hiệu suất',
        'Behavioral Issues': 'Vấn đề hành vi',
        'Attendance / Tardiness': 'Chuyên cần / Đi muộn',
        'Policy Violation': 'Vi phạm chính sách',
        'Redundancy / Layoff': 'Cắt giảm nhân sự / Định biên',
        'Not suitable': 'Không phù hợp',
        'Refused position': 'Từ chối nhận việc',
        'Other': 'Khác'
    }
    return mapping[reason] || reason
}

const getChangeIndicatorText = (prev: number, next: number, type: string, incType?: string | null, incValue?: number | null, prevType?: string | null, newType?: string | null, language?: string) => {
    if (prev === 0) return language === 'vi' ? 'Mới' : 'New'
    if (prevType && newType && prevType !== newType) {
        return language === 'vi' ? 'Đổi loại lương' : 'Type Changed'
    }
    const diff = next - prev
    const pct = ((diff / prev) * 100).toFixed(1)
    const isUp = diff > 0
    const isDown = diff < 0
    if (diff === 0) return language === 'vi' ? 'Không đổi' : 'No Change'
    const pctSign = isUp ? `+${pct}%` : `${pct}%`
    return pctSign
}


function ChangeIndicator({ prev, next, type, incType, incValue, prevType, newType }: { prev: number; next: number; type: string; incType?: string | null; incValue?: number | null; prevType?: string | null; newType?: string | null }) {
    const { language } = useSettings()
    if (prev === 0) return <span className="text-xs text-gray-400">{language === 'vi' ? 'Mới' : 'New'}</span>
    
    if (prevType && newType && prevType !== newType) {
        return (
            <div className="flex flex-col items-center">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                    <TrendingDown className="w-3 h-3" /> {language === 'vi' ? 'Đổi loại lương' : 'Type Changed'}
                </span>
            </div>
        )
    }

    const diff = next - prev
    const pct = ((diff / prev) * 100).toFixed(1)
    const isUp = diff > 0
    const isDown = diff < 0
    
    return (
        <div className="flex flex-col items-center">
            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${isUp ? 'text-emerald-600' : isDown ? 'text-red-600' : 'text-gray-500'}`}>
                {isUp ? <ArrowUpRight className="w-3 h-3" /> : isDown ? <TrendingDown className="w-3 h-3" /> : null}
                {isUp ? '+' : ''}{diff === 0 ? (language === 'vi' ? 'Không đổi' : 'No Change') : `${pct}%`}
            </span>
            {incType === 'percentage' && incValue && (
                <span className="text-[10px] text-gray-400">({incValue}%)</span>
            )}
        </div>
    )
}

function DeleteConfirm({ label, onConfirm, onCancel, deleting }: {
    label: string; onConfirm: () => void; onCancel: () => void; deleting: boolean
}) {
    const { language } = useSettings()
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {language === 'vi' ? 'Xóa bản ghi' : 'Delete Record'}
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                    {language === 'vi' ? (
                        <>Bạn có chắc chắn muốn xóa bản ghi này cho <strong>{label}</strong>? Thao tác này không thể hoàn tác.</>
                    ) : (
                        <>Are you sure you want to delete this record for <strong>{label}</strong>? This cannot be undone.</>
                    )}
                </p>
                <div className="flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                        {language === 'vi' ? 'Hủy' : 'Cancel'}
                    </button>
                    <button onClick={onConfirm} disabled={deleting}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-2">
                        {deleting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        {language === 'vi' ? 'Xóa' : 'Delete'}
                    </button>
                </div>
            </div>
        </div>
    )
}

function ExportModal({ onClose, onExport }: { onClose: () => void, onExport: (range: 'this_month' | 'prev_month' | 'all' | 'custom', start?: string, end?: string) => void }) {
    const { language } = useSettings()
    const [range, setRange] = useState<'this_month' | 'prev_month' | 'all' | 'custom'>('this_month')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {language === 'vi' ? 'Xuất lịch sử thay đổi trạng thái' : 'Export Status Changes'}
                </h3>
                
                <div className="space-y-3 mb-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={range === 'this_month'} onChange={() => setRange('this_month')} className="text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">{language === 'vi' ? 'Tháng này' : 'This Month'}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={range === 'prev_month'} onChange={() => setRange('prev_month')} className="text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">{language === 'vi' ? 'Tháng trước' : 'Previous Month'}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={range === 'custom'} onChange={() => setRange('custom')} className="text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">{language === 'vi' ? 'Tùy chọn ngày' : 'Custom Dates'}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={range === 'all'} onChange={() => setRange('all')} className="text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">{language === 'vi' ? 'Tất cả thời gian' : 'All Time'}</span>
                    </label>

                    {range === 'custom' && (
                        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-100">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">{language === 'vi' ? 'Từ' : 'From'}</label>
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">{language === 'vi' ? 'Đến' : 'To'}</label>
                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                        {language === 'vi' ? 'Hủy' : 'Cancel'}
                    </button>
                    <button 
                        onClick={() => onExport(range, startDate, endDate)} 
                        disabled={range === 'custom' && (!startDate || !endDate)}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                    >
                        <FileDown className="w-4 h-4" />
                        {language === 'vi' ? 'Xuất file' : 'Export'}
                    </button>
                </div>
            </div>
        </div>
    )
}

/* ─── Main Page ─── */
export default function SalaryHistoryPage() {
    const { language } = useSettings()
    const [loading, setLoading]       = useState(true)
    const [entries, setEntries]       = useState<(HRStaffSalaryHistory)[]>([])
    const [staffList, setStaffList]   = useState<HRStaffMember[]>([])
    const [departments, setDepartments] = useState<HRDepartment[]>([])
    const [positions, setPositions]   = useState<HRPosition[]>([])



    const [sortKey, setSortKey] = useState<string>('date')
    const [sortAsc, setSortAsc] = useState<boolean>(false)
    const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({})
    const [openMenu, setOpenMenu] = useState<string | null>(null)

    const dict = {
        sortAsc: language === 'vi' ? 'Sắp xếp tăng dần' : 'Sort ascending',
        sortDesc: language === 'vi' ? 'Sắp xếp giảm dần' : 'Sort descending',
        selectAll: language === 'vi' ? 'Chọn tất cả' : 'Select all',
        deselectAll: language === 'vi' ? 'Bỏ chọn tất cả' : 'Deselect all',
        filterPlaceholder: language === 'vi' ? 'Tìm kiếm...' : 'Search...',
        clearFilters: language === 'vi' ? 'Xóa bộ lọc' : 'Clear filters',
        empty: language === 'vi' ? 'Rỗng' : 'Empty'
    }

    const [modalOpen, setModalOpen]       = useState(false)
    const [editingEntry, setEditingEntry] = useState<HRStaffSalaryHistory | null>(null)
    const [saving, setSaving]             = useState(false)

    const [deletingId, setDeletingId]     = useState<string | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)

    const [exportModalOpen, setExportModalOpen] = useState(false)

    const [loggedUserName, setLoggedUserName] = useState<string>('')
    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
    const [currentUserBranches, setCurrentUserBranches] = useState<string[] | null>(null)

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

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            let userRole = currentUserRole
            let userBranches = currentUserBranches
            if (!userRole) {
                const perms = await getCurrentUserPermissions()
                userRole = perms.role
                userBranches = perms.branches
                setCurrentUserRole(userRole)
                setCurrentUserBranches(userBranches)
            }

            const [staffRes, histRes, deptRes, posRes] = await Promise.all([
                supabase.from('hr_staff').select('*, hr_staff_branches(*)').order('full_name'),
                supabase.from('hr_staff_salary_history').select(`
                    *, 
                    hr_staff(*, hr_staff_branches(*)),
                    previous_position:hr_positions!hr_staff_salary_history_previous_position_id_fkey(name),
                    new_position:hr_positions!hr_staff_salary_history_new_position_id_fkey(name),
                    previous_department:hr_departments!hr_staff_salary_history_previous_department_id_fkey(name),
                    new_department:hr_departments!hr_staff_salary_history_new_department_id_fkey(name)
                `).neq('record_type', 'dismissal').neq('record_type', 'resignation').order('effective_date', { ascending: false }),
                supabase.from('hr_departments').select('*').order('name'),
                supabase.from('hr_positions').select('*').order('name')
            ])

            let filteredStaff = (staffRes.data as any[]) || []
            let filteredEntries = histRes.data || []

            if (userRole && !['owner', 'admin'].includes(userRole) && userBranches) {
                filteredStaff = filteredStaff.filter(s =>
                    (s.hr_staff_branches || []).some((sb: any) => userBranches.includes(sb.branch_id))
                )
                filteredEntries = filteredEntries.filter((e: any) => {
                    const s = e.hr_staff
                    return s && (s.hr_staff_branches || []).some((sb: any) => userBranches.includes(sb.branch_id))
                })
            }

            if (staffRes.data) setStaffList(filteredStaff)
            if (histRes.data) setEntries(filteredEntries as any)
            if (deptRes.data) setDepartments(deptRes.data as HRDepartment[])
            if (posRes.data) setPositions(posRes.data as HRPosition[])
        } catch (err) { console.error(err) }
        setLoading(false)
    }, [currentUserRole, currentUserBranches])

    useEffect(() => { fetchAll() }, [fetchAll])

    const columnValues = useMemo(() => {
        const out: Record<string, string[]> = {
            record_type: [],
            name: [],
            date: [],
            previous_amount: [],
            new_amount: [],
            increase: [],
            reason: []
        }

        const typeLabels: Record<string, string> = {
            promotion: language === 'vi' ? 'Thăng chức' : 'Promotion',
            resignation: language === 'vi' ? 'Thôi việc' : 'Resignation',
            dismissal: language === 'vi' ? 'Sa thải' : 'Dismissal',
            rejection: language === 'vi' ? 'Từ chối' : 'Rejection',
            salary_increase: language === 'vi' ? 'Đổi lương gộp' : 'Gross Salary Change'
        }

        entries.forEach(e => {
            const typeLabel = typeLabels[e.record_type] || e.record_type
            if (typeLabel && !out.record_type.includes(typeLabel)) {
                out.record_type.push(typeLabel)
            }
            const staffName = e.hr_staff?.full_name || ''
            if (staffName && !out.name.includes(staffName)) {
                out.name.push(staffName)
            }
            const dStr = fmtDate(e.effective_date)
            if (dStr && !out.date.includes(dStr)) {
                out.date.push(dStr)
            }

            const prevAmtStr = fmt(e.previous_amount)
            if (prevAmtStr && !out.previous_amount.includes(prevAmtStr)) {
                out.previous_amount.push(prevAmtStr)
            }

            const isDeparture = e.record_type === 'resignation' || e.record_type === 'dismissal'
            const newAmtStr = isDeparture ? '—' : fmt(e.new_amount)
            if (newAmtStr && !out.new_amount.includes(newAmtStr)) {
                out.new_amount.push(newAmtStr)
            }

            const incStr = isDeparture ? '—' : getChangeIndicatorText(e.previous_amount, e.new_amount, e.record_type, e.increase_type, e.increase_value, e.previous_salary_type, e.salary_type, language)
            if (incStr && !out.increase.includes(incStr)) {
                out.increase.push(incStr)
            }

            const reasonLoc = getLocalizedReason(e.reason, language)
            if (reasonLoc && !out.reason.includes(reasonLoc)) {
                out.reason.push(reasonLoc)
            }
        })

        Object.keys(out).forEach(k => out[k].sort())
        return out
    }, [entries, language])

    const applySort = (key: string, isAsc?: boolean) => {
        if (isAsc !== undefined) {
            setSortKey(key)
            setSortAsc(isAsc)
        } else {
            if (sortKey === key) {
                setSortAsc(!sortAsc)
            } else {
                setSortKey(key)
                setSortAsc(true)
            }
        }
    }

    const applyColumnFilter = (key: string, values: Set<string> | null) => {
        setColumnFilters(prev => {
            const next = { ...prev }
            if (values) next[key] = values; else delete next[key]
            return next
        })
    }

    const clearColumnFilter = (key: string) => {
        setColumnFilters(prev => {
            const next = { ...prev }
            delete next[key]
            return next
        })
    }

    const filtered = useMemo(() => {
        const typeLabels: Record<string, string> = {
            promotion: language === 'vi' ? 'Thăng chức' : 'Promotion',
            resignation: language === 'vi' ? 'Thôi việc' : 'Resignation',
            dismissal: language === 'vi' ? 'Sa thải' : 'Dismissal',
            rejection: language === 'vi' ? 'Từ chối' : 'Rejection',
            salary_increase: language === 'vi' ? 'Đổi lương gộp' : 'Gross Salary Change'
        }

        let out = entries.filter(e => {
            if (columnFilters['record_type'] && columnFilters['record_type'].size > 0) {
                const label = typeLabels[e.record_type] || e.record_type
                if (!columnFilters['record_type'].has(label)) return false
            }

            if (columnFilters['name'] && columnFilters['name'].size > 0) {
                const staffName = e.hr_staff?.full_name || ''
                if (!columnFilters['name'].has(staffName)) return false
            }

            if (columnFilters['date'] && columnFilters['date'].size > 0) {
                const dStr = fmtDate(e.effective_date)
                if (!columnFilters['date'].has(dStr)) return false
            }

            if (columnFilters['previous_amount'] && columnFilters['previous_amount'].size > 0) {
                const prevAmtStr = fmt(e.previous_amount)
                if (!columnFilters['previous_amount'].has(prevAmtStr)) return false
            }

            if (columnFilters['new_amount'] && columnFilters['new_amount'].size > 0) {
                const isDeparture = e.record_type === 'resignation' || e.record_type === 'dismissal'
                const newAmtStr = isDeparture ? '—' : fmt(e.new_amount)
                if (!columnFilters['new_amount'].has(newAmtStr)) return false
            }

            if (columnFilters['increase'] && columnFilters['increase'].size > 0) {
                const isDeparture = e.record_type === 'resignation' || e.record_type === 'dismissal'
                const incStr = isDeparture ? '—' : getChangeIndicatorText(e.previous_amount, e.new_amount, e.record_type, e.increase_type, e.increase_value, e.previous_salary_type, e.salary_type, language)
                if (!columnFilters['increase'].has(incStr)) return false
            }

            if (columnFilters['reason'] && columnFilters['reason'].size > 0) {
                const reasonLoc = getLocalizedReason(e.reason, language)
                if (!columnFilters['reason'].has(reasonLoc)) return false
            }

            return true
        })

        if (sortKey) {
            out.sort((a, b) => {
                let valA: any = ''
                let valB: any = ''

                if (sortKey === 'record_type') {
                    valA = typeLabels[a.record_type] || a.record_type
                    valB = typeLabels[b.record_type] || b.record_type
                } else if (sortKey === 'name') {
                    valA = a.hr_staff?.full_name || ''
                    valB = b.hr_staff?.full_name || ''
                } else if (sortKey === 'date') {
                    valA = a.effective_date
                    valB = b.effective_date
                } else if (sortKey === 'previous_amount') {
                    valA = a.previous_amount
                    valB = b.previous_amount
                } else if (sortKey === 'new_amount') {
                    valA = a.new_amount
                    valB = b.new_amount
                } else if (sortKey === 'increase') {
                    const diffA = a.new_amount - a.previous_amount
                    const diffB = b.new_amount - b.previous_amount
                    const pctA = a.previous_amount > 0 ? (diffA / a.previous_amount) : 0
                    const pctB = b.previous_amount > 0 ? (diffB / b.previous_amount) : 0
                    valA = pctA
                    valB = pctB
                } else if (sortKey === 'reason') {
                    valA = getLocalizedReason(a.reason, language)
                    valB = getLocalizedReason(b.reason, language)
                }

                if (valA < valB) return sortAsc ? -1 : 1
                if (valA > valB) return sortAsc ? 1 : -1
                return 0
            })
        }

        return out
    }, [entries, columnFilters, sortKey, sortAsc, language])

    /* Summary */
    const totalChanges = entries.length
    const raisesCount = entries.filter(e => e.new_amount > e.previous_amount).length
    const promotionCount = entries.filter(e => e.record_type === 'promotion').length
    const uniqueStaff = new Set(entries.map(e => e.staff_id)).size

    const summaryCards = [
        { label: language === 'vi' ? 'Tổng sự kiện' : 'Total Events',   value: totalChanges, icon: TrendingUp,    color: 'text-blue-600',    bg: 'bg-blue-50' },
        { label: language === 'vi' ? 'Thăng chức' : 'Promotions',     value: promotionCount, icon: Briefcase,   color: 'text-purple-600',  bg: 'bg-purple-50' },
        { label: language === 'vi' ? 'Tăng lương gộp' : 'Gross Salary Raises',  value: raisesCount,  icon: DollarSign,    color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: language === 'vi' ? 'Nhân viên ảnh hưởng' : 'Staff Affected', value: uniqueStaff,  icon: Users,         color: 'text-amber-600',   bg: 'bg-amber-50' },
    ]

    const handleSave = async (data: Partial<HRStaffSalaryHistory>) => {
        setSaving(true)
        try {
            if (editingEntry) {
                const { error } = await supabase.from('hr_staff_salary_history').update(data).eq('id', editingEntry.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('hr_staff_salary_history').insert([data])
                if (error) throw error

                // If new, update the staff's current profile too
                if (data.staff_id) {
                    const updatePayload: any = {}
                    if (data.new_amount != null) {
                        updatePayload.salary_amount = data.new_amount
                        updatePayload.salary_type = data.salary_type
                    }
                    if (data.employment_type) {
                        updatePayload.employment_type = data.employment_type
                    }
                    if (data.record_type === 'promotion' && data.new_position_id) {
                        updatePayload.position_id = data.new_position_id
                        const posName = positions.find(p => p.id === data.new_position_id)?.name
                        if (posName) updatePayload.position = posName
                        
                        if (data.new_department_id) {
                            updatePayload.department_id = data.new_department_id
                            const deptName = departments.find(d => d.id === data.new_department_id)?.name
                            if (deptName) updatePayload.department = deptName
                        } else {
                            updatePayload.department_id = null
                            updatePayload.department = null
                        }
                    }
                    if (Object.keys(updatePayload).length > 0) {
                        await supabase.from('hr_staff').update(updatePayload).eq('id', data.staff_id)
                    }
                }
            }
            setModalOpen(false); setEditingEntry(null)
            await fetchAll()
        } catch (err) { console.error(err); alert(language === 'vi' ? 'Lưu thay đổi lương thất bại' : 'Failed to save salary change') }
        setSaving(false)
    }

    const handleResign = async (data: { staffId: string, effectiveDate: string, type: 'dismissal' | 'resignation' | 'rejection', reason: string, notes: string }) => {
        setSaving(true)
        try {
            const staff = staffList.find(s => s.id === data.staffId)
            const previous_amount = staff?.salary_amount || 0

            const { error: staffErr } = await supabase.from('hr_staff').update({ status: 'inactive' }).eq('id', data.staffId)
            if (staffErr) throw staffErr
            
            const historyPayload: Partial<HRStaffSalaryHistory> = {
                staff_id: data.staffId,
                effective_date: data.effectiveDate,
                record_type: data.type,
                previous_amount: previous_amount,
                previous_salary_type: staff?.salary_type || 'fixed',
                new_amount: 0,
                salary_type: staff?.salary_type || 'fixed',
                increase_type: 'none',
                increase_value: null,
                reason: data.reason,
                approved_by: loggedUserName || null,
                notes: data.notes || null
            }
            const { error: histErr } = await supabase.from('hr_staff_salary_history').insert([historyPayload])
            if (histErr) throw histErr

            setModalOpen(false)
            setEditingEntry(null)
            await fetchAll()
        } catch (err) {
            console.error(err)
            alert(language === 'vi' ? 'Cập nhật trạng thái nhân viên thất bại' : 'Failed to update staff status')
        }
        setSaving(false)
    }

    const handleDelete = async () => {
        if (!deletingId) return
        setDeleteLoading(true)
        try {
            const { error } = await supabase.from('hr_staff_salary_history').delete().eq('id', deletingId)
            if (error) throw error
            setDeletingId(null); await fetchAll()
        } catch (err) { console.error(err); alert(language === 'vi' ? 'Xóa thất bại' : 'Failed to delete') }
        setDeleteLoading(false)
    }

    const handleExport = async (range: 'this_month' | 'prev_month' | 'all' | 'custom', startDate?: string, endDate?: string) => {
        const ExcelJS = (await import('exceljs')).default

        let dataToExport = filtered
        
        const now = new Date()
        if (range === 'this_month') {
            const y = now.getFullYear()
            const m = String(now.getMonth() + 1).padStart(2, '0')
            const start = `${y}-${m}-01`
            const lastDay = new Date(y, now.getMonth() + 1, 0).getDate()
            const end = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
            dataToExport = filtered.filter(e => e.effective_date >= start && e.effective_date <= end)
        } else if (range === 'prev_month') {
            const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
            const y = prev.getFullYear()
            const m = String(prev.getMonth() + 1).padStart(2, '0')
            const start = `${y}-${m}-01`
            const lastDay = new Date(y, prev.getMonth() + 1, 0).getDate()
            const end = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
            dataToExport = filtered.filter(e => e.effective_date >= start && e.effective_date <= end)
        } else if (range === 'custom' && startDate && endDate) {
            dataToExport = filtered.filter(e => e.effective_date >= startDate && e.effective_date <= endDate)
        }

        const workbook = new ExcelJS.Workbook()
        const sheet = workbook.addWorksheet(language === 'vi' ? 'Thay đổi trạng thái' : 'Status Changes')

        sheet.columns = [
            { header: language === 'vi' ? 'Nhân viên' : 'Staff Member', key: 'name', width: 25 },
            { header: language === 'vi' ? 'Chức vụ cũ' : 'Old Position', key: 'old_position', width: 20 },
            { header: language === 'vi' ? 'Chức vụ mới' : 'New Position', key: 'new_position', width: 20 },
            { header: language === 'vi' ? 'Loại hình làm việc' : 'Employment Type', key: 'type', width: 18 },
            { header: language === 'vi' ? 'Ngày' : 'Date', key: 'date', width: 15 },
            { header: language === 'vi' ? 'Lương gộp cũ' : 'Old Gross Salary', key: 'old_salary', width: 18, style: { numFmt: '#,##0' } },
            { header: language === 'vi' ? 'Lương gộp mới' : 'New Gross Salary', key: 'new_salary', width: 18, style: { numFmt: '#,##0' } },
            { header: language === 'vi' ? 'Tăng trưởng' : 'Increase', key: 'increase', width: 15 },
            { header: language === 'vi' ? 'Lý do' : 'Reason', key: 'reason', width: 30 },
        ]

        sheet.getRow(1).font = { bold: true }
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }

        dataToExport.forEach(e => {
            const isPromo = e.record_type === 'promotion'
            const isResign = e.record_type === 'resignation'
            const isDismissal = e.record_type === 'dismissal'
            
            const diff = e.new_amount - e.previous_amount
            const pct = e.previous_amount > 0 ? ((diff / e.previous_amount) * 100).toFixed(1) : (language === 'vi' ? 'Mới' : 'New')
            const increaseStr = diff === 0 ? (language === 'vi' ? 'Không đổi' : 'No Change') : (e.previous_amount === 0 ? (language === 'vi' ? 'Mới' : 'New') : `${diff > 0 ? '+' : ''}${pct}%`)

            const oldPos = e.previous_position?.name || e.hr_staff?.position || ''
            const newPos = e.new_position?.name || e.hr_staff?.position || ''
            const empTypeStr = e.employment_type
                ? (e.employment_type === 'full_time' ? (language === 'vi' ? 'Toàn thời gian' : 'Full-Time') : e.employment_type === 'part_time' ? (language === 'vi' ? 'Bán thời gian' : 'Part-Time') : (language === 'vi' ? 'Outsource' : 'Outsourced'))
                : (e.salary_type === 'fixed' 
                    ? (language === 'vi' ? 'Toàn thời gian' : 'Full-Time') 
                    : (language === 'vi' ? 'Bán thời gian' : 'Part-Time'))

            sheet.addRow({
                name: e.hr_staff?.full_name || '',
                old_position: oldPos,
                new_position: newPos,
                type: empTypeStr,
                date: new Date(e.effective_date).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-GB'),
                old_salary: e.previous_amount,
                new_salary: (isResign || isDismissal) ? null : e.new_amount,
                increase: (isResign || isDismissal) ? '—' : increaseStr,
                reason: getLocalizedReason(e.reason, language)
            })
        })

        let fileNameSuffix = language === 'vi' ? 'Tats_ca_thoi_gian' : 'All_Time'
        if (range === 'this_month') {
            const mName = now.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' })
            fileNameSuffix = mName.replace(/\s+/g, '_')
        } else if (range === 'prev_month') {
            const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
            const mName = prev.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' })
            fileNameSuffix = mName.replace(/\s+/g, '_')
        } else if (range === 'custom' && startDate && endDate) {
            fileNameSuffix = `${startDate}_to_${endDate}`
        }

        const buffer = await workbook.xlsx.writeBuffer()
        saveAs(new Blob([buffer]), language === 'vi' ? `Xuat_Thay_Doi_Trang_Thai_${fileNameSuffix}.xlsx` : `Status_Changes_Export_${fileNameSuffix}.xlsx`)
        
        setExportModalOpen(false)
    }

    if (loading) return <div className="min-h-screen flex items-center justify-center"><CircularLoader /></div>

    return (
        <div className="min-h-screen text-gray-100 p-6 animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white">
                            {language === 'vi' ? 'Thay đổi trạng thái' : 'Status Change'}
                        </h1>
                        <p className="text-sm text-slate-400 mt-1">
                            {language === 'vi' 
                                ? 'Theo dõi thay đổi vai trò, thăng chức và điều chỉnh lương gộp cho đội ngũ của bạn.' 
                                : 'Track role changes, promotions, and gross salary adjustments for your team.'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setExportModalOpen(true)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 border border-white/10 text-sm font-medium text-white hover:bg-slate-700 transition shadow hover:shadow-lg">
                            <FileDown className="w-4 h-4" />
                            {language === 'vi' ? 'Xuất file' : 'Export'}
                        </button>
                        <button onClick={() => { setEditingEntry(null); setModalOpen(true) }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition shadow hover:shadow-lg">
                            <Plus className="w-4 h-4" />
                            {language === 'vi' ? 'Ghi nhận sự kiện' : 'Record Event'}
                        </button>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    {summaryCards.map(c => (
                        <div key={c.label} className="rounded-xl bg-white shadow-sm p-4 border border-gray-100">
                            <div className="flex items-center gap-2 mb-2">
                                <div className={`p-1.5 rounded-lg ${c.bg}`}><c.icon className={`w-4 h-4 ${c.color}`} /></div>
                                <span className="text-xs font-semibold uppercase text-gray-500">{c.label}</span>
                            </div>
                            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                        </div>
                    ))}
                </div>



                {/* Table */}
                <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    <ColumnHeader
                                        colKey="record_type"
                                        label={language === 'vi' ? 'Sự kiện' : 'Event'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['record_type'] || []}
                                        activeFilter={columnFilters['record_type'] || null}
                                        onFilter={(s) => applyColumnFilter('record_type', s)}
                                        onClear={() => clearColumnFilter('record_type')}
                                        open={openMenu === 'record_type'}
                                        onToggle={() => setOpenMenu(openMenu === 'record_type' ? null : 'record_type')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                        className="text-left w-[140px]"
                                    />
                                    <ColumnHeader
                                        colKey="name"
                                        label={language === 'vi' ? 'Nhân viên' : 'Staff Member'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['name'] || []}
                                        activeFilter={columnFilters['name'] || null}
                                        onFilter={(s) => applyColumnFilter('name', s)}
                                        onClear={() => clearColumnFilter('name')}
                                        open={openMenu === 'name'}
                                        onToggle={() => setOpenMenu(openMenu === 'name' ? null : 'name')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                        className="text-left w-1/5 min-w-[150px]"
                                    />
                                    <ColumnHeader
                                        colKey="date"
                                        label={language === 'vi' ? 'Ngày' : 'Date'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['date'] || []}
                                        activeFilter={columnFilters['date'] || null}
                                        onFilter={(s) => applyColumnFilter('date', s)}
                                        onClear={() => clearColumnFilter('date')}
                                        open={openMenu === 'date'}
                                        onToggle={() => setOpenMenu(openMenu === 'date' ? null : 'date')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                        className="text-left w-[120px]"
                                    />
                                    <ColumnHeader
                                        colKey="previous_amount"
                                        label={language === 'vi' ? 'Lương gộp cũ' : 'Old Gross Salary'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['previous_amount'] || []}
                                        activeFilter={columnFilters['previous_amount'] || null}
                                        onFilter={(s) => applyColumnFilter('previous_amount', s)}
                                        onClear={() => clearColumnFilter('previous_amount')}
                                        open={openMenu === 'previous_amount'}
                                        onToggle={() => setOpenMenu(openMenu === 'previous_amount' ? null : 'previous_amount')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                        right
                                        className="text-right"
                                    />
                                    <ColumnHeader
                                        colKey="new_amount"
                                        label={language === 'vi' ? 'Lương gộp mới' : 'New Gross Salary'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['new_amount'] || []}
                                        activeFilter={columnFilters['new_amount'] || null}
                                        onFilter={(s) => applyColumnFilter('new_amount', s)}
                                        onClear={() => clearColumnFilter('new_amount')}
                                        open={openMenu === 'new_amount'}
                                        onToggle={() => setOpenMenu(openMenu === 'new_amount' ? null : 'new_amount')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                        right
                                        className="text-right"
                                    />
                                    <ColumnHeader
                                        colKey="increase"
                                        label={language === 'vi' ? 'Tăng trưởng' : 'Increase'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['increase'] || []}
                                        activeFilter={columnFilters['increase'] || null}
                                        onFilter={(s) => applyColumnFilter('increase', s)}
                                        onClear={() => clearColumnFilter('increase')}
                                        open={openMenu === 'increase'}
                                        onToggle={() => setOpenMenu(openMenu === 'increase' ? null : 'increase')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                        center
                                        className="text-center"
                                    />
                                    <ColumnHeader
                                        colKey="reason"
                                        label={language === 'vi' ? 'Lý do' : 'Reason'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['reason'] || []}
                                        activeFilter={columnFilters['reason'] || null}
                                        onFilter={(s) => applyColumnFilter('reason', s)}
                                        onClear={() => clearColumnFilter('reason')}
                                        open={openMenu === 'reason'}
                                        onToggle={() => setOpenMenu(openMenu === 'reason' ? null : 'reason')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                        className="text-left max-w-[150px]"
                                    />
                                    <th className="text-center px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-500 w-24">
                                        {language === 'vi' ? 'Hành động' : 'Actions'}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map((e, idx) => {
                                    const isPromo = e.record_type === 'promotion'
                                    const isResign = e.record_type === 'resignation'
                                    const isDismissal = e.record_type === 'dismissal'
                                    const isDeparture = isResign || isDismissal
                                    return (
                                        <tr key={e.id} className="group hover:bg-gray-100 transition-colors border-t border-gray-100 cursor-pointer" onClick={() => { setEditingEntry(e); setModalOpen(true) }}>
                                            <td className="px-6 py-4">
                                                {isPromo ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-bold border border-purple-100">
                                                        <Briefcase className="w-3.5 h-3.5" /> {language === 'vi' ? 'Thăng chức' : 'Promotion'}
                                                    </span>
                                                ) : isDeparture ? (
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${isResign ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                                                        <TrendingDown className="w-3.5 h-3.5" /> {isResign ? (language === 'vi' ? 'Thôi việc' : 'Resignation') : (language === 'vi' ? 'Sa thải' : 'Dismissal')}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100">
                                                        <TrendingUp className="w-3.5 h-3.5" /> {language === 'vi' ? 'Đổi lương gộp' : 'Gross Salary Change'}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                                                        {(e.hr_staff?.full_name || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="text-sm font-bold text-gray-900 block truncate">{e.hr_staff?.full_name}</span>
                                                        {isPromo ? (
                                                            <div className="text-xs text-purple-600 mt-0.5 flex items-center gap-1">
                                                                <span className="line-through text-gray-400">{e.previous_position?.name || (language === 'vi' ? 'Không có vị trí' : 'No Position')}</span>
                                                                <ArrowUpRight className="w-3 h-3" />
                                                                <span className="font-semibold">{e.new_position?.name || (language === 'vi' ? 'Không có vị trí' : 'No Position')}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-gray-500 block">{e.hr_staff?.position}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm font-medium text-gray-600">
                                                {fmtDate(e.effective_date)}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 text-right font-mono">{fmt(e.previous_amount)}</td>
                                            <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right font-mono">{isDeparture ? '—' : fmt(e.new_amount)}</td>
                                            <td className="px-6 py-4 text-center">
                                                {isDeparture ? <span className="text-gray-400 text-xs">—</span> : <ChangeIndicator prev={e.previous_amount} next={e.new_amount} type={e.record_type} incType={e.increase_type} incValue={e.increase_value} prevType={e.previous_salary_type} newType={e.salary_type} />}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm font-medium text-gray-700 block truncate max-w-[150px]">{getLocalizedReason(e.reason, language)}</span>
                                                <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                                                    {e.previous_employment_type && e.previous_employment_type !== e.employment_type 
                                                        ? `${e.previous_employment_type === 'full_time' ? (language === 'vi' ? 'Toàn thời gian' : 'Full-Time') : e.previous_employment_type === 'part_time' ? (language === 'vi' ? 'Bán thời gian' : 'Part-Time') : (language === 'vi' ? 'Outsource' : 'Outsourced')} → ${e.employment_type === 'full_time' ? (language === 'vi' ? 'Toàn thời gian' : 'Full-Time') : e.employment_type === 'part_time' ? (language === 'vi' ? 'Bán thời gian' : 'Part-Time') : (language === 'vi' ? 'Outsource' : 'Outsourced')}` 
                                                        : (e.employment_type 
                                                            ? (e.employment_type === 'full_time' ? (language === 'vi' ? 'Toàn thời gian' : 'Full-Time') : e.employment_type === 'part_time' ? (language === 'vi' ? 'Bán thời gian' : 'Part-Time') : (language === 'vi' ? 'Outsource' : 'Outsourced'))
                                                            : (e.salary_type === 'fixed' ? (language === 'vi' ? 'Toàn thời gian' : 'Full-Time') : (language === 'vi' ? 'Bán thời gian' : 'Part-Time')))}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center" onClick={(event) => event.stopPropagation()}>
                                                <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
                                                    <button onClick={(event) => { event.stopPropagation(); setDeletingId(e.id) }}
                                                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition" title={language === 'vi' ? 'Xóa' : 'Delete'}>
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-12 text-center text-slate-400 text-xs italic font-semibold">
                                            <p className="mb-1 text-gray-900 text-sm font-bold not-italic">
                                                {entries.length === 0 
                                                    ? (language === 'vi' ? 'Chưa có lịch sử được ghi lại' : 'No history recorded') 
                                                    : (language === 'vi' ? 'Không tìm thấy kết quả' : 'No results found')}
                                            </p>
                                            <p className="text-gray-500 text-xs font-normal not-italic">
                                                {entries.length === 0 
                                                    ? (language === 'vi' ? 'Bắt đầu theo dõi thăng chức và tăng lương.' : 'Start tracking promotions and salary increases.') 
                                                    : (language === 'vi' ? 'Thử điều chỉnh bộ lọc của bạn.' : 'Try adjusting your filters.')}
                                            </p>
                                            {entries.length === 0 && (
                                                <button onClick={() => { setEditingEntry(null); setModalOpen(true) }}
                                                    className="mt-4 text-xs font-bold text-blue-650 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition not-italic">
                                                    {language === 'vi' ? 'Ghi nhận sự kiện đầu tiên' : 'Record First Event'}
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

            <SalaryModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingEntry(null) }}
                onSave={handleSave} onResign={handleResign} entry={editingEntry} staffList={staffList} departments={departments} positions={positions} saving={saving} loggedUserName={loggedUserName} />

            {deletingId && (
                <DeleteConfirm
                    label={entries.find(e => e.id === deletingId)?.hr_staff?.full_name || ''}
                    onConfirm={handleDelete} onCancel={() => setDeletingId(null)} deleting={deleteLoading} />
            )}

            {exportModalOpen && (
                <ExportModal onClose={() => setExportModalOpen(false)} onExport={handleExport} />
            )}
        </div>
    )
}

interface ColumnHeaderProps {
    colKey: string
    label: string
    sortKey: string
    sortAsc: boolean
    onSort: (key: string, isAsc: boolean) => void
    values: string[]
    activeFilter: Set<string> | null
    onFilter: (values: Set<string> | null) => void
    onClear: () => void
    open: boolean
    onToggle: () => void
    onClose: () => void
    dict: {
        sortAsc: string
        sortDesc: string
        selectAll: string
        deselectAll: string
        filterPlaceholder: string
        clearFilters: string
        empty: string
    }
    className?: string
    center?: boolean
    right?: boolean
}

function ColumnHeader({
    colKey,
    label,
    sortKey,
    sortAsc,
    onSort,
    values,
    activeFilter,
    onFilter,
    onClear,
    open,
    onToggle,
    onClose,
    dict,
    className = '',
    center = false,
    right = false
}: ColumnHeaderProps) {
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

    const filteredValues = useMemo(() => {
        if (!filterSearch.trim()) return values
        const q = filterSearch.toLowerCase()
        return values.filter(v => (v || '').toLowerCase().includes(q))
    }, [values, filterSearch])

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
        <th className={`px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500 relative select-none ${className}`} ref={ref as any}>
            <div className={`flex items-center gap-1 ${center ? 'justify-center' : right ? 'justify-end' : 'justify-between'}`}>
                <span className="cursor-pointer hover:text-gray-900 transition-colors" onClick={() => onSort(colKey, !sortAsc)}>
                    {label}
                </span>
                
                <div className="flex items-center gap-0.5">
                    {isActive && (
                        sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    )}
                    
                    {hasFilter && (
                        <Filter className="w-3.5 h-3.5 text-orange-500 fill-current flex-shrink-0" />
                    )}
                    
                    <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onToggle(); }}
                        className="p-0.5 rounded hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700 flex-shrink-0 cursor-pointer"
                    >
                        <MoreVertical className="w-4 h-4 text-gray-500" />
                    </button>
                </div>
            </div>

            {open && dropdownStyle && (
                <div 
                    className="fixed bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] min-w-[220px] text-left text-sm text-gray-700 normal-case font-normal" 
                    style={dropdownStyle}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="px-3 py-2 space-y-1">
                        <button 
                            type="button"
                            onClick={() => { onSort(colKey, true); onClose(); }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${isActive && sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'}`}
                        >
                            <ArrowUp className="w-4 h-4" />
                            {dict.sortAsc}
                        </button>
                        <button 
                            type="button"
                            onClick={() => { onSort(colKey, false); onClose(); }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${isActive && !sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'}`}
                        >
                            <ArrowDown className="w-4 h-4" />
                            {dict.sortDesc}
                        </button>
                    </div>

                    <div className="border-t border-gray-200" />

                    <div className="px-3 py-2">
                        <input 
                            type="text" 
                            placeholder={dict.filterPlaceholder}
                            value={filterSearch}
                            onChange={(e) => setFilterSearch(e.target.value)}
                            className="w-full mb-2 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-gray-900"
                        />
                        <button
                            type="button"
                            onClick={toggleAll}
                            className="text-xs text-blue-600 hover:text-blue-800 mb-1 cursor-pointer font-medium"
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
                                    <span className="truncate text-xs">{v || `[${dict.empty}]`}</span>
                                </label>
                            ))}
                            {filteredValues.length === 0 && (
                                <div className="text-xs text-gray-400 py-1 text-center">—</div>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
                        <button type="button" onClick={() => { onClear(); onClose(); }} className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer font-medium">
                            {dict.clearFilters}
                        </button>
                        <button type="button" onClick={() => { handleApply(); onClose(); }} className="px-3 py-1 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer font-medium">
                            OK
                        </button>
                    </div>
                </div>
            )}
        </th>
    )
}
