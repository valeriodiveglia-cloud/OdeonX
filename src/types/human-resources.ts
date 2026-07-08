export type HiringRequestStatus = 'draft' | 'submitted' | 'in_progress' | 'waiting_manager' | 'on_hold' | 'closed';
export type HiringRequestPriority = 'low' | 'medium' | 'high' | 'urgent';
export type CandidateStage = 'new' | 'screened' | 'interview_scheduled' | 'interviewed' | 'trial_shift' | 'offer_sent' | 'hired' | 'rejected' | 'withdrawn';

export interface HiringRequest {
  id: string;
  created_at: string;
  updated_at: string;
  branch_ids: string[];
  position_title: string;
  department: string;
  status: HiringRequestStatus;
  priority: HiringRequestPriority;
  headcount: number;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  description: string | null;
  requirements: string | null;
  benefits: string | null;
  notes: string | null;
  created_by: string | null;
  employment_type?: string | null;
  closed_at?: string | null;
}

export interface Candidate {
  id: string;
  created_at: string;
  updated_at: string;
  hiring_request_id: string;
  recruitment_posting_id?: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  cv_url: string | null;
  stage: CandidateStage;
  source: string | null;
  notes: string | null;
  interview_scheduled_at?: string | null;
  interview_location?: string | null;
  english_level?: string | null;
  experience_years?: string | null;
  initial_rating?: number | null;
  screening_notes?: string | null;
  interview_rating?: number | null;
  interview_feedback?: string | null;
  interview_answers?: Record<string, string> | null;
  offer_salary_amount?: number | null;
  offer_salary_type?: string | null;
  probation_months?: number | null;
  probation_salary_pct?: number | null;
  offer_start_date?: string | null;
  offer_branch_id?: string | null;
  offer_expiry_date?: string | null;
  rejection_reason?: string | null;
  offer_approval_status?: 'none' | 'pending' | 'approved' | 'rejected' | null;
  offer_approval_notes?: string | null;
  offer_approval_by?: string | null;
  offer_approval_at?: string | null;
  related_staff_id?: string | null;
  document_type?: 'id_card' | 'passport' | null;
  document_number?: string | null;
  application_count?: number;
  rehire_eligible?: boolean | null;
}

export interface HRActivityLog {
  id: string;
  created_at: string;
  hiring_request_id: string;
  actor_id: string | null;
  action_type: string;
  message: string | null;
  payload: any; // JSONB
}

export type PostingStatus = 'active' | 'paused' | 'expired' | 'removed' | 'archived';

export interface RecruitmentPosting {
  id: string;
  created_at: string;
  hiring_request_id: string;
  platform: string;
  platform_url: string | null;
  posted_by: string | null;
  posted_at: string;
  status: PostingStatus;
  notes: string | null;
  responses_count: number;
  expires_at?: string | null;
  package_id: string | null;
  direct_cost: number;
  currency: string;
  package_name: string | null;
  hired_count: number;
}

export interface RecruitmentPlatform {
  id: string;
  value: string;
  label: string;
  icon: string;
  color_bg: string;
  color_text: string;
  sort_order: number;
  created_at: string;
  has_packages: boolean;
}

export interface RecruitmentPlatformPackage {
  id: string;
  platform: string;
  name: string;
  total_cost: number;
  currency: string;
  start_date: string;
  end_date: string | null;
  max_posts: number | null;
  notes: string | null;
  created_at: string;
  postings_count?: number;
}

export interface RecruitmentJobTemplate {
  id: string;
  position_title: string;
  department: string;
  description: string;
  created_at: string;
  employment_type: string;
}


// ── HR Management ──

export type EmploymentType = 'full_time' | 'part_time' | 'outsourced';
export type SalaryType = 'fixed' | 'hourly';
export type StaffStatus = 'active' | 'inactive' | 'terminated';
export type RatingCategoryScope = 'global' | 'department' | 'position';

