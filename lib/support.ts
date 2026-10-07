export const SUPPORT_BUCKET = 'support-attachments'
export const SUPPORT_MAX_FILE_BYTES = 50 * 1024 * 1024

export type SupportStatus = 'nouveau' | 'en_cours' | 'besoin_infos' | 'validation' | 'fait' | 'pas_fait'
export type SupportPriority = 'basse' | 'normale' | 'urgente'

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  nouveau: 'En attente',
  en_cours: 'En cours',
  besoin_infos: 'Besoin d’infos',
  validation: 'À valider par Aaron',
  fait: 'C’est fait',
  pas_fait: 'Pas fait',
}

export type SupportAttachment = {
  path: string
  name: string
  mime: string
  size: number
  url?: string
}

export type SupportMessage = {
  id: string
  ticket_id: string
  author_type: 'user' | 'agent'
  author_id: string | null
  author_name: string | null
  body: string
  attachments: SupportAttachment[]
  created_at: string
}

export type SupportTicket = {
  id: string
  number: number
  title: string
  author_id: string | null
  author_name: string | null
  author_role: string | null
  page_url: string | null
  priority: SupportPriority
  status: SupportStatus
  claimed_at: string | null
  pr_url: string | null
  resolved_at: string | null
  last_message_at: string
  unread_for_author: boolean
  created_at: string
  updated_at: string
}
