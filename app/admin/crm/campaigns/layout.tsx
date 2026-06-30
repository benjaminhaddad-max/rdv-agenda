/**
 * Sous-arbre Campagnes / Marketing : fond clair + texte sombre.
 * Le body global est en thème sombre ; sans ce layout les champs sont illisibles.
 */
export default function CampaignsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="marketing-light"
      style={{
        minHeight: '100vh',
        background: '#f7f4ee',
        color: '#0e1e35',
      }}
    >
      {children}
    </div>
  )
}
