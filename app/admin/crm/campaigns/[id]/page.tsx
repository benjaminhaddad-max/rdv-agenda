'use client'

import { useEffect, useState, useCallback, use, useRef } from 'react'
import {
  Mail, Send, Save, Eye, Users,
  CheckCircle2, AlertCircle, AlertTriangle, Clock, FileText, TestTube2, Palette, Zap, Download, Tag,
  Calendar, MousePointerClick, Inbox, UserMinus, Ban, Info,
} from 'lucide-react'
import EmailEditorVisual, { type EmailEditorVisualRef } from '@/components/EmailEditorVisual'
import CampaignRecipientsTab from '@/components/crm/CampaignRecipientsTab'
import { usePageTitle } from '@/components/DocumentTitle'
import { useIsMobile } from '@/lib/useIsMobile'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  CrmV2Page, CrmV2Header, CrmV2Tabs, CrmV2Body, CrmV2Button, CrmV2Card, CrmV2Spinner, CrmV2StatusPill,
  CrmV2KpiGrid, CrmV2KpiCard, CrmV2Field, CrmV2Input, CrmV2Search, CrmV2CloseButton, CrmV2SectionLabel,
} from '@/components/crm-v2/primitives'
import { MKT_TONES, MktModal, MktNotice } from '@/components/crm-v2/marketing/ui'

interface Campaign {
  id: string
  name: string
  subject: string
  preheader: string | null
  sender_email: string
  sender_name: string
  reply_to: string | null
  html_body: string
  text_body: string | null
  design_json: unknown
  template_id: string | null
  status: string
  scheduled_at: string | null
  sent_at: string | null
  total_recipients: number
  total_sent: number
  total_delivered: number
  total_unique_opens: number
  total_unique_clicks: number
  total_bounces: number
  total_unsubscribes: number
  updated_at: string
  // Ciblage
  segment_ids: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra_filters: Record<string, any> | null
  manual_contact_ids: string[]
}