export interface HRDepartment {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface HRPosition {
  id: string;
  name: string;
  department_id: string | null;
  sort_order: number;
  created_at: string;
  // Joined
  hr_departments?: HRDepartment;
}

export interface HRRatingCategory {
  id: string;
  label: string;
  label_vi?: string | null;
  scope: RatingCategoryScope;
  scope_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  // Joined
  hr_departments?: HRDepartment;
  hr_positions?: HRPosition;
}

export interface HRReviewPeriod {
  id: string;
  label: string;
  is_active: boolean;
  is_default: boolean;
  target_offset: number;
  sort_order: number;
  created_at: string;
}

export interface HRStaffBranch {
  id: string;
  staff_id: string;
  branch_id: string;
  is_primary: boolean;
  created_at: string;
}

export interface HRStaffMember {
  id: string;
  full_name: string;
  position: string;
  department: string | null;
  department_id: string | null;
  position_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  employment_type: EmploymentType;
  salary_type: SalaryType;
  salary_amount: number;
  start_date: string | null;
  status: StaffStatus;
  notes: string | null;
  skill_level: number;
  probation_months: number;
  probation_salary_pct: number;
  probation_end_date: string | null;
  contract_doc_url: string | null;
  cv_doc_url: string | null;
  id_card_doc_url: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  bank_same_as_staff: boolean;
  portal_password_hash?: string | null;
  document_type?: 'id_card' | 'passport' | null;
  document_number?: string | null;
  application_count?: number;
  staff_code?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  marital_status?: string | null;
  bank_branch?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_phone?: string | null;
  document_issue_date?: string | null;
  document_issue_place?: string | null;
  rehire_eligible?: boolean | null;
  created_at: string;
  updated_at: string;
  // Joined
  hr_staff_branches?: HRStaffBranch[];
  hr_departments?: HRDepartment;
  hr_positions?: HRPosition;
  hr_staff_contracts?: HRStaffContract[];
  hr_staff_assets?: HRStaffAsset[];
}

export interface HRStaffContract {
    id: string;
    staff_id: string;
    version: number;
    signing_date: string | null;
    expiration_date: string | null;
    basic_salary: number | null;
    uniforms_allowance: number | null;
    lunch_allowance: number | null;
    phone_allowance: number | null;
    fuel_allowance: number | null;
    home_support_allowance: number | null;
    notes: string | null;
    created_at?: string;
    updated_at?: string;
}

export type PerformanceRating = 1 | 2 | 3 | 4 | 5;

export interface HRStaffPerformance {
  id: string;
  staff_id: string;
  reviewer_id?: string | null;
  assigned_reviewer_id?: string | null;
  review_date: string;
  reviewer_name: string | null;
  period: string | null;
  rating: PerformanceRating;
  category_ratings: Record<string, number>;
  strengths: string | null;
  improvements: string | null;
  goals: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  hr_staff?: HRStaffMember;
}

export interface HRDisciplinaryCategory {
    id: string
    name: string
    created_at?: string
}

export type AlertScope = 'global' | 'department' | 'position'
export type AlertTargetField = 'start_date' | 'probation_end_date' | 'contract_expiration_date' | 'contract_signing_date' | 'last_status_change'

export interface HRAlertSetting {
    id: string;
    label: string;
    target_field: AlertTargetField;
    deactivate_trigger: AlertTargetField | null;
    condition_type: 'before' | 'after';
    days: number | null;
    scope: AlertScope;
    scope_id: string | null;
    created_at?: string;
}

export interface HRDisciplinaryCatalog {
  id: string;
  infraction_name: string;
  default_amount: number;
  category_id: string | null;
  applicability_type: 'global' | 'department' | 'position';
  target_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  category?: HRDisciplinaryCategory | null;
  hr_departments?: HRDepartment | null;
  hr_positions?: HRPosition | null;
}

export type FineStatus = 'pending' | 'paid' | 'waived' | 'disputed';

export interface HRStaffFine {
  id: string;
  staff_id: string;
  date: string;
  infraction: string;
  amount: number;
  notified_by: string | null;
  deduction_source: string | null;
  status: FineStatus;
  created_at: string;
  updated_at: string;
  // Joined
  hr_staff?: HRStaffMember;
}

export interface HRAwardsCatalog {
  id: string;
  award_name: string;
  default_amount: number;
  applicability_type: 'global' | 'department' | 'position';
  target_id: string | null;
  category_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  category?: HRDisciplinaryCategory | null;
  hr_departments?: HRDepartment | null;
  hr_positions?: HRPosition | null;
}

export interface HRStaffAward {
  id: string;
  staff_id: string;
  date: string;
  award_name: string;
  amount: number;
  notified_by: string | null;
  deduction_source: string | null;
  status: FineStatus;
  created_at: string;
  updated_at: string;
  // Joined
  hr_staff?: HRStaffMember;
}

export type WarningFlagType = 'green' | 'yellow' | 'red';

export interface HRStaffWarning {
  id: string;
  staff_id: string;
  date: string;
  flag_type: WarningFlagType;
  reason: string;
  notified_by: string | null;
  is_converted?: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  hr_staff?: HRStaffMember;
}

export interface HRFlagRule {
  id: string;
  yellow_limit: number;
  green_limit: number;
  award_catalog_id: string | null;
  created_at: string;
  updated_at: string;
}


export interface HRStaffSalaryHistory {
  id: string;
  staff_id: string;
  effective_date: string;
  previous_amount: number;
  new_amount: number;
  salary_type: SalaryType;
  reason: string | null;
  approved_by: string | null;
  notes: string | null;
  created_at: string;
  
