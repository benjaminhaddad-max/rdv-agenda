'use client'

import { useEffect, useState } from 'react'
import { FileText, Plus, Trash2, Copy, Send } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Page, CrmV2Header, CrmV2Body, CrmV2TableCard, CrmV2Table, CrmV2Th, CrmV2Td, CrmV2Tr,
  CrmV2Search, CrmV2Button, CrmV2StatusPill, CrmV2Empty, CrmV2Spinner, CrmV2Field, CrmV2Input, CrmV2Select,
} from '@/components/crm-v2/primitives'
import {
  MKT_TONES, type MktTone, MktNameCell, MktMobileRow, MktIconBox, MktIconButton, MktMenu, MktModal, MktSelectPill,
  mutedCell, useCrmBase,
} from '@/components/crm-v2/marketing/ui'

interface Template {
  id: string
  name: string
  description: string | null
  subject: string
  category: string | null
  thumbnail_url: string | null
  created_at: string
  updated_at: string
}

const CATEGORIES: { value: string; label: string; tone: MktTone }[] = [
  { value: 'general',       label: 'Général',        tone: 'grey' },
  { value: 'nurturing',     label: 'Nurturing',      tone: 'purple' },
  { value: 'promo',         label: 'Promo',          tone: 'gold' },
  { value: 'transactional', label: 'Transactionnel', tone: 'blue' },
  { value: 'newsletter',    label: 'Newsletter',     tone: 'green' },
]

function categoryMeta(cat: string | null) {
  const c = CATEGORIES.find(x => x.value === cat)
  return { label: c?.label ?? cat ?? '—', ...MKT_TONES[c?.tone ?? 'grey'] }
}