const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title></title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Inter,Arial,sans-serif;color:#222;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;color:#ffffff;font-size:24px;">Bonjour {{prenom}} 👋</h1>
              <p style="margin:0 0 16px;line-height:1.6;font-size:15px;">
                Votre message ici. Vous pouvez utiliser les variables suivantes :
                <strong>{{prenom}}</strong>, <strong>{{nom}}</strong>, <strong>{{email}}</strong>.
              </p>
              <p style="margin:0 0 24px;line-height:1.6;font-size:15px;">
                Bien cordialement,<br>
                <strong>L'équipe Diploma Santé</strong>
              </p>
              <a href="https://diploma-sante.fr" style="display:inline-block;background:#C9A84C;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;">
                En savoir plus
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px;background:#f4f4f7;font-size:12px;color:#888;text-align:center;">
              Diploma Santé — 100 quai de la Rapée, 75012 Paris<br>
              <a href="#" style="color:#888;">Se désabonner</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  usePageTitle(campaign?.name)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [tab, setTab] = useState<'content' | 'preview' | 'recipients' | 'stats'>('content')
  const [testEmail, setTestEmail] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const editorRef = useRef<EmailEditorVisualRef>(null)
  const [showSendModal, setShowSendModal] = useState(false)
  const [sending, setSending] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sendStatus, setSendStatus] = useState<{ ok: boolean; sent: number; failed: number; pending: number; errors?: any[] } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${id}`)
      const data = await res.json()
      if (!data.html_body) data.html_body = DEFAULT_HTML
      setCampaign(data)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const update = (patch: Partial<Campaign>) => {
    setCampaign(prev => prev ? { ...prev, ...patch } : prev)
    setDirty(true)
  }

  const save = async () => {
    if (!campaign) return
    setSaving(true)
    try {
      let htmlBody = campaign.html_body
      let designJson = campaign.design_json
      const keepRawHtml = !!campaign.template_id && !!campaign.html_body
      if (editorRef.current && !keepRawHtml) {
        const exported = await editorRef.current.exportContent()
        if (exported.html) {
          htmlBody = exported.html
          designJson = exported.design
          setCampaign(prev => prev ? { ...prev, html_body: exported.html, design_json: exported.design } : prev)
        }
      }

      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: campaign.name,
          subject: campaign.subject,
          preheader: campaign.preheader,
          sender_email: campaign.sender_email,
          sender_name: campaign.sender_name,
          reply_to: campaign.reply_to,
          template_id: campaign.template_id,
          html_body: htmlBody,
          text_body: campaign.text_body,
          design_json: designJson,
          segment_ids: campaign.segment_ids ?? [],
          extra_filters: campaign.extra_filters ?? {},
          manual_contact_ids: campaign.manual_contact_ids ?? [],
        }),
      })
      if (res.ok) {
        setDirty(false)
      } else {
        alert((await res.json()).error)
      }
    } finally {
      setSaving(false)
    }
  }

  const sendCampaign = async () => {
    if (!campaign) return
    setSending(true)
    setSendStatus(null)
    try {
      // Sauvegarde d'abord si modifs en cours
      if (dirty) await save()
      // Premier envoi : déclenche la résolution + traite jusqu'à 200 destinataires inline
      const res = await fetch(`/api/campaigns/${id}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        setSendStatus({ ok: false, sent: 0, failed: 0, pending: 0, errors: [{ error: data.error || 'Erreur inconnue' }] })
        return
      }
      setSendStatus({
        ok: true,
        sent: data.sent_total ?? 0,
        failed: data.failed_total ?? 0,
        pending: data.pending_total ?? 0,
        errors: data.errors,
      })
      // Recharge la campagne pour avoir le nouveau status
      await load()
    } catch (e) {
      setSendStatus({ ok: false, sent: 0, failed: 0, pending: 0, errors: [{ error: e instanceof Error ? e.message : 'Erreur réseau' }] })
    } finally {
      setSending(false)
    }
  }

  const sendTest = async () => {
    if (!testEmail.trim() || !campaign) return
    setTestSending(true)
    setTestResult(null)
    try {
      // Save d'abord si modif en cours
      if (dirty) await save()
      const res = await fetch(`/api/campaigns/${id}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ testEmail }),
      })
      const data = await res.json()
      if (res.ok) {
        setTestResult({ ok: true, text: `Email de test envoyé à ${testEmail}` })
      } else {
        setTestResult({ ok: false, text: data.error || 'Erreur inconnue' })
      }
    } catch (e) {
      setTestResult({ ok: false, text: e instanceof Error ? e.message : 'Erreur réseau' })
    } finally {
      setTestSending(false)
    }
  }

  const back = { href: '/admin/crm/campaigns', label: 'Campagnes' }
  if (loading || !campaign) {
    return (
      <CrmV2Page>
        <CrmV2Header back={back} title="Campagne" />
        <CrmV2Spinner />
      </CrmV2Page>
    )
  }

  const statusMeta = STATUS_META[campaign.status] || STATUS_META.draft
  const tabIcon = (Icon: typeof Mail, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon size={14} /> {label}</span>
  )

  return (
    <CrmV2Page>
      <CrmV2Header
        back={back}
        title={<span style={{ overflowWrap: 'anywhere' }}>{campaign.name}</span>}
        subtitle={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <CrmV2StatusPill label={statusMeta.label} color={statusMeta.color} bg={statusMeta.bg} />
            <span style={{ overflowWrap: 'anywhere' }}>{campaign.subject || 'Sans objet'}</span>
          </span>
        }
        actions={
          <>
            {dirty && <CrmV2StatusPill label="Modifié" color="#b45309" bg="rgba(201,168,76,0.18)" />}
            <CrmV2Button variant="primary" icon={<Save size={14} />} onClick={save} disabled={!dirty || saving}>
              {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </CrmV2Button>
          </>
        }
      >
        <CrmV2Tabs
          bordered={false}
          value={tab}
          onChange={id => setTab(id as typeof tab)}
          items={[
            { id: 'content', label: tabIcon(FileText, 'Contenu') },
            { id: 'preview', label: tabIcon(Eye, 'Prévisualisation') },
            { id: 'recipients', label: tabIcon(Users, 'Destinataires') },
            ...(campaign.status === 'sent' ? [{ id: 'stats', label: tabIcon(CheckCircle2, 'Statistiques') }] : []),
          ]}
        />
      </CrmV2Header>

      {/* Contenu */}
      <CrmV2Body>
        {tab === 'content' && (
          <ContentTab
            campaign={campaign}
            update={update}
            testEmail={testEmail}
            setTestEmail={setTestEmail}
            sendTest={sendTest}
            testSending={testSending}
            testResult={testResult}
            editorRef={editorRef}
            setDirty={() => setDirty(true)}
            openSendModal={() => setShowSendModal(true)}
            sending={sending}
            sendStatus={sendStatus}
          />
        )}
        {tab === 'preview' && (
          <PreviewTab html={campaign.html_body} subject={campaign.subject} senderName={campaign.sender_name} senderEmail={campaign.sender_email} />
        )}
        {tab === 'recipients' && (
          <CampaignRecipientsTab
            campaignId={id}
            segmentIds={campaign.segment_ids ?? []}
            extraFilters={campaign.extra_filters ?? {}}
            manualContactIds={campaign.manual_contact_ids ?? []}
            onChange={(patch) => {
              update({
                segment_ids: patch.segment_ids ?? campaign.segment_ids,
                extra_filters: patch.extra_filters ?? campaign.extra_filters,
                manual_contact_ids: patch.manual_contact_ids ?? campaign.manual_contact_ids,
              })
            }}
            onSavedExternal={save}
          />
        )}
        {tab === 'stats' && campaign.status === 'sent' && (
          <StatsTab campaign={campaign} />
        )}
      </CrmV2Body>

      {showSendModal && (
        <SendConfirmModal
          campaignId={id}
          subject={campaign.subject}
          senderEmail={campaign.sender_email}
          senderName={campaign.sender_name}
          onClose={() => setShowSendModal(false)}
          onConfirm={async () => {
            setShowSendModal(false)
            await sendCampaign()
          }}
          sending={sending}
        />
      )}
    </CrmV2Page>
  )
}

// ─── Modal de confirmation d'envoi ───────────────────────────────────────
function SendConfirmModal({
  campaignId, subject, senderEmail, senderName, onClose, onConfirm, sending,
}: {
  campaignId: string
  subject: string
  senderEmail: string
  senderName: string
  onClose: () => void
  onConfirm: () => void
  sending: boolean
}) {
  const [preview, setPreview] = useState<{ total: number; sample: Array<{ email: string; first_name: string | null; last_name: string | null }> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sample_size: 5 }),
    })
      .then(r => r.json())
      .then(d => setPreview({ total: d.total ?? 0, sample: d.sample ?? [] }))
      .catch(() => setPreview({ total: 0, sample: [] }))
      .finally(() => setLoading(false))
  }, [campaignId])

  const expected = preview?.total ?? 0
  const canConfirm = !sending && expected > 0 && confirmText.trim() === String(expected)

  return (
    <MktModal
      open
      onClose={onClose}
      title={
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Envoyer la campagne</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: crmV2.text, overflowWrap: 'anywhere' }}>{subject || '(sans sujet)'}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: crmV2.textMuted, overflowWrap: 'anywhere' }}>De : {senderName} &lt;{senderEmail}&gt;</span>
        </span>
      }
      footer={!loading ? (
        <>
          <CrmV2Button variant="secondary" onClick={onClose}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" icon={<Send size={14} />} disabled={!canConfirm} onClick={onConfirm}>
            {sending ? 'Envoi…' : 'Envoyer maintenant'}
          </CrmV2Button>
        </>
      ) : undefined}
    >
      {loading ? (
        <CrmV2Spinner />
      ) : (
        <>
          <div style={{ background: crmV2.bgSoft, borderRadius: 12, padding: 14, textAlign: 'center' }}>
            <CrmV2SectionLabel style={{ justifyContent: 'center', marginBottom: 4 }}>Destinataires uniques</CrmV2SectionLabel>
            <div style={{ fontSize: 28, fontWeight: 700, color: crmV2.link, letterSpacing: '-0.02em' }}>{expected.toLocaleString('fr-FR')}</div>
            {preview && preview.sample.length > 0 && (
              <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 8, overflowWrap: 'anywhere' }}>
                Premiers : {preview.sample.map(s => s.email).slice(0, 3).join(', ')}{preview.sample.length > 3 && '…'}
              </div>
            )}
          </div>
          {expected === 0 ? (
            <MktNotice tone="red" icon={<AlertCircle size={15} />}>
              Aucun destinataire. Configure des segments ou filtres dans l’onglet Destinataires avant d’envoyer.
            </MktNotice>
          ) : (
            <>
              <MktNotice icon={<AlertTriangle size={15} />}>
                Cette action est <strong>irréversible</strong>. La campagne sera envoyée par batches de 200 toutes les minutes via le cron.
              </MktNotice>
              <CrmV2Field label={<>Pour confirmer, tape le nombre de destinataires : <strong style={{ color: crmV2.text }}>{expected}</strong></>}>
                <CrmV2Input
                  type="text"
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder={String(expected)}
                />
              </CrmV2Field>
            </>
          )}
        </>
      )}
    </MktModal>
  )
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Brouillon',  ...MKT_TONES.grey },
  scheduled: { label: 'Programmée', ...MKT_TONES.blue },
  sending:   { label: 'Envoi…',     ...MKT_TONES.gold },
  sent:      { label: 'Envoyée',    ...MKT_TONES.green },
  paused:    { label: 'En pause',   ...MKT_TONES.gold },
  failed:    { label: 'Échec',      ...MKT_TONES.red },
  archived:  { label: 'Archivée',   ...MKT_TONES.grey },
}

// ─── Tab : Contenu ───────────────────────────────────────────────────────
function ContentTab({ campaign, update, testEmail, setTestEmail, sendTest, testSending, testResult, editorRef, setDirty, openSendModal, sending, sendStatus }: {
  campaign: Campaign
  update: (patch: Partial<Campaign>) => void
  testEmail: string
  setTestEmail: (e: string) => void
  sendTest: () => void
  testSending: boolean
  testResult: { ok: boolean; text: string } | null
  editorRef: React.RefObject<EmailEditorVisualRef | null>
  setDirty: () => void
  openSendModal: () => void
  sending: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendStatus: { ok: boolean; sent: number; failed: number; pending: number; errors?: any[] } | null
}) {
  const isMobile = useIsMobile()
  return (
    // Mobile : éditeur puis panneau latéral empilés
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 340px', gap: isMobile ? 12 : 16, alignItems: 'start' }}>
      {/* Éditeur */}
      <div style={{ minWidth: 0 }}>
        <Card title="Informations">
          <Field label="Nom interne">
            <input value={campaign.name} onChange={e => update({ name: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Sujet de l'email">
            <input value={campaign.subject} onChange={e => update({ subject: e.target.value })} style={inputStyle} />
            <div style={{ fontSize: 11, color: crmV2.textFaint, marginTop: 4 }}>
              Variables : <code style={{ color: crmV2.goldDark }}>{'{{prenom}}'}</code> <code style={{ color: crmV2.goldDark }}>{'{{nom}}'}</code>
            </div>
          </Field>
          <Field label="Preheader (aperçu dans la boîte mail)">
            <input
              value={campaign.preheader || ''}
              onChange={e => update({ preheader: e.target.value })}
              placeholder="Court texte affiché après le sujet"
              style={inputStyle}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : '1fr 1fr', gap: isMobile ? 0 : 12 }}>
            <Field label="Nom expéditeur">
              <input value={campaign.sender_name} onChange={e => update({ sender_name: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Email expéditeur">
              <input value={campaign.sender_email} onChange={e => update({ sender_email: e.target.value })} style={inputStyle} />
            </Field>
          </div>
          <Field label="Répondre à (optionnel)">
            <input
              value={campaign.reply_to || ''}
              onChange={e => update({ reply_to: e.target.value })}
              placeholder="Ex: reponse@diploma-sante.fr"
              style={inputStyle}
            />
          </Field>
        </Card>

        <Card title="Design de l'email" icon={Palette}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            <div style={{ fontSize: 12, color: crmV2.textMuted, lineHeight: 1.5, flex: isMobile ? '1 1 100%' : 1 }}>
              Drag & drop des blocs depuis la palette à gauche :
              <strong> Texte, Image, Bouton, Diviseur, Colonnes, Vidéo, Réseaux sociaux</strong>.
              Utilise les <strong>Merge Tags</strong> pour insérer <code style={{ color: crmV2.goldDark }}>{'{{prenom}}'}</code>, <code style={{ color: crmV2.goldDark }}>{'{{nom}}'}</code>, <code style={{ color: crmV2.goldDark }}>{'{{email}}'}</code>.
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            <CrmTemplateButton
              onPick={(tpl) => {
                update({
                  template_id: tpl.id,
                  subject: tpl.subject || campaign.subject,
                  html_body: tpl.html_body,
                  text_body: tpl.text_body,
                  design_json: tpl.design_json,
                })
                if (tpl.design_json) editorRef.current?.loadDesign(tpl.design_json)
                setDirty()
              }}
            />
            <BrevoImportButton
              onImport={(html) => {
                // Injecte le HTML Brevo comme nouveau contenu
                editorRef.current?.loadDesign({
                  body: {
                    rows: [{
                      cells: [1],
                      columns: [{ contents: [{ type: 'html', values: { html } }], values: {} }],
                      values: {},
                    }],
                    values: {},
                  },
                  counters: {},
                  schemaVersion: 12,
                })
                setDirty()
              }}
            />
            </div>
          </div>
          <div style={{ border: `1px solid ${crmV2.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <EmailEditorVisual
              ref={editorRef}
              initialDesign={campaign.design_json}
              onChange={setDirty}
              height={720}
            />
          </div>
        </Card>
      </div>

      {/* Panneau droite */}
      <div style={{ minWidth: 0, position: isMobile ? 'static' : 'sticky', top: 16 }}>
        <Card title="Envoi de test" icon={TestTube2}>
          <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 8 }}>
            Envoie-toi un email de test avant d’envoyer à tes prospects.
          </div>
          <CrmV2Input
            type="email"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="ton-email@exemple.com"
          />
          <CrmV2Button
            variant="gold"
            icon={<Send size={14} />}
            onClick={sendTest}
            disabled={!testEmail.trim() || testSending}
            style={{ marginTop: 10, width: '100%', minHeight: 40 }}
          >
            {testSending ? 'Envoi…' : 'Envoyer le test'}
          </CrmV2Button>
          {testResult && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 8, background: testResult.ok ? 'rgba(22,163,74,0.08)' : crmV2.dangerSoft, border: `1px solid ${testResult.ok ? 'rgba(22,163,74,0.25)' : 'rgba(242,84,91,0.30)'}`, fontSize: 12, fontWeight: 600, color: testResult.ok ? '#16a34a' : '#d13a41', overflowWrap: 'anywhere' }}>
              {testResult.ok ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
              <span>{testResult.text}</span>
            </div>
          )}
        </Card>

        <Card title="Envoi réel" icon={Send}>
          {(() => {
            const hasAudience = ((campaign.segment_ids?.length ?? 0) > 0)
              || ((campaign.manual_contact_ids?.length ?? 0) > 0)
              || (!!campaign.extra_filters && Object.keys(campaign.extra_filters).length > 0)
            const subjectOk = !!campaign.subject
            const contentOk = !!campaign.html_body && campaign.html_body.length > 100
            const ready = subjectOk && contentOk && hasAudience
            const sent = campaign.status === 'sent'
            const inProgress = campaign.status === 'sending'
            return (
              <>
                <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 12 }}>
                  {sent ? 'Cette campagne a déjà été envoyée.' : inProgress ? 'Envoi en cours…' : 'Avant l\'envoi vérifie que :'}
                </div>
                {!sent && (
                  <Checklist items={[
                    { done: subjectOk, text: 'Le sujet est rempli' },
                    { done: contentOk, text: 'Le contenu HTML est prêt' },
                    { done: hasAudience, text: 'Au moins un segment/filtre est défini' },
                  ]} />
                )}
                <CrmV2Button
                  variant={ready && !sent ? 'primary' : 'secondary'}
                  icon={<Send size={14} />}
                  disabled={!ready || sending || sent}
                  onClick={openSendModal}
                  style={{ marginTop: 12, width: '100%', minHeight: 40 }}
                >
                  {sent ? 'Déjà envoyée' : inProgress ? 'Continuer l’envoi' : 'Envoyer'}
                </CrmV2Button>
                {sendStatus && (
                  <div style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    borderRadius: 10,
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    background: sendStatus.ok ? 'rgba(22,163,74,0.08)' : crmV2.dangerSoft,
                    border: `1px solid ${sendStatus.ok ? 'rgba(22,163,74,0.25)' : 'rgba(242,84,91,0.30)'}`,
                    fontSize: 12,
                    color: sendStatus.ok ? '#16a34a' : '#d13a41',
                  }}>
                    {sendStatus.ok ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
                    <span>
                      {sendStatus.ok ? (
                        <><strong>{sendStatus.sent}</strong> envoyés{sendStatus.failed > 0 && <>, {sendStatus.failed} échecs</>}{sendStatus.pending > 0 && <><br />{sendStatus.pending} en file (cron)</>}</>
                      ) : (
                        <>{sendStatus.errors?.[0]?.error || 'Erreur'}</>
                      )}
                    </span>
                  </div>
                )}
              </>
            )
          })()}
        </Card>

        <Card title="Aide" icon={AlertCircle}>
          <div style={{ fontSize: 12, color: crmV2.textMuted, lineHeight: 1.6 }}>
            <strong style={{ color: crmV2.text }}>Variables disponibles :</strong><br />
            <code style={{ color: crmV2.goldDark }}>{'{{prenom}}'}</code> — prénom du destinataire<br />
            <code style={{ color: crmV2.goldDark }}>{'{{nom}}'}</code> — nom<br />
            <code style={{ color: crmV2.goldDark }}>{'{{email}}'}</code> — email<br /><br />
            Les variables sont remplacées automatiquement à l’envoi.
          </div>
        </Card>
      </div>
    </div>
  )
}

