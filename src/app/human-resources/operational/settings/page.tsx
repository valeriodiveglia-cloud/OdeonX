'use client'

import { useState, useEffect } from 'react'
import { ShiftType, getShiftTypes, saveShiftTypes, DEFAULT_SHIFT_TYPES, getOvertimeSettings, saveOvertimeSettings } from '@/lib/hr-operational-data'
import { Plus, Pencil, Trash2, X, RotateCcw, GitBranch, Globe, Briefcase, Clock } from 'lucide-react'

const PRESET_COLORS = [
    '#3B82F6', '#F59E0B', '#8B5CF6', '#10B981', '#06B6D4',
    '#6B7280', '#EAB308', '#EF4444', '#EC4899', '#F97316',
    '#14B8A6', '#6366F1', '#84CC16', '#A855F7', '#0EA5E9',
]

const emptyShift = (): Omit<ShiftType, 'id'> => ({
    name: '', code: '', startTime: '', endTime: '',
    color: '#3B82F6', type: 'work', hours: 0,
    allowParallel: true, globalAcrossBranches: false,
})

export default function HROperationalSettingsPage() {
    const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([])
    const [editing, setEditing] = useState<ShiftType | null>(null)
    const [isNew, setIsNew] = useState(false)
    const [activeTab, setActiveTab] = useState<'shifts' | 'overtime'>('shifts')
    const [overtimeSettings, setOvertimeSettings] = useState({ overtime_multiplier: 1.5, public_holiday_multiplier: 2.0 })

    useEffect(() => { 
        setShiftTypes(getShiftTypes()) 
        setOvertimeSettings(getOvertimeSettings())
    }, [])

    const openNew = () => {
        const newShift: ShiftType = { id: `st-${Date.now()}`, ...emptyShift() }
        setEditing(newShift)
        setIsNew(true)
    }

    const openEdit = (st: ShiftType) => {
        setEditing({ ...st })
        setIsNew(false)
    }

    const save = () => {
        if (!editing) return
        if (!editing.name || !editing.code) return alert('Name and Code are required.')

        let updated: ShiftType[]
        if (isNew) {
            updated = [...shiftTypes, editing]
        } else {
            updated = shiftTypes.map(s => s.id === editing.id ? editing : s)
        }
        setShiftTypes(updated)
        saveShiftTypes(updated)
        setEditing(null)
    }

    const remove = (id: string) => {
        if (!confirm('Delete this shift type?')) return
        const updated = shiftTypes.filter(s => s.id !== id)
        setShiftTypes(updated)
        saveShiftTypes(updated)
    }

    const resetDefaults = () => {
        if (!confirm('Reset to default shift types? This will overwrite your customizations.')) return
        setShiftTypes(DEFAULT_SHIFT_TYPES)
        saveShiftTypes(DEFAULT_SHIFT_TYPES)
    }

    const updateField = (field: keyof ShiftType, value: string | number | boolean) => {
        if (!editing) return
        const updated = { ...editing, [field]: value }
        // Auto-calculate hours for work shifts
        if ((field === 'startTime' || field === 'endTime') && updated.type === 'work' && updated.startTime && updated.endTime) {
            const [sh, sm] = updated.startTime.split(':').map(Number)
            const [eh, em] = updated.endTime.split(':').map(Number)
            let diff = (eh * 60 + em) - (sh * 60 + sm)
            if (diff < 0) diff += 24 * 60 // overnight shift
            updated.hours = Math.round(diff / 60 * 10) / 10
        }
        if (field === 'type' && value === 'leave') {
            updated.startTime = ''
            updated.endTime = ''
            updated.hours = 0
            updated.globalAcrossBranches = true
            updated.allowParallel = false
        }
        if (field === 'type' && value === 'work') {
            updated.globalAcrossBranches = false
            updated.allowParallel = true
        }
        setEditing(updated as ShiftType)
    }

    const handleSaveOvertime = (newSettings: any) => {
        setOvertimeSettings(newSettings)
        saveOvertimeSettings(newSettings)
    }

    return (
        <div className="min-h-screen bg-\[#0b1530\] text-gray-100 p-6 animate-in fade-in duration-300">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                            Operational Settings
                        </h1>
                        <p className="text-sm text-slate-400 mt-1">Configure shift types, scheduling parameters, and overtime factors.</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex overflow-x-auto no-scrollbar gap-1 bg-slate-800 rounded-xl p-1 mb-6 border border-white/5 w-fit">
                    <button onClick={() => setActiveTab('shifts')}
                        className={`min-w-[120px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                            activeTab === 'shifts' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}>
                        <Briefcase className="w-4 h-4" />
                        Shifts
                    </button>
                    <button onClick={() => setActiveTab('overtime')}
                        className={`min-w-[120px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                            activeTab === 'overtime' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}>
                        <Clock className="w-4 h-4" />
                        Overtime
                    </button>
                </div>

                {activeTab === 'shifts' && (
                    <>
                        <div className="flex justify-end gap-2 mb-4">
                        <button
                            onClick={resetDefaults}
                            className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-white/10 text-slate-400 hover:bg-white/5 transition"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reset Defaults
                        </button>
                        <button
                            onClick={openNew}
                            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition shadow"
                        >
                            <Plus className="w-4 h-4" />
                            Add Shift Type
                        </button>
                    </div>

                {/* Shift Types Table */}
                <div className="rounded-2xl bg-white shadow-md overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Color</th>
                                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Name</th>
                                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Code</th>
                                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Time</th>
                                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Hours</th>
                                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Type</th>
                                <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500" title="Allow parallel shift in another branch">Cross-Branch</th>
                                <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shiftTypes.map((st, idx) => (
                                <tr key={st.id} className={`border-t border-gray-100 ${idx % 2 === 0 ? 'bg-gray-50/50' : ''} hover:bg-gray-50 transition`}>
                                    <td className="px-4 py-3">
                                        <div className="w-6 h-6 rounded-lg shadow-inner" style={{ backgroundColor: st.color }} />
                                    </td>
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{st.name}</td>
                                    <td className="px-4 py-3">
                                        <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-bold" style={{ backgroundColor: st.color + '20', color: st.color }}>
                                            {st.code}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">
                                        {st.startTime ? `${st.startTime} – ${st.endTime}` : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{st.hours > 0 ? `${st.hours}h` : '—'}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.type === 'work' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {st.type}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            {st.globalAcrossBranches && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700" title="Appears in all branches">
                                                    <Globe className="w-3 h-3" />Global
                                                </span>
                                            )}
                                            {st.allowParallel && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-100 text-sky-700" title="Can work same slot in another branch">
                                                    <GitBranch className="w-3 h-3" />Parallel
                                                </span>
                                            )}
                                            {!st.globalAcrossBranches && !st.allowParallel && (
                                                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-400">Exclusive</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={() => openEdit(st)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => remove(st.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {shiftTypes.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                                        No shift types configured. Add one or reset to defaults.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                </>
                )}

                {activeTab === 'overtime' && (
                    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 text-gray-900 w-full max-w-4xl">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-blue-50 rounded-lg">
                                <Clock className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Overtime Multipliers</h2>
                                <p className="text-sm text-gray-500">Configure multipliers for overtime compensation via Salary or Annual Leave.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Salary Card */}
                            <div className="p-5 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                                <label className="block text-base font-semibold text-gray-800 mb-1">Paid via Salary</label>
                                <p className="text-xs text-gray-500 mb-5 h-8">
                                    Multipliers applied when overtime hours are paid through the normal payroll.
                                </p>
                                
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center justify-between">
                                            <span>Standard Overtime</span>
                                        </label>
                                        <div className="relative">
                                            <input 
                                                type="number" step="0.5" min="1"
                                                value={overtimeSettings.overtime_multiplier_salary}
                                                onChange={e => handleSaveOvertime({ ...overtimeSettings, overtime_multiplier_salary: Number(e.target.value) })}
                                                className="w-full pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 font-medium transition-shadow hover:border-gray-300 outline-none"
                                            />
                                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400 text-sm font-medium">x</div>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center justify-between">
                                            <span>Public Holiday Overtime</span>
                                        </label>
                                        <div className="relative">
                                            <input 
                                                type="number" step="0.5" min="1"
                                                value={overtimeSettings.public_holiday_multiplier_salary}
                                                onChange={e => handleSaveOvertime({ ...overtimeSettings, public_holiday_multiplier_salary: Number(e.target.value) })}
                                                className="w-full pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 font-medium transition-shadow hover:border-gray-300 outline-none"
                                            />
                                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400 text-sm font-medium">x</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Annual Leave Card */}
                            <div className="p-5 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                                <label className="block text-base font-semibold text-gray-800 mb-1">Compensated via Annual Leave</label>
                                <p className="text-xs text-gray-500 mb-5 h-8">
                                    Multipliers applied when overtime is converted into time off (ROL / Holidays).
                                </p>
                                
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center justify-between">
                                            <span>Standard Overtime</span>
                                        </label>
                                        <div className="relative">
                                            <input 
                                                type="number" step="0.5" min="1"
                                                value={overtimeSettings.overtime_multiplier_leave}
                                                onChange={e => handleSaveOvertime({ ...overtimeSettings, overtime_multiplier_leave: Number(e.target.value) })}
                                                className="w-full pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 font-medium transition-shadow hover:border-gray-300 outline-none"
                                            />
                                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400 text-sm font-medium">x</div>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center justify-between">
                                            <span>Public Holiday Overtime</span>
                                        </label>
                                        <div className="relative">
                                            <input 
                                                type="number" step="0.5" min="1"
                                                value={overtimeSettings.public_holiday_multiplier_leave}
                                                onChange={e => handleSaveOvertime({ ...overtimeSettings, public_holiday_multiplier_leave: Number(e.target.value) })}
                                                className="w-full pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 font-medium transition-shadow hover:border-gray-300 outline-none"
                                            />
                                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400 text-sm font-medium">x</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Edit/New Modal */}
                {editing && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditing(null)}>
                        <div className="bg-slate-800 rounded-2xl border border-white/10 shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-lg font-semibold text-white">{isNew ? 'New Shift Type' : 'Edit Shift Type'}</h3>
                                <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                {/* Type selector */}
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1.5">Type</label>
                                    <div className="flex gap-2">
                                        {(['work', 'leave'] as const).map(t => (
                                            <button
                                                key={t}
                                                onClick={() => updateField('type', t)}
                                                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition
                                                    ${editing.type === t
                                                        ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                                                        : 'border-white/10 text-slate-400 hover:bg-white/5'}`}
                                            >
                                                {t === 'work' ? '💼 Work' : '🌿 Leave'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Name & Code */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1.5">Name *</label>
                                        <input
                                            value={editing.name}
                                            onChange={e => updateField('name', e.target.value)}
                                            className="w-full bg-slate-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="e.g. Morning"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1.5">Code *</label>
                                        <input
                                            value={editing.code}
                                            onChange={e => updateField('code', e.target.value.toUpperCase())}
                                            className="w-full bg-slate-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="e.g. M"
                                            maxLength={4}
                                        />
                                    </div>
                                </div>

                                {/* Time (only for work) */}
                                {editing.type === 'work' && (
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1.5">Start Time</label>
                                            <input
                                                type="time"
                                                value={editing.startTime}
                                                onChange={e => updateField('startTime', e.target.value)}
                                                className="w-full bg-slate-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1.5">End Time</label>
                                            <input
                                                type="time"
                                                value={editing.endTime}
                                                onChange={e => updateField('endTime', e.target.value)}
                                                className="w-full bg-slate-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1.5">Hours</label>
                                            <input
                                                type="number"
                                                value={editing.hours}
                                                onChange={e => updateField('hours', Number(e.target.value))}
                                                className="w-full bg-slate-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:ring-blue-500 focus:border-blue-500"
                                                step="0.5"
                                                min="0"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Cross-branch behavior */}
                                <div className="pt-2 border-t border-white/10">
                                    <label className="block text-xs text-slate-400 mb-2">Cross-Branch Behavior</label>
                                    <div className="space-y-3">
                                        {/* Allow Parallel toggle */}
                                        <label className="flex items-start gap-3 p-3 rounded-xl border border-white/10 hover:bg-white/5 cursor-pointer transition">
                                            <div className="pt-0.5">
                                                <div
                                                    onClick={() => updateField('allowParallel', !editing.allowParallel)}
                                                    className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${
                                                        editing.allowParallel ? 'bg-sky-500' : 'bg-slate-600'
                                                    }`}
                                                >
                                                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                                                        editing.allowParallel ? 'translate-x-5' : 'translate-x-0.5'
                                                    }`} />
                                                </div>
                                            </div>
                                            <div className="flex-1" onClick={() => updateField('allowParallel', !editing.allowParallel)}>
                                                <div className="flex items-center gap-1.5">
                                                    <GitBranch className="w-3.5 h-3.5 text-sky-400" />
                                                    <span className="text-sm font-medium text-white">Allow Parallel</span>
                                                </div>
                                                <p className="text-[11px] text-slate-400 mt-0.5">Staff can be assigned another shift in the same time slot in a different branch (e.g. Half Day)</p>
                                            </div>
                                        </label>

                                        {/* Global across branches toggle */}
                                        <label className="flex items-start gap-3 p-3 rounded-xl border border-white/10 hover:bg-white/5 cursor-pointer transition">
                                            <div className="pt-0.5">
                                                <div
                                                    onClick={() => updateField('globalAcrossBranches', !editing.globalAcrossBranches)}
                                                    className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${
                                                        editing.globalAcrossBranches ? 'bg-purple-500' : 'bg-slate-600'
                                                    }`}
                                                >
                                                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                                                        editing.globalAcrossBranches ? 'translate-x-5' : 'translate-x-0.5'
                                                    }`} />
                                                </div>
                                            </div>
                                            <div className="flex-1" onClick={() => updateField('globalAcrossBranches', !editing.globalAcrossBranches)}>
                                                <div className="flex items-center gap-1.5">
                                                    <Globe className="w-3.5 h-3.5 text-purple-400" />
                                                    <span className="text-sm font-medium text-white">Global Across Branches</span>
                                                </div>
                                                <p className="text-[11px] text-slate-400 mt-0.5">Automatically applies to ALL branches when assigned (e.g. Day Off, Sick Day)</p>
                                            </div>
                                        </label>
                                    </div>
                                </div>


                                {/* Color picker */}
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1.5">Color</label>
                                    <div className="flex flex-wrap gap-2">
                                        {PRESET_COLORS.map(c => (
                                            <button
                                                key={c}
                                                onClick={() => updateField('color', c)}
                                                className={`w-8 h-8 rounded-lg transition-transform ${editing.color === c ? 'ring-2 ring-white scale-110' : 'hover:scale-105'}`}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                        <input
                                            type="color"
                                            value={editing.color}
                                            onChange={e => updateField('color', e.target.value)}
                                            className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0"
                                        />
                                    </div>
                                </div>

                                {/* Preview */}
                                <div className="pt-2 border-t border-white/10">
                                    <label className="block text-xs text-slate-400 mb-2">Preview</label>
                                    <div
                                        className="inline-flex flex-col items-center rounded-lg px-4 py-2"
                                        style={{ backgroundColor: editing.color + '20', border: `1px solid ${editing.color}40` }}
                                    >
                                        <span className="text-sm font-bold" style={{ color: editing.color }}>
                                            {editing.code || '??'}
                                        </span>
                                        {editing.type === 'work' && editing.startTime && (
                                            <span className="text-[10px] text-slate-400 mt-0.5">{editing.startTime}–{editing.endTime}</span>
                                        )}
                                        {editing.type === 'leave' && (
                                            <span className="text-[10px] mt-0.5" style={{ color: editing.color + 'AA' }}>{editing.name || 'Leave'}</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/10">
                                <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:bg-white/5 transition">
                                    Cancel
                                </button>
                                <button onClick={save} className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition shadow">
                                    {isNew ? 'Create' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
