'use client'

import { Phone } from 'lucide-react'
import TeamMemberManager, { type TeamConfig } from '@/components/crm-v2/panels/TeamMemberManager'

const CONFIG: TeamConfig = {
  endpoint: '/api/admin/telepros',
  title: 'Équipe Télépros',
  subtitle: 'Accès : espace télépro uniquement (prise de RDV) + fiches contact/transaction ouvertes depuis la recherche. Pas d’accès au CRM admin.',
  icon: <Phone size={16} />,
  noun: 'télépro',
  column: 'Télépro',
  impersonateUrl: tp => `/telepro?preview_as=${tp.id}`,
  impersonateTitle: 'Se connecter en tant que ce télépro',
}

export default function TeleproManager({ onClose }: { onClose: () => void }) {
  return <TeamMemberManager config={CONFIG} onClose={onClose} />
}
