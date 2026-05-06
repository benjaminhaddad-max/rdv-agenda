'use client'

import { useState } from 'react'
import {
  X, ChevronRight, ChevronDown,
  CalendarPlus, UserCheck, Phone, Video, MapPin,
  Bell, RefreshCw, Users, Briefcase, AlertTriangle,
  GitMerge, Clock, FileText, BarChart3, Shield,
  Zap, MessageSquare, Search, ExternalLink,
} from 'lucide-react'

type Props = { onClose: () => void; role?: 'admin' | 'closer' | 'telepro' }

type Section = {
  id: string
  icon: React.ReactNode
  title: string
  color: string
  /** Roles qui peuvent voir cette section. Absent = tout le monde */
  roles?: ('admin' | 'closer' | 'telepro')[]
  items: { emoji: string; title: string; desc: string }[]
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
        emoji: '1\uFE0F\u20E3',
        title: 'Page de réservation publique',
        desc: 'Le prospect accède à la page de réservation. Il voit les créneaux disponibles sur 7 jours glissants, choisit un créneau de 30 min, remplit son nom + email + téléphone. Le RDV tombe dans la file d\'attente admin.',
      },
      {
        emoji: '2\uFE0F\u20E3',
        title: 'Création du RDV + Deal HubSpot',
        desc: 'Le RDV est créé et un deal HubSpot est créé automatiquement en "RDV Pris". Le deal est lié au contact HubSpot (créé ou retrouvé par email). Le RDV reste non-assigné jusqu\'à ce que Pascal l\'assigne à un closer depuis la file d\'attente admin.',
      },
      {
        emoji: '3\uFE0F\u20E3',
        title: 'SMS de confirmation (48h avant)',
        desc: 'Un SMS est envoyé 48h avant avec un lien de confirmation. Le prospect peut cliquer "Oui je serai présent" ou "Non, reporter" pour replanifier.',
      },
      {
        emoji: '4\uFE0F\u20E3',
        title: 'SMS de relance (24h avant)',
        desc: 'Si le prospect n\'a pas confirmé via SMS, une relance est envoyée 24h avant.',
      },
      {
        emoji: '5\uFE0F\u20E3',
        title: 'SMS de rappel (1h + 5 min avant)',
        desc: 'Pour les RDV visio/téléphone, un rappel est envoyé 1h puis 5 min avant avec le lien Jitsi ou "l\'équipe va vous appeler".',
      },
      {
        emoji: '6\uFE0F\u20E3',
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
        emoji: '\uD83D\uDCC5',
        title: 'Mon Planning',
        desc: 'Vue semaine (calendrier 8h-18h) ou vue liste chronologique. Chaque RDV affiche : prospect, formation, type de meeting (visio/tel/présentiel), statut, badges couleur.',
      },
      {
        emoji: '\u2795',
        title: 'Nouveau RDV',
        desc: 'Créer un RDV manuellement. Recherche de contact HubSpot par nom/email/tel. Choix formation, type meeting, date/heure. Lien Jitsi auto-généré si visio.',
      },
      {
        emoji: '\uD83D\uDCCB',
        title: 'Historique',
        desc: 'Tous les deals passés du closer. Filtres par stage (A replanifier, Délai réflexion, Fermé/Perdu). Suivi closer : Ne répond plus, A travailler, Pré-positif. Bouton "Reprendre RDV".',
      },
      {
        emoji: '\uD83D\uDD01',
        title: 'Repop',
        desc: 'Journal des prospects qui ont resoumis un formulaire après leur RDV. Timeline visuelle montrant date RDV puis nouveau formulaire.',
      },
      {
        emoji: '\u2699\uFE0F',
        title: 'Disponibilités',
        desc: 'Définir ses créneaux par jour de la semaine (lun-dim). Bloquer des dates (vacances, indispos). Les créneaux sont utilisés par la page de booking publique.',
      },
      {
        emoji: '\uD83D\uDCDD',
        title: 'Rapport post-RDV',
        desc: 'Après chaque RDV : résumé, conseil télépro, statut (no-show, à travailler, pré-positif, positif, négatif). Si négatif : raison + détail. Contact principal, consignes, concurrence, financement, invitation JPO.',
      },
      {
        emoji: '\uD83D\uDCE6',
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
        emoji: '\uD83D\uDCC5',
        title: 'Mon Planning',
        desc: 'Vue des RDV placés par le télépro. Liste chronologique avec badges PASSE / AUJOURD\'HUI. Bouton "Reprendre RDV" pour les no-show.',
      },
      {
        emoji: '\u2795',
        title: 'Nouveau RDV',
        desc: 'Placer un RDV pour un closer. Recherche contact HubSpot, choix formation/type/date. Le deal HubSpot est créé avec le champ teleprospecteur.',
      },
      {
        emoji: '\uD83D\uDCCB',
        title: 'Historique + Suivi',
        desc: 'Deals historiques avec colonnes de suivi (Ne répond plus, A travailler, Pré-positif). Sauvegarde du suivi dans HubSpot.',
      },
      {
        emoji: '\uD83D\uDD01',
        title: 'Repop',
        desc: 'Mêmes fonctionnalités que le closer, filtré sur les deals du télépro.',
      },
      {
        emoji: '\uD83D\uDCE6',
        title: 'Boîte à outils',
        desc: 'Accès aux scripts d\'appel, argumentaires, documents, fiches formations et liens utiles. Organisé par catégories.',
      },
    ],
  },
  {
    id: 'admin',
    icon: <Shield size={18} />,
    title: 'Dashboard Admin (Pascal)',
    color: '#ccac71',
    roles: ['admin'],
    items: [
      {
        emoji: '\uD83D\uDCE5',
        title: 'File d\'attente non-assignés',
        desc: 'Liste en temps réel des RDV sans closer assigné. Filtres par source (Télépro, Online, Admin). Click pour ouvrir le modal d\'assignation avec vérification des dispos du closer.',
      },
      {
        emoji: '\uD83D\uDCC5',
        title: 'Calendrier global',
        desc: 'Vue semaine de TOUS les closers. Code couleur par closer. Click sur un RDV pour voir les détails, changer le statut, réassigner, ajouter des notes.',
      },
      {
        emoji: '\uD83D\uDC65',
        title: 'Gestion Télépros',
        desc: 'Provisionner de nouveaux comptes depuis l\'équipe HubSpot "Télépros". Activer/bannir. Synchroniser les statuts.',
      },
      {
        emoji: '\uD83D\uDCBC',
        title: 'Gestion Closers',
        desc: 'Créer des comptes closer, provisionner depuis HubSpot. Gérer les dispos de chaque closer. Synchroniser les IDs HubSpot.',
      },
      {
        emoji: '\u26A0\uFE0F',
        title: 'Check RDV Closer',
        desc: 'Audit des deals en "RDV Pris" dont la date est passée. Catégories : même personne (télépro=closer), closer assigné, télépro inconnu. Action bulk : passer en "A replanifier".',
      },
      {
        emoji: '\uD83D\uDD34',
        title: 'Doublons contacts',
        desc: 'Détection de contacts HubSpot en double (même tel, même email, noms similaires). Fusion ou ignorer. Détection cross-télépro.',
      },
      {
        emoji: '\uD83D\uDD01',
        title: 'Doublons transactions',
        desc: 'Deals en double pour un même contact. Stratégie de merge : garder le deal au stage le plus avancé. Merge bulk avec confirmation.',
      },
      {
        emoji: '\uD83D\uDCCA',
        title: 'Journal Repop',
        desc: 'Vue complète des repop tous closers/télépros. Onglet "Sans transaction" : contacts qui ont soumis un formulaire, n\'ont aucun deal, et ont resoumis 7+ jours après. Filtres : classe, zone/localité, formulaire candidature.',
      },
      {
        emoji: '\uD83D\uDC80',
        title: 'Fermé / Perdu',
        desc: 'Bouton pour marquer un deal comme "Fermé/Perdu" directement depuis le Check RDV. Ajoute une note HubSpot automatique.',
      },
      {
        emoji: '\uD83D\uDD04',
        title: 'Sync HubSpot',
        desc: 'Synchronisation des contacts et deals depuis HubSpot. Sync rapide (delta) ou sync complet. Suivi en temps réel du nombre de contacts/deals synchronisés.',
      },
      {
        emoji: '\uD83D\uDCCB',
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
        emoji: '\uD83D\uDCCA',
        title: 'Vue Contacts (156K+)',
        desc: 'Table paginée de tous les contacts synchronisés depuis HubSpot. Colonnes personnalisables (drag & drop) : contact, téléphone, statut lead, classe, origine, formation souhaitée, zone, département, dates de création (contact + deal), closer, télépro, étape du deal.',
      },
      {
        emoji: '\uD83D\uDD0D',
        title: 'Filtres avancés (style HubSpot)',
        desc: 'Système de filtres avancés avec groupes ET/OU. Recherche du champ à filtrer via un panneau de recherche (comme HubSpot). Opérateurs : est, n\'est pas, est parmi, n\'est aucun de, contient, est vide, n\'est pas vide. Vues sauvegardées pour retrouver ses filtres.',
      },
      {
        emoji: '\uD83D\uDC65',
        title: 'Équipe externe masquée',
        desc: 'Bouton toggle pour exclure les contacts/deals dont le propriétaire, closer ou télépro appartient à l\'équipe externe. Exclut à la fois par owner ID du contact et par closer/télépro du deal.',
      },
      {
        emoji: '\uD83D\uDCC4',
        title: 'Fiche contact détaillée',
        desc: 'Clic sur un contact pour ouvrir sa fiche complète : infos personnelles, formation souhaitée, classe, coordonnées, deal associé (étape, closer, télépro), lien direct vers HubSpot.',
      },
      {
        emoji: '\uD83D\uDCC5',
        title: 'Prise de RDV inline',
        desc: 'Depuis la fiche contact, prendre un RDV directement sans quitter le CRM. Choix du créneau, type de meeting (visio/tel/présentiel), formation. Le RDV est automatiquement lié au bon contact HubSpot.',
      },
      {
        emoji: '\uD83D\uDCE5',
        title: 'Export CSV',
        desc: 'Export paginé de tous les contacts filtrés (pas de limite de 10K). Choix des colonnes à exporter. Fichier CSV encodé UTF-8 avec séparateur point-virgule pour Excel.',
      },
      {
        emoji: '\uD83D\uDCC8',
        title: 'Vues sauvegardées',
        desc: 'Créer et nommer des vues avec des filtres pré-configurés. Basculer entre les vues en un clic. Mise à jour des filtres d\'une vue existante.',
      },
    ],
  },
  {
    id: 'hubspot',
    icon: <ExternalLink size={18} />,
    title: 'Intégrations HubSpot',
    color: '#f97316',
    roles: ['admin'],
    items: [
      {
        emoji: '\uD83D\uDCCB',
        title: 'Pipeline de deals',
        desc: 'RDV Pris \u2192 A Replanifier \u2192 Délai de réflexion \u2192 Pré-inscription \u2192 Finalisation \u2192 Inscription confirmée. Chaque changement de statut dans l\'app met à jour le stage HubSpot.',
      },
      {
        emoji: '\uD83D\uDC64',
        title: 'Contacts',
        desc: 'Création/mise à jour automatique des contacts. Propriétés sync : département, classe actuelle, formation demandée, email parent, owner (closer), teleprospecteur.',
      },
      {
        emoji: '\uD83D\uDCDD',
        title: 'Notes & Engagements',
        desc: 'Notes de booking, notes d\'appel, changements de statut, suivi closer — tous loggés comme engagements HubSpot sur le deal.',
      },
      {
        emoji: '\uD83D\uDD17',
        title: 'Liens directs',
        desc: 'Liens raccourci vers la fiche contact ou deal HubSpot depuis chaque carte de la plateforme.',
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
        emoji: '\u23F0',
        title: 'SMS Confirmation (48h avant)',
        desc: 'Envoi automatique avec lien de confirmation. Le prospect confirme ou replanifie.',
      },
      {
        emoji: '\uD83D\uDD14',
        title: 'SMS Relance (24h avant)',
        desc: 'Si pas de confirmation, relance automatique 24h avant le RDV.',
      },
      {
        emoji: '\uD83C\uDFAC',
        title: 'SMS Rappel (1h + 5min avant)',
        desc: 'Pour visio/téléphone uniquement. Rappel avec lien Jitsi ou "on va vous appeler".',
      },
      {
        emoji: '\uD83C\uDF05',
        title: 'SMS Matinal (jour J)',
        desc: 'Rappel le matin du RDV. Contenu adapté au type : adresse + code d\'accès (présentiel), lien Jitsi (visio), ou rappel appel (tel).',
      },
      {
        emoji: '\uD83D\uDEAB',
        title: 'Auto No-Show (2h du matin)',
        desc: 'Automatique chaque nuit : si 30+ min après l\'heure du RDV et toujours "confirmé" → passage en no-show + deal HubSpot en "A replanifier" + SMS de replanification envoyé 24h après.',
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
        emoji: '\uD83C\uDFA5',
        title: 'Visio (Jitsi via meet.ffmuc.net)',
        desc: 'Lien auto-généré au format DiplomaSanteRDV[random]. Le prospect rejoint directement depuis le SMS. Intégration Jitsi dans l\'app pour le closer.',
      },
      {
        emoji: '\uD83D\uDCDE',
        title: 'Téléphone',
        desc: 'L\'équipe appelle le prospect. SMS de rappel adapté ("notre équipe va vous contacter").',
      },
      {
        emoji: '\uD83C\uDFE2',
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
      { emoji: '\u26AA', title: 'Non assigné', desc: 'Le RDV est créé mais aucun closer n\'est assigné. Visible dans la file d\'attente admin.' },
      { emoji: '\uD83D\uDD35', title: 'Confirmé (assigné)', desc: 'Un closer est assigné. En attente de confirmation prospect.' },
      { emoji: '\u2705', title: 'Confirmé prospect', desc: 'Le prospect a cliqué "Oui" dans le SMS de confirmation.' },
      { emoji: '\uD83D\uDFE1', title: 'No-show', desc: 'Le prospect ne s\'est pas présenté. Auto-détecté 30 min après l\'heure.' },
      { emoji: '\uD83D\uDFE0', title: 'A travailler', desc: 'Le prospect est intéressé mais pas encore prêt. Suivi nécessaire.' },
      { emoji: '\u2B50', title: 'Pré-positif', desc: 'Signal fort d\'intérêt. Pré-inscription en cours.' },
      { emoji: '\uD83D\uDFE2', title: 'Positif', desc: 'Inscription confirmée.' },
      { emoji: '\uD83D\uDD34', title: 'Négatif', desc: 'Pas intéressé. Raison + détail enregistrés.' },
      { emoji: '\u274C', title: 'Annulé', desc: 'RDV annulé par le closer ou le prospect.' },
    ],
  },
]

