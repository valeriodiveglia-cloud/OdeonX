'use client'

import { useState, useEffect } from 'react'
import { XMarkIcon, PlusIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase_shim'
import { Asset, AssetType, AssetStatus, AssetCondition } from '../types'
import { uploadAssetImage } from '@/lib/storage'
import { PhotoIcon } from '@heroicons/react/24/solid'

type Props = {
    open: boolean
    onClose: () => void
    onSave: (asset: Omit<Asset, 'id'>) => void
    initialData?: Asset | null
    defaultBranch?: string
}

type BranchOption = {
    id: string
    name: string
}

export default function NewAssetModal({ open, onClose, onSave, initialData, defaultBranch }: Props) {
    const [type, setType] = useState<AssetType>('fixed')
    const [name, setName] = useState('')
    const [sku, setSku] = useState('')
    const [category, setCategory] = useState('')
    const [branches, setBranches] = useState<BranchOption[]>([])
    const [branch, setBranch] = useState('') // Default empty, load from fetch
    const [location, setLocation] = useState('Kitchen')
    const [status, setStatus] = useState<AssetStatus>('active')
    const [condition, setCondition] = useState<AssetCondition>('new')

    const [availableCategories, setAvailableCategories] = useState<string[]>([])

    const generateSKU = (assetType: AssetType) => {
        const prefix = assetType === 'fixed' ? 'FIX' : 'SML'
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const random = Math.floor(1000 + Math.random() * 9000) // 4 digits
        return `${prefix}-${date}-${random}`
    }

    // Fixed only
    const [serialNumber, setSerialNumber] = useState('')

    // Smallware only
    const [quantity, setQuantity] = useState(1)
    const [parLevel, setParLevel] = useState(10)

    // Financials
    // Storing as string to handle "1,000,000" formatting
    const [purchasePrice, setPurchasePrice] = useState('')
    const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0])
    const [usefulLifeYears, setUsefulLifeYears] = useState(5)
    // New Warranty Field
    const [warrantyYears, setWarrantyYears] = useState(0)

    // Image Upload
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)

    useEffect(() => {
        if (!open) return

        // Load Branches
        const fetchBranches = async () => {
            const { data } = await supabase
                .from('provider_branches')
                .select('id, name')
                .order('sort_order', { ascending: true })
                .order('name', { ascending: true })

            if (data && data.length > 0) {
                const mapped = data.map((b: any) => ({ id: String(b.id), name: b.name }))
                setBranches(mapped)
                // Default to first branch if not set and no initialData
                if (!initialData) {
                    if (defaultBranch) {
                        setBranch(defaultBranch)
                    } else {
                        setBranch(prev => prev || mapped[0].name)
                    }
                }
            }
        }
        fetchBranches()

        if (initialData) {
            // Populate form
            setType(initialData.type)
            setName(initialData.name)
            setSku(initialData.sku)
            setCategory(initialData.category)
            setBranch(initialData.branch)
            setLocation(initialData.location)
            setStatus(initialData.status)
            setCondition(initialData.condition)
            setQuantity(initialData.quantity)
            setParLevel(initialData.parLevel || 10)
            setSerialNumber(initialData.serialNumber || '')

            // Financials
            setPurchasePrice(initialData.financials.purchasePrice.toString())
            setPurchaseDate(initialData.financials.purchaseDate)
            setUsefulLifeYears(initialData.financials.usefulLifeYears)
            setWarrantyYears(initialData.financials.warrantyYears || 0)


            // Image
            if (initialData.images && initialData.images.length > 0) {
                // We don't have the signed URL here easily without async fetch, 
                // but we can assume we might want to just show "Product has image" or fetch it.
                // For now, let's just clear preview if we can't easily get it, or simpler:
                // We won't show the OLD image in preview unless we fetch it. 
                // Let's rely on the user uploading a NEW one if they want to change it.
                setPreviewUrl(null)
            }
        } else {
            // Reset / Default
            resetForm()
            // Generate initial SKU if empty (handled below)
            // But we need to be careful not to overwrite if we just reset
        }
    }, [open, initialData])

    // Effect to reload categories and regen SKU when Type changes
    useEffect(() => {
        const key = type === 'fixed' ? 'asset_categories_fixed' : 'asset_categories_smallware'
        const stored = localStorage.getItem(key)

        let cats: string[] = []
        if (stored) {
            cats = JSON.parse(stored)
        } else {
            // Defaults if nothing stored
            cats = type === 'fixed'
                ? ['Kitchen Equipment', 'Furniture', 'Technology', 'Vehicles']
                : ['Cutlery', 'Glassware', 'Plateware', 'Utensils']
        }
        setAvailableCategories(cats)

        // Only auto-select category if we are NOT editing (or if the current category is invalid/empty)
        // If initialData is present, we trust the useEffect above to set category.
        // However, this effect runs when `type` changes. 
        // If we switch type during edit, we might want to reset category.
        // If we open modal in edit mode, `type` is set, this runs.

        if (!initialData) {
            if (cats.length > 0 && !cats.includes(category)) {
                setCategory(cats[0])
            }
        } else {
            // Ensure category from initialData is kept, unless type was manually changed by user?
            // Simplification: logic mostly holds. 
        }

        // Auto-update SKU prefix when type changes
        // Only if it looks like an auto-generated SKU (contains old prefix) or is empty
        // AND if we are not editing an existing SKU (unless user cleared it)
        if (!initialData) {
            const oldPrefix = type === 'fixed' ? 'SML' : 'FIX'
            if (!sku || sku.startsWith(oldPrefix)) {
                setSku(generateSKU(type))
            }
        }
    }, [type, open, initialData])

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0]
            setImageFile(file)
            setPreviewUrl(URL.createObjectURL(file))
        }
    }

    const handleSave = async () => {
        if (!name || !sku) return

        try {
            setUploading(true)
            let imagePath = initialData?.images?.[0] // Keep existing image by default

            if (imageFile) {
                imagePath = await uploadAssetImage(imageFile)
            }

            const priceValue = parseFloat(purchasePrice.replace(/,/g, '')) || 0

            const newAsset: Omit<Asset, 'id'> = {
                name,
                sku,
                category,
                branch,
                location,
                type,
                status,
                condition,
                quantity: type === 'fixed' ? 1 : quantity,
                parLevel: type === 'smallware' ? parLevel : undefined,
                serialNumber: type === 'fixed' ? serialNumber : undefined,
                images: imagePath ? [imagePath] : undefined,
                financials: {
                    purchasePrice: priceValue,
                    purchaseDate,
                    usefulLifeYears,
                    warrantyYears
                }
            }

            onSave(newAsset)
            onClose()
            resetForm()
        } catch (error) {
            console.error('Error saving asset:', error)
            alert(`Failed to save asset: ${error instanceof Error ? error.message : 'Unknown error'}`)
        } finally {
            setUploading(false)
        }
    }

    const resetForm = () => {
        setType('fixed')
        setName('')
        setSku('')
        setCategory('')
        setBranch('')
        setLocation('Kitchen')
        setStatus('active')
        setCondition('new')
        setSerialNumber('')
        setQuantity(1)
        setParLevel(10)
        setPurchasePrice('')
        setPurchaseDate(new Date().toISOString().split('T')[0])
        setUsefulLifeYears(5)
        setWarrantyYears(0)
        setImageFile(null)
        setPreviewUrl(null)
        setUploading(false)
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative w-full max-w-2xl bg-white text-slate-900 rounded-2xl shadow-2xl border border-black/10 overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="text-lg font-semibold text-slate-900">{initialData ? 'Edit Asset' : 'Add New Asset'}</h2>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-200 text-slate-500">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* Body - Scrollable */}
                <div className="p-6 overflow-y-auto">

                    {/* Type Selection */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Asset Type</label>
                        <div className="flex bg-slate-100 p-1 rounded-lg w-fit">
                            <button
                                onClick={() => setType('fixed')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${type === 'fixed' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Fixed Asset
                            </button>
                            <button
                                onClick={() => setType('smallware')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${type === 'smallware' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Smallware
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                            {type === 'fixed'
                                ? 'Tracked individually by Serial Number. E.g., Ovens, Mixers.'
                                : 'Tracked by Quantity and Par Levels. E.g., Plates, Glassware.'}
                        </p>
                    </div>

                    {/* Image Upload */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Asset Photo</label>
                        <div className="flex items-center gap-4">
                            <div className="relative w-24 h-24 bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden">
                                {previewUrl ? (
                                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <PhotoIcon className="w-8 h-8 text-slate-400" />
                                )}
                            </div>
                            <div>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="block w-full text-sm text-slate-500
                                    file:mr-4 file:py-2 file:px-4
                                    file:rounded-full file:border-0
                                    file:text-sm file:font-semibold
                                    file:bg-blue-50 file:text-blue-700
                                    hover:file:bg-blue-100
                                  "
                                />
                                <p className="mt-1 text-xs text-slate-500">JPG, PNG, WebP up to 5MB</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Basic Info */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-slate-900 border-b pb-2">Basic Info</h3>

                            <div>
                                <label className="block text-sm font-medium text-slate-700">Name</label>
                                <input className="w-full mt-1 border rounded-lg px-3 h-10" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rational Combi Oven" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700">SKU / Code</label>
                                <div className="flex gap-2">
                                    <input
                                        className={`w-full mt-1 border rounded-lg px-3 h-10 ${initialData ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                                        value={sku}
                                        onChange={e => setSku(e.target.value)}
                                        placeholder="e.g. EQ-2024-001"
                                        disabled={!!initialData}
                                    />
                                    <button
                                        onClick={() => setSku(generateSKU(type))}
                                        className={`mt-1 px-3 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500 ${initialData ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        title="Regenerate SKU"
                                        disabled={!!initialData}
                                    >
                                        <ArrowPathIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700">Category</label>
                                <select
                                    className="w-full mt-1 border rounded-lg px-3 h-10 bg-white"
                                    value={category}
                                    onChange={e => setCategory(e.target.value)}
                                >
                                    {availableCategories.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Location & Status */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-slate-900 border-b pb-2">Location & Status</h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">Branch</label>
                                    <select className="w-full mt-1 border rounded-lg px-3 h-10" value={branch} onChange={e => setBranch(e.target.value)}>
                                        {branches.map(b => (
                                            <option key={b.id} value={b.name}>{b.name}</option>
                                        ))}
                                        {branches.length === 0 && <option>Main Branch</option>}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">Location</label>
                                    <input className="w-full mt-1 border rounded-lg px-3 h-10 placeholder:text-slate-400 text-slate-900" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Prep Area" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">Status</label>
                                    <select className="w-full mt-1 border rounded-lg px-3 h-10" value={status} onChange={e => setStatus(e.target.value as any)}>
                                        <option value="active">Active</option>
                                        <option value="maintenance">Maintenance</option>
                                        <option value="in_transit">In Transit</option>
                                        <option value="broken">Broken</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">Condition</label>
                                    <select className="w-full mt-1 border rounded-lg px-3 h-10" value={condition} onChange={e => setCondition(e.target.value as any)}>
                                        <option value="new">New</option>
                                        <option value="good">Good</option>
                                        <option value="fair">Fair</option>
                                        <option value="poor">Poor</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Specific Fields */}
                    <div className="mt-6 pt-6 border-t border-slate-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* Logic Specifics */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-slate-900 border-b pb-2">
                                    {type === 'fixed' ? 'Identification' : 'Inventory Levels'}
                                </h3>

                                {type === 'fixed' ? (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Serial Number <span className="text-red-500">*</span></label>
                                        <input
                                            className={`w-full mt-1 border rounded-lg px-3 h-10 ${initialData ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                                            value={serialNumber}
                                            onChange={e => setSerialNumber(e.target.value)}
                                            placeholder="e.g. SN-998877"
                                            disabled={!!initialData}
                                        />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700">Quantity</label>
                                            <input type="number" className="w-full mt-1 border rounded-lg px-3 h-10" value={quantity} onChange={e => setQuantity(Number(e.target.value))} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700">Par Level</label>
                                            <input type="number" className="w-full mt-1 border rounded-lg px-3 h-10" value={parLevel} onChange={e => setParLevel(Number(e.target.value))} />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Financials */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-slate-900 border-b pb-2">Financials</h3>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Purchase Cost</label>
                                        <div className="relative mt-1">
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                className="w-full border rounded-lg px-3 h-10 placeholder:text-slate-400 text-slate-900"
                                                value={purchasePrice}
                                                onChange={e => {
                                                    const raw = e.target.value.replace(/,/g, '')
                                                    if (!/^\d*\.?\d*$/.test(raw)) return

                                                    if (raw === '') {
                                                        setPurchasePrice('')
                                                        return
                                                    }

                                                    const parts = raw.split('.')
                                                    const lhs = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                                                    const newVal = parts.length > 1 ? `${lhs}.${parts[1]}` : lhs
                                                    setPurchasePrice(newVal)
                                                }}
                                                placeholder="e.g. 1,000,000"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Purchase Date</label>
                                        <input type="date" className="w-full mt-1 border rounded-lg px-3 h-10" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Useful Life (Years)</label>
                                        <input type="number" className="w-full mt-1 border rounded-lg px-3 h-10 placeholder:text-slate-400 text-slate-900" value={usefulLifeYears} onChange={e => setUsefulLifeYears(Number(e.target.value))} />
                                        <p className="text-xs text-slate-500 mt-1">Used for straight-line depreciation</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Warranty (Years)</label>
                                        <input type="number" className="w-full mt-1 border rounded-lg px-3 h-10 placeholder:text-slate-400 text-slate-900" value={warrantyYears} onChange={e => setWarrantyYears(Number(e.target.value))} />
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-100 transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleSave} disabled={uploading} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors shadow-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        <PlusIcon className="w-4 h-4" />
                        {uploading ? 'Saving...' : (initialData ? 'Update Asset' : 'Create Asset')}
                    </button>
                </div>

            </div>
        </div >
    )
}
