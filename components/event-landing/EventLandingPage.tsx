'use client'

import { useEffect, useState } from 'react'
import EventLandingForm from './EventLandingForm'
import { DIPLOMA_FOOTER_HTML, DIPLOMA_HEADER_HTML, DIPLOMA_SITE } from './diploma-chrome-html'
import './event-landing.css'
import type { EventDateFormat, EventLandingData, LandingCopy } from '@/lib/event-landing/types'
import { prettyLocation } from '@/lib/event-landing/format'

function GoldCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d3ab67" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function RichNavy({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} style={{ color: '#fff' }}>
            {p}
          </strong>
        ) : (
          p
        ),
      )}
    </>
  )
}

function Nl({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 ? <br /> : null}
          {line}
        </span>
      ))}
    </>
  )
}

function scrollToForm(e?: React.MouseEvent) {
  e?.preventDefault()
  document.getElementById('ev-inscription')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function EventLandingPage({
  data,
  copy,
  fmt,
  remainingText,
}: {
  data: EventLandingData
  copy: LandingCopy
  fmt: EventDateFormat
  remainingText: string | null
}) {
  const [barOn, setBarOn] = useState(false)
  const { form, event, capacity } = data
  const lieu = prettyLocation(event.location) || (copy.kind === 'webinaire' ? 'En ligne' : '')
  const submitLabel =
    form.submit_label && form.submit_label !== 'Envoyer' ? form.submit_label : copy.ctaLabel

  useEffect(() => {
    const onScroll = () => setBarOn(window.scrollY > window.innerHeight * 0.8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="event-landing">
      <div dangerouslySetInnerHTML={{ __html: DIPLOMA_HEADER_HTML }} />

      <div style={{ background: '#12314d', position: 'relative', overflow: 'hidden' }}>
        <img
          src="/event-landing/serpent-blanc.svg"
          alt=""
          aria-hidden="true"
          style={{ position: 'absolute', top: '50%', left: -140, transform: 'translateY(-50%)', height: '142%', opacity: 0.05, pointerEvents: 'none' }}
        />
        <div className="ev-hero-wrap" style={{ position: 'relative', maxWidth: 1240, margin: '0 auto', padding: 'clamp(92px,8.5vw,142px) 32px clamp(48px,5.2vw,80px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'rgba(255,255,255,.72)', marginBottom: 'clamp(22px,2.4vw,32px)', flexWrap: 'wrap' }}>
            <a href={`${DIPLOMA_SITE}/evenements/`} style={{ color: 'rgba(255,255,255,.72)' }}>
              Nos événements
            </a>
            <span style={{ opacity: 0.5 }}>/</span>
            <span style={{ color: '#fff' }}>{copy.breadcrumb}</span>
          </div>

          <div className="ev-hero" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 'clamp(32px,4vw,64px)', alignItems: 'start' }}>
            <div className="ev-hero-txt">
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 26, flexWrap: 'wrap' }}>
                <span style={{ background: '#d3ab67', borderRadius: 20, padding: '13px 19px', textAlign: 'center', flex: 'none' }}>
                  <span style={{ display: 'block', fontFamily: "'PP Pangaia',serif", fontWeight: 700, fontSize: 34, color: '#12314d', lineHeight: 1 }}>
                    {fmt.jour}
                  </span>
                  <span style={{ display: 'block', fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: 11, letterSpacing: '0.1em', color: '#12314d', marginTop: 2 }}>
                    {fmt.mois}
                  </span>
                </span>
                <div>
                  <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,.72)', marginBottom: 6 }}>
                    {fmt.weekday} · {fmt.horaires}
                  </div>
                  <div style={{ fontSize: 14, color: '#fff' }}>{lieu || copy.acces.split('\n')[0]}</div>
                </div>
              </div>

              <h1 style={{ fontFamily: "'PP Pangaia',serif", fontWeight: 700, color: '#fff', fontSize: 'clamp(34px,4.2vw,56px)', lineHeight: 1.05, letterSpacing: '-0.015em', margin: '0 0 22px' }}>
                {copy.heroAccent ? (
                  <>
                    {copy.heroTitle} <span style={{ color: '#4fabdb' }}>{copy.heroAccent}</span>
                  </>
                ) : (
                  copy.heroTitle
                )}
              </h1>
              {copy.chapeaux.map((p, i) => (
                <p
                  key={i}
                  style={{
                    fontSize: 16.5,
                    color: 'rgba(255,255,255,.82)',
                    lineHeight: 1.7,
                    margin: i === copy.chapeaux.length - 1 ? '0 0 28px' : '0 0 16px',
                    maxWidth: '56ch',
                  }}
                >
                  <RichNavy text={p} />
                </p>
              ))}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {copy.badges.map((b) => (
                  <span
                    key={b}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 9,
                      border: '1px solid rgba(255,255,255,.22)',
                      borderRadius: 999,
                      padding: '10px 18px',
                      fontSize: 13.5,
                      color: '#fff',
                    }}
                  >
                    <GoldCheck />
                    {b}
                  </span>
                ))}
              </div>
            </div>

            <aside className="ev-hero-form">
              <EventLandingForm
                slug={form.slug}
                form={form}
                remainingText={remainingText}
                isFull={capacity.is_full}
                kicker={copy.formKicker}
                title={copy.formTitle}
                successTitle={copy.formSuccessTitle}
                successText={copy.formSuccessText}
                submitLabel={submitLabel}
              />
            </aside>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 32px', display: 'flex', flexDirection: 'column' }}>
        <section style={{ border: '1px solid #e6eaee', borderRadius: 40, padding: 'clamp(34px,3.6vw,58px)', marginTop: 'clamp(48px,5.5vw,88px)' }}>
          <div style={{ maxWidth: '64ch', margin: '0 0 clamp(26px,2.8vw,38px)' }}>
            <h2 style={{ fontFamily: "'PP Pangaia',serif", fontWeight: 700, fontSize: 'clamp(26px,2.9vw,38px)', lineHeight: 1.08, color: '#12314d', margin: '0 0 12px' }}>
              {copy.whyTitle} <span style={{ color: '#4fabdb' }}>{copy.whyAccent}</span>
            </h2>
            <p style={{ fontSize: 16, color: '#12314d', opacity: 0.75, lineHeight: 1.6, margin: 0 }}>{copy.whyLead}</p>
          </div>
          <div className="ev-g3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {copy.avantages.map((a) => (
              <div key={a.title} style={{ background: '#fff', border: '1px solid #e6eaee', borderRadius: 28, padding: 'clamp(24px,2.6vw,32px)' }}>
                <h3 style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: 17, color: '#12314d', margin: '0 0 10px' }}>{a.title}</h3>
                <p style={{ fontSize: 14.5, color: '#12314d', opacity: 0.82, lineHeight: 1.7, margin: 0 }}>{a.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            background: '#12314d',
            marginLeft: 'calc(50% - 50vw)',
            marginRight: 'calc(50% - 50vw)',
            paddingLeft: 'max(32px, calc(50vw - 588px))',
            paddingRight: 'max(32px, calc(50vw - 588px))',
            paddingTop: 'clamp(52px,6vw,96px)',
            paddingBottom: 'clamp(52px,6vw,96px)',
            marginTop: 'clamp(48px,5.5vw,88px)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <img
            src="/event-landing/serpent-blanc.svg"
            alt=""
            aria-hidden="true"
            style={{ position: 'absolute', top: '50%', right: -160, transform: 'translateY(-50%)', height: '150%', opacity: 0.05, pointerEvents: 'none' }}
          />
          <div style={{ position: 'relative' }}>
            <div style={{ maxWidth: '64ch', margin: '0 0 clamp(26px,2.8vw,38px)' }}>
              <h2 style={{ fontFamily: "'PP Pangaia',serif", fontWeight: 700, fontSize: 'clamp(26px,2.9vw,38px)', lineHeight: 1.08, color: '#fff', margin: '0 0 12px' }}>
                {copy.derouleTitle} <span style={{ color: '#d3ab67' }}>{copy.derouleAccent}</span>
              </h2>
              <p style={{ fontSize: 15.5, color: 'rgba(255,255,255,.78)', lineHeight: 1.6, margin: 0 }}>{copy.derouleLead}</p>
            </div>
            <div className="ev-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 'clamp(28px,3.4vw,56px)', alignItems: 'start' }}>
              <div>
                {copy.deroule.map((row, i) => (
                  <div
                    key={row.title}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '92px 1fr',
                      gap: 'clamp(14px,1.8vw,24px)',
                      alignItems: 'start',
                      padding: '20px 0',
                      borderBottom: i === copy.deroule.length - 1 ? 'none' : '1px solid rgba(255,255,255,.14)',
                    }}
                  >
                    <span style={{ fontFamily: "'PP Pangaia',serif", fontWeight: 700, fontSize: 16, color: '#d3ab67', lineHeight: 1.3, paddingTop: 2 }}>{row.time}</span>
                    <span>
                      <span style={{ display: 'block', fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: 16, color: '#fff', marginBottom: 6 }}>{row.title}</span>
                      <span style={{ display: 'block', fontSize: 14.5, color: 'rgba(255,255,255,.78)', lineHeight: 1.65 }}>{row.text}</span>
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 28, padding: 'clamp(24px,2.6vw,30px)' }}>
                <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#d3ab67', marginBottom: 16 }}>
                  À prévoir
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {copy.aPrevoir.map((item) => (
                    <li key={item} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', fontSize: 14, color: 'rgba(255,255,255,.82)', lineHeight: 1.6 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d3ab67" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', marginTop: 4 }}>
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            background: '#dddddc',
            marginLeft: 'calc(50% - 50vw)',
            marginRight: 'calc(50% - 50vw)',
            paddingLeft: 'max(32px, calc(50vw - 588px))',
            paddingRight: 'max(32px, calc(50vw - 588px))',
            paddingTop: 'clamp(52px,6vw,96px)',
            paddingBottom: 'clamp(52px,6vw,96px)',
            marginTop: 'clamp(48px,5.5vw,88px)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle at 50% 50%, rgba(211,171,103,.35), transparent 68%)', top: -180, right: -120 }} />
          <div style={{ position: 'relative' }}>
            <div style={{ maxWidth: 820, margin: '0 auto clamp(34px,3.8vw,50px)', textAlign: 'center' }}>
              <h2 style={{ fontFamily: "'PP Pangaia',serif", fontWeight: 700, fontSize: 'clamp(26px,3vw,40px)', color: '#12314d', margin: '0 0 14px' }}>
                {copy.temoinsTitle} <span style={{ color: '#4fabdb' }}>{copy.temoinsAccent}</span>
              </h2>
              <p style={{ fontSize: 15.5, color: '#12314d', opacity: 0.75, lineHeight: 1.6, margin: 0 }}>{copy.temoinsLead}</p>
            </div>
            <div className="ev-g3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
              {copy.temoins.map((t) => (
                <div key={t.name} style={{ background: '#fff', borderRadius: 28, padding: 'clamp(24px,2.6vw,30px)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 16 }}>
                    <img src={t.photo} alt={t.name} style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 0 0 2px rgba(211,171,103,.6)', flex: 'none' }} />
                    <span>
                      <span style={{ display: 'block', fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: 15, color: '#12314d' }}>{t.name}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: '#12314d', opacity: 0.7, marginTop: 2 }}>{t.role}</span>
                    </span>
                  </div>
                  <p style={{ fontSize: 14.5, color: '#12314d', opacity: 0.88, lineHeight: 1.65, margin: 0 }}>{t.quote}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ border: '1px solid #e6eaee', borderRadius: 40, padding: 'clamp(34px,3.6vw,58px)', marginTop: 'clamp(48px,5.5vw,88px)' }}>
          <div style={{ maxWidth: '64ch', margin: '0 0 clamp(26px,2.8vw,38px)' }}>
            <h2 style={{ fontFamily: "'PP Pangaia',serif", fontWeight: 700, fontSize: 'clamp(26px,2.9vw,38px)', lineHeight: 1.08, color: '#12314d', margin: 0 }}>
              Informations <span style={{ color: '#4fabdb' }}>pratiques</span>
            </h2>
          </div>
          <div className="ev-g4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
            <InfoCard
              icon="pin"
              label="Lieu"
              text={copy.kind === 'webinaire' ? 'En ligne' : prettyLocation(event.location) || copy.acces}
            />
            <InfoCard icon="metro" label="Accès" text={copy.acces} />
            <InfoCard icon="clock" label="Horaires" text={`${fmt.dateLongue.charAt(0).toUpperCase()}${fmt.dateLongue.slice(1)}\n${fmt.horaires}`} />
            <InfoCard icon="doc" label="Tarif" text={copy.tarif} />
          </div>
        </section>

        <section style={{ background: '#f4f7fa', borderRadius: 40, padding: 'clamp(34px,3.6vw,58px)', marginTop: 'clamp(48px,5.5vw,88px)' }}>
          <div style={{ maxWidth: '64ch', margin: '0 0 clamp(26px,2.8vw,38px)' }}>
            <h2 style={{ fontFamily: "'PP Pangaia',serif", fontWeight: 700, fontSize: 'clamp(26px,2.9vw,38px)', lineHeight: 1.08, color: '#12314d', margin: 0 }}>
              Questions <span style={{ color: '#4fabdb' }}>fréquentes</span>
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {copy.faq.map((item) => (
              <details key={item.q} className="faq-row" style={{ background: '#f8f7f4', borderRadius: 20, padding: '20px 24px' }}>
                <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: 15.5, color: '#12314d' }}>
                  {item.q}
                  <span style={{ position: 'relative', width: 16, height: 16, flex: 'none' }}>
                    <span style={{ position: 'absolute', left: 0, top: 7, width: 16, height: 2, borderRadius: 2, background: '#4fabdb' }} />
                    <span className="faq-ln2" style={{ position: 'absolute', left: 7, top: 0, width: 2, height: 16, borderRadius: 2, background: '#4fabdb', transition: '.2s' }} />
                  </span>
                </summary>
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 14.5, color: '#12314d', opacity: 0.85, lineHeight: 1.7, margin: 0 }}>{item.a}</p>
                </div>
              </details>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 'clamp(24px,2.6vw,34px)' }}>
            <a
              href={`${DIPLOMA_SITE}/evenements/`}
              className="cta cta-outline"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 9,
                border: '1.5px solid #12314d',
                color: '#12314d',
                fontFamily: "'Clash Display',sans-serif",
                fontWeight: 600,
                fontSize: 14,
                borderRadius: 999,
                padding: '13px 24px',
              }}
            >
              Toutes nos dates
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </div>
        </section>

        <section
          style={{
            background: '#12314d',
            marginLeft: 'calc(50% - 50vw)',
            marginRight: 'calc(50% - 50vw)',
            paddingLeft: 'max(32px, calc(50vw - 588px))',
            paddingRight: 'max(32px, calc(50vw - 588px))',
            paddingTop: 'clamp(56px,6.5vw,104px)',
            paddingBottom: 'clamp(56px,6.5vw,104px)',
            marginTop: 'clamp(48px,5.5vw,88px)',
            textAlign: 'center',
          }}
        >
          {remainingText && (
            <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#d3ab67', marginBottom: 16 }}>
              {remainingText}
            </div>
          )}
          <h2 style={{ fontFamily: "'PP Pangaia',serif", fontWeight: 700, fontSize: 'clamp(25px,2.9vw,38px)', color: '#fff', margin: '0 auto 16px', maxWidth: '28ch' }}>
            {copy.ctaTitle} <span style={{ color: '#4fabdb' }}>{copy.ctaAccent}</span>
          </h2>
          <p style={{ fontSize: 15.5, color: 'rgba(255,255,255,.78)', margin: '0 auto 30px', maxWidth: '52ch' }}>{copy.ctaLead}</p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <a href="#ev-inscription" onClick={scrollToForm} className="cta cta-gold" style={{ background: '#d3ab67', color: '#12314d', fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: 15, borderRadius: 999, padding: '17px 34px' }}>
              {copy.ctaLabel}
            </a>
            <a href="tel:+33176410173" className="cta" style={{ border: '1.5px solid rgba(255,255,255,.4)', color: '#fff', fontFamily: "'Clash Display',sans-serif", fontWeight: 500, fontSize: 15, borderRadius: 999, padding: '17px 34px' }}>
              Poser une question
            </a>
          </div>
        </section>
      </div>

      <div
        id="evBar"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 60,
          transform: barOn ? 'translateY(0)' : 'translateY(110%)',
          opacity: barOn ? 1 : 0,
          pointerEvents: barOn ? 'auto' : 'none',
          transition: 'transform .28s ease, opacity .28s ease',
          background: '#12314d',
          borderTop: '1px solid rgba(255,255,255,.14)',
          boxShadow: '0 -12px 40px rgba(0,0,0,.28)',
        }}
      >
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '13px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 15, minWidth: 0 }}>
            <span style={{ background: '#d3ab67', borderRadius: 14, padding: '8px 12px', textAlign: 'center', flex: 'none' }}>
              <span style={{ display: 'block', fontFamily: "'PP Pangaia',serif", fontWeight: 700, fontSize: 19, color: '#12314d', lineHeight: 1 }}>{fmt.jour}</span>
              <span style={{ display: 'block', fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: 9, letterSpacing: '0.1em', color: '#12314d', marginTop: 1 }}>{fmt.mois}</span>
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="ev-bar-t" style={{ display: 'block', fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: 15, color: '#fff', lineHeight: 1.25 }}>
                {event.name}
              </span>
              <span className="ev-bar-s" style={{ display: 'block', fontSize: 12.5, color: 'rgba(255,255,255,.72)', marginTop: 3 }}>
                Gratuit · {fmt.horaires}
                {remainingText ? ` · ${remainingText.toLowerCase()}` : ''}
              </span>
            </span>
          </div>
          <a href="#ev-inscription" onClick={scrollToForm} className="cta cta-gold" style={{ background: '#d3ab67', color: '#12314d', fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: 15, borderRadius: 999, padding: '15px 32px', flex: 'none' }}>
            {copy.ctaLabel}
          </a>
        </div>
      </div>

      <div dangerouslySetInnerHTML={{ __html: DIPLOMA_FOOTER_HTML }} />
    </div>
  )
}

function InfoCard({ icon, label, text }: { icon: 'pin' | 'metro' | 'clock' | 'doc'; text: string; label: string }) {
  return (
    <div style={{ background: '#f4f7fa', borderRadius: 26, padding: 'clamp(22px,2.4vw,28px)' }}>
      {icon === 'pin' && (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4fabdb" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 14 }}>
          <circle cx="12" cy="10" r="3" />
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
        </svg>
      )}
      {icon === 'metro' && (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4fabdb" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 14 }}>
          <path d="M4 17V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12M4 17h16M8 21h8" />
        </svg>
      )}
      {icon === 'clock' && (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4fabdb" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 14 }}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4l3 2" />
        </svg>
      )}
      {icon === 'doc' && (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4fabdb" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 14 }}>
          <path d="M14 2v6h6M9 15h6" />
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        </svg>
      )}
      <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#12314d', opacity: 0.55, marginBottom: 8 }}>
        {label}
      </div>
      <p style={{ fontSize: 14.5, color: '#12314d', lineHeight: 1.6, margin: 0 }}>
        <Nl text={text} />
      </p>
    </div>
  )
}
