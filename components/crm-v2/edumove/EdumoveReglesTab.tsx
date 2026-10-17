'use client'

/** Règles de chaque fac (admission, prix, pièces, étapes) et de l'orientation automatique. */

import { useState, type ReactNode } from 'react'
import { AlertTriangle, Compass } from 'lucide-react'
import { CrmV2Card, CrmV2Segmented } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { EDUMOVE_FAC_RULES, EDUMOVE_ORIENTATION_RULES, type FacRule } from '@/lib/edumove-rules'

type View = FacRule['key'] | 'orientation'

function Bloc({ title, children }: { title: string; children: ReactNode }) {
  return (
    <CrmV2Card style={{ padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: crmV2.textMuted, marginBottom: 10 }}>{title}</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: crmV2.text }}>{children}</div>
    </CrmV2Card>
  )
}

const Liste = ({ items, empty = '—' }: { items: string[]; empty?: string }) =>
  items.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{items.map(i => <li key={i}>{i}</li>)}</ul> : <span style={{ color: crmV2.textFaint }}>{empty}</span>

export default function EdumoveReglesTab() {
  const [view, setView] = useState<View>('LINK')
  const fac = EDUMOVE_FAC_RULES.find(f => f.key === view)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <CrmV2Segmented<View>
          value={view}
          onChange={setView}
          items={[
            ...EDUMOVE_FAC_RULES.map(f => ({ id: f.key as View, label: f.key === 'PASS_LAS' ? 'PASS / LAS' : f.key })),
            { id: 'orientation' as View, label: 'Orientation auto' },
          ]}
        />
        <span style={{ fontSize: 12, color: crmV2.textFaint }}>Relevé de la plateforme candidature.edumove.fr au 17/10/2026.</span>
      </div>

      {view === 'orientation' ? (
        <Bloc title="Pré-orientation calculée au dépôt de la candidature">
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10, color: crmV2.textMuted }}>
            <Compass size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            Elle donne la fac « recommandée » du dossier. L’espace candidat applique ensuite les conditions de chaque fac (onglets LINK, UCJC, UE).
          </div>
          <Liste items={EDUMOVE_ORIENTATION_RULES} />
        </Bloc>
      ) : fac ? (
        <>
          <CrmV2Card style={{ padding: 18 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{fac.name}</div>
            <div style={{ fontSize: 13.5, color: crmV2.textMuted, marginTop: 4 }}>{fac.city} · {fac.language}</div>
            {fac.contacts.length > 0 && <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 6 }}>Contact fac : {fac.contacts.join(', ')}</div>}
          </CrmV2Card>

          {fac.warnings.map(w => (
            <div key={w} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', borderRadius: 12, background: '#fff7ed', border: '1px solid #fed7aa', fontSize: 13, lineHeight: 1.5, color: '#9a3412' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} /> <span><strong>À trancher :</strong> {w}</span>
            </div>
          ))}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
            <Bloc title="Admission">{fac.admission}</Bloc>
            <Bloc title="Conditions d’accès"><Liste items={fac.eligibility} /></Bloc>
            <Bloc title="Filières et prix (par an)">
              {fac.prices.length ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {fac.prices.map(p => (
                      <tr key={p.filiere} style={{ borderTop: `1px solid ${crmV2.borderLight}` }}>
                        <td style={{ padding: '6px 8px 6px 0', fontWeight: 600, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{p.filiere}</td>
                        <td style={{ padding: '6px 0' }}>{p.price}{p.note ? <span style={{ color: p.note === 'COMPLET' ? '#b91c1c' : crmV2.textMuted, fontWeight: p.note === 'COMPLET' ? 700 : 400 }}> · {p.note}</span> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <span style={{ color: crmV2.textFaint }}>—</span>}
            </Bloc>
            <Bloc title="Pièces">
              <div style={{ fontWeight: 600 }}>Obligatoires</div>
              <Liste items={fac.documents.required} />
              <div style={{ fontWeight: 600, marginTop: 8 }}>Facultatives</div>
              <Liste items={fac.documents.optional} />
              <div style={{ fontWeight: 600, marginTop: 8 }}>Après l’admission</div>
              <Liste items={fac.documents.afterAcceptance} />
            </Bloc>
            <Bloc title="Dates"><Liste items={fac.dates} /></Bloc>
          </div>

          {fac.steps.length > 0 && (
            <Bloc title="Étapes du suivi (menu « suivi » de la fac dans chaque dossier)">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {fac.steps.map((s, i) => (
                  <div key={s.value} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', borderTop: i ? `1px solid ${crmV2.borderLight}` : 'none' }}>
                    <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 99, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, background: crmV2.goldSoft, color: crmV2.goldDark }}>{i + 1}</span>
                    <div><strong>{s.label}</strong> — <span style={{ color: crmV2.textMuted }}>{s.detail}</span></div>
                  </div>
                ))}
                <div style={{ fontSize: 12.5, color: crmV2.textMuted, paddingTop: 8, borderTop: `1px solid ${crmV2.borderLight}` }}>
                  Sorties possibles à tout moment : « Refusé » ou « Autre agence ».
                </div>
              </div>
            </Bloc>
          )}
        </>
      ) : null}
    </div>
  )
}
