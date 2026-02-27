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
