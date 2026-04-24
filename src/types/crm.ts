export type CRMPartner = {
  id: string
  created_at: string
  updated_at: string
  name: string
  type: string | null
  contact_name: string | null
  email: string | null
  phone: string | null
  location: string | null
  status: 'Leads' | 'Approached' | 'Waiting for Material' | 'Waiting for Activation' | 'Active' | 'Inactive/Paused' | 'Rejected' | string
  pipeline_stage: 'Leads' | 'Approached' | 'Waiting for Material' | 'Waiting for Activation' | 'Active' | 'Inactive/Paused' | 'Rejected' | string
  owner_id: string | null
  created_by?: string | null
  notes: string | null
  rejection_reason?: string | null
  is_deleted?: boolean
  partner_code: string | null
  partner_password_hash?: string | null
}

export type CRMAgreement = {
  id: string
  created_at: string
  updated_at: string
  partner_id: string
  commission_type: 'Percentage' | 'Fixed' | string
  commission_value: number
  client_discount_type?: 'Percentage' | 'Fixed' | string | null
  client_discount_value?: number | null
  commission_base?: 'Before Discount' | 'After Discount' | string;
  details: string | null
  status: 'Draft' | 'Active' | 'Expired' | string
  valid_until: string | null
}

export type CRMAdvisorAgreement = {
  id: string
  created_at: string
  updated_at: string
  partner_id: string
  commission_type: string
  commission_rules: any
  status: 'Draft' | 'Active' | 'Expired' | string
  valid_until: string | null
  notes: string | null
}

export type CRMReferral = {
  id: string
  created_at: string
  updated_at: string
  partner_id: string
  guest_name: string
  guest_contact: string | null
  arrival_date: string | null
  party_size: number
  status: 'Pending' | 'Validated' | 'Disputed' | 'Cancelled' | string
  revenue_generated: number
  commission_value: number
  advisor_commission_value?: number | null
  validation_notes: string | null
  created_by?: string | null
}

export type CRMInteraction = {
  id: string
  created_at: string
  partner_id: string
  user_id: string | null
  type: 'Note' | 'Email' | 'Call' | 'Meeting' | string
  date: string
  notes: string
}

export type CRMPayout = {
  id: string
  created_at: string
  updated_at: string
  partner_id: string
  period: string
  amount: number
  status: 'Pending' | 'Paid' | string
  payment_date: string | null
  reference_number: string | null
  notes: string | null
}

export type CRMDocument = {
  id: string
  created_at: string
  partner_id: string
  name: string
  file_path: string
  file_type: string
  file_size: number
  uploaded_by: string | null
}

export type CRMTask = {
  id: string
  created_at: string
  updated_at: string
  partner_id: string
  title: string
  description: string | null
  due_date: string | null
  priority: 'Low' | 'Medium' | 'High' | string
  status: 'Pending' | 'In Progress' | 'Completed' | 'Cancelled' | string
  created_by?: string | null
}
