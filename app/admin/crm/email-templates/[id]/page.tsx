'use client'

import { useEffect, useRef, useState, use } from 'react'
import { Save, Send, Mail, Braces } from 'lucide-react'
import EmailEditorVisual, { type EmailEditorVisualRef } from '@/components/EmailEditorVisual'
import { usePageTitle } from '@/components/DocumentTitle'
import { useIsMobile } from '@/lib/useIsMobile'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  CrmV2Page, CrmV2Header, CrmV2Body, CrmV2Button, CrmV2Card, CrmV2Field, CrmV2Input, CrmV2Select,
  CrmV2Spinner, CrmV2StatusPill,
} from '@/components/crm-v2/primitives'
import { MktModal, MktNotice } from '@/components/crm-v2/marketing/ui'

interface Template {
  id: string
  name: string
  description: string | null
  subject: string
  category: string | null
  design_json: unknown
  html_body: string
  text_body: string | null
  thumbnail_url: string | null
}

const CATEGORIES = [
  { value: 'general',       label: 'Général' },
  { value: 'nurturing',     label: 'Nurturing' },
  { value: 'promo',         label: 'Promo' },
  { value: 'transactional', label: 'Transactionnel' },
  { value: 'newsletter',    label: 'Newsletter' },
]

export default function EmailTemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const isMobile = useIsMobile()
  const [tpl, setTpl] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  usePageTitle(tpl?.name)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showTest, setShowTest] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const editorRef = useRef<EmailEditorVisualRef>(null)
  const [editorReady, setEditorReady] = useState(false)
  const [creatingCampaign, setCreatingCampaign] = useState(false)

  useEffect(() => {
    fetch(`/api/email-templates/${id}`)
      .then(r => r.json())
      .then((d: Template) => {
        setTpl(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  // Recharger le design dans Unlayer une fois ce dernier prêt
  useEffect(() => {
    if (!editorReady || !tpl?.design_json) return
    editorRef.current?.loadDesign(tpl.design_json)
  }, [editorReady, tpl?.design_json])

  const update = (patch: Partial<Template>) => {
    setTpl(prev => prev ? { ...prev, ...patch } : prev)
    setDirty(true)
  }

  const save = async () => {
    if (!tpl || !editorRef.current) return
    setSaving(true)
    try {
      const { html, design } = await editorRef.current.exportContent()
      const r = await fetch(`/api/email-templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        tpl.name,
          description: tpl.description,
          subject:     tpl.subject,
          category:    tpl.category,
          html_body:   html,
          design_json: design,
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      setDirty(false)
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : String(e)}`)
    } finally { setSaving(false) }
  }

  const createCampaign = async () => {
    if (!tpl) return
    setCreatingCampaign(true)
    try {
      const full = await fetch(`/api/email-templates/${id}`).then(r => r.json())
      const r = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tpl.name,
          subject: tpl.subject || tpl.name,
          html_body: full.html_body || tpl.html_body,
          text_body: full.text_body,
          design_json: full.design_json,
          template_id: tpl.id,
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      const campaign = await r.json()
      const base = window.location.pathname.includes('/crm-v2/') ? '/admin/crm-v2' : '/admin/crm'
      window.location.href = `${base}/campaigns/${campaign.id}`
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : String(e)}`)
    } finally { setCreatingCampaign(false) }
  }

  const sendTest = async () => {
    if (!testEmail.trim()) return
    setSendingTest(true)
    setTestMsg(null)
    try {
      // On sauvegarde d'abord pour tester ce qui est en base
      await save()
      // Brevo direct via /api/brevo/test (utilise le HTML stocké)
      const r = await fetch('/api/brevo/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testEmail.trim(),
          subject: tpl?.subject || '(Test)',
          html: tpl?.html_body || '',
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      setTestMsg(`E-mail de test envoyé à ${testEmail.trim()}`)
    } catch (e) {
      setTestMsg(`Échec : ${e instanceof Error ? e.message : String(e)}`)
    } finally { setSendingTest(false) }
  }

  const back = { href: '/admin/crm/email-templates', label: 'Modèles email' }
  if (loading) {
    return (
      <CrmV2Page>
        <CrmV2Header back={back} title="Modèle email" />
        <CrmV2Spinner />
      </CrmV2Page>
    )
  }
  if (!tpl) {
    return (
      <CrmV2Page>
        <CrmV2Header back={back} title="Modèle email" />
        <CrmV2Body><MktNotice tone="red">Modèle introuvable.</MktNotice></CrmV2Body>
      </CrmV2Page>
    )
  }

  return (
    <CrmV2Page style={{ display: 'flex', flexDirection: 'column' }}>
      <CrmV2Header
        back={back}
        title={
          // Nom du modèle éditable directement dans le titre
          <input
            value={tpl.name}
            onChange={e => update({ name: e.target.value })}
            aria-label="Nom du modèle"
            style={{
              font: 'inherit', fontSize: isMobile ? 19 : 22, fontWeight: 600, letterSpacing: '-0.02em', color: crmV2.text,
              background: 'transparent', border: '1px solid transparent', borderRadius: crmV2.radius, outline: 'none',
              padding: '2px 8px', margin: '-3px -9px', width: isMobile ? 'calc(100vw - 40px)' : 'min(560px, 50vw)', maxWidth: '100%',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = crmV2.borderStrong; e.currentTarget.style.background = crmV2.bg }}
            onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
          />
        }
        subtitle="Modèle réutilisable dans les campagnes et les e-mails unitaires"
        actions={
          <>
            {dirty && <CrmV2StatusPill label="Non enregistré" color="#b45309" bg="rgba(201,168,76,0.18)" />}
            <CrmV2Button variant="secondary" icon={<Send size={14} />} onClick={() => setShowTest(true)}>Test</CrmV2Button>
            <CrmV2Button variant="secondary" icon={<Mail size={14} />} onClick={createCampaign} disabled={creatingCampaign}>
              {creatingCampaign ? 'Création…' : 'Envoyer via une campagne'}
            </CrmV2Button>
            <CrmV2Button variant="primary" icon={<Save size={14} />} onClick={save} disabled={saving}>
              {saving ? 'Sauvegarde…' : 'Enregistrer'}
            </CrmV2Button>
          </>
        }
      />

      <CrmV2Body style={{ flex: 1 }}>
        {/* Méta : objet, catégorie, description */}
        <CrmV2Card style={{ padding: isMobile ? 14 : 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 7fr) minmax(0, 2fr) minmax(0, 3fr)', gap: '12px 16px' }}>
            <CrmV2Field label="Objet de l’e-mail">
              <CrmV2Input
                value={tpl.subject}
                onChange={e => update({ subject: e.target.value })}
                placeholder="Ex : Bonjour {{prenom}}, votre RDV est confirmé"
              />
            </CrmV2Field>
            <CrmV2Field label="Catégorie">
              <CrmV2Select value={tpl.category || 'general'} onChange={e => update({ category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </CrmV2Select>
            </CrmV2Field>
            <CrmV2Field label="Description (interne)">
              <CrmV2Input
                value={tpl.description || ''}
                onChange={e => update({ description: e.target.value })}
                placeholder="Pour quoi ce modèle ?"
              />
            </CrmV2Field>
          </div>
        </CrmV2Card>

        {/* Variables disponibles */}
        <MktNotice tone="blue" icon={<Braces size={15} />}>
          Variables : <code>{'{{prenom}}'}</code>{' '}
          <code>{'{{nom}}'}</code>{' '}
          <code>{'{{email}}'}</code>{' '}
          <code>{'{{classe}}'}</code>{' '}
          <code>{'{{phone}}'}</code>
          {' — '}elles seront remplacées à l’envoi.
        </MktNotice>

        {/* Éditeur visuel */}
        <CrmV2Card style={{ overflow: 'hidden', flex: 1 }}>
          <EmailEditorVisual
            ref={editorRef}
            initialDesign={tpl.design_json}
            onChange={() => { setDirty(true); if (!editorReady) setEditorReady(true) }}
            height={750}
          />
        </CrmV2Card>
      </CrmV2Body>

      {/* Modal test */}
      <MktModal
        open={showTest}
        onClose={() => setShowTest(false)}
        title="Envoyer un e-mail de test"
        width={440}
        footer={
          <>
            <CrmV2Button variant="secondary" onClick={() => setShowTest(false)}>Fermer</CrmV2Button>
            <CrmV2Button variant="primary" icon={<Send size={14} />} onClick={sendTest} disabled={sendingTest || !testEmail.trim()}>
              {sendingTest ? 'Envoi…' : 'Envoyer'}
            </CrmV2Button>
          </>
        }
      >
        <CrmV2Field label="Adresse de réception">
          <CrmV2Input
            type="email"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="ton@email.fr"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') sendTest() }}
          />
        </CrmV2Field>
        {testMsg && (
          <MktNotice tone={testMsg.startsWith('Échec') ? 'red' : 'blue'}>{testMsg}</MktNotice>
        )}
      </MktModal>
    </CrmV2Page>
  )
}
