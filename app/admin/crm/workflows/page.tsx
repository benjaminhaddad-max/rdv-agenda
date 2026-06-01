'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Workflow, Plus, Play, Trash2, FileText, X, Copy, Sparkles } from 'lucide-react'

interface Wf {
  id: string
  name: string
  description: string | null
  status: 'draft' | 'active' | 'paused' | 'archived'
  trigger_type: string
  total_enrolled: number
  total_completed: number
  total_failed: number
  updated_at: string
}

const STATUS: Record<Wf['status'], { label: string; color: string; bg: string }> = {
  draft:    { label: 'Brouillon', color: '#4a6070', bg: '#fff' },
  active:   { label: 'Actif',     color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  paused:   { label: 'En pause',  color: '#C9A84C', bg: 'rgba(204,172,113,0.15)' },
  archived: { label: 'Archivé',   color: '#4a6070', bg: 'rgba(139,143,168,0.15)' },
}

const TRIGGER_LABELS: Record<string, string> = {
  form_submitted:    'Formulaire soumis',
  property_changed:  'Propriété modifiée',
  contact_created:   'Contact créé',
  manual:            'Manuel',
}

type SystemLogicCategory = 'acquisition' | 'qualification' | 'sync' | 'workflow'

interface SystemLogic {
  id: string
  name: string
  category: SystemLogicCategory
  trigger: string
  action: string
  why: string
  path: string[]
  sources: string[]
}

const CATEGORY_UI: Record<SystemLogicCategory, { label: string; color: string; bg: string; border: string }> = {
  acquisition: { label: 'Acquisition', color: '#0f766e', bg: 'rgba(15,118,110,0.12)', border: 'rgba(15,118,110,0.25)' },
  qualification: { label: 'Qualification', color: '#7c3aed', bg: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.25)' },
  sync: { label: 'Sync', color: '#b45309', bg: 'rgba(180,83,9,0.12)', border: 'rgba(180,83,9,0.25)' },
  workflow: { label: 'Workflow Engine', color: '#1d4ed8', bg: 'rgba(29,78,216,0.12)', border: 'rgba(29,78,216,0.25)' },
}

const SYSTEM_LOGICS: SystemLogic[] = [
  {
    id: 'contact-default-new',
    name: 'Nouveau contact CRM -> statut Nouveau',
    category: 'qualification',
    trigger: 'Création contact (API CRM, import, Meta, sync).',
    action: "Affecte hs_lead_status = 'Nouveau' quand absent.",
    why: "Assure une base propre: aucun contact n'arrive sans statut initial.",
    path: [
      'Un contact est créé via une route métier (CRM/import/sync).',
      "La logique vérifie si hs_lead_status est manquant.",
      "Si vide, le statut par défaut 'Nouveau' est injecté.",
      "Le contact est sauvegardé avec synced_at à jour.",
    ],
    sources: ['/api/crm/contacts', '/api/crm/contacts/import', '/lib/meta'],
  },
  {
    id: 'form-submit-upsert-contact',
    name: 'Soumission formulaire -> création/maj contact',
    category: 'acquisition',
    trigger: "POST /api/forms/[id]/submit.",
    action: 'Déduplication email/téléphone puis création ou mise à jour contact.',
    why: 'Empêche les doublons et conserve un historique unifié par personne.',
    path: [
      'Le formulaire est validé (honeypot + champs requis).',
      'Le contact est recherché par email, sinon par téléphone.',
      'S’il existe: update des champs non vides.',
      "Sinon: création d'un nouveau contact natif CRM.",
    ],
    sources: ['/api/forms/[id]/submit'],
  },
  {
    id: 'form-inscription-preinscrit',
    name: "Formulaire d'inscription -> Pré-inscrit 2026/2027",
    category: 'qualification',
    trigger: "Nom/slug de form contenant inscription ou pré-inscription.",
    action: "Passe le lead en 'Pré-inscrit 2026/2027' (si vide ou Nouveau).",
    why: 'Met immédiatement les prospects chauds dans le bon statut commercial.',
    path: [
      'Le nom du formulaire est normalisé (accents/majuscules).',
      "Un pattern détecte qu'il s'agit d'une inscription.",
      "Si le lead est vide ou Nouveau, statut forcé en Pré-inscrit.",
      'La mise à jour est persistée sur le contact.',
    ],
    sources: ['/api/forms/[id]/submit'],
  },
  {
    id: 'form-conversion-fields',
    name: 'Soumission formulaire -> conversion first/recent',
    category: 'qualification',
    trigger: 'Chaque soumission formulaire.',
    action: 'Met à jour first_conversion_* et recent_conversion_*.',
    why: 'Donne une chronologie marketing lisible pour le suivi lead.',
    path: [
      'La date de soumission est déterminée.',
      'first_conversion_* est initialisé si absent.',
      'recent_conversion_* est mis à jour à chaque soumission.',
      'Les champs sont enregistrés sur le contact.',
    ],
    sources: ['/api/forms/[id]/submit', '/lib/conversion-fields'],
  },
  {
    id: 'form-timeline-mirror',
    name: 'Soumission formulaire -> timeline CRM',
    category: 'acquisition',
    trigger: 'Chaque soumission formulaire.',
    action: 'Upsert dans crm_form_submissions pour affichage activité contact.',
    why: "Rend les fiches pédagogiques: on voit l'origine exacte des actions.",
    path: [
      'La soumission brute est enregistrée.',
      'Une ligne timeline est construite (form_id, form_title, valeurs).',
      'Un upsert idempotent est fait sur la timeline CRM.',
      'La fiche contact peut afficher l’activité sans fallback opaque.',
    ],
    sources: ['/api/forms/[id]/submit', '/api/meta/webhook', '/api/cron/meta-leads-poll'],
  },
  {
    id: 'meta-ingestion',
    name: 'Leads Meta Ads -> ingestion CRM',
    category: 'sync',
    trigger: 'Webhook Meta + cron de secours meta-leads-poll.',
    action: 'Crée/maj contact, mappe les champs, applique source et attribution télépro.',
    why: 'Sécurise les leads publicitaires même si le webhook rate temporairement.',
    path: [
      'Réception webhook Meta (ou polling cron en rattrapage).',
      'Fetch du lead complet et mapping des champs vers CRM.',
      'Upsert du contact + normalisation (email, téléphone, classe, zone).',
      'Log de l’événement Meta pour audit et idempotence.',
    ],
    sources: ['/api/meta/webhook', '/api/cron/meta-leads-poll', '/lib/meta'],
  },
  {
    id: 'meta-enroll-workflow',
    name: 'Lead Meta -> déclenchement workflow lié au form',
    category: 'workflow',
    trigger: 'Lead Meta avec form_id correspondant.',
    action: 'Enroll dans le workflow actif relié au formulaire.',
    why: 'Permet de brancher des séquences automatiques sur les leads ads.',
    path: [
      'Le lead Meta est converti en contact CRM.',
      'Les workflows actifs form_submitted sont chargés.',
      'Match sur meta_form_id ou workflow_id du form Meta.',
      "Le contact est inscrit dans l'exécution workflow.",
    ],
    sources: ['/lib/meta', '/lib/workflow-engine'],
  },
  {
    id: 'diploma-reconcile',
    name: 'Sync Diploma -> réconciliation pré-inscriptions',
    category: 'sync',
    trigger: 'Cron diploma-sync (et webhook Diploma).',
    action: 'Match email, crée contact si besoin, upsert pré-inscription et deal dpl_*.',
    why: 'Aligne le CRM avec la plateforme diplôme sans perte de dossiers.',
    path: [
      'Le sync tire toutes les inscriptions Diploma cibles.',
      'Match des contacts existants par email normalisé.',
      'Création contact si introuvable, puis préparation des lignes métier.',
      'Upsert crm_pre_inscriptions + upsert des deals dpl_*.',
    ],
    sources: ['/api/cron/diploma-sync', '/api/webhooks/diploma-inscription'],
  },
  {
    id: 'diploma-force-preinscrit',
    name: 'Sync Diploma -> statut forcé Pré-inscrit 2026-2027',
    category: 'qualification',
    trigger: 'Inscription Diploma en statut payée ou en cours.',
    action: "Force hs_lead_status = 'Pré-inscrit 2026-2027' (anti-régression).",
    why: 'Empêche qu’un flux secondaire repasse un inscrit en Nouveau.',
    path: [
      'Le sync identifie les contacts liés à payée/en cours.',
      "Une liste de contact_ids est consolidée.",
      "Mise à jour batch: hs_lead_status = 'Pré-inscrit 2026-2027'.",
      'Le synced_at est rafraîchi pour traçabilité.',
    ],
    sources: ['/api/cron/diploma-sync'],
  },
  {
    id: 'hubspot-webhook-mirror',
    name: 'Webhook HubSpot temps réel -> miroir CRM',
    category: 'sync',
    trigger: 'Events HubSpot contact/deal (création, update, suppression).',
    action: 'Upsert/suppression des enregistrements CRM concernés.',
    why: 'Maintient le miroir CRM quasi temps réel et évite les écarts.',
    path: [
      'Le webhook vérifie la signature HubSpot.',
      'Les événements sont regroupés par objet et action.',
      'Batch read des contacts/deals à upsert.',
      'Suppression des objets supprimés côté HubSpot.',
    ],
    sources: ['/api/webhooks/hubspot'],
  },
  {
    id: 'csv-import-normalize',
    name: 'Import CSV contacts -> normalisation + statut défaut',
    category: 'acquisition',
    trigger: 'Import en masse CSV.',
    action: "Normalise les données, déduplique, et met 'Nouveau' si statut absent.",
    why: 'Rend les imports exploitables immédiatement par les équipes CRM.',
    path: [
      'Le fichier est parsé et validé (champs autorisés).',
      'Les doublons existants sont détectés email/téléphone.',
      'Les nouveaux contacts reçoivent les valeurs par défaut utiles.',
      'Insert/update par lots avec reporting d’erreurs.',
    ],
    sources: ['/api/crm/contacts/import'],
  },
  {
    id: 'linova-marking',
    name: 'Prise de RDV Linova -> marquage lead Linova',
    category: 'qualification',
    trigger: 'Création de RDV Linova.',
    action: 'Renseigne source/origine Linova, conversion Linova, et télépro par défaut.',
    why: 'Donne une lecture commerciale claire du parcours Linova.',
    path: [
      'Le RDV est créé côté API Linova.',
      'Le contact CRM est retrouvé et enrichi (linova_*).',
      'Les champs source/origine/recent_conversion sont mis à jour.',
      'Une activité timeline est ajoutée sur la fiche contact.',
    ],
    sources: ['/api/linova/appointments'],
  },
]

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Wf[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [showAI, setShowAI] = useState(false)
  const [activeSystemCategory, setActiveSystemCategory] = useState<'all' | SystemLogicCategory>('all')
  const [openLogicId, setOpenLogicId] = useState<string | null>(SYSTEM_LOGICS[0]?.id ?? null)

  const visibleSystemLogics = useMemo(() => {
    if (activeSystemCategory === 'all') return SYSTEM_LOGICS
    return SYSTEM_LOGICS.filter((l) => l.category === activeSystemCategory)
  }, [activeSystemCategory])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/workflows')
      const data = await res.json()
      setWorkflows(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const remove = async (id: string) => {
    if (!confirm('Supprimer ce workflow ?')) return
    await fetch(`/api/workflows/${id}`, { method: 'DELETE' })
    load()
  }

  const duplicate = async (id: string) => {
    const res = await fetch(`/api/workflows/${id}/duplicate`, { method: 'POST' })
    if (!res.ok) {
      alert('Erreur lors de la duplication')
      return
    }
    const data = await res.json()
    if (data?.workflow?.id) {
      window.location.href = `/admin/crm/workflows/${data.workflow.id}`
    } else {
      load()
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f4ee', fontFamily: 'Inter, system-ui, sans-serif', color: '#0e1e35' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px', background: 'linear-gradient(135deg, #2ea3f2, #0038f0)', color: '#fff' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, opacity: 0.85, marginBottom: 4 }}>
              <Link href="/admin/crm" style={{ color: '#fff', textDecoration: 'none' }}>CRM</Link> / Workflows
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Workflow size={22} /> Workflows
            </h1>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
              Automatise les actions répétitives : envoi d&apos;emails, création de tâches, mise à jour de propriétés.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowAI(true)}
              style={{ background: 'linear-gradient(135deg, #a855f7, #d946ef)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', boxShadow: '0 4px 12px rgba(168,85,247,0.35)' }}
              title="Décris ton workflow et l'IA le crée pour toi"
            >
              <Sparkles size={14} /> Générer avec l&apos;IA
            </button>
            <button
              onClick={() => setShowNew(true)}
              style={{ background: '#fff', color: '#0038f0', border: 'none', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}
            >
              <Plus size={14} /> Nouveau
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 32 }}>
        <div
          style={{
            background: '#fff',
            border: '1px solid #cbd6e2',
            borderRadius: 12,
            padding: 18,
            marginBottom: 16,
            boxShadow: '0 4px 20px rgba(17,24,39,0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <FileText size={15} style={{ color: '#ccac71' }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: '#33475b' }}>
              Logiques système déjà en place (vue pédagogique)
            </div>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 10,
                fontWeight: 700,
                color: '#516f90',
                background: '#f5f8fa',
                border: '1px solid #cbd6e2',
                borderRadius: 999,
                padding: '3px 8px',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              {SYSTEM_LOGICS.length} logiques
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#516f90', marginBottom: 12 }}>
            Clique sur &quot;Voir le chemin&quot; pour ouvrir le déroulé pas à pas de chaque logique.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setActiveSystemCategory('all')}
              style={{
                border: '1px solid #cbd6e2',
                background: activeSystemCategory === 'all' ? '#0e1e35' : '#fff',
                color: activeSystemCategory === 'all' ? '#fff' : '#33475b',
                borderRadius: 999,
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Tous
            </button>
            {(Object.keys(CATEGORY_UI) as SystemLogicCategory[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveSystemCategory(cat)}
                style={{
                  border: `1px solid ${CATEGORY_UI[cat].border}`,
                  background: activeSystemCategory === cat ? CATEGORY_UI[cat].color : CATEGORY_UI[cat].bg,
                  color: activeSystemCategory === cat ? '#fff' : CATEGORY_UI[cat].color,
                  borderRadius: 999,
                  padding: '5px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {CATEGORY_UI[cat].label}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {visibleSystemLogics.map((logic) => (
              <div
                key={logic.name}
                style={{
                  border: '1px solid #e7edf3',
                  borderRadius: 8,
                  padding: '12px 14px',
                  background: '#fafcfe',
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span
                    style={{
                      borderRadius: 999,
                      border: `1px solid ${CATEGORY_UI[logic.category].border}`,
                      background: CATEGORY_UI[logic.category].bg,
                      color: CATEGORY_UI[logic.category].color,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      padding: '3px 8px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {CATEGORY_UI[logic.category].label}
                  </span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#33475b', flex: 1 }}>
                    {logic.name}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenLogicId((prev) => (prev === logic.id ? null : logic.id))}
                    style={{
                      border: '1px solid #cbd6e2',
                      background: openLogicId === logic.id ? '#0e1e35' : '#fff',
                      color: openLogicId === logic.id ? '#fff' : '#33475b',
                      borderRadius: 6,
                      padding: '5px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {openLogicId === logic.id ? 'Masquer' : 'Voir le chemin'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#516f90', marginTop: 7 }}>
                  <strong style={{ color: '#33475b' }}>Déclencheur:</strong> {logic.trigger}
                </div>
                <div style={{ fontSize: 11, color: '#516f90' }}>
                  <strong style={{ color: '#33475b' }}>Action:</strong> {logic.action}
                </div>
                <div style={{ fontSize: 11, color: '#516f90' }}>
                  <strong style={{ color: '#33475b' }}>Pourquoi:</strong> {logic.why}
                </div>
                {openLogicId === logic.id && (
                  <div
                    style={{
                      marginTop: 10,
                      borderTop: '1px dashed #d7e1eb',
                      paddingTop: 10,
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 10, color: '#516f90', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      Chemin détaillé
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {logic.path.map((step, idx) => (
                        <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <span
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 999,
                              flexShrink: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 10,
                              fontWeight: 700,
                              color: CATEGORY_UI[logic.category].color,
                              background: CATEGORY_UI[logic.category].bg,
                              border: `1px solid ${CATEGORY_UI[logic.category].border}`,
                            }}
                          >
                            {idx + 1}
                          </span>
                          <div style={{ fontSize: 11, color: '#33475b', lineHeight: 1.45 }}>{step}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, color: '#516f90', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        Sources
                      </span>
                      {logic.sources.map((s) => (
                        <code
                          key={s}
                          style={{
                            fontSize: 10,
                            color: '#1f3553',
                            background: '#edf3f9',
                            border: '1px solid #d5e3f1',
                            borderRadius: 4,
                            padding: '2px 6px',
                          }}
                        >
                          {s}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ color: '#4a6070', fontSize: 13 }}>Chargement…</div>
        ) : workflows.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', border: '1px solid #e5ddc8' }}>
            <Workflow size={48} style={{ color: '#a89e8a', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Aucun workflow pour l&apos;instant</div>
            <div style={{ fontSize: 12, color: '#4a6070', maxWidth: 400, margin: '0 auto 16px' }}>
              Crée ton premier workflow pour automatiser des séquences (ex : email de bienvenue après formulaire, relance auto après 48h…).
            </div>
            <button
              onClick={() => setShowNew(true)}
              style={{ background: 'linear-gradient(135deg, #2ea3f2, #0038f0)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >Créer un workflow</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {workflows.map(wf => (
              <Link key={wf.id} href={`/admin/crm/workflows/${wf.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: '#fff', border: '1px solid #e5ddc8', borderRadius: 12, padding: '14px 18px', display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 16, alignItems: 'center', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)')}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0e1e35', marginBottom: 4 }}>{wf.name}</div>
                    <div style={{ fontSize: 12, color: '#4a6070', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Play size={11} /> {TRIGGER_LABELS[wf.trigger_type] || wf.trigger_type}
                      </span>
                      {wf.description && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>{wf.description}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#4a6070', textAlign: 'right' }}>
                    <div><strong style={{ color: '#0e1e35', fontSize: 14 }}>{wf.total_enrolled}</strong> entrés</div>
                    <div>{wf.total_completed} ✓ · {wf.total_failed} ✗</div>
                  </div>
                  <span style={{ background: STATUS[wf.status]?.bg, color: STATUS[wf.status]?.color, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>
                    {STATUS[wf.status]?.label || wf.status}
                  </span>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); duplicate(wf.id) }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#4a6070', padding: 4 }}
                    title="Dupliquer"
                  ><Copy size={14} /></button>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(wf.id) }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#4a6070', padding: 4 }}
                    title="Supprimer"
                  ><Trash2 size={14} /></button>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showNew && <NewWorkflowModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load() }} />}
      {showAI && <AIWorkflowModal onClose={() => setShowAI(false)} />}
    </div>
  )
}

function NewWorkflowModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [trigger, setTrigger] = useState('form_submitted')
  const [creating, setCreating] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setCreating(true)
    const res = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), trigger_type: trigger, trigger_config: {} }),
    })
    setCreating(false)
    if (res.ok) {
      const data = await res.json()
      window.location.href = `/admin/crm/workflows/${data.id}`
    } else {
      alert('Erreur création')
    }
    onCreated()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, maxWidth: 480, width: '100%', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5ddc8' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Nouveau workflow</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#4a6070' }}><X size={16} /></button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#4a6070', fontWeight: 600, marginBottom: 4 }}>Nom du workflow</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Bienvenue PASS-LAS" style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5ddc8', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} autoFocus />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#4a6070', fontWeight: 600, marginBottom: 4 }}>Déclencheur</label>
            <select value={trigger} onChange={e => setTrigger(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5ddc8', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}>
              <option value="form_submitted">Quand un formulaire est soumis</option>
              <option value="property_changed">Quand une propriété change</option>
              <option value="contact_created">Quand un contact est créé</option>
              <option value="manual">Manuel</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, padding: 10, border: '1px solid #e5ddc8', background: '#fff', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: '#0e1e35' }}>Annuler</button>
            <button onClick={submit} disabled={!name.trim() || creating} style={{ flex: 1, padding: 10, border: 'none', background: 'linear-gradient(135deg, #2ea3f2, #0038f0)', color: '#fff', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, opacity: !name.trim() || creating ? 0.6 : 1 }}>
              {creating ? 'Création…' : 'Créer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── AIWorkflowModal ────────────────────────────────────────────────────
const AI_EXAMPLES = [
  "Quand un lycéen remplit le form Bienvenue, lui envoyer un email de bienvenue, attendre 1 jour, puis un SMS pour proposer un RDV. 2 jours après, créer une tâche au commercial pour rappeler s'il n'a pas pris RDV.",
  "Si statut du lead passe à \"Pré-inscrit\", envoyer un email de confirmation puis un SMS le lendemain à 10h avec les prochaines étapes.",
  "Quand un contact est créé, attendre 1h, lui envoyer un email d'accueil. 3 jours après, si toujours pas de RDV, envoyer une relance SMS.",
]

function AIWorkflowModal({ onClose }: { onClose: () => void }) {
  const [description, setDescription] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!description.trim() || generating) return
    setError(null)
    setGenerating(true)
    try {
      const res = await fetch('/api/workflows/generate-ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Erreur HTTP ${res.status}`)
        return
      }
      if (data?.workflow?.id) {
        window.location.href = `/admin/crm/workflows/${data.workflow.id}`
      } else {
        onClose()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, maxWidth: 600, width: '100%', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #a855f7, #d946ef)', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Générer un workflow avec l&apos;IA</div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>Claude Opus 4.6 — décris ton besoin en français</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#fff' }}><X size={16} /></button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#4a6070', fontWeight: 600, marginBottom: 4 }}>
              Décris ce que tu veux que le workflow fasse
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ex: Quand un lycéen remplit le form Bienvenue, lui envoyer un email puis attendre 1 jour et envoyer un SMS…"
              rows={6}
              style={{ width: '100%', padding: 10, border: '1px solid #e5ddc8', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5 }}
              autoFocus
              disabled={generating}
            />
            <div style={{ fontSize: 10, color: '#4a6070', marginTop: 4, textAlign: 'right' }}>
              {description.length} / 2000 caractères
            </div>
          </div>

          {!generating && (
            <div>
              <div style={{ fontSize: 10, color: '#4a6070', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                💡 Exemples — clique pour utiliser
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {AI_EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setDescription(ex)}
                    style={{ textAlign: 'left', padding: '8px 10px', background: '#f7f4ee', border: '1px solid #e5ddc8', borderRadius: 6, fontSize: 11, color: '#0e1e35', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.5 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(168,85,247,0.08)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#f7f4ee')}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', padding: 10, borderRadius: 6, fontSize: 12, color: '#ef4444' }}>
              ❌ {error}
            </div>
          )}

          {generating && (
            <div style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)', padding: 12, borderRadius: 6, fontSize: 12, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="ai-spin">✨</span>
              <span>L&apos;IA réfléchit et construit ton workflow… (10-30s)</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={onClose} disabled={generating} style={{ flex: 1, padding: 10, border: '1px solid #e5ddc8', background: '#fff', borderRadius: 8, fontSize: 13, cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', color: '#0e1e35', opacity: generating ? 0.5 : 1 }}>Annuler</button>
            <button
              onClick={submit}
              disabled={!description.trim() || generating}
              style={{ flex: 1, padding: 10, border: 'none', background: 'linear-gradient(135deg, #a855f7, #d946ef)', color: '#fff', borderRadius: 8, fontSize: 13, cursor: !description.trim() || generating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600, opacity: !description.trim() || generating ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Sparkles size={13} /> {generating ? 'Génération…' : 'Générer'}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .ai-spin { display: inline-block; animation: spin 1.5s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
