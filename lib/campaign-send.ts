import type { SupabaseClient } from '@supabase/supabase-js'
import { BREVO_DEFAULT_SENDER } from '@/lib/brevo'
import { getEmailBrand, brandSender } from '@/lib/email-brands'

export interface CampaignSender {
  email: string
  name: string
  reply_to: string | null
}

export async function resolveCampaignSender(
  db: SupabaseClient,
  campaign: {
    brand_id?: string | null
    sender_email?: string | null
    sender_name?: string | null
    reply_to?: string | null
  },
): Promise<CampaignSender> {
  if (campaign.brand_id) {
    const brand = await getEmailBrand(db, campaign.brand_id)
    if (brand?.active) {
      return {
        email: brand.sender_email,
        name: brand.sender_name,
        reply_to: brand.reply_to || brand.sender_email,
      }
    }
  }

  return {
    email: campaign.sender_email || BREVO_DEFAULT_SENDER.email,
    name: campaign.sender_name || BREVO_DEFAULT_SENDER.name,
    reply_to: campaign.reply_to || null,
  }
}

export function brevoSenderFromCampaign(sender: CampaignSender) {
  return { email: sender.email, name: sender.name }
}
