'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffMember, HRStaffSalaryHistory, HRDepartment, HRPosition } from '@/types/human-resources'
import { StaffModal } from '@/components/human-resources/StaffModal'
import CircularLoader from '@/components/CircularLoader'
import {
    Users, Search, X, TrendingDown, ArrowLeft, Building2, Folders, UserPlus, Undo2, Ban
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSettings } from '@/contexts/SettingsContext'

export default function StaffArchivePage() {
    const { language } = useSettings()
    const [loading, setLoading] = useState(true)
    const [archivedStaff, setArchivedStaff] = useState<(HRStaffMember & { departureRecord?: HRStaffSalaryHistory })[]>([])
    const [search, setSearch] = useState('')
    const [filterType, setFilterType] = useState('all')
    const router = useRouter()

    const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
    const [departments, setDepartments] = useState<HRDepartment[]>([])
    const [positions, setPositions] = useState<HRPosition[]>([])
    
    const [rehireModalOpen, setRehireModalOpen] = useState(false)
    const [rehireStaff, setRehireStaff] = useState<HRStaffMember | null>(null)
    const [rehireSaving, setRehireSaving] = useState(false)

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
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
                // Map departure record to staff (take the most recent one for each staff)
                const merged = staffData.map(staff => {
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

            const { data: bData } = await supabase.from('provider_branches').select('id, name')
            if (bData) setBranches(bData)
            const { data: dData } = await supabase.from('hr_departments').select('*')
            if (dData) setDepartments(dData)
            const { data: pData } = await supabase.from('hr_positions').select('*')
            if (pData) setPositions(pData)
            
        } catch (err) {
            console.error(err)
        }
        setLoading(false)
    }, [])

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

    const filtered = useMemo(() => {
        return archivedStaff.filter(s => {
            if (search) {
                const q = search.toLowerCase()
                if (!s.full_name.toLowerCase().includes(q) && !(s.position || '').toLowerCase().includes(q)) return false
            }
            if (filterType !== 'all') {
                if (!s.departureRecord || s.departureRecord.record_type !== filterType) return false
            }
            return true
        })
    }, [archivedStaff, search, filterType])

    if (loading) return <div className="min-h-screen flex items-center justify-center"><CircularLoader /></div>

    const getDepartureTypeLabel = (type: string) => {
        if (language === 'vi') {
            if (type === 'resignation') return 'Xin thôi việc'
            if (type === 'rejection') return 'Từ chối thử việc'
            return 'Sa thải'
        }
        if (type === 'resignation') return 'Resignation'
        if (type === 'rejection') return 'Probation Rejected'
        return 'Dismissal'
    }

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
                    <select value={filterType} onChange={e => setFilterType(e.target.value)}
                        className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none">
                        <option value="all">{language === 'vi' ? 'Tất cả hình thức' : 'All Types'}</option>
                        <option value="resignation">{language === 'vi' ? 'Xin thôi việc' : 'Resignations'}</option>
                        <option value="dismissal">{language === 'vi' ? 'Sa thải' : 'Dismissals'}</option>
                        <option value="rejection">{language === 'vi' ? 'Từ chối thử việc' : 'Probation Rejections'}</option>
                    </select>
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
                                    <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                                        {language === 'vi' ? 'Nhân viên' : 'Staff Member'}
                                    </th>
                                    <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                                        {language === 'vi' ? 'Chức vụ' : 'Position'}
                                    </th>
                                    <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                                        {language === 'vi' ? 'Ngày nghỉ việc' : 'Departure Date'}
                                    </th>
                                    <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                                        {language === 'vi' ? 'Hình thức' : 'Type'}
                                    </th>
                                    <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                                        {language === 'vi' ? 'Lý do' : 'Reason'}
                                    </th>
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
                                                        <span className="text-sm font-bold text-gray-900 block truncate">{s.full_name}</span>
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
                                                            setRehireStaff(s)
                                                            setRehireModalOpen(true)
                                                        }}
                                                        title={language === 'vi' ? 'Tuyển dụng lại' : 'Re-Hire'}
                                                        className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 transition-colors relative z-10"
                                                    >
                                                        <UserPlus className="w-4 h-4" />
                                                    </button>

                                                    {/* Blacklist placeholder */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            const blacklistText = language === 'vi' ? 'Tính năng Danh sách đen sắp ra mắt.' : 'Blacklist feature coming soon.'
                                                            alert(blacklistText)
                                                        }}
                                                        title={language === 'vi' ? 'Danh sách đen' : 'Blacklist'}
                                                        className="p-1.5 rounded-lg bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors relative z-10"
                                                    >
                                                        <Ban className="w-4 h-4" />
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
