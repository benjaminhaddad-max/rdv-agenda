import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase'
import { formatDocumentTitle } from '@/lib/document-title'

export function absoluteTitle(pageLabel: string): Metadata {
  return { title: { absolute: formatDocumentTitle(pageLabel) } }
}

export async function contactPageMetadata(id: string): Promise<Metadata> {
  try {
    const db = createServiceClient()
    const { data } = await db
      .from('crm_contacts')
      .select('firstname, lastname, email')
      .eq('hubspot_contact_id', id)
      .maybeSingle()
    const name =
      [data?.firstname, data?.lastname].filter(Boolean).join(' ')
      || data?.email
      || 'Contact'
    return absoluteTitle(name)
  } catch {
    return absoluteTitle('Contact')
  }
}

export async function eventPageMetadata(id: string): Promise<Metadata> {
  try {
    const db = createServiceClient()
    const { data } = await db.from('events').select('name').eq('id', id).maybeSingle()
    return absoluteTitle(data?.name || 'Événement')
  } catch {
    return absoluteTitle('Événement')
  }
}

export async function dealPageMetadata(id: string): Promise<Metadata> {
  try {
    const db = createServiceClient()
    const { data } = await db.from('crm_deals').select('dealname').eq('hubspot_deal_id', id).maybeSingle()
    return absoluteTitle(data?.dealname || 'Transaction')
  } catch {
    return absoluteTitle('Transaction')
  }
}
