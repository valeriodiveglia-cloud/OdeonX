export interface GoodsReceipt {
  id: string
  receipt_number: string
  location_id: string
  supplier_id: string
  delivery_date: string
  received_by: string | null
  reference_document: 'none' | 'po' | 'invoice' | 'delivery_note'
  reference_number: string | null
  notes: string | null
  status: 'draft' | 'confirmed' | 'cancelled'
  created_by: string | null
  confirmed_by: string | null
  created_at: string
  confirmed_at: string | null
  discount_amount?: number
  // Joins
  location_name?: string
  supplier_name?: string
  received_by_name?: string
  created_by_name?: string
  confirmed_by_name?: string
  items?: GoodsReceiptItem[]
}

export interface GoodsReceiptItem {
  id: string
  receipt_id: string
  material_id: string
  qty_package: number
  qty_partial: number
  qty_base: number
  package_cost: number
  unit_cost: number
  batch_number: string | null
  expiry_date: string | null
  notes: string | null
  vat_rate_percent?: number
  discount_amount?: number
  qty_rejected_package?: number
  qty_rejected_partial?: number
  qty_rejected_base?: number
  qty_returned_after_base?: number
  // Helper
  material_name?: string
  material_brand?: string
  category_name?: string
  uom_base?: string
  packaging_size?: number
}

export interface StorehouseTransfer {
  id: string
  transfer_number: string
  source_location_id: string
  destination_location_id: string
  requested_date: string
  dispatch_date: string | null
  received_date: string | null
  requested_by: string | null
  approved_by: string | null
  dispatched_by: string | null
  received_by: string | null
  notes: string | null
  status: 'draft' | 'submitted' | 'approved' | 'in_transit' | 'partially_received' | 'received' | 'cancelled'
  created_at: string
  // Joins
  source_location_name?: string
  destination_location_name?: string
  source_branch_id?: string | null
  destination_branch_id?: string | null
  creator_branch_id?: string | null
  requested_by_name?: string
  approved_by_name?: string
  dispatched_by_name?: string
  received_by_name?: string
  items?: StorehouseTransferItem[]
}

export interface StorehouseTransferItem {
  id: string
  transfer_id: string
  item_type: 'material' | 'prep'
  item_id: string
  uom_base: string
  qty_requested: number
  qty_dispatched: number
  qty_received: number
  variance: number
  reason: string | null
  notes: string | null
  batch_number: string | null
  expiry_date: string | null
  // Helper
  item_name?: string
  item_brand?: string
  is_package?: boolean
}

export interface StorehouseBatch {
  id: string
  batch_code: string
  item_type: 'material' | 'prep'
  item_id: string
  location_id: string
  production_date: string | null
  receipt_date: string | null
  expiry_date: string | null
  initial_qty: number
  current_qty: number
  uom_base: string
  unit_cost: number
  source_type: 'goods_receipt' | 'production' | 'opening_stock' | 'adjustment' | 'transfer'
  source_id: string | null
  status: 'active' | 'expiring_soon' | 'expired' | 'depleted' | 'blocked'
  created_at: string
  // Helper
  item_name?: string
  location_name?: string
}

export interface WastageSync {
  wastage_entry_id: string
  status: 'synced' | 'pending' | 'failed' | 'reversed'
  error_message: string | null
  movement_id: string | null
  last_sync_at: string
  // Joins from wastage_entries
  date?: string
  time?: string
  wtype?: string
  category_name?: string
  item_name?: string
  unit?: string
  qty?: number
  total_cost_vnd?: number
  reason?: string
  branch_name?: string
}

export interface ReturnNote {
  id: string
  return_number: string
  goods_receipt_id: string
  location_id: string
  supplier_id: string
  return_date: string
  notes: string | null
  created_by: string | null
  created_at: string
  // Joins
  location_name?: string
  supplier_name?: string
  receipt_number?: string
  created_by_name?: string
  items?: ReturnNoteItem[]
}

export interface ReturnNoteItem {
  id: string
  return_note_id: string
  material_id: string
  qty_package: number
  qty_partial: number
  qty_base: number
  unit_cost: number
  notes: string | null
  created_at: string
  // Helper
  material_name?: string
  material_brand?: string
  uom_base?: string
  packaging_size?: number
}
