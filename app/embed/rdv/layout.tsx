export default function EmbedRdvLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Le parcours RDV dépasse souvent 720px — scroll interne dans l'iframe */}
      <style>{`
        html, body {
          height: 100%;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
        }
      `}</style>
      {children}
    </>
  )
}
