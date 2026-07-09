'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, GraduationCap, FileSignature, AlertCircle, Clock, CheckCircle } from 'lucide-react'
import AlternanceShell, { AlternanceCard, StatusPill } from '@/components/alternance/AlternanceShell'
import { CONTRACT_STATUS_META, STUDENT_STATUS_META } from '@/lib/alternance/constants'
import type { AlternanceDashboard } from '@/lib/alternance/types'

function StatBox({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: typeof Building2 }) {
  return (
    <AlternanceCard>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: '#4a6070', marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
        </div>
        <Icon size={20} style={{ color, opacity: 0.7 }} />
      </div>
    </AlternanceCard>
  )
}

export default function AlternanceDashboardPage() {
  const [data, setData] = useState<AlternanceDashboard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/alternance/dashboard')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <AlternanceShell title="Tableau de bord" subtitle="Chargement…"><div /></AlternanceShell>

  return (
    <AlternanceShell
      title="Tableau de bord"
      subtitle="Suivi des dossiers alternance — Diploma Santé"
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        <StatBox label="Dossiers incomplets" value={data?.dossiers_incomplets ?? 0} color="#f59e0b" icon={AlertCircle} />
        <StatBox label="Sans formulaire" value={data?.etudiants_sans_formulaire ?? 0} color="#4a6070" icon={GraduationCap} />
        <StatBox label="Relances à faire" value={data?.relances_a_faire ?? 0} color="#0ea5e9" icon={Clock} />
        <StatBox label="Contrats en attente" value={data?.contrats_en_attente ?? 0} color="#6366f1" icon={FileSignature} />
        <StatBox label="À signer" value={data?.contrats_a_signer ?? 0} color="#f59e0b" icon={FileSignature} />
        <StatBox label="En cours" value={data?.contrats_en_cours ?? 0} color="#22c55e" icon={CheckCircle} />
        <StatBox label="Terminés" value={data?.contrats_termines ?? 0} color="#4a6070" icon={Building2} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <AlternanceCard>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Derniers étudiants</h3>
          {(data?.recent_students ?? []).length === 0 ? (
            <p style={{ color: '#4a6070', fontSize: 13 }}>Aucun étudiant pour le moment.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data?.recent_students.map(s => {
                const meta = STUDENT_STATUS_META[s.dossier_status]
                return (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0ebe0' }}>
                    <span style={{ fontSize: 13 }}>{s.prenom} {s.nom}</span>
                    <StatusPill label={meta.label} color={meta.color} bg={meta.bg} />
                  </div>
                )
              })}
            </div>
          )}
          <Link href="/admin/crm/alternance/etudiants" style={{ display: 'block', marginTop: 12, fontSize: 12, color: '#C9A84C' }}>
            Voir tous les étudiants →
          </Link>
        </AlternanceCard>

        <AlternanceCard>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Derniers contrats</h3>
          {(data?.recent_contracts ?? []).length === 0 ? (
            <p style={{ color: '#4a6070', fontSize: 13 }}>Aucun contrat pour le moment.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data?.recent_contracts.map(c => {
                const meta = CONTRACT_STATUS_META[c.status]
                const company = (c as { company?: { raison_sociale?: string } }).company?.raison_sociale
                const student = (c as { student?: { prenom?: string; nom?: string } }).student
                return (
                  <Link key={c.id} href={`/admin/crm/alternance/contrats/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0ebe0' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{student?.prenom} {student?.nom}</div>
                        <div style={{ fontSize: 11, color: '#4a6070' }}>{company}</div>
                      </div>
                      <StatusPill label={meta.label} color={meta.color} bg={meta.bg} />
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
          <Link href="/admin/crm/alternance/contrats" style={{ display: 'block', marginTop: 12, fontSize: 12, color: '#C9A84C' }}>
            Voir tous les contrats →
          </Link>
        </AlternanceCard>
      </div>
    </AlternanceShell>
  )
}