// ─── Tab : Preview ───────────────────────────────────────────────────────
function PreviewTab({ html, subject, senderName, senderEmail }: { html: string; subject: string; senderName: string; senderEmail: string }) {
  return (
    <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, overflow: 'hidden', maxWidth: 680, width: '100%', margin: '0 auto', boxShadow: crmV2.shadowRecord }}>
      <div style={{ padding: 16, borderBottom: `1px solid ${crmV2.border}`, background: crmV2.thBg }}>
        <CrmV2SectionLabel style={{ marginBottom: 4 }}>De</CrmV2SectionLabel>
        <div style={{ fontSize: 13, color: crmV2.text, fontWeight: 600, overflowWrap: 'anywhere' }}>{senderName} &lt;{senderEmail}&gt;</div>
        <CrmV2SectionLabel style={{ marginTop: 10, marginBottom: 4 }}>Objet</CrmV2SectionLabel>
        <div style={{ fontSize: 15, color: crmV2.text, fontWeight: 600, overflowWrap: 'anywhere' }}>{subject || '(vide)'}</div>
      </div>
      <iframe
        srcDoc={html}
        style={{ width: '100%', height: 800, border: 'none', background: '#fff' }}
        sandbox="allow-same-origin"
        title="Email preview"
      />
    </div>
  )
}

