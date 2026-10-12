/**
 * Crée dans l'onglet Événements (base Events) les JPO / présentiels / webinaires
 * du planning Créas Ads (ads_campaigns) qui n'y existent pas encore, puis rattache
 * chaque campagne à son événement (event_id) — mêmes réglages que la création
 * depuis l'onglet Événements : textes email/SMS par défaut + formulaire CRM lié.
 *
 * Événements créés en brouillon (aucun envoi). Webinaires : lien Zoom à ajouter.
 *
 * Usage : bun --env-file=.env.local scripts/create-events-from-ads-campaigns.ts [--apply]
 */
import { createServiceClient } from '@/lib/supabase'
import { createEventsClient } from '@/lib/events-studio/client'
import { BRAND_CONFIG, EVENT_TYPES, type EventBrand, type EventTypeId } from '@/lib/events-studio/config'
import { buildDefaultCustomEmails, buildDefaultCustomSms } from '@/lib/events-studio/comms-defaults'
import { createCrmFormForEvent } from '@/lib/events-studio/create-crm-form'
import { parisDay } from '@/lib/ads-creatives'

const APPLY = process.argv.includes('--apply')
const crm = createServiceClient()
const events = createEventsClient()
const today = parisDay()

/** Lieu déduit du planning (titre / géo) ; sinon à confirmer. */
function locationOf(title: string, geo: string | null): string | null {
  const t = `${title} ${geo || ''}`.toLowerCase()
  if (/assas/.test(t)) return "39 rue d'Assas, 75006 Paris"
  if (/lauriston|campus 16/.test(t)) return '29 rue Lauriston, 75016 Paris'
  if (/rap[ée]e/.test(t)) return '100 quai de la Rapee, 75012 Paris'
  return null
}

/** « Mer. 19h00 » → 19:00 ; défaut par type. */
function timesOf(eventTime: string | null, type: EventTypeId): [string, string] {
  const m = (eventTime || '').match(/(\d{1,2})\s*h\s*(\d{2})?/i)
  if (m) {
    const h = Number(m[1])
    const mm = m[2] || '00'
    return [`${String(h).padStart(2, '0')}:${mm}`, `${String(h + 1).padStart(2, '0')}:${mm}`]
  }
  return type === 'webinaire' ? ['18:30', '19:30'] : ['10:00', '18:00']
}

/** Heure de Paris → ISO avec décalage (heure d'été / hiver). */
function parisIso(day: string, time: string): string {
  const probe = new Date(`${day}T12:00:00Z`)
  const parisNoon = Number(probe.toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }))
  const off = parisNoon - 12
  return `${day}T${time}:00+0${off}:00`
}

const articleOf = (title: string, type: EventTypeId) =>
  type === 'webinaire' ? EVENT_TYPES.webinaire.article : /^(forum|salon)/i.test(title) ? 'le' : 'la'

const { data: campaigns, error } = await crm
  .from('ads_campaigns')
  .select('*')
  .eq('kind', 'event')
  .is('event_id', null)
  .gte('event_date', today)
  .order('event_date')
if (error) throw error

const todo = (campaigns || []).filter((c) => !c.no_campaign && c.status !== 'Annulé' && ['webinaire', 'jpo', 'presentiel'].includes(c.event_type))
console.log(`${todo.length} campagne(s) sans événement${APPLY ? '' : ' — simulation (--apply pour créer)'}\n`)

for (const c of todo) {
  const brand = c.brand as EventBrand
  const type: EventTypeId = c.event_type === 'webinaire' ? 'webinaire' : 'jpo'
  const [start, end] = timesOf(c.event_time, type)
  const location = type === 'webinaire' ? 'Visioconference' : c.location || locationOf(c.title, c.geo) || 'Lieu à confirmer'
  const eventDate = parisIso(c.event_date, start)

  // Déjà créé à la main (même marque, même jour, même type, même nom) ? On rattache.
  const { data: same } = await events.from('events').select('id, name, event_type')
    .eq('brand', brand).gte('event_date', `${c.event_date}T00:00:00+02:00`).lte('event_date', `${c.event_date}T23:59:59+01:00`)
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim()
  const existing = (same || []).find((e) => (e.event_type || 'jpo') === type && norm(e.name) === norm(c.title))

  console.log(`${c.event_date} ${start}-${end} · ${brand} · ${type}${c.event_type === 'presentiel' ? ' (présentiel)' : ''} · ${c.title}${type !== 'webinaire' ? ` · ${location}` : ''}${existing ? `  → déjà dans Événements (${existing.name}), rattachement` : ''}`)
  if (!APPLY) continue

  let eventId = existing?.id as string | undefined
  if (!eventId) {
    const brandCfg = BRAND_CONFIG[brand] || BRAND_CONFIG.diploma
    const article = articleOf(c.title, type)
    const commsEv = { name: c.title, article, event_date: eventDate, event_time_end: end, location, zoom_join_url: null, event_type: type, brand }
    const { data: ev, error: evError } = await events.from('events').insert({
      name: c.title,
      article,
      description: null,
      brief: null,
      event_date: eventDate,
      event_time_end: end,
      location,
      max_capacity: null,
      status: 'draft',
      hubspot_property_name: null,
      sms_factor_enabled: true,
      sms_sender: brand === 'edumove' ? 'EDUMOVE' : brand === 'medibox' ? 'MEDIBOX' : 'DIPLOMA',
      sms_push_type: 1,
      sms_stop: false,
      zoom_join_url: null,
      custom_sms: buildDefaultCustomSms(commsEv),
      custom_emails: buildDefaultCustomEmails(commsEv),
      brand,
      event_type: type,
    }).select('id').single()
    if (evError) { console.error('   ✗', evError.message); continue }
    eventId = ev.id

    const [y, m, d] = c.event_date.split('-')
    const formName = `${c.title} — ${d}/${m}/${y}`
    try {
      const form = await createCrmFormForEvent({ name: formName, title: formName, brand, folder: brandCfg.folder, template: 'event', extra_crm_fields: [], status: 'published' })
      const { error: linkError } = await events.from('event_forms').insert({ event_id: eventId, hubspot_form_id: form.id, form_name: form.name || formName, form_type: 'crm' })
      console.log(`   ✓ créé · formulaire ${form.public_url}${linkError ? ` (liaison : ${linkError.message})` : ''}`)
    } catch (e) {
      console.log(`   ✓ créé · ⚠ formulaire : ${e instanceof Error ? e.message : e}`)
    }
  }

  const { error: upError } = await crm.from('ads_campaigns').update({
    event_id: eventId,
    location: type === 'webinaire' ? null : location === 'Lieu à confirmer' ? null : location,
    updated_at: new Date().toISOString(),
  }).eq('id', c.id)
  if (upError) console.error('   ✗ rattachement :', upError.message)
}
