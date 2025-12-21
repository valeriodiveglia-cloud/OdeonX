'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Asset, AssetType, AssetLogEntry, LogAction } from '../types'
import AssetHeader from './AssetHeader'
import AssetKPICards from './AssetKPICards'
import AssetTable from './AssetTable'
import AssetDetailPanel from './AssetDetailPanel'
import NewAssetModal from './NewAssetModal'
import TransferAssetModal from './TransferAssetModal'
import TransferNotificationModal from './TransferNotificationModal'
import AssetNotificationCenterModal from './AssetNotificationCenterModal'
import AssetActivityLogModal from './AssetActivityLogModal'
// Mock Data
const MOCK_ASSETS: Asset[] = [
    {
        id: '1',
        name: 'Rational Combi Oven iCombi Pro',
        sku: 'FIX-20240115-1001',
        category: 'Kitchen Equipment',
        branch: 'Pasta Fresca Thao Dien',
        location: 'Hot Kitchen',
        type: 'fixed',
        status: 'active',
        condition: 'good',
        quantity: 1,
        serialNumber: 'E11SI2203294857',
        financials: {
            purchasePrice: 15200,
            purchaseDate: '2024-01-15',
            usefulLifeYears: 7,
            salvageValue: 2000,
            warrantyYears: 2
        }
    },
    {
        id: '2',
        name: 'Hobart Mixer 20L',
        sku: 'FIX-20220610-2002',
        category: 'Bakery',
        branch: 'Pasta Fresca Thanh My Loi',
        location: 'Pastry',
        type: 'fixed',
        status: 'maintenance',
        condition: 'fair',
        quantity: 1,
        serialNumber: '9988-7711-22',
        financials: {
            purchasePrice: 4800,
            purchaseDate: '2022-06-10',
            usefulLifeYears: 10,
            warrantyYears: 1
        }
    },
    {
        id: '3',
        name: 'La Marzocco Linea PB',
        sku: 'FIX-20241101-3003',
        category: 'Bar Equipment',
        branch: 'Pasta Fresca Thao Dien',
        location: 'Coffee Bar',
        type: 'fixed',
        status: 'active',
        condition: 'new',
        quantity: 1,
        serialNumber: 'LM-PB-2394',
        financials: {
            purchasePrice: 12500,
            purchaseDate: '2024-11-01',
            usefulLifeYears: 5,
            warrantyYears: 3
        }
    },
    {
        id: '4',
        name: 'Wusthof Classic Knife Set',
        sku: 'SML-20230520-4004',
        category: 'Utensils',
        branch: 'Pasta Fresca Thao Dien',
        location: 'Prep Kitchen',
        type: 'smallware',
        status: 'active',
        condition: 'good',
        quantity: 15,
        parLevel: 20,
        financials: {
            purchasePrice: 850,
            purchaseDate: '2023-05-20',
            usefulLifeYears: 3
        }
    },
    {
        id: '5',
        name: 'Riedel Wine Glasses',
        sku: 'SML-20230815-5005',
        category: 'Glassware',
        branch: 'Pasta Fresca Thanh My Loi',
        location: 'Bar Storage',
        type: 'smallware',
        status: 'active',
        condition: 'good',
        quantity: 48,
        parLevel: 50,
        financials: {
            purchasePrice: 1200,
            purchaseDate: '2023-08-15',
            usefulLifeYears: 2
        }
    },
    {
        id: '6',
        name: 'Teak Outdoor Tables',
        sku: 'FIX-20210310-6006',
        category: 'Furniture',
        branch: 'Pasta Fresca Da Lat',
        location: 'Patio',
        type: 'fixed',
        status: 'maintenance',
        condition: 'fair',
        quantity: 1,
        serialNumber: 'FURN-OUT-001',
        financials: {
            purchasePrice: 600,
            purchaseDate: '2021-03-10',
            usefulLifeYears: 5
        }
    },
    {
        id: '7',
        name: 'Honda PCX Delivery Scooter',
        sku: 'FIX-20241201-7007',
        category: 'Vehicles',
        branch: 'Pasta Fresca Da Lat',
        location: 'Parking',
        type: 'fixed',
        status: 'in_transit',
        condition: 'new',
        quantity: 1,
        serialNumber: 'VIN-9938475',
        financials: {
            purchasePrice: 3500,
            purchaseDate: '2024-12-01',
            usefulLifeYears: 4,
            warrantyYears: 2
        }
    },
    {
        id: '8',
        name: 'Toast POS Terminal',
        sku: 'FIX-20230901-8008',
        category: 'Technology',
        branch: 'Pasta Fresca Thao Dien',
        location: 'Counter',
        type: 'fixed',
        status: 'active',
        condition: 'good',
        quantity: 1,
        serialNumber: 'POS-T-2938',
        financials: {
            purchasePrice: 1200,
            purchaseDate: '2023-09-01',
            usefulLifeYears: 3,
            warrantyYears: 1
        }
    }
]

// Helper to persist mock state
const STORAGE_KEY = 'mock_assets_db_v2'
const LOG_STORAGE_KEY = 'mock_asset_logs_v1'

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
    const branchName = searchParams.get('branchName') || 'Main Branch'

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

    // Filter assets when branch or allAssets changes
    useEffect(() => {
        if (branchName && branchName !== 'all') {
            const filtered = allAssets.filter(a => a.branch === branchName)
            setAssets(filtered)
        } else {
            setAssets(allAssets)
        }
    }, [branchName, allAssets])

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
            newAllAssets = newAllAssets.map(a => a.id === assetToEdit.id ? { ...assetData, id: assetToEdit.id, images: a.images || [] } : a)
            addLog('UPDATE', `Updated asset '${assetData.name}'`, assetToEdit.id, assetData.name)
            setAssetToEdit(null)
        } else {
            const newId = Math.random().toString(36).substr(2, 9)
            const newAsset: Asset = {
                ...assetData,
                id: newId,
                images: []
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
            />

            <NewAssetModal
                open={isNewModalOpen}
                onClose={() => { setIsNewModalOpen(false); setAssetToEdit(null) }}
                onSave={handleSaveAsset}
                initialData={assetToEdit}
            />

            <TransferAssetModal
                open={isTransferModalOpen}
                onClose={() => setIsTransferModalOpen(false)}
                onConfirm={confirmTransfer}
                asset={assetToTransfer}
                currentBranch={branchName || ''}
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
