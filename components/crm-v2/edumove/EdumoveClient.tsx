'use client'

/**
 * Onglet Edumove du CRM : tout le suivi des candidatures Edumove au même
 * endroit — dossiers (files « À faire », pipeline, panneau dossier), mails
 * (modèles, envoi groupé), règles des facs et automatisations.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Link2 } from 'lucide-react'
import { CrmV2Body, CrmV2Button, CrmV2Header, CrmV2Page, CrmV2Tabs } from '@/components/crm-v2/primitives'
import type { EdumoveMailTemplate } from '@/lib/edumove-mail-shared'
import { EDUMOVE_DEFAULT_TEMPLATES } from '@/lib/edumove-mail-shared'
import type { DossierLite } from './types'
import EdumoveDossiersTab from './EdumoveDossiersTab'
import EdumoveMailModal from './EdumoveMailModal'
import EdumoveModelesTab from './EdumoveModelesTab'
import EdumoveReglesTab from './EdumoveReglesTab'
import EdumoveAutomatisationsTab from './EdumoveAutomatisationsTab'

type Tab = 'dossiers' | 'modeles' | 'regles' | 'automatisations'
const TABS: Tab[] = ['dossiers', 'modeles', 'regles', 'automatisations']

export default function EdumoveClient() {
  const router = useRouter()
  const params = useSearchParams()
  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'dossiers'
  const setTab = (t: string) => {
    const q = new URLSearchParams(params.toString())
    if (t === 'dossiers') q.delete('tab'); else q.set('tab', t)
    router.replace(`/admin/crm-v2/edumove${q.toString() ? `?${q}` : ''}`, { scroll: false })
  }

  const [dossiers, setDossiers] = useState<DossierLite[]>([])
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<EdumoveMailTemplate[]>(EDUMOVE_DEFAULT_TEMPLATES)
  const [customTemplates, setCustomTemplates] = useState(false)
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const [mail, setMail] = useState<{ targets: DossierLite[]; templateId?: string } | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/crm/edumove', { cache: 'no-store' }).catch(() => null)
    const j = r ? await r.json().catch(() => null) : null
    if (!r?.ok || !Array.isArray(j?.dossiers)) {
      setError(r?.status === 403 ? 'Réservé à l’équipe Edumove.' : j?.error || 'Chargement impossible.')
    } else {
      setDossiers(j.dossiers)
      setLastSync(j.lastSync ?? null)
      setError(null)
    }
    setLoading(false)
  }, [])

  const loadTemplates = useCallback(async () => {
    const r = await fetch('/api/crm/edumove/templates', { cache: 'no-store' }).catch(() => null)
    const j = r?.ok ? await r.json().catch(() => null) : null
    if (Array.isArray(j?.templates)) { setTemplates(j.templates); setCustomTemplates(!!j.custom) }
    setTemplatesLoaded(true)
  }, [])

  useEffect(() => {
    // Chargement initial (setState dans les promesses, pas dans le corps de l'effet)
    const t = setTimeout(() => { void load(); void loadTemplates() }, 0)
    return () => clearTimeout(t)
  }, [load, loadTemplates])

  const actifs = dossiers.filter(d => d.stage !== 'archive').length

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Edumove"
        subtitle={loading ? 'Chargement…' : `${actifs} dossier${actifs > 1 ? 's' : ''} actif${actifs > 1 ? 's' : ''}${lastSync ? ` · synchro ${formatDistanceToNow(new Date(lastSync), { locale: fr, addSuffix: true })}` : ''}`}
        actions={
          <CrmV2Button size="sm" icon={<Link2 size={14} />} onClick={() => router.push('/admin/crm-v2/parametres?tab=edumove')}>
            Liens des facs
          </CrmV2Button>
        }
      >
        <CrmV2Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: 'dossiers', label: 'Dossiers', count: actifs || undefined },
            { id: 'modeles', label: 'Modèles de mails', count: templates.length },
            { id: 'regles', label: 'Règles des facs' },
            { id: 'automatisations', label: 'Automatisations' },
          ]}
        />
      </CrmV2Header>
      <CrmV2Body>
        {tab === 'dossiers' && (
          <EdumoveDossiersTab
            dossiers={dossiers}
            loading={loading}
            error={error}
            onReload={load}
            onPatched={(id, patch) => {
              setDossiers(prev => prev.map(d => (d.candidature_id === id ? { ...d, ...patch } : d)))
              void load()
            }}
            onMail={(targets, templateId) => setMail({ targets, templateId })}
          />
        )}
        {tab === 'modeles' && (
          <EdumoveModelesTab
            key={templatesLoaded ? 'charge' : 'defaut'}
            templates={templates}
            custom={customTemplates}
            onSaved={(t, custom) => { setTemplates(t); setCustomTemplates(custom) }}
          />
        )}
        {tab === 'regles' && <EdumoveReglesTab />}
        {tab === 'automatisations' && <EdumoveAutomatisationsTab />}
      </CrmV2Body>

      {mail && (
        <EdumoveMailModal
          targets={mail.targets}
          templates={templates}
          initialTemplateId={mail.templateId}
          onClose={() => setMail(null)}
          onSent={() => { void load() }}
        />
      )}
    </CrmV2Page>
  )
}
