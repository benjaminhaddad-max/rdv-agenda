'use client'

/**
 * Paramètres › Edumove : liens d'accès des facs partenaires à leurs candidats
 * (page publique /fac/<code>, sans compte). Régénérer un lien coupe l'ancien.
 */

import { useEffect, useState } from 'react'
import { Copy, Link2, RefreshCw, Unlink } from 'lucide-react'
import { CrmV2Button, CrmV2Card } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'

type FacLink = { uni: string; label: string; url: string | null; created_at: string | null }

export default function EdumovePanel() {
  const [links, setLinks] = useState<FacLink[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/crm/edumove/fac-links')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Accès réservé aux admins'))))
      .then(d => setLinks(d.links))
      .catch(e => setError(e.message))
  }, [])

  const update = async (uni: string, enabled: boolean) => {
    const verb = enabled ? 'Générer un nouveau lien ? L’ancien lien de cette fac ne marchera plus.' : 'Couper l’accès de cette fac ?'
    if (!window.confirm(verb)) return
    setBusy(uni)
    const r = await fetch('/api/crm/edumove/fac-links', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uni, enabled }),
    })
    const d = await r.json().catch(() => null)
    if (r.ok) setLinks(d.links)
    else setError(d?.error || 'Erreur')
    setBusy(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 820 }}>
      <div style={{ fontSize: 13, color: crmV2.textMuted, lineHeight: 1.5 }}>
        Chaque fac partenaire reçoit un lien à elle : elle y voit les candidats qui l’ont choisie, leurs pièces pour cette fac,
        met à jour son suivi et vous écrit (les messages arrivent sur la fiche contact et à admissions@edumove.fr).
        Le lien vaut accès : ne l’envoyez qu’au contact de la fac.
      </div>
      {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
      {links?.map(l => (
        <CrmV2Card key={l.uni} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link2 size={15} color={crmV2.gold} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>{l.label}</span>
            <span style={{ flex: 1 }} />
            {l.created_at && <span style={{ fontSize: 11, color: crmV2.textFaint }}>créé le {new Date(l.created_at).toLocaleDateString('fr-FR')}</span>}
          </div>
          {l.url ? (
            <code style={{ fontSize: 12, background: crmV2.bgSoft, borderRadius: 8, padding: '8px 10px', wordBreak: 'break-all' }}>{l.url}</code>
          ) : (
            <div style={{ fontSize: 12, color: crmV2.textFaint }}>Pas de lien actif.</div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {l.url && (
              <CrmV2Button size="sm" icon={<Copy size={14} />} onClick={async () => {
                await navigator.clipboard.writeText(l.url!)
                setCopied(l.uni); setTimeout(() => setCopied(null), 1500)
              }}>{copied === l.uni ? 'Copié' : 'Copier'}</CrmV2Button>
            )}
            <CrmV2Button size="sm" variant={l.url ? 'secondary' : 'primary'} icon={<RefreshCw size={14} />} disabled={busy === l.uni}
              onClick={() => void update(l.uni, true)}>{l.url ? 'Régénérer' : 'Créer le lien'}</CrmV2Button>
            {l.url && (
              <CrmV2Button size="sm" variant="danger" icon={<Unlink size={14} />} disabled={busy === l.uni}
                onClick={() => void update(l.uni, false)}>Couper l’accès</CrmV2Button>
            )}
          </div>
        </CrmV2Card>
      ))}
    </div>
  )
}
