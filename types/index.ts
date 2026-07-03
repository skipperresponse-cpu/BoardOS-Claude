export type UserRole =
  | 'president'
  | 'secretary'
  | 'treasurer'
  | 'board_member'
  | 'administrator'
  | 'advisor'
  | 'viewer'

export type DocumentCategory =
  | 'Constitution'
  | 'By-laws'
  | 'SOP'
  | 'Policy'
  | 'Board Minutes'
  | 'Board Paper'
  | 'AGM'
  | 'Finance'
  | 'HR'
  | 'Regulatory'
  | 'Grant'
  | 'Correspondence'
  | 'Other'

export type DocumentStatus = 'active' | 'archived' | 'draft'

export type ActionItemStatus = 'Not Started' | 'In Progress' | 'Done' | 'Blocked'

export type MeetingStatus =
  | 'draft'
  | 'agenda_open'
  | 'agenda_locked'
  | 'scheduled'
  | 'held'
  | 'minutes_drafted'
  | 'minutes_approved'
  | 'cancelled'

export type ApprovalStatus = 'open' | 'paused' | 'closed' | 'approved' | 'rejected' | 'archived'

export type VoteOption = 'Approve' | 'Disapprove' | 'Abstain' | 'Request Clarification'

export type ApprovalType = 'simple_majority' | 'two_thirds' | 'unanimous' | 'custom'

export interface Profile {
  id: string
  user_id: string
  full_name: string
  email: string
  role: UserRole
  created_at: string
}

export interface DocumentFolder {
  id: string
  name: string
  is_system: boolean
  created_at: string
  created_by: string | null
  document_count?: number
}

export interface Document {
  id: string
  title: string
  category: DocumentCategory
  description: string | null
  file_path: string
  extracted_text: string | null
  uploaded_by: string | null
  folder_id: string | null
  document_date: string | null
  status: DocumentStatus
  created_at: string
  updated_at: string
  uploader?: { full_name: string; email?: string } | null
  folder?: { id: string; name: string } | null
}

export interface DocumentChunk {
  id: string
  document_id: string
  chunk_text: string
  chunk_index: number
  embedding: number[] | null
  created_at: string
}

export interface Meeting {
  id: string
  title: string
  meeting_date: string
  attendees_json: string[]
  absentees_json: string[]
  agenda_json: AgendaItem[]
  transcript_text: string | null
  draft_minutes: string | null
  final_minutes: string | null
  status: MeetingStatus
  agenda_deadline: string | null
  created_by: string
  created_at: string
  updated_at: string
  creator?: Profile
}

export interface AgendaItem {
  id: string
  title: string
  description?: string
  duration_minutes?: number
}

export interface ActionItem {
  id: string
  meeting_id: string | null
  title: string
  description: string | null
  owner_user_id: string | null
  due_date: string | null
  status: ActionItemStatus
  notes: string | null
  created_at: string
  updated_at: string
  owner?: Profile
  meeting?: Meeting
}

export interface ApprovalItem {
  id: string
  title: string
  summary: string
  proposal_text: string
  linked_documents_json: string[]
  linked_meeting_id: string | null
  voting_deadline: string | null
  approval_type: ApprovalType
  custom_threshold: number | null
  show_individual_votes_to_board: boolean
  status: ApprovalStatus
  created_by: string
  created_at: string
  updated_at: string
  closed_at: string | null
  creator?: Profile
  votes?: ApprovalVote[]
  comments?: ApprovalComment[]
}

export interface ApprovalVote {
  id: string
  approval_item_id: string
  voter_user_id: string
  vote: VoteOption
  reason: string | null
  created_at: string
  updated_at: string
  voter?: Profile
}

export interface ApprovalComment {
  id: string
  approval_item_id: string
  user_id: string
  comment_text: string
  parent_comment_id: string | null
  created_at: string
  updated_at: string
  user?: Profile
  replies?: ApprovalComment[]
}

export interface AIQuery {
  id: string
  user_id: string
  question: string
  answer: string
  confidence: 'high' | 'medium' | 'low' | 'insufficient'
  sources_used: AISource[]
  created_at: string
}

export interface AISource {
  document_id: string
  document_title: string
  chunk_text: string
  relevance_score?: number
}

export interface AuditLog {
  id: string
  user_id: string
  action: string
  resource_type: string
  resource_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}