  // New Columns for Promotions
  record_type: 'salary_increase' | 'promotion' | 'resignation' | 'dismissal' | 'rejection';
  increase_type: 'percentage' | 'fixed' | 'none' | null;
  increase_value: number | null;
  previous_salary_type: SalaryType | null;
  previous_employment_type: EmploymentType | null;
  employment_type: EmploymentType | null;
  previous_position_id: string | null;
  new_position_id: string | null;
  previous_department_id: string | null;
  new_department_id: string | null;

  // Joined
  hr_staff?: HRStaffMember;
  previous_position?: { name: string };
  new_position?: { name: string };
  previous_department?: { name: string };
  new_department?: { name: string };
}

export interface HRStaffRoleHistory {
  id: string;
  staff_id: string;
  effective_date: string;
  old_position_id: string | null;
  new_position_id: string | null;
  old_department_id: string | null;
  new_department_id: string | null;
  reason: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  hr_staff?: HRStaffMember;
  old_position?: HRPosition;
  new_position?: HRPosition;
  old_department?: HRDepartment;
  new_department?: HRDepartment;
}
export interface HRStaffAttendanceMonthly {
  id: string;
  staff_id: string;
  month_id: string;
  lates_count: number;
  lates_minutes: number;
  no_shows_count: number;
  annual_leaves: number;
  sick_leaves: number;
  unpaid_leaves: number;
  other_leaves: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  hr_staff?: HRStaffMember;
}

export interface HRStaffOvertime {
  id: string;
  staff_id: string;
  date: string;
  hours: number;
  reason: string;
  compensation_type: 'salary' | 'annual_leave';
  is_public_holiday: boolean;
  created_at: string;
  hr_staff?: HRStaffMember;
}

export interface HRServiceCharge {
  month_id: string;
  city: string;
  total_amount: number;
  created_at: string;
  updated_at: string;
}

export interface HRServiceChargeStaff {
  id: string;
  month_id: string;
  city: string;
  staff_id: string;
  hours_worked: number;
  created_at: string;
  updated_at: string;
}

export type DocumentCategory = 'CV' | 'ID Card' | 'Contract' | 'Medical' | 'Certification' | 'Other';

export interface HRStaffDocument {
  id: string;
  staff_id: string;
  document_name: string;
  document_category: DocumentCategory | string;
  file_url: string;
  uploaded_at: string;
  uploaded_by: string | null;
  tags: string[];
}

export type HRStaffAssetStatus = 'assigned' | 'returned' | 'damaged' | 'lost';

export interface HRStaffAssetHistory {
  id: string;
  asset_id: string;
  status: HRStaffAssetStatus;
  changed_at: string;
  notes: string | null;
  created_at?: string;
}

export interface HRStaffAsset {
  id: string;
  staff_id: string;
  asset_name: string;
  category: string | null;
  serial_number: string | null;
  quantity: number;
  assigned_date: string;
  return_date: string | null;
  status: HRStaffAssetStatus;
  notes: string | null;
  initial_condition?: string | null;
  return_condition?: string | null;
  created_at?: string;
  updated_at?: string;
  hr_staff_asset_history?: HRStaffAssetHistory[];
}

export interface InterviewQuestion {
    id: string;
    text_en: string;
    text_vi: string;
    type: 'text' | 'yes_no';
}

export interface InterviewTemplateSection {
    id: string;
    name_en: string;
    name_vi: string;
    questions: InterviewQuestion[];
}

export interface HRInterviewTemplate {
    id: string;
    name: string;
    department?: string | null;
    position_title?: string | null;
    employment_type?: string | null;
    is_default: boolean;
    sections: InterviewTemplateSection[];
    created_at?: string;
    updated_at?: string;
}
