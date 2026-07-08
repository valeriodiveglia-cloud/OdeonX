'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffMember, HRStaffAttendanceMonthly } from '@/types/human-resources'
import { Users, X, Save, ChevronDown, ArrowUp, ArrowDown, Filter, MoreVertical, Search } from 'lucide-react'
import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'
import MonthPicker from '@/components/MonthPicker'
import { getCurrentUserPermissions } from '@/lib/user-branches'

function toMonthInputValue(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function fromMonthInputValue(val: string) { const [y, m] = val.split('-').map(Number); return new Date(y, m - 1, 1) }

export default function AttendanceMonthlyPage() {
    const { language } = useSettings()
    const [currentDate, setCurrentDate] = useState(() => new Date())
    const [loading, setLoading] = useState(true)
    const [selectedCity, setSelectedCity] = useState<'Ho Chi Minh' | 'Da Lat'>('Ho Chi Minh')
    const [allowedCities, setAllowedCities] = useState<('Ho Chi Minh' | 'Da Lat')[]>(['Ho Chi Minh', 'Da Lat'])
    const [cityDropdownOpen, setCityDropdownOpen] = useState(false)

    // Permissions State
    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
    const [currentUserBranches, setCurrentUserBranches] = useState<string[] | null>(null)

    // Data
    const [staffList, setStaffList] = useState<HRStaffMember[]>([])
    const [attendanceDict, setAttendanceDict] = useState<Record<string, HRStaffAttendanceMonthly>>({})

    // Sort & Filter States
    const [sortKey, setSortKey] = useState<string>('full_name')
    const [sortAsc, setSortAsc] = useState<boolean>(true)
    const [filterPosition, setFilterPosition] = useState<Set<string> | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null)

    const dict = useMemo(() => ({
        sortAsc: language === 'vi' ? 'Sắp xếp A-Z' : 'Sort A-Z',
        sortDesc: language === 'vi' ? 'Sắp xếp Z-A' : 'Sort Z-A',
        selectAll: language === 'vi' ? 'Chọn tất cả' : 'Select all',
        deselectAll: language === 'vi' ? 'Bỏ chọn tất cả' : 'Deselect all',
        filterPlaceholder: language === 'vi' ? 'Lọc...' : 'Filter...',
        clearFilters: language === 'vi' ? 'Xóa lọc' : 'Clear filters'
    }), [language])

    const monthId = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`
    
    // Formatting display
    const displayMonth = currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

    const uniquePositions = useMemo(() => {
        return Array.from(new Set(staffList.map(s => s.position).filter(Boolean))) as string[]
    }, [staffList])

    const sortedAndFilteredStaff = useMemo(() => {
        let list = [...staffList]
        // Filtro città
        list = list.filter(s => s.city === selectedCity)

        // Filtro ricerca
        if (searchQuery) {
            const q = searchQuery.toLowerCase()
            list = list.filter(s => s.full_name?.toLowerCase().includes(q))
        }

        // Filtro posizione
        if (filterPosition) {
            list = list.filter(s => s.position && filterPosition.has(s.position))
        }

        // Ordinamento
        list.sort((a, b) => {
            let valA = ''
            let valB = ''
            if (sortKey === 'full_name') {
                valA = a.full_name || ''
                valB = b.full_name || ''
            } else if (sortKey === 'position') {
                valA = a.position || ''
                valB = b.position || ''
            } else {
                return 0
            }

            return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA)
        })

        return list
    }, [staffList, selectedCity, searchQuery, filterPosition, sortKey, sortAsc])

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

            // Carica tutti i branch per mappare le città autorizzate
            const { data: bData } = await supabase.from('provider_branches').select('id, name, city')
            let cities: ('Ho Chi Minh' | 'Da Lat')[] = ['Ho Chi Minh', 'Da Lat']
            if (userRole && !['owner', 'admin'].includes(userRole) && userBranches && bData) {
                const mappedCities = bData
                    .filter((b: any) => userBranches.includes(b.id))
                    .map((b: any) => b.city as 'Ho Chi Minh' | 'Da Lat')
                    .filter(Boolean)
                cities = Array.from(new Set(mappedCities))
                setAllowedCities(cities)
                if (cities.length > 0 && !cities.includes(selectedCity)) {
                    setSelectedCity(cities[0])
                }
            } else {
                setAllowedCities(['Ho Chi Minh', 'Da Lat'])
            }

            // Fetch all active staff (excluding outsourced) with branch info
            const { data: staffRes, error: staffErr } = await supabase
                .from('hr_staff')
                .select('id, full_name, position, department, city, employment_type, hr_staff_branches(branch_id)')
                .eq('status', 'active')
                .neq('employment_type', 'outsourced')
                .order('full_name')
            if (staffErr) throw staffErr

            // Fetch attendance for the month
            const { data: attRes, error: attErr } = await supabase
                .from('hr_staff_attendance_monthly')
                .select('*')
                .eq('month_id', monthId)
            if (attErr) throw attErr

            let filteredStaff = (staffRes as any[] || [])
            if (userRole && !['owner', 'admin'].includes(userRole) && userBranches) {
                filteredStaff = filteredStaff.filter(s =>
                    (s.hr_staff_branches || []).some((sb: any) => userBranches.includes(sb.branch_id))
                )
            }

            setStaffList(filteredStaff as HRStaffMember[])
            
            const dict: Record<string, HRStaffAttendanceMonthly> = {}
            if (attRes) {
                attRes.forEach((r: any) => { 
                    if (!userRole || ['owner', 'admin'].includes(userRole) || !userBranches || filteredStaff.some(s => s.id === r.staff_id)) {
                        dict[r.staff_id] = r 
                    }
                })
            }
            setAttendanceDict(dict)
        } catch (err) {
            console.error('Error fetching attendance data:', err)
        }
        setLoading(false)
    }, [monthId, currentUserRole, currentUserBranches])

    useEffect(() => { fetchAll() }, [fetchAll])

    // Filter staff by city
    const filteredStaff = useMemo(() => {
        return staffList.filter(s => {
            if (selectedCity === 'Ho Chi Minh') {
                return s.city === 'Ho Chi Minh' || !s.city
            }
            return s.city === selectedCity
        })
    }, [staffList, selectedCity])

    // Modal State
    const [modalOpen, setModalOpen] = useState(false)
    const [selectedStaff, setSelectedStaff] = useState<HRStaffMember | null>(null)
    const [formData, setFormData] = useState({
        lates_count: 0,
        lates_minutes: 0,
        no_shows_count: 0,
        annual_leaves: 0,
        sick_leaves: 0,
        unpaid_leaves: 0,
        other_leaves: 0,
        notes: ''
    })
    const [saving, setSaving] = useState(false)

    const openModal = (staff: HRStaffMember) => {
        setSelectedStaff(staff)
        const rec = attendanceDict[staff.id]
        if (rec) {
            setFormData({
                lates_count: rec.lates_count || 0,
                lates_minutes: rec.lates_minutes || 0,
                no_shows_count: rec.no_shows_count || 0,
                annual_leaves: rec.annual_leaves || 0,
                sick_leaves: rec.sick_leaves || 0,
                unpaid_leaves: rec.unpaid_leaves || 0,
                other_leaves: rec.other_leaves || 0,
                notes: rec.notes || ''
            })
        } else {
            setFormData({
                lates_count: 0,
                lates_minutes: 0,
                no_shows_count: 0,
                annual_leaves: 0,
                sick_leaves: 0,
                unpaid_leaves: 0,
                other_leaves: 0,
                notes: ''
            })
        }
        setModalOpen(true)
    }

    const closeModal = () => {
        setModalOpen(false)
        setSelectedStaff(null)
    }

    const handleSave = async () => {
        if (!selectedStaff) return
        setSaving(true)
        try {
            const payload = {
                staff_id: selectedStaff.id,
                month_id: monthId,
                lates_count: Number(formData.lates_count),
                lates_minutes: Number(formData.lates_minutes),
                no_shows_count: Number(formData.no_shows_count),
                annual_leaves: Number(formData.annual_leaves),
                sick_leaves: Number(formData.sick_leaves),
                unpaid_leaves: Number(formData.unpaid_leaves),
                other_leaves: Number(formData.other_leaves),
                notes: formData.notes,
            }

            const { data, error } = await supabase
                .from('hr_staff_attendance_monthly')
                .upsert(payload, { onConflict: 'staff_id, month_id' })
                .select()
                .single()

            if (error) throw error
            if (data) {
                setAttendanceDict(prev => ({
                    ...prev,
                    [selectedStaff.id]: data as HRStaffAttendanceMonthly
                }))
            }
            closeModal()
        } catch (err) {
            console.error('Error saving attendance:', err)
            const errMsg = language === 'vi' ? 'Đã xảy ra lỗi kết nối mạng khi lưu.' : 'A network error occurred while saving.'
            alert(errMsg)
        } finally {
            setSaving(false)
        }
    }

    if (loading && staffList.length === 0) {
        return <div className="min-h-screen bg-[#0b1530] flex items-center justify-center"><CircularLoader /></div>
    }

    return (
        <div className="min-h-screen bg-[#0b1530] text-gray-100 p-6 animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto">
                <div className="mb-6 ml-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                            {language === 'vi' ? 'Theo Dõi Chuyên Cần Hàng Tháng' : 'Monthly Attendance Tracker'}
                        </h1>
                        <p className="text-sm text-slate-400 mt-1">
                            {language === 'vi' 
                                ? 'Theo dõi số lần trễ và số ngày nghỉ phép gộp theo tháng cho nhân sự.' 
                                : 'Track lates, and leaves aggregated by month for your active staff.'}
                        </p>
                    </div>
                </div>

                {/* 1. City Selection Dropdown (White Theme) - Compresso (w-36) e con angoli rounded-lg */}
                <div className="mb-8 px-2 flex items-center gap-3 relative z-20">
                    <span className="text-sm font-semibold text-slate-400">{language === 'vi' ? 'Thành phố:' : 'City:'}</span>
                    <div className="relative inline-block text-left">
                        <button
                            type="button"
                            onClick={() => allowedCities.length > 1 && setCityDropdownOpen(!cityDropdownOpen)}
                            className={`inline-flex justify-between items-center gap-2 w-36 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900 transition-all outline-none ${
                                allowedCities.length > 1 ? 'hover:bg-gray-50 focus:ring-2 focus:ring-blue-500/50' : 'cursor-default opacity-85'
                            }`}
                        >
                            <span className="truncate">{selectedCity}</span>
                            {allowedCities.length > 1 && <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />}
                        </button>

                        {cityDropdownOpen && allowedCities.length > 1 && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setCityDropdownOpen(false)} />
                                <div className="absolute left-0 mt-2 w-36 rounded-lg bg-white border border-gray-200 shadow-xl z-20 focus:outline-none overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100">
                                    <div className="py-1">
                                        {allowedCities.includes('Ho Chi Minh') && (
                                            <button
                                                onClick={() => {
                                                    setSelectedCity('Ho Chi Minh')
                                                    setCityDropdownOpen(false)
                                                }}
                                                className={`w-full text-left px-3 py-2 text-sm font-semibold transition-colors ${
                                                    selectedCity === 'Ho Chi Minh'
                                                        ? 'bg-blue-600 text-white'
                                                        : 'text-gray-700 hover:bg-gray-100'
                                                }`}
                                            >
                                                Ho Chi Minh
                                            </button>
                                        )}
                                        {allowedCities.includes('Da Lat') && (
                                            <button
                                                onClick={() => {
                                                    setSelectedCity('Da Lat')
                                                    setCityDropdownOpen(false)
                                                }}
                                                className={`w-full text-left px-3 py-2 text-sm font-semibold transition-colors ${
                                                    selectedCity === 'Da Lat'
                                                        ? 'bg-blue-600 text-white'
                                                        : 'text-gray-700 hover:bg-gray-100'
                                                }`}
                                            >
                                                Da Lat
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* 2. MonthPicker a larghezza intera / posizionato da solo sotto il dropdown con spaziature aumentate */}
                <MonthPicker
                    value={toMonthInputValue(currentDate)}
                    onChange={(val) => {
                        const d = fromMonthInputValue(val)
                        if (d) setCurrentDate(d)
                    }}
                    language={language}
                    colorClass="text-blue-100 hover:text-white"
                    labelColorClass="text-white"
                    iconColorClass="text-blue-200 hover:text-white"
                    className="mt-6 mb-8 px-2"
                />

                {/* Search Bar */}
                <div className="mb-4 flex items-center justify-between gap-4 px-2">
                    <div className="relative w-80">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder={language === 'vi' ? 'Tìm nhân viên...' : 'Search staff...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-4 py-2 w-full bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                    </div>
                </div>

                {/* Table Area - rounded-lg */}
                <div className="rounded-lg bg-white shadow-xl overflow-hidden border border-gray-100">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <ColumnHeader
                                        colKey="full_name"
                                        label={language === 'vi' ? 'Nhân viên' : 'Staff Member'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={(k, asc) => {
                                            setSortKey(k)
                                            setSortAsc(asc)
                                        }}
                                        values={[]}
                                        activeFilter={null}
                                        onFilter={() => {}}
                                        onClear={() => {}}
                                        open={activeDropdown === 'full_name'}
                                        onToggle={() => setActiveDropdown(activeDropdown === 'full_name' ? null : 'full_name')}
                                        onClose={() => setActiveDropdown(null)}
                                        dict={dict}
                                    />
                                    <ColumnHeader
                                        colKey="position"
                                        label={language === 'vi' ? 'Chức vụ' : 'Position'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={(k, asc) => {
                                            setSortKey(k)
                                            setSortAsc(asc)
                                        }}
                                        values={uniquePositions}
                                        activeFilter={filterPosition}
                                        onFilter={setFilterPosition}
                                        onClear={() => setFilterPosition(null)}
                                        open={activeDropdown === 'position'}
                                        onToggle={() => setActiveDropdown(activeDropdown === 'position' ? null : 'position')}
                                        onClose={() => setActiveDropdown(null)}
                                        dict={dict}
                                    />
                                    <th className="px-5 py-4 text-center font-semibold text-gray-500 uppercase tracking-widest text-xs border-x border-gray-100" colSpan={3}>
                                        {language === 'vi' ? 'Đi Muộn' : 'Tardiness'}
                                    </th>
                                    <th className="px-5 py-4 text-center font-semibold text-gray-500 uppercase tracking-widest text-xs" colSpan={4}>
                                        {language === 'vi' ? 'Nghỉ Phép (Ngày)' : 'Leaves (Days)'}
                                    </th>
                                </tr>
                                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                                    <th className="px-3 py-2 text-center border-l border-gray-100 font-semibold">{language === 'vi' ? 'Số lần trễ' : 'Lates'}</th>
                                    <th className="px-3 py-2 text-center font-semibold">{language === 'vi' ? 'Số phút trễ' : 'Lates (Mins)'}</th>
                                    <th className="px-3 py-2 text-center font-semibold text-blue-600 bg-blue-50/50 border-r border-gray-100">{language === 'vi' ? 'Tỉ lệ TB' : 'Avg Rate'}</th>
                                    <th className="px-3 py-2 text-center font-semibold">{language === 'vi' ? 'Phép năm' : 'Annual'}</th>
                                    <th className="px-3 py-2 text-center font-semibold">{language === 'vi' ? 'Bệnh' : 'Sick'}</th>
                                    <th className="px-3 py-2 text-center font-semibold">{language === 'vi' ? 'Không lương' : 'Unpaid'}</th>
                                    <th className="px-3 py-2 text-center font-semibold">{language === 'vi' ? 'Khác' : 'Other'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedAndFilteredStaff.map((s, idx) => {
                                    const rec = attendanceDict[s.id] || {
                                        lates_count: 0,
                                        lates_minutes: 0,
                                        no_shows_count: 0,
                                        annual_leaves: 0,
                                        sick_leaves: 0,
                                        unpaid_leaves: 0,
                                        other_leaves: 0
                                    }

                                    const rate = rec.lates_count > 0 ? Math.round(rec.lates_minutes / rec.lates_count) : 0

                                    return (
                                        <tr 
                                            key={s.id} 
                                            onClick={() => openModal(s)}
                                            className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                                        >
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-indigo-800 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm">
                                                        {(s.full_name || '').split(/\s+/).filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <span className="text-sm font-semibold text-gray-900 block">{s.full_name}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-gray-500 text-sm">
                                                {s.position}
                                            </td>
                                            <td className="px-3 py-4 text-center border-l border-gray-100 text-gray-900 font-semibold">
                                                {rec.lates_count}
                                            </td>
                                            <td className="px-3 py-4 text-center text-gray-900 font-semibold">
                                                {rec.lates_minutes}
                                            </td>
                                            <td className="px-3 py-4 text-center text-blue-700 font-bold bg-blue-50/20 border-r border-gray-100">
                                                {rate > 0 ? `${rate}m` : '-'}
                                            </td>
                                            <td className="px-3 py-4 text-center text-gray-900 font-semibold">{rec.annual_leaves}</td>
                                            <td className="px-3 py-4 text-center text-gray-900 font-semibold">{rec.sick_leaves}</td>
                                            <td className="px-3 py-4 text-center text-gray-900 font-semibold">{rec.unpaid_leaves}</td>
                                            <td className="px-3 py-4 text-center text-gray-900 font-semibold">{rec.other_leaves}</td>
                                        </tr>
                                    )
                                })}
                                {sortedAndFilteredStaff.length === 0 && (
                                    <tr>
                                        <td colSpan={9} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                                            {language === 'vi' ? 'Không có dữ liệu nhân sự' : 'No staff data found'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal - Allineato a rounded-lg per input e pulsanti */}
            {modalOpen && selectedStaff && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={closeModal} />
                    
                    <div className="relative w-full max-w-lg bg-white rounded-lg shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
                        {saving && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
                                <CircularLoader />
                            </div>
                        )}
                        
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">
                                    {language === 'vi' ? 'Chỉnh Sửa Chuyên Cần' : 'Edit Attendance'}
                                </h3>
                                <p className="text-sm text-gray-500">{selectedStaff.full_name} &bull; <span className="capitalize">{displayMonth}</span></p>
                            </div>
                            <button onClick={closeModal} className="p-2 text-gray-400 hover:text-gray-650 hover:bg-gray-100 rounded-full transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-6">
                            {/* Tardiness Group */}
                            <div>
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                                    {language === 'vi' ? 'Đi Muộn' : 'Tardiness'}
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                                            {language === 'vi' ? 'Số lần trễ (Lần)' : 'Lates (Instances)'}
                                        </label>
                                        <input 
                                            type="number" min="0" step="1"
                                            value={formData.lates_count || ''}
                                            onChange={(e) => setFormData(p => ({ ...p, lates_count: e.target.value === '' ? 0 : Number(e.target.value) }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm font-semibold outline-none bg-gray-50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                                            {language === 'vi' ? 'Số phút trễ (Tổng số)' : 'Lates (Total Mins)'}
                                        </label>
                                        <input 
                                            type="number" min="0" step="1"
                                            value={formData.lates_minutes || ''}
                                            onChange={(e) => setFormData(p => ({ ...p, lates_minutes: e.target.value === '' ? 0 : Number(e.target.value) }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm font-semibold outline-none bg-gray-50"
                                        />
                                    </div>
                                </div>
                            </div>

                            <hr className="border-gray-100" />

                            {/* Leaves Group */}
                            <div>
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                                    {language === 'vi' ? 'Nghỉ Phép & Vắng Mặt' : 'Leaves & Absences'}
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                                            {language === 'vi' ? 'Nghỉ phép năm (Ngày)' : 'Annual Leaves (Days)'}
                                        </label>
                                        <input 
                                            type="number" min="0" step="0.5"
                                            value={formData.annual_leaves || ''}
                                            onChange={(e) => setFormData(p => ({ ...p, annual_leaves: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm font-semibold outline-none bg-gray-50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                                            {language === 'vi' ? 'Nghỉ bệnh (Ngày)' : 'Sick Leaves (Days)'}
                                        </label>
                                        <input 
                                            type="number" min="0" step="0.5"
                                            value={formData.sick_leaves || ''}
                                            onChange={(e) => setFormData(p => ({ ...p, sick_leaves: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm font-semibold outline-none bg-gray-50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                                            {language === 'vi' ? 'Nghỉ không lương (Ngày)' : 'Unpaid Leaves (Days)'}
                                        </label>
                                        <input 
                                            type="number" min="0" step="0.5"
                                            value={formData.unpaid_leaves || ''}
                                            onChange={(e) => setFormData(p => ({ ...p, unpaid_leaves: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm font-semibold outline-none bg-gray-50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                                            {language === 'vi' ? 'Nghỉ khác (Ngày)' : 'Other Leaves (Days)'}
                                        </label>
                                        <input 
                                            type="number" min="0" step="0.5"
                                            value={formData.other_leaves || ''}
                                            onChange={(e) => setFormData(p => ({ ...p, other_leaves: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) }))}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm font-semibold outline-none bg-gray-50"
                                        />
                                    </div>
                                </div>
                            </div>

                            <hr className="border-gray-100" />

                            {/* Notes Group */}
                            <div>
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                                    {language === 'vi' ? 'Ghi chú' : 'Notes'}
                                </h4>
                                <textarea 
                                    rows={2}
                                    value={formData.notes}
                                    onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 resize-none text-sm font-medium outline-none bg-gray-50"
                                    placeholder={language === 'vi' ? "Thêm ghi chú cụ thể về chuyên cần tháng này..." : "Add any specific comments about this month's attendance..."}
                                />
                            </div>
                        </div>

                        {/* Actions - Allineati a rounded-lg */}
                        <div className="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-4">
                            <button
                                onClick={closeModal}
                                className="px-4 py-2 text-gray-700 font-semibold hover:bg-gray-100 rounded-lg transition text-sm"
                            >
                                {language === 'vi' ? 'Hủy' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleSave}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition shadow-sm shadow-blue-500/20 text-sm"
                            >
                                <Save className="w-4 h-4" /> {language === 'vi' ? 'Lưu' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
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
    const ref = useRef<HTMLTableCellElement>(null)
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
        <th className={`px-4 py-3.5 ${right ? 'text-right' : ''} ${className} relative`} ref={ref}>
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
                    className="fixed bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] min-w-[220px] text-left text-sm text-gray-700 normal-case font-normal animate-in fade-in zoom-in-95 duration-100"
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

                    {values.length > 0 && (
                        <>
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
                        </>
                    )}
                </div>
            )}
        </th>
    )
}