// ─── Tab : Stats ────────────────────────────────────────────────────────
function StatsTab({ campaign }: { campaign: Campaign }) {
  const openRate = campaign.total_sent > 0 ? (campaign.total_unique_opens / campaign.total_sent * 100).toFixed(1) : '0.0'
  const clickRate = campaign.total_sent > 0 ? (campaign.total_unique_clicks / campaign.total_sent * 100).toFixed(1) : '0.0'
  const bounceRate = campaign.total_sent > 0 ? (campaign.total_bounces / campaign.total_sent * 100).toFixed(1) : '0.0'
  const isMobile = useIsMobile()

  const rows: { icon: typeof Mail; label: string; value: string | number }[] = [
    { icon: Calendar, label: 'Envoi', value: campaign.sent_at ? new Date(campaign.sent_at).toLocaleString('fr-FR') : '–' },
    { icon: Users, label: 'Destinataires ciblés', value: campaign.total_recipients },
    { icon: Send, label: 'Emails envoyés', value: campaign.total_sent },
    { icon: Inbox, label: 'Livrés', value: campaign.total_delivered },
    { icon: Eye, label: 'Ouvertures uniques', value: campaign.total_unique_opens },
    { icon: MousePointerClick, label: 'Clics uniques', value: campaign.total_unique_clicks },
    { icon: UserMinus, label: 'Désabonnements', value: campaign.total_unsubscribes },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16 }}>
      <CrmV2KpiGrid>
        <CrmV2KpiCard label="Envoyés" value={campaign.total_sent.toLocaleString('fr-FR')} icon={<Send size={15} />} color={crmV2.link} />
        <CrmV2KpiCard label="Taux d’ouverture" value={`${openRate} %`} icon={<Eye size={15} />} color="#7e22ce" detail={`${campaign.total_unique_opens} uniques`} />
        <CrmV2KpiCard label="Taux de clic" value={`${clickRate} %`} icon={<MousePointerClick size={15} />} color={crmV2.successStrong} detail={`${campaign.total_unique_clicks} uniques`} />
        <CrmV2KpiCard label="Taux de bounce" value={`${bounceRate} %`} icon={<Ban size={15} />} color="#dc2626" detail={`${campaign.total_bounces} emails`} />
      </CrmV2KpiGrid>
      <Card title="Résumé" icon={Info}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map(r => {
            const Icon = r.icon
            return (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, borderBottom: `1px solid ${crmV2.borderLight}`, fontSize: 13 }}>
                <Icon size={14} color={crmV2.textFaint} />
                <span style={{ color: crmV2.textMuted, flex: 1 }}>{r.label}</span>
                <strong style={{ color: crmV2.text }}>{typeof r.value === 'number' ? r.value.toLocaleString('fr-FR') : r.value}</strong>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────
/** Carte de section V2 : icône or, titre en majuscules. */
function Card({ title, icon: Icon, children }: { title: string; icon?: typeof Mail; children: React.ReactNode }) {
  const isMobile = useIsMobile()
  return (
    <CrmV2Card style={{ padding: isMobile ? 14 : 20, marginBottom: 16, boxShadow: crmV2.shadowRecord, minWidth: 0 }}>
      <CrmV2SectionLabel icon={Icon ? <Icon size={14} color={crmV2.gold} /> : undefined} style={{ color: crmV2.text, marginBottom: 14 }}>
        {title}
      </CrmV2SectionLabel>
      {children}
    </CrmV2Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: crmV2.textMuted, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

function Checklist({ items }: { items: Array<{ done: boolean; text: string }> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: it.done ? crmV2.text : crmV2.textMuted }}>
          {it.done ? <CheckCircle2 size={14} style={{ color: '#16a34a' }} /> : <Clock size={14} color={crmV2.textFaint} />}
          {it.text}
        </div>
      ))}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  background: '#ffffff',
  border: `1px solid ${crmV2.borderStrong}`,
  borderRadius: crmV2.radius,
  padding: '0 12px',
  color: crmV2.text,
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

