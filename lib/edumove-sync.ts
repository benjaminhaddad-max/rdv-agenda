/**
 * Synchro plateforme candidature.edumove.fr → CRM. Lancée par /api/cron/edumove-sync.
 *
 * 1. Lit les dossiers (candidatures) et les comptes sans dossier (profiles)
 *    de la base Supabase Edumove.
 * 2. Rattache chaque dossier à sa fiche contact : e-mail (points gmail
 *    ignorés), sinon même téléphone + même nom ; sinon crée la fiche
 *    (edm_c_<id>, origine « Edumove »).
 * 3. Tient crm_edumove_candidatures à jour (étape, statut, choix, suivi par
 *    fac, pièces, notes…) et retire les dossiers supprimés côté Edumove.
 *
 * Le statut du lead n'est PAS modifié : un contact Diploma qui candidate aussi
 * chez Edumove garde son statut ; l'étape Edumove se lit dans la vue
 * « Edumove · Candidatures » et sur la fiche.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { gmailKey, isTestEmail, normEmail, normName, phoneVariants } from '@/lib/inscriptions-sync'
import { edumoveStageOf, type EdumoveStage } from '@/lib/edumove-stage'

const MAX_CREATES = 250

type Row = Record<string, unknown>

export type EdumoveSyncResult = {
  candidatures: number
  comptes_sans_candidature: number
  contacts_matched: number
  contacts_created: number
  rows_upserted: number
  rows_removed: number
  skipped_no_email: number
}

export function edumoveDbConfigured(): boolean {
  return !!process.env.EDUMOVE_SUPABASE_URL && !!process.env.EDUMOVE_SUPABASE_SERVICE_ROLE_KEY
}

/** Client service_role de la base Edumove (serveur uniquement). */
export function edumoveDb(): SupabaseClient {
  return createClient(process.env.EDUMOVE_SUPABASE_URL!, process.env.EDUMOVE_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

async function loadAll(src: SupabaseClient, table: string, select: string): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await src.from(table).select(select).order('created_at', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(`edumove ${table}: ${error.message}`)
    out.push(...((data ?? []) as unknown as Row[]))
    if (!data || data.length < 1000) break
  }
  return out
}

const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v))
const arr = (v: unknown): string[] | null => (Array.isArray(v) ? v.map(String) : null)
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

type Dossier = {
  id: string
  userId: string | null
  stage: EdumoveStage
  email: string
  prenom: string | null
  nom: string | null
  tel: string | null
  createdAt: string | null
  row: Row
}

function mirrorRow(d: Dossier, contactId: string, now: string): Row {
  const c = d.row
  const isCompte = d.stage === 'compte'
  return {
    candidature_id: d.id,
    hubspot_contact_id: contactId,
    edumove_user_id: d.userId,
    stage: d.stage,
    status: isCompte ? null : str(c.status),
    situation_actuelle: isCompte ? null : str(c.situation_actuelle),
    email: d.email,
    prenom: d.prenom,
    nom: d.nom,
    tel: d.tel,
    departement: str(c.departement),
    profil: str(c.profil),
    filieres: isCompte ? null : arr(c.classement_filieres),
    destinations: isCompte ? null : arr(c.classement_destinations),
    uni_selections: isCompte ? null : obj(c.uni_selections),
    uni_tracking: isCompte ? null : obj(c.uni_tracking),
    documents: isCompte ? null : obj(c.documents),
    details: isCompte
      ? { reorientation: c.reorientation ?? null }
      : {
          reorientation: c.reorientation ?? null,
          filiere: c.filiere ?? null,
          filieres_exclues: c.filieres_exclues ?? null,
          destinations_exclues: c.destinations_exclues ?? null,
          destination: c.destination ?? null,
          universite: c.universite ?? null,
          niveau: c.niveau ?? null,
          score: c.score ?? null,
          moyenne_premiere: c.moyenne_premiere ?? null,
          moyenne_terminale: c.moyenne_terminale ?? null,
          notes_premiere: c.notes_premiere ?? null,
          notes_terminale: c.notes_terminale ?? null,
          langues: c.langues ?? null,
          eleves_diploma_sante: c.eleves_diploma_sante ?? null,
          callback_requested: c.callback_requested ?? null,
          callback_requested_at: c.callback_requested_at ?? null,
          uni_selections_at: c.uni_selections_at ?? null,
          docs_confirmed: c.docs_confirmed ?? null,
          response_view_count: c.response_view_count ?? null,
          response_viewed_at: c.response_viewed_at ?? null,
          status_history: Array.isArray(c.status_history) ? (c.status_history as unknown[]).slice(-20) : null,
        },
    candidature_created_at: d.createdAt,
    synced_at: now,
  }
}

