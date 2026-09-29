import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { PIPELINES } from '@/lib/crm-stages'
import {
  isPodcastProfileType,
  isPodcastSource,
  type PodcastCandidate,
  type PodcastCastingRow,
} from '@/lib/podcast-casting'

// Saisons terminées : les élèves ont vécu leur P1 et ont du recul pour raconter.
// (2026-2027 = saison en cours, exclue.)
const PAST_PIPELINES = ['55039960', '322737657', '1329267902']
// Leads non inscrits : seulement les saisons assez anciennes pour qu'ils aient fait leur P1 ailleurs.
const SANS_PREPA_PIPELINES = ['55039960', '322737657']

function stageIdByLabel(pipelineId: string, label: string): string | null {
  return PIPELINES[pipelineId]?.stages.find(s => s.label === label)?.id ?? null
}

const CONTACT_COLS = [
  'hubspot_contact_id', 'firstname', 'lastname', 'phone', 'email', 'departement',
  'contact_de_test', 'fin_s1__recommandation_du_coach', 'fin_s1__points_positifs_coaching',
  'as_tu_deja_ete_etudiant_en_pass_ou_las__', 'diploma_selected_faculty',
  'diploma_guardian1_first_name', 'diploma_guardian1_last_name', 'diploma_guardian1_phone', 'diploma_guardian1_email',
  'responsable_legal___prenom', 'responsable_legal___nom', 'responsable_legal___telephone', 'responsable_legal___email',
  'nom_parents', 'numero_de_telephone_parents', 'mail_parents', 'email_responsable_legal', 'telephone_responsable_legal',
].join(', ')

type DealRow = {
  hubspot_contact_id: string | null
  pipeline: string
  dealstage: string
  formation: string | null
  universite_selectionnee: string | null
  telephone: string | null
  email: string | null
  prenom_responsable_legal_1: string | null
  nom_responsable_legal_1: string | null
  telephone_responsable_legal: string | null
  email_responsable_legal: string | null
}

type ContactRow = Record<string, string | null>

const clean = (v: unknown): string | null => {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s : null
}
const joinName = (...parts: (string | null | undefined)[]) =>
  parts.map(p => clean(p)).filter(Boolean).join(' ') || null

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

