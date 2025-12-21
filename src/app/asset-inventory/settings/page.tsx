'use client'

import { useState, useEffect } from 'react'
import { ArrowLeftIcon, TrashIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'

export default function AssetSettingsPage() {
    const [duration, setDuration] = useState(6)
    const [saved, setSaved] = useState(false)

    // Category State
    const [fixedCategories, setFixedCategories] = useState<string[]>([
        'Kitchen Equipment', 'Furniture', 'Technology', 'Vehicles'
    ])
    const [smallwareCategories, setSmallwareCategories] = useState<string[]>([
        'Cutlery', 'Glassware', 'Plateware', 'Utensils'
    ])

    // Category Inputs
    const [newFixedCat, setNewFixedCat] = useState('')
    const [newSmallCat, setNewSmallCat] = useState('')

    useEffect(() => {
        // Load Settings
        const storedDuration = localStorage.getItem('asset_new_duration_months')
        if (storedDuration) setDuration(Number(storedDuration))

        // Load Categories
        const storedFixed = localStorage.getItem('asset_categories_fixed')
        if (storedFixed) setFixedCategories(JSON.parse(storedFixed))

        const storedSmall = localStorage.getItem('asset_categories_smallware')
        if (storedSmall) setSmallwareCategories(JSON.parse(storedSmall))
    }, [])

    const handleSave = () => {
        localStorage.setItem('asset_new_duration_months', String(duration))
        localStorage.setItem('asset_categories_fixed', JSON.stringify(fixedCategories))
        localStorage.setItem('asset_categories_smallware', JSON.stringify(smallwareCategories))

        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }

    const addCategory = (type: 'fixed' | 'smallware') => {
        if (type === 'fixed') {
            if (!newFixedCat.trim()) return
            setFixedCategories([...fixedCategories, newFixedCat.trim()])
            setNewFixedCat('')
        } else {
            if (!newSmallCat.trim()) return
            setSmallwareCategories([...smallwareCategories, newSmallCat.trim()])
            setNewSmallCat('')
        }
    }

    const removeCategory = (type: 'fixed' | 'smallware', index: number) => {
        if (type === 'fixed') {
            setFixedCategories(fixedCategories.filter((_, i) => i !== index))
        } else {
            setSmallwareCategories(smallwareCategories.filter((_, i) => i !== index))
        }
    }

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-6">
            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                    <Link href="/asset-inventory" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                        <ArrowLeftIcon className="w-5 h-5" />
                    </Link>
                    <h1 className="text-2xl font-bold text-white">Asset Inventory Settings</h1>
                </div>
                <button
                    onClick={handleSave}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition font-medium shadow-sm"
                >
                    {saved ? (
                        <>
                            <span className="w-4 h-4 text-white">✓</span>
                            Saved!
                        </>
                    ) : (
                        <>
                            <TrashIcon className="w-4 h-4 hidden" /> {/* Dummy icon to maintain spacing if needed, but not using it here */}
                            Save Changes
                        </>
                    )}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Condition Settings */}
                <div className="bg-white rounded-2xl shadow p-6 md:col-span-2">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">Condition Automation</h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                'New' to 'Good' Transition (Months)
                            </label>
                            <p className="text-sm text-slate-500 mb-3">
                                Assets marked as "New" will automatically display as "Good" after this many months from their purchase date.
                            </p>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    min="0"
                                    max="60"
                                    value={duration}
                                    onChange={(e) => setDuration(Number(e.target.value))}
                                    className="w-24 border rounded-lg px-3 h-10 text-slate-900"
                                />
                                <span className="text-slate-600">months</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Fixed Asset Categories */}
                <div className="bg-white rounded-2xl shadow p-6">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">Fixed Asset Categories</h2>
                    <div className="flex gap-2 mb-4">
                        <input
                            className="flex-1 border rounded-lg px-3 h-10 text-slate-900"
                            placeholder="Add category..."
                            value={newFixedCat}
                            onChange={(e) => setNewFixedCat(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addCategory('fixed')}
                        />
                        <button
                            onClick={() => addCategory('fixed')}
                            className="bg-blue-600 text-white px-4 rounded-lg hover:bg-blue-700 font-medium"
                        >
                            Add
                        </button>
                    </div>

                    <div className="max-h-60 overflow-y-auto border rounded-xl divide-y divide-slate-100">
                        {fixedCategories.map((cat, i) => (
                            <div key={i} className="flex justify-between items-center p-3 hover:bg-slate-50 transition-colors">
                                <span className="text-slate-700 font-medium">{cat}</span>
                                <button
                                    onClick={() => removeCategory('fixed', i)}
                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                    title="Delete"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        {fixedCategories.length === 0 && (
                            <div className="p-4 text-center text-slate-400 text-sm italic">
                                No categories added
                            </div>
                        )}
                    </div>
                </div>

                {/* Smallware Categories */}
                <div className="bg-white rounded-2xl shadow p-6">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">Smallware Categories</h2>
                    <div className="flex gap-2 mb-4">
                        <input
                            className="flex-1 border rounded-lg px-3 h-10 text-slate-900"
                            placeholder="Add category..."
                            value={newSmallCat}
                            onChange={(e) => setNewSmallCat(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addCategory('smallware')}
                        />
                        <button
                            onClick={() => addCategory('smallware')}
                            className="bg-blue-600 text-white px-4 rounded-lg hover:bg-blue-700 font-medium"
                        >
                            Add
                        </button>
                    </div>

                    <div className="max-h-60 overflow-y-auto border rounded-xl divide-y divide-slate-100">
                        {smallwareCategories.map((cat, i) => (
                            <div key={i} className="flex justify-between items-center p-3 hover:bg-slate-50 transition-colors">
                                <span className="text-slate-700 font-medium">{cat}</span>
                                <button
                                    onClick={() => removeCategory('smallware', i)}
                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                    title="Delete"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        {smallwareCategories.length === 0 && (
                            <div className="p-4 text-center text-slate-400 text-sm italic">
                                No categories added
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
