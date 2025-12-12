'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { Settings, Plus, Trash2, Save, Loader2 } from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'
import { getLoyaltyManagerDictionary } from '../_i18n'

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
    prepaid_bonus_percentage: number
    min_topup_amount: number
    voucher_terms: string
    voucher_header?: string
}

export default function LoyaltySettingsPage() {
    const { language } = useSettings()
    const t = getLoyaltyManagerDictionary(language)
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
                rewards,
                prepaid_bonus_percentage: data.prepaid_bonus_percentage || 0,
                min_topup_amount: data.min_topup_amount || 0,
                voucher_terms: data.voucher_terms || t.settings.voucher.terms_desc,
                voucher_header: data.voucher_header || ''
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
            alert(t.settings.error_saving + ': ' + error.message)
        } else {
            alert(t.settings.saved_success)
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
                    {t.settings.title}
                </h1>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {t.settings.save_changes}
                </button>
            </div>

            <div className="space-y-8">
                {/* Membership Tiers */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold text-slate-800">{t.settings.tiers.title}</h2>
                        <button
                            onClick={addClass}
                            className="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded-lg text-sm font-medium transition flex items-center gap-1"
                        >
                            <Plus className="w-4 h-4" /> {t.settings.tiers.add_class}
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="py-3 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-12">{t.settings.tiers.color}</th>
                                    <th className="py-3 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-1/5">{t.settings.tiers.class_name}</th>
                                    <th className="py-3 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-1/6">{t.settings.tiers.method}</th>
                                    <th className="py-3 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-1/6">{t.settings.tiers.threshold}</th>
                                    <th className="py-3 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-1/6">{t.settings.tiers.earning_ratio}<br /><span className="normal-case font-normal text-slate-400">{t.settings.tiers.earning_ratio_upload}</span></th>
                                    <th className="py-3 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-1/6">{t.settings.tiers.redemption_ratio}<br /><span className="normal-case font-normal text-slate-400">{t.settings.tiers.redemption_ratio_upload}</span></th>
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
                                                <option value="value">{t.cards.table.total_value}</option>
                                                <option value="points">{t.cards.table.points}</option>
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
                                            {t.settings.tiers.no_classes}
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
                        <h2 className="text-lg font-semibold text-slate-800">{t.settings.rewards.title}</h2>
                        <button
                            onClick={addReward}
                            className="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded-lg text-sm font-medium transition flex items-center gap-1"
                        >
                            <Plus className="w-4 h-4" /> {t.settings.rewards.add_reward}
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="py-3 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-2/3">{t.settings.rewards.reward_name}</th>
                                    <th className="py-3 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-1/4">{t.settings.rewards.cost_points}</th>
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
                                            {t.settings.rewards.no_rewards}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Wallet Configuration */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">{t.settings.wallet.title}</h2>
                    <div className="max-w-md space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                {t.settings.wallet.bonus_percentage}
                                <span className="font-normal text-slate-500 ml-2">
                                    {t.settings.wallet.bonus_percentage_desc}
                                </span>
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={settings.prepaid_bonus_percentage}
                                    onChange={e => setSettings({ ...settings, prepaid_bonus_percentage: parseInt(e.target.value) || 0 })}
                                    className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <span className="text-slate-600">%</span>
                            </div>
                            <p className="mt-2 text-xs text-slate-500">
                                {t.settings.wallet.bonus_percentage_example}
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                {t.settings.wallet.min_topup}
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={formatNumber(settings.min_topup_amount)}
                                    onChange={e => setSettings({ ...settings, min_topup_amount: parseNumber(e.target.value) || 0 })}
                                    className="w-full max-w-[200px] px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <span className="text-slate-600">VND</span>
                            </div>
                            <p className="mt-2 text-xs text-slate-500">
                                {t.settings.wallet.min_topup_desc}
                            </p>
                        </div>
                    </div>
                </section>

                {/* Voucher Configuration */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">{t.settings.voucher.title}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                {t.settings.voucher.header}
                            </label>
                            <input
                                type="text"
                                value={settings.voucher_header || ''}
                                onChange={e => setSettings({ ...settings, voucher_header: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
                                placeholder={t.settings.voucher.header_placeholder}
                            />
                            <p className="text-xs text-slate-500 mb-4">
                                {t.settings.voucher.header_desc}
                            </p>

                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                {t.settings.voucher.terms}
                            </label>
                            <textarea
                                value={settings.voucher_terms}
                                onChange={e => setSettings({ ...settings, voucher_terms: e.target.value })}
                                rows={4}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder={t.settings.voucher.terms_placeholder}
                            />
                            <p className="mt-2 text-xs text-slate-500">
                                {t.settings.voucher.terms_desc}
                            </p>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    )
}