/** Vignette 28 px (ou 36 px sur mobile) : miniature du modèle si elle existe. */
function Thumb({ t, size = 28 }: { t: Template; size?: number }) {
  return (
    <MktIconBox size={size}>
      {t.thumbnail_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={t.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <FileText size={size > 30 ? 16 : 14} />}
    </MktIconBox>
  )
}

export default function EmailTemplatesPage() {
  const isMobile = useIsMobile()
  const base = useCrmBase()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('general')
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/email-templates')
      const d = await r.json()
      setTemplates(Array.isArray(d) ? d : [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const createTemplate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const r = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), category: newCategory }),
      })
      if (!r.ok) throw new Error(await r.text())
      const tpl = await r.json()
      window.location.href = `${base}/email-templates/${tpl.id}`
    } finally { setCreating(false) }
  }

  const duplicate = async (t: Template) => {
    const full = await fetch(`/api/email-templates/${t.id}`).then(r => r.json())
    const r = await fetch('/api/email-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${t.name} (copie)`,
        description: full.description,
        subject: full.subject,
        design_json: full.design_json,
        html_body: full.html_body,
        text_body: full.text_body,
        category: full.category,
      }),
    })
    if (r.ok) load()
  }

  const sendViaCampaign = async (t: Template) => {
    setCreating(true)
    try {
      const full = await fetch(`/api/email-templates/${t.id}`).then(r => r.json())
      const r = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: t.name,
          subject: full.subject || t.subject || t.name,
          html_body: full.html_body,
          text_body: full.text_body,
          design_json: full.design_json,
          template_id: t.id,
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      const campaign = await r.json()
      window.location.href = `${base}/campaigns/${campaign.id}`
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : String(e)}`)
    } finally { setCreating(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Supprimer définitivement ce modèle ?')) return
    const r = await fetch(`/api/email-templates/${id}`, { method: 'DELETE' })
    if (r.ok) setTemplates(prev => prev.filter(x => x.id !== id))
  }

  const q = search.trim().toLowerCase()
  const filtered = templates.filter(t => {
    if (catFilter && t.category !== catFilter) return false
    if (q) return t.name.toLowerCase().includes(q) || (t.subject ?? '').toLowerCase().includes(q)
    return true
  })
  const ago = (iso: string) => formatDistanceToNow(new Date(iso), { locale: fr, addSuffix: true })
  const open = (t: Template) => { window.location.href = `${base}/email-templates/${t.id}` }

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Modèles email"
        subtitle={`${templates.length} modèle${templates.length > 1 ? 's' : ''} — réutilisables dans les campagnes et les e-mails unitaires`}
        actions={
          <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowNew(true)}>
            Nouveau modèle
          </CrmV2Button>
        }
      />
      <CrmV2Body>
        <CrmV2TableCard
          toolbar={
            <>
              <CrmV2Search
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un modèle…"
                style={isMobile ? { flex: '1 1 100%' } : undefined}
              />
              <MktSelectPill value={catFilter} active={!!catFilter} onChange={e => setCatFilter(e.target.value)} aria-label="Catégorie">
                <option value="">Catégorie</option>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </MktSelectPill>
            </>
          }
        >
          {loading ? (
            <CrmV2Spinner />
          ) : templates.length === 0 ? (
            <CrmV2Empty
              icon={<FileText size={26} />}
              title="Aucun modèle"
              description="Crée ton premier modèle d’e-mail réutilisable."
              action={<CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowNew(true)}>Nouveau modèle</CrmV2Button>}
            />
          ) : filtered.length === 0 ? (
            <CrmV2Empty title="Aucun modèle ne correspond aux filtres." />
          ) : isMobile ? (
            <div>
              {filtered.map(t => (
                <MktMobileRow
                  key={t.id}
                  href={`${base}/email-templates/${t.id}`}
                  icon={<Thumb t={t} size={36} />}
                  title={t.name}
                  subtitle={t.subject ? `Objet : ${t.subject}` : `Modifié ${ago(t.updated_at)}`}
                  actions={
                    <MktMenu items={[
                      { label: 'Envoyer via une campagne', icon: <Send size={14} />, onClick: () => sendViaCampaign(t), disabled: creating },
                      { label: 'Dupliquer', icon: <Copy size={14} />, onClick: () => duplicate(t) },
                      { label: 'Supprimer', icon: <Trash2 size={14} />, onClick: () => remove(t.id), danger: true },
                    ]} />
                  }
                />
              ))}
            </div>
          ) : (
            <CrmV2Table>
              <thead>
                <tr>
                  <CrmV2Th>Modèle</CrmV2Th>
                  <CrmV2Th>Objet</CrmV2Th>
                  <CrmV2Th>Catégorie</CrmV2Th>
                  <CrmV2Th>Modifié</CrmV2Th>
                  <CrmV2Th style={{ width: 130 }}>{''}</CrmV2Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const cat = categoryMeta(t.category)
                  return (
                    <CrmV2Tr key={t.id} onClick={() => open(t)}>
                      <CrmV2Td style={{ maxWidth: 340 }}>
                        <MktNameCellThumb t={t} />
                      </CrmV2Td>
                      <CrmV2Td style={{ ...mutedCell, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.subject || '—'}</CrmV2Td>
                      <CrmV2Td><CrmV2StatusPill label={cat.label} color={cat.color} bg={cat.bg} /></CrmV2Td>
                      <CrmV2Td style={mutedCell}>{ago(t.updated_at)}</CrmV2Td>
                      <CrmV2Td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <MktIconButton title="Envoyer via une campagne" onClick={() => sendViaCampaign(t)} disabled={creating}><Send size={14} /></MktIconButton>
                          <MktIconButton title="Dupliquer" onClick={() => duplicate(t)}><Copy size={14} /></MktIconButton>
                          <MktIconButton title="Supprimer" danger onClick={() => remove(t.id)}><Trash2 size={14} /></MktIconButton>
                        </div>
                      </CrmV2Td>
                    </CrmV2Tr>
                  )
                })}
              </tbody>
            </CrmV2Table>
          )}
        </CrmV2TableCard>
      </CrmV2Body>

      <MktModal
        open={showNew}
        onClose={() => setShowNew(false)}
        title="Nouveau modèle"
        width={440}
        footer={
          <>
            <CrmV2Button variant="secondary" onClick={() => setShowNew(false)}>Annuler</CrmV2Button>
            <CrmV2Button variant="primary" onClick={createTemplate} disabled={creating || !newName.trim()}>
              {creating ? 'Création…' : 'Créer'}
            </CrmV2Button>
          </>
        }
      >
        <CrmV2Field label="Nom du modèle">
          <CrmV2Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Ex : Relance après RDV no-show"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') createTemplate() }}
          />
        </CrmV2Field>
        <CrmV2Field label="Catégorie">
          <CrmV2Select value={newCategory} onChange={e => setNewCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </CrmV2Select>
        </CrmV2Field>
      </MktModal>
    </CrmV2Page>
  )
}

/** Cellule « Modèle » : miniature + lien vers l'éditeur + description. */
function MktNameCellThumb({ t }: { t: Template }) {
  return (
    <MktNameCell
      icon={t.thumbnail_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={t.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <FileText size={14} />}
      href={`/admin/crm/email-templates/${t.id}`}
      title={t.name}
      subtitle={t.description || undefined}
    />
  )
}
