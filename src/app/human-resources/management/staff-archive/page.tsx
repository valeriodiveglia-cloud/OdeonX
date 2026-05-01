'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffMember, HRStaffSalaryHistory } from '@/types/human-resources'
import CircularLoader from '@/components/CircularLoader'
import {
    Users, Search, X, TrendingDown, ArrowLeft, Building2, Folders
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function StaffArchivePage() {
    const [loading, setLoading] = useState(true)
    const [archivedStaff, setArchivedStaff] = useState<(HRStaffMember & { departureRecord?: HRStaffSalaryHistory })[]>([])
    const [search, setSearch] = useState('')
    const [filterType, setFilterType] = useState('all')
    const router = useRouter()

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            // Fetch inactive staff
            const { data: staffData } = await supabase
                .from('hr_staff')
                .select('*, hr_staff_branches(*)')
                .in('status', ['inactive', 'terminated'])
                .order('full_name')

            // Fetch departure records
            const { data: historyData } = await supabase
                .from('hr_staff_salary_history')
                .select('*')
                .in('record_type', ['dismissal', 'resignation'])
                .order('effective_date', { ascending: false })

            if (staffData && historyData) {
                // Map departure record to staff (take the most recent one for each staff)
                const merged = staffData.map(staff => {
                    const departureRecord = historyData.find(h => h.staff_id === staff.id)
                    return { ...staff, departureRecord }
                })
                setArchivedStaff(merged as any)
            }
        } catch (err) {
            console.error(err)
        }
        setLoading(false)
    }, [])

    useEffect(() => { fetchAll() }, [fetchAll])

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

    return (
        <div className="min-h-screen text-gray-100 p-6 animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto">
                <div className="mb-4">
                    <Link href="/human-resources/management/staff" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white transition">
                        <ArrowLeft className="w-4 h-4" /> Back to Staff Management
                    </Link>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Folders className="w-6 h-6 text-gray-400" />
                            Staff Archive
                        </h1>
                        <p className="text-sm text-slate-400 mt-1">Historical records of staff members who have resigned or been dismissed.</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="text" placeholder="Search name, position…" value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none" />
                        {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10"><X className="w-3 h-3 text-slate-400" /></button>}
                    </div>
                    <select value={filterType} onChange={e => setFilterType(e.target.value)}
                        className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none">
                        <option value="all">All Types</option>
                        <option value="resignation">Resignations</option>
                        <option value="dismissal">Dismissals</option>
                    </select>
                    <span className="text-xs text-slate-500 ml-auto">{filtered.length} of {archivedStaff.length} shown</span>
                </div>

                {/* Table */}
                <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">Staff Member</th>
                                    <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">Position</th>
                                    <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">Departure Date</th>
                                    <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">Type</th>
                                    <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">Reason</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map((s) => {
                                    const record = s.departureRecord
                                    const isResign = record?.record_type === 'resignation'
                                    
                                    return (
                                        <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                                                        {(s.full_name || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="text-sm font-bold text-gray-900 block truncate">{s.full_name}</span>
                                                        <span className="text-xs text-gray-400 block">{s.email || s.phone || 'No contact info'}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm font-medium text-gray-700 block truncate">{s.position}</span>
                                                <span className="text-xs text-gray-400 block">{s.department || 'No department'}</span>
                                            </td>
                                            <td className="px-6 py-4 text-sm font-medium text-gray-600">
                                                {record ? new Date(record.effective_date).toLocaleDateString('en-GB') : 'Unknown'}
                                            </td>
                                            <td className="px-6 py-4">
                                                {record ? (
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${isResign ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                                                        <TrendingDown className="w-3.5 h-3.5" /> {isResign ? 'Resignation' : 'Dismissal'}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400 text-sm italic">Unknown</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                {record ? (
                                                    <span className="text-sm font-medium text-gray-700 block max-w-xs">{record.reason || '—'}</span>
                                                ) : (
                                                    <span className="text-gray-400 text-sm italic">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-16 text-center">
                                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                                                <Users className="w-8 h-8 text-gray-300" />
                                            </div>
                                            <p className="text-gray-900 text-base font-bold mb-1">No archived staff found</p>
                                            <p className="text-gray-500 text-sm">
                                                Staff who are dismissed or resign will appear here.
                                            </p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
