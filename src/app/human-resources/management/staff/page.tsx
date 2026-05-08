'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffMember, EmploymentType, SalaryType, StaffStatus, HRDepartment, HRPosition, HRAlertSetting } from '@/types/human-resources'
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
import { HRRatingCategory } from '@/types/human-resources'
import { saveAs } from 'file-saver'

/* ─── Helpers ─── */
const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)

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
    const [isExpanded, setIsExpanded] = useState(false)
    if (branchNames.length === 0) return <span className="text-xs text-gray-400 italic">Not assigned</span>
    
    if (branchNames.length <= 2 || isExpanded) {
        return (
            <div className="flex flex-wrap gap-1">
                {branchNames.map((name, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">
                        <Building2 className="w-3 h-3" />
                        {name}
                    </span>
                ))}
                {isExpanded && branchNames.length > 2 && (
                    <button onClick={(e) => { e.stopPropagation(); setIsExpanded(false) }} className="text-[10px] text-blue-500 hover:underline ml-1">Show less</button>
                )}
            </div>
        )
    }

    return (
        <div className="flex flex-wrap gap-1 items-center">
            {branchNames.slice(0, 2).map((name, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">
                    <Building2 className="w-3 h-3" />
                    {name}
                </span>
            ))}
            <button 
                onClick={(e) => { e.stopPropagation(); setIsExpanded(true) }}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
            >
                +{branchNames.length - 2} more
            </button>
        </div>
    )
}

/* ─── Delete Confirm ─── */

