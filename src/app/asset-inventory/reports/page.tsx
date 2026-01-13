'use client'

import React, { useState, useEffect } from 'react'
import { PlusIcon, DocumentMagnifyingGlassIcon, ClipboardDocumentCheckIcon, EllipsisVerticalIcon, TrashIcon, CubeIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline'
import { Asset, AssetType, InventorySession, InventorySessionItem } from '../types'
import { MOCK_ASSETS, STORAGE_KEY } from '../_data/mockData'
import BlindCountModal from './_components/BlindCountModal'
import InventorySessionDetailModal from './_components/InventorySessionDetailModal'
import InventoryTypeSelectionModal from './_components/InventoryTypeSelectionModal'
import { useRouter, useSearchParams } from 'next/navigation'

const SESSION_STORAGE_KEY = 'mock_inventory_sessions_v1'
const DRAFT_STORAGE_KEY = 'INVENTORY_DRAFT'

const loadAssets = (defaults: Asset[]): Asset[] => {
    if (typeof window === 'undefined') return defaults
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : defaults
}

export default function InventoryReportsPage() {
    const searchParams = useSearchParams()
    const branchName = searchParams.get('branchName') || 'all'
    const [sessions, setSessions] = useState<InventorySession[]>([])
    const [isCountModalOpen, setIsCountModalOpen] = useState(false)
    const [isTypeSelectionOpen, setIsTypeSelectionOpen] = useState(false)
    const [selectedSession, setSelectedSession] = useState<InventorySession | null>(null)
    const [assets, setAssets] = useState<Asset[]>([])
    const [openMenuId, setOpenMenuId] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<AssetType>('fixed')
    const [countingType, setCountingType] = useState<AssetType | null>(null)
    // Load Data
    useEffect(() => {
        // Load sessions
        const storedSessions = localStorage.getItem(SESSION_STORAGE_KEY)
        if (storedSessions) {
            setSessions(JSON.parse(storedSessions))
        }

        // Load assets for counting
        const loadedAssets = loadAssets(MOCK_ASSETS)
        // Only can count for a specific branch
        if (branchName && branchName !== 'all') {
            setAssets(loadedAssets.filter(a => a.branch === branchName && a.status === 'active')) // Only count active?
        } else {
            setAssets([])
        }
    }, [branchName])

    // Check for Draft on Mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const draftStr = localStorage.getItem(DRAFT_STORAGE_KEY)
            if (draftStr) {
                try {
                    const draft = JSON.parse(draftStr)
                    // Only resume if it matches the current branch (or if we are on 'all' and draft has a branch?)
                    // For now, strict branch matching
                    if (draft.branchName === branchName) {
                        setCountingType(draft.countingType)
                        setIsCountModalOpen(true)
                    }
                } catch (e) {
                    console.error("Failed to parse inventory draft", e)
                }
            }
        }
    }, [branchName])

    const handleStartInventory = (type: AssetType) => {
        if (!branchName || branchName === 'all') {
            alert("Please select a specific branch from the sidebar to start an inventory count.")
            return
        }

        const typeSpecificAssets = assets.filter(a => a.type === type)
        if (typeSpecificAssets.length === 0) {
            alert(`No active ${type === 'fixed' ? 'fixed assets' : 'smallwares'} found for this branch.`)
            return
        }

        setIsTypeSelectionOpen(false)
        setCountingType(type)
        setIsCountModalOpen(true)
    }

    const handleSubmitInventory = (items: InventorySessionItem[]) => {
        if (!countingType) return

        const newSession: InventorySession = {
            id: Math.random().toString(36).substr(2, 9),
            date: new Date().toISOString(),
            branch: branchName,
            assetType: countingType,
            status: 'completed',
            items: items,
            createdBy: 'Current User', // TODO: Get read user
            totalDiscrepancyCost: 0 // Calculate later
        }

        // 1. Save Session
        const newSessions = [newSession, ...sessions]
        setSessions(newSessions)
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSessions))

        // 2. Sync to Assets (Update Quantity & Condition)
        if (typeof window !== 'undefined') {
            const currentAssetsStr = localStorage.getItem(STORAGE_KEY)
            const currentAssets: Asset[] = currentAssetsStr ? JSON.parse(currentAssetsStr) : MOCK_ASSETS

            let hasUpdates = false
            const updatedAssets = currentAssets.map(asset => {
                const scannedItem = items.find(i => i.assetId === asset.id)
                if (scannedItem) {
                    hasUpdates = true
                    return {
                        ...asset,
                        quantity: scannedItem.countedQuantity,
                        condition: scannedItem.condition
                    }
                }
                return asset
            })

            if (hasUpdates) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedAssets))
                // Update local state if we are viewing the same branch
                // Re-filtering is handled by the useEffect on branchName, 
                // but we can trigger a reload or just let the next navigation handle it.
                // Since this page uses 'assets' state for the *count*, updating it here 
                // ensures validation uses new values if they start another count immediately (though unlikely for same branch).
                if (branchName && branchName !== 'all') {
                    setAssets(updatedAssets.filter(a => a.branch === branchName && a.status === 'active'))
                }
            }
        }

        setIsCountModalOpen(false)
    }

    const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation()
        if (confirm("Are you sure you want to delete this report? This action cannot be undone.")) {
            const newSessions = sessions.filter(s => s.id !== sessionId)
            setSessions(newSessions)
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSessions))
            setOpenMenuId(null)
        }
    }

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 text-gray-900" onClick={() => setOpenMenuId(null)}>
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    {/* Fixed title contrast - was text-gray-900 on dark bg likely */}
                    <h1 className="text-3xl font-bold text-white">
                        Inventory Reports
                    </h1>
                    <p className="text-slate-400 mt-1">
                        Track monthly asset counts and discrepancies for <span className="text-white font-medium">{branchName === 'all' ? 'All Branches' : branchName}</span>
                    </p>
                </div>

                <div className="flex flex-col md:flex-row gap-3">
                    <button
                        onClick={() => setIsTypeSelectionOpen(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium shadow-lg shadow-blue-900/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <ClipboardDocumentCheckIcon className="w-5 h-5" />
                        Start Inventory
                    </button>
                </div>
            </div>

            {/* Asset Type Tabs */}
            <div className="mb-6 flex items-center gap-1 bg-slate-800/50 p-1 rounded-xl w-fit">
                <button
                    onClick={() => setActiveTab('fixed')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'fixed'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                >
                    <WrenchScrewdriverIcon className="w-4 h-4" />
                    Fixed Assets
                </button>
                <button
                    onClick={() => setActiveTab('smallware')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'smallware'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                >
                    <CubeIcon className="w-4 h-4" />
                    Smallwares
                </button>
            </div>

            {/* Recent Sessions List */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-visible">
                <div className="border-b border-gray-100 bg-gray-50 rounded-t-2xl flex flex-col md:flex-row md:items-center justify-between p-2 gap-4">
                    <h2 className="font-semibold text-lg text-gray-900 px-4 py-2">Reports History</h2>
                </div>

                {sessions.filter(s => s.assetType === activeTab).length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                        <DocumentMagnifyingGlassIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No reports found for {activeTab === 'fixed' ? 'Fixed Assets' : 'Smallwares'}.</p>
                        <p className="text-sm mt-1">Start a new count to generate a report.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {sessions.filter(s => s.assetType === activeTab).map((session, index, filteredArray) => (
                            <div
                                key={session.id}
                                className={`p-4 flex items-center justify-between hover:bg-gray-50 transition-colors group relative ${index === filteredArray.length - 1 ? 'rounded-b-2xl' : ''
                                    }`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                                        <ClipboardDocumentCheckIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-gray-900">
                                            {new Date(session.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                                        </h3>
                                        <p className="text-sm text-gray-500">
                                            {session.branch} • {session.items.length} items scanned
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                                        {session.status}
                                    </span>
                                    <button
                                        onClick={() => setSelectedSession(session)}
                                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                                    >
                                        View Details
                                    </button>

                                    {/* Kebab Menu */}
                                    <div className="relative">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setOpenMenuId(openMenuId === session.id ? null : session.id)
                                            }}
                                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                        >
                                            <EllipsisVerticalIcon className="w-5 h-5" />
                                        </button>

                                        {openMenuId === session.id && (
                                            <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                                                <button
                                                    onClick={(e) => handleDeleteSession(e, session.id)}
                                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors text-left"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                    Delete Report
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <BlindCountModal
                open={isCountModalOpen}
                onClose={() => {
                    setIsCountModalOpen(false)
                    setCountingType(null)
                }}
                branchName={branchName}
                assets={assets.filter(a => a.type === countingType)}
                onSubmit={handleSubmitInventory}
                countingType={countingType}
            />

            <InventoryTypeSelectionModal
                open={isTypeSelectionOpen}
                onClose={() => setIsTypeSelectionOpen(false)}
                onSelect={(type) => handleStartInventory(type)}
            />

            <InventorySessionDetailModal
                open={!!selectedSession}
                onClose={() => setSelectedSession(null)}
                session={selectedSession}
            />
        </div>
    )
}
