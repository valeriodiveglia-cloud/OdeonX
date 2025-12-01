'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { Settings, Plus, Trash2, Save, Loader2 } from 'lucide-react'

type LoyaltyClass = {
    name: string
    method: 'value' | 'points'
    threshold: number
}

type LoyaltySettings = {
    classes: LoyaltyClass[]
    points_ratio: number
}

export default function LoyaltySettingsPage() {
    const [settings, setSettings] = useState<LoyaltySettings | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetchSettings()
    }, [])

    const fetchSettings = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('loyalty_settings')
            .select('*')
            .single()

        if (data) {
            setSettings(data)
        } else if (error) {
            console.error('Error fetching settings:', error)
        }
        setLoading(false)
    }

    const handleSave = async () => {
        if (!settings) return
        setSaving(true)
        const { error } = await supabase
            .from('loyalty_settings')
            .upsert({ id: true, ...settings })

        if (error) {
            alert('Error saving settings: ' + error.message)
        } else {
            alert('Settings saved successfully!')
        }
        setSaving(false)
    }

    const addClass = () => {
        if (!settings) return
        setSettings({
            ...settings,
            classes: [...settings.classes, { name: 'New Class', method: 'value', threshold: 0 }]
        })
    }

    const removeClass = (index: number) => {
        if (!settings) return
        const newClasses = [...settings.classes]
        newClasses.splice(index, 1)
        setSettings({ ...settings, classes: newClasses })
    }

    const updateClass = (index: number, field: keyof LoyaltyClass, value: any) => {
        if (!settings) return
        const newClasses = [...settings.classes]
        newClasses[index] = { ...newClasses[index], [field]: value }
        setSettings({ ...settings, classes: newClasses })
    }

    if (loading) {
        return (
            <div className="p-8 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        )
    }

    if (!settings) return <div className="p-8">Error loading settings.</div>

    return (
        <div className="p-8 max-w-4xl">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-bold text-white">
                    Loyalty Settings
                </h1>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Changes
                </button>
            </div>

            <div className="space-y-8">
                {/* General Settings */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">General Configuration</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Points Ratio (VND per 1 Point)</label>
                            <input
                                type="number"
                                value={settings.points_ratio}
                                onChange={e => setSettings({ ...settings, points_ratio: Number(e.target.value) })}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <p className="text-xs text-slate-500 mt-1">How much a customer needs to spend to earn 1 point.</p>
                        </div>
                    </div>
                </section>

                {/* Loyalty Classes */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold text-slate-800">Loyalty Classes</h2>
                        <button
                            onClick={addClass}
                            className="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded-lg text-sm font-medium transition flex items-center gap-1"
                        >
                            <Plus className="w-4 h-4" /> Add Class
                        </button>
                    </div>

                    <div className="space-y-4">
                        {settings.classes.map((cls, idx) => (
                            <div key={idx} className="flex flex-col md:flex-row gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100 items-start md:items-center">
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Class Name</label>
                                    <input
                                        type="text"
                                        value={cls.name}
                                        onChange={e => updateClass(idx, 'name', e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                    />
                                </div>
                                <div className="w-full md:w-40">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Method</label>
                                    <select
                                        value={cls.method}
                                        onChange={e => updateClass(idx, 'method', e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                    >
                                        <option value="value">Total Value</option>
                                        <option value="points">Points</option>
                                    </select>
                                </div>
                                <div className="w-full md:w-48">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Threshold</label>
                                    <input
                                        type="number"
                                        value={cls.threshold}
                                        onChange={e => updateClass(idx, 'threshold', Number(e.target.value))}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                    />
                                </div>
                                <div className="pt-5">
                                    <button
                                        onClick={() => removeClass(idx)}
                                        className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition"
                                        title="Remove Class"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {settings.classes.length === 0 && (
                            <p className="text-center text-slate-500 py-4">No classes defined.</p>
                        )}
                    </div>
                </section>
            </div>
        </div>
    )
}