async function loadCandidates(): Promise<PodcastCandidate[]> {
  const db = createServiceClient()
  const inscritStages = PAST_PIPELINES.map(p => stageIdByLabel(p, 'Inscription Confirmée')).filter(Boolean) as string[]
  const perduStages = SANS_PREPA_PIPELINES.map(p => stageIdByLabel(p, 'Fermé Perdu')).filter(Boolean) as string[]

  const deals = await fetchAll<DealRow>((from, to) =>
    db.from('crm_deals')
      .select('hubspot_contact_id, pipeline, dealstage, formation, universite_selectionnee, telephone, email, prenom_responsable_legal_1, nom_responsable_legal_1, telephone_responsable_legal, email_responsable_legal')
      .in('dealstage', [...inscritStages, ...perduStages])
      .order('hubspot_deal_id')
      .range(from, to),
  )

  // Regroupe par contact : un contact inscrit une saison n'est jamais "sans prépa".
  const byContact = new Map<string, { inscrit: DealRow[]; perdu: DealRow[] }>()
  for (const d of deals) {
    if (!d.hubspot_contact_id) continue
    const g = byContact.get(d.hubspot_contact_id) ?? { inscrit: [], perdu: [] }
    if (inscritStages.includes(d.dealstage)) g.inscrit.push(d)
    else g.perdu.push(d)
    byContact.set(d.hubspot_contact_id, g)
  }

  // Un lead perdu en 2023-2024 mais inscrit en 2026-2027 n'est pas "sans prépa" non plus.
  const currentInscrit = stageIdByLabel('2313043166', 'Inscription Confirmée')
  const perduOnlyIds = [...byContact.entries()].filter(([, g]) => g.inscrit.length === 0).map(([id]) => id)
  const excluded = new Set<string>()
  for (let i = 0; i < perduOnlyIds.length; i += 300) {
    const { data } = await db.from('crm_deals').select('hubspot_contact_id')
      .in('hubspot_contact_id', perduOnlyIds.slice(i, i + 300))
      .in('dealstage', [currentInscrit, ...PAST_PIPELINES.map(p => stageIdByLabel(p, 'Inscription Confirmée'))].filter(Boolean) as string[])
    for (const r of data ?? []) if (r.hubspot_contact_id) excluded.add(r.hubspot_contact_id)
  }

  const ids = [...byContact.keys()].filter(id => !excluded.has(id))
  const contacts = new Map<string, ContactRow>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await db.from('crm_contacts').select(CONTACT_COLS).in('hubspot_contact_id', ids.slice(i, i + 300))
    if (error) throw new Error(error.message)
    for (const c of (data ?? []) as unknown as ContactRow[]) contacts.set(String(c.hubspot_contact_id), c)
  }

  const out: PodcastCandidate[] = []
  for (const id of ids) {
    const c = contacts.get(id)
    if (!c || String(c.contact_de_test) === 'true') continue
    const g = byContact.get(id)!
    const kind: PodcastCandidate['kind'] = g.inscrit.length > 0 ? 'ancien_eleve' : 'sans_prepa'
    const rows = kind === 'ancien_eleve' ? g.inscrit : g.perdu
    // Plus ancienne saison d'abord (= plus de recul)
    const seasons = [...new Set(rows.map(r => PIPELINES[r.pipeline]?.label).filter(Boolean) as string[])].sort()
    const first = rows.find(r => PIPELINES[r.pipeline]?.label === seasons[0]) ?? rows[0]

    const recoRaw = parseInt(String(c.fin_s1__recommandation_du_coach ?? ''), 10)
    const coachReco = Number.isFinite(recoRaw) ? recoRaw : null
    const verbatim = clean(c.fin_s1__points_positifs_coaching)
    const exPassLas = String(c.as_tu_deja_ete_etudiant_en_pass_ou_las__) === 'true'

    const parentName =
      joinName(c.diploma_guardian1_first_name, c.diploma_guardian1_last_name) ||
      joinName(c.responsable_legal___prenom, c.responsable_legal___nom) ||
      joinName(first.prenom_responsable_legal_1, first.nom_responsable_legal_1) ||
      clean(c.nom_parents)
    const parentPhone =
      clean(c.diploma_guardian1_phone) || clean(c.responsable_legal___telephone) ||
      clean(first.telephone_responsable_legal) || clean(c.telephone_responsable_legal) || clean(c.numero_de_telephone_parents)
    const parentEmail =
      clean(c.diploma_guardian1_email) || clean(c.responsable_legal___email) ||
      clean(first.email_responsable_legal) || clean(c.email_responsable_legal) || clean(c.mail_parents)
    const parent = parentName || parentPhone || parentEmail ? { name: parentName, phone: parentPhone, email: parentEmail } : null

    const phone = clean(c.phone) || clean(first.telephone)
    const tags: string[] = []
    let score = 0
    if (exPassLas) { tags.push('Déjà passé par PASS/LAS'); score += 3 }
    if (coachReco != null && coachReco >= 9) { tags.push(`Reco coach ${coachReco}/10`); score += 3 }
    if (kind === 'ancien_eleve' && seasons.length > 1) { tags.push(`${seasons.length} saisons chez Diploma`); score += 2 }
    if (verbatim) { tags.push('Verbatim bilan S1'); score += 1 }
    if (seasons[0] === '2023-2024') { tags.push('2 ans de recul'); score += 1 }
    if (!phone) score -= 5

    out.push({
      contactId: id,
      kind,
      name: joinName(c.firstname, c.lastname) || '(sans nom)',
      phone,
      email: clean(c.email) || clean(first.email),
      departement: clean(c.departement),
      promo: seasons[0] ?? '',
      seasons,
      formation: clean(first.formation),
      faculty: clean(c.diploma_selected_faculty) || clean(first.universite_selectionnee),
      coachReco,
      verbatim,
      exPassLas,
      parent,
      score,
      tags,
    })
  }
  out.sort((a, b) => b.score - a.score || a.promo.localeCompare(b.promo) || a.name.localeCompare(b.name))
  return out
}

/**
 * GET /api/crm/podcast-casting
 * Profils repérés dans le CRM pour le podcast + shortlist de casting.
 */
export async function GET() {
  const authz = await requireApiRole(['admin', 'manager'])
  if (!authz.ok) return authz.response

  try {
    const db = createServiceClient()
    const [candidates, castingRes] = await Promise.all([
      loadCandidates(),
      db.from('podcast_casting').select('*').order('created_at', { ascending: false }),
    ])
    return NextResponse.json({
      candidates,
      casting: (castingRes.data ?? []) as PodcastCastingRow[],
      // Table pas encore créée → la page affiche les profils mais pas la shortlist.
      casting_available: !castingRes.error,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

/** POST /api/crm/podcast-casting — ajoute un profil à la shortlist. */
export async function POST(req: NextRequest) {
  const authz = await requireApiRole(['admin', 'manager'])
  if (!authz.ok) return authz.response

  const body = await req.json().catch(() => ({}))
  const fullName = clean(body.full_name)
  if (!fullName) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
  if (!isPodcastProfileType(body.profile_type)) return NextResponse.json({ error: 'Type de profil invalide' }, { status: 400 })

  const db = createServiceClient()
  const { data, error } = await db.from('podcast_casting').insert({
    hubspot_contact_id: clean(body.hubspot_contact_id),
    profile_type: body.profile_type,
    source: isPodcastSource(body.source) ? body.source : 'externe',
    full_name: fullName,
    phone: clean(body.phone),
    email: clean(body.email),
    story: clean(body.story),
    created_by: authz.ctx.appUserId,
  }).select('*').single()

  if (error) {
    const msg = error.code === '23505' ? 'Ce profil est déjà dans le casting' : error.message
    return NextResponse.json({ error: msg }, { status: error.code === '23505' ? 409 : 500 })
  }
  return NextResponse.json({ casting: data })
}
