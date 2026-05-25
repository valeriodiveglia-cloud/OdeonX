'use client'

import { useState, useEffect } from 'react'
import { ArrowLeftIcon, TrashIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function AssetSettingsPage() {
    const router = useRouter()
    const [duration, setDuration] = useState(6)
    const [saved, setSaved] = useState(false)
    const [role, setRole] = useState<string | null>(null)

    useEffect(() => {
        if (role === 'accountant') {
            router.push('/asset-inventory')
        }
    }, [role, router])

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

        // Load Role
        const fetchRole = async () => {
            const { data: user } = await import('@/lib/supabase_shim').then(m => m.supabase.auth.getUser())
            if (user?.user) {
                const { data } = await import('@/lib/supabase_shim').then(m => m.supabase.from('app_accounts').select('role').eq('user_id', user.user.id).single())
                setRole(data?.role || 'staff')
            }
        }
        fetchRole()
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

    if (role === null || role === 'accountant') {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
        )
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
                {role !== 'accountant' && (
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
                )}
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
                                    disabled={role === 'accountant'}
                                    className="w-24 border rounded-lg px-3 h-10 text-slate-900 bg-white disabled:bg-slate-100"
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
                            className="flex-1 border rounded-lg px-3 h-10 text-slate-900 bg-white disabled:bg-slate-100"
                            placeholder="Add category..."
                            value={newFixedCat}
                            onChange={(e) => setNewFixedCat(e.target.value)}
                            disabled={role === 'accountant'}
                            onKeyDown={(e) => e.key === 'Enter' && role !== 'accountant' && addCategory('fixed')}
                        />
                        <button
                            onClick={() => addCategory('fixed')}
                            disabled={role === 'accountant'}
                            className="bg-blue-600 text-white px-4 rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                        >
                            Add
                        </button>
                    </div>

                    <div className="max-h-60 overflow-y-auto border rounded-xl divide-y divide-slate-100">
                        {fixedCategories.map((cat, i) => (
                            <div key={i} className="flex justify-between items-center p-3 hover:bg-slate-50 transition-colors">
                                <span className="text-slate-700 font-medium">{cat}</span>
                                {role !== 'accountant' && (
                                    <button
                                        onClick={() => removeCategory('fixed', i)}
                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                        title="Delete"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                )}
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
                            className="flex-1 border rounded-lg px-3 h-10 text-slate-900 bg-white disabled:bg-slate-100"
                            placeholder="Add category..."
                            value={newSmallCat}
                            onChange={(e) => setNewSmallCat(e.target.value)}
                            disabled={role === 'accountant'}
                            onKeyDown={(e) => e.key === 'Enter' && role !== 'accountant' && addCategory('smallware')}
                        />
                        <button
                            onClick={() => addCategory('smallware')}
                            disabled={role === 'accountant'}
                            className="bg-blue-600 text-white px-4 rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                        >
                            Add
                        </button>
                    </div>

                    <div className="max-h-60 overflow-y-auto border rounded-xl divide-y divide-slate-100">
                        {smallwareCategories.map((cat, i) => (
                            <div key={i} className="flex justify-between items-center p-3 hover:bg-slate-50 transition-colors">
                                <span className="text-slate-700 font-medium">{cat}</span>
                                {role !== 'accountant' && (
                                    <button
                                        onClick={() => removeCategory('smallware', i)}
                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                        title="Delete"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                )}
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
