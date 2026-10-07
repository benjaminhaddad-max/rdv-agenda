'use client'

import { useState } from 'react'
import {
  ChevronDown, type LucideIcon,
  CalendarPlus, UserCheck, Phone, Video, MapPin,
  Bell, RefreshCw, Users, Briefcase, AlertTriangle,
  GitMerge, Clock, FileText, BarChart3, Shield,
  Zap, MessageSquare, Search, Plug,
  CalendarDays, CalendarRange, History, Repeat, Package, Inbox, Copy, CircleX,
  ListFilter, EyeOff, Contact, Download, Bookmark, GitBranch, StickyNote, Link2,
  BellRing, Sunrise, Ban,
} from 'lucide-react'
import { crmV2, crmV2Outcomes } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2KpiCard, CrmV2KpiGrid, hexA } from '@/components/crm-v2/primitives'
import { PanelShell } from '@/components/crm-v2/panels/PanelUi'

type Props = { onClose: () => void; role?: 'admin' | 'closer' | 'telepro' }

type Section = {
  id: string
  icon: React.ReactNode
  title: string
  color: string
  /** Roles qui peuvent voir cette section. Absent = tout le monde */
  roles?: ('admin' | 'closer' | 'telepro')[]
  /** icon : pictogramme Lucide · step : étape numérotée · dot : pastille de statut */
  items: { icon?: LucideIcon; step?: number; dot?: string; title: string; desc: string }[]
}

