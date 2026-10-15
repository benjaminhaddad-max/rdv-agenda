import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'

/**
 * GET /api/crm/contacts/[id]/edumove
 *
 * Dossiers de la plateforme candidature.edumove.fr rattachés au contact
 * (copie crm_edumove_candidatures, synchro lib/edumove-sync.ts).
 */

/** Pièces : uniquement des liens https vers le stockage Supabase Edumove
 *  (le champ est écrit par l'étudiant : pas de lien arbitraire dans le CRM). */
function safeDocuments(docs: unknown): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {}
  if (!docs || typeof docs !== 'object' || Array.isArray(docs)) return out
  const host = (() => {
    try { return new URL(process.env.EDUMOVE_SUPABASE_URL || '').host } catch { return '' }
  })()
  for (const [k, v] of Object.entries(docs as Record<string, unknown>)) {
    if (typeof v === 'boolean') { out[k] = v; continue }
    if (typeof v !== 'string') continue
    try {
      const u = new URL(v)
      if (u.protocol === 'https:' && (!host || u.host === host)) out[k] = u.toString()
    } catch { /* lien invalide ignoré */ }
  }
  return out
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getApiUserContext())) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id: contactId } = await params
  const db = createServiceClient()
  const { data, error } = await db
    .from('crm_edumove_candidatures')
    .select('*')
    .eq('hubspot_contact_id', contactId)
    .order('candidature_created_at', { ascending: false })
  // Migration v90 pas encore appliquée : pas de bloc plutôt qu'une erreur
  if (error) return NextResponse.json({ dossiers: [] })
  const dossiers = (data ?? []).map(d => ({ ...d, documents: safeDocuments(d.documents) }))
  return NextResponse.json({ dossiers })
}
