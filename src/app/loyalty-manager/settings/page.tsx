'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { Settings, Plus, Trash2, Save, Loader2 } from 'lucide-react'

type LoyaltyClass = {
    name: string
    method: 'value' | 'points'
    threshold: number
    points_ratio: number // VND per 1 point (Earning)
    redemption_ratio: number // VND per 1 point (Redeeming)
    color?: string
}

type Reward = {
    name: string
    cost: number
}

type LoyaltySettings = {
    classes: LoyaltyClass[]
    rewards: Reward[]
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
            // Migrate old data if needed or set defaults
            const rawClasses = Array.isArray(data.classes) ? data.classes : []
            const classes = rawClasses.map((c: any) => ({
                ...c,
                points_ratio: c.points_ratio || data.points_ratio || 1000,
                redemption_ratio: c.redemption_ratio || data.redemption_ratio || 100,
                color: c.color || '#3b82f6' // Default blue
            }))

            const rawRewards = Array.isArray(data.rewards) ? data.rewards : []
            const rewards = rawRewards.map((r: any) => ({
                name: r.name,
                cost: r.cost
            }))

            setSettings({
                classes,
                rewards
            })
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
            classes: [...settings.classes, {
                name: 'New Class',
                method: 'value',
                threshold: 0,
                points_ratio: 1000,
                redemption_ratio: 100,
                color: '#3b82f6'
            }]
        })
    }

    const removeClass = (index: number) => {
        if (!settings) return
        const newClasses = [...settings.classes]
        newClasses.splice(index, 1)
        setSettings({ ...settings, classes: newClasses })
    }

    const formatNumber = (num: number) => {
        return new Intl.NumberFormat('en-US').format(num)
    }

    const parseNumber = (str: string) => {
        return Number(str.replace(/,/g, ''))
    }

    const updateClass = (index: number, field: keyof LoyaltyClass, value: any) => {
        if (!settings) return
        const newClasses = [...settings.classes]
        newClasses[index] = { ...newClasses[index], [field]: value }
        setSettings({ ...settings, classes: newClasses })
    }

    const addReward = () => {
        if (!settings) return
        setSettings({
            ...settings,
            rewards: [...settings.rewards, { name: 'New Reward', cost: 100 }]
        })
    }

    const removeReward = (index: number) => {
        if (!settings) return
        const newRewards = [...settings.rewards]
        newRewards.splice(index, 1)
        setSettings({ ...settings, rewards: newRewards })
    }

    const updateReward = (index: number, field: keyof Reward, value: any) => {
        if (!settings) return
        const newRewards = [...settings.rewards]
        newRewards[index] = { ...newRewards[index], [field]: value }
        setSettings({ ...settings, rewards: newRewards })
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
        <div className="p-8 w-full">
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

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="py-3 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-12">Color</th>
                                    <th className="py-3 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-1/5">Class Name</th>
                                    <th className="py-3 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-1/6">Method</th>
                                    <th className="py-3 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-1/6">Threshold</th>
                                    <th className="py-3 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-1/6">Earning Ratio<br /><span className="normal-case font-normal text-slate-400">(VND/1pt)</span></th>
                                    <th className="py-3 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-1/6">Redemption Ratio<br /><span className="normal-case font-normal text-slate-400">(VND/1pt)</span></th>
                                    <th className="py-3 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-12"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {settings.classes.map((cls, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="p-2">
                                            <input
                                                type="color"
                                                value={cls.color || '#3b82f6'}
                                                onChange={e => updateClass(idx, 'color', e.target.value)}
                                                className="w-8 h-8 p-0 border-0 rounded cursor-pointer"
                                            />
                                        </td>
                                        <td className="p-2">
                                            <input
                                                type="text"
                                                value={cls.name}
                                                onChange={e => updateClass(idx, 'name', e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </td>
                                        <td className="p-2">
                                            <select
                                                value={cls.method}
                                                onChange={e => updateClass(idx, 'method', e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                <option value="value">Total Value</option>
                                                <option value="points">Points</option>
                                            </select>
                                        </td>
                                        <td className="p-2">
                                            <input
                                                type="text"
                                                value={formatNumber(cls.threshold)}
                                                onChange={e => updateClass(idx, 'threshold', parseNumber(e.target.value))}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </td>
                                        <td className="p-2">
                                            <input
                                                type="text"
                                                value={formatNumber(cls.points_ratio)}
                                                onChange={e => updateClass(idx, 'points_ratio', parseNumber(e.target.value))}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </td>
                                        <td className="p-2">
                                            <input
                                                type="text"
                                                value={formatNumber(cls.redemption_ratio)}
                                                onChange={e => updateClass(idx, 'redemption_ratio', parseNumber(e.target.value))}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </td>
                                        <td className="p-2 text-right">
                                            <button
                                                onClick={() => removeClass(idx)}
                                                className="text-red-400 hover:text-red-600 p-2 rounded-lg transition"
                                                title="Remove Class"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {settings.classes.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="text-center text-slate-500 py-8">
                                            No classes defined. Click "Add Class" to start.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Rewards Configuration */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold text-slate-800">Rewards</h2>
                        <button
                            onClick={addReward}
                            className="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded-lg text-sm font-medium transition flex items-center gap-1"
                        >
                            <Plus className="w-4 h-4" /> Add Reward
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="py-3 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-2/3">Reward Name</th>
                                    <th className="py-3 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-1/4">Cost (Points)</th>
                                    <th className="py-3 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-12"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {settings.rewards.map((reward, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="p-2">
                                            <input
                                                type="text"
                                                value={reward.name}
                                                onChange={e => updateReward(idx, 'name', e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="e.g. Free Coffee"
                                            />
                                        </td>
                                        <td className="p-2">
                                            <input
                                                type="text"
                                                value={formatNumber(reward.cost)}
                                                onChange={e => updateReward(idx, 'cost', parseNumber(e.target.value))}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </td>
                                        <td className="p-2 text-right">
                                            <button
                                                onClick={() => removeReward(idx)}
                                                className="text-red-400 hover:text-red-600 p-2 rounded-lg transition"
                                                title="Remove Reward"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {settings.rewards.length === 0 && (
                                    <tr>
                                        <td colSpan={3} className="text-center text-slate-500 py-8">
                                            No rewards defined. Click "Add Reward" to start.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    )
}
