/**
 * Sous-arbre Campagnes V2 : fond clair (même contrainte que la version A).
 */
export default function CampaignsV2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="marketing-light crm-v2"
      style={{
        minHeight: '100%',
        background: '#f5f8fa',
        color: '#2d3e50',
      }}
    >
      {children}
    </div>
  )
}