export async function runEdumoveSync(crm: SupabaseClient): Promise<EdumoveSyncResult> {
  // Migration v90 appliquée ?
  const probe = await crm.from('crm_edumove_candidatures').select('candidature_id').limit(1)
  if (probe.error) throw new Error(`migration v90 non appliquée : ${probe.error.message}`)

  const src = edumoveDb()
  const candidatures = await loadAll(src, 'candidatures', '*')
  // select('*') : les colonnes de profiles varient selon l'historique de la base Edumove
  const profiles = await loadAll(src, 'profiles', '*')

  let skippedNoEmail = 0
  const dossiers: Dossier[] = []
  const usersWithDossier = new Set<string>()
  for (const c of candidatures) {
    if (c.user_id) usersWithDossier.add(String(c.user_id))
    const email = normEmail(c.email as string)
    if (!email) { skippedNoEmail++; continue }
    if (isTestEmail(email)) continue
    dossiers.push({
      id: String(c.id),
      userId: str(c.user_id),
      stage: edumoveStageOf(c as { status?: string; uni_selections?: Record<string, unknown>; uni_tracking?: Record<string, unknown> }),
      email,
      prenom: str(c.prenom),
      nom: str(c.nom),
      tel: str(c.tel),
      createdAt: str(c.created_at),
      row: c,
    })
  }
  let comptes = 0
  for (const p of profiles) {
    if (usersWithDossier.has(String(p.id))) continue
    const email = normEmail(p.email as string)
    if (!email) { skippedNoEmail++; continue }
    if (isTestEmail(email)) continue
    comptes++
    dossiers.push({
      id: `compte_${p.id}`,
      userId: String(p.id),
      stage: 'compte',
      email,
      prenom: str(p.prenom),
      nom: str(p.nom),
      tel: str(p.tel),
      createdAt: str(p.created_at),
      row: p,
    })
  }

  // 1. Contacts CRM par e-mail
  const contactByEmail = new Map<string, string>()
  const emails = [...new Set(dossiers.map(d => d.email))]
  for (let i = 0; i < emails.length; i += 200) {
    const { data, error } = await crm.from('crm_contacts').select('hubspot_contact_id, email').in('email', emails.slice(i, i + 200))
    if (error) throw new Error(`contacts: ${error.message}`)
    for (const c of data ?? []) {
      const e = normEmail(c.email as string)
      if (e && !contactByEmail.has(gmailKey(e))) contactByEmail.set(gmailKey(e), String(c.hubspot_contact_id))
    }
  }
  const matchedBefore = new Set(contactByEmail.keys())

  // 2. Casse / points gmail, même téléphone + même nom, sinon création
  let created = 0
  let brandColumn = true
  for (const d of dossiers) {
    const key = gmailKey(d.email)
    if (contactByEmail.has(key)) continue
    const { data: loose } = await crm.from('crm_contacts').select('hubspot_contact_id')
      .ilike('email', d.email.replace(/[\\%_]/g, '\\$&')).limit(1)
    if (loose?.length) { contactByEmail.set(key, String(loose[0].hubspot_contact_id)); continue }
    const variants = phoneVariants(d.tel)
    const last = normName(d.nom)
    if (variants.length && last) {
      const { data: byPhone } = await crm.from('crm_contacts').select('hubspot_contact_id, lastname').in('phone', variants).limit(10)
      const hit = (byPhone ?? []).find(c => normName(c.lastname as string) === last)
      if (hit) { contactByEmail.set(key, String(hit.hubspot_contact_id)); continue }
    }
    if (created >= MAX_CREATES) continue
    const id = `edm_c_${d.id}`
    const base = {
      hubspot_contact_id: id,
      email: d.email,
      firstname: d.prenom,
      lastname: d.nom,
      phone: d.tel,
      origine: 'Edumove',
      contact_createdate: d.createdAt,
      synced_at: new Date().toISOString(),
    }
    let { error } = await crm.from('crm_contacts').upsert([brandColumn ? { ...base, brand: 'Edumove' } : base], { onConflict: 'hubspot_contact_id' })
    if (error && brandColumn && /brand/i.test(error.message)) {
      brandColumn = false
      ;({ error } = await crm.from('crm_contacts').upsert([base], { onConflict: 'hubspot_contact_id' }))
    }
    if (error) continue
    contactByEmail.set(key, id)
    created++
  }

  // 3. Copie des dossiers rattachés
  const now = new Date().toISOString()
  const rows: Row[] = []
  for (const d of dossiers) {
    const contactId = contactByEmail.get(gmailKey(d.email))
    if (contactId) rows.push(mirrorRow(d, contactId, now))
  }
  let upserted = 0
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await crm.from('crm_edumove_candidatures').upsert(rows.slice(i, i + 200), { onConflict: 'candidature_id' })
    if (error) throw new Error(`upsert crm_edumove_candidatures: ${error.message}`)
    upserted += Math.min(200, rows.length - i)
  }

  // 4. Dossiers supprimés côté Edumove (ou compte passé en candidature) :
  //    lignes non rafraîchies par ce passage complet. Garde-fou : jamais si
  //    la lecture Edumove est revenue vide (mauvaise base, panne…).
  let removedCount = 0
  if (candidatures.length > 0) {
    const { data: removed, error: delErr } = await crm.from('crm_edumove_candidatures')
      .delete().lt('synced_at', now).select('candidature_id')
    if (delErr) throw new Error(`nettoyage crm_edumove_candidatures: ${delErr.message}`)
    removedCount = removed?.length ?? 0
  }

  const matched = dossiers.filter(d => matchedBefore.has(gmailKey(d.email))).length
  return {
    candidatures: candidatures.length,
    comptes_sans_candidature: comptes,
    contacts_matched: matched,
    contacts_created: created,
    rows_upserted: upserted,
    rows_removed: removedCount,
    skipped_no_email: skippedNoEmail,
  }
}
