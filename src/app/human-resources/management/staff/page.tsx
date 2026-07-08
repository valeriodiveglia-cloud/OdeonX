'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffMember, EmploymentType, SalaryType, StaffStatus, HRDepartment, HRPosition, HRRatingCategory } from '@/types/human-resources'
import CircularLoader from '@/components/CircularLoader'
import {
    Users, UserPlus, Search, X, Pencil, Trash2,
    Briefcase, Clock, Building2, ChevronDown, ChevronRight, Folders, CheckCircle,
    ArrowUp, ArrowDown, Filter, MoreVertical, FileDown, Star
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import PerformanceModal from '@/components/human-resources/PerformanceModal'
import SalaryModal from '@/components/human-resources/SalaryModal'
import { StaffModal } from '@/components/human-resources/StaffModal'
import { saveAs } from 'file-saver'
import { useSettings } from '@/contexts/SettingsContext'

/* ─── Helpers ─── */
const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)

const getEmploymentLabel = (type: EmploymentType, language: 'en' | 'vi') => {
    const labels: Record<EmploymentType, { en: string; vi: string }> = {
        full_time: { en: 'Full-time', vi: 'Toàn thời gian' },
        part_time: { en: 'Part-time', vi: 'Bán thời gian' },
        outsourced: { en: 'Outsourced', vi: 'Thuê ngoài' },
    }
    return labels[type]?.[language] || type
}

const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
    full_time: 'Full-time',
    part_time: 'Part-time',
    outsourced: 'Outsourced',
}

const SALARY_LABEL: Record<SalaryType, string> = {
    fixed: '/month',
    hourly: '/hour',
}

const BranchCell = ({ branchNames }: { branchNames: string[] }) => {
    const { language } = useSettings()
    const [isExpanded, setIsExpanded] = useState(false)
    if (branchNames.length === 0) return <span className="text-[11px] text-gray-400 italic">{language === 'vi' ? 'Chưa phân công' : 'Not assigned'}</span>
    
    if (branchNames.length <= 2 || isExpanded) {
        return (
            <div className="flex flex-wrap gap-1">
                {branchNames.map((name, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200/80 bg-slate-50 text-[10px] font-semibold text-slate-500">
                        <Building2 className="w-2.5 h-2.5 text-slate-400" />
                        {name}
                    </span>
                ))}
                {isExpanded && branchNames.length > 2 && (
                    <button onClick={(e) => { e.stopPropagation(); setIsExpanded(false) }} className="text-[9px] font-bold text-blue-600 hover:text-blue-700 ml-1">
                        {language === 'vi' ? 'Thu gọn' : 'Show less'}
                    </button>
                )}
            </div>
        )
    }

    return (
        <div className="flex flex-wrap gap-1 items-center">
            {branchNames.slice(0, 2).map((name, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200/80 bg-slate-50 text-[10px] font-semibold text-slate-500">
                    <Building2 className="w-2.5 h-2.5 text-slate-400" />
                    {name}
                </span>
            ))}
            <button 
                onClick={(e) => { e.stopPropagation(); setIsExpanded(true) }}
                className="inline-flex items-center px-1.5 py-0.5 rounded border border-blue-200/80 bg-blue-50 text-[10px] font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
            >
                +{branchNames.length - 2} {language === 'vi' ? 'thêm' : 'more'}
            </button>
        </div>
    )
}

/* ─── Delete Confirm ─── */

