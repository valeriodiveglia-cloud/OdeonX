'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRDepartment, HRPosition, HRRatingCategory, RatingCategoryScope, HRDisciplinaryCategory, HRAlertSetting, AlertScope, AlertTargetField } from '@/types/human-resources'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import {
    Settings, Building2, Briefcase, Star, Plus, Pencil, Trash2, X,
    Check, Globe, ChevronRight, Calendar, NotebookPen, AlertTriangle
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
                <div className="mt-8 border-b border-white/10 mb-6">
                    <nav className="-mb-px flex space-x-8 overflow-x-auto custom-scrollbar" aria-label="Tabs">
                        {TABS.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`
                                    flex items-center gap-2 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                                    ${activeTab === tab.key
                                        ? 'border-blue-500 text-blue-500'
                                        : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}
                                `}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Tab content */}
                {activeTab === 'departments' && <DepartmentsTab departments={departments} positions={positions} onRefresh={fetchAll} />}
                {activeTab === 'positions'   && <PositionsTab departments={departments} positions={positions} onRefresh={fetchAll} />}
                {activeTab === 'alerts'      && <AlertsTab departments={departments} positions={positions} alerts={alerts} onRefresh={fetchAll} />}
                {activeTab === 'categories'  && <CategoriesTab departments={departments} positions={positions} categories={categories} onRefresh={fetchAll} />}
                {activeTab === 'fines_categories' && <DisciplinaryCategoriesTab categories={finesCategories} onRefresh={fetchAll} />}
                {activeTab === 'periods'     && <ReviewPeriodsTab />}
            </div>
        </div>
    )
}
