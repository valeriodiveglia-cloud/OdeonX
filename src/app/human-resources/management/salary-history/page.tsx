'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffSalaryHistory, HRStaffMember, SalaryType, HRDepartment, HRPosition } from '@/types/human-resources'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import SalaryModal from '@/components/human-resources/SalaryModal'
import {
    TrendingUp, Plus, Search, X, Pencil, Trash2,
    ArrowUpRight, DollarSign, Calendar, Users, Briefcase, TrendingDown
} from 'lucide-react'

/* ─── Helpers ─── */
const fmt = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n))

function ChangeIndicator({ prev, next, type, incType, incValue, prevType, newType }: { prev: number; next: number; type: string; incType?: string | null; incValue?: number | null; prevType?: string | null; newType?: string | null }) {
    if (prev === 0) return <span className="text-xs text-gray-400">New</span>
    
    if (prevType && newType && prevType !== newType) {
        return (
            <div className="flex flex-col items-center">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                    <TrendingDown className="w-3 h-3" /> Type Changed
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
                {isUp ? '+' : ''}{diff === 0 ? 'No Change' : `${pct}%`}
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
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Record</h3>
                <p className="text-sm text-gray-600 mb-6">
                    Are you sure you want to delete this record for <strong>{label}</strong>? This cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Cancel</button>
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
export default function SalaryHistoryPage() {
    const { language } = useSettings()
    const [loading, setLoading]       = useState(true)
    const [entries, setEntries]       = useState<(HRStaffSalaryHistory)[]>([])
    const [staffList, setStaffList]   = useState<HRStaffMember[]>([])
    const [departments, setDepartments] = useState<HRDepartment[]>([])
    const [positions, setPositions]   = useState<HRPosition[]>([])

    const [search, setSearch]         = useState('')
    const [filterStaff, setFilterStaff]   = useState('all')
    const [filterType, setFilterType] = useState('all')

    const [modalOpen, setModalOpen]       = useState(false)
    const [editingEntry, setEditingEntry] = useState<HRStaffSalaryHistory | null>(null)
    const [saving, setSaving]             = useState(false)

    const [deletingId, setDeletingId]     = useState<string | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)

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

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            const [staffRes, histRes, deptRes, posRes] = await Promise.all([
                supabase.from('hr_staff').select('*').order('full_name'),
                supabase.from('hr_staff_salary_history').select(`
                    *, 
                    hr_staff(*),
                    previous_position:hr_positions!hr_staff_salary_history_previous_position_id_fkey(name),
                    new_position:hr_positions!hr_staff_salary_history_new_position_id_fkey(name),
                    previous_department:hr_departments!hr_staff_salary_history_previous_department_id_fkey(name),
                    new_department:hr_departments!hr_staff_salary_history_new_department_id_fkey(name)
                `).order('effective_date', { ascending: false }),
                supabase.from('hr_departments').select('*').order('name'),
                supabase.from('hr_positions').select('*').order('name')
            ])
            if (staffRes.data) setStaffList(staffRes.data as HRStaffMember[])
            if (histRes.data) setEntries(histRes.data as any)
            if (deptRes.data) setDepartments(deptRes.data as HRDepartment[])
            if (posRes.data) setPositions(posRes.data as HRPosition[])
        } catch (err) { console.error(err) }
        setLoading(false)
    }, [])

    useEffect(() => { fetchAll() }, [fetchAll])

    const filtered = useMemo(() => {
        return entries.filter(e => {
            if (search) {
                const q = search.toLowerCase()
                const name = e.hr_staff?.full_name || ''
                if (!name.toLowerCase().includes(q) && !(e.reason || '').toLowerCase().includes(q)) return false
            }
            if (filterStaff !== 'all' && e.staff_id !== filterStaff) return false
            if (filterType !== 'all' && e.record_type !== filterType) return false
            return true
        })
    }, [entries, search, filterStaff, filterType])

    /* Summary */
    const totalChanges = entries.length
    const raisesCount = entries.filter(e => e.new_amount > e.previous_amount).length
    const promotionCount = entries.filter(e => e.record_type === 'promotion').length
    const uniqueStaff = new Set(entries.map(e => e.staff_id)).size

    const summaryCards = [
        { label: 'Total Events',   value: totalChanges, icon: TrendingUp,    color: 'text-blue-600',    bg: 'bg-blue-50' },
        { label: 'Promotions',     value: promotionCount, icon: Briefcase,   color: 'text-purple-600',  bg: 'bg-purple-50' },
        { label: 'Gross Salary Raises',  value: raisesCount,  icon: DollarSign,    color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: 'Staff Affected', value: uniqueStaff,  icon: Users,         color: 'text-amber-600',   bg: 'bg-amber-50' },
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
        } catch (err) { console.error(err); alert('Failed to save salary change') }
        setSaving(false)
    }

    const handleDelete = async () => {
        if (!deletingId) return
        setDeleteLoading(true)
        try {
            const { error } = await supabase.from('hr_staff_salary_history').delete().eq('id', deletingId)
            if (error) throw error
            setDeletingId(null); await fetchAll()
        } catch (err) { console.error(err); alert('Failed to delete') }
        setDeleteLoading(false)
    }

    if (loading) return <div className="min-h-screen flex items-center justify-center"><CircularLoader /></div>

    return (
        <div className="min-h-screen text-gray-100 p-6 animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Salary & Promotions</h1>
                        <p className="text-sm text-slate-400 mt-1">Track role changes, promotions, and gross salary adjustments for your team.</p>
                    </div>
                    <button onClick={() => { setEditingEntry(null); setModalOpen(true) }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition shadow hover:shadow-lg shrink-0">
                        <Plus className="w-4 h-4" />
                        Record Event
                    </button>
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

                {/* Filters */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="text" placeholder="Search name, reason…" value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none" />
                        {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10"><X className="w-3 h-3 text-slate-400" /></button>}
                    </div>
                    <select value={filterStaff} onChange={e => setFilterStaff(e.target.value)}
                        className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none">
                        <option value="all">All Staff</option>
                        {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                    <select value={filterType} onChange={e => setFilterType(e.target.value)}
                        className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none">
                        <option value="all">All Event Types</option>
                        <option value="promotion">Promotions</option>
                        <option value="salary_increase">Gross Salary Increases</option>
                    </select>
                    <span className="text-xs text-slate-500 ml-auto">{filtered.length} of {entries.length} shown</span>
                </div>

                {/* Table */}
                <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">Event</th>
                                    <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">Staff Member</th>
                                    <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">Date</th>
                                    <th className="text-right px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">Old Gross Salary</th>
                                    <th className="text-right px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">New Gross Salary</th>
                                    <th className="text-center px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">Increase</th>
                                    <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">Reason</th>
                                    <th className="text-center px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map((e, idx) => {
                                    const isPromo = e.record_type === 'promotion'
                                    return (
                                        <tr key={e.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                {isPromo ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-bold border border-purple-100">
                                                        <Briefcase className="w-3.5 h-3.5" /> Promotion
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100">
                                                        <TrendingUp className="w-3.5 h-3.5" /> Gross Salary Change
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
                                                                <span className="line-through text-gray-400">{e.previous_position?.name || 'No Position'}</span>
                                                                <ArrowUpRight className="w-3 h-3" />
                                                                <span className="font-semibold">{e.new_position?.name || 'No Position'}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-gray-500 block">{e.hr_staff?.position}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm font-medium text-gray-600">{new Date(e.effective_date).toLocaleDateString('en-GB')}</td>
                                            <td className="px-6 py-4 text-sm text-gray-500 text-right font-mono">{fmt(e.previous_amount)}</td>
                                            <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right font-mono">{fmt(e.new_amount)}</td>
                                            <td className="px-6 py-4 text-center">
                                                <ChangeIndicator prev={e.previous_amount} next={e.new_amount} type={e.record_type} incType={e.increase_type} incValue={e.increase_value} prevType={e.previous_salary_type} newType={e.salary_type} />
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm font-medium text-gray-700 block truncate max-w-[150px]">{e.reason || '—'}</span>
                                                <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                                                    {e.previous_salary_type && e.previous_salary_type !== e.salary_type 
                                                        ? `${e.previous_salary_type === 'fixed' ? 'Full-Time' : 'Part-Time'} → ${e.salary_type === 'fixed' ? 'Full-Time' : 'Part-Time'}` 
                                                        : (e.salary_type === 'fixed' ? 'Full-Time' : 'Part-Time')}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
                                                    <button onClick={() => { setEditingEntry(e); setModalOpen(true) }}
                                                        className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition" title="Edit">
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => setDeletingId(e.id)}
                                                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition" title="Delete">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-16 text-center">
                                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                                                <Briefcase className="w-8 h-8 text-gray-300" />
                                            </div>
                                            <p className="text-gray-900 text-base font-bold mb-1">
                                                {entries.length === 0 ? 'No history recorded' : 'No results found'}
                                            </p>
                                            <p className="text-gray-500 text-sm">
                                                {entries.length === 0 ? 'Start tracking promotions and salary increases.' : 'Try adjusting your filters.'}
                                            </p>
                                            {entries.length === 0 && (
                                                <button onClick={() => { setEditingEntry(null); setModalOpen(true) }}
                                                    className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition">
                                                    Record First Event
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
                onSave={handleSave} entry={editingEntry} staffList={staffList} departments={departments} positions={positions} saving={saving} loggedUserName={loggedUserName} />

            {deletingId && (
                <DeleteConfirm
                    label={entries.find(e => e.id === deletingId)?.hr_staff?.full_name || ''}
                    onConfirm={handleDelete} onCancel={() => setDeletingId(null)} deleting={deleteLoading} />
            )}
        </div>
    )
}
