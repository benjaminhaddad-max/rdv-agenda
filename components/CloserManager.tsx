'use client'

import { Briefcase } from 'lucide-react'
import TeamMemberManager, { type TeamConfig } from '@/components/crm-v2/panels/TeamMemberManager'

const CONFIG: TeamConfig = {
  endpoint: '/api/admin/closers',
  title: 'Équipe Closers',
  subtitle: 'Accès : son propre agenda closer uniquement + fiches contact/transaction ouvertes depuis la recherche. Pas d’accès au CRM admin.',
  icon: <Briefcase size={16} />,
  noun: 'closer',
  column: 'Closer',
  impersonateUrl: cl => `/closer/${cl.slug}`,
  impersonateTitle: 'Se connecter en tant que ce closer',
}

export default function CloserManager({ onClose }: { onClose: () => void }) {
  return <TeamMemberManager config={CONFIG} onClose={onClose} />
}
