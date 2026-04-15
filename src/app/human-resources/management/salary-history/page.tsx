'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffSalaryHistory, HRStaffMember, SalaryType } from '@/types/human-resources'
import CircularLoader from '@/components/CircularLoader'
import {
    TrendingUp, Plus, Search, X, Pencil, Trash2,
    ArrowUpRight, DollarSign, Calendar, Users
} from 'lucide-react'

/* ─── Helpers ─── */
const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)

function ChangeIndicator({ prev, next }: { prev: number; next: number }) {
    if (prev === 0) return <span className="text-xs text-gray-400">New</span>
    const diff = next - prev
    const pct = ((diff / prev) * 100).toFixed(1)
    const isUp = diff > 0
    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${isUp ? 'text-emerald-600' : 'text-red-600'}`}>
            <ArrowUpRight className={`w-3 h-3 ${isUp ? '' : 'rotate-180'}`} />
            {isUp ? '+' : ''}{pct}%
        </span>
    )
}

/* ─── Modal ─── */
interface SalaryModalProps {
    open: boolean
    onClose: () => void
    onSave: (data: Partial<HRStaffSalaryHistory>) => Promise<void>
    entry: HRStaffSalaryHistory | null
    staffList: HRStaffMember[]
    saving: boolean
}

function SalaryModal({ open, onClose, onSave, entry, staffList, saving }: SalaryModalProps) {
    const [staffId, setStaffId]           = useState('')
    const [effectiveDate, setEffectiveDate] = useState('')
    const [prevAmount, setPrevAmount]     = useState('')
    const [newAmount, setNewAmount]       = useState('')
    const [salaryType, setSalaryType]     = useState<SalaryType>('fixed')
    const [reason, setReason]             = useState('')
    const [approvedBy, setApprovedBy]     = useState('')
    const [notes, setNotes]               = useState('')

    // When staff is selected and it's a new entry, auto-fill previous amount
    useEffect(() => {
        if (!entry && staffId) {
            const staff = staffList.find(s => s.id === staffId)
            if (staff) {
                setPrevAmount(staff.salary_amount ? new Intl.NumberFormat('en-US').format(staff.salary_amount) : '')
                setSalaryType(staff.salary_type)
            }
        }
    }, [staffId, entry, staffList])

    useEffect(() => {
        if (entry) {
            setStaffId(entry.staff_id)
            setEffectiveDate(entry.effective_date || '')
            setPrevAmount(entry.previous_amount ? new Intl.NumberFormat('en-US').format(entry.previous_amount) : '')
            setNewAmount(entry.new_amount ? new Intl.NumberFormat('en-US').format(entry.new_amount) : '')
            setSalaryType(entry.salary_type as SalaryType)
            setReason(entry.reason || '')
            setApprovedBy(entry.approved_by || '')
            setNotes(entry.notes || '')
        } else {
            setStaffId(''); setEffectiveDate(new Date().toISOString().slice(0, 10))
            setPrevAmount(''); setNewAmount(''); setSalaryType('fixed')
            setReason(''); setApprovedBy(''); setNotes('')
        }
    }, [entry, open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        await onSave({
            staff_id: staffId,
            effective_date: effectiveDate,
            previous_amount: Number(prevAmount.replace(/,/g, '')) || 0,
            new_amount: Number(newAmount.replace(/,/g, '')) || 0,
            salary_type: salaryType,
            reason: reason.trim() || null,
            approved_by: approvedBy.trim() || null,
            notes: notes.trim() || null,
        })
    }

    const changePreview = prevAmount && newAmount && Number(prevAmount.replace(/,/g, '')) > 0 && Number(newAmount.replace(/,/g, '')) > 0
        ? (((Number(newAmount.replace(/,/g, '')) - Number(prevAmount.replace(/,/g, ''))) / Number(prevAmount.replace(/,/g, ''))) * 100).toFixed(1)
        : null

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {entry ? 'Edit Salary Change' : 'Record Salary Change'}
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Staff + Date */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Staff Member *</label>
                            <select required value={staffId} onChange={e => setStaffId(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                <option value="">Select staff…</option>
                                {staffList.filter(s => s.status === 'active').map(s => (
                                    <option key={s.id} value={s.id}>{s.full_name} — {s.position}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Effective Date *</label>
                            <input type="date" required value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                    </div>

                    {/* Salary Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Salary Type</label>
                        <div className="flex gap-3">
                            <button type="button" onClick={() => setSalaryType('fixed')}
                                className={`px-4 py-2 rounded-lg border text-sm font-medium transition
                                    ${salaryType === 'fixed' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                                Fixed / Month
                            </button>
                            <button type="button" onClick={() => setSalaryType('hourly')}
                                className={`px-4 py-2 rounded-lg border text-sm font-medium transition
                                    ${salaryType === 'hourly' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                                Hourly
                            </button>
                        </div>
                    </div>

                    {/* Previous + New Amount */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Previous Amount (VND) *</label>
                            <input type="text" required value={prevAmount} onChange={e => {
                                const val = e.target.value.replace(/\D/g, '')
                                setPrevAmount(val ? new Intl.NumberFormat('en-US').format(parseInt(val, 10)) : '')
                            }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">New Amount (VND) *</label>
                            <input type="text" required value={newAmount} onChange={e => {
                                const val = e.target.value.replace(/\D/g, '')
                                setNewAmount(val ? new Intl.NumberFormat('en-US').format(parseInt(val, 10)) : '')
                            }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                    </div>

                    {/* Change Preview */}
                    {changePreview && (
                        <div className={`flex items-center gap-2 p-3 rounded-lg ${Number(changePreview) >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                            <ArrowUpRight className={`w-4 h-4 ${Number(changePreview) >= 0 ? 'text-emerald-600' : 'text-red-600 rotate-180'}`} />
                            <span className={`text-sm font-medium ${Number(changePreview) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                {Number(changePreview) >= 0 ? '+' : ''}{changePreview}% change
                                ({fmt(Number(newAmount.replace(/,/g, '')) - Number(prevAmount.replace(/,/g, '')))} VND {salaryType === 'fixed' ? '/month' : '/hour'})
                            </span>
                        </div>
                    )}

                    {/* Reason + Approved By */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                            <input value={reason} onChange={e => setReason(e.target.value)}
                                placeholder="e.g. Annual review, Promotion…"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Approved By</label>
                            <input value={approvedBy} onChange={e => setApprovedBy(e.target.value)}
                                placeholder="e.g. Manager Name"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none" />
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                        <button type="button" onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving || !staffId || !effectiveDate || !newAmount}
                            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                            {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            {entry ? 'Update' : 'Record'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

/* ─── Delete Confirm ─── */
function DeleteConfirm({ label, onConfirm, onCancel, deleting }: {
    label: string; onConfirm: () => void; onCancel: () => void; deleting: boolean
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Salary Record</h3>
                <p className="text-sm text-gray-600 mb-6">
                    Are you sure you want to delete this salary change for <strong>{label}</strong>? This cannot be undone.
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
    const [loading, setLoading]       = useState(true)
    const [entries, setEntries]       = useState<(HRStaffSalaryHistory & { hr_staff: HRStaffMember })[]>([])
    const [staffList, setStaffList]   = useState<HRStaffMember[]>([])

    const [search, setSearch]         = useState('')
    const [filterStaff, setFilterStaff]   = useState('all')

    const [modalOpen, setModalOpen]       = useState(false)
    const [editingEntry, setEditingEntry] = useState<HRStaffSalaryHistory | null>(null)
    const [saving, setSaving]             = useState(false)

    const [deletingId, setDeletingId]     = useState<string | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            const [staffRes, histRes] = await Promise.all([
                supabase.from('hr_staff').select('*').order('full_name'),
                supabase.from('hr_staff_salary_history').select('*, hr_staff(*)').order('effective_date', { ascending: false }),
            ])
            if (staffRes.data) setStaffList(staffRes.data as HRStaffMember[])
            if (histRes.data) setEntries(histRes.data as any)
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
            return true
        })
    }, [entries, search, filterStaff])

    /* Summary */
    const totalChanges = entries.length
    const avgRaise = entries.length > 0
        ? (entries.reduce((sum, e) => {
            if (e.previous_amount === 0) return sum
            return sum + ((e.new_amount - e.previous_amount) / e.previous_amount * 100)
        }, 0) / entries.filter(e => e.previous_amount > 0).length).toFixed(1)
        : '—'
    const raisesCount = entries.filter(e => e.new_amount > e.previous_amount).length
    const uniqueStaff = new Set(entries.map(e => e.staff_id)).size

    const summaryCards = [
        { label: 'Total Changes',  value: totalChanges, icon: TrendingUp,    color: 'text-blue-600',    bg: 'bg-blue-50' },
        { label: 'Avg Raise %',    value: avgRaise === '—' ? '—' : `${avgRaise}%`, icon: ArrowUpRight, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: 'Raises',         value: raisesCount,  icon: DollarSign,    color: 'text-amber-600',   bg: 'bg-amber-50' },
        { label: 'Staff Affected', value: uniqueStaff,  icon: Users,         color: 'text-purple-600',  bg: 'bg-purple-50' },
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

                // Also update the staff's current salary
                if (data.staff_id && data.new_amount != null) {
                    await supabase.from('hr_staff').update({
                        salary_amount: data.new_amount,
                        salary_type: data.salary_type,
                    }).eq('id', data.staff_id)
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

    if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><CircularLoader /></div>

    return (
        <div className="min-h-screen bg-slate-900 text-gray-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Salary History</h1>
                        <p className="text-sm text-slate-400 mt-1">Track salary changes and raises for your team.</p>
                    </div>
                    <button onClick={() => { setEditingEntry(null); setModalOpen(true) }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition shadow hover:shadow-lg shrink-0">
                        <Plus className="w-4 h-4" />
                        Record Change
                    </button>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    {summaryCards.map(c => (
                        <div key={c.label} className="rounded-xl bg-white shadow-sm p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className={`p-1.5 rounded-lg ${c.bg}`}><c.icon className={`w-4 h-4 ${c.color}`} /></div>
                                <span className="text-xs text-gray-500">{c.label}</span>
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
                        className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                        <option value="all">All Staff</option>
                        {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                    <span className="text-xs text-slate-500 ml-auto">{filtered.length} of {entries.length} shown</span>
                </div>

                {/* Table */}
                <div className="rounded-2xl bg-white shadow-md overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">#</th>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Staff Member</th>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Effective Date</th>
                                    <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Previous</th>
                                    <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-gray-500">New</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Change</th>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Type</th>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Reason</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((e, idx) => {
                                    const diff = e.new_amount - e.previous_amount
                                    const isRaise = diff > 0
                                    return (
                                        <tr key={e.id} className={`border-t border-gray-100 hover:bg-gray-50/80 transition-colors ${idx % 2 === 0 ? 'bg-gray-50/30' : ''}`}>
                                            <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                                        {(e.hr_staff?.full_name || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="text-sm font-medium text-gray-900 block truncate">{e.hr_staff?.full_name}</span>
                                                        <span className="text-xs text-gray-400 block">{e.hr_staff?.position}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600">{e.effective_date}</td>
                                            <td className="px-4 py-3 text-sm text-gray-500 text-right">{fmt(e.previous_amount)}</td>
                                            <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">{fmt(e.new_amount)}</td>
                                            <td className="px-4 py-3 text-center">
                                                <ChangeIndicator prev={e.previous_amount} next={e.new_amount} />
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                                                    e.salary_type === 'fixed' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                                                }`}>
                                                    {e.salary_type === 'fixed' ? 'Fixed' : 'Hourly'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">{e.reason || '—'}</td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-1">
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
                                        <td colSpan={9} className="px-4 py-16 text-center">
                                            <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                            <p className="text-gray-500 text-sm font-medium">
                                                {entries.length === 0 ? 'No salary changes recorded yet' : 'No results match your filters'}
                                            </p>
                                            {entries.length === 0 && (
                                                <button onClick={() => { setEditingEntry(null); setModalOpen(true) }}
                                                    className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">
                                                    + Record your first salary change
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
                onSave={handleSave} entry={editingEntry} staffList={staffList} saving={saving} />

            {deletingId && (
                <DeleteConfirm
                    label={entries.find(e => e.id === deletingId)?.hr_staff?.full_name || ''}
                    onConfirm={handleDelete} onCancel={() => setDeletingId(null)} deleting={deleteLoading} />
            )}
        </div>
    )
}
