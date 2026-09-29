'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Clock, Coins, MapPin, Mic, PlayCircle } from 'lucide-react'
import { DIPLOMA_FOOTER_HTML } from '@/components/event-landing/diploma-chrome-html'
import '@/components/event-landing/event-landing.css'
import {
  PODCAST_DURATION,
  PODCAST_FEE,
  PODCAST_NAME,
  PODCAST_PROFILE_OPTIONS,
  type PodcastProfileType,
} from '@/lib/podcast-casting'

// Même charte que les landings événements (components/event-landing/EventLandingPage.tsx).
const NAVY = '#12314d'
const GOLD = '#d3ab67'
const BLUE = '#4fabdb'
const SERIF = "'PP Pangaia',serif"
const DISPLAY = "'Clash Display',sans-serif"

const BADGES = [`${PODCAST_FEE} par interview`, PODCAST_DURATION, 'Studio à Levallois', 'Aucun script']

const PROFILS = [
  {
    title: 'Un parcours qui sort du lot',
    text: 'Redoublement, réorientation, LAS, passerelle, réussite sans prépa, échec puis rebond… Pas besoin d’avoir été élève chez Diploma Santé : ce qui compte, c’est votre histoire.',
  },
  {
    title: 'Un regard de l’intérieur',
    text: 'Professeurs, médecins, dentistes, pharmaciens, sages-femmes, kinés, parents : vous avez vu la première année de près et vous avez des choses à en dire.',
  },
  {
    title: 'L’envie de raconter',
    text: 'Pas besoin d’être à l’aise devant une caméra. C’est une conversation, pas un interrogatoire : on vous met à l’aise avant d’enregistrer.',
  },
]

const ETAPES = [
  { time: '2 min', title: 'Vous candidatez', text: 'Vous remplissez ce formulaire en racontant votre parcours en quelques lignes.' },
  { time: '15 min', title: 'Un appel pour faire connaissance', text: 'Si votre profil correspond à un épisode, on vous appelle pour échanger sur votre histoire et répondre à vos questions.' },
  { time: '30–45 min', title: 'L’enregistrement', text: 'Au studio Diploma Santé à Levallois, face à Benjamin Haddad, fondateur de Diploma Santé. Vous racontez avec vos mots, sans script.' },
  { time: 'Ensuite', title: 'La diffusion', text: 'L’épisode sort en vidéo sur les réseaux de Diploma Santé, avec des extraits courts. On vous identifie pour que vous puissiez le partager.' },
]

const A_PREVOIR = [
  `${PODCAST_FEE} de rémunération pour l’interview`,
  'Vous déplacer au studio à Levallois-Perret',
  'Accepter d’être filmé(e) : l’épisode est diffusé en vidéo',
  'Rien à préparer : on s’occupe du reste',
]

const FAQ = [
  {
    q: 'Faut-il avoir été élève chez Diploma Santé ?',
    a: 'Non. Le podcast est ouvert à tous les parcours, avec ou sans prépa. Ce qu’on cherche, ce sont des histoires vraies sur la première année.',
  },
  {
    q: 'Est-ce que je devrai parler de Diploma Santé ?',
    a: 'Non. Vous racontez votre parcours librement. Il n’y a ni questions orientées ni script : l’émission n’a d’intérêt que si elle reste sincère.',
  },
  {
    q: 'Je ne suis pas à l’aise devant une caméra, est-ce un problème ?',
    a: 'Pas du tout. L’appel de 15 minutes sert aussi à faire connaissance. Le jour J, c’est une conversation détendue et pas un oral.',
  },
  {
    q: 'Comment se passe la rémunération ?',
    a: `L’interview est rémunérée ${PODCAST_FEE}. Le versement est organisé après l’enregistrement.`,
  },
  {
    q: 'Tout le monde est-il retenu ?',
    a: 'On sélectionne les invités pour varier les parcours d’un épisode à l’autre. Si votre profil correspond à un prochain épisode, on vous recontacte pour l’appel de découverte.',
  },
  {
    q: 'J’ai moins de 18 ans, puis-je participer ?',
    a: 'Oui, avec l’accord d’un parent ou responsable légal, qui vous sera demandé avant l’enregistrement.',
  },
]

