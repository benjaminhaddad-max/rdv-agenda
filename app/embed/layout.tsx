export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html, body { margin: 0; padding: 0; background: transparent; }
        body { font-family: Inter, system-ui, -apple-system, sans-serif; overflow-x: hidden; }
        * { box-sizing: border-box; }
      `}</style>
      {children}
    </>
  )
}
