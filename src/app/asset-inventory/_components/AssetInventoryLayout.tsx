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
import AssetActivityLogModal from './AssetActivityLogModal'
import { supabase } from '@/lib/supabase_shim'

export default function AssetInventoryLayout() {
    const searchParams = useSearchParams()
    const branchName = searchParams.get('branchName') || 'all'

    // Assets States
    const [allAssets, setAllAssets] = useState<Asset[]>([])
    const [assets, setAssets] = useState<Asset[]>([])

    // Log State
    const [logs, setLogs] = useState<AssetLogEntry[]>([])
    const [isLogOpen, setIsLogOpen] = useState(false)

    // UI States
    const [isNewModalOpen, setIsNewModalOpen] = useState(false)
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
    const [assetToEdit, setAssetToEdit] = useState<Asset | null>(null)

    // Transfer States
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)
    const [assetToTransfer, setAssetToTransfer] = useState<Asset | null>(null)

    // User State
    const [currentUser, setCurrentUser] = useState<string>('')
    const [userRole, setUserRole] = useState<string | null>(null)

    // Load initial state from Supabase
    const fetchAssets = async () => {
        try {
            const { data, error } = await supabase
                .from('assets')
                .select('*')
                .order('name', { ascending: true })
            if (error) throw error
            
            const mapped: Asset[] = (data || []).map((row: any) => ({
                id: row.id,
                name: row.name,
                sku: row.sku,
                category: row.category,
                branch: row.branch,
                location: row.location,
                type: row.type,
                status: row.status,
                condition: row.condition,
                quantity: row.quantity,
                parLevel: row.par_level,
                serialNumber: row.serial_number,
                images: row.images || [],
                financials: {
                    purchasePrice: row.financials?.purchasePrice || 0,
                    purchaseDate: row.financials?.purchaseDate || '',
                    usefulLifeYears: row.financials?.usefulLifeYears || 1,
                    salvageValue: row.financials?.salvageValue,
                    warrantyYears: row.financials?.warrantyYears
                },
                targetBranch: row.target_branch,
                transferDate: row.transfer_date,
                transferBy: row.transfer_by,
                cateringEvent: row.catering_event
            }))
            setAllAssets(mapped)
        } catch (err) {
            console.error('Error loading assets:', err)
        }
    }

    const fetchLogs = async () => {
        try {
            const { data, error } = await supabase
                .from('asset_logs')
                .select('*')
                .order('timestamp', { ascending: false })
            if (error) throw error
            
            const mapped: AssetLogEntry[] = (data || []).map((row: any) => ({
                id: row.id,
                timestamp: row.timestamp,
                action: row.action,
                details: row.details,
                user: row.user,
                assetId: row.asset_id,
                assetName: row.asset_name
            }))
            setLogs(mapped)
        } catch (err) {
            console.error('Error loading asset logs:', err)
        }
    }

    useEffect(() => {
        fetchAssets()
        fetchLogs()
    }, [])

    // Ascolta gli eventi di ricezione asset per aggiornare in tempo reale
    useEffect(() => {
        const handleAssetReceived = () => {
            fetchAssets()
            fetchLogs()
        }
        window.addEventListener('asset-received', handleAssetReceived)
        return () => window.removeEventListener('asset-received', handleAssetReceived)
    }, [])

    // Fetch current user for transfer tracking
    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data: acc } = await supabase
                    .from('app_accounts')
                    .select('name')
                    .eq('user_id', user.id)
                    .single()
                setCurrentUser(acc?.name || user.email || 'Staff')
            }
        }
        getUser()
    }, [])

    useEffect(() => {
        const fetchRole = async () => {
            const { data: user } = await supabase.auth.getUser()
            if (user?.user) {
                const { data } = await supabase
                    .from('app_accounts')
                    .select('role')
                    .eq('user_id', user.user.id)
                    .single()
                setUserRole(data?.role || 'staff')
            }
        }
        fetchRole()
    }, [])

    const [activeTab, setActiveTab] = useState<'all' | 'fixed' | 'smallware'>('all')

    // Filter assets when branch or allAssets changes, AND when activeTab changes
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

    const addLog = async (action: LogAction, details: string, assetId?: string, assetName?: string) => {
        try {
            const { error } = await supabase
                .from('asset_logs')
                .insert({
                    action,
                    details,
                    user: currentUser || 'Staff',
                    asset_id: assetId,
                    asset_name: assetName
                })
            if (error) throw error
            fetchLogs()
        } catch (err) {
            console.error('Error writing asset log:', err)
        }
    }

    const handleSaveAsset = async (assetData: Omit<Asset, 'id'>) => {
        try {
            const rowData = {
                name: assetData.name,
                sku: assetData.sku,
                category: assetData.category,
                branch: assetData.branch,
                location: assetData.location,
                type: assetData.type,
                status: assetData.status,
                condition: assetData.condition,
                quantity: assetData.quantity,
                par_level: assetData.parLevel || null,
                serial_number: assetData.serialNumber || null,
                images: assetData.images || [],
                financials: {
                    purchasePrice: assetData.financials.purchasePrice,
                    purchaseDate: assetData.financials.purchaseDate,
                    usefulLifeYears: assetData.financials.usefulLifeYears,
                    salvageValue: assetData.financials.salvageValue,
                    warrantyYears: assetData.financials.warrantyYears
                },
                target_branch: assetData.targetBranch || null,
                transfer_date: assetData.transferDate || null,
                transfer_by: assetData.transferBy || null,
                catering_event: assetData.cateringEvent || null
            }

            if (assetToEdit) {
                const { error } = await supabase
                    .from('assets')
                    .update(rowData)
                    .eq('id', assetToEdit.id)
                
                if (error) throw error
                await addLog('UPDATE', `Updated asset '${assetData.name}'`, assetToEdit.id, assetData.name)
                setAssetToEdit(null)
            } else {
                const newId = Math.random().toString(36).substr(2, 9)
                const { error } = await supabase
                    .from('assets')
                    .insert({
                        ...rowData,
                        id: newId
                    })
                
                if (error) throw error
                await addLog('CREATE', `Created new asset '${assetData.name}'`, newId, assetData.name)
            }
            
            fetchAssets()
            setIsNewModalOpen(false)
        } catch (err) {
            console.error('Error saving asset:', err)
        }
    }

    const handleEditAsset = () => {
        if (selectedAsset) {
            setAssetToEdit(selectedAsset)
            setSelectedAsset(null)
            setIsNewModalOpen(true)
        }
    }

    const handleDeleteAsset = async (id: string) => {
        try {
            const asset = allAssets.find(a => a.id === id)
            const { error } = await supabase
                .from('assets')
                .delete()
                .eq('id', id)
            
            if (error) throw error
            await addLog('DELETE', `Deleted asset '${asset?.name || 'Unknown'}'`, id, asset?.name)
            fetchAssets()
            setSelectedAsset(null)
        } catch (err) {
            console.error('Error deleting asset:', err)
        }
    }

    // Transfer Logic
    const handleTransferClick = (asset: Asset) => {
        setAssetToTransfer(asset)
        setIsTransferModalOpen(true)
    }

    const confirmTransfer = async (targetBranch: string, note?: string) => {
        if (!assetToTransfer) return
        try {
            const transferDateStr = new Date().toISOString().split('T')[0]
            const { error } = await supabase
                .from('assets')
                .update({
                    status: 'in_transit',
                    target_branch: targetBranch,
                    transfer_date: transferDateStr,
                    transfer_by: currentUser || 'Staff'
                })
                .eq('id', assetToTransfer.id)
            
            if (error) throw error
            await addLog('TRANSFER_INIT', `Transferred '${assetToTransfer.name}' to ${targetBranch}`, assetToTransfer.id, assetToTransfer.name)
            
            // Forza l'aggiornamento immediato delle notifiche in TopHeader
            window.dispatchEvent(new CustomEvent('assets-updated'))
            
            fetchAssets()
            setIsTransferModalOpen(false)
            setAssetToTransfer(null)
            setSelectedAsset(null)
        } catch (err) {
            console.error('Error confirming transfer:', err)
        }
    }

    // Catering Logic
    const [isCateringModalOpen, setIsCateringModalOpen] = useState(false)
    const [assetForCatering, setAssetForCatering] = useState<Asset | null>(null)

    const handleCateringClick = (asset: Asset) => {
        if (asset.status === 'out_for_catering') {
            if (confirm(`Mark '${asset.name}' as returned from catering?`)) {
                handleReturnFromCatering(asset)
            }
            return
        }
        setAssetForCatering(asset)
        setIsCateringModalOpen(true)
    }

    const confirmCateringOut = async (details: CateringEvent) => {
        if (!assetForCatering) return
        try {
            const { error } = await supabase
                .from('assets')
                .update({
                    status: 'out_for_catering',
                    catering_event: details
                })
                .eq('id', assetForCatering.id)
            
            if (error) throw error
            await addLog('CATERING_OUT', `Sent '${assetForCatering.name}' from ${assetForCatering.branch} to event: ${details.eventName}`, assetForCatering.id, assetForCatering.name)
            
            fetchAssets()
            setIsCateringModalOpen(false)
            setAssetForCatering(null)
            setSelectedAsset(null)
        } catch (err) {
            console.error('Error confirming catering out:', err)
        }
    }

    const handleReturnFromCatering = async (asset: Asset) => {
        try {
            const { error } = await supabase
                .from('assets')
                .update({
                    status: 'active',
                    catering_event: null
                })
                .eq('id', asset.id)
            
            if (error) throw error
            await addLog('CATERING_RETURN', `Returned '${asset.name}' from catering back to ${asset.branch}`, asset.id, asset.name)
            
            fetchAssets()
            setSelectedAsset(null)
        } catch (err) {
            console.error('Error returning from catering:', err)
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
                userRole={userRole}
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
                userRole={userRole}
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
        </div>
    )
}
