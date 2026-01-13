'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Asset, AssetType, AssetLogEntry, LogAction, CateringEvent } from '../types'
import AssetHeader from './AssetHeader'
import AssetKPICards from './AssetKPICards'
import AssetTable from './AssetTable'
import AssetDetailPanel from './AssetDetailPanel'
import NewAssetModal from './NewAssetModal'
import TransferAssetModal from './TransferAssetModal'
import CateringAssetModal from './CateringAssetModal'
import TransferNotificationModal from './TransferNotificationModal'
import AssetNotificationCenterModal from './AssetNotificationCenterModal'
import AssetActivityLogModal from './AssetActivityLogModal'
// Mock Data
import { MOCK_ASSETS, STORAGE_KEY, LOG_STORAGE_KEY } from '../_data/mockData'

const loadAssets = (defaults: Asset[]) => {
    if (typeof window === 'undefined') return defaults
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : defaults
}
const saveAssets = (assets: Asset[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assets))
}

const loadLogs = () => {
    if (typeof window === 'undefined') return []
    const stored = localStorage.getItem(LOG_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
}

export default function AssetInventoryLayout() {
    const searchParams = useSearchParams()
    const branchName = searchParams.get('branchName') || 'all'

    // Initialize with storage if available, else MOCK
    const [allAssets, setAllAssets] = useState<Asset[]>(MOCK_ASSETS)
    const [assets, setAssets] = useState<Asset[]>([])

    // Log State
    const [logs, setLogs] = useState<AssetLogEntry[]>([])
    const [isLogOpen, setIsLogOpen] = useState(false)

    // Notification UI State
    const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false)

    // UI States
    const [isNewModalOpen, setIsNewModalOpen] = useState(false)
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
    const [assetToEdit, setAssetToEdit] = useState<Asset | null>(null)

    // Transfer States
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)
    const [assetToTransfer, setAssetToTransfer] = useState<Asset | null>(null)
    const [notifications, setNotifications] = useState<any[]>([])

    // User State
    const [currentUser, setCurrentUser] = useState<string>('')

    // Load initial state
    useEffect(() => {
        const loaded = loadAssets(MOCK_ASSETS)
        setAllAssets(loaded)
        setLogs(loadLogs())
    }, [])

    // Fetch current user for transfer tracking
    useEffect(() => {
        const getUser = async () => {
            const localName = localStorage.getItem('user.displayName') || localStorage.getItem('user.name')
            if (localName) {
                setCurrentUser(localName)
                return
            }
            setCurrentUser('Staff')
        }
        getUser()
    }, [])

    // Filter assets when branch or allAssets changes, AND when activeTab changes
    const [activeTab, setActiveTab] = useState<'all' | 'fixed' | 'smallware'>('all')

    useEffect(() => {
        let filtered = allAssets

        // 1. Filter by Branch
        if (branchName && branchName !== 'all') {
            filtered = filtered.filter(a => a.branch === branchName)
        }

        // 2. Filter by Type (Tab)
        if (activeTab !== 'all') {
            filtered = filtered.filter(a => a.type === activeTab)
        }

        setAssets(filtered)
    }, [branchName, allAssets, activeTab])

    // Check for notifications (THE POPUP LOGIC)
    useEffect(() => {
        if (!branchName || branchName === 'all') return

        const notifs: any[] = []

        // 1. Sender Reminder
        const mySentAssets = allAssets.filter(a =>
            a.status === 'in_transit' &&
            a.branch === branchName
        )
        mySentAssets.forEach(a => {
            notifs.push({ type: 'sender_reminder', asset: a })
        })

        // 2. Receiver Alert
        const incomingAssets = allAssets.filter(a =>
            a.status === 'in_transit' &&
            a.targetBranch === branchName
        )
        incomingAssets.forEach(a => {
            notifs.push({ type: 'receiver_alert', asset: a })
        })

        setNotifications(notifs)
    }, [branchName, allAssets])

    const addLog = (action: LogAction, details: string, assetId?: string, assetName?: string) => {
        const newLog: AssetLogEntry = {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            action,
            details,
            user: currentUser || 'Staff',
            assetId,
            assetName
        }
        const updatedLogs = [newLog, ...logs]
        setLogs(updatedLogs)
        localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(updatedLogs))
    }

    const handleSaveAsset = (assetData: Omit<Asset, 'id'>) => {
        let newAllAssets = [...allAssets]
        if (assetToEdit) {
            newAllAssets = newAllAssets.map(a => a.id === assetToEdit.id ? { ...assetData, id: assetToEdit.id, images: assetData.images || a.images || [] } : a)
            addLog('UPDATE', `Updated asset '${assetData.name}'`, assetToEdit.id, assetData.name)
            setAssetToEdit(null)
        } else {
            const newId = Math.random().toString(36).substr(2, 9)
            const newAsset: Asset = {
                ...assetData,
                id: newId,
                images: assetData.images || []
            }
            newAllAssets = [newAsset, ...newAllAssets]
            addLog('CREATE', `Created new asset '${assetData.name}'`, newId, assetData.name)
        }
        setAllAssets(newAllAssets)
        saveAssets(newAllAssets)
        setIsNewModalOpen(false)
    }

    const handleEditAsset = () => {
        if (selectedAsset) {
            setAssetToEdit(selectedAsset)
            setSelectedAsset(null)
            setIsNewModalOpen(true)
        }
    }

    const handleCloseModal = () => {
        setIsNewModalOpen(false)
        setAssetToEdit(null)
    }

    const handleDeleteAsset = (id: string) => {
        const asset = allAssets.find(a => a.id === id)
        const newAllAssets = allAssets.filter(a => a.id !== id)
        setAllAssets(newAllAssets)
        saveAssets(newAllAssets)
        addLog('DELETE', `Deleted asset '${asset?.name || 'Unknown'}'`, id, asset?.name)
        setSelectedAsset(null)
    }

    // Transfer Logic
    const handleTransferClick = (asset: Asset) => {
        setAssetToTransfer(asset)
        setIsTransferModalOpen(true)
    }

    const confirmTransfer = (targetBranch: string, note?: string) => {
        if (!assetToTransfer) return

        const newAllAssets = allAssets.map(a => {
            if (a.id === assetToTransfer.id) {
                return {
                    ...a,
                    status: 'in_transit' as const,
                    targetBranch: targetBranch,
                    transferDate: new Date().toISOString().split('T')[0],
                    transferBy: currentUser || 'Staff'
                }
            }
            return a
        })

        setAllAssets(newAllAssets)
        saveAssets(newAllAssets)
        addLog('TRANSFER_INIT', `Transferred '${assetToTransfer.name}' to ${targetBranch}`, assetToTransfer.id, assetToTransfer.name)
        setIsTransferModalOpen(false)
        setAssetToTransfer(null)
        setSelectedAsset(null) // Close detail
    }

    // Notification Actions
    const handleReceiveAsset = (assetId: string) => {
        const asset = allAssets.find(a => a.id === assetId)
        const newAllAssets = allAssets.map(a => {
            if (a.id === assetId) {
                return {
                    ...a,
                    status: 'active' as const, // or maintains previous condition?
                    branch: a.targetBranch!, // Move to new branch
                    targetBranch: undefined,
                    transferDate: undefined
                }
            }
            return a
        })
        setAllAssets(newAllAssets)
        saveAssets(newAllAssets)
        if (asset) {
            addLog('TRANSFER_RECEIVE', `Received asset '${asset.name}' at ${branchName}`, asset.id, asset.name)
        }
    }

    // Catering Logic
    const [isCateringModalOpen, setIsCateringModalOpen] = useState(false)
    const [assetForCatering, setAssetForCatering] = useState<Asset | null>(null)

    const handleCateringClick = (asset: Asset) => {
        // If already out, return it
        if (asset.status === 'out_for_catering') {
            if (confirm(`Mark '${asset.name}' as returned from catering?`)) {
                handleReturnFromCatering(asset)
            }
            return
        }
        // Else open modal
        setAssetForCatering(asset)
        setIsCateringModalOpen(true)
    }

    const confirmCateringOut = (details: CateringEvent) => {
        if (!assetForCatering) return

        const newAllAssets = allAssets.map(a => {
            if (a.id === assetForCatering.id) {
                return {
                    ...a,
                    status: 'out_for_catering' as const,
                    cateringEvent: details
                }
            }
            return a
        })

        setAllAssets(newAllAssets)
        saveAssets(newAllAssets)
        addLog('CATERING_OUT', `Sent '${assetForCatering.name}' from ${assetForCatering.branch} to event: ${details.eventName}`, assetForCatering.id, assetForCatering.name)
        setIsCateringModalOpen(false)
        setAssetForCatering(null)
        setSelectedAsset(null)
    }

    const handleReturnFromCatering = (asset: Asset) => {
        const newAllAssets = allAssets.map(a => {
            if (a.id === asset.id) {
                // Restore to active, clear event logic
                // Could ideally check condition here too
                const { cateringEvent, ...rest } = a
                return {
                    ...rest,
                    status: 'active' as const
                }
            }
            return a
        })
        setAllAssets(newAllAssets)
        saveAssets(newAllAssets)
        addLog('CATERING_RETURN', `Returned '${asset.name}' from catering back to ${asset.branch}`, asset.id, asset.name)
        setSelectedAsset(null)
    }

    return (
        <div className="max-w-none mx-auto p-4 text-gray-100">
            <AssetHeader
                onNewAsset={() => {
                    setAssetToEdit(null)
                    setIsNewModalOpen(true)
                }}
                onViewLog={() => setIsLogOpen(true)}
                onViewNotifications={() => setIsNotificationCenterOpen(true)}
                notificationCount={notifications.length}
            />

            {/* Asset Type Tabs */}
            <div className="mb-6 flex items-center gap-1 bg-slate-800/50 p-1 rounded-xl w-fit">
                <button
                    onClick={() => setActiveTab('all')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'all'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                >
                    All Assets
                </button>
                <button
                    onClick={() => setActiveTab('fixed')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'fixed'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                >
                    Fixed Assets
                </button>
                <button
                    onClick={() => setActiveTab('smallware')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'smallware'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                >
                    Smallwares
                </button>
            </div>

            <AssetKPICards assets={assets} />



            <AssetTable
                assets={assets}
                onAssetClick={setSelectedAsset}
            />

            <AssetDetailPanel
                asset={selectedAsset}
                onClose={() => setSelectedAsset(null)}
                onEdit={handleEditAsset}
                onDelete={handleDeleteAsset}
                onTransfer={handleTransferClick}
                onCatering={handleCateringClick}
            />

            <NewAssetModal
                open={isNewModalOpen}
                onClose={() => { setIsNewModalOpen(false); setAssetToEdit(null) }}
                onSave={handleSaveAsset}
                initialData={assetToEdit}
                defaultBranch={branchName && branchName !== 'all' ? branchName : undefined}
            />

            <TransferAssetModal
                open={isTransferModalOpen}
                onClose={() => setIsTransferModalOpen(false)}
                onConfirm={confirmTransfer}
                asset={assetToTransfer}
                currentBranch={branchName || ''}
            />

            <CateringAssetModal
                open={isCateringModalOpen}
                onClose={() => setIsCateringModalOpen(false)}
                onConfirm={confirmCateringOut}
                asset={assetForCatering}
            />

            <AssetActivityLogModal
                open={isLogOpen}
                onClose={() => setIsLogOpen(false)}
                logs={logs}
            />

            <AssetNotificationCenterModal
                open={isNotificationCenterOpen}
                onClose={() => setIsNotificationCenterOpen(false)}
                notifications={notifications}
                onReceive={handleReceiveAsset}
            />
        </div>
    )
}
