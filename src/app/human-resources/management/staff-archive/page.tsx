'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffMember, HRStaffSalaryHistory, HRDepartment, HRPosition } from '@/types/human-resources'
import { StaffModal } from '@/components/human-resources/StaffModal'
import CircularLoader from '@/components/CircularLoader'
import {
    Users, Search, X, TrendingDown, ArrowLeft, Building2, Folders, UserPlus, Undo2, Ban,
    ArrowUp, ArrowDown, Filter, MoreVertical, UserX, UserCheck
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSettings } from '@/contexts/SettingsContext'
import { getCurrentUserPermissions } from '@/lib/user-branches'

export default function StaffArchivePage() {
    const { language } = useSettings()
    const [loading, setLoading] = useState(true)
    const [archivedStaff, setArchivedStaff] = useState<(HRStaffMember & { departureRecord?: HRStaffSalaryHistory })[]>([])
    const [search, setSearch] = useState('')
    const [sortKey, setSortKey] = useState<string>('name')
    const [sortAsc, setSortAsc] = useState<boolean>(true)
    const [columnFilters, setColumnFilters] = useState<Record<string, Set<string> | null>>({})
    const [openMenu, setOpenMenu] = useState<string | null>(null)
    const router = useRouter()

    const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
    const [departments, setDepartments] = useState<HRDepartment[]>([])
    const [positions, setPositions] = useState<HRPosition[]>([])
    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
    const [currentUserBranches, setCurrentUserBranches] = useState<string[] | null>(null)
    
    const [rehireModalOpen, setRehireModalOpen] = useState(false)
    const [rehireStaff, setRehireStaff] = useState<HRStaffMember | null>(null)
    const [rehireSaving, setRehireSaving] = useState(false)

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

            // Fetch inactive staff
            const { data: staffData } = await supabase
                .from('hr_staff')
                .select('*, hr_staff_branches(*)')
                .in('status', ['inactive', 'terminated'])
                .order('full_name')

            // Fetch departure records from role history
            const { data: historyData } = await supabase
                .from('hr_staff_role_history')
                .select('*')
                .order('effective_date', { ascending: false })
                .order('created_at', { ascending: false })

            if (staffData && historyData) {
                let filteredStaffData = staffData
                if (userRole && !['owner', 'admin'].includes(userRole) && userBranches) {
                    filteredStaffData = staffData.filter(s =>
                        (s.hr_staff_branches || []).some((sb: any) => userBranches.includes(sb.branch_id))
                    )
                }

                // Map departure record to staff (take the most recent one for each staff)
                const merged = filteredStaffData.map(staff => {
                    const latestRoleEvent = historyData.find(h => h.staff_id === staff.id)
                    let departureRecord = null
                    if (latestRoleEvent) {
                        // Parse record_type from reason
                        let record_type = 'dismissal' // fallback
                        let original_type = 'dismissal'
                        let reasonText = latestRoleEvent.reason || ''
                        const match = reasonText.match(/^\[(RESIGNATION|DISMISSAL|REJECTION)\]\s*(.*)/i)
                        if (match) {
                            original_type = match[1].toLowerCase()
                            record_type = original_type // leave it as rejection
                            reasonText = match[2]
                        }
                        
                        departureRecord = {
                            ...latestRoleEvent,
                            record_type,
                            original_type,
                            reason: reasonText
                        }
                    }
                    return { ...staff, departureRecord }
                })
                setArchivedStaff(merged as any)
            }

            const { data: bData } = await supabase.from('provider_branches').select('id, name, city')
            if (bData) {
                let branchData = bData
                if (userRole && !['owner', 'admin'].includes(userRole) && userBranches) {
                    branchData = branchData.filter((b: any) => userBranches.includes(b.id))
                }
                setBranches(branchData)
            }
            const { data: dData } = await supabase.from('hr_departments').select('*')
            if (dData) setDepartments(dData)
            const { data: pData } = await supabase.from('hr_positions').select('*')
            if (pData) setPositions(pData)
            
        } catch (err) {
            console.error(err)
        }
        setLoading(false)
    }, [currentUserRole, currentUserBranches])

    useEffect(() => { fetchAll() }, [fetchAll])

    const handleRehireSave = async (data: Partial<HRStaffMember>, branchIds: string[]) => {
        if (!rehireStaff) return
        setRehireSaving(true)
        try {
            // Update hr_staff
            const { error: staffErr } = await supabase.from('hr_staff').update({
                ...data,
                status: 'active'
            }).eq('id', rehireStaff.id)
            if (staffErr) throw staffErr

            // Update branches
            await supabase.from('hr_staff_branches').delete().eq('staff_id', rehireStaff.id)
            if (branchIds.length > 0) {
                const bInserts = branchIds.map(bId => ({ staff_id: rehireStaff.id, branch_id: bId }))
                const { error: bErr } = await supabase.from('hr_staff_branches').insert(bInserts)
                if (bErr) throw bErr
            }

            // Log role history
            const empType = data.employment_type === 'full_time' ? 'Full-time' : data.employment_type === 'part_time' ? 'Part-time' : 'Outsourced'
            await supabase.from('hr_staff_role_history').insert([{
                staff_id: rehireStaff.id,
                effective_date: data.start_date || new Date().toISOString().slice(0, 10),
                reason: `[RE-HIRED] Re-hired as ${empType} - ${data.position || 'Staff'}`,
                new_position_id: data.position_id,
                new_department_id: data.department_id,
            }])

            // Log salary history
            await supabase.from('hr_staff_salary_history').insert([{
                staff_id: rehireStaff.id,
                effective_date: data.start_date || new Date().toISOString().slice(0, 10),
                record_type: 'salary_increase',
                previous_amount: rehireStaff.salary_amount || 0,
                previous_salary_type: rehireStaff.salary_type || 'fixed',
                new_amount: data.salary_amount || 0,
                salary_type: data.salary_type || 'fixed',
                reason: 'Re-hired with new contract',
                notes: `Re-hired as ${empType}${data.notes ? '\n' + data.notes : ''}`,
                approved_by: null
            }])

            setRehireModalOpen(false)
            setRehireStaff(null)
            
            // Redirect to profile
            router.push(`/human-resources/management/staff/${rehireStaff.id}`)
        } catch (err: any) {
            console.error('Failed to re-hire:', err)
            const rehErrMsg = language === 'vi' ? 'Tuyển dụng lại thất bại: ' : 'Failed to re-hire: '
            alert(rehErrMsg + err.message)
        } finally {
            setRehireSaving(false)
        }
    }

    const handleToggleEligibility = async (staffId: string, currentStatus: boolean | null | undefined) => {
        const nextStatus = currentStatus === false
        const confirmText = nextStatus
            ? (language === 'vi' 
                ? 'Bạn có chắc chắn muốn khôi phục quyền tuyển dụng lại cho nhân sự này không?' 
                : 'Are you sure you want to mark this staff member as eligible for rehire?')
            : (language === 'vi'
                ? 'Bạn có chắc chắn muốn đánh dấu nhân sự này là Không đủ điều kiện tuyển dụng lại? Họ sẽ bị chặn ứng tuyển trong tương lai.'
                : 'Are you sure you want to mark this staff member as not eligible for rehire? Future applications from them will be blocked.')
                
        if (!confirm(confirmText)) return
        
        try {
            const { error } = await supabase
                .from('hr_staff')
                .update({ rehire_eligible: nextStatus })
                .eq('id', staffId)
                
            if (error) throw error
            await fetchAll()
        } catch (err: any) {
            console.error('Error toggling eligibility:', err)
            alert(language === 'vi' ? 'Không thể cập nhật quyền tuyển dụng lại' : 'Failed to update rehire eligibility')
        }
    }

    const getDepartureTypeLabel = useCallback((type: string) => {
        if (language === 'vi') {
            if (type === 'resignation') return 'Xin thôi việc'
            if (type === 'rejection') return 'Từ chối thử việc'
            return 'Sa thải'
        }
        if (type === 'resignation') return 'Resignation'
        if (type === 'rejection') return 'Probation Rejected'
        return 'Dismissal'
    }, [language])

    const displayValue = useCallback((s: any, colKey: string): string => {
        switch(colKey) {
            case 'name': return s.full_name || '';
            case 'position': return s.position || '';
            case 'departure_date': 
                return s.departureRecord ? new Date(s.departureRecord.effective_date).toLocaleDateString('en-GB') : '';
            case 'type': 
                return s.departureRecord ? getDepartureTypeLabel(s.departureRecord.record_type) : '';
            case 'reason': return s.departureRecord?.reason || '';
            default: return '';
        }
    }, [getDepartureTypeLabel])

    const columnValues = useMemo(() => {
        const map: Record<string, string[]> = {}
        const keys: string[] = ['name', 'position', 'departure_date', 'type', 'reason']
        keys.forEach(k => {
            const set = new Set<string>()
            archivedStaff.forEach(s => { 
                const v = displayValue(s, k)
                if (v) set.add(v)
            })
            map[k] = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        })
        return map
    }, [archivedStaff, displayValue])

    const applySort = (col: string, asc: boolean) => {
        setSortKey(col)
        setSortAsc(asc)
        setOpenMenu(null)
    }

    const applyColumnFilter = (col: string, vals: Set<string> | null) => {
        setColumnFilters(prev => ({ ...prev, [col]: vals }))
        setOpenMenu(null)
    }

    const clearColumnFilter = (col: string) => {
        setColumnFilters(prev => {
            const n = { ...prev }
            delete n[col]
            return n
        })
        setOpenMenu(null)
    }

    const filtered = useMemo(() => {
        let out = archivedStaff.slice()
        if (search) {
            const q = search.toLowerCase()
            out = out.filter(s =>
                (s.full_name || '').toLowerCase().includes(q) ||
                (s.position || '').toLowerCase().includes(q)
            )
        }
        
        // Applica i filtri delle colonne (kebab)
        for (const [col, allowed] of Object.entries(columnFilters)) {
            if (!allowed) continue
            out = out.filter(s => {
                const v = displayValue(s, col)
                return allowed.has(v)
            })
        }

        // Applica l'ordinamento
        out.sort((a, b) => {
            let av: any, bv: any
            switch(sortKey) {
                case 'name': av = a.full_name || ''; bv = b.full_name || ''; break;
                case 'position': av = a.position || ''; bv = b.position || ''; break;
                case 'departure_date': 
                    av = a.departureRecord?.effective_date || ''; 
                    bv = b.departureRecord?.effective_date || ''; 
                    break;
                case 'type': 
                    av = a.departureRecord ? getDepartureTypeLabel(a.departureRecord.record_type) : '';
                    bv = b.departureRecord ? getDepartureTypeLabel(b.departureRecord.record_type) : '';
                    break;
                case 'reason': 
                    av = a.departureRecord?.reason || ''; 
                    bv = b.departureRecord?.reason || ''; 
                    break;
                default: av = ''; bv = '';
            }
            let cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
            return sortAsc ? cmp : -cmp
        })
        return out
    }, [archivedStaff, search, sortKey, sortAsc, columnFilters, displayValue, getDepartureTypeLabel])

    if (loading) return <div className="min-h-screen flex items-center justify-center"><CircularLoader /></div>

    return (
        <div className="min-h-screen text-gray-100 p-6 animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto">
                <div className="mb-4">
                    <Link href="/human-resources/management/staff" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white transition">
                        <ArrowLeft className="w-4 h-4" /> 
                        {language === 'vi' ? 'Quay lại Quản Lý Nhân Viên' : 'Back to Staff Management'}
                    </Link>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Folders className="w-6 h-6 text-gray-400" />
                            {language === 'vi' ? 'Lưu Trữ Nhân Viên' : 'Staff Archive'}
                        </h1>
                        <p className="text-sm text-slate-400 mt-1">
                            {language === 'vi'
                                ? 'Hồ sơ lịch sử của những nhân viên đã nghỉ việc hoặc bị sa thải.'
                                : 'Historical records of staff members who have resigned or been dismissed.'}
                        </p>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="text" placeholder={language === 'vi' ? 'Tìm tên, chức vụ...' : 'Search name, position…'} value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none" />
                        {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10"><X className="w-3 h-3 text-slate-400" /></button>}
                    </div>
                    <span className="text-xs text-slate-500 ml-auto">
                        {language === 'vi' 
                            ? `Hiển thị ${filtered.length} trên ${archivedStaff.length}` 
                            : `${filtered.length} of ${archivedStaff.length} shown`}
                    </span>
                </div>

                {/* Table */}
                <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    {([
                                        ['name', language === 'vi' ? 'Nhân viên' : 'Staff Member'],
                                        ['position', language === 'vi' ? 'Chức vụ' : 'Position'],
                                        ['departure_date', language === 'vi' ? 'Ngày nghỉ việc' : 'Departure Date'],
                                        ['type', language === 'vi' ? 'Hình thức' : 'Type'],
                                        ['reason', language === 'vi' ? 'Lý do' : 'Reason']
                                    ] as [string, string][]).map(([k, lbl]) => (
                                        <ColumnHeader
                                            key={k} colKey={k} label={lbl}
                                            sortKey={sortKey} sortAsc={sortAsc} onSort={applySort}
                                            values={columnValues[k] || []} activeFilter={columnFilters[k] || null}
                                            onFilter={(s) => applyColumnFilter(k, s)} onClear={() => clearColumnFilter(k)}
                                            open={openMenu === k} onToggle={() => setOpenMenu(openMenu === k ? null : k)} onClose={() => setOpenMenu(null)}
                                            dict={language === 'vi' ? {
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
                                            className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500"
                                        />
                                    ))}
                                    <th className="text-center px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                                        {language === 'vi' ? 'Thao tác' : 'Actions'}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map((s) => {
                                    const record = s.departureRecord
                                    const isResign = record?.record_type === 'resignation'
                                    const isReject = record?.record_type === 'rejection'
                                    
                                    return (
                                        <tr 
                                            key={s.id} 
                                            onClick={() => router.push(`/human-resources/management/staff/${s.id}`)}
                                            className="hover:bg-gray-50/80 transition-colors cursor-pointer"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                                                        {(s.full_name || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-bold text-gray-900 block truncate">{s.full_name}</span>
                                                            {s.rehire_eligible === false && (
                                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-red-50 text-red-700 uppercase tracking-wider border border-red-100 shrink-0">
                                                                    {language === 'vi' ? 'Không đủ điều kiện' : 'Not Eligible'}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-xs text-gray-400 block">{s.email || s.phone || (language === 'vi' ? 'Không có liên hệ' : 'No contact info')}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm font-medium text-gray-700 block truncate">{s.position}</span>
                                                <span className="text-xs text-gray-400 block">{s.department || (language === 'vi' ? 'Không có phòng ban' : 'No department')}</span>
                                            </td>
                                            <td className="px-6 py-4 text-sm font-medium text-gray-600">
                                                {record ? new Date(record.effective_date).toLocaleDateString('en-GB') : (language === 'vi' ? 'Không rõ' : 'Unknown')}
                                            </td>
                                            <td className="px-6 py-4">
                                                {record ? (
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${isResign ? 'bg-orange-50 text-orange-700 border-orange-100' : isReject ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                                                        <TrendingDown className="w-3.5 h-3.5" /> 
                                                        {getDepartureTypeLabel(record.record_type)}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400 text-sm italic">{language === 'vi' ? 'Không rõ' : 'Unknown'}</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                {record ? (
                                                    <span className="text-sm font-medium text-gray-700 block max-w-xs">{record.reason || '—'}</span>
                                                ) : (
                                                    <span className="text-gray-400 text-sm italic">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    {/* Undo Rejection button */}
                                                    {(record as any)?.original_type === 'rejection' && s.probation_end_date && s.probation_end_date >= new Date().toISOString().split('T')[0] && (
                                                        <button
                                                            onClick={async (e) => {
                                                                e.stopPropagation()
                                                                const undoConfirmText = language === 'vi' 
                                                                    ? `Bạn có chắc muốn khôi phục và hủy từ chối thử việc cho ${s.full_name}?` 
                                                                    : `Are you sure you want to undo the rejection for ${s.full_name}?`
                                                                if (!confirm(undoConfirmText)) return;
                                                                
                                                                const { error } = await supabase.from('hr_staff').update({ status: 'active' }).eq('id', s.id);
                                                                if (error) {
                                                                    const failedMsg = language === 'vi' ? 'Khôi phục thất bại: ' : 'Failed to undo rejection: '
                                                                    alert(failedMsg + error.message);
                                                                } else {
                                                                    // Log role history for undo
                                                                    await supabase.from('hr_staff_role_history').insert([{
                                                                        staff_id: s.id,
                                                                        effective_date: new Date().toISOString().slice(0,10),
                                                                        reason: '[UNDO REJECTION] Rejection cancelled before probation end',
                                                                    }]);
                                                                    // Redirect to staff profile
                                                                    router.push(`/human-resources/management/staff/${s.id}`);
                                                                }
                                                            }}
                                                            title={language === 'vi' ? 'Hoàn tác Từ chối' : 'Undo Rejection'}
                                                            className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 transition-colors relative z-10"
                                                        >
                                                            <Undo2 className="w-4 h-4" />
                                                        </button>
                                                    )}

                                                    {/* Re-hire button */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            if (s.rehire_eligible === false) {
                                                                alert(language === 'vi' 
                                                                    ? 'Nhân sự này được đánh dấu là Không đủ điều kiện tuyển dụng lại. Vui lòng khôi phục quyền tuyển dụng để tiếp tục.' 
                                                                    : 'This staff member is marked as Not Eligible for rehire. Please enable their rehire eligibility to continue.')
                                                                return
                                                            }
                                                            setRehireStaff(s)
                                                            setRehireModalOpen(true)
                                                        }}
                                                        title={language === 'vi' ? 'Tuyển dụng lại' : 'Re-Hire'}
                                                        className={`p-1.5 rounded-lg transition-colors relative z-10 ${
                                                            s.rehire_eligible === false 
                                                                ? 'bg-gray-100 text-gray-400 opacity-50 cursor-not-allowed' 
                                                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700'
                                                        }`}
                                                    >
                                                        <UserPlus className="w-4 h-4" />
                                                    </button>

                                                    {/* Toggle Eligibility button */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleToggleEligibility(s.id, s.rehire_eligible)
                                                        }}
                                                        title={s.rehire_eligible === false 
                                                            ? (language === 'vi' ? 'Khôi phục Đủ điều kiện' : 'Mark as Eligible') 
                                                            : (language === 'vi' ? 'Không đủ điều kiện' : 'Mark as Not Eligible')
                                                        }
                                                        className={`p-1.5 rounded-lg transition-colors relative z-10 ${
                                                            s.rehire_eligible === false 
                                                                ? 'bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-700' 
                                                                : 'bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700'
                                                        }`}
                                                    >
                                                        {s.rehire_eligible === false ? (
                                                            <UserCheck className="w-4 h-4" />
                                                        ) : (
                                                            <UserX className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-16 text-center">
                                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                                                <Users className="w-8 h-8 text-gray-300" />
                                            </div>
                                            <p className="text-gray-900 text-base font-bold mb-1">
                                                {language === 'vi' ? 'Không tìm thấy nhân viên lưu trữ' : 'No archived staff found'}
                                            </p>
                                            <p className="text-gray-500 text-sm">
                                                {language === 'vi' 
                                                    ? 'Nhân viên thôi việc hoặc bị sa thải sẽ xuất hiện ở đây.' 
                                                    : 'Staff who are dismissed or resign will appear here.'}
                                            </p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <StaffModal
                open={rehireModalOpen}
                onClose={() => { setRehireModalOpen(false); setRehireStaff(null); }}
                onSave={handleRehireSave}
                staff={rehireStaff}
                branches={branches}
                departments={departments}
                positions={positions}
                saving={rehireSaving}
                isRehire={true}
            />
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
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleScroll() {
      onClose();
    }
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [open, onClose])

    const isActive = sortKey === colKey
    const hasFilter = !!activeFilter
    const dropdownStyle = useMemo(() => {
        if (!open || !ref.current) return undefined
        const rect = ref.current.getBoundingClientRect()
        const width = 220;
      let left = right ? rect.right - width : rect.left;
      if (left + width > window.innerWidth) {
        left = window.innerWidth - width - 8;
      }
      if (left < 8) {
        left = 8;
      }
      return { top: rect.bottom + 4, left: left, width: `${width}px` };
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
        <th className={`px-6 py-4 ${right ? 'text-right' : ''} ${className} relative`} ref={ref as any}>
            <div className={`flex items-center gap-1 font-semibold ${center ? 'justify-center' : right ? 'justify-end' : 'justify-start'}`}>
                <span className="select-none">{label}</span>
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
                    className="fixed bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] min-w-[220px] text-left text-sm text-gray-700 normal-case"
                    style={dropdownStyle}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="px-3 py-2 space-y-1">
                        <button
                            onClick={() => onSort(colKey, true)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${isActive && sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'}`}
                        >
                            <ArrowUp className="w-4 h-4" />
                            {dict.sortAsc}
                        </button>
                        <button
                            onClick={() => onSort(colKey, false)}
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
                            value={filterSearch}
                            onChange={e => setFilterSearch(e.target.value)}
                            placeholder={dict.filterPlaceholder}
                            className="w-full mb-2 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <button
                            onClick={toggleAll}
                            className="text-xs text-blue-600 hover:text-blue-800 mb-1 cursor-pointer font-medium"
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
                            {filteredValues.length === 0 && (
                                <div className="text-xs text-gray-400 text-center py-2">No results</div>
                            )}
                        </div>

                        <div className="flex justify-between items-center gap-2 mt-3 pt-2 border-t border-gray-100">
                            <button
                                onClick={onClear}
                                className="text-xs text-gray-550 hover:text-gray-700 cursor-pointer font-medium"
                            >
                                {dict.clearFilters}
                            </button>
                            <button
                                onClick={handleApply}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </th>
    )
}
