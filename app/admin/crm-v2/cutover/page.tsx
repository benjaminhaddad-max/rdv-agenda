'use client'

import { CrmV2Button, CrmV2Card, CrmV2Header, CrmV2Page } from '@/components/crm-v2/primitives'
import { CRM_V2_FLAGS } from '@/lib/crm-v2-flags'
import { crmV2 } from '@/lib/crm-v2-theme'

/**
 * Page cutover Design B — info only, pas de bascule automatique.
 * Accessible via /admin/crm-v2/cutover
 */
export default function CutoverV2Page() {
  return (
    <CrmV2Page>
      <CrmV2Header
        title="Cutover Design B"
        subtitle="Préparation du basculement — aucune redirection prod active"
      />
      <div style={{ padding: '24px 28px', maxWidth: 720, display: 'grid', gap: 16 }}>
        <CrmV2Card style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: crmV2.text, marginBottom: 8 }}>
            État actuel
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: crmV2.textMuted, fontSize: 13, lineHeight: 1.7 }}>
            <li>CRM prod (`/admin/crm`) : défaut — inchangé</li>
            <li>Design B (`/admin/crm-v2`) : parallèle — {CRM_V2_FLAGS.PARALLEL_ENABLED ? 'actif' : 'off'}</li>
            <li>Bascule admin auto : <strong style={{ color: crmV2.danger }}>{String(CRM_V2_FLAGS.CRM_V2_DEFAULT_FOR_ADMIN)}</strong></li>
            <li>Closer / télépro : activer avec <code>?ui=v2</code></li>
          </ul>
        </CrmV2Card>
        <CrmV2Card style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: crmV2.text, marginBottom: 8 }}>
            Pour basculer plus tard
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, color: crmV2.textMuted, fontSize: 13, lineHeight: 1.7 }}>
            <li>Valider usage réel sur Contacts, Tâches, Transactions, Fiches</li>
            <li>Passer <code>CRM_V2_DEFAULT_FOR_ADMIN</code> à true dans <code>lib/crm-v2-flags.ts</code></li>
            <li>Ajouter redirect layout A → V2</li>
            <li>Retirer progressivement les styles cream de A</li>
          </ol>
        </CrmV2Card>
        <div style={{ display: 'flex', gap: 8 }}>
          <CrmV2Button variant="gold" onClick={() => { window.location.href = '/admin/crm-v2' }}>
            Retour Design B
          </CrmV2Button>
          <CrmV2Button variant="secondary" onClick={() => { window.location.href = '/admin/crm' }}>
            CRM classique
          </CrmV2Button>
        </div>
      </div>
    </CrmV2Page>
  )
}
