'use client'

import { useEffect, useState, useCallback, use, useRef } from 'react'
import {
  Mail, Send, Save, Eye, Users, X, ChevronLeft,
  CheckCircle2, AlertCircle, Clock, FileText, TestTube2, Palette,
} from 'lucide-react'
import LogoutButton from '@/components/LogoutButton'
import EmailEditorVisual, { type EmailEditorVisualRef } from '@/components/EmailEditorVisual'

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
              <a href="https://diploma-sante.fr" style="display:inline-block;background:#ccac71;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;">
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
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [tab, setTab] = useState<'content' | 'preview' | 'recipients' | 'stats'>('content')
  const [testEmail, setTestEmail] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const editorRef = useRef<EmailEditorVisualRef>(null)

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
      // Récupère le HTML + design depuis l'éditeur visuel si disponible
      let htmlBody = campaign.html_body
      let designJson = campaign.design_json
      if (editorRef.current) {
        const exported = await editorRef.current.exportContent()
        if (exported.html) {
          htmlBody = exported.html
          designJson = exported.design
          // Met aussi à jour le state local pour la preview
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
          html_body: htmlBody,
          text_body: campaign.text_body,
          design_json: designJson,
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
        setTestResult(`✅ Email de test envoyé à ${testEmail}`)
      } else {
        setTestResult(`❌ ${data.error || 'Erreur inconnue'}`)
      }
    } catch (e) {
      setTestResult(`❌ ${e instanceof Error ? e.message : 'Erreur réseau'}`)
    } finally {
      setTestSending(false)
    }
  }

  if (loading || !campaign) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f8fa', color: '#516f90', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Chargement…
      </div>
    )
  }

  const statusMeta = STATUS_META[campaign.status] || STATUS_META.draft

  return (
    <div style={{ minHeight: '100vh', background: '#f5f8fa', color: '#33475b', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Topbar */}
      <div style={{ padding: '0 20px', height: 52, background: '#ffffff', borderBottom: '1px solid #cbd6e2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <a href="/admin/crm/campaigns" style={{ color: '#516f90', textDecoration: 'none', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ChevronLeft size={14} /> Campagnes
          </a>
          <div style={{ width: 1, height: 22, background: '#cbd6e2' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Mail size={16} style={{ color: '#ccac71', flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaign.name}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: statusMeta.color, background: statusMeta.bg, padding: '3px 8px', borderRadius: 999 }}>
              {statusMeta.label}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {dirty && (
            <span style={{ fontSize: 11, color: '#f59e0b' }}>● Modifié</span>
          )}
          <button
            onClick={save}
            disabled={!dirty || saving}
            style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 8, padding: '6px 14px', color: '#33475b', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', opacity: !dirty || saving ? 0.5 : 1 }}
          >
            <Save size={12} /> {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
          <LogoutButton />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 24px', background: '#ffffff', borderBottom: '1px solid #cbd6e2', display: 'flex', gap: 4 }}>
        <Tab active={tab === 'content'} onClick={() => setTab('content')} icon={FileText} label="Contenu" />
        <Tab active={tab === 'preview'} onClick={() => setTab('preview')} icon={Eye} label="Prévisualisation" />
        <Tab active={tab === 'recipients'} onClick={() => setTab('recipients')} icon={Users} label="Destinataires" />
        {campaign.status === 'sent' && (
          <Tab active={tab === 'stats'} onClick={() => setTab('stats')} icon={CheckCircle2} label="Statistiques" />
        )}
      </div>

      {/* Contenu */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
        {tab === 'content' && (
          <ContentTab campaign={campaign} update={update} testEmail={testEmail} setTestEmail={setTestEmail} sendTest={sendTest} testSending={testSending} testResult={testResult} editorRef={editorRef} setDirty={() => setDirty(true)} />
        )}
        {tab === 'preview' && (
          <PreviewTab html={campaign.html_body} subject={campaign.subject} senderName={campaign.sender_name} senderEmail={campaign.sender_email} />
        )}
        {tab === 'recipients' && (
          <RecipientsTab campaign={campaign} />
        )}
        {tab === 'stats' && campaign.status === 'sent' && (
          <StatsTab campaign={campaign} />
        )}
      </div>
    </div>
  )
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Brouillon',  color: '#516f90', bg: '#ffffff' },
  scheduled: { label: 'Programmée', color: '#06b6d4', bg: 'rgba(6,182,212,0.15)' },
  sending:   { label: 'Envoi…',     color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  sent:      { label: 'Envoyée',    color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  failed:    { label: 'Échec',      color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  archived:  { label: 'Archivée',   color: '#516f90', bg: 'rgba(139,143,168,0.15)' },
}

// ─── Tab : Contenu ───────────────────────────────────────────────────────
function ContentTab({ campaign, update, testEmail, setTestEmail, sendTest, testSending, testResult, editorRef, setDirty }: {
  campaign: Campaign
  update: (patch: Partial<Campaign>) => void
  testEmail: string
  setTestEmail: (e: string) => void
  sendTest: () => void
  testSending: boolean
  testResult: string | null
  editorRef: React.RefObject<EmailEditorVisualRef | null>
  setDirty: () => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24 }}>
      {/* Éditeur */}
      <div>
        <Card title="Informations">
          <Field label="Nom interne">
            <input value={campaign.name} onChange={e => update({ name: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Sujet de l'email">
            <input value={campaign.subject} onChange={e => update({ subject: e.target.value })} style={inputStyle} />
            <div style={{ fontSize: 11, color: '#516f90', marginTop: 4 }}>
              Variables : <code style={{ color: '#ccac71' }}>{'{{prenom}}'}</code> <code style={{ color: '#ccac71' }}>{'{{nom}}'}</code>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
          <div style={{ fontSize: 11, color: '#516f90', marginBottom: 10, lineHeight: 1.5 }}>
            Drag & drop des blocs depuis la palette à gauche :
            <strong> Texte, Image, Bouton, Diviseur, Colonnes, Vidéo, Réseaux sociaux</strong>.
            Utilise les <strong>Merge Tags</strong> pour insérer <code style={{ color: '#ccac71' }}>{'{{prenom}}'}</code>, <code style={{ color: '#ccac71' }}>{'{{nom}}'}</code>, <code style={{ color: '#ccac71' }}>{'{{email}}'}</code>.
          </div>
          <EmailEditorVisual
            ref={editorRef}
            initialDesign={campaign.design_json}
            onChange={setDirty}
            height={720}
          />
        </Card>
      </div>

      {/* Panneau droite */}
      <div>
        <Card title="Envoi de test" icon={TestTube2}>
          <div style={{ fontSize: 12, color: '#516f90', marginBottom: 8 }}>
            Envoie-toi un email de test avant d&apos;envoyer à tes prospects.
          </div>
          <input
            type="email"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="ton-email@exemple.com"
            style={inputStyle}
          />
          <button
            onClick={sendTest}
            disabled={!testEmail.trim() || testSending}
            style={{ marginTop: 10, width: '100%', background: 'rgba(204,172,113,0.15)', border: '1px solid rgba(204,172,113,0.3)', color: '#ccac71', padding: '10px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', opacity: !testEmail.trim() || testSending ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Send size={13} /> {testSending ? 'Envoi…' : 'Envoyer le test'}
          </button>
          {testResult && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: testResult.startsWith('✅') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${testResult.startsWith('✅') ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, fontSize: 12, color: testResult.startsWith('✅') ? '#22c55e' : '#ef4444' }}>
              {testResult}
            </div>
          )}
        </Card>

        <Card title="Envoi réel" icon={Send}>
          <div style={{ fontSize: 12, color: '#516f90', marginBottom: 12 }}>
            Tu pourras envoyer aux destinataires une fois que :
          </div>
          <Checklist items={[
            { done: !!campaign.subject, text: 'Le sujet est rempli' },
            { done: !!campaign.html_body && campaign.html_body.length > 100, text: 'Le contenu HTML est prêt' },
            { done: false, text: 'Les destinataires sont définis (Phase 5)' },
          ]} />
          <button
            disabled
            style={{ marginTop: 12, width: '100%', background: '#ffffff', border: '1px solid #cbd6e2', color: '#516f90', padding: '10px', borderRadius: 8, cursor: 'not-allowed', fontSize: 13, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Send size={13} /> Envoyer (bientôt)
          </button>
        </Card>

        <Card title="Aide" icon={AlertCircle}>
          <div style={{ fontSize: 12, color: '#516f90', lineHeight: 1.5 }}>
            💡 <strong>Variables disponibles :</strong><br />
            <code style={{ color: '#ccac71' }}>{'{{prenom}}'}</code> — prénom du destinataire<br />
            <code style={{ color: '#ccac71' }}>{'{{nom}}'}</code> — nom<br />
            <code style={{ color: '#ccac71' }}>{'{{email}}'}</code> — email<br /><br />
            Les variables sont remplacées automatiquement à l&apos;envoi.
          </div>
        </Card>
      </div>
    </div>
  )
}

// ─── Tab : Preview ───────────────────────────────────────────────────────
function PreviewTab({ html, subject, senderName, senderEmail }: { html: string; subject: string; senderName: string; senderEmail: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', maxWidth: 680, margin: '0 auto', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
      <div style={{ padding: 16, borderBottom: '1px solid #eee', background: '#f9fafb' }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>De</div>
        <div style={{ fontSize: 13, color: '#222', fontWeight: 600 }}>{senderName} &lt;{senderEmail}&gt;</div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 10, marginBottom: 4 }}>Sujet</div>
        <div style={{ fontSize: 15, color: '#111', fontWeight: 600 }}>{subject || '(vide)'}</div>
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

// ─── Tab : Destinataires ─────────────────────────────────────────────────
function RecipientsTab({ campaign }: { campaign: Campaign }) {
  return (
    <Card title="Destinataires" icon={Users}>
      <div style={{ textAlign: 'center', padding: 40, color: '#516f90' }}>
        <Users size={48} style={{ color: '#cbd6e2', margin: '0 auto 16px' }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: '#33475b', marginBottom: 6 }}>
          Sélection des destinataires en Phase 5
        </div>
        <div style={{ fontSize: 12, maxWidth: 400, margin: '0 auto' }}>
          Bientôt tu pourras choisir des segments pré-enregistrés (ex: "Tous les PASS",
          "Prospects sans RDV") ou créer un filtre à la volée depuis le CRM.
        </div>
      </div>
    </Card>
  )
}

// ─── Tab : Stats ────────────────────────────────────────────────────────
function StatsTab({ campaign }: { campaign: Campaign }) {
  const openRate = campaign.total_sent > 0 ? (campaign.total_unique_opens / campaign.total_sent * 100).toFixed(1) : '0.0'
  const clickRate = campaign.total_sent > 0 ? (campaign.total_unique_clicks / campaign.total_sent * 100).toFixed(1) : '0.0'
  const bounceRate = campaign.total_sent > 0 ? (campaign.total_bounces / campaign.total_sent * 100).toFixed(1) : '0.0'

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <BigStat label="Envoyés" value={campaign.total_sent} color="#06b6d4" />
        <BigStat label="Taux d'ouverture" value={`${openRate}%`} color="#a855f7" sub={`${campaign.total_unique_opens} uniques`} />
        <BigStat label="Taux de clic" value={`${clickRate}%`} color="#22c55e" sub={`${campaign.total_unique_clicks} uniques`} />
        <BigStat label="Taux de bounce" value={`${bounceRate}%`} color="#ef4444" sub={`${campaign.total_bounces} emails`} />
      </div>
      <Card title="Résumé">
        <div style={{ fontSize: 13, color: '#516f90', lineHeight: 1.8 }}>
          📅 <strong>Envoi :</strong> {campaign.sent_at ? new Date(campaign.sent_at).toLocaleString('fr-FR') : '–'}<br />
          👥 <strong>Destinataires ciblés :</strong> {campaign.total_recipients}<br />
          ✉️ <strong>Emails envoyés :</strong> {campaign.total_sent}<br />
          📬 <strong>Livrés :</strong> {campaign.total_delivered}<br />
          👁 <strong>Ouvertures uniques :</strong> {campaign.total_unique_opens}<br />
          🖱 <strong>Clics uniques :</strong> {campaign.total_unique_clicks}<br />
          🚫 <strong>Désabonnements :</strong> {campaign.total_unsubscribes}
        </div>
      </Card>
    </div>
  )
}

function BigStat({ label, value, color, sub }: { label: string; value: number | string; color: string; sub?: string }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 11, color: '#516f90', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#516f90', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function Tab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Mail; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        borderBottom: `2px solid ${active ? '#ccac71' : 'transparent'}`,
        padding: '12px 16px',
        color: active ? '#ccac71' : '#516f90',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'inherit',
      }}
    >
      <Icon size={14} /> {label}
    </button>
  )
}

function Card({ title, icon: Icon, children }: { title: string; icon?: typeof Mail; children: React.ReactNode }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        {Icon && <Icon size={14} style={{ color: '#ccac71' }} />}
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#33475b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: '#516f90', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

function Checklist({ items }: { items: Array<{ done: boolean; text: string }> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: it.done ? '#33475b' : '#516f90' }}>
          {it.done ? <CheckCircle2 size={12} style={{ color: '#22c55e' }} /> : <Clock size={12} />}
          {it.text}
        </div>
      ))}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#f5f8fa',
  border: '1px solid #cbd6e2',
  borderRadius: 8,
  padding: '8px 12px',
  color: '#33475b',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}
