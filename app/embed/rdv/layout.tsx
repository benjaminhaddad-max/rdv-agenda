export default function EmbedRdvLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Override du layout /embed parent : le parcours RDV dépasse souvent 720px */}
      <style>{`
        html, body {
          overflow-x: hidden !important;
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch;
        }
      `}</style>
      {children}
    </>
  )
}
