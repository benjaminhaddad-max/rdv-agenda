import type { SupabaseClient } from '@supabase/supabase-js'
import { getBrandCharter, wrapCharterEmailHtml, type BrandCharter } from '@/lib/brand-charter'

export interface EmailBrand {
  id: string
  slug: string
  name: string
  sender_email: string
  sender_name: string
  reply_to: string | null
  website_url: string | null
  logo_url: string | null
  logo_text: string | null
  primary_color: string | null
  secondary_color: string | null
  accent_color: string | null
  background_color: string | null
  text_color: string | null
  font_family: string | null
  footer_html: string | null
  charter_source_url: string | null
  tone: string | null
  brevo_list_id: number | null
  active: boolean
}

export async function getEmailBrand(
  db: SupabaseClient,
  idOrSlug: string,
): Promise<EmailBrand | null> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug)
  let q = db.from('email_brands').select('*')
  q = isUuid ? q.eq('id', idOrSlug) : q.eq('slug', idOrSlug)
  const { data } = await q.maybeSingle()
  return (data as EmailBrand) || null
}

export async function listEmailBrands(db: SupabaseClient): Promise<EmailBrand[]> {
  const { data, error } = await db
    .from('email_brands')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as EmailBrand[]) || []
}

/** Convertit une ligne DB en charte (fallback sur lib/brand-charter.ts) */
export function brandToCharter(brand: EmailBrand): BrandCharter {
  const fromLib = getBrandCharter(brand.slug)
  if (fromLib) {
    return {
      ...fromLib,
      logo_url: brand.logo_url ?? fromLib.logo_url,
      logo_text: brand.logo_text ?? fromLib.logo_text,
    }
  }
  return {
    slug: brand.slug,
    name: brand.name,
    website_url: brand.website_url || '#',
    primary_color: brand.primary_color || '#12314d',
    secondary_color: brand.secondary_color || brand.primary_color || '#12314d',
    accent_color: brand.accent_color || '#0038f0',
    background_color: brand.background_color || '#f6f8fc',
    text_color: brand.text_color || '#222',
    muted_color: '#888',
    font_family: brand.font_family || 'Inter, Arial, sans-serif',
    logo_url: brand.logo_url,
    logo_header_url: null,
    logo_text: brand.logo_text,
    header_style: 'dark',
    cta_style: 'rounded',
    tone: brand.tone || '',
  }
}

/** Enveloppe HTML avec charte marque */
export function wrapBrandEmailHtml(
  brand: Pick<EmailBrand, 'slug' | 'name' | 'primary_color' | 'website_url' | 'footer_html' | 'logo_url' | 'logo_text'>,
  innerHtml: string,
): string {
  const charter = brandToCharter(brand as EmailBrand)
  if (brand.footer_html) {
    return wrapCharterEmailHtml(
      { ...charter, tone: brand.footer_html },
      innerHtml,
    )
  }
  return wrapCharterEmailHtml(charter, innerHtml)
}

export function brandSender(brand: EmailBrand) {
  return {
    email: brand.sender_email,
    name: brand.sender_name,
  }
}
