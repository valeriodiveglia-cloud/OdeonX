'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRDepartment, HRPosition, HRRatingCategory, RatingCategoryScope } from '@/types/human-resources'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import {
    Settings, Building2, Briefcase, Star, Plus, Pencil, Trash2, X,
    Check, Globe, ChevronRight, Calendar,
} from 'lucide-react'

/* ═══════════════════════════════════════════════
   Tab config
   ═══════════════════════════════════════════════ */
const TABS = [
    { key: 'departments' as const, label: 'Departments',        icon: Building2 },
    { key: 'positions'   as const, label: 'Positions',          icon: Briefcase },
    { key: 'categories'  as const, label: 'Rating Categories',  icon: Star },
    { key: 'periods'     as const, label: 'Review Periods',     icon: Calendar },
]
type TabKey = typeof TABS[number]['key']

/* ═══════════════════════════════════════════════
   Delete Confirm Modal (shared)
   ═══════════════════════════════════════════════ */
function DeleteConfirm({ label, onConfirm, onCancel, deleting }: {
    label: string; onConfirm: () => void; onCancel: () => void; deleting: boolean
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Delete</h3>
                <p className="text-sm text-gray-600 mb-6">
                    Are you sure you want to delete <strong>{label}</strong>? This cannot be undone.
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

/* ═══════════════════════════════════════════════
   Inline edit row component
   ═══════════════════════════════════════════════ */
function InlineForm({ value, onSave, onCancel, placeholder, saving }: {
    value: string; onSave: (val: string) => void; onCancel: () => void; placeholder: string; saving: boolean
}) {
    const [v, setV] = useState(value)
    return (
        <div className="flex items-center gap-2">
            <input autoFocus value={v} onChange={e => setV(e.target.value)} placeholder={placeholder}
                onKeyDown={e => { if (e.key === 'Enter' && v.trim()) onSave(v.trim()); if (e.key === 'Escape') onCancel() }}
                className="flex-1 px-3 py-1.5 border border-blue-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
            <button onClick={() => v.trim() && onSave(v.trim())} disabled={saving || !v.trim()}
                className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50">
                <Check className="w-4 h-4" />
            </button>
            <button onClick={onCancel} className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition">
                <X className="w-4 h-4" />
            </button>
        </div>
    )
}

/* ═══════════════════════════════════════════════════
   DEPARTMENTS TAB
   ═══════════════════════════════════════════════════ */
function DepartmentsTab({ departments, positions, onRefresh }: {
    departments: HRDepartment[]; positions: HRPosition[]; onRefresh: () => void
}) {
    const [adding, setAdding]       = useState(false)
    const [editId, setEditId]       = useState<string | null>(null)
    const [saving, setSaving]       = useState(false)
    const [deleteId, setDeleteId]   = useState<string | null>(null)
    const [deleting, setDeleting]   = useState(false)

    const handleAdd = async (name: string) => {
        setSaving(true)
        const maxSort = departments.reduce((m, d) => Math.max(m, d.sort_order), 0)
        await supabase.from('hr_departments').insert([{ name, sort_order: maxSort + 1 }])
        setAdding(false); setSaving(false); onRefresh()
    }
    const handleEdit = async (id: string, name: string) => {
        setSaving(true)
        await supabase.from('hr_departments').update({ name }).eq('id', id)
        setEditId(null); setSaving(false); onRefresh()
    }
    const handleDelete = async () => {
        if (!deleteId) return
        setDeleting(true)
        await supabase.from('hr_departments').delete().eq('id', deleteId)
        setDeleteId(null); setDeleting(false); onRefresh()
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-lg font-semibold text-white">Departments</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Organize staff into departments. These will appear as dropdown options.</p>
                </div>
                <button onClick={() => setAdding(true)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition">
                    <Plus className="w-4 h-4" /> Add
                </button>
            </div>

            <div className="rounded-xl bg-white shadow-md overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-8">#</th>
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Name</th>
                            <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Positions</th>
                            <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-24">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {adding && (
                            <tr className="border-t border-gray-100 bg-blue-50/30">
                                <td className="px-4 py-2 text-sm text-gray-400">—</td>
                                <td className="px-4 py-2" colSpan={2}>
                                    <InlineForm value="" onSave={handleAdd} onCancel={() => setAdding(false)} placeholder="Department name…" saving={saving} />
                                </td>
                                <td />
                            </tr>
                        )}
                        {departments.map((d, idx) => {
                            const posCount = positions.filter(p => p.department_id === d.id).length
                            return (
                                <tr key={d.id} className={`border-t border-gray-100 hover:bg-gray-50/80 transition ${idx % 2 === 0 ? 'bg-gray-50/30' : ''}`}>
                                    <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                                    <td className="px-4 py-3">
                                        {editId === d.id ? (
                                            <InlineForm value={d.name} onSave={(n) => handleEdit(d.id, n)} onCancel={() => setEditId(null)} placeholder="Department name…" saving={saving} />
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <Building2 className="w-4 h-4 text-blue-500" />
                                                <span className="text-sm font-medium text-gray-900">{d.name}</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{posCount} positions</span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <button onClick={() => setEditId(d.id)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition"><Pencil className="w-4 h-4" /></button>
                                            <button onClick={() => setDeleteId(d.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                        {departments.length === 0 && !adding && (
                            <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-400 text-sm">
                                No departments yet. <button onClick={() => setAdding(true)} className="text-blue-600 hover:text-blue-700 font-medium">Add your first</button>
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {deleteId && <DeleteConfirm label={departments.find(d => d.id === deleteId)?.name || ''} onConfirm={handleDelete} onCancel={() => setDeleteId(null)} deleting={deleting} />}
        </div>
    )
}

/* ═══════════════════════════════════════════════════
   POSITIONS TAB
   ═══════════════════════════════════════════════════ */
function PositionsTab({ departments, positions, onRefresh }: {
    departments: HRDepartment[]; positions: HRPosition[]; onRefresh: () => void
}) {
    const [modalOpen, setModalOpen] = useState(false)
    const [editPos, setEditPos]     = useState<HRPosition | null>(null)
    const [saving, setSaving]       = useState(false)
    const [deleteId, setDeleteId]   = useState<string | null>(null)
    const [deleting, setDeleting]   = useState(false)

    // Modal form state
    const [name, setName]           = useState('')
    const [deptId, setDeptId]       = useState('')

    const openAdd = () => { setEditPos(null); setName(''); setDeptId(''); setModalOpen(true) }
    const openEdit = (p: HRPosition) => { setEditPos(p); setName(p.name); setDeptId(p.department_id || ''); setModalOpen(true) }

    const handleSave = async () => {
        if (!name.trim()) return
        setSaving(true)
        const data = { name: name.trim(), department_id: deptId || null }
        if (editPos) {
            await supabase.from('hr_positions').update(data).eq('id', editPos.id)
        } else {
            const maxSort = positions.reduce((m, p) => Math.max(m, p.sort_order), 0)
            await supabase.from('hr_positions').insert([{ ...data, sort_order: maxSort + 1 }])
        }
        setModalOpen(false); setSaving(false); onRefresh()
    }

    const handleDelete = async () => {
        if (!deleteId) return
        setDeleting(true)
        await supabase.from('hr_positions').delete().eq('id', deleteId)
        setDeleteId(null); setDeleting(false); onRefresh()
    }

    const deptMap: Record<string, string> = {}
    departments.forEach(d => { deptMap[d.id] = d.name })

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-lg font-semibold text-white">Positions</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Define job positions. Optionally link them to a department.</p>
                </div>
                <button onClick={openAdd}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition">
                    <Plus className="w-4 h-4" /> Add
                </button>
            </div>

            <div className="rounded-xl bg-white shadow-md overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-8">#</th>
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Position</th>
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Department</th>
                            <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-24">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {positions.map((p, idx) => (
                            <tr key={p.id} className={`border-t border-gray-100 hover:bg-gray-50/80 transition ${idx % 2 === 0 ? 'bg-gray-50/30' : ''}`}>
                                <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <Briefcase className="w-4 h-4 text-indigo-500" />
                                        <span className="text-sm font-medium text-gray-900">{p.name}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    {p.department_id && deptMap[p.department_id] ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                                            <Building2 className="w-3 h-3" />
                                            {deptMap[p.department_id]}
                                        </span>
                                    ) : (
                                        <span className="text-xs text-gray-400 italic">Any department</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition"><Pencil className="w-4 h-4" /></button>
                                        <button onClick={() => setDeleteId(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {positions.length === 0 && (
                            <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-400 text-sm">
                                No positions yet. <button onClick={openAdd} className="text-blue-600 hover:text-blue-700 font-medium">Add your first</button>
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Position modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">{editPos ? 'Edit Position' : 'New Position'}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Position Name *</label>
                                <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Head Chef"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Department (optional)</label>
                                <select value={deptId} onChange={e => setDeptId(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                                    <option value="">Any department</option>
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Cancel</button>
                            <button onClick={handleSave} disabled={saving || !name.trim()}
                                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2">
                                {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                {editPos ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteId && <DeleteConfirm label={positions.find(p => p.id === deleteId)?.name || ''} onConfirm={handleDelete} onCancel={() => setDeleteId(null)} deleting={deleting} />}
        </div>
    )
}

/* ═══════════════════════════════════════════════════
   RATING CATEGORIES TAB
   ═══════════════════════════════════════════════════ */
function CategoriesTab({ departments, positions, categories, onRefresh }: {
    departments: HRDepartment[]; positions: HRPosition[]; categories: HRRatingCategory[]; onRefresh: () => void
}) {
    const [modalOpen, setModalOpen] = useState(false)
    const [editCat, setEditCat]     = useState<HRRatingCategory | null>(null)
    const [saving, setSaving]       = useState(false)
    const [deleteId, setDeleteId]   = useState<string | null>(null)
    const [deleting, setDeleting]   = useState(false)

    // Form state
    const [label, setLabel]         = useState('')
    const [scope, setScope]         = useState<RatingCategoryScope>('global')
    const [scopeId, setScopeId]     = useState<string>('')

    const openAdd = () => { setEditCat(null); setLabel(''); setScope('global'); setScopeId(''); setModalOpen(true) }
    const openEdit = (c: HRRatingCategory) => { setEditCat(c); setLabel(c.label); setScope(c.scope); setScopeId(c.scope_id || ''); setModalOpen(true) }

    const handleSave = async () => {
        if (!label.trim()) return
        setSaving(true)
        const data = {
            label: label.trim(),
            scope,
            scope_id: scope === 'global' ? null : (scopeId || null),
        }
        if (editCat) {
            await supabase.from('hr_rating_categories').update(data).eq('id', editCat.id)
        } else {
            const maxSort = categories.reduce((m, c) => Math.max(m, c.sort_order), 0)
            await supabase.from('hr_rating_categories').insert([{ ...data, sort_order: maxSort + 1 }])
        }
        setModalOpen(false); setSaving(false); onRefresh()
    }

    const handleDelete = async () => {
        if (!deleteId) return
        setDeleting(true)
        await supabase.from('hr_rating_categories').delete().eq('id', deleteId)
        setDeleteId(null); setDeleting(false); onRefresh()
    }

    const deptMap: Record<string, string> = {}
    departments.forEach(d => { deptMap[d.id] = d.name })
    const posMap: Record<string, string> = {}
    positions.forEach(p => { posMap[p.id] = p.name })

    const scopeBadge = (cat: HRRatingCategory) => {
        if (cat.scope === 'global') return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                <Globe className="w-3 h-3" /> Global
            </span>
        )
        if (cat.scope === 'department') return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                <Building2 className="w-3 h-3" /> {cat.scope_id ? deptMap[cat.scope_id] || 'Unknown' : '—'}
            </span>
        )
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                <Briefcase className="w-3 h-3" /> {cat.scope_id ? posMap[cat.scope_id] || 'Unknown' : '—'}
            </span>
        )
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-lg font-semibold text-white">Rating Categories</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Define performance rating criteria. Assign globally, per department, or per position.</p>
                </div>
                <button onClick={openAdd}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition">
                    <Plus className="w-4 h-4" /> Add
                </button>
            </div>

            <div className="rounded-xl bg-white shadow-md overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-8">#</th>
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Category</th>
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Scope</th>
                            <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-24">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {categories.map((c, idx) => (
                            <tr key={c.id} className={`border-t border-gray-100 hover:bg-gray-50/80 transition ${idx % 2 === 0 ? 'bg-gray-50/30' : ''}`}>
                                <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <Star className="w-4 h-4 text-amber-500" />
                                        <span className="text-sm font-medium text-gray-900">{c.label}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">{scopeBadge(c)}</td>
                                <td className="px-4 py-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition"><Pencil className="w-4 h-4" /></button>
                                        <button onClick={() => setDeleteId(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {categories.length === 0 && (
                            <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-400 text-sm">
                                No rating categories yet. <button onClick={openAdd} className="text-blue-600 hover:text-blue-700 font-medium">Add your first</button>
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Category modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">{editCat ? 'Edit Category' : 'New Rating Category'}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Label *</label>
                                <input autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Knife Skills"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                            </div>

                            {/* Scope selector */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Scope</label>
                                <div className="flex gap-2">
                                    {(['global', 'department', 'position'] as RatingCategoryScope[]).map(s => (
                                        <button key={s} type="button" onClick={() => { setScope(s); setScopeId('') }}
                                            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition ${
                                                scope === s
                                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                            }`}>
                                            {s === 'global' && <Globe className="w-3.5 h-3.5 inline mr-1.5" />}
                                            {s === 'department' && <Building2 className="w-3.5 h-3.5 inline mr-1.5" />}
                                            {s === 'position' && <Briefcase className="w-3.5 h-3.5 inline mr-1.5" />}
                                            {s.charAt(0).toUpperCase() + s.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Scope target */}
                            {scope === 'department' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                                    <select value={scopeId} onChange={e => setScopeId(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                                        <option value="">Select department…</option>
                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                            )}
                            {scope === 'position' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
                                    <select value={scopeId} onChange={e => setScopeId(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                                        <option value="">Select position…</option>
                                        {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Cancel</button>
                            <button onClick={handleSave} disabled={saving || !label.trim() || (scope !== 'global' && !scopeId)}
                                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2">
                                {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                {editCat ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteId && <DeleteConfirm label={categories.find(c => c.id === deleteId)?.label || ''} onConfirm={handleDelete} onCancel={() => setDeleteId(null)} deleting={deleting} />}
        </div>
    )
}

/* ═══════════════════════════════════════════════════
   REVIEW PERIODS TAB
   ═══════════════════════════════════════════════════ */
function ReviewPeriodsTab() {
    const { hrReviewFrequency, setHrReviewFrequency } = useSettings()

    const PERIOD_OPTIONS = [
        'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Semi-Annually', 'Annually'
    ]

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-semibold text-white">Review Frequency</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Define how often performance reviews are conducted across the organization.</p>
                </div>
            </div>

            <div className="rounded-xl bg-white shadow-md overflow-hidden p-6">
                <div className="max-w-sm">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Frequency
                    </label>
                    <select 
                        value={hrReviewFrequency} 
                        onChange={e => setHrReviewFrequency(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    >
                        {PERIOD_OPTIONS.map(o => (
                            <option key={o} value={o}>{o}</option>
                        ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-3">
                        This setting will automatically organize all performance reviews based on this cycle.
                    </p>
                </div>
            </div>
        </div>
    )
}

/* ═══════════════════════════════════════════════════
   MAIN SETTINGS PAGE
   ═══════════════════════════════════════════════════ */
export default function HRManagementSettingsPage() {
    const [loading, setLoading]       = useState(true)
    const [activeTab, setActiveTab]   = useState<TabKey>('departments')
    const [departments, setDepartments] = useState<HRDepartment[]>([])
    const [positions, setPositions]     = useState<HRPosition[]>([])
    const [categories, setCategories]   = useState<HRRatingCategory[]>([])

    const fetchAll = useCallback(async () => {
        setLoading(true)
        const [dRes, pRes, cRes] = await Promise.all([
            supabase.from('hr_departments').select('*').order('sort_order'),
            supabase.from('hr_positions').select('*').order('sort_order'),
            supabase.from('hr_rating_categories').select('*').order('sort_order'),
        ])
        if (dRes.data) setDepartments(dRes.data as HRDepartment[])
        if (pRes.data) setPositions(pRes.data as HRPosition[])
        if (cRes.data) setCategories(cRes.data as HRRatingCategory[])
        setLoading(false)
    }, [])

    useEffect(() => { fetchAll() }, [fetchAll])

    if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><CircularLoader /></div>

    return (
        <div className="min-h-screen bg-slate-900 text-gray-100 p-6">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Settings className="w-6 h-6 text-slate-400" />
                        HR Management Settings
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">Configure departments, positions, and performance rating categories.</p>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-slate-800 rounded-xl p-1 mb-6 border border-white/5">
                    {TABS.map(tab => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                                activeTab === tab.key
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}>
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                {activeTab === 'departments' && <DepartmentsTab departments={departments} positions={positions} onRefresh={fetchAll} />}
                {activeTab === 'positions'   && <PositionsTab departments={departments} positions={positions} onRefresh={fetchAll} />}
                {activeTab === 'categories'  && <CategoriesTab departments={departments} positions={positions} categories={categories} onRefresh={fetchAll} />}
                {activeTab === 'periods'     && <ReviewPeriodsTab />}
            </div>
        </div>
    )
}
