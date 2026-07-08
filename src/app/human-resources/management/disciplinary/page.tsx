'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Plus, Loader2, Trash2, Pencil, X, CheckCircle, ChevronLeft, ChevronRight, CalendarDays, User, Search, FileDown, Flag, AlertTriangle, Award, ArrowUp, ArrowDown, Filter, MoreVertical } from 'lucide-react'
import { saveAs } from 'file-saver'
import { supabase } from '@/lib/supabase_shim'
import { HRDisciplinaryCatalog, HRAwardsCatalog, HRStaffFine, HRStaffAward, HRStaffWarning, HRStaffMember, WarningFlagType } from '@/types/human-resources'
import { useSettings } from '@/contexts/SettingsContext'
import { getCurrentUserPermissions } from '@/lib/user-branches'

const fmtVND = (n: number | null) => {
    if (n === null || isNaN(n)) return '0'
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
}

const fmtDate = (d: string) => {
    if (!d) return ''
    const [y, m, day] = d.split('-')
    return `${day}/${m}/${y}`
}

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

function ExportModal({ 
    type,
    onClose, 
    onExport 
}: { 
    type: 'fines' | 'warnings' | 'awards',
    onClose: () => void, 
    onExport: (range: 'this_month' | 'prev_month' | 'all' | 'custom', start?: string, end?: string) => void 
}) {
    const { language } = useSettings()
    const [range, setRange] = useState<'this_month' | 'prev_month' | 'all' | 'custom'>('this_month')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')

    const getTitle = () => {
        if (type === 'fines') return language === 'vi' ? 'Xuất Tiền Phạt' : 'Export Fines'
        if (type === 'warnings') return language === 'vi' ? 'Xuất Cảnh Cáo' : 'Export Flags'
        return language === 'vi' ? 'Xuất Khen Thưởng' : 'Export Awards'
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{getTitle()}</h3>
                
                <div className="space-y-3 mb-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={range === 'this_month'} onChange={() => setRange('this_month')} className="text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">{language === 'vi' ? 'Tháng Này' : 'This Month'}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={range === 'prev_month'} onChange={() => setRange('prev_month')} className="text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">{language === 'vi' ? 'Tháng Trước' : 'Previous Month'}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={range === 'custom'} onChange={() => setRange('custom')} className="text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">{language === 'vi' ? 'Tùy Chọn Ngày' : 'Custom Dates'}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={range === 'all'} onChange={() => setRange('all')} className="text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">{language === 'vi' ? 'Tất Cả Thời Gian' : 'All Time'}</span>
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
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">{language === 'vi' ? 'Hủy' : 'Cancel'}</button>
                    <button 
                        onClick={() => onExport(range, startDate, endDate)} 
                        disabled={range === 'custom' && (!startDate || !endDate)}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                    >
                        <FileDown className="w-4 h-4" />
                        {language === 'vi' ? 'Xuất' : 'Export'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function DisciplinaryPage() {
    const { language } = useSettings()
    const [activeTab, setActiveTab] = useState<'fines' | 'warnings' | 'awards'>('fines')
    
    // States for Fines
    const [fines, setFines] = useState<(HRStaffFine & { staff?: { id: string, full_name: string } })[]>([])
    const [catalog, setCatalog] = useState<HRDisciplinaryCatalog[]>([])
    
    // States for Warnings
    const [warnings, setWarnings] = useState<(HRStaffWarning & { staff?: { id: string, full_name: string } })[]>([])
    
    // States for Awards
    const [awards, setAwards] = useState<(HRStaffAward & { staff?: { id: string, full_name: string } })[]>([])
    const [awardsCatalog, setAwardsCatalog] = useState<HRAwardsCatalog[]>([])

    const [staffList, setStaffList] = useState<HRStaffMember[]>([])
    const [loading, setLoading] = useState(false)
    const [modalOpen, setModalOpen] = useState(false)
    const [exportModalOpen, setExportModalOpen] = useState(false)
    
    // Editing Node States
    const [editingFine, setEditingFine] = useState<HRStaffFine | null>(null)
    const [editingWarning, setEditingWarning] = useState<HRStaffWarning | null>(null)
    const [editingAward, setEditingAward] = useState<HRStaffAward | null>(null)
    
    const now = new Date()
    const [year, setYear] = useState<number>(now.getFullYear())
    const [month, setMonth] = useState<number>(now.getMonth())

    const [loggedUserName, setLoggedUserName] = useState<string>('')
    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
    const [currentUserBranches, setCurrentUserBranches] = useState<string[] | null>(null)

    // States for sorting and filtering
    type SortKey = 'date' | 'name' | 'infraction' | 'notified_by' | 'source' | 'status' | 'amount' | 'flag_type' | 'reason' | 'award_name';
    const [sortKey, setSortKey] = useState<SortKey>('date')
    const [sortAsc, setSortAsc] = useState(false) // default date descending
    const [columnFilters, setColumnFilters] = useState<Record<string, Set<string> | null>>({})
    const [openMenu, setOpenMenu] = useState<SortKey | null>(null)

    useEffect(() => {
        setSortKey('date')
        setSortAsc(false)
        setColumnFilters({})
        setOpenMenu(null)
    }, [activeTab])

    const dict = useMemo(() => language === 'vi' ? {
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
    }, [language]);

    const applySort = useCallback((k: SortKey, asc: boolean) => {
        setSortKey(k); setSortAsc(asc); setOpenMenu(null)
    }, [])
    const applyColumnFilter = useCallback((col: SortKey, vals: Set<string> | null) => {
        setColumnFilters(prev => ({ ...prev, [col]: vals })); setOpenMenu(null)
    }, [])
    const clearColumnFilter = useCallback((col: SortKey) => {
        setColumnFilters(prev => { const n = { ...prev }; delete n[col]; return n }); setOpenMenu(null)
    }, [])

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
            let userRole = currentUserRole
            let userBranches = currentUserBranches
            if (!userRole) {
                const perms = await getCurrentUserPermissions()
                userRole = perms.role
                userBranches = perms.branches
                setCurrentUserRole(userRole)
                setCurrentUserBranches(userBranches)
            }

            const [finesRes, catRes, staffRes, warningsRes, awardsRes, awardsCatRes] = await Promise.all([
                supabase.from('hr_staff_fines')
                    .select('*, staff:hr_staff(id, full_name, hr_staff_branches(*))')
                    .neq('deduction_source', 'cash')
                    .gte('date', `${year}-${String(month + 1).padStart(2, '0')}-01`)
                    .lte('date', `${year}-${String(month + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`)
                    .order('date', { ascending: false }),
                supabase.from('hr_disciplinary_catalog')
                    .select('*')
                    .order('infraction_name', { ascending: true }),
                supabase.from('hr_staff')
                    .select('*, hr_staff_branches(*)')
                    .eq('status', 'active')
                    .order('full_name', { ascending: true }),
                supabase.from('hr_staff_warnings')
                    .select('*, staff:hr_staff(id, full_name, hr_staff_branches(*))')
                    .gte('date', `${year}-${String(month + 1).padStart(2, '0')}-01`)
                    .lte('date', `${year}-${String(month + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`)
                    .order('date', { ascending: false }),
                supabase.from('hr_staff_awards')
                    .select('*, staff:hr_staff(id, full_name, hr_staff_branches(*))')
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
            if (staffRes.error) throw staffRes.error
            if (warningsRes.error) throw warningsRes.error
            if (awardsRes.error) throw awardsRes.error
            if (awardsCatRes.error) throw awardsCatRes.error

            // Merge fines
            let mappedFines = (finesRes.data || []).map(f => {
                const s = Array.isArray(f.staff) ? f.staff[0] : f.staff
                return { ...f, staff: s }
            })

            // Merge warnings
            let mappedWarnings = (warningsRes.data || []).map(w => {
                const s = Array.isArray(w.staff) ? w.staff[0] : w.staff
                return { ...w, staff: s }
            })

            // Merge awards
            let mappedAwards = (awardsRes.data || []).map(a => {
                const s = Array.isArray(a.staff) ? a.staff[0] : a.staff
                return { ...a, staff: s }
            })

            let filteredStaff = (staffRes.data as any[]) || []

            if (userRole && !['owner', 'admin'].includes(userRole) && userBranches) {
                filteredStaff = filteredStaff.filter(s =>
                    (s.hr_staff_branches || []).some((sb: any) => userBranches.includes(sb.branch_id))
                )
                const allowedStaffIds = new Set(filteredStaff.map(s => s.id))
                mappedFines = mappedFines.filter(f => f.staff && allowedStaffIds.has(f.staff.id))
                mappedWarnings = mappedWarnings.filter(w => w.staff && allowedStaffIds.has(w.staff.id))
                mappedAwards = mappedAwards.filter(a => a.staff && allowedStaffIds.has(a.staff.id))
            }

            setFines(mappedFines)
            setCatalog(catRes.data as HRDisciplinaryCatalog[] || [])
            setStaffList(filteredStaff)
            setWarnings(mappedWarnings)
            setAwards(mappedAwards)
            setAwardsCatalog(awardsCatRes.data as HRAwardsCatalog[] || [])
        } catch (err) {
            console.error('Error fetching data', err)
        } finally {
            setLoading(false)
        }
    }, [year, month, currentUserRole, currentUserBranches])

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
                const { error } = await supabase.from('hr_staff_fines').insert([formData])
                if (error) throw error
            }
            fetchAll()
            setModalOpen(false)
        } catch (err) {
            console.error(err)
            alert(language === 'vi' ? 'Không thể lưu quyết định kỷ luật' : 'Failed to save disciplinary action')
            throw err
        }
    }

    async function handleSaveWarning(formData: Partial<HRStaffWarning>) {
        try {
            if (editingWarning) {
                const { error } = await supabase.from('hr_staff_warnings').update(formData).eq('id', editingWarning.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('hr_staff_warnings').insert([formData])
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
                const { error } = await supabase.from('hr_staff_awards').insert([formData])
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
        if (!window.confirm(language === 'vi' ? 'Bạn có chắc chắn muốn xóa quyết định này không?' : 'Are you sure you want to delete this action?')) return
        try {
            const { error } = await supabase.from('hr_staff_fines').delete().eq('id', id)
            if (error) throw error
            fetchAll()
        } catch (err) {
            console.error(err)
            alert(language === 'vi' ? 'Không thể xóa quyết định kỷ luật' : 'Failed to delete disciplinary action')
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
        if (!window.confirm(language === 'vi' ? 'Bạn có chắc chắn muốn xóa giải thưởng này không?' : 'Are you sure you want to delete this award?')) return
        try {
            const { error } = await supabase.from('hr_staff_awards').delete().eq('id', id)
            if (error) throw error
            fetchAll()
        } catch (err) {
            console.error(err)
            alert(language === 'vi' ? 'Không thể xóa khen thưởng' : 'Failed to delete award')
        }
    }

    // STATUS CHANGE
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

    // EXPORT LOGIC
    const handleExport = async (range: 'this_month' | 'prev_month' | 'all' | 'custom', startDate?: string, endDate?: string) => {
        const ExcelJS = (await import('exceljs')).default
        const dnow = new Date()
        let fileNameSuffix = 'All_Time'

        let finesQuery = supabase.from('hr_staff_fines').select('*, staff:hr_staff(id, full_name, department, position, hr_staff_branches(*))').neq('deduction_source', 'cash')
        let awardsQuery = supabase.from('hr_staff_awards').select('*, staff:hr_staff(id, full_name, department, position, hr_staff_branches(*))').neq('deduction_source', 'cash')

        if (range === 'this_month') {
            const y = dnow.getFullYear()
            const m = String(dnow.getMonth() + 1).padStart(2, '0')
            const start = `${y}-${m}-01`
            const lastDay = new Date(y, dnow.getMonth() + 1, 0).getDate()
            const ldayStr = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
            
            finesQuery = finesQuery.gte('date', start).lte('date', ldayStr)
            awardsQuery = awardsQuery.gte('date', start).lte('date', ldayStr)
            fileNameSuffix = dnow.toLocaleString('default', { month: 'long', year: 'numeric' }).replace(' ', '_')
        } else if (range === 'prev_month') {
            const prev = new Date(dnow.getFullYear(), dnow.getMonth() - 1, 1)
            const y = prev.getFullYear()
            const m = String(prev.getMonth() + 1).padStart(2, '0')
            const lastDay = new Date(y, prev.getMonth() + 1, 0).getDate()
            const ldayStr = `${y}-${m}-${String(lastDay).padStart(2, '0')}`

            finesQuery = finesQuery.gte('date', `${y}-${m}-01`).lte('date', ldayStr)
            awardsQuery = awardsQuery.gte('date', `${y}-${m}-01`).lte('date', ldayStr)
            fileNameSuffix = prev.toLocaleString('default', { month: 'long', year: 'numeric' }).replace(' ', '_')
        } else if (range === 'custom' && startDate && endDate) {
            finesQuery = finesQuery.gte('date', startDate).lte('date', endDate)
            awardsQuery = awardsQuery.gte('date', startDate).lte('date', endDate)
            fileNameSuffix = `${startDate}_to_${endDate}`
        }

        try {
            const [finesRes, awardsRes] = await Promise.all([
                finesQuery.order('date', { ascending: false }),
                awardsQuery.order('date', { ascending: false })
            ])

            if (finesRes.error) throw finesRes.error
            if (awardsRes.error) throw awardsRes.error

            const finesData = finesRes.data || []
            const awardsData = awardsRes.data || []

            let filteredFines = finesData
            let filteredAwards = awardsData
            if (currentUserRole && !['owner', 'admin'].includes(currentUserRole) && currentUserBranches) {
                filteredFines = finesData.filter((f: any) => {
                    const s = Array.isArray(f.staff) ? f.staff[0] : f.staff
                    return s && (s.hr_staff_branches || []).some((sb: any) => currentUserBranches.includes(sb.branch_id))
                })
                filteredAwards = awardsData.filter((a: any) => {
                    const s = Array.isArray(a.staff) ? a.staff[0] : a.staff
                    return s && (s.hr_staff_branches || []).some((sb: any) => currentUserBranches.includes(sb.branch_id))
                })
            }

            // Consolidation map
            const consolidation: Record<string, {
                name: string
                department: string
                position: string
                finesTotal: number
                awardsTotal: number
                netBalance: number
            }> = {}

            // Helper to get or init employee data
            const getOrCreateEmployee = (s: any) => {
                if (!s) return null
                const staffId = s.id
                if (!consolidation[staffId]) {
                    consolidation[staffId] = {
                        name: s.full_name || 'Unknown',
                        department: s.department || '-',
                        position: s.position || '-',
                        finesTotal: 0,
                        awardsTotal: 0,
                        netBalance: 0
                    }
                }
                return consolidation[staffId]
            }

            filteredFines.forEach((fine: any) => {
                const s = Array.isArray(fine.staff) ? fine.staff[0] : fine.staff
                const emp = getOrCreateEmployee(s)
                if (emp) {
                    emp.finesTotal += Number(fine.amount || 0)
                }
            })

            filteredAwards.forEach((award: any) => {
                const s = Array.isArray(award.staff) ? award.staff[0] : award.staff
                const emp = getOrCreateEmployee(s)
                if (emp) {
                    emp.awardsTotal += Number(award.amount || 0)
                }
            })

            // Calculate Net Balance for all entries
            Object.values(consolidation).forEach(emp => {
                emp.netBalance = emp.awardsTotal - emp.finesTotal
            })

            const workbook = new ExcelJS.Workbook()
            const sheet = workbook.addWorksheet(language === 'vi' ? 'Bảng Lương Kỷ Luật & Thưởng' : 'Disciplinary & Awards Payroll')
            
            sheet.columns = [
                { header: language === 'vi' ? 'Tên nhân viên' : 'Staff Name', key: 'name', width: 25 },
                { header: language === 'vi' ? 'Bộ phận' : 'Department', key: 'department', width: 20 },
                { header: language === 'vi' ? 'Vị trí' : 'Position', key: 'position', width: 20 },
                { header: language === 'vi' ? 'Tổng tiền phạt (-) VND' : 'Total Fines (-) VND', key: 'finesTotal', width: 22, style: { numFmt: '#,##0' } },
                { header: language === 'vi' ? 'Tổng khen thưởng (+) VND' : 'Total Awards (+) VND', key: 'awardsTotal', width: 22, style: { numFmt: '#,##0' } },
                { header: language === 'vi' ? 'Tổng cộng thực nhận (VND)' : 'Net Payroll Balance (VND)', key: 'netBalance', width: 25, style: { numFmt: '#,##0' } }
            ]

            sheet.getRow(1).font = { bold: true }
            sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }

            Object.values(consolidation).forEach(emp => {
                sheet.addRow(emp)
            })

            const buffer = await workbook.xlsx.writeBuffer()
            saveAs(new Blob([buffer]), `Disciplinary_Payroll_Export_${fileNameSuffix}.xlsx`)
        } catch (err) {
            console.error('Error during payroll export', err)
            alert('Failed to export payroll data')
        }

        setExportModalOpen(false)
    }

    const columnValues = useMemo(() => {
        const map: Record<string, string[]> = {}
        
        if (activeTab === 'fines') {
            const keys: SortKey[] = ['date', 'name', 'infraction', 'notified_by', 'source', 'status', 'amount']
            keys.forEach(k => {
                const set = new Set<string>()
                fines.forEach(f => {
                    let val = ''
                    switch (k) {
                        case 'date': val = fmtDate(f.date); break;
                        case 'name': val = f.staff?.full_name || (language === 'vi' ? 'Không xác định' : 'Unknown'); break;
                        case 'infraction': val = f.infraction || ''; break;
                        case 'notified_by': val = f.notified_by || ''; break;
                        case 'source': 
                            val = f.deduction_source === 'salary' ? (language === 'vi' ? 'Khấu trừ lương gộp' : 'Gross salary deduction') :
                                  f.deduction_source === 'service_charge' ? (language === 'vi' ? 'Khấu trừ phí phục vụ' : 'Service charge deduction') :
                                  f.deduction_source === 'cash' ? (language === 'vi' ? 'Tiền mặt/Chuyển khoản' : 'Direct cash/transfer') :
                                  (f.deduction_source || '-').replace('_', ' ');
                            break;
                        case 'status': 
                            val = f.status === 'paid' ? (language === 'vi' ? 'ĐÃ NỘP' : 'PAID') : 
                                  f.status === 'waived' ? (language === 'vi' ? 'ĐƯỢC MIỄN' : 'WAIVED') :
                                  f.status === 'disputed' ? (language === 'vi' ? 'ĐANG TRANH CHẤP' : 'DISPUTED') :
                                  (language === 'vi' ? 'CHỜ XỬ LÝ' : 'PENDING');
                            break;
                        case 'amount': val = fmtVND(f.amount); break;
                    }
                    if (val !== undefined && val !== null) set.add(val)
                })
                map[k] = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            })
        } else if (activeTab === 'warnings') {
            const keys: SortKey[] = ['date', 'name', 'flag_type', 'reason', 'notified_by']
            keys.forEach(k => {
                const set = new Set<string>()
                warnings.forEach(w => {
                    let val = ''
                    switch (k) {
                        case 'date': val = fmtDate(w.date); break;
                        case 'name': val = w.staff?.full_name || (language === 'vi' ? 'Không xác định' : 'Unknown'); break;
                        case 'flag_type': 
                            val = w.flag_type === 'green' ? (language === 'vi' ? 'Ghi chú tích cực' : 'Positive Note') :
                                  w.flag_type === 'yellow' ? (language === 'vi' ? 'Nhắc nhở' : 'Caution') :
                                  (language === 'vi' ? 'Cảnh cáo' : 'Warning');
                            break;
                        case 'reason': val = formatWarningReason(w.reason, language as any) || ''; break;
                        case 'notified_by': val = w.notified_by || ''; break;
                    }
                    if (val !== undefined && val !== null) set.add(val)
                })
                map[k] = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            })
        } else if (activeTab === 'awards') {
            const keys: SortKey[] = ['date', 'name', 'award_name', 'notified_by', 'source', 'status', 'amount']
            keys.forEach(k => {
                const set = new Set<string>()
                awards.forEach(a => {
                    let val = ''
                    switch (k) {
                        case 'date': val = fmtDate(a.date); break;
                        case 'name': val = a.staff?.full_name || (language === 'vi' ? 'Không xác định' : 'Unknown'); break;
                        case 'award_name': val = a.award_name || ''; break;
                        case 'notified_by': val = a.notified_by || ''; break;
                        case 'source':
                            val = a.deduction_source === 'salary' ? (language === 'vi' ? 'Cộng Vào Lương Gộp' : 'Gross Salary Credit') :
                                  a.deduction_source === 'cash' ? (language === 'vi' ? 'Tiền Mặt/Chuyển Khoản Trực Tiếp' : 'Direct Cash/Transfer') :
                                  (a.deduction_source || '-').replace('_', ' ');
                            break;
                        case 'status':
                            val = a.status === 'paid' ? (language === 'vi' ? 'ĐÃ NỘP' : 'PAID') : 
                                  a.status === 'waived' ? (language === 'vi' ? 'ĐƯỢC MIỄN' : 'WAIVED') :
                                  a.status === 'disputed' ? (language === 'vi' ? 'ĐANG TRANH CHẤP' : 'DISPUTED') :
                                  (language === 'vi' ? 'CHỜ XỬ LÝ' : 'PENDING');
                            break;
                        case 'amount': val = fmtVND(a.amount); break;
                    }
                    if (val !== undefined && val !== null) set.add(val)
                })
                map[k] = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            })
        }
        
        return map
    }, [activeTab, fines, warnings, awards, language])

    const filteredFines = useMemo(() => {
        let out = [...fines]
        for (const [col, allowed] of Object.entries(columnFilters)) {
            if (!allowed) continue
            out = out.filter(f => {
                let val = ''
                switch (col) {
                    case 'date': val = fmtDate(f.date); break;
                    case 'name': val = f.staff?.full_name || (language === 'vi' ? 'Không xác định' : 'Unknown'); break;
                    case 'infraction': val = f.infraction || ''; break;
                    case 'notified_by': val = f.notified_by || ''; break;
                    case 'source': 
                        val = f.deduction_source === 'salary' ? (language === 'vi' ? 'Khấu trừ lương gộp' : 'Gross salary deduction') :
                              f.deduction_source === 'service_charge' ? (language === 'vi' ? 'Khấu trừ phí phục vụ' : 'Service charge deduction') :
                              f.deduction_source === 'cash' ? (language === 'vi' ? 'Tiền mặt/Chuyển khoản' : 'Direct cash/transfer') :
                              (f.deduction_source || '-').replace('_', ' ');
                        break;
                    case 'status': 
                        val = f.status === 'paid' ? (language === 'vi' ? 'ĐÃ NỘP' : 'PAID') : 
                              f.status === 'waived' ? (language === 'vi' ? 'ĐƯỢC MIỄN' : 'WAIVED') :
                              f.status === 'disputed' ? (language === 'vi' ? 'ĐANG TRANH CHẤP' : 'DISPUTED') :
                              (language === 'vi' ? 'CHỜ XỬ LÝ' : 'PENDING');
                        break;
                    case 'amount': val = fmtVND(f.amount); break;
                }
                return allowed.has(val)
            })
        }
        
        out.sort((a, b) => {
            let av: any, bv: any
            switch (sortKey) {
                case 'date': av = a.date; bv = b.date; break;
                case 'name': av = a.staff?.full_name || ''; bv = b.staff?.full_name || ''; break;
                case 'infraction': av = a.infraction || ''; bv = b.infraction || ''; break;
                case 'notified_by': av = a.notified_by || ''; bv = b.notified_by || ''; break;
                case 'source': av = a.deduction_source || ''; bv = b.deduction_source || ''; break;
                case 'status': av = a.status || ''; bv = b.status || ''; break;
                case 'amount': av = Number(a.amount || 0); bv = Number(b.amount || 0); break;
                default: av = ''; bv = '';
            }
            let cmp = 0
            if (typeof av === 'number' && typeof bv === 'number') {
                cmp = av - bv
            } else {
                cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
            }
            return sortAsc ? cmp : -cmp
        })
        return out
    }, [fines, columnFilters, sortKey, sortAsc, language])

    const filteredWarnings = useMemo(() => {
        let out = [...warnings]
        for (const [col, allowed] of Object.entries(columnFilters)) {
            if (!allowed) continue
            out = out.filter(w => {
                let val = ''
                switch (col) {
                    case 'date': val = fmtDate(w.date); break;
                    case 'name': val = w.staff?.full_name || (language === 'vi' ? 'Không xác định' : 'Unknown'); break;
                    case 'flag_type':
                        val = w.flag_type === 'green' ? (language === 'vi' ? 'Ghi chú tích cực' : 'Positive Note') :
                              w.flag_type === 'yellow' ? (language === 'vi' ? 'Nhắc nhở' : 'Caution') :
                              (language === 'vi' ? 'Cảnh cáo' : 'Warning');
                        break;
                    case 'reason': val = formatWarningReason(w.reason, language as any) || ''; break;
                    case 'notified_by': val = w.notified_by || ''; break;
                }
                return allowed.has(val)
            })
        }
        
        out.sort((a, b) => {
            let av: any, bv: any
            switch (sortKey) {
                case 'date': av = a.date; bv = b.date; break;
                case 'name': av = a.staff?.full_name || ''; bv = b.staff?.full_name || ''; break;
                case 'flag_type': av = a.flag_type || ''; bv = b.flag_type || ''; break;
                case 'reason': av = a.reason || ''; bv = b.reason || ''; break;
                case 'notified_by': av = a.notified_by || ''; bv = b.notified_by || ''; break;
                default: av = ''; bv = '';
            }
            let cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
            return sortAsc ? cmp : -cmp
        })
        return out
    }, [warnings, columnFilters, sortKey, sortAsc, language])

    const filteredAwards = useMemo(() => {
        let out = [...awards]
        for (const [col, allowed] of Object.entries(columnFilters)) {
            if (!allowed) continue
            out = out.filter(a => {
                let val = ''
                switch (col) {
                    case 'date': val = fmtDate(a.date); break;
                    case 'name': val = a.staff?.full_name || (language === 'vi' ? 'Không xác định' : 'Unknown'); break;
                    case 'award_name': val = a.award_name || ''; break;
                    case 'notified_by': val = a.notified_by || ''; break;
                    case 'source':
                        val = a.deduction_source === 'salary' ? (language === 'vi' ? 'Cộng Vào Lương Gộp' : 'Gross Salary Credit') :
                              a.deduction_source === 'cash' ? (language === 'vi' ? 'Tiền Mặt/Chuyển Khoản Trực Tiếp' : 'Direct Cash/Transfer') :
                              (a.deduction_source || '-').replace('_', ' ');
                        break;
                    case 'status':
                        val = a.status === 'paid' ? (language === 'vi' ? 'ĐÃ NỘP' : 'PAID') : 
                              a.status === 'waived' ? (language === 'vi' ? 'ĐƯỢC MIỄN' : 'WAIVED') :
                              a.status === 'disputed' ? (language === 'vi' ? 'ĐANG TRANH CHẤP' : 'DISPUTED') :
                              (language === 'vi' ? 'CHỜ XỬ LÝ' : 'PENDING');
                        break;
                    case 'amount': val = fmtVND(a.amount); break;
                }
                return allowed.has(val)
            })
        }
        
        out.sort((a, b) => {
            let av: any, bv: any
            switch (sortKey) {
                case 'date': av = a.date; bv = b.date; break;
                case 'name': av = a.staff?.full_name || ''; bv = b.staff?.full_name || ''; break;
                case 'award_name': av = a.award_name || ''; bv = b.award_name || ''; break;
                case 'notified_by': av = a.notified_by || ''; bv = b.notified_by || ''; break;
                case 'source': av = a.deduction_source || ''; bv = b.deduction_source || ''; break;
                case 'status': av = a.status || ''; bv = b.status || ''; break;
                case 'amount': av = Number(a.amount || 0); bv = Number(b.amount || 0); break;
                default: av = ''; bv = '';
            }
            let cmp = 0
            if (typeof av === 'number' && typeof bv === 'number') {
                cmp = av - bv
            } else {
                cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
            }
            return sortAsc ? cmp : -cmp
        })
        return out
    }, [awards, columnFilters, sortKey, sortAsc, language])

    const totalFinesAmount = filteredFines.reduce((sum: number, f: any) => sum + Number(f.amount || 0), 0)
    const totalAwardsAmount = filteredAwards.reduce((sum: number, a: any) => sum + Number(a.amount || 0), 0)

    const baseBtn = 'flex items-center gap-1 text-gray-500 hover:text-gray-900 transition'

    return (
        <div className="min-h-screen text-gray-100 p-6 animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto space-y-6">
                
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white">
                            {language === 'vi' ? 'Kỷ luật' : 'Disciplinary'}
                        </h1>
                        <p className="text-sm text-slate-400 mt-1">
                            {language === 'vi' ? 'Quản lý vi phạm, cảnh báo (thẻ phạt) và khen thưởng của toàn bộ nhân viên.' : 'Manage infractions, warnings (flags), and awards across all staff.'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {activeTab !== 'warnings' && (
                            <button 
                                onClick={() => setExportModalOpen(true)}
                                className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-white/10 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
                            >
                                <FileDown className="w-4 h-4" /> {language === 'vi' ? 'Xuất' : 'Export'}
                            </button>
                        )}
                        <button 
                            onClick={() => { 
                                setEditingFine(null); 
                                setEditingWarning(null); 
                                setEditingAward(null);
                                setModalOpen(true); 
                            }} 
                            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
                        >
                            <Plus className="w-4 h-4" /> 
                            {activeTab === 'fines' ? (language === 'vi' ? 'Thêm Kỷ Luật' : 'Add Fine') :
                             activeTab === 'warnings' ? (language === 'vi' ? 'Thêm Cảnh Cáo' : 'Add Flag') :
                             (language === 'vi' ? 'Thêm Khen Thưởng' : 'Add Award')}
                        </button>
                    </div>
                </div>

                {/* TAB MINIMALISTE */}
                <div className="flex border-b border-slate-800/80 mb-6 gap-6 px-2">
                    <button 
                        onClick={() => setActiveTab('fines')}
                        className={`pb-3 text-sm font-semibold border-b-2 transition-all ${activeTab === 'fines' ? 'border-blue-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                    >
                        {language === 'vi' ? 'Tiền Phạt' : 'Fines'}
                    </button>
                    <button 
                        onClick={() => setActiveTab('warnings')}
                        className={`pb-3 text-sm font-semibold border-b-2 transition-all ${activeTab === 'warnings' ? 'border-blue-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                    >
                        {language === 'vi' ? 'Cảnh Cáo & Thẻ' : 'Warnings & Flags'}
                    </button>
                    <button 
                        onClick={() => setActiveTab('awards')}
                        className={`pb-3 text-sm font-semibold border-b-2 transition-all ${activeTab === 'awards' ? 'border-blue-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                    >
                        {language === 'vi' ? 'Khen Thưởng' : 'Awards'}
                    </button>
                </div>

                {/* Month Nav */}
                <div className="flex items-center justify-between text-sm text-blue-100 pt-4 mb-4">
                    <button type="button" onClick={prevMonth} className="flex items-center gap-1 hover:text-white transition-colors">
                        <ChevronLeft className="w-4 h-4" /> <span>{language === 'vi' ? 'Trước' : 'Previous'}</span>
                    </button>
                    <div className="flex items-center gap-2 text-white">
                        <span className="text-base font-semibold">{monthLabel}</span>
                        <div className="relative w-5 h-5 group">
                            <CalendarDays className="w-5 h-5 text-blue-200 group-hover:text-blue-100 transition-colors cursor-pointer" />
                            <input type="month" value={monthInputValue} onChange={e => onPickMonth(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                        </div>
                    </div>
                    <button type="button" onClick={nextMonth} className="flex items-center gap-1 hover:text-white transition-colors">
                        <span>{language === 'vi' ? 'Sau' : 'Next'}</span> <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                {/* Table Area */}
                <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        
                        {/* TAB 1: FINES */}
                        {activeTab === 'fines' && (
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs font-semibold uppercase tracking-wider">
                                    <tr className="bg-gray-50/80 border-b border-gray-200">
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
                                            className="border-r border-gray-100 w-[120px]"
                                        />
                                        <ColumnHeader
                                            colKey="name"
                                            label={language === 'vi' ? 'Tên Nhân Viên' : 'Staff Name'}
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
                                            className="border-r border-gray-100 w-1/5 min-w-[150px]"
                                        />
                                        <ColumnHeader
                                            colKey="infraction"
                                            label={language === 'vi' ? 'Vi Phạm' : 'Infraction'}
                                            sortKey={sortKey}
                                            sortAsc={sortAsc}
                                            onSort={applySort}
                                            values={columnValues['infraction'] || []}
                                            activeFilter={columnFilters['infraction'] || null}
                                            onFilter={(s) => applyColumnFilter('infraction', s)}
                                            onClear={() => clearColumnFilter('infraction')}
                                            open={openMenu === 'infraction'}
                                            onToggle={() => setOpenMenu(openMenu === 'infraction' ? null : 'infraction')}
                                            onClose={() => setOpenMenu(null)}
                                            dict={dict}
                                            className="border-r border-gray-100 max-w-xs"
                                        />
                                        <ColumnHeader
                                            colKey="notified_by"
                                            label={language === 'vi' ? 'Người Báo Cáo' : 'Notified By'}
                                            sortKey={sortKey}
                                            sortAsc={sortAsc}
                                            onSort={applySort}
                                            values={columnValues['notified_by'] || []}
                                            activeFilter={columnFilters['notified_by'] || null}
                                            onFilter={(s) => applyColumnFilter('notified_by', s)}
                                            onClear={() => clearColumnFilter('notified_by')}
                                            open={openMenu === 'notified_by'}
                                            onToggle={() => setOpenMenu(openMenu === 'notified_by' ? null : 'notified_by')}
                                            onClose={() => setOpenMenu(null)}
                                            dict={dict}
                                            className="border-r border-gray-100"
                                        />
                                        <ColumnHeader
                                            colKey="source"
                                            label={language === 'vi' ? 'Nguồn' : 'Source'}
                                            sortKey={sortKey}
                                            sortAsc={sortAsc}
                                            onSort={applySort}
                                            values={columnValues['source'] || []}
                                            activeFilter={columnFilters['source'] || null}
                                            onFilter={(s) => applyColumnFilter('source', s)}
                                            onClear={() => clearColumnFilter('source')}
                                            open={openMenu === 'source'}
                                            onToggle={() => setOpenMenu(openMenu === 'source' ? null : 'source')}
                                            onClose={() => setOpenMenu(null)}
                                            dict={dict}
                                            className="border-r border-gray-100"
                                        />
                                        <ColumnHeader
                                            colKey="status"
                                            label={language === 'vi' ? 'Trạng Thái' : 'Status'}
                                            sortKey={sortKey}
                                            sortAsc={sortAsc}
                                            onSort={applySort}
                                            values={columnValues['status'] || []}
                                            activeFilter={columnFilters['status'] || null}
                                            onFilter={(s) => applyColumnFilter('status', s)}
                                            onClear={() => clearColumnFilter('status')}
                                            open={openMenu === 'status'}
                                            onToggle={() => setOpenMenu(openMenu === 'status' ? null : 'status')}
                                            onClose={() => setOpenMenu(null)}
                                            dict={dict}
                                            center
                                            className="border-r border-gray-100 text-center"
                                        />
                                        <ColumnHeader
                                            colKey="amount"
                                            label={language === 'vi' ? 'Số Tiền (VND)' : 'Amount (VND)'}
                                            sortKey={sortKey}
                                            sortAsc={sortAsc}
                                            onSort={applySort}
                                            values={columnValues['amount'] || []}
                                            activeFilter={columnFilters['amount'] || null}
                                            onFilter={(s) => applyColumnFilter('amount', s)}
                                            onClear={() => clearColumnFilter('amount')}
                                            open={openMenu === 'amount'}
                                            onToggle={() => setOpenMenu(openMenu === 'amount' ? null : 'amount')}
                                            onClose={() => setOpenMenu(null)}
                                            dict={dict}
                                            right
                                            className="border-r border-gray-100 text-right"
                                        />
                                        <th className="px-4 py-3 text-center w-24 text-[10px] font-bold uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Hành Động' : 'Actions'}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr><td colSpan={8} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></td></tr>
                                ) : filteredFines.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                                            {language === 'vi' ? `Không có hồ sơ phạt tiền nào được ghi nhận.` : `No fines recorded.`}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredFines.map(f => (
                                        <tr key={f.id} className="hover:bg-gray-50 transition-colors group">
                                            <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-900 font-medium">{fmtDate(f.date)}</td>
                                            <td className="px-4 py-3 border-r border-gray-100 text-gray-900 font-medium">
                                                {f.staff ? f.staff.full_name : <span className="text-gray-400 italic">{language === 'vi' ? 'Không xác định' : 'Unknown'}</span>}
                                            </td>
                                            <td className="px-4 py-3 border-r border-gray-100 text-gray-700 max-w-xs truncate" title={f.infraction}>{f.infraction}</td>
                                            <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-700">{f.notified_by || '-'}</td>
                                            <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-600">
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
                                                <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => { setEditingFine(f); setModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title={language === 'vi' ? 'Chỉnh sửa' : 'Edit'}>
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDeleteFine(f.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={language === 'vi' ? 'Xóa' : 'Delete'}>
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                                </tbody>
                                {!loading && filteredFines.length > 0 && (
                                    <tfoot className="bg-gray-50 border-t border-gray-200 text-sm font-bold text-gray-900">
                                        <tr>
                                            <td colSpan={6} className="px-4 py-3 text-right">{language === 'vi' ? 'Tổng Tiền Phạt Kỷ Luật' : 'Total Disciplinary Fines'}</td>
                                            <td className="px-4 py-3 text-right text-red-600 font-mono">-{fmtVND(totalFinesAmount)}</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        )}

                        {/* TAB 2: WARNINGS & FLAGS */}
                        {activeTab === 'warnings' && (
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs font-semibold uppercase tracking-wider">
                                    <tr className="bg-gray-50/80 border-b border-gray-200">
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
                                            className="border-r border-gray-100 w-[120px]"
                                        />
                                        <ColumnHeader
                                            colKey="name"
                                            label={language === 'vi' ? 'Tên Nhân Viên' : 'Staff Name'}
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
                                            className="border-r border-gray-100 w-1/5 min-w-[150px]"
                                        />
                                        <ColumnHeader
                                            colKey="flag_type"
                                            label={language === 'vi' ? 'Mức Cảnh Báo' : 'Flag Type'}
                                            sortKey={sortKey}
                                            sortAsc={sortAsc}
                                            onSort={applySort}
                                            values={columnValues['flag_type'] || []}
                                            activeFilter={columnFilters['flag_type'] || null}
                                            onFilter={(s) => applyColumnFilter('flag_type', s)}
                                            onClear={() => clearColumnFilter('flag_type')}
                                            open={openMenu === 'flag_type'}
                                            onToggle={() => setOpenMenu(openMenu === 'flag_type' ? null : 'flag_type')}
                                            onClose={() => setOpenMenu(null)}
                                            dict={dict}
                                            center
                                            className="border-r border-gray-100 text-center w-36"
                                        />
                                        <ColumnHeader
                                            colKey="reason"
                                            label={language === 'vi' ? 'Lý Do' : 'Reason'}
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
                                            className="border-r border-gray-100 max-w-sm"
                                        />
                                        <ColumnHeader
                                            colKey="notified_by"
                                            label={language === 'vi' ? 'Người Báo Cáo' : 'Notified By'}
                                            sortKey={sortKey}
                                            sortAsc={sortAsc}
                                            onSort={applySort}
                                            values={columnValues['notified_by'] || []}
                                            activeFilter={columnFilters['notified_by'] || null}
                                            onFilter={(s) => applyColumnFilter('notified_by', s)}
                                            onClear={() => clearColumnFilter('notified_by')}
                                            open={openMenu === 'notified_by'}
                                            onToggle={() => setOpenMenu(openMenu === 'notified_by' ? null : 'notified_by')}
                                            onClose={() => setOpenMenu(null)}
                                            dict={dict}
                                            className="border-r border-gray-100"
                                        />
                                        <th className="px-4 py-3 text-center w-24 text-[10px] font-bold uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Hành Động' : 'Actions'}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr><td colSpan={6} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></td></tr>
                                ) : filteredWarnings.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                                            {language === 'vi' ? `Không có cảnh cáo nào được ghi nhận.` : `No flags recorded.`}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredWarnings.map(w => (
                                        <tr key={w.id} className="hover:bg-gray-50 transition-colors group">
                                            <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-900 font-medium">{fmtDate(w.date)}</td>
                                            <td className="px-4 py-3 border-r border-gray-100 text-gray-900 font-medium">
                                                {w.staff ? w.staff.full_name : <span className="text-gray-400 italic">{language === 'vi' ? 'Không xác định' : 'Unknown'}</span>}
                                            </td>
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
                                                <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => { setEditingWarning(w); setModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title={language === 'vi' ? 'Chỉnh sửa' : 'Edit'}>
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDeleteWarning(w.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={language === 'vi' ? 'Xóa' : 'Delete'}>
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
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
                                    <tr className="bg-gray-50/80 border-b border-gray-200">
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
                                            className="border-r border-gray-100 w-[120px]"
                                        />
                                        <ColumnHeader
                                            colKey="name"
                                            label={language === 'vi' ? 'Tên Nhân Viên' : 'Staff Name'}
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
                                            className="border-r border-gray-100 w-1/5 min-w-[150px]"
                                        />
                                        <ColumnHeader
                                            colKey="award_name"
                                            label={language === 'vi' ? 'Khen Thưởng' : 'Award'}
                                            sortKey={sortKey}
                                            sortAsc={sortAsc}
                                            onSort={applySort}
                                            values={columnValues['award_name'] || []}
                                            activeFilter={columnFilters['award_name'] || null}
                                            onFilter={(s) => applyColumnFilter('award_name', s)}
                                            onClear={() => clearColumnFilter('award_name')}
                                            open={openMenu === 'award_name'}
                                            onToggle={() => setOpenMenu(openMenu === 'award_name' ? null : 'award_name')}
                                            onClose={() => setOpenMenu(null)}
                                            dict={dict}
                                            className="border-r border-gray-100 max-w-xs"
                                        />
                                        <ColumnHeader
                                            colKey="notified_by"
                                            label={language === 'vi' ? 'Người Báo Cáo' : 'Notified By'}
                                            sortKey={sortKey}
                                            sortAsc={sortAsc}
                                            onSort={applySort}
                                            values={columnValues['notified_by'] || []}
                                            activeFilter={columnFilters['notified_by'] || null}
                                            onFilter={(s) => applyColumnFilter('notified_by', s)}
                                            onClear={() => clearColumnFilter('notified_by')}
                                            open={openMenu === 'notified_by'}
                                            onToggle={() => setOpenMenu(openMenu === 'notified_by' ? null : 'notified_by')}
                                            onClose={() => setOpenMenu(null)}
                                            dict={dict}
                                            className="border-r border-gray-100"
                                        />
                                        <ColumnHeader
                                            colKey="source"
                                            label={language === 'vi' ? 'Nguồn' : 'Source'}
                                            sortKey={sortKey}
                                            sortAsc={sortAsc}
                                            onSort={applySort}
                                            values={columnValues['source'] || []}
                                            activeFilter={columnFilters['source'] || null}
                                            onFilter={(s) => applyColumnFilter('source', s)}
                                            onClear={() => clearColumnFilter('source')}
                                            open={openMenu === 'source'}
                                            onToggle={() => setOpenMenu(openMenu === 'source' ? null : 'source')}
                                            onClose={() => setOpenMenu(null)}
                                            dict={dict}
                                            className="border-r border-gray-100"
                                        />
                                        <ColumnHeader
                                            colKey="status"
                                            label={language === 'vi' ? 'Trạng Thái' : 'Status'}
                                            sortKey={sortKey}
                                            sortAsc={sortAsc}
                                            onSort={applySort}
                                            values={columnValues['status'] || []}
                                            activeFilter={columnFilters['status'] || null}
                                            onFilter={(s) => applyColumnFilter('status', s)}
                                            onClear={() => clearColumnFilter('status')}
                                            open={openMenu === 'status'}
                                            onToggle={() => setOpenMenu(openMenu === 'status' ? null : 'status')}
                                            onClose={() => setOpenMenu(null)}
                                            dict={dict}
                                            center
                                            className="border-r border-gray-100 text-center"
                                        />
                                        <ColumnHeader
                                            colKey="amount"
                                            label={language === 'vi' ? 'Số Tiền (VND)' : 'Amount (VND)'}
                                            sortKey={sortKey}
                                            sortAsc={sortAsc}
                                            onSort={applySort}
                                            values={columnValues['amount'] || []}
                                            activeFilter={columnFilters['amount'] || null}
                                            onFilter={(s) => applyColumnFilter('amount', s)}
                                            onClear={() => clearColumnFilter('amount')}
                                            open={openMenu === 'amount'}
                                            onToggle={() => setOpenMenu(openMenu === 'amount' ? null : 'amount')}
                                            onClose={() => setOpenMenu(null)}
                                            dict={dict}
                                            right
                                            className="border-r border-gray-100 text-right"
                                        />
                                        <th className="px-4 py-3 text-center w-24 text-[10px] font-bold uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Hành Động' : 'Actions'}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr><td colSpan={8} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></td></tr>
                                ) : filteredAwards.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                                            {language === 'vi' ? `Không có hồ sơ khen thưởng nào được ghi nhận.` : `No awards recorded.`}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredAwards.map(a => (
                                        <tr key={a.id} className="hover:bg-gray-50 transition-colors group">
                                            <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-900 font-medium">{fmtDate(a.date)}</td>
                                            <td className="px-4 py-3 border-r border-gray-100 text-gray-900 font-medium">
                                                {a.staff ? a.staff.full_name : <span className="text-gray-400 italic">{language === 'vi' ? 'Không xác định' : 'Unknown'}</span>}
                                            </td>
                                            <td className="px-4 py-3 border-r border-gray-100 text-gray-700 max-w-xs truncate" title={a.award_name}>{a.award_name}</td>
                                            <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-700">{a.notified_by || '-'}</td>
                                            <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-600">
                                                {a.deduction_source === 'salary' ? (language === 'vi' ? 'Cộng vào lương gộp' : 'Gross salary credit') :
                                                 a.deduction_source === 'service_charge' ? (language === 'vi' ? 'Cộng vào phí phục vụ' : 'Service charge credit') :
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
                                                <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => { setEditingAward(a); setModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title={language === 'vi' ? 'Chỉnh sửa' : 'Edit'}>
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDeleteAward(a.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={language === 'vi' ? 'Xóa' : 'Delete'}>
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                                </tbody>
                                {!loading && filteredAwards.length > 0 && (
                                    <tfoot className="bg-gray-50 border-t border-gray-200 text-sm font-bold text-gray-900">
                                        <tr>
                                            <td colSpan={6} className="px-4 py-3 text-right">{language === 'vi' ? 'Tổng Tiền Khen Thưởng' : 'Total Awards'}</td>
                                            <td className="px-4 py-3 text-right text-emerald-600 font-mono">+{fmtVND(totalAwardsAmount)}</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        )}

                    </div>
                </div>

                {/* Modals */}
                {modalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
                                <h3 className="text-lg font-bold text-gray-900">
                                    {activeTab === 'fines' ? (
                                        editingFine ? (language === 'vi' ? 'Chỉnh Sửa Quyết Định Kỷ Luật' : 'Edit Disciplinary Action') : (language === 'vi' ? 'Thêm Quyết Định Kỷ Luật' : 'Add Disciplinary Action')
                                    ) : activeTab === 'warnings' ? (
                                        editingWarning ? (language === 'vi' ? 'Chỉnh Sửa Cảnh Cáo' : 'Edit Flag') : (language === 'vi' ? 'Thêm Cảnh Cáo' : 'Add Flag')
                                    ) : (
                                        editingAward ? (language === 'vi' ? 'Chỉnh Sửa Khen Thưởng' : 'Edit Award') : (language === 'vi' ? 'Thêm Khen Thưởng' : 'Add Award')
                                    )}
                                </h3>
                                <button onClick={() => setModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-900 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6 overflow-y-auto space-y-4">
                                {activeTab === 'fines' && (
                                    <FormFineGlobal 
                                        initialData={editingFine} 
                                        catalog={catalog}
                                        staffList={staffList}
                                        loggedUserName={loggedUserName} 
                                        onSave={handleSaveFine} 
                                        onCancel={() => setModalOpen(false)} 
                                    />
                                )}
                                {activeTab === 'warnings' && (
                                    <FormWarningGlobal 
                                        initialData={editingWarning} 
                                        staffList={staffList}
                                        loggedUserName={loggedUserName} 
                                        onSave={handleSaveWarning} 
                                        onCancel={() => setModalOpen(false)} 
                                    />
                                )}
                                {activeTab === 'awards' && (
                                    <FormAwardGlobal 
                                        initialData={editingAward} 
                                        catalog={awardsCatalog}
                                        staffList={staffList}
                                        loggedUserName={loggedUserName} 
                                        onSave={handleSaveAward} 
                                        onCancel={() => setModalOpen(false)} 
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {exportModalOpen && (
                    <ExportModal type={activeTab} onClose={() => setExportModalOpen(false)} onExport={handleExport} />
                )}
            </div>
        </div>
    )
}

// FORM 1: FINE FORM
function FormFineGlobal({ 
    initialData, 
    catalog, 
    staffList,
    loggedUserName, 
    onSave, 
    onCancel 
}: { 
    initialData: HRStaffFine | null, 
    catalog: HRDisciplinaryCatalog[], 
    staffList: HRStaffMember[],
    loggedUserName: string, 
    onSave: (d: Partial<HRStaffFine>) => void, 
    onCancel: () => void 
}) {
    const [staffId, setStaffId] = useState(initialData?.staff_id || '')
    const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0])
    const [infraction, setInfraction] = useState(initialData?.infraction || '')
    const [amount, setAmount] = useState(initialData?.amount || 0)
    const [notifiedBy, setNotifiedBy] = useState(initialData?.notified_by || loggedUserName)
    const [deductionSource, setDeductionSource] = useState(initialData?.deduction_source || 'salary')
    const [displayAmount, setDisplayAmount] = useState(initialData?.amount ? initialData.amount.toLocaleString('en-US') : '')
    const [submitting, setSubmitting] = useState(false)
    const { language } = useSettings()

    const [searchStaff, setSearchStaff] = useState('')
    const [staffDropdownOpen, setStaffDropdownOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const selectedStaffObj = staffList.find(s => s.id === staffId)

    useEffect(() => {
        if (!initialData && !notifiedBy && loggedUserName) {
            setNotifiedBy(loggedUserName)
        }
    }, [loggedUserName, initialData, notifiedBy])

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setStaffDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const filteredStaff = staffList.filter(s => {
        const full = (s.full_name || '').toLowerCase()
        return full.includes(searchStaff.toLowerCase())
    })

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
        if (!staffId) {
            alert(language === 'vi' ? 'Vui lòng chọn một nhân viên.' : 'Please select a staff member.')
            return
        }
        if (!infraction || amount < 0 || !date) return
        setSubmitting(true)
        try {
            await onSave({
                staff_id: staffId,
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

    const applicableCatalog = catalog.filter(c => {
        if (!c.applicability_type || c.applicability_type === 'global') return true
        if (selectedStaffObj) {
            if (c.applicability_type === 'department' && c.target_id === selectedStaffObj.department_id) return true
            if (c.applicability_type === 'position' && c.target_id === selectedStaffObj.position_id) return true
            return false
        }
        return true
    })

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative" ref={dropdownRef}>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    {language === 'vi' ? 'Nhân Viên' : 'Staff Member'} <span className="text-red-500">*</span>
                </label>
                <div 
                    className={`w-full px-3 py-2 bg-white border ${staffId ? 'border-blue-300' : 'border-gray-200'} rounded-lg text-sm focus-within:ring-2 focus-within:ring-blue-500 flex items-center justify-between cursor-pointer`}
                    onClick={() => setStaffDropdownOpen(true)}
                >
                    <span className={staffId ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                        {selectedStaffObj ? selectedStaffObj.full_name : (language === 'vi' ? 'Tìm kiếm nhân viên...' : 'Search staff...')}
                    </span>
                    <Search className="w-4 h-4 text-gray-400" />
                </div>
                {staffDropdownOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 flex flex-col">
                        <div className="p-2 border-b border-gray-100 shrink-0">
                            <input type="text" autoFocus value={searchStaff} onChange={e => setSearchStaff(e.target.value)} placeholder={language === 'vi' ? 'Nhập để lọc...' : 'Type to filter...'} className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <ul className="overflow-y-auto py-1">
                            {filteredStaff.length === 0 ? (
                                <li className="px-4 py-3 text-sm text-gray-500 text-center">{language === 'vi' ? 'Không tìm thấy nhân viên' : 'No active staff found.'}</li>
                            ) : (
                                filteredStaff.map(s => (
                                    <li key={s.id} className={`px-4 py-2 text-sm cursor-pointer hover:bg-blue-50 transition-colors ${staffId === s.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'}`} onClick={() => { setStaffId(s.id); setStaffDropdownOpen(false); setSearchStaff(''); }}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><User className="w-3 h-3 text-gray-400" /></div>
                                            <span>{s.full_name}</span>
                                        </div>
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Ngày' : 'Date'} <span className="text-red-500">*</span></label>
                    <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Nguồn Khấu Trừ' : 'Deduction Source'}</label>
                    <select value={deductionSource} onChange={e => setDeductionSource(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="salary">{language === 'vi' ? 'Khấu Trừ Lương Gộp' : 'Gross Salary Deduction'}</option>
                        <option value="service_charge">{language === 'vi' ? 'Khấu Trừ Phí Phục Vụ' : 'Service Charge Deduction'}</option>
                        <option value="cash">{language === 'vi' ? 'Tiền Mặt/Chuyển Khoản Trực Tiếp' : 'Direct Cash/Transfer'}</option>
                    </select>
                </div>
            </div>

            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Vi Phạm' : 'Infraction'} <span className="text-red-500">*</span></label>
                <select required value={infraction} onChange={handleCatalogSelect} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="" disabled>{language === 'vi' ? 'Chọn hành vi vi phạm...' : 'Select an infraction...'}</option>
                    {applicableCatalog.map(c => (
                        <option key={c.id} value={c.infraction_name}>{c.infraction_name}</option>
                    ))}
                    {initialData && !applicableCatalog.find(c => c.infraction_name === initialData.infraction) && (
                        <option value={initialData.infraction}>{initialData.infraction} {language === 'vi' ? '(Cũ/Thủ công)' : '(Legacy/Manual)'}</option>
                    )}
                </select>
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
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Người Báo Cáo' : 'Notified By'}</label>
                    <input type="text" value={notifiedBy || ''} onChange={e => setNotifiedBy(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t border-gray-100 mt-6">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition">{language === 'vi' ? 'Hủy' : 'Cancel'}</button>
                <button type="submit" disabled={submitting || !staffId || !infraction || amount < 0} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {submitting ? '...' : (language === 'vi' ? 'Lưu' : 'Save')}
                </button>
            </div>
        </form>
    )
}

// FORM 2: WARNING FORM
function FormWarningGlobal({ 
    initialData, 
    staffList,
    loggedUserName, 
    onSave, 
    onCancel 
}: { 
    initialData: HRStaffWarning | null, 
    staffList: HRStaffMember[],
    loggedUserName: string, 
    onSave: (d: Partial<HRStaffWarning>) => void, 
    onCancel: () => void 
}) {
    const [staffId, setStaffId] = useState(initialData?.staff_id || '')
    const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0])
    const [flagType, setFlagType] = useState<WarningFlagType>(initialData?.flag_type || 'yellow')
    const [reason, setReason] = useState(initialData?.reason || '')
    const [notifiedBy, setNotifiedBy] = useState(initialData?.notified_by || loggedUserName)
    const [submitting, setSubmitting] = useState(false)
    const { language } = useSettings()

    const [searchStaff, setSearchStaff] = useState('')
    const [staffDropdownOpen, setStaffDropdownOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const selectedStaffObj = staffList.find(s => s.id === staffId)

    useEffect(() => {
        if (!initialData && !notifiedBy && loggedUserName) {
            setNotifiedBy(loggedUserName)
        }
    }, [loggedUserName, initialData, notifiedBy])

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setStaffDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const filteredStaff = staffList.filter(s => {
        const full = (s.full_name || '').toLowerCase()
        return full.includes(searchStaff.toLowerCase())
    })

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!staffId) {
            alert(language === 'vi' ? 'Vui lòng chọn một nhân viên.' : 'Please select a staff member.')
            return
        }
        if (!reason || !date) return
        setSubmitting(true)
        try {
            await onSave({
                staff_id: staffId,
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
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative" ref={dropdownRef}>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    {language === 'vi' ? 'Nhân Viên' : 'Staff Member'} <span className="text-red-500">*</span>
                </label>
                <div 
                    className={`w-full px-3 py-2 bg-white border ${staffId ? 'border-blue-300' : 'border-gray-200'} rounded-lg text-sm focus-within:ring-2 focus-within:ring-blue-500 flex items-center justify-between cursor-pointer`}
                    onClick={() => setStaffDropdownOpen(true)}
                >
                    <span className={staffId ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                        {selectedStaffObj ? selectedStaffObj.full_name : (language === 'vi' ? 'Tìm kiếm nhân viên...' : 'Search staff...')}
                    </span>
                    <Search className="w-4 h-4 text-gray-400" />
                </div>
                {staffDropdownOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 flex flex-col">
                        <div className="p-2 border-b border-gray-100 shrink-0">
                            <input type="text" autoFocus value={searchStaff} onChange={e => setSearchStaff(e.target.value)} placeholder={language === 'vi' ? 'Nhập để lọc...' : 'Type to filter...'} className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <ul className="overflow-y-auto py-1">
                            {filteredStaff.length === 0 ? (
                                <li className="px-4 py-3 text-sm text-gray-500 text-center">{language === 'vi' ? 'Không tìm thấy nhân viên' : 'No active staff found.'}</li>
                            ) : (
                                filteredStaff.map(s => (
                                    <li key={s.id} className={`px-4 py-2 text-sm cursor-pointer hover:bg-blue-50 transition-colors ${staffId === s.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'}`} onClick={() => { setStaffId(s.id); setStaffDropdownOpen(false); setSearchStaff(''); }}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><User className="w-3 h-3 text-gray-400" /></div>
                                            <span>{s.full_name}</span>
                                        </div>
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Ngày' : 'Date'} <span className="text-red-500">*</span></label>
                    <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Người Báo Cáo' : 'Notified By'}</label>
                    <input type="text" value={notifiedBy || ''} onChange={e => setNotifiedBy(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
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
                <textarea required value={reason} onChange={e => setReason(e.target.value)} rows={3} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder={language === 'vi' ? 'Nhập lý do...' : 'Enter reason...'} />
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t border-gray-100 mt-6">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition">{language === 'vi' ? 'Hủy' : 'Cancel'}</button>
                <button type="submit" disabled={submitting || !staffId || !reason} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {submitting ? '...' : (language === 'vi' ? 'Lưu' : 'Save')}
                </button>
            </div>
        </form>
    )
}

// FORM 3: AWARD FORM
function FormAwardGlobal({ 
    initialData, 
    catalog, 
    staffList,
    loggedUserName, 
    onSave, 
    onCancel 
}: { 
    initialData: HRStaffAward | null, 
    catalog: HRAwardsCatalog[], 
    staffList: HRStaffMember[],
    loggedUserName: string, 
    onSave: (d: Partial<HRStaffAward>) => void, 
    onCancel: () => void 
}) {
    const [staffId, setStaffId] = useState(initialData?.staff_id || '')
    const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0])
    const [awardName, setAwardName] = useState(initialData?.award_name || '')
    const [amount, setAmount] = useState(initialData?.amount || 0)
    const [notifiedBy, setNotifiedBy] = useState(initialData?.notified_by || loggedUserName)
    const [deductionSource, setDeductionSource] = useState(initialData?.deduction_source || 'salary') // credit source
    const [displayAmount, setDisplayAmount] = useState(initialData?.amount ? initialData.amount.toLocaleString('en-US') : '')
    const [submitting, setSubmitting] = useState(false)
    const { language } = useSettings()

    const [searchStaff, setSearchStaff] = useState('')
    const [staffDropdownOpen, setStaffDropdownOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const selectedStaffObj = staffList.find(s => s.id === staffId)

    useEffect(() => {
        if (!initialData && !notifiedBy && loggedUserName) {
            setNotifiedBy(loggedUserName)
        }
    }, [loggedUserName, initialData, notifiedBy])

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setStaffDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const filteredStaff = staffList.filter(s => {
        const full = (s.full_name || '').toLowerCase()
        return full.includes(searchStaff.toLowerCase())
    })

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
        if (!staffId) {
            alert(language === 'vi' ? 'Vui lòng chọn một nhân viên.' : 'Please select a staff member.')
            return
        }
        if (!awardName || amount < 0 || !date) return
        setSubmitting(true)
        try {
            await onSave({
                staff_id: staffId,
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

    const applicableCatalog = catalog.filter(c => {
        if (!c.applicability_type || c.applicability_type === 'global') return true
        if (selectedStaffObj) {
            if (c.applicability_type === 'department' && c.target_id === selectedStaffObj.department_id) return true
            if (c.applicability_type === 'position' && c.target_id === selectedStaffObj.position_id) return true
            return false
        }
        return true
    })

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative" ref={dropdownRef}>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    {language === 'vi' ? 'Nhân Viên' : 'Staff Member'} <span className="text-red-500">*</span>
                </label>
                <div 
                    className={`w-full px-3 py-2 bg-white border ${staffId ? 'border-blue-300' : 'border-gray-200'} rounded-lg text-sm focus-within:ring-2 focus-within:ring-blue-500 flex items-center justify-between cursor-pointer`}
                    onClick={() => setStaffDropdownOpen(true)}
                >
                    <span className={staffId ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                        {selectedStaffObj ? selectedStaffObj.full_name : (language === 'vi' ? 'Tìm kiếm nhân viên...' : 'Search staff...')}
                    </span>
                    <Search className="w-4 h-4 text-gray-400" />
                </div>
                {staffDropdownOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 flex flex-col">
                        <div className="p-2 border-b border-gray-100 shrink-0">
                            <input type="text" autoFocus value={searchStaff} onChange={e => setSearchStaff(e.target.value)} placeholder={language === 'vi' ? 'Nhập để lọc...' : 'Type to filter...'} className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <ul className="overflow-y-auto py-1">
                            {filteredStaff.length === 0 ? (
                                <li className="px-4 py-3 text-sm text-gray-500 text-center">{language === 'vi' ? 'Không tìm thấy nhân viên' : 'No active staff found.'}</li>
                            ) : (
                                filteredStaff.map(s => (
                                    <li key={s.id} className={`px-4 py-2 text-sm cursor-pointer hover:bg-blue-50 transition-colors ${staffId === s.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'}`} onClick={() => { setStaffId(s.id); setStaffDropdownOpen(false); setSearchStaff(''); }}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><User className="w-3 h-3 text-gray-400" /></div>
                                            <span>{s.full_name}</span>
                                        </div>
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Ngày' : 'Date'} <span className="text-red-500">*</span></label>
                    <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Nguồn Nhận Thưởng' : 'Credit Source'}</label>
                    <select value={deductionSource} onChange={e => setDeductionSource(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="salary">{language === 'vi' ? 'Cộng Vào Lương Gộp' : 'Gross Salary Credit'}</option>
                        <option value="cash">{language === 'vi' ? 'Tiền Mặt/Chuyển Khoản Trực Tiếp' : 'Direct Cash/Transfer'}</option>
                    </select>
                </div>
            </div>

            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Khen Thưởng' : 'Award'} <span className="text-red-500">*</span></label>
                <select required value={awardName} onChange={handleCatalogSelect} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="" disabled>{language === 'vi' ? 'Chọn loại thưởng...' : 'Select an award...'}</option>
                    {applicableCatalog.map(c => (
                        <option key={c.id} value={c.award_name}>{c.award_name}</option>
                    ))}
                    {initialData && !applicableCatalog.find(c => c.award_name === initialData.award_name) && (
                        <option value={initialData.award_name}>{initialData.award_name} {language === 'vi' ? '(Cũ/Thủ công)' : '(Legacy/Manual)'}</option>
                    )}
                </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Số Tiền Thưởng (VND)' : 'Award Amount (VND)'} <span className="text-red-500">*</span></label>
                    <input type="text" required value={displayAmount} 
                        onChange={e => {
                            let val = e.target.value.replace(/[^0-9]/g, '');
                            if (val) {
                                setDisplayAmount(parseInt(val, 10).toLocaleString('en-US'))
                                setAmount(parseInt(val, 10))
                            } else { setDisplayAmount(''); setAmount(0); }
                        }}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Người Báo Cáo' : 'Notified By'}</label>
                    <input type="text" value={notifiedBy || ''} onChange={e => setNotifiedBy(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t border-gray-100 mt-6">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition">{language === 'vi' ? 'Hủy' : 'Cancel'}</button>
                <button type="submit" disabled={submitting || !staffId || !awardName || amount < 0} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {submitting ? '...' : (language === 'vi' ? 'Lưu' : 'Save')}
                </button>
            </div>
        </form>
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
        <th className={`px-4 py-3.5 ${right ? 'text-right' : ''} ${className} relative`} ref={ref as any}>
            <div className={`flex items-center gap-1 font-bold uppercase tracking-wider text-gray-500 text-[10px] ${center ? 'justify-center' : right ? 'justify-end' : 'justify-start'}`}>
                <span className="select-none">{label}</span>
                {isActive && (
                    sortAsc
                        ? <ArrowUp className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                        : <ArrowDown className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                )}
                {hasFilter && <Filter className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />}
                <button
                    type="button"
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
                            type="button"
                            onClick={() => onSort(colKey, true)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${isActive && sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'}`}
                        >
                            <ArrowUp className="w-4 h-4" />
                            {dict.sortAsc}
                        </button>
                        <button
                            type="button"
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
                                    <span className="truncate text-xs">{v || '(Empty)'}</span>
                                </label>
                            ))}
                            {filteredValues.length === 0 && (
                                <div className="text-xs text-gray-400 py-1 text-center">—</div>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
                        <button type="button" onClick={onClear} className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer font-medium">
                            {dict.clearFilters}
                        </button>
                        <button type="button" onClick={handleApply} className="px-3 py-1 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer font-medium">
                            OK
                        </button>
                    </div>
                </div>
            )}
        </th>
    )
}
