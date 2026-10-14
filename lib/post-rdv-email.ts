/**
 * lib/post-rdv-email.ts
 *
 * Mail post-RDV (brochure + lien d'inscription) envoyé par le closer depuis la
 * fiche RDV : rdv_appointments.post_rdv_email_sent_at (migration v82) alimente
 * la pastille « Mail post-RDV envoyé » de l'agenda.
 *
 * Tolérant tant que la migration v82 n'est pas appliquée : la colonne absente
 * fait juste disparaître la pastille, sans casser l'agenda ni l'envoi.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Catégorie du modèle (email_templates.category) pré-sélectionné pour ce mail. */
export const POST_RDV_TEMPLATE_CATEGORY = 'apres-rdv'
/** Élève de Terminale, ancien modèle PASS 2027-2028 (toujours au choix dans la liste). */
export const POST_RDV_TERMINALE_TEMPLATE_CATEGORY = 'apres-rdv-terminale'

/**
 * Modèle selon la classe de l'élève et la formation visée :
 *   Seconde   → Première Élite (événements exclusifs + aperçu Première Élite Lite)
 *   Première  → Terminale Santé (Première Élite Lite)
 *   Terminale → PAES si c'est la formation visée, sinon Licence Portail Santé
 *               (Terminale Santé Light + coach Parcoursup + événements)
 *   autre     → modèle général
 */
export function postRdvTemplateCategory(classeActuelle?: string | null, formation?: string | null): string {
  const classe = (classeActuelle || '').trim().toLowerCase()
  if (/^seconde/.test(classe)) return 'apres-rdv-premiere-elite'
  if (/^premi[eè]re/.test(classe)) return 'apres-rdv-terminale-sante'
  if (/^terminale/.test(classe)) return /paes/i.test(formation || '') ? 'apres-rdv-paes' : 'apres-rdv-lps'
  return POST_RDV_TEMPLATE_CATEGORY
}

/** Ajoute post_rdv_email_sent_at aux RDV listés (requête à part, par paquets). */
export async function attachPostRdvEmailSentAt<T extends { id: string }>(
  db: SupabaseClient,
  rows: T[],
): Promise<Array<T & { post_rdv_email_sent_at?: string | null }>> {
  if (rows.length === 0) return rows
  const sentAt = new Map<string, string | null>()
  const ids = rows.map(r => r.id)
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await db
      .from('rdv_appointments')
      .select('id, post_rdv_email_sent_at')
      .in('id', ids.slice(i, i + 150))
    if (error || !data) return rows // colonne pas encore créée
    for (const r of data as Array<{ id: string; post_rdv_email_sent_at: string | null }>) {
      sentAt.set(r.id, r.post_rdv_email_sent_at)
    }
  }
  return rows.map(r => ({ ...r, post_rdv_email_sent_at: sentAt.get(r.id) ?? null }))
}

/** Marque le mail post-RDV comme envoyé (sans effet si la colonne n'existe pas encore). */
export async function markPostRdvEmailSent(db: SupabaseClient, appointmentId: string): Promise<string | null> {
  const now = new Date().toISOString()
  const { error } = await db
    .from('rdv_appointments')
    .update({ post_rdv_email_sent_at: now })
    .eq('id', appointmentId)
  if (error) {
    console.error('[post-rdv-email] post_rdv_email_sent_at non enregistré (migration v82 ?) :', error.message)
    return null
  }
  return now
}
