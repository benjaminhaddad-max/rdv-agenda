'use client'

/**
 * Téléphone Aircall intégré à l'espace télépro (SDK Aircall Everywhere), en
 * colonne à gauche sous l'en-tête. Les appels du power dialer y sonnent ; le
 * télépro raccroche avec son bouton rouge, sans quitter le CRM. Replié en rail,
 * l'iframe reste chargée (l'appel en cours continue).
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, PhoneCall, X } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  attachAircallWorkspace, isSafariBrowser, setAircallEmbedEnabled, setAircallEmbedExpanded, setAircallLoggedIn, useAircallEmbed,
} from '@/lib/aircall-embed'

export const AIRCALL_PHONE_WIDTH = 376
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

  // Un seul arbre : replier ne doit jamais démonter l'iframe (l'appel en cours continue)
  return (
    <aside style={{
      width: expanded ? AIRCALL_PHONE_WIDTH : 44, flexShrink: 0, borderRight: `1px solid ${crmV2.border}`, background: crmV2.bg,
      display: 'flex', flexDirection: 'column', minHeight: 0, fontFamily: crmV2.font,
    }}>
      {expanded ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 8px 14px', borderBottom: `1px solid ${crmV2.border}`, flexShrink: 0 }}>
          <PhoneCall size={14} color={crmV2.gold} />
          <span style={{ fontSize: 13, fontWeight: 700, color: crmV2.text }}>Téléphone Aircall</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: crmV2.textMuted }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: dot }} /> {status}
          </span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 2 }}>
            <IconBtn title="Replier (l'appel continue)" onClick={() => setAircallEmbedExpanded(false)}>
              <ChevronLeft size={15} />
            </IconBtn>
            {!inCall && (
              <IconBtn title="Revenir à l'appli Aircall de l'ordinateur" onClick={() => setAircallEmbedEnabled(false)}>
                <X size={15} />
              </IconBtn>
            )}
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 10, flexShrink: 0 }}>
          <IconBtn title="Afficher le téléphone Aircall" onClick={() => setAircallEmbedExpanded(true)}>
            <PhoneCall size={16} color={crmV2.gold} />
          </IconBtn>
          <span title={status} style={{ width: 8, height: 8, borderRadius: 999, background: dot }} />
        </div>
      )}
      {safari && expanded && !loggedIn && (
        <div style={{ padding: '10px 14px', fontSize: 12, lineHeight: 1.45, color: '#b45309', background: 'rgba(245,158,11,0.08)', borderBottom: `1px solid ${crmV2.border}`, flexShrink: 0 }}>
          Aircall ne marche que dans <strong>Google Chrome</strong> : Safari bloque la connexion ici. Ouvre le CRM dans Chrome pour appeler et raccrocher depuis cette page.
        </div>
      )}
      <div style={expanded ? { flex: 1, minHeight: 0 } : { width: 0, height: 0, overflow: 'hidden' }}>
        <div id={CONTAINER_ID} ref={box} style={expanded ? { width: '100%', height: '100%' } : { width: AIRCALL_PHONE_WIDTH, height: 600 }} />
      </div>
    </aside>
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