function DeleteConfirm({ name, onConfirm, onCancel, deleting }: {
    name: string; onConfirm: () => void; onCancel: () => void; deleting: boolean
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Staff Member</h3>
                <p className="text-sm text-gray-600 mb-6">
                    Are you sure you want to delete <strong>{name}</strong>? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                        Cancel
                    </button>
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

/* ─── Main Page ─── */

export default function StaffListPage() {
    const [loading, setLoading]       = useState(true)
    const [staff, setStaff]           = useState<HRStaffMember[]>([])
    const [branches, setBranches]     = useState<{ id: string; name: string }[]>([])
    const [branchMap, setBranchMap]   = useState<Record<string, string>>({})
    const [departments, setDepartments] = useState<HRDepartment[]>([])
    const [positions, setPositions]     = useState<HRPosition[]>([])
    const [alertsConfig, setAlertsConfig] = useState<HRAlertSetting[]>([])
    const [allCategories, setAllCategories] = useState<HRRatingCategory[]>([])
    const router = useRouter()

    // Filters
    const [search, setSearch]         = useState('')

    // Column Header state
    type SortKey = 'name' | 'position' | 'branch' | 'type' | 'status' | 'salary' | 'alerts' | 'skill';
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

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            const [branchRes, staffRes, deptRes, posRes, alertsRes, catRes] = await Promise.all([
                supabase.from('provider_branches').select('id, name').order('name'),
                supabase.from('hr_staff').select('*, hr_staff_branches(*), hr_staff_contracts(*), hr_staff_performance(period)').eq('status', 'active').order('full_name'),
                supabase.from('hr_departments').select('*').order('sort_order'),
                supabase.from('hr_positions').select('*').order('sort_order'),
                supabase.from('hr_alert_settings').select('*'),
                supabase.from('hr_rating_categories').select('*').order('sort_order')
            ])

            if (branchRes.data) {
                setBranches(branchRes.data)
                const map: Record<string, string> = {}
                branchRes.data.forEach((b: any) => { map[b.id] = b.name })
                setBranchMap(map)
            }

            if (staffRes.data) setStaff(staffRes.data as HRStaffMember[])
            if (deptRes.data) setDepartments(deptRes.data as HRDepartment[])
            if (posRes.data) setPositions(posRes.data as HRPosition[])
            if (alertsRes.data) setAlertsConfig(alertsRes.data as HRAlertSetting[])
            if (catRes.data) setAllCategories(catRes.data as HRRatingCategory[])
        } catch (err) {
            console.error('Error fetching staff data:', err)
        }
        setLoading(false)
    }, [])

    useEffect(() => { fetchAll() }, [fetchAll])

    /* ─── Filtered list ─── */
    const displayValue = useCallback((s: HRStaffMember, key: SortKey): string | string[] => {
        switch (key) {
            case 'name': return s.full_name || '';
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
        const keys: SortKey[] = ['name', 'position', 'branch', 'type', 'status', 'salary', 'skill']
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
        { label: isFiltered ? 'Staff (Filtered)' : 'Total Staff',   value: filtered.length,  icon: Users,     color: 'text-blue-600',    bg: 'bg-blue-50' },
        { label: isFiltered ? 'FT Salary (Filtered)' : 'Total FT Salary',value: `${fmt(totalFTSalary)} VND`, icon: Briefcase, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: isFiltered ? 'Full-time' : 'Full-time',     value: totalFT,        icon: Briefcase, color: 'text-indigo-600',  bg: 'bg-indigo-50' },
        { label: isFiltered ? 'PT/Outsourced' : 'PT/Outsourced',     value: totalPT + totalOS,        icon: Clock,     color: 'text-amber-600',   bg: 'bg-amber-50' },
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
                        <h1 className="text-2xl font-bold text-white">Staff Management</h1>
                        <p className="text-sm text-slate-400 mt-1">Manage staff members, positions, salaries and branch assignments.</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={handleExport}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 border border-white/10 text-sm font-medium text-white hover:bg-slate-700 transition shadow hover:shadow-lg"
                        >
                            <FileDown className="w-4 h-4" />
                            Export
                        </button>
                        <button
                            onClick={() => { setEditingStaff(null); setModalOpen(true) }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition shadow hover:shadow-lg"
                        >
                            <UserPlus className="w-4 h-4" />
                            Add Staff
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
                            placeholder="Search name, position…"
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

                    <span className="text-xs text-slate-500 ml-auto mr-2">{filtered.length} of {staff.length} shown</span>
                    <button
                        onClick={() => router.push('/human-resources/management/staff-archive')}
                        className="text-sm font-medium text-slate-400 hover:text-white transition flex items-center gap-1.5 shrink-0 border-l border-white/10 pl-4"
                        title="View Dismissed & Resigned Staff"
                    >
                        <Folders className="w-4 h-4" />
                        Archive
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
                                        ['name', 'Name'], 
                                        ['position', 'Position'], 
                                        ['branch', 'Branch(es)'], 
                                        ['type', 'Type', true], 
                                        ['status', 'Status', true], 
                                        ['skill', 'Skill', true],
                                        ['salary', 'Salary (VND)', false, true]
                                    ] as [SortKey, string, boolean?, boolean?][]).map(([k, lbl, center, right]) => (
                                        <ColumnHeader
                                            key={k} colKey={k} label={lbl}
                                            sortKey={sortKey} sortAsc={sortAsc} onSort={applySort}
                                            values={columnValues[k] || []} activeFilter={columnFilters[k] || null}
                                            onFilter={(s) => applyColumnFilter(k, s)} onClear={() => clearColumnFilter(k)}
                                            open={openMenu === k} onToggle={() => setOpenMenu(openMenu === k ? null : k)} onClose={() => setOpenMenu(null)}
                                            dict={{ sortAsc: 'Sort Ascending', sortDesc: 'Sort Descending', selectAll: 'Select All', deselectAll: 'Deselect All', filterPlaceholder: 'Filter...', clearFilters: 'Clear Filters' }}
                                            center={center} right={right} className="text-xs uppercase tracking-wider text-gray-500"
                                        />
                                    ))}
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Alerts</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Actions</th>
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
                                            <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                                        {(s.full_name || '').trim().split(/\s+/).filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="text-sm font-medium text-gray-900 block truncate">{s.full_name}</span>
                                                        {s.department && <span className="text-xs text-gray-400 block">{s.department}</span>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{s.position}</td>
                                            <td className="px-4 py-3">
                                                <BranchCell branchNames={branchNames} />
                                            </td>
                                            <td className="px-4 py-3 text-center whitespace-nowrap">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium
                                                    ${s.employment_type === 'full_time'
                                                        ? 'bg-indigo-50 text-indigo-700'
                                                        : 'bg-amber-50 text-amber-700'
                                                    }`}
                                                >
                                                    {EMPLOYMENT_LABEL[s.employment_type]}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center whitespace-nowrap">
                                                {s.probation_end_date && new Date(s.probation_end_date).getTime() > Date.now() ? (() => {
                                                    const perfs = (s as any).hr_staff_performance;
                                                    const isConfirmed = Array.isArray(perfs) && perfs.some((p: any) => p && p.period === 'Probation Confirmed');
                                                    return (
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                setPerfStaffId(s.id)
                                                                setPerfModalOpen(true)
                                                            }}
                                                            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors cursor-pointer ${
                                                                isConfirmed 
                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                                                    : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
                                                            }`}
                                                        >
                                                            {isConfirmed ? 'Probation Confirmed' : 'Probation'}
                                                        </button>
                                                    )
                                                })() : (
                                                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        Active
                                                    </span>
                                                )}
                                            </td>
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
                                            <td className="px-4 py-3 text-right text-sm font-mono whitespace-nowrap">
                                                <span className="text-gray-900 font-semibold">{fmt(s.salary_amount)}</span>
                                                <span className="text-gray-400 text-xs ml-1">{SALARY_LABEL[s.salary_type]}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {(() => {
                                                    const alerts: {type: string, text: string}[] = [];

                                                    alertsConfig.forEach(cfg => {
                                                        // Check scope
                                                        let matchesScope = false;
                                                        if (cfg.scope === 'global') matchesScope = true;
                                                        else if (cfg.scope === 'department' && s.department_id === cfg.scope_id) matchesScope = true;
                                                        else if (cfg.scope === 'position' && s.position_id === cfg.scope_id) matchesScope = true;

                                                        if (!matchesScope) return;

                                                        let targetDateStr: string | null | undefined = null;
                                                        const contracts = s.hr_staff_contracts || [];
                                                        const latestContract = contracts.length > 0 
                                                            ? contracts.reduce((prev, curr) => (prev.version > curr.version) ? prev : curr) 
                                                            : null;

                                                        if (cfg.target_field === 'start_date') targetDateStr = s.start_date;
                                                        else if (cfg.target_field === 'probation_end_date') targetDateStr = s.probation_end_date;
                                                        else if (cfg.target_field === 'contract_expiration_date') targetDateStr = latestContract?.expiration_date;
                                                        else if (cfg.target_field === 'contract_signing_date') targetDateStr = latestContract?.signing_date;
                                                        else if (cfg.target_field === 'last_status_change') targetDateStr = s.updated_at;

                                                        if (!targetDateStr) return;

                                                        const tDate = new Date(targetDateStr).getTime();
                                                        const diffDays = (tDate - Date.now()) / (1000 * 3600 * 24);
                                                        const daysThreshold = cfg.days || 0;

                                                        let shouldTrigger = false;
                                                        let alertStartDate = 0;
                                                        if (cfg.condition_type === 'before') {
                                                            shouldTrigger = diffDays <= daysThreshold;
                                                            alertStartDate = tDate - (daysThreshold * 1000 * 3600 * 24);
                                                        } else if (cfg.condition_type === 'after') {
                                                            shouldTrigger = (-diffDays) >= daysThreshold;
                                                            alertStartDate = tDate + (daysThreshold * 1000 * 3600 * 24);
                                                        }

                                                        if (shouldTrigger && cfg.deactivate_trigger) {
                                                            let deactDateStr: string | null | undefined = null;
                                                            if (cfg.deactivate_trigger === 'start_date') deactDateStr = s.start_date;
                                                            else if (cfg.deactivate_trigger === 'probation_end_date') deactDateStr = s.probation_end_date;
                                                            else if (cfg.deactivate_trigger === 'contract_expiration_date') deactDateStr = latestContract?.expiration_date;
                                                            else if (cfg.deactivate_trigger === 'contract_signing_date') deactDateStr = latestContract?.signing_date;
                                                            else if (cfg.deactivate_trigger === 'last_status_change') deactDateStr = s.updated_at;

                                                            if (deactDateStr) {
                                                                const dDate = new Date(deactDateStr).getTime();
                                                                // If the trigger field was updated at/after the alert started, deactivate the alert.
                                                                if (dDate >= alertStartDate) {
                                                                    shouldTrigger = false;
                                                                }
                                                            }
                                                        }
                                                        
                                                        if (shouldTrigger) {
                                                            let type = 'warning';
                                                            if (diffDays < 0 && (cfg.target_field === 'probation_end_date' || cfg.target_field === 'contract_expiration_date')) {
                                                                type = cfg.target_field === 'contract_expiration_date' ? 'danger' : 'info';
                                                            } else if (cfg.target_field === 'start_date' || cfg.target_field === 'last_status_change') {
                                                                type = 'info';
                                                            }
                                                            alerts.push({ type, text: cfg.label });
                                                        }
                                                    });

                                                    if (alerts.length === 0) {
                                                        return <span className="text-gray-400 italic text-xs">—</span>;
                                                    }

                                                    return (
                                                        <div className="flex flex-col gap-1 items-center">
                                                            {alerts.map((a, i) => (
                                                                <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap
                                                                    ${a.type === 'danger' ? 'bg-red-50 text-red-700' : ''}
                                                                    ${a.type === 'warning' ? 'bg-amber-50 text-amber-700' : ''}
                                                                    ${a.type === 'info' ? 'bg-blue-50 text-blue-700' : ''}
                                                                `}>
                                                                    {a.text}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setDeletingId(s.id)
                                                        }}
                                                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition relative z-10"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-16 text-center">
                                            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                            <p className="text-gray-500 text-sm font-medium">
                                                {staff.length === 0 ? 'No staff members yet' : 'No results match your filters'}
                                            </p>
                                            {staff.length === 0 && (
                                                <button
                                                    onClick={() => { setEditingStaff(null); setModalOpen(true) }}
                                                    className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
                                                >
                                                    + Add your first staff member
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