const SECTIONS: Section[] = [
  {
    id: 'booking',
    icon: <CalendarPlus size={18} />,
    title: 'Parcours Prospect — Prise de RDV',
    color: '#22c55e',
    roles: ['admin', 'closer', 'telepro'],
    items: [
      {
        step: 1,
        title: 'Page de réservation publique',
        desc: 'Le prospect accède à la page de réservation. Il voit les créneaux disponibles sur 7 jours glissants, choisit un créneau de 30 min, remplit son nom + email + téléphone. Le RDV tombe dans la file d\'attente admin.',
      },
      {
        step: 2,
        title: 'Création du RDV + transaction',
        desc: 'Le RDV est créé et une transaction est créée automatiquement en "RDV Pris". La transaction est liée au contact (créé ou retrouvé par email). Le RDV reste non-assigné jusqu\'à ce que Pascal l\'assigne à un closer depuis la file d\'attente admin.',
      },
      {
        step: 3,
        title: 'SMS de confirmation (48h avant)',
        desc: 'Un SMS est envoyé 48h avant avec un lien de confirmation. Le prospect peut cliquer "Oui je serai présent" ou "Non, reporter" pour replanifier.',
      },
      {
        step: 4,
        title: 'SMS de relance (24h avant)',
        desc: 'Si le prospect n\'a pas confirmé via SMS, une relance est envoyée 24h avant.',
      },
      {
        step: 5,
        title: 'SMS de rappel (1h + 5 min avant)',
        desc: 'Pour les RDV visio/téléphone, un rappel est envoyé 1h puis 5 min avant avec le lien Jitsi ou "l\'équipe va vous appeler".',
      },
      {
        step: 6,
        title: 'Replanification par le prospect',
        desc: 'Via /reschedule/[token], le prospect voit les créneaux de TOUS les closers et peut choisir un nouveau créneau. L\'ancien RDV est annulé.',
      },
    ],
  },
  {
    id: 'closer',
    icon: <Briefcase size={18} />,
    title: 'Dashboard Closer',
    color: '#6b87ff',
    roles: ['admin', 'closer'],
    items: [
      {
        icon: CalendarDays,
        title: 'Mon Planning',
        desc: 'Vue semaine (calendrier 8h-18h) ou vue liste chronologique. Chaque RDV affiche : prospect, formation, type de meeting (visio/tel/présentiel), statut, badges couleur.',
      },
      {
        icon: CalendarPlus,
        title: 'Nouveau RDV',
        desc: 'Créer un RDV manuellement. Recherche de contact par nom/email/tel. Choix formation, type meeting, date/heure. Lien Jitsi auto-généré si visio.',
      },
      {
        icon: History,
        title: 'Historique',
        desc: 'Tous les deals passés du closer. Filtres par stage (A replanifier, Délai réflexion, Fermé/Perdu). Suivi closer : Ne répond plus, A travailler, Pré-positif. Bouton "Reprendre RDV".',
      },
      {
        icon: Repeat,
        title: 'Repop',
        desc: 'Journal des prospects qui ont resoumis un formulaire après leur RDV. Timeline visuelle montrant date RDV puis nouveau formulaire.',
      },
      {
        icon: Clock,
        title: 'Disponibilités',
        desc: 'Définir ses créneaux par jour de la semaine (lun-dim). Bloquer des dates (vacances, indispos). Les créneaux sont utilisés par la page de booking publique.',
      },
      {
        icon: FileText,
        title: 'Rapport post-RDV',
        desc: 'Après chaque RDV : résumé, conseil télépro, statut (no-show, à travailler, pré-positif, positif, négatif). Si négatif : raison + détail. Contact principal, consignes, concurrence, financement, invitation JPO.',
      },
      {
        icon: Package,
        title: 'Boîte à outils',
        desc: 'Accès aux ressources : scripts d\'appel, argumentaires, documents commerciaux, liens utiles, fiches formations. Organisé par catégories.',
      },
    ],
  },
  {
    id: 'telepro',
    icon: <Phone size={18} />,
    title: 'Dashboard Télépro',
    color: '#a855f7',
    roles: ['admin', 'telepro'],
    items: [
      {
        icon: CalendarDays,
        title: 'Mon Planning',
        desc: 'Vue des RDV placés par le télépro. Liste chronologique avec badges PASSE / AUJOURD\'HUI. Bouton "Reprendre RDV" pour les no-show.',
      },
      {
        icon: CalendarPlus,
        title: 'Nouveau RDV',
        desc: 'Placer un RDV pour un closer. Recherche contact, choix formation/type/date. La transaction est créée avec le champ teleprospecteur.',
      },
      {
        icon: History,
        title: 'Historique + Suivi',
        desc: 'Deals historiques avec colonnes de suivi (Ne répond plus, A travailler, Pré-positif). Sauvegarde du suivi dans le CRM.',
      },
      {
        icon: Repeat,
        title: 'Repop',
        desc: 'Mêmes fonctionnalités que le closer, filtré sur les deals du télépro.',
      },
      {
        icon: Package,
        title: 'Boîte à outils',
        desc: 'Accès aux scripts d\'appel, argumentaires, documents, fiches formations et liens utiles. Organisé par catégories.',
      },
    ],
  },
  {
    id: 'admin',
    icon: <Shield size={18} />,
    title: 'Dashboard Admin (Pascal)',
    color: '#C9A84C',
    roles: ['admin'],
    items: [
      {
        icon: Inbox,
        title: 'File d\'attente non-assignés',
        desc: 'Liste en temps réel des RDV sans closer assigné. Filtres par source (Télépro, Online, Admin). Click pour ouvrir le modal d\'assignation avec vérification des dispos du closer.',
      },
      {
        icon: CalendarRange,
        title: 'Calendrier global',
        desc: 'Vue semaine de TOUS les closers. Code couleur par closer. Click sur un RDV pour voir les détails, changer le statut, réassigner, ajouter des notes.',
      },
      {
        icon: Users,
        title: 'Gestion Télépros',
        desc: 'Provisionner de nouveaux comptes depuis l\'équipe "Télépros". Activer/bannir. Synchroniser les statuts.',
      },
      {
        icon: Briefcase,
        title: 'Gestion Closers',
        desc: 'Créer des comptes closer, provisionner depuis l\'équipe. Gérer les dispos de chaque closer. Synchroniser les IDs propriétaires.',
      },
      {
        icon: AlertTriangle,
        title: 'Check RDV Closer',
        desc: 'Audit des deals en "RDV Pris" dont la date est passée. Catégories : même personne (télépro=closer), closer assigné, télépro inconnu. Action bulk : passer en "A replanifier".',
      },
      {
        icon: GitMerge,
        title: 'Doublons contacts',
        desc: 'Détection de contacts en double (même tel, même email, noms similaires). Fusion ou ignorer. Détection cross-télépro.',
      },
      {
        icon: Copy,
        title: 'Doublons transactions',
        desc: 'Deals en double pour un même contact. Stratégie de merge : garder le deal au stage le plus avancé. Merge bulk avec confirmation.',
      },
      {
        icon: BarChart3,
        title: 'Journal Repop',
        desc: 'Vue complète des repop tous closers/télépros. Onglet "Sans transaction" : contacts qui ont soumis un formulaire, n\'ont aucun deal, et ont resoumis 7+ jours après. Filtres : classe, zone/localité, formulaire candidature.',
      },
      {
        icon: CircleX,
        title: 'Fermé / Perdu',
        desc: 'Bouton pour marquer un deal comme "Fermé/Perdu" directement depuis le Check RDV. Ajoute une note automatique.',
      },
      {
        icon: RefreshCw,
        title: 'Synchronisation',
        desc: 'Synchronisation des contacts et transactions. Sync rapide (delta) ou sync complet. Suivi en temps réel du nombre de contacts/deals synchronisés.',
      },
      {
        icon: FileText,
        title: 'Gestion des contenus',
        desc: 'Personnaliser les cartes de la page de booking publique : icônes, titres, descriptions, boutons CTA, tags et formations associées.',
      },
    ],
  },
  {
    id: 'crm',
    icon: <Search size={18} />,
    title: 'CRM — Contacts & Transactions',
    color: '#4cabdb',
    roles: ['admin'],
    items: [
      {
        icon: Users,
        title: 'Vue Contacts (156K+)',
        desc: 'Table paginée de tous les contacts du CRM. Colonnes personnalisables (drag & drop) : contact, téléphone, statut lead, classe, origine, formation souhaitée, zone, département, dates de création (contact + deal), closer, télépro, étape du deal.',
      },
      {
        icon: ListFilter,
        title: 'Filtres avancés',
        desc: 'Système de filtres avancés avec groupes ET/OU. Recherche du champ à filtrer via un panneau de recherche. Opérateurs : est, n\'est pas, est parmi, n\'est aucun de, contient, est vide, n\'est pas vide. Vues sauvegardées pour retrouver ses filtres.',
      },
      {
        icon: EyeOff,
        title: 'Équipe externe masquée',
        desc: 'Bouton toggle pour exclure les contacts/deals dont le propriétaire, closer ou télépro appartient à l\'équipe externe. Exclut à la fois par owner ID du contact et par closer/télépro du deal.',
      },
      {
        icon: Contact,
        title: 'Fiche contact détaillée',
        desc: 'Clic sur un contact pour ouvrir sa fiche complète : infos personnelles, formation souhaitée, classe, coordonnées, deal associé (étape, closer, télépro), lien direct vers la fiche.',
      },
      {
        icon: CalendarPlus,
        title: 'Prise de RDV inline',
        desc: 'Depuis la fiche contact, prendre un RDV directement sans quitter le CRM. Choix du créneau, type de meeting (visio/tel/présentiel), formation. Le RDV est automatiquement lié au bon contact.',
      },
      {
        icon: Download,
        title: 'Export CSV',
        desc: 'Export paginé de tous les contacts filtrés (pas de limite de 10K). Choix des colonnes à exporter. Fichier CSV encodé UTF-8 avec séparateur point-virgule pour Excel.',
      },
      {
        icon: Bookmark,
        title: 'Vues sauvegardées',
        desc: 'Créer et nommer des vues avec des filtres pré-configurés. Basculer entre les vues en un clic. Mise à jour des filtres d\'une vue existante.',
      },
    ],
  },
  {
    id: 'integrations',
    icon: <Plug size={18} />,
    title: 'Intégrations CRM',
    color: '#f97316',
    roles: ['admin'],
    items: [
      {
        icon: GitBranch,
        title: 'Pipeline de deals',
        desc: 'RDV Pris \u2192 A Replanifier \u2192 Délai de réflexion \u2192 Pré-inscription \u2192 Finalisation \u2192 Inscription confirmée. Chaque changement de statut dans l\'app met à jour l\'étape de la transaction.',
      },
      {
        icon: UserCheck,
        title: 'Contacts',
        desc: 'Création/mise à jour automatique des contacts. Propriétés sync : département, classe actuelle, formation demandée, email parent, owner (closer), teleprospecteur.',
      },
      {
        icon: StickyNote,
        title: 'Notes & Engagements',
        desc: 'Notes de booking, notes d\'appel, changements de statut, suivi closer — tous loggés comme activités sur la transaction.',
      },
      {
        icon: Link2,
        title: 'Liens directs',
        desc: 'Liens raccourci vers la fiche contact ou transaction depuis chaque carte de la plateforme.',
      },
    ],
  },
  {
    id: 'sms',
    icon: <MessageSquare size={18} />,
    title: 'Automatisations SMS',
    color: '#06b6d4',
    roles: ['admin', 'closer', 'telepro'],
    items: [
      {
        icon: Clock,
        title: 'SMS Confirmation (48h avant)',
        desc: 'Envoi automatique avec lien de confirmation. Le prospect confirme ou replanifie.',
      },
      {
        icon: Bell,
        title: 'SMS Relance (24h avant)',
        desc: 'Si pas de confirmation, relance automatique 24h avant le RDV.',
      },
      {
        icon: BellRing,
        title: 'SMS Rappel (1h + 5min avant)',
        desc: 'Pour visio/téléphone uniquement. Rappel avec lien Jitsi ou "on va vous appeler".',
      },
      {
        icon: Sunrise,
        title: 'SMS Matinal (jour J)',
        desc: 'Rappel le matin du RDV. Contenu adapté au type : adresse + code d\'accès (présentiel), lien Jitsi (visio), ou rappel appel (tel).',
      },
      {
        icon: Ban,
        title: 'Auto No-Show (2h du matin)',
        desc: 'Automatique chaque nuit : si 30+ min après l\'heure du RDV et toujours "confirmé" → passage en no-show + transaction en "A replanifier" + SMS de replanification envoyé 24h après.',
      },
    ],
  },
  {
    id: 'meetings',
    icon: <Video size={18} />,
    title: 'Types de Meeting',
    color: '#ec4899',
    roles: ['admin', 'closer', 'telepro'],
    items: [
      {
        icon: Video,
        title: 'Visio (Jitsi via meet.ffmuc.net)',
        desc: 'Lien auto-généré au format DiplomaSanteRDV[random]. Le prospect rejoint directement depuis le SMS. Intégration Jitsi dans l\'app pour le closer.',
      },
      {
        icon: Phone,
        title: 'Téléphone',
        desc: 'L\'équipe appelle le prospect. SMS de rappel adapté ("notre équipe va vous contacter").',
      },
      {
        icon: MapPin,
        title: 'Présentiel',
        desc: 'SMS avec adresse + code d\'accès du local. Configurable via variables d\'env (PREPA_ADDRESS, PREPA_CODE).',
      },
    ],
  },
  {
    id: 'statuts',
    icon: <BarChart3 size={18} />,
    title: 'Cycle de vie d\'un RDV',
    color: '#eab308',
    roles: ['admin', 'closer', 'telepro'],
    items: [
      { dot: crmV2Outcomes.non_assigne, title: 'Non assigné', desc: 'Le RDV est créé mais aucun closer n\'est assigné. Visible dans la file d\'attente admin.' },
      { dot: '#4cabdb', title: 'Confirmé (assigné)', desc: 'Un closer est assigné. En attente de confirmation prospect.' },
      { dot: crmV2Outcomes.confirme, title: 'Confirmé prospect', desc: 'Le prospect a cliqué "Oui" dans le SMS de confirmation.' },
      { dot: crmV2Outcomes.no_show, title: 'No-show', desc: 'Le prospect ne s\'est pas présenté. Auto-détecté 30 min après l\'heure.' },
      { dot: crmV2Outcomes.a_travailler, title: 'A travailler', desc: 'Le prospect est intéressé mais pas encore prêt. Suivi nécessaire.' },
      { dot: crmV2Outcomes.pre_positif, title: 'Pré-positif', desc: 'Signal fort d\'intérêt. Pré-inscription en cours.' },
      { dot: crmV2Outcomes.positif, title: 'Positif', desc: 'Inscription confirmée.' },
      { dot: crmV2Outcomes.negatif, title: 'Négatif', desc: 'Pas intéressé. Raison + détail enregistrés.' },
      { dot: crmV2.textFaint, title: 'Annulé', desc: 'RDV annulé par le closer ou le prospect.' },
    ],
  },
]

