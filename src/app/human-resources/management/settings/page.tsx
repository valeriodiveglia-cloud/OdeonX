'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRDepartment, HRPosition, HRRatingCategory, RatingCategoryScope, HRDisciplinaryCategory, HRDisciplinaryCatalog, HRAwardsCatalog, HRFlagRule } from '@/types/human-resources'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import {
    Settings, Building2, Briefcase, Star, Plus, Pencil, Trash2, X,
    Check, Globe, ChevronRight, Calendar, NotebookPen, AlertTriangle, Gift, Tag, Loader2, Award, Flag
} from 'lucide-react'

/* ═══════════════════════════════════════════════
   Tab config
   ═══════════════════════════════════════════════ */
const TABS = [
    { key: 'departments' as const, label: 'Departments', icon: Building2 },
    { key: 'positions'   as const, label: 'Positions',   icon: Briefcase },
    { key: 'categories'  as const, label: 'Rating Categories',  icon: Star },
    { key: 'fines_categories' as const, label: 'Disciplinary Categories', icon: NotebookPen },
    { key: 'fines_table' as const, label: 'Fine Tables',        icon: Tag },
    { key: 'awards_table' as const, label: 'Award Tables',      icon: Award },
    { key: 'flag_rules'   as const, label: 'Flag Rules',        icon: Flag },
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
    const { language } = useSettings()
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {language === 'vi' ? 'Xác nhận xóa' : 'Confirm Delete'}
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                    {language === 'vi' ? (
                        <>Bạn có chắc chắn muốn xóa <strong>{label}</strong>? Hành động này không thể hoàn tác.</>
                    ) : (
                        <>Are you sure you want to delete <strong>{label}</strong>? This cannot be undone.</>
                    )}
                </p>
                <div className="flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                        {language === 'vi' ? 'Hủy' : 'Cancel'}
                    </button>
                    <button onClick={onConfirm} disabled={deleting}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-2">
                        {deleting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        {language === 'vi' ? 'Xóa' : 'Delete'}
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
    const { language } = useSettings()
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
                    <h2 className="text-lg font-semibold text-white">
                        {language === 'vi' ? 'Phòng ban' : 'Departments'}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {language === 'vi' ? 'Quản lý nhân viên theo phòng ban. Các phòng ban này sẽ hiển thị dưới dạng tùy chọn thả xuống.' : 'Organize staff into departments. These will appear as dropdown options.'}
                    </p>
                </div>
                <button onClick={() => setAdding(true)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition">
                    <Plus className="w-4 h-4" /> {language === 'vi' ? 'Thêm' : 'Add'}
                </button>
            </div>

            <div className="rounded-xl bg-white shadow-md overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-8">#</th>
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">
                                {language === 'vi' ? 'Tên' : 'Name'}
                            </th>
                            <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">
                                {language === 'vi' ? 'Chức vụ' : 'Positions'}
                            </th>
                            <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-24">
                                {language === 'vi' ? 'Hành động' : 'Actions'}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {adding && (
                            <tr className="border-t border-gray-100 bg-blue-50/30">
                                <td className="px-4 py-2 text-sm text-gray-400">—</td>
                                <td className="px-4 py-2" colSpan={2}>
                                    <InlineForm value="" onSave={handleAdd} onCancel={() => setAdding(false)} placeholder={language === 'vi' ? 'Tên phòng ban…' : 'Department name…'} saving={saving} />
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
                                            <InlineForm value={d.name} onSave={(n) => handleEdit(d.id, n)} onCancel={() => setEditId(null)} placeholder={language === 'vi' ? 'Tên phòng ban…' : 'Department name…'} saving={saving} />
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <Building2 className="w-4 h-4 text-blue-500" />
                                                <span className="text-sm font-medium text-gray-900">{d.name}</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                                            {language === 'vi' ? `${posCount} chức vụ` : `${posCount} positions`}
                                        </span>
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
                                {language === 'vi' ? 'Chưa có phòng ban nào. ' : 'No departments yet. '}
                                <button onClick={() => setAdding(true)} className="text-blue-600 hover:text-blue-700 font-medium">
                                    {language === 'vi' ? 'Thêm phòng ban đầu tiên' : 'Add your first'}
                                </button>
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
    const { language } = useSettings()
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
                    <h2 className="text-lg font-semibold text-white">
                        {language === 'vi' ? 'Chức vụ' : 'Positions'}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {language === 'vi' ? 'Định nghĩa các chức vụ công việc. Tùy chọn liên kết chúng với một phòng ban.' : 'Define job positions. Optionally link them to a department.'}
                    </p>
                </div>
                <button onClick={openAdd}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition">
                    <Plus className="w-4 h-4" /> {language === 'vi' ? 'Thêm' : 'Add'}
                </button>
            </div>

            <div className="rounded-xl bg-white shadow-md overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-8">#</th>
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">
                                {language === 'vi' ? 'Chức vụ' : 'Position'}
                            </th>
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">
                                {language === 'vi' ? 'Phòng ban' : 'Department'}
                            </th>
                            <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-24">
                                {language === 'vi' ? 'Hành động' : 'Actions'}
                            </th>
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
                                        <span className="text-xs text-gray-400 italic">
                                            {language === 'vi' ? 'Tất cả phòng ban' : 'Any department'}
                                        </span>
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
                                {language === 'vi' ? 'Chưa có chức vụ nào. ' : 'No positions yet. '}
                                <button onClick={openAdd} className="text-blue-600 hover:text-blue-700 font-medium">
                                    {language === 'vi' ? 'Thêm chức vụ đầu tiên' : 'Add your first'}
                                </button>
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Position modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            {editPos ? (language === 'vi' ? 'Sửa chức vụ' : 'Edit Position') : (language === 'vi' ? 'Chức vụ mới' : 'New Position')}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {language === 'vi' ? 'Tên chức vụ *' : 'Position Name *'}
                                </label>
                                <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={language === 'vi' ? 'vd. Bếp trưởng' : 'e.g. Head Chef'}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {language === 'vi' ? 'Phòng ban (tùy chọn)' : 'Department (optional)'}
                                </label>
                                <select value={deptId} onChange={e => setDeptId(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                                    <option value="">{language === 'vi' ? 'Tất cả phòng ban' : 'Any department'}</option>
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                                {language === 'vi' ? 'Hủy' : 'Cancel'}
                            </button>
                            <button onClick={handleSave} disabled={saving || !name.trim()}
                                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2">
                                {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                {editPos ? (language === 'vi' ? 'Cập nhật' : 'Update') : (language === 'vi' ? 'Tạo mới' : 'Create')}
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
    const { language } = useSettings()
    const [modalOpen, setModalOpen] = useState(false)
    const [editCat, setEditCat]     = useState<HRRatingCategory | null>(null)
    const [saving, setSaving]       = useState(false)
    const [deleteId, setDeleteId]   = useState<string | null>(null)
    const [deleting, setDeleting]   = useState(false)

    // Form state
    const [label, setLabel]         = useState('')
    const [labelVi, setLabelVi]     = useState('')
    const [scope, setScope]         = useState<RatingCategoryScope>('global')
    const [scopeId, setScopeId]     = useState<string>('')

    const openAdd = () => { setEditCat(null); setLabel(''); setLabelVi(''); setScope('global'); setScopeId(''); setModalOpen(true) }
    const openEdit = (c: HRRatingCategory) => { setEditCat(c); setLabel(c.label); setLabelVi(c.label_vi || ''); setScope(c.scope); setScopeId(c.scope_id || ''); setModalOpen(true) }

    const handleSave = async () => {
        if (!label.trim()) return
        setSaving(true)
        const data = {
            label: label.trim(),
            label_vi: labelVi.trim() || null,
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
                <Globe className="w-3 h-3" /> {language === 'vi' ? 'Toàn cục' : 'Global'}
            </span>
        )
        if (cat.scope === 'department') return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                <Building2 className="w-3 h-3" /> {cat.scope_id ? deptMap[cat.scope_id] || (language === 'vi' ? 'Không xác định' : 'Unknown') : '—'}
            </span>
        )
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                <Briefcase className="w-3 h-3" /> {cat.scope_id ? posMap[cat.scope_id] || (language === 'vi' ? 'Không xác định' : 'Unknown') : '—'}
            </span>
        )
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-lg font-semibold text-white">
                        {language === 'vi' ? 'Danh mục đánh giá' : 'Rating Categories'}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {language === 'vi' ? 'Định nghĩa tiêu chí đánh giá hiệu suất. Áp dụng toàn cục, theo phòng ban, hoặc theo chức vụ.' : 'Define performance rating criteria. Assign globally, per department, or per position.'}
                    </p>
                </div>
                <button onClick={openAdd}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition">
                    <Plus className="w-4 h-4" /> {language === 'vi' ? 'Thêm' : 'Add'}
                </button>
            </div>

            <div className="rounded-xl bg-white shadow-md overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-8">#</th>
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">
                                {language === 'vi' ? 'Danh mục' : 'Category'}
                            </th>
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">
                                {language === 'vi' ? 'Phạm vi' : 'Scope'}
                            </th>
                            <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-24">
                                {language === 'vi' ? 'Hành động' : 'Actions'}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {categories.map((c, idx) => (
                            <tr key={c.id} className={`border-t border-gray-100 hover:bg-gray-50/80 transition ${idx % 2 === 0 ? 'bg-gray-50/30' : ''}`}>
                                <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <Star className="w-4 h-4 text-amber-500 font-medium shrink-0" />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-gray-900">{c.label}</span>
                                            {c.label_vi && <span className="text-xs text-gray-400">{c.label_vi}</span>}
                                        </div>
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
                                {language === 'vi' ? 'Chưa có danh mục đánh giá nào. ' : 'No rating categories yet. '}
                                <button onClick={openAdd} className="text-blue-600 hover:text-blue-700 font-medium">
                                    {language === 'vi' ? 'Thêm danh mục đầu tiên' : 'Add your first'}
                                </button>
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Category modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            {editCat ? (language === 'vi' ? 'Sửa danh mục' : 'Edit Category') : (language === 'vi' ? 'Danh mục đánh giá mới' : 'New Rating Category')}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {language === 'vi' ? 'Nhãn (Tiếng Anh) *' : 'Label (English) *'}
                                </label>
                                <input autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Knife Skills"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {language === 'vi' ? 'Nhãn (Tiếng Việt)' : 'Label (Vietnamese)'}
                                </label>
                                <input value={labelVi} onChange={e => setLabelVi(e.target.value)} placeholder="vd. Kỹ năng dùng dao"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                            </div>

                            {/* Scope selector */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {language === 'vi' ? 'Phạm vi' : 'Scope'}
                                </label>
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
                                            {s === 'global' ? (language === 'vi' ? 'Toàn cục' : 'Global') : s === 'department' ? (language === 'vi' ? 'Phòng ban' : 'Department') : (language === 'vi' ? 'Chức vụ' : 'Position')}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Scope target */}
                            {scope === 'department' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        {language === 'vi' ? 'Phòng ban' : 'Department'}
                                    </label>
                                    <select value={scopeId} onChange={e => setScopeId(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                                        <option value="">{language === 'vi' ? 'Chọn phòng ban…' : 'Select department…'}</option>
                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                            )}
                            {scope === 'position' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        {language === 'vi' ? 'Chức vụ' : 'Position'}
                                    </label>
                                    <select value={scopeId} onChange={e => setScopeId(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                                        <option value="">{language === 'vi' ? 'Chọn chức vụ…' : 'Select position…'}</option>
                                        {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                                {language === 'vi' ? 'Hủy' : 'Cancel'}
                            </button>
                            <button onClick={handleSave} disabled={saving || !label.trim() || (scope !== 'global' && !scopeId)}
                                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2">
                                {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                {editCat ? (language === 'vi' ? 'Cập nhật' : 'Update') : (language === 'vi' ? 'Tạo mới' : 'Create')}
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
    const { hrReviewFrequency, setHrReviewFrequency, language } = useSettings()

    const PERIOD_OPTIONS = [
        'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Semi-Annually', 'Annually'
    ]

    const getPeriodLabel = (o: string) => {
        if (o === 'Daily') return language === 'vi' ? 'Hàng ngày' : 'Daily'
        if (o === 'Weekly') return language === 'vi' ? 'Hàng tuần' : 'Weekly'
        if (o === 'Monthly') return language === 'vi' ? 'Hàng tháng' : 'Monthly'
        if (o === 'Quarterly') return language === 'vi' ? 'Hàng quý' : 'Quarterly'
        if (o === 'Semi-Annually') return language === 'vi' ? 'Nửa năm' : 'Semi-Annually'
        if (o === 'Annually') return language === 'vi' ? 'Hàng năm' : 'Annually'
        return o
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-semibold text-white">
                        {language === 'vi' ? 'Tần suất đánh giá' : 'Review Frequency'}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {language === 'vi' ? 'Xác định tần suất thực hiện đánh giá hiệu suất trong toàn tổ chức.' : 'Define how often performance reviews are conducted across the organization.'}
                    </p>
                </div>
            </div>

            <div className="rounded-xl bg-white shadow-md overflow-hidden p-6">
                <div className="max-w-sm">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        {language === 'vi' ? 'Tần suất' : 'Frequency'}
                    </label>
                    <select 
                        value={hrReviewFrequency} 
                        onChange={e => setHrReviewFrequency(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    >
                        {PERIOD_OPTIONS.map(o => (
                            <option key={o} value={o}>{getPeriodLabel(o)}</option>
                        ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-3">
                        {language === 'vi' ? 'Cài đặt này sẽ tự động tổ chức tất cả các đợt đánh giá hiệu suất dựa trên chu kỳ này.' : 'This setting will automatically organize all performance reviews based on this cycle.'}
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
    const { language } = useSettings()
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
                    <h2 className="text-lg font-semibold text-white">
                        {language === 'vi' ? 'Danh mục kỷ luật' : 'Disciplinary Categories'}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {language === 'vi' ? 'Quản lý các danh mục cho tiền phạt/hành động kỷ luật (ví dụ: Chuyên cần, Vệ sinh, Hiệu suất).' : 'Manage categories for fines/disciplinary actions (e.g., Attendance, Hygiene, Performance).'}
                    </p>
                </div>
                <button onClick={() => setAdding(true)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition">
                    <Plus className="w-4 h-4" /> {language === 'vi' ? 'Thêm' : 'Add'}
                </button>
            </div>

            <div className="rounded-xl bg-white shadow-md overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-8">#</th>
                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">
                                {language === 'vi' ? 'Tên danh mục' : 'Category Name'}
                            </th>
                            <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-24">
                                {language === 'vi' ? 'Hành động' : 'Actions'}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {adding && (
                            <tr className="border-t border-gray-100 bg-blue-50/30">
                                <td className="px-4 py-2 text-sm text-gray-400">—</td>
                                <td className="px-4 py-2">
                                    <InlineForm value="" onSave={handleAdd} onCancel={() => setAdding(false)} placeholder={language === 'vi' ? 'vd. Hành vi' : 'e.g. Behavioral'} saving={saving} />
                                </td>
                                <td />
                            </tr>
                        )}
                        {categories.map((c, idx) => (
                            <tr key={c.id} className={`border-t border-gray-100 hover:bg-gray-50/80 transition ${idx % 2 === 0 ? 'bg-gray-50/30' : ''}`}>
                                <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                                <td className="px-4 py-3">
                                    {editId === c.id ? (
                                        <InlineForm value={c.name} onSave={(n) => handleEdit(c.id, n)} onCancel={() => setEditId(null)} placeholder={language === 'vi' ? 'Tên danh mục…' : 'Category name…'} saving={saving} />
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
                                {language === 'vi' ? 'Chưa có danh mục kỷ luật nào. ' : 'No disciplinary categories yet. '}
                                <button onClick={() => setAdding(true)} className="text-blue-600 hover:text-blue-700 font-medium">
                                    {language === 'vi' ? 'Thêm danh mục đầu tiên' : 'Add your first'}
                                </button>
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
        currency,
        language
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
                    <h2 className="text-lg font-semibold text-white">
                        {language === 'vi' ? 'Cấu hình tiền thưởng' : 'Bonus Configurations'}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {language === 'vi' ? 'Cấu hình các quy tắc tháng lương 14 trên toàn bộ nhân viên.' : 'Configure 14th month rules globally across all staff.'}
                    </p>
                </div>
                {hasChanges && (
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition">
                        {language === 'vi' ? 'Lưu thay đổi' : 'Save Changes'}
                    </button>
                )}
            </div>

            <div className="bg-white rounded-xl shadow-md overflow-hidden p-6 space-y-8">
                {/* 14th Month Base Rules */}
                <div>
                    <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Gift className="w-5 h-5 text-blue-600" />
                        {language === 'vi' ? 'Điều kiện nhận tháng lương 14 cơ bản' : '14th Month Base Eligibility'}
                    </h3>
                    <div className="max-w-xs">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {language === 'vi' ? 'Ngưỡng thâm niên cơ bản (Năm)' : 'Base Tenure Threshold (Years)'}
                        </label>
                        <p className="text-xs text-gray-500 mb-3">
                            {language === 'vi' ? 'Nhân viên phải hoàn thành số năm này trước khi mở khóa phần thưởng tháng 14.' : 'Staff must complete this many years before unlocking the 14th month bonus.'}
                        </p>
                        <div className="relative">
                            <input 
                                type="number" min="0" max="20"
                                value={baseYears} 
                                onChange={e => setBaseYears(e.target.value)}
                                className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                                {language === 'vi' ? 'năm' : 'years'}
                            </span>
                        </div>
                    </div>
                </div>

                <hr className="border-gray-100" />

                {/* 14th Month Steps */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-md font-semibold text-gray-900 mb-1">
                                {language === 'vi' ? 'Các bước phần trăm' : 'Percentage Steps'}
                            </h3>
                            <p className="text-xs text-gray-500">
                                {language === 'vi' ? 'Cấu hình tỷ lệ phần trăm được trao mỗi năm sau khi đạt đến ngưỡng cơ bản.' : 'Configure what percentage is given each year after reaching the base threshold.'}
                            </p>
                        </div>
                        <button onClick={openAddStepModal} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-100 transition">
                            <Plus className="w-4 h-4" /> {language === 'vi' ? 'Thêm bước' : 'Add Step'}
                        </button>
                    </div>

                    <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-3">
                        {steps.map((step, idx) => (
                            <div key={idx} className="flex items-center gap-4 bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                                <div className="flex-1">
                                    <span className="text-sm font-medium text-gray-700">
                                        {language === 'vi' ? (
                                            <>Sau tổng cộng <span className="font-bold text-gray-900">{step.years}</span> năm</>
                                        ) : (
                                            <>After <span className="font-bold text-gray-900">{step.years}</span> total years</>
                                        )}
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
                                    title={language === 'vi' ? 'Xóa bước này' : 'Remove this step'}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        {steps.length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-4 italic">
                                {language === 'vi' ? 'Chưa định nghĩa bước phần trăm nào. Nhân viên sẽ nhận được 0% của tháng lương 14.' : 'No percentage steps defined. Staff will receive 0% of the 14th month.'}
                            </p>
                        )}
                    </div>
                </div>

                <hr className="border-gray-100" />

                {/* Part-Time Bonus Config */}
                <div>
                    <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Gift className="w-5 h-5 text-blue-600" />
                        {language === 'vi' ? 'Tính thưởng cho nhân viên bán thời gian' : 'Part-Time Bonus Calculation'}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="flex flex-col h-full">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {language === 'vi' ? 'Giới hạn tối đa' : 'Max Cap'} ({currency})
                            </label>
                            <p className="text-xs text-gray-500 mb-3">
                                {language === 'vi' ? 'Tiền thưởng tối đa được trao khi đạt số giờ mục tiêu.' : 'Maximum bonus given for reaching target hours.'}
                            </p>
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
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {language === 'vi' ? 'Giờ mục tiêu' : 'Target Hours'}
                            </label>
                            <p className="text-xs text-gray-500 mb-3">
                                {language === 'vi' ? 'Số giờ yêu cầu để nhận mức giới hạn tối đa.' : 'Hours required to receive the max cap.'}
                            </p>
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
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {language === 'vi' ? 'Số giờ tối thiểu' : 'Minimum Hours'}
                            </label>
                            <p className="text-xs text-gray-500 mb-3">
                                {language === 'vi' ? 'Số giờ dưới mức này sẽ nhận 0 tiền thưởng.' : 'Hours below this get 0 bonus.'}
                            </p>
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
                        {language === 'vi' ? 'Tích hợp hiệu suất' : 'Performance Integration'}
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {/* 13th Month Split */}
                        <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl space-y-4">
                            <div>
                                <h4 className="text-sm font-semibold text-gray-900">
                                    {language === 'vi' ? 'Cấu trúc tháng lương 13' : '13th Month Structure'}
                                </h4>
                                <p className="text-xs text-gray-500 mt-1">
                                    {language === 'vi' ? 'Chia nhỏ phần thưởng tháng lương 13 thành phần cam kết và phần dựa trên hiệu suất.' : 'Split the 13th month bonus into a guaranteed portion and a performance-based portion.'}
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="relative">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        {language === 'vi' ? 'Cam kết' : 'Guaranteed'}
                                    </label>
                                    <input 
                                        type="number" min="0" max="100"
                                        value={guaranteed13th} 
                                        onChange={e => setGuaranteed13th(e.target.value)}
                                        className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                    <span className="absolute right-3 top-7 text-gray-400 text-sm font-medium">%</span>
                                </div>
                                <div className="relative">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        {language === 'vi' ? 'Hiệu suất' : 'Performance'}
                                    </label>
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
                                <h4 className="text-sm font-semibold text-gray-900">
                                    {language === 'vi' ? 'Điều kiện tối thiểu nhận thưởng' : 'Bonus Gatekeepers'}
                                </h4>
                                <p className="text-xs text-gray-500 mt-1">
                                    {language === 'vi' ? 'Điểm đánh giá trung bình tối thiểu để nhận các khoản thưởng này.' : 'Minimum average rating required to receive these bonuses at all.'}
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="relative">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        {language === 'vi' ? 'Đánh giá tối thiểu tháng 14' : '14th Month Min. Rating'}
                                    </label>
                                    <input 
                                        type="number" step="0.1" min="0" max="5"
                                        value={minRating14th} 
                                        onChange={e => setMinRating14th(e.target.value)}
                                        className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                    <span className="absolute right-3 top-7 text-amber-500 text-sm"><Star className="w-4 h-4 fill-current"/></span>
                                </div>
                                <div className="relative">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        {language === 'vi' ? 'Đánh giá tối thiểu bán thời gian' : 'Part-Time Min. Rating'}
                                    </label>
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
                                <h3 className="text-md font-semibold text-gray-900 mb-1">
                                    {language === 'vi' ? 'Hệ số nhân hiệu suất tháng lương 13' : '13th Month Performance Multipliers'}
                                </h3>
                                <p className="text-xs text-gray-500">
                                    {language === 'vi' ? 'Cấu hình cách phần thưởng hiệu suất tháng 13 điều chỉnh theo điểm đánh giá.' : 'Configure how the performance portion of the 13th month bonus scales with the rating.'}
                                </p>
                            </div>
                            <button onClick={() => { setNewTierMinRating(''); setNewTierMultiplier(''); setAddTierModalOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-100 transition">
                                <Plus className="w-4 h-4" /> {language === 'vi' ? 'Thêm bậc' : 'Add Tier'}
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
                                            <span className="text-sm font-medium text-gray-700">
                                                {language === 'vi' ? 'Điểm đánh giá từ' : 'Rating from'}
                                            </span>
                                            <span className="font-bold text-gray-900 flex items-center gap-1">
                                                {tier.min_rating.toFixed(2)} {language === 'vi' ? 'đến' : 'to'} {upperBound} <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs text-gray-500">
                                                {language === 'vi' ? 'nhận' : 'gets'}
                                            </span>
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
                                            title={language === 'vi' ? 'Xóa bậc này' : 'Remove this tier'}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                );
                            })}
                            
                            {perfTiers.length > 0 && perfTiers[0].min_rating > 0 && (
                                <div className="flex items-center gap-4 bg-gray-100/50 p-3 rounded-lg border border-gray-200 border-dashed text-gray-500">
                                    <div className="flex-1 flex items-center gap-2">
                                        <span className="text-sm font-medium">
                                            {language === 'vi' ? 'Điểm đánh giá từ' : 'Rating from'}
                                        </span>
                                        <span className="font-bold flex items-center gap-1">
                                            0.00 {language === 'vi' ? 'đến' : 'to'} {(perfTiers[0].min_rating - 0.01).toFixed(2)} <Star className="w-3.5 h-3.5 opacity-50 fill-current" />
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs">
                                            {language === 'vi' ? 'nhận' : 'gets'}
                                        </span>
                                        <div className="relative w-28 shrink-0 flex justify-end">
                                            <span className="font-bold text-sm text-gray-400 pr-3 py-1.5">0%</span>
                                        </div>
                                    </div>
                                    <div className="w-7"></div>
                                </div>
                            )}

                            {perfTiers.length === 0 && (
                                <p className="text-sm text-gray-500 text-center py-4 italic">
                                    {language === 'vi' ? 'Chưa định nghĩa bậc hiệu suất nào. Hệ số nhân hiệu suất sẽ là 0%.' : 'No performance tiers defined. Performance multiplier will be 0%.'}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Add Step Modal (14th Month) */}
            {addModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            {language === 'vi' ? 'Thêm bước thưởng' : 'Add Bonus Step'}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {language === 'vi' ? 'Tổng số năm hoàn thành *' : 'Total Years Completed *'}
                                </label>
                                <div className="relative">
                                    <input autoFocus type="number" min="0" max="50" value={newStepYears} onChange={e => setNewStepYears(e.target.value)} placeholder={language === 'vi' ? 'vd. 5' : 'e.g. 5'}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none pr-12" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                                        {language === 'vi' ? 'năm' : 'years'}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {language === 'vi' ? 'Tỷ lệ phần trăm *' : 'Percentage *'}
                                </label>
                                <div className="relative">
                                    <input type="number" min="0" max="100" value={newStepPct} onChange={e => setNewStepPct(e.target.value)} placeholder={language === 'vi' ? 'vd. 80' : 'e.g. 80'}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none pr-8" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setAddModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                                {language === 'vi' ? 'Hủy' : 'Cancel'}
                            </button>
                            <button onClick={confirmAddStep} disabled={!newStepYears || !newStepPct}
                                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
                                {language === 'vi' ? 'Thêm' : 'Add'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Tier Modal (Performance) */}
            {addTierModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            {language === 'vi' ? 'Thêm bậc hiệu suất' : 'Add Performance Tier'}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {language === 'vi' ? 'Điểm đánh giá tối thiểu *' : 'Minimum Rating *'}
                                </label>
                                <div className="relative">
                                    <input autoFocus type="number" step="0.1" min="0" max="5" value={newTierMinRating} onChange={e => setNewTierMinRating(e.target.value)} placeholder={language === 'vi' ? 'vd. 4.8' : 'e.g. 4.8'}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none pr-8" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500 text-sm"><Star className="w-4 h-4 fill-current"/></span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {language === 'vi' ? 'Tỷ lệ phần trăm hệ số nhân *' : 'Multiplier Percentage *'}
                                </label>
                                <div className="relative">
                                    <input type="number" min="0" value={newTierMultiplier} onChange={e => setNewTierMultiplier(e.target.value)} placeholder={language === 'vi' ? 'vd. 150' : 'e.g. 150'}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none pr-8" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">%</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setAddTierModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                                {language === 'vi' ? 'Hủy' : 'Cancel'}
                            </button>
                            <button onClick={confirmAddTier} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition">
                                {language === 'vi' ? 'Thêm bậc' : 'Add Tier'}
                            </button>
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
    const { language } = useSettings()
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
            alert(language === 'vi' ? 'Không thể lưu vi phạm.' : 'Failed to save infraction.')
        }
    }

    async function handleDelete(id: string) {
        if (!window.confirm(language === 'vi' ? 'Xóa biểu mẫu vi phạm này? Hành động này sẽ không xóa các khoản phạt trong quá khứ, nhưng sẽ xóa biểu mẫu.' : 'Delete this infraction template? This will not remove past fines, but it will remove the template.')) return
        try {
            const { error } = await supabase.from('hr_disciplinary_catalog').delete().eq('id', id)
            if (error) throw error
            fetchCatalog()
        } catch (err) {
            console.error(err)
            alert(language === 'vi' ? 'Không thể xóa vi phạm.' : 'Failed to delete infraction.')
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
                    <h2 className="text-lg font-bold text-gray-900">
                        {language === 'vi' ? 'Bảng tiền phạt' : 'Fine Tables'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {language === 'vi' ? 'Quản lý danh sách định nghĩa sẵn của các vi phạm và số tiền phạt mặc định.' : 'Manage the predefined list of infractions and their default fine amounts.'}
                    </p>
                </div>
                <button 
                    onClick={() => { setEditingNode(null); setModalOpen(true); }} 
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
                >
                    <Plus className="w-4 h-4" /> {language === 'vi' ? 'Thêm vi phạm' : 'Add Infraction'}
                </button>
            </div>

            <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500 w-2/5">
                                    {language === 'vi' ? 'Vi phạm / Lý do' : 'Infraction / Reason'}
                                </th>
                                <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500 w-1/5">
                                    {language === 'vi' ? 'Danh mục' : 'Category'}
                                </th>
                                <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500 w-1/5">
                                    {language === 'vi' ? 'Phạm vi áp dụng' : 'Applicability'}
                                </th>
                                <th className="text-right px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                                    {language === 'vi' ? 'Số tiền mặc định (VND)' : 'Default Amount (VND)'}
                                </th>
                                <th className="text-center px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500 w-32">
                                    {language === 'vi' ? 'Hành động' : 'Actions'}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan={5} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></td></tr>
                        ) : catalog.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-12 text-gray-400">
                                    {language === 'vi' ? 'Không tìm thấy vi phạm nào. Hãy thêm một vi phạm để xây dựng danh mục kỷ luật.' : 'No infractions found. Add one to build the disciplinary catalog.'}
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
                                                <Globe className="w-3.5 h-3.5" /> <span className="text-sm font-medium">{language === 'vi' ? 'Toàn cục' : 'Global'}</span>
                                            </div>
                                        )}
                                        {c.applicability_type === 'department' && (
                                            <div className="flex items-center gap-1.5 text-blue-600">
                                                <Building2 className="w-3.5 h-3.5" /> <span className="text-sm font-medium">{departments.find(d => d.id === c.target_id)?.name || (language === 'vi' ? 'Phòng ban không xác định' : 'Unknown Department')}</span>
                                            </div>
                                        )}
                                        {c.applicability_type === 'position' && (
                                            <div className="flex items-center gap-1.5 text-purple-600">
                                                <Briefcase className="w-3.5 h-3.5" /> <span className="text-sm font-medium">{positions.find(p => p.id === c.target_id)?.name || (language === 'vi' ? 'Chức vụ không xác định' : 'Unknown Position')}</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-sm">
                                        <span className="text-gray-900 font-semibold">{fmt(c.default_amount)}</span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => { setEditingNode(c); setModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title={language === 'vi' ? 'Sửa' : 'Edit'}>
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(c.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={language === 'vi' ? 'Xóa' : 'Delete'}>
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
                            <h3 className="text-lg font-bold text-gray-900">
                                {editingNode ? (language === 'vi' ? 'Sửa vi phạm' : 'Edit Infraction') : (language === 'vi' ? 'Thêm vi phạm' : 'Add Infraction')}
                            </h3>
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
    const { language } = useSettings()
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
            alert(language === 'vi' ? 'Vui lòng chọn phòng ban hoặc chức vụ mục tiêu.' : 'Please select a target department or position.')
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
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    {language === 'vi' ? 'Lý do / Tên vi phạm' : 'Reason / Infraction Name'} <span className="text-red-500">*</span>
                </label>
                <input 
                    type="text" 
                    required 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 text-gray-900 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                    placeholder={language === 'vi' ? 'vd. Đi trễ ca' : 'e.g. Late for Shift'} 
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                        {language === 'vi' ? 'Danh mục' : 'Category'}
                    </label>
                    <select 
                        value={categoryId} 
                        onChange={e => setCategoryId(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 text-gray-900 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option value="">{language === 'vi' ? 'Không có danh mục' : 'No Category'}</option>
                        {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                        {language === 'vi' ? 'Tiền phạt mặc định (VND)' : 'Default Fine (VND)'} <span className="text-red-500">*</span>
                    </label>
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
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-3">
                        {language === 'vi' ? 'Phạm vi áp dụng' : 'Applicability Scope'}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            type="button"
                            onClick={() => { setApplicabilityType('global'); setTargetId(''); }}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${applicabilityType === 'global' ? 'bg-white border-blue-200 text-blue-700 shadow-sm' : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-200/50 hover:text-gray-900'}`}
                        >
                            <Globe className="w-4 h-4" /> {language === 'vi' ? 'Toàn cục' : 'Global'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setApplicabilityType('department'); setTargetId(''); }}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${applicabilityType === 'department' ? 'bg-white border-blue-200 text-blue-700 shadow-sm' : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-200/50 hover:text-gray-900'}`}
                        >
                            <Building2 className="w-4 h-4" /> {language === 'vi' ? 'Phòng ban' : 'Department'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setApplicabilityType('position'); setTargetId(''); }}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${applicabilityType === 'position' ? 'bg-white border-blue-200 text-blue-700 shadow-sm' : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-200/50 hover:text-gray-900'}`}
                        >
                            <Briefcase className="w-4 h-4" /> {language === 'vi' ? 'Chức vụ' : 'Position'}
                        </button>
                    </div>
                </div>

                {applicabilityType === 'department' && (
                    <div className="animate-in fade-in slide-in-from-top-1">
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                            {language === 'vi' ? 'Phòng ban mục tiêu' : 'Target Department'} <span className="text-red-500">*</span>
                        </label>
                        <select 
                            required
                            value={targetId} 
                            onChange={e => setTargetId(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-900 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="">{language === 'vi' ? 'Chọn phòng ban...' : 'Select Department...'}</option>
                            {departments.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {applicabilityType === 'position' && (
                    <div className="animate-in fade-in slide-in-from-top-1">
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                            {language === 'vi' ? 'Chức vụ mục tiêu' : 'Target Position'} <span className="text-red-500">*</span>
                        </label>
                        <select 
                            required
                            value={targetId} 
                            onChange={e => setTargetId(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-900 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="">{language === 'vi' ? 'Chọn chức vụ...' : 'Select Position...'}</option>
                            {positions.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t border-gray-100 mt-6">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                    {language === 'vi' ? 'Hủy' : 'Cancel'}
                </button>
                <button type="submit" disabled={submitting || !name || amount < 0} className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {submitting ? (language === 'vi' ? 'Đang lưu...' : 'Saving...') : (language === 'vi' ? 'Lưu' : 'Save')}
                </button>
            </div>
        </form>
    )
}

/* ═══════════════════════════════════════════════════
   AWARDS TABLE TAB
   ═══════════════════════════════════════════════════ */
function AwardsTableTab({ departments, positions, categories }: {
    departments: HRDepartment[];
    positions: HRPosition[];
    categories: HRDisciplinaryCategory[];
}) {
    const { language } = useSettings()
    const [catalog, setCatalog] = useState<HRAwardsCatalog[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [editingNode, setEditingNode] = useState<HRAwardsCatalog | null>(null)

    const fetchCatalog = useCallback(async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase.from('hr_awards_catalog').select('*, category:hr_disciplinary_categories(*)').order('award_name', { ascending: true })
            if (error) throw error
            setCatalog(data as HRAwardsCatalog[] || [])
        } catch (err) {
            console.error('Error fetching awards catalog', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchCatalog()
    }, [fetchCatalog])

    async function handleSave(formData: Partial<HRAwardsCatalog>) {
        try {
            if (editingNode) {
                const { error } = await supabase.from('hr_awards_catalog').update(formData).eq('id', editingNode.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('hr_awards_catalog').insert([formData])
                if (error) throw error
            }
            fetchCatalog()
            setModalOpen(false)
        } catch (err) {
            console.error(err)
            alert(language === 'vi' ? 'Không thể lưu giải thưởng.' : 'Failed to save award.')
        }
    }

    async function handleDelete(id: string) {
        if (!window.confirm(language === 'vi' ? 'Xóa biểu mẫu giải thưởng này? Hành động này sẽ không xóa các khoản thưởng trong quá khứ, ma sẽ xóa biểu mẫu.' : 'Delete this award template? This will not remove past awards, but it will remove the template.')) return
        try {
            const { error } = await supabase.from('hr_awards_catalog').delete().eq('id', id)
            if (error) throw error
            fetchCatalog()
        } catch (err) {
            console.error(err)
            alert(language === 'vi' ? 'Không thể xóa giải thưởng.' : 'Failed to delete award.')
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
                    <h2 className="text-lg font-bold text-gray-900">
                        {language === 'vi' ? 'Bảng tiền thưởng' : 'Award Tables'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {language === 'vi' ? 'Quản lý danh sách định nghĩa sẵn của các giải thưởng và số tiền thưởng mặc định.' : 'Manage the predefined list of awards and their default award amounts.'}
                    </p>
                </div>
                <button 
                    onClick={() => { setEditingNode(null); setModalOpen(true); }} 
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
                >
                    <Plus className="w-4 h-4" /> {language === 'vi' ? 'Thêm giải thưởng' : 'Add Award'}
                </button>
            </div>

            <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500 w-2/5">
                                    {language === 'vi' ? 'Tên giải thưởng / Lý do' : 'Award Name / Reason'}
                                </th>
                                <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500 w-1/5">
                                    {language === 'vi' ? 'Danh mục' : 'Category'}
                                </th>
                                <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500 w-1/5">
                                    {language === 'vi' ? 'Phạm vi áp dụng' : 'Applicability'}
                                </th>
                                <th className="text-right px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                                    {language === 'vi' ? 'Số tiền mặc định (VND)' : 'Default Amount (VND)'}
                                </th>
                                <th className="text-center px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-500 w-32">
                                    {language === 'vi' ? 'Hành động' : 'Actions'}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan={5} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></td></tr>
                        ) : catalog.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-12 text-gray-400">
                                    {language === 'vi' ? 'Không tìm thấy giải thưởng nào. Hãy thêm một giải thưởng.' : 'No awards found. Add one to build the awards catalog.'}
                                </td>
                            </tr>
                        ) : (
                            catalog.map(c => (
                                <tr key={c.id} className="hover:bg-gray-50/80 transition-colors group">
                                    <td className="px-6 py-4 text-gray-900 font-medium text-sm">
                                        {c.award_name}
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
                                                <Globe className="w-3.5 h-3.5" /> <span className="text-sm font-medium">{language === 'vi' ? 'Toàn cục' : 'Global'}</span>
                                            </div>
                                        )}
                                        {c.applicability_type === 'department' && (
                                            <div className="flex items-center gap-1.5 text-blue-600">
                                                <Building2 className="w-3.5 h-3.5" /> <span className="text-sm font-medium">{departments.find(d => d.id === c.target_id)?.name || (language === 'vi' ? 'Phòng ban không xác định' : 'Unknown Department')}</span>
                                            </div>
                                        )}
                                        {c.applicability_type === 'position' && (
                                            <div className="flex items-center gap-1.5 text-purple-600">
                                                <Briefcase className="w-3.5 h-3.5" /> <span className="text-sm font-medium">{positions.find(p => p.id === c.target_id)?.name || (language === 'vi' ? 'Chức vụ không xác định' : 'Unknown Position')}</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-sm">
                                        <span className="text-gray-900 font-semibold">{fmt(c.default_amount)}</span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => { setEditingNode(c); setModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title={language === 'vi' ? 'Sửa' : 'Edit'}>
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(c.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={language === 'vi' ? 'Xóa' : 'Delete'}>
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
                            <h3 className="text-lg font-bold text-gray-900">
                                {editingNode ? (language === 'vi' ? 'Sửa giải thưởng' : 'Edit Award') : (language === 'vi' ? 'Thêm giải thưởng' : 'Add Award')}
                            </h3>
                            <button onClick={() => setModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-900 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            <FormAwardsCatalog 
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

function FormAwardsCatalog({ 
    initialData, 
    categories, 
    departments,
    positions,
    onSave, 
    onCancel 
}: { 
    initialData: HRAwardsCatalog | null, 
    categories: HRDisciplinaryCategory[], 
    departments: HRDepartment[],
    positions: HRPosition[],
    onSave: (d: Partial<HRAwardsCatalog>) => void, 
    onCancel: () => void 
}) {
    const { language } = useSettings()
    const [name, setName] = useState(initialData?.award_name || '')
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
            alert(language === 'vi' ? 'Vui lòng chọn phòng ban hoặc chức vụ mục tiêu.' : 'Please select a target department or position.')
            return
        }
        setSubmitting(true)
        onSave({
            award_name: name,
            default_amount: amount,
            category_id: categoryId || null,
            applicability_type: applicabilityType,
            target_id: applicabilityType === 'global' ? null : targetId
        })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    {language === 'vi' ? 'Lý do / Tên giải thưởng' : 'Reason / Award Name'} <span className="text-red-500">*</span>
                </label>
                <input 
                    type="text" 
                    required 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 text-gray-900 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                    placeholder={language === 'vi' ? 'vd. Nhân viên xuất sắc' : 'e.g. Employee of the Month'} 
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                        {language === 'vi' ? 'Danh mục' : 'Category'}
                    </label>
                    <select 
                        value={categoryId} 
                        onChange={e => setCategoryId(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 text-gray-900 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option value="">{language === 'vi' ? 'Không có danh mục' : 'No Category'}</option>
                        {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                        {language === 'vi' ? 'Số tiền thưởng mặc định (VND)' : 'Default Award Amount (VND)'} <span className="text-red-500">*</span>
                    </label>
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
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-3">
                        {language === 'vi' ? 'Phạm vi áp dụng' : 'Applicability Scope'}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            type="button"
                            onClick={() => { setApplicabilityType('global'); setTargetId(''); }}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${applicabilityType === 'global' ? 'bg-white border-blue-200 text-blue-700 shadow-sm' : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-200/50 hover:text-gray-900'}`}
                        >
                            <Globe className="w-4 h-4" /> {language === 'vi' ? 'Toàn cục' : 'Global'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setApplicabilityType('department'); setTargetId(''); }}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${applicabilityType === 'department' ? 'bg-white border-blue-200 text-blue-700 shadow-sm' : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-200/50 hover:text-gray-900'}`}
                        >
                            <Building2 className="w-4 h-4" /> {language === 'vi' ? 'Phòng ban' : 'Department'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setApplicabilityType('position'); setTargetId(''); }}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${applicabilityType === 'position' ? 'bg-white border-blue-200 text-blue-700 shadow-sm' : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-200/50 hover:text-gray-900'}`}
                        >
                            <Briefcase className="w-4 h-4" /> {language === 'vi' ? 'Chức vụ' : 'Position'}
                        </button>
                    </div>
                </div>

                {applicabilityType === 'department' && (
                    <div className="animate-in fade-in slide-in-from-top-1">
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                            {language === 'vi' ? 'Phòng ban mục tiêu' : 'Target Department'} <span className="text-red-500">*</span>
                        </label>
                        <select 
                            required
                            value={targetId} 
                            onChange={e => setTargetId(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-900 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="">{language === 'vi' ? 'Chọn phòng ban...' : 'Select Department...'}</option>
                            {departments.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {applicabilityType === 'position' && (
                    <div className="animate-in fade-in slide-in-from-top-1">
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                            {language === 'vi' ? 'Chức vụ mục tiêu' : 'Target Position'} <span className="text-red-500">*</span>
                        </label>
                        <select 
                            required
                            value={targetId} 
                            onChange={e => setTargetId(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-900 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="">{language === 'vi' ? 'Chọn chức vụ...' : 'Select Position...'}</option>
                            {positions.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t border-gray-100 mt-6">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                    {language === 'vi' ? 'Hủy' : 'Cancel'}
                </button>
                <button type="submit" disabled={submitting || !name || amount < 0} className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {submitting ? (language === 'vi' ? 'Đang lưu...' : 'Saving...') : (language === 'vi' ? 'Lưu' : 'Save')}
                </button>
            </div>
        </form>
    )
}

function FlagRulesTab() {
    const { language } = useSettings()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [ruleId, setRuleId] = useState<string | null>(null)
    const [yellowLimit, setYellowLimit] = useState(2)
    const [greenLimit, setGreenLimit] = useState(3)
    const [awardCatalogId, setAwardCatalogId] = useState<string>('')
    const [awardsCatalog, setAwardsCatalog] = useState<HRAwardsCatalog[]>([])

    const fetchRules = useCallback(async () => {
        setLoading(true)
        try {
            const [rulesRes, catalogRes] = await Promise.all([
                supabase.from('hr_flag_rules').select('*').limit(1),
                supabase.from('hr_awards_catalog').select('*').order('award_name')
            ])

            if (catalogRes.data) {
                setAwardsCatalog(catalogRes.data as HRAwardsCatalog[])
            }

            if (rulesRes.data && rulesRes.data.length > 0) {
                const rule = rulesRes.data[0]
                setRuleId(rule.id)
                setYellowLimit(rule.yellow_limit)
                setGreenLimit(rule.green_limit)
                setAwardCatalogId(rule.award_catalog_id || '')
            }
        } catch (err) {
            console.error('Error fetching flag rules', err)
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        fetchRules()
    }, [fetchRules])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            const data = {
                yellow_limit: yellowLimit,
                green_limit: greenLimit,
                award_catalog_id: awardCatalogId || null,
                updated_at: new Date().toISOString()
            }

            let res
            if (ruleId) {
                res = await supabase.from('hr_flag_rules').update(data).eq('id', ruleId)
            } else {
                res = await supabase.from('hr_flag_rules').insert([data])
            }

            if (res.error) throw res.error

            alert(language === 'vi' ? 'Lưu quy tắc flag thành công!' : 'Flag rules saved successfully!')
            fetchRules()
        } catch (err) {
            console.error('Error saving flag rules', err)
            alert(language === 'vi' ? 'Không thể lưu quy tắc' : 'Failed to save flag rules')
        }
        setSaving(false)
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-semibold text-white">
                        {language === 'vi' ? 'Cấu hình Quy tắc Flag' : 'Flag Rules Configuration'}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {language === 'vi' 
                            ? 'Cấu hình số lượng Flag cần thiết để tự động kích hoạt Warning hoặc Phần thưởng.' 
                            : 'Configure the number of Flags required to automatically trigger a Warning or an Award.'}
                    </p>
                </div>
            </div>

            <div className="rounded-xl bg-white shadow-md p-6 max-w-3xl">
                <form onSubmit={handleSave} className="space-y-6">
                    {/* Yellow Flag Rule */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
                        <div className="flex items-center gap-3">
                            <span className="flex h-3 w-3 rounded-full bg-yellow-500" />
                            <h3 className="text-sm font-semibold text-gray-900">
                                {language === 'vi' ? 'Quy tắc Flag Vàng (Yellow Flag)' : 'Yellow Flag Rule'}
                            </h3>
                        </div>
                        <p className="text-xs text-gray-500">
                            {language === 'vi'
                                ? 'Số lượng Flag Vàng tích lũy trước khi hệ thống tự động tạo 1 Warning Đỏ.'
                                : 'Number of Yellow Flags accumulated before the system automatically creates 1 Red Warning.'}
                        </p>
                        <div className="w-32">
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Giới hạn' : 'Limit'}</label>
                            <input 
                                type="number" 
                                min="1" 
                                required 
                                value={yellowLimit} 
                                onChange={e => setYellowLimit(parseInt(e.target.value) || 2)} 
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    {/* Green Flag Rule */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
                        <div className="flex items-center gap-3">
                            <span className="flex h-3 w-3 rounded-full bg-green-500" />
                            <h3 className="text-sm font-semibold text-gray-900">
                                {language === 'vi' ? 'Quy tắc Flag Xanh (Green Flag)' : 'Green Flag Rule'}
                            </h3>
                        </div>
                        <p className="text-xs text-gray-500">
                            {language === 'vi'
                                ? 'Số lượng Flag Xanh tích lũy trước khi hệ thống tự động tạo 1 Khen thưởng.'
                                : 'Number of Green Flags accumulated before the system automatically creates 1 Award.'}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Giới hạn' : 'Limit'}</label>
                                <input 
                                    type="number" 
                                    min="1" 
                                    required 
                                    value={greenLimit} 
                                    onChange={e => setGreenLimit(parseInt(e.target.value) || 3)} 
                                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{language === 'vi' ? 'Khen thưởng tương ứng' : 'Associated Award'}</label>
                                <select 
                                    value={awardCatalogId} 
                                    onChange={e => setAwardCatalogId(e.target.value)} 
                                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                >
                                    <option value="">{language === 'vi' ? '-- Không kích hoạt thưởng --' : '-- No Auto Award --'}</option>
                                    {awardsCatalog.map(aw => (
                                        <option key={aw.id} value={aw.id}>
                                            {aw.award_name} ({Number(aw.default_amount).toLocaleString('en-US')} VND)
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <button 
                            type="submit" 
                            disabled={saving} 
                            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            {saving ? (language === 'vi' ? 'Đang lưu...' : 'Saving...') : (language === 'vi' ? 'Lưu cấu hình' : 'Save Config')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

/* ═══════════════════════════════════════════════════
   MAIN SETTINGS PAGE
   ═══════════════════════════════════════════════════ */
export default function HRManagementSettingsPage() {
    const { language } = useSettings()
    const [loading, setLoading]       = useState(true)
    const [activeTab, setActiveTab]   = useState<TabKey>('departments')
    const [departments, setDepartments] = useState<HRDepartment[]>([])
    const [positions, setPositions]     = useState<HRPosition[]>([])
    const [categories, setCategories]   = useState<HRRatingCategory[]>([])
    const [finesCategories, setFinesCategories] = useState<HRDisciplinaryCategory[]>([])

    const fetchAll = useCallback(async () => {
        setLoading(true)
        const [dRes, pRes, cRes, fRes] = await Promise.all([
            supabase.from('hr_departments').select('*').order('sort_order'),
            supabase.from('hr_positions').select('*').order('sort_order'),
            supabase.from('hr_rating_categories').select('*').order('sort_order'),
            supabase.from('hr_disciplinary_categories').select('*').order('name', { ascending: true })
        ])
        if (dRes.data) setDepartments(dRes.data as HRDepartment[])
        if (pRes.data) setPositions(pRes.data as HRPosition[])
        if (cRes.data) setCategories(cRes.data as HRRatingCategory[])
        if (fRes.data) setFinesCategories(fRes.data as HRDisciplinaryCategory[])
        setLoading(false)
    }, [])

    useEffect(() => { fetchAll() }, [fetchAll])

    if (loading) return <div className="min-h-screen flex items-center justify-center"><CircularLoader /></div>

    return (
        <div className="min-h-screen text-gray-100 p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-8 border-b border-white/10 pb-6">
                    <h1 className="text-2xl font-bold text-white">
                        {language === 'vi' ? 'Cài đặt quản trị nhân sự' : 'HR Management Settings'}
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">
                        {language === 'vi' ? 'Cấu hình các phòng ban, chức vụ, quy tắc và danh mục.' : 'Configure departments, positions, rules, and categories.'}
                    </p>
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
                                    <span className="truncate">
                                        {tab.key === 'departments' ? (language === 'vi' ? 'Phòng ban' : 'Departments')
                                        : tab.key === 'positions' ? (language === 'vi' ? 'Chức vụ' : 'Positions')
                                        : tab.key === 'categories' ? (language === 'vi' ? 'Danh mục đánh giá' : 'Rating Categories')
                                        : tab.key === 'fines_categories' ? (language === 'vi' ? 'Danh mục kỷ luật' : 'Disciplinary Categories')
                                        : tab.key === 'fines_table' ? (language === 'vi' ? 'Bảng tiền phạt' : 'Fine Tables')
                                        : tab.key === 'awards_table' ? (language === 'vi' ? 'Bảng tiền thưởng' : 'Award Tables')
                                        : tab.key === 'flag_rules' ? (language === 'vi' ? 'Quy tắc Flag' : 'Flag Rules')
                                        : tab.key === 'periods' ? (language === 'vi' ? 'Chu kỳ đánh giá' : 'Review Periods')
                                        : (language === 'vi' ? 'Cấu hình thưởng' : 'Bonus Settings')}
                                    </span>
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            {activeTab === 'departments' && <DepartmentsTab departments={departments} positions={positions} onRefresh={fetchAll} />}
                            {activeTab === 'positions' && <PositionsTab departments={departments} positions={positions} onRefresh={fetchAll} />}
                            {activeTab === 'categories'  && <CategoriesTab departments={departments} positions={positions} categories={categories} onRefresh={fetchAll} />}
                            {activeTab === 'fines_categories' && <DisciplinaryCategoriesTab categories={finesCategories} onRefresh={fetchAll} />}
                            {activeTab === 'fines_table' && <FinesTableTab departments={departments} positions={positions} categories={finesCategories} />}
                            {activeTab === 'awards_table' && <AwardsTableTab departments={departments} positions={positions} categories={finesCategories} />}
                            {activeTab === 'flag_rules'   && <FlagRulesTab />}
                            {activeTab === 'periods'     && <ReviewPeriodsTab />}
                            {activeTab === 'bonus'       && <BonusTab />}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
