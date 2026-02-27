'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase_shim'
import { RecruitmentPlatform } from '@/types/human-resources'
import {
    ArrowLeftIcon,
    PlusIcon,
    TrashIcon,
    PencilSquareIcon,
    CheckIcon,
    XMarkIcon,
    ChevronUpIcon,
    ChevronDownIcon,
} from '@heroicons/react/24/outline'
import CircularLoader from '@/components/CircularLoader'

/* ─── Comprehensive icon library organized by category ─── */
const ICON_CATEGORIES: { name: string; icons: string[] }[] = [
    {
        name: 'Social & Communication',
        icons: ['📘', '💬', '💼', '📱', '📧', '📩', '📨', '✉️', '📞', '☎️', '🗣️', '💭', '📣', '📢', '🔔', '📲', '🌐', '🔗'],
    },
    {
        name: 'Business & Work',
        icons: ['🏢', '🏨', '🏬', '🏪', '🏗️', '🏛️', '🏠', '🏭', '🏦', '💳', '💰', '🤝', '👔', '📋', '📊', '📈', '📉', '📌'],
    },
    {
        name: 'People & Gestures',
        icons: ['👤', '👥', '🚶', '🧑‍💼', '👨‍💻', '👩‍💻', '🧑‍🍳', '👨‍🍳', '🙋', '🙋‍♂️', '🙋‍♀️', '🤵', '💁', '🙌', '👋', '✋', '🖐️', '✌️'],
    },
    {
        name: 'Tech & Tools',
        icons: ['🖥️', '💻', '⌨️', '🖱️', '📡', '🔍', '🔎', '⚙️', '🔧', '🛠️', '📐', '📏', '🗄️', '📂', '📁', '🗃️', '📎', '✏️'],
    },
    {
        name: 'Flags & Countries',
        icons: ['🇻🇳', '🇺🇸', '🇬🇧', '🇫🇷', '🇩🇪', '🇯🇵', '🇰🇷', '🇨🇳', '🇮🇹', '🇪🇸', '🇧🇷', '🇮🇳', '🇦🇺', '🇨🇦', '🇷🇺', '🇹🇭', '🇸🇬', '🇲🇾'],
    },
    {
        name: 'Symbols & Misc',
        icons: ['⭐', '🌟', '✨', '💡', '🎯', '🏷️', '🔖', '❤️', '💙', '💚', '💛', '🧡', '💜', '🖤', '🔴', '🟢', '🔵', '🟡'],
    },
]

/* ─── Color presets ─── */
const COLOR_PRESETS = [
    { bg: 'bg-blue-100', text: 'text-blue-800', preview: 'bg-blue-500' },
    { bg: 'bg-sky-100', text: 'text-sky-800', preview: 'bg-sky-500' },
    { bg: 'bg-indigo-100', text: 'text-indigo-800', preview: 'bg-indigo-500' },
    { bg: 'bg-purple-100', text: 'text-purple-800', preview: 'bg-purple-500' },
    { bg: 'bg-violet-100', text: 'text-violet-800', preview: 'bg-violet-500' },
    { bg: 'bg-pink-100', text: 'text-pink-800', preview: 'bg-pink-500' },
    { bg: 'bg-red-100', text: 'text-red-800', preview: 'bg-red-500' },
    { bg: 'bg-orange-100', text: 'text-orange-800', preview: 'bg-orange-500' },
    { bg: 'bg-amber-100', text: 'text-amber-800', preview: 'bg-amber-500' },
    { bg: 'bg-green-100', text: 'text-green-800', preview: 'bg-green-500' },
    { bg: 'bg-teal-100', text: 'text-teal-800', preview: 'bg-teal-500' },
    { bg: 'bg-cyan-100', text: 'text-cyan-800', preview: 'bg-cyan-500' },
    { bg: 'bg-gray-100', text: 'text-gray-800', preview: 'bg-gray-500' },
]

interface EditingPlatform {
    id: string | null
    label: string
    icon: string
    color_bg: string
    color_text: string
}