const ROLE_TITLES: Record<string, string> = {
  admin: 'Guide de la Plateforme',
  closer: 'Guide Closer',
  telepro: 'Guide Télépro',
}

export default function PlatformGuide({ onClose, role = 'admin' }: Props) {
  const filteredSections = SECTIONS.filter(s => !s.roles || s.roles.includes(role))
  const [openSection, setOpenSection] = useState<string | null>(filteredSections[0]?.id ?? null)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 16px', overflowY: 'auto',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 20,
        width: '100%', maxWidth: 900,
        padding: '32px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        position: 'relative',
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 20, right: 20,
            background: '#ffffff', border: '1px solid #e2e8f0',
            borderRadius: 8, padding: '6px 8px',
            cursor: 'pointer', color: '#64748b', display: 'flex',
          }}
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: 'rgba(204,172,113,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22,
            }}>
              <Zap size={22} style={{ color: '#ccac71' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', margin: 0 }}>
                {ROLE_TITLES[role] || 'Guide de la Plateforme'}
              </h2>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                RDV Agenda — Diploma Sante
              </p>
            </div>
          </div>

          {/* Stats banner — admin only */}
          {role === 'admin' && (
            <div style={{
              display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap',
            }}>
              {[
                { label: 'Roles', value: '4', detail: 'Prospect, Telepro, Closer, Admin' },
                { label: 'Integrations', value: '4', detail: 'HubSpot, Jitsi, SMS, CRM' },
                { label: 'Automatisations', value: '5', detail: 'SMS automatiques + Auto no-show' },
                { label: 'Modules', value: '9', detail: 'Planning, CRM, Repop, Doublons…' },
              ].map(s => (
                <div key={s.label} style={{
                  flex: '1 1 180px',
                  background: '#ffffff', border: '1px solid #e2e8f0',
                  borderRadius: 12, padding: '12px 16px',
                }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#ccac71' }}>{s.value}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{s.detail}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Accordion sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredSections.map(section => {
            const isOpen = openSection === section.id
            return (
              <div key={section.id} style={{
                background: '#ffffff',
                border: `1px solid ${isOpen ? `rgba(${hexToRgb(section.color)},0.4)` : '#e2e8f0'}`,
                borderRadius: 12,
                overflow: 'hidden',
                transition: 'border-color 0.2s',
              }}>
                {/* Section header */}
                <button
                  onClick={() => setOpenSection(isOpen ? null : section.id)}
                  style={{
                    width: '100%', background: 'transparent', border: 'none',
                    padding: '14px 18px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    cursor: 'pointer', color: '#1e293b',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: 10,
                    background: `rgba(${hexToRgb(section.color)},0.12)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: section.color, flexShrink: 0,
                  }}>
                    {section.icon}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, flex: 1, textAlign: 'left' }}>
                    {section.title}
                  </span>
                  <span style={{
                    background: `rgba(${hexToRgb(section.color)},0.15)`,
                    borderRadius: 10, padding: '2px 8px',
                    fontSize: 11, fontWeight: 700, color: section.color,
                  }}>
                    {section.items.length}
                  </span>
                  {isOpen
                    ? <ChevronDown size={16} style={{ color: '#64748b' }} />
                    : <ChevronRight size={16} style={{ color: '#64748b' }} />
                  }
                </button>

                {/* Section content */}
                {isOpen && (
                  <div style={{ padding: '0 18px 16px' }}>
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 8,
                    }}>
                      {section.items.map((item, i) => (
                        <div key={i} style={{
                          display: 'flex', gap: 12, alignItems: 'flex-start',
                          background: '#f8fafc',
                          borderRadius: 10, padding: '12px 14px',
                          border: '1px solid #f1f5f9',
                        }}>
                          <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.4 }}>
                            {item.emoji}
                          </span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 3 }}>
                              {item.title}
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                              {item.desc}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 24, textAlign: 'center',
          fontSize: 11, color: '#64748b', lineHeight: 1.6,
        }}>
          RDV Agenda — Diploma Santé © 2026
        </div>
      </div>
    </div>
  )
}

function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return '255,255,255'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `${r},${g},${b}`
}
