/** Types partagés de la fiche contact (gabarit B). */

import type { AppActivitySession } from '@/lib/app-activity'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Any = any

export interface CRMProperty {
  name: string
  label: string
  description?: string
  group_name: string
  type: string
  field_type: string
  options?: Array<{ label: string; value: string; displayOrder?: number }>
}

export interface Activity {
  id: number
  hubspot_engagement_id?: string
  activity_type: string
  subject?: string
  body?: string
  direction?: string
  status?: string
  owner_id?: string
  metadata?: Any
  occurred_at: string
  hubspot_deal_id?: string
}

export interface FormSubmission {
  id: number
  form_id: string
  form_title?: string
  form_type?: string
  page_url?: string
  values?: Any
  submitted_at: string
}

export interface Owner {
  hubspot_owner_id: string
  email?: string
  firstname?: string
  lastname?: string
}

export interface CRMTask {
  id: number
  title: string
  description?: string
  owner_id?: string
  status: 'pending' | 'completed' | 'cancelled'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  task_type: string
  due_at?: string
  completed_at?: string
  created_at: string
  hubspot_deal_id?: string
}

export interface EmailStats {
  sent: number
  delivered: number
  opens: number
  clicks: number
  bounces: number
  spam: number
  lastEventAt?: string
  events?: Array<{ type: string; at: string; data?: Any }>
}

export interface SMSLinkClick {
  clicked_at: string
  ip?: string | null
  user_agent?: string | null
}

export interface SMSLink {
  placeholder: string
  label?: string | null
  original_url: string
  click_count: number
  first_clicked_at?: string | null
  last_clicked_at?: string | null
  clicks: SMSLinkClick[]
}

export interface SMSMessage {
  id: string
  campaign_id: string
  phone: string | null
  sent_at: string | null
  created_at: string
  status: string
  rendered_message: string | null
  error_message?: string | null
  segments_count?: number | null
  campaign: { id: string; name: string | null; sender: string | null; campaign_type: string | null } | null
  links: SMSLink[]
  total_clicks: number
}

export interface EmailCampaignLinkClick {
  at: string
  ip?: string | null
  ua?: string | null
}

export interface EmailCampaignLink {
  url: string
  click_count: number
  clicks: EmailCampaignLinkClick[]
}

export interface EmailCampaign {
  id: string
  campaign_id: string | null
  contact_id?: string | null
  email: string | null
  status: string | null
  error_message?: string | null
  sent_at: string | null
  delivered_at: string | null
  first_open_at: string | null
  last_open_at: string | null
  open_count: number
  first_click_at: string | null
  last_click_at: string | null
  click_count: number
  brevo_message_id: string | null
  created_at: string
  campaign: { id: string; name: string | null; subject: string | null; sender_name: string | null; sender_email: string | null } | null
  stats: EmailStats | null
  links: EmailCampaignLink[]
}

export interface PreInscription {
  id: number
  saison: string                      // ex: "2026-2027"
  detected_at: string                 // ISO timestamp
  paiement_status: string | null      // 'en_attente' | 'paye' | 'partiel' | null
  formation: string | null
  montant: number | null
  notes: string | null
  external_data: Record<string, Any>
  updated_at: string
}

export interface ParcoursupVerdict {
  status?: string | null
  label?: string | null
  ratio_pct?: number | null
  formation?: string | null
  manual?: boolean | null
}

export interface ParcoursupQ1 {
  proposition?: string | null
  formations?: string[] | null
  va_valider?: string | null
}

export interface ParcoursupQ3Voeu {
  formation?: string | null
  mineure?: string | null
  rang?: number | null
  rang_dernier_admis?: number | null
}

export interface ParcoursupPayload {
  verdict?: ParcoursupVerdict | null
  voeux_alert?: { flagged?: boolean | null; formations?: string[] | null } | null
  q1?: ParcoursupQ1 | null
  q3?: { voeux?: ParcoursupQ3Voeu[] | null } | null
  updated_at?: string | null
}

export interface ContactDetails {
  contact: Record<string, Any>
  deals: Array<Record<string, Any>>
  appointments: Array<Record<string, Any>>
  properties: CRMProperty[]
  dealProperties: Array<{ name: string; label?: string; options?: Array<{ label: string; value: string }> }>
  groups: Record<string, CRMProperty[]>
  activities: Activity[]
  formSubmissions: FormSubmission[]
  owners: Owner[]
  tasks: CRMTask[]
  emailStatsByMessageId?: Record<string, EmailStats>
  preInscriptions?: PreInscription[]
  /** Télépro / closer des campagnes passées — admins uniquement. */
  assignmentArchive?: Array<Record<string, Any>>
  smsMessages?: SMSMessage[]
  emailCampaigns?: EmailCampaign[]
}

// Parcours web (diploma-tracker.js)
export interface WebActivityClick { at: string; kind: string; text: string | null; href: string | null }
export interface WebActivityPage {
  at: string; left_at: string | null; path: string | null; url: string | null; title: string | null
  seconds: number | null; scroll_pct: number | null; submitted_form: boolean; clicks: WebActivityClick[]
}
export interface WebActivityVisit {
  session_id: string; started_at: string; ended_at: string; device: string | null; referrer: string | null
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null
  click_ids: Record<string, string> | null; total_seconds: number; pages: WebActivityPage[]
}
export interface WebActivity {
  visits: WebActivityVisit[]
  first_touch: { at: string; referrer: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; click_ids: Record<string, string> | null; landing_path: string | null; device: string | null } | null
  totals: { visits: number; page_views: number; seconds: number; last_seen: string | null } | null
}

export type TimelineTab = 'all' | 'note' | 'email' | 'sms' | 'call' | 'task' | 'meeting' | 'app'

export type TimelineItem = {
  id: string
  type: 'note' | 'call' | 'email' | 'sms' | 'meeting' | 'form' | 'rdv' | 'task' | 'web' | 'app'
  timestamp: number
  title: string
  body?: string
  subtitle?: string
  ownerId?: string
  authorLabel?: string | null
  emailStats?: EmailStats
  sendStatus?: string
  sms?: SMSMessage
  emailCampaign?: EmailCampaign
  aircallCallId?: number
  /** Durée de l'appel en secondes (metadata Aircall) */
  callDuration?: number
  isVoicemail?: boolean
  // Renseigné pour les activités natives (crm_activities) → édition/suppression
  activityId?: string
  editable?: boolean
  webVisit?: WebActivityVisit
  appSession?: AppActivitySession
  searchText?: string
}
