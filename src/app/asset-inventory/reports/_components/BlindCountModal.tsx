'use client'

import { useState, useEffect, useMemo } from 'react'
import { XMarkIcon, CheckCircleIcon, ChevronDownIcon, ChevronRightIcon, ListBulletIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { Asset, AssetCondition, InventorySessionItem } from '../../types'
import { getAssetSignedUrl } from '@/lib/storage'

interface BlindCountModalProps {
    open: boolean
    onClose: () => void
    assets: Asset[]
    branchName: string
    onSubmit: (items: InventorySessionItem[]) => void
}

export default function BlindCountModal({ open, onClose, assets, branchName, onSubmit }: BlindCountModalProps) {
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
            // Initialize items
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
    }, [open, assets])

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
                onSubmit(items)
            }
        }
    }

    return (
        <div className="fixed inset-0 z-[60] bg-slate-950/90 backdrop-blur-sm lg:p-8 flex items-center justify-center">
            <div className="w-full h-full lg:h-[90vh] lg:max-w-7xl lg:rounded-3xl bg-slate-900 border-0 lg:border border-white/10 shadow-2xl overflow-hidden flex flex-col relative">

                {/* TOP BAR (Mobile Header) */}
                <div className="h-16 border-b border-white/5 bg-slate-900/50 backdrop-blur flex items-center justify-between px-4 z-20 shrink-0">
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className="p-2 -ml-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 lg:hidden"
                    >
                        <ListBulletIcon className="w-6 h-6" />
                    </button>

                    <div className="flex flex-col items-center">
                        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Blind Count</span>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">{branchName}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium">
                                {countedItems}/{totalItems}
                            </span>
                        </div>
                    </div>

                    <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* PROGRESS BAR */}
                <div className="h-0.5 bg-slate-800 w-full shrink-0">
                    <div className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
                </div>


                {/* CONTENT AREA */}
                <div className="flex-1 flex overflow-hidden relative">

                    {/* SIDEBAR (Drawer on Mobile, Panel on Desktop) */}
                    <div className={`
                        absolute inset-y-0 left-0 w-80 bg-slate-900/95 backdrop-blur-xl border-r border-white/10 z-30 transition-transform duration-300 ease-in-out
                        lg:relative lg:translate-x-0 lg:w-1/4 lg:bg-slate-900/50 lg:backdrop-blur-none
                        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                    `}>
                        <div className="flex flex-col h-full">
                            <div className="p-4 overflow-y-auto flex-1 space-y-4">
                                {['fixed', 'smallware'].map(groupKey => {
                                    const groupItems = groupedItems[groupKey]
                                    if (groupItems.length === 0) return null
                                    const isExpanded = expandedGroups[groupKey]

                                    return (
                                        <div key={groupKey}>
                                            <button
                                                onClick={() => toggleGroup(groupKey)}
                                                className="w-full flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 px-2 py-1 hover:text-slate-300 transition-colors"
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
                                                                    ? 'bg-blue-600/10 border-blue-500/50 shadow-[0_0_15px_-3px_rgba(59,130,246,0.3)]'
                                                                    : 'bg-transparent border-transparent hover:bg-white/5 text-slate-400'
                                                                    }`}
                                                            >
                                                                <div className="flex items-start gap-3">
                                                                    <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${isCounted ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-slate-700'}`} />
                                                                    <div className="min-w-0">
                                                                        <div className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-slate-400'}`}>
                                                                            {item.assetName}
                                                                        </div>
                                                                        <div className="text-[10px] text-slate-600 truncate">{item.category}</div>
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
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
                    )}


                    {/* MAIN CONTENT */}
                    <div className="flex-1 flex flex-col relative w-full overflow-hidden bg-gradient-to-b from-slate-900 to-slate-950">
                        {currentItem ? (
                            <div className="flex-1 overflow-y-auto pb-32"> {/* pb-32 for footer space */}
                                <div className="max-w-2xl mx-auto p-6 md:p-10 space-y-10">

                                    {/* Asset Header */}
                                    <div className="text-center space-y-4">
                                        {currentItemImageUrl && (
                                            <div className="w-64 h-64 md:w-96 md:h-96 mx-auto bg-slate-800 rounded-2xl overflow-hidden border border-white/10 shadow-xl mb-4">
                                                <img src={currentItemImageUrl} alt={currentItem.assetName} className="w-full h-full object-cover" />
                                            </div>
                                        )}
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                                            <span className="text-xs font-medium text-slate-300">{currentItem.category}</span>
                                        </div>
                                        <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight tracking-tight">
                                            {currentItem.assetName}
                                        </h1>
                                        <p className="text-slate-400 font-medium">Verify quantity & condition</p>
                                    </div>

                                    {/* QUANTITY INPUT */}
                                    <div className="bg-white/[0.03] rounded-3xl p-6 border border-white/5 relative overflow-hidden group hover:border-white/10 transition-colors">
                                        <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />

                                        <label className="block text-center text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Quantity Found</label>

                                        <div className="flex items-center justify-center gap-6 relative z-10">
                                            <button
                                                onClick={() => handleUpdate('countedQuantity', Math.max(0, currentItem.countedQuantity - 1))}
                                                className="w-16 h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 hover:border-white/20 transition-all active:scale-95 flex items-center justify-center"
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
                                                    className="w-full bg-transparent text-center text-6xl md:text-7xl font-bold text-white border-none focus:ring-0 p-0 placeholder-slate-700 tabular-nums tracking-tight"
                                                    placeholder="0"
                                                />
                                            </div>

                                            <button
                                                onClick={() => handleUpdate('countedQuantity', currentItem.countedQuantity + 1)}
                                                className="w-16 h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 hover:border-white/20 transition-all active:scale-95 flex items-center justify-center"
                                            >
                                                <span className="text-3xl font-light">+</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* CONDITION GRID */}
                                    <div className="space-y-4">
                                        <label className="block text-center text-xs font-bold text-slate-500 uppercase tracking-widest">
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
                                                    if (cond === 'new') colorClass = 'bg-emerald-500 border-emerald-400 shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)]'
                                                    else if (cond === 'good') colorClass = 'bg-blue-500 border-blue-400 shadow-[0_0_20px_-5px_rgba(59,130,246,0.4)]'
                                                    else if (cond === 'fair') colorClass = 'bg-amber-500 border-amber-400 shadow-[0_0_20px_-5px_rgba(245,158,11,0.4)]'
                                                    else if (cond === 'poor') colorClass = 'bg-red-500 border-red-400 shadow-[0_0_20px_-5px_rgba(239,68,68,0.4)]'
                                                } else if (isDisabled) {
                                                    colorClass = 'bg-slate-900 border-white/5 opacity-30 cursor-not-allowed text-slate-600'
                                                } else {
                                                    colorClass = 'bg-slate-800/50 border-white/5 hover:bg-slate-800 hover:border-white/10 text-slate-400'
                                                }

                                                return (
                                                    <button
                                                        key={cond}
                                                        onClick={() => !isDisabled && handleUpdate('condition', cond)}
                                                        disabled={isDisabled}
                                                        title={isDisabled ? `Condition cannot be upgraded from ${originalCondition}` : ''}
                                                        className={`h-14 rounded-xl border font-medium text-sm capitalize transition-all duration-200 ${!isDisabled && 'active:scale-95'} ${colorClass} ${isSelected ? 'text-white' : ''}`}
                                                    >
                                                        {cond}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* NOTES */}
                                    <div className="space-y-4">
                                        <label className="block text-center text-xs font-bold text-slate-500 uppercase tracking-widest">
                                            Notes
                                        </label>
                                        <textarea
                                            value={currentItem.notes || ''}
                                            onChange={(e) => handleUpdate('notes', e.target.value)}
                                            className="block w-full bg-slate-800/50 border border-white/10 rounded-2xl shadow-inner focus:ring-blue-500/50 focus:border-blue-500/50 text-slate-200 placeholder-slate-600 resize-none p-4 transition-all focus:bg-slate-800"
                                            rows={2}
                                            placeholder="Write note..."
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <p className="text-slate-500">Select an item to start counting</p>
                            </div>
                        )}

                        {/* BOTTOM ACTIONS BAR */}
                        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent z-20">
                            <button
                                onClick={handleNext}
                                className="w-full md:max-w-md mx-auto h-14 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl font-bold text-lg shadow-lg shadow-blue-500/20 flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98]"
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