function DeleteConfirm({ name, onConfirm, onCancel, deleting }: {
    name: string; onConfirm: () => void; onCancel: () => void; deleting: boolean
}) {
    const { language } = useSettings()
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {language === 'vi' ? 'Xóa Nhân Viên' : 'Delete Staff Member'}
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                    {language === 'vi' ? (
                        <>Bạn có chắc chắn muốn xóa <strong>{name}</strong>? Hành động này không thể hoàn tác.</>
                    ) : (
                        <>Are you sure you want to delete <strong>{name}</strong>? This action cannot be undone.</>
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

/* ─── Main Page ─── */

export default function StaffListPage() {
    const { language } = useSettings()
    const [loading, setLoading]       = useState(true)
    const [staff, setStaff]           = useState<HRStaffMember[]>([])
    const [branches, setBranches]     = useState<{ id: string; name: string }[]>([])
    const [branchMap, setBranchMap]   = useState<Record<string, string>>({})
    const [departments, setDepartments] = useState<HRDepartment[]>([])
    const [positions, setPositions]     = useState<HRPosition[]>([])
    const [allCategories, setAllCategories] = useState<HRRatingCategory[]>([])
    const router = useRouter()

    // Filters
    const [search, setSearch]         = useState('')

    // Column Header state
    type SortKey = 'name' | 'department' | 'position' | 'branch' | 'type' | 'status' | 'salary' | 'skill';
    const [sortKey, setSortKey] = useState<SortKey>('name')
    const [sortAsc, setSortAsc] = useState(true)
    const [columnFilters, setColumnFilters] = useState<Record<string, Set<string> | null>>({})
    const [openMenu, setOpenMenu] = useState<SortKey | null>(null)

    function applySort(k: SortKey, asc: boolean) {
        setSortKey(k); setSortAsc(asc); setOpenMenu(null)
    }
    function applyColumnFilter(col: SortKey, vals: Set<string> | null) {
        setColumnFilters(prev => ({ ...prev, [col]: vals })); setOpenMenu(null)
    }
    function clearColumnFilter(col: SortKey) {
        setColumnFilters(prev => { const n = { ...prev }; delete n[col]; return n }); setOpenMenu(null)
    }

    // Modal
    const [modalOpen, setModalOpen]   = useState(false)
    const [editingStaff, setEditingStaff] = useState<HRStaffMember | null>(null)
    const [saving, setSaving]         = useState(false)

    // Delete
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)

    // Performance Modal for Probation
    const [perfModalOpen, setPerfModalOpen] = useState(false)
    const [perfStaffId, setPerfStaffId] = useState<string | null>(null)
    const [perfSaving, setPerfSaving] = useState(false)

    // Rejection Modal
    const [dismissalModalOpen, setDismissalModalOpen] = useState(false)
    const [dismissalStaffId, setDismissalStaffId] = useState<string | null>(null)
    const [dismissalSaving, setDismissalSaving] = useState(false)

    // Tanca & Skill Level Prompt for onboarded staff
    const [pendingStaff, setPendingStaff] = useState<HRStaffMember[]>([])
    const [showWarningPopup, setShowWarningPopup] = useState(false)
    const [showConfigModal, setShowConfigModal] = useState(false)
    const [remindLater, setRemindLater] = useState(false)
    const [savingPending, setSavingPending] = useState(false)
    const [configUpdates, setConfigUpdates] = useState<{ id: string; name: string; staff_code: string; skill_level: number }[]>([])

    useEffect(() => {
        if (showConfigModal && pendingStaff.length > 0) {
            setConfigUpdates(pendingStaff.map(s => ({
                id: s.id,
                name: s.full_name,
                staff_code: s.staff_code || '',
                skill_level: s.skill_level || 1
            })))
        }
    }, [showConfigModal, pendingStaff])

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            const [branchRes, staffRes, deptRes, posRes, catRes] = await Promise.all([
                supabase.from('provider_branches').select('id, name, city').order('name'),
                supabase.from('hr_staff').select('*, hr_staff_branches(*), hr_staff_contracts(*), hr_staff_performance(period)').eq('status', 'active').order('full_name'),
                supabase.from('hr_departments').select('*').order('sort_order'),
                supabase.from('hr_positions').select('*').order('sort_order'),
                supabase.from('hr_rating_categories').select('*').order('sort_order')
            ])

            if (branchRes.data) {
                setBranches(branchRes.data)
                const map: Record<string, string> = {}
                branchRes.data.forEach((b: any) => { map[b.id] = b.name })
                setBranchMap(map)
            }

            if (staffRes.data) {
                const staffList = staffRes.data as HRStaffMember[]
                setStaff(staffList)
                
                // Identify active staff missing staff_code or skill_level (null/0)
                const incomplete = staffList.filter(s => 
                    s.status === 'active' && 
                    (!s.staff_code || s.staff_code.trim() === '' || s.skill_level === null || s.skill_level === 0)
                )
                setPendingStaff(incomplete)
            }
            if (deptRes.data) setDepartments(deptRes.data as HRDepartment[])
            if (posRes.data) setPositions(posRes.data as HRPosition[])
            if (catRes.data) setAllCategories(catRes.data as HRRatingCategory[])
        } catch (err) {
            console.error('Error fetching staff data:', err)
        }
        setLoading(false)
    }, [])

    useEffect(() => { fetchAll() }, [fetchAll])

    useEffect(() => {
        if (pendingStaff.length > 0 && !remindLater) {
            setShowWarningPopup(true)
        } else {
            setShowWarningPopup(false)
        }
    }, [pendingStaff, remindLater])

    /* ─── Filtered list ─── */
    const displayValue = useCallback((s: HRStaffMember, key: SortKey): string | string[] => {
        switch (key) {
            case 'name': return s.full_name || '';
            case 'department': return s.department || '';
            case 'position': return s.position || '';
            case 'branch': return (s.hr_staff_branches || []).map(b => branchMap[b.branch_id]).filter(Boolean);
            case 'type': return EMPLOYMENT_LABEL[s.employment_type];
            case 'status': return s.status;
            case 'salary': return String(s.salary_amount);
            case 'skill': return String(s.skill_level || 1);
            default: return '';
        }
    }, [branchMap])

    const columnValues = useMemo(() => {
        const map: Record<string, string[]> = {}
        const keys: SortKey[] = ['name', 'department', 'position', 'branch', 'type', 'status', 'salary', 'skill']
        keys.forEach(k => {
            const set = new Set<string>()
            staff.forEach(s => { 
                const v = displayValue(s, k)
                if (Array.isArray(v)) {
                    v.forEach(val => val && set.add(val))
                } else {
                    if (v) set.add(v)
                }
            })
            map[k] = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        })
        return map
    }, [staff, displayValue])

    const filtered = useMemo(() => {
        let out = staff.slice()
        if (search) {
            const q = search.toLowerCase()
            out = out.filter(s =>
                (s.full_name || '').toLowerCase().includes(q) ||
                (s.position || '').toLowerCase().includes(q) ||
                (s.department || '').toLowerCase().includes(q)
            )
        }
        for (const [col, allowed] of Object.entries(columnFilters)) {
            if (!allowed) continue
            out = out.filter(s => {
                const v = displayValue(s, col as SortKey)
                if (Array.isArray(v)) {
                    if (v.length === 0) return allowed.has('');
                    return v.some(val => allowed.has(val))
                } else {
                    return allowed.has(v)
                }
            })
        }
        out.sort((a, b) => {
            let av: any, bv: any
            switch(sortKey) {
                case 'name': av = a.full_name; bv = b.full_name; break;
                case 'department': av = a.department; bv = b.department; break;
                case 'position': av = a.position; bv = b.position; break;
                case 'type': av = EMPLOYMENT_LABEL[a.employment_type]; bv = EMPLOYMENT_LABEL[b.employment_type]; break;
                case 'status': av = a.status; bv = b.status; break;
                case 'salary': av = a.salary_amount; bv = b.salary_amount; break;
                case 'skill': av = a.skill_level || 1; bv = b.skill_level || 1; break;
                case 'branch': 
                    av = (a.hr_staff_branches || []).map(br => branchMap[br.branch_id]).filter(Boolean).join(', ');
                    bv = (b.hr_staff_branches || []).map(br => branchMap[br.branch_id]).filter(Boolean).join(', ');
                    break;
                default: av = ''; bv = '';
            }
            let cmp: number
            if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
            else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
            return sortAsc ? cmp : -cmp
        })
        return out
    }, [staff, search, sortKey, sortAsc, columnFilters, displayValue, branchMap])


    /* ─── Summary cards ─── */
    const filteredFullTime = filtered.filter(s => s.employment_type === 'full_time')
    const totalFT       = filteredFullTime.length
    const totalPT       = filtered.filter(s => s.employment_type === 'part_time').length
    const totalOS       = filtered.filter(s => s.employment_type === 'outsourced').length
    const totalFTSalary = filteredFullTime.reduce((sum, s) => sum + Number(s.salary_amount || 0), 0)

    const isFiltered = filtered.length !== staff.length;

    const summaryCards = [
        { 
            label: isFiltered 
                ? (language === 'vi' ? 'Nhân viên (Bộ lọc)' : 'Staff (Filtered)') 
                : (language === 'vi' ? 'Tổng Nhân viên' : 'Total Staff'),   
            value: filtered.length,  
            icon: Users,     
            color: 'text-blue-600',    
            bg: 'bg-blue-50' 
        },
        { 
            label: isFiltered 
                ? (language === 'vi' ? 'Lương FT (Bộ lọc)' : 'FT Salary (Filtered)') 
                : (language === 'vi' ? 'Tổng Lương FT' : 'Total FT Salary'),
            value: `${fmt(totalFTSalary)} VND`, 
            icon: Briefcase, 
            color: 'text-emerald-600', 
            bg: 'bg-emerald-50' 
        },
        { 
            label: language === 'vi' ? 'Toàn thời gian' : 'Full-time',     
            value: totalFT,        
            icon: Briefcase, 
            color: 'text-indigo-600',  
            bg: 'bg-indigo-50' 
        },
        { 
            label: language === 'vi' ? 'Bán thời gian/Thuê ngoài' : 'PT/Outsourced',     
            value: totalPT + totalOS,        
            icon: Clock,     
            color: 'text-amber-600',   
            bg: 'bg-amber-50' 
        },
    ]

    /* ─── Save handler ─── */
    const handleSave = async (data: Partial<HRStaffMember>, branchIds: string[]) => {
        setSaving(true)
        try {
            if (editingStaff) {
                // Update
                const { error } = await supabase.from('hr_staff').update(data).eq('id', editingStaff.id)
                if (error) throw error

                // Rebuild branch assignments
                await supabase.from('hr_staff_branches').delete().eq('staff_id', editingStaff.id)
                if (branchIds.length > 0) {
                    const rows = branchIds.map(bid => ({
                        staff_id: editingStaff.id,
                        branch_id: bid,
                        is_primary: false,
                    }))
                    const { error: brErr } = await supabase.from('hr_staff_branches').insert(rows)
                    if (brErr) throw brErr
                }
            } else {
                // Create
                const { data: newStaff, error } = await supabase.from('hr_staff').insert([data]).select().single()
                if (error) throw error

                if (branchIds.length > 0 && newStaff) {
                    const rows = branchIds.map(bid => ({
                        staff_id: newStaff.id,
                        branch_id: bid,
                        is_primary: false,
                    }))
                    const { error: brErr } = await supabase.from('hr_staff_branches').insert(rows)
                    if (brErr) throw brErr
                }
            }

            setModalOpen(false)
            setEditingStaff(null)
            await fetchAll()
        } catch (err) {
            console.error('Error saving staff:', err)
            alert('Failed to save staff member')
        }
        setSaving(false)
    }

    const handleSavePendingStaff = async (updates: { id: string; staff_code: string; skill_level: number }[]) => {
        setSavingPending(true)
        try {
            const tancaCodes = updates.map(u => u.staff_code.trim()).filter(Boolean)
            if (tancaCodes.length > 0) {
                const duplicatesInInput = tancaCodes.filter((item, index) => tancaCodes.indexOf(item) !== index)
                if (duplicatesInInput.length > 0) {
                    alert(language === 'vi' 
                        ? `Trùng lặp mã nhân viên Tanca trong danh sách nhập: ${duplicatesInInput.join(', ')}` 
                        : `Duplicate Tanca staff codes in input list: ${duplicatesInInput.join(', ')}`)
                    setSavingPending(false)
                    return
                }

                const { data: dbDup, error: dbDupErr } = await supabase
                    .from('hr_staff')
                    .select('id, full_name, staff_code')
                    .in('staff_code', tancaCodes)
                
                if (!dbDupErr && dbDup && dbDup.length > 0) {
                    const actualDups = dbDup.filter(d => !updates.some(u => u.id === d.id && u.staff_code.trim() === d.staff_code))
                    if (actualDups.length > 0) {
                        const dupNames = actualDups.map(d => `"${d.full_name}" (${d.staff_code})`).join(', ')
                        alert(language === 'vi'
                            ? `Mã Tanca đã được sử dụng bởi: ${dupNames}`
                            : `Tanca codes already in use by: ${dupNames}`)
                        setSavingPending(false)
                        return
                    }
                }
            }

            const successfulUpdates: { id: string; original_code: string | null; original_level: number | null }[] = []
            
            for (const u of updates) {
                const orig = staff.find(s => s.id === u.id)
                const original_code = orig ? (orig.staff_code || null) : null
                const original_level = orig ? (orig.skill_level || null) : null
                
                const { error } = await supabase
                    .from('hr_staff')
                    .update({
                        staff_code: u.staff_code.trim() || null,
                        skill_level: u.skill_level
                    })
                    .eq('id', u.id)
                
                if (error) {
                    for (const su of successfulUpdates) {
                        await supabase
                            .from('hr_staff')
                            .update({
                                staff_code: su.original_code,
                                skill_level: su.original_level
                            })
                            .eq('id', su.id)
                    }
                    throw new Error(`Failed to update ${orig?.full_name || u.id}: ${error.message}`)
                } else {
                    successfulUpdates.push({ id: u.id, original_code, original_level })
                }
            }

            setShowConfigModal(false)
            await fetchAll()
            alert(language === 'vi' ? 'Cập nhật thành công!' : 'Updates saved successfully!')
        } catch (err: any) {
            console.error('Error saving pending staff:', err)
            alert(language === 'vi' ? `Lỗi khi lưu: ${err.message}` : `Error saving: ${err.message}`)
        }
        setSavingPending(false)
    }

    /* ─── Delete handler ─── */
    const handleDelete = async () => {
        if (!deletingId) return
        setDeleteLoading(true)
        try {
            const { error } = await supabase.from('hr_staff').delete().eq('id', deletingId)
            if (error) throw error
            setDeletingId(null)
            await fetchAll()
        } catch (err) {
            console.error('Error deleting staff:', err)
            alert('Failed to delete staff member')
        }
        setDeleteLoading(false)
    }

    /* ─── Performance Review (Probation) ─── */
    const handleSavePerformance = async (data: any, decision?: 'confirm' | 'reject') => {
        setPerfSaving(true)
        try {
            const { error } = await supabase.from('hr_staff_performance').insert([data])
            if (error) throw error
            
            if (decision === 'reject') {
                setPerfModalOpen(false)
                setDismissalStaffId(data.staff_id)
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

    const handleResign = async (data: { staffId: string, effectiveDate: string, type: 'dismissal' | 'resignation' | 'rejection', reason: string, notes: string }) => {
        setDismissalSaving(true)
        try {
            const { error: histErr } = await supabase.from('hr_staff_role_history').insert([{
                staff_id: data.staffId,
                effective_date: data.effectiveDate,
                reason: `[${data.type.toUpperCase()}] ${data.reason}`,
                notes: data.notes,
                created_by: null // Or loggedUserName
            }])
            if (histErr) throw histErr
            
            const { error: staffErr } = await supabase.from('hr_staff').update({ status: 'terminated' }).eq('id', data.staffId)
            if (staffErr) throw staffErr
            
            setDismissalModalOpen(false)
            await fetchAll()
        } catch (err: any) {
            console.error(err)
            alert('Failed to record rejection: ' + (err.message || JSON.stringify(err)))
        }
        setDismissalSaving(false)
    }

    /* ─── Export to Excel ─── */
    const handleExport = async () => {
        const ExcelJS = (await import('exceljs')).default

        const workbook = new ExcelJS.Workbook()
        const ftSheet = workbook.addWorksheet('Full-Time')
        const ptSheet = workbook.addWorksheet('Part-Time')
        const osSheet = workbook.addWorksheet('Outsourced')

        const baseColumns = [
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Department', key: 'dept', width: 20 },
            { header: 'Position', key: 'pos', width: 20 },
            { header: 'Branch', key: 'branch', width: 30 },
            { header: 'Type', key: 'type', width: 15 },
            { header: 'Status', key: 'status', width: 15 },
        ]

        ftSheet.columns = [
            ...baseColumns,
            { header: 'Salary (VND/Month)', key: 'salary', width: 20, style: { numFmt: '#,##0' } }
        ]
        
        ptSheet.columns = [
            ...baseColumns,
            { header: 'Salary (VND/Hour)', key: 'salary', width: 20, style: { numFmt: '#,##0' } }
        ]
        
        osSheet.columns = [
            ...baseColumns,
            { header: 'Salary (VND/Hour)', key: 'salary', width: 20, style: { numFmt: '#,##0' } }
        ]

        const mapStaffRow = (s: HRStaffMember) => ({
            name: s.full_name,
            dept: s.department || '',
            pos: s.position || '',
            branch: (s.hr_staff_branches || []).map(br => branchMap[br.branch_id]).filter(Boolean).join(', '),
            type: EMPLOYMENT_LABEL[s.employment_type],
            status: s.status.toUpperCase(),
            salary: Number(s.salary_amount || 0)
        })

        const ftStaff = filtered.filter(s => s.employment_type === 'full_time')
        const ptStaff = filtered.filter(s => s.employment_type === 'part_time')
        const osStaff = filtered.filter(s => s.employment_type === 'outsourced')

        ftStaff.forEach(s => ftSheet.addRow(mapStaffRow(s)))
        ptStaff.forEach(s => ptSheet.addRow(mapStaffRow(s)))
        osStaff.forEach(s => osSheet.addRow(mapStaffRow(s)))

        // Formatting headers
        ;[ftSheet, ptSheet, osSheet].forEach(sheet => {
            sheet.getRow(1).font = { bold: true }
            sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }
        })

        // Add total to Full-Time sheet
        const totalFTSalary = ftStaff.reduce((sum, s) => sum + Number(s.salary_amount || 0), 0)
        const totalRow = ftSheet.addRow({
            name: 'TOTAL',
            salary: totalFTSalary
        })
        totalRow.font = { bold: true }

        const buffer = await workbook.xlsx.writeBuffer()
        saveAs(new Blob([buffer]), `Staff_Export_${new Date().toISOString().split('T')[0]}.xlsx`)
    }

    /* ─── Render ─── */
    if (loading) {
        return <div className="min-h-screen flex items-center justify-center"><CircularLoader /></div>
    }

    return (
        <div className="min-h-screen text-gray-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white">
                            {language === 'vi' ? 'Quản Lý Nhân Viên' : 'Staff Management'}
                        </h1>
                        <p className="text-sm text-slate-400 mt-1">
                            {language === 'vi' ? 'Quản lý nhân viên, vị trí, lương và phân công chi nhánh.' : 'Manage staff members, positions, salaries and branch assignments.'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={handleExport}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 border border-white/10 text-sm font-medium text-white hover:bg-slate-700 transition shadow hover:shadow-lg"
                        >
                            <FileDown className="w-4 h-4" />
                            {language === 'vi' ? 'Xuất' : 'Export'}
                        </button>
                        <button
                            onClick={() => { setEditingStaff(null); setModalOpen(true) }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition shadow hover:shadow-lg"
                        >
                            <UserPlus className="w-4 h-4" />
                            {language === 'vi' ? 'Thêm Nhân Viên' : 'Add Staff'}
                        </button>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    {summaryCards.map(c => (
                        <div key={c.label} className="rounded-xl bg-white shadow-sm p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className={`p-1.5 rounded-lg ${c.bg}`}>
                                    <c.icon className={`w-4 h-4 ${c.color}`} />
                                </div>
                                <span className="text-xs text-gray-500">{c.label}</span>
                            </div>
                            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                        </div>
                    ))}
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                    {/* Search */}
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder={language === 'vi' ? 'Tìm kiếm tên, vị trí...' : 'Search name, position…'}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10">
                                <X className="w-3 h-3 text-slate-400" />
                            </button>
                        )}
                    </div>

                    <span className="text-xs text-slate-500 ml-auto mr-2">
                        {filtered.length} {language === 'vi' ? 'trên' : 'of'} {staff.length} {language === 'vi' ? 'được hiển thị' : 'shown'}
                    </span>
                    <button
                        onClick={() => router.push('/human-resources/management/staff-archive')}
                        className="text-sm font-medium text-slate-400 hover:text-white transition flex items-center gap-1.5 shrink-0 border-l border-white/10 pl-4"
                        title={language === 'vi' ? 'Xem Nhân viên Đã Nghỉ việc / Cho thôi việc' : 'View Dismissed & Resigned Staff'}
                    >
                        <Folders className="w-4 h-4" />
                        {language === 'vi' ? 'Lưu trữ' : 'Archive'}
                    </button>
                </div>

                {/* Table */}
                <div className="rounded-2xl bg-white shadow-md overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">#</th>
                                    {([
                                        ['name', language === 'vi' ? 'Họ & Tên' : 'Name'], 
                                        ['department', language === 'vi' ? 'Bộ phận' : 'Department'], 
                                        ['position', language === 'vi' ? 'Vị trí' : 'Position'], 
                                        ['branch', language === 'vi' ? 'Chi nhánh' : 'Branch(es)'], 
                                        ['type', language === 'vi' ? 'Loại' : 'Type', true], 
                                        ['skill', language === 'vi' ? 'Kỹ năng' : 'Skill', true],
                                        ['salary', language === 'vi' ? 'Mức lương (VND)' : 'Salary (VND)', false, true]
                                    ] as [SortKey, string, boolean?, boolean?][]).map(([k, lbl, center, right]) => (
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
                                            center={center} right={right} className="text-xs uppercase tracking-wider text-gray-500"
                                        />
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((s, idx) => {
                                    const branchNames = (s.hr_staff_branches || [])
                                        .map(b => branchMap[b.branch_id])
                                        .filter(Boolean)

                                    return (
                                        <tr 
                                            key={s.id} 
                                            onClick={() => router.push(`/human-resources/management/staff/${s.id}`)}
                                            className={`border-t border-gray-100 hover:bg-gray-50/80 transition-colors cursor-pointer ${idx % 2 === 0 ? 'bg-gray-50/30' : ''}`}
                                        >
                                            <td className="px-4 py-3 text-xs text-gray-400">{idx + 1}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                                        {(s.full_name || '').trim().split(/\s+/).filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="text-xs font-semibold text-gray-900 block truncate">{s.full_name}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{s.department || <span className="text-gray-400 italic">—</span>}</td>
                                            <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{s.position}</td>
                                            <td className="px-4 py-3">
                                                <BranchCell branchNames={branchNames} />
                                            </td>
                                            <td className="px-4 py-3 text-center whitespace-nowrap">
                                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold border
                                                    ${s.employment_type === 'full_time'
                                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                                                        : 'bg-amber-50 text-amber-700 border-amber-100'
                                                    }`}
                                                >
                                                    {getEmploymentLabel(s.employment_type, language)}
                                                </span>
                                            </td>
                                            {/* Status column removed */}
                                            <td className="px-4 py-3 text-center whitespace-nowrap">
                                                <div className="flex items-center justify-center gap-0.5" title={`Skill Level: ${s.skill_level || 1}`}>
                                                    {Array.from({ length: 5 }).map((_, i) => (
                                                        <Star 
                                                            key={i} 
                                                            className={`w-3.5 h-3.5 ${i < (s.skill_level || 1) ? 'text-indigo-500 fill-indigo-500' : 'text-gray-200'}`} 
                                                        />
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs font-mono whitespace-nowrap">
                                                <span className="text-gray-900 font-bold">{fmt(s.salary_amount)}</span>
                                                <span className="text-gray-400 text-[10px] ml-1">
                                                    {s.salary_type === 'fixed' ? (language === 'vi' ? '/tháng' : '/month') : (language === 'vi' ? '/giờ' : '/hour')}
                                                </span>
                                            </td>
                                            {/* Actions column removed */}
                                        </tr>
                                    )
                                })}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-16 text-center">
                                            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                            <p className="text-gray-500 text-sm font-medium">
                                                {staff.length === 0 
                                                    ? (language === 'vi' ? 'Chưa có nhân viên nào' : 'No staff members yet') 
                                                    : (language === 'vi' ? 'Không có kết quả nào phù hợp con bộ lọc' : 'No results match your filters')}
                                            </p>
                                            {staff.length === 0 && (
                                                <button
                                                    onClick={() => { setEditingStaff(null); setModalOpen(true) }}
                                                    className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
                                                >
                                                    {language === 'vi' ? '+ Thêm nhân viên đầu tiên của bạn' : '+ Add your first staff member'}
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

            {/* Modals */}
            <StaffModal
                open={modalOpen}
                onClose={() => { setModalOpen(false); setEditingStaff(null) }}
                onSave={handleSave}
                staff={editingStaff}
                branches={branches}
                departments={departments}
                positions={positions}
                saving={saving}
            />

            {deletingId && (
                <DeleteConfirm
                    name={staff.find(s => s.id === deletingId)?.full_name || ''}
                    onConfirm={handleDelete}
                    onCancel={() => setDeletingId(null)}
                    deleting={deleteLoading}
                />
            )}

            <PerformanceModal 
                open={perfModalOpen} 
                onClose={() => { setPerfModalOpen(false); setPerfStaffId(null) }}
                onSave={handleSavePerformance} 
                review={null} 
                staffList={staff} 
                allCategories={allCategories} 
                saving={perfSaving} 
                preselectedStaffId={perfStaffId} 
                isProbation={true}
            />

            <SalaryModal
                open={dismissalModalOpen}
                onClose={() => { setDismissalModalOpen(false); setDismissalStaffId(null) }}
                onSave={async () => {}}
                onResign={handleResign}
                entry={null}
                staffList={staff}
                departments={departments}
                positions={positions}
                saving={dismissalSaving}
                loggedUserName={""}
                preselectedStaffId={dismissalStaffId || ''}
                isProbationRejection={true}
            />

            {showWarningPopup && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-gray-900 border border-gray-100">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                                <Users className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">
                                {language === 'vi' ? 'Cấu hình Nhân viên mới' : 'New Staff Configuration'}
                            </h3>
                        </div>
                        <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                            {language === 'vi' 
                                ? `Có ${pendingStaff.length} nhân viên đã nhận việc (onboarded) nhưng chưa có Mã nhân viên (Tanca) hoặc Trình độ kỹ năng vận hành. Vui lòng thiết lập ngay.` 
                                : `There are ${pendingStaff.length} onboarded staff members who do not have a Tanca Staff Code and/or Operational Skill Level configured. Please configure them now.`}
                        </p>
                        <div className="bg-slate-50 rounded-xl p-3 max-h-32 overflow-y-auto mb-6 border border-gray-100">
                            <ul className="text-xs text-slate-700 space-y-1.5 font-semibold">
                                {pendingStaff.map(s => (
                                    <li key={s.id} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                                        <span>{s.full_name}</span>
                                        <span className="text-[10px] text-slate-400 font-medium">
                                            {s.position}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button 
                                type="button" 
                                onClick={() => setRemindLater(true)}
                                className="px-4 py-2 text-sm font-semibold text-slate-500 bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100 transition cursor-pointer"
                            >
                                {language === 'vi' ? 'Nhắc tôi sau' : 'Remind me later'}
                            </button>
                            <button 
                                type="button" 
                                onClick={() => {
                                    setShowWarningPopup(false)
                                    setShowConfigModal(true)
                                }}
                                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition cursor-pointer shadow-md shadow-blue-500/10"
                            >
                                {language === 'vi' ? 'Đồng ý' : 'OK'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showConfigModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 text-gray-900 border border-gray-100">
                        <div className="flex items-center justify-between border-b border-gray-150 pb-4 mb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                {language === 'vi' ? 'Cấu hình Mã Tanca & Trình độ Kỹ năng' : 'Configure Tanca Code & Skill Level'}
                            </h3>
                            <button 
                                onClick={() => setShowConfigModal(false)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                            {language === 'vi' 
                                ? 'Vui lòng nhập Mã nhân viên Tanca và chọn Trình độ kỹ năng vận hành cho các nhân viên dưới đây để hoàn tất:' 
                                : 'Please enter the Tanca Staff Code and select the Operational Skill Level for the staff members below to complete onboarding:'}
                        </p>
                        
                        <div className="space-y-4 max-h-[45vh] overflow-y-auto pr-1">
                            {configUpdates.map((item, idx) => {
                                const orig = pendingStaff.find(s => s.id === item.id)
                                const isMissingCode = !orig?.staff_code || orig.staff_code.trim() === ''
                                const isMissingSkill = !orig?.skill_level || orig.skill_level === 0
                                const spanClass = (isMissingCode && isMissingSkill) ? 'sm:col-span-4' : 'sm:col-span-8'

                                return (
                                    <div key={item.id} className="p-4 bg-slate-50 border border-gray-200 rounded-2xl grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                                        <div className="sm:col-span-4">
                                            <div className="font-bold text-gray-900 text-sm">{item.name}</div>
                                            <div className="text-[11px] text-slate-400 font-semibold mt-0.5">
                                                {orig?.position || ''}
                                            </div>
                                        </div>
                                        {isMissingCode && (
                                            <div className={spanClass}>
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                                    {language === 'vi' ? 'Mã NV Tanca *' : 'Tanca Staff Code *'}
                                                </label>
                                                <input 
                                                    required
                                                    value={item.staff_code} 
                                                    onChange={e => {
                                                        const next = [...configUpdates]
                                                        next[idx] = { ...item, staff_code: e.target.value }
                                                        setConfigUpdates(next)
                                                    }}
                                                    placeholder={language === 'vi' ? 'Ví dụ: TC001' : 'e.g. TC001'}
                                                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-10" 
                                                />
                                            </div>
                                        )}
                                        {isMissingSkill && (
                                            <div className={spanClass}>
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                                    {language === 'vi' ? 'Trình độ Kỹ năng *' : 'Skill Level *'}
                                                </label>
                                                <div className="flex items-center gap-1 h-10">
                                                    {[1, 2, 3, 4, 5].map(i => (
                                                        <button
                                                            type="button"
                                                            key={i}
                                                            onClick={() => {
                                                                const next = [...configUpdates]
                                                                next[idx] = { ...item, skill_level: i }
                                                                setConfigUpdates(next)
                                                            }}
                                                            className="p-1 rounded-lg hover:bg-slate-50 transition-all active:scale-95 cursor-pointer"
                                                        >
                                                            <Star 
                                                                className={`w-5 h-5 transition-colors ${
                                                                    i <= item.skill_level 
                                                                        ? 'text-indigo-500 fill-indigo-500' 
                                                                        : 'text-gray-200 hover:text-indigo-300'
                                                                }`} 
                                                            />
                                                        </button>
                                                    ))}
                                                    <span className="text-[11px] font-semibold text-slate-500 ml-1.5 whitespace-nowrap">
                                                        {item.skill_level === 1 && (language === 'vi' ? 'Cơ bản' : 'Basic')}
                                                        {item.skill_level === 2 && 'Lv 2'}
                                                        {item.skill_level === 3 && 'Lv 3'}
                                                        {item.skill_level === 4 && 'Lv 4'}
                                                        {item.skill_level === 5 && (language === 'vi' ? 'Chuyên gia' : 'Expert')}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                            <button 
                                type="button" 
                                onClick={() => setShowConfigModal(false)}
                                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-105 rounded-xl hover:bg-gray-200 border border-gray-200 transition cursor-pointer"
                            >
                                {language === 'vi' ? 'Hủy' : 'Cancel'}
                            </button>
                            <button 
                                type="button" 
                                disabled={savingPending || configUpdates.some(u => {
                                    const orig = pendingStaff.find(s => s.id === u.id)
                                    if (!orig) return false
                                    const isMissingCode = !orig.staff_code || orig.staff_code.trim() === ''
                                    return isMissingCode && !u.staff_code.trim()
                                })}
                                onClick={() => handleSavePendingStaff(configUpdates)}
                                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer shadow-md shadow-blue-500/10"
                            >
                                {savingPending && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                {language === 'vi' ? 'Lưu cấu hình' : 'Save Configuration'}
                            </button>
                        </div>
                    </div>
                </div>
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
                            {filteredValues.length === 0 && (
                                <div className="text-xs text-gray-400 py-1 text-center">—</div>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
                        <button onClick={onClear} className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer font-medium">
                            {dict.clearFilters}
                        </button>
                        <button onClick={handleApply} className="px-3 py-1 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer font-medium">
                            OK
                        </button>
                    </div>
                </div>
            )}
        </th>
    )
}
