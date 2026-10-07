'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Workflow, Plus, Play, Trash2, FileText, Copy, Sparkles, Users, CheckCircle2, TriangleAlert,
  Lightbulb, XCircle, Loader2, ChevronRight,
} from 'lucide-react'
import { useIsMobile } from '@/lib/useIsMobile'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  CrmV2Body, CrmV2Button, CrmV2Empty, CrmV2Field, CrmV2Header, CrmV2Input, CrmV2KpiCard, CrmV2KpiGrid,
  CrmV2Page, CrmV2Search, CrmV2Section, CrmV2Select, CrmV2Spinner, CrmV2Table, CrmV2TableCard, CrmV2Tabs,
  CrmV2Td, CrmV2Textarea, CrmV2Th, CrmV2Tr, hexA,
} from '@/components/crm-v2/primitives'
import {
  WF_STATUS, WfIconButton, WfIconSquare, WfModal, WfNotice, WfStatusPill,
} from '@/components/crm-v2/marketing2/workflows/ui'

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
    name: 'Sync Diploma -> statut forcé Pré-inscrit 2026/2027',
    category: 'qualification',
    trigger: 'Inscription Diploma en statut payée ou en cours.',
    action: "Force hs_lead_status = 'Pré-inscrit 2026/2027' (anti-régression).",
    why: 'Empêche qu’un flux secondaire repasse un inscrit en Nouveau.',
    path: [
      'Le sync identifie les contacts liés à payée/en cours.',
      "Une liste de contact_ids est consolidée.",
      "Mise à jour batch: hs_lead_status = 'Pré-inscrit 2026/2027'.",
      'Le synced_at est rafraîchi pour traçabilité.',
    ],
    sources: ['/api/cron/diploma-sync'],
  },
  {
    id: 'hubspot-webhook-mirror',
    name: 'Webhook temps réel -> miroir CRM',
    category: 'sync',
    trigger: 'Événements contact/deal de la source externe (création, update, suppression).',
    action: 'Upsert/suppression des enregistrements CRM concernés.',
    why: 'Maintient le miroir CRM quasi temps réel et évite les écarts.',
    path: [
      'Le webhook vérifie la signature de la source.',
      'Les événements sont regroupés par objet et action.',
      'Batch read des contacts/deals à upsert.',
      'Suppression des objets supprimés côté source.',
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

type ListTab = 'all' | 'active' | 'inactive'

/** Les chemins techniques ne doivent pas afficher le nom de l'ancienne source externe. */
const displaySource = (s: string) => s.replace(/hubspot/gi, 'source-externe')

export default function WorkflowsPage() {
  const isMobile = useIsMobile()
  const router = useRouter()
  const [workflows, setWorkflows] = useState<Wf[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [showAI, setShowAI] = useState(false)
  const [activeSystemCategory, setActiveSystemCategory] = useState<'all' | SystemLogicCategory>('all')
  const [openLogicId, setOpenLogicId] = useState<string | null>(SYSTEM_LOGICS[0]?.id ?? null)
  const [tab, setTab] = useState<ListTab>('all')
  const [search, setSearch] = useState('')

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

  // Onglets et indicateurs calculés à partir de la liste déjà chargée
  const activeCount = workflows.filter(w => w.status === 'active').length
  const inactiveCount = workflows.length - activeCount
  const totals = useMemo(() => workflows.reduce(
    (acc, w) => ({
      enrolled: acc.enrolled + (w.total_enrolled || 0),
      completed: acc.completed + (w.total_completed || 0),
      failed: acc.failed + (w.total_failed || 0),
    }),
    { enrolled: 0, completed: 0, failed: 0 },
  ), [workflows])

  const visibleWorkflows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return workflows.filter(w => {
      if (tab === 'active' && w.status !== 'active') return false
      if (tab === 'inactive' && w.status === 'active') return false
      if (!q) return true
      const trig = (TRIGGER_LABELS[w.trigger_type] || w.trigger_type || '').toLowerCase()
      return w.name.toLowerCase().includes(q) || (w.description || '').toLowerCase().includes(q) || trig.includes(q)
    })
  }, [workflows, tab, search])

  const fmtDate = (iso: string) => {
    try { return format(new Date(iso), 'd MMM yyyy', { locale: fr }) } catch { return '—' }
  }
  const nf = (n: number) => (n || 0).toLocaleString('fr-FR')
  const hrefOf = (id: string) => `/admin/crm/workflows/${id}`

  const rowActions = (wf: Wf) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
      <WfIconButton title="Dupliquer" onClick={(e) => { e.preventDefault(); e.stopPropagation(); duplicate(wf.id) }}>
        <Copy size={15} />
      </WfIconButton>
      <WfIconButton title="Supprimer" danger onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(wf.id) }}>
        <Trash2 size={15} />
      </WfIconButton>
    </div>
  )

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Workflows"
        subtitle="Automatise les actions répétitives : envoi d'emails, création de tâches, mise à jour de propriétés."
        actions={
          <>
            <CrmV2Button
              variant="secondary"
              icon={<Sparkles size={14} color={crmV2.gold} />}
              onClick={() => setShowAI(true)}
              title="Décris ton workflow et l'IA le crée pour toi"
            >
              Générer avec l&apos;IA
            </CrmV2Button>
            <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowNew(true)}>
              Créer un workflow
            </CrmV2Button>
          </>
        }
      >
        <CrmV2Tabs
          bordered={false}
          value={tab}
          onChange={(id) => setTab(id as ListTab)}
          items={[
            { id: 'all', label: 'Tous', count: loading ? undefined : workflows.length },
            { id: 'active', label: 'Actifs', count: loading ? undefined : activeCount },
            { id: 'inactive', label: 'Inactifs', count: loading ? undefined : inactiveCount },
          ]}
        />
      </CrmV2Header>

      <CrmV2Body>
        {!loading && workflows.length > 0 && (
          <CrmV2KpiGrid>
            <CrmV2KpiCard label="Workflows actifs" value={nf(activeCount)} detail={`sur ${nf(workflows.length)}`} color={crmV2.gold} icon={<Workflow size={15} />} />
            <CrmV2KpiCard label="Contacts entrés" value={nf(totals.enrolled)} detail="tous workflows" color={crmV2.link} icon={<Users size={15} />} />
            <CrmV2KpiCard label="Complétés" value={nf(totals.completed)} detail="parcours terminés" color={crmV2.success} icon={<CheckCircle2 size={15} />} />
            <CrmV2KpiCard label="Échecs" value={nf(totals.failed)} detail="à vérifier" color={crmV2.danger} icon={<TriangleAlert size={15} />} />
          </CrmV2KpiGrid>
        )}

        {loading ? (
          <CrmV2TableCard><CrmV2Spinner /></CrmV2TableCard>
        ) : workflows.length === 0 ? (
          <CrmV2TableCard>
            <CrmV2Empty
              icon={<Workflow size={28} />}
              title="Aucun workflow pour l'instant"
              description="Crée ton premier workflow pour automatiser des séquences (ex : email de bienvenue après formulaire, relance auto après 48h…)."
              action={<CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowNew(true)}>Créer un workflow</CrmV2Button>}
            />
          </CrmV2TableCard>
        ) : (
          <CrmV2TableCard
            toolbar={
              <CrmV2Search
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un workflow…"
                style={isMobile ? { flex: 1 } : undefined}
              />
            }
            footer={
              <span>
                {visibleWorkflows.length.toLocaleString('fr-FR')} sur {workflows.length.toLocaleString('fr-FR')} workflow{workflows.length > 1 ? 's' : ''}
              </span>
            }
          >
            {visibleWorkflows.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: crmV2.textMuted }}>
                Aucun workflow ne correspond.
              </div>
            ) : isMobile ? (
              // Mobile : une ligne par workflow, sans défilement horizontal
              <div>
                {visibleWorkflows.map(wf => (
                  <Link
                    key={wf.id}
                    href={hrefOf(wf.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px 8px 12px', minHeight: 56,
                      borderBottom: `1px solid ${crmV2.border}`, textDecoration: 'none', color: crmV2.text,
                    }}
                  >
                    <WfIconSquare color={wf.status === 'active' ? crmV2.goldDark : crmV2.textMuted} bg={wf.status === 'active' ? crmV2.goldSoft : crmV2.bgSoft}>
                      <Workflow size={14} />
                    </WfIconSquare>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: crmV2.link, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wf.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 12, color: crmV2.textMuted, minWidth: 0 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: (WF_STATUS[wf.status] ?? WF_STATUS.draft).color, flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(WF_STATUS[wf.status]?.label || wf.status)} · {TRIGGER_LABELS[wf.trigger_type] || wf.trigger_type} · {nf(wf.total_enrolled)} entrés
                        </span>
                      </div>
                    </div>
                    {rowActions(wf)}
                  </Link>
                ))}
              </div>
            ) : (
              <CrmV2Table>
                <thead>
                  <tr>
                    <CrmV2Th>Workflow</CrmV2Th>
                    <CrmV2Th>Déclencheur</CrmV2Th>
                    <CrmV2Th>Statut</CrmV2Th>
                    <CrmV2Th style={{ textAlign: 'right' }}>Entrés</CrmV2Th>
                    <CrmV2Th style={{ textAlign: 'right' }}>Complétés</CrmV2Th>
                    <CrmV2Th style={{ textAlign: 'right' }}>Échecs</CrmV2Th>
                    <CrmV2Th>Modifié</CrmV2Th>
                    <CrmV2Th style={{ width: 80 }}>{''}</CrmV2Th>
                  </tr>
                </thead>
                <tbody>
                  {visibleWorkflows.map(wf => (
                    <CrmV2Tr key={wf.id} onClick={() => router.push(hrefOf(wf.id))}>
                      <CrmV2Td style={{ maxWidth: 420 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0, maxWidth: '100%' }}>
                          <WfIconSquare><Workflow size={14} /></WfIconSquare>
                          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                            <Link
                              href={hrefOf(wf.id)}
                              onClick={e => e.stopPropagation()}
                              style={{ color: crmV2.link, fontWeight: 600, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                              {wf.name}
                            </Link>
                            {wf.description && (
                              <span style={{ fontSize: 12, color: crmV2.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {wf.description}
                              </span>
                            )}
                          </span>
                        </span>
                      </CrmV2Td>
                      <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Play size={12} color={crmV2.textFaint} /> {TRIGGER_LABELS[wf.trigger_type] || wf.trigger_type}
                        </span>
                      </CrmV2Td>
                      <CrmV2Td><WfStatusPill status={wf.status} /></CrmV2Td>
                      <CrmV2Td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{nf(wf.total_enrolled)}</CrmV2Td>
                      <CrmV2Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: crmV2.successStrong }}>{nf(wf.total_completed)}</CrmV2Td>
                      <CrmV2Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: wf.total_failed > 0 ? '#d13a41' : crmV2.textFaint }}>{nf(wf.total_failed)}</CrmV2Td>
                      <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap' }}>{wf.updated_at ? fmtDate(wf.updated_at) : '—'}</CrmV2Td>
                      <CrmV2Td>{rowActions(wf)}</CrmV2Td>
                    </CrmV2Tr>
                  ))}
                </tbody>
              </CrmV2Table>
            )}
          </CrmV2TableCard>
        )}

        {/* Logiques système (vue pédagogique) */}
        <CrmV2Section
          title="Logiques système déjà en place (vue pédagogique)"
          icon={<FileText size={15} />}
          count={SYSTEM_LOGICS.length}
          storageKey="crm-v2-workflows-system-logics-open"
        >
          <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 12 }}>
            Clique sur &quot;Voir le chemin&quot; pour ouvrir le déroulé pas à pas de chaque logique.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            <CategoryChip
              label="Tous"
              active={activeSystemCategory === 'all'}
              color={crmV2.primary}
              onClick={() => setActiveSystemCategory('all')}
            />
            {(Object.keys(CATEGORY_UI) as SystemLogicCategory[]).map((cat) => (
              <CategoryChip
                key={cat}
                label={CATEGORY_UI[cat].label}
                active={activeSystemCategory === cat}
                color={CATEGORY_UI[cat].color}
                onClick={() => setActiveSystemCategory(cat)}
              />
            ))}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {visibleSystemLogics.map((logic) => {
              const ui = CATEGORY_UI[logic.category]
              const open = openLogicId === logic.id
              return (
                <div
                  key={logic.name}
                  style={{
                    border: `1px solid ${open ? crmV2.borderStrong : crmV2.border}`,
                    borderRadius: 12,
                    padding: isMobile ? '10px 12px' : '12px 14px',
                    background: open ? crmV2.bg : '#fafbfd',
                  }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                    <span style={{
                      borderRadius: 999, background: ui.bg, color: ui.color, fontSize: 11, fontWeight: 700,
                      padding: '2px 10px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: ui.color }} />
                      {ui.label}
                    </span>
                    <div style={{ fontSize: 13, fontWeight: 700, color: crmV2.text, flex: 1, minWidth: isMobile ? '60%' : undefined, order: isMobile ? 3 : undefined }}>
                      {logic.name}
                    </div>
                    <CrmV2Button
                      size="sm"
                      variant={open ? 'primary' : 'secondary'}
                      onClick={() => setOpenLogicId((prev) => (prev === logic.id ? null : logic.id))}
                      icon={<ChevronRight size={13} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />}
                      style={isMobile ? { minHeight: 40 } : undefined}
                    >
                      {open ? 'Masquer' : 'Voir le chemin'}
                    </CrmV2Button>
                  </div>
                  <div style={{ display: 'grid', gap: 2, marginTop: 8, fontSize: 12, color: crmV2.textMuted, lineHeight: 1.5 }}>
                    <div><strong style={{ color: crmV2.text }}>Déclencheur :</strong> {logic.trigger}</div>
                    <div><strong style={{ color: crmV2.text }}>Action :</strong> {logic.action}</div>
                    <div><strong style={{ color: crmV2.text }}>Pourquoi :</strong> {logic.why}</div>
                  </div>
                  {open && (
                    <div style={{ marginTop: 10, borderTop: `1px dashed ${crmV2.borderStrong}`, paddingTop: 10, display: 'grid', gap: 8 }}>
                      <div style={{ fontSize: 11, color: crmV2.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        Chemin détaillé
                      </div>
                      <div style={{ display: 'grid', gap: 6 }}>
                        {logic.path.map((step, idx) => (
                          <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{
                              width: 20, height: 20, borderRadius: 999, flexShrink: 0, display: 'inline-flex',
                              alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                              color: ui.color, background: ui.bg, border: `1px solid ${ui.border}`,
                            }}>
                              {idx + 1}
                            </span>
                            <div style={{ fontSize: 12, color: crmV2.text, lineHeight: 1.5 }}>{step}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: crmV2.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                          Sources
                        </span>
                        {logic.sources.map((s) => (
                          <code
                            key={s}
                            style={{
                              fontSize: 11, wordBreak: 'break-all', color: crmV2.text, background: crmV2.chipBg,
                              border: `1px solid ${crmV2.chipBorder}`, borderRadius: 999, padding: '2px 8px',
                            }}
                          >
                            {displaySource(s)}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CrmV2Section>
      </CrmV2Body>

      {showNew && <NewWorkflowModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load() }} />}
      {showAI && <AIWorkflowModal onClose={() => setShowAI(false)} />}
    </CrmV2Page>
  )
}

function CategoryChip({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? color : hexA(color, 0.30)}`,
        background: active ? color : hexA(color, 0.08),
        color: active ? '#fff' : color,
        borderRadius: 999, padding: '6px 12px', minHeight: 32, fontSize: 12, fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
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
    <WfModal
      title="Nouveau workflow"
      icon={<Workflow size={16} />}
      onClose={onClose}
      footer={
        <>
          <CrmV2Button variant="secondary" onClick={onClose}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" onClick={submit} disabled={!name.trim() || creating}>
            {creating ? 'Création…' : 'Créer'}
          </CrmV2Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <CrmV2Field label="Nom du workflow">
          <CrmV2Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Bienvenue PASS-LAS" autoFocus />
        </CrmV2Field>
        <CrmV2Field label="Déclencheur">
          <CrmV2Select value={trigger} onChange={e => setTrigger(e.target.value)}>
            <option value="form_submitted">Quand un formulaire est soumis</option>
            <option value="property_changed">Quand une propriété change</option>
            <option value="contact_created">Quand un contact est créé</option>
            <option value="manual">Manuel</option>
          </CrmV2Select>
        </CrmV2Field>
      </div>
    </WfModal>
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
    <WfModal
      title="Générer un workflow avec l'IA"
      subtitle="Claude Opus 4.6 — décris ton besoin en français"
      icon={<Sparkles size={16} />}
      onClose={onClose}
      width={600}
      footer={
        <>
          <CrmV2Button variant="secondary" onClick={onClose} disabled={generating}>Annuler</CrmV2Button>
          <CrmV2Button
            variant="accent"
            onClick={submit}
            disabled={!description.trim() || generating}
            icon={<Sparkles size={14} />}
          >
            {generating ? 'Génération…' : 'Générer'}
          </CrmV2Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <CrmV2Field
          label="Décris ce que tu veux que le workflow fasse"
          hint={<span style={{ display: 'block', textAlign: 'right' }}>{description.length} / 2000 caractères</span>}
        >
          <CrmV2Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Ex: Quand un lycéen remplit le form Bienvenue, lui envoyer un email puis attendre 1 jour et envoyer un SMS…"
            rows={6}
            autoFocus
            disabled={generating}
          />
        </CrmV2Field>

        {!generating && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: crmV2.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
              <Lightbulb size={14} color={crmV2.gold} /> Exemples — clique pour utiliser
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {AI_EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setDescription(ex)}
                  style={{
                    textAlign: 'left', padding: '10px 12px', background: crmV2.bgHover, border: `1px solid ${crmV2.border}`,
                    borderRadius: crmV2.radius, fontSize: 12, color: crmV2.text, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.5,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = crmV2.goldSoft)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = crmV2.bgHover)}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <WfNotice tone="danger" icon={<XCircle size={14} />}>{error}</WfNotice>
        )}

        {generating && (
          <WfNotice tone="gold" icon={<Loader2 size={14} style={{ animation: 'crm-v2-spin 1s linear infinite' }} />}>
            L&apos;IA réfléchit et construit ton workflow… (10-30s)
          </WfNotice>
        )}
      </div>
    </WfModal>
  )
}