const ROLE_TITLES: Record<string, string> = {
  admin: 'Guide de la Plateforme',
  closer: 'Guide Closer',
  telepro: 'Guide Télépro',
}

export default function PlatformGuide({ onClose, role = 'admin' }: Props) {
  const isMobile = useIsMobile()
  const filteredSections = SECTIONS.filter(s => !s.roles || s.roles.includes(role))
  const [openSection, setOpenSection] = useState<string | null>(filteredSections[0]?.id ?? null)

  return (
    <PanelShell
      variant="modal"
      width={900}
      onClose={onClose}
      icon={<Zap size={16} />}
      title={ROLE_TITLES[role] || 'Guide de la Plateforme'}
      subtitle="RDV Agenda — Diploma Santé"
      footer={
        <div style={{ width: '100%', textAlign: 'center', fontSize: 12, color: crmV2.textFaint }}>
          RDV Agenda — Diploma Santé © 2026
        </div>
      }
    >
      {/* Chiffres clés — admin uniquement */}
      {role === 'admin' && (
        <CrmV2KpiGrid>
          {[
            { label: 'Rôles', value: '4', detail: 'Prospect, Télépro, Closer, Admin', icon: <Users size={15} /> },
            { label: 'Intégrations', value: '4', detail: 'CRM, Jitsi, SMS, Email', icon: <Plug size={15} /> },
            { label: 'Automatisations', value: '5', detail: 'SMS automatiques + Auto no-show', icon: <MessageSquare size={15} /> },
            { label: 'Modules', value: '9', detail: 'Planning, CRM, Repop, Doublons…', icon: <Package size={15} /> },
          ].map(s => (
            <CrmV2KpiCard key={s.label} label={s.label} value={s.value} detail={s.detail} icon={s.icon} color={crmV2.goldDark} />
          ))}
        </CrmV2KpiGrid>
      )}

      {/* Sections repliables */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filteredSections.map(section => {
          const isOpen = openSection === section.id
          return (
            <div key={section.id} style={{
              background: crmV2.bg,
              border: `1px solid ${isOpen ? hexA(section.color, 0.40) : crmV2.border}`,
              borderRadius: crmV2.radiusLg,
              boxShadow: crmV2.shadow,
              overflow: 'hidden',
              transition: 'border-color 0.2s',
            }}>
              <button
                type="button"
                onClick={() => setOpenSection(isOpen ? null : section.id)}
                aria-expanded={isOpen}
                style={{
                  width: '100%', background: 'transparent', border: 'none',
                  padding: isMobile ? '10px 12px' : '12px 16px', minHeight: 56,
                  display: 'flex', alignItems: 'center', gap: 12,
                  cursor: 'pointer', color: crmV2.text, fontFamily: 'inherit',
                }}
              >
                <span style={{
                  width: 34, height: 34, borderRadius: 10, background: hexA(section.color, 0.12),
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: section.color, flexShrink: 0,
                }}>
                  {section.icon}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, flex: 1, textAlign: 'left', minWidth: 0 }}>
                  {section.title}
                </span>
                <span style={{
                  background: hexA(section.color, 0.12), borderRadius: 999, padding: '1px 8px',
                  fontSize: 11, fontWeight: 700, color: section.color, flexShrink: 0,
                }}>
                  {section.items.length}
                </span>
                <ChevronDown size={16} color={crmV2.textFaint} style={{ transform: isOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s', flexShrink: 0 }} />
              </button>

              {isOpen && (
                <div style={{ padding: isMobile ? '0 12px 12px' : '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {section.items.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      background: crmV2.bgHover, border: `1px solid ${crmV2.borderLight}`,
                      borderRadius: 12, padding: '12px 14px',
                    }}>
                      <GuideMarker item={item} color={section.color} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: crmV2.text, marginBottom: 3 }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: 13, color: crmV2.textMuted, lineHeight: 1.6 }}>
                          {item.desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </PanelShell>
  )
}

/** Repère d'un élément : icône Lucide, numéro d'étape ou pastille de statut. */
function GuideMarker({ item, color }: { item: Section['items'][number]; color: string }) {
  if (item.dot) {
    return (
      <span style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: item.dot, boxShadow: `0 0 0 4px ${hexA(item.dot, 0.15)}` }} />
      </span>
    )
  }
  if (item.step) {
    return (
      <span style={{
        width: 28, height: 28, borderRadius: '50%', background: color, color: '#fff', flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
      }}>
        {item.step}
      </span>
    )
  }
  const Icon = item.icon ?? FileText
  return (
    <span style={{
      width: 28, height: 28, borderRadius: 8, background: hexA(color, 0.12), color, flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon size={15} />
    </span>
  )
}
