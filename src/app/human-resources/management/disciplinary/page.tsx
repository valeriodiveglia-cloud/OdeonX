'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Loader2, Trash2, Pencil, X, CheckCircle, ChevronLeft, ChevronRight, CalendarDays, User, Search, FileDown } from 'lucide-react'
import { saveAs } from 'file-saver'
import { supabase } from '@/lib/supabase_shim'
import { HRDisciplinaryCatalog, HRStaffFine, HRStaffMember } from '@/types/human-resources'

const fmtVND = (n: number | null) => {
    if (n === null || isNaN(n)) return '0'
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
}

const fmtDate = (d: string) => {
    if (!d) return ''
    const [y, m, day] = d.split('-')
    return `${day}/${m}/${y}`
}

function ExportModal({ onClose, onExport }: { onClose: () => void, onExport: (range: 'this_month' | 'prev_month' | 'all' | 'custom', start?: string, end?: string) => void }) {
    const [range, setRange] = useState<'this_month' | 'prev_month' | 'all' | 'custom'>('this_month')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Fines</h3>
                
                <div className="space-y-3 mb-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={range === 'this_month'} onChange={() => setRange('this_month')} className="text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">This Month</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={range === 'prev_month'} onChange={() => setRange('prev_month')} className="text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">Previous Month</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={range === 'custom'} onChange={() => setRange('custom')} className="text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">Custom Dates</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={range === 'all'} onChange={() => setRange('all')} className="text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">All Time</span>
                    </label>

                    {range === 'custom' && (
                        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-100">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">From</label>
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">To</label>
                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Cancel</button>
                    <button 
                        onClick={() => onExport(range, startDate, endDate)} 
                        disabled={range === 'custom' && (!startDate || !endDate)}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                    >
                        <FileDown className="w-4 h-4" />
                        Export
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function DisciplinaryPage() {
    const [fines, setFines] = useState<(HRStaffFine & { staff?: { id: string, full_name: string } })[]>([])
    const [catalog, setCatalog] = useState<HRDisciplinaryCatalog[]>([])
    const [staffList, setStaffList] = useState<HRStaffMember[]>([])
    const [loading, setLoading] = useState(false)
    const [modalOpen, setModalOpen] = useState(false)
    const [exportModalOpen, setExportModalOpen] = useState(false)
    const [editingNode, setEditingNode] = useState<HRStaffFine | null>(null)
    
    const now = new Date()
    const [year, setYear] = useState<number>(now.getFullYear())
    const [month, setMonth] = useState<number>(now.getMonth())

    const [loggedUserName, setLoggedUserName] = useState<string>('')

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

    const monthLabel = new Date(year, month).toLocaleString('en-US', { month: 'long', year: 'numeric' })
    const monthInputValue = `${year}-${String(month + 1).padStart(2, '0')}`

    const fetchAll = useCallback(async () => {
        setLoading(true)
        const endDate = new Date(year, month + 1, 0) // last day
        
        try {
            const [finesRes, catRes, staffRes] = await Promise.all([
                supabase.from('hr_staff_fines')
                    .select('*, staff:hr_staff(id, full_name)')
                    .gte('date', `${year}-${String(month + 1).padStart(2, '0')}-01`)
                    .lte('date', `${year}-${String(month + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`)
                    .order('date', { ascending: false }),
                supabase.from('hr_disciplinary_catalog')
                    .select('*')
                    .order('infraction_name', { ascending: true }),
                supabase.from('hr_staff')
                    .select('*')
                    .eq('status', 'active')
                    .order('full_name', { ascending: true })
            ])
                
            if (finesRes.error) throw finesRes.error
            if (catRes.error) throw catRes.error
            if (staffRes.error) throw staffRes.error

            // Merge fines with staff info correctly (Supabase returns staff as object or array of objects)
            const mappedFines = (finesRes.data || []).map(f => {
                const s = Array.isArray(f.staff) ? f.staff[0] : f.staff;
                return { ...f, staff: s }
            })

            setFines(mappedFines)
            setCatalog(catRes.data as HRDisciplinaryCatalog[] || [])
            setStaffList(staffRes.data as HRStaffMember[] || [])
        } catch (err) {
            console.error('Error fetching data', err)
        } finally {
            setLoading(false)
        }
    }, [year, month])

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

    async function handleSave(formData: Partial<HRStaffFine>) {
        try {
            if (editingNode) {
                const { error } = await supabase.from('hr_staff_fines').update(formData).eq('id', editingNode.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('hr_staff_fines').insert([formData])
                if (error) throw error
            }
            fetchAll()
            setModalOpen(false)
        } catch (err) {
            console.error(err)
            alert('Failed to save disciplinary action')
        }
    }
    
    async function handleDelete(id: string) {
        if (!window.confirm('Are you sure you want to delete this action?')) return
        try {
            const { error } = await supabase.from('hr_staff_fines').delete().eq('id', id)
            if (error) throw error
            fetchAll()
        } catch (err) {
            console.error(err)
            alert('Failed to delete disciplinary action')
        }
    }

    async function handleStatusChange(id: string, newStatus: string) {
        try {
            setFines(prev => prev.map(f => f.id === id ? { ...f, status: newStatus as any } : f))
            const { error } = await supabase.from('hr_staff_fines').update({ status: newStatus }).eq('id', id)
            if (error) throw error
        } catch(err) {
            console.error(err)
            alert('Failed to update status')
            fetchAll()
        }
    }

    const handleExport = async (range: 'this_month' | 'prev_month' | 'all' | 'custom', startDate?: string, endDate?: string) => {
        const ExcelJS = (await import('exceljs')).default

        let query = supabase.from('hr_staff_fines').select('*, staff:hr_staff(id, full_name)')
        
        const dnow = new Date()
        let fileNameSuffix = 'All_Time'
        
        if (range === 'this_month') {
            const y = dnow.getFullYear()
            const m = String(dnow.getMonth() + 1).padStart(2, '0')
            const start = `${y}-${m}-01`
            const lastDay = new Date(y, dnow.getMonth() + 1, 0).getDate()
            const end = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
            query = query.gte('date', start).lte('date', end)
            
            const mName = dnow.toLocaleString('default', { month: 'long', year: 'numeric' })
            fileNameSuffix = mName.replace(' ', '_')
        } else if (range === 'prev_month') {
            const prev = new Date(dnow.getFullYear(), dnow.getMonth() - 1, 1)
            const y = prev.getFullYear()
            const m = String(prev.getMonth() + 1).padStart(2, '0')
            const start = `${y}-${m}-01`
            const lastDay = new Date(y, prev.getMonth() + 1, 0).getDate()
            const end = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
            query = query.gte('date', start).lte('date', end)

            const mName = prev.toLocaleString('default', { month: 'long', year: 'numeric' })
            fileNameSuffix = mName.replace(' ', '_')
        } else if (range === 'custom' && startDate && endDate) {
            query = query.gte('date', startDate).lte('date', endDate)
            fileNameSuffix = `${startDate}_to_${endDate}`
        }

        const { data, error } = await query.order('date', { ascending: false })
        if (error) {
            alert('Error fetching data for export')
            return
        }

        const dataToExport = data || []

        const workbook = new ExcelJS.Workbook()
        const sheet = workbook.addWorksheet('Fines')

        sheet.columns = [
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Staff Name', key: 'name', width: 25 },
            { header: 'Infraction', key: 'infraction', width: 30 },
            { header: 'Notified By', key: 'notified_by', width: 20 },
            { header: 'Source', key: 'source', width: 20 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Amount (VND)', key: 'amount', width: 18, style: { numFmt: '#,##0' } },
        ]

        sheet.getRow(1).font = { bold: true }
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }

        dataToExport.forEach(e => {
            const s = Array.isArray(e.staff) ? e.staff[0] : e.staff
            
            sheet.addRow({
                date: new Date(e.date).toLocaleDateString('en-GB'),
                name: s ? s.full_name : 'Unknown',
                infraction: e.infraction,
                notified_by: e.notified_by || '-',
                source: (e.deduction_source || '-').replace('_', ' ').toUpperCase(),
                status: e.status.toUpperCase(),
                amount: e.amount || 0
            })
        })

        const buffer = await workbook.xlsx.writeBuffer()
        saveAs(new Blob([buffer]), `Fines_Export_${fileNameSuffix}.xlsx`)
        
        setExportModalOpen(false)
    }

    const totalAmount = fines.reduce((sum, f) => sum + Number(f.amount || 0), 0)

    const baseBtn = 'flex items-center gap-1 text-gray-500 hover:text-gray-900 transition'

    return (
        <div className="min-h-screen text-gray-100 p-6 animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto space-y-6">
                
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Disciplinary Actions & Fines</h1>
                        <p className="text-sm text-slate-400 mt-1">Manage global disciplinary records and salary deductions across all staff.</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button 
                            onClick={() => setExportModalOpen(true)}
                            className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-white/10 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
                        >
                            <FileDown className="w-4 h-4" /> Export
                        </button>
                        <button 
                            onClick={() => { setEditingNode(null); setModalOpen(true); }} 
                            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
                        >
                            <Plus className="w-4 h-4" /> Add Action
                        </button>
                    </div>
                </div>

                {/* Month Nav */}
                <div className="flex items-center justify-between text-sm text-blue-100 pt-4 mb-4">
                    <button type="button" onClick={prevMonth} className="flex items-center gap-1 hover:text-white transition-colors">
                        <ChevronLeft className="w-4 h-4" /> <span>Previous</span>
                    </button>
                    <div className="flex items-center gap-2 text-white">
                        <span className="text-base font-semibold">{monthLabel}</span>
                        <div className="relative w-5 h-5 group">
                            <CalendarDays className="w-5 h-5 text-blue-200 group-hover:text-blue-100 transition-colors cursor-pointer" />
                            <input type="month" value={monthInputValue} onChange={e => onPickMonth(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                        </div>
                    </div>
                    <button type="button" onClick={nextMonth} className="flex items-center gap-1 hover:text-white transition-colors">
                        <span>Next</span> <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                {/* Table Area */}
                <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs font-semibold uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3 border-r border-gray-100">Date</th>
                                    <th className="px-4 py-3 border-r border-gray-100">Staff Name</th>
                                    <th className="px-4 py-3 border-r border-gray-100">Infraction</th>
                                    <th className="px-4 py-3 border-r border-gray-100">Notified By</th>
                                    <th className="px-4 py-3 border-r border-gray-100">Source</th>
                                    <th className="px-4 py-3 border-r border-gray-100 text-center">Status</th>
                                    <th className="px-4 py-3 border-r border-gray-100 text-right">Amount (VND)</th>
                                    <th className="px-4 py-3 text-center w-24">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={8} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></td></tr>
                            ) : fines.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-12 text-gray-400">
                                        No disciplinary actions recorded for {monthLabel}.
                                    </td>
                                </tr>
                            ) : (
                                fines.map(f => (
                                    <tr key={f.id} className="hover:bg-gray-50 transition-colors group">
                                        <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-900 font-medium">
                                            {fmtDate(f.date)}
                                        </td>
                                        <td className="px-4 py-3 border-r border-gray-100 text-gray-900 font-medium">
                                            {f.staff ? f.staff.full_name : <span className="text-gray-400 italic">Unknown</span>}
                                        </td>
                                        <td className="px-4 py-3 border-r border-gray-100 text-gray-700 max-w-xs truncate" title={f.infraction}>
                                            {f.infraction}
                                        </td>
                                        <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-600">
                                            {f.notified_by || '-'}
                                        </td>
                                        <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-gray-600 capitalize">
                                            {(f.deduction_source || '-').replace('_', ' ')}
                                        </td>
                                        <td className="px-4 py-3 border-r border-gray-100 text-center">
                                            <select 
                                                value={f.status} 
                                                onChange={(e) => handleStatusChange(f.id, e.target.value)}
                                                className={`text-[10px] font-bold tracking-wider uppercase cursor-pointer rounded-full border px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-transparent hover:bg-white
                                                    ${f.status === 'paid' ? 'text-emerald-600 border-emerald-200' : 
                                                      f.status === 'waived' ? 'text-gray-600 border-gray-200' :
                                                      f.status === 'disputed' ? 'text-red-600 border-red-200' :
                                                      'text-amber-600 border-amber-200'}
                                                `}
                                            >
                                                <option value="pending">PENDING</option>
                                                <option value="paid">PAID</option>
                                                <option value="waived">WAIVED</option>
                                                <option value="disputed">DISPUTED</option>
                                            </select>
                                        </td>
                                        <td className="px-4 py-3 border-r border-gray-100 text-right font-mono font-medium text-orange-600">
                                            {fmtVND(f.amount)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => { setEditingNode(f); setModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleDelete(f.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                            </tbody>
                            {!loading && fines.length > 0 && (
                                <tfoot className="bg-gray-50 border-t border-gray-200 text-sm font-bold text-gray-900">
                                    <tr>
                                        <td colSpan={6} className="px-4 py-3 text-right">Total Disciplinary Fines</td>
                                        <td className="px-4 py-3 text-right text-orange-600 font-mono">{fmtVND(totalAmount)}</td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>

                {/* Modal */}
                {modalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
                                <h3 className="text-lg font-bold text-gray-900">{editingNode ? 'Edit Disciplinary Action' : 'Add Disciplinary Action'}</h3>
                                <button onClick={() => setModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-900 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6 overflow-y-auto space-y-4">
                                <FormFineGlobal 
                                    initialData={editingNode} 
                                    catalog={catalog}
                                    staffList={staffList}
                                    loggedUserName={loggedUserName} 
                                    onSave={handleSave} 
                                    onCancel={() => setModalOpen(false)} 
                                />
                            </div>
                        </div>
                    </div>
                )}

                {exportModalOpen && (
                    <ExportModal onClose={() => setExportModalOpen(false)} onExport={handleExport} />
                )}
            </div>
        </div>
    )
}

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

    // Staff searchable dropdown state
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

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!staffId) {
            alert('Please select a staff member.')
            return
        }
        if (!infraction || amount < 0 || !date) return
        setSubmitting(true)
        onSave({
            staff_id: staffId,
            date,
            infraction,
            amount,
            notified_by: notifiedBy,
            deduction_source: deductionSource,
            status: initialData ? initialData.status : 'pending'
        })
    }

    // Filter catalog based on selected staff's applicability if possible.
    // If no staff is selected, show all.
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
            
            {/* Searchable Staff Selection */}
            <div className="relative" ref={dropdownRef}>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Staff Member <span className="text-red-500">*</span></label>
                <div 
                    className={`w-full px-3 py-2 bg-white border ${staffId ? 'border-blue-300' : 'border-gray-200'} rounded-lg text-sm focus-within:ring-2 focus-within:ring-blue-500 flex items-center justify-between cursor-pointer`}
                    onClick={() => setStaffDropdownOpen(true)}
                >
                    <span className={staffId ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                        {selectedStaffObj ? selectedStaffObj.full_name : 'Search staff...'}
                    </span>
                    <Search className="w-4 h-4 text-gray-400" />
                </div>

                {staffDropdownOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 flex flex-col">
                        <div className="p-2 border-b border-gray-100 shrink-0">
                            <input 
                                type="text"
                                autoFocus
                                value={searchStaff}
                                onChange={e => setSearchStaff(e.target.value)}
                                placeholder="Type to filter..."
                                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <ul className="overflow-y-auto py-1">
                            {filteredStaff.length === 0 ? (
                                <li className="px-4 py-3 text-sm text-gray-500 text-center">No active staff found.</li>
                            ) : (
                                filteredStaff.map(s => (
                                    <li 
                                        key={s.id} 
                                        className={`px-4 py-2 text-sm cursor-pointer hover:bg-blue-50 transition-colors ${staffId === s.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'}`}
                                        onClick={() => {
                                            setStaffId(s.id)
                                            setStaffDropdownOpen(false)
                                            setSearchStaff('')
                                        }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                                <User className="w-3 h-3 text-gray-400" />
                                            </div>
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
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Date <span className="text-red-500">*</span></label>
                    <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Deduction Source</label>
                    <select value={deductionSource} onChange={e => setDeductionSource(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="salary">Gross Salary Deduction</option>
                        <option value="service_charge">Service Charge Deduction</option>
                        <option value="cash">Direct Cash/Transfer</option>
                    </select>
                </div>
            </div>

            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Infraction <span className="text-red-500">*</span></label>
                <select required value={infraction} onChange={handleCatalogSelect} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="" disabled>Select an infraction...</option>
                    {applicableCatalog.map(c => (
                        <option key={c.id} value={c.infraction_name}>{c.infraction_name}</option>
                    ))}
                    {initialData && !applicableCatalog.find(c => c.infraction_name === initialData.infraction) && (
                        <option value={initialData.infraction}>{initialData.infraction} (Legacy/Manual)</option>
                    )}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                    {staffId ? 'Showing applicable infractions for selected staff.' : 'Select a staff member to filter applicable infractions.'}
                </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Amount (VND) <span className="text-red-500">*</span></label>
                    <input type="text" required value={displayAmount} 
                        onChange={e => {
                            let val = e.target.value.replace(/[^0-9]/g, '');
                            if (val) {
                                setDisplayAmount(parseInt(val, 10).toLocaleString('en-US'))
                                setAmount(parseInt(val, 10))
                            } else {
                                setDisplayAmount('')
                                setAmount(0)
                            }
                        }}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Notified By</label>
                    <input type="text" value={notifiedBy || ''} onChange={e => setNotifiedBy(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Name of enforcer" />
                </div>
            </div>
            {!notifiedBy && loggedUserName && (
                <div className="flex justify-end -mt-2">
                    <button type="button" onClick={() => setNotifiedBy(loggedUserName)} className="px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-md text-xs font-medium hover:bg-blue-100 transition whitespace-nowrap">
                        Fill my name
                    </button>
                </div>
            )}

            <div className="pt-4 flex justify-end gap-2 border-t border-gray-100 mt-6">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition">Cancel</button>
                <button type="submit" disabled={submitting || !staffId || !infraction || amount < 0} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {submitting ? 'Saving...' : 'Save Fine'}
                </button>
            </div>
        </form>
    )
}