// ─── Bouton + Modal : Import d'un template Brevo ────────────────────────
interface BrevoTemplate {
  id: number
  name: string
  subject: string
  isActive: boolean
  sender: { name: string; email: string }
  modifiedAt: string
  tag: string | null
}

function CrmTemplateButton({ onPick }: { onPick: (tpl: {
  id: string
  name: string
  subject: string
  html_body: string
  text_body: string | null
  design_json: unknown
}) => void }) {
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<Array<{
    id: string
    name: string
    subject: string
    html_body: string
    text_body: string | null
    design_json: unknown
  }>>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/email-templates')
      .then(r => r.json())
      .then(d => setTemplates(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [open])

  return (
    <>
      <CrmV2Button variant="secondary" size="sm" icon={<FileText size={14} />} onClick={() => setOpen(true)}>
        Charger un modèle
      </CrmV2Button>
      <MktModal open={open} onClose={() => setOpen(false)} title="Modèles CRM" width={440}>
        {loading ? (
          <CrmV2Spinner />
        ) : templates.length === 0 ? (
          <div style={{ padding: 12, fontSize: 13, color: crmV2.textMuted, textAlign: 'center' }}>Aucun modèle. Crée-en un dans Modèles email.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', margin: '-8px -8px' }}>
            {templates.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => { onPick(t); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 10px', minHeight: 44,
                  border: 'none', borderRadius: 10, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = crmV2.bgHover }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ width: 28, height: 28, borderRadius: 10, background: crmV2.bgSoft, color: crmV2.textMuted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileText size={14} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: crmV2.text }}>{t.name}</span>
                  {t.subject && <span style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>{t.subject}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </MktModal>
    </>
  )
}

function BrevoImportButton({ onImport }: { onImport: (html: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <CrmV2Button variant="secondary" size="sm" icon={<Zap size={14} />} onClick={() => setOpen(true)}>
        Importer depuis Brevo
      </CrmV2Button>
      {open && (
        <BrevoTemplatesModal
          onClose={() => setOpen(false)}
          onImport={(html) => { onImport(html); setOpen(false) }}
        />
      )}
    </>
  )
}

function BrevoTemplatesModal({ onClose, onImport }: { onClose: () => void; onImport: (html: string) => void }) {
  const [templates, setTemplates] = useState<BrevoTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [importing, setImporting] = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    fetch('/api/brevo/templates?templateStatus=true')
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setTemplates(d.templates || [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = templates.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return t.name.toLowerCase().includes(q) || (t.subject || '').toLowerCase().includes(q)
  })

  const loadPreview = async (id: number) => {
    setSelectedId(id)
    setLoadingPreview(true)
    setPreviewHtml('')
    try {
      const res = await fetch(`/api/brevo/templates/${id}`)
      const data = await res.json()
      setPreviewHtml(data.htmlContent || '')
    } finally { setLoadingPreview(false) }
  }

  const doImport = async () => {
    if (!selectedId || !previewHtml) return
    setImporting(true)
    try {
      onImport(previewHtml)
    } finally { setImporting(false) }
  }

  const border = `1px solid ${crmV2.border}`
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,31,61,0.28)', zIndex: 1000 }} />
      <div role="dialog" aria-modal="true" className="crm-v2" style={{ position: 'fixed', top: isMobile ? 12 : '5vh', left: isMobile ? 12 : '5vw', right: isMobile ? 12 : '5vw', bottom: isMobile ? 12 : '5vh', background: crmV2.bg, border, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadowPanel, zIndex: 1001, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: crmV2.font, color: crmV2.text }}>
        {/* En-tête */}
        <div style={{ padding: '16px 20px', borderBottom: border, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: crmV2.text, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={16} color={crmV2.gold} /> Templates Brevo
            </h3>
            <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>
              Choisis un template depuis ton compte Brevo. Il sera importé dans l’éditeur visuel ci-dessous.
            </div>
          </div>
          <CrmV2CloseButton onClick={onClose} />
        </div>

        {/* Corps — mobile : liste en haut, aperçu en dessous */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : '340px 1fr', gridTemplateRows: isMobile ? 'minmax(0, 45%) minmax(0, 1fr)' : undefined, minHeight: 0 }}>
          {/* Liste à gauche */}
          <div style={{ borderRight: isMobile ? 'none' : border, borderBottom: isMobile ? border : 'none', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
            <div style={{ padding: 12, borderBottom: border }}>
              <CrmV2Search
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un template…"
                style={{ minWidth: 0 }}
              />
              <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 6 }}>
                {loading ? 'Chargement…' : `${filtered.length} template${filtered.length > 1 ? 's' : ''}`}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {error ? (
                <div style={{ padding: 8 }}><MktNotice tone="red" icon={<AlertCircle size={15} />}>{error}</MktNotice></div>
              ) : loading ? (
                <CrmV2Spinner />
              ) : filtered.length === 0 ? (
                <div style={{ padding: 20, color: crmV2.textMuted, fontSize: 13, textAlign: 'center' }}>Aucun template</div>
              ) : (
                filtered.map(t => {
                  const active = selectedId === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => loadPreview(t.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: active ? crmV2.goldSoft : 'transparent',
                        border: active ? `1px solid ${crmV2.goldBorder}` : '1px solid transparent',
                        borderRadius: 10,
                        padding: 10,
                        marginBottom: 4,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = crmV2.bgHover }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.text, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: 12, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.subject || '(pas de sujet)'}
                      </div>
                      {(t.isActive || t.tag) && (
                        <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {t.isActive && <CrmV2StatusPill label="Actif" color={MKT_TONES.green.color} bg={MKT_TONES.green.bg} />}
                          {t.tag && <CrmV2StatusPill label={<><Tag size={11} /> {t.tag}</>} color={MKT_TONES.grey.color} bg={MKT_TONES.grey.bg} dot={false} />}
                        </div>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Aperçu à droite */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '10px 20px', borderBottom: border, background: crmV2.thBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.text, minWidth: 0 }}>
                {selectedId ? `Aperçu : ${templates.find(t => t.id === selectedId)?.name}` : 'Sélectionne un template pour le prévisualiser'}
              </div>
              {selectedId && previewHtml && (
                <CrmV2Button variant="primary" icon={<Download size={14} />} onClick={doImport} disabled={importing}>
                  {importing ? 'Import…' : 'Importer dans l’éditeur'}
                </CrmV2Button>
              )}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: crmV2.bgSoft }}>
              {loadingPreview ? (
                <CrmV2Spinner />
              ) : previewHtml ? (
                <iframe
                  srcDoc={previewHtml}
                  sandbox="allow-same-origin"
                  title="Template preview"
                  style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
                />
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: crmV2.textMuted, fontSize: 13 }}>
                  Clique sur un template dans la liste pour voir l’aperçu
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Note de pied */}
        <div style={{ padding: '10px 20px', borderTop: border, background: crmV2.thBg, fontSize: 12, color: crmV2.textMuted, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Info size={14} color={crmV2.textFaint} />
          Tu peux créer / modifier tes templates sur <a href="https://app.brevo.com/camp/lists/templates" target="_blank" rel="noreferrer" style={{ color: crmV2.link, fontWeight: 600 }}>app.brevo.com</a> puis cliquer ici pour les importer.
        </div>
      </div>
    </>
  )
}
