'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Play, Check, Save, Trash2, Plus, ChevronUp, ChevronDown, Sparkles,
} from 'lucide-react'
import MarketingNav from '@/components/crm/MarketingNav'
import { CrmV2Button, CrmV2Card, CrmV2Page, CrmV2PillTabs } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { SlideCanvas } from '@/components/webinar-presentations/SlideCanvas'
import {
  PRESENTATION_STATUSES,
  WEBINAR_BRANDS,
  getDeckTheme,
  newSlideId,
  type FeedbackStatus,
  type PresentationStatus,
  type SlideLayout,
  type WebinarPresentation,
  type WebinarPresentationFeedback,
  type WebinarSlide,
} from '@/lib/webinar-presentations'

const LAYOUTS: { id: SlideLayout; label: string }[] = [
  { id: 'title', label: 'Titre' },
  { id: 'section', label: 'Chapitre' },
  { id: 'bullets', label: 'Puces' },
  { id: 'split', label: 'Split' },
  { id: 'quote', label: 'Citation' },
  { id: 'stats', label: 'Chiffres' },
  { id: 'cards', label: 'Cartes' },
  { id: 'quiz', label: 'Question' },
  { id: 'cta', label: 'Clôture' },
]

type Detail = WebinarPresentation & { feedback: WebinarPresentationFeedback[] }

