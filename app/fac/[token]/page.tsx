'use client'

/**
 * Lien fac Edumove (https://hub.diploma-sante.fr/fac/<code>) : la fac
 * partenaire voit les candidats qui l'ont choisie, leurs pièces pour cette
 * fac, met à jour son suivi et échange avec Edumove. Sans compte.
 */

import { use, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'

type Dossier = {
  id: string
  prenom: string | null
  nom: string | null
  email: string | null
  tel: string | null
  profil: string | null
  filiere: string | null
  ville: string | null
  langue: string | null
  langues: Record<string, string> | null
  moyenne_premiere: string | number | null
  moyenne_terminale: string | number | null
  suivi: string
  documents: Record<string, string>
  choix_le: string | null
  depose_le: string | null
}
type Message = { id: number; candidature_id: string | null; content: string; created_at: string; from_fac: boolean }
type Data = { fac: string; fac_name: string; tracking_options: string[]; dossiers: Dossier[]; messages: Message[] }

const ORANGE = '#e65100'
const TRACKING: Record<string, string> = {
  en_attente: 'En attente', dossier_envoye: 'Dossier envoyé', test_paye: 'Test payé', test_passe: 'Test passé',
  tests_passes: 'Tests passés', entretien_planifie: 'Entretien planifié', entretien_passe: 'Entretien passé',
  accepte: 'Accepté', acompte_verse: 'Acompte versé', inscrit: 'Inscrit', refuse: 'Refusé', autre_agence: 'Autre agence',
}
const DOCS: Record<string, string> = {
  formulaire: 'Formulaire', identite: "Pièce d'identité", releves: 'Relevés de notes', lettre_motivation: 'Lettre de motivation',
  attestation_esp: "Attestation d'espagnol", releve_bac: 'Relevé du bac', bulletins: 'Bulletins', rapport_technique: 'Rapport technique académique',
}
const LANG: Record<string, string> = { b2: 'B2+', b1: 'B1', debut: 'débutant', aucun: 'aucun' }

const card: CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const fmtTime = (d: string) => new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function FacPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [senderName, setSenderName] = useState('')

  const load = useCallback(() => fetch(`/api/fac/${encodeURIComponent(token)}`, { cache: 'no-store' })
    .then(async r => {
      const j = await r.json().catch(() => null)
      if (!r.ok) setError(j?.error || 'Lien invalide')
      else setData(j)
    })
    .catch(() => setError('Connexion impossible')), [token])

  useEffect(() => {
    const first = setTimeout(() => void load(), 0)
    const t = setInterval(() => void load(), 60_000)
    return () => { clearTimeout(first); clearInterval(t) }
  }, [load])

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch(`/api/fac/${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const j = await r.json().catch(() => null)
    if (!r.ok) { alert(j?.error || 'Erreur'); return false }
    await load()
    return true
  }

  const dossiers = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = data?.dossiers ?? []
    return q ? list.filter(d => `${d.prenom} ${d.nom} ${d.email}`.toLowerCase().includes(q)) : list
  }, [data, search])

  if (error) return <Shell><div style={{ ...card, textAlign: 'center', color: '#b91c1c' }}>{error}</div></Shell>
  if (!data) return <Shell><div style={{ textAlign: 'center', color: '#6b7280' }}>Chargement…</div></Shell>

  const general = data.messages.filter(m => !m.candidature_id)
  const nameSetter = setSenderName

  return (
    <Shell title={data.fac_name}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un candidat…"
          style={{ flex: '1 1 220px', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 10, fontSize: 14 }} />
        <span style={{ fontSize: 13, color: '#6b7280' }}>{data.dossiers.length} candidat{data.dossiers.length > 1 ? 's' : ''}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {dossiers.map(d => {
          const isOpen = open === d.id
          const msgs = data.messages.filter(m => m.candidature_id === d.id)
          return (
            <div key={d.id} style={card}>
              <button type="button" onClick={() => setOpen(isOpen ? null : d.id)}
                style={{ all: 'unset', cursor: 'pointer', display: 'flex', width: '100%', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 15, flex: '1 1 180px' }}>{[d.prenom, d.nom].filter(Boolean).join(' ') || 'Candidat'}</span>
                <span style={{ fontSize: 13, color: '#374151' }}>{[d.filiere, d.ville, d.langue].filter(Boolean).join(' · ')}</span>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: d.suivi === 'inscrit' ? '#ecfdf5' : '#fff7ed', color: d.suivi === 'inscrit' ? '#047857' : ORANGE }}>
                  {TRACKING[d.suivi] ?? d.suivi}
                </span>
                {msgs.length > 0 && <span style={{ fontSize: 12, color: '#6b7280' }}>💬 {msgs.length}</span>}
              </button>

              {isOpen && (
                <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, fontSize: 13 }}>
                    <Info k="E-mail" v={d.email} />
                    <Info k="Téléphone" v={d.tel} />
                    <Info k="Profil" v={d.profil === 'reorientation' ? 'Réorientation' : 'Terminale'} />
                    <Info k="Moyenne première" v={d.moyenne_premiere != null ? String(d.moyenne_premiere) : null} />
                    <Info k="Moyenne terminale" v={d.moyenne_terminale != null ? String(d.moyenne_terminale) : null} />
                    <Info k="Langues" v={d.langues ? Object.entries(d.langues).filter(([, v]) => v && v !== 'aucun').map(([k, v]) => `${k} ${LANG[v] ?? v}`).join(', ') : null} />
                    <Info k="Choix confirmé le" v={fmt(d.choix_le)} />
                  </div>

                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Pièces</div>
                    {Object.keys(d.documents).length === 0
                      ? <div style={{ fontSize: 13, color: '#6b7280' }}>Aucune pièce pour l’instant.</div>
                      : Object.entries(d.documents).map(([k, url]) => (
                        <div key={k}><a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: ORANGE }}>📎 {DOCS[k.slice(data.fac.length + 1)] ?? k}</a></div>
                      ))}
                  </div>

                  <label style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700 }}>Suivi</span>
                    <select value={d.suivi} onChange={e => void post({ type: 'tracking', candidature_id: d.id, value: e.target.value })}
                      style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }}>
                      {data.tracking_options.map(o => <option key={o} value={o}>{TRACKING[o] ?? o}</option>)}
                    </select>
                  </label>

                  <Thread messages={msgs} senderName={senderName} onName={nameSetter}
                    onSend={content => post({ type: 'message', candidature_id: d.id, content, sender_name: senderName })} />
                </div>
              )}
            </div>
          )
        })}
        {dossiers.length === 0 && <div style={{ ...card, textAlign: 'center', color: '#6b7280' }}>Aucun candidat.</div>}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Messages généraux avec Edumove</div>
        <Thread messages={general} senderName={senderName} onName={nameSetter}
          onSend={content => post({ type: 'message', content, sender_name: senderName })} />
      </div>
    </Shell>
  )
}

function Shell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f6f7fb', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', color: '#111827' }}>
      <div style={{ background: ORANGE, color: '#fff', padding: '16px 16px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', fontWeight: 800, fontSize: 18 }}>Edumove{title ? ` · ${title}` : ''}</div>
      </div>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  )
}

function Info({ k, v }: { k: string; v: string | null }) {
  return <div><span style={{ color: '#6b7280' }}>{k} : </span><span style={{ fontWeight: 600 }}>{v || '—'}</span></div>
}

function Thread({ messages, senderName, onName, onSend }: {
  messages: Message[]
  senderName: string
  onName: (v: string) => void
  onSend: (content: string) => Promise<boolean>
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {messages.map(m => (
        <div key={m.id} style={{ alignSelf: m.from_fac ? 'flex-end' : 'flex-start', maxWidth: '85%', background: m.from_fac ? '#fff7ed' : '#f3f4f6', borderRadius: 10, padding: '8px 12px' }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{m.from_fac ? 'Vous' : 'Edumove'} · {fmtTime(m.created_at)}</div>
          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{m.content}</div>
        </div>
      ))}
      <input value={senderName} onChange={e => onName(e.target.value)} placeholder="Votre nom"
        style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, maxWidth: 260 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Écrire à Edumove…" rows={2}
          style={{ flex: 1, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />
        <button type="button" disabled={sending || !text.trim()} onClick={async () => {
          setSending(true)
          if (await onSend(text.trim())) setText('')
          setSending(false)
        }} style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 8, padding: '0 16px', fontWeight: 700, cursor: 'pointer', opacity: sending || !text.trim() ? 0.5 : 1 }}>
          Envoyer
        </button>
      </div>
    </div>
  )
}
