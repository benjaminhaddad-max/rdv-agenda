'use client'

/**
 * Bloc « Candidature Edumove » de la fiche contact : dossier(s) de la
 * plateforme candidature.edumove.fr (copie crm_edumove_candidatures,
 * rafraîchie toutes les 10 min). Rien n'est affiché si le contact n'a pas
 * de compte sur la plateforme.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Plane } from 'lucide-react'
import { CrmV2Section } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  EDUMOVE_DOCUMENT_LABELS, EDUMOVE_SITUATION_LABELS, EDUMOVE_STAGE_LABELS, EDUMOVE_STATUS_LABELS,
  EDUMOVE_TRACKING_LABELS, EDUMOVE_UNIS, edumoveMissingDocs, type EdumoveStage,
} from '@/lib/edumove-stage'

type Dossier = {
  candidature_id: string
  stage: EdumoveStage
  status: string | null
  situation_actuelle: string | null
  profil: string | null
  departement: string | null
  filieres: string[] | null
  destinations: string[] | null
  uni_selections: Record<string, { filiere?: string; filiereLabel?: string; ville?: string; langue?: string }> | null
  uni_tracking: Record<string, unknown> | null
  documents: Record<string, string | boolean> | null
  details: Record<string, unknown> | null
  candidature_created_at: string | null
  synced_at: string
}

const STAGE_STYLE: Record<EdumoveStage, { bg: string; color: string; dot: string }> = {
  compte: { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
  candidature: { bg: '#fff7ed', color: '#c2410c', dot: '#f97316' },
  reponse: { bg: '#eff6ff', color: '#1d4ed8', dot: '#3b82f6' },
  choix_faits: { bg: '#f5f3ff', color: '#6d28d9', dot: '#8b5cf6' },
  inscrit: { bg: '#ecfdf5', color: '#047857', dot: '#10b981' },
  archive: { bg: '#f8fafc', color: '#64748b', dot: '#cbd5e1' },
}

const FILIERES: Record<string, string> = {
  medecine: 'Médecine', dentaire: 'Dentaire', kinesitherapie: 'Kiné', pharmacie: 'Pharmacie', veterinaire: 'Vétérinaire',
}
const DESTINATIONS: Record<string, string> = { PASS_LAS: 'PASS / LAS (France)', LINK: 'LINK', UCJC: 'UCJC', UE: 'Universidad Europea' }
const LANGUE_NIVEAUX: Record<string, string> = { b2: 'B2+', b1: 'B1', debut: 'Débutant', aucun: 'Aucun' }

const softBox: CSSProperties = { background: crmV2.bgHover, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }
const label: CSSProperties = { fontSize: 12, color: crmV2.textMuted }

function KV({ k, v, color }: { k: ReactNode; v: ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
      <span style={{ color: crmV2.textMuted, flexShrink: 0 }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', color: color ?? crmV2.text }}>{v}</span>
    </div>
  )
}

const fmtDate = (d: string | null | undefined) => {
  if (!d) return null
  const t = new Date(d)
  return Number.isNaN(t.getTime()) ? null : format(t, 'd MMM yyyy', { locale: fr })
}

export function EdumoveSection({ contactId }: { contactId: string }) {
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  useEffect(() => {
    let cancelled = false
    fetch(`/api/crm/contacts/${encodeURIComponent(contactId)}/edumove`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && Array.isArray(d?.dossiers)) setDossiers(d.dossiers) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [contactId])

  if (dossiers.length === 0) return null
  return (
    <>
      {dossiers.map(d => <EdumoveDossier key={d.candidature_id} d={d} />)}
    </>
  )
}

function EdumoveDossier({ d }: { d: Dossier }) {
  const st = STAGE_STYLE[d.stage] ?? STAGE_STYLE.candidature
  const det = d.details ?? {}
  const selections = d.uni_selections ?? {}
  const tracking = d.uni_tracking ?? {}
  const docs = d.documents ?? {}
  const missing = edumoveMissingDocs(selections, docs)
  const langues = (det.langues && typeof det.langues === 'object' ? det.langues : {}) as Record<string, string>
  const docEntries = Object.entries(docs).filter(([k, v]) => typeof v === 'string' && k in EDUMOVE_DOCUMENT_LABELS)
  const created = fmtDate(d.candidature_created_at)

  return (
    <CrmV2Section title="Candidature Edumove" icon={<Plane size={14} />} count={1} storageKey="rs-open:Candidature Edumove">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: st.bg, color: st.color, fontSize: 12, fontWeight: 700 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
          {EDUMOVE_STAGE_LABELS[d.stage]}
        </div>

        {d.stage !== 'compte' && (
          <div style={softBox}>
            {d.status && <KV k="Statut" v={EDUMOVE_STATUS_LABELS[d.status] ?? d.status} />}
            {d.situation_actuelle && <KV k="Situation" v={EDUMOVE_SITUATION_LABELS[d.situation_actuelle] ?? d.situation_actuelle} />}
            {d.profil && <KV k="Profil" v={d.profil === 'reorientation' ? 'Réorientation' : 'Terminale'} />}
            {det.moyenne_terminale != null && det.moyenne_terminale !== '' && <KV k="Moyenne terminale" v={String(det.moyenne_terminale)} />}
            {det.moyenne_premiere != null && det.moyenne_premiere !== '' && <KV k="Moyenne première" v={String(det.moyenne_premiere)} />}
            {det.callback_requested === true && <KV k="Rappel demandé" v={fmtDate(det.callback_requested_at as string) ?? 'Oui'} color="#b45309" />}
          </div>
        )}

        {(d.filieres?.length || d.destinations?.length) ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {d.filieres?.length ? (
              <div><span style={label}>Filières : </span><span style={{ fontSize: 12, fontWeight: 600 }}>{d.filieres.map(f => FILIERES[f] ?? f).join(' > ')}</span></div>
            ) : null}
            {d.destinations?.length ? (
              <div><span style={label}>Destinations : </span><span style={{ fontSize: 12, fontWeight: 600 }}>{d.destinations.map(x => DESTINATIONS[x] ?? x).join(' > ')}</span></div>
            ) : null}
          </div>
        ) : null}

        {Object.keys(langues).length > 0 && (
          <div>
            <span style={label}>Langues : </span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              {Object.entries(langues).filter(([, v]) => v && v !== 'aucun').map(([k, v]) => `${k} ${LANGUE_NIVEAUX[v] ?? v}`).join(' · ') || 'Aucune'}
            </span>
          </div>
        )}

        {Object.keys(selections).length > 0 && (
          <div style={softBox}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Facs choisies</div>
            {EDUMOVE_UNIS.filter(u => selections[u.key]).map(u => {
              const sel = selections[u.key] ?? {}
              const track = tracking[`${u.key}_status`] as string | undefined
              const extra = [sel.filiereLabel ?? (sel.filiere ? FILIERES[sel.filiere] ?? sel.filiere : null), sel.ville, sel.langue].filter(Boolean).join(' · ')
              return (
                <KV key={u.key} k={<>{u.label}{extra ? <span style={{ color: crmV2.textFaint }}> — {extra}</span> : null}</>}
                  v={track ? EDUMOVE_TRACKING_LABELS[track] ?? track : 'Pas de suivi'}
                  color={track === 'inscrit' ? '#047857' : track === 'refuse' ? '#b91c1c' : undefined} />
              )
            })}
          </div>
        )}

        {(docEntries.length > 0 || missing.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Pièces</div>
            {docEntries.map(([k, url]) => (
              <a key={k} href={url as string} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: crmV2.text, textDecoration: 'underline' }}>
                ✓ {EDUMOVE_DOCUMENT_LABELS[k]}
              </a>
            ))}
            {missing.map(k => (
              <div key={k} style={{ fontSize: 12, color: '#b91c1c' }}>✗ {EDUMOVE_DOCUMENT_LABELS[k] ?? k} — manquante</div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: crmV2.textFaint, borderTop: `1px solid ${crmV2.borderLight}`, paddingTop: 8 }}>
          <span>{d.stage === 'compte' ? 'Compte créé' : 'Déposée'}{created ? ` le ${created}` : ''}</span>
          <span title="Copie de la plateforme, rafraîchie toutes les 10 min">MAJ {fmtDate(d.synced_at)}</span>
        </div>
      </div>
    </CrmV2Section>
  )
}
