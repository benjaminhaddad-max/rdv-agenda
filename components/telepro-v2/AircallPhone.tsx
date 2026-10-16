'use client'

/**
 * Téléphone Aircall intégré à l'espace télépro (SDK Aircall Everywhere), en bas
 * à gauche. Le power dialer compose dedans ; le télépro raccroche avec le bouton
 * rouge du téléphone, sans quitter le CRM. Replié, l'iframe reste chargée
 * (l'appel en cours continue).
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, PhoneCall, X } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  attachAircallWorkspace, isSafariBrowser, setAircallEmbedEnabled, setAircallEmbedExpanded, setAircallLoggedIn, useAircallEmbed,
} from '@/lib/aircall-embed'

export const AIRCALL_PHONE_WIDTH = 376
const PHONE_HEIGHT = 600
const CONTAINER_ID = 'aircall-workspace'

export default function AircallPhone() {
  const { loggedIn, inCall, expanded } = useAircallEmbed()
  const box = useRef<HTMLDivElement>(null)
  const [safari, setSafari] = useState(false)
  useEffect(() => { setSafari(isSafariBrowser()) }, [])

  useEffect(() => {
    const el = box.current
    if (!el) return
    let cancelled = false
    let poll: ReturnType<typeof setInterval> | null = null
    void import('aircall-everywhere').then(({ default: AircallWorkspace }) => {
      if (cancelled) return
      const ws = new AircallWorkspace({
        domToLoadWorkspace: `#${CONTAINER_ID}`,
        size: 'auto',
        debug: false,
        onLogin: () => setAircallLoggedIn(true),
        onLogout: () => setAircallLoggedIn(false),
      })
      attachAircallWorkspace(ws)
      // onLogin peut arriver avant la connexion du SDK : on redemande l'état
      poll = setInterval(() => ws.isLoggedIn(v => setAircallLoggedIn(v)), 5000)
    })
    return () => {
      cancelled = true
      if (poll) clearInterval(poll)
      attachAircallWorkspace(null)
      el.innerHTML = ''
    }
  }, [])

  const status = !loggedIn ? 'Connecte-toi pour appeler' : inCall ? 'En appel' : 'Prêt'
  const dot = !loggedIn ? crmV2.textFaint : inCall ? crmV2.successStrong : crmV2.gold

  return (
    <div style={{
      position: 'fixed', left: 12, bottom: 12, width: AIRCALL_PHONE_WIDTH, zIndex: 150,
      background: crmV2.bg, border: `1px solid ${crmV2.goldBorder}`, borderRadius: 16, boxShadow: crmV2.shadowPanel,
      overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: crmV2.font,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 8px 14px', borderBottom: expanded ? `1px solid ${crmV2.border}` : 'none' }}>
        <PhoneCall size={14} color={crmV2.gold} />
        <span style={{ fontSize: 13, fontWeight: 700, color: crmV2.text }}>Téléphone Aircall</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: crmV2.textMuted }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: dot }} /> {status}
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 2 }}>
          <IconBtn title={expanded ? 'Replier (l\'appel continue)' : 'Déplier'} onClick={() => setAircallEmbedExpanded(!expanded)}>
            {expanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </IconBtn>
          {!inCall && (
            <IconBtn title="Revenir à l'appli Aircall de l'ordinateur" onClick={() => setAircallEmbedEnabled(false)}>
              <X size={15} />
            </IconBtn>
          )}
        </span>
      </div>
      {safari && expanded && !loggedIn && (
        <div style={{ padding: '10px 14px', fontSize: 12, lineHeight: 1.45, color: '#b45309', background: 'rgba(245,158,11,0.08)', borderBottom: `1px solid ${crmV2.border}` }}>
          Aircall ne marche que dans <strong>Google Chrome</strong> : Safari bloque la connexion ici. Ouvre le CRM dans Chrome pour appeler et raccrocher depuis cette page.
        </div>
      )}
      {/* Replié : hauteur 0 mais iframe gardée, pour ne pas couper l'appel */}
      <div style={{ height: expanded ? PHONE_HEIGHT : 0, overflow: 'hidden', transition: 'height .15s' }}>
        <div id={CONTAINER_ID} ref={box} style={{ width: '100%', height: PHONE_HEIGHT }} />
      </div>
    </div>
  )
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} style={{
      width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', color: crmV2.textMuted,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    }}>
      {children}
    </button>
  )
}
