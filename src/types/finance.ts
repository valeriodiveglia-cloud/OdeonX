// src/types/finance.ts

export interface FinChartOfAccount {
  id: string
  code: string
  name: string
  simplified_name: string | null
  account_type: 'Asset' | 'Liability' | 'Equity' | 'Operating Revenue' | 'Revenue Deduction' | 'Other Income' | 'Cost of Goods Sold' | 'Selling Expenses' | 'General & Admin Expenses' | 'Payroll' | 'Financial Income' | 'Financial Expenses' | 'Other Expenses' | 'Tax Expenses'
  show_in_pnl: boolean
  show_in_cashflow: boolean
  parent_id: string | null
  is_group: boolean
  simplified_group: string | null
  cashflow_section: 'Operating' | 'Investing' | 'Financing' | 'Exclude'
  sort_order: number
  is_active: boolean
  description: string | null
  created_at: string
}

export interface FinCashflowCategoryMapping {
  id: string
  category_name: string
  cashflow_section: 'Operating' | 'Investing' | 'Financing' | 'Exclude'
  created_at: string
}

export interface FinSupplier {
  id: string
  name: string
  tax_id: string | null
  email: string | null
  phone: string | null
  address: string | null
  payment_terms_days: number
  bank_name: string | null
  bank_account_number: string | null
  notes: string | null
  is_active: boolean
  linked_supplier_id: string | null
  created_at: string
  updated_at: string
}

export interface Supplier {
  id: string
  name: string
  tax_id?: string
}

export interface FinInvoice {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string | null
  supplier_id: string | null
  branch_ids: string[] | null
  account_id: string | null
  description: string | null
  net_amount: number
  vat_rate: number
  vat_amount: number
  gross_amount: number   // computed: net + vat
  currency: string
  exchange_rate: number
  status: 'Pending' | 'In Payment' | 'Paid' | 'Overdue' | 'Cancelled'
  attachment_url: string | null
  payment_order_id: string | null
  paid_date: string | null
  paid_via: string | null
  paid_from_account_id: string | null
  is_personal_deduction: boolean
  custom_supplier_name: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined fields
  suppliers?: Pick<Supplier, 'name' | 'tax_id'>
  fin_chart_of_accounts?: Pick<FinChartOfAccount, 'code' | 'name' | 'simplified_name'>
  // No direct join for provider_branches since we use an array of UUIDs now. We will fetch branch data separately.
}

export interface FinPaymentOrder {
  id: string
  order_number: string
  order_date: string
  total_amount: number
  is_variable_amount: boolean
  is_online_payment: boolean
  vat_invoice_status: 'Issued' | 'Pending' | 'None'
  status: 'Draft' | 'Pending Review' | 'Approved' | 'Paid' | 'Cancelled'
  payment_method: string | null
  bank_account_id: string | null
  paid_date: string | null
  approved_by: string | null
  approved_at: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  destination_account_id?: string | null
  destination_bank_account?: Pick<FinBankAccount, 'account_name' | 'bank_name'> | null
  // Joined
  fin_bank_accounts?: Pick<FinBankAccount, 'account_name' | 'bank_name'> | null
  app_accounts?: { name: string } | null
  fin_payment_order_items?: FinPaymentOrderItem[]
}

export interface FinPaymentOrderItem {
  id: string
  payment_order_id: string
  invoice_id: string | null
  item_type: 'invoice' | 'manual'
  description: string | null
  account_id: string | null
  supplier_id: string | null
  amount: number
  requires_invoice: boolean
  branch_ids: string[] | null
  corporate_card_expense_id?: string | null
  created_at: string
  // Joined
  fin_invoices?: Pick<FinInvoice, 'invoice_number' | 'supplier_id' | 'gross_amount' | 'description'> & {
    suppliers?: Pick<Supplier, 'name'>
  } | null
  fin_chart_of_accounts?: Pick<FinChartOfAccount, 'code' | 'name' | 'simplified_name'> | null
  fin_corporate_card_expenses?: {
    amount: number
    currency: string
    is_variable_amount: boolean
  } | null
}

export interface FinBankAccount {
  id: string
  account_name: string
  bank_name: string | null
  account_number: string | null
  account_type: 'Checking' | 'Saving' | 'Capital' | 'Cash' | 'Wallet'
  currency: string
  opening_balance: number
  current_balance: number
  online_payment_fee?: number
  bank_transfer_fee?: number | null
  fee_account_id?: string | null
  is_active: boolean
  is_corporate_card?: boolean
  is_default_corporate_card?: boolean
  branch_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Joined
  provider_branches?: { name: string } | null
}

export interface FinBankTransaction {
  id: string
  account_id: string
  transaction_date: string
  type: 'Inflow' | 'Outflow' | 'Transfer'
  category: string | null
  description: string | null
  amount: number
  reference_id: string | null
  reference_type: string | null
  counterpart_account_id: string | null
  branch_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  // Joined
  fin_bank_accounts?: Pick<FinBankAccount, 'account_name'> | null
}

// Invoice status colors
export const INVOICE_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  Pending: { bg: 'bg-amber-100', text: 'text-amber-700' },
  'In Payment': { bg: 'bg-blue-100', text: 'text-blue-700' },
  Paid: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  Overdue: { bg: 'bg-red-100', text: 'text-red-700' },
  Cancelled: { bg: 'bg-slate-100', text: 'text-slate-500' },
}

// Payment order status colors
export const PAYMENT_ORDER_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  Draft: { bg: 'bg-slate-100', text: 'text-slate-600' },
  'Pending Review': { bg: 'bg-amber-100', text: 'text-amber-700' },
  Approved: { bg: 'bg-blue-100', text: 'text-blue-700' },
  Paid: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  Cancelled: { bg: 'bg-slate-100', text: 'text-slate-500' },
}

export interface FinCorporateCardExpense {
  id: string
  description: string
  amount: number
  currency: string
  is_variable_amount: boolean
  is_online_payment: boolean
  is_paid: boolean
  frequency: string
  expense_date: string
  account_id: string | null
  bank_account_id: string | null
  supplier_id: string | null
  has_vat_invoice: boolean
  vat_invoice_status: 'Issued' | 'Pending' | 'None'
  invoice_id: string | null
  branch_ids: string[]
  final_amount_vnd?: number | null
  is_projection?: boolean
  created_at: string
  updated_at: string
  // Joined
  fin_chart_of_accounts?: Pick<FinChartOfAccount, 'code' | 'name' | 'simplified_name'> | null
  fin_bank_accounts?: Pick<FinBankAccount, 'account_name' | 'bank_name'> | null
  suppliers?: Pick<{ name: string }, 'name'> | null
  fin_payment_order_items?: Array<{
    id: string
    fin_payment_orders: {
      id: string
      order_number: string
      status: string
    } | null
  }> | null
}