function scrollToForm(e?: React.MouseEvent) {
  e?.preventDefault()
  document.getElementById('ev-inscription')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function GoldCheck({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <span style={{ display: 'block', fontSize: 11.5, letterSpacing: '0.04em', color: NAVY, opacity: 0.6, marginBottom: 6 }}>
      {children}
      {required ? ' *' : ''}
    </span>
  )
}

function CandidatureForm() {
  const [values, setValues] = useState({
    firstname: '', lastname: '', email: '', phone: '',
    profile_type: '' as PodcastProfileType | '', parcours: '', story: '', social: '',
  })
  const [website, setWebsite] = useState('') // honeypot
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues(prev => ({ ...prev, [k]: e.target.value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!consent) {
      setError('Merci d’accepter d’être recontacté au sujet du podcast.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/podcast/candidature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, consent, website }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Une erreur est survenue, merci de réessayer.')
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      id="ev-inscription"
      onSubmit={handleSubmit}
      style={{ background: '#fff', borderRadius: 32, padding: 'clamp(24px,2.4vw,30px)', boxShadow: '0 30px 70px rgba(0,0,0,.3)', scrollMarginTop: 24 }}
    >
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 11, letterSpacing: '0.13em', textTransform: 'uppercase', color: BLUE, marginBottom: 10 }}>
        Candidature
      </div>
      <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 24, color: NAVY, margin: '0 0 6px', lineHeight: 1.15 }}>
        Participer au podcast
      </h2>
      <p style={{ fontSize: 13.5, color: NAVY, opacity: 0.7, lineHeight: 1.55, margin: '0 0 20px' }}>
        2 minutes pour nous raconter votre histoire.
      </p>

      {success ? (
        <div style={{ textAlign: 'center', padding: '22px 0' }}>
          <span style={{ width: 52, height: 52, borderRadius: '50%', background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <GoldCheck size={24} />
          </span>
          <span style={{ display: 'block', fontFamily: SERIF, fontWeight: 700, fontSize: 21, color: NAVY, marginBottom: 8 }}>
            Candidature envoyée, merci !
          </span>
          <span style={{ display: 'block', fontSize: 14, color: NAVY, opacity: 0.75, lineHeight: 1.6 }}>
            On lit chaque histoire avec attention. Si votre profil correspond à un prochain épisode, on vous appelle pour faire connaissance.
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <div className="ev-pair" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
            <label style={{ display: 'block' }}>
              <Label required>Prénom</Label>
              <input className="ev-field" value={values.firstname} onChange={set('firstname')} required autoComplete="given-name" />
            </label>
            <label style={{ display: 'block' }}>
              <Label required>Nom</Label>
              <input className="ev-field" value={values.lastname} onChange={set('lastname')} required autoComplete="family-name" />
            </label>
          </div>
          <div className="ev-pair" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
            <label style={{ display: 'block' }}>
              <Label required>Email</Label>
              <input className="ev-field" type="email" value={values.email} onChange={set('email')} required autoComplete="email" />
            </label>
            <label style={{ display: 'block' }}>
              <Label required>Téléphone</Label>
              <input className="ev-field" type="tel" value={values.phone} onChange={set('phone')} required autoComplete="tel" />
            </label>
          </div>
          <label style={{ display: 'block' }}>
            <Label required>Vous êtes</Label>
            <select className="ev-field" value={values.profile_type} onChange={set('profile_type')} required>
              <option value="">Choisir</option>
              {PODCAST_PROFILE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'block' }}>
            <Label>Votre parcours en une ligne</Label>
            <input className="ev-field" value={values.parcours} onChange={set('parcours')} placeholder="Ex : PASS 2023 à Paris Cité, aujourd’hui en 3e année de médecine" />
          </label>
          <label style={{ display: 'block' }}>
            <Label required>Votre histoire</Label>
            <textarea
              className="ev-field"
              value={values.story}
              onChange={set('story')}
              required
              minLength={30}
              rows={4}
              placeholder="Qu’est-ce qui rend votre parcours unique ? Un moment fort, un obstacle, un déclic…"
              style={{ resize: 'vertical' }}
            />
          </label>
          <label style={{ display: 'block' }}>
            <Label>Instagram ou TikTok</Label>
            <input className="ev-field" value={values.social} onChange={set('social')} placeholder="@votrecompte" />
          </label>
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={e => setWebsite(e.target.value)}
            name="website"
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
            aria-hidden="true"
          />
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, color: NAVY, opacity: 0.7, lineHeight: 1.5, marginTop: 2 }}>
            <input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 2, accentColor: BLUE, flex: 'none' }} />
            <span>J’accepte d’être recontacté(e) par Diploma Santé au sujet du podcast.</span>
          </label>
          {error && (
            <div style={{ padding: 10, background: 'rgba(185,28,28,0.08)', border: '1px solid #fecaca', borderRadius: 12, color: '#b91c1c', fontSize: 13 }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="cta cta-gold"
            style={{
              background: GOLD, color: NAVY, fontFamily: DISPLAY, fontWeight: 600, fontSize: 15.5, border: 'none',
              borderRadius: 999, padding: '17px 24px', cursor: submitting ? 'default' : 'pointer', width: '100%',
              marginTop: 4, opacity: submitting ? 0.65 : 1,
            }}
          >
            {submitting ? 'Envoi…' : 'Envoyer ma candidature'}
          </button>
          <p style={{ fontSize: 11.5, color: NAVY, opacity: 0.6, lineHeight: 1.5, textAlign: 'center', margin: '2px 0 0' }}>
            Interview rémunérée {PODCAST_FEE} · {PODCAST_DURATION}
          </p>
        </div>
      )}
    </form>
  )
}

