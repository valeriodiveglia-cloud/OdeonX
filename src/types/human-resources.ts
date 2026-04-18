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
}

export interface Candidate {
  id: string;
  created_at: string;
  updated_at: string;
  hiring_request_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  cv_url: string | null;
  stage: CandidateStage;
  source: string | null;
  notes: string | null;
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

export type PostingStatus = 'active' | 'paused' | 'expired' | 'removed';

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
}

// ── HR Management ──

export type EmploymentType = 'full_time' | 'part_time';
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
  employment_type: EmploymentType;
  salary_type: SalaryType;
  salary_amount: number;
  start_date: string | null;
  status: StaffStatus;
  notes: string | null;
  contract_signing_date: string | null;
  probation_end_date: string | null;
  contract_expiration_date: string | null;
  contract_doc_url: string | null;
  cv_doc_url: string | null;
  id_card_doc_url: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  hr_staff_branches?: HRStaffBranch[];
  hr_departments?: HRDepartment;
  hr_positions?: HRPosition;
}

export type PerformanceRating = 1 | 2 | 3 | 4 | 5;

export interface HRStaffPerformance {
  id: string;
  staff_id: string;
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
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface HRDisciplinaryCatalog {
  id: string;
  infraction_name: string;
  default_amount: number;
  category_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  category?: HRDisciplinaryCategory | null;
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
  // Joined
  hr_staff?: HRStaffMember;
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
