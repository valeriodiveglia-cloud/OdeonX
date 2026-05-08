'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRDepartment, HRPosition, HRRatingCategory, RatingCategoryScope, HRDisciplinaryCategory, HRAlertSetting, AlertScope, AlertTargetField, HRDisciplinaryCatalog } from '@/types/human-resources'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import {
    Settings, Building2, Briefcase, Star, Plus, Pencil, Trash2, X,
    Check, Globe, ChevronRight, Calendar, NotebookPen, AlertTriangle, Gift, Tag, Loader2
} from 'lucide-react'

/* ═══════════════════════════════════════════════
   Tab config
   ═══════════════════════════════════════════════ */
const TABS = [
    { key: 'departments' as const, label: 'Departments',        icon: Building2 },
    { key: 'positions'   as const, label: 'Positions',          icon: Briefcase },
    { key: 'alerts'      as const, label: 'Alerts',             icon: AlertTriangle },
    { key: 'categories'  as const, label: 'Rating Categories',  icon: Star },
    { key: 'fines_categories' as const, label: 'Disciplinary Categories', icon: NotebookPen },
    { key: 'fines_table' as const, label: 'Fine Tables',        icon: Tag },
    { key: 'periods'     as const, label: 'Review Periods',     icon: Calendar },
    { key: 'bonus'       as const, label: 'Bonus Settings',     icon: Gift },
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
   ALERTS TAB
   ═══════════════════════════════════════════════════ */
function AlertsTab({ departments, positions, alerts, onRefresh }: {
    departments: HRDepartment[]; positions: HRPosition[]; alerts: HRAlertSetting[]; onRefresh: () => void
}) {
    const [modalOpen, setModalOpen] = useState(false)
    const [editAlert, setEditAlert] = useState<HRAlertSetting | null>(null)
    const [saving, setSaving]       = useState(false)
    const [deleteId, setDeleteId]   = useState<string | null>(null)
    const [deleting, setDeleting]   = useState(false)

    // Form state
    const [label, setLabel]         = useState('')
    const [targetField, setTargetField] = useState<AlertTargetField>('probation_end_date')
    const [deactivateTrigger, setDeactivateTrigger] = useState<AlertTargetField | ''>('')
    const [conditionType, setConditionType] = useState<'before' | 'after'>('before')
    const [days, setDays]           = useState<string>('30')
    const [scope, setScope]         = useState<AlertScope>('global')
    const [scopeId, setScopeId]     = useState<string>('')

    const openAdd = () => { 
        setEditAlert(null); setLabel(''); setTargetField('probation_end_date'); setDeactivateTrigger(''); setConditionType('before'); setDays('30'); 
        setScope('global'); setScopeId(''); setModalOpen(true); 
    }
    const openEdit = (a: HRAlertSetting) => { 
        setEditAlert(a); setLabel(a.label); setTargetField(a.target_field); setDeactivateTrigger(a.deactivate_trigger || ''); setConditionType(a.condition_type); setDays(a.days?.toString() || ''); 
        setScope(a.scope); setScopeId(a.scope_id || ''); setModalOpen(true); 
    }

    const handleSave = async () => {
        if (!label.trim()) return
        setSaving(true)
        const dbDays = parseInt(days) || 0
        const data = {
            label: label.trim(),
            target_field: targetField,
            deactivate_trigger: deactivateTrigger || null,
            condition_type: conditionType,
            days: dbDays,
            scope,
            scope_id: scope === 'global' ? null : (scopeId || null),
        }
        if (editAlert) {
            await supabase.from('hr_alert_settings').update(data).eq('id', editAlert.id)
        } else {
            await supabase.from('hr_alert_settings').insert([data])
        }
        setModalOpen(false); setSaving(false); onRefresh()
    }

    const handleDelete = async () => {
        if (!deleteId) return
        setDeleting(true)
        await supabase.from('hr_alert_settings').delete().eq('id', deleteId)
        setDeleteId(null); setDeleting(false); onRefresh()
    }

    const deptMap: Record<string, string> = {}
    departments.forEach(d => { deptMap[d.id] = d.name })
    const posMap: Record<string, string> = {}
    positions.forEach(p => { posMap[p.id] = p.name })

    const scopeBadge = (cat: HRAlertSetting) => {
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

    const targetLabel = (tf: AlertTargetField) => {
        if (tf === 'start_date') return 'Start Date'
        if (tf === 'probation_end_date') return 'Probation End'
        if (tf === 'contract_expiration_date') return 'Contract Exp.'
        if (tf === 'contract_signing_date') return 'Contract Signing Date'
        if (tf === 'last_status_change') return 'Last Status Change'
        return tf
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-lg font-semibold text-white">Staff Alerts</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Configure notification rules for staff deadlines (e.g. Contract expiration).</p>
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
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Alert Name</th>
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Trigger</th>
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Scope</th>
                            <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-24">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {alerts.map((a, idx) => (
                            <tr key={a.id} className={`border-t border-gray-100 hover:bg-gray-50/80 transition ${idx % 2 === 0 ? 'bg-gray-50/30' : ''}`}>
                                <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                                        <span className="text-sm font-medium text-gray-900">{a.label}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex flex-col">
                                        <span className="text-sm text-gray-800">{targetLabel(a.target_field)}</span>
                                        <span className="text-xs text-gray-400">{a.days} days {a.condition_type}</span>
                                        {a.deactivate_trigger && <span className="text-[10px] text-emerald-600 font-medium mt-0.5">Deactivates on: {targetLabel(a.deactivate_trigger)}</span>}
                                    </div>
                                </td>
                                <td className="px-4 py-3">{scopeBadge(a)}</td>
                                <td className="px-4 py-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <button onClick={() => openEdit(a)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition"><Pencil className="w-4 h-4" /></button>
                                        <button onClick={() => setDeleteId(a.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {alerts.length === 0 && (
                            <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">
                                No alerts configured. <button onClick={openAdd} className="text-blue-600 hover:text-blue-700 font-medium">Add your first</button>
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Alert modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="text-lg font-semibold text-gray-900">{editAlert ? 'Edit Alert' : 'New Alert'}</h3>
                            <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6 flex-1 overflow-y-auto max-h-[80vh]">
                            {/* General Settings */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-1">Alert Label</label>
                                <p className="text-xs text-gray-500 mb-3">Give this alert a clear, descriptive name.</p>
                                <input autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Renew Contract"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" />
                            </div>

                            {/* Rule Configuration */}
                            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-4">
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-1">Trigger Condition</h4>
                                    <p className="text-xs text-gray-500 mb-3">Define exactly when this alert should appear.</p>
                                </div>
                                <div className="grid grid-cols-12 gap-3 items-end">
                                    <div className="col-span-5">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Target Field</label>
                                        <select value={targetField} onChange={e => setTargetField(e.target.value as AlertTargetField)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                            <option value="start_date">Start Date</option>
                                            <option value="probation_end_date">Probation End</option>
                                            <option value="contract_expiration_date">Contract Expiration</option>
                                            <option value="last_status_change">Last Status Change</option>
                                        </select>
                                    </div>
                                    <div className="col-span-4">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Condition</label>
                                        <select value={conditionType} onChange={e => setConditionType(e.target.value as 'before' | 'after')}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                            <option value="before">Before</option>
                                            <option value="after">After</option>
                                        </select>
                                    </div>
                                    <div className="col-span-3">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Days</label>
                                        <input type="number" min="0" value={days} onChange={e => setDays(e.target.value)}
                                            placeholder="30"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1 mt-1">Deactivation Trigger (Optional)</label>
                                    <p className="text-[11px] text-gray-500 mb-2">If set, the alert disappears automatically once this field is updated to a date after the alert started.</p>
                                    <select value={deactivateTrigger} onChange={e => setDeactivateTrigger(e.target.value as any)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                        <option value="">None (Stays until Target Date changes)</option>
                                        <option value="start_date">Start Date</option>
                                        <option value="probation_end_date">Probation End</option>
                                        <option value="contract_expiration_date">Contract Expiration</option>
                                        <option value="contract_signing_date">Contract Signing Date</option>
                                        <option value="last_status_change">Last Status Change</option>
                                    </select>
                                </div>
                            </div>

                            {/* Scope Configuration */}
                            <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-1">Alert Scope</h4>
                                <p className="text-xs text-gray-500 mb-3">Who should this alert apply to?</p>
                                <div className="flex gap-2 mb-4">
                                    {(['global', 'department', 'position'] as AlertScope[]).map(s => (
                                        <button key={s} type="button" onClick={() => { setScope(s); setScopeId('') }}
                                            className={`flex-1 flex flex-col items-center justify-center p-3 rounded-xl border transition ${
                                                scope === s
                                                    ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500'
                                                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                                            }`}>
                                            {s === 'global' && <Globe className="w-5 h-5 mb-1.5" />}
                                            {s === 'department' && <Building2 className="w-5 h-5 mb-1.5" />}
                                            {s === 'position' && <Briefcase className="w-5 h-5 mb-1.5" />}
                                            <span className="text-xs font-medium">{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                                        </button>
                                    ))}
                                </div>

                                {scope === 'department' && (
                                    <div className="animate-in slide-in-from-top-1 fade-in duration-200">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Select Department</label>
                                        <select value={scopeId} onChange={e => setScopeId(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                            <option value="">Select department…</option>
                                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                        </select>
                                    </div>
                                )}
                                {scope === 'position' && (
                                    <div className="animate-in slide-in-from-top-1 fade-in duration-200">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Select Position</label>
                                        <select value={scopeId} onChange={e => setScopeId(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                            <option value="">Select position…</option>
                                            {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                            <button onClick={() => setModalOpen(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition">
                                Cancel
                            </button>
                            <button onClick={handleSave} disabled={saving || !label.trim() || (scope !== 'global' && !scopeId)}
                                className="inline-flex items-center justify-center min-w-[100px] px-4 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm">
                                {saving ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : (editAlert ? 'Update' : 'Create')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteId && <DeleteConfirm label={alerts.find(c => c.id === deleteId)?.label || ''} onConfirm={handleDelete} onCancel={() => setDeleteId(null)} deleting={deleting} />}
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
   DISCIPLINARY CATEGORIES TAB
   ═══════════════════════════════════════════════════ */
function DisciplinaryCategoriesTab({ categories, onRefresh }: {
    categories: HRDisciplinaryCategory[]; onRefresh: () => void
}) {
    const [adding, setAdding]       = useState(false)
    const [editId, setEditId]       = useState<string | null>(null)
    const [saving, setSaving]       = useState(false)
    const [deleteId, setDeleteId]   = useState<string | null>(null)
    const [deleting, setDeleting]   = useState(false)

    const handleAdd = async (name: string) => {
        setSaving(true)
        await supabase.from('hr_disciplinary_categories').insert([{ name }])
        setAdding(false); setSaving(false); onRefresh()
    }
    const handleEdit = async (id: string, name: string) => {
        setSaving(true)
        await supabase.from('hr_disciplinary_categories').update({ name }).eq('id', id)
        setEditId(null); setSaving(false); onRefresh()
    }
    const handleDelete = async () => {
        if (!deleteId) return
        setDeleting(true)
        await supabase.from('hr_disciplinary_categories').delete().eq('id', deleteId)
        setDeleteId(null); setDeleting(false); onRefresh()
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-lg font-semibold text-white">Disciplinary Categories</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Manage categories for fines/disciplinary actions (e.g., Attendance, Hygiene, Performance).</p>
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
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Category Name</th>
                            <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-24">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {adding && (
                            <tr className="border-t border-gray-100 bg-blue-50/30">
                                <td className="px-4 py-2 text-sm text-gray-400">—</td>
                                <td className="px-4 py-2">
                                    <InlineForm value="" onSave={handleAdd} onCancel={() => setAdding(false)} placeholder="e.g. Behavioral" saving={saving} />
                                </td>
                                <td />
                            </tr>
                        )}
                        {categories.map((c, idx) => (
                            <tr key={c.id} className={`border-t border-gray-100 hover:bg-gray-50/80 transition ${idx % 2 === 0 ? 'bg-gray-50/30' : ''}`}>
                                <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                                <td className="px-4 py-3">
                                    {editId === c.id ? (
                                        <InlineForm value={c.name} onSave={(n) => handleEdit(c.id, n)} onCancel={() => setEditId(null)} placeholder="Category name…" saving={saving} />
                                    ) : (
                                        <span className="text-sm font-medium text-gray-900">{c.name}</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <button onClick={() => setEditId(c.id)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition"><Pencil className="w-4 h-4" /></button>
                                        <button onClick={() => setDeleteId(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {categories.length === 0 && !adding && (
                            <tr><td colSpan={3} className="px-4 py-12 text-center text-gray-400 text-sm">
                                No disciplinary categories yet. <button onClick={() => setAdding(true)} className="text-blue-600 hover:text-blue-700 font-medium">Add your first</button>
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {deleteId && <DeleteConfirm label={categories.find(c => c.id === deleteId)?.name || ''} onConfirm={handleDelete} onCancel={() => setDeleteId(null)} deleting={deleting} />}
        </div>
    )
}

/* ═══════════════════════════════════════════════════
   BONUS TAB
   ═══════════════════════════════════════════════════ */
function BonusTab() {
    const { 
        hrBonus14thBaseYears, setHrBonus14thBaseYears,
        hrBonus14thSteps, setHrBonus14thSteps,
        hrBonusPtMaxCap, setHrBonusPtMaxCap,
        hrBonusPtTargetHours, setHrBonusPtTargetHours,
        hrBonusPtMinHours, setHrBonusPtMinHours,
        hrBonusPtMinRating, setHrBonusPtMinRating,
        hrBonus14thMinRating, setHrBonus14thMinRating,
        hrBonus13thGuaranteedPct, setHrBonus13thGuaranteedPct,
        hrBonus13thPerfPct, setHrBonus13thPerfPct,
        hrBonus13thPerfTiers, setHrBonus13thPerfTiers,
        currency
    } = useSettings()

    const formatCurrencyInput = (val: string) => {
        const cleaned = val.replace(/[^\d.]/g, '');
        const parts = cleaned.split('.');
        if (parts[0]) {
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        }
        return parts.slice(0, 2).join('.');
    }

    const [baseYears, setBaseYears] = useState(hrBonus14thBaseYears.toString())
    const [steps, setSteps] = useState<{ years: number, pct: number }[]>([...hrBonus14thSteps].sort((a, b) => a.years - b.years))

    const [ptMaxCap, setPtMaxCap] = useState(formatCurrencyInput(hrBonusPtMaxCap.toString()))
    const [ptTargetHours, setPtTargetHours] = useState(hrBonusPtTargetHours.toString())
    const [ptMinHours, setPtMinHours] = useState(hrBonusPtMinHours.toString())
    
    // Performance Additions
    const [ptMinRating, setPtMinRating] = useState(hrBonusPtMinRating.toString())
    const [minRating14th, setMinRating14th] = useState(hrBonus14thMinRating.toString())
    const [guaranteed13th, setGuaranteed13th] = useState(hrBonus13thGuaranteedPct.toString())
    const [perf13th, setPerf13th] = useState(hrBonus13thPerfPct.toString())
    const [perfTiers, setPerfTiers] = useState<{ min_rating: number, multiplier_pct: number }[]>([...hrBonus13thPerfTiers].sort((a, b) => a.min_rating - b.min_rating))
    
    // Add Modal State
    const [addModalOpen, setAddModalOpen] = useState(false)
    const [newStepYears, setNewStepYears] = useState('')
    const [newStepPct, setNewStepPct] = useState('')

    const handleSave = () => {
        const parsedBase = parseInt(baseYears) || 0
        setHrBonus14thBaseYears(parsedBase)
        setHrBonus14thSteps(steps)
        setHrBonusPtMaxCap(parseInt(ptMaxCap.replace(/,/g, '')) || 0)
        setHrBonusPtTargetHours(parseInt(ptTargetHours) || 0)
        setHrBonusPtMinHours(parseInt(ptMinHours) || 0)
        setHrBonusPtMinRating(parseFloat(ptMinRating) || 0)
        setHrBonus14thMinRating(parseFloat(minRating14th) || 0)
        setHrBonus13thGuaranteedPct(parseInt(guaranteed13th) || 0)
        setHrBonus13thPerfPct(parseInt(perf13th) || 0)
        setHrBonus13thPerfTiers(perfTiers)
    }

    const openAddStepModal = () => {
        setNewStepYears('')
        setNewStepPct('')
        setAddModalOpen(true)
    }

    const confirmAddStep = () => {
        const y = parseInt(newStepYears)
        const p = parseInt(newStepPct)
        if (isNaN(y) || isNaN(p) || y < 0 || p < 0) return
        
        const newSteps = [...steps, { years: y, pct: Math.min(p, 100) }]
        newSteps.sort((a, b) => a.years - b.years)
        setSteps(newSteps)
        setAddModalOpen(false)
    }

    const updateStepPct = (index: number, val: string) => {
        const newSteps = [...steps]
        newSteps[index].pct = parseInt(val) || 0
        setSteps(newSteps)
    }

    const removeStep = (index: number) => {
        setSteps(steps.filter((_, i) => i !== index))
    }

    const hasChanges = baseYears !== hrBonus14thBaseYears.toString() || 
                       JSON.stringify(steps) !== JSON.stringify([...hrBonus14thSteps].sort((a,b)=>a.years-b.years)) ||
                       ptMaxCap.replace(/,/g, '') !== hrBonusPtMaxCap.toString() ||
                       ptTargetHours !== hrBonusPtTargetHours.toString() ||
                       ptMinHours !== hrBonusPtMinHours.toString() ||
                       ptMinRating !== hrBonusPtMinRating.toString() ||
                       minRating14th !== hrBonus14thMinRating.toString() ||
                       guaranteed13th !== hrBonus13thGuaranteedPct.toString() ||
                       perf13th !== hrBonus13thPerfPct.toString() ||
                       JSON.stringify(perfTiers) !== JSON.stringify([...hrBonus13thPerfTiers].sort((a,b)=>a.min_rating-b.min_rating))

    const [addTierModalOpen, setAddTierModalOpen] = useState(false)
    const [newTierMinRating, setNewTierMinRating] = useState('')
    const [newTierMultiplier, setNewTierMultiplier] = useState('')

    const confirmAddTier = () => {
        const minRating = parseFloat(newTierMinRating)
        const mult = parseInt(newTierMultiplier)
        if (isNaN(minRating) || isNaN(mult) || minRating < 0 || mult < 0) return
        
        const newTiers = [...perfTiers, { min_rating: minRating, multiplier_pct: mult }]
        newTiers.sort((a, b) => a.min_rating - b.min_rating)
        setPerfTiers(newTiers)
        setAddTierModalOpen(false)
    }

    const removeTier = (index: number) => {
        setPerfTiers(perfTiers.filter((_, i) => i !== index))
    }

    const updateTierPct = (index: number, val: string) => {
        const newTiers = [...perfTiers]
        newTiers[index].multiplier_pct = parseInt(val) || 0
        setPerfTiers(newTiers)
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-lg font-semibold text-white">Bonus Configurations</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Configure 14th month rules globally across all staff.</p>
                </div>
                {hasChanges && (
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition">
                        Save Changes
                    </button>
                )}
            </div>

            <div className="bg-white rounded-xl shadow-md overflow-hidden p-6 space-y-8">
                {/* 14th Month Base Rules */}
                <div>
                    <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Gift className="w-5 h-5 text-blue-600" />
                        14th Month Base Eligibility
                    </h3>
                    <div className="max-w-xs">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Base Tenure Threshold (Years)</label>
                        <p className="text-xs text-gray-500 mb-3">Staff must complete this many years before unlocking the 14th month bonus.</p>
                        <div className="relative">
                            <input 
                                type="number" min="0" max="20"
                                value={baseYears} 
                                onChange={e => setBaseYears(e.target.value)}
                                className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">years</span>
                        </div>
                    </div>
                </div>

                <hr className="border-gray-100" />

                {/* 14th Month Steps */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-md font-semibold text-gray-900 mb-1">Percentage Steps</h3>
                            <p className="text-xs text-gray-500">Configure what percentage is given each year after reaching the base threshold.</p>
                        </div>
                        <button onClick={openAddStepModal} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-100 transition">
                            <Plus className="w-4 h-4" /> Add Step
                        </button>
                    </div>

                    <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-3">
                        {steps.map((step, idx) => (
                            <div key={idx} className="flex items-center gap-4 bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                                <div className="flex-1">
                                    <span className="text-sm font-medium text-gray-700">
                                        After <span className="font-bold text-gray-900">{step.years}</span> total years
                                    </span>
                                </div>
                                <div className="relative w-32 shrink-0">
                                    <input 
                                        type="number" min="0" max="100"
                                        value={step.pct}
                                        onChange={e => updateStepPct(idx, e.target.value)}
                                        className="w-full pl-3 pr-8 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none text-right font-medium"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">%</span>
                                </div>
                                <button 
                                    onClick={() => removeStep(idx)}
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                                    title="Remove this step"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        {steps.length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-4 italic">No percentage steps defined. Staff will receive 0% of the 14th month.</p>
                        )}
                    </div>
                </div>

                <hr className="border-gray-100" />

                {/* Part-Time Bonus Config */}
                <div>
                    <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Gift className="w-5 h-5 text-blue-600" />
                        Part-Time Bonus Calculation
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="flex flex-col h-full">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Max Cap ({currency})</label>
                            <p className="text-xs text-gray-500 mb-3">Maximum bonus given for reaching target hours.</p>
                            <div className="relative mt-auto">
                                <input 
                                    type="text"
                                    value={ptMaxCap} 
                                    onChange={e => setPtMaxCap(formatCurrencyInput(e.target.value))}
                                    className="w-full pl-3 pr-12 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">{currency}</span>
                            </div>
                        </div>
                        <div className="flex flex-col h-full">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Target Hours</label>
                            <p className="text-xs text-gray-500 mb-3">Hours required to receive the max cap.</p>
                            <div className="relative mt-auto">
                                <input 
                                    type="number" min="1"
                                    value={ptTargetHours} 
                                    onChange={e => setPtTargetHours(e.target.value)}
                                    className="w-full pl-3 pr-12 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">hrs</span>
                            </div>
                        </div>
                        <div className="flex flex-col h-full">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Hours</label>
                            <p className="text-xs text-gray-500 mb-3">Hours below this get 0 bonus.</p>
                            <div className="relative mt-auto">
                                <input 
                                    type="number" min="0"
                                    value={ptMinHours} 
                                    onChange={e => setPtMinHours(e.target.value)}
                                    className="w-full pl-3 pr-12 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">hrs</span>
                            </div>
                        </div> 
                    </div>
                </div>

                <hr className="border-gray-100" />

                {/* Performance Integration */}
                <div>
                    <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Star className="w-5 h-5 text-amber-500" />
                        Performance Integration
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {/* 13th Month Split */}
                        <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl space-y-4">
                            <div>
                                <h4 className="text-sm font-semibold text-gray-900">13th Month Structure</h4>
                                <p className="text-xs text-gray-500 mt-1">Split the 13th month bonus into a guaranteed portion and a performance-based portion.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="relative">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Guaranteed</label>
                                    <input 
                                        type="number" min="0" max="100"
                                        value={guaranteed13th} 
                                        onChange={e => setGuaranteed13th(e.target.value)}
                                        className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                    <span className="absolute right-3 top-7 text-gray-400 text-sm font-medium">%</span>
                                </div>
                                <div className="relative">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Performance</label>
                                    <input 
                                        type="number" min="0" max="100"
                                        value={perf13th} 
                                        onChange={e => setPerf13th(e.target.value)}
                                        className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                    <span className="absolute right-3 top-7 text-gray-400 text-sm font-medium">%</span>
                                </div>
                            </div>
                        </div>

                        {/* Gatekeepers */}
                        <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl space-y-4">
                            <div>
                                <h4 className="text-sm font-semibold text-gray-900">Bonus Gatekeepers</h4>
                                <p className="text-xs text-gray-500 mt-1">Minimum average rating required to receive these bonuses at all.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="relative">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">14th Month Min. Rating</label>
                                    <input 
                                        type="number" step="0.1" min="0" max="5"
                                        value={minRating14th} 
                                        onChange={e => setMinRating14th(e.target.value)}
                                        className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                    <span className="absolute right-3 top-7 text-amber-500 text-sm"><Star className="w-4 h-4 fill-current"/></span>
                                </div>
                                <div className="relative">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Part-Time Min. Rating</label>
                                    <input 
                                        type="number" step="0.1" min="0" max="5"
                                        value={ptMinRating} 
                                        onChange={e => setPtMinRating(e.target.value)}
                                        className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                    <span className="absolute right-3 top-7 text-amber-500 text-sm"><Star className="w-4 h-4 fill-current"/></span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 13th Month Performance Tiers */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-md font-semibold text-gray-900 mb-1">13th Month Performance Multipliers</h3>
                                <p className="text-xs text-gray-500">Configure how the performance portion of the 13th month bonus scales with the rating.</p>
                            </div>
                            <button onClick={() => { setNewTierMinRating(''); setNewTierMultiplier(''); setAddTierModalOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-100 transition">
                                <Plus className="w-4 h-4" /> Add Tier
                            </button>
                        </div>

                        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-3">
                            {[...perfTiers].reverse().map((tier, reverseIdx) => {
                                const idx = perfTiers.length - 1 - reverseIdx; // get original index to update state correctly
                                const nextTier = perfTiers[idx + 1]; // because state is sorted ascending
                                const upperBound = nextTier ? (nextTier.min_rating - 0.01).toFixed(2) : "5.00";
                                
                                return (
                                    <div key={idx} className="flex items-center gap-4 bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                                        <div className="flex-1 flex items-center gap-2">
                                            <span className="text-sm font-medium text-gray-700">Rating from</span>
                                            <span className="font-bold text-gray-900 flex items-center gap-1">
                                                {tier.min_rating.toFixed(2)} to {upperBound} <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs text-gray-500">gets</span>
                                            <div className="relative w-28 shrink-0">
                                                <input 
                                                    type="number" min="0"
                                                    value={tier.multiplier_pct}
                                                    onChange={e => updateTierPct(idx, e.target.value)}
                                                    className="w-full pl-3 pr-8 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none text-right font-medium"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">%</span>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => removeTier(idx)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                                            title="Remove this tier"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                );
                            })}
                            
                            {perfTiers.length > 0 && perfTiers[0].min_rating > 0 && (
                                <div className="flex items-center gap-4 bg-gray-100/50 p-3 rounded-lg border border-gray-200 border-dashed text-gray-500">
                                    <div className="flex-1 flex items-center gap-2">
                                        <span className="text-sm font-medium">Rating from</span>
                                        <span className="font-bold flex items-center gap-1">
                                            0.00 to {(perfTiers[0].min_rating - 0.01).toFixed(2)} <Star className="w-3.5 h-3.5 opacity-50 fill-current" />
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs">gets</span>
                                        <div className="relative w-28 shrink-0 flex justify-end">
                                            <span className="font-bold text-sm text-gray-400 pr-3 py-1.5">0%</span>
                                        </div>
                                    </div>
                                    <div className="w-7"></div>
                                </div>
                            )}

                            {perfTiers.length === 0 && (
                                <p className="text-sm text-gray-500 text-center py-4 italic">No performance tiers defined. Performance multiplier will be 0%.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Add Step Modal (14th Month) */}
            {addModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Bonus Step</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Total Years Completed *</label>
                                <div className="relative">
                                    <input autoFocus type="number" min="0" max="50" value={newStepYears} onChange={e => setNewStepYears(e.target.value)} placeholder="e.g. 5"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none pr-12" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">years</span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Percentage *</label>
                                <div className="relative">
                                    <input type="number" min="0" max="100" value={newStepPct} onChange={e => setNewStepPct(e.target.value)} placeholder="e.g. 80"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none pr-8" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setAddModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Cancel</button>
                            <button onClick={confirmAddStep} disabled={!newStepYears || !newStepPct}
                                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
                                Add
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Tier Modal (Performance) */}
            {addTierModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Performance Tier</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Rating *</label>
                                <div className="relative">
                                    <input autoFocus type="number" step="0.1" min="0" max="5" value={newTierMinRating} onChange={e => setNewTierMinRating(e.target.value)} placeholder="e.g. 4.8"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none pr-8" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500 text-sm"><Star className="w-4 h-4 fill-current"/></span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Multiplier Percentage *</label>
                                <div className="relative">
                                    <input type="number" min="0" value={newTierMultiplier} onChange={e => setNewTierMultiplier(e.target.value)} placeholder="e.g. 150"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none pr-8" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">%</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setAddTierModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Cancel</button>
                            <button onClick={confirmAddTier} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition">Add Tier</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

/* ═══════════════════════════════════════════════════
   FINES TABLE TAB
   ═══════════════════════════════════════════════════ */
function FinesTableTab({ departments, positions, categories }: {
    departments: HRDepartment[];
    positions: HRPosition[];
    categories: HRDisciplinaryCategory[];
}) {
    const [catalog, setCatalog] = useState<HRDisciplinaryCatalog[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [editingNode, setEditingNode] = useState<HRDisciplinaryCatalog | null>(null)

    const fetchCatalog = useCallback(async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase.from('hr_disciplinary_catalog').select('*, category:hr_disciplinary_categories(*)').order('infraction_name', { ascending: true })
            if (error) throw error
            setCatalog(data as HRDisciplinaryCatalog[] || [])
        } catch (err) {
            console.error('Error fetching catalog', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchCatalog()
    }, [fetchCatalog])

    async function handleSave(formData: Partial<HRDisciplinaryCatalog>) {
        try {
            if (editingNode) {
                const { error } = await supabase.from('hr_disciplinary_catalog').update(formData).eq('id', editingNode.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('hr_disciplinary_catalog').insert([formData])
                if (error) throw error
            }
            fetchCatalog()
            setModalOpen(false)
        } catch (err) {
            console.error(err)
            alert('Failed to save infraction.')
        }
    }

    async function handleDelete(id: string) {
        if (!window.confirm('Delete this infraction template? This will not remove past fines, but it will remove the template.')) return
        try {
            const { error } = await supabase.from('hr_disciplinary_catalog').delete().eq('id', id)
            if (error) throw error
            fetchCatalog()
        } catch (err) {
            console.error(err)
            alert('Failed to delete infraction.')
        }
    }

    const fmt = (n: number | null) => {
        if (n === null || isNaN(n)) return '0'
        return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Fine Tables</h2>
                    <p className="text-sm text-gray-500 mt-1">Manage the predefined list of infractions and their default fine amounts.</p>
                </div>
                <button 
                    onClick={() => { setEditingNode(null); setModalOpen(true); }} 
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
                >
                    <Plus className="w-4 h-4" /> Add Infraction
                </button>
            </div>

            <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500 w-2/5">Infraction / Reason</th>
                                <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500 w-1/5">Category</th>
                                <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500 w-1/5">Applicability</th>
                                <th className="text-right px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">Default Amount (VND)</th>
                                <th className="text-center px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500 w-32">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan={5} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></td></tr>
                        ) : catalog.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-12 text-gray-400">
                                    No infractions found. Add one to build the disciplinary catalog.
                                </td>
                            </tr>
                        ) : (
                            catalog.map(c => (
                                <tr key={c.id} className="hover:bg-gray-50/80 transition-colors group">
                                    <td className="px-6 py-4 text-gray-900 font-medium text-sm">
                                        {c.infraction_name}
                                    </td>
                                    <td className="px-6 py-4">
                                        {c.category ? (
                                            <span className="text-sm font-medium text-gray-900">
                                                {c.category.name}
                                            </span>
                                        ) : (
                                            <span className="text-gray-400 text-sm italic">—</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {c.applicability_type === 'global' && (
                                            <div className="flex items-center gap-1.5 text-gray-600">
                                                <Globe className="w-3.5 h-3.5" /> <span className="text-sm font-medium">Global</span>
                                            </div>
                                        )}
                                        {c.applicability_type === 'department' && (
                                            <div className="flex items-center gap-1.5 text-blue-600">
                                                <Building2 className="w-3.5 h-3.5" /> <span className="text-sm font-medium">{departments.find(d => d.id === c.target_id)?.name || 'Unknown Department'}</span>
                                            </div>
                                        )}
                                        {c.applicability_type === 'position' && (
                                            <div className="flex items-center gap-1.5 text-purple-600">
                                                <Briefcase className="w-3.5 h-3.5" /> <span className="text-sm font-medium">{positions.find(p => p.id === c.target_id)?.name || 'Unknown Position'}</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-sm">
                                        <span className="text-gray-900 font-semibold">{fmt(c.default_amount)}</span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => { setEditingNode(c); setModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(c.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
                            <h3 className="text-lg font-bold text-gray-900">{editingNode ? 'Edit Infraction' : 'Add Infraction'}</h3>
                            <button onClick={() => setModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-900 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            <FormCatalog 
                                initialData={editingNode} 
                                categories={categories}
                                departments={departments}
                                positions={positions}
                                onSave={handleSave} 
                                onCancel={() => setModalOpen(false)} 
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function FormCatalog({ 
    initialData, 
    categories, 
    departments,
    positions,
    onSave, 
    onCancel 
}: { 
    initialData: HRDisciplinaryCatalog | null, 
    categories: HRDisciplinaryCategory[], 
    departments: HRDepartment[],
    positions: HRPosition[],
    onSave: (d: Partial<HRDisciplinaryCatalog>) => void, 
    onCancel: () => void 
}) {
    const [name, setName] = useState(initialData?.infraction_name || '')
    const [amount, setAmount] = useState(initialData?.default_amount || 0)
    const [categoryId, setCategoryId] = useState(initialData?.category_id || '')
    const [applicabilityType, setApplicabilityType] = useState<'global' | 'department' | 'position'>(initialData?.applicability_type || 'global')
    const [targetId, setTargetId] = useState(initialData?.target_id || '')
    const [displayAmount, setDisplayAmount] = useState(initialData?.default_amount ? Number(initialData.default_amount).toLocaleString('en-US') : '')
    const [submitting, setSubmitting] = useState(false)

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!name || amount < 0) return
        if (applicabilityType !== 'global' && !targetId) {
            alert('Please select a target department or position.')
            return
        }
        setSubmitting(true)
        onSave({
            infraction_name: name,
            default_amount: amount,
            category_id: categoryId || null,
            applicability_type: applicabilityType,
            target_id: applicabilityType === 'global' ? null : targetId
        })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Reason / Infraction Name <span className="text-red-500">*</span></label>
                <input 
                    type="text" 
                    required 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 text-gray-900 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                    placeholder="e.g. Late for Shift" 
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Category</label>
                    <select 
                        value={categoryId} 
                        onChange={e => setCategoryId(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 text-gray-900 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option value="">No Category</option>
                        {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Default Fine (VND) <span className="text-red-500">*</span></label>
                    <input 
                        type="text" 
                        required 
                        value={displayAmount} 
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
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 text-gray-900 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none" 
                        placeholder="0" 
                    />
                </div>
            </div>

            <div className="border border-gray-100 rounded-xl p-4 bg-gray-50 space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-3">Applicability Scope</label>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            type="button"
                            onClick={() => { setApplicabilityType('global'); setTargetId(''); }}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${applicabilityType === 'global' ? 'bg-white border-blue-200 text-blue-700 shadow-sm' : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-200/50 hover:text-gray-900'}`}
                        >
                            <Globe className="w-4 h-4" /> Global
                        </button>
                        <button
                            type="button"
                            onClick={() => { setApplicabilityType('department'); setTargetId(''); }}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${applicabilityType === 'department' ? 'bg-white border-blue-200 text-blue-700 shadow-sm' : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-200/50 hover:text-gray-900'}`}
                        >
                            <Building2 className="w-4 h-4" /> Department
                        </button>
                        <button
                            type="button"
                            onClick={() => { setApplicabilityType('position'); setTargetId(''); }}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${applicabilityType === 'position' ? 'bg-white border-blue-200 text-blue-700 shadow-sm' : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-200/50 hover:text-gray-900'}`}
                        >
                            <Briefcase className="w-4 h-4" /> Position
                        </button>
                    </div>
                </div>

                {applicabilityType === 'department' && (
                    <div className="animate-in fade-in slide-in-from-top-1">
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Target Department <span className="text-red-500">*</span></label>
                        <select 
                            required
                            value={targetId} 
                            onChange={e => setTargetId(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-900 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="">Select Department...</option>
                            {departments.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {applicabilityType === 'position' && (
                    <div className="animate-in fade-in slide-in-from-top-1">
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Target Position <span className="text-red-500">*</span></label>
                        <select 
                            required
                            value={targetId} 
                            onChange={e => setTargetId(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-900 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="">Select Position...</option>
                            {positions.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t border-gray-100 mt-6">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">Cancel</button>
                <button type="submit" disabled={submitting || !name || amount < 0} className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {submitting ? 'Saving...' : 'Save'}
                </button>
            </div>
        </form>
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
    const [finesCategories, setFinesCategories] = useState<HRDisciplinaryCategory[]>([])
    const [alerts, setAlerts]           = useState<HRAlertSetting[]>([])

    const fetchAll = useCallback(async () => {
        setLoading(true)
        const [dRes, pRes, cRes, fRes, aRes] = await Promise.all([
            supabase.from('hr_departments').select('*').order('sort_order'),
            supabase.from('hr_positions').select('*').order('sort_order'),
            supabase.from('hr_rating_categories').select('*').order('sort_order'),
            supabase.from('hr_disciplinary_categories').select('*').order('name', { ascending: true }),
            supabase.from('hr_alert_settings').select('*').order('created_at', { ascending: true })
        ])
        if (dRes.data) setDepartments(dRes.data as HRDepartment[])
        if (pRes.data) setPositions(pRes.data as HRPosition[])
        if (cRes.data) setCategories(cRes.data as HRRatingCategory[])
        if (fRes.data) setFinesCategories(fRes.data as HRDisciplinaryCategory[])
        if (aRes.data) setAlerts(aRes.data as HRAlertSetting[])
        setLoading(false)
    }, [])

    useEffect(() => { fetchAll() }, [fetchAll])

    if (loading) return <div className="min-h-screen flex items-center justify-center"><CircularLoader /></div>

    return (
        <div className="min-h-screen text-gray-100 p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-8 border-b border-white/10 pb-6">
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Settings className="w-6 h-6 text-slate-400" />
                        HR Management Settings
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">Configure departments, positions, rules, and categories.</p>
                </div>

                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Sidebar Nav */}
                    <div className="w-full lg:w-64 shrink-0">
                        <nav className="flex flex-col space-y-1 bg-slate-900/50 p-2 rounded-xl border border-white/5" aria-label="Settings Navigation">
                            {TABS.map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={`
                                        flex items-center gap-3 w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-all text-left
                                        ${activeTab === tab.key
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'text-slate-400 hover:text-white hover:bg-white/5'}
                                    `}
                                >
                                    <tab.icon className="w-4 h-4 shrink-0" />
                                    <span className="truncate">{tab.label}</span>
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            {activeTab === 'departments' && <DepartmentsTab departments={departments} positions={positions} onRefresh={fetchAll} />}
                            {activeTab === 'positions'   && <PositionsTab departments={departments} positions={positions} onRefresh={fetchAll} />}
                            {activeTab === 'alerts'      && <AlertsTab departments={departments} positions={positions} alerts={alerts} onRefresh={fetchAll} />}
                            {activeTab === 'categories'  && <CategoriesTab departments={departments} positions={positions} categories={categories} onRefresh={fetchAll} />}
                            {activeTab === 'fines_categories' && <DisciplinaryCategoriesTab categories={finesCategories} onRefresh={fetchAll} />}
                            {activeTab === 'fines_table' && <FinesTableTab departments={departments} positions={positions} categories={finesCategories} />}
                            {activeTab === 'periods'     && <ReviewPeriodsTab />}
                            {activeTab === 'bonus'       && <BonusTab />}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