function InfoCard({ icon, label, text }: { icon: ReactNode; label: string; text: string }) {
  return (
    <div style={{ background: '#f4f7fa', borderRadius: 26, padding: 'clamp(22px,2.4vw,28px)' }}>
      <div style={{ color: BLUE, marginBottom: 14 }}>{icon}</div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: NAVY, opacity: 0.55, marginBottom: 8 }}>
        {label}
      </div>
      <p style={{ fontSize: 14.5, color: NAVY, lineHeight: 1.6, margin: 0 }}>{text}</p>
    </div>
  )
}

const fullBleed = {
  marginLeft: 'calc(50% - 50vw)',
  marginRight: 'calc(50% - 50vw)',
  paddingLeft: 'max(32px, calc(50vw - 588px))',
  paddingRight: 'max(32px, calc(50vw - 588px))',
} as const

export default function PodcastLanding() {
  const [barOn, setBarOn] = useState(false)

  useEffect(() => {
    const onScroll = () => setBarOn(window.scrollY > window.innerHeight * 0.8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="event-landing">
      {/* ── Hero ── */}
      <div style={{ background: NAVY, position: 'relative', overflow: 'hidden' }}>
        <img
          src="/event-landing/serpent-blanc.svg"
          alt=""
          aria-hidden="true"
          style={{ position: 'absolute', top: '50%', left: -140, transform: 'translateY(-50%)', height: '142%', opacity: 0.05, pointerEvents: 'none' }}
        />
        <div className="ev-hero-wrap" style={{ position: 'relative', maxWidth: 1240, margin: '0 auto', padding: 'clamp(40px,5.5vw,72px) 32px clamp(48px,5.2vw,80px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'rgba(255,255,255,.72)', marginBottom: 'clamp(22px,2.4vw,32px)', flexWrap: 'wrap' }}>
            <img src="/event-landing/logo-diploma-blanc.svg" alt="Diploma Santé" style={{ height: 22 }} />
            <span style={{ opacity: 0.5 }}>/</span>
            <span style={{ color: '#fff' }}>Podcast</span>
          </div>

          <div className="ev-hero" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 'clamp(32px,4vw,64px)', alignItems: 'start' }}>
            <div className="ev-hero-txt">
              <div className="ev-hero-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 26, flexWrap: 'wrap' }}>
                  <span style={{ background: GOLD, borderRadius: 20, width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                    <Mic size={30} color={NAVY} strokeWidth={2.2} />
                  </span>
                  <div>
                    <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,.72)', marginBottom: 6 }}>
                      Nouveau podcast · Appel à invités
                    </div>
                    <div style={{ fontSize: 14, color: '#fff' }}>Interview rémunérée {PODCAST_FEE}</div>
                  </div>
                </div>

                <h1 style={{ fontFamily: SERIF, fontWeight: 700, color: '#fff', fontSize: 'clamp(34px,4.2vw,56px)', lineHeight: 1.05, letterSpacing: '-0.015em', margin: '0 0 22px' }}>
                  {PODCAST_NAME}, <span style={{ color: BLUE }}>racontée par ceux qui l’ont vécue.</span>
                </h1>
              </div>
              <div className="ev-hero-body">
                <p style={{ fontSize: 16.5, color: 'rgba(255,255,255,.82)', lineHeight: 1.7, margin: '0 0 16px', maxWidth: '56ch' }}>
                  Diploma Santé lance <strong style={{ color: '#fff' }}>« {PODCAST_NAME} »</strong>, un podcast vidéo tourné dans notre studio de Levallois.
                  À chaque épisode, Benjamin Haddad reçoit quelqu’un qui a vécu la première année de médecine de l’intérieur.
                </p>
                <p style={{ fontSize: 16.5, color: 'rgba(255,255,255,.82)', lineHeight: 1.7, margin: '0 0 28px', maxWidth: '56ch' }}>
                  Étudiants aux parcours hors norme, profs, médecins, dentistes, parents : on cherche des{' '}
                  <strong style={{ color: '#fff' }}>histoires vraies, sans filtre</strong>. Vous en avez une ? Candidatez, l’interview est rémunérée {PODCAST_FEE}.
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {BADGES.map(b => (
                    <span key={b} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, border: '1px solid rgba(255,255,255,.22)', borderRadius: 999, padding: '10px 18px', fontSize: 13.5, color: '#fff' }}>
                      <GoldCheck />
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <aside className="ev-hero-form">
              <CandidatureForm />
            </aside>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 32px', display: 'flex', flexDirection: 'column' }}>
        {/* ── Qui on cherche ── */}
        <section style={{ border: '1px solid #e6eaee', borderRadius: 40, padding: 'clamp(34px,3.6vw,58px)', marginTop: 'clamp(48px,5.5vw,88px)' }}>
          <div style={{ maxWidth: '64ch', margin: '0 0 clamp(26px,2.8vw,38px)' }}>
            <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(26px,2.9vw,38px)', lineHeight: 1.08, color: NAVY, margin: '0 0 12px' }}>
              Qui on <span style={{ color: BLUE }}>cherche</span>
            </h2>
            <p style={{ fontSize: 16, color: NAVY, opacity: 0.75, lineHeight: 1.6, margin: 0 }}>
              La première année de médecine fait peur, et on en entend surtout la version officielle. Ce podcast donne la parole à ceux qui peuvent en parler vraiment.
            </p>
          </div>
          <div className="ev-g3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {PROFILS.map(a => (
              <div key={a.title} style={{ background: '#fff', border: '1px solid #e6eaee', borderRadius: 28, padding: 'clamp(24px,2.6vw,32px)' }}>
                <h3 style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17, color: NAVY, margin: '0 0 10px' }}>{a.title}</h3>
                <p style={{ fontSize: 14.5, color: NAVY, opacity: 0.82, lineHeight: 1.7, margin: 0 }}>{a.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Déroulé ── */}
        <section style={{ ...fullBleed, background: NAVY, paddingTop: 'clamp(52px,6vw,96px)', paddingBottom: 'clamp(52px,6vw,96px)', marginTop: 'clamp(48px,5.5vw,88px)', position: 'relative', overflow: 'hidden' }}>
          <img
            src="/event-landing/serpent-blanc.svg"
            alt=""
            aria-hidden="true"
            style={{ position: 'absolute', top: '50%', right: -160, transform: 'translateY(-50%)', height: '150%', opacity: 0.05, pointerEvents: 'none' }}
          />
          <div style={{ position: 'relative' }}>
            <div style={{ maxWidth: '64ch', margin: '0 0 clamp(26px,2.8vw,38px)' }}>
              <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(26px,2.9vw,38px)', lineHeight: 1.08, color: '#fff', margin: '0 0 12px' }}>
                Comment ça <span style={{ color: GOLD }}>se passe</span>
              </h2>
              <p style={{ fontSize: 15.5, color: 'rgba(255,255,255,.78)', lineHeight: 1.6, margin: 0 }}>
                De la candidature à la diffusion, tout est simple et on vous accompagne à chaque étape.
              </p>
            </div>
            <div className="ev-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 'clamp(28px,3.4vw,56px)', alignItems: 'start' }}>
              <div>
                {ETAPES.map((row, i) => (
                  <div
                    key={row.title}
                    style={{
                      display: 'grid', gridTemplateColumns: '92px 1fr', gap: 'clamp(14px,1.8vw,24px)', alignItems: 'start', padding: '20px 0',
                      borderBottom: i === ETAPES.length - 1 ? 'none' : '1px solid rgba(255,255,255,.14)',
                    }}
                  >
                    <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16, color: GOLD, lineHeight: 1.3, paddingTop: 2 }}>{row.time}</span>
                    <span>
                      <span style={{ display: 'block', fontFamily: DISPLAY, fontWeight: 600, fontSize: 16, color: '#fff', marginBottom: 6 }}>{row.title}</span>
                      <span style={{ display: 'block', fontSize: 14.5, color: 'rgba(255,255,255,.78)', lineHeight: 1.65 }}>{row.text}</span>
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 28, padding: 'clamp(24px,2.6vw,30px)' }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: GOLD, marginBottom: 16 }}>
                  À savoir
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {A_PREVOIR.map(item => (
                    <li key={item} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', fontSize: 14, color: 'rgba(255,255,255,.82)', lineHeight: 1.6 }}>
                      <span style={{ marginTop: 4 }}><GoldCheck /></span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── Infos pratiques ── */}
        <section style={{ border: '1px solid #e6eaee', borderRadius: 40, padding: 'clamp(34px,3.6vw,58px)', marginTop: 'clamp(48px,5.5vw,88px)' }}>
          <div style={{ maxWidth: '64ch', margin: '0 0 clamp(26px,2.8vw,38px)' }}>
            <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(26px,2.9vw,38px)', lineHeight: 1.08, color: NAVY, margin: 0 }}>
              Informations <span style={{ color: BLUE }}>pratiques</span>
            </h2>
          </div>
          <div className="ev-g4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
            <InfoCard icon={<Clock size={20} strokeWidth={2.6} />} label="Durée" text={`Interview de ${PODCAST_DURATION}`} />
            <InfoCard icon={<Coins size={20} strokeWidth={2.6} />} label="Rémunération" text={`${PODCAST_FEE} par interview`} />
            <InfoCard icon={<MapPin size={20} strokeWidth={2.6} />} label="Lieu" text="Studio Diploma Santé, Levallois-Perret" />
            <InfoCard icon={<PlayCircle size={20} strokeWidth={2.6} />} label="Diffusion" text="Épisode vidéo + extraits sur les réseaux de Diploma Santé" />
          </div>
        </section>

        {/* ── FAQ ── */}
        <section style={{ background: '#f4f7fa', borderRadius: 40, padding: 'clamp(34px,3.6vw,58px)', marginTop: 'clamp(48px,5.5vw,88px)' }}>
          <div style={{ maxWidth: '64ch', margin: '0 0 clamp(26px,2.8vw,38px)' }}>
            <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(26px,2.9vw,38px)', lineHeight: 1.08, color: NAVY, margin: 0 }}>
              Questions <span style={{ color: BLUE }}>fréquentes</span>
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {FAQ.map(item => (
              <details key={item.q} className="faq-row" style={{ background: '#f8f7f4', borderRadius: 20, padding: '20px 24px' }}>
                <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, fontFamily: DISPLAY, fontWeight: 600, fontSize: 15.5, color: NAVY }}>
                  {item.q}
                  <span style={{ position: 'relative', width: 16, height: 16, flex: 'none' }}>
                    <span style={{ position: 'absolute', left: 0, top: 7, width: 16, height: 2, borderRadius: 2, background: BLUE }} />
                    <span className="faq-ln2" style={{ position: 'absolute', left: 7, top: 0, width: 2, height: 16, borderRadius: 2, background: BLUE, transition: '.2s' }} />
                  </span>
                </summary>
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 14.5, color: NAVY, opacity: 0.85, lineHeight: 1.7, margin: 0 }}>{item.a}</p>
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* ── CTA final ── */}
        <section style={{ ...fullBleed, background: NAVY, paddingTop: 'clamp(56px,6.5vw,104px)', paddingBottom: 'clamp(56px,6.5vw,104px)', marginTop: 'clamp(48px,5.5vw,88px)', textAlign: 'center' }}>
          <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(25px,2.9vw,38px)', color: '#fff', margin: '0 auto 16px', maxWidth: '28ch' }}>
            Votre histoire peut aider <span style={{ color: BLUE }}>ceux qui se lancent.</span>
          </h2>
          <p style={{ fontSize: 15.5, color: 'rgba(255,255,255,.78)', margin: '0 auto 30px', maxWidth: '52ch' }}>
            Des milliers de lycéens hésitent à se lancer en médecine. Votre témoignage peut faire la différence.
          </p>
          <a href="#ev-inscription" onClick={scrollToForm} className="cta cta-gold" style={{ display: 'inline-block', background: GOLD, color: NAVY, fontFamily: DISPLAY, fontWeight: 600, fontSize: 15, borderRadius: 999, padding: '17px 34px' }}>
            Je candidate
          </a>
        </section>
      </div>

      {/* ── Barre sticky ── */}
      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60,
          transform: barOn ? 'translateY(0)' : 'translateY(110%)', opacity: barOn ? 1 : 0, pointerEvents: barOn ? 'auto' : 'none',
          transition: 'transform .28s ease, opacity .28s ease', background: NAVY,
          borderTop: '1px solid rgba(255,255,255,.14)', boxShadow: '0 -12px 40px rgba(0,0,0,.28)',
        }}
      >
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '13px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 15, minWidth: 0 }}>
            <span style={{ background: GOLD, borderRadius: 14, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <Mic size={20} color={NAVY} strokeWidth={2.2} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="ev-bar-t" style={{ display: 'block', fontFamily: DISPLAY, fontWeight: 600, fontSize: 15, color: '#fff', lineHeight: 1.25 }}>
                Podcast « {PODCAST_NAME} »
              </span>
              <span className="ev-bar-s" style={{ display: 'block', fontSize: 12.5, color: 'rgba(255,255,255,.72)', marginTop: 3 }}>
                Interview rémunérée {PODCAST_FEE} · {PODCAST_DURATION}
              </span>
            </span>
          </div>
          <a href="#ev-inscription" onClick={scrollToForm} className="cta cta-gold" style={{ background: GOLD, color: NAVY, fontFamily: DISPLAY, fontWeight: 600, fontSize: 15, borderRadius: 999, padding: '15px 32px', flex: 'none' }}>
            Je candidate
          </a>
        </div>
      </div>

      <div dangerouslySetInnerHTML={{ __html: DIPLOMA_FOOTER_HTML }} />
    </div>
  )
}
