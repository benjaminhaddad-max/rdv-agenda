'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Power, CheckCircle2, Check, Unplug, Settings2 } from 'lucide-react'
import {
  CrmV2Page, CrmV2Header, CrmV2Tabs, CrmV2Button, CrmV2Toggle, CrmV2Spinner, CrmV2Empty,
} from '@/components/crm-v2/primitives'
import { AdminNotice, AdminSpin, hideLegacyBrand } from '@/components/crm-v2/admin/AdminUi'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'

/** Réglages de connexion à l'ancien CRM (onglet dédié) */
const LEGACY_KEYS = ['hubspot_mirror_enabled', 'hubspot_read_enabled']
const isLegacyKey = (key: string) => LEGACY_KEYS.includes(key) || key.startsWith('hubspot_')

type SettingsTab = 'legacy' | 'other'

type Setting = {
  key: string
  value: unknown
  description: string | null
  updated_at: string | null
}

export default function ParametresPage() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [migrationPending, setMigrationPending] = useState(false)
  const [doneKey, setDoneKey] = useState<string | null>(null)
  // Gabarit E : les interrupteurs modifient un brouillon, appliqué par « Enregistrer »
  const [draft, setDraft] = useState<Record<string, boolean>>({})
  const [tab, setTab] = useState<SettingsTab>('legacy')
  const isMobile = useIsMobile()

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/crm/settings')
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setSettings(j.settings || [])
      setMigrationPending(!!j.migration_pending)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function applySetting(key: string, newValue: boolean) {
    const res = await fetch('/api/crm/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: newValue }),
    })
    const j = await res.json()
    if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
  }

  const confirmLabel = (key: string, newValue: boolean) => {
    const labelOff = key === 'hubspot_mirror_enabled'
      ? 'Couper le miroir vers l\'ancien CRM ? Les éditions de fiche n\'y écriront plus.'
      : key === 'hubspot_read_enabled'
        ? 'Couper la lecture de l\'ancien CRM ? L\'app n\'ira plus y chercher de données.'
        : `Désactiver "${labelFor(key)}" ?`
    const labelOn = `Réactiver "${labelFor(key)}" ?`
    return newValue ? labelOn : labelOff
  }

  // Modifications en attente (clé → nouvelle valeur)
  const pending = useMemo(
    () => settings.filter(s => s.key in draft && draft[s.key] !== (s.value === true)),
    [settings, draft],
  )

  async function saveDraft() {
    if (pending.length === 0) return
    // Même confirmation qu'avant, regroupée pour toutes les modifications
    const msg = pending.map(s => confirmLabel(s.key, draft[s.key])).join('\n\n')
    if (!confirm(msg)) return

    setSaving(pending.length === 1 ? pending[0].key : 'draft'); setError(null); setDoneKey(null)
    try {
      for (const s of pending) await applySetting(s.key, draft[s.key])
      setDoneKey(pending.length === 1 ? pending[0].key : 'draft')
      setDraft({})
      // Recharge pour récupérer updated_at
      await load()
      setTimeout(() => setDoneKey(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(null)
    }
  }

  async function disconnectHubspot() {
    if (!confirm('Couper totalement l\'ancien CRM ? (miroir + lectures OFF)')) return
    setSaving('hubspot_disconnect')
    setError(null)
    setDoneKey(null)
    try {
      const payloads = [
        { key: 'hubspot_mirror_enabled', value: false },
        { key: 'hubspot_read_enabled', value: false },
      ]
      for (const payload of payloads) {
        const res = await fetch('/api/crm/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      }
      setDoneKey('hubspot_disconnect')
      setDraft({})
      await load()
      setTimeout(() => setDoneKey(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(null)
    }
  }

  function labelFor(key: string) {
    switch (key) {
      case 'hubspot_mirror_enabled': return 'Miroir vers l\'ancien CRM (écritures)'
      case 'hubspot_read_enabled':   return 'Lectures depuis l\'ancien CRM'
      default: return hideLegacyBrand(key)
    }
  }

  const legacySettings = settings.filter(s => isLegacyKey(s.key))
  const otherSettings = settings.filter(s => !isLegacyKey(s.key))
  const shown = tab === 'legacy' ? legacySettings : otherSettings

  const card: React.CSSProperties = {
    background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
    boxShadow: crmV2.shadow, padding: isMobile ? 14 : 20, boxSizing: 'border-box', width: '100%',
  }

  return (
    <CrmV2Page style={{ display: 'flex', flexDirection: 'column' }}>
      <CrmV2Header
        title="Paramètres"
        subtitle="Configuration du CRM — réglages dynamiques modifiables sans redéploiement"
      >
        <CrmV2Tabs
          bordered={false}
          value={tab}
          onChange={id => setTab(id as SettingsTab)}
          items={[
            { id: 'legacy', label: 'Ancien CRM', count: loading ? undefined : legacySettings.length },
            { id: 'other', label: 'Autres réglages', count: loading ? undefined : otherSettings.length },
          ]}
        />
      </CrmV2Header>

      <div style={{ padding: isMobile ? 12 : '20px 28px 24px' }}>
        <div style={{ maxWidth: 880, display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16 }}>
          {migrationPending && (
            <AdminNotice tone="warning">
              <strong>Migration v15 pas encore appliquée.</strong>
              <div style={{ marginTop: 4, fontSize: 12 }}>
                Va dans Supabase SQL Editor et applique <code>supabase-migration-crm-v15-settings.sql</code>.
              </div>
            </AdminNotice>
          )}

          {error && <AdminNotice tone="error">{error}</AdminNotice>}
          {doneKey === 'draft' && <AdminNotice tone="success">Modifications enregistrées</AdminNotice>}

          {loading ? (
            <div style={card}><CrmV2Spinner /></div>
          ) : (
            <>
              {/* Section : interrupteurs */}
              <div style={card}>
                <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>
                  {tab === 'legacy' ? 'Connexion à l’ancien CRM' : 'Réglages du CRM'}
                </div>
                <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2 }}>
                  {tab === 'legacy'
                    ? 'Synchronisation des fiches avec l’ancien outil, le temps de la transition.'
                    : 'Autres interrupteurs stockés dans la base du CRM.'}
                </div>

                {shown.length === 0 ? (
                  <CrmV2Empty icon={<Settings2 size={26} />} title="Aucun réglage" description="Aucun réglage dans cette catégorie." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
                    {shown.map((s, i) => {
                      const saved = s.value === true
                      const isOn = s.key in draft ? draft[s.key] : saved
                      const changed = isOn !== saved
                      const isSaving = saving === s.key || saving === 'draft'
                      const justDone = doneKey === s.key
                      return (
                        <div
                          key={s.key}
                          title={s.key}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                            padding: '14px 0', borderBottom: i === shown.length - 1 ? 'none' : `1px solid ${crmV2.border}`,
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: crmV2.text, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {labelFor(s.key)}
                              {justDone && <CheckCircle2 size={15} color="#16a34a" />}
                              {changed && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: crmV2.goldDark, background: crmV2.goldSoft, borderRadius: 999, padding: '1px 8px' }}>
                                  Non enregistré
                                </span>
                              )}
                            </div>
                            {s.description && (
                              <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2, lineHeight: 1.5 }}>
                                {hideLegacyBrand(s.description)}
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: crmV2.textFaint, marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                              <span style={{ color: saved ? '#16a34a' : '#d13a41', fontWeight: 700 }}>
                                {saved ? 'Activé' : 'Désactivé'}
                              </span>
                              {s.updated_at && <span>Modifié le {new Date(s.updated_at).toLocaleString('fr-FR')}</span>}
                            </div>
                          </div>
                          {isSaving ? <AdminSpin size={16} color={crmV2.gold} /> : null}
                          <CrmV2Toggle
                            checked={isOn}
                            disabled={saving !== null}
                            onChange={v => setDraft(d => ({ ...d, [s.key]: v }))}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Section : coupure complète de l'ancien CRM */}
              {tab === 'legacy' && (
                <div style={card}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>Couper l’ancien CRM</div>
                  <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2 }}>
                    Désactive d’un coup le miroir et les lectures.
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                    <CrmV2Button
                      variant="danger"
                      icon={saving === 'hubspot_disconnect' ? <AdminSpin /> : <Unplug size={14} />}
                      onClick={disconnectHubspot}
                      disabled={saving !== null}
                      style={isMobile ? { width: '100%', minHeight: 44 } : undefined}
                    >
                      {saving === 'hubspot_disconnect' ? 'Déconnexion…' : 'Déconnecter l\'ancien CRM'}
                    </CrmV2Button>
                    {doneKey === 'hubspot_disconnect' && (
                      <span style={{ color: '#16a34a', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle2 size={14} /> Ancien CRM déconnecté
                      </span>
                    )}
                  </div>

                  {settings.some(s => s.key === 'hubspot_mirror_enabled') && (
                    <div style={{ marginTop: 16, padding: 14, background: crmV2.bgSoft, borderRadius: 12, fontSize: 13, color: crmV2.text }}>
                      <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Power size={14} color={crmV2.gold} /> Comment couper l&apos;ancien CRM proprement
                      </div>
                      <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, color: crmV2.textMuted }}>
                        <li>Désactive d&apos;abord le <strong>Miroir</strong> (les éditions ne touchent plus l&apos;ancien CRM, mais la synchronisation entrante continue)</li>
                        <li>Vérifie quelques jours que tout fonctionne en pleine autonomie</li>
                        <li>Désactive ensuite les <strong>Lectures</strong></li>
                        <li>Désactive les crons de synchronisation dans <code>vercel.json</code> (et redéploie)</li>
                      </ol>
                    </div>
                  )}
                </div>
              )}

              {/* Pied : Annuler / Enregistrer */}
              <div style={{
                display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                ...(isMobile ? { position: 'sticky' as const, bottom: 0, background: crmV2.bgSoft, padding: '8px 0' } : {}),
              }}>
                {pending.length > 0 && (
                  <span style={{ fontSize: 12, color: crmV2.textMuted, marginRight: 'auto' }}>
                    {pending.length} modification{pending.length > 1 ? 's' : ''} en attente
                  </span>
                )}
                <CrmV2Button
                  variant="secondary"
                  onClick={() => setDraft({})}
                  disabled={pending.length === 0 || saving !== null}
                  style={isMobile ? { flex: 1, minHeight: 44 } : undefined}
                >
                  Annuler
                </CrmV2Button>
                <CrmV2Button
                  variant="primary"
                  icon={saving === 'draft' || (saving && pending.some(p => p.key === saving)) ? <AdminSpin /> : <Check size={14} />}
                  onClick={saveDraft}
                  disabled={pending.length === 0 || saving !== null}
                  style={isMobile ? { flex: 1, minHeight: 44 } : undefined}
                >
                  Enregistrer
                </CrmV2Button>
              </div>
            </>
          )}
        </div>
      </div>
    </CrmV2Page>
  )
}
