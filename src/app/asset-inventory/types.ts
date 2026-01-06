export type AssetType = 'fixed' | 'smallware'
export type AssetStatus = 'active' | 'maintenance' | 'in_transit' | 'broken' | 'out_for_catering'
export type AssetCondition = 'new' | 'good' | 'fair' | 'poor'

export type AssetFinancials = {
    purchasePrice: number
    purchaseDate: string // ISO date
    usefulLifeYears: number
    salvageValue?: number // Optional: value at end of life
    warrantyYears?: number
}

export type CateringEvent = {
    eventName: string
    customerName?: string
    eventDate: string
    expectedReturnDate?: string
    notes?: string
}

export interface Asset {
    id: string
    name: string
    sku: string
    category: string
    branch: string
    location: string
    type: AssetType
    status: AssetStatus
    condition: AssetCondition
    quantity: number // 1 for fixed, N for smallware
    parLevel?: number // Only for smallware
    serialNumber?: string // Only for fixed
    images?: string[]
    financials: AssetFinancials
    targetBranch?: string // If in_transit, where it's going
    transferDate?: string // ISO date of transfer
    transferBy?: string // Name of staff who initiated transfer
    cateringEvent?: CateringEvent // If out_for_catering
}

// Helper to calculate current value based on straight-line depreciation
// Formula: (Cost - Salvage) * (Remaining Life / Useful Life)
// OR simpler: Cost - ((Cost / Life) * Age)
export function calculateCurrentValue(asset: Asset): number {
    const { purchasePrice, purchaseDate, usefulLifeYears, salvageValue = 0 } = asset.financials

    if (!purchaseDate) return purchasePrice

    const purchaseTs = new Date(purchaseDate).getTime()
    if (isNaN(purchaseTs)) return purchasePrice

    const nowTs = Date.now()
    const ageInMs = nowTs - purchaseTs
    const ageInYears = ageInMs / (1000 * 60 * 60 * 24 * 365.25)

    if (ageInYears >= usefulLifeYears) {
        return salvageValue
    }

    const depreciationPerYear = (purchasePrice - salvageValue) / usefulLifeYears
    const totalDepreciation = depreciationPerYear * ageInYears
    const currentValue = purchasePrice - totalDepreciation

    return Math.max(currentValue, salvageValue)
}

export function getStatusColor(status: AssetStatus): string {
    switch (status) {
        case 'active': return 'bg-emerald-100 text-emerald-800 ring-emerald-600/20'
        case 'maintenance': return 'bg-amber-100 text-amber-800 ring-amber-600/20'
        case 'in_transit': return 'bg-blue-100 text-blue-800 ring-blue-600/20'
        case 'broken': return 'bg-red-100 text-red-800 ring-red-600/20'
        case 'out_for_catering': return 'bg-purple-100 text-purple-800 ring-purple-600/20'
    }
}

export function getConditionColor(condition: AssetCondition): string {
    switch (condition) {
        case 'new': return 'bg-emerald-500'
        case 'good': return 'bg-blue-500'
        case 'fair': return 'bg-yellow-500'
        case 'poor': return 'bg-red-500'
    }
}

// Helper to compute effective condition (New -> Good autocycle)
export function getComputedCondition(asset: Asset, newDurationMonths: number): AssetCondition {
    if (asset.condition !== 'new' || !asset.financials.purchaseDate) return asset.condition

    const purchaseTs = new Date(asset.financials.purchaseDate).getTime()
    const nowTs = Date.now()
    const ageInMonths = (nowTs - purchaseTs) / (1000 * 60 * 60 * 24 * 30.44)

    if (ageInMonths > newDurationMonths) {
        return 'good'
    }

    return 'new'
}

export function getWarrantyStatus(asset: Asset): { status: 'Valid' | 'Expired' | 'None', label: string, color: string } {
    if (!asset.financials.warrantyYears || asset.financials.warrantyYears <= 0) {
        return { status: 'None', label: '-', color: 'text-gray-400' }
    }

    const purchaseDate = new Date(asset.financials.purchaseDate)
    const warrantyEnd = new Date(purchaseDate)
    warrantyEnd.setFullYear(purchaseDate.getFullYear() + asset.financials.warrantyYears)

    const now = new Date()

    if (now > warrantyEnd) {
        return { status: 'Expired', label: 'Expired', color: 'text-red-600 bg-red-50 ring-red-500/10' }
    } else {
        return { status: 'Valid', label: 'In Warranty', color: 'text-emerald-700 bg-emerald-50 ring-emerald-600/20' }
    }
}

export type LogAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'TRANSFER_INIT' | 'TRANSFER_RECEIVE' | 'CATERING_OUT' | 'CATERING_RETURN'

export interface AssetLogEntry {
    id: string
    timestamp: string // ISO
    action: LogAction
    details: string
    user: string
    assetId?: string
    assetName?: string
}

export interface InventorySessionItem {
    assetId: string
    assetName: string
    category: string
    expectedQuantity: number
    countedQuantity: number
    systemStatus: AssetStatus
    condition: AssetCondition
    notes?: string
}

export type InventorySessionStatus = 'open' | 'completed'

export interface InventorySession {
    id: string
    date: string // ISO
    branch: string
    assetType: AssetType
    status: InventorySessionStatus
    items: InventorySessionItem[]
    createdBy: string // User who started it
    submittedBy?: string // User who finished it
    submittedAt?: string // ISO
    totalDiscrepancyCost?: number
}
