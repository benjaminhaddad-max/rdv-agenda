'use client'

import { useEffect, useState, useCallback } from 'react'
import { Power, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'

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

  async function toggle(key: string, currentValue: unknown) {
    const newValue = currentValue === true ? false : true
    const labelOff = key === 'hubspot_mirror_enabled'
      ? 'Couper le mirroir HubSpot ? Les éditions de fiche n\'écriront plus dans HubSpot.'
      : key === 'hubspot_read_enabled'
        ? 'Couper la lecture HubSpot ? L\'app n\'ira plus chercher de données dans HubSpot.'
        : `Désactiver "${key}" ?`
    const labelOn = `Réactiver "${key}" ?`

    if (!confirm(newValue ? labelOn : labelOff)) return

    setSaving(key); setError(null); setDoneKey(null)
    try {
      const res = await fetch('/api/crm/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: newValue }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setDoneKey(key)
      // Recharge pour récupérer updated_at
      await load()
      setTimeout(() => setDoneKey(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(null)
    }
  }

  const labelFor = (key: string) => {
    switch (key) {
      case 'hubspot_mirror_enabled': return 'Mirroir HubSpot (écritures)'
      case 'hubspot_read_enabled':   return 'Lectures HubSpot'
      default: return key
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fafbfc', color: '#1a2f4b' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 80px' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, marginBottom: 4 }}>
            Paramètres CRM
          </h1>
          <p style={{ fontSize: 13, color: '#516f90', margin: 0 }}>
            Réglages dynamiques modifiables sans redéploiement.
          </p>
        </div>

        {migrationPending && (
          <div style={{
            padding: 16, background: '#fef3c7', border: '1px solid #fcd34d',
            borderRadius: 12, color: '#92400e', fontSize: 13, marginBottom: 16,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Migration v15 pas encore appliquée.</strong>
              <div style={{ marginTop: 6, fontSize: 12 }}>
                Va dans Supabase SQL Editor et applique <code>supabase-migration-crm-v15-settings.sql</code>.
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{
            padding: 12, background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 8, color: '#dc2626', fontSize: 13, marginBottom: 16,
            display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
            <div style={{ marginTop: 8, fontSize: 13 }}>Chargement…</div>
          </div>
        )}

        {!loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {settings.map(s => {
              const isOn = s.value === true
              const isSaving = saving === s.key
              const justDone = doneKey === s.key
              return (
                <div
                  key={s.key}
                  style={{
                    background: '#fff', border: '1px solid ' + (justDone ? '#86efac' : '#cbd6e2'),
                    borderRadius: 12, padding: 16, transition: 'border-color .3s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {labelFor(s.key)}
                        {justDone && <CheckCircle2 size={16} style={{ color: '#22c55e' }} />}
                      </div>
                      {s.description && (
                        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                          {s.description}
                        </div>
                      )}
                    </div>
                    {/* Toggle iOS-style */}
                    <button
                      onClick={() => toggle(s.key, s.value)}
                      disabled={isSaving}
                      style={{
                        position: 'relative',
                        width: 50, height: 28,
                        borderRadius: 999,
                        border: 'none',
                        background: isOn ? 'linear-gradient(135deg, #2ea3f2, #0038f0)' : '#cbd6e2',
                        cursor: isSaving ? 'wait' : 'pointer',
                        flexShrink: 0,
                        transition: 'background .2s',
                        opacity: isSaving ? 0.6 : 1,
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          top: 3, left: isOn ? 25 : 3,
                          width: 22, height: 22, borderRadius: '50%',
                          background: '#fff',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                          transition: 'left .2s',
                        }}
                      />
                    </button>
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 12, fontSize: 11, color: '#94a3b8', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace' }}>{s.key}</span>
                    {s.updated_at && (
                      <span>Modifié le {new Date(s.updated_at).toLocaleString('fr-FR')}</span>
                    )}
                    <span style={{ color: isOn ? '#22c55e' : '#dc2626', fontWeight: 600 }}>
                      {isOn ? 'ACTIVÉ' : 'DÉSACTIVÉ'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Info HubSpot cut */}
        {!loading && settings.some(s => s.key === 'hubspot_mirror_enabled') && (
          <div style={{
            marginTop: 24, padding: 16, background: '#eff6ff',
            border: '1px solid #bfdbfe', borderRadius: 12,
            fontSize: 13, color: '#1e40af',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Power size={14} /> Comment couper HubSpot proprement
            </div>
            <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
              <li>Désactive d'abord le <strong>Mirroir</strong> (les éditions ne touchent plus HubSpot, mais la sync pull continue)</li>
              <li>Vérifie quelques jours que tout fonctionne en pleine autonomie</li>
              <li>Désactive ensuite les <strong>Lectures</strong></li>
              <li>Désactive les crons sync HubSpot dans <code>vercel.json</code> (et redéploie)</li>
            </ol>
          </div>
        )}
      </div>
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