export default function PostingPlatformsPage() {
    const [platforms, setPlatforms] = useState<RecruitmentPlatform[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [editing, setEditing] = useState<EditingPlatform | null>(null)
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
    const [showIconPicker, setShowIconPicker] = useState(false)
    const [showColorPicker, setShowColorPicker] = useState(false)

    useEffect(() => { fetchPlatforms() }, [])

    const fetchPlatforms = async () => {
        try {
            const { data, error } = await supabase
                .from('recruitment_platforms')
                .select('*')
                .order('sort_order', { ascending: true })
            if (error) throw error
            setPlatforms(data as RecruitmentPlatform[])
        } catch (error) {
            console.error('Error fetching platforms:', error)
        } finally {
            setLoading(false)
        }
    }

    const startAdd = () => {
        setEditing({ id: null, label: '', icon: '📌', color_bg: 'bg-blue-100', color_text: 'text-blue-800' })
        setShowIconPicker(false)
        setShowColorPicker(false)
    }

    const startEdit = (p: RecruitmentPlatform) => {
        setEditing({ id: p.id, label: p.label, icon: p.icon, color_bg: p.color_bg, color_text: p.color_text })
        setShowIconPicker(false)
        setShowColorPicker(false)
    }

    const cancelEdit = () => {
        setEditing(null)
        setShowIconPicker(false)
        setShowColorPicker(false)
    }

    const saveEdit = async () => {
        if (!editing || !editing.label.trim()) return
        setSaving(true)
        // Auto-generate value from label
        const value = editing.label.trim().replace(/\s+/g, '-')

        try {
            if (editing.id) {
                const { error } = await supabase
                    .from('recruitment_platforms')
                    .update({ value, label: editing.label.trim(), icon: editing.icon, color_bg: editing.color_bg, color_text: editing.color_text })
                    .eq('id', editing.id)
                if (error) throw error
            } else {
                const maxSort = platforms.length > 0 ? Math.max(...platforms.map(p => p.sort_order)) : 0
                const { error } = await supabase
                    .from('recruitment_platforms')
                    .insert([{ value, label: editing.label.trim(), icon: editing.icon, color_bg: editing.color_bg, color_text: editing.color_text, sort_order: maxSort + 1 }])
                if (error) throw error
            }
            await fetchPlatforms()
            cancelEdit()
        } catch (error: any) {
            console.error('Error saving platform:', error)
            alert(error.message || 'Failed to save platform')
        } finally {
            setSaving(false)
        }
    }

    const deletePlatform = async (id: string) => {
        try {
            const { error } = await supabase.from('recruitment_platforms').delete().eq('id', id)
            if (error) throw error
            setPlatforms(prev => prev.filter(p => p.id !== id))
            setDeleteConfirm(null)
        } catch (error: any) {
            console.error('Error deleting:', error)
            alert(error.message || 'Failed to delete')
        }
    }

    const movePlatform = async (id: string, direction: 'up' | 'down') => {
        const idx = platforms.findIndex(p => p.id === id)
        if (idx < 0) return
        if (direction === 'up' && idx === 0) return
        if (direction === 'down' && idx === platforms.length - 1) return
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1
        const current = platforms[idx], swap = platforms[swapIdx]
        try {
            await Promise.all([
                supabase.from('recruitment_platforms').update({ sort_order: swap.sort_order }).eq('id', current.id),
                supabase.from('recruitment_platforms').update({ sort_order: current.sort_order }).eq('id', swap.id),
            ])
            await fetchPlatforms()
        } catch (error) { console.error('Error reordering:', error) }
    }

    /* ─── Edit / Add form ─── */
    const renderForm = () => {
        if (!editing) return null
        const isNew = editing.id === null
        return (
            <div className="bg-white shadow-lg rounded-2xl border border-gray-200 overflow-hidden">
                {/* Form header */}
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">
                        {isNew ? 'Add New Platform' : 'Edit Platform'}
                    </h3>
                    <button onClick={cancelEdit} className="p-1 rounded-full hover:bg-gray-200 transition">
                        <XMarkIcon className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Platform name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Platform Name</label>
                        <input
                            type="text"
                            value={editing.label}
                            onChange={e => setEditing({ ...editing, label: e.target.value })}
                            placeholder="e.g. LinkedIn, Facebook, Indeed..."
                            autoFocus
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                        />
                    </div>

                    {/* Icon picker */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Icon</label>
                        <button
                            type="button"
                            onClick={() => { setShowIconPicker(!showIconPicker); setShowColorPicker(false) }}
                            className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl border border-gray-300 hover:border-gray-400 transition bg-white"
                        >
                            <span className="text-2xl leading-none">{editing.icon}</span>
                            <span className="text-sm text-gray-500">Click to choose an icon</span>
                        </button>

                        {showIconPicker && (
                            <div className="mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl p-4 max-h-80 overflow-y-auto">
                                {ICON_CATEGORIES.map(cat => (
                                    <div key={cat.name} className="mb-4 last:mb-0">
                                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                                            {cat.name}
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {cat.icons.map(emoji => (
                                                <button
                                                    key={emoji}
                                                    type="button"
                                                    onClick={() => { setEditing({ ...editing, icon: emoji }); setShowIconPicker(false) }}
                                                    className={`w-10 h-10 flex items-center justify-center rounded-lg text-xl hover:bg-blue-50 transition
                                                        ${editing.icon === emoji ? 'bg-blue-100 ring-2 ring-blue-500' : 'hover:bg-gray-100'}`}
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Color picker */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Badge Color</label>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => { setShowColorPicker(!showColorPicker); setShowIconPicker(false) }}
                                className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl border border-gray-300 hover:border-gray-400 transition bg-white"
                            >
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${editing.color_bg} ${editing.color_text}`}>
                                    <span>{editing.icon}</span>
                                    <span>{editing.label || 'Platform'}</span>
                                </span>
                                <span className="text-sm text-gray-500">Click to change</span>
                            </button>
                        </div>

                        {showColorPicker && (
                            <div className="mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl p-4">
                                <div className="flex flex-wrap gap-2">
                                    {COLOR_PRESETS.map(c => (
                                        <button
                                            key={c.preview}
                                            type="button"
                                            onClick={() => { setEditing({ ...editing, color_bg: c.bg, color_text: c.text }); setShowColorPicker(false) }}
                                            className={`w-8 h-8 rounded-full ${c.preview} hover:scale-110 transition-transform
                                                ${editing.color_bg === c.bg ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
                                            title={c.bg.replace('bg-', '').replace('-100', '')}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Form footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                    <button onClick={cancelEdit} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-200 transition">
                        Cancel
                    </button>
                    <button
                        onClick={saveEdit}
                        disabled={saving || !editing.label.trim()}
                        className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition shadow-sm disabled:opacity-40"
                    >
                        {saving ? 'Saving...' : isNew ? 'Add Platform' : 'Save Changes'}
                    </button>
                </div>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <CircularLoader />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-900">
            {/* Header */}
            <header className="border-b border-white/10">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex items-center gap-4">
                        <Link href="/human-resources/settings" className="p-2 rounded-full hover:bg-white/10 transition">
                            <ArrowLeftIcon className="h-5 w-5 text-gray-300" />
                        </Link>
                        <div className="flex-1">
                            <h1 className="text-2xl font-bold text-white sm:text-3xl sm:tracking-tight">
                                Posting Platforms
                            </h1>
                            <p className="mt-1 text-sm text-gray-400">
                                Manage the platforms available when logging job postings.
                            </p>
                        </div>
                        <button
                            onClick={startAdd}
                            disabled={!!editing}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <PlusIcon className="h-4 w-4" />
                            Add Platform
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-3">
                {/* Add form */}
                {editing && editing.id === null && renderForm()}

                {/* Empty state */}
                {platforms.length === 0 && !editing && (
                    <div className="bg-white shadow rounded-2xl border border-gray-200 p-16 text-center">
                        <div className="text-4xl mb-3">🌐</div>
                        <p className="text-gray-500 font-medium">No platforms configured</p>
                        <p className="text-sm text-gray-400 mt-1">Click "Add Platform" to get started.</p>
                    </div>
                )}

                {/* Platform rows */}
                {platforms.map((platform, idx) => (
                    <div key={platform.id}>
                        {editing && editing.id === platform.id ? (
                            renderForm()
                        ) : (
                            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 px-5 py-4 flex items-center gap-4 group hover:shadow-md transition">
                                {/* Icon */}
                                <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-gray-50 border border-gray-100 text-2xl flex-shrink-0">
                                    {platform.icon}
                                </div>

                                {/* Name + badge */}
                                <div className="flex-1 min-w-0 flex items-center gap-3">
                                    <span className="font-semibold text-gray-900 text-[15px]">{platform.label}</span>
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${platform.color_bg} ${platform.color_text}`}>
                                        {platform.label}
                                    </span>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                    <button onClick={() => movePlatform(platform.id, 'up')} disabled={idx === 0}
                                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition disabled:opacity-20" title="Move up">
                                        <ChevronUpIcon className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => movePlatform(platform.id, 'down')} disabled={idx === platforms.length - 1}
                                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition disabled:opacity-20" title="Move down">
                                        <ChevronDownIcon className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => startEdit(platform)} disabled={!!editing}
                                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition disabled:opacity-20" title="Edit">
                                        <PencilSquareIcon className="h-4 w-4" />
                                    </button>

                                    {deleteConfirm === platform.id ? (
                                        <div className="flex items-center gap-1 ml-1 bg-red-50 rounded-lg px-2 py-1 border border-red-200">
                                            <span className="text-xs text-red-600 font-medium mr-1">Delete?</span>
                                            <button onClick={() => deletePlatform(platform.id)}
                                                className="p-1 rounded bg-red-600 text-white hover:bg-red-700 transition" title="Confirm">
                                                <CheckIcon className="h-3.5 w-3.5" />
                                            </button>
                                            <button onClick={() => setDeleteConfirm(null)}
                                                className="p-1 rounded bg-gray-200 text-gray-600 hover:bg-gray-300 transition" title="Cancel">
                                                <XMarkIcon className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button onClick={() => setDeleteConfirm(platform.id)} disabled={!!editing}
                                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition disabled:opacity-20" title="Delete">
                                            <TrashIcon className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </main>
        </div>
    )
}
