import { crmV2 } from '@/lib/crm-v2-theme'

/**
 * Sous-arbre Campagnes / Marketing : fond clair V2 + texte sombre.
 * Le body global est en thème sombre ; sans ce layout les champs sont illisibles.
 */
export default function CampaignsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="marketing-light"
      style={{
        minHeight: '100vh',
        background: crmV2.bgSoft,
        color: crmV2.text,
      }}
    >
      {children}
    </div>
  )
}