export default function WebinarPresentationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState('slides')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [selected, setSelected] = useState(0)
  const [feedbackDraft, setFeedbackDraft] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/webinar-presentations/${id}`)
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Erreur')
    setData(json)
  }, [id])

  useEffect(() => {
    load()
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false))
  }, [load])

  const openFeedback = useMemo(
    () => (data?.feedback || []).filter(f => f.status === 'open').length,
    [data],
  )

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  const patch = async (body: Record<string, unknown>, okMsg = 'Enregistré') => {
    if (!data) return
    setSaving(true)
    try {
      const res = await fetch(`/api/webinar-presentations/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setData(prev => prev ? { ...prev, ...json, feedback: prev.feedback } : json)
      flash(okMsg)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const updateSlide = (i: number, next: Partial<WebinarSlide>) => {
    if (!data) return
    const slides = data.slides.map((s, idx) => idx === i ? { ...s, ...next } : s)
    setData({ ...data, slides })
  }

  const addSlide = () => {
    if (!data) return
    const slide: WebinarSlide = {
      id: newSlideId(),
      layout: 'bullets',
      title: 'Nouvelle slide',
      bullets: ['Point 1', 'Point 2'],
      reveal: true,
    }
    const slides = [...data.slides]
    const at = Math.min(selected + 1, slides.length)
    slides.splice(at, 0, slide)
    setData({ ...data, slides })
    setSelected(at)
  }

  const moveSlide = (i: number, dir: -1 | 1) => {
    if (!data) return
    const j = i + dir
    if (j < 0 || j >= data.slides.length) return
    const slides = [...data.slides]
    const [s] = slides.splice(i, 1)
    slides.splice(j, 0, s)
    setData({ ...data, slides })
    setSelected(j)
  }

  const removeSlide = (i: number) => {
    if (!data || data.slides.length <= 1) return
    const slides = data.slides.filter((_, idx) => idx !== i)
    setData({ ...data, slides })
    setSelected(Math.max(0, i - 1))
  }

  const sendFeedback = async () => {
    if (!feedbackDraft.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/webinar-presentations/${id}/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: feedbackDraft.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setFeedbackDraft('')
      await load()
      flash('Retour envoyé')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const setFeedbackStatus = async (fid: string, status: FeedbackStatus) => {
    await fetch(`/api/webinar-presentations/${id}/feedback/${fid}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await load()
  }

  const remove = async () => {
    if (!confirm('Supprimer cette présentation ?')) return
    await fetch(`/api/webinar-presentations/${id}`, { method: 'DELETE' })
    router.push('/admin/crm/campaigns/webinars')
  }

  if (loading) {
    return (
      <div>
        <MarketingNav title="Présentation webinaire" />
        <CrmV2Page style={{ padding: 24 }}><p style={{ color: crmV2.textMuted }}>Chargement…</p></CrmV2Page>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div>
        <MarketingNav title="Présentation webinaire" />
        <CrmV2Page style={{ padding: 24 }}><p style={{ color: crmV2.danger }}>{error || 'Introuvable'}</p></CrmV2Page>
      </div>
    )
  }

  const st = PRESENTATION_STATUSES[data.status as PresentationStatus] || PRESENTATION_STATUSES.draft
  const theme = getDeckTheme(data.brand)
  const slide = data.slides[selected] || data.slides[0]
  const presented = !!data.presented_at || data.status === 'presented' || data.status === 'needs_revision'

  return (
    <div>
      <MarketingNav title={data.title} />
      <CrmV2Page style={{ padding: 24 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <button
                type="button"
                onClick={() => router.push('/admin/crm/campaigns/webinars')}
                style={{ background: 'none', border: 'none', color: crmV2.link, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0, fontSize: 13, fontFamily: 'inherit' }}
              >
                <ArrowLeft size={14} /> Toutes les présentations
              </button>
              <h1 style={{ margin: '8px 0 4px', fontSize: 22, fontWeight: 800, color: crmV2.text }}>{data.title}</h1>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: theme.primary }}>{theme.name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: st.bg, color: st.color }}>{st.label}</span>
                <span style={{ fontSize: 12, color: crmV2.textFaint }}>{data.slides.length} slides</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <CrmV2Button onClick={() => patch({ slides: data.slides, brief: data.brief, source_guide: data.source_guide, title: data.title, subtitle: data.subtitle, brand: data.brand, webinar_date: data.webinar_date }, 'Sauvegardé')} disabled={saving}>
                <Save size={14} /> Sauver
              </CrmV2Button>
              {!presented && (
                <CrmV2Button onClick={async () => {
                  await patch({ action: 'mark_presented' }, 'Marquée comme présentée')
                  setTab('feedback')
                }} disabled={saving}>
                  <Check size={14} /> Marquer présentée
                </CrmV2Button>
              )}
              <CrmV2Button variant="gold" onClick={() => router.push(`/admin/crm/campaigns/webinars/${id}/present`)}>
                <Play size={14} /> Présenter
              </CrmV2Button>
              <CrmV2Button onClick={remove} style={{ color: crmV2.danger }}>
                <Trash2 size={14} />
              </CrmV2Button>
            </div>
          </div>

          <CrmV2PillTabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'slides', label: 'Slides' },
              { id: 'brief', label: 'Brief & guide' },
              { id: 'feedback', label: 'Retours', count: openFeedback },
            ]}
          />

          {tab === 'slides' && slide && (
            <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(280px, 1fr) 320px', gap: 14, marginTop: 16, overflowX: 'auto' }}>
              <CrmV2Card style={{ padding: 10, maxHeight: '72vh', overflow: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted }}>Slides</span>
                  <button type="button" onClick={addSlide} style={{ border: 'none', background: 'none', cursor: 'pointer', color: crmV2.link }}>
                    <Plus size={14} />
                  </button>
                </div>
                {data.slides.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelected(i)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: i === selected ? `2px solid ${theme.accent}` : `1px solid ${crmV2.border}`,
                      borderRadius: 10,
                      overflow: 'hidden',
                      height: 92,
                      marginBottom: 8,
                      padding: 0,
                      cursor: 'pointer',
                      background: '#111',
                      position: 'relative',
                    }}
                  >
                    <SlideCanvas slide={s} brand={data.brand} compact step={99} />
                    <span style={{ position: 'absolute', left: 6, top: 6, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 10, fontWeight: 800, borderRadius: 99, padding: '1px 6px' }}>{i + 1}</span>
                  </button>
                ))}
              </CrmV2Card>

              <CrmV2Card style={{ overflow: 'hidden', height: 420 }}>
                <SlideCanvas slide={slide} brand={data.brand} step={99} />
              </CrmV2Card>

              <CrmV2Card style={{ padding: 16, maxHeight: '72vh', overflow: 'auto' }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  <CrmV2Button onClick={() => moveSlide(selected, -1)} disabled={selected === 0}><ChevronUp size={14} /></CrmV2Button>
                  <CrmV2Button onClick={() => moveSlide(selected, 1)} disabled={selected === data.slides.length - 1}><ChevronDown size={14} /></CrmV2Button>
                  <CrmV2Button onClick={() => removeSlide(selected)} style={{ marginLeft: 'auto', color: crmV2.danger }}>Supprimer</CrmV2Button>
                </div>
                <Field label="Mise en page">
                  <select value={slide.layout} onChange={e => updateSlide(selected, { layout: e.target.value as SlideLayout })} style={inputStyle}>
                    {LAYOUTS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </Field>
                <Field label="Titre">
                  <input value={slide.title} onChange={e => updateSlide(selected, { title: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Sous-titre">
                  <input value={slide.subtitle || ''} onChange={e => updateSlide(selected, { subtitle: e.target.value })} style={inputStyle} />
                </Field>
                {(slide.layout === 'quote' || slide.layout === 'cta' || slide.layout === 'section' || slide.layout === 'bullets') && (
                  <Field label="Texte">
                    <textarea value={slide.body || ''} onChange={e => updateSlide(selected, { body: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                  </Field>
                )}
                {(slide.layout === 'bullets' || slide.layout === 'split') && (
                  <Field label="Puces (une par ligne)">
                    <textarea
                      value={(slide.bullets || []).join('\n')}
                      onChange={e => updateSlide(selected, { bullets: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) })}
                      rows={6}
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </Field>
                )}
                {slide.layout === 'stats' && (
                  <Field label="Chiffres (valeur — libellé)">
                    <textarea
                      value={(slide.stats || []).map(s => `${s.value} — ${s.label}`).join('\n')}
                      onChange={e => updateSlide(selected, {
                        stats: e.target.value.split('\n').map(line => {
                          const [value, ...rest] = line.split(/[–—-]/)
                          return { value: (value || '').trim(), label: rest.join('-').trim() }
                        }).filter(s => s.value || s.label),
                      })}
                      rows={5}
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </Field>
                )}
                {slide.layout === 'cards' && (
                  <Field label="Cartes (titre : texte)">
                    <textarea
                      value={(slide.cards || []).map(c => c.body ? `${c.title} : ${c.body}` : c.title).join('\n')}
                      onChange={e => updateSlide(selected, {
                        cards: e.target.value.split('\n').map(line => {
                          const [title, ...rest] = line.split(':')
                          return { title: (title || '').trim(), body: rest.join(':').trim() }
                        }).filter(c => c.title || c.body),
                      })}
                      rows={6}
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </Field>
                )}
                {slide.layout === 'quiz' && (
                  <>
                    <Field label="Question">
                      <input
                        value={slide.quiz?.question || ''}
                        onChange={e => updateSlide(selected, { quiz: { ...(slide.quiz || { options: [] }), question: e.target.value } })}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Options (une par ligne)">
                      <textarea
                        value={(slide.quiz?.options || []).join('\n')}
                        onChange={e => updateSlide(selected, { quiz: { question: slide.quiz?.question || slide.title, options: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) } })}
                        rows={4}
                        style={{ ...inputStyle, resize: 'vertical' }}
                      />
                    </Field>
                  </>
                )}
                <Field label="Notes orateur">
                  <textarea value={slide.notes || ''} onChange={e => updateSlide(selected, { notes: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </Field>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: crmV2.text, marginTop: 8 }}>
                  <input type="checkbox" checked={slide.reveal !== false} onChange={e => updateSlide(selected, { reveal: e.target.checked })} />
                  Révélation progressive (clic / flèches)
                </label>
              </CrmV2Card>
            </div>
          )}

          {tab === 'brief' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16 }}>
              <CrmV2Card style={{ padding: 18 }}>
                <div style={{ display: 'grid', gap: 12 }}>
                  <Field label="Titre">
                    <input value={data.title} onChange={e => setData({ ...data, title: e.target.value })} style={inputStyle} />
                  </Field>
                  <Field label="Sous-titre">
                    <input value={data.subtitle || ''} onChange={e => setData({ ...data, subtitle: e.target.value })} style={inputStyle} />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="Marque">
                      <select value={data.brand} onChange={e => setData({ ...data, brand: e.target.value })} style={inputStyle}>
                        {WEBINAR_BRANDS.map(b => <option key={b} value={b}>{getDeckTheme(b).name}</option>)}
                      </select>
                    </Field>
                    <Field label="Date">
                      <input type="date" value={data.webinar_date || ''} onChange={e => setData({ ...data, webinar_date: e.target.value || null })} style={inputStyle} />
                    </Field>
                  </div>
                  <Field label="Brief">
                    <textarea
                      value={data.brief || ''}
                      onChange={e => setData({ ...data, brief: e.target.value })}
                      rows={10}
                      placeholder="Public, objectif, ton, messages à faire passer…"
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </Field>
                </div>
              </CrmV2Card>
              <CrmV2Card style={{ padding: 18 }}>
                <Field label="Guide source">
                  <textarea
                    value={data.source_guide || ''}
                    onChange={e => setData({ ...data, source_guide: e.target.value })}
                    rows={16}
                    placeholder="Colle ici le déroulé du webinaire."
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}
                  />
                </Field>
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <CrmV2Button
                    variant="gold"
                    disabled={saving}
                    onClick={() => patch({ action: 'regenerate_from_guide', source_guide: data.source_guide }, 'Slides régénérées')}
                  >
                    <Sparkles size={14} /> Régénérer les slides depuis le guide
                  </CrmV2Button>
                </div>
              </CrmV2Card>
            </div>
          )}

          {tab === 'feedback' && (
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <CrmV2Card style={{ padding: 18, border: presented ? `1px solid ${crmV2.goldBorder}` : undefined, background: presented ? '#fffdf6' : undefined }}>
                <h2 style={{ margin: '0 0 8px', fontSize: 16, color: crmV2.text }}>
                  {presented ? 'La présentation a été faite — tes retours' : 'Retours pour ajuster le deck'}
                </h2>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: crmV2.textMuted, lineHeight: 1.5 }}>
                  Note ici ce qui cloche, ce qu’il manque, le rythme, un slide trop chargé, un quiz à changer… On reprend la présentation à partir de ces retours.
                </p>
                <textarea
                  value={feedbackDraft}
                  onChange={e => setFeedbackDraft(e.target.value)}
                  rows={8}
                  placeholder="Ex. Slide 4 trop dense — garder 3 puces max. Ajouter un chiffre sur les places. Quiz trop facile."
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <CrmV2Button variant="primary" disabled={saving || !feedbackDraft.trim()} onClick={sendFeedback}>
                    Envoyer le retour
                  </CrmV2Button>
                </div>
              </CrmV2Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(data.feedback || []).length === 0 && (
                  <CrmV2Card style={{ padding: 18, color: crmV2.textMuted, fontSize: 14 }}>
                    Aucun retour pour l’instant.
                  </CrmV2Card>
                )}
                {(data.feedback || []).map(f => (
                  <CrmV2Card key={f.id} style={{ padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                        background: f.status === 'open' ? 'rgba(201,168,76,0.18)' : f.status === 'applied' ? 'rgba(0,189,165,0.14)' : crmV2.bgSoft,
                        color: f.status === 'open' ? '#b45309' : f.status === 'applied' ? '#0f766e' : crmV2.textMuted,
                      }}>
                        {f.status === 'open' ? 'Ouvert' : f.status === 'applied' ? 'Pris en compte' : 'Ignoré'}
                      </span>
                      <span style={{ fontSize: 11, color: crmV2.textFaint }}>
                        {new Date(f.created_at).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 14, color: crmV2.text, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{f.body}</p>
                    {f.status === 'open' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <CrmV2Button onClick={() => setFeedbackStatus(f.id, 'applied')}>Marquer pris en compte</CrmV2Button>
                        <CrmV2Button onClick={() => setFeedbackStatus(f.id, 'dismissed')}>Ignorer</CrmV2Button>
                      </div>
                    )}
                  </CrmV2Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </CrmV2Page>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, background: crmV2.text, color: '#fff',
          padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 40,
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${crmV2.borderStrong}`,
  background: '#fff',
  color: crmV2.text,
  fontSize: 13,
  fontFamily: 'inherit',
}
