'use client'

import { useState, useEffect, useMemo } from 'react'
import { XMarkIcon, ChevronDownIcon, ChevronRightIcon, ListBulletIcon } from '@heroicons/react/24/outline'
import { Asset, AssetCondition, InventorySessionItem, AssetType } from '../../types'
import { getAssetSignedUrl } from '@/lib/storage'

interface BlindCountModalProps {
    open: boolean
    onClose: () => void
    assets: Asset[]
    branchName: string
    onSubmit: (items: InventorySessionItem[]) => void
    countingType?: AssetType | null
}

const DRAFT_STORAGE_KEY = 'INVENTORY_DRAFT'

export default function BlindCountModal({ open, onClose, assets, branchName, onSubmit, countingType }: BlindCountModalProps) {
    const [items, setItems] = useState<InventorySessionItem[]>([])
    const [currentAssetId, setCurrentAssetId] = useState<string | null>(null)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)

    // Group expansion state
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        'fixed': true,
        'smallware': true
    })

    useEffect(() => {
        if (open && assets.length > 0) {
            // CHECK FOR DRAFT FIRST
            let loadedFromDraft = false
            try {
                const draftStr = localStorage.getItem(DRAFT_STORAGE_KEY)
                if (draftStr) {
                    const draft = JSON.parse(draftStr)
                    // Check context match
                    if (draft.branchName === branchName && draft.countingType === countingType) {
                        setItems(draft.items)
                        setCurrentAssetId(draft.currentAssetId || (draft.items.length > 0 ? draft.items[0].assetId : null))
                        loadedFromDraft = true
                    }
                }
            } catch (e) {
                console.error("Failed to load draft in modal", e)
            }

            if (!loadedFromDraft) {
                // Initialize items normally
                const initialItems: InventorySessionItem[] = assets.map(a => ({
                    assetId: a.id,
                    assetName: a.name,
                    category: a.category,
                    expectedQuantity: a.quantity,
                    countedQuantity: 0,
                    systemStatus: a.status,
                    condition: a.condition,
                    notes: ''
                }))
                setItems(initialItems)
                if (initialItems.length > 0) {
                    setCurrentAssetId(initialItems[0].assetId)
                }
            }
        }
    }, [open, assets, branchName, countingType])

    // AUTO-SAVE EFFECT
    useEffect(() => {
        if (open && items.length > 0) {
            const draft = {
                branchName,
                countingType,
                items,
                currentAssetId,
                lastSaved: new Date().toISOString()
            }
            localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
        }
    }, [items, currentAssetId, open, branchName, countingType])

    // Image fetching
    const [currentItemImageUrl, setCurrentItemImageUrl] = useState<string | null>(null)

    useEffect(() => {
        const fetchImage = async () => {
            if (!currentAssetId) {
                setCurrentItemImageUrl(null)
                return
            }
            const asset = assets.find(a => a.id === currentAssetId)
            if (asset?.images?.[0]) {
                try {
                    const url = await getAssetSignedUrl(asset.images[0])
                    setCurrentItemImageUrl(url)
                } catch (e) {
                    console.error('Failed to load asset image', e)
                    setCurrentItemImageUrl(null)
                }
            } else {
                setCurrentItemImageUrl(null)
            }
        }
        fetchImage()
    }, [currentAssetId, assets])

    // Derived state
    const currentItem = useMemo(() =>
        items.find(i => i.assetId === currentAssetId),
        [items, currentAssetId])

    const groupedItems = useMemo(() => {
        const groups: Record<string, InventorySessionItem[]> = {
            'fixed': [],
            'smallware': []
        }
        items.forEach(item => {
            const originalAsset = assets.find(a => a.id === item.assetId)
            const type = originalAsset?.type || 'fixed'
            if (groups[type]) {
                groups[type].push(item)
            }
        })
        return groups
    }, [items, assets])

    const totalItems = items.length
    const countedItems = items.filter(i => i.countedQuantity > 0 || i.notes).length
    const progress = totalItems > 0 ? Math.round((countedItems / totalItems) * 100) : 0

    if (!open) return null

    const handleUpdate = (field: keyof InventorySessionItem, value: any) => {
        if (!currentItem) return
        const newItems = items.map(item =>
            item.assetId === currentAssetId
                ? { ...item, [field]: value }
                : item
        )
        setItems(newItems)
    }

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }))
    }

    const handleNext = () => {
        const currentIndex = items.findIndex(i => i.assetId === currentAssetId)
        if (currentIndex < items.length - 1) {
            setCurrentAssetId(items[currentIndex + 1].assetId)
        } else {
            if (confirm("You have reached the last item. Submit inventory?")) {
                localStorage.removeItem(DRAFT_STORAGE_KEY) // Clear draft on submit
                onSubmit(items)
            }
        }
    }

    const handleClose = () => {
        // Explicitly clear draft when closing via UI (Cancel action)
        localStorage.removeItem(DRAFT_STORAGE_KEY)
        onClose()
    }

    return (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm lg:p-8 flex items-center justify-center">
            <div className="w-full h-full lg:h-[90vh] lg:max-w-7xl lg:rounded-3xl bg-white border-0 lg:border border-gray-200 shadow-2xl overflow-hidden flex flex-col relative">

                {/* TOP BAR (Mobile Header) */}
                <div className="h-16 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 flex items-center justify-between px-4 z-20 shrink-0">
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className="p-2 -ml-2 text-gray-700 hover:text-blue-600 rounded-xl hover:bg-gray-100 lg:hidden"
                    >
                        <ListBulletIcon className="w-6 h-6" />
                    </button>

                    <div className="flex flex-col items-center">
                        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Blind Count</span>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">{branchName}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                                {countedItems}/{totalItems}
                            </span>
                        </div>
                    </div>

                    <button onClick={handleClose} className="p-2 -mr-2 text-gray-700 hover:text-blue-600 rounded-xl hover:bg-gray-100">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* PROGRESS BAR */}
                <div className="h-1 bg-gray-100 w-full shrink-0">
                    <div className="h-full bg-blue-600 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
                </div>

                {/* CONTENT AREA */}
                <div className="flex-1 flex overflow-hidden relative bg-white">

                    {/* SIDEBAR (Drawer on Mobile, Panel on Desktop) */}
                    <div className={`
                        absolute inset-y-0 left-0 w-80 bg-gray-50 border-r border-gray-200 z-30 transition-transform duration-300 ease-in-out
                        lg:relative lg:translate-x-0 lg:w-1/4 lg:bg-gray-50/50
                        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                    `}>
                        <div className="flex flex-col h-full bg-gray-50/30">
                            <div className="p-4 overflow-y-auto flex-1 space-y-4">
                                {['fixed', 'smallware'].map(groupKey => {
                                    const groupItems = groupedItems[groupKey]
                                    if (groupItems.length === 0) return null
                                    const isExpanded = expandedGroups[groupKey]

                                    return (
                                        <div key={groupKey}>
                                            <button
                                                onClick={() => toggleGroup(groupKey)}
                                                className="w-full flex items-center justify-between text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-2 py-1 hover:text-gray-700 transition-colors"
                                            >
                                                <span>{groupKey === 'fixed' ? 'Fixed Assets' : 'Smallwares'}</span>
                                                <ChevronDownIcon className={`w-3 h-3 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                                            </button>

                                            {isExpanded && (
                                                <div className="space-y-1">
                                                    {groupItems.map(item => {
                                                        const isActive = item.assetId === currentAssetId
                                                        const isCounted = item.countedQuantity > 0 || item.notes

                                                        return (
                                                            <button
                                                                key={item.assetId}
                                                                onClick={() => {
                                                                    setCurrentAssetId(item.assetId)
                                                                    setIsSidebarOpen(false)
                                                                }}
                                                                className={`w-full text-left p-3 rounded-xl transition-all border ${isActive
                                                                    ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm'
                                                                    : 'bg-transparent border-transparent hover:bg-gray-100 text-gray-700'
                                                                    }`}
                                                            >
                                                                 <div className="flex items-start gap-3">
                                                                    <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${isCounted ? 'bg-green-500' : 'bg-gray-300'}`} />
                                                                    <div className="min-w-0">
                                                                        <div className={`text-sm font-semibold truncate ${isActive ? 'text-blue-900' : 'text-gray-700'}`}>
                                                                            {item.assetName}
                                                                        </div>
                                                                        <div className={`text-[10px] truncate ${isActive ? 'text-blue-600/80' : 'text-gray-400'}`}>{item.category}</div>
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* OVERLAY for Mobile Sidebar */}
                    {isSidebarOpen && (
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-20 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
                    )}

                    {/* MAIN CONTENT */}
                    <div className="flex-1 flex flex-col relative w-full overflow-hidden bg-white">
                        {currentItem ? (
                            <div className="flex-1 overflow-y-auto pb-32"> {/* pb-32 for footer space */}
                                <div className="max-w-2xl mx-auto p-6 md:p-10 space-y-10">

                                    {/* Asset Header */}
                                    <div className="text-center space-y-4">
                                        {currentItemImageUrl && (
                                            <div className="w-64 h-64 md:w-96 md:h-96 mx-auto bg-gray-50 rounded-2xl overflow-hidden border border-gray-200 shadow-md mb-4">
                                                <img src={currentItemImageUrl} alt={currentItem.assetName} className="w-full h-full object-cover" />
                                            </div>
                                        )}
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-200 bg-gray-50">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                            <span className="text-xs font-medium text-gray-600">{currentItem.category}</span>
                                        </div>
                                        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 leading-tight tracking-tight">
                                            {currentItem.assetName}
                                        </h1>
                                        <p className="text-gray-500 font-medium text-sm">Verify quantity & condition</p>
                                    </div>

                                    {/* QUANTITY INPUT */}
                                    <div className="bg-gray-50 border border-gray-200/80 hover:border-gray-300 rounded-3xl p-6 relative overflow-hidden group transition-all">
                                        <label className="block text-center text-xs font-bold text-gray-500 uppercase tracking-widest mb-6">Quantity Found</label>

                                        <div className="flex items-center justify-center gap-6 relative z-10">
                                            <button
                                                onClick={() => handleUpdate('countedQuantity', Math.max(0, currentItem.countedQuantity - 1))}
                                                className="w-16 h-16 rounded-2xl bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 hover:border-gray-300 transition-all shadow-sm active:scale-95 flex items-center justify-center"
                                            >
                                                <span className="text-3xl font-light">-</span>
                                            </button>

                                            <div className="w-32 text-center">
                                                <input
                                                    type="number"
                                                    inputMode="numeric"
                                                    pattern="[0-9]*"
                                                    min="0"
                                                    value={currentItem.countedQuantity}
                                                    onChange={(e) => handleUpdate('countedQuantity', parseInt(e.target.value) || 0)}
                                                    className="w-full bg-transparent text-center text-6xl md:text-7xl font-bold text-gray-900 border-none focus:ring-0 p-0 placeholder-gray-300 tabular-nums tracking-tight"
                                                    placeholder="0"
                                                />
                                            </div>

                                            <button
                                                onClick={() => handleUpdate('countedQuantity', currentItem.countedQuantity + 1)}
                                                className="w-16 h-16 rounded-2xl bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 hover:border-gray-300 transition-all shadow-sm active:scale-95 flex items-center justify-center"
                                            >
                                                <span className="text-3xl font-light">+</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* CONDITION GRID */}
                                    <div className="space-y-4">
                                        <label className="block text-center text-xs font-bold text-gray-500 uppercase tracking-widest">
                                            Condition
                                        </label>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            {(['new', 'good', 'fair', 'poor'] as AssetCondition[]).map((cond) => {
                                                const isSelected = currentItem.condition === cond
                                                const CONDITION_RANK: Record<AssetCondition, number> = {
                                                    'new': 0,
                                                    'good': 1,
                                                    'fair': 2,
                                                    'poor': 3
                                                }
                                                const originalAsset = assets.find(a => a.id === currentAssetId)
                                                const originalCondition = originalAsset?.condition || 'new'
                                                const isDisabled = CONDITION_RANK[cond] < CONDITION_RANK[originalCondition]

                                                let colorClass = ''

                                                if (isSelected) {
                                                    if (cond === 'new') colorClass = 'bg-green-600 border-green-500 text-white font-semibold shadow-sm'
                                                    else if (cond === 'good') colorClass = 'bg-blue-600 border-blue-500 text-white font-semibold shadow-sm'
                                                    else if (cond === 'fair') colorClass = 'bg-amber-500 border-amber-400 text-white font-semibold shadow-sm'
                                                    else if (cond === 'poor') colorClass = 'bg-red-600 border-red-500 text-white font-semibold shadow-sm'
                                                } else if (isDisabled) {
                                                    colorClass = 'bg-gray-100 border-gray-200 opacity-40 cursor-not-allowed text-gray-400'
                                                } else {
                                                    colorClass = 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300 text-gray-700'
                                                }

                                                return (
                                                    <button
                                                        key={cond}
                                                        onClick={() => !isDisabled && handleUpdate('condition', cond)}
                                                        disabled={isDisabled}
                                                        title={isDisabled ? `Condition cannot be upgraded from ${originalCondition}` : ''}
                                                        className={`h-14 rounded-xl border font-semibold text-sm capitalize transition-all duration-200 ${!isDisabled && 'active:scale-95'} ${colorClass}`}
                                                    >
                                                        {cond}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* NOTES */}
                                    <div className="space-y-4">
                                        <label className="block text-center text-xs font-bold text-gray-500 uppercase tracking-widest">
                                            Notes
                                        </label>
                                        <textarea
                                            value={currentItem.notes || ''}
                                            onChange={(e) => handleUpdate('notes', e.target.value)}
                                            className="block w-full bg-white border border-gray-200 rounded-2xl shadow-inner focus:ring-blue-500/20 focus:border-blue-500 text-gray-800 placeholder-gray-400 resize-none p-4 transition-all focus:bg-white"
                                            rows={2}
                                            placeholder="Write note..."
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <p className="text-gray-400">Select an item to start counting</p>
                            </div>
                        )}

                        {/* BOTTOM ACTIONS BAR */}
                        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-white border-t border-gray-100 z-20 flex items-center justify-center shrink-0">
                            <button
                                onClick={handleNext}
                                className="w-full md:max-w-md mx-auto h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-lg shadow-lg shadow-blue-500/10 flex items-center justify-center gap-3 transition-all hover:scale-[1.01] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-blue-300"
                            >
                                <span>Next Item</span>
                                <ChevronRightIcon className="w-5 h-5 opacity-80" />
                            </button>
                        </div>

                    </div>

                </div>
            </div>
        </div>
    )
}
