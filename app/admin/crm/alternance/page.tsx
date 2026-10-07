'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Building2, GraduationCap, FileSignature, AlertCircle, Clock, CheckCircle, ChevronRight, PenLine } from 'lucide-react'
import AlternanceShellV2, { useAlternanceBase } from '@/components/crm-v2/deal/AlternanceShellV2'
import { CONTRACT_STATUS_META, STUDENT_STATUS_META } from '@/lib/alternance/constants'
import type { AlternanceDashboard } from '@/lib/alternance/types'
import { useIsMobile } from '@/lib/useIsMobile'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  CrmV2KpiCard, CrmV2KpiGrid, CrmV2Spinner, CrmV2StatusPill, CrmV2Avatar,
} from '@/components/crm-v2/primitives'

/** Carte liste « Derniers … » : en-tête, lignes de 40 px, lien « Voir tout ». */
function RecentCard({ title, href, linkLabel, empty, children }: {
  title: string
  href: string
  linkLabel: string
  empty: string | null
  children: ReactNode
}) {
  return (
    <div style={{
      background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
      boxShadow: crmV2.shadow, overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '12px 14px', borderBottom: `2px solid ${crmV2.thBorder}`, background: crmV2.thBg,
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: crmV2.textMuted,
      }}>
        {title}
      </div>
      <div style={{ flex: 1 }}>
        {empty ? (
          <p style={{ margin: 0, padding: '24px 14px', color: crmV2.textFaint, fontSize: 13, textAlign: 'center' }}>{empty}</p>
        ) : children}
      </div>
      <Link href={href} style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '10px 14px', borderTop: `1px solid ${crmV2.border}`,
        fontSize: 13, fontWeight: 600, color: crmV2.link, textDecoration: 'none',
      }}>
        {linkLabel} <ChevronRight size={14} />
      </Link>
    </div>
  )
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 40,
  padding: '4px 14px', borderBottom: `1px solid ${crmV2.border}`, textDecoration: 'none', color: crmV2.text,
}

export default function AlternanceDashboardPage() {
  const [data, setData] = useState<AlternanceDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const isMobile = useIsMobile()
  const base = useAlternanceBase()

  useEffect(() => {
    fetch('/api/alternance/dashboard')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <AlternanceShellV2 title="Tableau de bord" subtitle="Chargement…"><CrmV2Spinner /></AlternanceShellV2>

  return (
    <AlternanceShellV2
      title="Tableau de bord"
      subtitle="Suivi des dossiers alternance — Diploma Santé"
    >
      <CrmV2KpiGrid>
        <CrmV2KpiCard label="Dossiers incomplets" value={data?.dossiers_incomplets ?? 0} color="#b45309" icon={<AlertCircle size={15} />} />
        <CrmV2KpiCard label="Sans formulaire" value={data?.etudiants_sans_formulaire ?? 0} color={crmV2.textMuted} icon={<GraduationCap size={15} />} />
        <CrmV2KpiCard label="Relances à faire" value={data?.relances_a_faire ?? 0} color={crmV2.link} icon={<Clock size={15} />} />
        <CrmV2KpiCard label="Contrats en attente" value={data?.contrats_en_attente ?? 0} color="#6366f1" icon={<FileSignature size={15} />} />
        <CrmV2KpiCard label="À signer" value={data?.contrats_a_signer ?? 0} color={crmV2.goldDark} icon={<PenLine size={15} />} />
        <CrmV2KpiCard label="En cours" value={data?.contrats_en_cours ?? 0} color={crmV2.successStrong} icon={<CheckCircle size={15} />} />
        <CrmV2KpiCard label="Terminés" value={data?.contrats_termines ?? 0} color={crmV2.textMuted} icon={<Building2 size={15} />} />
      </CrmV2KpiGrid>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: isMobile ? 12 : 16 }}>
        <RecentCard
          title="Derniers étudiants"
          href={`${base}/etudiants`}
          linkLabel="Voir tous les étudiants"
          empty={(data?.recent_students ?? []).length === 0 ? 'Aucun étudiant pour le moment.' : null}
        >
          {data?.recent_students.map(s => {
            const meta = STUDENT_STATUS_META[s.dossier_status]
            const name = `${s.prenom} ${s.nom}`
            return (
              <div key={s.id} style={rowStyle}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, fontSize: 13, fontWeight: 600 }}>
                  <CrmV2Avatar name={name} size={24} radius="36%" />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                </span>
                <CrmV2StatusPill label={meta.label} color={meta.color} />
              </div>
            )
          })}
        </RecentCard>

        <RecentCard
          title="Derniers contrats"
          href={`${base}/contrats`}
          linkLabel="Voir tous les contrats"
          empty={(data?.recent_contracts ?? []).length === 0 ? 'Aucun contrat pour le moment.' : null}
        >
          {data?.recent_contracts.map(c => {
            const meta = CONTRACT_STATUS_META[c.status]
            const company = (c as { company?: { raison_sociale?: string } }).company?.raison_sociale
            const student = (c as { student?: { prenom?: string; nom?: string } }).student
            return (
              <Link key={c.id} href={`${base}/contrats/${c.id}`} style={rowStyle}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: crmV2.link, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {student?.prenom} {student?.nom}
                  </span>
                  {company && <span style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company}</span>}
                </span>
                <CrmV2StatusPill label={meta.label} color={meta.color} />
              </Link>
            )
          })}
        </RecentCard>
      </div>
    </AlternanceShellV2>
  )
}
